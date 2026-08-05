/**
 * C11 · A SOURCE SCAN over the ORDERS-lane files that print an amount owed
 * (Loo's ruling, 2026-07-28).
 *
 * The card counts FIVE call sites and they live in THREE files — the Orders row,
 * its drawer strip and the money dot are all `OperationOrdersControl.tsx`.
 *
 * The type in `packages/shared` is the primary guard and it is stronger than
 * anything here: `OrderActionParties.amount` is a `number`, so neither failure
 * shape can be handed to the words module at all. This file guards the half a
 * type cannot see — a page writing its OWN money string, beside the label
 * rather than through it. That is exactly where the money dot's tooltip lived
 * (`RM ${fmtRM(m.outstanding)} outstanding`), and it is how a rounding
 * formatter would come back.
 *
 * A source scan, not a render test, for the reason this repo has paid for
 * twice: a render test only sees the branches its fixture reaches, and these
 * rules must be true of the whole file or they are not true at all.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { fmtMoney } from "@carres/shared";
import { rm } from "@/lib/format-currency";

const DIR = dirname(fileURLToPath(import.meta.url));

/** The files holding the five surfaces that print what a customer owes. */
const LANE = [
  "OperationOrdersControl.tsx",
  "OperationPayments.tsx",
  "OperationDelivery.tsx",
] as const;

/**
 * The scan is about CODE. Comments come out first, or the tombstone explaining
 * why `fmtRM` was deleted would itself fail the rule that deleted it — the trap
 * Q7 and R8 both hit, and a comment naming a retired thing is precisely what
 * this repo keeps deliberately.
 */
function code(file: string): string {
  return readFileSync(join(DIR, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("C11 · no money figure is rounded", () => {
  it.each(LANE)("%s declares no rounding money formatter", (file) => {
    const src = code(file);
    // `maximumFractionDigits: 0` is the shape that printed RM 1,251 for
    // RM 1,250.50 on four screens. It may not exist in a file that prints money.
    expect(src).not.toMatch(/maximumFractionDigits\s*:\s*0\b/);
  });

  it("`fmtRM` is gone from the lane, definition and callers alike", () => {
    // It was never the generic number formatter it looked like: all four of its
    // call sites were `outstanding`. Measured before deletion, 2026-08-05.
    for (const file of LANE) {
      expect(code(file)).not.toMatch(/\bfmtRM\b/);
    }
  });

  it("no page builds a money string by hand — C14", () => {
    // C11 shipped with ONE hand-built figure left in the lane, and reported it
    // rather than fixing it: the Owing FACET total at
    // `OperationOrdersControl.tsx:3060` read
    //   `RM ${Math.round(owing.rm).toLocaleString("en-MY")}`
    // so the Orders rail printed `RM 74,783` while the Payments desk printed
    // `RM 74,783.00` for the identical figure (both measured live 2026-08-05).
    //
    // C11's own scan could not catch it. It bans `maximumFractionDigits: 0`,
    // and this line rounded with `Math.round` instead — and banning THAT
    // outright is not available either, because the same file counts DAYS with
    // it (`Math.round((d - today) / 86_400_000)`), which is not money and must
    // stay. The card said so explicitly.
    //
    // So the rule is about the SHAPE, not the rounding: a template that
    // interpolates into an `RM ` prefix is a page spelling money for itself,
    // which is exactly what `fmtMoney` exists to make unnecessary. A literal
    // `RM 0` (the storage-exempt confirm text) is untouched — nothing is
    // computed into it.
    for (const file of LANE) {
      expect(code(file)).not.toMatch(/RM\s*\$\{/);
    }
  });

  it("the collect label is reached with a NUMBER, never a formatted string", () => {
    // The compiler already refuses a string; this states the intent in the lane
    // itself, so a reader of these pages sees the rule without leaving them.
    for (const file of LANE) {
      const src = code(file);
      // `amount: rm(...)` / `amount: fmtRM(...)` / `amount: \`RM ...\`` — the
      // three ways a caller re-spells money on its way into the words module.
      expect(src).not.toMatch(/amount\s*:\s*(rm|fmtRM|fmtMoney)\s*\(/);
      expect(src).not.toMatch(/amount\s*:\s*`?\s*RM\s/);
      expect(src).not.toMatch(/collectPillLabel\s*\(\s*(rm|fmtRM|fmtMoney)\s*\(/);
    }
  });
});

describe("C11 · the portal has ONE money spelling", () => {
  it("the web's `rm` IS the shared `fmtMoney`, not a second body", () => {
    // Identity, not agreement. Two implementations that promise to match are
    // how the third one (a rounding one) grew beside them unnoticed.
    expect(rm).toBe(fmtMoney);
  });

  it("spells the live figures the collections desk actually holds", () => {
    // The 28 rows that read `Collect RM RM 11,246.00` on production today.
    expect(fmtMoney(11246)).toBe("RM 11,246.00");
    // Loo's own worked example for the rounding half of the bug.
    expect(fmtMoney(1250.5)).toBe("RM 1,250.50");
  });
});
