# 01 · Design tokens

**Current shared visual target · owner instruction 9 Oct 2026 · supplied v8.** This replaces the previous visual values in this file. Source: `Sales Order.zip`, `UI Kit.md`, `carres-tokens.css`, `Carres UI Kit.dc.html` and `Sales Order Outright Layout v8.dc.html`. This is a design adoption, not a claim that the React kit or production has migrated.

Business facts, permissions, completion gates, document formats and exact words remain owned by module MASTERs and COPY-STANDARD. The downloaded Ops Rules are not imported as business authority.

## 0 · One kit and implementation boundary

| Home | Purpose | Status |
|---|---|---|
| This file | Shared visual values | Current target |
| `docs/ui/carres-tokens.css` | Machine-readable source token values | Current target; not wired into application |
| `docs/02-components.md` | Shared component contracts | Current target |
| `docs/03-page-patterns.md` | Shared page compositions | Current target |
| `docs/ui/MASTER.md` | Interaction, ownership and acceptance | Current authority |
| `apps/web/src/components/kit/` and `components/register/` | Existing reusable implementation | Migration required; preserve APIs and behaviour |
| `docs/ui-reference/sales-order-design/` | Imported prototype and component specimen | Reference only; not production code or business law |

Use tokens, not page-local numbers. Change existing components once; do not clone the prototype into every module. Existing runtime tokens are migration evidence, not a competing visual standard. Git keeps the old values; no archive or second kit is created.

**Measurement context:** values are CSS pixels. Shell dimensions describe the desktop composition (1280–1920px viewport; primary comparison 1440px). Register heights are minima inside the table canvas; compact facts have their own §5.1 recipe. Responsive decisions use available canvas after navigation/Summary/Tasks, not viewport alone. Mobile/partner hit areas use §3, not glyph dimensions. No supplied phone breakpoint is claimed approved or verified.

## 1 · Colour

| Role | Value |
|---|---|
| Ink / body / tab | `#221F20` / `#3A3F47` / `#4A4F57` |
| Secondary / muted / menu | `#6B7178` / `#8A9099` / `#5C6168` |
| Canvas / surface / hover | `#F5F3F0` / `#FFFFFF` / `#EFECE8` |
| Selected background / text | `#FBE6DB` / `#A33A14` |
| Main button | Ink background, white text |
| Card / control / header border | `#E9EBEE` / `#E4E1DC` / `#E4E1DC` |
| Input / chip / header-icon border | `#E1E4E8` |
| Search background | `#F0F1F3` |
| Footer border | `#EEF0F2` |
| Row / section border | `#EEECE8` / `#EEECE8` |
| Done background / text | `#E7F6EC` / `#1E7A40` |
| Warning background / text | `#FBF0D6` / `#7A5A00` |
| Problem background / text | `#FDECEC` / `#B42318` |
| Neutral background / text | `#F0F1F3` / `#3A3F47` |
| Hold background / text | `#221F20` / `#FFFFFF` |
| Online | `#1E8A47` |

Selected orange is selection, not a warning. Status colour follows the actual condition, never the action verb. Always show the status word. No solid white-text status rule remains except Hold. Source disagreement: Layout Standard says errors amber, while the supplied token file includes a red Problem pair; use amber for form errors, reserve Problem pair for an evidenced problem. Do not use red merely because an amount is unpaid.

## 2 · Typography

Inter, tabular numerals, weights 400 / 500 / 600. No 700. Long text wraps where needed; dates, amounts, document numbers and status words must remain readable.

| Role | Size / weight |
|---|---|
| Page title | 20 / 500, tracking −.02em |
| Breadcrumb | 14 / 400 |
| Card / drawer title | 15 / 600 |
| Menu | 14 / 500; selected 600 |
| Body / table | 13 / 400 |
| Label / second fact | 12 / 400 or 500 |
| Small / group in source | 11 / 400 and 10 / 600 respectively |

Current source source allows group headings 10 and small text 11; essential body and label facts remain 13 / 12. Use source sizes by role, not miniature body text. Staff avatars use a fixed per-person colour, initials and an accessible full-name/role label; tooltip gives full identity and cover context. Colour alone never identifies the person. Names needed for an action remain reachable by keyboard and touch.

## 3 · Controls and surfaces

| Token / part | Target |
|---|---|
| Corner / pill radius | 8 / 999 px |
| Main/header button | Height 34, horizontal padding 14, text 13 |
| Toolbar button | Height 32, horizontal padding 12, text 13 |
| Toolbar icon button | 36 × 36, icon 21 |
| Header icon button | 34 × 34, icon 20 |
| Tabs | Padding 5 × 12, text 13, gap 2 |
| Switch segment | Padding 4 × 10, text 12 |
| Status pill | Padding 3 × 10, text 12 / 500, no truncation |
| Choice chip | Padding 4 × 10, text 12 / 600 |
| Input / inline edit | Height 32 / 30, horizontal padding 10 |
| Global search | Height 34, horizontal padding 12, round |
| Checkbox drawing | 16 × 16; enlarge hit area on touch |
| Card | Padding 14 × 16, border, no shadow |
| Popup | Padding 6, item padding 7 × 10, radius 8 |
| Popup shadow | `0 8px 28px rgba(22,24,29,.1)` |
| Drawer shadow | `0 12px 40px rgba(34,31,32,.18)` |
| Backdrop | `rgba(34,31,32,.18)` |

One main button per active action area. Read-only facts are text, not disabled inputs. Icons in supplied prototype use Material Symbols Rounded, outlined, weight 300, sizes 16–21. Migrate through the existing shared Icon adapter; preserve accessible names and icon meaning IDs. Do not load a separate icon system per page. Hit areas are at least 32px on desktop and 44px on mobile/partner surfaces. A small visual glyph or 28px compact button is not permission for a smaller touch target.

## 4 · Shell

| Part | Target |
|---|---|
| Global header | Height 56, horizontal padding 18, gap 14 |
| Navigation | Open 220, collapsed 64 |
| Navigation item | Padding 7 × 10, gap 10, radius 8, icon 20 |
| Logo | Wordmark height 20 open; mark 34 collapsed; never recolour or distort |
| Summary rail | 240, collapsible when relevant |
| Tasks rail | 320, collapsible |
| Drawer | Width 400; top/bottom/right inset 12 |

Panels are conditional on the page's purpose and available width. Never force all panels to stay open at narrow widths. Scroll the table inside its region, never the whole page sideways. Footer, tasks and overlays must not obscure actions.

## 5 · Register

| Part | Target |
|---|---|
| Header | Minimum 40, cell padding 6 × 14, text 12 / 500 |
| Parent row | Minimum 54, cell padding 6 × 14, text 13 |
| Second fact | Text 12, secondary, source-defined meaning |
| Row gap / horizontal outer margin | 10 / 6 |
| Footer | Height 44, text 13 |
| Lines | Header bottom `--c-head-line` #E4E1DC; body rows `--c-row-line` #EEECE8; footer top `--c-footer-line` #EEF0F2; no vertical cell lines |

Height is a minimum, not a clipping mechanism. Module-approved expanded goods and long identities may grow. Governed quantities and statuses remain unchanged. Column widths must be remeasured in Inter 13 with current padding; old 12px measurements are evidence only. Keep shared resize/filter/sort/selection/expansion/grouping capabilities.

### 5.1 Compact facts and object density

Key/value rows: minimum 32px, padding 4px × 14px, text 13px; labels secondary/400 and values ink/400. Document identity may use 600. Compact section header 38px; card gap 12px; compact card padding 14px. Small action control 28px, text 12px/500, with the hit areas in §3. Source-specific compact facts are not 54px Register rows. Label/value grids collapse on narrow widths without losing fields.

## 6 · Settings

Plain grouped rows: name and purpose on left, value on right; no box around every setting. Read-only values are plain text. Edit controls appear only during editing. Authorized staff can fill a missing approved setting; `Not set` does not itself remove edit permission. Unapproved business rules remain visibly unresolved. IDs, source, permission, effective treatment and history belong in the detail/disclosure, not repeated in every row. Timing changes do not silently rewrite existing deadlines.

## 7 · Canonical component measurements — one lookup

Sections 1–6 are the single current measurement lookup. Old dense-grid, blue selection, solid white-text status and module-local geometry have been removed. Existing code may still render them while migration proceeds; do not copy them into a new page.

### 7.1 Shell and controls
Use §§3–4.
### 7.2 Inputs and toolbar
Use §3.
### 7.3 Surfaces
Use §3.
### 7.4 Goods tables
Use §5 and the owning module's quantity contract; remeasure content.
### 7.5 Accepted SO-derived template — measurement lookup
Use §§4–5.
### 7.6 Compact module card — CompactModuleCard
Use §3 for surface and control values; preserve the card's host identity, facts, source ownership and action contracts. Its old HTML is behaviour evidence, not a competing visual palette.

## 8 · Verification and migration gaps

| Item | Required evidence before completion claim |
|---|---|
| Runtime token migration | Shared tokens, CSS, component examples and consumers match §§1–5 |
| Register and full object | Same component family; realistic long records and document links |
| Working Panel / Tasks | Existing authorised actions, retained draft, module-owned results |
| Settings | Authorized missing-value setup, effective treatment, history and denied state |
| Desktop / narrow / keyboard | UI MASTER §2.2 full-page checks, zoom, focus, scrolling |
| Typography | Current source role sizes; essential facts remain readable |
| Imported prototype | Demonstrates design only; test facts and simulated permissions do not prove production |

Source archive SHA-256: `bafd9111a239c2c8f0ca7b54bf5622321b04a4739b64a267c07610ea4b2e388f`.

## 9 · Settings → Appearance · current target owner instruction 9 Oct 2026

Every signed-in person chooses their own theme and focus; save `appearance: { theme, focus }` in their own Auth user profile metadata. This is not company configuration or an approval. No reason is required. Default `carres` / `soft`; invalid or absent profile values fall back safely. Use `<html data-theme="carres" data-focus="soft">` and the exact selectors in `carres-tokens.css`.

| Group | Theme identifiers / display words |
|---|---|
| Brand · Recommended | carres / Carres |
| Cool · Calm and crisp | slate / Cool Slate · blue / Blue · teal / Teal · violet / Violet |
| Warm · Soft and homely | honey / Warm Honey · olive / Olive · rose / Rose · latte / Latte |
| Focus | soft / Soft grey · theme / Theme colour · strong / Strong |

Theme changes only canvas, selected background and selected text/checkbox accent. Ink, charcoal main button, status pairs and borders stay fixed. Focus: soft 1px #C9CED6; theme 1.5px selected text; strong 2px #221F20; offset −2px. Selection uses a 12px theme dot and a 2px ink ring, with a readable selected name. Save failure retains the selection for retry; switching accounts never applies the previous person's preference.

Theme swatch dots (12px): Carres `#D64F20`, Cool Slate `#64748B`, Blue `#3B6FE0`, Teal
`#14857C`, Violet `#6E58C4`, Warm Honey `#D9A21B`, Olive `#6E8A3E`, Rose `#C2546A`, Latte
`#8B6B4A`. These identify personal themes; they are not additional status or main-button colours.
