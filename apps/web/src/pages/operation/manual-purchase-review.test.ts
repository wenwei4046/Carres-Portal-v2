import { describe, expect, it } from "vitest";
import { manualPurchaseReviewDocuments, type ManualPurchaseIssueWall } from "./manual-purchase-review";

function wall(over: Partial<ManualPurchaseIssueWall> = {}): ManualPurchaseIssueWall {
  return {
    demandId: "d1", supplierId: "s1", supplierName: "Supplier", supplierAddress: "Factory address",
    category: "mattress", destinationId: "dest1", destinationName: "Warehouse", destinationAddress: "Warehouse address",
    purpose: "Ready Stock", purposeLabel: "Ready Stock", deliveryDate: "2026-10-20",
    poDate: "2026-09-24", poDeliveryDate: "2026-10-02", poDeliveryWorkingDays: 7, deliveryMethod: "we_collect",
    sku: "M1", item: "Mattress", requestNo: "MPR260924-0001", purchaseRequirement: "Display replacement",
    remainingQty: 2, ...over,
  };
}

describe("Manual Purchase feeds the shared PO review", () => {
  it("retains server dates, addresses, delivery method and the MPR's source and reason", () => {
    const [doc] = manualPurchaseReviewDocuments([wall()]);
    expect(doc).toMatchObject({
      supplierAddress: "Factory address", destinationAddress: "Warehouse address",
      poDate: "2026-09-24", poDeliveryDate: "2026-10-02", poDeliveryWorkingDays: 7, deliveryMethod: "we_collect",
    });
    expect(doc.lines[0]).toMatchObject({ so: null, sourceLabel: "MPR260924-0001", purchaseRequirement: "Display replacement", qty: 2 });
    expect(doc.lines[0].goodsMustArrive).toBe("2026-10-20");
  });

  it("does not replace absent server dates with the requested arrival date", () => {
    const [doc] = manualPurchaseReviewDocuments([wall({ poDate: undefined, poDeliveryDate: undefined })]);
    expect(doc.poDate).toBeNull();
    expect(doc.poDeliveryDate).toBeNull();
    expect(doc.lines[0].goodsMustArrive).toBe("2026-10-20");
  });
});
