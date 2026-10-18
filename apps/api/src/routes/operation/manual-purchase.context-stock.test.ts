import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { stockMatchKey } from "@carres/shared";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { _setJwksForTesting } from "../../middleware/auth";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/purchase-demand-read", async original => ({ ...(await original<typeof import("../../lib/purchase-demand-read")>()), readFreeStock: vi.fn() }));
import { userClient } from "../../lib/supabase";
import { readFreeStock } from "../../lib/purchase-demand-read";
import app from "../../index";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const context = { version: 1, origin: "manual", purpose: "general_purchase", proceedDate: "2026-10-18", stockDeliveryDate: null, serviceCaseId: null, reason: "company_use", companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "",
  recipients: [{ id: id(1), name: "TEST", company: "", phone: "TEST", method: "self_pickup", deliveryDate: "2026-12-01", addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: id(3), collectedBy: "TEST" }],
  lines: [{ id: id(4), sku: "TEST", qty: 5, attrs: null, recipientNeeds: [{ recipientId: id(1), qty: 5 }], stockProposals: [{ id: id(5), locationId: id(20), destinationId: id(3), qty: 2, recipients: [{ recipientId: id(1), qty: 2 }] }], allocations: [{ id: id(6), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: 3, recipients: [{ recipientId: id(1), qty: 3 }] }] }] };
const request = { id: id(10), req_no: "GP261018-9001", request_context: context, request_version: 2, approval_version: 2, proceed_date: context.proceedDate, purpose: context.purpose, fulfilment_intent: "concrete_need", approved_at: "TEST", refused_at: null, withdrawn_at: null, sent_back_at: null };
let source: unknown; const rpc = vi.fn();
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "TEST", SUPABASE_SERVICE_ROLE_KEY: "TEST", SUPABASE_JWT_SECRET: "unused" };
async function get() {
  const token = await signTestJwt(id(99), { email: "TEST@example.test", app_metadata: { role: "operation" } });
  return app.fetch(new Request(`https://api.test/api/operation/purchasing/requests/${id(10)}/stock-allocation`, { headers: { Authorization: `Bearer ${token}` } }), env as never, { waitUntil() {}, passThroughException() {} } as never);
}
beforeEach(() => {
  useTestJwks(); rpc.mockReset();
  source = { available: true, review: { request_version: 2, state: { context }, stock_source: [] }, events: [], coverage: [], approval: { request_version: 2, approval_version: 2, token: "a".repeat(32) } };
  rpc.mockImplementation(async name => name === "purchasing_request_context_review" ? { data: source, error: null } : { data: [{ lineId: id(4), locationId: id(20), destinationId: id(3), name: "TEST Klang", available: 1, units: [{ id: id(21), qty: 1, warehouse_id: id(20), condition: "new" }] }], error: null });
  const common = { sku: "TEST", qty: 2, approved_qty: 2, issued_qty: 0, cancelled_at: null, request_line_id: id(4), destination_id: id(3) };
  vi.mocked(userClient).mockReturnValue({ rpc, from(table: string) {
    const rows = table === "purchase_requests" ? [request] : table === "purchase_demands" ? [{ ...common, id: id(101), stock_proposal_id: id(5), fulfilment_kind: "stock_proposal" }, { ...common, id: id(102), qty: 3, approved_qty: 3, fulfilment_kind: "purchase" }] : table === "product_skus" ? [{ sku: "TEST", product_models: { name: "TEST goods" } }] : [{ id: id(30), unit_code: "TEST held", sku: "TEST", qty: 1, condition: "new", reserved_purchase_demand_id: id(101) }];
    const query = { select: () => query, eq: () => query, in: () => query, maybeSingle: async () => ({ data: rows[0], error: null }), then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve) }; return query;
  } } as never);
  vi.mocked(readFreeStock).mockReset(); vi.mocked(readFreeStock).mockResolvedValue({ freeUnitsByKey: new Map([[stockMatchKey("TEST"), [21,22,23].map(n => ({ id: id(n), unitCode: `TEST-${n}`, sku: "TEST", qty: 1, condition: "new", identityScope: "unit", dateIn: null, siteName: "TEST", supplier: "TEST", poNo: null, ownership: "carres" }))]]) } as never);
});
afterAll(() => _setJwksForTesting(null));
describe("context Stock binding uses the approved exact proposal", () => {
  it("retains held Units, offers only exact qualified IDs and never nets Stock against a deliberate buy", async () => {
    const response = await get(); expect(response.status).toBe(200);
    const result = await response.json() as { lines: Array<{ demandId: string; availableQty: number; stockBlock: string | null; units: Array<{ itemId: string }> }> };
    expect(result.lines[0]).toMatchObject({ demandId: id(101), availableQty: 1, stockBlock: null });
    expect(result.lines[0].units.map(unit => unit.itemId)).toEqual([id(30),id(21)]);
    expect(result.lines[1]).toMatchObject({ demandId: id(102), availableQty: 0, stockBlock: "stock_not_approved", units: [] });
    expect(readFreeStock).toHaveBeenCalledWith(expect.anything(),true);
  });
  it("keeps stock repair available when approval scope is valid but physical coverage failed", async () => {
    source = { available: false, reason: "stock_proposal_unit_changed", approval_scope_valid: true, request_version: 2, request_context: context, events: [] };
    expect((await get()).status).toBe(200);
  });
  it.each([false, undefined])("never treats unknown/stale approval scope %s as a zero stock offer", async flag => {
    source = { available: false, reason: "request_approval_changed", approval_scope_valid: flag, request_version: 2, request_context: context, events: [] };
    const response = await get(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "stock_source_unavailable" }); expect(readFreeStock).not.toHaveBeenCalled();
  });
});
