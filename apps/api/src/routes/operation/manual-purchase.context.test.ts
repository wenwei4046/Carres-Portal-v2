import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { _setJwksForTesting } from "../../middleware/auth";
import type { PurchaseRequestContext } from "@carres/shared";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/purchasing-settings", () => ({ loadPurchasingSettings: vi.fn(), loadPurchaseRequestSettings: vi.fn() }));
import { userClient } from "../../lib/supabase";
import { loadPurchaseRequestSettings, loadPurchasingSettings } from "../../lib/purchasing-settings";
import app from "../../index";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service", SUPABASE_JWT_SECRET: "unused" };
const context = (): PurchaseRequestContext => ({ version: 1, origin: "stock_request", purpose: "ready_stock", proceedDate: "2026-11-01", stockDeliveryDate: "2026-12-01", serviceCaseId: null, reason: null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [], lines: [{ id: id(1), sku: "TEST-SKU", qty: 500, attrs: null, recipientNeeds: [], stockProposals: [], allocations: [{ id: id(2), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: 500, recipients: [] }] }] });
const rpc = vi.fn();
const catalogSelect = vi.fn();
async function post(path: string, body: unknown, signedIn = true) {
  const token = signedIn ? await signTestJwt(id(99), { email: "test@carres.test", app_metadata: { role: "operation" } }) : null;
  return app.fetch(new Request(`https://api.test/api/operation/purchasing/requests${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }), env as never, { waitUntil() {}, passThroughException() {} } as never);
}
beforeEach(() => {
  useTestJwks(); rpc.mockReset();
  catalogSelect.mockReset(); catalogSelect.mockResolvedValue({ data: [{ sku: "TEST-SKU", supplier_id: id(50), product_models: { category: "sofa" } }], error: null });
  vi.mocked(loadPurchasingSettings).mockResolvedValue({ productionDays: [{ supplierId: id(50), category: "sofa", workingDays: 7 }], suppliers: [{ id: id(50), offDays: [0] }] } as never);
  vi.mocked(userClient).mockReturnValue({ rpc, from: () => ({ select: catalogSelect }) } as unknown as ReturnType<typeof userClient>);
  vi.mocked(loadPurchaseRequestSettings).mockResolvedValue({ normalCalendarDays: 30, serviceCalendarDays: 14, manualWhatsappScreenshotRequired: true });
});
afterAll(() => _setJwksForTesting(null));
describe("contextual request API uses the existing owner", () => {
  it("passes manual RS500 atomically without a forecast cap or a second writer", async () => {
    rpc.mockResolvedValue({ data: { id: id(10), req_no: "RS261101-0001", approval_required: true }, error: null });
    const request = context(); const response = await post("", { submissionKey: id(11), context: request });
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("purchasing_create_request_with_lines", expect.objectContaining({ p_purpose: "ready_stock", p_lines: [{ request_context: request, submission_key: id(11) }], p_fulfilment_intent: "additional_stock" }));
    expect((await response.json() as { approval_required: boolean }).approval_required).toBe(true);
  });
  it("rejects invalid allocation and attachments before calling a writer", async () => {
    const request = context(); request.lines[0]!.allocations[0]!.qty = 499;
    expect((await post("", { submissionKey: id(11), context: request })).status).toBe(400);
    expect((await post("", { submissionKey: id(11), context: context(), attachments: ["TEST"] })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not manufacture success when the owning transaction refuses", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "source changed", details: "invalid_param" } });
    const response = await post("", { submissionKey: id(11), context: context() });
    expect(response.ok).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("reports the default-closed SQL admission without claiming a saved request", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "Not available", details: "request_context_not_enabled" } });
    const response = await post("", { submissionKey: id(11), context: context() });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "request_context_not_enabled", code: "request_context_not_enabled", message: "Not available" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("refuses signed-out submission before reaching the request door", async () => {
    expect((await post("", { submissionKey: id(11), context: context() }, false)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
describe("contextual recipient dates are separate from supplier production", () => {
  it.each([["general_purchase", "2026-12-01"], ["ready_stock", "2026-12-01"], ["service_case", "2026-11-15"]])("plans %s from the selected Proceed Date and recorded Settings", async (purpose, expected) => {
    const response = await post("/plan", { skus: [], proceedDate: "2026-11-01", purpose });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ proceedDate: "2026-11-01", recipientEarliest: expected, recipientPlanUnavailable: false, deliveryDateDefault: null });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps a failed Settings read unknown rather than inventing a zero-day floor", async () => {
    vi.mocked(loadPurchaseRequestSettings).mockRejectedValueOnce(new Error("unavailable"));
    const response = await post("/plan", { skus: [], proceedDate: "2026-11-01", purpose: "general_purchase" });
    expect(await response.json()).toMatchObject({ recipientEarliest: null, recipientPlanUnavailable: true });
  });
});

describe("context revisions keep the canonical same-number writer", () => {
  it("passes exact scope, expected version, retry key and reason in one RPC", async () => {
    const request = context();
    rpc.mockResolvedValue({ data: { id: id(10), req_no: "RS261101-0001", request_version: 3, approval_required: true }, error: null });
    const response = await post(`/${id(10)}/resubmit`, { revisionKey: id(12), expectedVersion: 2, reason: " TEST correction ", context: request });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("purchasing_resubmit_request", expect.objectContaining({
      p_id: id(10), p_required_by: "2026-12-01", p_why: null,
      p_lines: [{ request_context: request, revision_key: id(12), expected_version: 2, reason: "TEST correction" }],
    }));
    expect(await response.json()).toMatchObject({ req_no: "RS261101-0001", request_version: 3, approval_required: true });
  });
  it.each([
    { expectedVersion: 0 }, { expectedVersion: 1.5 }, { reason: "  " }, { revisionKey: "invalid" }, { attachments: ["TEST"] },
  ])("refuses incomplete or extra revision facts before any writer", async (change) => {
    const response = await post(`/${id(10)}/resubmit`, { revisionKey: id(12), expectedVersion: 1, reason: "TEST", context: context(), ...change });
    expect(response.status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it("returns the owning refusal instead of claiming revision success", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "request changed before revision", details: "request_version_changed" } });
    const response = await post(`/${id(10)}/resubmit`, { revisionKey: id(12), expectedVersion: 1, reason: "TEST", context: context() });
    expect(response.ok).toBe(false); expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("context supplier dates reuse the existing planner before the writer", () => {
  it("refuses missing production settings without inventing a date", async () => {
    vi.mocked(loadPurchasingSettings).mockResolvedValue({ productionDays: [], suppliers: [] } as never);
    const response = await post("", { submissionKey: id(11), context: context() });
    expect(response.status).toBe(422); expect(rpc).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ issues: [{ code: "supplier_plan_unavailable", earliest: null }] });
  });
  it("refuses too-early supplier date for both create and same-number revision", async () => {
    const request = context(); request.lines[0]!.allocations[0]!.supplierDeliveryDate = "2026-11-02";
    expect((await post("", { submissionKey: id(11), context: request })).status).toBe(422);
    expect((await post(`/${id(10)}/resubmit`, { revisionKey: id(12), expectedVersion: 1, reason: "TEST", context: request })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps a failed source read unavailable instead of reaching a writer", async () => {
    catalogSelect.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await post("", { submissionKey: id(11), context: context() })).status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("forecast-origin context carries owning source evidence", () => {
  it("passes the source in the same create envelope without a second request writer", async () => {
    const request = context(); request.origin = "forecast_suggestion"; request.forecastChangeReason = "TEST changed suggestion";
    const source = [{ sku: "TEST-SKU", sold14: 4 }]; // transport only; SQL tests verify actual source equality
    rpc.mockResolvedValue({ data: { id: id(10), req_no: "RS261101-0001", approval_required: true }, error: null });
    expect((await post("", { submissionKey: id(11), context: request, forecastSource: source })).status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("purchasing_create_request_with_lines", expect.objectContaining({ p_lines: [{ request_context: request, submission_key: id(11), forecast_source: source }] }));
  });
  it("refuses missing forecast source and a forecast label on a manual stock request", async () => {
    const forecast = context(); forecast.origin = "forecast_suggestion";
    expect((await post("", { submissionKey: id(11), context: forecast })).status).toBe(400);
    expect((await post("", { submissionKey: id(11), context: context(), forecastSource: [{ sku: "TEST-SKU" }] })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reads review source with own-request exclusion for a revision", async () => {
    const source = [{ sku: "TEST-SKU", sold14: 4 }];
    rpc.mockResolvedValue({ data: source, error: null });
    const response = await post("/plan", { skus: ["TEST-SKU"], purpose: "ready_stock", origin: "forecast_suggestion", requestId: id(10) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ forecastSource: source, forecastSourceUnavailable: false });
    expect(rpc).toHaveBeenCalledWith("purchasing_request_forecast_sources", { p_skus: ["TEST-SKU"], p_request_id: id(10) });
  });
  it("keeps failed forecast source unavailable without inventing an empty current source", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const response = await post("/plan", { skus: ["TEST-SKU"], purpose: "ready_stock", origin: "forecast_suggestion" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ forecastSource: null, forecastSourceUnavailable: true });
  });
});

describe("context review uses the same canonical decision door", () => {
  const review = () => ({ expectedVersion: 2, reviewScope: { request_version: 2, state: { context: context(), TEST: "owning scope" }, stock_source: [] }, context: context(), approvedDistribution: null });
  it("passes the exact owning review and full request separately from approved quantities", async () => {
    rpc.mockResolvedValue({ data: { id: id(10), decision: "approved", request_version: 2 }, error: null });
    const contextReview = review();
    contextReview.approvedDistribution = [{ lineId: id(1), allocationId: id(2), kind: "purchase", qty: 400, recipients: [] }] as never;
    const response = await post(`/${id(10)}/decide`, { decision: "approve", reason: "TEST partial approval", contextReview });
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("purchasing_decide_request", {
      p_id: id(10), p_decision: "approve", p_reason: "TEST partial approval",
      p_cuts: { expected_version: 2, review_scope: contextReview.reviewScope, request_context: contextReview.context, approved_distribution: contextReview.approvedDistribution },
    });
    expect(contextReview.context.lines[0]!.qty).toBe(500);
  });
  it("refuses competing cuts, missing version and quantity grants on send-back before any RPC", async () => {
    expect((await post(`/${id(10)}/decide`, { decision: "approve", cuts: [], contextReview: review() })).status).toBe(400);
    expect((await post(`/${id(10)}/decide`, { decision: "approve", contextReview: { ...review(), expectedVersion: undefined } })).status).toBe(400);
    expect((await post(`/${id(10)}/decide`, { decision: "send_back", reason: "TEST repair", contextReview: { ...review(), approvedDistribution: [] } })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["40001", "request_source_busy", 409], ["22023", "request_review_changed", 422]])("retains owning %s refusal without reporting approval", async (code, details, status) => {
    rpc.mockResolvedValue({ data: null, error: { code, details, message: "This work changed. Refresh and try again." } });
    const response = await post(`/${id(10)}/decide`, { decision: "approve", contextReview: review() });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code: details });
  });
  it("allows send-back with exact saved identity and no quantity grant", async () => {
    rpc.mockResolvedValue({ data: { id: id(10), decision: "send_back" }, error: null });
    expect((await post(`/${id(10)}/decide`, { decision: "send_back", reason: "TEST refresh source", contextReview: review() })).status).toBe(200);
    expect(rpc.mock.calls[0]![1].p_cuts.approved_distribution).toBeNull();
  });
  async function readReview() {
    const token = await signTestJwt(id(99), { email: "test@carres.test", app_metadata: { role: "operation" } });
    return app.fetch(new Request(`https://api.test/api/operation/purchasing/requests/${id(10)}/context-review`, { headers: { Authorization: `Bearer ${token}` } }), env as never, { waitUntil() {}, passThroughException() {} } as never);
  }
  it("reads the exact fresh review without creating or approving anything", async () => {
    const data = { available: true, review: review().reviewScope, events: [], coverage: null, approval: null };
    rpc.mockResolvedValue({ data, error: null });
    const response = await readReview();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("purchasing_request_context_review", { p_id: id(10) });
  });
  it.each([
    { coverage: [], approval: null },
    { coverage: null, approval: { request_version: 2, approval_version: 2, token: "a".repeat(32) } },
    { coverage: [], approval: { request_version: 1, approval_version: 1, token: "a".repeat(32) } },
    { coverage: [], approval: { request_version: 2, approval_version: 1, token: "a".repeat(32) } },
  ])("refuses mixed pending/approved or historical-version readback", async (proof) => {
    rpc.mockResolvedValue({ data: { available: true, review: review().reviewScope, events: [], ...proof }, error: null });
    const response = await readReview();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "context_review_unavailable" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("retains explicit unknown source and refuses missing RPC/data instead of empty approval", async () => {
    const data = { available: false, reason: "forecast_source_changed", request_version: 2, request_context: context(), events: [] };
    rpc.mockResolvedValueOnce({ data, error: null });
    expect(await (await readReview()).json()).toEqual(data);
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await readReview()).status).toBe(503);
    rpc.mockResolvedValueOnce({ data: { available: true, review: {}, events: [] }, error: null });
    expect((await readReview()).status).toBe(503);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42883", message: "not installed" } });
    expect((await readReview()).ok).toBe(false);
  });
});

describe("qualified Stock proposal source", () => {
  const lines = [{ id: id(1), sku: 'TEST-SKU 4"', attrs: { colour: "TEST" } }];
  const offer = { lineId: id(1), locationId: id(2), destinationId: id(3), name: "TEST location", available: 1,
    units: [{ id: id(4), qty: 1, warehouse_id: id(2), condition: "new" }] };
  it("uses the current caller and exact stable line/configuration in the shared read-only RPC", async () => {
    rpc.mockResolvedValue({ data: [offer], error: null });
    const response = await post("/stock-offers", { lines });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ offers: [offer] });
    expect(rpc).toHaveBeenCalledWith("purchasing_request_stock_offers", { p_lines: lines });
  });
  it.each([null, [{ ...offer, available: 2 }], [{ ...offer, lineId: id(9) }], [{ ...offer, units: [{ ...offer.units[0], warehouse_id: id(9) }] }]])("never turns malformed or foreign stock into available/zero stock", async data => {
    rpc.mockResolvedValue({ data, error: null });
    const response = await post("/stock-offers", { lines }); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "stock_source_unavailable" });
  });
  it("refuses duplicate line identities and signed-out reads before RPC", async () => {
    expect((await post("/stock-offers", { lines: [...lines, ...lines] })).status).toBe(400);
    expect((await post("/stock-offers", { lines }, false)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});


describe("governed release discovery",()=>{
 async function read(role="operation") {
  const jwt=await signTestJwt(id(99),{email:"TEST-release@carres.test",app_metadata:{role}});
  return app.fetch(new Request("https://api.test/api/operation/purchasing/requests/context-release",{headers:{Authorization:`Bearer ${jwt}`}}),env as never);
 }
 it.each(["42883","PGRST202"])("missing activation RPC %s retains the closed legacy composition",async code=>{rpc.mockResolvedValue({data:null,error:{code}});const res=await read();expect(res.status).toBe(200);expect(await res.json()).toEqual({version:1,requestFlow:false,cancellation:false,serviceExecution:false});});
 it("returns only validated exact DB release facts",async()=>{const state={version:1,requestFlow:true,cancellation:false,serviceExecution:false};rpc.mockResolvedValue({data:state,error:null});const res=await read();expect(res.status).toBe(200);expect(await res.json()).toEqual(state);expect(rpc).toHaveBeenCalledWith("purchasing_request_context_release");});
 it.each([{data:null,error:{code:"08006"}},{data:{version:1,requestFlow:"true"},error:null}])("read failure/malformed data never manufactures activation",async result=>{rpc.mockResolvedValue(result);expect((await read()).status).toBe(503);});
 it.each(["warehouse","finance"])("%s gains no Operation release entry",async role=>{expect((await read(role)).status).toBe(403);expect(rpc).not.toHaveBeenCalled();});
 it.each(["service_case_execution_source_unverified","cancellation_not_released"])("preserves exact closed-execution refusal %s",async details=>{rpc.mockResolvedValue({data:null,error:{code:"55000",details}});const response=await post("",{submissionKey:id(11),context:context()});expect(response.status).toBe(503);expect(await response.json()).toMatchObject({code:details,message:"Not available"});});
});
