import { describe, it, expect } from "vitest";
import { TOAST } from "./toast-copy";

describe("TOAST", () => {
  it("approveRefund formats with title segment", () => {
    expect(TOAST.approveRefund("Refund · RM 2,400 · Damaged")).toBe(
      "Approved refund · Refund",
    );
  });
  it("rejectApproval handles new_dealer", () => {
    expect(
      TOAST.rejectApproval("new_dealer", "New dealer · Sleep Studio"),
    ).toBe("Rejected new_dealer · New dealer");
  });
  it("inviteSuccess formats name", () => {
    expect(TOAST.inviteSuccess("Sleep Studio")).toBe(
      "Sleep Studio invited · approval queued",
    );
  });
  it("approveNewDealer formats name", () => {
    expect(TOAST.approveNewDealer("Sleep Studio")).toBe(
      "Sleep Studio approved · now active",
    );
  });
  it("suspendSuccess + reactivateSuccess + termsUpdated", () => {
    expect(TOAST.suspendSuccess("BedHouse KL")).toBe("BedHouse KL suspended");
    expect(TOAST.reactivateSuccess("BedHouse KL")).toBe(
      "BedHouse KL reactivated",
    );
    expect(TOAST.termsUpdated("BedHouse KL")).toBe(
      "Credit terms updated · BedHouse KL",
    );
  });
});
