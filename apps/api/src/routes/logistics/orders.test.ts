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
    logistics_stage: "awaiting_logistics_action",
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
    // Pipeline v2 (C3): status filter now includes 'place' so the kanban
    // can render the "Placed" column.
    expect(inFn).toHaveBeenCalledWith("status", ["place", "proceed_order", "delivered"]);
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it("returns status='place' rows in the response (pipeline v2 'Placed' column)", async () => {
    const PLACE_ROW = {
      ...ORDER_ROW,
      id: "00000000-0000-0000-0000-000000000a02",
      dl: 4002,
      status: "place",
      logistics_stage: null,
      warehouse_id: null,
    };
    // PLACE_ROW has nulls for logistics_stage + warehouse_id (real shape for
     // status='place' rows); the helper's `typeof ORDER_ROW` is over-narrow.
     mockOrdersList([PLACE_ROW as unknown as typeof ORDER_ROW]);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request("http://t/api/logistics/orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as { orders: any[] };
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].status).toBe("place");
  });

  it("filters by stage=placed via status='place' (synthetic stage)", async () => {
    const { eq } = mockOrdersList([]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/orders?stage=placed", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // 'placed' is synthetic — derived from status, not logistics_stage.
    expect(eq).toHaveBeenCalledWith("status", "place");
  });

  it("filters by stage=proceed_request via logistics_stage column", async () => {
    const { eq } = mockOrdersList([]);
    const jwt = await makeJwt("logistics");
    await app.fetch(
      new Request("http://t/api/logistics/orders?stage=proceed_request", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("logistics_stage", "proceed_request");
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

  it("returns aggregated detail for an awaiting_logistics_action order", async () => {
    mockDetailQueries({
      order: {
        id: ORDER_ID, dl: 4001, status: "proceed_order", logistics_stage: "awaiting_logistics_action",
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
  const DO_PATH = `order-${ORDER_ID}/abc-DO-9801.pdf`;
  const VALID = {
    doNumber: "DO-9801",
    doNote: "Delivered to lobby",
    signed: true,
    doFilePath: DO_PATH,
  };

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
      p_do_file_path: DO_PATH,
    });
    assertRpcCallShape(rpc, "logistics_attach_do_and_deliver", [
      "p_order_id",
      "p_do_number",
      "p_do_note",
      "p_signed",
      "p_do_file_path",
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
        body: JSON.stringify({ ...VALID, signed: false }),
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
        body: JSON.stringify({ ...VALID, doNumber: "DO" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("rejects when doFilePath is missing (file required post-0087)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ doNumber: "DO-9801", signed: true }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
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
        body: JSON.stringify({ doNumber: "DO-9802", signed: true, doFilePath: DO_PATH }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("logistics_attach_do_and_deliver", {
      p_order_id: ORDER_ID,
      p_do_number: "DO-9802",
      p_do_note: null,
      p_signed: true,
      p_do_file_path: DO_PATH,
    });
    assertRpcCallShape(rpc, "logistics_attach_do_and_deliver", [
      "p_order_id",
      "p_do_number",
      "p_do_note",
      "p_signed",
      "p_do_file_path",
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
    assertRpcCallShape(rpc, "logistics_pick_warehouse", ["p_order_id"]);
    assertRpcCallShape(rpc, "logistics_calc_shortages", ["p_order_id", "p_warehouse_id"]);
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

describe("POST /api/logistics/orders/:id/confirm-proceed", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000c02";

  it("returns 200 on happy path with warehouseId (v3: warehouseId accepted by zod, ignored at RPC)", async () => {
    // Phase 4.5a T4: route now calls logistics_confirm_proceed_request_v3
    // (p_order_id only). The v2 p_warehouse_id arg is dropped — warehouse
    // selection moved into the RPC body via auto-skip-from-stock. The FE
    // may still pass `warehouseId` in the request body for backward compat,
    // but it's silently ignored at the RPC layer.
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        dl: 4001,
        logistics_stage: "awaiting_logistics_action",
        auto_skipped: false,
        po_id: null,
        threads: [],
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_confirm_proceed_request_v3", {
      p_order_id: ORDER_ID,
    });
    assertRpcCallShape(rpc, "logistics_confirm_proceed_request_v3", ["p_order_id"]);
  });

  it("returns 200 with empty body (v3: no warehouse arg forwarded)", async () => {
    // v3 contract: RPC receives only p_order_id. Warehouse choice is made
    // internally (auto-skip vs awaiting_logistics_action).
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        dl: 4001,
        logistics_stage: "awaiting_logistics_action",
        auto_skipped: false,
        po_id: null,
        threads: [],
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_confirm_proceed_request_v3", {
      p_order_id: ORDER_ID,
    });
    assertRpcCallShape(rpc, "logistics_confirm_proceed_request_v3", ["p_order_id"]);
  });

  it("returns 422 with code='wrong_stage' when called on non-proceed_request order", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "order is not in proceed_request stage", details: "wrong_stage" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("wrong_stage");
  });

  // Phase 4.5a T5 (2026-05-05): the stale `warehouse_required` test that
  // previously sat between the wrong_stage and insufficient_stock cases was
  // removed. After T4 swapped /confirm-proceed to v3 RPC
  // `logistics_confirm_proceed_request_v3` (single arg p_order_id), the
  // 22023 warehouse_required error path is no longer reachable from this
  // endpoint — the v3 RPC auto-picks an `own` warehouse internally and
  // never raises that condition.

  it("returns 422 with code='insufficient_stock_for_reserve' + hint passthrough", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "cannot reserve sku=MAT-K-001",
        details: "insufficient_stock_for_reserve",
        hint: "sku=MAT-K-001 warehouse_id=00000000-0000-0000-0000-000000000c02",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("insufficient_stock_for_reserve");
    expect(body.hint).toBe("sku=MAT-K-001 warehouse_id=00000000-0000-0000-0000-000000000c02");
  });

  it("returns 422 when warehouseId is not a uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: "not-a-uuid" }),
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
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
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

describe("POST /api/logistics/orders/:id/transfer-ready", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000c02";

  it("returns 200 on happy path with warehouseId", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, warehouse_id: WAREHOUSE_ID, logistics_stage: "ready_to_dispatch", shortages: 0 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/transfer-ready`, {
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

  it("returns 422 from zod when warehouseId is missing (empty body)", async () => {
    // Pipeline v2 reviewer fix: transfer-ready REQUIRES warehouseId. The
    // underlying RPC `logistics_warehouse_pick` raises 22023 `warehouse_required`
    // on NULL, so zod must reject empty bodies up-front rather than letting
    // the request reach Postgres. (confirm-proceed has a different RPC that
    // accepts NULL — do not conflate.)
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/transfer-ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("invalid_param");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 422 with code='wrong_stage' when not in proceed_request/awaiting_logistics_action", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "order not in proceed_request/awaiting_logistics_action state", details: "wrong_stage" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/transfer-ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("wrong_stage");
  });

  it("returns 422 with code='insufficient_stock_for_reserve' + hint passthrough", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "cannot reserve",
        details: "insufficient_stock_for_reserve",
        hint: "sku=BED-K-002 warehouse_id=00000000-0000-0000-0000-000000000c02",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/transfer-ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("insufficient_stock_for_reserve");
    expect(body.hint).toBe("sku=BED-K-002 warehouse_id=00000000-0000-0000-0000-000000000c02");
  });

  it("returns 403 for non-logistics role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/transfer-ready`, {
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

// =============================================================================
// Phase 4.5a T3 — confirm auto-skip-from-stock (v3 contract)
// =============================================================================
// These tests describe the v3 RPC response contract introduced by migration
// 0039. The migration extends `logistics_confirm_proceed_request_v3` so that
// when ALL freshly-created threads have sufficient buffer stock, the RPC
// atomically:
//   - reserves stock from stock_balances (UPDATE qty -= demand semantics
//     baked into the spec; we model it via increment of `reserved` to fit the
//     existing 0018 invariants and keep the receive-time decrement contract
//     intact)
//   - writes stock_movements rows tagged `note='reserve_from_buffer'` with
//     `ref=order_id` for audit
//   - promotes every thread directly to `ready_to_dispatch`
//   - returns `auto_skipped: true` and `po_id: null` (NO ghost PO — the buffer
//     came from real past PO receives whose stock_movements rows already
//     exist)
//
// These tests mock the SB rpc layer regardless of whether the route still
// calls v2 (current state) or v3 (post-T4 swap). The contract under test is
// the API surface: when the RPC returns the v3 auto-skip shape, the client
// must see it unchanged.
// =============================================================================
describe("Phase 4.5a confirm auto-skip-from-stock", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const SUPPLIER_NF = "00000000-0000-0000-0000-000000000b01";
  const SUPPLIER_HK = "00000000-0000-0000-0000-000000000b02";

  it("skips to ready_to_dispatch when all threads have sufficient stock (no ghost PO)", async () => {
    // Migration 0039 contract: when every thread can be served from buffer
    // stock, the RPC atomically reserves + promotes + returns auto_skipped.
    // No PO is created — `po_id` stays null. Audit trail is the
    // stock_movements row(s) the RPC wrote (ref=order_id, note='reserve_from_buffer').
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        dl: 4001,
        logistics_stage: "ready_to_dispatch",
        auto_skipped: true,
        po_id: null,
        threads: [
          {
            thread_id: "11111111-1111-1111-1111-111111111111",
            supplier_id: SUPPLIER_NF,
            category: "mattress",
            sop_name: "STANDARD",
            stage: "ready_to_dispatch",
            po_id: null,
          },
          {
            thread_id: "22222222-2222-2222-2222-222222222222",
            supplier_id: SUPPLIER_HK,
            category: "bedframe",
            sop_name: "STANDARD",
            stage: "ready_to_dispatch",
            po_id: null,
          },
        ],
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.auto_skipped).toBe(true);
    expect(body.order.po_id).toBeNull();
    expect(body.order.logistics_stage).toBe("ready_to_dispatch");
    // Every thread also lands at ready_to_dispatch with po_id=null.
    expect(body.order.threads).toHaveLength(2);
    for (const t of body.order.threads) {
      expect(t.stage).toBe("ready_to_dispatch");
      expect(t.po_id).toBeNull();
    }
    // Pin the v3 RPC name so T4's API callsite swap (orders.ts:471) is
    // caught by this test if it regresses to the v2 RPC.
    assertRpcCallShape(rpc, "logistics_confirm_proceed_request_v3", ["p_order_id"]);
  });

  it("stays at awaiting_logistics_action when any thread has shortage", async () => {
    // Migration 0039 contract: if even ONE thread would be short, the RPC
    // takes NO reserve action — every thread stays at awaiting_logistics_action.
    // auto_skipped is false, po_id is null (no PO was created at confirm time;
    // PO creation happens later via Auto-fill).
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        dl: 4001,
        logistics_stage: "awaiting_logistics_action",
        auto_skipped: false,
        po_id: null,
        threads: [
          {
            thread_id: "11111111-1111-1111-1111-111111111111",
            supplier_id: SUPPLIER_NF,
            category: "mattress",
            sop_name: "STANDARD",
            stage: "awaiting_logistics_action",
            po_id: null,
          },
        ],
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.auto_skipped).toBe(false);
    expect(body.order.po_id).toBeNull();
    expect(body.order.logistics_stage).toBe("awaiting_logistics_action");
    expect(body.order.threads[0].stage).toBe("awaiting_logistics_action");
    assertRpcCallShape(rpc, "logistics_confirm_proceed_request_v3", ["p_order_id"]);
  });

  it("does not auto-skip if even one thread has shortage (ALL-or-NONE atomicity)", async () => {
    // Migration 0039 explicit invariant: auto-skip is all-or-nothing. A
    // mixed-thread order where one supplier has stock and another doesn't
    // MUST land all threads at awaiting_logistics_action, never half-promoted.
    // This guards against partial reservations that would leak buffer stock
    // without a corresponding ready_to_dispatch promotion.
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        dl: 4002,
        logistics_stage: "awaiting_logistics_action",
        auto_skipped: false,
        po_id: null,
        threads: [
          // Thread A: supplier has the goods on hand at the buffer warehouse.
          {
            thread_id: "33333333-3333-3333-3333-333333333333",
            supplier_id: SUPPLIER_NF,
            category: "mattress",
            sop_name: "STANDARD",
            // Despite local sufficiency, atomicity rule keeps it awaiting.
            stage: "awaiting_logistics_action",
            po_id: null,
          },
          // Thread B: supplier short — drives the all-or-nothing decision.
          {
            thread_id: "44444444-4444-4444-4444-444444444444",
            supplier_id: SUPPLIER_HK,
            category: "sofa",
            sop_name: "SOFA_SPECIAL",
            stage: "awaiting_logistics_action",
            po_id: null,
          },
        ],
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.auto_skipped).toBe(false);
    // Critical: every thread stays at awaiting_logistics_action — no partial
    // promotions even when one supplier could have served from buffer.
    expect(body.order.threads).toHaveLength(2);
    for (const t of body.order.threads) {
      expect(t.stage).toBe("awaiting_logistics_action");
      expect(t.po_id).toBeNull();
    }
    assertRpcCallShape(rpc, "logistics_confirm_proceed_request_v3", ["p_order_id"]);
  });

  it("returns 409 on concurrent reserve race (40001 / serialization_failure)", async () => {
    // Migration 0039 wraps stock_balances reservations in SELECT ... FOR
    // UPDATE; if a concurrent confirm-proceed beats us to the same buffer,
    // the second caller raises SQLSTATE 40001. mapPgError (lib/route-helpers)
    // already maps 40001 → 409 with code='concurrent_claim'.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "40001",
        message: "concurrent_reserve: buffer stock claimed by another confirm",
        details: "concurrent_reserve",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(409);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    // mapPgError surfaces error.details as `code`; covers both
    // `concurrent_reserve` and (fallback) `concurrent_claim` shapes.
    expect(body.code).toBe("concurrent_reserve");
    assertRpcCallShape(rpc, "logistics_confirm_proceed_request_v3", ["p_order_id"]);
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

// 2026-05-12 (Loo) — revert RPCs added by migration 0095.
describe("POST /api/logistics/orders/:id/revert-proceed", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 on success and calls the right RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: ORDER_ID, dl: 1001, status: "place", logistics_stage: "placed" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/revert-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_revert_order_proceed_to_placed", {
      p_order_id: ORDER_ID,
    });
  });

  it("admits principal role too (Loo's de-facto admin)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: ORDER_ID, dl: 1001, status: "place", logistics_stage: "placed" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/revert-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalled();
  });

  it("returns 403 for dealer (not logistics or principal)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/revert-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 22023 wrong_stage → 422 invalid_param", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "Order is not in proceed_request stage",
        details: "wrong_stage",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/revert-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("wrong_stage");
  });
});

describe("POST /api/logistics/orders/:id/revert-dispatch", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 + threads_reverted on success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: ORDER_ID, dl: 1002, threads_reverted: 2 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/revert-dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("logistics_revert_order_dispatched_to_ready", {
      p_order_id: ORDER_ID,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.threads_reverted).toBe(2);
  });

  it("returns 403 for partner role", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("partner");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/revert-dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps RPC 22023 no_dispatched_threads → 422", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "22023",
        message: "No dispatched threads on this order",
        details: "no_dispatched_threads",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("logistics");
    const res = await app.fetch(
      new Request(`http://t/api/logistics/orders/${ORDER_ID}/revert-dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("no_dispatched_threads");
  });
});
