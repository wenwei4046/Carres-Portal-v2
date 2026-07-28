/**
 * A SOURCE SCAN over `components/kit/**` (D0.5a, extended by D0.5b).
 *
 * The lesson this line already paid for: *"a source scan beats a render test
 * for this file — a render test only sees the branches its fixture reaches."*
 * These rules are true of the whole directory or they are not true at all, so
 * they are asserted against the text, not against a tree.
 *
 * **What D0.5b changed here, and why it is not a loosening.** D0.5a's spacing
 * rule was *"only the six steps present in BOTH Q1 candidates"* — a safety
 * property that existed because Q1 was open. Q1 is frozen (Candidate A, Jess
 * 2026-07-28), so the rule is now *"only the eight steps of the frozen scale"*,
 * read from `SPACING_SCALE` in `tokens.ts` so the law's record and the scan
 * cannot drift apart. Two of the eight (2 and 6) are new, and both were already
 * legal under Candidate A.
 *
 * Three rules are new: no `font-bold` (Q3 deleted 700 into 600), the z-index
 * ladder lives in exactly one file (§4.4), and there is exactly one calendar.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPACING_SCALE } from "./tokens";

const DIR = dirname(fileURLToPath(import.meta.url));
const FILES = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));

/**
 * The scan is about CODE, so the comments come out first. Without this, a file
 * that EXPLAINS a banned value — "`font-bold` is dead", "the old `#F5F1EA`" —
 * fails the rule it is documenting, and the fix people reach for is to stop
 * writing the explanation.
 */
const read = (f: string) =>
  readFileSync(join(DIR, f), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/**
 * §4.1's frozen scale, as Tailwind numeric suffixes. Read from `tokens.ts`,
 * never retyped, so the law's record and this scan cannot drift.
 *
 * `0` is added here and is not a step: it is the ABSENCE of spacing (`p-0` on a
 * table cell), which no scale needs to name.
 */
const SAFE_STEPS = new Set(["0", ...SPACING_SCALE.map((s) => s.tailwind)]);

/**
 * **The extraction allowance — D0.5c, and it may only ever shrink.**
 *
 * `PageShell` was EXTRACTED from `ListPageShell`, which was extracted from the
 * Orders page. Its card forbids a redesign, and three of the live shell's
 * paddings (`pb-5` 20 · `py-2.5` / `pb-2.5` 10) plus one arbitrary caption size
 * pre-date the frozen scale. Snapping them here would move pixels on the page
 * this card is only allowed to re-frame — so they come across as they are,
 * NAMED, with the card that fixes them written down.
 *
 * **D6 rebuilds the Orders bands (7 → 3) and owns that fix.** A file may not be
 * added to this list without a card; the list going up is the failure it exists
 * to make visible.
 */
const EXTRACTED_UNTIL_D6 = new Set(["PageShell.tsx"]);
const SPACING_RE = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(\[[^\]]+\]|[\d.]+)\b/g;

/** §4.4 — the ONE file allowed to name a layer. */
const Z_LADDER_FILE = "overlay-layer.ts";

describe("components/kit source rules", () => {
  it("scans every kit file (a directory rename must not silently empty this suite)", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(24);
  });

  it("contains no raw hex — colour comes from a token class, always (§3.4)", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("names a z-index in ONE file, and that file declares the whole §4.4 ladder", () => {
    for (const f of FILES) {
      if (f === Z_LADDER_FILE) continue;
      expect(read(f), f).not.toMatch(/\bz-(?:\[|\d|auto)/);
    }
    const ladder = read(Z_LADDER_FILE);
    for (const z of [10, 20, 30, 40, 50]) expect(ladder, `layer ${z}`).toContain(`z: ${z}`);
  });

  it("writes no arbitrary type or height — the token carries size, weight and line-height (§2.1)", () => {
    for (const f of FILES) {
      if (EXTRACTED_UNTIL_D6.has(f)) continue; // named debt — see the allowance above
      expect(read(f), f).not.toMatch(/text-\[\d/);
      expect(read(f), f).not.toMatch(/\bh-\[\d/);
      expect(read(f), f).not.toMatch(/\bleading-\[/);
    }
  });

  it("keeps the extraction allowance at ONE file — it may shrink, never grow", () => {
    // Growing this list is how "extracted, not designed" turns into "the kit
    // has its own exceptions". D6 empties it.
    expect([...EXTRACTED_UNTIL_D6]).toEqual(["PageShell.tsx"]);
  });

  it("writes no font-bold — Q3 deleted 700 into 600 (§2.2, frozen 2026-07-28)", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/\bfont-(?:bold|extrabold|black)\b/);
    }
  });

  it("uses only the eight steps of the frozen §4.1 scale", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      if (EXTRACTED_UNTIL_D6.has(f)) continue; // named debt — see the allowance above
      const src = read(f);
      for (const m of src.matchAll(SPACING_RE)) {
        if (!SAFE_STEPS.has(m[1])) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("imports lucide-react in exactly ONE file — one meaning, one glyph (§5)", () => {
    const importers = FILES.filter((f) => read(f).includes('from "lucide-react"'));
    expect(importers).toEqual(["Icon.tsx"]);
  });

  it("has exactly ONE calendar — §11 pins it to react-day-picker", () => {
    const importers = FILES.filter((f) => read(f).includes('from "react-day-picker"'));
    expect(importers).toEqual(["DatePicker.tsx"]);
  });

  it("takes no className and no style anywhere in the kit (§6.0)", () => {
    for (const f of FILES) {
      // The components write their OWN className; what they may not do is
      // accept one. Every public box spreads a props type, so the ban is
      // checked at the type level in kit.test.tsx — here we only assert that
      // no file re-opens the door by spreading a raw HTML attribute bag.
      expect(read(f), f).not.toMatch(/className\?:\s*string/);
      expect(read(f), f).not.toMatch(/style\?:\s*(?:React\.)?CSSProperties/);
    }
  });
});
