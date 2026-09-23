import { describe, expect, it } from "vitest";

import { deliveryOrderIssueGate, owedWarning, type DeliveryOrderIssueInput } from "./delivery-order";
import type { FinanceException } from "./finance-exception";
import type { DeliveryPaymentApproval } from "./delivery-payment-approval";

/**
 * C7 — the HARD gate moves onto issuing, re-keyed by the owner ruling of
 * 2026-08-19 (`docs/orders/MASTER.md` §8, SUPERSEDING 2026-08-16 decision A):
 *
 *   Money in full BEFORE delivery. That is the only default.
 *   outstanding = 0, OR an APPROVED Delivery Payment Approval
 *   AND no OPEN Finance exception (0355 unchanged — the second blocker)
 *
 * What may never happen is the PAPER existing for a trip that is not allowed
 * to run — and after 2026-08-19's incident, an uncollected balance forbids the
 * trip again unless the approver has said otherwise in black and white.
 */

const OK_GATE = {
  goodsReady: true,
  notReadySkus: [] as string[],
  outstanding: 0,
};

const openException = (over: Partial<FinanceException> = {}): FinanceException => ({
  id: "fe-1",
  status: "open",
  reason: "Chargeback under investigation",
  openedAt: "2026-08-16T02:00:00Z",
  clearedAt: null,
  clearEvidence: null,
  ...over,
});

const clearedException = (over: Partial<FinanceException> = {}): FinanceException =>
  openException({
    id: "fe-2",
    status: "cleared",
    clearedAt: "2026-08-16T06:00:00Z",
    clearEvidence: "Bank confirmed the reversal — ref 8821",
    ...over,
  });

const approval = (
  over: Partial<DeliveryPaymentApproval> = {},
): DeliveryPaymentApproval => ({
  id: "pa-1",
  status: "approved",
  requestReason: "Outstation trip — customer pays before unloading",
  requestedAt: "2026-08-19T02:00:00Z",
  decidedAt: "2026-08-19T03:00:00Z",
  decisionReason: "COD by online transfer before unloading",
  ...over,
});

// Typed as the module's own input so the nullable fields stay nullable: without
// this, `typeof BASE` narrows `confirmedDateIso` to `string` from the literal
// below, and `Partial<typeof BASE>` then refuses the `null` overrides the tests
// pass to exercise the refusal branches.
const BASE: DeliveryOrderIssueInput = {
  bookingConfirmed: true,
  confirmedDateIso: "2026-08-20", // a Thursday
  confirmedTimeSlot: "Afternoon (12pm–3pm)",
  gate: OK_GATE,
  financeExceptions: [],
  paymentApprovals: [],
};

const run = (over: Partial<typeof BASE> & { holidays?: string[] } = {}) =>
  deliveryOrderIssueGate({ ...BASE, ...over });

describe("deliveryOrderIssueGate — when the document may exist", () => {
  it("passes when confirmation, calendar, goods and money are met and Finance is silent", () => {
    expect(run()).toEqual({ ok: true, reasons: [], owed: 0 });
  });

  it("refuses without the customer's confirmation", () => {
    expect(run({ bookingConfirmed: false }).ok).toBe(false);
    expect(run({ confirmedDateIso: null }).reasons[0]).toContain(
      "has not confirmed a delivery date and time slot",
    );
  });

  it("refuses a date with no time slot — a date alone is not a confirmation", () => {
    // 0277's CHECK ties the two together; a row missing one predates it.
    expect(run({ confirmedTimeSlot: null }).ok).toBe(false);
  });

  it("refuses goods that are not reserved, and names them", () => {
    const r = run({
      gate: { ...OK_GATE, goodsReady: false, notReadySkus: ["MS-QUEEN-01"] },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("MS-QUEEN-01");
  });

  it("refuses a Sunday and a public holiday — §5's two hard calendar blocks", () => {
    expect(run({ confirmedDateIso: "2026-08-23" }).reasons[0]).toContain("Sunday");
    const holiday = run({
      confirmedDateIso: "2026-08-31",
      holidays: ["2026-08-31"],
    });
    expect(holiday.ok).toBe(false);
    expect(holiday.reasons[0]).toContain("public holiday");
  });

  it("takes the holiday calendar as data, in either shape, and never invents one", () => {
    expect(run({ confirmedDateIso: "2026-08-31" }).ok).toBe(true);
    expect(
      deliveryOrderIssueGate({
        ...BASE,
        confirmedDateIso: "2026-08-31",
        holidays: new Set(["2026-08-31"]),
      }).ok,
    ).toBe(false);
  });
});

/**
 * 0571 . MONEY OWED WARNS (owner, 2026-09-23: "the automatic block when money
 * is still owed becomes a warning"). The gate no longer refuses a balance; it
 * reports the amount as `owed` for a person to confirm. An APPROVED payment
 * approval still covers the balance.
 */
describe("deliveryOrderIssueGate — money owed is a warning, not a refusal", () => {
  it("an outstanding balance with no approval passes the gate and reports what is owed", () => {
    const r = run({ gate: { ...OK_GATE, outstanding: 2455 } });
    expect(r).toEqual({ ok: true, reasons: [], owed: 2455 });
  });

  it("the warning states the amount in RM to the cent", () => {
    expect(owedWarning(1050.5)).toBe(
      "RM 1,050.50 is still outstanding. Confirm to issue the delivery order anyway.",
    );
  });

  it("owed is rounded to the cent, the figure the database compares", () => {
    expect(run({ gate: { ...OK_GATE, outstanding: 1050.505 } }).owed).toBe(1050.51);
  });

  it("an APPROVED payment approval covers the balance, so nothing is owed", () => {
    const r = run({
      gate: { ...OK_GATE, outstanding: 2455 },
      paymentApprovals: [approval()],
    });
    expect(r).toEqual({ ok: true, reasons: [], owed: 0 });
  });

  it("a PENDING or REFUSED request does not cover it", () => {
    const pending = run({
      gate: { ...OK_GATE, outstanding: 2455 },
      paymentApprovals: [approval({ status: "pending", decidedAt: null, decisionReason: null })],
    });
    const refused = run({
      gate: { ...OK_GATE, outstanding: 2455 },
      paymentApprovals: [approval({ status: "refused", decisionReason: "Collect first" })],
    });
    expect(pending.owed).toBe(2455);
    expect(refused.owed).toBe(2455);
  });

  it("paid in full owes nothing", () => {
    expect(run({ paymentApprovals: [] })).toEqual({ ok: true, reasons: [], owed: 0 });
  });

  it("paid alone never issues — the booking gate still refuses without a date", () => {
    // Owner re-confirmed 2026-08-19: 已付清也要有 ETA 才发 DO.
    const r = run({ bookingConfirmed: false, confirmedDateIso: null, confirmedTimeSlot: null });
    expect(r.ok).toBe(false);
  });
});

describe("deliveryOrderIssueGate — the Finance exception is the SECOND blocker (0355 unchanged)", () => {
  it("refuses an OPEN Finance exception even on a fully-paid order", () => {
    const r = run({ financeExceptions: [openException()] });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("Finance is holding this delivery");
    expect(r.reasons[0]).toContain("Chargeback under investigation");
    expect(r.reasons[0]).toContain("Finance clears it");
  });

  it("an approval does NOT clear a Finance judgement — both blockers are independent", () => {
    const r = run({
      gate: { ...OK_GATE, outstanding: 500 },
      paymentApprovals: [approval()],
      financeExceptions: [openException()],
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]).toContain("Finance");
  });

  it("a CLEARED exception removes the block", () => {
    expect(run({ financeExceptions: [clearedException()] }).ok).toBe(true);
  });

  it("holds while ANY one of several is still open", () => {
    const r = run({
      financeExceptions: [clearedException(), openException({ id: "fe-3" })],
    });
    expect(r.ok).toBe(false);
  });

  it("names every open reason — two decisions are two facts, never collapsed", () => {
    const r = run({
      financeExceptions: [
        openException({ id: "a", reason: "Chargeback under investigation" }),
        openException({ id: "b", reason: "Suspected duplicate payment" }),
      ],
    });
    expect(r.reasons[0]).toContain("2 reasons");
    expect(r.reasons[0]).toContain("Chargeback under investigation");
    expect(r.reasons[0]).toContain("Suspected duplicate payment");
  });

  it("reports EVERY reason at once — an operator should not clear them one refusal at a time", () => {
    const r = run({
      bookingConfirmed: false,
      confirmedDateIso: null,
      confirmedTimeSlot: null,
      gate: { goodsReady: false, notReadySkus: ["SOFA-01"], outstanding: 900 },
      financeExceptions: [openException()],
    });
    // Booking, goods and Finance refuse; the 900 owed is a warning (0571).
    expect(r.reasons).toHaveLength(3);
    expect(r.owed).toBe(900);
  });
});

/**
 * THE MANUAL DOOR (card §5) — `Request Delivery Order`. Outstation trips need
 * the paper before a customer-confirmed booking exists; the door walks the
 * SAME gate minus only the booking-confirm requirement.
 */
describe("deliveryOrderIssueGate — the Request Delivery Order door", () => {
  it("issues without a confirmed booking when goods and money are met", () => {
    const r = run({
      waitBookingConfirm: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      confirmedTimeSlot: null,
    });
    expect(r).toEqual({ ok: true, reasons: [], owed: 0 });
  });

  it("reports money owed the same way — the door is not a bypass of the confirmation", () => {
    const r = run({
      waitBookingConfirm: false,
      bookingConfirmed: false,
      confirmedDateIso: null,
      confirmedTimeSlot: null,
      gate: { ...OK_GATE, outstanding: 1200 },
    });
    expect(r).toEqual({ ok: true, reasons: [], owed: 1200 });
  });

  it("still refuses goods and the Finance exception, naming the failing gate", () => {
    const goods = run({
      waitBookingConfirm: false,
      gate: { ...OK_GATE, goodsReady: false, notReadySkus: ["BF-KING-02"] },
    });
    expect(goods.ok).toBe(false);
    expect(goods.reasons[0]).toContain("BF-KING-02");

    const finance = run({
      waitBookingConfirm: false,
      financeExceptions: [openException()],
    });
    expect(finance.ok).toBe(false);
    expect(finance.reasons[0]).toContain("Finance");
  });

  it("a confirmed date that EXISTS is still checked for Sunday and holiday", () => {
    expect(
      run({ waitBookingConfirm: false, confirmedDateIso: "2026-08-23" }).ok,
    ).toBe(false);
  });
});
