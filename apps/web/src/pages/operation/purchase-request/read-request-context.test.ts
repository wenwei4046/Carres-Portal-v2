import { describe, expect, it } from "vitest";
import type { PurchaseRequestContext } from "@carres/shared";
import { readRequestContext } from "./read-request-context";

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
