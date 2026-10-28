import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { signTestJwt, useTestJwks } from "../../test/jwt";
import app from "../../index";
import { _setJwksForTesting } from "../../middleware/auth";

vi.mock("../../lib/supabase", () => ({ userClient: vi.fn() }));
vi.mock("../../lib/duties", () => ({ myDuties: vi.fn().mockResolvedValue([]), dutyHolders: vi.fn().mockResolvedValue({}) }));
vi.mock("../../lib/purchase-demand-read", () => ({ readFreeStock: vi.fn() }));
vi.mock("../../lib/purchasing-settings", () => ({
  loadPurchasingSettings: vi.fn().mockResolvedValue({
    orderByBufferDays: 7, earliestSellDays: 21, logisticsCallWorkingDays: 1, poDays: [1, 3, 5], suppliers: [],
    productionDays: [{ supplierId: "bbbbbbbb-0000-0000-0000-000000000001", category: "mattress", workingDays: 7 }], lastChanges: [],
  }),
}));
/* The recheck itself is proven in `forecast-purchase.test.ts`. Here it is
   replaced so this file can ask one question of the ISSUE DOOR: does it call
   the recheck with the lines it is about to issue, and obey the answer? */
vi.mock("../../lib/forecast-purchase-read", () => ({
  forecastIssueRefusal: vi.fn(),
  forecastItemWord: vi.fn().mockResolvedValue("TEST model A King"),
}));

import { forecastIssueRefusal } from "../../lib/forecast-purchase-read";
import { userClient } from "../../lib/supabase";

/**
 * MANUAL PURCHASE — POST /issue and a request Forecast Purchase asked for
 * (owner ruling 2026-10-14, A; Purchasing MASTER §9.14): approval and issuing
 * stay two acts on the existing doors, and before a PO is issued the forecast
 * request is checked again against today's forecast.
 */
const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service", SUPABASE_JWT_SECRET: "unused" };
const REQ = "aaaaaaaa-0000-0000-0000-00000000000f";
const SUP = "bbbbbbbb-0000-0000-0000-000000000001";
const DEST = "cccccccc-0000-0000-0000-000000000001";
const LINE = "dddddddd-0000-0000-0000-00000000000f";

function tableStub(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "not", "gt", "is", "maybeSingle", "in"]) q[m] = vi.fn(() => q);
  (q as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: result, error: null });
  return q;
}
function makeSb(rpc: ReturnType<typeof vi.fn>, approvedAt: string | null = "2026-10-13T03:00:00Z") {
  return {
    from: vi.fn((table: string) => {
      switch (table) {
        case "purchase_requests":
          return tableStub([{ id: REQ, req_no: "MPR-TEST-F", purpose: "ready_stock", fulfilment_intent: "additional_stock", destination_id: DEST,
            approval_required: true, approved_at: approvedAt, refused_at: null, withdrawn_at: null, sent_back_at: null }]);
        case "purchase_demands":
          return tableStub([{ id: LINE, request_id: REQ, sku: "A-K", supplier_id: SUP, destination_id: DEST, qty: 3, approved_qty: null, issued_qty: 0, cancelled_at: null }]);
        case "product_skus":
          return tableStub([{ sku: "A-K", supplier_id: SUP, cost: 500, stock_identity_mode: "unit", product_models: { category: "mattress" } }]);
        case "suppliers":
          return tableStub([{ id: SUP, name: "TEST supplier", kind: "own_logistics" }]);
        case "warehouses":
          return tableStub([{ id: "eeeeeeee-0000-0000-0000-000000000001", name: "Carres Klang", kind: "own" }]);
        default:
          return tableStub([]);
      }
    }),
    rpc: vi.fn((fn: string, args: unknown) => (fn === "purchasing_actor_may_issue" ? Promise.resolve({ data: true, error: null }) : rpc(fn, args))),
  } as unknown as ReturnType<typeof userClient>;
}
async function issue(rpc: ReturnType<typeof vi.fn>, approvedAt?: string | null) {
  vi.mocked(userClient).mockReturnValue(makeSb(rpc, approvedAt));
  const jwt = await signTestJwt("11111111-1111-1111-1111-000000000999", { email: "operation@carres.com", app_metadata: { role: "operation" } });
  return app.fetch(
    new Request("https://api.test/api/operation/purchasing/requests/issue", {
      method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requestIds: [REQ], together: false, expectedCosts: { "A-K": 500 } }),
    }),
    env as never, { waitUntil() {}, passThroughException() {} } as never,
  );
}

beforeEach(() => { useTestJwks(); vi.mocked(userClient).mockReset(); vi.mocked(forecastIssueRefusal).mockReset(); });
afterAll(() => _setJwksForTesting(null));

describe("POST /purchasing/requests/issue — a forecast request is rechecked before its PO", () => {
  it("hands the recheck exactly the lines it is about to issue, and issues when it passes", async () => {
    vi.mocked(forecastIssueRefusal).mockResolvedValue(null);
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(rpc);
    expect(res.status).toBe(200);
    expect(vi.mocked(forecastIssueRefusal).mock.calls[0]![2]).toEqual([{ requestId: REQ, sku: "A-K", issueQty: 3 }]);
    expect(rpc).toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
  });

  it("refuses by name when the forecast no longer wants the approved quantity, and issues nothing", async () => {
    vi.mocked(forecastIssueRefusal).mockResolvedValue({ code: "forecast_coverage_changed", requestId: REQ, sku: "A-K", qty: 3, toBuy: 1 });
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(rpc);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      code: "forecast_coverage_changed", requestId: REQ,
      message: "The forecast now suggests 1 of TEST model A King, not 3.",
      action: "Nothing was issued. Send the request back for changes, or withdraw it.",
    });
    expect(rpc).not.toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
  });

  it("refuses when the forecast cannot be read: no PO against a number nobody read", async () => {
    vi.mocked(forecastIssueRefusal).mockRejectedValue(Object.assign(new Error("boom"), { pg: { message: "boom" } }));
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(rpc);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(rpc).not.toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
  });

  it("approval still comes first: an unapproved forecast request is refused before any recheck", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { po_ids: ["PO-9001"] }, error: null });
    const res = await issue(rpc, null);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("not_ready_to_order");
    expect(forecastIssueRefusal).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("purchasing_issue_pos_batch", expect.anything());
  });
});
