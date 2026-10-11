# 01 · Design tokens

**Current shared visual target · owner instruction 11 Oct 2026 · supplied v12.** This replaces the v8 values of 9 Oct in this file; nothing of v8 remains as a second version. Source: `Sales Order_11 Oct.zip` (`README.md`, `UX-FLOWS.md`, `docs/Carres Layout Standard.md`, `carres-theme.js`, `carres-check.js`, `Carres UI Kit.dc.html`, `Carres Shell.dc.html`, `Carres Table.dc.html`, `Sales Order Outright v12.dc.html`, `Purchasing v2.dc.html`). This is a design adoption, not a claim that the React kit or production has migrated.

Business facts, permissions, completion gates, document formats and exact words remain owned by module MASTERs and COPY-STANDARD. The supplied Ops Rules are not imported as business authority and are not stored in this repository.

## 0 · One kit and implementation boundary

| Home | Purpose | Status |
|---|---|---|
| This file | Shared visual values | Current target |
| `docs/ui/carres-tokens.css` | Machine-readable target token values | Current target; not wired into the application |
| `docs/02-components.md` | Shared component contracts | Current target |
| `docs/03-page-patterns.md` | Shared page compositions | Current target |
| `docs/ui/MASTER.md` | Interaction, ownership and acceptance | Current authority |
| `apps/web/src/styles/carres-tokens.css`, `components/kit/`, `components/register/` | Running implementation | Still draws v8; migration required; preserve APIs and behaviour |
| `docs/ui-reference/sales-order-design/` | Supplied v12 specimen | Reference only; not production code or business law |

Use tokens, not page-local numbers. Change the shared components once; never clone the specimen into a module. The frame, sizes, widths and cell formats never change per module; a module only chooses its content. Git keeps the old values; no archive or second kit is created.

**Measurement context:** values are CSS pixels. The specimen is measured at 1164 × 715 and must pass at 1025, 1164 and 1440 wide. Desktop only; no phone breakpoint is supplied or claimed. Hit areas are at least 32 on desktop and 44 on mobile and partner surfaces.

## 1 · Colour

**Three fixed layers, the same in every theme.** All text sits on white.

| Layer | Value |
|---|---|
| Page ground | `#F6F7F9` |
| Card / surface | `#FFFFFF`, 1px `#E5E7EB`, radius 8, no shadow |
| Table header, item sub-header, group band | `#F8F9FA` |
| Neutral tint (tags, due chip) | `#F1F2F4` |
| Task card footer band | `#F5F6F8` |

| Text and lines | Value |
|---|---|
| Ink (titles, identifiers, values) | `#1F2937` |
| Secondary ink (neutral pill text) | `#374151` |
| Quiet (unpicked tab, Summary label, plain status, menu icon) | `#4B5563` |
| Label grey (labels, second lines, table headers, Not recorded) | `#6B7280` |
| Row chevron at rest (icon only) | `#9CA3AF` |
| Header line, card border, footer line, button border | `#E5E7EB` |
| Row line, menu group hairline | `#F1F2F4` |
| Open or expanded frame, map connector | `#CBD0D6` |
| Choice chip border, Tasks divider | `#D5D9DE` |
| Search and top-bar button border | `#E1E4E8` |

`#6B7280` is the one grey for all small text. `#9CA3AF` is never used for text.

| Selection (default theme Blue) | Value |
|---|---|
| Selected text, ticked box, current-step frame | `#2F55E0` |
| Selected item on the grey ground (menu, tab) | white `#FFFFFF` pill, selected text, soft lift `0 1px 2px rgba(16,24,40,.10)` |
| Ticked row, selected chip fill | `#EEF4FF` |
| Segmented track | `#E2E4E8`, hover `#EEF0F3` |
| Hover on the grey ground | `#E2E4E8` |
| Table row hover | `#F2F3F5` |
| Link and keyboard focus | `#3965FA` |

The selection colour only marks something picked: tab, chip, menu item, ticked row, focus. A button whose menu, form or panel is open is never blue. No saturated colour fills. Other themes are in §9.

| Buttons | Value |
|---|---|
| Main button (one per area) | `#1B1B39`, white text, hover `#2B2B55` |
| White or grey button | white, 1px `#E5E7EB`; hover and open `#EDEFF2` |
| Icon-only button | no fill, no border; hover `rgba(31,41,55,.10)`, pressed and open `rgba(31,41,55,.16)` |
| Disabled | 45% opacity, no hover, no click |

| Status (never changes with the theme) | Background / text |
|---|---|
| Done | `#E7F6EC` / `#1E7A40` |
| Needs action now | `#FBF0D6` / `#7A5A00`, frame `#E8C77A` |
| Neutral pill | `#E5E7EB` / `#374151` |
| Hold | `#1F2937` / `#FFFFFF` |
| None | `#F1F2F4` / `#6B7280` |
| Online dot | `#1E8A47` |
| Toast | `#1F2937` / `#FFFFFF` |

Calm rules: amber only when something needs action now, never because data is missing. Green only for done. Red is not used; errors are amber. A card that needs action gets an amber frame, never an amber fill. The one amber row fill is `Balance due` above 0 on the SO detail and SO PDF. Status colour follows the condition, never the action verb. Always show the status word.

## 2 · Typography

Inter only, tabular numbers in tables. **Only these size / weight pairs exist.**

| Pair | Use |
|---|---|
| 20 / 600, tracking −.01em | Page title, or the record number on a detail. Once per page; the one boldest text |
| 15 / 500 | Card and panel titles (Summary, Tasks, Customer); section title inside a card |
| 14 / 400 | Breadcrumb |
| 13 / 400 | Body, table values, menu items |
| 13 / 500 | Field values, buttons, selected menu item, selected tab, task title |
| 13 / 600 | Table identifier, text on the main button, selection count |
| 12 / 400 | Labels, second lines |
| 12 / 500 | Pills, table headers, chips |
| 11 / 500, caps, tracking .06em | Every caps label: menu groups, Summary sections, pop-up group heads, task fact labels, tags |
| 11 / 700 | Count badges |

Nothing else uses 600 at 15 or above. Never below 11; 11 only for caps labels, tags and badges. In a table row only the identifier is 600. Same job, same size in every panel. No value is cut with an ellipsis: text wraps inside its own cell or column.

## 3 · Controls and surfaces

| Part | Target |
|---|---|
| Corner radius | 8 for cards, rows, inputs, buttons, menu items; 10 for the segmented track; pills and avatars fully round |
| Word button | Box, radius 8, height 34 (toolbar 32, panel 30, small 28), 13 / 500, main 13 / 600, 1 to 2 words, icon only when the icon alone is the button |
| Icon-only button | Round, 34 (toolbar 36, small 28 to 32), no border, no fill, icon 20 |
| Top-bar utility (team, bell) and search | 34 high, white, 1px `#E1E4E8`, round; bell badge charcoal, team badge white with green dot |
| Segmented control (list tabs, view switches, Settings tabs) | Track `#E2E4E8`, radius 10, padding 3; segment padding 5 × 12, 13; selected white, theme text, 500, soft lift; others 400 `#4B5563` |
| Status pill | 12 / 500, padding 3 × 10, fully round, colour plus one word |
| Choice chip | 28 high, 12 / 500, radius 8; unselected `#F2F3F5` fill, `#4B5563` text; selected soft selection fill, theme text and 1px theme border; icon 16 |
| Theme chip (Appearance) | 32 high, radius 8, 12 dot and name 13 / 500 |
| Item-row control | 24 high, bordered, value and chevron, radius 8, tone colours as the pill; one per item row |
| Input / search | Height 32 / 34, radius 8 |
| Record link | Ink 600, dotted grey underline (`#6B7280`, offset 3), solid on hover; no arrow, no icon; the whole number is the target |
| Card | Padding 14 × 16, 12 between cards, no shadow, no box in a box |
| Pop-up menu | 250 wide, white, 1px `#E5E7EB`, radius 8, padding 6, shadow `0 8px 24px rgba(17,24,39,.12)` |
| Menu group label | 11 / 500 caps `#6B7280`, padding 8 10 4, hairline `#F1F2F4` between groups |
| Menu item | 32 high, padding 7 × 10, gap 10, icon 18 `#6B7280`, text 13 / 400; short hint right in 12 grey; long hint as a 12 grey second line; selected 500 with check |
| Dialog shadow | `0 12px 40px rgba(22,24,29,.22)` |
| Toast | Bottom centre, `#1F2937`, white 13, 2.2 to 2.6 seconds |
| Avatar | Round, initials, one fixed colour per person, name in the tooltip; header avatars 24, stacked, PIC first |
| Keyboard focus | 2px `#3965FA`, 2 outside, radius 8; fields no gap; Tab key only; never the browser ring |

One main button per card or area; other actions sit in the ⋮ menu. Going to another record or page is never a button: the record number or page name is the link. A menu item without a working function is left out. Menus, dialogs and toasts are fixed to the screen and never clipped by a parent. Every clickable thing shows a hover state. Read-only facts are text, not disabled inputs. Every date field uses a calendar picker.

Icons: Material Symbols Rounded, outline, weight 300; 18 in buttons and menus, 20 for icon buttons and panel icons, 16 in chips. Same thing, same icon. Warning icons only for real alerts. Migrate through the existing shared Icon adapter and keep accessible names.

## 4 · Shell

| Part | Target |
|---|---|
| Menu | 220 open, 64 closed (remembered), right hairline |
| Menu item | 13 / 400 ink, icon 18 `#4B5563`, padding 7 × 10, radius 8; selected white pill, theme text, 500; group label caps with 18 above and 6 below |
| Logo | Wordmark 20 high open; mark 34 closed; never recolour or distort |
| Top bar | 56 high, bottom hairline; `[Module] / [Page]` with the path 14 / 400 and the title 20 / 600; search, team, bell at the right |
| Toolbar row | 36 high, one line, never wraps; Summary title, toolbar and Tasks title share this line |
| Summary | 264, left; title row on the ground, then one white card per section, 8 apart; row exactly 32 high; label 13 / 400 `#4B5563`, value 13 / 500 ink, amber 500 when it needs action; 1px line on its right |
| Tasks | 320, right; title row on the ground, white task cards 8 apart; 1px `#E5E7EB` line separates it from the middle with 12 on both sides |
| Zones | 12 between zones |

The page never scrolls; panels and table bodies scroll inside with thin scrollbars. Summary and Tasks collapse and reopen from ghost buttons in the toolbar row. Opening or closing a panel never changes a column width. A detail opens in the middle in place of the list: Summary and the toolbar hide, Tasks stays, Back returns to the same scroll position. There is no list plus detail three-panel view.

## 5 · Register

| Part | Target |
|---|---|
| Table card | White, 1px `#E5E7EB`, radius 8 |
| Header | 40, ground `#F8F9FA`, 12 / 500 `#6B7280`, bottom line `#E5E7EB`, stays on top |
| List row and group row | 54, cell padding 6 × 14, line `#F1F2F4` |
| Item, order-line and total row | 44 minimum; a long item name wraps and the row grows |
| Footer | 44, white, top line `#E5E7EB`: count, totals, rows per page, pager |
| Expanded row | One box: 1px `#CBD0D6` frame, corners 8, 8 above and below; parent stays white; item sub-header `#F8F9FA`; parent and sub-header stick together under the table header |
| Ticked row or item | Soft selection fill; text stays ink |
| Selection bar | Replaces the toolbar; white, 1px `#E5E7EB`; count 13 / 600 ink, totals grey; only the tick and Clear use the theme colour |

**Five cell formats.** Identifier (13 / 600 ink plus one 12 grey line) · Text (13 / 400 ink plus optional 12 grey line) · Number (right, tabular) · Date (`7 Oct` plus grey weekday) · Status (pill for amber and green; a status that needs no action is plain text `#4B5563`). At most two lines per cell, except the item name. When one cell in a row has a second line, every cell keeps two line slots so first lines align.

**Item text, one rule everywhere:** line 1 model 13 / 400 ink, line 2 spec 12 / 400 `#6B7280`. Never model and spec joined on one line.

**Column order:** expand · tick · identifier · description · quantities · dates, most important first · status last · ⋮ only if the row has actions. No buttons in list rows.

**Column widths by type.** New columns pick one of these; no other widths.

| Type | Width |
|---|---|
| Expand, tick | 24 each |
| Identifier | Minimum 180; takes spare width; frozen on the left when the table scrolls |
| Number (Items) | 96 right |
| Count plus document (Sales orders) | 140 left |
| Qty on item rows | 48 right |
| Money | 110 right |
| Date | 120 |
| Status | 150 |
| Document number | 130 |
| Short text | 160 |
| Category | 110 |
| Address | 170 |

A text column of 150 or more is flexible: minimum three quarters of its width, then it shares spare space. Date, number and status columns stay fixed. Alignment belongs to the column: right only for columns that hold numbers alone; a left column right after a right one gets 14 extra. A view has at most 6 data columns, except Overview and Payment with 8. When columns do not fit, the whole table scrolls sideways with the identifier frozen; nothing is cut and rows do not grow to fit columns. Keep the shared sort, filter, resize, select, group and expand capabilities.

### 5.1 Detail cards and compact facts

| Part | Target |
|---|---|
| Detail header | Back icon button 34 · record number 20 / 600 with the party 13 `#6B7280` under it · status pill · chips 24 white 1px `#E5E7EB` · avatars 24 · word buttons 34 · ⋮ 34. Buttons wrap to a second line only when narrow |
| Field row | 36 minimum; label 150 left 12 / 400 `#6B7280`; value 13 / 500 ink beside it; a long value wraps and the row grows |
| Summary strip | One full-width card, equal columns on one row; label 12 grey, 6 gap, value 13 / 500; a long value wraps inside its own column |
| Card title | 15 / 500 with 6 below; a section title inside a card has 18 above |
| Order-line table in a card | Header 40 on `#F8F9FA`, rows 44, item on two lines |
| Missing value | `Not recorded` in `#6B7280`; never invented, never a dash alone |

Source-specific compact facts are not 54 register rows. Two cards side by side stack when narrow without losing fields.

## 6 · Settings

Plain grouped rows: name and purpose on the left, value on the right; no box around every setting. Read-only values are plain text. Edit controls appear only during editing. Authorized staff can fill a missing approved setting; `Not set` does not itself remove edit permission. Unapproved business rules remain visibly unresolved. IDs, source, permission, effective treatment and history belong in the detail or disclosure, not repeated in every row. Timing changes do not silently rewrite existing deadlines. Settings sections use the same segmented control as list tabs.

## 7 · Canonical component measurements — one lookup

Sections 1 to 6 are the single current measurement lookup. The v8 warm ground, orange default selection, per-theme page ground, Focus chooser, 240 Summary and 32 key-value density are removed. Existing code may still render them while migration proceeds; do not copy them into a new page.

### 7.1 Shell and controls
Use §§3–4.
### 7.2 Inputs and toolbar
Use §3.
### 7.3 Surfaces
Use §§1 and 3.
### 7.4 Goods tables
Use §5 and the owning module's quantity contract.
### 7.5 Accepted SO-derived template — measurement lookup
Use §§4–5.
### 7.6 Compact module card — CompactModuleCard
Use §§1 and 3 for surface and control values; preserve the card's host identity, facts, source ownership and action contracts. Its old HTML is behaviour evidence, not a competing visual palette.

## 8 · Verification and migration gaps

| Item | Required evidence before a completion claim |
|---|---|
| Runtime token migration | Shared tokens, CSS, component examples and consumers match §§1–5; the application token file equals `docs/ui/carres-tokens.css` |
| Measured rules | `carres-check.js` ported to automated tests and passing at 1025, 1164 and 1440 wide on every state in `UX-FLOWS.md` |
| Type | Only the §2 pairs appear; 20 / 600 once per page |
| Rows | 40 / 54 / 44 / 36 exactly; no cut text; no side scroll except the two 8-column views |
| Overlays | Menus, dialogs and toasts never clipped |
| Theme | A theme change alters only the selection values |
| Shared pieces | Shell, Table and detail page are shared components; Sales Order and Purchasing use them with no copied layout code |
| Register and full object | Realistic long records and document links |
| Desktop / narrow / keyboard | UI MASTER §2.2 full-page checks, zoom, focus, scrolling |
| Specimen | Demonstrates design only; sample facts and simulated permissions do not prove production |

Source archive SHA-256: `1140ffde825dcd573f05467b49f2201d02331241dbc4f7cb0ef4275957efae16`.

## 9 · Settings → Appearance · current target owner instruction 11 Oct 2026

Every signed-in person picks their own theme. It is not company configuration or an approval, and needs no reason. Default `blue`; an invalid or absent value falls back to `blue`. Use `<html data-theme="blue">` and the selectors in `carres-tokens.css`. The Focus chooser is removed: keyboard focus is the one rule in §3.

**A theme changes only the selection values.** Page ground, charcoal buttons, greys, borders and status colours are fixed.

| Group | Theme | Dot | Selected fill | Selected text | Hover |
|---|---|---|---|---|---|
| Cool | Cool Slate `slate` | `#64748B` | `#E6E9EE` | `#1F2937` | `#F4F5F7` |
| Cool | Blue `blue` · Default | `#3965FA` | `#FFFFFF` pill, soft `#EEF4FF` | `#2F55E0` | `#E2E4E8`, rows `#F2F3F5` |
| Cool | Teal `teal` | `#14857C` | `#DDF0EE` | `#0F5F59` | `#F0F8F7` |
| Cool | Violet `violet` | `#6E58C4` | `#ECE8F7` | `#4C3A8F` | `#F6F5FB` |
| Brand | Carres `carres` | `#D64F20` | `#FBE6DB` | `#A33A14` | `#FDF4EF` |
| Warm | Warm Honey `honey` | `#D9A21B` | `#FBEFC9` | `#7A5300` | `#FDF8E7` |
| Warm | Olive `olive` | `#6E8A3E` | `#E6ECD9` | `#3F5A2A` | `#F4F6EE` |
| Warm | Rose `rose` | `#C2546A` | `#F7E1E4` | `#8A2E40` | `#FBF2F3` |
| Warm | Latte `latte` | `#8B6B4A` | `#ECE3D8` | `#5A4632` | `#F6F2ED` |

Hover is the selected fill at 45% over white. Page layout: top bar `Settings / Appearance`; tabs as the segmented control; `THEME` caps label; one white card with rows Cool, Brand, Warm. Picked chip: its soft selection fill, 1px border and text in its selection colour, 16 check; never 600, never a black ring. Blue carries the label `Default`. A note under the card says a theme changes only the selection colour.

Storage: the supplied specimen keeps the choice in the browser (`localStorage` key `carres.theme`). The application keeps it in the signed-in person's own profile so it follows them between devices; that implementation stays. Save failure keeps the selection for retry; switching accounts never applies the previous person's choice.

## 10 · Where the supplied files disagree, and the value taken

The supplied Layout Standard still carries older lines beside its 10 and 11 Oct rulings. Order used: measured specimen pages and `carres-theme.js` / `carres-check.js`, then the README token table and lines dated 11 Oct, then older lines. Do not reopen these from the older text.

| Topic | Older line | Value taken |
|---|---|---|
| Default theme and ground | Carres theme, ground `#FAFAF9` or per theme | Blue; ground fixed `#F6F7F9` |
| Main button | `#1F2937`; hover `#111827` | `#1B1B39`; hover `#2B2B55` as drawn |
| Keyboard focus | 2px `#1F2937` | 2px `#3965FA` |
| Summary width | 240 | 264 |
| Panel title | 17 / 500 | 15 / 500 |
| Menu item | 14 / 500 grey, selected 600 | 13 / 400 ink, selected 500 |
| Tabs | Selected 600 | Segmented control, selected 500 |
| Caps labels | 10 / 500 or 12 / 600 | 11 / 500, tracking .06em |
| Menu group label | 11 / 600 | 11 / 500 |
| Table header ground | White | `#F8F9FA` |
| Row line | `#E5E7EB` or `#F0F1F3` | `#F1F2F4` |
| Identifier minimum | 220 | 180 |
| Stretching columns | Only the identifier | Identifier, plus text columns of 150 or more down to three quarters |
| Item row | Two lines, cut with an ellipsis | 44 minimum, never cut, wraps and grows |
| Pop-up menu | 230 wide; shadow `0 8px 28px rgba(22,24,29,.16)` | 250 wide; shadow `0 8px 24px rgba(17,24,39,.12)` |
| Open group frame | `#D6D2CC` | `#CBD0D6` |
| Choice chip | White with 1px `#D5D9DE` | `#F2F3F5` fill as drawn; selected soft fill with theme border |
| Field density | Key-value rows 32 | Field rows 36, label 150 |
| Summary rows | Information only, never filter | Drawn as pressable rows; whether a number filters is the module's choice |
| Appearance storage | Browser only | Person's profile in the application |

**Words are not settled by this file.** The specimen writes list headers in sentence case (`SO no.`, `Proceed date`) and uses `Customer’s original requested delivery`, `Log contact`, `Request amendment`, `Waiting for Jess`. COPY-STANDARD owns every visible word; where it differs, COPY stands until COPY is changed.
