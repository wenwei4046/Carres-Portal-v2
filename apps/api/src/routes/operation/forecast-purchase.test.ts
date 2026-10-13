import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { ForecastPurchaseResponse } from "@carres/shared";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/today", () => ({ todayIsoMYT: () => "2026-10-13" }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const jwtFor = (role: string) => signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });

type Call = { table: string; method: string; args: unknown[] };

/** A read-only stand-in for the database: each table answers with its rows,
 *  and every filter the route applies is recorded. */
function fakeDb(tables: Record<string, unknown[] | { error: { message: string } }>, poFree: unknown[] = []) {
  const calls: Call[] = [];
  const from = (table: string) => {
    let range: [number, number] | null = null;
    const answer = () => {
      const rows = tables[table] ?? [];
      if (!Array.isArray(rows)) return { data: null, error: rows.error };
      return { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
    };
    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
    };
    for (const method of ["select", "in", "eq", "is", "not", "or", "gte", "order"]) {
      chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
    }
    chain.range = (a: number, b: number) => { calls.push({ table, method: "range", args: [a, b] }); range = [a, b]; return chain; };
    return chain;
  };
  return { sb: { from, rpc: vi.fn().mockResolvedValue({ data: poFree, error: null }) }, calls };
}

const MODELS = [
  { id: "m-a", name: "TEST model A", category: "mattress", model_key: "test-a" },
  { id: "m-j", name: "Jager", category: "bedframe", model_key: "jager" },
  { id: "m-x", name: "TEST other bedframe", category: "bedframe", model_key: "test-x" },
];
const SKUS = [
  { sku: "A-K", variant: "King", variant_kind: "size", supplier_id: "s1", model_id: "m-a", discontinued_at: null },
  { sku: "A-Q", variant: "Queen", variant_kind: "size", supplier_id: "s9", model_id: "m-a", discontinued_at: null },
  { sku: "J-Q", variant: "Queen", variant_kind: "size", supplier_id: null, model_id: "m-j", discontinued_at: null },
  { sku: "X-Q", variant: "Queen", variant_kind: "size", supplier_id: "s1", model_id: "m-x", discontinued_at: null },
];
const SUPPLIERS = [
  { id: "s1", name: "TEST supplier", kind: "supplier" },
  { id: "s9", name: "TEST landlord", kind: "other_creditor" },
];
/* Malaysia time is UTC+8: 16:30 UTC on 31 Aug is already 1 Sep in Klang. */
const ORDERS = [
  { id: "o1", placed_at: "2026-08-10T03:00:00Z", order_lines: [{ sku: "A-K", qty: 2 }, { sku: "X-Q", qty: 5 }] },
  { id: "o2", placed_at: "2026-08-31T16:30:00Z", order_lines: [{ sku: "A-K", qty: 1 }] },
  { id: "o3", placed_at: "2026-09-29T03:00:00Z", order_lines: [{ sku: "A-K", qty: 4 }] },
  { id: "o4", placed_at: "2026-09-30T03:00:00Z", order_lines: [{ sku: "A-K", qty: 3 }, { sku: "NOT-IN-CATALOG", qty: 9 }] },
  { id: "o5", placed_at: "2026-10-13T02:00:00Z", order_lines: [{ sku: "A-K", qty: 1 }, { sku: "J-Q", qty: 2 }] },
];
const UNITS = [
  { id: "u1", sku: "A-K", qty: 1 }, { id: "u2", sku: "A-K", qty: 1 }, { id: "u3", sku: "J-Q", qty: null }, { id: "u4", sku: "X-Q", qty: 1 },
];

async function read(db: ReturnType<typeof fakeDb>, role = "operation") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(db.sb as any);
  return app.fetch(new Request("http://t/api/operation/purchase/forecast", { headers: { Authorization: `Bearer ${await jwtFor(role)}` } }), env);
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/purchase/forecast", () => {
  it("returns the sizes kept as stock with sold, free and on-PO counts", async () => {
    const db = fakeDb({ product_models: MODELS, product_skus: SKUS, suppliers: SUPPLIERS, orders: ORDERS, stock_unit_register_v: UNITS },
      [{ po_id: "PO-1", po_line_id: "l1", sku: "A-K", free_units: 3 }, { po_id: "PO-2", po_line_id: "l2", sku: "X-Q", free_units: 4 }]);
    const res = await read(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ForecastPurchaseResponse;
    expect(body.today).toBe("2026-10-13");
    expect(body.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(body.mondays).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    // Every mattress size and the Jager bedframe; no other bedframe.
    expect(body.sizes.map((s) => s.sku)).toEqual(["A-K", "A-Q", "J-Q"]);

    const king = body.sizes[0]!;
    // Aug 2 · Sep 1 (31 Aug 16:30 UTC is 1 Sep in Klang) + 4 + 3 · Oct 1.
    expect(king.sold).toEqual([2, 8, 1]);
    // The last 14 days start after 29 Sep: 30 Sep (3) and 13 Oct (1).
    expect(king.sold14).toBe(4);
    expect(king.free).toBe(2);
    expect(king.onPo).toBe(3);
    expect(king.supplier).toBe("TEST supplier");
    expect(king.model).toBe("TEST model A");
    expect(king.size).toBe("King");
  });

  it("a size with no supplier, or one pointing at an other creditor, has no supplier", async () => {
    const db = fakeDb({ product_models: MODELS, product_skus: SKUS, suppliers: SUPPLIERS, orders: ORDERS, stock_unit_register_v: UNITS });
    const body = (await (await read(db)).json()) as ForecastPurchaseResponse;
    expect(body.sizes.find((s) => s.sku === "A-Q")).toMatchObject({ supplierId: null, supplier: null });
    expect(body.sizes.find((s) => s.sku === "J-Q")).toMatchObject({ supplierId: null, supplier: null, sold: [0, 0, 2], free: 1 });
  });

  it("reads the Sales Orders Register's own population, from the first shown month, and only New available Units", async () => {
    const db = fakeDb({ product_models: MODELS, product_skus: SKUS, suppliers: SUPPLIERS, orders: ORDERS, stock_unit_register_v: UNITS });
    await read(db);
    const on = (table: string) => db.calls.filter((call) => call.table === table).map((call) => [call.method, ...call.args]);
    expect(on("orders")).toContainEqual(["not", "status", "in", "(place,cancelled)"]);
    expect(on("orders")).toContainEqual(["or", "source_system.is.null,source_system.neq.rental"]);
    expect(on("orders")).toContainEqual(["gte", "placed_at", "2026-08-01T00:00:00+08:00"]);
    expect(on("stock_unit_register_v")).toContainEqual(["eq", "availability", "available"]);
    expect(on("stock_unit_register_v")).toContainEqual(["eq", "condition", "new"]);
    expect(on("product_skus")).toContainEqual(["is", "discontinued_at", null]);
    expect(db.sb.rpc).toHaveBeenCalledWith("purchasing_po_free_units");
  });

  it("fails, and guesses nothing, when a source cannot be read", async () => {
    const db = fakeDb({ product_models: MODELS, product_skus: SKUS, suppliers: SUPPLIERS, orders: ORDERS, stock_unit_register_v: { error: { message: "boom" } } });
    const res = await read(db);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a role outside Operation before any read", async () => {
    const db = fakeDb({});
    const res = await read(db, "dealer");
    expect(res.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });
});
