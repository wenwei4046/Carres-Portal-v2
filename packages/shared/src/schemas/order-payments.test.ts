import { describe, it, expect } from "vitest";
import {
  recordPaymentInputSchema,
  collectStorageInput,
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

  // 0343 turned void from a DELETE into a STAMP, so a reversed payment is still
  // in the array the UI hands us. Before this, the ledger reported money the
  // customer had been given back.
  describe("voided rows (0343 — a void is a stamp, never a delete)", () => {
    const voided = (amount: number, kind: PaymentKind) => ({
      amount,
      kind,
      voidedAt: "2026-08-12T02:00:00Z",
    });

    it("a voided payment is not counted — the order still owes it", () => {
      const s = summarizePayments([p(1000, "deposit"), voided(1500, "payment")], 5000);
      expect(s.paid).toBe(1000);
      expect(s.byKind.payment).toBe(0);
      expect(s.outstanding).toBe(4000); // NOT 2500 — the 1500 was reversed
    });

    it("a voided STORAGE collection un-collects the storage fee", () => {
      // The desk gates delivery on this figure; a reversed collection that still
      // reads as collected opens the gate on money nobody has.
      expect(summarizePayments([voided(150, "storage")], 5000).storageCollected).toBe(0);
    });

    it("negative control — the SAME rows unvoided are counted in full", () => {
      const s = summarizePayments([p(1000, "deposit"), p(1500, "payment"), p(150, "storage")], 5000);
      expect(s.paid).toBe(2650);
      expect(s.outstanding).toBe(2500);
      expect(s.storageCollected).toBe(150);
    });

    it("an absent voidedAt behaves exactly as before (callers not yet updated)", () => {
      expect(summarizePayments([{ amount: 900, kind: "payment" }], 5000).paid).toBe(900);
    });
  });
});
