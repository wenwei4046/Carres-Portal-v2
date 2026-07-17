#!/usr/bin/env node
/**
 * Design-standard guard (zero-dependency lint) — enforces docs/UI-KIT.md.
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
 *   UI-KIT hard rules (docs/UI-KIT.md §E) — NOT ratcheted; any violation fails.
 *   Kit scope = KIT_FILES below (the order-drawer family + shared section
 *   chrome; ADD each file here as it is migrated to the kit). POS
 *   (pages/dealer/**) has its own contract and is never in scope.
 *
 *   RULE C — Lucide icon sizes: `size={N}` with N ∉ {14, 16, 18}. (kit scope)
 *   RULE D — inline text sizes: `text-[Npx]` with N ∉ {12 label, 13 btn/ref,
 *     14 secondary, 15 content, 16 stat-card value, 20 hero number}. Headings
 *     use `.t-*`. (kit scope)
 *   RULE E — inline `#F7F4EE`: the KPI fill exists ONLY as `.kpi-box` in
 *     index.css. (all web src)
 *   RULE F — row heights: `h-[Npx]` with N ≠ 44 — rows are 44px FIXED (`h-11`);
 *     content truncates, the row never grows. (kit scope)
 *   RULE G — hand-rolled section chrome: a literal `section-band` class in JSX
 *     outside components/SectionPanel.tsx — render <SectionBand>. (all web src)
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
        `Use a token class (bg-*/text-*/border-*) from docs/UI-KIT.md §A1.`,
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
    errors.push(`RULE B · shell removed — ${p} must import ListPageShell/PageHeader (docs/UI-KIT.md §A9).`);
  }
}
for (const f of files) {
  if (!f.startsWith("apps/web/src/pages/")) continue;
  if (knownPages.has(f)) continue; // legacy page — grandfathered by the baseline
  const src = readFileSync(join(ROOT, f), "utf8");
  if (LIST_MARKER_RE.test(src) && !SHELL_IMPORT_RE.test(src) && !OPT_OUT_RE.test(src)) {
    errors.push(
      `RULE B · new List page without shell — ${f} renders a table/DataGrid but does not use ` +
        `ListPageShell/PageHeader. Adopt the shell (docs/UI-KIT.md §A9) or add ` +
        `\`// design-standard: not-a-list-page\` with a reason.`,
    );
  }
}

// ---- UI-KIT hard rules C–G (docs/UI-KIT.md §E) ---------------------------------
// Kit-governed files — hard rules C/D/F apply here. ADD a file when you
// migrate it to the kit; never remove one.
const KIT_FILES = new Set([
  "apps/web/src/components/SectionPanel.tsx",
  "apps/web/src/pages/operation/components/OrderDetailDrawer.tsx",
  "apps/web/src/pages/operation/components/StockPickerGrid.tsx",
  "apps/web/src/pages/operation/components/RouteJourneyBar.tsx",
  "apps/web/src/pages/operation/components/OrderControlPanel.tsx",
]);
const ICON_SIZES = new Set([14, 16, 18]); // v4: 14 pill/inline · 16 default UI · 18 top-bar
const TEXT_SIZES = new Set([12, 13, 14, 15, 16, 20]); // v4: 12 label · 13 btn/ref · 14 secondary · 15 content · 16 stat-card value · 20 hero number
// A `section-band` class inside a className attribute (comments don't count).
const BAND_CLASS_RE = /className=\{?["'`][^"'\n]*\bsection-band\b/g;

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

for (const f of files) {
  const src = readFileSync(join(ROOT, f), "utf8");

  // RULE E — inline #F7F4EE anywhere in web src (the fill lives in .kpi-box only).
  if (!/(^|\/)index\.css$/.test(f) && !/design-standard/.test(f)) {
    let m;
    const kpiRe = /#F7F4EE/gi;
    while ((m = kpiRe.exec(src))) {
      errors.push(
        `RULE E · inline KPI fill — ${f}:${lineOf(src, m.index)} uses #F7F4EE; use the \`.kpi-box\` token (docs/UI-KIT.md §A8).`,
      );
    }
  }

  // RULE G — hand-rolled section chrome anywhere in web src (JSX/TSX only).
  if (f.endsWith(".tsx") && !f.endsWith("components/SectionPanel.tsx")) {
    let m;
    BAND_CLASS_RE.lastIndex = 0;
    while ((m = BAND_CLASS_RE.exec(src))) {
      errors.push(
        `RULE G · hand-rolled section chrome — ${f}:${lineOf(src, m.index)} uses the \`section-band\` class directly; render <SectionBand>/<SectionCard> from components/SectionPanel.tsx (docs/UI-KIT.md §A8).`,
      );
    }
  }

  if (!KIT_FILES.has(f)) continue;

  // RULE C — Lucide icon sizes.
  {
    let m;
    const sizeRe = /\bsize=\{(\d+)\}/g;
    while ((m = sizeRe.exec(src))) {
      const n = Number(m[1]);
      if (!ICON_SIZES.has(n)) {
        errors.push(
          `RULE C · icon size — ${f}:${lineOf(src, m.index)} size={${n}}; icons are 14 (pill/inline) / 16 (default UI) / 18 (top bar) only (docs/UI-KIT.md §A4).`,
        );
      }
    }
  }

  // RULE D — inline text sizes.
  {
    let m;
    const txtRe = /text-\[(\d+(?:\.\d+)?)px\]/g;
    while ((m = txtRe.exec(src))) {
      const n = Number(m[1]);
      if (!TEXT_SIZES.has(n)) {
        errors.push(
          `RULE D · text size — ${f}:${lineOf(src, m.index)} text-[${m[1]}px]; inline sizes are 12/13/14/15 (+16 stat value, 20 hero) — headings via .t-* (docs/UI-KIT.md §A3).`,
        );
      }
    }
  }

  // RULE F — drawer panel row heights: any arbitrary px height must be 36.
  {
    let m;
    const hRe = /\bh-\[(\d+)px\]/g;
    while ((m = hRe.exec(src))) {
      const n = Number(m[1]);
      if (n !== 44) {
        errors.push(
          `RULE F · row height — ${f}:${lineOf(src, m.index)} h-[${n}px]; rows are 44px FIXED (h-11) (docs/UI-KIT.md §A7).`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error(`\n✗ design-standard: ${errors.length} violation(s)\n`);
  for (const e of errors) console.error("  • " + e);
  console.error("\nSee docs/UI-KIT.md. Legacy debt is baselined; this only flags NEW violations.\n");
  process.exit(1);
}
console.log("✓ design-standard: no new violations.");
