import { describe, expect, it } from "vitest";
import { likelyDuplicatePayments, type ExistingPayment } from "./payment-duplicate";

function pay(over: Partial<ExistingPayment>): ExistingPayment {
  return {
    id: over.id ?? "p1", receipt_no: over.receipt_no ?? "RC-1",
    amount: over.amount ?? 500, paid_on: over.paid_on ?? "2026-09-08",
    voided_at: over.voided_at ?? null, reference: over.reference ?? null,
    method: over.method ?? "bank",
  };
}

describe("the §5 likely-duplicate check", () => {
  it("same amount on the same day is a likely duplicate", () => {
    const hits = likelyDuplicatePayments([pay({ id: "old" })],
      { amount: 500, paidOn: "2026-09-08" });
    expect(hits.map((h) => h.id)).toEqual(["old"]);
  });
  it("the same slip keyed two days later still matches", () => {
    expect(likelyDuplicatePayments([pay({ id: "old", paid_on: "2026-09-06" })],
      { amount: 500, paidOn: "2026-09-08" })).toHaveLength(1);
    // …but not a week later.
    expect(likelyDuplicatePayments([pay({ id: "old", paid_on: "2026-09-01" })],
      { amount: 500, paidOn: "2026-09-08" })).toHaveLength(0);
  });
  it("an identical reference matches even on a different amount, and ranks first", () => {
    const hits = likelyDuplicatePayments([
      pay({ id: "same-amount", amount: 500, reference: "OTHER" }),
      pay({ id: "same-ref", amount: 250, reference: "MBB-4471" }),
    ], { amount: 500, paidOn: "2026-09-08", reference: "mbb-4471" });
    expect(hits.map((h) => h.id)).toEqual(["same-ref", "same-amount"]);
  });
  it("a VOIDED payment is not money and never matches", () => {
    expect(likelyDuplicatePayments([pay({ id: "dead", voided_at: "2026-09-08" })],
      { amount: 500, paidOn: "2026-09-08" })).toHaveLength(0);
  });
  it("a different amount on a different day is not a duplicate", () => {
    expect(likelyDuplicatePayments([pay({ amount: 400 })],
      { amount: 500, paidOn: "2026-09-08" })).toHaveLength(0);
    expect(likelyDuplicatePayments([], { amount: 500, paidOn: "2026-09-08" })).toHaveLength(0);
  });
  it("an empty reference on either side is never a match by reference", () => {
    expect(likelyDuplicatePayments([pay({ amount: 999, reference: "  " })],
      { amount: 500, paidOn: "2026-09-08", reference: "" })).toHaveLength(0);
  });
});
