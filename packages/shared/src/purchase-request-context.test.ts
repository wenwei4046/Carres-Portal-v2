import { describe, expect, it } from "vitest";
import { purchaseRequestContextSchema, type PurchaseRequestContext } from "./purchase-request-context";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const recipient = (n: number) => ({ id: id(n), company: "TEST", name: "TEST recipient", phone: "TEST contact", method: "delivery" as const, deliveryDate: "2026-11-20", addressLine1: "TEST street", addressLine2: "TEST block", city: "TEST city", state: "TEST state", postcode: "TEST", buildingType: "TEST", floor: "100A", lift: "has_lift" as const, pickupLocationId: null, collectedBy: "" });
const context = (): PurchaseRequestContext => ({ version: 1, origin: "manual", purpose: "general_purchase", proceedDate: "2026-10-20", serviceCaseId: null, reason: "purchase_for_others", companyPersonName: "TEST company", projectReference: "", explanation: "", forecastChangeReason: "", recipients: [recipient(1), recipient(2)], lines: [{ id: id(3), sku: "TEST-SKU", qty: 5, attrs: null, recipientNeeds: [{ recipientId: id(1), qty: 3 }, { recipientId: id(2), qty: 2 }], stockProposals: [], allocations: [{ id: id(4), destinationId: id(10), supplierDeliveryDate: "2026-11-10", qty: 3, recipients: [{ recipientId: id(1), qty: 3 }] }, { id: id(5), destinationId: id(11), supplierDeliveryDate: "2026-11-10", qty: 2, recipients: [{ recipientId: id(2), qty: 2 }] }] }] });
describe("approved purchase request context", () => {
  it("keeps same SKU5 split3/2, then stock1 leaves purchase2/2 and recipient need3/2", () => {
    const request = context();
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(true);
    request.lines[0]!.stockProposals = [{ id: id(20), locationId: id(10), destinationId: id(10), qty: 1, recipients: [{ recipientId: id(1), qty: 1 }] }];
    request.lines[0]!.allocations[0]!.qty = 2;
    request.lines[0]!.allocations[0]!.recipients[0]!.qty = 2;
    const parsed = purchaseRequestContextSchema.parse(request);
    expect(parsed.lines[0]!.qty).toBe(5);
    expect(parsed.lines[0]!.allocations.map((allocation) => allocation.qty)).toEqual([2, 2]);
    expect(parsed.lines[0]!.recipientNeeds.map((need) => need.qty)).toEqual([3, 2]);
    // Same total, wrong recipient: this must fail rather than silently swap the goods.
    request.lines[0]!.stockProposals[0]!.recipients[0]!.recipientId = id(2);
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
  });
  it("keeps recipient need when the whole item is supplied from stock", () => {
    const request = context(); const line = request.lines[0]!;
    line.allocations = [];
    line.stockProposals = [{ id: id(20), locationId: id(10), destinationId: id(10), qty: 5, recipients: [{ recipientId: id(1), qty: 3 }, { recipientId: id(2), qty: 2 }] }];
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(true);
    line.stockProposals[0]!.recipients = [];
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
  });
  it("rejects duplicate stock identities and duplicated recipient rows even when quantities balance", () => {
    const request = context(); const line = request.lines[0]!;
    line.allocations = [];
    line.stockProposals = [{ id: id(20), locationId: id(10), destinationId: id(10), qty: 5, recipients: [{ recipientId: id(1), qty: 1 }, { recipientId: id(1), qty: 2 }, { recipientId: id(2), qty: 2 }] }];
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
    line.stockProposals = [
      { id: id(20), locationId: id(10), destinationId: id(10), qty: 3, recipients: [{ recipientId: id(1), qty: 3 }] },
      { id: id(20), locationId: id(11), destinationId: id(11), qty: 2, recipients: [{ recipientId: id(2), qty: 2 }] },
    ];
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
  });
  it("requires delivery Address2/Floor/Lift without imposing a floor cap", () => {
    expect(purchaseRequestContextSchema.safeParse(context()).success).toBe(true);
    for (const field of ["addressLine2", "floor", "lift"] as const) {
      const request = context();
      Object.assign(request.recipients[0]!, { [field]: field === "lift" ? null : "" });
      expect(purchaseRequestContextSchema.safeParse(request).success, field).toBe(false);
    }
  });
  it("requires the actual pickup site and collector instead of a delivery address", () => {
    const request = context(); const person = request.recipients[0]!;
    person.method = "self_pickup"; person.addressLine2 = ""; person.floor = ""; person.lift = null;
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
    person.pickupLocationId = id(10); person.collectedBy = "TEST collector";
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(true);
  });
  it("requires the GP reason and its dependent fields", () => {
    const request = context(); request.companyPersonName = "";
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
    request.reason = "other";
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
    request.explanation = "TEST business reason";
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(true);
  });
  it("requires the actual SC and explicit goods without inventing an extra approval gate", () => {
    const request = context(); Object.assign(request, { purpose: "service_case", reason: null, companyPersonName: "" });
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
    request.serviceCaseId = id(30);
    // Existing Jess MPR approval binds the explicit lines; no new decision UUID is invented.
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(true);
  });
  it("accepts manual RS outside forecast quantity caps, without invented recipients or reason", () => {
    const request = context(); Object.assign(request, { purpose: "ready_stock", origin: "stock_request", reason: null, companyPersonName: "", recipients: [] });
    const line = request.lines[0]!; line.qty = 500; line.recipientNeeds = []; line.allocations = [{ ...line.allocations[0]!, qty: 500, recipients: [] }];
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(true);
    request.recipients = [recipient(1)];
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
  });
  it("rejects duplicate IDs, unknown recipients, attachments and impossible dates", () => {
    const request = context(); request.lines[0]!.allocations[1]!.id = id(4);
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
    expect(purchaseRequestContextSchema.safeParse({ ...context(), attachments: ["TEST"] }).success).toBe(false);
    expect(purchaseRequestContextSchema.safeParse({ ...context(), proceedDate: "2026-02-31" }).success).toBe(false);
    request.lines[0]!.allocations[0]!.recipients[0]!.recipientId = id(999);
    expect(purchaseRequestContextSchema.safeParse(request).success).toBe(false);
  });
});
