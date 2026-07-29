#!/usr/bin/env node
/**
 * THE BUILD GUARD — `docs/UI-KIT.md` §13. Card D1.
 * =============================================================================
 * FOLLOWS: **UI-KIT 2026-07-27** (§0.3 — every kit artifact declares its edition).
 *
 * §13.1 SCOPE — **all of `apps/web/src`**, not a hand-maintained file list. The
 * previous guard inspected a 30-file allow-list and checked colour only; that is
 * why 225 files drifted. Exempt: `pages/dealer/**` (POS, Part B — §15) and
 * `pages/print/**` (PDF, non-Tailwind contract).
 *
 * §13.2 RATCHET — this is **STAGE 1: WARN ONLY.** It counts, prints and writes
 * the baseline. It does not fail the build. Stage 2 (D2–D4) turns on `--strict`,
 * where the baseline may only go down; stage 3 (D5) makes that the default.
 *
 * §13.3 RULES — A–I are the law's own letters, read from the law, not invented
 * here. J–N are the five mechanisms card D0.6 scheduled onto D1 (§0.3 ×2, §0.4,
 * §0.5, §10.1).
 *
 *   A  a raw hex literal
 *   B  the Carres flame outside the logo
 *   C  an icon size ∉ {14,16,18} · an emoji as an icon · a meaning outside §5.3
 *   D  `text-[Npx]` · a type token outside §2.1 · a weight outside §2.2 (700 dead)
 *   E  a spacing / radius / border value outside §4
 *   F  a `z-` class anywhere in `pages/**`
 *   G  a raw <table> / <input> / <select> / `fixed inset-0` in `pages/**`
 *   H  a `PageShell` band set wider than its variant's §1.3 budget
 *   I  the same class string ≥ 40 chars repeated across ≥ 2 files (§6.6)
 *   J  a kit artifact that does not declare its kit edition (§0.3)
 *   K  an artifact claiming to outrank the law (§0.3)
 *   L  a browser-persisted UI-shape key under `pages/**` (§0.4)
 *   M  a persisted / query / storage key built from a display string (§0.5)
 *   N  a component spelling a COPY-STANDARD business word (§10.1)
 *
 * **NOTHING IN THIS FILE RETYPES A TOKEN.** The scale, the radii, the type
 * tokens, the weights, the icon sizes and the forty icon meanings are READ out
 * of `components/kit/tokens.ts` and `components/kit/Icon.tsx`, which are the
 * law's own machine records. A ninth spacing step means editing the record —
 * which is the friction §0.3 asks for — and this guard follows it automatically.
 *
 * Usage:
 *   node scripts/check-design.mjs                  # stage 1 — warn, never fail
 *   node scripts/check-design.mjs --strict         # stage 2/3 — fail above baseline
 *   node scripts/check-design.mjs --update-baseline
 *   node scripts/check-design.mjs --report         # regenerate UI-KIT §16
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { maskComments } from "./lib/source-mask.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAW = join(ROOT, "docs/UI-KIT.md");
const BASELINE_PATH = join(ROOT, "scripts/design-guard-baseline.json");
const TOKENS = join(ROOT, "apps/web/src/components/kit/tokens.ts");
const ICON = join(ROOT, "apps/web/src/components/kit/Icon.tsx");
const WORDS = join(ROOT, "packages/shared/src/order-action-words.ts");

const ARG = new Set(process.argv.slice(2));
const UPDATE = ARG.has("--update-baseline");
const STRICT = ARG.has("--strict");
const REPORT = ARG.has("--report");

/** §0.3 — the edition every kit artifact must declare. */
const EDITION = "UI-KIT 2026-07-27";

const read = (p) => readFileSync(p, "utf8");

/* ═══════════════════════════════════════════════════════════════════════════
 * The law's own records, READ — never retyped.
 * ═══════════════════════════════════════════════════════════════════════════ */
function records() {
  const t = read(TOKENS);
  const icon = read(ICON);

  const spacing = [...t.matchAll(/\{\s*px:\s*\d+,\s*tailwind:\s*"([^"]+)"/g)].map((m) => m[1]);
  const typeClasses = [...t.matchAll(/className:\s*"(text-[a-z]+)"/g)].map((m) => m[1]);
  const weights = (t.match(/TYPE_WEIGHTS[^=]*=\s*\[([^\]]+)\]/) ?? [, ""])[1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);
  const radii = [...t.matchAll(/className:\s*"(rounded-[a-z]+)"/g)].map((m) => m[1]);
  const iconSizes = (t.match(/ICON_SIZES[^=]*=\s*\[([^\]]+)\]/) ?? [, ""])[1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);

  const glyphBlock = (icon.match(/const GLYPH = \{([\s\S]*?)\n\} as const;/) ?? [, ""])[1];
  const meanings = [...glyphBlock.matchAll(/^\s*"?([a-z-]+)"?:\s*[A-Z]/gm)].map((m) => m[1]);

  if (!spacing.length || !typeClasses.length || !radii.length || !meanings.length) {
    console.error("✗ check-design: could not read the kit token records. Did tokens.ts move?");
    process.exit(2);
  }
  return { spacing, typeClasses, weights, radii, iconSizes, meanings };
}

/** The COPY-STANDARD words a component may not spell (§10.1). */
function businessWords() {
  if (!existsSync(WORDS)) return [];
  const src = read(WORDS);
  const out = new Set();
  for (const m of src.matchAll(/^\s*(?:queue|button|row):\s*"([^"]{4,})"/gm)) out.add(m[1]);
  return [...out];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §13.1 Scope
 * ═══════════════════════════════════════════════════════════════════════════ */
function inScopeFiles() {
  const q = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const all = new Set([
    ...q('git ls-files "apps/web/src/**"'),
    ...q('git ls-files --others --exclude-standard "apps/web/src/**"'),
  ]);
  return [...all].filter(
    (f) =>
      /\.(ts|tsx|css)$/.test(f) &&
      !f.startsWith("apps/web/src/pages/dealer/") && // §15 Part B — the POS
      !f.startsWith("apps/web/src/pages/print/") && // PDF, non-Tailwind
      !/\.test\.tsx?$/.test(f), // a test asserts ON strings; it does not render them
  );
}

const isPage = (f) => f.startsWith("apps/web/src/pages/");
const isComponent = (f) => f.startsWith("apps/web/src/components/");
const isKit = (f) => f.startsWith("apps/web/src/components/kit/");
const lineOf = (src, i) => src.slice(0, i).split("\n").length;

/* ═══════════════════════════════════════════════════════════════════════════
 * §13.3 — the rules
 * ═══════════════════════════════════════════════════════════════════════════ */
const RULES = [
  { id: "A", law: "§3.4", what: "a raw hex literal" },
  { id: "B", law: "§3.4", what: "the Carres flame outside the logo" },
  { id: "C", law: "§5", what: "an icon size / glyph outside the law" },
  { id: "D", law: "§2", what: "a typography value outside §2.1 · §2.2" },
  { id: "E", law: "§4", what: "a spacing / radius / border value outside §4" },
  { id: "F", law: "§4.4", what: "a `z-` class in pages/**" },
  { id: "G", law: "§0.1", what: "a hand-rolled table / input / select / overlay" },
  { id: "H", law: "§1.3", what: "a PageShell band set over its variant budget" },
  { id: "I", law: "§6.6", what: "a class string repeated across files" },
  { id: "J", law: "§0.3", what: "a kit artifact that declares no kit edition" },
  { id: "K", law: "§0.3", what: "an artifact claiming to outrank the law" },
  { id: "L", law: "§0.4", what: "a browser-persisted UI-shape key in pages/**" },
  { id: "M", law: "§0.5", what: "a key built from a display string" },
  { id: "N", law: "§10.1", what: "a component spelling a business word" },
];

// Hex is legitimate where Tailwind does not reach.
const HEX_OK = [/(^|\/)index\.css$/, /design-standard/, /\/lib\/pdf\//];
// Tailwind's own default type ramp — a typography token outside §2.1.
//
// The `(?!-)` is load-bearing, and D2 found it the hard way. This repo's
// NEUTRAL PALETTE is `base` — `text-base-500`, `text-base-700` — so without the
// lookahead `\btext-base\b` matches a COLOUR class, and rule D counted **2,842
// colours as typography**: 5 of the 2,847 `text-base` hits were the type class.
// A codemod scored against that baseline would have "fixed" 2,842 non-problems.
const TW_TYPE = /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b(?!-)/g;
const TW_WEIGHT = /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g;
const WEIGHT_PX = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const SPACING_PROPS = "p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-x|space-y";

function scan(files, rec, words) {
  const hits = Object.fromEntries(RULES.map((r) => [r.id, []]));
  const push = (id, f, src, i, msg) => hits[id].push({ file: f, line: lineOf(src, i), msg });
  const classStrings = new Map(); // rule I

  for (const f of files) {
    const full = read(join(ROOT, f));
    const tsx = f.endsWith(".tsx");
    /**
     * VALUE rules read CODE, not comments — D0.5b wrote this lesson for the
     * kit's own scan and D1 shipped without it: rule D flagged `tokens.ts`
     * TWICE for the sentence that EXPLAINS that 700 is dead. **A scan that
     * punishes the explanation teaches people to delete the explanation.**
     * Comments are blanked, not removed, so every reported line number is
     * still the real one.
     *
     * D2's first pass did this with one regex, and the PM review found the cure
     * had its own disease: that regex is NOT string-aware, so a line holding
     * `"https://cdn…"` had everything after the `//` blanked and a real
     * violation later on that line stopped being counted. **A stripper that
     * silently DEPRESSES the number the whole D-series is scored against is
     * worse than one that inflates it.** `scripts/lib/source-mask.mjs` walks the
     * source once, string- and regex-aware, and the CODEMOD reads the same
     * module — fixing only one of the two would make them disagree.
     */
    const src = maskComments(full, f);

    /* A — a raw hex literal ------------------------------------------------ */
    if (!HEX_OK.some((re) => re.test(f))) {
      for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g))
        push("A", f, src, m.index, `${m[0]} — §3.1 names the STEP, never the hex`);
    }

    /* B — the flame outside the logo --------------------------------------- */
    if (!/logo/i.test(f)) {
      for (const m of src.matchAll(/#C44D2B/gi))
        push("B", f, src, m.index, "the flame survives in exactly one place: the logo (§3.4)");
    }

    /* C — icons ------------------------------------------------------------ */
    for (const m of src.matchAll(/\bsize=\{(\d+)\}/g)) {
      const n = Number(m[1]);
      if (!rec.iconSizes.includes(n)) push("C", f, src, m.index, `size={${n}} — §5.1 allows ${rec.iconSizes.join(" / ")}`);
    }
    for (const m of src.matchAll(/<Icon\s+[^>]*name="([^"]+)"/g)) {
      if (!rec.meanings.includes(m[1])) push("C", f, src, m.index, `icon name "${m[1]}" is not one of §5.3's ${rec.meanings.length} meanings`);
    }
    if (tsx) {
      for (const m of src.matchAll(/>\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])\s*</gu))
        push("C", f, src, m.index, `emoji ${m[1]} used as an icon — §5.1 is Lucide only`);
    }

    /* D — typography ------------------------------------------------------- */
    for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g))
      push("D", f, src, m.index, `text-[${m[1]}px] — §2.1 has six tokens (${rec.typeClasses.join(" ")})`);
    for (const m of src.matchAll(TW_TYPE))
      push("D", f, src, m.index, `${m[0]} — a type token outside §2.1`);
    for (const m of src.matchAll(TW_WEIGHT)) {
      const w = WEIGHT_PX[m[1]];
      if (!rec.weights.includes(w)) push("D", f, src, m.index, `${m[0]} (${w}) — §2.2 has ${rec.weights.join(" · ")}${w === 700 ? "; 700 was deleted into 600 (Q3)" : ""}`);
    }

    /* E — spacing · radius · border ---------------------------------------- */
    for (const m of src.matchAll(new RegExp(`\\b(?:${SPACING_PROPS})-\\[(\\d+(?:\\.\\d+)?)px\\]`, "g")))
      push("E", f, src, m.index, `${m[0]} — §4.1 is eight frozen steps`);
    for (const m of src.matchAll(new RegExp(`\\b(?:${SPACING_PROPS})-(\\d+(?:\\.\\d+)?)\\b`, "g"))) {
      // `0` is the absence of spacing, not a ninth step.
      if (m[1] !== "0" && !rec.spacing.includes(m[1])) push("E", f, src, m.index, `${m[0]} — not a §4.1 step`);
    }
    for (const m of src.matchAll(/\brounded-(?!\[)([a-z0-9]+)\b/g)) {
      if (!rec.radii.includes(`rounded-${m[1]}`) && m[1] !== "none")
        push("E", f, src, m.index, `rounded-${m[1]} — §4.2 has four radii, named by USE`);
    }
    for (const m of src.matchAll(/\bborder-(\d+)\b/g)) {
      if (m[1] !== "0") push("E", f, src, m.index, `border-${m[1]} — §4.3 is 1px only`);
    }
    for (const m of src.matchAll(/\bborder-dashed\b|\bborder-dotted\b/g))
      push("E", f, src, m.index, `${m[0]} — §4.3 allows no dashes`);

    /* F — z-index in pages -------------------------------------------------- */
    if (isPage(f)) {
      for (const m of src.matchAll(/\bz-(?:\[|\d)/g))
        push("F", f, src, m.index, "§4.4's ladder lives in one file; no page may name a layer");
    }

    /* G — hand-rolled boxes -------------------------------------------------- */
    if (isPage(f) && tsx) {
      for (const m of src.matchAll(/<(table|input|select)[\s/>]/g))
        push("G", f, src, m.index, `a hand-rolled <${m[1]}> — the kit has a box for it (§0.1)`);
      for (const m of src.matchAll(/fixed\s+inset-0/g))
        push("G", f, src, m.index, "a hand-rolled overlay — use Modal / Drawer (§6.7)");
    }

    /* I — a repeated class string ------------------------------------------- */
    if (tsx) {
      for (const m of src.matchAll(/className=(?:\{)?["'`]([^"'`\n]{40,})["'`]/g)) {
        const key = m[1].trim().replace(/\s+/g, " ");
        if (!classStrings.has(key)) classStrings.set(key, new Set());
        classStrings.get(key).add(f);
      }
    }

    /* J · K — the edition, and the authority claim --------------------------- */
    // J and K read the FULL source on purpose: an edition declaration and an
    // authority claim both live in a header COMMENT, so the stripped copy
    // would make these two rules structurally incapable of ever firing.
    if (isKit(f) || /lib\/design-standard\.ts$/.test(f) || /(^|\/)index\.css$/.test(f)) {
      const head = full.slice(0, 2000);
      if (!head.includes(EDITION) && !/UI-KIT §/.test(head))
        push("J", f, full, 0, `no kit edition declared — §0.3 asks for "${EDITION}"`);
    }
    for (const m of full.matchAll(/\bv4 wins\b|\bthis file wins\b|\boverrides? (?:docs\/)?UI-KIT\b/gi)) {
      if (!/UI-KIT\.md$/.test(f)) push("K", f, full, m.index, "only docs/UI-KIT.md may claim to win (§0.3)");
    }

    /* L · M — storage keys.
     *
     * A key is almost never a literal at the call site — it is a `const` a few
     * lines up (`storeKey`, `HIDDEN_COLS_KEY`, `salKey`). Matching only the
     * call site is how the first draft of this rule reported ZERO on the three
     * sites R2 had already found by hand. So: resolve the expression first.  */
    {
      // Deliberately NOT `order`: it matches every `ops-order-*` key in the
      // portal and reported a salutation draft as a layout preference.
      const KEY_SHAPE = /col|panel|rail|layout|width|collaps|sort|view|density/i;
      const DISPLAY = /title|label|name|text|word|heading/i;
      const resolve = (expr) => {
        const e = expr.trim();
        if (/^[`"']/.test(e)) return e; // already a literal
        const decl = src.match(new RegExp(`(?:const|let|var)\\s+${e.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*=\\s*([^;\\n]+)`));
        return decl ? decl[1].trim() : null;
      };
      for (const m of src.matchAll(/(?:localStorage|sessionStorage)\.(?:get|set)Item\(\s*([^,)\s][^,)]*)/g)) {
        const expr = resolve(m[1]);
        if (!expr) continue;
        if (isPage(f) && KEY_SHAPE.test(expr))
          push("L", f, src, m.index, `${expr} persists the tool's SHAPE — §0.4 keeps UI opinionated`);
        const interp = [...expr.matchAll(/\$\{([^}]+)\}/g)].map((x) => x[1]);
        for (const v of interp) {
          if (DISPLAY.test(v))
            push("M", f, src, m.index, `the key is built from \`${v.trim()}\` — §0.5: nothing keys on a label`);
        }
      }
      for (const m of src.matchAll(/queryKey:\s*\[[^\]]*\$\{([^}]+)\}/g)) {
        if (DISPLAY.test(m[1]))
          push("M", f, src, m.index, `a query key built from \`${m[1].trim()}\` — §0.5`);
      }
    }

    /* N — a component spelling a business word --------------------------------- */
    if (isComponent(f)) {
      for (const w of words) {
        const i = src.indexOf(`"${w}"`);
        if (i >= 0) push("N", f, src, i, `spells "${w}" — §10.1: a word is DELIVERED, not typed into a component`);
      }
    }
  }

  /* H — PageShell's band set vs §1.3 ---------------------------------------- */
  const shell = "apps/web/src/components/kit/PageShell.tsx";
  if (existsSync(join(ROOT, shell))) {
    const src = read(join(ROOT, shell));
    const listBlock = src.match(/variant === "list"[\s\S]{0,1200}/)?.[0] ?? "";
    if (/\bkpi\b/.test(listBlock))
      hits.H.push({ file: shell, line: lineOf(src, src.indexOf("kpi")), msg: 'variant="list" renders a KPI band — §1.3 gives it no such slot' });
  }

  /* I — collapse -------------------------------------------------------------- */
  for (const [key, set] of classStrings) {
    if (set.size >= 2)
      hits.I.push({ file: [...set].join(" · "), line: 0, msg: `the same ${key.length}-char class string in ${set.size} files — §6.6 says extract it` });
  }

  return hits;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * §16 — the GENERATED health block
 * ═══════════════════════════════════════════════════════════════════════════ */
const HEALTH_START = "<!-- UI-HEALTH:START — generated by scripts/check-design.mjs --report. Do not hand-edit. -->";
const HEALTH_END = "<!-- UI-HEALTH:END -->";

const GROUPS = [
  { name: "Typography", chapters: ["§2"] },
  { name: "Colour", chapters: ["§3"] },
  { name: "Spacing", chapters: ["§4"] },
  { name: "Icons", chapters: ["§5"] },
  { name: "Components", chapters: ["§6"] },
  { name: "Table", chapters: ["§7"] },
  { name: "Layout", chapters: ["§1.3", "§8"] },
  { name: "Hierarchy", chapters: ["§1.4"] },
];

/** Split a markdown row into cells, honouring `\|` inside a cell. */
function maskPipes(line) {
  const SENTINEL = "\u0000";
  return line
    .split("\\|")
    .join(SENTINEL)
    .split("|")
    .map((c) => c.trim().split(SENTINEL).join("\\|"));
}

/** Every `Rule · Enforcement · Status · Evidence` row in §1–§8, with its section. */
function lawRows() {
  const lines = read(LAW).split("\n");
  const rows = [];
  let chapter = null,
    section = null,
    inTable = false;
  for (const l of lines) {
    if (/^# §/.test(l)) chapter = l.match(/^# (§[0-9]+)/)[1];
    if (/^## §/.test(l)) section = l.match(/^## (§[0-9.]+)/)[1];
    if (l.startsWith("| Rule | Enforcement | Status | Evidence |")) {
      inTable = true;
      continue;
    }
    if (inTable) {
      if (l.startsWith("|---")) continue;
      if (!l.startsWith("|")) {
        inTable = false;
        continue;
      }
      // A cell may contain an ESCAPED pipe — `size` is `14 \| 16 \| 18` — and a
      // naive split shifts every column after it, so the Status column is read
      // out of the middle of the Enforcement cell. THREE rules read as "not
      // enforced" for exactly that reason and the block generated 33/48 where
      // the tables say 36/48. Mask the escapes, split, then put them back.
      const cells = maskPipes(l);
      rows.push({
        chapter,
        section: section && section.startsWith(chapter) ? section : chapter,
        rule: cells[1],
        enforcement: cells[2],
        status: cells[3],
        evidence: cells[4] ?? "",
        enforced: /✅/.test(cells[3] ?? ""),
        debt: /⚠/.test(l),
      });
    }
  }
  return rows;
}

/** A ✅ must point at a file that exists — §16: "every ✅ points at a file". */
function mechanismMissing(row) {
  if (!row.enforced) return null;
  const names = [...row.evidence.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  for (const n of names) {
    if (!/\.(ts|tsx|mjs|css)$/.test(n)) continue;
    const hit = execSync(`git ls-files "*${n.split("/").pop()}"`, { cwd: ROOT, encoding: "utf8" }).trim();
    if (!hit) return n;
  }
  return null;
}

function bar(pct) {
  const filled = Math.round((pct / 100) * 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function renderReport() {
  const rows = lawRows();
  const design = rows.filter((r) => /^§[1-8]$/.test(r.chapter));
  const governance = rows.filter((r) => ["§0", "§10"].includes(r.chapter));

  const lines = [];
  let total = 0,
    enf = 0;
  for (const g of GROUPS) {
    const rs = design.filter((r) => g.chapters.some((c) => r.section === c || r.section.startsWith(c + ".")));
    if (!rs.length) continue;
    const e = rs.filter((r) => r.enforced).length;
    const pct = Math.round((e / rs.length) * 100);
    total += rs.length;
    enf += e;
    lines.push(`  ${g.name.padEnd(13)} ${bar(pct)}  ${String(pct).padStart(4)}%  ${String(e).padStart(4)} / ${rs.length}`);
  }
  const pct = (enf / total) * 100;
  const debt = design.filter((r) => r.debt).length;
  const scheduled = total - enf - debt;

  const broken = design.map((r) => [r, mechanismMissing(r)]).filter(([, m]) => m);

  const block = [
    HEALTH_START,
    "",
    "```",
    "                         enforced / total",
    ...lines,
    "  ──────────────────────────────────────────",
    `  ${"TOTAL".padEnd(13)} ${bar(pct)}  ${String(Math.round(pct)).padStart(4)}%  ${String(enf).padStart(4)} / ${total}`,
    "```",
    "",
    "| | Count | Meaning |",
    "|---|---|---|",
    `| Rules | **${total}** | design rules stated in §1–§8 |`,
    `| **Enforced** | **${enf}** | Type System / Component API / Build Guard / ESLint is live |`,
    `| Scheduled | ${scheduled} | a card exists |`,
    `| **Blocked on a decision** | **0** | ✅ the PENDING REGISTER is empty |`,
    `| **Human Review debt** | **${debt}** | nobody has found a mechanism |`,
    "",
    `${enf} + ${scheduled} + ${debt} = ${total}.`,
    "",
    `**Coverage — ${enf} / ${total} = ${pct.toFixed(2)}%.** Counted from the Enforcement`,
    "column of every rule table in §1–§8, by `check-design.mjs --report`. **No card may",
    "add to this figure by hand** — three cards did, and by D0.6 the published number",
    "was nine points adrift of the tables it claimed to summarise.",
    "",
    `**Governance and copy rules are outside this count**, as they always have been:`,
    `§0 and §10 carry **${governance.length}** more rule rows. Widening the denominator would read`,
    `${enf} / ${total + governance.length} = ${((enf / (total + governance.length)) * 100).toFixed(2)}% on a day nothing got worse, so it is stated, not taken.`,
    "",
    broken.length
      ? `**⚠ ${broken.length} rule(s) claim ✅ with no file behind them:** ${broken.map(([r, m]) => `${r.rule} → \`${m}\``).join(" · ")}`
      : "**Every ✅ points at a file that exists in the repo** — checked, not asserted.",
    "",
    HEALTH_END,
  ].join("\n");

  const law = read(LAW);
  const re = new RegExp(`${HEALTH_START.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}[\\s\\S]*?${HEALTH_END}`);
  if (!re.test(law)) {
    console.error(`✗ check-design --report: no ${HEALTH_START} … ${HEALTH_END} markers in docs/UI-KIT.md.`);
    process.exit(2);
  }
  writeFileSync(LAW, law.replace(re, block));
  console.log(`✓ §16 regenerated — ${enf}/${total} = ${pct.toFixed(2)}% · debt ${debt} · scheduled ${scheduled}`);

  /* §16's TWO health rules, enforced rather than hoped:
   *   1. coverage may never go down
   *   2. Human Review debt may never grow
   * Both are ratcheted against the baseline, which is what makes them a
   * mechanism instead of a sentence. */
  const prev = existsSync(BASELINE_PATH) ? JSON.parse(read(BASELINE_PATH)) : null;
  if (prev?.health) {
    const fail = [];
    if (pct < prev.health.coverage - 0.005)
      fail.push(`coverage ${pct.toFixed(2)}% is BELOW the baseline ${prev.health.coverage.toFixed(2)}% — §16 health rule 1`);
    if (debt > prev.health.debt)
      fail.push(`Human Review debt ${debt} is ABOVE the baseline ${prev.health.debt} — §16 health rule 2`);
    if (fail.length) {
      console.error("\n✗ §16 health:");
      for (const f of fail) console.error("  • " + f);
      console.error("\nAdd the mechanism in the same PR, or name the card that will (§16).\n");
      process.exit(1);
    }
    console.log(`  health OK — coverage ≥ ${prev.health.coverage.toFixed(2)}% · debt ≤ ${prev.health.debt}`);
  }
  if (broken.length) {
    console.error(`\n✗ ${broken.length} rule(s) claim ✅ with no file behind them:`);
    for (const [r, m] of broken) console.error(`  • ${r.rule} → ${m}`);
    process.exit(1);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Main
 * ═══════════════════════════════════════════════════════════════════════════ */
if (REPORT) {
  renderReport();
  process.exit(0);
}

const rec = records();
const words = businessWords();
const files = inScopeFiles();
const hits = scan(files, rec, words);
const counts = Object.fromEntries(RULES.map((r) => [r.id, hits[r.id].length]));

if (UPDATE) {
  // The health half of the baseline is what makes §16's two rules a ratchet.
  const rows = lawRows().filter((r) => /^§[1-8]$/.test(r.chapter));
  const enf = rows.filter((r) => r.enforced).length;
  const health = { coverage: (enf / rows.length) * 100, debt: rows.filter((r) => r.debt).length };
  writeFileSync(
    BASELINE_PATH,
    // `takenAt` is the card whose MEASUREMENT this is, not the card that wrote
    // the writer. D1 froze it; D2 re-froze it after the typography sweep, so a
    // hardcoded "D1" would tell the next chat these are D1's numbers.
    JSON.stringify({ edition: EDITION, takenAt: "D2", files: files.length, counts, health }, null, 2) + "\n",
  );
  console.log(`✓ baseline written — ${files.length} files in scope.`);
  for (const r of RULES) console.log(`   ${r.id}  ${String(counts[r.id]).padStart(5)}  ${r.what}`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(read(BASELINE_PATH)) : null;

console.log(`\nBuild Guard — ${EDITION} · §13.2 stage ${STRICT ? "2/3 (strict)" : "1 (warn only)"} · ${files.length} files in scope\n`);
let over = 0;
for (const r of RULES) {
  const n = counts[r.id];
  const base = baseline?.counts?.[r.id];
  const delta = base === undefined ? "" : n > base ? `  ▲ +${n - base} over baseline ${base}` : n < base ? `  ▼ −${base - n}` : "  =";
  if (base !== undefined && n > base) over++;
  console.log(`  ${r.id} ${String(n).padStart(5)}  ${r.law.padEnd(6)} ${r.what}${delta}`);
}
console.log(`\n  ${Object.values(counts).reduce((a, b) => a + b, 0)} findings total.`);

if (ARG.has("--list")) {
  for (const r of RULES) {
    if (!hits[r.id].length) continue;
    console.log(`\n── RULE ${r.id} · ${r.what} (${r.law})`);
    for (const h of hits[r.id].slice(0, 25)) console.log(`   ${h.file}${h.line ? ":" + h.line : ""} — ${h.msg}`);
    if (hits[r.id].length > 25) console.log(`   … ${hits[r.id].length - 25} more`);
  }
}

if (!baseline) {
  console.log("\n  No baseline yet — run `node scripts/check-design.mjs --update-baseline`.\n");
  process.exit(0);
}
if (STRICT && over) {
  console.error(`\n✗ ${over} rule(s) above baseline. Stage 2/3: the baseline may only go down.\n`);
  process.exit(1);
}
console.log(`\n  Stage 1 — warn only. Nothing fails the build. Stage 2 turns on --strict (D2–D4).\n`);
process.exit(0);
