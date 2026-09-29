import { describe, expect, it } from "vitest";
import { PURCHASE_RETURN_WORK_RULE, type PurchaseReturnDetail } from "@carres/shared";
import { purchaseReturnWorkResult } from "./purchase-return-work";

const pr = (over: Partial<PurchaseReturnDetail> = {}): PurchaseReturnDetail => ({
  id: "pr1", pr_no: "PR-1", pr_doc_date: "2026-09-29T02:00:00Z", supplier_id: "s", supplier_name: "Hooka", supplier_claim_id: "c1",
  claim_no: "SC-1", grn_no: null, sent_at: null, confirmed_pickup_date: "2026-10-01", sends: [], confirmations: [],
  units: [{ unit_id: "U1-000-001", po_id: null, category: null, item: null, item_spec: null, pickup_location: null, return_to: null, collected_by: null, actual_pickup_date: null, supplier_received_date: null, evidence: [] }],
  ...over,
});

describe("Purchase Return Work completion facts", () => {
  it("issue closes on a return existing for the claim", () => {
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.issue, { returnIds: [] })).toBeNull();
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.issue, { returnIds: ["pr1"] })).toBe("purchase_returns=pr1");
  });
  it("send closes on the ledger row", () => {
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.send, pr())).toBeNull();
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.send, pr({ sends: [{ id: "d", channel: "email", recipient: "x", sent_at: "2026-09-29T03:00:00Z", sent_by_name: null }] }))).toBe("document_sends=purchase_return:pr1");
  });
  it("the day-before check closes on a confirmation for the current date", () => {
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.confirmTomorrowsPickup, pr())).toBeNull();
    const confirmed = pr({ confirmations: [{ confirmed_pickup_date: "2026-10-01", evidence: "Ah Seng", recorded_at: "2026-09-30T02:00:00Z", recorded_by_name: null }] });
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.confirmTomorrowsPickup, confirmed)).toBe("purchase_return_pickup_confirmations=2026-09-30T02:00:00Z");
  });
  it("a missed pickup closes on a collection or a new date not yet passed", () => {
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.pickupMissed, pr(), "2026-10-02")).toBeNull();
    const collected = pr({ units: [{ ...pr().units[0]!, actual_pickup_date: "2026-10-01T02:00:00Z" }] });
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.pickupMissed, collected, "2026-10-02")).toBe("stock_outbound=collected");
    const moved = pr({ confirmed_pickup_date: "2026-10-05", confirmations: [{ confirmed_pickup_date: "2026-10-05", evidence: "x", recorded_at: "2026-10-02T02:00:00Z", recorded_by_name: null }] });
    expect(purchaseReturnWorkResult(PURCHASE_RETURN_WORK_RULE.pickupMissed, moved, "2026-10-02")).toBe("purchase_return_pickup_confirmations=2026-10-02T02:00:00Z");
  });
});
