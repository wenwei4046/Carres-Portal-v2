import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { orderActionLine, orderActionQueue } from "@carres/shared";

import { BANNED_WORDS, visibleStrings } from "@/test/banned-words";

/**
 * C4 — the collections desk's banned-word guard, and the proof that the money
 * action has ONE spelling across the portal.
 *
 * The page had no test file, and it carried the most `Chase` strings of any
 * surface (a queue name, three queue descriptions, the last-touched stamp, the
 * promise-to-pay hint, the stock note, and the popover title).
 */

const PAGE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "OperationPayments.tsx"),
  "utf8",
);

describe("OperationPayments — no banned word reaches the screen (C4)", () => {
  const strings = visibleStrings(PAGE);

  it("finds strings to check at all (the scan itself must not silently pass)", () => {
    expect(strings.length).toBeGreaterThan(100);
    expect(strings).toContain("Waiting stock");
  });

  for (const [re, why] of BANNED_WORDS) {
    it(`never says ${re.source} — ${why}`, () => {
      expect(strings.filter((s) => re.test(s))).toEqual([]);
    });
  }
});

describe("OperationPayments — the money action has one spelling (C4)", () => {
  it("takes the collect queue word from order-action-words, not from a literal", () => {
    // The card proposed `Call to collect` for this queue and
    // `Call {customer} — collect balance RM X` for the row. COPY-STANDARD's
    // audit table already spells the money action `Collect RM {amount} from
    // {customer}`, Law 4 rung 5 repeats it, and C1 put it in ONE module that
    // the Orders row, its drawer and the Delivery module all read. Two
    // spellings for one action is the exact failure this card exists to end, so
    // the laws won over the card and the conflict is reported to Jess.
    expect(PAGE).toContain('orderActionQueue("collect")');
    expect(orderActionQueue("collect")).toBe("Collect");
  });

  it("names the customer and the amount wherever one order is on screen", () => {
    expect(PAGE).toContain('orderActionLine("collect"');
    expect(
      orderActionLine("collect", { amount: "2,455", customer: "John Tan" }),
    ).toBe("Collect RM 2,455 from John Tan");
  });

  it("spells no money ACTION by hand", () => {
    // A hand-typed label here would drift from the Orders row the day either
    // one is edited, so nothing on this page may start with the verb — the
    // module produces those strings at runtime. `To collect` and `Total to
    // collect` survive on purpose: a filter tab and a summary figure are FACTS
    // (the UI type dictionary), not actions, and they name no party.
    const strings = visibleStrings(PAGE);
    expect(strings.filter((s) => /^Collect\b/.test(s))).toEqual([]);
    expect(strings).not.toContain("Call to collect");
    expect(strings).not.toContain("Ready to chase");
  });

  it("hands the module a bare amount, so the currency word is printed once", () => {
    // Found while wiring this card: every call site passed `rm()`, which
    // already carries `RM ` and two decimals, into a module that adds `RM `
    // itself — so the desk read `Collect RM RM 2,455.00` while the same order's
    // row read `Collect RM 2,455`. One action spelt two ways, which is the very
    // thing C1's shared module exists to make impossible.
    expect(PAGE).not.toMatch(/amount: rm\(/);
    expect(PAGE).not.toMatch(/collectPillLabel\(rm\(/);
    expect(PAGE).toMatch(/amount: rmPlain\(/);
    expect(PAGE).toMatch(/collectPillLabel\(rmPlain\(/);
    // …and the shape `rmPlain` produces is the one the module documents.
    expect(orderActionLine("collect", { amount: "2,455", customer: "John Tan" }))
      .not.toMatch(/RM\s+RM/);
  });

  it("keeps the two message tones in the canonical words (C1's drawer wording)", () => {
    const strings = visibleStrings(PAGE);
    expect(strings).toContain("Remind");
    expect(strings).toContain("Call");
  });
});
