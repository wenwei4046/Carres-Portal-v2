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
 *   UI-KIT rules C/D/F — D1 (2026-07-29) widened these from the kit to ALL of
 *   apps/web/src. They are enforced at TWO strengths, and the split is the whole
 *   design of that card:
 *     · KIT scope   — a violation FAILS. Unchanged behaviour.
 *     · WIDER scope — a violation WARNS and is ratcheted against the baseline.
 *   D1 measured 965 pre-existing violations across 184 files. Failing on those
 *   would go red on every build in the repo, and a guard that fails on day one
 *   gets switched off on day one. D5 is the card that flips warn → fail, once
 *   the D2/D3/D4 codemods have walked the baseline down.
 *
 *   Kit scope is DERIVED from apps/web/src/components/kit/** (D1) plus the
 *   MIGRATED_FILES list of non-kit files already held to the kit. It used to be
 *   one hand-typed list, and the three D0.5c shells shipped into the kit without
 *   anybody adding them — the exact failure UI-KIT §13.1's "not a hand-
 *   maintained file list" sentence exists to prevent. POS (pages/dealer/**) has
 *   its own contract (§15) and is never in scope.
 *
 *   RULE C — Lucide icon sizes: `size={N}` with N ∉ {14, 16, 18}.
 *   RULE D — inline text sizes: `text-[Npx]` with N ∉ {11, 12, 13, 18}.
 *   RULE E — inline `#F7F4EE`: the KPI fill exists ONLY as `.kpi-box` in
 *     index.css. (all web src, hard)
 *   RULE F — row heights: `h-[Npx]` with N ∉ {36, 40, 52}.
 *   RULE G — hand-rolled section chrome: a literal `section-band` class in JSX
 *     outside components/SectionPanel.tsx — render <SectionBand>. (all web src)
 *
 *   The three mechanisms D0.6 handed to D1, one per consolidated principle:
 *   RULE J — UI-KIT §8.0 (R1 · closed floorplan catalogue). A `PageShell`
 *     `variant` outside the SHIPPED union fails. PM ruling 2026-07-29: the
 *     shipped union is `list` | `module` and this guard may not add, rename or
 *     remove one. `custom` is refused by name. HARD — nothing violates it today,
 *     so it can never be "pre-existing". Second mechanism on a rule the Type
 *     System already enforces; it catches a variant arriving through a cast.
 *   RULE K — UI-KIT §14.1 (R2 · opinionated product, configurable business). No
 *     browser-persisted UI state under pages/**. WARN + ratchet: PM ruling
 *     2026-07-29 keeps `hiddenCols`, so this rule DETECTS and BASELINES and
 *     never removes.
 *   RULE L — UI-KIT §0.3 (R4 · every kit artifact declares its edition). HARD
 *     over a small, explicit artifact list.
 *
 *   (R3 · UI-KIT §10.1, "no state keyed off a display string", has NO mechanism
 *   here — see the D1 findings note. It stays scheduled rather than shipping a
 *   check that cannot tell a display string from an id.)
 *
 * Usage:
 *   node scripts/check-design-standard.mjs                     # check (CI/local)
 *   node scripts/check-design-standard.mjs --update-baseline   # re-freeze debt
 *   node scripts/check-design-standard.mjs --report            # §16 UI Health
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_SRC = join(ROOT, "apps/web/src");
const BASELINE_PATH = join(ROOT, "scripts/design-standard-baseline.json");
const UPDATE = process.argv.includes("--update-baseline");
const REPORT = process.argv.includes("--report");
const KIT_DOC = join(ROOT, "docs/UI-KIT.md");

const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
// Directories/files where a raw hex is legitimate (no Tailwind at that layer).
const HEX_ALLOW = [/(^|\/)index\.css$/, /design-standard/, /\/lib\/pdf\//, /\/pages\/print\//];
// Pages that HAVE adopted the shell and must keep it (grows as pages migrate).
const MUST_USE_SHELL = ["pages/operation/OperationOrdersControl.tsx"];
// D0.5c — the kit shell is the successor, so a page satisfies RULE B with the
// OLD shell or the NEW one. What the rule forbids is a list page rendering a
// frame of its own, which is how 274 of 285 pages ended up hand-rolling one.
const SHELL_IMPORT_RE = /from\s+["']@\/components\/(ListPageShell|PageHeader|kit\/PageShell)["']/;
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

if (!existsSync(BASELINE_PATH) && !UPDATE) {
  console.error("✗ missing scripts/design-standard-baseline.json — run: node scripts/check-design-standard.mjs --update-baseline");
  process.exit(1);
}
// Under --update-baseline the file loop below still runs — that is what POPULATES
// the new per-rule tallies — so the ratchet reads an empty baseline and never
// fires, and the freeze is written at the end from what was actually measured.
const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : { hex: {}, listPages: [] };
const errors = [];

// ---- RULE I — grey-hover ratchet (Jess 2026-07-20) ----------------------------
// KIT hover law: a clickable row/nav/chip hovers BLUE (`hover:bg-hovertint`),
// never grey. Freeze the legacy grey hovers; any NEW one fails the build. Burn
// the baseline down over time (re-run --update-baseline after a sweep).
if (currentHoverGrey > (baseline.hoverGrey ?? Infinity)) {
  errors.push(
    `RULE I · grey hover — ${currentHoverGrey} grey hover(s) across web (baseline ${baseline.hoverGrey}). ` +
      `A clickable row/nav/chip hovers BLUE: use \`hover:bg-hovertint\`, not \`hover:bg-base-50/100\` (docs/UI-KIT.md hover law).`,
  );
}

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

// ---- UI-KIT rules C–G (docs/UI-KIT.md) -----------------------------------------
// Files OUTSIDE components/kit/** that are nevertheless held to the kit. This is
// the only hand-maintained half, and it may only ever GROW: a file joins when it
// is migrated, and never leaves.
const MIGRATED_FILES = [
  // `/ui` joins the kit at D0.5b. It was exempt while it rendered BOTH pending
  // spacing candidates on purpose; Jess froze Q1 on 2026-07-28, the comparison
  // is gone, and the exemption died with the code it described.
  "apps/web/src/pages/dev/UiShowcase.tsx",
  "apps/web/src/components/SectionPanel.tsx",
  "apps/web/src/pages/operation/components/OrderDetailDrawer.tsx",
  "apps/web/src/pages/operation/components/StockPickerGrid.tsx",
  "apps/web/src/pages/operation/components/RouteJourneyBar.tsx",
  "apps/web/src/pages/operation/components/OrderControlPanel.tsx",
];
// D1 — the kit is a DIRECTORY, not a list. Everything under components/kit/** is
// the kit by definition and is in scope from the moment the file lands, with no
// second edit anywhere. Before this, KIT_FILES was typed by hand and PageShell ·
// DataTable · DetailShell had shipped into the kit unguarded.
const KIT_DIR = "apps/web/src/components/kit/";
const KIT_FILES = new Set([...files.filter((f) => f.startsWith(KIT_DIR)), ...MIGRATED_FILES]);
// UI-KIT §8.0 — the SHIPPED floorplan catalogue. PM ruling 2026-07-29: D1
// enforces what `PageShell.tsx` actually ships and may not add, rename or remove
// a member. §8.1 still names four (list · dashboard · detail · settings); that
// mismatch is REPORTED ONLY and is not this guard's to settle.
const SHIPPED_VARIANTS = new Set(["list", "module"]);
// Per-rule per-file tallies for the widened rules. A global total would let one
// file improve while another rots and the number would not move.
const wide = { C: {}, D: {}, F: {}, K: {} };
const warnings = [];
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
        `RULE E · inline KPI fill — ${f}:${lineOf(src, m.index)} uses #F7F4EE; use the \`.kpi-box\` token (docs/UI-KIT.md §A8).`,
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
        `RULE H · hand-rolled selection — ${f}:${lineOf(src, m.index)} paints its own blue selection bar; use the \`.is-selected\` class (docs/UI-KIT.md §A6 — one selection blue).`,
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

  // ---- RULES C · D · F — kit = HARD, everywhere else = WARN + ratchet -----------
  // D1 widened these off the kit. `inKit` decides the STRENGTH, never whether the
  // rule is checked: a violation outside the kit is still measured, still counted
  // per rule per file, and still fails the moment it EXCEEDS what was frozen.
  const inKit = KIT_FILES.has(f);
  // UI-KIT §15 — Part B, the POS, is "out of scope for §1–§14 and for the Build
  // Guard". It has its own contract under `.pos-proto`. The kit-only version of
  // C/D/F never met a POS file because no POS file was in KIT_FILES; widening
  // walked straight into 57 pages the law exempts, so the exemption is explicit
  // now. RULES A · E · G · I keep whatever scope they already had — D1 widens
  // C/D/F and changes nothing else.
  const isPos = f.startsWith("apps/web/src/pages/dealer/");
  if (!inKit && isPos) continue;
  const sink = inKit ? errors : [];

  // RULE C — Lucide icon sizes.
  {
    let m;
    const sizeRe = /\bsize=\{(\d+)\}/g;
    while ((m = sizeRe.exec(src))) {
      const n = Number(m[1]);
      if (!ICON_SIZES.has(n)) {
        wide.C[f] = (wide.C[f] ?? 0) + 1;
        sink.push(
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
        wide.D[f] = (wide.D[f] ?? 0) + 1;
        sink.push(
          `RULE D · text size — ${f}:${lineOf(src, m.index)} text-[${m[1]}px]; inline sizes are 11 micro / 12 caption / 13 body (+18 money hero) — typography law, docs/UI-KIT.md §2.1.`,
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
        wide.F[f] = (wide.F[f] ?? 0) + 1;
        sink.push(
          `RULE F · row height — ${f}:${lineOf(src, m.index)} h-[${n}px]; rows are 36 panel/KV · 40 list · 52 product-line only — table law, docs/UI-KIT.md §7 (row height is written there by card D0.5c).`,
        );
      }
    }
  }

  // ---- RULE J — the floorplan catalogue is CLOSED (UI-KIT §8.0) -----------------
  // HARD. Nothing in the repo violates it today, so it can never be pre-existing.
  {
    let m;
    const vRe = /<PageShell\b[^>]*?\bvariant=["']([a-zA-Z0-9_-]+)["']/gs;
    while ((m = vRe.exec(src))) {
      if (!SHIPPED_VARIANTS.has(m[1])) {
        errors.push(
          `RULE J · floorplan — ${f}:${lineOf(src, m.index)} <PageShell variant="${m[1]}">; the shipped catalogue is ` +
            `${[...SHIPPED_VARIANTS].join(" | ")} and it is CLOSED (docs/UI-KIT.md §8.0). ` +
            `There is no "custom". Adding a variant is a governance event, not a page's decision.`,
        );
      }
    }
  }

  // ---- RULE K — no per-user UI preference (UI-KIT §14.1) -----------------------
  // WARN + ratchet. PM ruling 2026-07-29: `hiddenCols` STAYS — this rule DETECTS,
  // REPORTS and BASELINES, and never removes. POS is out of scope (§15).
  if (f.startsWith("apps/web/src/pages/") && !f.startsWith("apps/web/src/pages/dealer/")) {
    let m;
    const uiStateRe = /\b(?:localStorage|sessionStorage)\s*\.\s*(?:get|set|remove)Item\b/g;
    while ((m = uiStateRe.exec(src))) {
      wide.K[f] = (wide.K[f] ?? 0) + 1;
    }
  }
}

// ---- RULE L — every kit artifact declares its edition (UI-KIT §0.3) -----------
// HARD, over an explicit artifact list. R4's whole finding is that a citation
// with no version cannot be wrong on its face, which is how it survives.
const EDITION_RE = /KIT EDITION/;
for (const f of ["apps/web/src/lib/design-standard.ts"]) {
  if (!files.includes(f)) continue;
  if (!EDITION_RE.test(readFileSync(join(ROOT, f), "utf8"))) {
    errors.push(
      `RULE L · undeclared edition — ${f} does not state which kit edition it follows. ` +
        `Every kit artifact declares its edition (docs/UI-KIT.md §0.3).`,
    );
  }
}

// ---- the widened ratchet — C · D · F · K -------------------------------------
// Pre-existing is frozen and WARNS. Exceeding what was frozen FAILS: a baseline
// that nothing can ever breach is a number, not a ratchet.
const WIDE_LABEL = {
  C: "icon size (§5.1)",
  D: "inline text size (§2.1)",
  F: "row height (§7)",
  K: "per-user UI preference (§14.1)",
};
let wideTotal = 0;
for (const rule of ["C", "D", "F", "K"]) {
  const base = UPDATE ? wide[rule] : (baseline.wide?.[rule] ?? {});
  for (const [f, n] of Object.entries(wide[rule])) {
    wideTotal += n;
    const b = base[f] ?? 0;
    if (n > b) {
      errors.push(
        `RULE ${rule} · ${WIDE_LABEL[rule]} — ${f}: ${n} violation(s), baseline ${b}. ` +
          `Pre-existing debt is frozen; this one is NEW (docs/UI-KIT.md).`,
      );
    } else if (n > 0 && !KIT_FILES.has(f)) {
      warnings.push(`RULE ${rule} · ${WIDE_LABEL[rule]} — ${f}: ${n} (frozen, D2–D4 burns it down)`);
    }
  }
}

if (UPDATE) {
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        hex: currentHex,
        hoverGrey: currentHoverGrey,
        listPages: files.filter((f) => f.startsWith("apps/web/src/pages/")),
        wide,
      },
      null,
      2,
    ) + "\n",
  );
  const n = (r) => Object.values(wide[r]).reduce((a, b) => a + b, 0);
  console.log(`✓ baseline refrozen — ${Object.keys(currentHex).length} files carry legacy hex.`);
  console.log(`  widened rules frozen: C ${n("C")} · D ${n("D")} · F ${n("F")} · K ${n("K")}`);
  console.log(`  total ${n("C") + n("D") + n("F") + n("K")} violations across ` +
    `${new Set(["C", "D", "F", "K"].flatMap((r) => Object.keys(wide[r]))).size} files.`);
  process.exit(0);
}

// ---- --report — regenerate §16 UI Health from the law itself -------------------
// §16 says the block "is GENERATED, not hand-typed". This is that generator: it
// parses the Enforcement column out of docs/UI-KIT.md rather than trusting a
// number somebody maintained by hand.
if (REPORT) {
  const doc = readFileSync(KIT_DOC, "utf8");
  const lines = doc.split("\n");
  // §16 counts "design rules stated in §1–§8" — its own scope sentence. Rules in
  // §0, §10, §13, §14 and §16 are governance and are deliberately NOT counted.
  // A rule is a row in a table whose header is exactly Rule|Enforcement|Status|
  // Evidence. Counting every 4-column table instead reads 67 rules, because
  // §1.3's height budget, §5.3's 40-row icon name map and the §6 component
  // tables are all four columns wide and none of them is a rule.
  let chapter = null;
  let inRuleTable = false;
  const rows = [];
  for (const line of lines) {
    const h = line.match(/^#{1,2}\s+§(\d+)/);
    if (h) {
      chapter = Number(h[1]);
      inRuleTable = false;
    }
    if (!line.startsWith("|")) {
      inRuleTable = false;
      continue;
    }
    // Split on UNescaped pipes only. §5.1 writes "14 | 16 | 18" inside a cell as
    // `14 \| 16 \| 18`; a naive split shifts every later column and that row's
    // Status reads "16 \" instead of "✅", silently under-counting the enforced.
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    if (cells[1] === "Rule" && cells[2] === "Enforcement") {
      inRuleTable = true;
      continue;
    }
    if (!inRuleTable || chapter === null || chapter < 1 || chapter > 8) continue;
    const [, rule, enforcement, status] = cells;
    if (!rule || /^[-:]+$/.test(rule)) continue;
    rows.push({ chapter, rule, enforcement, enforced: (status ?? "").startsWith("✅") });
  }
  const total = rows.length;
  const enforced = rows.filter((r) => r.enforced).length;
  const debt = rows.filter((r) => /Human Review/i.test(r.enforcement)).length;
  const pct = ((enforced / total) * 100).toFixed(2);
  // What §16 currently prints, so the generator can disagree OUT LOUD rather
  // than being quietly believed. Reconciled to the generator by card D0.6.1
  // (2026-07-29), which also made the generator the measurement authority: if
  // these diverge again, §16 is what gets corrected, never this constant.
  const HAND = { total: 43, enforced: 24, debt: 5 };
  console.log(`§16 UI Health — parsed from docs/UI-KIT.md §1–§8\n`);
  const cmp = (label, got, hand) =>
    console.log(`  ${label.padEnd(9)} ${String(got).padStart(3)}   §16 says ${String(hand).padStart(3)}` +
      (got === hand ? "" : `   ← DIFFERS by ${got - hand > 0 ? "+" : ""}${got - hand}`));
  cmp("Rules", total, HAND.total);
  cmp("Enforced", enforced, HAND.enforced);
  cmp("HR debt", debt, HAND.debt);
  console.log(`  Coverage  ${pct}%   §16 says ${((HAND.enforced / HAND.total) * 100).toFixed(2)}%`);
  const perCh = {};
  for (const r of rows) (perCh[r.chapter] ??= []).push(r);
  console.log("\n  per chapter (enforced / rules):");
  for (const k of Object.keys(perCh).sort())
    console.log(`    §${k}  ${perCh[k].filter((r) => r.enforced).length} / ${perCh[k].length}`);
  if (total !== HAND.total || enforced !== HAND.enforced || debt !== HAND.debt) {
    console.log(
      `\n  ⚠ The generated figure and §16's hand count DISAGREE. Every rule table in\n` +
        `    the law uses the exact "Rule | Enforcement | Status | Evidence" header and\n` +
        `    all 18 of them are read, so this is a stale hand count rather than a parse\n` +
        `    miss. D1 REPORTS it and does not edit §16 — that is the law, and D0.6 is\n` +
        `    closed. Whoever reopens the law reconciles the block against this output.`,
    );
  }
  process.exit(0);
}

if (errors.length) {
  console.error(`\n✗ design-standard: ${errors.length} violation(s)\n`);
  for (const e of errors) console.error("  • " + e);
  console.error("\nSee docs/UI-KIT.md. Legacy debt is baselined; this only flags NEW violations.\n");
  process.exit(1);
}
if (warnings.length) {
  // Count FILES, not warning entries — a file breaking C and D produces two
  // entries and is still one file. Printing entries as files would overstate the
  // debt by a third, and this number is the one D2–D4 are measured against.
  const debtFiles = new Set(["C", "D", "F", "K"].flatMap((r) => Object.keys(wide[r]).filter((f) => !KIT_FILES.has(f)))).size;
  console.log(`\n⚠ design-standard: ${debtFiles} file(s) carry ${wideTotal} frozen violation(s) — warn only, D5 flips this to fail.`);
  if (process.argv.includes("--verbose")) for (const w of warnings) console.log("  · " + w);
  else console.log("  run with --verbose to list them\n");
}
console.log("✓ design-standard: no new violations.");
