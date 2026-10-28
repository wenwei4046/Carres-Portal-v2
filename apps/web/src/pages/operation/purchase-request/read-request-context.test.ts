import { describe, expect, it } from "vitest";
import type { PurchaseRequestContext } from "@carres/shared";
import { readRequestApproval, readRequestContext } from "./read-request-context";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const context: PurchaseRequestContext = {
  version: 1, origin: "stock_request", purpose: "ready_stock", proceedDate: "2026-10-17", stockDeliveryDate: "2026-11-20", serviceCaseId: null,
  reason: null, companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [],
  lines: [{ id: id(1), sku: "TEST-SKU", qty: 500, attrs: { fabric: "TEST" }, recipientNeeds: [], stockProposals: [], allocations: [{ id: id(2), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: 500, recipients: [] }] }],
};
const row = { purpose: "ready_stock", request_context: context, request_version: 1, proceed_date: context.proceedDate };
describe("saved request context read-back", () => {
  it("reads the exact saved stock request with configuration, stable allocation IDs and no forecast cap", () => {
    expect(readRequestContext(row)).toEqual({ kind: "context", value: context, requestVersion: 1 });
  });
  it("leaves a historical record legacy without inventing a new scope", () => {
    expect(readRequestContext({ purpose: "office" })).toEqual({ kind: "legacy" });
    expect(readRequestContext({ purpose: "office", request_context: null, request_version: 0 })).toEqual({ kind: "legacy" });
  });
  it("does not turn missing or unsupported versioned data into an editable legacy request", () => {
    expect(readRequestContext({ ...row, request_context: null })).toEqual({ kind: "unavailable" });
    expect(readRequestContext({ ...row, request_context: { ...context, version: 2 } })).toEqual({ kind: "unavailable" });
    expect(readRequestContext({ ...row, request_version: undefined })).toEqual({ kind: "unavailable" });
  });
  it("refuses a request header whose identity or chosen date disagrees with the saved context", () => {
    expect(readRequestContext({ ...row, purpose: "service_case" })).toEqual({ kind: "unavailable" });
    expect(readRequestContext({ ...row, proceed_date: "2026-10-18" })).toEqual({ kind: "unavailable" });
  });
});

describe("approval readback never upgrades historical scope", () => {
  const review = () => ({ available: true, review: { request_version: 1, state: { context }, stock_source: [] }, events: [], coverage: null, approval: null });
  it("keeps legacy and malformed saved scope separate even with a fresh review", () => {
    expect(readRequestApproval({ kind: "legacy" }, review())).toEqual({ kind: "legacy" });
    expect(readRequestApproval({ kind: "unavailable" }, review())).toEqual({ kind: "unavailable" });
  });
  it("distinguishes pending from exact current approval without deriving quantities", () => {
    const saved = readRequestContext(row);
    expect(readRequestApproval(saved, review()).kind).toBe("pending");
    const approved = { ...review(), coverage: [], approval: { request_version: 1, approval_version: 1, token: "a".repeat(32) } };
    expect(readRequestApproval(saved, approved)).toEqual({ kind: "approved", review: approved });
  });
  it("compares object facts independently of JSON property ordering", () => {
    const savedContext = structuredClone(context); savedContext.lines[0]!.attrs = { fabric: "TEST", colour: "TEST" };
    const response = review(); response.review.state.context = structuredClone(savedContext);
    response.review.state.context.lines[0]!.attrs = { colour: "TEST", fabric: "TEST" };
    expect(readRequestApproval(readRequestContext({ ...row, request_context: savedContext }), response).kind).toBe("pending");
  });
  it("rejects newer versions, changed saved allocation, and unavailable source", () => {
    const saved = readRequestContext(row);
    expect(readRequestApproval(saved, { ...review(), review: { ...review().review, request_version: 2 } }).kind).toBe("unavailable");
    const changed = structuredClone(review()); changed.review.state.context.lines[0]!.qty = 499;
    expect(readRequestApproval(saved, changed).kind).toBe("unavailable");
    expect(readRequestApproval(saved, { available: false, reason: "source_changed", request_version: 1, request_context: context, events: [] }).kind).toBe("unavailable");
  });
});
