import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import { _setJwksForTesting } from "../../middleware/auth";
import type { PurchaseRequestContext } from "@carres/shared";
vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/purchasing-settings", () => ({ loadPurchasingSettings: vi.fn(), loadPurchaseRequestSettings: vi.fn() }));
import { userClient } from "../../lib/supabase";
import { loadPurchaseRequestSettings } from "../../lib/purchasing-settings";
import app from "../../index";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service", SUPABASE_JWT_SECRET: "unused" };
const context = (): PurchaseRequestContext => ({ version: 1, origin: "stock_request", purpose: "ready_stock", proceedDate: "2026-11-01", stockDeliveryDate: "2026-12-01", serviceCaseId: null, reason: null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [], lines: [{ id: id(1), sku: "TEST-SKU", qty: 500, attrs: null, recipientNeeds: [], stockProposals: [], allocations: [{ id: id(2), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: 500, recipients: [] }] }] });
const rpc = vi.fn();
async function post(path: string, body: unknown, signedIn = true) {
  const token = signedIn ? await signTestJwt(id(99), { email: "test@carres.test", app_metadata: { role: "operation" } }) : null;
  return app.fetch(new Request(`https://api.test/api/operation/purchasing/requests${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }), env as never, { waitUntil() {}, passThroughException() {} } as never);
}
beforeEach(() => {
  useTestJwks(); rpc.mockReset();
  vi.mocked(userClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof userClient>);
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
