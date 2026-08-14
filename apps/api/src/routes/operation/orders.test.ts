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

describe("GET /api/operation/orders", () => {
  const ORDER_ROW = {
    id: "00000000-0000-0000-0000-000000000a01",
    so: 4001,
    status: "proceed_order",
    operation_stage: "in_production",
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

  it("returns orders for operation with default 'all' stage and 'all' channel", async () => {
    const { inFn, order, limit } = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: typeof ORDER_ROW[] };
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]?.so).toBe(4001);
    // Pipeline v2 (C3): status filter now includes 'place' so the kanban
    // can render the "Placed" column.
    expect(inFn).toHaveBeenCalledWith("status", ["place", "proceed_order", "delivered"]);
    expect(order).toHaveBeenCalledWith("placed_at", { ascending: false });
    // STAGE 1 FIX 1 — the 200-row trap removed; the agreed cap is 500.
    expect(limit).toHaveBeenCalledWith(500);
  });

  // ── D1 · the list carries the SKUs a real purchase order covers ───────────
  //
  // Before D1 the only PO evidence on the wire was `order_lines.source_po`, a
  // column ONLY the AutoCount importer writes, so the Orders ladder read every
  // NATIVE order as "nothing ordered". Measured on production 2026-08-06: 19 of
  // 28 live orders were covered by a real purchase order and 0 carried
  // `source_po`. The link is the DRAWER's own — `purchase_orders.so` or
  // `so_refs[]` — batched over the page rather than one query per order.
  describe("D1 — po_skus", () => {
    /** Three tables, three answers: orders · purchase_orders · lines. */
    function mockWithPos(
      orders: Record<string, unknown>[],
      pos: Record<string, unknown>[],
      poLines: Record<string, unknown>[],
    ) {
      const from = vi.fn((table: string) => {
        if (table === "purchase_orders") {
          const or = vi.fn().mockResolvedValue({ data: pos, error: null });
          return { select: vi.fn(() => ({ or })) };
        }
        if (table === "purchase_order_lines") {
          const inFn = vi.fn().mockResolvedValue({ data: poLines, error: null });
          return { select: vi.fn(() => ({ in: inFn })) };
        }
        const chain: Record<string, unknown> = {};
        for (const k of ["in", "eq", "ilike", "or", "not", "is", "order"])
          chain[k] = vi.fn(() => chain);
        chain.limit = vi.fn().mockResolvedValue({ data: orders, error: null });
        return { select: vi.fn(() => chain) };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(userClient).mockReturnValue({ from } as any);
      return from;
    }

    async function get() {
      const jwt = await makeJwt("operation");
      const res = await app.fetch(
        new Request("http://t/api/operation/orders", {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        env,
      );
      return (await res.json()) as {
        orders: { so: number; po_skus: string[]; po_numbers: string[] }[];
      };
    }

    it("a PO linked through so_refs[] puts its SKUs on the order", async () => {
      mockWithPos(
        [{ ...ORDER_ROW, so: 1206 }],
        [{ id: "PO-2049", so: null, so_refs: [1206] }],
        [{ po_id: "PO-2049", sku: "mattress:MAT-1" }],
      );
      const body = await get();
      expect(body.orders[0]?.po_skus).toEqual(["mattress:MAT-1"]);
      expect(body.orders[0]?.po_numbers).toEqual(["PO-2049"]);
    });

    it("a PO linked through its own so also counts", async () => {
      mockWithPos(
        [{ ...ORDER_ROW, so: 1206 }],
        [{ id: "PO-1", so: 1206, so_refs: null }],
        [{ po_id: "PO-1", sku: "sofa:SOF-1" }],
      );
      expect((await get()).orders[0]?.po_skus).toEqual(["sofa:SOF-1"]);
    });

    it("ONE consolidated PO serves EVERY sales order it names", async () => {
      mockWithPos(
        [
          { ...ORDER_ROW, id: "a", so: 1206 },
          { ...ORDER_ROW, id: "b", so: 1213 },
        ],
        [{ id: "PO-9", so: null, so_refs: [1206, 1213] }],
        [{ po_id: "PO-9", sku: "mattress:MAT-1" }],
      );
      const body = await get();
      expect(body.orders[0]?.po_skus).toEqual(["mattress:MAT-1"]);
      expect(body.orders[1]?.po_skus).toEqual(["mattress:MAT-1"]);
      expect(body.orders[0]?.po_numbers).toEqual(["PO-9"]);
      expect(body.orders[1]?.po_numbers).toEqual(["PO-9"]);
    });

    it("an order NO purchase order names gets an empty list, never another order's SKUs", async () => {
      mockWithPos(
        [
          { ...ORDER_ROW, id: "a", so: 1206 },
          { ...ORDER_ROW, id: "b", so: 9999 },
        ],
        [{ id: "PO-9", so: null, so_refs: [1206] }],
        [{ po_id: "PO-9", sku: "mattress:MAT-1" }],
      );
      const body = await get();
      expect(body.orders[1]?.po_skus).toEqual([]);
      expect(body.orders[1]?.po_numbers).toEqual([]);
    });

    it("a PO with no lines contributes nothing", async () => {
      mockWithPos(
        [{ ...ORDER_ROW, so: 1206 }],
        [{ id: "PO-EMPTY", so: null, so_refs: [1206] }],
        [],
      );
      expect((await get()).orders[0]?.po_skus).toEqual([]);
    });

    it("ONE batched query for the whole page — never one per order", async () => {
      const from = mockWithPos(
        [
          { ...ORDER_ROW, id: "a", so: 1206 },
          { ...ORDER_ROW, id: "b", so: 1213 },
          { ...ORDER_ROW, id: "c", so: 1216 },
        ],
        [{ id: "PO-9", so: null, so_refs: [1206] }],
        [{ po_id: "PO-9", sku: "mattress:MAT-1" }],
      );
      await get();
      const poCalls = from.mock.calls.filter((c) => c[0] === "purchase_orders");
      const lineCalls = from.mock.calls.filter(
        (c) => c[0] === "purchase_order_lines",
      );
      expect(poCalls).toHaveLength(1);
      expect(lineCalls).toHaveLength(1);
    });
  });

  it("returns status='place' rows in the response (pipeline v2 'Placed' column)", async () => {
    const PLACE_ROW = {
      ...ORDER_ROW,
      id: "00000000-0000-0000-0000-000000000a02",
      so: 4002,
      status: "place",
      operation_stage: null,
      warehouse_id: null,
    };
    // PLACE_ROW has nulls for operation_stage + warehouse_id (real shape for
     // status='place' rows); the helper's `typeof ORDER_ROW` is over-narrow.
     mockOrdersList([PLACE_ROW as unknown as typeof ORDER_ROW]);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders", {
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
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/orders?stage=placed", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    // 'placed' is synthetic — derived from status, not operation_stage.
    expect(eq).toHaveBeenCalledWith("status", "place");
  });

  it("filters by stage=confirmed via operation_stage column", async () => {
    const { eq } = mockOrdersList([]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/orders?stage=confirmed", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("operation_stage", "confirmed");
  });

  it("filters by stage when query param provided", async () => {
    const { eq } = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/orders?stage=ready_to_dispatch", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(eq).toHaveBeenCalledWith("operation_stage", "ready_to_dispatch");
  });

  it("filters by channel=dealers excludes showroom orders (outlet_id IS NULL)", async () => {
    const m = mockOrdersList([ORDER_ROW]);
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/orders?channel=dealers", {
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
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request("http://t/api/operation/orders?channel=showrooms", {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders?stage=bogus", {
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
      new Request("http://t/api/operation/orders", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 401 without Authorization header", async () => {
    const res = await app.fetch(new Request("http://t/api/operation/orders"), env);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/operation/orders/:id", () => {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(404);
  });

  it("returns aggregated detail for an in_production order", async () => {
    mockDetailQueries({
      order: {
        id: ORDER_ID, so: 4001, status: "proceed_order", operation_stage: "in_production",
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
      pos: [{ id: "PO-2030", supplier_id: "00000000-0000-0000-0000-000000000s01", warehouse_id: "00000000-0000-0000-0000-000000000w01", status: "open", sup_status: "pending", so: 4001, so_refs: null }],
      poLines: [{ po_id: "PO-2030", sku: "MAT-K-001", qty: 2, received_qty: 0 }],
      warehouse: { id: "00000000-0000-0000-0000-000000000w01", name: "KL HQ", address: "..." },
      stockBalances: [
        { sku: "MAT-K-001", warehouse_id: "00000000-0000-0000-0000-000000000w01", qty: 0, reserved: 0 },
        { sku: "BED-K-002", warehouse_id: "00000000-0000-0000-0000-000000000w01", qty: 5, reserved: 0 },
      ],
    });

    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.so).toBe(4001);
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
      new Request(`http://t/api/operation/orders/${ORDER_ID}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("POST /api/operation/orders/:id/assign-partner", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000b01";

  it("returns 200 on successful RPC call", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, dispatched_at: "2026-05-03T11:00:00Z" }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
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
    expect(rpc).toHaveBeenCalledWith("operation_assign_partner", {
      p_order_id: ORDER_ID,
      p_partner_id: PARTNER_ID,
    });
    assertRpcCallShape(rpc, "operation_assign_partner", ["p_order_id", "p_partner_id"]);
  });

  it("returns 422 when partnerId is not a uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/assign-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/assign-partner`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/assign-partner`, {
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
  });

  it("returns 403 for non-operation role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/assign-partner`, {
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

describe("POST /api/operation/orders/:id/attach-do", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const DO_PATH = `order-${ORDER_ID}/abc-DO-9801.pdf`;
  const SIG_PATH = `order-${ORDER_ID}/abc-signature.png`;
  const VALID = {
    doNumber: "DO-9801",
    doNote: "Delivered to lobby",
    signed: true,
    doFilePath: DO_PATH,
    signaturePath: SIG_PATH,
    signerName: "Mr Tan",
  };

  it("returns 200 on success and calls RPC with snake_case args", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, delivered_at: "2026-05-03T11:00:00Z" }, error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify(VALID),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_attach_do_and_deliver", {
      p_order_id: ORDER_ID,
      p_do_number: "DO-9801",
      p_do_note: "Delivered to lobby",
      p_signed: true,
      p_do_file_path: DO_PATH,
      p_signature_url: SIG_PATH,
      p_signed_by: "Mr Tan",
    });
    assertRpcCallShape(rpc, "operation_attach_do_and_deliver", [
      "p_order_id",
      "p_do_number",
      "p_do_note",
      "p_signed",
      "p_do_file_path",
      "p_signature_url",
      "p_signed_by",
    ]);
  });

  it("rejects when signed is false", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/attach-do`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/attach-do`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/attach-do`, {
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
    const jwt = await makeJwt("operation");
    await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/attach-do`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          doNumber: "DO-9802",
          signed: true,
          doFilePath: DO_PATH,
          signaturePath: SIG_PATH,
          signerName: "Mr Tan",
        }),
      }),
      env,
    );
    expect(rpc).toHaveBeenCalledWith("operation_attach_do_and_deliver", {
      p_order_id: ORDER_ID,
      p_do_number: "DO-9802",
      p_do_note: null,
      p_signed: true,
      p_do_file_path: DO_PATH,
      p_signature_url: SIG_PATH,
      p_signed_by: "Mr Tan",
    });
    assertRpcCallShape(rpc, "operation_attach_do_and_deliver", [
      "p_order_id",
      "p_do_number",
      "p_do_note",
      "p_signed",
      "p_do_file_path",
      "p_signature_url",
      "p_signed_by",
    ]);
  });

  it("maps P0001 do_required → 422 with code", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "DO required", details: "do_required" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/attach-do`, {
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

  it("returns 403 for non-operation role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/attach-do`, {
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

describe("POST /api/operation/orders/:id/abandon", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 on success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: ORDER_ID, status: "cancelled" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer requested cancel" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_abandon_order", {
      p_order_id: ORDER_ID,
      p_reason: "Customer requested cancel",
    });
    assertRpcCallShape(rpc, "operation_abandon_order", ["p_order_id", "p_reason"]);
  });

  it("returns 422 when reason is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/abandon`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/abandon`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "test" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-operation (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/abandon`, {
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

describe("POST /api/operation/orders/:id/warehouse", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000c02";

  it("returns 200 on success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: ORDER_ID, warehouse_id: WAREHOUSE_ID, operation_stage: "ready_to_dispatch" }, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/warehouse`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_warehouse_pick", {
      p_order_id: ORDER_ID,
      p_warehouse_id: WAREHOUSE_ID,
    });
    assertRpcCallShape(rpc, "operation_warehouse_pick", ["p_order_id", "p_warehouse_id"]);
  });

  it("returns 422 when warehouseId is not uuid", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc: vi.fn() } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/warehouse`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/warehouse`, {
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

  it("returns 403 for non-operation (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/warehouse`, {
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

describe("POST /api/operation/orders/:id/recheck-stock", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WH_ID = "00000000-0000-0000-0000-000000000c01";

  it("returns 200 with shortages list", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: WH_ID, error: null })
      .mockResolvedValueOnce({ data: [{ sku: "MAT-K-001", qty: 2, missing: 2 }], error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/recheck-stock`, {
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
    expect(rpc).toHaveBeenNthCalledWith(1, "operation_pick_warehouse", { p_order_id: ORDER_ID });
    expect(rpc).toHaveBeenNthCalledWith(2, "operation_calc_shortages", { p_order_id: ORDER_ID, p_warehouse_id: WH_ID });
    assertRpcCallShape(rpc, "operation_pick_warehouse", ["p_order_id"]);
    assertRpcCallShape(rpc, "operation_calc_shortages", ["p_order_id", "p_warehouse_id"]);
  });

  it("returns warehouseId=null and empty shortages when no warehouse pickable", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/recheck-stock`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/recheck-stock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ unexpected: "key" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for non-operation (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/recheck-stock`, {
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

describe("POST /api/operation/orders/:id/confirm-proceed (migration 0147 — item h)", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000b01";

  it("returns 200 and forwards both p_order_id + p_delivery_partner_id to v3 RPC", async () => {
    // Migration 0147 swap: v3 RPC now requires the LP at Accept Proceed. Body
    // shape: { deliveryPartnerId } (warehouseId vestige dropped).
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        so: 4001,
        operation_stage: "in_production",
        auto_skipped: false,
        po_id: null,
        threads: [],
        delivery_partner_id: PARTNER_ID,
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_confirm_proceed_request_v3", {
      p_order_id: ORDER_ID,
      p_delivery_partner_id: PARTNER_ID,
    });
    assertRpcCallShape(rpc, "operation_confirm_proceed_request_v3", [
      "p_order_id",
      "p_delivery_partner_id",
    ]);
  });

  it("returns 422 with empty body (deliveryPartnerId is now required)", async () => {
    // Migration 0147: zod schema requires deliveryPartnerId. Empty body never
    // reaches the RPC layer.
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 422 when deliveryPartnerId is not a uuid", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: "not-a-uuid" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 422 with code='wrong_stage' when called on non-confirmed order", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "order is not in confirmed stage", details: "wrong_stage" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("wrong_stage");
  });

  it("returns 422 with code='partner_not_found' when LP uuid is unknown (defence in depth)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "delivery partner not found",
        details: "partner_not_found",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    // mapPipelineV2Error wraps generic P0001 in mapPgError (no special branch),
    // so the response code surfaces from the generic mapping.
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("insufficient_stock_for_reserve");
    expect(body.hint).toBe("sku=MAT-K-001 warehouse_id=00000000-0000-0000-0000-000000000c02");
  });

  it("returns 403 for non-operation role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/operation/orders/:id/reselect-partner (migration 0147 — item h)", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const PARTNER_ID = "00000000-0000-0000-0000-000000000b02";

  it("returns 200 and forwards p_order_id + p_partner_id", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        so: 4001,
        delivery_partner_id: PARTNER_ID,
        request_for_delivery_at: new Date().toISOString(),
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/reselect-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_reselect_partner", {
      p_order_id: ORDER_ID,
      p_partner_id: PARTNER_ID,
    });
  });

  it("returns 422 with code='not_rejected' when order has no active reject", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "order is not in rejected state", details: "not_rejected" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/reselect-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("not_rejected");
  });

  it("returns 422 with code='same_partner' when reselecting the LP that just rejected", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "cannot reselect the same partner", details: "same_partner" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/reselect-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.code).toBe("same_partner");
  });

  it("returns 422 when partnerId is not a uuid", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/reselect-partner`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ partnerId: "nope" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 403 for non-operation role", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/reselect-partner`, {
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

describe("POST /api/operation/orders/:id/transfer-ready", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
  const WAREHOUSE_ID = "00000000-0000-0000-0000-000000000c02";

  it("returns 200 on happy path with warehouseId", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: ORDER_ID, warehouse_id: WAREHOUSE_ID, operation_stage: "ready_to_dispatch", shortages: 0 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/transfer-ready`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: WAREHOUSE_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_warehouse_pick", {
      p_order_id: ORDER_ID,
      p_warehouse_id: WAREHOUSE_ID,
    });
    assertRpcCallShape(rpc, "operation_warehouse_pick", ["p_order_id", "p_warehouse_id"]);
  });

  it("returns 422 from zod when warehouseId is missing (empty body)", async () => {
    // Pipeline v2 reviewer fix: transfer-ready REQUIRES warehouseId. The
    // underlying RPC `operation_warehouse_pick` raises 22023 `warehouse_required`
    // on NULL, so zod must reject empty bodies up-front rather than letting
    // the request reach Postgres. (confirm-proceed has a different RPC that
    // accepts NULL — do not conflate.)
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/transfer-ready`, {
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

  it("returns 422 with code='wrong_stage' when not in confirmed/in_production", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "order not in confirmed/in_production state", details: "wrong_stage" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/transfer-ready`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/transfer-ready`, {
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

  it("returns 403 for non-operation role (no rpc call)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("finance");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/transfer-ready`, {
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
// 0039. The migration extends `operation_confirm_proceed_request_v3` so that
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
  // Migration 0147 (item h): every confirm-proceed call now requires a
  // delivery_partner uuid in the body. Tests below pass this fixture.
  const PARTNER_ID = "00000000-0000-0000-0000-000000000b09";

  it("skips to ready_to_dispatch when all threads have sufficient stock (no ghost PO)", async () => {
    // Migration 0039 contract: when every thread can be served from buffer
    // stock, the RPC atomically reserves + promotes + returns auto_skipped.
    // No PO is created — `po_id` stays null. Audit trail is the
    // stock_movements row(s) the RPC wrote (ref=order_id, note='reserve_from_buffer').
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        so: 4001,
        operation_stage: "ready_to_dispatch",
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.auto_skipped).toBe(true);
    expect(body.order.po_id).toBeNull();
    expect(body.order.operation_stage).toBe("ready_to_dispatch");
    // Every thread also lands at ready_to_dispatch with po_id=null.
    expect(body.order.threads).toHaveLength(2);
    for (const t of body.order.threads) {
      expect(t.stage).toBe("ready_to_dispatch");
      expect(t.po_id).toBeNull();
    }
    // Pin the v3 RPC name so T4's API callsite swap (orders.ts:471) is
    // caught by this test if it regresses to the v2 RPC.
    assertRpcCallShape(rpc, "operation_confirm_proceed_request_v3", [
      "p_order_id",
      "p_delivery_partner_id",
    ]);
  });

  it("stays at in_production when any thread has shortage", async () => {
    // Migration 0039 contract: if even ONE thread would be short, the RPC
    // takes NO reserve action — every thread stays at in_production.
    // auto_skipped is false, po_id is null (no PO was created at confirm time;
    // PO creation happens later via Auto-fill).
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        so: 4001,
        operation_stage: "in_production",
        auto_skipped: false,
        po_id: null,
        threads: [
          {
            thread_id: "11111111-1111-1111-1111-111111111111",
            supplier_id: SUPPLIER_NF,
            category: "mattress",
            sop_name: "STANDARD",
            stage: "in_production",
            po_id: null,
          },
        ],
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.auto_skipped).toBe(false);
    expect(body.order.po_id).toBeNull();
    expect(body.order.operation_stage).toBe("in_production");
    expect(body.order.threads[0].stage).toBe("in_production");
    assertRpcCallShape(rpc, "operation_confirm_proceed_request_v3", [
      "p_order_id",
      "p_delivery_partner_id",
    ]);
  });

  it("does not auto-skip if even one thread has shortage (ALL-or-NONE atomicity)", async () => {
    // Migration 0039 explicit invariant: auto-skip is all-or-nothing. A
    // mixed-thread order where one supplier has stock and another doesn't
    // MUST land all threads at in_production, never half-promoted.
    // This guards against partial reservations that would leak buffer stock
    // without a corresponding ready_to_dispatch promotion.
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        so: 4002,
        operation_stage: "in_production",
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
            stage: "in_production",
            po_id: null,
          },
          // Thread B: supplier short — drives the all-or-nothing decision.
          {
            thread_id: "44444444-4444-4444-4444-444444444444",
            supplier_id: SUPPLIER_HK,
            category: "sofa",
            sop_name: "SOFA_SPECIAL",
            stage: "in_production",
            po_id: null,
          },
        ],
      },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.order.auto_skipped).toBe(false);
    // Critical: every thread stays at in_production — no partial
    // promotions even when one supplier could have served from buffer.
    expect(body.order.threads).toHaveLength(2);
    for (const t of body.order.threads) {
      expect(t.stage).toBe("in_production");
      expect(t.po_id).toBeNull();
    }
    assertRpcCallShape(rpc, "operation_confirm_proceed_request_v3", [
      "p_order_id",
      "p_delivery_partner_id",
    ]);
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/confirm-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: PARTNER_ID }),
      }),
      env,
    );
    expect(res.status).toBe(409);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    // mapPgError surfaces error.details as `code`; covers both
    // `concurrent_reserve` and (fallback) `concurrent_claim` shapes.
    expect(body.code).toBe("concurrent_reserve");
    assertRpcCallShape(rpc, "operation_confirm_proceed_request_v3", [
      "p_order_id",
      "p_delivery_partner_id",
    ]);
  });
});

describe("retired POST /api/operation/orders/:id/issue-pos", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("is unreachable and never calls a PO creation RPC", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/issue-pos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// 2026-05-12 (Loo) — revert RPCs added by migration 0095.
describe("POST /api/operation/orders/:id/revert-proceed", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 on success and calls the right RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: ORDER_ID, so: 1001, status: "place", operation_stage: "placed" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/revert-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_revert_order_proceed_to_placed", {
      p_order_id: ORDER_ID,
    });
  });

  it("admits principal role too (Loo's de-facto admin)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: ORDER_ID, so: 1001, status: "place", operation_stage: "placed" },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/revert-proceed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalled();
  });

  it("returns 403 for dealer (not operation or principal)", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("dealer");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/revert-proceed`, {
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
        message: "Order is not in confirmed stage",
        details: "wrong_stage",
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/revert-proceed`, {
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

describe("POST /api/operation/orders/:id/revert-dispatch", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns 200 + threads_reverted on success", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: ORDER_ID, so: 1002, threads_reverted: 2 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/revert-dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("operation_revert_order_dispatched_to_ready", {
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
      new Request(`http://t/api/operation/orders/${ORDER_ID}/revert-dispatch`, {
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
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/revert-dispatch`, {
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

/**
 * STAGE 2 · THE REVISION ENGINE — the API is a THIN door: validation + ONE
 * RPC. The property held hardest: **no route here writes orders or
 * order_lines directly** — every write goes through the 0327 RPCs, which own
 * Rev-1 minting and immutability.
 */
describe("POST /api/operation/orders/:id/save", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000b01";

  it("saves only safe correction fields and writes nothing directly", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { revision: 2, changed: ["customer_phone", "proceed_date"] },
      error: null,
    });
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          header: { customer_phone: "012-3456789", proceed_date: "2026-09-05" },
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("sales_order_save_revision", {
      p_order_id: ORDER_ID,
      p_header: { customer_phone: "012-3456789", proceed_date: "2026-09-05" },
      p_lines: null,
      p_change: null,
    });
    /* NOTHING was written directly — the RPC owns every write. */
    expect(from).not.toHaveBeenCalled();
    assertRpcCallShape(rpc, "sales_order_save_revision", [
      "p_order_id",
      "p_header",
      "p_lines",
      "p_change",
    ]);
  });

  it("refuses contractual items at the API boundary", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          header: { customer_phone: "012-3456789" },
          lines: [{ sku: "MODEL-B", qty: 1, unit_price: 2799 }],
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses the promised date at the API boundary", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          header: { delivery_date: "2026-09-05" },
        }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an empty save without calling the database", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC's own refusal (22023 detail) instead of a bare 500", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "22023", message: "Nothing changed", details: "invalid_param" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ header: { customer_phone: "012-3456789" } }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.message).toBe("Nothing changed");
  });
});

describe("Sales Order amendment decision lane", () => {
  const AMENDMENT_ID = "00000000-0000-0000-0000-000000000a01";

  it("returns the owner impact preview without writing another module", async () => {
    const impact = {
      amendment_id: AMENDMENT_ID,
      stale: false,
      findings: [{ owner: "Purchasing", kind: "purchase_order", count: 1, blocks: false }],
    };
    const rpc = vi.fn().mockResolvedValue({ data: impact, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/amendment/${AMENDMENT_ID}/impact`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(impact);
    expect(rpc).toHaveBeenCalledWith("sales_order_amendment_impact", {
      p_amendment_id: AMENDMENT_ID,
    });
  });

  it("previews what cancelling would raise, and writes nothing", async () => {
    const ORDER_ID = "00000000-0000-0000-0000-0000000000c1";
    const impact = {
      order_id: ORDER_ID,
      so: 1303,
      status: "place",
      cancellable: true,
      refusal: null,
      goods_total: 2499,
      paid: 1250,
      findings: [{ owner: "Purchasing", kind: "purchase_order", count: 1, blocks: false }],
    };
    const rpc = vi.fn().mockResolvedValue({ data: impact, error: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/cancel-impact`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(impact);
    /* ONE call, and it is the read. The preview never reaches a writer — the
     * act stays on the single existing cancel door. */
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("sales_order_cancel_impact", { p_order_id: ORDER_ID });
  });

  it("approves through one atomic decision RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: AMENDMENT_ID, status: "applied", revision: 5 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/amendment/${AMENDMENT_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve", note: "Customer confirmed in writing" }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: AMENDMENT_ID, status: "applied", revision: 5 });
    expect(rpc).toHaveBeenCalledWith("sales_order_decide_amendment", {
      p_amendment_id: AMENDMENT_ID,
      p_decision: "approve",
      p_note: "Customer confirmed in writing",
    });
  });

  it("requires a reason when management rejects", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("principal");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/amendment/${AMENDMENT_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "reject" }),
      }),
      env,
    );
    expect(res.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not expose the decision door to operation", async () => {
    const rpc = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/amendment/${AMENDMENT_ID}/decide`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve", note: "Customer confirmed" }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/operation/orders (create)", () => {
  it("calls sales_order_create; a missing dealer is refused before the database", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "00000000-0000-0000-0000-000000000b02", so: 1400, revision: 1 },
      error: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc } as any);
    const jwt = await makeJwt("operation");
    const good = await app.fetch(
      new Request("http://t/api/operation/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          header: {
            customer_name: "Walk-in",
            dealer_id: "00000000-0000-0000-0000-0000000000d1",
            // orders_salesperson_required (0296) — the door demands it too.
            salesperson_id: "00000000-0000-0000-0000-0000000000a1",
          },
          lines: [{ sku: "B1201S-K", qty: 1, unit_price: 2499 }],
        }),
      }),
      env,
    );
    expect(good.status).toBe(201);
    assertRpcCallShape(rpc, "sales_order_create", ["p_header", "p_lines"]);

    rpc.mockClear();
    const bad = await app.fetch(
      new Request("http://t/api/operation/orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          header: { customer_name: "Walk-in" },
          lines: [{ sku: "B1201S-K", qty: 1, unit_price: 2499 }],
        }),
      }),
      env,
    );
    expect(bad.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

/**
 * CARD 1 — CUSTOMER OBLIGATION TRUTH. The route is a thin door: ONE definer
 * read (sales_order_commitment_bundle, 0340) + the shared resolver. The
 * resolver itself is proven case-by-case in
 * packages/shared/src/sales-order-commitment.test.ts (CASES 1–7); here we
 * prove the wiring and that the answer carries lineage + cause.
 */
describe("GET /api/operation/orders/:id/commitment", () => {
  const ORDER_ID = "00000000-0000-0000-0000-000000000b01";
  const SNAP = (sku: string) => ({
    header: { customer_name: "Tan Ah Kow", delivery_date: "2026-09-01", delivery_date_tbd: false },
    lines: [{ id: "00000000-0000-0000-0000-0000000000l1", sku, qty: 1, unit_price: 2499 }],
    addons: [],
  });

  it("answers current commitment + lineage from the bundle RPC alone", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order_id: ORDER_ID,
        current: SNAP("MODEL-A"),
        revisions: [
          { revision: 1, created_at: "2026-08-01", created_by: "u1", change_type: null, note: null, snapshot: SNAP("MODEL-B") },
          { revision: 2, created_at: "2026-08-02", created_by: "u2", change_type: "staff_correction", note: null, snapshot: SNAP("MODEL-A") },
        ],
        requests: [],
      },
      error: null,
    });
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request(`http://t/api/operation/orders/${ORDER_ID}/commitment`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("sales_order_commitment_bundle", { p_order_id: ORDER_ID });
    /* The door read NOTHING else — no PO, no units, no drawer stages. */
    expect(from).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.commitment.lines[0].sku).toBe("MODEL-A");
    expect(body.commitment.lineage[1].changeType).toBe("staff_correction");
    expect(body.commitment.lineage[1].changes.length).toBeGreaterThan(0);
  });
});

describe("GET /api/operation/orders/:id/expansion", () => {
  it("projects Stock Unit IDs and Purchasing line destinations without a Sales Order destination field", async () => {
    const ORDER_ID = "00000000-0000-0000-0000-000000000a01";
    const rows: Record<string, unknown> = {
      orders: { so: 1303 },
      order_lines: [{ id: "line-1", sku: "B1201S-K", qty: 11 }],
      order_supplier_threads: [{ order_line_id: "line-1", po_id: "PO-2032" }],
      purchasing_destinations: [
        { id: "klang", name: "Carres Klang", is_default: true },
        { id: "al", name: "AL Sungai Buloh", is_default: false },
      ],
      purchase_orders: [{ id: "PO-2032", destination_id: "klang" }],
      purchase_order_lines: [
        { po_id: "PO-2032", sku: "B1201S-K", qty: 10, destination_id: null },
        { po_id: "PO-2032", sku: "B1201S-K", qty: 1, destination_id: "al" },
      ],
      ops_stock_items: [
        { unit_code: "id-001", sku: "B1201S-K" },
        { unit_code: "id-002", sku: "B1201S-K" },
      ],
    };
    const from = vi.fn((table: string) => {
      const data = rows[table];
      const chain: Record<string, unknown> = {};
      for (const method of ["eq", "in", "or"]) chain[method] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
      chain.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null });
      return { select: vi.fn(() => chain) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(new Request(`http://t/api/operation/orders/${ORDER_ID}/expansion`, {
      headers: { Authorization: `Bearer ${jwt}` },
    }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      defaultDeliverTo: "Carres Klang",
      lines: [{
        lineId: "line-1",
        sku: "B1201S-K",
        unitIds: ["id-001", "id-002"],
        deliverTo: [
          { name: "Carres Klang", qty: 10 },
          { name: "AL Sungai Buloh", qty: 1 },
        ],
      }],
    });
  });
});

describe("GET /api/operation/orders/:id/revisions", () => {
  it("reads the immutable store oldest-first", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ revision: 1, snapshot: { header: {}, lines: [], addons: [] }, created_at: "2026-08-09", created_by: null }],
      error: null,
    });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/00000000-0000-0000-0000-000000000b01/revisions", {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(from).toHaveBeenCalledWith("sales_order_revisions");
    expect(order).toHaveBeenCalledWith("revision", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.revisions).toHaveLength(1);
  });
});

/**
 * 3.2 · the consequence-floor endpoint is a THIN read-only door: one RPC,
 * no writes, findings passed through verbatim.
 */
describe("POST /api/operation/orders/:id/floors", () => {
  it("calls sales_order_floors and writes nothing", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { order_id: "x", so: 1308, findings: [] },
      error: null,
    });
    const from = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(userClient).mockReturnValue({ rpc, from } as any);
    const jwt = await makeJwt("operation");
    const res = await app.fetch(
      new Request("http://t/api/operation/orders/00000000-0000-0000-0000-000000000c01/floors", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: ["order_lines"], proposedLines: [{ sku: "A", qty: 0 }] }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("sales_order_floors", {
      p_order_id: "00000000-0000-0000-0000-000000000c01",
      p_changed: ["order_lines"],
      p_proposed_lines: [{ sku: "A", qty: 0 }],
    });
    expect(from).not.toHaveBeenCalled();
  });
});
