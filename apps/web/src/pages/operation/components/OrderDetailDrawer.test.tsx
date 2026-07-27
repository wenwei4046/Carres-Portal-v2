import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BANNED_WORDS, visibleStrings } from "@/test/banned-words";

/**
 * C1 — the drawer's banned-word guard. C4 moved the scanner itself into
 * `src/test/banned-words.ts` so Purchase and Payments could ship the same guard
 * instead of a third copy of the logic, and closed the hole that let
 * `Last chased {date}` through: a JSX text node containing an interpolation was
 * being skipped whole. See that file for the full rationale.
 */

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "OrderDetailDrawer.tsx"),
  "utf8",
);

describe("OrderDetailDrawer — no banned word reaches the screen (C1)", () => {
  const strings = visibleStrings(SRC);

  it("finds strings to check at all (the scan itself must not silently pass)", () => {
    // A regex change that matched nothing would make every assertion below
    // vacuously true — the failure mode a guard must not have.
    expect(strings.length).toBeGreaterThan(200);
    expect(strings.some((s) => s.includes("Logistics"))).toBe(true);
  });

  it("sees JSX text that is followed by an interpolation (C4 — the hole that hid `Last chased {date}`)", () => {
    // The drawer prints `Last message {fmtDate(lastChasedAt)}`. Before C4 the
    // matcher refused any chunk containing a brace, so this whole class of
    // label — the party-named ones — was invisible to the guard.
    expect(strings).toContain("Last message");
  });

  for (const [re, why] of BANNED_WORDS) {
    it(`never says ${re.source} — ${why}`, () => {
      expect(strings.filter((s) => re.test(s))).toEqual([]);
    });
  }
});
