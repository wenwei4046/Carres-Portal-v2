import { describe, expect, it } from "vitest";
import type { PurchaseRequestContext } from "@carres/shared";
import { changeRequestPurpose, recipientBalance, removeRequestRecipient, requestLineBalance, setRecipientQuantity, type RequestLine } from "./purchase-request-draft";

const line = (): RequestLine => ({
  id: "line", sku: "TEST-SKU", qty: 5, attrs: { fabric: "TEST" },
  recipientNeeds: [{ recipientId: "a", qty: 3 }, { recipientId: "b", qty: 2 }],
  stockProposals: [{ id: "stock", locationId: "site", destinationId: "destination", qty: 1, recipients: [{ recipientId: "a", qty: 1 }] }],
  allocations: [{ id: "buy", destinationId: "destination", supplierDeliveryDate: "2026-11-17", qty: 4, recipients: [{ recipientId: "a", qty: 2 }, { recipientId: "b", qty: 2 }] }],
});
const context = (): PurchaseRequestContext => ({
  version: 1, origin: "manual", purpose: "general_purchase", proceedDate: "2026-10-17",
  serviceCaseId: null, reason: "purchase_for_others", companyPersonName: "TEST", projectReference: "TEST project", explanation: "", forecastChangeReason: "",
  recipients: ["a", "b"].map((id) => ({ id, company: "", name: `TEST ${id}`, phone: "TEST", method: "self_pickup", deliveryDate: "2026-11-17", addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: "site", collectedBy: "TEST" })),
  lines: [line()],
});

describe("purchase request draft allocation", () => {
  it("preserves the full 3/2 need when stock answers one of five pieces", () => {
    const item = line();
    expect(requestLineBalance(item)).toEqual({ stock: 1, buy: 4, left: 0 });
    expect(recipientBalance(item, "a")).toBe(0);
    expect(recipientBalance(item, "b")).toBe(0);
    expect(item.recipientNeeds).toEqual([{ recipientId: "a", qty: 3 }, { recipientId: "b", qty: 2 }]);
  });
  it("shows wrong-recipient allocations even if the overall five pieces balance", () => {
    const item = line();
    item.allocations[0].recipients = [{ recipientId: "b", qty: 4 }];
    expect(requestLineBalance(item).left).toBe(0);
    expect(recipientBalance(item, "a")).toBe(2);
    expect(recipientBalance(item, "b")).toBe(-2);
  });
  it("retains over-allocation so it can be corrected instead of silently cutting an assignment", () => {
    const item = line();
    item.stockProposals[0].qty = 3;
    expect(requestLineBalance(item).left).toBe(-2);
    expect(item.allocations[0].qty).toBe(4);
  });
  it("removes only the named recipient assignments, retaining original totals and configuration", () => {
    const original = context();
    const next = removeRequestRecipient(original, "a");
    expect(next.recipients.map((recipient) => recipient.id)).toEqual(["b"]);
    expect(next.lines[0].recipientNeeds).toEqual([{ recipientId: "b", qty: 2 }]);
    expect(next.lines[0].stockProposals[0].recipients).toEqual([]);
    expect(next.lines[0].allocations[0].recipients).toEqual([{ recipientId: "b", qty: 2 }]);
    expect(next.lines[0].qty).toBe(5);
    expect(next.lines[0].attrs).toEqual({ fabric: "TEST" });
    expect(original.lines[0].recipientNeeds).toHaveLength(2);
  });
  it("turns a zero recipient quantity into an unassigned gap without duplicating the recipient", () => {
    const needs = line().recipientNeeds;
    expect(setRecipientQuantity(needs, "a", 4)).toEqual([{ recipientId: "b", qty: 2 }, { recipientId: "a", qty: 4 }]);
    expect(setRecipientQuantity(needs, "a", 0)).toEqual([{ recipientId: "b", qty: 2 }]);
  });
  it("does not carry GP identity or final recipients into a stock request", () => {
    const next = changeRequestPurpose(context(), "ready_stock");
    expect(next.origin).toBe("stock_request");
    expect(next.reason).toBeNull();
    expect(next.companyPersonName).toBe("");
    expect(next.recipients).toEqual([]);
    expect(next.lines[0].recipientNeeds).toEqual([]);
    expect(next.lines[0].stockProposals).toEqual([]);
    expect(next.lines[0].allocations[0].recipients).toEqual([]);
    expect(requestLineBalance(next.lines[0]).left).toBe(1);
  });
  it("requires fresh Case capture when switching away from SC", () => {
    const original = context();
    original.purpose = "service_case";
    original.serviceCaseId = "case";
    const next = changeRequestPurpose(original, "general_purchase");
    expect(next.serviceCaseId).toBeNull();
    expect(next.reason).toBeNull();
    expect(next.lines[0]).toEqual(original.lines[0]);
  });
});
