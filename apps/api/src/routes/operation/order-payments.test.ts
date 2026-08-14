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
  const calls = {
    inserts: [] as unknown[],
    upserts: [] as unknown[],
    updates: [] as Record<string, unknown>[],
    deletes: 0,
    rpc: [] as unknown[],
  };
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
      update: vi.fn((payload: Record<string, unknown>) => {
        calls.updates.push(payload);
        return builder;
      }),
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

  it("201 — records through the ONE writer (payment_record) with a locked-scheme receipt (CARD 4)", async () => {
    const returned = {
      id: PAY_ID, order_id: ORDER_ID, amount: 1500, paid_on: "2026-06-26",
      method: "bank", kind: "deposit", recorded_by: "u1", counted_in_paid: true,
    };
    const sb = makeSb(
      {
        // count query (then) → 2 existing → seq 3 (rides the receipt seed).
        order_payments: { list: { data: null, error: null, count: 2 } },
      },
      { data: { payment: returned, orders_paid: 3500 }, error: null },
    );
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
    const body = (await res.json()) as { payment: typeof returned; ordersPaid: number };
    expect(body.payment.id).toBe(PAY_ID);
    expect(body.ordersPaid).toBe(3500);
    // The write went through the RPC — never a direct table insert.
    expect(sb.calls.inserts).toHaveLength(0);
    const rpc = sb.calls.rpc[0] as { name: string; args: Record<string, unknown> };
    expect(rpc.name).toBe("payment_record");
    expect(rpc.args).toMatchObject({
      p_order_id: ORDER_ID,
      p_amount: 1500,
      p_method: "bank",
      p_kind: "deposit",
      p_counts_toward_paid: true,
    });
    // The receipt is the LOCKED document scheme: RC-DDMMYY-NNNN, seeded on
    // {orderId}:{seq} (seq = 3 here) — deterministic, so a reprint matches.
    expect(rpc.args.p_receipt_no).toMatch(/^RC-260626-\d{4}$/);
  });

  // CARD 4 closing slice (0347). The receipt seed is `count + 1`, so two
  // payments recorded into one order in the same instant mint the SAME number.
  // 0347's unique index stops that being stored; without a retry the index
  // just turns a silent duplicate into a 500 at the till.
  it("a taken receipt number is retried with the next sequence, not returned as an error", async () => {
    const returned = {
      id: PAY_ID, order_id: ORDER_ID, amount: 300, paid_on: "2026-06-26",
      method: "cash", kind: "payment", recorded_by: "u1", counted_in_paid: true,
    };
    const sb = makeSb({ order_payments: { list: { data: null, error: null, count: 2 } } });
    let call = 0;
    sb.rpc.mockImplementation((name: string, args: unknown) => {
      sb.calls.rpc.push({ name, args });
      call += 1;
      // The first attempt collides; the second (seq bumped) succeeds.
      return Promise.resolve(
        call === 1
          ? { data: null, error: { code: "23505", message: "duplicate key" } }
          : { data: { payment: returned, orders_paid: 300 }, error: null },
      );
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 300, paidOn: "2026-06-26", method: "cash" }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb.calls.rpc).toHaveLength(2);
    const first = sb.calls.rpc[0] as { args: Record<string, unknown> };
    const second = sb.calls.rpc[1] as { args: Record<string, unknown> };
    // A DIFFERENT number, still on the locked scheme — never the same one twice.
    expect(second.args.p_receipt_no).not.toBe(first.args.p_receipt_no);
    expect(second.args.p_receipt_no).toMatch(/^RC-260626-\d{4}$/);
  });

  it("gives up after three attempts rather than looping on a real conflict", async () => {
    const sb = makeSb(
      { order_payments: { list: { data: null, error: null, count: 0 } } },
      { data: null, error: { code: "23505", message: "duplicate key" } },
    );
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 300, paidOn: "2026-06-26", method: "cash" }),
      }),
      env,
    );
    expect(res.status).not.toBe(201);
    expect(sb.calls.rpc).toHaveLength(3);
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

  it("200 — principal voids through payment_void; the row is never deleted (CARD 4)", async () => {
    const sb = makeSb(
      {},
      { data: { payment_id: PAY_ID, orders_paid: 2000 }, error: null },
    );
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
    // A void is a STAMP through the RPC — no direct delete, ever.
    expect(sb.calls.deletes).toBe(0);
    const rpc = sb.calls.rpc[0] as { name: string; args: Record<string, unknown> };
    expect(rpc.name).toBe("payment_void");
    expect(rpc.args).toMatchObject({ p_payment_id: PAY_ID });
  });
});

// =====================================================================
// POST /:id/storage/collect
// =====================================================================
describe("POST /:id/storage/collect", () => {
  it("201 — one RPC records the storage payment AND stamps the gate (CARD 4)", async () => {
    const sb = makeSb(
      {
        order_payments: { list: { data: null, error: null, count: 0 } },
        ops_order_control: {
          maybeSingle: {
            data: { order_id: ORDER_ID, storage_collected_at: "2026-06-26T00:00:00Z" },
            error: null,
          },
        },
      },
      { data: { payment: { id: PAY_ID, kind: "storage" }, orders_paid: 0 }, error: null },
    );
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
    // ONE writer: the RPC records the ledger row and stamps the gate in one
    // transaction — no direct insert, no separate upsert race.
    expect(sb.calls.inserts).toHaveLength(0);
    expect(sb.calls.upserts).toHaveLength(0);
    const rpc = sb.calls.rpc[0] as { name: string; args: Record<string, unknown> };
    expect(rpc.name).toBe("payment_record");
    expect(rpc.args).toMatchObject({ p_order_id: ORDER_ID, p_amount: 200, p_kind: "storage" });
    const body = (await res.json()) as { control: { storage_collected_at: string } };
    expect(body.control.storage_collected_at).toBeTruthy();
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

  // ── C9 · the two release outcomes (Jess 2026-07-27) ───────────────────────
  async function decide(decision: string) {
    const sb = makeSb({
      ops_order_control: {
        maybeSingle: {
          data: { order_id: ORDER_ID, storage_waiver_status: "approved" },
          error: null,
        },
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/waiver/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      }),
      env,
    );
    return { res, sb };
  }

  it("RELEASED, fee still owed → the hold lifts and the fee is NOT written off", async () => {
    const { res, sb } = await decide("released");
    expect(res.status).toBe(200);
    const patch = sb.calls.updates.at(-1)!;
    expect(patch.storage_waiver_status).toBe("approved");
    // The whole point of the card: an override must never quietly forgive
    // money, so the decision may not touch the fee.
    expect("storage_fee_override" in patch).toBe(false);
    expect((await res.json() as { decision: string }).decision).toBe("released");
  });

  it("RELEASED AND WAIVED → the same release PLUS the write-off", async () => {
    const { res, sb } = await decide("waived");
    expect(res.status).toBe(200);
    const patch = sb.calls.updates.at(-1)!;
    expect(patch.storage_waiver_status).toBe("approved");
    expect(patch.storage_fee_override).toBe(0);
  });

  it("REJECTED never writes off a fee", async () => {
    const { sb } = await decide("rejected");
    const patch = sb.calls.updates.at(-1)!;
    expect(patch.storage_waiver_status).toBe("rejected");
    expect("storage_fee_override" in patch).toBe(false);
  });

  it("every decision leaves an audit sentence naming what happened", async () => {
    // The override alone cannot say what it replaced — the 0211 trigger does
    // not watch that column — so the amount goes into the order's activity.
    const { sb } = await decide("waived");
    const note = sb.calls.rpc.at(-1) as { name: string; args: { p_content: string } };
    expect(note.name).toBe("operation_add_annotation");
    expect(note.args.p_content).toContain("written off");
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
// POST /:id/storage/extend — one-time delivery extension (migration 0196)
// =====================================================================
describe("POST /:id/storage/extend", () => {
  it("403 for dealer", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/extend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDeliveryDate: "2026-08-01", reasonKey: "customer_renovation", acknowledged: true }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 without the customer acknowledgement", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/extend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDeliveryDate: "2026-08-01", reasonKey: "customer_renovation", acknowledged: false }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("422 without a structured reason — free text / legacy words rejected (T4)", async () => {
    const jwt = await makeJwt("operation");
    for (const body of [
      { newDeliveryDate: "2026-08-01", acknowledged: true },
      { newDeliveryDate: "2026-08-01", reasonKey: "Renovation", acknowledged: true },
      { newDeliveryDate: "2026-08-01", reason: "Renovation", acknowledged: true },
    ]) {
      const res = await app.fetch(
        new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/extend`, {
          method: "POST",
          headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        env,
      );
      expect(res.status).toBe(422);
    }
  });

  it("201 — first extension snapshots the original delivery date + sets count 1", async () => {
    const sb = makeSb({
      orders: {
        maybeSingle: {
          data: { id: ORDER_ID, delivery_date: "2026-07-15", ops_order_control: { extension_count: 0, extension_original_date: null } },
          error: null,
        },
      },
      ops_order_control: {
        single: { data: { order_id: ORDER_ID, extension_count: 1, extension_original_date: "2026-07-15" }, error: null },
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/extend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDeliveryDate: "2026-08-20", reasonKey: "customer_reschedule", note: "wants a weekend", acknowledged: true }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb.calls.upserts[0]).toMatchObject({
      order_id: ORDER_ID,
      extension_original_date: "2026-07-15",
      extension_new_date: "2026-08-20",
      // T4: the structured KEY is what gets stored
      extension_reason: "customer_reschedule",
      extension_count: 1,
      extended_by: "u1",
    });
    expect((sb.calls.upserts[0] as { extension_acknowledged_at?: string }).extension_acknowledged_at).toBeTruthy();
    // T4 done-when: the reason lands in activity history (annotation door)
    expect(sb.calls.rpc).toHaveLength(1);
    const ann = sb.calls.rpc[0] as { name: string; args: { p_order_id: string; p_content: string } };
    expect(ann.name).toBe("operation_add_annotation");
    expect(ann.args.p_order_id).toBe(ORDER_ID);
    expect(ann.args.p_content).toContain("Delivery postponed");
    expect(ann.args.p_content).toContain("Customer requested reschedule");
    expect(ann.args.p_content).toContain("wants a weekend");
  });

  it("403 extension_used — operation cannot record a 2nd extension", async () => {
    const sb = makeSb({
      orders: {
        maybeSingle: {
          data: { id: ORDER_ID, delivery_date: "2026-07-15", ops_order_control: { extension_count: 1, extension_original_date: "2026-07-15" } },
          error: null,
        },
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/extend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDeliveryDate: "2026-09-01", reasonKey: "customer_hold", note: "again", acknowledged: true }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("extension_used");
    expect(sb.calls.upserts).toHaveLength(0);
    expect(sb.calls.rpc).toHaveLength(0); // no activity row for a refused save
  });

  it("201 — a principal CAN record a 2nd extension (keeps the original date)", async () => {
    const sb = makeSb({
      orders: {
        maybeSingle: {
          data: { id: ORDER_ID, delivery_date: "2026-08-20", ops_order_control: { extension_count: 1, extension_original_date: "2026-07-15" } },
          error: null,
        },
      },
      ops_order_control: {
        single: { data: { order_id: ORDER_ID, extension_count: 2, extension_original_date: "2026-07-15" }, error: null },
      },
    });
    vi.mocked(userClient).mockReturnValue(sb as never);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/storage/extend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ newDeliveryDate: "2026-09-15", reasonKey: "stock_not_ready", note: "second delay", acknowledged: true }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(sb.calls.upserts[0]).toMatchObject({
      extension_original_date: "2026-07-15", // unchanged
      extension_count: 2,
    });
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
