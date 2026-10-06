import { describe, expect, it } from "vitest";
import { SUPPLIER_CLAIM_WORK_RULE } from "@carres/shared";
import { supplierClaimWorkResult } from "./supplier-claim-work";

/** The claim fact that closes each Work rule — and nothing else closes it. */
describe("supplierClaimWorkResult", () => {
  it("closes the send occurrence only on a confirmed send", () => {
    expect(supplierClaimWorkResult(SUPPLIER_CLAIM_WORK_RULE.issueClaim, { sent: false, replyId: null })).toBeNull();
    expect(supplierClaimWorkResult(SUPPLIER_CLAIM_WORK_RULE.issueClaim, { sent: true, replyId: null })).toBe("document_sends=supplier_claim");
  });
  it("closes the reply chase and the approver's decision only on a recorded reply", () => {
    for (const rule of [SUPPLIER_CLAIM_WORK_RULE.obtainReply, SUPPLIER_CLAIM_WORK_RULE.noReplyDecision]) {
      expect(supplierClaimWorkResult(rule, { sent: true, replyId: null })).toBeNull();
      expect(supplierClaimWorkResult(rule, { sent: true, replyId: "r1" })).toBe("supplier_claim_replies=r1");
    }
  });
  it("records nothing for an unknown claim or rule", () => {
    expect(supplierClaimWorkResult(SUPPLIER_CLAIM_WORK_RULE.obtainReply, null)).toBeNull();
    expect(supplierClaimWorkResult("repair_order.issue", { sent: true, replyId: "r1" })).toBeNull();
  });
});
