import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { _setJwksForTesting } from "../../middleware/auth";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/purchasing-settings", () => ({ loadPurchasingSettings: vi.fn() }));
vi.mock("../../lib/forecast-purchase-read", () => ({ forecastIssueRefusal: vi.fn(), forecastItemWord: vi.fn() }));
import { userClient } from "../../lib/supabase";
import { loadPurchasingSettings } from "../../lib/purchasing-settings";
import { forecastIssueRefusal } from "../../lib/forecast-purchase-read";
import app from "../../index";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service", SUPABASE_JWT_SECRET: "unused" };
const rpc = vi.fn();
let tables: Record<string, unknown[]>;
function query(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "is", "not", "maybeSingle"]) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
  return q;
}
const body = () => ({ requestIds: [id(1), id(2)], together: true, contextIssue: { key: id(90), requests: [1, 2].map(n => ({ id: id(n), requestVersion: 1, approvalVersion: 1, approvalToken: String(n).repeat(32) })) } });
async function issue(input: unknown = body()) {
  const jwt = await signTestJwt(id(99), { email: "test@carres.test", app_metadata: { role: "operation" } });
  return app.fetch(new Request("https://api.test/api/operation/purchasing/requests/issue", { method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify(input) }), env as never, { waitUntil() {}, passThroughException() {} } as never);
}
beforeEach(() => {
  useTestJwks(); rpc.mockReset(); vi.mocked(forecastIssueRefusal).mockReset();
  tables = {
    purchase_requests: [1, 2].map(n => ({ id: id(n), purpose: "general_purchase", request_version: 1, approval_version: 1, request_context: {}, approved_at: "2026-10-17T00:00:00Z", refused_at: null, withdrawn_at: null, sent_back_at: null, destination_id: id(30) })),
    purchase_demands: [1, 2].map(n => ({ id: id(n + 10), request_id: id(n), sku: "TEST-SKU", supplier_id: id(50), destination_id: id(30), qty: 2, approved_qty: 2, issued_qty: 0, required_by: "2027-12-01", cancelled_at: null, fulfilment_kind: "purchase", attrs: n === 1 ? { B: "TEST B", A: "TEST A" } : { A: "TEST A", B: "TEST B" } })),
    // Already purchased/arrived Units are not a second From Stock deduction.
    ops_stock_items: [{ reserved_purchase_demand_id: id(11), qty: 1 }],
    product_skus: [{ sku: "TEST-SKU", supplier_id: id(50), cost: null, stock_identity_mode: "exact_unit", product_models: { category: "sofa" } }],
    suppliers: [{ id: id(50), kind: "own_logistics", name: "TEST supplier" }],
    warehouses: [{ id: id(60), name: "Carres Klang", kind: "own" }],
    purchasing_destinations: [{ id: id(30), name: "TEST destination", address: "TEST address", warehouse_id: id(61), warehouses: { address: "TEST linked address" } }],
  };
  vi.mocked(loadPurchasingSettings).mockResolvedValue({ productionDays: [{ supplierId: id(50), category: "sofa", workingDays: 7 }], suppliers: [{ id: id(50), offDays: [0] }] } as never);
  rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === "purchasing_actor_may_issue" ? true : fn === "purchasing_request_issue_retry" ? null : { po_ids: ["PO-TEST-CONTEXT"] }, error: null }));
  vi.mocked(userClient).mockReturnValue({ from: (name: string) => query(tables[name] ?? []), rpc } as never);
});
afterAll(() => _setJwksForTesting(null));
describe("context issue keeps the canonical PO door", () => {
  it("merges physical lines, retains both sources and uses the actual destination warehouse", async () => {
    const response = await issue();
    expect(response.status).toBe(200);
    const call = rpc.mock.calls.find(([fn]) => fn === "purchasing_issue_pos_batch")!;
    const pos = call[1].p_pos;
    expect(pos).toHaveLength(1); expect(pos[0].lines).toHaveLength(1);
    expect(pos[0]).toMatchObject({ context_issue_key: id(90), warehouse_id: id(61), destination_id: id(30), context_client_input: body() });
    expect(pos[0].eta_date).not.toBe("2027-12-01");
    expect(pos[0].lines[0]).toMatchObject({ sku: "TEST-SKU", qty: 4, request_sources: [{ demand_id: id(11), qty: 2, approval_token: "1".repeat(32), recipients: null }, { demand_id: id(12), qty: 2, approval_token: "2".repeat(32), recipients: null }] });
    expect(pos[0].lines[0]).not.toHaveProperty("demand_id");
    expect(forecastIssueRefusal).not.toHaveBeenCalled();
  });
  it("merges empty and absent configuration as the same physical item", async () => {
    (tables.purchase_demands![0] as { attrs: unknown }).attrs = {};
    (tables.purchase_demands![1] as { attrs: unknown }).attrs = null;
    expect((await issue()).status).toBe(200);
    const lines = rpc.mock.calls.find(([fn]) => fn === "purchasing_issue_pos_batch")![1].p_pos[0].lines;
    expect(lines).toHaveLength(1); expect(lines[0].qty).toBe(4);
  });
  it("passes an explicit partial recipient allocation without cutting the other request", async () => {
    const input = { ...body(), contextIssue: { ...body().contextIssue, allocations: [{ demandId: id(11), qty: 1, recipients: [{ recipientId: id(70), qty: 1 }] }] } };
    expect((await issue(input)).status).toBe(200);
    const line = rpc.mock.calls.find(([fn]) => fn === "purchasing_issue_pos_batch")![1].p_pos[0].lines[0];
    expect(line.qty).toBe(3);
    expect(line.request_sources[0]).toMatchObject({ qty: 1, recipients: [{ recipientId: id(70), qty: 1 }] });
    expect((tables.purchase_demands![0] as { qty: number }).qty).toBe(2);
  });
  it("refuses a missing or stale client approval review before any issue", async () => {
    expect((await issue({ requestIds: [id(1), id(2)], together: true })).status).toBe(409);
    const stale = body(); stale.contextIssue.requests[0]!.requestVersion = 2;
    expect((await issue(stale)).status).toBe(409);
    expect(rpc.mock.calls.some(([fn]) => fn === "purchasing_issue_pos_batch")).toBe(false);
  });
  it("refuses partial overrides outside the selected request or above the current remainder", async () => {
    for (const demandId of [id(11), id(77)]) {
      const input = { ...body(), contextIssue: { ...body().contextIssue, allocations: [{ demandId, qty: 3, recipients: [] }] } };
      expect((await issue(input)).status).toBe(422);
    }
    expect(rpc.mock.calls.some(([fn]) => fn === "purchasing_issue_pos_batch")).toBe(false);
  });
  it("returns the committed result after a lost response without reissuing or recomputing remainders", async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === "purchasing_actor_may_issue" ? true : { po_ids: ["PO-TEST-EXISTING"] }, error: null }));
    tables.purchase_requests = []; tables.purchase_demands = [];
    const response = await issue();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ poIds: ["PO-TEST-EXISTING"], documents: 1 });
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual(["purchasing_actor_may_issue", "purchasing_request_issue_retry"]);
  });
  it("retains the owning stale-source refusal and never reports a PO", async () => {
    rpc.mockImplementation((fn: string) => Promise.resolve(fn === "purchasing_issue_pos_batch" ? { data: null, error: { code: "40001", details: "request_source_busy", message: "This work changed. Refresh and try again." } } : { data: fn === "purchasing_actor_may_issue" ? true : null, error: null }));
    const response = await issue(); expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "request_source_busy" });
  });
});
