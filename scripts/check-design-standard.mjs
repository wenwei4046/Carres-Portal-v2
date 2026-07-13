#!/usr/bin/env node
/**
 * Design-standard guard (zero-dependency lint) — enforces docs/DESIGN-STANDARD.md.
 * Wired as `@carres/web`'s `lint` script; runs in CI + locally.
 *
 * The repo has 362 pre-existing raw-hex literals across 44 files and only ONE
 * page migrated to <ListPageShell> so far, so this is a RATCHET, not a big-bang
 * gate: it freezes today's debt in a baseline and fails only on NEW violations.
 * Rewrite a page to remove hex / adopt the shell and the ratchet tightens on the
 * next `--update-baseline`.
 *
 *   RULE A — hard-coded hex. A `#rgb` / `#rrggbb` literal in apps/web/src/**.
 *     Fails when a file's hex count EXCEEDS its baseline, or a NON-baselined file
 *     contains any hex. Colours must come from token classes (bg, text, border).
 *     Allow-listed (hex is legitimate): index.css, *design-standard*, lib/pdf/**,
 *     pages/print/** (PDF/print render outside Tailwind).
 *
 *   RULE B — List page must use the shell. A page listed in MUST_USE_SHELL that
 *     stops importing ListPageShell/PageHeader fails. A NEW page under pages/**
 *     (not in the baseline) that renders a top-level <table or <DataGrid without
 *     importing the shell fails — annotate `// design-standard: not-a-list-page`
 *     with a reason to opt out.
 *
 * Usage:
 *   node scripts/check-design-standard.mjs                # check (CI/local)
 *   node scripts/check-design-standard.mjs --update-baseline   # re-freeze debt
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_SRC = join(ROOT, "apps/web/src");
const BASELINE_PATH = join(ROOT, "scripts/design-standard-baseline.json");
const UPDATE = process.argv.includes("--update-baseline");

const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// Directories/files where a raw hex is legitimate (no Tailwind at that layer).
const HEX_ALLOW = [/(^|\/)index\.css$/, /design-standard/, /\/lib\/pdf\//, /\/pages\/print\//];
// Pages that HAVE adopted the shell and must keep it (grows as pages migrate).
const MUST_USE_SHELL = ["pages/operation/OperationOrdersControl.tsx"];
const SHELL_IMPORT_RE = /from\s+["']@\/components\/(ListPageShell|PageHeader)["']/;
const OPT_OUT_RE = /design-standard:\s*not-a-list-page/;
const LIST_MARKER_RE = /<table[\s>]|<DataGrid[\s/>]/;

function listFiles() {
  // Tracked AND untracked-but-not-ignored — new files are the highest-risk, so
  // they must be scanned before they're ever committed.
  const tracked = execSync('git ls-files "apps/web/src/**/*.ts" "apps/web/src/**/*.tsx"', {
    cwd: ROOT,
    encoding: "utf8",
  });
  const untracked = execSync(
    'git ls-files --others --exclude-standard "apps/web/src/**/*.ts" "apps/web/src/**/*.tsx"',
    { cwd: ROOT, encoding: "utf8" },
  );
  return [...new Set((tracked + "\n" + untracked).split("\n").filter(Boolean))].filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
  );
}

const rel = (abs) => relative(ROOT, abs).replace(/\\/g, "/");
const allow = (relPath) => HEX_ALLOW.some((re) => re.test(relPath));

function hexCount(relPath) {
  const src = readFileSync(join(ROOT, relPath), "utf8");
  const m = src.match(HEX_RE);
  return m ? m.length : 0;
}

const files = listFiles();

// ---- build current snapshot ---------------------------------------------------
const currentHex = {};
for (const f of files) {
  if (allow(f)) continue;
  const n = hexCount(f);
  if (n > 0) currentHex[f] = n;
}

if (UPDATE) {
  const baseline = { hex: currentHex, listPages: files.filter((f) => f.startsWith("apps/web/src/pages/")) };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`✓ baseline refrozen — ${Object.keys(currentHex).length} files carry legacy hex.`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error("✗ missing scripts/design-standard-baseline.json — run: node scripts/check-design-standard.mjs --update-baseline");
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const errors = [];

// ---- RULE A — hex ratchet -----------------------------------------------------
for (const [f, n] of Object.entries(currentHex)) {
  const base = baseline.hex[f] ?? 0;
  if (n > base) {
    errors.push(
      `RULE A · hard-coded hex — ${f}: ${n} hex literal(s) (baseline ${base}). ` +
        `Use a token class (bg-*/text-*/border-*) from docs/DESIGN-STANDARD.md §2.`,
    );
  }
}

// ---- RULE B — List page must use the shell ------------------------------------
const knownPages = new Set(baseline.listPages ?? []);
for (const f of MUST_USE_SHELL) {
  const p = `apps/web/src/${f}`;
  if (!files.includes(p)) continue;
  const src = readFileSync(join(ROOT, p), "utf8");
  if (!SHELL_IMPORT_RE.test(src)) {
    errors.push(`RULE B · shell removed — ${p} must import ListPageShell/PageHeader (docs/DESIGN-STANDARD.md §4).`);
  }
}
for (const f of files) {
  if (!f.startsWith("apps/web/src/pages/")) continue;
  if (knownPages.has(f)) continue; // legacy page — grandfathered by the baseline
  const src = readFileSync(join(ROOT, f), "utf8");
  if (LIST_MARKER_RE.test(src) && !SHELL_IMPORT_RE.test(src) && !OPT_OUT_RE.test(src)) {
    errors.push(
      `RULE B · new List page without shell — ${f} renders a table/DataGrid but does not use ` +
        `ListPageShell/PageHeader. Adopt the shell (docs/DESIGN-STANDARD.md §4) or add ` +
        `\`// design-standard: not-a-list-page\` with a reason.`,
    );
  }
}

if (errors.length) {
  console.error(`\n✗ design-standard: ${errors.length} violation(s)\n`);
  for (const e of errors) console.error("  • " + e);
  console.error("\nSee docs/DESIGN-STANDARD.md. Legacy debt is baselined; this only flags NEW violations.\n");
  process.exit(1);
}
console.log("✓ design-standard: no new violations.");
