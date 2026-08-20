import { describe, expect, it } from "vitest";
import {
  financeExceptionHolds,
  financeExceptionReason,
  isOpenFinanceException,
  openFinanceExceptions,
  type FinanceException,
} from "./finance-exception";

const open = (over: Partial<FinanceException> = {}): FinanceException => ({
  id: "fe-1",
  status: "open",
  reason: "Chargeback under investigation",
  openedAt: "2026-08-16T02:00:00Z",
  clearedAt: null,
  clearEvidence: null,
  ...over,
});

const cleared = (over: Partial<FinanceException> = {}): FinanceException =>
  open({
    id: "fe-2",
    status: "cleared",
    clearedAt: "2026-08-16T06:00:00Z",
    clearEvidence: "Bank confirmed the reversal — ref 8821",
    ...over,
  });

describe("financeExceptionHolds — the ONE money blocker", () => {
  it("holds nothing when Finance has opened nothing", () => {
    expect(financeExceptionHolds([])).toBe(false);
  });

  it("holds while an exception is open", () => {
    expect(financeExceptionHolds([open()])).toBe(true);
  });

  it("stops holding once the exception is cleared", () => {
    expect(financeExceptionHolds([cleared()])).toBe(false);
  });

  it("keeps holding while ANY one of several is still open", () => {
    expect(financeExceptionHolds([cleared(), open({ id: "fe-3" })])).toBe(true);
  });

  it("releases only when every exception is cleared", () => {
    expect(financeExceptionHolds([cleared(), cleared({ id: "fe-4" })])).toBe(false);
  });
});

/**
 * ⭐ THE RULING'S WHOLE POINT. These are the cases the retired gate refused and
 * this one must not: an outstanding balance is a fact, not a decision.
 */
describe("an outstanding balance is not a blocker", () => {
  it("takes no money argument at all — the signature is the guarantee", () => {
    /* If this file ever needs a balance to answer the question, the change that
       made it necessary is the one that is wrong. The predicate reads exactly
       one input: what Finance decided. */
    expect(financeExceptionHolds.length).toBe(1);
  });

  it("answers false for an order with no exception, however much is owed", () => {
    /* There is nowhere in this call to express "owes RM 5,000" — and that is
       the correction: money of any size, of any age, does not hold the door. */
    expect(financeExceptionHolds([])).toBe(false);
  });
});

describe("openFinanceExceptions", () => {
  it("returns only the open ones, in the order given", () => {
    const a = open({ id: "a" });
    const b = open({ id: "b", reason: "Suspected duplicate payment" });
    expect(openFinanceExceptions([a, cleared(), b]).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("does not collapse two open reasons into one", () => {
    /* Two Finance reasons are two decisions; hiding the second hides work from
       the person who has to resolve it. */
    expect(openFinanceExceptions([open({ id: "a" }), open({ id: "b" })])).toHaveLength(2);
  });

  it("is empty when nothing is open", () => {
    expect(openFinanceExceptions([cleared()])).toEqual([]);
  });
});

describe("isOpenFinanceException", () => {
  it("reads the status and nothing else", () => {
    expect(isOpenFinanceException(open())).toBe(true);
    expect(isOpenFinanceException(cleared())).toBe(false);
  });
});

describe("financeExceptionReason — a refusal names what closes it", () => {
  it("says nothing when nothing holds", () => {
    expect(financeExceptionReason([])).toBeNull();
    expect(financeExceptionReason([cleared()])).toBeNull();
  });

  it("names the reason and who clears it", () => {
    expect(financeExceptionReason([open()])).toBe(
      "Finance is holding this delivery: Chargeback under investigation — Finance clears it.",
    );
  });

  it("names every open reason when there are several", () => {
    const said = financeExceptionReason([
      open({ id: "a", reason: "Chargeback under investigation" }),
      open({ id: "b", reason: "Suspected duplicate payment" }),
    ]);
    expect(said).toContain("2 reasons");
    expect(said).toContain("Chargeback under investigation");
    expect(said).toContain("Suspected duplicate payment");
  });

  it("never returns an empty string — a caller cannot forget to check null", () => {
    expect(financeExceptionReason([])).not.toBe("");
  });
});
