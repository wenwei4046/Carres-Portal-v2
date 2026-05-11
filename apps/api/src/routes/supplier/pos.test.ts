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

async function makeJwt(role: string) {
  return new SignJWT({ email: `${role}@x`, app_metadata: { role } })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000006")
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

const PO_ID = "PO-2046";

describe("GET /api/supplier/pos", () => {
  it("lists supplier POs ordered by placed_at desc", async () => {
    const orderFn = vi.fn().mockResolvedValue({
      data: [
        { id: "PO-2050", sup_status: "pending", supplier_id: "e1" },
        { id: "PO-2049", sup_status: "in_production", supplier_id: "e1" },
      ],
      error: null,
    });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ order: orderFn }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.from).toHaveBeenCalledWith("purchase_orders");
    expect(orderFn).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(((await res.json()) as unknown[]).length).toBe(2);
  });

  it("filters by bucket=po (pending|acknowledged|in_production)", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderChain = { in: inFn };
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue(orderChain),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos?bucket=po", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(inFn).toHaveBeenCalledWith("sup_status", [
      "pending",
      "acknowledged",
      "in_production",
    ]);
  });

  it("filters by bucket=delivered (picked_up|delivered)", async () => {
    const inFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ in: inFn }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos?bucket=delivered", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(inFn).toHaveBeenCalledWith("sup_status", ["picked_up", "delivered"]);
  });

  it("rejects invalid bucket with 422", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos?bucket=garbage", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects logistics with 403 (supplier-only guard)", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/supplier/pos", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/supplier/pos/:id", () => {
  it("returns PO row when found (RLS-scoped)", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: PO_ID, sup_status: "pending" },
              error: null,
            }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { id: string }).toMatchObject({ id: PO_ID });
  });

  it("returns 404 when RLS hides the PO", async () => {
    const sb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/PO-DOES-NOT-EXIST`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/supplier/pos/:id/acknowledge", () => {
  it("calls supplier_acknowledge RPC with po_id", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { po_id: PO_ID, sup_status: "acknowledged" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_acknowledge", {
      p_po_id: PO_ID,
    });
  });

  it("forwards 422 wrong_sup_status from RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "22023", message: "PO not in pending state" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("forwards 403 forbidden (cross-supplier) from RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "forbidden" },
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/supplier/pos/:id/start-production", () => {
  it("calls supplier_start_production RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { po_id: PO_ID, sup_status: "in_production" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/start-production`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_start_production", {
      p_po_id: PO_ID,
    });
  });
});

describe("POST /api/supplier/pos/:id/ready-for-pickup", () => {
  it("calls existing logistics_supplier_ready_confirm RPC", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: { po_id: PO_ID, sup_status: "ready_confirm_sent" },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/ready-for-pickup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("logistics_supplier_ready_confirm", {
      p_po_id: PO_ID,
    });
  });
});

describe("POST /api/supplier/pos/:id/mark-delivered", () => {
  // Migration 0094 widens the RPC signature to require p_do_file_path; the
  // frontend captures the path from /api/storage/dos/sign-upload before
  // submitting. Every passing case below sends doFilePath, and the rejection
  // case asserts the schema 422s when it's missing.
  const SAMPLE_PATH = `${PO_ID}/abc-DO-9999.pdf`;

  it("calls supplier_mark_delivered with all 4 args (number + file_path + note)", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          po_id: PO_ID,
          sup_status: "delivered",
          do_number: "DO-9999",
          do_file_path: SAMPLE_PATH,
        },
        error: null,
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doNumber: "DO-9999",
          doFilePath: SAMPLE_PATH,
          doNote: "partial",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_mark_delivered", {
      p_po_id: PO_ID,
      p_do_number: "DO-9999",
      p_do_file_path: SAMPLE_PATH,
      p_do_note: "partial",
    });
  });

  it("nulls do_note when omitted", async () => {
    const sb = {
      rpc: vi.fn().mockResolvedValue({ data: { po_id: PO_ID }, error: null }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);

    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "DO-9999", doFilePath: SAMPLE_PATH }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("supplier_mark_delivered", {
      p_po_id: PO_ID,
      p_do_number: "DO-9999",
      p_do_file_path: SAMPLE_PATH,
      p_do_note: null,
    });
  });

  it("rejects empty do_number with 422", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "  ", doFilePath: SAMPLE_PATH }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects missing doFilePath with 422 (migration 0094 closes phase-6-storage-do-upload)", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "DO-9999" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects empty doFilePath with 422", async () => {
    const jwt = await makeJwt("supplier");
    const res = await app.fetch(
      new Request(`http://t/api/supplier/pos/${PO_ID}/mark-delivered`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ doNumber: "DO-9999", doFilePath: "   " }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });
});
