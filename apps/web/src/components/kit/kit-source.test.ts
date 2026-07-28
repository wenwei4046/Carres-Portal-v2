/**
 * A SOURCE SCAN over `components/kit/**` (card D0.5a).
 *
 * The lesson this line already paid for: *"a source scan beats a render test
 * for this file — a render test only sees the branches its fixture reaches."*
 * These four rules are true of the whole directory or they are not true at
 * all, so they are asserted against the text, not against a tree.
 *
 * The most load-bearing one is SPACING. **Q1 was frozen on 2026-07-28 (Jess) at
 * the 8-step scale** — 2 · 4 · 6 · 8 · 12 · 16 · 24 · 32 — and the kit needed
 * no change to absorb it, because it had been built from the six steps present
 * in BOTH candidates. This test now guards the frozen scale: a ninth step, or
 * a `p-[Npx]`, fails here.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = dirname(fileURLToPath(import.meta.url));
const FILES = readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."));

/**
 * These rules are about CODE, not prose. A comment that NAMES a banned value
 * while explaining why it is banned is the opposite of a violation — the first
 * run of the `font-bold` rule failed on the sentence recording its own freeze.
 * (`//` is only stripped when it does not follow a `:`, so a URL survives.)
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const read = (f: string) => stripComments(readFileSync(join(DIR, f), "utf8"));

/** Tailwind's numeric suffix for each of §4.1's eight frozen steps. */
const SAFE_STEPS = new Set(["0.5", "1", "1.5", "2", "3", "4", "6", "8"]); // 2·4·6·8·12·16·24·32
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

  it("never writes font-bold — 700 was deleted into 600 (Q3, frozen 2026-07-28)", () => {
    for (const f of FILES) {
      expect(read(f), f).not.toMatch(/\bfont-bold\b/);
      expect(read(f), f).not.toMatch(/font-\[?7\d0\]?/);
    }
  });

  it("writes no stroke width as a literal — the frozen 2 comes from ONE token (Q4, 2026-07-28)", () => {
    for (const f of FILES) {
      const src = read(f);
      if (!/strokeWidth/.test(src)) continue;
      // A numeric literal would be a second place the answer lives.
      expect(src.match(/strokeWidth=\{?["']?[\d.]+["']?\}?/g) ?? [], f).toEqual([]);
      expect(src, f).toContain("ICON_STROKE");
    }
  });

  it("uses only §4.1's eight frozen spacing steps", () => {
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
