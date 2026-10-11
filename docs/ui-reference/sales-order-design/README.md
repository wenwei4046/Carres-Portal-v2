# Sales Order UI kit specimen · v12 · supplied 11 Oct 2026

> **Repository note. Read before the supplied README below.**
>
> This folder is the design specimen behind the ONE KIT. It is not a second kit and not
> business law. The resolved values live in `docs/01-design-tokens.md`,
> `docs/02-components.md`, `docs/03-page-patterns.md` and `docs/ui/MASTER.md`; the token
> mirror is `docs/ui/carres-tokens.css`. Business rules, permissions and exact words stay
> with the module MASTERs and `docs/COPY-STANDARD.md`.
>
> Source archive: `Sales Order_11 Oct.zip`, SHA-256
> `1140ffde825dcd573f05467b49f2201d02331241dbc4f7cb0ef4275957efae16`. It replaces the v8
> specimen of 9 Oct 2026, which is deleted. Git keeps the history.
>
> **Left out of this repository on purpose (the repository is public):**
>
> | Supplied file | Why it is not here |
> |---|---|
> | `sales-real.js` | 20 real orders with customer names, phone numbers and home addresses |
> | `purchasing-data.js` | Reads the real orders above; holds supplier contact emails and WhatsApp group links |
> | `screens/SO-*`, `screens/PO-*`, `screens/SH-01` | Pictures of pages that show real customer names |
> | `docs/Carres Ops Rules.md` | Designer's business-rule notes. Not business authority here, and it lists bank account numbers |
>
> `UX-FLOWS.md` is the supplied file with one customer's name and phone replaced by
> `{customer name}` and `{customer phone}`. Nothing else in it is changed.
>
> Because the two data files are absent, `Sales Order Outright v12.dc.html` and
> `Purchasing v2.dc.html` open without rows here. `Carres UI Kit.dc.html`,
> `Carres Shell.dc.html` and `Carres Table.dc.html` open as supplied. The complete viewable
> package is the owner's ZIP.
>
> Where the supplied files disagree with each other, `docs/01-design-tokens.md` §10 records
> which value was taken and why.

---

# Handoff: Carres Operations Portal — Sales Order UI kit (master template)

## Overview
This package is the master UI kit for the Carres Operations Portal, built on the **Sales Order Outright** module and checked against **Purchasing**. Use it to create (1) one shared template (page shell + table + detail page) and (2) one master UI kit (tokens + components) that every module reuses. A module only chooses its content; the frame, sizes, widths and cell formats never change per module.

Users are Carres operations staff (furniture: mattress, bed frame, sofa, pillow, mattress protector) working on a ~1025–1440 px laptop browser.

## About the design files
The files in this bundle are **design references created in HTML** (self-contained "Design Component" pages: `*.dc.html` + `support.js` runtime). They show the intended look and behaviour; they are **not production code to copy**. Recreate them in the target codebase's existing stack (React/Next etc.) using its patterns. If no stack exists yet, React + TypeScript with CSS variables for the tokens below is the recommended choice.

To view a reference: open any `*.dc.html` in a browser from this folder (keep files side by side; they load `support.js`, `carres-theme.js`, the data `.js` files and `assets/`).

## Fidelity
**High-fidelity.** Colours, type, spacing, row heights, widths and interactions are final and measured. Recreate pixel-perfectly.

## ⚠ COPY ONLY — rules for Claude Code (read first)
This design is **approved and final**. Your job is to copy it exactly, not to improve it.
1. **Do not redesign.** No new layout, colour, font, size, spacing, radius, shadow, icon or component that is not in this package. If something looks wrong, ask the owner; do not "fix" it.
2. **Do not rename words.** Every label, button, status word, toast and empty text is copied character for character from the reference HTML (e.g. "Customer’s original requested delivery", "Not recorded", "Waiting for Jess", "Saved · no approval needed"). Keep capitals and punctuation.
3. **Do not add or remove** columns, fields, cards, tabs, menu items or buttons. A menu item without a working function is not allowed; leave it out.
4. **Numbers are exact.** Use the token table and the Standard values (px, hex, weights). Do not round to a framework's spacing scale; extend the scale instead.
5. **Behaviour is exact.** Every flow in `UX-FLOWS.md` is a test that must pass.
6. **Compare before you finish.** For each screen, put your build next to the matching file in `screens/` and the live reference HTML, at the same width, and fix every difference. Then run the checks (below).
7. **When unsure, the order is:** `docs/Carres Layout Standard.md` → reference HTML → `screens/` → this README. Never guess; list open questions for the owner.

## Acceptance checklist (all must be true)
- [ ] Every state in `UX-FLOWS.md` works and matches its screenshot in `screens/`.
- [ ] `carres-check.js` ported to automated tests; PASS on every state at 1025, 1164 and 1440 px.
- [ ] Only the type pairs in the token table are used (20/600 once per page).
- [ ] Row heights 40 / 54 / 44 / 36 exactly; no text cut ("…") anywhere; no side-scroll except the confirmed 8-column views.
- [ ] Menus, dialogs, toasts are never clipped.
- [ ] Theme change (Settings → Appearance) changes only the selection colour.
- [ ] Shell, Table and DetailPage are shared components; Sales Order and Purchasing both use them with no copied layout code.

## Screenshots (`screens/`)
Captured from the reference at ~925 px wide (narrow laptop, panels as the app opens them). Names: SO-01 list · SO-02 rows expanded · SO-03 list ⋮ · SO-04 columns menu · SO-05 Overview view · SO-06 selection bar · SO-10 detail Sales Order tab · SO-11 detail ⋮ · SO-12 amendment editing · SO-13 amendment reasons · SO-14 SO PDF preview · SO-15 waiting for Jess · SO-20/21/22 Order Route Overview / Steps / Details · SO-30 Timeline · SH-01 Settings → Appearance · PO-01 SO Batch Purchase · PO-02 Purchase Orders · PO-03 PO detail · KIT-01…06 UI kit.
The live HTML is the master for anything a screenshot does not show (hover, wider screens).

## UX (behaviour)
See `UX-FLOWS.md`: every interaction written as steps → expected result, with real sample data, so each line can become a Playwright test.

## Source of truth (read in this order)
1. `docs/Carres Layout Standard.md`: every UI rule, measured (§0 portal format, §3 screens, §4 UI rules). **If this README and the Standard differ, the Standard wins.**
2. `docs/Carres Ops Rules.md`: business rules (amendments, approvals, dates, fees).
3. `Carres UI Kit.dc.html`: the visual picture of the Standard (type, buttons, pills, menus, links).
4. `carres-check.js`: an automated measurement of the rules. Port it to a test (Playwright/Vitest + DOM) and run it on every screen.

Words on screen come from the owner's COPY standard; do not rename labels.

## Template structure (three shared pieces)
- **Shell** (`Carres Shell.dc.html`): left menu (220 open / 64 closed), top bar 56 ("Sales Order / Outright", search, team, bell), toolbar row 36 (view tabs Open · Delivered · All, active filter chips, columns menu, ⋮), Summary panel 264 (left), Tasks panel 320 (right), Settings → Appearance. Props: `det` (opens a detail in the middle: Summary and toolbar hide, Tasks stays), `summary`, `tabs`, `chips`, `views`, `more`, `sel` (selection bar), `tasks`, `search`.
- **Table** (`Carres Table.dc.html`): sticky header 40, list rows 54, expandable item rows 44, ticks, group rows, footer 44 ("n orders · Qty: MS 30 · Pillow 20 · BF 20 · M.P 7 · Sofa 3 sets"), sideways scroll with the identifier column frozen.
- **Detail page** (inside a module, see `Sales Order Outright v12.dc.html`): header + tabs + cards, opened in the middle area in place of the list.

## Screens

### 1. Sales Order list (`Sales Order Outright v12.dc.html`, no hash)
- Toolbar tabs: Open (default) · Delivered · All.
- Column views (columns menu, "Show columns for"): **Sales Order** (default) · Overview · Purchasing · Warehouse · Payment · Delivery · Service. Default columns: Proceed date · SO no. (+ customer line) · Items (pcs, sofa in sets; grey line = categories as MS · BF · SOF · M.P, full names on hover) · Sales location (+ salesperson line) · Delivery location · ETA. Max 6 data columns, except Overview and Payment (8, side-scroll allowed).
- Expanded row (▸): item rows = Item (line 1 model 13/400 ink, line 2 spec 12 #6B7280; spans 3 columns) · Qty · Supplier. Always 44 high, never cut.
- Column widths: text columns ≥150 px are flexible (min 75 %), dates/numbers/status fixed. Never cut text.
- List ⋮: EXPORT Download Excel (.xlsx) · Download PDF | VIEW Save as my view | DATA Sync from Sales Portal now (long hint on a 2nd line).
- Selection bar replaces the toolbar when rows are ticked: "☑ n selected · n pcs | Export · Print SO | Clear".

### 2. Sales Order detail (`#so=<SO no.>`)
- **Header row** (as v8): ← icon button (34 round, no border) · **SO no. 20/600 −0.01em** with customer 13 #6B7280 under it · order status pill (Open grey · Late amber when ETA passed and not delivered · Delivered green · Finance hold charcoal) · Rev n chip (24, white, 1px #E5E7EB, if amended) · "Waiting for Jess" chip (when an amendment waits) · PIC avatar 24 (grey person "SO PIC not recorded" when unknown, no "Team" word) …… Log contact (white 34) · **Request amendment** (charcoal #1B1B39, 34) · ⋮ (34 round, icon 20 #6B7280). Wraps buttons to a 2nd line only when narrow. The header must not clip menus.
- ⋮ menu: SALES ORDER Preview SO PDF · Print SO · Download PDF | COPY SO no. · Customer phone (toast "Copied …") | OTHER Withdraw amendment (only while pending). No item without a working function.
- **Tabs**: Sales Order · Order Route · Timeline.
- **Sales Order tab**:
  - Sales strip, full width, **5 fields always on one row**, 5 equal columns: SO Doc Date · Proceed Date · Sales Location · Salesperson · Dealer. Label 12/400 #6B7280, 6 px, value 13/500 ink; 12 px under the hairline.
  - Two cards side by side (stack when narrow): card 1 = Customer (Full name · Phone · Email · Customer type · Race · Gender · Birthday) + Emergency contact (Contact name · Relationship · Phone); card 2 = Delivery (Customer’s original requested delivery · ETA · Floor · Lift · Stair carry fee) + Address (Address line 1 · Address line 2 · City / state · Postcode · Building type · Billing address). Field rows 36 (label 150 left, value beside; long values wrap).
  - Items and payment card: table `# · Item · Qty · Unit price · Amount` (cols 24 / 1fr / 40 / 96 / 96, header 40 on #F8F9FA, rows 44, item 2 lines), totals Total · Received · **Balance due** (amber row #FBF0D6 / #7A5A00 600 when > 0). Then "Payment" section title 15/500: Method · Bank reference · Bank slip.
  - Missing data always shows "Not recorded" in #6B7280. Never invent data.
- **Amendment** (Request amendment): pencils appear next to editable fields; click = inline input. Sticky bar: "Amendment · n changes · Click the pencil… · Why? ⌄ (chips FROM CUSTOMER / OUR SIDE) · Add proof · Cancel (→ Discard? Keep editing / Discard) · Submit for approval". Not editable: Sales strip, items, payment, ETA, Stair carry fee (fee is calculated: floors above 2F × items × RM 50, max 3F). Phone, Email, Address, Emergency contact save at once ("Saved · no approval needed", Rev n+1); everything else goes to Jess (COO) as an "Approve amendment" task in **her** Tasks, never the requester's.
- **Order Route tab**: status card "Delivery date" with segmented switch **Overview · Steps · Details**.
  - Overview: three cards Goods · Delivery · Payment (icon, name, pill, sentence, Now at / Next / Due / Doc, Goods adds ITEMS, STEPS list).
  - Steps: node map Sales order → one box per supplier (+ Warehouse stock) side by side with its own PO no. and items → Goods in warehouse → Logistics → Delivery slot → Delivered. Boxes 180–240 flexible, 1px #CBD0D6 connectors, current step 1px blue frame. Fits without side-scroll.
  - Details: table Step · Who · Planned · Actual · Status · Document (header 40, rows 44, fits without scroll).
- **Timeline tab**: events with filters All · Contacts · Amendments · System.

### 3. SO PDF preview (dialog)
A4 page: Carres mark + legal name/SSM/address · SO no. + "SALES ORDER" right · BILL TO / SALES ORDER INFO · item table by category band · TOTAL PAYABLE · payment table · summary (Balance due amber when > 0) · Terms & Conditions · footer. Print/Download print only the SO page (hidden iframe), not the whole app.

### 4. Tasks panel (Shell, every page)
Card: tags row (module tag 11/500 on #F1F2F4, due chip) · title 13/500 · grey line · footer. Open card: facts as **11/500 caps labels over 13/500 values** (two columns). **A record number in the facts is the link** that opens it (dotted underline, solid on hover): no "Open …" buttons. One charcoal main button per card ("Mark done").

### 5. Purchasing (`Purchasing v2.dc.html`, `#batch` / `#po` / `#po=<PO no.>`)
Same Shell, Table and detail header pattern (PO no. 20/600 with supplier line). Use it to verify the template is module-agnostic.

### 6. Settings → Appearance (Shell)
Top bar "Settings / Appearance" (the page title is the only 20/600). Tabs Appearance · Staff and duties as the segmented control. "THEME" 11/500 caps. One white card, rows: Cool (Cool Slate · Blue **Default** · Teal · Violet) · Brand (Carres) · Warm (Warm Honey · Olive · Rose · Latte). Chip 32 high, radius 8, 12-px dot + name 13/500; picked = soft selection fill + 1px border and text in its colour + check. Note under the card explains a theme changes only the selection colour. Saved per person in localStorage `carres.theme`, default `blue`.

## Interactions & behaviour (global)
- Row click opens the detail; tick, buttons and text selection do not. Back returns to the same scroll position.
- Hover/pressed: white/grey buttons #EDEFF2; icon-only buttons round shade rgba(31,41,55,.10) hover / .16 pressed; charcoal #111827; rows/menu items theme hover tint; links dotted → solid underline; disabled 45 %, no hover.
- Open state (a button whose menu/form/panel is open): its pressed grey, never blue.
- Blue (theme selection) only marks something picked: tab, chip, menu item, ticked row, focus.
- Toasts: bottom centre, #1F2937, white 13, 2.2–2.6 s.
- Never cut text: no "…" on values; columns and cells grow or wrap inside their own column.

## Design tokens
Theme = per person (`carres-theme.js`, localStorage `carres.theme`, default `blue`); it changes only the selection pair.

| Token | Value |
|---|---|
| Page ground (blue theme) | #F6F7F9 |
| Card / surface | #FFFFFF, 1px #E5E7EB, radius 8 |
| Ink | #1F2937 · secondary #374151 · body grey #4B5563 · label grey #6B7280 · faint #CBD0D6 |
| Hairlines | rows #F1F2F4 · headers #E5E7EB · expanded frame #CBD0D6 |
| Table header ground | #F8F9FA |
| Selection (blue theme) | text #2F55E0 · soft #EEF4FF · selected tab white on track #E2E4E8 |
| Main button | #1B1B39, hover #111827 (one per area) |
| Amber (needs action now) | bg #FBF0D6 · text #7A5A00 · frame #E8C77A |
| Green (done) | bg #E7F6EC · text #1E7A40 |
| Neutral pill | bg #E5E7EB · text #374151 |
| Hold | bg #1F2937 · text #FFFFFF |

**Type** (Inter; tabular numbers in tables). Only these pairs:
20/600 page title or record no. (the one boldest text) · 15/500 card & panel titles · 14/400 breadcrumb · 13/400 body · 13/500 field values, buttons · 13/600 table identifiers, button on charcoal · 12/400 labels, second lines · 12/500 pills, table headers · 11/500 caps labels (.06em) and tags · 11/700 badges.

**Spacing & shape**: 12 between zones, 14–16 inside cards; radius 8 for cards, rows, inputs, buttons, menu items; pills and avatars fully round.

**Row heights**: table header 40 · list row 54 · item/total row 44 · detail field row 36 · toolbar 36 · top bar 56 · footer 44.

**Buttons**: word button = box radius 8 (white 1px #E5E7EB, or charcoal), 32–34 high, 13/500 (charcoal 13/600), 1–2 words, icon only if the icon is the button. Icon-only = 32–34 round, no border, no fill.

**Pills**: 12/500, padding 3 10, round, colour + one word.

**Menus**: 250 wide, white, 1px #E5E7EB, radius 8, shadow 0 8 24 rgba(17,24,39,.12), padding 6; group label 11/500 caps .06em #6B7280 (padding 8 10 4) with hairline between groups; item 32 (padding 7 10, gap 10), icon 18 #6B7280, text 13/400; short hint right, long hint as 12 grey 2nd line; selected item 500 + check.

**Icons**: Material Symbols Rounded, 18 in buttons/menus, 20 for icon buttons and panel icons.

## State (per module page)
`view` (open/done/all) · `layout` (column view) · `f` (filters) · `sel` (ticked rows) · `det` (open record, mirrored in `#so=`) · `dTab` · `rv` (route view) · `fe` (amendment edit: open fields, reasons, proof, confirm) · `edits` (applied contact changes) · `pend` (waiting for Jess) · `rev` (revision count) · `logs` (timeline events) · `tasks` · `more` / `docOpen` / `toast`.

## Data
`sales-real.js` (`window.SO_REAL`): the 20 real sample orders (customer, phone, address, items with model/spec/qty/supplier/PO/stock status, ETA, logistics, balance, payment status). `purchasing-data.js`: the POs derived from the same orders. These are fixtures; the real build reads the ERP. Proceed Date = Sales Portal "Planned production start" (same fact; only the name Proceed Date is shown).

## Assets
`assets/carres-mark.png`, `assets/carres-wordmark.png` (Carres brand). Icons: Google Material Symbols Rounded (web font).

## Files
- `Carres UI Kit.dc.html`: master kit picture
- `Carres Shell.dc.html`, `Carres Table.dc.html`: shared template pieces
- `Sales Order Outright v12.dc.html`: reference module (list + detail + PDF + amendment)
- `Purchasing v2.dc.html`: second module on the same template
- `carres-theme.js`, `carres-check.js`, `sales-real.js`, `purchasing-data.js`, `support.js` (DC runtime for viewing only)
- `docs/Carres Layout Standard.md`, `docs/Carres Ops Rules.md`
- `UX-FLOWS.md` (behaviour), `screens/` (pictures of every state)

## Suggested Claude Code prompt
> COPY ONLY, do not redesign. Read README.md (the COPY ONLY rules first), UX-FLOWS.md and docs/Carres Layout Standard.md in full, and look at every file in screens/. Build (1) a master UI kit: tokens as CSS variables and components Button, IconButton, Pill, Chip, Menu, Link, Card, FieldRow, Toast, Avatar, Table (header/row/item row/group row/footer), Tabs, SegmentedControl; (2) a template: AppShell (menu, top bar, toolbar, Summary, Tasks) + ListPage + DetailPage. Recreate Sales Order Outright (list, detail with 3 tabs, amendment flow, SO PDF) on it, then Purchasing on the same template. Port carres-check.js into automated tests and make every screen pass at 1025, 1164 and 1440 px wide.
