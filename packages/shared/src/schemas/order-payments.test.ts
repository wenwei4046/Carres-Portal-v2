import { describe, it, expect } from "vitest";
import {
  recordPaymentInputSchema,
  collectStorageInput,
  isLivePayment,
  requiredPaymentReference,
  receivedBeforeInvoice,
  summarizePayments,
  type PaymentKind,
} from "./order-payments";

describe("recordPaymentInputSchema", () => {
  it("accepts a valid payment + defaults kind", () => {
    const r = recordPaymentInputSchema.parse({ amount: 1500, paidOn: "2026-06-26", method: "cash" });
    expect(r).toMatchObject({ amount: 1500, paidOn: "2026-06-26", method: "cash", kind: "payment" });
  });

  it("refuses a payment with no method (0535: never guessed as cash)", () => {
    expect(recordPaymentInputSchema.safeParse({ amount: 1500, paidOn: "2026-06-26" }).success).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(recordPaymentInputSchema.safeParse({ amount: 0, paidOn: "2026-06-26" }).success).toBe(false);
    expect(recordPaymentInputSchema.safeParse({ amount: -5, paidOn: "2026-06-26" }).success).toBe(false);
  });

  it("rejects a bad date shape", () => {
    expect(recordPaymentInputSchema.safeParse({ amount: 1, paidOn: "26/06/2026" }).success).toBe(false);
  });

  // 0476 — a method is a KEY from Settings → Payment. The schema checks the
  // key's shape; whether the method exists and has a money account is the SQL
  // writer's to say (it refuses an unknown or unmapped method with nothing
  // written).
  it("accepts a method key a manager added; refuses a method that is not a key, and an unknown kind", () => {
    expect(
      recordPaymentInputSchema.safeParse({ amount: 1, paidOn: "2026-06-26", method: "probe_wallet" }).success,
    ).toBe(true);
    expect(
      recordPaymentInputSchema.safeParse({ amount: 1, paidOn: "2026-06-26", method: "Grab Pay" }).success,
    ).toBe(false);
    expect(
      recordPaymentInputSchema.safeParse({ amount: 1, paidOn: "2026-06-26", method: "9wallet" }).success,
    ).toBe(false);
    expect(
      recordPaymentInputSchema.safeParse({ amount: 1, paidOn: "2026-06-26", kind: "refund" }).success,
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

  // toEqual, not toMatchObject — it pins the SHAPE. A kind-blind `paid` total
  // was removed here on 2026-08-17 because it had no reader and would have
  // added goods money to a storage collection for whoever first used it. This
  // assertion is what fails if someone adds it back.
  it("empty ledger → outstanding = bill, storage 0, and no kind-blind total", () => {
    expect(summarizePayments([], 5000)).toEqual({
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

describe("requiredPaymentReference (§16, mirrors 0535 + 0551)", () => {
  it("asks a cheque for its number and every card key for its approval code", () => {
    expect(requiredPaymentReference("cheque")).toBe("Cheque number");
    for (const k of ["card", "credit", "Installment", "credit_card", "debit-card"]) {
      expect(requiredPaymentReference(k)).toBe("Approval code");
    }
  });
  it("0551 — a bank transfer and a DuitNow QR payment carry a reference number", () => {
    for (const k of ["bank", "bank_transfer", "Bank Transfer", "duitnow_qr", "duitnow-qr"]) {
      expect(requiredPaymentReference(k)).toBe("Reference number");
    }
  });
  it("leaves cash, online, other and manager-added methods optional", () => {
    for (const k of ["cash", "online", "other", "grab_pay", "", "  ", null, undefined]) {
      expect(requiredPaymentReference(k)).toBeNull();
    }
  });
});

describe("receivedBeforeInvoice", () => {
  it("counts live goods money recorded up to the issue moment, nothing else", () => {
    const rows = [
      { amount: 1000, kind: "deposit" as const, created_at: "2026-09-01T02:00:00Z" },
      { amount: 200.5, kind: "payment" as const, created_at: "2026-09-10T02:00:00Z" },
      { amount: 300, kind: "payment" as const, created_at: "2026-09-02T00:00:00Z", voided_at: "2026-09-03T00:00:00Z" },
      { amount: 150, kind: "storage" as const, created_at: "2026-09-02T00:00:00Z" },
      { amount: 800, kind: "payment" as const, created_at: "2026-09-20T00:00:00Z" },
    ];
    expect(receivedBeforeInvoice(rows, "2026-09-10T02:00:00Z")).toBe(1200.5);
    expect(receivedBeforeInvoice(rows, "2026-08-01T00:00:00Z")).toBe(0);
  });
});
