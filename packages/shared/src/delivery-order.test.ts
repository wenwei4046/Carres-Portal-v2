import { describe, expect, it } from "vitest";

import { deliveryOrderIssueGate, type DeliveryOrderIssueInput } from "./delivery-order";

/**
 * C7 — the HARD gate moves onto issuing (`docs/ORDERS-WORKING-FLOW.md` §5).
 *
 * Every refusal here used to sit on CONFIRMING a date, which is the wrong
 * place: a date can be agreed with a customer while the goods and the money are
 * still coming. What may never happen is the PAPER existing for a trip that is
 * not allowed to run.
 */

const OK_GATE = {
  goodsReady: true,
  notReadySkus: [] as string[],
  balanceReady: true,
  holding: 0,
  storageOwing: 0,
};

// Typed as the module's own input so the nullable fields stay nullable: without
// this, `typeof BASE` narrows `confirmedDateIso` to `string` from the literal
// below, and `Partial<typeof BASE>` then refuses the `null` overrides the tests
// pass to exercise the refusal branches.
const BASE: DeliveryOrderIssueInput = {
  bookingConfirmed: true,
  confirmedDateIso: "2026-08-20", // a Thursday
  confirmedTimeSlot: "Afternoon (12pm–3pm)",
  gate: OK_GATE,
};

const run = (over: Partial<typeof BASE> & { holidays?: string[] } = {}) =>
  deliveryOrderIssueGate({ ...BASE, ...over });

describe("deliveryOrderIssueGate — when the document may exist", () => {
  it("passes when all four of §3's conditions are met", () => {
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

  it("refuses money that is still owed, and says how much", () => {
    const r = run({
      gate: { ...OK_GATE, balanceReady: false, holding: 2455 },
    });
    expect(r.ok).toBe(false);
    expect(r.reasons[0]).toContain("RM 2455.00");
  });

  it("names an uncollected STORAGE fee as storage, not as a balance (C9)", () => {
    const r = run({
      gate: { ...OK_GATE, balanceReady: false, holding: 150, storageOwing: 150 },
    });
    expect(r.reasons[0]).toContain("Storage fee of RM 150.00");
    expect(r.reasons[0]).toContain("a manager releases the delivery");
  });

  it("names BOTH when both are short", () => {
    const r = run({
      gate: { ...OK_GATE, balanceReady: false, holding: 2605, storageOwing: 150 },
    });
    expect(r.reasons[0]).toContain("RM 2455.00 outstanding");
    expect(r.reasons[0]).toContain("RM 150.00 of storage fee");
  });

  it("a manager's release passes the gate — that is what a release is for", () => {
    // `balanceReady` is `!holds`, and C9's release lifts the hold while the
    // money stays owed. The paper is allowed; the collection stays open.
    expect(run({ gate: { ...OK_GATE, balanceReady: true, storageOwing: 150 } }).ok)
      .toBe(true);
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

  it("reports EVERY reason at once — an operator should not clear them one refusal at a time", () => {
    const r = run({
      bookingConfirmed: false,
      confirmedDateIso: null,
      confirmedTimeSlot: null,
      gate: {
        goodsReady: false,
        notReadySkus: ["SOFA-01"],
        balanceReady: false,
        holding: 1000,
        storageOwing: 0,
      },
    });
    expect(r.reasons).toHaveLength(3);
  });
});
