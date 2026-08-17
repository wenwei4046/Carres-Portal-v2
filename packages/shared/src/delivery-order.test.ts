import { describe, expect, it } from "vitest";

import { deliveryOrderIssueGate, type DeliveryOrderIssueInput } from "./delivery-order";
import type { FinanceException } from "./finance-exception";

/**
 * C7 — the HARD gate moves onto issuing (`docs/ORDERS-WORKING-FLOW.md` §5),
 * re-keyed by decision A (owner ruling 2026-08-16, `docs/orders/MASTER.md` §8):
 *
 *   outstanding money does not block the DO
 *   an OPEN Finance exception is the ONLY money blocker
 *   CLEARED removes the block
 *
 * Every refusal here used to sit on CONFIRMING a date, which is the wrong
 * place: a date can be agreed with a customer while the goods are still
 * coming. What may never happen is the PAPER existing for a trip that is not
 * allowed to run — and the only party who can forbid a trip over money is now
 * Finance, explicitly, with a reason.
 */

const OK_GATE = {
  goodsReady: true,
  notReadySkus: [] as string[],
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
};

const run = (over: Partial<typeof BASE> & { holidays?: string[] } = {}) =>
  deliveryOrderIssueGate({ ...BASE, ...over });

describe("deliveryOrderIssueGate — when the document may exist", () => {
  it("passes when confirmation, calendar and goods are met and Finance is silent", () => {
    expect(run()).toEqual({ ok: true, reasons: [] });
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
 * ⭐ DECISION A — the money half of the gate, rewritten from decision B's
 * cases. The old tests proved a balance refused the paper; these prove it no
 * longer can, and that the ONE thing that can is Finance's explicit decision.
 */
describe("deliveryOrderIssueGate — money under decision A", () => {
  it("issues over an outstanding balance — money of any size no longer blocks", () => {
    /* The gate has NOWHERE to express "owes RM 2,455" any more: the money
       fields left the input with the rule. The signature is the guarantee. */
    expect(run().ok).toBe(true);
  });

  it("refuses an OPEN Finance exception, names the reason and who clears it", () => {
    const r = run({ financeExceptions: [openException()] });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("Finance is holding this delivery");
    expect(r.reasons[0]).toContain("Chargeback under investigation");
    expect(r.reasons[0]).toContain("Finance clears it");
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
      gate: { goodsReady: false, notReadySkus: ["SOFA-01"] },
      financeExceptions: [openException()],
    });
    expect(r.reasons).toHaveLength(3);
  });
});
