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
const URL = `http://t/api/operation/pos/${PO_ID}/receive-threads`;

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

describe("POST /api/operation/pos/:poId/receive-threads", () => {
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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
    const jwt = await makeJwt("operation");
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

  it("calls operation_receive_threads RPC with 5 args (poId from path) and returns 200", async () => {
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

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.rpc).toHaveBeenCalledWith("operation_receive_threads", {
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

    const jwt = await makeJwt("operation");
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
      "operation_receive_threads",
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

    const jwt = await makeJwt("operation");
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

    const jwt = await makeJwt("operation");
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

// Task 12 — operation threads-for-PO read endpoint backing the per-thread
// receive section in ReceivePOModal. Mirrors the supplier-side
// /api/supplier/pos/:poId/threads route shape. RLS on
// order_supplier_threads (`ost_operation_read`) is the security boundary;
// the inline role check is just an early-out friendly error.
const THREADS_URL = `http://t/api/operation/pos/${PO_ID}/threads`;

describe("GET /api/operation/pos/:poId/threads", () => {
  function makeSb(rows: unknown[], lines: unknown[] = []) {
    // Builder mock — chain `from().select().eq()` resolves to data; second
    // call `from("order_lines").select(...).in("order_id", [...])` resolves
    // separately. Mirrors the supplier endpoint pattern.
    return {
      from: vi.fn((table: string) => {
        if (table === "order_supplier_threads") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
          };
        }
        if (table === "order_lines") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: lines, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
    };
  }

  it("rejects non-operation roles with 403", async () => {
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request(THREADS_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns mapped thread rows with order joins + sku_lines for operation", async () => {
    const rows = [
      {
        id: THREAD_A,
        order_id: "ord-a",
        supplier_ready_at: "2026-05-15T10:00:00Z",
        pickup_event_id: null,
        orders: { dl: 1001, customer_name: "Aiman", delivery_date: "2026-05-20" },
      },
      {
        id: THREAD_B,
        order_id: "ord-b",
        supplier_ready_at: null,
        pickup_event_id: null,
        orders: { dl: 1002, customer_name: "Lim", delivery_date: "2026-05-22" },
      },
    ];
    const lines = [
      { order_id: "ord-a", sku: "mattress:carres-cloud:King", qty: 2 },
      { order_id: "ord-b", sku: "mattress:carres-cloud:Queen", qty: 1 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb(rows, lines) as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(THREADS_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      id: THREAD_A,
      order_id: "ord-a",
      order_dl: 1001,
      customer_name: "Aiman",
      customer_delivery_date: "2026-05-20",
      supplier_ready_at: "2026-05-15T10:00:00Z",
      pickup_event_id: null,
      sku_lines: [{ sku: "mattress:carres-cloud:King", qty: 2 }],
    });
    expect(body[1]).toMatchObject({
      id: THREAD_B,
      supplier_ready_at: null,
      sku_lines: [{ sku: "mattress:carres-cloud:Queen", qty: 1 }],
    });
  });

  it("returns [] when the PO has no threads (no order_lines lookup performed)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(makeSb([]) as any);

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(THREADS_URL, { headers: { Authorization: `Bearer ${jwt}` } }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
