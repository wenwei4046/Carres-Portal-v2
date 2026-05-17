import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://t.x",
  SUPABASE_ANON_KEY: "a",
  SUPABASE_SERVICE_ROLE_KEY: "s",
  SUPABASE_JWT_SECRET: "",
};
const KID = "k1";
let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(
  role: string,
  partnerId?: string,
  supplierId?: string,
) {
  const app_metadata: Record<string, unknown> = { role };
  if (partnerId) app_metadata.partner_id = partnerId;
  if (supplierId) app_metadata.supplier_id = supplierId;
  return new SignJWT({ email: `${role}@x`, app_metadata })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000001")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

beforeAll(async () => {
  const kp = await generateKeyPair("ES256", { extractable: true });
  signKey = kp.privateKey;
  publicJwk = await exportJWK(kp.publicKey);
  publicJwk.kid = KID;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
});

beforeEach(() => {
  _setJwksForTesting(createLocalJWKSet({ keys: [publicJwk] }));
  vi.mocked(userClient).mockReset();
});

afterAll(() => _setJwksForTesting(null));

describe("POST /api/storage/dos/sign-upload", () => {
  it("returns signed upload URL for operation caller", async () => {
    const sb = {
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: vi.fn().mockResolvedValue({
            data: { token: "tok123", path: "PO-100/abc-DO-1.pdf" },
            error: null,
          }),
        })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-100",
          do_number: "DO-1",
          mime_type: "application/pdf",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("tok123");
    expect(body.path).toMatch(/^PO-100\//);
    // Verify userClient was called (NEVER adminClient — F11)
    expect(userClient).toHaveBeenCalled();
  });

  it("rejects mime not in allowlist", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-100",
          do_number: "DO-1",
          mime_type: "application/zip",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects size > 10MB", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-100",
          do_number: "DO-1",
          mime_type: "application/pdf",
          size_bytes: 11_000_000,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects dealer caller with 403 (only operation/principal/partner/supplier admitted)", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-100",
          do_number: "DO-1",
          mime_type: "application/pdf",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // Loo 2026-05-11 — partner DO upload (collapsed Arrived+Receive flow)
  it("returns signed upload URL for partner caller (with partner_id)", async () => {
    const sb = {
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: vi.fn().mockResolvedValue({
            data: { token: "ptok", path: "PO-200/uuid-DO-9.pdf" },
            error: null,
          }),
        })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-200",
          do_number: "DO-9",
          mime_type: "application/pdf",
          size_bytes: 2048,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("ptok");
  });

  it("rejects partner without partner_id in JWT with 403", async () => {
    const jwt = await makeJwt("partner"); // no partnerId
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-200",
          do_number: "DO-9",
          mime_type: "application/pdf",
          size_bytes: 2048,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  // Loo 2026-05-11 (phase-6-storage-do-upload close): supplier DO upload —
  // supplier_mark_delivered (migration 0094) now requires the signed file path,
  // so the supplier role gets admit + supplierId guard mirroring partner.
  it("returns signed upload URL for supplier caller (with supplier_id)", async () => {
    const sb = {
      storage: {
        from: vi.fn(() => ({
          createSignedUploadUrl: vi.fn().mockResolvedValue({
            data: { token: "stok", path: "PO-300/uuid-DO-7.pdf" },
            error: null,
          }),
        })),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt(
      "supplier",
      undefined,
      "11111111-1111-1111-1111-bbbbbbbbbbbb",
    );
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-300",
          do_number: "DO-7",
          mime_type: "application/pdf",
          size_bytes: 2048,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("stok");
  });

  it("rejects supplier without supplier_id in JWT with 403", async () => {
    const jwt = await makeJwt("supplier"); // no supplierId
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          po_id: "PO-300",
          do_number: "DO-7",
          mime_type: "application/pdf",
          size_bytes: 2048,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// Loo 2026-05-11 — order-level DO upload (migration 0087 added file storage
// to operation "Mark delivered" flow).
describe("POST /api/storage/dos/sign-order-upload", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns signed upload URL for operation caller with order- prefix", async () => {
    const createSignedUploadUrl = vi.fn().mockResolvedValue({
      data: { token: "otok", path: `order-${ORDER_ID}/uuid-DO-1.pdf` },
      error: null,
    });
    const sb = { storage: { from: vi.fn(() => ({ createSignedUploadUrl })) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-order-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: ORDER_ID,
          do_number: "DO-1",
          mime_type: "application/pdf",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; path: string };
    expect(body.token).toBe("otok");
    expect(body.path).toMatch(new RegExp(`^order-${ORDER_ID}/`));
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
    const callArg = createSignedUploadUrl.mock.calls[0]?.[0];
    expect(callArg).toMatch(new RegExp(`^order-${ORDER_ID}/.+\\.pdf$`));
  });

  it("rejects non-UUID order_id", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-order-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: "not-a-uuid",
          do_number: "DO-1",
          mime_type: "application/pdf",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects mime not in allowlist", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-order-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: ORDER_ID,
          do_number: "DO-1",
          mime_type: "application/zip",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects partner caller (order DO is operation-only)", async () => {
    const jwt = await makeJwt("partner", "11111111-1111-1111-1111-aaaaaaaaaaaa");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-order-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: ORDER_ID,
          do_number: "DO-1",
          mime_type: "application/pdf",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects dealer caller with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/storage/dos/sign-order-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: ORDER_ID,
          do_number: "DO-1",
          mime_type: "application/pdf",
          size_bytes: 1024,
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});
