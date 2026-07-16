/**
 * CARRES PORTAL — DESIGN STANDARD record (the contract lives in docs/UI-KIT.md)
 * =========================================================
 * Locked 2026-07-12. This file RECORDS the values that are already live in the
 * codebase — it does NOT introduce new visuals. Every value here was read back
 * from the real source:
 *   • colours + radius  → `apps/web/src/index.css` `:root` (v17, locked 2026-06-09)
 *   • tailwind mapping  → `apps/web/tailwind.config.ts`
 *   • layout dims       → the live shells (`PortalSidebar.tsx`, `OperationApp.tsx`,
 *                         `OperationRightRail.tsx`)
 *   • status chips      → `OperationOrdersControl.tsx` (Jess's Orders list)
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Colours are ALREADY a single source of truth: they live once in index.css
 * `:root` (as HSL) and reach components only through Tailwind utility classes
 * (`bg-primary`, `text-base-700`, …). Panels should NEVER hard-code a hex that
 * duplicates a token — use the class.
 *
 * What was NOT centralised before today is the LAYOUT geometry (sidebar width,
 * rail width, header height, card radius) — those numbers were re-typed inline in
 * each shell. This file makes them importable so new panels reference ONE set
 * instead of eyeballing a magic number. Import `LAYOUT`, `RADIUS`, `TYPE`, and
 * (only where a token class can't be used) `CHIP`.
 *
 * DO NOT edit a value here to change the look. To change the look, edit index.css
 * (colours/radius) or the owning shell (layout), THEN update this record.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. COLOUR — exact hex + the CSS var + the Tailwind class to use.
//    Authoritative source = index.css `:root`. Values below are the resolved hex
//    of those HSL tokens, for reference/reporting only. In JSX, use `className`.
// ─────────────────────────────────────────────────────────────────────────────
export const COLOR = {
  // Surfaces
  pageBg:      { hex: "#F5F1EA", cssVar: "--background", class: "bg-background" }, // Carres cream
  card:        { hex: "#FFFFFF", cssVar: "--card",       class: "bg-card" },       // white card
  sidebarBg:   { hex: "#FFFFFF", cssVar: "--card",       class: "bg-white" },      // rail + right rail
  mainBg:      { hex: "#F9FAFB", cssVar: "--base-50",    class: "bg-base-50" },    // <main> behind cards

  // Hairline / borders
  hairline:    { hex: "#E5E7EB", cssVar: "--border",     class: "border-base-200" }, // gray-200, 1px
  cardHairline:{ hex: "rgba(17,24,39,0.08)", cssVar: "—", class: ".card border" },   // proto .card border

  // Text
  ink:         { hex: "#111827", cssVar: "--foreground", class: "text-base-900" }, // gray-900 body ink
  inkStrong:   { hex: "#1F2937", cssVar: "--base-800",   class: "text-base-800" },
  muted:       { hex: "#6B7280", cssVar: "--base-500",   class: "text-base-500" }, // gray-500 muted
  faint:       { hex: "#9CA3AF", cssVar: "--base-400",   class: "text-base-400" }, // icons at rest

  // Section band — the ONE cream title band shared by the list facet groups
  // (SUMMARY / CHASE NOW / …) and every order-drawer panel header. Values live
  // in index.css `.section-band*` (2026-07-13); render via <SectionBand>
  // (components/SectionPanel.tsx), never a bespoke bar. NOTE: deliberately a
  // slightly deeper cream than pageBg (#F5F1EA) so the band reads on the card.
  sectionBand:      { hex: "#F1EFE8", cssVar: "—", class: "section-band" },
  sectionBandTitle: { hex: "#221F20", cssVar: "—", class: "section-band-title" }, // danger variant #991B1B = .section-band-title-danger
  sectionBandTotal: { hex: "#6F6960", cssVar: "—", class: "section-band-total" },

  // Brand + primary action
  flame:       { hex: "#C44D2B", cssVar: "--primary",     class: "text-primary / bg-primary" }, // brand / hero CTA
  flameHover:  { hex: "#9A3D22", cssVar: "--signature-700", class: "hover:bg-signature-700" },
  flameFill:   { hex: "#F4E4DD", cssVar: "--signature-50", class: "bg-signature-50" },  // active chip/card fill
  darkPrimary: { hex: "#111827", cssVar: "--base-900",   class: "bg-base-900" },  // BLACK workhorse btn / active tab
  focusRing:   { hex: "#C44D2B", cssVar: "--ring",       class: "ring-primary" },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 2. STATUS CHIPS — the four semantic tones.
//
//    ✅ RESOLVED 2026-07-12 (Jess): the two chip palettes were unified onto the
//    warmer Orders-list fill. `index.css` `.pill-warning/-confirmed/-overdue/-sent`
//    now carry the `ordersFill` + `ordersBorder` values below (ink text unchanged),
//    so a `.pill-*` renders identically to an `OperationOrdersControl` chip. The
//    base `.pill` got a transparent border so bordered + border-less pills (draft/
//    collected/neutral keep no border) share one box height. `pillFill` below is
//    the PRE-unification cooler Tailwind-100 fill, kept for historical reference.
// ─────────────────────────────────────────────────────────────────────────────
export const CHIP = {
  // key → { text (ink, SHARED by both), ordersFill, ordersBorder, pillFill, pillClass }
  waiting:   { meaning: "waiting stock / low",   text: "#92400E", ordersFill: "#FBE8C6", ordersBorder: "#F0D08A", pillFill: "#FEF3C7", pillClass: "pill-warning"   }, // amber
  ready:     { meaning: "ready / confirmed",     text: "#166534", ordersFill: "#D6EFD9", ordersBorder: "#A9D8B0", pillFill: "#DCFCE7", pillClass: "pill-confirmed" }, // green
  overdue:   { meaning: "overdue / no-PO / chase", text: "#991B1B", ordersFill: "#FCE4E4", ordersBorder: "#F3B4B4", pillFill: "#FEE2E2", pillClass: "pill-overdue"   }, // red
  scheduled: { meaning: "scheduled / call / assign", text: "#1E40AF", ordersFill: "#D3E4FB", ordersBorder: "#A9C8F2", pillFill: "#DBEAFE", pillClass: "pill-sent"      }, // blue
  done:      { meaning: "done / neutral",        text: "#4B5563", ordersFill: "#EAE7DF", ordersBorder: "#D6D2C6", pillFill: "#F3F4F6", pillClass: "pill-neutral"   }, // grey
} as const;

// The semantic token behind each tone (for `bg-success` / `text-info` etc.).
export const CHIP_TOKEN = {
  waiting:   { hex: "#D97706", cssVar: "--warning", soft: "#FEF3C7" },
  ready:     { hex: "#16A34A", cssVar: "--success", soft: "#DCFCE7" },
  overdue:   { hex: "#DC2626", cssVar: "--danger",  soft: "#FEE2E2" },
  scheduled: { hex: "#2563EB", cssVar: "--info",    soft: "#DBEAFE" },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. LAYOUT — exact px. These are the numbers to import instead of re-typing.
// ─────────────────────────────────────────────────────────────────────────────
export const LAYOUT = {
  sidebarWidth:        232, // PortalSidebar expanded (px)
  sidebarCollapsed:     60, // PortalSidebar icon rail (px)
  sidebarActiveBar:      3, // flame active-item left bar (px)
  rightRailPanel:      320, // OperationRightRail expanded panel (px)
  rightRailStrip:       52, // OperationRightRail icon strip (px)
  railHeaderHeight:     48, // right-rail panel header (h-12)
  tableRowHeight:       50, // Orders list row (`[&_td]:h-[50px]`)
  // NOTE: there is NO single global top bar. The portal shell is a 3-column grid
  // `auto minmax(0,1fr) auto` (sidebar | main | right rail); each page renders
  // its own header. Page/section headers cluster at 48–56px (h-12 / h-14) — use
  // `headerHeight` for a new page header to stay consistent.
  headerHeight:         56, // recommended page header (h-14)
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 4. RADIUS + spacing scale (exact px). Radius token base = --radius (8px).
// ─────────────────────────────────────────────────────────────────────────────
export const RADIUS = {
  card:  8,  // proto `.card` / token `--radius` (rounded-lg)
  md:    6,  // buttons (rounded-md)
  sm:    4,  // small chips / cells (most-used in Orders grid: rounded-[4px])
  pill: 9999,// fully round (rounded-full)
  pos:  16,  // 2990s POS card (rounded-2xl) — dealer POS only
} as const;

export const SPACE = {
  hairline: 1,   // border width (px)
  cardPad:  16,  // p-4 — standard card padding
  pagePad:  24,  // p-6 / px-6 — page gutter
  gap:      8,   // gap-2 — default element gap (most-used)
  gapRow:   12,  // gap-3 — row/label gap
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 5. TYPE SCALE — exact px (mirrors the `.t-*` utilities in index.css @layer
//    components). Use the CLASS in JSX; the px here is for reference/reporting.
// ─────────────────────────────────────────────────────────────────────────────
export const TYPE = {
  h1:    { px: 32, weight: 700, class: "t-h1" },
  h2:    { px: 24, weight: 700, class: "t-h2" },
  h3:    { px: 18, weight: 600, class: "t-h3" },
  h4:    { px: 15, weight: 600, class: "t-h4" },
  body:  { px: 14, weight: 400, class: "t-body" },
  small: { px: 13, weight: 400, class: "t-small" },  // also the button text size
  tiny:  { px: 12, weight: 400, class: "t-tiny" },
  micro: { px: 11, weight: 500, class: "t-micro" },  // uppercase label / kicker
} as const;

/** Font families (from tailwind.config.ts). */
export const FONT = {
  body:  "Inter",           // font-sans / font-body / font-display
  mono:  "JetBrains Mono",  // font-mono — SKU / codes / dimensions
  price: "Archivo",         // font-price — POS price hero only
  num:   ".t-num",          // Inter + lining+tabular figures — money / qty / margin
} as const;
