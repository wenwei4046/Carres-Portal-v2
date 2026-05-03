import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK, type KeyLike } from "jose";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { assertRpcCallShape } from "../../test-utils/assert-rpc";

vi.mock("../../lib/supabase", () => ({
  userClient: vi.fn(),
}));

import { userClient } from "../../lib/supabase";

const SUPABASE_URL = "https://test.supabase.co";
const KID = "test-kid-1";

const env = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};

let signKey: KeyLike;
let publicJwk: JWK;

async function makeJwt(role: string) {
  return new SignJWT({
    email: `${role}@carres.com`,
    app_metadata: { role },
  })
    .setProtectedHeader({ alg: "ES256", kid: KID, typ: "JWT" })
    .setSubject("11111111-1111-1111-1111-000000000999")
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

describe("GET /api/logistics/orders", () => {
  const ORDER_ROW = {
    id: "00000000-0000-0000-0000-000000000a01",
    dl: 4001,
    status: "proceed_order",
    logistics_stage: "awaiting_stock",
    warehouse_id: "00000000-0000-0000-0000-000000000w01",
    customer_name: "Tan Ah Kow",
    placed_at: "2026-05-03T10:00:00Z",
    delivery_date: "2026-05-10",
    delivery_partner_id: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "00000000-0000-0000-0000-000000000d01",
    dealers: { name: "BedHouse KL" },
  };

  function mockOrdersList(rows: typeof ORDER_ROW[]) {
    const eq = vi.fn().mockReturnThis();
    const inFn = vi.fn().mockReturnThis();
    const ilike = vi.fn().mockReturnThis();
    const or = vi.fn().mockReturnThis();
    const not = vi.fn().mockReturnThis();
    const is = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ in: inFn, eq, ilike, or, not, is, order, limit }));
    vi.mocked(userClient).mockReturnValue({
      from: vi.fn(() => ({ select })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    return { eq, inFn, ilike, or, not, is, order, limit };
  }

  it("returns orders for logistics with default 'all' stage and 'all' channel", async () => {
    const { inFn, order, limit } = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: typeof ORDER_ROW[] };
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]?.dl).toBe(4001);
    expect(inFn).toHaveBeenCalledWith("status", ["proceed_order", "delivered"]);
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("filters by stage when query param provided", async () => {
    const { eq } = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/orders?stage=ready_to_dispatch", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("logistics_stage", "ready_to_dispatch");
  });

  it("filters by channel=dealers excludes showroom orders (outlet_id IS NULL)", async () => {
    const m = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/orders?channel=dealers", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // dealers channel: outlet_id IS NULL via .is("outlet_id", null). PostgREST
    // requires .is(col, null) for SQL IS NULL — .eq(col, null) serializes to
    // outlet_id=eq.null (string filter) which never matches a uuid column.
    // Public 'channel=dealers' wording kept per spec §18.3; filter uses outlet_id.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (m.is as any).mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calls.find((c: any[]) => c[0] === 'outlet_id' && c[1] === null)).toBeTruthy();
  });

  it("filters by channel=showrooms (outlet_id IS NOT NULL)", async () => {
    const m = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/orders?channel=showrooms", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // showrooms channel: outlet_id IS NOT NULL via .not("outlet_id", "is", null)
    // (Public 'channel=showrooms' wording kept per spec §18.3; internally filters on outlet_id.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (m.not as any).mock.calls;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calls.find((c: any[]) => c[0] === 'outlet_id' && c[1] === 'is' && c[2] === null)).toBeTruthy();
  });

  it("returns 422 for invalid stage", async () => {
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/orders?stage=bogus", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request("http://t/api/logistics/orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/logistics/orders"), env);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/logistics/orders/:id", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  function mockDetailQueries(opts: {
    order?: any;
    lines?: any[];
    addons?: any[];
    history?: any[];
    pos?: any[];
    poLines?: any[];
    warehouse?: any;
    stockBalances?: any[];
  }) {
    const fromImpl = vi.fn((table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockReturnThis(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const promise = (data: any) => Promise.resolve({ data, error: null });
      switch (table) {
        case 'orders':
          chain.maybeSingle = vi.fn(() => promise(opts.order ?? null));
          break;
        case 'order_lines':
          chain.eq = vi.fn(() => promise(opts.lines ?? []));
          break;
        case 'order_addons':
          chain.eq = vi.fn(() => promise(opts.addons ?? []));
          break;
        case 'order_history':
          chain.order = vi.fn(() => promise(opts.history ?? []));
          break;
        case 'purchase_orders':
          chain.or = vi.fn(() => promise(opts.pos ?? []));
          break;
        case 'purchase_order_lines':
          chain.in = vi.fn(() => promise(opts.poLines ?? []));
          break;
        case 'warehouses':
          chain.maybeSingle = vi.fn(() => promise(opts.warehouse ?? null));
          break;
        case 'stock_balances':
          chain.in = vi.fn(() => promise(opts.stockBalances ?? []));
          break;
      }
      return chain;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from: fromImpl } as any);
    return fromImpl;
  }

  it("returns 404 when order does not exist", async () => {
    mockDetailQueries({ order: null });
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns aggregated detail for an awaiting_stock order", async () => {
    mockDetailQueries({
      order: {
        id: ORDER_ID, dl: 4001, status: "proceed_order", logistics_stage: "awaiting_stock",
        warehouse_id: "00000000-0000-0000-0000-000000000w01",
        customer_name: "Tan Ah Kow", customer_phone: "+60123456789", customer_address: "...",
        delivery_date: "2026-05-10", placed_at: "2026-05-03T10:00:00Z",
        do_number: null, do_note: null, dispatched_at: null, delivered_at: null,
        delivery_partner_id: null, dealer_id: "00000000-0000-0000-0000-000000000d01",
        dealers: { name: "BedHouse KL" }, outlet_id: null, outlets: null,
      },
      lines: [
        { sku: "MAT-K-001", qty: 2, unit_price: 1500 },
        { sku: "BED-K-002", qty: 1, unit_price: 800 },
      ],
      addons: [{ addon_key: "PIL-001", qty: 4, unit_price: 50 }],
      history: [{ text: "Order placed", by_role: "dealer", occurred_at: "2026-05-03T09:00:00Z" }],
      pos: [{ id: "PO-2030", supplier_id: "00000000-0000-0000-0000-000000000s01", warehouse_id: "00000000-0000-0000-0000-000000000w01", status: "open", sup_status: "pending", dl: 4001, dl_refs: null }],
      poLines: [{ po_id: "PO-2030", sku: "MAT-K-001", qty: 2, received_qty: 0 }],
      warehouse: { id: "00000000-0000-0000-0000-000000000w01", name: "KL HQ", address: "..." },
      stockBalances: [
        { sku: "MAT-K-001", warehouse_id: "00000000-0000-0000-0000-000000000w01", qty: 0, reserved: 0 },
        { sku: "BED-K-002", warehouse_id: "00000000-0000-0000-0000-000000000w01", qty: 5, reserved: 0 },
      ],
    });

    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.dl).toBe(4001);
    expect(body.lines).toHaveLength(2);
    expect(body.addons).toHaveLength(1);
    expect(body.total).toBe(2 * 1500 + 1 * 800 + 4 * 50);
    expect(body.warehouse.name).toBe("KL HQ");
    expect(body.stockBalances).toHaveLength(2);
    expect(body.pos).toHaveLength(1);
    expect(body.pos[0].lines).toHaveLength(1);
    expect(body.history).toHaveLength(1);
  });

  it("returns 403 for dealer role (no Supabase round-trip)", async () => {
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/orders/:id/assign-partner", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000b01";

  it("returns 200 on successful RPC call", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, dispatched_at: "2026-05-03T11:00:00Z" }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_assign_partner", {
      p_order_id: ORDER_ID,
      p_partner_id: PARTNER_ID,
    });
    assertRpcCallShape(rpc, "logistics_assign_partner", ["p_order_id", "p_partner_id"]);
  });

  it("returns 422 when partnerId is not a uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when body is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps SQLSTATE 42P01 → 404", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42P01", message: "order not found" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("maps SQLSTATE 22023 → 422 wrong_stage", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "wrong stage", details: "wrong_stage" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/assign-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/orders/:id/attach-do", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const VALID = { doNumber: "DO-9801", doNote: "Delivered to lobby", signed: true };

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, delivered_at: "2026-05-03T11:00:00Z" }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_attach_do_and_deliver", {
      p_order_id: ORDER_ID,
      p_do_number: "DO-9801",
      p_do_note: "Delivered to lobby",
      p_signed: true,
    });
    assertRpcCallShape(rpc, "logistics_attach_do_and_deliver", [
      "p_order_id",
      "p_do_number",
      "p_do_note",
      "p_signed",
    ]);
  });

  it("rejects when signed is false", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doNumber: "DO-9801", signed: false }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects when doNumber is < 3 chars", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doNumber: "DO", signed: true }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("passes p_do_note as null when omitted", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doNumber: "DO-9802", signed: true }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("logistics_attach_do_and_deliver", {
      p_order_id: ORDER_ID,
      p_do_number: "DO-9802",
      p_do_note: null,
      p_signed: true,
    });
    assertRpcCallShape(rpc, "logistics_attach_do_and_deliver", [
      "p_order_id",
      "p_do_number",
      "p_do_note",
      "p_signed",
    ]);
  });

  it("maps P0001 do_required → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "DO required", details: "do_required" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("do_required");
  });

  it("returns 403 for non-logistics role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/orders/:id/abandon", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 on success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: ORDER_ID, status: "cancelled" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer requested cancel" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_abandon_order", {
      p_order_id: ORDER_ID,
      p_reason: "Customer requested cancel",
    });
    assertRpcCallShape(rpc, "logistics_abandon_order", ["p_order_id", "p_reason"]);
  });

  it("returns 422 when reason is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps 22023 wrong_status → 422", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "22023", message: "wrong status", details: "wrong_status" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/orders/:id/warehouse", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000c02";

  it("returns 200 on success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: ORDER_ID, warehouse_id: WAREHOUSE_ID, logistics_stage: "ready_to_dispatch" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_warehouse_pick", {
      p_order_id: ORDER_ID,
      p_warehouse_id: WAREHOUSE_ID,
    });
    assertRpcCallShape(rpc, "logistics_warehouse_pick", ["p_order_id", "p_warehouse_id"]);
  });

  it("returns 422 when warehouseId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 has_open_pos → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "PO already issued", details: "has_open_pos" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("has_open_pos");
  });

  it("returns 403 for non-logistics (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/orders/:id/recheck-stock", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WH_ID = "00000000-0000-0000-0000-000000000c01";

  it("returns 200 with shortages list", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: WH_ID, error: null })
      .mockResolvedValueOnce({ data: [{ sku: "MAT-K-001", qty: 2, missing: 2 }], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.warehouseId).toBe(WH_ID);
    expect(body.shortages).toEqual([{ sku: "MAT-K-001", qty: 2, missing: 2 }]);
    expect(rpc).toHaveBeenNthCalledWith(1, "logistics_pick_warehouse", { p_order_id: ORDER_ID });
    expect(rpc).toHaveBeenNthCalledWith(2, "logistics_calc_shortages", { p_order_id: ORDER_ID, p_warehouse_id: WH_ID });
  });

  it("returns warehouseId=null and empty shortages when no warehouse pickable", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.warehouseId).toBeNull();
    expect(body.shortages).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 422 when body has extra keys (.strict)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unexpected: "key" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-logistics (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/logistics/orders/:id/issue-pos", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 on success with empty body", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { pos_created: [{ id: "PO-2050", supplier_id: "00000000-0000-0000-0000-000000000a01", line_count: 1 }] },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_issue_pos_for_order", { p_order_id: ORDER_ID });
    assertRpcCallShape(rpc, "logistics_issue_pos_for_order", ["p_order_id"]);
  });

  it("returns 422 when body has extra keys (.strict)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unexpected: "key" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("maps P0001 already_issued → 422 with code (soft idempotency per spec §17.5)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "POs already issued for this order", details: "already_issued" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("already_issued");
  });

  it("returns 403 for non-logistics (no rpc)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});
