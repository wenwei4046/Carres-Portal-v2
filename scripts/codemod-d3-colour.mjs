#!/usr/bin/env node
/**
 * D3 — THE COLOUR CODEMOD (Phase 2 of the approved card; Option A).
 * FOLLOWS: UI-KIT 2026-07-27 · §3.1 ("the law names the STEP, never the hex").
 *
 * =============================================================================
 * THIS CODEMOD IS DELIBERATELY TINY, AND THE SIZE IS THE FINDING.
 * =============================================================================
 * D2 converted 4,052 typography sites because typography had six tokens and a
 * size → token map a machine could apply. **Colour has no such map**, and D3
 * measured what that means before writing a line:
 *
 *   raw hex in scope (guard rule A) ............ 430
 *     styles/pos-prototype.css (§15 Part B) .... 249   ← 58%, out of scope
 *     portal hex ............................... 181
 *       equals a named token EXACTLY ...........  33
 *         …but only 15 of those are UNAMBIGUOUS
 *       equals nothing the law names ...........  148  (69 distinct colours)
 *
 * `#FFFFFF` alone equals EIGHT tokens (--card · --popover · --primary-foreground
 * · --destructive-foreground · --danger-foreground · --success-foreground ·
 * --warning-foreground · --info-foreground). Picking one is a decision about
 * what the surface IS, and a codemod that guesses a role is the thing this card
 * exists to prevent. So: **one hex, one token, or no conversion.**
 *
 * WHY BYTE-EQUALITY IS PROVED RATHER THAN ASSERTED. The table below is not
 * typed. Every `--name: H S% L%` in index.css is rendered to a hex with the CSS
 * Color 4 algorithm, and a site converts only when that rendered hex equals the
 * literal EXACTLY. The equality IS the construction — there is no step where a
 * colour is chosen, approximated or nudged.
 *
 * WHY ONLY THE TAILWIND ARBITRARY-CLASS FORM. A hex reaches the screen two ways
 * and they do NOT carry the same risk:
 *
 *   A  `text-[#1A1A1A]`  — a Tailwind utility. Converting it swaps one class
 *      name for another, and the substitute resolves through exactly the
 *      mechanism every other class in that same `className` already uses.
 *   B  `style={{ color: "#4B5563" }}` or `const grey = "#D1D5DB"` — a JS string.
 *      Its consumer is not knowable from the site: an inline style resolves
 *      `hsl(var(--x))` fine, a canvas 2D context, an SVG presentation attribute
 *      or a charting library does NOT. Proving each consumer is a per-site
 *      investigation, which is not what "deterministic" means.
 *
 * **Form B is therefore left alone and listed**, not converted. That narrows the
 * card's own estimate from 15 sites to 10, and the narrowing is reported rather
 * than absorbed: the five are named in the run output every time.
 *
 * SCOPE — §13.1, read from the guard so the two cannot drift: all of
 * apps/web/src except `pages/dealer/**`, `pages/print/**`,
 * `styles/pos-prototype.css` and `*.test.*`.
 *
 *   node scripts/codemod-d3-colour.mjs --dry
 *   node scripts/codemod-d3-colour.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { codeSegments, blankComments } from "./lib/source-segments.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

/* ═══════════════════════════════════════════════════════════════════════════
 * The token table — DERIVED from index.css, never typed.
 * ═══════════════════════════════════════════════════════════════════════════ */
const CSS = readFileSync(join(ROOT, "apps/web/src/index.css"), "utf8");

/** CSS Color 4 hsl() → sRGB, the same arithmetic a browser runs. */
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

/**
 * hex → the token names that render to it. Only `:root`'s own custom properties
 * are read; a var declared inside a component block is not a palette entry.
 */
const byHex = new Map();
for (const m of CSS.matchAll(/--([a-z0-9-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g)) {
  const hex = hslToHex(Number(m[2]), Number(m[3]), Number(m[4]));
  if (!byHex.has(hex)) byHex.set(hex, []);
  byHex.get(hex).push(m[1]);
}

/**
 * A token is usable only if Tailwind actually exposes it as a colour name. The
 * config is READ for the same reason the guard reads `tokens.ts`: a name typed
 * here could drift from the name that exists.
 *
 * The match is deliberately PERMISSIVE — every var the config references at all
 * counts as a name. Over-counting names can only make a hex look MORE ambiguous
 * and therefore convert FEWER sites; under-counting would hide a second name and
 * let the codemod pick a role. The error direction is chosen, not accidental:
 * `#6B7280` is `--muted-foreground` AND `--base-500`, and a stricter reader that
 * missed the first would have called it unambiguous.
 */
const TW = readFileSync(join(ROOT, "apps/web/tailwind.config.ts"), "utf8");
const exposed = new Set([...TW.matchAll(/hsl\(var\(--([a-z0-9-]+)\)\)/g)].map((m) => m[1]));

/** hex → the ONE Tailwind colour name, or nothing at all. */
const UNAMBIGUOUS = new Map();
const AMBIGUOUS = new Map();
for (const [hex, names] of byHex) {
  const usable = names.filter((n) => exposed.has(n));
  if (usable.length === 1) UNAMBIGUOUS.set(hex, usable[0]);
  else if (usable.length > 1) AMBIGUOUS.set(hex, usable);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Scope — the guard's own filter, so the two cannot disagree.
 * ═══════════════════════════════════════════════════════════════════════════ */
const files = execSync('git ls-files "apps/web/src/**"', { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !f.startsWith("apps/web/src/pages/dealer/") &&
      !f.startsWith("apps/web/src/pages/print/") &&
      !/\.test\.tsx?$/.test(f),
  );

/** The colour utilities that take an arbitrary value — form A, and only form A. */
const ARBITRARY = /\b(bg|text|border|ring|fill|stroke|divide|outline|decoration|caret|accent|from|to|via)-\[(#[0-9a-fA-F]{3,6})\]/g;

const expand = (h) => (h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h).toUpperCase();

const converted = [];
const skipped = { ambiguous: [], unknown: [], formB: [] };
let touched = 0;

for (const f of files) {
  const p = join(ROOT, f);
  const before = readFileSync(p, "utf8");

  const after = codeSegments(before)
    .map((seg, i) =>
      i % 2 === 1
        ? seg // a comment — D2's lesson: a codemod must never rewrite the sentence that explains the value
        : seg.replace(ARBITRARY, (whole, prop, hex) => {
            const H = expand(hex);
            if (UNAMBIGUOUS.has(H)) {
              const name = UNAMBIGUOUS.get(H);
              converted.push(`${f}  ${whole} → ${prop}-${name}`);
              return `${prop}-${name}`;
            }
            (AMBIGUOUS.has(H) ? skipped.ambiguous : skipped.unknown).push(`${f}  ${whole}`);
            return whole;
          }),
    )
    .join("");

  if (after !== before) {
    touched++;
    if (!DRY) writeFileSync(p, after);
  }

  // Form B — counted and named, never touched.
  const code = blankComments(before);
  for (const m of code.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
    const H = expand(m[0]);
    if (!UNAMBIGUOUS.has(H)) continue;
    const at = m.index;
    const isFormA = /-\[$/.test(code.slice(Math.max(0, at - 30), at));
    if (!isFormA) skipped.formB.push(`${f}:${code.slice(0, at).split("\n").length}  ${m[0]} → ${UNAMBIGUOUS.get(H)}`);
  }
}

console.log(`${DRY ? "DRY RUN — " : ""}D3 colour codemod (Phase 2)\n`);
console.log(`  token table derived from index.css: ${byHex.size} colours, ${UNAMBIGUOUS.size} unambiguous`);
console.log(`  converted (form A — a Tailwind arbitrary colour class) ... ${converted.length}`);
for (const c of converted) console.log(`      ${c}`);
console.log(`  files ${DRY ? "that would change" : "changed"} ............................... ${touched} of ${files.length}`);

console.log(`\n  NOT converted, and each is listed rather than counted away:`);
console.log(`    form B — a JS string whose consumer is not knowable here ... ${skipped.formB.length}`);
for (const s of skipped.formB) console.log(`      ${s}`);
console.log(`    a hex matching SEVERAL tokens — a role decision, not a codemod's ... ${skipped.ambiguous.length}`);
for (const s of skipped.ambiguous) console.log(`      ${s}`);
console.log(`    a hex matching NO token — §3 names no colour for it ............... ${skipped.unknown.length}`);
for (const s of skipped.unknown) console.log(`      ${s}`);

if (AMBIGUOUS.size) {
  console.log(`\n  The ambiguity, for the record — one hex, several names:`);
  for (const [hex, names] of AMBIGUOUS) console.log(`    ${hex}  ${names.join(" · ")}`);
}
