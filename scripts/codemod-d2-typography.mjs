#!/usr/bin/env node
/**
 * D2 — THE TYPOGRAPHY CODEMOD.
 * FOLLOWS: UI-KIT 2026-07-27 · §2.1 (six tokens) · §2.2 (three weights).
 *
 * Converts every in-scope typography value to one of §2.1's six tokens and every
 * dead weight to one of §2.2's three. It is mechanical, re-runnable and idempotent.
 *
 * WHY THIS IS SAFE TO RUN OVER A CLASS THAT CARRIES A WEIGHT. Each §2.1 token is
 * a Tailwind `fontSize` entry carrying size + line-height + weight in ONE class,
 * so `text-meta` sets font-weight 400. If a site also writes `font-semibold`, the
 * two both emit `font-weight` and the winner is CSS SOURCE ORDER, not class order.
 * Measured on this project's own build, not assumed: `.text-meta` lands at byte
 * 22,105 and `.font-semibold` at 22,181 — the explicit weight comes later and
 * WINS. So an explicit weight survives the conversion untouched.
 *
 * SCOPE — §13.1: all of apps/web/src except `pages/dealer/**` (§15, Part B) and
 * `pages/print/**`. **The `.t-*` ramp definitions in index.css are NOT deleted**:
 * 12 files under those two exempt trees still use them, and deleting the ramp
 * would restyle Part B from a card that may not touch it.
 *
 *   node scripts/codemod-d2-typography.mjs --dry
 *   node scripts/codemod-d2-typography.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { replaceInCode } from "./lib/source-mask.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

/**
 * §2.1 — px → token, by NEAREST token. The law's own two bounds do the ends:
 * "Nothing is larger than 24. Nothing is smaller than 11."
 */
function tokenForPx(px) {
  const n = Number(px);
  if (n <= 11.5) return "text-label"; // 11 / 500
  if (n <= 12.5) return "text-meta"; // 12 / 400
  if (n <= 14) return "text-body"; // 13 / 400
  if (n <= 18) return "text-strong"; // 15 / 600
  if (n <= 22) return "text-title"; // 20 / 600
  return "text-page"; // 24 / 600
}

/** Tailwind's own ramp → the nearest §2.1 token (xs 12 · sm 14 · base 16 …). */
const TW_RAMP = {
  "text-xs": "text-meta",
  "text-sm": "text-body",
  "text-base": "text-strong",
  "text-lg": "text-strong",
  "text-xl": "text-title",
  "text-2xl": "text-page",
  "text-3xl": "text-page",
  "text-4xl": "text-page",
  "text-5xl": "text-page",
};

/**
 * The retired v17 ramp, read off its own `@apply` lines in index.css:
 *   t-h1 32/700 · t-h2 24/700 · t-h3 18/600 · t-h4 15/600
 *   t-body 14/400 · t-small 13/400 · t-tiny 12/400 · t-micro 11/500 + caps
 * `t-micro` KEEPS its uppercase and tracking — those are not typography SIZE and
 * the law rules neither, so dropping them would be a redesign, not a codemod.
 * `.t-num` is NOT in this table: §2.3 keeps it as law (tabular + slashed zero).
 */
const LEGACY = {
  "t-h1": "text-page",
  "t-h2": "text-page",
  "t-h3": "text-strong",
  "t-h4": "text-strong",
  "t-body": "text-body",
  "t-small": "text-body",
  "t-tiny": "text-meta",
  "t-micro": "text-label uppercase tracking-[0.05em]",
};

/** §2.2 — 700 is dead (Q3, frozen 2026-07-28); 600 is the heavy weight. */
const WEIGHTS = { "font-bold": "font-semibold", "font-black": "font-semibold", "font-extrabold": "font-semibold" };

const files = execSync('git ls-files "apps/web/src/**"', { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter(
    (f) =>
      /\.(ts|tsx)$/.test(f) &&
      !f.startsWith("apps/web/src/pages/dealer/") &&
      !f.startsWith("apps/web/src/pages/print/") &&
      // A test ASSERTS on the old spelling on purpose — `kit-source.test.ts`
      // fails a kit file that writes `font-bold`. Rewriting the assertion turns
      // the guard into a guard against the value that replaced it.
      !/\.test\.tsx?$/.test(f),
  );

/**
 * Apply a replacement to CODE ONLY, never inside a comment.
 *
 * The first run of this codemod rewrote the sentences that EXPLAIN the banned
 * values — "no `font-bold` (Q3 deleted 700 into 600)" became "no
 * `font-semibold` (Q3 deleted 700 into 600)", which is not merely noise, it is
 * FALSE. D0.5b had already written this lesson down for the kit's source scan
 * ("a scan that punishes the explanation teaches people to delete the
 * explanation") and a codemod can commit the same error in the other direction.
 *
 * The second run split on one regex, which is NOT string-aware: a line holding
 * `"https://cdn…"` had everything after the `//` treated as prose, so real class
 * values on that line were never converted. **The guard had the identical defect
 * in mirror image, and the two errors cancelled into a number that looked
 * right.** Both now read `scripts/lib/source-mask.mjs` — one implementation, so
 * what the codemod skips and what the guard forgives are the same set BY
 * CONSTRUCTION rather than by two authors agreeing.
 */
const codeOnly = (src, file, apply) => replaceInCode(src, file, apply);

const tally = { px: 0, ramp: 0, legacy: 0, weight: 0 };
let touched = 0;

for (const f of files) {
  const p = join(ROOT, f);
  const before = readFileSync(p, "utf8");
  let s = before;

  s = codeOnly(s, f, (code) =>
    code
      .replace(/\btext-\[(\d+(?:\.\d+)?)px\]/g, (_, px) => {
        tally.px++;
        return tokenForPx(px);
      })
      .replace(/\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b(?!-)/g, (m) => {
        tally.ramp++;
        return TW_RAMP[m];
      })
      .replace(/\bt-(h1|h2|h3|h4|body|small|tiny|micro)\b/g, (m, k) => {
        tally.legacy++;
        return LEGACY["t-" + k];
      })
      .replace(/\bfont-(bold|black|extrabold)\b/g, (m) => {
        tally.weight++;
        return WEIGHTS[m];
      }),
  );

  if (s !== before) {
    touched++;
    if (!DRY) writeFileSync(p, s);
  }
}

console.log(`${DRY ? "DRY RUN — " : ""}D2 typography codemod`);
console.log(`  text-[Npx] → §2.1 token .......... ${tally.px}`);
console.log(`  Tailwind ramp → §2.1 token ....... ${tally.ramp}`);
console.log(`  legacy .t-* ramp → §2.1 token .... ${tally.legacy}`);
console.log(`  dead weight → §2.2 weight ........ ${tally.weight}`);
console.log(`  files ${DRY ? "that would change" : "changed"} ............... ${touched} of ${files.length}`);
console.log(
  `\n  index.css keeps the .t-* ramp on purpose — 12 files under pages/dealer/**\n  and pages/print/** still use it, and both are out of this card's scope.`,
);
