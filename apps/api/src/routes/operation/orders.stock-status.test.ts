/**
 * ⭐ SALES ORDER `Stock Status` — the list's fact and the Order Route's records
 * are ONE arithmetic (owner-approved scope 2026-10-05, Law D).
 *
 * One in-memory database answers both readers: `GET /register-facts` (the
 * batched list) and `GET /:id/route-goods` (the Route's own read, which the
 * browser arranges with the same shared `routeGoodsLinesOf`). Whatever the
 * list says about an order, the Route's records must say too.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { salesOrderStockOf, type RouteGoodsFacts } from "@carres/shared";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/purchase-demand-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/purchase-demand-read")>()),
  readFreeStock: vi.fn(async () => ({ stockWarehouse: null, freeStock: {}, stockQtyById: new Map(), freeUnitsByKey: new Map() })),
}));

import { userClient } from "../../lib/supabase";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const jwt = () =>
  signTestJwt("11111111-1111-1111-1111-000000000999", { email: "operation@carres.com", app_metadata: { role: "operation" } });

type Row = Record<string, unknown>;

/**
 * A tiny PostgREST: `eq` and `in` filter, `or` understands the Units read's
 * `and(status.eq.X,column.eq.Y)` groups, everything else passes through. A
 * table named in `fail` answers an error.
 */
function database(tables: Record<string, Row[]>, fail: string[] = []) {
  const reads: Array<{ table: string; filters: string[] }> = [];
  const from = vi.fn((table: string) => {
    let rows = [...(tables[table] ?? [])];
    const filters: string[] = [];
    reads.push({ table, filters });
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "not", "order", "range", "limit"]) chain[method] = vi.fn(() => chain);
    chain.eq = vi.fn((column: string, value: unknown) => {
      filters.push(`eq:${column}`);
      rows = rows.filter((row) => row[column] === value);
      return chain;
    });
    chain.in = vi.fn((column: string, values: unknown[]) => {
      filters.push(`in:${column}`);
      rows = rows.filter((row) => values.includes(row[column]));
      return chain;
    });
    chain.or = vi.fn((expression: string) => {
      const groups = [...expression.matchAll(/and\(status\.eq\.(\w+),(\w+)\.eq\.([^)]+)\)/g)];
      if (groups.length) rows = rows.filter((row) => groups.some(([, status, column, value]) => row.status === status && String(row[column!]) === value));
      return chain;
    });
    const answer = () => (fail.includes(table) ? { data: null, error: { code: "XX000", message: "boom" } } : { data: rows, error: null });
    chain.maybeSingle = vi.fn(() => Promise.resolve(fail.includes(table) ? answer() : { data: rows[0] ?? null, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => resolve(answer());
    return chain;
  });
  vi.mocked(userClient).mockReturnValue({ from } as never);
  return reads;
}

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";
const D = "00000000-0000-0000-0000-00000000000d";
const line = (order: string, id: string, sku = "B1201S", qty = 1) => ({ id, order_id: order, sku, qty, unit_price: 100 });
const order = (id: string, so: number, lines: Row[]) => ({
  id, so, status: "proceed_order", paid: 100, delivery_date: "2099-01-01",
  order_lines: lines, order_addons: [], ops_order_control: null,
});
const unit = (code: string, over: Row) => ({
  id: code, unit_code: code, sku: "B1201S", condition: "new", warehouse_id: null, po_no: null, qty: 1, date_in: null,
  sold_at: null, reserved_ref: null, sold_order_id: null, reserved_order_line_id: null, needs_repair: false,
  sale_cleared_at: null, po_line_id: null, ...over,
});

/** A and B share ONE PO line (A's share written first): 1 good and 1 damaged
 *  piece arrived. C holds a reserved Unit, and a damaged one; D has a service
 *  line only. */
const world = () => ({
  orders: [
    order(A, 1001, [line(A, "a1")]),
    order(B, 1002, [line(B, "b1")]),
    order(C, 1003, [line(C, "c1", "B1201S", 2)]),
    order(D, 1004, [line(D, "d1", "DELIVERY")]),
  ],
  order_lines: [line(A, "a1"), line(B, "b1"), line(C, "c1", "B1201S", 2), line(D, "d1", "DELIVERY")],
  po_line_sources: [
    { id: "s-b", order_id: B, order_line_id: "b1", po_id: "PO-1", po_line_id: "pl1", qty: 1, created_at: "2026-09-02T00:00:00Z" },
    { id: "s-a", order_id: A, order_line_id: "a1", po_id: "PO-1", po_line_id: "pl1", qty: 1, created_at: "2026-09-01T00:00:00Z" },
  ],
  purchase_orders: [{ id: "PO-1", status: "open", supplier_id: "s1", destination_id: "d1", placed_at: null, official_delivery_date: "2026-09-18", eta_date: null, version: 1 }],
  purchase_order_lines: [{ id: "pl1", po_id: "PO-1", sku: "B1201S", qty: 2, received_qty: 1, damaged_qty: 1, wrong_item_qty: 0 }],
  ops_stock_items: [
    unit("U1", { status: "reserved", reserved_ref: "SO-1003", reserved_order_line_id: "c1" }),
    unit("U2", { status: "reserved", reserved_ref: "SO-1003", reserved_order_line_id: "c1", condition: "damaged" }),
  ],
});

const get = async (path: string) =>
  app.fetch(new Request(`http://t/api/operation/orders${path}`, { headers: { Authorization: `Bearer ${await jwt()}` } }), env);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const listFacts = async (): Promise<any> => (await (await get("/register-facts")).json());

/** The browser's Route arrangement of `/route-goods`, as `sales-order-route-input.ts` makes it. */
const routeFact = async (orderId: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goods = (await (await get(`/${orderId}/route-goods`)).json()) as any;
  return salesOrderStockOf({
    ...(goods as Omit<RouteGoodsFacts, "todayIso">),
    todayIso: "2026-10-05",
    orderId,
    lines: goods.lines.map((l: { id: string; sku: string; qty: number }) => ({ ...l, label: l.sku, qty: Number(l.qty) })),
  });
};

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
});
afterAll(() => _setJwksForTesting(null));

describe("Stock Status on the Sales Orders list", () => {
  it("answers each order from the owners' records, batched, never per order", async () => {
    const reads = database(world());
    const body = await listFacts();
    expect(body.failed).toEqual({ obligations: false, cases: false, stock: false });
    expect(body.facts[A].stock).toMatchObject({ status: "awaiting_goods", arrivedUnallocatedQty: 1, issueQty: 0 });
    expect(body.facts[B].stock).toMatchObject({ status: "awaiting_goods", arrivedUnallocatedQty: 0, issueQty: 1 });
    expect(body.facts[C].stock).toMatchObject({ status: "partially_ready", usableQty: 1, issueQty: 1 });
    expect(body.facts[C].stock.lines).toEqual([expect.objectContaining({ lineId: "c1", status: "partially_ready" })]);
    expect(body.facts[D].stock).toMatchObject({ status: null, lines: [] });
    /* One lineage read by order, one by the shared PO lines: not one per order. */
    const lineage = reads.filter((r) => r.table === "po_line_sources");
    expect(lineage.map((r) => r.filters)).toEqual([["in:order_id"], ["in:po_line_id"]]);
  });

  it("⭐ the list and the Order Route agree for every order, a shared PO line included", async () => {
    database(world());
    const body = await listFacts();
    for (const id of [A, B, C]) {
      database(world());
      expect(await routeFact(id), id).toEqual(body.facts[id].stock);
    }
  });

  it("a failed read is no status: every order's stock is null and the list says so", async () => {
    database(world(), ["purchase_order_lines"]);
    const body = await listFacts();
    expect(body.failed).toEqual({ obligations: false, cases: false, stock: true });
    for (const id of [A, B, C, D]) expect(body.facts[id].stock).toBeNull();
    /* The other facts still answer. */
    expect(body.facts[A].obligations).not.toBeNull();
  });

  it("a Unit `Use this PO` bound while incoming is purchased cover, not ready goods", async () => {
    const data = world();
    data.ops_stock_items.push(unit("U9", { status: "incoming", reserved_ref: "SO-1004", reserved_order_line_id: "d2", po_line_id: "free-pl" }));
    data.orders[3] = order(D, 1004, [line(D, "d2")]);
    database(data);
    const body = await listFacts();
    expect(body.facts[D].stock).toMatchObject({ status: "awaiting_goods", purchasedQty: 1, usableQty: 0 });
  });
});

describe("the Route's own read brings the sibling shares of its PO lines", () => {
  it("reads this order's lineage, then every share of the same PO lines, in lineage order", async () => {
    const reads = database(world());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const goods = (await (await get(`/${B}/route-goods`)).json()) as any;
    expect(goods.sources.map((s: { id: string }) => s.id)).toEqual(["s-a", "s-b"]);
    expect(reads.filter((r) => r.table === "po_line_sources").map((r) => r.filters)).toEqual([["eq:order_id"], ["in:po_line_id"]]);
  });
});
