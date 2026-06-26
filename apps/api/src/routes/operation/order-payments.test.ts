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
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);
}

interface TableCfg {
  list?: { data: unknown; error: unknown; count?: number };
  single?: { data: unknown; error: unknown };
  maybeSingle?: { data: unknown; error: unknown };
}

/** Table-routed query-builder mock. Each `from(table)` returns a thenable
 *  builder whose terminal (await / .single() / .maybeSingle()) resolves to that
 *  table's configured result. Captures insert/delete/upsert payloads for
 *  assertions; an optional `rpc` result backs sb.rpc(). */
function makeSb(
  byTable: Record<string, TableCfg>,
  rpc?: { data: unknown; error: unknown },
) {
  const calls = { inserts: [] as unknown[], upserts: [] as unknown[], deletes: 0, rpc: [] as unknown[] };
  const from = vi.fn((table: string) => {
    const cfg = byTable[table] ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: vi.fn(() => builder),
      insert: vi.fn((payload: unknown) => {
        calls.inserts.push(payload);
        return builder;
      }),
      delete: vi.fn(() => {
        calls.deletes += 1;
        return builder;
      }),
      update: vi.fn(() => builder),
      upsert: vi.fn((payload: unknown) => {
        calls.upserts.push(payload);
        return builder;
      }),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve(cfg.single ?? { data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve(cfg.maybeSingle ?? { data: null, error: null })),
      // Awaiting the builder (list / count / delete queries) resolves here.
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(cfg.list ?? { data: [], error: null }).then(resolve, reject),
    };
    return builder;
  });
  const rpcFn = vi.fn((name: string, args: unknown) => {
    calls.rpc.push({ name, args });
    return Promise.resolve(rpc ?? { data: null, error: null });
  });
  return { from, rpc: rpcFn, calls };
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

const ORDER_ID = "00000000-0000-0000-0000-00000000010a";
const PAY_ID = "00000000-0000-0000-0000-0000000002bb";

// =====================================================================
// GET /api/operation/orders/:id/payments
// =====================================================================
describe("GET /:id/payments", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when order id isn't a uuid", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/not-a-uuid/payments`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("200 — returns the ledger rows", async () => {
    const rows = [
      { id: PAY_ID, order_id: ORDER_ID, amount: 1500, paid_on: "2026-06-26", method: "cash", kind: "payment" },
    ];
    const sb = makeSb({ order_payments: { list: { data: rows, error: null } } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { payments: typeof rows };
    expect(body.payments).toHaveLength(1);
    expect(sb.from).toHaveBeenCalledWith("order_payments");
  });
});

// =====================================================================
// POST /api/operation/orders/:id/payments
// =====================================================================
describe("POST /:id/payments", () => {
  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 100, paidOn: "2026-06-26" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 when amount is non-positive", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 0, paidOn: "2026-06-26" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("201 — inserts with recorded_by + a generated R{so}-{n} receipt", async () => {
    const inserted = {
      id: PAY_ID, order_id: ORDER_ID, amount: 1500, paid_on: "2026-06-26",
      method: "bank", kind: "deposit", receipt_no: "R1001-3", recorded_by: "u1",
    };
    const sb = makeSb({
      orders: { maybeSingle: { data: { so: 1001 }, error: null } },
      // count query (then) → 2 existing → seq 3 → R1001-3; insert (single) → row
      order_payments: { list: { data: null, error: null, count: 2 }, single: { data: inserted, error: null } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1500, paidOn: "2026-06-26", method: "bank", kind: "deposit" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { payment: typeof inserted };
    expect(body.payment.receipt_no).toBe("R1001-3");
    expect(sb.calls.inserts[0]).toMatchObject({
      order_id: ORDER_ID,
      amount: 1500,
      method: "bank",
      kind: "deposit",
      recorded_by: "u1",
      receipt_no: "R1001-3",
    });
  });
});

// =====================================================================
// DELETE /api/operation/orders/:id/payments/:pid
// =====================================================================
describe("DELETE /:id/payments/:pid", () => {
  it("403 for operation role (principal only)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments/${PAY_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("200 — principal voids the entry", async () => {
    const sb = makeSb({ order_payments: { list: { data: null, error: null } } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments/${PAY_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.calls.deletes).toBe(1);
  });
});

// =====================================================================
// POST /:id/storage/collect
// =====================================================================
describe("POST /:id/storage/collect", () => {
  it("201 — records a kind:'storage' payment AND stamps storage_collected_at", async () => {
    const sb = makeSb({
      orders: { maybeSingle: { data: { so: 1001 }, error: null } },
      order_payments: {
        list: { data: null, error: null, count: 0 },
        single: { data: { id: PAY_ID, kind: "storage", receipt_no: "R1001-1" }, error: null },
      },
      ops_order_control: { single: { data: { order_id: ORDER_ID, storage_collected_at: "2026-06-26T00:00:00Z" }, error: null } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/collect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 200, paidOn: "2026-06-26", method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    // the ledger row was forced to kind:'storage'
    expect(sb.calls.inserts[0]).toMatchObject({ order_id: ORDER_ID, amount: 200, kind: "storage" });
    // the overlay was stamped to open the gate
    expect(sb.calls.upserts[0]).toMatchObject({ order_id: ORDER_ID, storage_paid: "Paid" });
    expect((sb.calls.upserts[0] as { storage_collected_at?: string }).storage_collected_at).toBeTruthy();
  });

  it("403 for dealer", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/collect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 200, paidOn: "2026-06-26" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// Storage waiver — request (operator) + decide (principal only)
// =====================================================================
describe("storage waiver", () => {
  it("operator requests → status 'requested' with reason + requester", async () => {
    const sb = makeSb({
      ops_order_control: { single: { data: { order_id: ORDER_ID, storage_waiver_status: "requested" }, error: null } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/waiver/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "goodwill — long-standing customer" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.calls.upserts[0]).toMatchObject({
      order_id: ORDER_ID,
      storage_waiver_status: "requested",
      storage_waiver_reason: "goodwill — long-standing customer",
      storage_waiver_requested_by: "u1",
    });
  });

  it("request rejects an empty reason (422)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/waiver/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("operation CANNOT decide a waiver (403 — principal only)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/waiver/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("principal approves → status 'approved' with decider stamp", async () => {
    const sb = makeSb({
      ops_order_control: { maybeSingle: { data: { order_id: ORDER_ID, storage_waiver_status: "approved" }, error: null } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/waiver/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approved" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { control: { storage_waiver_status: string } };
    expect(body.control.storage_waiver_status).toBe("approved");
  });

  it("decide on an order with no waiver → 404", async () => {
    const sb = makeSb({ ops_order_control: { maybeSingle: { data: null, error: null } } });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/waiver/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejected" }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });
});

// =====================================================================
// Delivery gate — POST /:id/assign-partner is blocked by an uncollected fee
// =====================================================================
describe("assign-partner storage gate", () => {
  const PARTNER_ID = "00000000-0000-0000-0000-0000000003cc";

  it("422 storage_uncollected when a fee is owed and not collected/waived", async () => {
    const sb = makeSb({
      ops_order_control: {
        maybeSingle: {
          data: { storage_from: "2020-01-01", storage_collected_at: null, storage_waiver_status: "none", storage_fee_override: null },
          error: null,
        },
      },
      orders: { maybeSingle: { data: { delivery_date: "2020-01-01" }, error: null } },
      order_lines: { list: { data: [{ sku: "MS1001" }], error: null } },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("storage_uncollected");
    expect(sb.calls.rpc).toHaveLength(0); // dispatch RPC never reached
  });

  it("dispatches normally once storage is collected", async () => {
    const sb = makeSb(
      {
        ops_order_control: {
          maybeSingle: { data: { storage_collected_at: "2026-06-26T00:00:00Z", storage_waiver_status: "none" }, error: null },
        },
        orders: { maybeSingle: { data: { delivery_date: "2020-01-01" }, error: null } },
        order_lines: { list: { data: [{ sku: "MS1001" }], error: null } },
      },
      { data: { id: ORDER_ID, status: "proceed_order" }, error: null }, // rpc result
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.calls.rpc).toHaveLength(1); // operation_assign_partner reached
  });
});
