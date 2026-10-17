import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRequestContextReadback } from "./use-request-context-readback";
import { usePurchaseRequestContextReview } from "../../../lib/queries";
vi.mock("../../../lib/queries", () => ({ usePurchaseRequestContextReview: vi.fn() }));
const query = { data: undefined, isFetching: false, isError: false, error: null, refetch: vi.fn() };
beforeEach(() => vi.mocked(usePurchaseRequestContextReview).mockReturnValue(query as never));
describe("guarded request readback adoption", () => {
  it("keeps the production default disabled and never requests legacy approval", () => {
    const { result } = renderHook(() => useRequestContextReadback("TEST", { purpose: "office" }));
    expect(usePurchaseRequestContextReview).toHaveBeenLastCalledWith(null);
    expect(result.current.saved.kind).toBe("legacy");
    expect(result.current.approval.kind).toBe("legacy");
  });
  it("does not use cached evidence while refreshing or after a failed read", () => {
    const uuid = "00000000-0000-4000-8000-000000000001";
    const context = { version: 1, origin: "stock_request", purpose: "ready_stock", proceedDate: "2026-10-18", stockDeliveryDate: "2026-12-01",
      serviceCaseId: null, reason: null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [],
      lines: [{ id: uuid, sku: "TEST", qty: 1, attrs: null, recipientNeeds: [], stockProposals: [], allocations: [{ id: uuid, destinationId: uuid, supplierDeliveryDate: "2026-11-20", qty: 1, recipients: [] }] }] };
    const data = { available: true, review: { request_version: 1, state: { context }, stock_source: [] }, events: [], coverage: [],
      approval: { request_version: 1, approval_version: 1, token: "a".repeat(32) } };
    const request = { purpose: "ready_stock", request_context: context, request_version: 1, proceed_date: context.proceedDate };
    vi.mocked(usePurchaseRequestContextReview).mockReturnValue({ ...query, data, isFetching: true } as never);
    const { result, rerender } = renderHook(() => useRequestContextReadback(uuid, request, true));
    expect(result.current.saved.kind).toBe("context");
    expect(result.current.approval.kind).toBe("unavailable");
    vi.mocked(usePurchaseRequestContextReview).mockReturnValue({ ...query, data, isError: true } as never);
    rerender();
    expect(result.current.approval.kind).toBe("unavailable");
    vi.mocked(usePurchaseRequestContextReview).mockReturnValue({ ...query, data } as never);
    rerender();
    expect(result.current.approval.kind).toBe("approved");
  });
});
