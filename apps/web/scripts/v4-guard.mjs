#!/usr/bin/env node
/**
 * UI-KIT v4 typography guard (Jess 2026-07-16) — keeps the closed set closed.
 *
 * Row/panel text must come from the closed set (.t4-row / .t4-row-strong /
 * .t4-label / .t4-caption, ink #1A1A1A, muted #A8A8A8). This guard fails when
 * someone hand-mixes the old pale greys or off-kit hexes back into the two
 * row-bearing surfaces. Run: `node scripts/v4-guard.mjs` (wired as
 * `pnpm --filter @carres/web run check:v4`).
 *
 * It checks PATTERNS, not perfection: base-500/600 are still legal for form
 * LABELS (v4 secondary #6B7280), so only the known-abused combos are banned.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "src/pages/operation/OperationOrdersControl.tsx",
  "src/pages/operation/components/OrderDetailDrawer.tsx",
  "src/pages/operation/components/StockPickerGrid.tsx",
];

// Banned: the pre-v4 palette that kept creeping back.
const BANNED = [
  [/#F1EFE8|#F7F4EE|#F5F0E7|#EAE7DF|#E5E1D8|#9B9389|#9A7B3F|#F0EFE9|#F5F1EA/i, "warm/cream hex — warm tints are VOID (v4 §11a: cool neutral canvas)"],
  [/color:\s*"#(111827|1F2937|4B5563|9CA3AF)"/, "old grey ink hex — use #1A1A1A (content) or #A8A8A8 (muted)"],
  [/text-(success|warning|danger)(?![-\w])(?=[^{]*(RM\(|amount|Collected))/, "tinted amount — numbers are never coloured (v4 §2)"],
  [/#(166534|92400E|991B1B|DCFCE7|FEF3C7|FCE4E4|D6EFD9|FBE8C6)/, "v17 status hex — use the v4 pill pairs (§6)"],
];

let bad = 0;
for (const rel of FILES) {
  const text = readFileSync(resolve(root, rel), "utf8");
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    for (const [re, why] of BANNED) {
      if (re.test(line)) {
        console.error(`${rel}:${i + 1}: ${why}\n    ${line.trim().slice(0, 120)}`);
        bad++;
      }
    }
  });
}

if (bad) {
  console.error(`\nv4-guard: ${bad} violation(s). Use the closed set: .t4-row / .t4-row-strong / .t4-label / .t4-caption · ink #1A1A1A · muted #A8A8A8 · v4 pill pairs.`);
  process.exit(1);
}
console.log("v4-guard: clean.");
