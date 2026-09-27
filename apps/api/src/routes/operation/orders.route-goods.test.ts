import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/purchase-demand-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/purchase-demand-read")>()),
  readFreeStock: vi.fn(),
}));

import { userClient } from "../../lib/supabase";
import { readFreeStock } from "../../lib/purchase-demand-read";

const env = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  SUPABASE_JWT_SECRET: "unused",
};
const ORDER = "00000000-0000-0000-0000-0000000000a1";

const jwt = (role: string) =>
  signTestJwt("11111111-1111-1111-1111-000000000999", { email: `${role}@carres.com`, app_metadata: { role } });

/** Every table answers with its rows; a table named in `fail` answers an error. */
function mockSb(rows: Record<string, unknown>, fail: string[] = []) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "or", "not", "order"]) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      });
    }
    const answer = () =>
      fail.includes(table)
        ? { data: null, error: { code: "XX000", message: "boom" } }
        : { data: table in rows ? rows[table] : [], error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(answer()));
    chain.then = (resolve: (v: unknown) => unknown) => resolve(answer());
    return chain;
  });
  vi.mocked(userClient).mockReturnValue({ from } as never);
  return { from, calls };
}

const read = async (role = "operation") =>
  app.fetch(
    new Request(`http://t/api/operation/orders/${ORDER}/route-goods`, {
      headers: { Authorization: `Bearer ${await jwt(role)}` },
    }),
    env,
  );

const rows = {
  orders: { so: 1319 },
  order_lines: [
    { id: "L1", sku: "B1201S", qty: 1 },
    { id: "L2", sku: "DELIVERY", qty: 1 },
  ],
  po_line_sources: [{ order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 1 }],
  purchase_orders: [
    { id: "PO-1", status: "open", supplier_id: "s1", destination_id: "d1", placed_at: "2026-09-03T03:00:00Z", official_delivery_date: "2026-09-18", eta_date: "2026-09-18", version: 2 },
  ],
  purchase_order_lines: [{ id: "pl1", po_id: "PO-1", sku: "B1201S", qty: 1, received_qty: 0, damaged_qty: 0, wrong_item_qty: 0 }],
  po_supplier_promises: [{ id: "p1", po_id: "PO-1", po_line_id: "pl1", kind: "tomorrow_delivery", new_date: "2026-09-28", recorded_at: "2026-09-10T00:00:00Z" }],
  po_arrival_confirmations: [{ po_id: "PO-1", po_version: 2, for_date: "2026-09-28", destination_id: "d1" }],
  warehouse_receipts: [
    { id: "r1", po_id: "PO-1", grn_no: "GRN2609-0040", goods_received_at: "2026-09-18", status: "posted", lines: [{ id: "pl1", received_now: 1 }] },
  ],
  ops_stock_items: [{ unit_code: "U1-000-231", status: "reserved", reserved_order_line_id: "L1", sku: "B1201S" }],
};

beforeEach(() => {
  useTestJwks();
  vi.mocked(userClient).mockReset();
  vi.mocked(readFreeStock).mockReset();
  vi.mocked(readFreeStock).mockResolvedValue({
    stockWarehouse: null,
    freeStock: {},
    stockQtyById: new Map(),
    freeUnitsByKey: new Map([
      ["b1201s", [
        { identityScope: "unit" }, { identityScope: "unit" }, { identityScope: "quantity" },
      ]],
    ]),
  } as never);
});
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/orders/:id/route-goods", () => {
  it("returns the owners' records for the order, arranged by nobody", async () => {
    mockSb(rows);
    const res = await read();
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.lines).toEqual(rows.order_lines);
    expect(body.sources).toEqual(rows.po_line_sources);
    expect(body.purchaseOrders).toEqual([
      {
        ...rows.purchase_orders[0],
        lines: rows.purchase_order_lines.map(({ po_id: _po, ...line }) => line),
        promises: rows.po_supplier_promises,
        arrival_confirmations: rows.po_arrival_confirmations,
      },
    ]);
    expect(body.receipts).toEqual([
      { id: "r1", po_id: "PO-1", grn_no: "GRN2609-0040", goods_received_at: "2026-09-18", status: "posted", line_ids: ["pl1"] },
    ]);
    expect(body.units).toEqual(rows.ops_stock_items);
    expect(body.failed).toEqual({ purchasing: false });
  });

  it("counts eligible Ready Stock per SKU by Stock's own match — exact Units only", async () => {
    mockSb(rows);
    vi.mocked(readFreeStock).mockResolvedValue({
      stockWarehouse: null,
      freeStock: {},
      stockQtyById: new Map(),
      freeUnitsByKey: new Map([
        [(await import("@carres/shared")).stockMatchKey("B1201S"), [
          { identityScope: "unit" }, { identityScope: "unit" }, { identityScope: "quantity" },
        ]],
      ]),
    } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await (await read()).json()) as any;
    expect(body.readyStock).toEqual({ B1201S: 2 });
  });

  it("reads only this order: lineage by order, Units by this order's reservation or sale", async () => {
    const { calls } = mockSb(rows);
    await read();
    expect(calls).toContainEqual({ table: "po_line_sources", method: "eq", args: ["order_id", ORDER] });
    expect(calls).toContainEqual({ table: "order_lines", method: "eq", args: ["order_id", ORDER] });
    const units = calls.find((c) => c.table === "ops_stock_items" && c.method === "or")!;
    expect(String(units.args[0])).toContain("reserved_ref.eq.SO-1319");
    expect(String(units.args[0])).toContain(`sold_order_id.eq.${ORDER}`);
  });

  it("⭐ a failed Purchasing read still answers: the lines and their Units stand, Purchasing is marked failed", async () => {
    mockSb(rows, ["purchase_orders"]);
    const res = await read();
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (await res.json()) as any;
    expect(body.failed).toEqual({ purchasing: true });
    expect(body.purchaseOrders).toEqual([]);
    expect(body.sources).toEqual([]);
    expect(body.lines).toEqual(rows.order_lines);
    expect(body.units).toEqual(rows.ops_stock_items);
  });

  it("a failed read of the order's own lines is a failure, not an empty route", async () => {
    mockSb(rows, ["order_lines"]);
    expect((await read()).status).toBeGreaterThanOrEqual(400);
  });

  it("answers 404 for an order that does not exist, and refuses a role outside Operation", async () => {
    mockSb({ ...rows, orders: null });
    expect((await read()).status).toBe(404);
    mockSb(rows);
    expect((await read("dealer")).status).toBe(403);
  });
});
