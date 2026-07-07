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

/** Chainable supabase query-builder mock — both the GET (select→eq→maybeSingle)
 *  and PUT (upsert→select→single) chains resolve to the same `result`. */
function makeSb(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
  };
  return { from: vi.fn(() => builder), builder };
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

const ROW = {
  order_id: ORDER_ID,
  stock_location: ["Carres Klang"],
  stock_eta: "2026-06-20",
  delivery_time_slot: "Afternoon (12pm–3pm)",
  customer_request: "postponed",
  action_for_logistic: null,
  carres_remark: null,
  warehouse_remark: null,
  payment_status: "Follow Up",
  updated_at: "2026-06-09T10:00:00.000Z",
  updated_by: "u1",
};

// =====================================================================
// GET /api/operation/orders/:id/control
// =====================================================================
describe("GET /api/operation/orders/:id/control", () => {
  it("401 without Authorization", async () => {
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`),
      env,
    );
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when order id isn't a uuid", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/not-a-uuid/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("200 — returns the overlay row when present", async () => {
    const sb = makeSb({ data: ROW, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { control: typeof ROW };
    expect(body.control.payment_status).toBe("Follow Up");
    expect(sb.from).toHaveBeenCalledWith("ops_order_control");
  });

  it("200 — returns { control: null } when no row exists yet", async () => {
    const sb = makeSb({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { control: unknown };
    expect(body.control).toBeNull();
  });
});

// =====================================================================
// PUT /api/operation/orders/:id/control
// =====================================================================
describe("PUT /api/operation/orders/:id/control", () => {
  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status: "Paid" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("400 when body is not valid JSON", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: "{not json",
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it("422 when patch contains an unknown key (strict)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ random_typo: "yes" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("422 when patch object is empty", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("at least one field");
  });

  it("422 when stock_eta isn't yyyy-mm-dd", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stock_eta: "20 June" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("200 — upserts with order_id + updated_by and returns the row", async () => {
    const sb = makeSb({ data: ROW, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          stock_location: ["Carres Klang"],
          delivery_time_slot: "Morning (9am–12pm)",
          payment_status: "Follow Up",
          customer_request: "postponed",
        }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(sb.builder.upsert).toHaveBeenCalledWith(
      {
        order_id: ORDER_ID,
        stock_location: ["Carres Klang"],
        delivery_time_slot: "Morning (9am–12pm)",
        payment_status: "Follow Up",
        customer_request: "postponed",
        updated_by: "u1",
      },
      { onConflict: "order_id" },
    );
    const body = (await res.json()) as { control: typeof ROW };
    expect(body.control.order_id).toBe(ORDER_ID);
  });

  it("maps a PG RLS denial (42501) → 403", async () => {
    const sb = makeSb({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/control`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status: "Paid" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// POST /api/operation/orders/:id/receive-line  (GRN, migration 0208)
// =====================================================================
/** Per-table mock: routes each `.from(table)` to its own result, is thenable so
 *  `await select().eq()` resolves, and captures insert/upsert rows. */
function tableSb(tables: Record<string, { data?: unknown; error?: unknown }>) {
  const captured: {
    inserts: { table: string; rows: unknown }[];
    upserts: { table: string; rows: unknown }[];
    updates: { table: string; patch: unknown }[];
  } = { inserts: [], upserts: [], updates: [] };
  const from = vi.fn((table: string) => {
    const res = { data: null, error: null, ...(tables[table] ?? {}) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      not: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue(res),
      single: vi.fn().mockResolvedValue(res),
      // insert / update are chainable (…​.select().single()) AND awaitable (via then).
      insert: vi.fn((rows: unknown) => {
        captured.inserts.push({ table, rows });
        return builder;
      }),
      update: vi.fn((patch: unknown) => {
        captured.updates.push({ table, patch });
        return builder;
      }),
      upsert: vi.fn((rows: unknown) => {
        captured.upserts.push({ table, rows });
        return Promise.resolve({ error: res.error ?? null });
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve: any) => resolve(res),
    };
    return builder;
  });
  return { from, captured };
}

describe("POST /api/operation/orders/:id/receive-line", () => {
  const RL_URL = `http://t/api/operation/orders/${ORDER_ID}/receive-line`;

  it("401 without Authorization", async () => {
    const res = await app.fetch(new Request(RL_URL, { method: "POST", body: "{}" }), env);
    expect(res.status).toBe(401);
  });

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(RL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "X", qty: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 on an invalid body (qty 0)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(RL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "X", qty: 0 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("422 when the SKU isn't a line on the order", async () => {
    const sb = tableSb({
      orders: { data: { id: ORDER_ID, so: 1146, warehouse_id: "wh1" } },
      order_lines: { data: [{ sku: "Other", qty: 1, source_po: null }] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(RL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "Mattress X", qty: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("200 — books n units reserved to the SO, bumps line_received, flips to Ready when full", async () => {
    const sb = tableSb({
      orders: { data: { id: ORDER_ID, so: 1146, warehouse_id: "wh1" } },
      order_lines: { data: [{ sku: "Mattress X", qty: 2, source_po: "PO/1" }] },
      ops_order_control: { data: { line_received: { "Mattress X": 1 }, line_stock_status: {} } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(RL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "Mattress X", qty: 1, condition: "exhibition" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { received: number; lineReceived: number; lineQty: number; ready: boolean };
    };
    expect(body.result).toMatchObject({ received: 1, lineReceived: 2, lineQty: 2, ready: true });

    const ins = sb.captured.inserts.find((i) => i.table === "ops_stock_items");
    expect(ins).toBeTruthy();
    expect(ins!.rows as unknown[]).toHaveLength(1);
    expect((ins!.rows as Record<string, unknown>[])[0]).toMatchObject({
      sku: "Mattress X",
      status: "reserved",
      reserved_ref: "SO-1146",
      condition: "exhibition",
    });

    const up = sb.captured.upserts.find((u) => u.table === "ops_order_control");
    const row = up!.rows as { line_received: Record<string, number>; line_stock_status: Record<string, string> };
    expect(row.line_received["Mattress X"]).toBe(2);
    expect(row.line_stock_status["Mattress X"]).toBe("ready");
  });

  it("200 — partial receive does NOT flip to Ready", async () => {
    const sb = tableSb({
      orders: { data: { id: ORDER_ID, so: 1146, warehouse_id: "wh1" } },
      order_lines: { data: [{ sku: "Mattress X", qty: 2, source_po: null }] },
      ops_order_control: { data: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(RL_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sku: "Mattress X", qty: 1 }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { ready: boolean; lineReceived: number } };
    expect(body.result).toMatchObject({ ready: false, lineReceived: 1 });
    const up = sb.captured.upserts.find((u) => u.table === "ops_order_control");
    expect((up!.rows as Record<string, unknown>).line_stock_status).toBeUndefined();
  });
});

// =====================================================================
// Sofa loan flow (migration 0209)
// =====================================================================
describe("POST /api/operation/orders/:id/loan-sofa", () => {
  const URL = `http://t/api/operation/orders/${ORDER_ID}/loan-sofa`;
  const ITEM = "00000000-0000-0000-0000-0000000000f1";

  it("403 for dealer role", async () => {
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: ITEM }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it("422 on an invalid body (itemId not a uuid)", async () => {
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: "nope" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("200 — claims the free unit (LOAN marker) + records the loan", async () => {
    const sb = tableSb({
      orders: { data: { id: ORDER_ID, so: 1146 } },
      ops_stock_items: { data: { id: ITEM, sku: "Sofa L 3-Seater", condition: "exhibition" } },
      ops_sofa_loans: {
        data: {
          id: "loan1",
          order_id: ORDER_ID,
          item_id: ITEM,
          do_number: "DO-5321",
          status: "on_loan",
          loaned_at: "2026-07-07T00:00:00.000Z",
          returned_at: null,
          notes: null,
        },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: ITEM, doNumber: "DO-5321" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { loan: { status: string; item_sku: string } };
    expect(body.loan.status).toBe("on_loan");
    expect(body.loan.item_sku).toBe("Sofa L 3-Seater");
    // The unit was claimed with a LOAN reserved_ref marker.
    const claim = sb.captured.updates.find((u) => u.table === "ops_stock_items");
    expect((claim!.patch as Record<string, unknown>).reserved_ref).toBe("LOAN SO-1146");
  });

  it("409 when the sofa is no longer free", async () => {
    const sb = tableSb({
      orders: { data: { id: ORDER_ID, so: 1146 } },
      ops_stock_items: { data: null }, // the conditional update matched nothing
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: ITEM }),
      }),
      env,
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /api/operation/orders/:id/loan-return", () => {
  const URL = `http://t/api/operation/orders/${ORDER_ID}/loan-return`;
  const LOAN = "00000000-0000-0000-0000-0000000000f2";

  it("200 — marks the loan returned + frees the unit", async () => {
    const sb = tableSb({
      ops_sofa_loans: { data: { id: LOAN, item_id: "unit1", status: "on_loan" } },
      ops_stock_items: {},
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: LOAN }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // loan → returned, unit → free.
    const loanUpd = sb.captured.updates.find((u) => u.table === "ops_sofa_loans");
    expect((loanUpd!.patch as Record<string, unknown>).status).toBe("returned");
    const freeUpd = sb.captured.updates.find((u) => u.table === "ops_stock_items");
    expect((freeUpd!.patch as Record<string, unknown>).status).toBe("free");
  });

  it("404 when the loan isn't found on the order", async () => {
    const sb = tableSb({ ops_sofa_loans: { data: null } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: LOAN }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("409 when the loan is already returned", async () => {
    const sb = tableSb({
      ops_sofa_loans: { data: { id: LOAN, item_id: "unit1", status: "returned" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue(sb as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: LOAN }),
      }),
      env,
    );
    expect(res.status).toBe(409);
  });
});
