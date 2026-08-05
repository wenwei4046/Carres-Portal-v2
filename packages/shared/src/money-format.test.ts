import { describe, expect, it } from "vitest";
import { fmtMoney } from "./money-format";
import { collectPillLabel, orderActionLine } from "./order-action-words";

/**
 * C11 · A money figure is the money owed (Loo, 2026-07-28).
 *
 * Two failure shapes reached production through ONE cause — `amount` was a
 * `string`, so a caller could hand the words module something already spelt.
 * Five call sites, two ways of getting it wrong:
 *
 *   Collect RM RM 11,246.00   the collections desk, live on all 28 rows
 *   Collect RM 1,251          four sites, for a ledger holding RM 1,250.50
 *
 * The fix is the TYPE, and these tests are in two halves accordingly. The
 * `@ts-expect-error` block is the real guard — it is checked by `tsc`, not by
 * the runner, and it fails the build if `amount` ever goes back to a string.
 * The runtime half proves the spelling itself.
 */
describe("C11 · the money spelling", () => {
  it("prints two decimals, always — the sen is the point", () => {
    expect(fmtMoney(1250.5)).toBe("RM 1,250.50");
    expect(fmtMoney(1250)).toBe("RM 1,250.00");
    expect(fmtMoney(0.05)).toBe("RM 0.05");
    expect(fmtMoney(0)).toBe("RM 0.00");
  });

  it("NEVER rounds — the shape that made RM 1,250.50 read RM 1,251", () => {
    // Every one of these rounds UP under `maximumFractionDigits: 0`, which is
    // what the deleted `fmtRM` did: the operator asks for more than is owed.
    for (const n of [1250.5, 0.5, 99.99, 56859.45, 1.995]) {
      const out = fmtMoney(n);
      expect(out).toMatch(/\.\d{2}$/);
      // The digits, unformatted, must still be the number we were given.
      expect(Number(out.replace(/^RM /, "").replace(/,/g, ""))).toBeCloseTo(n, 2);
    }
  });

  it("carries exactly ONE currency marker", () => {
    for (const n of [0, 1250.5, 11246]) {
      expect(fmtMoney(n).match(/RM/g)).toHaveLength(1);
    }
  });

  it("separates thousands, and survives a figure nobody priced", () => {
    expect(fmtMoney(11246)).toBe("RM 11,246.00");
    expect(fmtMoney(1234567.89)).toBe("RM 1,234,567.89");
    // A NaN on a screen an operator phones a customer from is worse than a zero.
    expect(fmtMoney(Number.NaN)).toBe("RM 0.00");
  });
});

describe("C11 · the two failures cannot come back", () => {
  it("the collect label doubles no marker and drops no sen", () => {
    expect(collectPillLabel(11246)).toBe("Collect RM 11,246.00");
    expect(collectPillLabel(1250.5)).toBe("Collect RM 1,250.50");
    expect(orderActionLine("collect", { amount: 1250.5, customer: "John Tan" })).toBe(
      "Collect RM 1,250.50 from John Tan",
    );

    // The double-prefix, stated as the shape rather than as one string: no
    // money label may ever contain `RM` twice.
    for (const label of [
      collectPillLabel(11246),
      orderActionLine("collect", { amount: 11246, customer: "John Tan" }),
    ]) {
      expect(label.match(/RM/g)).toHaveLength(1);
      expect(label).not.toMatch(/RM\s+RM/);
    }
  });

  it("null is still 'we do not know' and zero is still a figure", () => {
    // These are DIFFERENT answers and the number type must not collapse them:
    // an unpriced order names no amount; an order owing nothing says so.
    expect(collectPillLabel(null)).toBe("Collect");
    expect(collectPillLabel(undefined)).toBe("Collect");
    expect(collectPillLabel(0)).toBe("Collect RM 0.00");
    expect(orderActionLine("collect", { customer: "John Tan" })).toBe(
      "Collect from John Tan",
    );
  });

  it("the amount is a NUMBER — the guard tsc enforces, not the runner", () => {
    // Each line below is the exact mistake a live screen made. They compile only
    // if `amount` has gone back to a string, and then `@ts-expect-error` becomes
    // the unused-directive error TS2578 and the BUILD fails. That is the whole
    // reason this card changed a type instead of five call sites.

    // @ts-expect-error — an already-`RM`-prefixed string (the Payments desk).
    collectPillLabel("RM 11,246.00");
    // @ts-expect-error — a pre-formatted digit string (the old contract).
    collectPillLabel("11,246");
    // @ts-expect-error — the same, through the row line.
    orderActionLine("collect", { amount: "RM 1,250.50", customer: "John Tan" });
    // @ts-expect-error — a rounded string (what the four `fmtRM` sites passed).
    orderActionLine("collect", { amount: "1,251", customer: "John Tan" });

    // A number is accepted, which is what makes the four above meaningful.
    expect(collectPillLabel(11246)).toBe("Collect RM 11,246.00");
  });
});
