import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
  type KeyLike,
} from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
  adminClient: vi.fn(),
}));
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

const THREAD_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const THREAD_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PO_ID = "PO-9001";
const URL = `http://t/api/logistics/pos/${PO_ID}/receive-threads`;

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000007")
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

describe("POST /api/logistics/pos/:poId/receive-threads", () => {
  const VALID = {
    threadIds: [THREAD_A, THREAD_B],
    doNumber: "DO-7401",
    doFilePath: `${PO_ID}/abc-do.pdf`,
    doNote: "Bay 7",
    signed: true,
  };

  it("rejects dealer role with 403", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("rejects partner role with 403", async () => {
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when doNumber is missing", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          threadIds: [THREAD_A],
          doFilePath: "p/x.pdf",
          signed: true,
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when doNumber < 3 chars", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, doNumber: "DO" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when threadIds is empty", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, threadIds: [] }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when signed is false (zod literal(true))", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID, signed: false }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when signed is missing (zod requires literal true)", async () => {
    const jwt = await makeJwt("logistics");
    const body: Record<string, unknown> = { ...VALID };
    delete body.signed;
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("calls logistics_receive_threads RPC with 5 args (poId from path) and returns 200", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          pickup_event_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          thread_count: 2,
          po_sup_status: "partially_shipped",
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_receive_threads", {
      p_po_id: PO_ID,
      p_thread_ids: [THREAD_A, THREAD_B],
      p_do_number: "DO-7401",
      p_do_file_path: `${PO_ID}/abc-do.pdf`,
      p_do_note: "Bay 7",
    });
    const body = (await res.json()) as {
      pickup_event_id: string;
      thread_count: number;
      po_sup_status: string;
    };
    expect(body.thread_count).toBe(2);
    expect(body.po_sup_status).toBe("partially_shipped");
  });

  it("passes p_do_note as null when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          pickup_event_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
          thread_count: 1,
          po_sup_status: "partially_shipped",
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("logistics");
    const body = { ...VALID } as Partial<typeof VALID>;
    delete body.doNote;
    await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );
    expect(sb.rpc).toHaveBeenCalledWith(
      "logistics_receive_threads",
      expect.objectContaining({ p_do_note: null }),
    );
  });

  it("forwards 403 when RPC returns PG 42501 (cross-tenant / wrong role)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "not assigned to this PO" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("forwards 422 when RPC returns PG 22023 (wrong state)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "22023",
          message: "thread is not in supplier_ready state",
          details: "wrong_state",
        },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});
