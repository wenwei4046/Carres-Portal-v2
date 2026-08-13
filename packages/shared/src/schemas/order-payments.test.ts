import { describe, it, expect } from "vitest";
import {
  recordPaymentInputSchema,
  collectStorageInput,
  isLivePayment,
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

describe("collectStorageInput", () => {
  it("is a payment minus kind (the route forces kind:'storage')", () => {
    const r = collectStorageInput.parse({ amount: 200, paidOn: "2026-06-26", method: "cash" });
    expect(r).toMatchObject({ amount: 200, paidOn: "2026-06-26", method: "cash" });
    expect("kind" in r).toBe(false);
  });

  it("still validates amount + date", () => {
    expect(collectStorageInput.safeParse({ amount: 0, paidOn: "2026-06-26" }).success).toBe(false);
    expect(collectStorageInput.safeParse({ amount: 200, paidOn: "bad" }).success).toBe(false);
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

  // CARD 4 closing slice (0347). A void has been a STAMP since 0343 — the row
  // survives so the history survives — and every reader of this ledger was
  // written when a void DELETED the row.
  it("a VOIDED row is not money — it counts toward nothing", () => {
    const s = summarizePayments(
      [
        p(1000, "deposit"),
        { amount: 1500, kind: "payment", voided_at: "2026-08-13T02:00:00Z" },
        { amount: 150, kind: "storage", voided_at: "2026-08-13T02:00:00Z" },
        p(200, "storage"),
      ],
      5000,
    );
    expect(s.paid).toBe(1200); // 1000 + 200, the two voided rows excluded
    expect(s.byKind).toEqual({ payment: 0, deposit: 1000, storage: 200 });
    expect(s.outstanding).toBe(4000); // 5000 − 1000 (the voided payment is gone)
    expect(s.storageCollected).toBe(200);
  });

  it("isLivePayment is the ONE predicate every reader asks", () => {
    expect(isLivePayment({})).toBe(true);
    expect(isLivePayment({ voided_at: null })).toBe(true);
    expect(isLivePayment({ voided_at: "2026-08-13T02:00:00Z" })).toBe(false);
  });
});
