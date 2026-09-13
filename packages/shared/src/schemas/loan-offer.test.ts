import { describe, it, expect } from "vitest";
import { LOAN_OFFER_EVENTS, loanOfferRecordInput, loanOfferStateOf } from "./loan-offer";

describe("the loan offer record — Delivery MASTER §14.2 (0492)", () => {
  it("the three words are offered · accepted · declined", () => {
    expect(LOAN_OFFER_EVENTS.map((e) => e.label)).toEqual([
      "Loan offered",
      "Customer accepted the loan",
      "Customer declined the loan",
    ]);
  });

  it("an offer says what is offered; a decline says why; an acceptance needs neither", () => {
    expect(loanOfferRecordInput.safeParse({ event: "offered" }).success).toBe(false);
    expect(loanOfferRecordInput.safeParse({ event: "offered", label: "Display sofa" }).success).toBe(true);
    expect(loanOfferRecordInput.safeParse({ event: "declined" }).success).toBe(false);
    expect(loanOfferRecordInput.safeParse({ event: "declined", reason: "Will wait" }).success).toBe(true);
    expect(loanOfferRecordInput.safeParse({ event: "accepted" }).success).toBe(true);
  });

  it("the latest record is the current state — by clock, then by append order", () => {
    expect(loanOfferStateOf([])).toEqual({ state: "none", at: null });
    const state = loanOfferStateOf([
      { event: "offered", recorded_at: "2026-09-13T01:00:00Z", seq: 1 },
      { event: "declined", recorded_at: "2026-09-13T01:00:00Z", seq: 2 },
    ]);
    expect(state.state).toBe("declined");
    expect(
      loanOfferStateOf([
        { event: "offered", recorded_at: "2026-09-13T02:00:00Z" },
        { event: "declined", recorded_at: "2026-09-13T01:00:00Z" },
      ]).state,
    ).toBe("offered");
  });
});
