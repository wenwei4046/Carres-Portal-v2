import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRequestContextReadback, useRequestContextActions } from "./use-request-context-readback";
import { usePurchaseRequestContextReview, useDecidePurchaseRequest, useIssuePurchaseRequests } from "../../../lib/queries";
vi.mock("../../../lib/queries", () => ({ usePurchaseRequestContextReview: vi.fn(), useDecidePurchaseRequest: vi.fn(), useIssuePurchaseRequests: vi.fn() }));
const query = { data: undefined, isFetching: false, isError: false, error: null, refetch: vi.fn() };
const decide = vi.fn(); const issue = vi.fn();
beforeEach(() => {
  decide.mockReset(); issue.mockReset();
  vi.mocked(usePurchaseRequestContextReview).mockReturnValue(query as never);
  vi.mocked(useDecidePurchaseRequest).mockReturnValue({ isPending: false, mutateAsync: decide } as never);
  vi.mocked(useIssuePurchaseRequests).mockReturnValue({ isPending: false, mutateAsync: issue } as never);
});
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

describe("fresh approval and partial issue action adoption", () => {
  const uuid = "00000000-0000-4000-8000-000000000001";
  const context = { version: 1, origin: "stock_request", purpose: "ready_stock", proceedDate: "2026-10-18", stockDeliveryDate: "2026-12-01",
    serviceCaseId: null, reason: null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [],
    lines: [{ id: uuid, sku: "TEST", qty: 500, attrs: null, recipientNeeds: [], stockProposals: [], allocations: [{ id: uuid, destinationId: uuid, supplierDeliveryDate: "2026-11-20", qty: 500, recipients: [] }] }] } as import("@carres/shared").PurchaseRequestContext;
  const request = { purpose: "ready_stock", request_context: context, request_version: 1, proceed_date: context.proceedDate };
  const owning = { request_version: 1, state: { context }, stock_source: [], TEST_source: "exact" };
  it("keeps legacy/default-off/busy evidence from reaching either writer", async () => {
    const { result } = renderHook(() => useRequestContextActions(uuid, request));
    expect(result.current.canDecide).toBe(false); expect(result.current.canIssue).toBe(false);
    await expect(result.current.issueRemaining({ key: uuid, together: false })).rejects.toThrow("Not available");
    expect(issue).not.toHaveBeenCalled(); expect(decide).not.toHaveBeenCalled();
  });
  it("passes the complete owning review and explicit distribution through the existing decision hook", async () => {
    vi.mocked(usePurchaseRequestContextReview).mockReturnValue({ ...query, data: { available: true, review: owning, events: [], coverage: null, approval: null } } as never);
    const { result } = renderHook(() => useRequestContextActions(uuid, request, { enabled: true, mayApprove: true, mayIssue: false }));
    const distribution = [{ lineId: uuid, allocationId: uuid, kind: "purchase" as const, qty: 500, recipients: [] }];
    await result.current.decide({ decision: "approve", context, approvedDistribution: distribution });
    expect(decide).toHaveBeenCalledWith({ id: uuid, decision: "approve", reason: undefined, contextReview: { expectedVersion: 1, reviewScope: owning, context, approvedDistribution: distribution } });
    expect(issue).not.toHaveBeenCalled();
  });
  it("passes exact approval token and explicit partial quantity, without resumming total500", async () => {
    vi.mocked(usePurchaseRequestContextReview).mockReturnValue({ ...query, data: { available: true, review: owning, events: [], coverage: [], approval: { request_version: 1, approval_version: 1, token: "a".repeat(32) } } } as never);
    const { result, rerender } = renderHook(() => useRequestContextActions(uuid, request, { enabled: true, mayApprove: false, mayIssue: true }));
    const allocations = [{ demandId: uuid, qty: 1, recipients: null }];
    await result.current.issueRemaining({ key: uuid, together: false, allocations });
    expect(issue).toHaveBeenCalledWith({ requestIds: [uuid], together: false, contextIssue: { key: uuid, requests: [{ id: uuid, requestVersion: 1, approvalVersion: 1, approvalToken: "a".repeat(32) }], allocations } });
    vi.mocked(usePurchaseRequestContextReview).mockReturnValue({ ...query, isFetching: true } as never); rerender();
    await expect(result.current.issueRemaining({ key: uuid, together: false })).rejects.toThrow("Not available");
    expect(issue).toHaveBeenCalledTimes(1);
  });
});
