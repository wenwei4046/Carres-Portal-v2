/**
 * A SOURCE SCAN over `components/kit/**` (card D0.5a).
 *
 * The lesson this line already paid for: *"a source scan beats a render test
 * for this file — a render test only sees the branches its fixture reaches."*
 * These four rules are true of the whole directory or they are not true at
 * all, so they are asserted against the text, not against a tree.
 *
 * The most load-bearing one is SPACING. Q1 is PENDING, so every kit component
 * is built from the six steps present in BOTH candidates — 4 · 8 · 12 · 16 ·
 * 24 · 32. Whichever way Jess freezes Q1 on `/ui`, not one component changes.
 * This test is what keeps that true after the next person edits a padding.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
const FILES = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

/** Tailwind's numeric scale → px, for the steps a kit file may use. */
const SAFE_STEPS = new Set(["1", "2", "3", "4", "6", "8"]); // 4 · 8 · 12 · 16 · 24 · 32
const SPACING_RE = /\b(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y)-(\[[^\]]+\]|[\d.]+)\b/g;

describe("components/kit source rules", () => {
  it("scans every kit file (a directory rename must not silently empty this suite)", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(12);
  });

  it("contains no raw hex — colour comes from a token class, always (§3.4)", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("sets no z-index — §4.4 gives the five layers to components that own them", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/\bz-(?:\[|\d|auto)/);
    }
  });

  it("writes no arbitrary type or height — the token carries size, weight and line-height (§2.1)", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/text-\[\d/);
      expect(read(f), f).not.toMatch(/\bh-\[\d/);
      expect(read(f), f).not.toMatch(/\bleading-\[/);
    }
  });

  it("uses only the spacing steps present in BOTH Q1 candidates — so the pending answer cannot break a component", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
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
});
