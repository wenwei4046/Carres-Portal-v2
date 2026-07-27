import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { orderActionQueue } from "@carres/shared";

import { BANNED_WORDS, visibleStrings } from "@/test/banned-words";

/**
 * C4 — the Purchase cockpit's banned-word guard, and the proof that its stage-②
 * words come from the one shared module rather than from this file.
 *
 * The page had NO test file at all, which is why five visible `Chase` strings
 * lived on it for weeks after Jess banned the word. Same shape as C1's drawer
 * guard; the scanner is shared (`src/test/banned-words.ts`).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(join(HERE, "OperationPurchase.tsx"), "utf8");
const SETTINGS = readFileSync(
  join(HERE, "components", "PurchaseSettingsSheet.tsx"),
  "utf8",
);

describe("OperationPurchase — no banned word reaches the screen (C4)", () => {
  const strings = visibleStrings(PAGE);

  it("finds strings to check at all (the scan itself must not silently pass)", () => {
    expect(strings.length).toBeGreaterThan(100);
    expect(strings).toContain("Send POs");
  });

  for (const [re, why] of BANNED_WORDS) {
    it(`never says ${re.source} — ${why}`, () => {
      expect(strings.filter((s) => re.test(s))).toEqual([]);
    });
  }
});

describe("PurchaseSettingsSheet — no banned word reaches the screen (C4)", () => {
  const strings = visibleStrings(SETTINGS);

  it("finds strings to check at all", () => {
    expect(strings.length).toBeGreaterThan(20);
  });

  for (const [re, why] of BANNED_WORDS) {
    it(`never says ${re.source} — ${why}`, () => {
      expect(strings.filter((s) => re.test(s))).toEqual([]);
    });
  }
});

describe("OperationPurchase — stage ② speaks the shared words (C4)", () => {
  it("takes its queue word from order-action-words, never from a literal here", () => {
    // The facet row, the middle-list header and the calendar lens must all read
    // the SAME word. They do that by asking the module, so a rename in
    // COPY-STANDARD lands everywhere at once. A literal here would be a second
    // home for the word — rule 8's failure with an extra step.
    expect(PAGE).toContain('orderActionQueue("confirm_ready_date")');
    expect(PAGE).not.toContain('"Confirm ready date"');
  });

  it("names the factory on the detail pane, because one PO is on screen", () => {
    // Queue = party-free (`Confirm ready date`); one row = party-named
    // (`Call Ohana — confirm ready date`). C1's split, applied to this page.
    expect(PAGE).toContain('orderActionLine("confirm_ready_date"');
    expect(orderActionQueue("confirm_ready_date")).toBe("Confirm ready date");
  });

  it("labels the WhatsApp button as a CHANNEL, not as a second action", () => {
    // COPY-STANDARD's verb table: a button that opens WhatsApp is HOW, not
    // WHAT. The action is the Call named in the pane header above it.
    expect(visibleStrings(PAGE)).toContain("Open WhatsApp");
  });
});
