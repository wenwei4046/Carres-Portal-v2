/**
 * CARRES PORTAL — DESIGN STANDARD (single source of truth)
 * =========================================================
 * ⭐ v4 — rewritten 2026-07-15 from `docs/CARRES_UI_KIT_V4.md` (Jess).
 * THAT file overwrites ALL prior UI baselines; this module is its
 * machine-readable mirror. Where any older doc, code comment, or token
 * conflicts with UI-KIT v4, **v4 wins**. Prior scattered UI decisions
 * (cream content backgrounds, mixed font sizes, light-grey content text,
 * small checkboxes) are VOID.
 *
 * Principles (UI-KIT v4 §1–§2):
 *  - The content area is WHITE. Brand colour lives only in the left nav.
 *  - Colour is a functional signal, never decoration. It appears only for
 *    ACTION · SELECTION · STATUS · ALERT. Everything else black/grey/white.
 *  - Flame appears ONLY on a clickable primary action + a checked checkbox;
 *    at most ONE flame primary button per block; never on titles / icons /
 *    borders / dividers / hovers.
 *  - Content is darker than labels: main content near-black, secondary
 *    mid-grey, labels/meta muted. NEVER light-grey content text.
 *
 * Page-by-page alignment status: tokens below are LIVE law; existing pages
 * still carrying old values get converged one page at a time (Jess's call
 * on order). Do NOT hand-roll a hex/px that exists here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. COLOUR — UI-KIT v4 §1: 5 neutrals + brand + semantic. In JSX prefer the
//    Tailwind class / CSS var; the hex is the authoritative value.
// ─────────────────────────────────────────────────────────────────────────────
export const COLOR = {
  // Text layering (§4) — content DARK, labels muted. Date is content (dark).
  textPrimary:   { hex: "#1A1A1A", use: "main content — REF, customer, date, amount, address" },
  textSecondary: { hex: "#6B7280", use: "secondary info", class: "text-base-500" },
  textMuted:     { hex: "#A8A8A8", use: "labels, icons, meta words ('ordered', 'PHONE'), table headers" },

  // Surfaces — white content on a very-light grey canvas.
  surface: { hex: "#FFFFFF", use: "content background, panels, rows", class: "bg-white" },
  canvas:  { hex: "#F0EFE9", use: "page canvas behind white panels", cssVar: "--background", class: "bg-background" },

  // Brand + selection (functional ONLY — see §2 discipline).
  flame:      { hex: "#C44D2B", use: "PRIMARY ACTION buttons + checkbox-checked ONLY", cssVar: "--primary" },
  selectBlue: { hex: "#378ADD", use: "row selected / multi-select ONLY" },
  selectedRowWash: { hex: "#E6F1FB", use: "whole selected row soft blue wash" },

  // Semantic status (always rendered as a PILL — §6; dark same-hue text on
  // a soft tint, never bare coloured text).
  green: { text: "#3B6D11", fill: "#EAF3DE", use: "ready / paid / on-time" },
  amber: { text: "#854F0B", fill: "#FAEEDA", use: "waiting / chasing" },
  red:   { text: "#A32D2D", fill: "#FCEBEB", use: "problem / No PO / overdue / alert" },

  // Hairline (v4 §9: 0.5px hairline borders on white panels).
  hairline: { hex: "#E5E7EB", cssVar: "--border", class: "border-base-200" },

  // LEGACY (pre-v4, pending page-by-page removal): the cream section band
  // inside white panels. v4 voids cream content backgrounds — replace with
  // white/canvas layering as each page is aligned.
  sectionBand:      { hex: "#F1EFE8", class: "section-band", legacy: true },
  sectionBandTitle: { hex: "#221F20", class: "section-band-title", legacy: true },
  sectionBandTotal: { hex: "#6F6960", class: "section-band-total", legacy: true },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. STATUS PILLS — v4 §6: soft tinted bg + dark same-hue text, pill radius.
//    Status is ALWAYS a pill, never bare text. Three semantics only.
//    (`.pill-confirmed` / `.pill-warning` / `.pill-overdue` in index.css now
//    carry these values; blue `.pill-sent` is a legacy scheduled chip pending
//    v4 alignment — v4 blue means SELECTION, not status.)
// ─────────────────────────────────────────────────────────────────────────────
export const CHIP = {
  ready:   { meaning: "ready / paid / on-time",      text: "#3B6D11", fill: "#EAF3DE", pillClass: "pill-confirmed" },
  waiting: { meaning: "waiting / chasing",           text: "#854F0B", fill: "#FAEEDA", pillClass: "pill-warning" },
  overdue: { meaning: "problem / No PO / overdue",   text: "#A32D2D", fill: "#FCEBEB", pillClass: "pill-overdue" },
} as const;

/** Selection (v4 §8) — blue is selection ONLY, never action/decoration. */
export const SELECTION = {
  checkbox: "#378ADD",
  rowWash:  "#E6F1FB",
} as const;

/** Checkbox (v4 §5 + §8b): 16–18px square, clearly visible; the locked
 *  in-row density value is 17px. Unchecked = grey outline empty box;
 *  checked = flame-filled + white tick. */
export const CHECKBOX = {
  sizePx: 17,           // §8b locked (16–18 allowed range)
  checkedFill: "#C44D2B",
  uncheckedBorder: "#A8A8A8",
} as const;

/** Row density (v4 §8b, LOCKED): list rows are 44px FIXED — content adapts
 *  to the row (truncate/collapse), the row NEVER grows to the content. The
 *  three sources must agree: OperationOrdersControl td height, this value,
 *  and the actual render. */
export const ROW = {
  heightPx: 44,         // FIXED — not min-height semantics
  contentFontPx: 12,
  checkboxPx: 17,
  pillFontPx: 11,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. TYPOGRAPHY — v4 §3: Inter, layer by WEIGHT not size. Weights 400/500/
//    600/700. Numbers/codes/money/phone = slashed-zero monospace (JetBrains
//    Mono with the `zero` feature — wired in index.css `@layer base`).
//    Most content sits at 14–15; ONLY page title (24) + hero number (20)
//    rise above. REF and SO are the SAME size — distinguish by weight/colour.
//    Utility classes live in index.css (`.t4-*` = the v4 ramp).
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

/** Fonts (v4 §3; loaded in apps/web/index.html, mapped in tailwind.config.ts). */
export const FONT = {
  body: "Inter",           // all text/UI — weights 400 / 500 / 600 / 700
  mono: "JetBrains Mono",  // numbers / codes / money / phone — slashed zero
                           // (`font-feature-settings: "zero" 1` — index.css)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 4. LAYOUT — v4 §9 locked decisions + live shell geometry (unchanged by v4).
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
  tableRowHeight:       44, // v4 §8b LOCKED — FIXED height, see ROW below
  headerHeight:         56,
} as const;

export const RADIUS = {
  card:  12,  // v4 §9 — 12px radius on cards (SectionCard already complies)
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
