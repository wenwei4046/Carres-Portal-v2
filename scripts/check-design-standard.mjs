#!/usr/bin/env node
/**
 * Design-standard guard (zero-dependency lint) — enforces the DESIGN SYSTEM:
 *   docs/01-design-tokens.md · docs/02-components.md · docs/03-page-patterns.md
 * Wired as `@carres/web`'s `lint` script; runs in CI + locally.
 *
 * ⚠ THIS FILE ENFORCES RULES GOVERNED BY `docs/ui/MASTER.md`
 * (CLAUDE.md, 2026-07-31). The §-references still printed in the messages
 * below are UI-KIT's and are retired with it; each rule's LAW now lives in the
 * three files above. Re-pointing a message is a copy change; re-pointing a
 * NUMBER is a law change and needs Loo. The one number that was simply WRONG
 * is corrected in RULE F below (the comment said 44; the code has always
 * allowed 36 / 40 / 52, and `01-design-tokens.md §7` rules the list row 40).
 *
 * WHAT THIS GUARD CANNOT SEE, recorded so nobody reads a green run as
 * "the page is on the kit" (measured on To Order, 2026-08-03):
 *   · a page drawing a component the kit does not have (the three flash bands
 *     are hand-rolled banners; `02` lists `Banner` under "Not built")
 *   · a unicode glyph used instead of kit `Icon` (⚠ ✓ ✗ →)
 *   · two implementations of one thing (page-local `NavRow` vs `FacetRow`)
 *   · a spacing value outside `01 §3`'s eight steps (`mb-px`)
 *   · a dimension with no token (`w-[200px]`)
 *   · a fact that exists only in a `title` tooltip (keyboard cannot reach it)
 * These are review findings, not lint failures. Adding a rule for one is a
 * change to the guard's contract — its own card, never a drive-by.
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
 *   UI hard rules (docs/ui/MASTER.md) — NOT ratcheted; any violation fails.
 *   Kit scope = KIT_FILES below (the order-drawer family + shared section
 *   chrome; ADD each file here as it is migrated to the kit). POS
 *   (pages/dealer/**) has its own contract and is never in scope.
 *
 *   RULE C — Lucide icon sizes: `size={N}` with N ∉ {14, 16, 18}. (kit scope)
 *   RULE D — inline text sizes: `text-[Npx]` with N ∉ {12 label, 13 btn/ref,
 *     14 secondary, 15 content, 18 stat-card money hero, 20 page hero}.
 *     Headings use `.t-*`. (kit scope)
 *   RULE E — inline `#F7F4EE`: the KPI fill exists ONLY as `.kpi-box` in
 *     index.css. (all web src)
 *   RULE F — row heights: `h-[Npx]` outside {36 panel/KV, 40 list, 52
 *     product-line}; content truncates, the row never grows. (kit scope)
 *     `01-design-tokens.md §7` rules the portal's table row **40**. The old
 *     comment here said 44 — it never matched this file's own code, which has
 *     allowed 36/40/52 throughout. Comment corrected 2026-08-03; no behaviour
 *     changed and the baseline did not move.
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

// Grey-hover ratchet (RULE I) — a GLOBAL count. Grey neutral-surface hovers
// (hover:bg-base-50/100 · gray/slate · brightness-[0.97]) violate the KIT hover
// law (neutral rows/nav/chips hover BLUE). Freeze the legacy count; new ones fail.
const HOVER_GREY_RE = /hover:bg-base-(?:50|100)\b|hover:bg-gray-\d|hover:bg-slate-\d|hover:brightness-\[0\.97\]/g;
let currentHoverGrey = 0;
for (const f of files) {
  if (!f.endsWith(".tsx")) continue;
  const m = readFileSync(join(ROOT, f), "utf8").match(HOVER_GREY_RE);
  if (m) currentHoverGrey += m.length;
}

if (UPDATE) {
  const baseline = {
    hex: currentHex,
    hoverGrey: currentHoverGrey,
    listPages: files.filter((f) => f.startsWith("apps/web/src/pages/")),
  };
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

// ---- RULE I — grey-hover ratchet (Jess 2026-07-20) ----------------------------
// KIT hover law: a clickable row/nav/chip hovers BLUE (`hover:bg-hovertint`),
// never grey. Freeze the legacy grey hovers; any NEW one fails the build. Burn
// the baseline down over time (re-run --update-baseline after a sweep).
//
// ⚠ THE LAW THIS RULE ENFORCES WAS REVERSED ON 2026-07-30 AND THE RULE HAS NOT
// CAUGHT UP. Loo froze a portal-wide accent law: blue marks the CURRENT thing
// and the primary action, and nothing else — so hover, selection and the
// expanded row are all grey. An accent that marks four things marks nothing.
// The baseline moved 94 → 96 for To Order's two greys, which are a ruling
// rather than drift. `docs/ui/MASTER.md` has to be rewritten before this
// rule can go back to being the truth, and until then it is measuring the
// opposite of the law. Reported, not quietly re-pointed.
if (currentHoverGrey > (baseline.hoverGrey ?? Infinity)) {
  errors.push(
    `RULE I · grey hover — ${currentHoverGrey} grey hover(s) across web (baseline ${baseline.hoverGrey}). ` +
      `A clickable row/nav/chip hovers BLUE: use \`hover:bg-hovertint\`, not \`hover:bg-base-50/100\` (docs/ui/MASTER.md).`,
  );
}

// ---- RULE A — hex ratchet -----------------------------------------------------
for (const [f, n] of Object.entries(currentHex)) {
  const base = baseline.hex[f] ?? 0;
  if (n > base) {
    errors.push(
      `RULE A · hard-coded hex — ${f}: ${n} hex literal(s) (baseline ${base}). ` +
        `Use a token class (bg-*/text-*/border-*) governed by docs/ui/MASTER.md.`,
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
    errors.push(`RULE B · shell removed — ${p} must import ListPageShell/PageHeader (docs/ui/MASTER.md).`);
  }
}
for (const f of files) {
  if (!f.startsWith("apps/web/src/pages/")) continue;
  if (knownPages.has(f)) continue; // legacy page — grandfathered by the baseline
  const src = readFileSync(join(ROOT, f), "utf8");
  if (LIST_MARKER_RE.test(src) && !SHELL_IMPORT_RE.test(src) && !OPT_OUT_RE.test(src)) {
    errors.push(
      `RULE B · new List page without shell — ${f} renders a table/DataGrid but does not use ` +
        `ListPageShell/PageHeader. Adopt the shell (docs/ui/MASTER.md) or add ` +
        `\`// design-standard: not-a-list-page\` with a reason.`,
    );
  }
}

// ---- UI hard rules C–G (docs/ui/MASTER.md) --------------------------------------
// Kit-governed files — hard rules C/D/F apply here. ADD a file when you
// migrate it to the kit; never remove one.
const KIT_FILES = new Set([
  // D0.5a — the Foundation Components. They are the kit by definition, so they
  // are in scope from the day they land.
  "apps/web/src/components/kit/Badge.tsx",
  "apps/web/src/components/kit/Button.tsx",
  "apps/web/src/components/kit/Card.tsx",
  "apps/web/src/components/kit/EmptyState.tsx",
  "apps/web/src/components/kit/FieldFrame.tsx",
  "apps/web/src/components/kit/Icon.tsx",
  "apps/web/src/components/kit/Input.tsx",
  "apps/web/src/components/kit/Loading.tsx",
  "apps/web/src/components/kit/Panel.tsx",
  "apps/web/src/components/kit/SearchInput.tsx",
  "apps/web/src/components/kit/StatusPill.tsx",
  "apps/web/src/components/kit/Textarea.tsx",
  // D0.5b — the Radix half.
  "apps/web/src/components/kit/Checkbox.tsx",
  "apps/web/src/components/kit/DatePicker.tsx",
  "apps/web/src/components/kit/DialogFrame.tsx",
  "apps/web/src/components/kit/Drawer.tsx",
  "apps/web/src/components/kit/DropdownMenu.tsx",
  "apps/web/src/components/kit/Modal.tsx",
  "apps/web/src/components/kit/Popover.tsx",
  "apps/web/src/components/kit/Select.tsx",
  "apps/web/src/components/kit/Tabs.tsx",
  "apps/web/src/components/kit/Toast.tsx",
  "apps/web/src/components/kit/Tooltip.tsx",
  // D0.5c — the three shells.
  "apps/web/src/components/kit/DataTable.tsx",
  "apps/web/src/components/kit/DetailShell.tsx",
  "apps/web/src/components/kit/PageShell.tsx",
  // `/ui` joins the kit at D0.5b. It was exempt while it rendered BOTH pending
  // spacing candidates on purpose; Jess froze Q1 on 2026-07-28, the comparison
  // is gone, and the exemption died with the code it described.
  "apps/web/src/pages/dev/UiShowcase.tsx",
  "apps/web/src/components/SectionPanel.tsx",
  "apps/web/src/pages/operation/components/OrderDetailDrawer.tsx",
  "apps/web/src/pages/operation/components/StockPickerGrid.tsx",
  "apps/web/src/pages/operation/components/RouteJourneyBar.tsx",
  "apps/web/src/pages/operation/components/OrderControlPanel.tsx",
]);
const ICON_SIZES = new Set([14, 16, 18]); // SIZING LAW: 14 pill/inline · 16 default UI · 18 top-bar (stroke 2)
// SIZING LAW (MASTER SPEC §3, final 2026-07-18): 13 body · 12 caption/meta/pill
// · 11 micro/label · 18 money hero. 10 deleted (use 11); 14/15/16/20/22 deleted.
const TEXT_SIZES = new Set([11, 12, 13, 18]);
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
        `RULE E · inline KPI fill — ${f}:${lineOf(src, m.index)} uses #F7F4EE; use the \`.kpi-box\` token (docs/ui/MASTER.md).`,
      );
    }
  }

  // RULE H — hand-rolled SELECTION (Jess 2026-07-20). The blue "this is the
  // selected/pointed one" state is the single `.is-selected` class (#C2E7FF +
  // #378ADD bar), never a hand-rolled faint blue-selection bar. Flags the
  // `inset_3px_0_0_hsl(var(--info))` bar (0 today, after the unify).
  if (f.endsWith(".tsx")) {
    let m;
    const selRe = /inset_3px_0_0_hsl\(var\(--info\)\)/g;
    while ((m = selRe.exec(src))) {
      errors.push(
        `RULE H · hand-rolled selection — ${f}:${lineOf(src, m.index)} paints its own blue selection bar; use the \`.is-selected\` class (docs/ui/MASTER.md — one selection blue).`,
      );
    }
  }

  // RULE G — hand-rolled section chrome anywhere in web src (JSX/TSX only).
  if (f.endsWith(".tsx") && !f.endsWith("components/SectionPanel.tsx")) {
    let m;
    BAND_CLASS_RE.lastIndex = 0;
    while ((m = BAND_CLASS_RE.exec(src))) {
      errors.push(
        `RULE G · hand-rolled section chrome — ${f}:${lineOf(src, m.index)} uses the \`section-band\` class directly; render <SectionBand>/<SectionCard> from components/SectionPanel.tsx (docs/ui/MASTER.md).`,
      );
    }
  }

  // RULE J — HOVER IS GREY (Loo, 2026-08-03). A hover tint says "the mouse is
  // here": true for one second, carrying no meaning, so it may not spend the
  // accent. Blue marks exactly TWO things on any screen — the primary action
  // and the current SELECTION, which is a lasting state with a consequence.
  //
  // NOT ratcheted, because the count is 0 the day this rule is written and a
  // baseline would only let it climb back. `01-design-tokens.md` §2.3 is the
  // law; this is what makes a new chat obey it without having read the file.
  //
  // `hover:bg-kit-blue-10` is DELIBERATELY legal: that is a filled blue button
  // going a step darker, which is the control's own state and not a row tint.
  if (f.endsWith(".tsx") && !f.includes(".test.")) {
    // ONLY the blue tint steps. `hover:bg-hovertint` is the token that now
    // RESOLVES to grey (`--hover-tint`, index.css) and is the preferred form;
    // banning it here would ban the very thing the law asks for. The legacy
    // `base-50/100` greys are also legal now — grey IS the ruling.
    const HOVER_TINT_RE = /hover:bg-kit-blue-[23]\b/g;
    let m;
    while ((m = HOVER_TINT_RE.exec(src))) {
      errors.push(
        `RULE J · hover tint — ${f}:${lineOf(src, m.index)} uses \`${m[0]}\`; a row/nav/chip hovers GREY (\`hover:bg-kit-slate-3\`). Blue is for the primary action and the SELECTED row only (docs/01-design-tokens.md §2.3, ruled 2026-08-03).`,
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
          `RULE C · icon size — ${f}:${lineOf(src, m.index)} size={${n}}; icons are 14 (pill/inline) / 16 (default UI) / 18 (top bar) only (docs/ui/MASTER.md).`,
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
          `RULE D · text size — ${f}:${lineOf(src, m.index)} text-[${m[1]}px]; inline sizes are 11 micro / 12 caption / 13 body (+18 money hero) — docs/ui/MASTER.md.`,
        );
      }
    }
  }

  // RULE F — row heights (SIZING LAW): panel/KV 36 · list 40 · Items
  // product-line 52 (thumbnail + 2 lines, the ONE exemption). 44/56 deleted.
  {
    let m;
    const hRe = /\bh-\[(\d+)px\]/g;
    const ROW_HEIGHTS = new Set([36, 40, 52]);
    while ((m = hRe.exec(src))) {
      const n = Number(m[1]);
      if (!ROW_HEIGHTS.has(n)) {
        errors.push(
          `RULE F · row height — ${f}:${lineOf(src, m.index)} h-[${n}px]; rows are 36 panel/KV · 40 list · 52 product-line only — docs/ui/MASTER.md.`,
        );
      }
    }
  }
}

if (errors.length) {
  console.error(`\n✗ design-standard: ${errors.length} violation(s)\n`);
  for (const e of errors) console.error("  • " + e);
  console.error("\nSee docs/ui/MASTER.md. Legacy debt is baselined; this only flags NEW violations.\n");
  process.exit(1);
}
console.log("✓ design-standard: no new violations.");
