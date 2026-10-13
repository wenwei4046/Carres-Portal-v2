# 01 · Design tokens

**Current shared visual target · owner instruction 12 Oct 2026 · supplied 12 Oct, 5:35 PM.** This replaces every earlier value in this file; there is no second version. Every kit the owner hands over replaces the kit: this file, 02, 03, UI MASTER, the token mirror and the specimen are updated together and whatever the new kit contradicts is deleted (owner 12 Oct 2026). Source: the folder `design_handoff_sales_order_ui_kit` handed over on 12 Oct 2026 at 5:35 PM, which replaced that morning's `Sales Order.zip` (`README.md` with its `Fix now` list and its section 5 on Purchasing, `UX-FLOWS.md`, `docs/Carres Layout Standard.md`, `carres-theme.js`, `carres-check.js`, `carres-tasks.js`, `Carres UI Kit.dc.html`, `Carres Screen Map.dc.html`, `Carres Shell.dc.html`, `Carres Table.dc.html`, `Sales Order Outright v12.dc.html`, `Purchasing v3.dc.html`, `Settings v2.dc.html`, `Workspace My Tasks.dc.html`). The specimen was replaced again on 13 Oct 2026 by the round 3 package (`Sales Order (7).zip`, with `docs/CODE-BRIEF-13-Oct-round3.md`): no token changed; `Workspace v3.dc.html` is the only Workspace page and `Workspace v2.dc.html`, `Workspace My Tasks.dc.html` and the two earlier fix lists are deleted. This is a design adoption, not a claim that the React kit or production has migrated.

Business facts, permissions, completion gates, document formats and exact words remain owned by module MASTERs and COPY-STANDARD. Where the package conflicts with COPY-STANDARD or a module MASTER, its value is PROPOSAL / NOT LAW (§10). The supplied Ops Rules are not stored in this repository. The specimen's sample pages use TEST customer details.

## 0 · One kit and implementation boundary

| Home | Purpose | Status |
|---|---|---|
| This file | Shared visual values | Current target |
| `docs/ui/carres-tokens.css` | Machine-readable target token values | Current target; not wired into the application |
| `docs/02-components.md` | Shared component contracts | Current target |
| `docs/03-page-patterns.md` | Shared page compositions | Current target |
| `docs/ui/MASTER.md` | Interaction, ownership and acceptance | Current authority |
| `apps/web/src/styles/carres-tokens.css`, `components/kit/`, `components/register/` | Running implementation | Still draws the previous kit; migration required; preserve APIs and behaviour |
| `docs/ui-reference/sales-order-design/` | Supplied specimen (files refreshed from the 13 Oct 2026 package; no token value changed) | Reference only; not production code or business law |

Use tokens, not page-local numbers. Change the shared components once; never clone the specimen into a module. The frame, sizes, widths and cell formats never change per module; a module only chooses its content. Git keeps the old values; no archive or second kit is created.

**Measurement context:** values are CSS pixels. The specimen is measured at 1164 × 715 and must pass at 1025, 1164 and 1440 wide. Desktop only; no phone breakpoint is supplied or claimed. Hit areas are at least 32 on desktop and 44 on mobile and partner surfaces.

## 1 · Colour

**Three fixed layers, the same in every theme.** All text sits on white.

| Layer | Value |
|---|---|
| Page ground | `#F6F7F9` |
| Card / surface | `#FFFFFF`, 1px `#E5E7EB`, radius 8, no shadow |
| Table header, item sub-header, group band | `#F8F9FA` |
| Neutral tint (tags, count badge) | `#F1F2F4` |
| Inner task card (inside its contact card) | `#F6F7F9`, no border, radius 8; hover `#ECEEF1` |

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
| Column band in a list | `#EEF0F3`, one neutral grey in every theme (§5) |
| Link and keyboard focus | `#3965FA` |

The selection colour only marks something picked: tab, chip, menu item, ticked row, focus. A button whose menu, form or panel is open is never blue. No saturated colour fills. Other themes are in §9.

| Buttons | Value |
|---|---|
| Main button (one per area) | `#1B1B39`, white text, hover `#2B2B55` (hover is PROPOSAL, §10.1) |
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
| Choice chip | 28 high, 12 / 500, radius 8; unselected `#F2F3F5` fill (PROPOSAL, §10.1), `#4B5563` text; selected soft selection fill, theme text and 1px theme border; icon 16 |
| Theme chip (Appearance) | 32 high, radius 8, 12 dot and name 13 / 500 |
| Item-row control | 24 high, bordered, value and chevron, radius 8, tone colours as the pill; one per item row |
| View button | White word button, 32 high, radius 8: icon of the current view 18 grey, the view's name 13 / 500, chevron; always names the current view; pressed grey while its menu is open; the same button on every module |
| Pick pop-up | Two sizes by the number of options, never draggable. Up to 6 options: a popover 320 wide under the clicked cell; it closes on pick, outside click or Esc. More than 6: a side sheet 380 wide on the right, full height (top 64, 12 from the bottom), with a search box, a scrolling list and the action button pinned at the bottom; the table stays visible. Every pop-up fits the window: it moves up when there is no room below and its list scrolls inside. Padding 6, menu surface. Head is a facts card: caps label, 10, item block (model 13 / 500, spec 12 grey), 10, facts in two columns (11 / 500 caps label over 13 / 500 value, gap 8 × 14), 12, hairline. Options 32 high: icon 18 grey, name 13 / 400, a short hint 12 grey at the right; picked is soft selection fill, 500 and a check. Never several facts joined on one grey line |
| Input / search | Height 32 / 34, radius 8 |
| Record link | Ink 600, dotted grey underline (`#6B7280`, offset 3), solid on hover; no arrow, no icon; the whole number is the target |
| Card | Padding 14 × 16, 12 between cards, no shadow, no box in a box |
| Pop-up menu | 250 wide, white, 1px `#E5E7EB`, radius 8, padding 6, shadow `0 8px 24px rgba(17,24,39,.12)` |
| Menu group label | 11 / 500 caps `#6B7280`, padding 8 10 4, hairline `#F1F2F4` between groups |
| Menu item | 32 high, padding 7 × 10, gap 10, icon 18 `#6B7280`, text 13 / 400; short hint right in 12 grey; long hint as a 12 grey second line; selected 500 with check |
| Dialog shadow | `0 12px 40px rgba(22,24,29,.22)` |
| Toast | Bottom centre, `#1F2937`, white 13, 2.2 to 2.6 seconds. After a task closes it stays 12 seconds and may carry `Next: {name} ›` and ✕ (§4); no timed `Undo` for a saved record (owner 12 Oct evening); no card and no coloured edge |
| Avatar | Round, initials, one fixed colour per person, name in the tooltip; header avatars 24, stacked, PIC first |
| Keyboard focus | 2px `#3965FA`, 2 outside, radius 8; fields no gap; Tab key only; never the browser ring |

One main button per card or area; other actions sit in the ⋮ menu. Going to another record or page is never a button: the record number or page name is the link. A menu item without a working function is left out. Menus, dialogs and toasts are fixed to the screen and never clipped by a parent. Every clickable thing shows a hover state. Read-only facts are text, not disabled inputs. Every date field uses a calendar picker.

Icons: Material Symbols Rounded, outline, weight 300; 18 in buttons and menus, 20 for icon buttons and panel icons, 16 in chips. Same thing, same icon. Warning icons only for real alerts. Migrate through the existing shared Icon adapter and keep accessible names.

## 4 · Shell

| Part | Target |
|---|---|
| Menu | 220 open, 64 closed (remembered), right hairline |
| Side menu (owner 12 Oct 2026) | One rule for every module, drawn from data, never coded per module. A module record names its pages; a page may name a group; a page with no address is not built yet. Section label 11 / 600 caps `#6B7280`, 16 above and 4 below · module 13 / 500 ink, icon 18 `#4B5563`, padding 8 × 10, radius 8 · page 13 / 400 `#374151`, padding 7 × 10 · the current page, and the module holding it, 600 in the theme colour on the selected pill (Blue: white with the soft lift). A module with pages shows a chevron and opens on click; opening one closes the others |
| Menu tree | A module's pages hang 18 in on a 1.5 `#BFC5CD` line with a rounded elbow (radius 7) to each page. The line stops at the last page of each group. The current page's elbow is the theme colour. A group word (Purchasing: BUY · RECEIVE · PROBLEMS · SHOWROOM) is 10 / 600 caps `#6B7280`, aligned with the page text, 24 high, with its own chevron. Only the group holding the current page is open when the page loads; a module opened from another module's page shows every group open. Nothing about open groups is stored |
| Menu words | A long name wraps to a second line (13 on 17) and is never cut. A page that is not built shows `Coming soon` 11 grey under its name and is not a link. The whole menu has one scrollbar |
| Logo | Wordmark 20 high open; mark 34 closed; never recolour or distort |
| Top bar | 56 high, bottom hairline; `[Module] / [Page]` with the path 14 / 400 and the title 20 / 600; search, team, bell at the right |
| Toolbar row | 36 high, one line, never wraps; Summary title, toolbar and Tasks title share this line |
| Summary | 264, left; a section has ONE headline tile with its breakdown rows under it, never two tiles that mean the same thing (owner 12 Oct 2026); title row on the ground, then one white card per section, 8 apart; row exactly 32 high; label 13 / 400 `#4B5563`, value 13 / 500 ink, amber 500 when it needs action; 1px line on its right |
| Tasks | 320, right; title row on the ground: `Tasks` · `Log call` · ⤢ (all tasks in Workspace) · › hide, and no footer link; 1px `#E5E7EB` line separates it from the middle with 12 on both sides. Under the title: the day strip, then `To do` · `Waiting` · `Done` as the same grey segmented control as the page tabs, equal widths, then one white card per contact or action group, 8 apart With a task open the panel stays 320 below 1280 wide and may use the spare width from 1280 (13 Oct 2026), so opening a task never takes room from the list |
| Day strip (owner 12 Oct 2026) | On the panel ground with one hairline under it, no box. Office working days only (Monday to Friday by default), 5 days per page, ‹ › move a working week; a task dated on a weekend shows on the next Monday. Each day: weekday 11 / 500 · date 12 · task count 11 / 500 in the theme colour, amber when something is late, blank when none. The picked day wears the selection pair. Today's list shows only today's tasks; another day's tasks are seen by picking that day |
| Task group card | Head: name 13 / 600 · count in plain grey 12, no pill · contact icons 24. No party icon. ⋮ only when one party has two or more tasks of the same kind. Late groups first, then groups with a deadline, then contacts, then actions |
| Task card in the list (owner 12 Oct 2026) | Card in card, one border only: the inner card has no border. Its title 13 / 500 starts with the grey 16 icon of its module (the side menu's icon; never a colour per module) and ends with ›; the whole card opens the task. Then one 20 row per fact: label 12 grey left · value 12 / 500 right, no icon. Amber only on the row whose date or time has passed or whose party is late. No status tag, no button, no steps count, no footer. Due is the clock time when there is one; a task for today with no clock time reads `Today`; a past due shows its date. `Done` uses the same card format |
| Screen parts | Every module page has the same seven numbered parts (`Carres Screen Map.dc.html`): 1 side menu · 2 top bar · 3 toolbar · 4 main table or detail · 5 Summary · 6 Tasks list · 7 open task. Parts 1, 2, 3, 6 and 7 are the shell: changed once, every module follows |
| Zones | 12 between zones |

The page never scrolls; panels and table bodies scroll inside with thin scrollbars. Summary and Tasks collapse and reopen from ghost buttons in the toolbar row. They open by window width: at 1600 or wider, both; from 1280 to 1599, Tasks only, with Summary closed until the person opens it; under 1280, both closed. Opening or closing a panel never changes a column width. A detail page under 1100 wide collapses the menu to 64 by itself; the person's own choice returns on the list. A detail opens in the middle in place of the list: Summary and the toolbar hide, Tasks stays, Back returns to the same scroll position. There is no list plus detail three-panel view.

## 5 · Register

| Part | Target |
|---|---|
| Table card | White, 1px `#E5E7EB`, radius 8 |
| Header | 40, ground `#F8F9FA`, 12 / 500 `#6B7280`, bottom line `#E5E7EB`, stays on top |
| List row and group row | 54, cell padding 6 × 14, line `#F1F2F4` |
| Item row in an expanded list row, and total row | 44 minimum; a long item name wraps and the row grows |
| Footer | 44, white, top line `#E5E7EB`: count, totals, rows per page, pager; on a narrow list the totals wrap to a second line inside the footer, never cut |
| Expanded row | One box: 1px `#CBD0D6` frame, corners 8, 8 above and below; parent stays white; item sub-header `#F8F9FA`; parent and sub-header stick together under the table header |
| Ticked row or item | Soft selection fill; text stays ink |
| Selection bar | Replaces the toolbar; white, 1px `#E5E7EB`; count 13 / 600 ink, totals grey; only the tick and Clear use the theme colour; the text is counts only; bar buttons 32 high, 13 / 500 |

**SO Batch Purchase · By supplier (owner 12 Oct 2026).** Columns: Supplier `minmax(150px,1fr)` · Items 80 · Sales orders 96 · Order PO deadline 120 · Supplier ready by 120 · Status 120. Status stays in view at 1131 wide with Tasks closed, with no side scroll. Built in the app on the one listing engine on 12 Oct 2026; the engine pads every cell, so that view sets 5 a side to keep the kit's 10 between columns.

**Five cell formats.** Identifier (13 / 600 ink plus one 12 grey line) · Text (13 / 400 ink plus optional 12 grey line) · Number (right, tabular) · Date (`7 Oct` plus grey weekday) · Status (pill for amber and green; a status that needs no action is plain text `#4B5563`). At most two lines per cell, except the item name. When one cell in a row has a second line, every cell keeps two line slots so first lines align.

**Four list options (owner 13 Oct 2026, Forecast Purchase handoff; built in the listing engine 13 Oct 2026).** Default sort: the order a list opens with, used only when the person has no saved layout; their own sort, or none, always wins (`sortDefault`). Second header line: one grey line 12 / 400 `#6B7280` under the label, for a date's weekday or a two-word header (`12 Oct` over `Mon`; column `headerSub`). Column band: one neutral fill `#EEF0F3` down a whole column (header, rows and opened items) to mark the column to read first, such as this month; it is never the theme colour and a page never passes its own colour (column `band`; item rows use `bg-c-column-band`). A tick that cannot be taken: the box stays, greyed to 45% with the not-allowed cursor, and its reason shows on hover and is read out (`selectable.unselectableReason`; `RowTick` `why` for an item).

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

A text column of 150 or more is flexible: minimum three quarters of its width, then it shares spare space. Date, number and status columns stay fixed. Alignment belongs to the column: right only for columns that hold numbers alone; a left column right after a right one gets 14 extra. A view has at most 6 data columns, except Overview and Payment with 8. When columns do not fit, the whole table scrolls sideways with the identifier frozen; nothing is cut and rows do not grow to fit columns. That one scroller is marked `data-list-scroll` (the kit list engine marks its own, 13 Oct 2026), which is how `carres-check.js` tells the list's sanctioned scroll from a broken layout; the mark excuses nothing where a list must fit, and `e2e-kit` measures those states by itself. Keep the shared sort, filter, resize, select, group and expand capabilities.

### 5.1 Detail cards and compact facts

| Part | Target |
|---|---|
| Detail header | Back icon button 34 · record number 20 / 600 with the party 13 `#6B7280` under it · status pill · chips 24 white 1px `#E5E7EB` · avatars 24 · word buttons 34 · ⋮ 34. Buttons wrap to a second line only when narrow |
| Field row | 36 minimum; label 150 left 12 / 400 `#6B7280`; value 13 / 500 ink beside it; a long value wraps and the row grows |
| Summary strip | One full-width card, equal columns on one row; label 12 grey, 6 gap, value 13 / 500; a long value wraps inside its own column |
| Card title | 15 / 500 with 6 below; a section title inside a card has 18 above |
| Order-line table in a card | Header 40 on `#F8F9FA`; rows exactly 44; item on two lines, model then spec, neither wraps; columns 20 · item · 32 Qty · 80 Unit price · 80 Amount, gap 10; on a narrow middle the card scrolls sideways inside itself instead of growing |
| Missing value | `Not recorded` in `#6B7280`; never invented, never a dash alone |

Source-specific compact facts are not 54 register rows. Two cards side by side stack when narrow without losing fields.

## 6 · Settings

Plain grouped rows: name and purpose on the left, value on the right; no box around every setting. Read-only values are plain text. Edit controls appear only during editing. Authorized staff can fill a missing approved setting; `Not set` does not itself remove edit permission. Unapproved business rules remain visibly unresolved. IDs, source, permission, effective treatment and history belong in the detail or disclosure, not repeated in every row. Timing changes do not silently rewrite existing deadlines. The Settings sections are a left section list, never a row of top tabs that wraps (owner 11 Oct 2026); the segmented control is used only for the groups inside one section. Never two facts in one box: a number per category is its own row with its unit (`Production days · Mattress`, a number, `working days`; owner 12 Oct 2026). A group is its title and one line above one bordered list; each row is the setting's name with one short explanation on the left and its value on the right.

## 7 · Canonical component measurements — one lookup

Sections 1 to 6 are the single current measurement lookup. The earlier warm ground, orange default selection, per-theme page ground, Focus chooser, 240 Summary and 32 key-value density are removed. Existing code may still render them while migration proceeds; do not copy them into a new page.

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
| Running app against this kit (12 Oct 2026) | Follows the kit: default theme Blue; one page ground `#F6F7F9` in every theme, a theme changes only the selection colours; ink, greys and lines; main button `#1B1B39`; errors amber, no red; hover and table row hover; side menu (§4), menu and top bar hairlines; the segmented control for every `Tabs`; type pairs 20 / 600 and 15 / 500. Still on the previous build: the Tasks title row and task cards, the Summary panel, the shared table (row height, header band), the info wash and the muted grey |
| Measured rules | `carres-check.js` ported to automated tests and passing at 1025, 1164 and 1440 wide on every state in `UX-FLOWS.md`. **Started 12 Oct 2026:** `pnpm kit:check` (`e2e-kit/`, run by CI) measures the kit lists already moved (SO Batch Purchase `By supplier`, Purchase Orders `Overview`) at the three widths, rows closed and one row open: no page side scroll, no list side scroll, the last column inside the list, nothing cut. The rest of `carres-check.js` is not ported yet and most screens would not pass it |
| Type | Only the §2 pairs appear; 20 / 600 once per page |
| Rows | 40 / 54 / 44 / 36 exactly; no cut text; no side scroll except the two 8-column views |
| Overlays | Menus, dialogs and toasts never clipped |
| Theme | A theme change alters only the selection values |
| Shared pieces | Shell, Table and detail page are shared components; Sales Order and Purchasing use them with no copied layout code |
| Register and full object | Realistic long records and document links |
| Desktop / narrow / keyboard | UI MASTER §2.2 full-page checks, zoom, focus, scrolling |
| Specimen | Demonstrates design only; sample facts and simulated permissions do not prove production |

Source: the folder handed over on 12 Oct 2026 at 5:35 PM (it replaced `Sales Order.zip`, SHA-256 `793931a7922b24155b963593139bd13c960fb101072edd8fdc94d5618164fe59`, of that morning).

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

## 10 · Where the supplied files disagree, and the status of each value

The supplied Layout Standard still carries older lines beside its 10 and 11 Oct lines. A value is **TAKEN** when the supplied README (the package's final statement), an owner-dated line or the package's own `carres-check.js` states it; the older line is simply stale and is not reopened. A value is **PROPOSAL / NOT LAW** when the package does not settle it, or when it conflicts with COPY-STANDARD or a module MASTER. A PROPOSAL is challenged, never obeyed; it becomes kit law only by an owner ruling.

### 10.1 Inside the package

| Topic | Older line | Value in this kit | Status |
|---|---|---|---|
| Default theme and ground | Carres theme, ground `#FAFAF9` or per theme | Blue; ground fixed `#F6F7F9` | TAKEN · owner 11 Oct |
| Main button colour | `#1F2937` | `#1B1B39` | TAKEN · README |
| Main button hover | README `#111827` | `#2B2B55` as drawn | **PROPOSAL / NOT LAW** · overturned when the owner names the hover |
| Hover on the grey ground, eight themes other than Blue | §9: the selected fill at 45% over white | The app uses `#E2E4E8` on the ground and `#F2F3F5` on a table row in every theme (12 Oct 2026) | **PROPOSAL / NOT LAW** · the §9 hover cannot be seen on the grey ground (Cool Slate `#F4F5F7` on `#F6F7F9`); proposed: `#E2E4E8` on the grey ground in every theme, the §9 value on white surfaces · overturned when the design package names a ground hover per theme |
| Keyboard focus | 2px `#1F2937` | 2px `#3965FA` | TAKEN · owner palette 10 Oct |
| Summary width | 240 | 264 | TAKEN · README |
| Panel title | 17 / 500 | 15 / 500 | TAKEN · README and check |
| Menu item | 14 / 500 grey, selected 600 · later 13 / 400 ink, selected 500 | Module 13 / 500, page 13 / 400, current 600 (§4) | TAKEN · owner 12 Oct |
| Menu tree line | One thin straight line, no elbow (10 Oct) | 1.5 line with rounded elbows (§4) | TAKEN · owner 12 Oct |
| Task card in the list | Tags row, title, grey line and footer band (11 Oct); tiles, status tag, a Start button, fact icons, `Any time` for a task with no clock time (12 Oct, earlier turns) | Module icon and title and ›, then fact rows with no icon; `Today` for no clock time; amber only on the passed row (§4) | TAKEN · owner 12 Oct, latest line |
| Tasks tabs | Sections NOW · LATE · TODAY (11 Oct); pills To do · Done with no Waiting, a 14-day strip (12 Oct, earlier turns) | Working-week day strip, then To do · Waiting · Done as the segmented control (§4) | TAKEN · owner 12 Oct, latest line |
| Words for time | `Overdue`, `Missed cut-off` still stand in older lines of the Layout Standard, the UI Kit page and `purchasing-data.js` | A date or time that has gone by is `passed` on its own row; a party that is slow by a count is `n days late`. Never `Overdue` or `Missed` | TAKEN · owner 12 Oct, README `Fix now`; the words live in COPY-STANDARD |
| Sending issued POs and contact task cards | One steps form (11 Oct); a `Place` stage and a separate `Send PO` stage (package, 12 Oct 5:35 PM) | Three numbered steps in the Portal's words: `Download PDFs` · `Send by WhatsApp or Email` · `PO sent to supplier ({n})`; `Issue PO` stays the governed action; Email is the WhatsApp message box with `To` and `Subject` (03 §8) | TAKEN · owner 12 Oct evening |
| After a task is saved | A green line in the panel for 6 seconds (12 Oct, earlier turn); a card with a coloured edge; a timed `Undo` (package, 12 Oct 5:35 PM) | The app's dark toast, 12 seconds, with `Next` and ✕ (§3); no timed `Undo` for a saved record | TAKEN · owner 12 Oct evening |
| Reminders, the no-answer count and who is told after the third | Drawn in the package (`Later today` · `Pick date`, `No answer 3 times`) | Not in any module MASTER | **PROPOSAL / NOT LAW** · overturned when the owning MASTER records the rule |
| Message template words in a contact task | None in the owner's blueprints | The design chat's own wording | **PROPOSAL / NOT LAW** · overturned when the owner confirms or replaces the wording |
| Purchasing reference page | An earlier second-version page beside it | `Purchasing v3.dc.html`, the only Purchasing page in the package | TAKEN · owner 12 Oct |
| Bottom `Settings` row weight | 500 selected | 600 selected, 500 at rest | TAKEN · the menu rule above; the package now draws it so |
| Tabs | Selected 600 | Segmented control, selected 500 | TAKEN · check |
| Caps labels | 10 / 500 or 12 / 600 | 11 / 500, tracking .06em | TAKEN · README |
| Menu group label | 11 / 600 | 11 / 500 | TAKEN · README |
| Table header ground | White | `#F8F9FA` | TAKEN · README and check |
| Row line | `#E5E7EB` or `#F0F1F3` | `#F1F2F4` | TAKEN · README |
| Identifier minimum | 220 | 180 | TAKEN · Standard §0, 10 Oct |
| Stretching columns | Only the identifier | Identifier, plus text columns of 150 or more down to three quarters | TAKEN · README |
| Item row in a list | Two lines, cut with an ellipsis | 44 minimum, never cut, wraps and grows | TAKEN · README, owner 11 Oct |
| Order line in a detail card | Wraps and grows | Exactly 44, never wraps, card scrolls inside itself when narrow | TAKEN · design update 11 Oct |
| Pop-up menu | 230 wide; shadow `0 8px 28px rgba(22,24,29,.16)` | 250 wide; shadow `0 8px 24px rgba(17,24,39,.12)` | TAKEN · README |
| Open group frame | `#D6D2CC` | `#CBD0D6` | TAKEN · README |
| Field density | Key-value rows 32 | Field rows 36, label 150 | TAKEN · README |
| Choice chip, unselected | White with 1px `#D5D9DE` | `#F2F3F5` fill as drawn | **PROPOSAL / NOT LAW** · overturned when the owner names the chip |
| Summary rows | Information only, never filter | Drawn as pressable rows | **PROPOSAL / NOT LAW** · whether a number filters stays the module's choice until ruled |

**Measured 11 Oct on the supplied pages of the fourth archive** with the package's own `carres-check.js`, 21 page states at each width. The untouched supplied files and this repository's TEST-data copy give the same result. No page script errors.

| Width | States that pass |
|---|---|
| 1025 | 21 of 21 |
| 1164 | 21 of 21 |
| 1440 | 21 of 21 |

The package's acceptance line (pass on every state at 1025, 1164 and 1440) is met by the supplied pages. The check treats the SO PDF preview as a print page and skips it, and ignores text inside a list's own side-scroll box; both are stated in the Layout Standard.

### 10.2 Against existing authority

Everything in this table is **PROPOSAL / NOT LAW**. Pages are built on the current visual frame with COPY words and MASTER rules.

| Topic | The package says | Authority that stands |
|---|---|---|
| Visible words and capitals | Sentence-case list headers (`SO no.`, `Proceed date`); `Customer’s original requested delivery`, `Log contact`, `Request amendment`, `Waiting for Jess`, `Staff and duties`; its date, time and money formats | COPY-STANDARD |
| Purchasing list words | `Order PO deadline`, `Supplier ready by`, `Delivery ETA`, its countdown words, `Use stock`, `Using stock` | COPY-STANDARD and Purchasing MASTER |
| Amendment approval | Contact changes save at once; other changes go to one approver; a stair carry fee formula | Orders MASTER |
| Purchasing and delivery timing | Batch cut-off times, outstation logistics order, PO sending steps | Purchasing and Delivery MASTERs |
| Task completion | `Mark done`, an undo window, follow-up attempt counts, tasks that close by themselves when the work is done on their page | Workspace MASTER and the owning module |
| Appearance storage | Browser only | The person's profile in the application |
| SO Batch Purchase views (13 Oct package, Layout Standard) | One view button: `By supplier` · `By sales order` · `By category` · `By order deadline`; no `Cards`, no `Match Ready Stock` | Purchasing MASTER §9.1. **Adopted and built 13 Oct 2026** (owner's fix list round 2). The package's row word `Overdue` is not used: the row reads `Deadline passed` (owner's word rule). Its `Show columns for` module sets are named and marked `Coming soon` until the page reads those facts |
| Workspace page (13 Oct round 3 package, `Workspace v3.dc.html`, Layout Standard, brief point 3) | Full table when no task is chosen; pick list and wide task card when one is; left `Module` card whose numbers equal the toolbar tab; `My Task ▾` scope; `Do it here` side sheet holding the module's own task card | **BUILT ON BRANCH `build/workspace-v3`, 13 Oct 2026; NOT DEPLOYED; production not verified (Workspace MASTER §5.10, which this build overwrote; COPY-STANDARD "The Workspace page words"):** the full table on the shared list (`Due` · `Task` · `Contact` · `Last contact` · `Owner` in Team Work · `Status`); a pick list beside the one task view from 1180 wide, the task alone under that; the left `Module` panel with the day strip and one plain number per row that sums to the chosen tab; `My Task` · `Team Work` and `To do` · `Waiting` · `Done` on one toolbar line; the `Communication` card under the task; the shell's Tasks panel steps aside on this page. Measured on fixture previews with TEST data: `carres-check.js` PASS at 1025, 1164 and 1440 with the table and with a task open, in both scopes. **Not taken:** the `My Task ▾` menu with a person as a scope, `Take over` and an owner reassign (Workspace MASTER allows no manual take or reassign and no per-person tab); the `Do it here` side sheet (an opened task is the one task view beside its list). **Waiting for the owner:** `+ New task` and `@` notes (`ACTION-FLOW-STANDARD`: staff never create an action); `Today` as a `Due` value (COPY-STANDARD "NO RELATIVE DATE WORDS"; drawn as the package has it, PROPOSAL). **Not built:** the `Board` and `Calendar` views (not in brief point 3) and widths under 1025 |
| Tasks panel (13 Oct round 3 package, `Carres Shell.dc.html`, brief point 2) | Day strip Mon to Fri, `To do` · `Waiting` · `Done`, list cards, one task view with tabs `Steps` · `Route` · `History` · `Files` · notes, owner in the foot, `+ Task`, `@` notes with a `Mention` in the bell, a dark toast with `Undo` | **BUILT 13 Oct 2026 in the Portal's own words (UI MASTER §5, 03 §8):** the list, the one task view with `Steps` · `Route` · `History` · `Files`, the owner's initials in the head, the dark toast with `Next` and ✕. **Not taken:** the package's task words (`Chase supplier` · `Check new ETA` · `Ask for Supplier DO`; COPY-STANDARD holds the Portal's sentences) and its mock steps (`Record the answer` · `Save` · `Not now`; the owning module's own form is the step). **Waiting for the owner:** `+ Task` and `@` notes with `Mention` (a task added by hand conflicts with `ACTION-FLOW-STANDARD`: staff never create an action), and `Undo` on a saved result (owner 12 Oct 2026 evening: no timed `Undo`; the package's 15 minute `Undo` and `Correct` is a cross-module plan of its own) |
| One task record (13 Oct round 3 brief, point 4) | Tasks panel, Workspace and Summary read one record; `Done` is written once; `Waiting` returns to `To do` when its time passes; `Goods arrived` closes the supplier follow-ups on that PO; `Call customer about delay` stays until the customer is told | Workspace MASTER §5.10 "One record" and the owning modules. **MERGED 13 Oct 2026 (#2049); signed-in production check owed:** the Workspace page and the Tasks panel read the one Work read through one arithmetic (`task-cards.ts`), so their `To do` · `Waiting` · `Done` numbers are the same; `To do` on today is what is due today or earlier and what has no working date; `Waiting` is the Work record's own state and returns to `To do` by itself when its answer day passes; `Done` is the read's completed work, written once by the owning module. **BUILT 13 Oct 2026 (round 3 item 4); deployment and the signed-in check owed:** `Record as sent` in the one task view records a request, so a task moves to `Waiting` (Workspace MASTER §5.10 "Communication and Waiting"); a full receipt closes the supplier follow-ups on that PO and a part receipt keeps the one for the balance, pinned by test (`purchase-order-register.test.ts`). **NOT BUILT:** the act that records an answer which does not finish the task. **Not in this build:** a Summary reading the same record. **The owning modules' law stands for the delay call:** the Portal asks the customer in two stages (Orders MASTER, "the customer is the LAST to know": `delay_planning` is a decision with no call; `arrange_new_delivery_date` is the call and opens only after the decision says the date cannot be met); the package's single `Call customer about delay` task is not taken (Workspace MASTER §6.1) |
| SO Batch Purchase · `By sales order` and `Use stock` (13 Oct round 3 brief, point 1) | The view drawn on the shared table with no side scroll; `Use stock · n` on the selection bar only while ticked items have free stock | Purchasing MASTER §9.1 records the build and its words |
