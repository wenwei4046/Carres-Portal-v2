import { describe, expect, it } from "vitest";
import type { PurchaseRequestContext } from "@carres/shared";
import type { PurchaseRequestRow } from "@/lib/queries";
import { prepareContextIssueReview, contextIssueDistributionValid } from "./context-issue-review";
import { manualPurchaseReviewDocuments, type ManualPurchaseIssueWall } from "../manual-purchase-review";
import { poReviewDraftLines } from "../so-batch/po-review-draft";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function setup(rs = true) {
  const context: PurchaseRequestContext = { version: 1, origin: rs ? "stock_request" : "manual", purpose: rs ? "ready_stock" : "general_purchase", proceedDate: "2026-10-18", stockDeliveryDate: rs ? "2026-12-01" : null, serviceCaseId: null, reason: rs ? null : "company_use", companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "",
    recipients: rs ? [] : [{ id: id(1), name: "TEST recipient", company: "", phone: "TEST", method: "self_pickup", deliveryDate: "2026-12-01", addressLine1: "", addressLine2: "", city: "", state: "", postcode: "", buildingType: "", floor: "", lift: null, pickupLocationId: id(3), collectedBy: "TEST" }],
    lines: [{ id: id(4), sku: "TEST", qty: 500, attrs: null, recipientNeeds: rs ? [] : [{ recipientId: id(1), qty: 500 }], stockProposals: [], allocations: [{ id: id(5), destinationId: id(3), supplierDeliveryDate: "2026-11-20", qty: 500, recipients: rs ? [] : [{ recipientId: id(1), qty: 500 }] }] }] };
  const header = { id: id(10), purpose: context.purpose, request_version: 1, request_context: context, proceed_date: context.proceedDate, approved_at: "TEST", approval_version: 1 } as PurchaseRequestRow;
  const wall: ManualPurchaseIssueWall = { demandId: id(20), supplierId: id(7), supplierName: "TEST", category: "mattress", destinationId: id(3), destinationName: "TEST", purpose: context.purpose, purposeLabel: rs ? "Ready Stock" : "General Purchase", deliveryDate: "2026-11-20", sku: "TEST", item: "TEST goods", remainingQty: 498, attrs: null };
  const read = { available: true, review: { request_version: 1, state: { context }, stock_source: [] }, events: [], approval: { request_version: 1, approval_version: 1, token: "a".repeat(32) },
    coverage: [{ demand_id: id(20), kind: "purchase", approved_qty: 500, stock_qty: 0, issued_qty: 2, to_buy: 498, recipients: rs ? [] : [{ recipientId: id(1), qty: 498 }] }] };
  return { header,wall,read };
}
describe("same selected Issue Review with exact current proof", () => {
  it("keeps RS500 approval but explicitly issues1 of remaining498 without a display cap", () => {
    const { header,wall,read } = setup(); const review = prepareContextIssueReview([header],new Map([[header.id,read]]),[wall],id(90));
    expect(review.payload.contextIssue?.requests).toEqual([{ id: header.id, requestVersion: 1, approvalVersion: 1, approvalToken: "a".repeat(32) }]);
    review.payload.contextIssue!.allocations![0].qty = 1;
    expect(contextIssueDistributionValid(review.payload,review.limits)).toBe(true);
    expect(header.request_context).toMatchObject({ lines: [{ qty: 500 }] });
  });
  it("requires an explicit GP recipient cut and rejects overbuy, zero and a foreign recipient", () => {
    const { header,wall,read } = setup(false); const review = prepareContextIssueReview([header],new Map([[header.id,read]]),[wall],id(90));
    const allocation = review.payload.contextIssue!.allocations![0]; allocation.qty = 1;
    expect(contextIssueDistributionValid(review.payload,review.limits)).toBe(false);
    allocation.recipients = [{ recipientId: id(1), qty: 1 }]; expect(contextIssueDistributionValid(review.payload,review.limits)).toBe(true);
    allocation.qty = 499; expect(contextIssueDistributionValid(review.payload,review.limits)).toBe(false);
    allocation.qty = 0; expect(contextIssueDistributionValid(review.payload,review.limits)).toBe(false);
    allocation.qty = 1; allocation.recipients = [{ recipientId: id(99), qty: 1 }]; expect(contextIssueDistributionValid(review.payload,review.limits)).toBe(false);
  });
  it("rejects stale selected quantities or a different header approval without inventing proof", () => {
    const { header,wall,read } = setup();
    expect(() => prepareContextIssueReview([header],new Map([[header.id,read]]),[{ ...wall, remainingQty: 499 }],id(90))).toThrow("Could not be loaded");
    expect(() => prepareContextIssueReview([{ ...header, approval_version: 2 }],new Map([[header.id,read]]),[wall],id(90))).toThrow("Could not be loaded");
  });
  it("merges only proven physical identity on the PDF while retaining both selected demand rows", () => {
    const { wall } = setup(); const walls = [{ ...wall, remainingQty: 1, attrs: { colour: "TEST", size: "TEST" } }, { ...wall, demandId: id(21), remainingQty: 1, attrs: { size: "TEST", colour: "TEST" } }];
    const [document] = manualPurchaseReviewDocuments(walls); expect(document.lines).toHaveLength(2);
    expect(poReviewDraftLines(document)).toMatchObject([{ sku: "TEST", qty: 2, sources: [{ qty: 1 }, { qty: 1 }] }]);
    const [different] = manualPurchaseReviewDocuments([walls[0], { ...walls[1], attrs: { colour: "OTHER", size: "TEST" } }]);
    expect(poReviewDraftLines(different)).toHaveLength(2);
    const [unknown] = manualPurchaseReviewDocuments(walls.map(value => ({ ...value, attrs: undefined })));
    expect(poReviewDraftLines(unknown)).toHaveLength(2);
  });
});
