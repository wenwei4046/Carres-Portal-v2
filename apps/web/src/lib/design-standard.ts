/**
 * CARRES PORTAL — DESIGN STANDARD (the machine mirror)
 * =========================================================
 * FOLLOWS: `docs/ui/MASTER.md` — the current UI authority.
 * §0.3. This module is a MIRROR of that law and nothing else.
 *
 * ⚠️ **`docs/ui/MASTER.md` GOVERNS.** It is the one current UI authority; this is a
 * second authority claim a Build-Guard failure (D1). This header used to read
 * *"where any older doc, code comment, or token conflicts with UI-KIT v4, v4
 * wins"* — two bodies of one kit each declaring itself the winner. That claim
 * is retired: **this file never outranks the law, and a change is never driven
 * from here.** Edit the law, then mirror it.
 *
 * ⚠️ **THE VALUES BELOW ARE STALE AND ARE NOT BEING CORRECTED HERE.** They
 * were written against a kit rewritten on 2026-07-15; the law was rewritten on
 * 2026-07-27 and several tokens moved (see the per-block notes). Correcting a
 * value is a VISUAL change and belongs to the codemod cards **D2 · D3 · D4** —
 * card D0.6 corrected this file's CLAIMS and deliberately touched no exported
 * value. Read the governed token reference linked from `docs/ui/MASTER.md`, never from here.
 *
 * Measured 2026-07-28, because it changes how much this file matters:
 *   real importers ............................ 1  (lib/staff-avatar.ts, for
 *                                                   AVATAR_COLORS only)
 *   files that merely NAME it in a comment ... 28
 *   parsed by scripts/check-design-standard.mjs   NO — it is hex-ALLOW-LISTED
 * Every export except AVATAR_COLORS therefore has no reader today.
 *
 * The retired v4 §1–§2 principle block that stood here is deleted rather than
 * annotated (§0.2, one concern one file). Two of its four lines contradicted
 * the current law outright — it said the flame appears on any primary action
 * and on a checked checkbox, while §3.4 keeps the flame in **exactly one
 * place, the logo**, and §13.3 rule B fails the build on it.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. COLOUR — mirrors UI-KIT 2026-07-27 §3. ⚠️ STALE: §3.1 sources every
//    colour from `@radix-ui/colors` and "names the STEP, never the hex", so a
//    hex table is no longer the authoritative form. D3 retires this block.
// ─────────────────────────────────────────────────────────────────────────────
export const COLOR = {
  // Text layering (§4) — content DARK, labels muted. Date is content (dark).
  textPrimary:   { hex: "#1A1A1A", use: "main content — REF, customer, date, amount, address" },
  textSecondary: { hex: "#6B7280", use: "secondary info", class: "text-base-500" },
  textMuted:     { hex: "#A8A8A8", use: "labels, icons, meta words ('ordered', 'PHONE'), table headers" },

  // Surfaces — white content on a very-light grey canvas.
  // ⚠️ `canvas` below cites "v4 §11a", and **§11a does not exist** in UI-KIT
  // 2026-07-27 (§11 is the Reference Library and has no sub-sections). The
  // live law is §3.2, which froze the canvas at Radix `slate-3` (Q2). The dead
  // citation sits inside an EXPORTED string, and D0.6 may change no exported
  // value — so it is neutralised here and corrected by D3 with the hex.
  surface: { hex: "#FFFFFF", use: "content background, panels, rows", class: "bg-white" },
  canvas:  { hex: "#F3F4F6", use: "page canvas behind white panels — v4 §11a COOL neutral (warm #F0EFE9 retired)", cssVar: "--background", class: "bg-background" },

  // Brand + selection. ⚠️ STALE: `flame` below is described as a PRIMARY
  // ACTION colour; UI-KIT 2026-07-27 §3.4 keeps the flame in exactly one
  // place, the logo, and §3.3 gives the action job to blue. D3 corrects it.
  flame:      { hex: "#C44D2B", use: "PRIMARY ACTION buttons + checkbox-checked ONLY", cssVar: "--primary" },
  selectBlue: { hex: "#378ADD", use: "row selected / multi-select ONLY" },
  selectedRowWash: { hex: "#E6F1FB", use: "whole selected row soft blue wash" },

  // Semantic status (always rendered as a PILL — §6; dark same-hue text on
  // a soft tint, never bare coloured text).
  green: { text: "#3B6D11", fill: "#EAF3DE", use: "ready / paid / on-time" },
  amber: { text: "#854F0B", fill: "#FAEEDA", use: "waiting / chasing" },
  red:   { text: "#A32D2D", fill: "#FCEBEB", use: "problem / No PO / overdue / alert" },

  // Hairline. ⚠️ STALE: the retired "v4 §9" said 0.5px; UI-KIT 2026-07-27
  // §4.3 is "1px only", in exactly two colours (`slate-5` · `slate-6`).
  hairline: { hex: "#E5E7EB", cssVar: "--border", class: "border-base-200" },

  // LEGACY (pre-v4, pending page-by-page removal): the cream section band
  // inside white panels. v4 voids cream content backgrounds — replace with
  // white/canvas layering as each page is aligned.
  sectionBand:      { hex: "#F1EFE8", class: "section-band", legacy: true },
  sectionBandTitle: { hex: "#221F20", class: "section-band-title", legacy: true },
  sectionBandTotal: { hex: "#6F6960", class: "section-band-total", legacy: true },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. STATUS PILLS — mirrors UI-KIT 2026-07-27 §3.6 · §6.4. Status is ALWAYS
//    a pill, never bare text; the tone comes from a CONDITION, never a verb.
//    ⚠️ STALE: the law names FIVE tones, not three, and `StatusPill` (D0.5a)
//    is the one renderer. Three semantics only.
//    (`.pill-confirmed` / `.pill-warning` / `.pill-overdue` in index.css now
//    carry these values; blue `.pill-sent` is a legacy scheduled chip pending
//    v4 alignment — v4 blue means SELECTION, not status.)
// ─────────────────────────────────────────────────────────────────────────────
export const CHIP = {
  ready:   { meaning: "ready / paid / on-time",      text: "#3B6D11", fill: "#EAF3DE", pillClass: "pill-confirmed" },
  waiting: { meaning: "waiting / chasing",           text: "#854F0B", fill: "#FAEEDA", pillClass: "pill-warning" },
  overdue: { meaning: "problem / No PO / overdue",   text: "#A32D2D", fill: "#FCEBEB", pillClass: "pill-overdue" },
} as const;

/** Selection. ⚠️ STALE: UI-KIT 2026-07-27 §3.3 gives blue BOTH jobs —
 *  action (`blue-9` filled) and selection (`blue-3` wash). D3 corrects it. */
export const SELECTION = {
  checkbox: "#378ADD",
  rowWash:  "#E6F1FB",
} as const;

/** Checkbox. ⚠️ STALE: UI-KIT 2026-07-27 §6.12 rules 16 square at radius 4,
 *  `blue-9` fill and a white tick — not 17px and not flame-filled. The live
 *  control is `components/kit/Checkbox.tsx` (D0.5b). D3 corrects the values. */
export const CHECKBOX = {
  sizePx: 17,           // §8b locked (16–18 allowed range)
  checkedFill: "#C44D2B",
  uncheckedBorder: "#A8A8A8",
} as const;

/** Row density: a list row is FIXED — content adapts to the row
 *  (truncate/collapse), the row NEVER grows to the content. ⚠️ STALE: the
 *  HEIGHT is no longer ruled here. UI-KIT 2026-07-27 §7 (Table Dictionary) is
 *  written by card D0.5c and `DataTable` owns the number. */
export const ROW = {
  heightPx: 44,         // FIXED — not min-height semantics
  contentFontPx: 12,
  checkboxPx: 17,
  pillFontPx: 11,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. TYPOGRAPHY — ⚠️ STALE, and this block is the furthest behind. UI-KIT
//    2026-07-27 §2.1 rules SIX tokens (`text-page` … `text-label`, each
//    carrying size + weight + line-height in one class) and §2.2 rules THREE
//    weights — **700 is dead** (Q3, frozen 2026-07-28). The `.t4-*` ramp below
//    is the retired 2026-07-15 scale and dies in the D2 codemod. Numbers /
//    codes / money / phone are still slashed-zero monospace (§2.3).
// ─────────────────────────────────────────────────────────────────────────────
export const TYPE = {
  pageTitle:    { px: 24, weight: 600, class: "t4-page-title", note: "largest — NOTHING exceeds this" },
  heroNumber:   { px: 20, weight: 700, class: "t4-hero-num", note: "e.g. Outstanding — big, but < page title" },
  sectionTitle: { px: 16, weight: 600, class: "t4-section" },
  content:      { px: 15, weight: 500, class: "t4-content", note: "REF / customer / date / amount — near-black" },
  secondary:    { px: 14, weight: 400, class: "t4-secondary" },
  label:        { px: 12, weight: 500, class: "t4-label", note: "uppercase, muted — panel labels / table headers" },
  caption:      { px: 12, weight: 400, class: "t4-caption", note: "muted meta" },
} as const;

/** Fonts (UI-KIT 2026-07-27 §2.3; loaded in apps/web/index.html, mapped in
 *  tailwind.config.ts). ⚠️ the weight list below still names 700, which §2.2
 *  deleted into 600 — D2 removes it. */
export const FONT = {
  body: "Inter",           // all text/UI — weights 400 / 500 / 600 / 700
  mono: "JetBrains Mono",  // numbers / codes / money / phone — slashed zero
                           // (`font-feature-settings: "zero" 1` — index.css)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 4. LAYOUT — live shell geometry. ⚠️ the retired "v4 §9" no longer exists;
//    UI-KIT 2026-07-27 §8.1 owns the portal's width table and §7 owns the row,
//    both written by card D0.5c. Until then these are measurements of what the
//    shell renders, not law.
// ─────────────────────────────────────────────────────────────────────────────
export const LAYOUT = {
  // Order-detail page: two columns, left = summaries, right = Items hero.
  orderDetailLeftPct:  32,
  orderDetailRightPct: 68,
  // Shell geometry (live values — PortalSidebar / OperationRightRail).
  sidebarWidth:        232,
  sidebarCollapsed:     60,
  sidebarActiveBar:      3,
  rightRailPanel:      320,
  rightRailStrip:       52,
  railHeaderHeight:     48,
  tableRowHeight:       44, // ⚠️ STALE — §7 / `DataTable` owns this (D0.5c)
  headerHeight:         56,
} as const;

export const RADIUS = {
  card:  12,  // ⚠️ STALE — UI-KIT 2026-07-27 §4.2 rules 10 (`rounded-card`)
  md:    6,   // buttons
  sm:    4,   // small chips / cells
  pill: 9999, // status pills — fully round
} as const;

export const SPACE = {
  hairline: 1,   // rendered border width (px) — "0.5px hairline" intent
  cardPad:  16,
  pagePad:  24,
  gap:      8,
  gapRow:   12,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Staff identity palette (Jess round-3 2026-07-18) — the PIC avatar colours.
// A fixed muted set that deliberately AVOIDS the status hues (green/amber/
// red), flame (action) and selection blue, so identity never reads as state.
// Consumed via lib/staff-avatar.ts (initials + stable per-user hash).
// ─────────────────────────────────────────────────────────────────────────────
// 8 DISTINCT non-status hues (Jess 2026-07-19: "every staff own icon" — the old
// 6-cool set landed Shasha + Yu Jun on near-identical purples). Deliberately
// AVOIDS the status hues (green/amber/red), flame + selection-blue, so a person
// never reads as a state. Ordered so the current 3 staff hash to well-separated
// colours: Yu Jun→blue · Khor Yee→rose · Shasha→teal.
export const AVATAR_COLORS: { bg: string; fg: string }[] = [
  { bg: "#E0E7FF", fg: "#3730A3" }, // indigo
  { bg: "#DBEAFE", fg: "#1E40AF" }, // blue
  { bg: "#FCE7F3", fg: "#9D174D" }, // rose
  { bg: "#EDE9FE", fg: "#5B21B6" }, // violet
  { bg: "#CFFAFE", fg: "#155E75" }, // cyan
  { bg: "#FAE8FF", fg: "#86198F" }, // fuchsia
  { bg: "#CCFBF1", fg: "#115E59" }, // teal
  { bg: "#E2E8F0", fg: "#334155" }, // slate
];
