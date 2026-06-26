import { describe, it, expect } from "vitest";
import {
  recordPaymentInputSchema,
  summarizePayments,
  type PaymentKind,
} from "./order-payments";

describe("recordPaymentInputSchema", () => {
  it("accepts a valid payment + defaults method/kind", () => {
    const r = recordPaymentInputSchema.parse({ amount: 1500, paidOn: "2026-06-26" });
    expect(r).toMatchObject({ amount: 1500, paidOn: "2026-06-26", method: "cash", kind: "payment" });
  });

  it("rejects a non-positive amount", () => {
    expect(recordPaymentInputSchema.safeParse({ amount: 0, paidOn: "2026-06-26" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ amount: -5, paidOn: "2026-06-26" }).success).toBe(false);
  });

  it("rejects a bad date shape", () => {
    expect(recordPaymentInputSchema.safeParse({ amount: 1, paidOn: "26/06/2026" }).success).toBe(false);
  });

  it("rejects an unknown method/kind", () => {
    expect(
      recordPaymentInputSchema.safeParse({ amount: 1, paidOn: "2026-06-26", method: "crypto" }).success,
    ).toBe(false);
  });
});

describe("summarizePayments", () => {
  const p = (amount: number, kind: PaymentKind) => ({ amount, kind });

  it("empty ledger → paid 0, outstanding = bill, storage 0", () => {
    expect(summarizePayments([], 5000)).toEqual({
      paid: 0,
      byKind: { payment: 0, deposit: 0, storage: 0 },
      outstanding: 5000,
      storageCollected: 0,
    });
  });

  it("goods outstanding counts payment + deposit, NOT storage", () => {
    const s = summarizePayments(
      [p(1000, "deposit"), p(1500, "payment"), p(150, "storage")],
      5000,
    );
    expect(s.paid).toBe(2650); // every row
    expect(s.byKind).toEqual({ payment: 1500, deposit: 1000, storage: 150 });
    expect(s.outstanding).toBe(2500); // 5000 − (1000 + 1500), storage excluded
    expect(s.storageCollected).toBe(150);
  });

  it("overpayment floors outstanding at 0 (never negative)", () => {
    expect(summarizePayments([p(8000, "payment")], 5000).outstanding).toBe(0);
  });

  it("bill ≤ 0 (AutoCount no-price order) → outstanding 0", () => {
    expect(summarizePayments([p(1000, "payment")], 0).outstanding).toBe(0);
  });
});
