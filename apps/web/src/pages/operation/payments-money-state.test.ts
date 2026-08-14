import { describe, it, expect } from "vitest";
import { MONEY_STATE_ORDER, moneyStateOf } from "./payments-money-state";

/**
 * SALES ORDER V2 · CARD 4 closing slice — the collections desk's money state is
 * DERIVED from the one arithmetic and the one clock. These pin the four
 * answers a hand-typed `payment_status` could contradict.
 */
describe("moneyStateOf", () => {
  it("an unpriced order is neither paid nor owing", () => {
    expect(moneyStateOf({ known: false, owing: 0, paid: 0, attention: "none" })).toBe(
      "No price yet",
    );
    // Even with money in and a late clock — a figure nobody knows may not be
    // called overdue.
    expect(moneyStateOf({ known: false, owing: 0, paid: 500, attention: "late" })).toBe(
      "No price yet",
    );
  });

  it("nothing outstanding reads Paid, whatever the clock says", () => {
    expect(moneyStateOf({ known: true, owing: 0, paid: 5000, attention: "late" })).toBe("Paid");
  });

  it("past the T−1 final deadline and still owing reads Overdue", () => {
    expect(moneyStateOf({ known: true, owing: 3500, paid: 1500, attention: "late" })).toBe(
      "Overdue",
    );
  });

  it("part-paid before the deadline reads Partial; nothing in reads Unpaid", () => {
    expect(moneyStateOf({ known: true, owing: 3500, paid: 1500, attention: "t2" })).toBe(
      "Partial",
    );
    expect(moneyStateOf({ known: true, owing: 5000, paid: 0, attention: "t3" })).toBe("Unpaid");
  });

  it("the facet orders the states that need a call first", () => {
    expect(MONEY_STATE_ORDER).toEqual([
      "Overdue",
      "Unpaid",
      "Partial",
      "Paid",
      "No price yet",
    ]);
  });
});
