import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { ForecastPurchaseResponse } from "@carres/shared";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";
import { forecastIssueRefusal } from "../../lib/forecast-purchase-read";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/today", () => ({ todayIsoMYT: () => "2026-10-13" }));
import { userClient } from "../../lib/supabase";

const env = { SUPABASE_URL: "https://t.x", SUPABASE_ANON_KEY: "a", SUPABASE_SERVICE_ROLE_KEY: "s", SUPABASE_JWT_SECRET: "" };
const jwtFor = (role: string) => signTestJwt("u1", { email: `${role}@x`, app_metadata: { role } });

type Call = { table: string; method: string; args: unknown[] };
type RpcAnswer = { data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null };

/** A stand-in for the database: each table answers with its rows, every
 *  filter the route applies is recorded, and each named function answers as
 *  the test says. */
function fakeDb(
  tables: Record<string, unknown[] | { error: { message: string } }>,
  opts: { poFree?: unknown[]; inProgress?: unknown[]; duties?: Record<string, string | null>; marks?: unknown[]; already?: unknown; submit?: (args: Record<string, unknown>) => RpcAnswer; missing?: boolean } = {},
) {
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
    chain.maybeSingle = () => Promise.resolve({ data: (answer().data as unknown[] | null)?.[0] ?? null, error: answer().error });
    for (const method of ["select", "in", "eq", "is", "not", "or", "gte", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
    }
    chain.range = (a: number, b: number) => { calls.push({ table, method: "range", args: [a, b] }); range = [a, b]; return chain; };
    return chain;
  };
  const absent: RpcAnswer = { data: null, error: { code: "PGRST202", message: "Could not find the function" } };
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>): Promise<RpcAnswer> => {
    if (name === "purchasing_po_free_units") return { data: opts.poFree ?? [], error: null };
    if (name === "workspace_resolve_duty") return { data: { actor_user_id: opts.duties?.[String(args?.p_duty_key)] ?? null }, error: null };
    if (name === "actor_display_names") return { data: ((args?.p_ids as string[]) ?? []).map((id) => ({ id, name: `TEST ${id}` })), error: null };
    if (name === "purchasing_forecast_requests_in_progress") return opts.missing ? absent : { data: opts.inProgress ?? [], error: null };
    if (name === "purchasing_forecast_request_marks") return opts.missing ? absent : { data: opts.marks ?? [], error: null };
    if (name === "purchasing_forecast_submission") return opts.missing ? absent : { data: opts.already ?? null, error: null };
    if (name === "purchasing_submit_forecast_requests") return (opts.submit ?? (() => ({ data: { replayed: false, requests: [{ id: "new-1", req_no: "MPR-TEST-NEW" }] }, error: null })))(args ?? {});
    return { data: null, error: null };
  });
  return { sb: { from, rpc }, calls, rpc };
}

const MODELS = [
  { id: "m-a", name: "TEST model A", category: "mattress", model_key: "test-a" },
  { id: "m-j", name: "Jager", category: "bedframe", model_key: "jager" },
  { id: "m-x", name: "TEST other bedframe", category: "bedframe", model_key: "test-x" },
];
const SKUS = [
  { sku: "A-K", variant: "King", variant_kind: "size", supplier_id: "s1", model_id: "m-a", discontinued_at: null },
  { sku: "A-Q", variant: "Queen", variant_kind: "size", supplier_id: "s9", model_id: "m-a", discontinued_at: null },
  { sku: "J-Q", variant: "Queen", variant_kind: "size", supplier_id: "s2", model_id: "m-j", discontinued_at: null },
  { sku: "X-Q", variant: "Queen", variant_kind: "size", supplier_id: "s1", model_id: "m-x", discontinued_at: null },
];
const SUPPLIERS = [
  { id: "s1", name: "TEST supplier", kind: "supplier" },
  { id: "s2", name: "TEST supplier two", kind: "supplier" },
  { id: "s9", name: "TEST landlord", kind: "other_creditor" },
];
/* Malaysia time is UTC+8: 16:30 UTC on 31 Aug is already 1 Sep in Klang. */
const ORDERS = [
  { id: "o1", placed_at: "2026-08-10T03:00:00Z", order_lines: [{ sku: "A-K", qty: 2 }, { sku: "X-Q", qty: 5 }] },
  { id: "o2", placed_at: "2026-08-31T16:30:00Z", order_lines: [{ sku: "A-K", qty: 1 }] },
  { id: "o3", placed_at: "2026-09-29T03:00:00Z", order_lines: [{ sku: "A-K", qty: 4 }] },
  { id: "o4", placed_at: "2026-09-30T03:00:00Z", order_lines: [{ sku: "A-K", qty: 3 }, { sku: "NOT-IN-CATALOG", qty: 9 }] },
  { id: "o5", placed_at: "2026-10-13T02:00:00Z", order_lines: [{ sku: "A-K", qty: 2 }, { sku: "J-Q", qty: 2 }] },
];
const UNITS = [{ id: "u1", sku: "A-K", qty: 1 }, { id: "u3", sku: "J-Q", qty: null }, { id: "u4", sku: "X-Q", qty: 1 }];
const DESTINATIONS = [
  { id: "d0", name: "TEST old default", is_default: true, active: false },
  { id: "d1", name: "TEST Warehouse", is_default: true, active: true },
  { id: "d2", name: "TEST other", is_default: false, active: true },
];
/* Production days are set for the mattress supplier only. */
const SETTINGS = [{ id: 1, order_by_buffer_days: 2, earliest_sell_days: 0, logistics_call_working_days: 1, po_days: [1, 2, 3, 4, 5], manual_purchase_min_delivery_days: 0, ready_stock_priority: "proceed_date" }];
const PRODUCTION = [{ supplier_id: "s1", category: "mattress", working_days: 7 }];
const TABLES = {
  product_models: MODELS, product_skus: SKUS, suppliers: SUPPLIERS, orders: ORDERS, stock_unit_register_v: UNITS,
  purchasing_destinations: DESTINATIONS, purchasing_settings: SETTINGS, purchasing_production_days: PRODUCTION,
};
/* A-K: 5 sold in the last 14 days (30 Sep 3 + 13 Oct 2): level 5, at most 3 a Monday. */

async function call(db: ReturnType<typeof fakeDb>, init?: { role?: string; body?: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(userClient).mockReturnValue(db.sb as any);
  const headers: Record<string, string> = { Authorization: `Bearer ${await jwtFor(init?.role ?? "operation")}` };
  if (init?.body === undefined) return app.fetch(new Request("http://t/api/operation/purchase/forecast", { headers }), env);
  return app.fetch(new Request("http://t/api/operation/purchase/forecast/requests", {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(init.body),
  }), env);
}
const KEY = "11111111-1111-4111-8111-111111111111";

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("GET /api/operation/purchase/forecast", () => {
  it("returns the sizes kept as stock with sold, free and on-PO counts", async () => {
    const db = fakeDb(TABLES, { poFree: [{ po_id: "PO-1", po_line_id: "l1", sku: "A-K", free_units: 1 }, { po_id: "PO-2", po_line_id: "l2", sku: "X-Q", free_units: 4 }] });
    const res = await call(db);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ForecastPurchaseResponse;
    expect(body.today).toBe("2026-10-13");
    expect(body.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(body.mondays).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    // Every mattress size and the Jager bedframe; no other bedframe.
    expect(body.sizes.map((s) => s.sku)).toEqual(["A-K", "A-Q", "J-Q"]);

    const king = body.sizes[0]!;
    // Aug 2 · Sep 1 (31 Aug 16:30 UTC is 1 Sep in Klang) + 4 + 3 · Oct 2.
    expect(king.sold).toEqual([2, 8, 2]);
    // The last 14 days start after 29 Sep: 30 Sep (3) and 13 Oct (2).
    expect(king.sold14).toBe(5);
    expect(king.free).toBe(1);
    expect(king.onPo).toBe(1);
    expect(king.supplier).toBe("TEST supplier");
    expect(king.model).toBe("TEST model A");
    expect(king.size).toBe("King");
  });

  it("a size with no supplier, or one pointing at an other creditor, has no supplier", async () => {
    const body = (await (await call(fakeDb({ ...TABLES, product_skus: SKUS.map((s) => (s.sku === "J-Q" ? { ...s, supplier_id: null } : s)) }))).json()) as ForecastPurchaseResponse;
    expect(body.sizes.find((s) => s.sku === "A-Q")).toMatchObject({ supplierId: null, supplier: null, deliveryDate: null });
    expect(body.sizes.find((s) => s.sku === "J-Q")).toMatchObject({ supplierId: null, supplier: null, sold: [0, 0, 2], free: 1 });
  });

  it("reads the Sales Orders Register's own population, from the first shown month, and only New available Units", async () => {
    const db = fakeDb(TABLES);
    await call(db);
    const on = (table: string) => db.calls.filter((entry) => entry.table === table).map((entry) => [entry.method, ...entry.args]);
    expect(on("orders")).toContainEqual(["not", "status", "in", "(place,cancelled)"]);
    expect(on("orders")).toContainEqual(["or", "source_system.is.null,source_system.neq.rental"]);
    expect(on("orders")).toContainEqual(["gte", "placed_at", "2026-08-01T00:00:00+08:00"]);
    expect(on("stock_unit_register_v")).toContainEqual(["eq", "availability", "available"]);
    expect(on("stock_unit_register_v")).toContainEqual(["eq", "condition", "new"]);
    expect(on("product_skus")).toContainEqual(["is", "discontinued_at", null]);
    expect(db.rpc).toHaveBeenCalledWith("purchasing_po_free_units");
  });

  it("reads requests in progress through the database's one arithmetic, and keeps them apart from stock", async () => {
    const db = fakeDb(TABLES, { inProgress: [
      { request_id: "r1", req_no: "MPR-TEST-1", state: "waiting", sku: "A-K", qty: 2, from_forecast: true },
      { request_id: "r2", req_no: "MPR-TEST-2", state: "ready", sku: "A-K", qty: 1, from_forecast: false },
      { request_id: "r3", req_no: "MPR-TEST-3", state: "waiting", sku: "X-Q", qty: 9, from_forecast: false },
    ] });
    const body = (await (await call(db)).json()) as ForecastPurchaseResponse;
    const king = body.sizes.find((s) => s.sku === "A-K")!;
    expect(king.inProgress).toBe(3);
    expect(king.requests).toEqual([
      { id: "r1", no: "MPR-TEST-1", qty: 2, state: "waiting", fromForecast: true },
      { id: "r2", no: "MPR-TEST-2", qty: 1, state: "ready", fromForecast: false },
    ]);
    // What is asked for is in neither stock number.
    expect(king.free).toBe(1);
    expect(king.onPo).toBe(0);
    expect(db.rpc).toHaveBeenCalledWith("purchasing_forecast_requests_in_progress");
    // The page never reads the request tables itself: one arithmetic, in the database.
    expect(db.calls.some((entry) => entry.table === "purchase_requests" || entry.table === "purchase_demands")).toBe(false);
  });

  it("hands over the Delivery Date a request would ask for, the active default Deliver To and who acts next", async () => {
    const db = fakeDb(TABLES, { duties: { purchasing_approver: "approver-1", po_duty: "duty-1" } });
    const body = (await (await call(db)).json()) as ForecastPurchaseResponse;
    expect(body.deliverTo).toEqual({ id: "d1", name: "TEST Warehouse" });
    expect(body.approver).toEqual({ id: "approver-1", name: "TEST approver-1" });
    expect(body.poDuty).toEqual({ id: "duty-1", name: "TEST duty-1" });
    // Production days are set for the mattress supplier, not for the bedframe supplier.
    expect(body.sizes.find((s) => s.sku === "A-K")!.deliveryDate).toMatch(/^2026-10-\d\d$/);
    expect(body.sizes.find((s) => s.sku === "A-K")!.deliveryDate! > "2026-10-13").toBe(true);
    expect(body.sizes.find((s) => s.sku === "J-Q")!.deliveryDate).toBeNull();
  });

  it("names nobody, and still answers, when no duty holder or default Deliver To is set", async () => {
    const res = await call(fakeDb({ ...TABLES, purchasing_destinations: [] }));
    expect(res.status).toBe(200);
    expect((await res.json()) as ForecastPurchaseResponse).toMatchObject({ deliverTo: null, approver: null, poDuty: null });
  });

  it("fails, and guesses nothing, when a source cannot be read", async () => {
    const res = await call(fakeDb({ ...TABLES, stock_unit_register_v: { error: { message: "boom" } } }));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("says the database is not switched on when 0695 is not applied", async () => {
    const res = await call(fakeDb(TABLES, { missing: true }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "migration_not_applied", action: "Ask IT to apply migration 0695, then open the page again." });
  });

  it("rejects a role outside Operation before any read", async () => {
    const db = fakeDb({});
    const res = await call(db, { role: "dealer" });
    expect(res.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });
});

describe("POST /api/operation/purchase/forecast/requests — Send for approval", () => {
  it("works the request out again on the server and asks through the submit door, one group per supplier and category", async () => {
    const db = fakeDb({ ...TABLES, purchasing_production_days: [...PRODUCTION, { supplier_id: "s2", category: "bedframe", working_days: 7 }] });
    const res = await call(db, { body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 3 }, { sku: "J-Q", qty: 1 }] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ replayed: false, requests: [{ id: "new-1", reqNo: "MPR-TEST-NEW" }] });
    const sent = db.rpc.mock.calls.find(([name]) => name === "purchasing_submit_forecast_requests")![1] as Record<string, unknown>;
    expect(sent.p_submission_key).toBe(KEY);
    expect(sent.p_forecast_week).toBe("2026-10-12");
    expect(sent.p_destination_id).toBe("d1");
    const groups = sent.p_groups as Array<{ required_by: string; requirement: string; lines: Array<Record<string, unknown>> }>;
    expect(groups).toHaveLength(2);
    expect(groups[0]!.requirement).toBe("Forecast Purchase · week of 2026-10-12");
    expect(groups[0]!.required_by).toMatch(/^2026-10-\d\d$/);
    // The line carries what the server read as in progress, and what the ask was worked out from.
    expect(groups[0]!.lines).toEqual([{ sku: "A-K", qty: 3, in_progress: 0, basis: { level: 5, cap: 3, suggested: 3, free: 1, on_po: 0, sold14: 5 } }]);
    expect(groups[1]!.lines[0]).toMatchObject({ sku: "J-Q", qty: 1, in_progress: 0 });
    // This route issues nothing and creates no request row itself.
    expect(db.rpc.mock.calls.map(([name]) => name)).not.toContain("purchasing_issue_pos_batch");
    expect(db.rpc.mock.calls.map(([name]) => name)).not.toContain("purchasing_create_request_with_lines");
  });

  it("refuses a quantity the forecast no longer has room for, and writes nothing", async () => {
    // 3 suggested, 2 already in progress: only 1 can still be asked.
    const db = fakeDb(TABLES, { inProgress: [{ request_id: "r1", req_no: "MPR-TEST-1", state: "waiting", sku: "A-K", qty: 2, from_forecast: true }] });
    const res = await call(db, { body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 3 }] } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "forecast_changed", message: "The forecast for TEST model A King changed while this was open.", action: "Nothing was sent. Check the list, then review again." });
    expect(db.rpc.mock.calls.map(([name]) => name)).not.toContain("purchasing_submit_forecast_requests");
  });

  it("refuses a size that is not forecast stock, one with no supplier, and one with no production days", async () => {
    const names = async (body: unknown) => { const db = fakeDb(TABLES); const res = await call(db, { body }); return [res.status, ((await res.json()) as { code: string }).code, db.rpc.mock.calls.some(([name]) => name === "purchasing_submit_forecast_requests")]; };
    expect(await names({ submissionKey: KEY, lines: [{ sku: "X-Q", qty: 1 }] })).toEqual([422, "forecast_not_stock_item", false]);
    expect(await names({ submissionKey: KEY, lines: [{ sku: "A-Q", qty: 1 }] })).toEqual([422, "unresolved_supplier", false]);
    // J-Q: 2 sold in 14 days, suggested 1, supplier set, no production days.
    expect(await names({ submissionKey: KEY, lines: [{ sku: "J-Q", qty: 1 }] })).toEqual([422, "production_days_required", false]);
  });

  it("refuses with no default Deliver To", async () => {
    const res = await call(fakeDb({ ...TABLES, purchasing_destinations: [] }), { body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 1 }] } });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { code: string }).code).toBe("forecast_no_deliver_to");
  });

  it("a retry with the same key is answered with what the first press made, before any quantity is judged", async () => {
    // The first press's own request is now in progress, so the quantity check would refuse a fresh ask.
    const db = fakeDb(TABLES, {
      already: [{ id: "made-1", req_no: "MPR-TEST-7" }],
      inProgress: [{ request_id: "made-1", req_no: "MPR-TEST-7", state: "waiting", sku: "A-K", qty: 3, from_forecast: true }],
    });
    const res = await call(db, { body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 3 }] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ replayed: true, requests: [{ id: "made-1", reqNo: "MPR-TEST-7" }] });
    expect(db.rpc).toHaveBeenCalledWith("purchasing_forecast_submission", { p_submission_key: KEY });
    expect(db.rpc.mock.calls.map(([name]) => name)).not.toContain("purchasing_submit_forecast_requests");
  });

  it("says the forecast changed when the database's own check finds another request appeared", async () => {
    const db = fakeDb(TABLES, { submit: () => ({ data: null, error: { code: "P0001", message: "what is in progress for A-K changed", details: "forecast_in_progress_changed", hint: "A-K" } }) });
    const res = await call(db, { body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 3 }] } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "forecast_changed", message: "The forecast for TEST model A King changed while this was open." });
  });

  it("refuses a malformed body, the same size twice, and a role outside Operation", async () => {
    expect((await call(fakeDb(TABLES), { body: { submissionKey: "not-a-key", lines: [{ sku: "A-K", qty: 1 }] } })).status).toBe(400);
    expect((await call(fakeDb(TABLES), { body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 0 }] } })).status).toBe(400);
    expect((await call(fakeDb(TABLES), { body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 1 }, { sku: "A-K", qty: 1 }] } })).status).toBe(400);
    const db = fakeDb(TABLES);
    expect((await call(db, { role: "dealer", body: { submissionKey: KEY, lines: [{ sku: "A-K", qty: 1 }] } })).status).toBe(403);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

describe("forecastIssueRefusal — the recheck before a PO is issued", () => {
  const sbOf = (db: ReturnType<typeof fakeDb>) => db.sb as never;
  const MARK = [{ request_id: "req-f", forecast_week: "2026-10-12", lines: [{ sku: "A-K", qty: 3 }] }];

  it("does not look at a request Forecast Purchase did not ask for: its own rules stand", async () => {
    const db = fakeDb(TABLES, { marks: [] });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-manual", sku: "A-K", issueQty: 50 }])).toBeNull();
    // The forecast is not even read for it.
    expect(db.calls.some((entry) => entry.table === "orders")).toBe(false);
  });

  it("lets a forecast request through while the forecast still suggests at least what is being issued", async () => {
    // A-K: level 5, 1 in stock, cap 3: 3 suggested now.
    const db = fakeDb(TABLES, { marks: MARK });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "A-K", issueQty: 3 }])).toBeNull();
  });

  it("stops a forecast request when stock arrived or another PO was issued since the approval", async () => {
    // 3 more Units on a PO since the approval: 4 in stock, the forecast now suggests 1.
    const db = fakeDb(TABLES, { marks: MARK, poFree: [{ po_id: "PO-9", po_line_id: "l9", sku: "A-K", free_units: 3 }] });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "A-K", issueQty: 3 }]))
      .toEqual({ code: "forecast_coverage_changed", requestId: "req-f", sku: "A-K", qty: 3, toBuy: 1 });
  });

  it("a request in progress is not stock: another request waiting for the same size does not stop the issue", async () => {
    const db = fakeDb(TABLES, { marks: MARK, inProgress: [{ request_id: "other", req_no: "MPR-X", state: "waiting", sku: "A-K", qty: 5, from_forecast: false }] });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "A-K", issueQty: 3 }])).toBeNull();
  });

  it("adds up two forecast requests for the same size issued together", async () => {
    const db = fakeDb(TABLES, { marks: [...MARK, { request_id: "req-g", forecast_week: "2026-10-12", lines: [{ sku: "A-K", qty: 2 }] }] });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "A-K", issueQty: 2 }, { requestId: "req-g", sku: "A-K", issueQty: 2 }]))
      .toMatchObject({ code: "forecast_coverage_changed", qty: 4, toBuy: 3 });
  });

  it("stops a line that was added to a forecast request after the forecast asked for it", async () => {
    const db = fakeDb(TABLES, { marks: MARK });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "J-Q", issueQty: 1 }]))
      .toEqual({ code: "forecast_request_changed", requestId: "req-f", sku: "J-Q" });
  });

  it("stops a size that is no longer forecast stock", async () => {
    const db = fakeDb({ ...TABLES, product_skus: SKUS.filter((s) => s.sku !== "A-K") }, { marks: MARK });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "A-K", issueQty: 1 }]))
      .toEqual({ code: "forecast_not_stock_item", requestId: "req-f", sku: "A-K" });
  });

  it("refuses the issue when the forecast cannot be read: a PO is never issued against a number nobody read", async () => {
    const db = fakeDb({ ...TABLES, stock_unit_register_v: { error: { message: "boom" } } }, { marks: MARK });
    await expect(forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "A-K", issueQty: 1 }])).rejects.toThrow("boom");
  });

  it("before 0695 is applied no request can be a forecast request, so nothing is rechecked", async () => {
    const db = fakeDb(TABLES, { missing: true });
    expect(await forecastIssueRefusal(sbOf(db), "2026-10-13", [{ requestId: "req-f", sku: "A-K", issueQty: 9 }])).toBeNull();
  });
});
