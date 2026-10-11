> Supplied with `Sales Order_11 Oct.zip`, unchanged below this note. The resolved kit values are in `docs/01-design-tokens.md`; its §10 lists which lines here are stale and which are PROPOSAL / NOT LAW. Words follow COPY-STANDARD and business rules follow the module MASTERs.

# Carres Operations — Layout Standard
Last updated: 11 Oct 2026 (v12 on the 20 real cases; SO detail aligned to v10 + PO detail).

## 0. Carres Portal Format (fixed 10 Oct 2026; every module, every list; follows SAP Fiori List Report + Object Page and Odoo list view)
One format for the whole portal. A module only chooses content (what one row is, which columns from the catalog §0.7, what the expanded rows show). The frame, sizes, widths and cell formats never change per module. Change requests go to this section first, then the shared files.

### 0.1 Shared files (never copy them into a module)
- `Carres Shell.dc.html`: menu, top bar, toolbar, Summary (rows, month switch, NEXT 5 DAYS boxes), Tasks (result and steps forms), Settings → Appearance. A module passes `det` to open a detail in the middle (Summary and toolbar hide, Tasks stays), `views-head` to name the view menu ("Show columns for" or "Group by"), and marks the one main action of the selection bar with `pri` (charcoal).
- `Carres Table.dc.html`: header, rows, group rows, item rows, ticks, footer, sideways scroll. An item cell with `act` is the row's one control (Stock tag, Delivery): a 24-px bordered button with the value and a chevron, radius 8, tone colours as the pill. A group row with items and no open action expands on row click.
- `carres-theme.js`: the person's theme. `Carres UI Kit.dc.html` shows the same values.

### 0.2 Page frame (measured at 1164 × 715)
- Menu 220 open / 64 closed (remembered); menu items 13/400 ink #1F2937, icons 18 #4B5563 (dark, so the grey 11-px caps section labels read as labels; follows Polaris navigation), selected = theme tint + 500 (never 600); when the menu is collapsed the parent icon (e.g. Sales Orders) carries the selection for its current child, section labels 11/500 caps #6B7280 .06em with 18 px above, 6 px below; menu has a right hairline, top bar a bottom hairline (follows the live ERP) · top bar 56 "[Module] / [Page]" · toolbar row (one line, 36 high, never wraps: tabs 13, selected = theme tint + 500, others 400 #4B5563; no "Showing" text (the tab says which list, the footer says how many; follows Polaris); only active filter chips appear here, column/more icons pinned right; Summary and Tasks title rows share the same 36-px line) · Summary 264 (left: title row on the ground, then one white card per section, same as Tasks) · list (middle) · Tasks 320 (right: title row on the ground, white task cards; a 1px #E5E7EB line separates it from the middle, 12 px air on both sides; Summary has the same line on its right). 12 px between zones.
- A detail (SO, PO, supplier …) always opens in the middle area in place of the list; Summary hides, Tasks stays; Back returns to the same scroll position. No three-panel list + detail (it squeezes the columns).
- Summary rows: label 13/400 #4B5563, value 13/500 #1F2937 (amber 500 when it needs action; theme text when selected). A section footnote sits under a hairline with 6 px above. Panel icons 20, in-card arrows 18. All caps section labels (Summary sections, Tasks coming days, menu groups, pop-up group heads) are ONE style: 11/500 #6B7280 .06em. Same job = same size in every panel; a label is made quiet by being small caps in grey, not by being smaller in one panel than another; Summary rows are exactly 32 high.

- Settings → Appearance (owner 11 Oct): tabs Appearance · Staff and duties as the same segmented control as the list tabs; "THEME" 11/500 caps; one white card, groups Cool (Blue = Default, labelled) · Brand (Carres) · Warm; theme chips 32 high, radius 8, 12-px dot + name 13/500; the picked one = its soft selection fill, 1px border and text in its selection colour, 16-px check, never 600 and never a black ring. A theme changes only the selection colour; page ground #F6F7F9, charcoal buttons, greys and status colours are fixed.

### 0.3 Three layers: every piece of information lives in exactly one layer
1. List row: what you need to decide the next step. Max 6 data columns.
2. Expanded rows (▸): what you need to recognise the goods: item, qty, supplier, PO, stock, deliver to, item status.
3. Detail page: everything else (contact, address, payment records, amendments, documents, timeline, supplier dates, history).
Test: "Can't decide the next step without it" → list. "Need it to know which goods" → expanded. Else → detail. Hover may repeat a value from another layer; it never holds information that is nowhere else.

### 0.4 List rows
- Menus, one design for every ⋮ / columns / filter menu (list and detail): 250 wide, white, 1px #E5E7EB, radius 8, shadow 0 8 24 rgba(17,24,39,.12), padding 6; group label 11/500 .06em #6B7280 (padding 8 10 4) with a hairline #F1F2F4 between groups; item 32 high (padding 7 10, gap 10), icon 18 #6B7280, text 13/400 ink; a short hint (.xlsx) 12 #6B7280 at the right, a long one ("Last sync 10:42 AM") as a 12 grey second line under the item. Never wraps to three lines.
- Caps labels (ITEMS, STEPS, menu groups SALES ORDER / COPY / OTHER, Summary sections): 11/500, letter-spacing .06em, #6B7280. Status pills always padding 3 10.
- Money still owed (as v10, owner 11 Oct): the Balance due row on the SO detail and SO PDF is amber when the balance is above 0 (row #FBF0D6, text #7A5A00 600); RM 0 or not recorded stays plain. This is the one amber row fill allowed; cards still never get an amber fill.
- Item text, one rule everywhere an item is shown (list item rows, SO detail Items, Order Route boxes and Goods card, PO lines, Tasks): line 1 = model 13/400 ink, line 2 = spec 12/400 #6B7280 (size, fabric, colour; no category); no spec → one line. Never model and spec joined with "·" on one line.
- Column widths: a text column of 150 px or more is flexible (minimum = 3/4 of its width, then shares the spare space), so the default view fits the middle column without side-scrolling on a 1025-px window; date, number and status columns keep their fixed width. Side-scrolling only when the window is narrower than every minimum.
- Row heights, one set for every table and card (follows Polaris IndexTable / DescriptionList): table header 40 · list row 54 · item / order-line / total row 44 · label–value row in a detail card 36 (label 150 left, value beside it; a long value wraps and the row grows, never cut) · card title 15/500 with 6 below; a section title inside a card (e.g. Payment under Items) uses the same 15/500 with 18 above. Nothing else.
- Row types: list row 54 px (also used for group rows) · item row 44 px, always (never wraps: two lines max, long text ends with … and shows in full on hover; the item name spans the first two columns so it has room) · header 40 px white, stays on top · footer 44 px (count · totals · Rows 20 · page).
- Column order: ▸ · tick · identifier · description · quantities · dates (most important first) · status (last). ⋮ only if the row has actions.
- Every cell is one of 5 formats: Identifier (13/600 #1F2937 + one 12 #6B7280 line) · Text (13/400 #1F2937 + optional 12 #6B7280 line) · Number (right-aligned, tabular) · Date ("7 Oct" + grey weekday) · Status pill (colour + one word, optional 12 grey line under). An alert tag (e.g. Outstation 3/18) sits in the second line of the identifier. Max two lines per cell, except the item name on item rows: model and spec are shown in full and wrap, the row grows (follows NetSuite / Odoo order lines); the grey line under the item name is the spec only (no category; none if there is no spec). No buttons in list rows; item rows may have one control per row (e.g. Stock tag, Deliver to).
- Ticks: a list ticks whole rows; a buy list ticks items (the group tick = all its open items). Rows that can't be acted on show no tick.
- Module views (column menu): swap only the middle columns; identifier and status stay; max 6, except the confirmed v10 views Overview and Payment (8 columns, owner 11 Oct). When the middle column is narrower than a view's minimum widths, the table scrolls sideways with the SO no. column frozen; nothing is cut.

### 0.5 Widths (never change with panels, screen or view)
- Only the identifier column stretches (min 180; it takes any spare width). Every other column has the fixed width of its type in §0.7. No fr / minmax on other columns. When the columns do not fit, the identifier stays at 180 and the table scrolls; it never grows to fill a scrolling table.
- Opening or closing Summary, Tasks or the menu never changes a column width; if the columns don't fit, the whole table (header with rows) scrolls sideways and the identifier stays fixed on the left.

### 0.6 Page definitions (current)
| Page | One row = | List columns | Expanded rows |
|---|---|---|---|
| Sales Order Outright | one SO | SO no. + customer · Items · Sales location + salesperson · Delivery location + state · Proceed date · ETA (sheet; Customer’s original requested delivery shows when Sales Portal gives it) | Item (+ spec) · Qty · Supplier (+ view columns) |
| Purchase Orders | one PO | PO no. + supplier · Items · Sales orders · PO date · Supplier deadline · Status (Received date + GRN as its grey line) | Item · Qty · Sales order · Supplier delivers to · Status |
| SO Batch Purchase · By supplier | supplier + category | Supplier · Category (+ delivery, production days, Outstation tag) · Items (+ n models) · Sales orders · Order by · Ready by · Status | tick · Item · Qty · Sales order (+ Order by, Outstation) · From stock · Delivery |
| SO Batch Purchase · By sales order | one SO | SO no. + customer · Items · Order type · Proceed date · Customer’s original requested delivery · Status | tick · Item · Qty · Stock · Supplier · Supplier delivers to |
| SO Batch Purchase · By category / By order deadline | one group | Category (or Order deadline) · Items · Sales orders · Suppliers · Status | tick · Item · Qty · Sales order · Supplier · Stock |

- Sentence case everywhere: column headers, buttons, menu items, tags ("Proceed date", "SO no.", "Sales location"). Only abbreviations keep capitals (SO, PO, RM, ETA).

### 0.7 Column catalog (each column defined once; modules pick from here)
| Type · width | Columns | Layer |
|---|---|---|
| Identifier · min 180, stretches | SO no. (+ customer) · PO no. (+ supplier) · Supplier · Category (+ delivery, production days) · Category · Order deadline · Item (model + spec, remark) on item rows | List / item rows |
| Number · 96 right | Items (pcs, sofa in sets; grey line = category or n models) | List |
| Count + doc · 140 left (fits a combined ref such as "CR1141 + TCF0572") | Sales orders (n + first SO) | List |
| Number · 48 right | Qty | Item rows |
| Money · 110 right | Order value · Paid · Balance | List (Payment view) |
| Date · 120 | Proceed date · PO date · Customer’s original requested delivery · Customer confirmed delivery date · Supplier deadline · Order by · Ready by · Pay by · Supplier ETA | List / item rows |
| Status · 150 | Status · Now at · Stock · Supply · Payment · Finance hold · Problems · GRN · Appointment · Loading | List / item rows |
| Document No. · 130 | PO no. (side column) · Supplier DO · GRN No. · DO No. · Receipt No. | Module views / item rows |
| Short text · 160 | Sales location (+ salesperson) · Delivery location (+ state) · Salesperson · SO PIC · Supplier (side) · Suppliers · Order type · Logistics · Area · Location · Dealer | List (views) / item rows |
| Category · 110 | Category (left out when grouped by category) | Item rows |
| Address · 170 | Supplier delivers to | Item rows |
| Detail only | Customer phone, address, emergency contact · payment records · amendments · documents · timeline · supplier date rows (production, new ETA, actual) · supplier channel and contacts · PO PDF | Detail |
New information: add one line here first (type + layer), then every module that needs it uses it.

### 0.8 Table look (Carres Table; follows Shopify Polaris index table / SAP Fiori grid table)
- Card: white, 1px #E5E7EB, radius 8. Header row: background #F8F9FA (fixed, all themes), 12/500 #6B7280, bottom line #E5E7EB, stays on top. Row lines #E5E7EB. Footer: white, top line #E5E7EB.
- Alignment: the column decides it, header and every row and item row follow it: right only for columns that hold numbers alone (money, a bare qty); a column whose cell is a count with words under it ("4 pcs" / "Mattress, Bedframe") is left, like every other text column. "Sales orders" (n + first SO) is left. A left column right after a right one gets 14 px extra space.
- Expanded row = one box: 1px #CBD0D6 frame around the parent and its items, 8 px corners, 8 px above and below. Parent row stays white like any row (SO no. 600, dark ▾) so it reads as the record; only headers are grey bands: the table header and the item sub-header (Item · Category · Qty · …) are #F8F9FA, 12/500 #6B7280 (follows Polaris nested rows); item header strip #FAFAF9 (12/500 #6B7280); item rows white, 44 px, lines #F1F2F4. The parent row stays under the table header while its items scroll.
- Scrolling down an expanded row: the parent row and its item header (Item · Category · Qty · …) stay together under the table header (one sticky block, top 40) until the last item of that order has scrolled past; follows Polaris IndexTable / NetSuite sublists.
- Calm rules (owner 10 Oct night: "calm, neat, clean"): one accent colour (blue) only for selection, links and focus; amber only when something needs action now (e.g. customer date within 7 days), never just because data is missing; green only for done. A card whose fields are all missing shows one grey line ("No remarks recorded"); missing fields in a card are listed once at the end ("Not recorded: Sales location, Salesperson, …"). Order Route card is titled "Delivery date" and has a segmented switch Overview · Steps · Details (follows the live ERP). Overview = three track cards Goods · Delivery · Payment (icon, title, one status pill, one sentence, Now at / Next / Due / Doc, Goods adds ITEMS, each ends with STEPS: filled dot = done, dark dot = now, hollow = later; a card that needs action has an amber #E8C77A frame, never an amber fill). Steps = the map below. Details = one line per step. Steps view is a map (owner 10 Oct night: "where is my map"): a top row of facts (Customer’s original requested delivery · Customer confirmed delivery date · Days left · Now at), then one 240-px box per step joined by 1px #CBD0D6 lines: Sales order → one box per supplier (and one for Warehouse stock) side by side, each with its PO no. and items → Goods in warehouse → Logistics → Delivery slot → Delivered. The current step has a 1px blue #2F55E0 frame; each box carries one status pill.
- Weight and balance (owner 10 Oct night: "too black and heavy"): in a table row only the identifier (SO / PO no.) is 600; every other value is 400 ink. A status that needs no action is plain text #4B5563, not a pill; pills only for amber (act now) and green (done). Row chevrons are #9CA3AF (icon, 3:1), dark only when open.
- Text alignment in a row: every cell keeps two line slots when any cell in that row has a second line, so all first lines sit on one line and all second lines on another (the empty slot stays blank). Column header text starts at the same x as the cell text below it; pills start at the column edge.
- Place cells: area on line 1, state on line 2 ("Kajang" / "Selangor", "Kuala Lumpur" / "Federal Territory"); the Outstation tag sits on line 2 after the state (owner picked A, follows Polaris badge-after-text); when the area and state are the same (Melaka) line 2 is the tag only. Table cells take `tagEnd: true` for this. Outstation is decided from the place (outside Kuala Lumpur, Selangor and Putrajaya, same STATES list as Purchasing), never from the "*" mark in the Delivery_Sum sheet.
- Item rows sit on the parent columns (same grid): item name under the identifier, qty under Items, and so on; a long value may span the next column. Item name and spec wrap, never cut.
- Ticked row or item: theme selected background. Hover: theme hover tint (carres-theme.js `hov`).
- The ▸, tick and identifier columns stay fixed on the left when the table scrolls sideways.

## 1. Page shell (desktop 1280–1920 px; MacBook 1440 is the main test size)
```
┌──────────┬───────────────────────────────────────────┬──────────┐
│ MENU     │ PAGE HEADER: title ........ search · team · 🔔 │          │
│ 220 px   ├───────────┬───────────────────────────────┤  TASKS   │
│ (64 px   │ SUMMARY   │ TOOLBAR (or selection bar)    │  320 px  │
│ closed)  │ 240 px    ├───────────────────────────────┤  every   │
│          │ collapses │ TABLE (header fixed, rows     │  page    │
│ ⚙ 👤     │           │ scroll inside) · summary line │          │
└──────────┴───────────┴───────────────────────────────┴──────────┘
```
- The page never scrolls; only panels and table bodies scroll inside (thin scrollbars).
- Summary and Tasks collapse; a small pill ("Summary", "Tasks 5") in the toolbar opens them again.
- Side drawers (revision history, document preview) open to the left of Tasks and never cover it.

## 2. Menu (left)
- One shared side menu on every page of the app (list, detail, Workspace, Settings, every module). Same items, order, sizes and behaviour everywhere; only the selected item changes.
- Logo: menu open = CARRES wordmark (20 px high), aligned with the menu items; menu closed = heart mark (34 px). « collapse button on the right of the logo row.
- Groups with small uppercase labels:
  - OVERVIEW: Dashboard · Workspace
  - SALES LOCATIONS: Showroom (Carres · Dealer)
  - SALES: Sales Orders (Outright · Subscription)
  - SUPPLY CHAIN: Purchasing (Buy: SO Batch Purchase · Manual Purchase Request · Purchase Orders | Receive: Receiving | Problems: Supplier Claims · Purchase Returns · Repair Orders | Showroom: Display Requests · Consignment Orders · Consignment Returns — coming soon) · Warehouse · Payments · Delivery
  - SERVICE: Service Case · Issue Tracker
  - DATA: Reports · Suppliers · Catalog
- No group is called "Operations" (the whole app is Operations).
- Sub-items have thin grey tree lines. Unselected: grey, weight 500. Selected: theme light background + dark text, 600.
- Bottom: Settings ⚙ and the user avatar.

## 3. Screens
### 3.1 List page (e.g. Sales Order Outright)
- Header: page title only. Right: search (SO / PO / customer / supplier; white pill, 1px #E1E4E8, 34 high, same as the team and bell buttons) · team (avatar icon + online count) · bell. All three live in Carres Shell.
- Search (follows Shopify / NetSuite global search): from 2 letters a dropdown under the box lists matches grouped by record type (SALES ORDERS · PURCHASE ORDERS · SUPPLIERS, 11-caps labels, max 6 each): icon 18 · number 13/600 · one grey line · status pill. Click or Enter opens the record (SO / PO detail in the middle; a supplier opens SO Batch Purchase by supplier); Esc or × clears; no match = "No match for “…”". Each module gives the Shell a `search(q)` that returns its records.
- Team pop-up: Team today · n online · date, Find staff, groups ONLINE / AWAY / OFF TODAY (avatar with status dot · name · what they work on · last seen · jobs), note on automatic job moves. Notifications: All / Announcements / System tabs with unread counts, unread = dot + 500, Mark all read; bell badge = unread count (charcoal).
- Summary panel: ‹ month ›, numbers that filter the table when clicked, pieces by category.
- Toolbar: view tabs (Open · Delivered · All) · columns · ⋮.
- ⊞ view menu (every table, same menu): SHOW COLUMNS FOR Overview · Sales Order · Purchasing · Warehouse · Payment · Delivery · Service; page groupings (e.g. GROUP BY By supplier · By sales order) as a second section. Each page opens on its own module view. Columns are defined once per module and look the same in every table. A row that covers one SO swaps its middle columns; a row that covers several SOs (PO, supplier group) shows one summary column ("2 of 3 fully paid") and the module columns on its item rows. Grey "· [group ·] [module] view" after the tabs.
- Expanded item rows = one shared detail sub-table (follows NetSuite / Odoo / SAP order items), same in every list: its own small grey header row inside the expanded box. Fixed columns in every view: Item (model + spec in full, wrapping to more lines, never cut; remark under it) · Category (left out when the rows are already grouped by category) · Qty ("1 pc" / "2 pcs") · Supplier (left out when the rows are already grouped by supplier); + Sales order when the parent row covers several SOs (PO, supplier group): SO no. only, the state name in amber under it when outside Klang Valley (e.g. "Melaka"); customer name only on hover (follows SAP / Odoo source document). Extra columns by view: Purchasing + PO no. · Supplier deadline · Supplier DO · Status; Warehouse + GRN · Location · Status; Delivery + Supplier delivers to; Overview, Sales Order, Payment, Service add none. SO Batch Purchase adds a tick column first, a Stock column and Supplier delivers to (follows Odoo / SAP Fiori line rows: one line per item, status as one small tag, actions in a popover, editable values shown as text until clicked). Stock: one tag only, green "In stock · n" / amber "Possible · n" / grey "—"; clicking the tag opens a small popover (unit, location, condition, in since) with "Use this unit" (possible units need the customer's OK; a task goes to the Salesperson); after use the tag reads "Reserved · [location]" or "Waiting customer OK · [location]" and the popover offers Undo. No "Buy new" button: not using stock means the item is bought. Supplier delivers to shows as text with a pencil; click to choose from the list; grey "changed" when not the default; By sales order view has an Order type column (Outright / Subscription, filterable from the header); Summary TODAY adds "Stock match" and "Outstation" (orders outside Klang Valley, found from the delivery location); outstation items default Deliver to = AL (first outstation logistics) and show "Outstation · [state]" under the customer; placing their PO creates a Delivery task "Book outstation logistics" (AL → NETS → Houzs, confirm before D−3); and has no Status column (PO no. and Supplier already show To buy / Ordered / From stock). A view never shows another module's status.
- ⋮ More actions (list): EXPORT Download Excel · Download PDF | VIEW Save as my view | DATA Sync from Sales Portal now (last sync time).
- Ticking rows replaces the toolbar with the selection bar: "☑ n selected · n pcs · Total RM x | Export · Print SO | Clear ✕". Only the ☑ and the Clear link are blue; "n selected" is ink 13/600, the totals grey #6B7280. The user avatar (bottom of the menu) is grey #E5E7EB with ink initials, never the theme blue (§4.6: one fixed colour per person).
- Table: header fixed, row lines kept, every cell can have two lines. Click anywhere on a row to open; checkbox and in-row buttons do not open; selecting text does not open; Ctrl/⌘-click opens a new tab; Back returns to the same scroll position.
- Summary line at the bottom: "n orders · Qty: Mattress 30 · Pillow 20 · Bedframe 20 · Mattress protector 7 · Sofa 3 sets · Service 3": always the full category names (owner 11 Oct), never MS / BF short forms; the footer has room (the pager sits at the right). Short forms are only for the grey line under Items in a row.

### 3.2 Order detail
- Header (same as the PO detail; as v8, owner 11 Oct): ← (icon button: 34 round, no border, no fill, icon 20 ink, same as ⋮) · SO no. 20/600 −0.01em with the customer 13 #6B7280 on the line under it · order status pill (as v8: Open grey · Late amber when the ETA has passed and it is not delivered · Delivered green · Finance hold charcoal; never a stock word, stock lives in the Goods card) · stacked 24-px avatars, no "Team" word (PIC first; name and role in the tooltip; one grey person avatar "SO PIC not recorded" when the sheet has no PIC) · Rev n (24-px white chip, if amended) …… Log contact (white 34) · **Request amendment** (charcoal 34) · ⋮ (34 round, icon 20 #6B7280; menu 250 wide, items 7 10 / gap 10, group labels 11/600 with a hairline between groups). As v10. Opens in the middle (Shell `det`): Summary and toolbar hide, Tasks stays.
- Toolbar hierarchy (follows Polaris / Linear / Apple segmented control): main = the list tabs, drawn as one segmented control (grey track #E2E4E8, radius 10, padding 3; selected tab = white + blue text #2F55E0 500 + soft lift; hover = #EEF0F3). Side = panel toggles "Summary" (far left) and "Tasks n" (far right): ghost buttons, no border, no fill, grey #6B7280 icon + word, hover grey 10% with ink text; a 1px #D5D9DE divider stands before Tasks. Tools (columns, ⋮) = round ghost icon buttons between them.
- Tasks panel on the list is closed by default under 1280 px (opens itself for the Log form, an open task and every detail). Form chips: unselected = light grey #F2F3F5 fill, no border; selected = #E9EBFF fill + blue text + blue border. Selected menu item: white pill, blue icon and text, soft lift (0 1px 2px rgba(16,24,40,.10)).
- SO list views = the confirmed v10 set, nothing added or removed (owner 10 Oct night): Sales Order (default: Proceed date · SO no. · Items · Sales location · Delivery location · ETA) · Overview · Purchasing · Warehouse · Payment · Delivery · Service, columns as in v10; Summary = THIS MONTH (Orders · Value · Delivered · Avg days to deliver) · NEEDS ATTENTION (Late supply · Payment due · Finance hold · Problems) · PIECES ORDERED; Timeline filters All · Contacts · Amendments · System. Values the sheet lacks = "Not recorded". The ⋮ menu group is "DOWNLOAD THIS LIST" (Excel / PDF of the rows on screen).
- SO detail · Sales Order tab = the confirmed v10 content, nothing added (owner 10 Oct night): Sales (full width, as the live system: SO Doc Date · Proceed Date · Sales Location · Salesperson · Dealer) · Customer (Full name · Phone · Email · Customer type · Race · Gender · Birthday) · Delivery (Customer’s original requested delivery · ETA · Floor · Lift · Stair carry fee) · Emergency contact (Contact name · Relationship · Phone) · Address (Address line 1 · Address line 2 · City / state · Postcode · Building type · Billing address) · Items (Item · Qty · Unit price · Amount, Total row) · Payment. Fields the sheet does not have show "Not recorded"; no "Order type", no Remarks card. Proceed date (list column) = the sheet's Import Date (owner re-confirmed 11 Oct; COPY: the day the order was handed to Operations). Proceed Date = the Sales Portal field "Planned production start" (same fact, owner 11 Oct); only the name Proceed Date is shown; ETA is the sheet's ETA, never the customer requested date (README 7 Oct).
- Detail header row: 44 high (two-line number block) when it fits; on a narrow middle column the buttons wrap to a second line under the number and pill (never over the Tasks panel); the customer / supplier text shrinks with an ellipsis first.
- Tasks in detail mode (Carres Shell `det`): the Tasks panel is always open beside the detail; it also opens by itself whenever the Log form or a task card is open (on windows under 1280 px Summary closes to make room).
- ⋮ (order), right of Request amendment (32 px round, menu 230 wide): SALES ORDER Preview SO PDF · Print SO · Download PDF | COPY SO no. · customer phone | OTHER Withdraw amendment (only while one is pending). "Open in Sales Portal" is added only when Sales Portal gives a link per order; no menu item without a working function.
- Tabs: **Sales Order · Order Route · Timeline**.
- Sales Order tab (as v10 and the live system): Sales strip = one full-width card, all 5 fields always on ONE row in 5 equal columns (a long value wraps inside its own column, never pushes a field to a second row); 12 px under the hairline; label 12 grey, 6 px, value 13/500; then two cards side by side: card 1 = Customer + Emergency contact, card 2 = Delivery + Address (sections stacked inside the card, 18 px apart; label 150 px left, value right next to it); padding 14 × 16; Items table; Payment. Never one card per section.
- Amendment: page stays; pencil appears next to editable details; click → that detail becomes an input; sticky bar at the top of the tab: "Amendment · n changes · Why? ⌄ · proof · Cancel · Submit for approval". Cancel with changes asks "Discard?".
- After "Submit for approval": the requester gets no task (owner 11 Oct). Contact changes (Phone, Email, Address, Emergency contact) save at once with the toast "Saved · no approval needed" and a "Rev n" chip; other changes show a white 24-px chip "Waiting for Jess" (tooltip: changes · why), the Timeline logs it, ⋮ offers Withdraw amendment. The "Approve amendment" task appears only in the approver's Tasks (Jess (COO), Ops Rules §9).
- Revisions: "Rev n" in the header opens Revision history (newest first, before → after, who, why, View this version). Viewing an old version shows an amber read-only bar with "Back to current". Changed fields show "Rev n · AMD-xxxx" and the old value struck through.
- Order Route tab: one status card — requested date · days left · problem pill ("Goods · problem" / "3 problems · Goods, Delivery, Payment" / "On track") · view switch **Overview · Steps · Details**.
  - Overview: three cards side by side — Goods · Delivery · Payment (stack on narrow screens). Each card in layers: (1) icon · name · status pill (2) plain sentence (3) facts: Now at · Due · Document · Next (4) Goods card only: ITEMS — one block per item (by product, e.g. Mattress, Bed frame, Sofa): item × qty with a one-word status pill, then lines Supplier · PO · Status. Problem items amber. (Grouping by supplier/PO belongs in Purchasing.) (Received / Waiting · ETA / Late / Damaged · claim) and supplier · PO below; problem items amber (5) STEPS list of that area with mark, name, date; current step highlighted (6) owner avatar · "Waiting for …". Problem cards are amber and come first. A fourth card "Loan" appears only when a loan sofa is out (icon chair).
  - Steps: node map — SO → Goods / Delivery / Payment lanes → Goods in + Paid + Date agreed → Delivery Order → Delivered.
  - Details: Step · Who · Planned · Actual · Status · Document.
  - Every document number opens a preview drawer (SO opens the SO PDF).
- Timeline tab: every event (contacts, amendments, module events), filters All · Contacts · Amendments · by module. Each row: date + time (hover: full date and time) · who (staff avatar; grey gear for System; dashed "?" when not recorded) with a small status dot · what happened · details · source line ("Logged by Staff A · Call", "Sales Portal · auto") · 📎 n when files are attached · document number that opens it. Records are never edited or deleted.

### 3.3 Tasks (right panel; in Carres Shell, same on every page; follows Odoo Activities cards + SAP Fiori master-detail)
- Panel 320 with no card of its own: the task cards sit directly on the page ground (no card in card). Header row (no line): "Tasks" 15/500 ink (same as "Summary": one panel-title size) · "Wed, 7 Oct · 5 to do" 12 #6B7280 beside it (today's date, then how many are still open today; drops as tasks are done) · "Log call" button (30 high, white, 1px #E5E7EB, add_call icon 17 + word 12/500; the panel's one main action, follows Odoo "Schedule activity"; shows the selection pair while its form is open) · hide. Flat list, no module groups and no list tabs (the module tag says it; a second row would push the first card off the table's top line).
- Log form (in Carres Shell, opened by "Log call"; the module only supplies the choices): white card, 1px #CBD0D6, at the top of the list — SO/PO no. dropdown → WhatsApp / Call (two 36-px chips) → 1 · Who (chips) → 2 · What happened (dropdown; "Creates: [task] · [module]" line under it; extra fields when the result needs them) → 3 · Remark (required for Other) → 4 · Proof: Screenshot · Photo · Video (dashed 30-px buttons; amber hint to add a WhatsApp screenshot) → Cancel (white) · Save (charcoal). Saving creates the task the rule says and closes the form.
- Type hierarchy (follows Shopify Polaris: one heading per page carries the weight): page title / record no. on a detail 20/600 ink = the biggest and boldest text on the page; card and panel titles ("Sales", "Customer", "Summary", "Tasks") 15/500 ink; field values 13/500; table identifiers 13/600; labels 12/400 #6B7280; everything else 12–13 regular. Nothing else uses 600 at 15 px or above.
- Task card (white, 1px #E5E7EB, radius 8, 8 between cards, ≈ 94 px). Three rows; the only colour on a card is the amber Overdue chip. Zones separate by hairlines and white-on-near-white, never by a second tint (follows the live Carres ERP / Shopify):
  1. Tags row: module tag 11/500 #6B7280 on #F1F2F4 · "New" green tint only when real · at the right the due chip: calendar icon 12 + "Today 10:15 AM" / "Today" 11/500 #4B5563 on #F1F2F4; when late the same chip is amber (#7A5A00 on #FBF0D6, clock icon, "Overdue · Thu, 9 Oct").
  2. Title 13/500 ink · one plain line 12/400 #6B7280 under it. No check circle: done happens in the open card's form.
  3. Footer on a neutral band (#F5F6F8, hairline #F1F2F4 above, 5 10): 11, number 500 #6B7280 · who 400 #6B7280 · at the right real counts (paper-clip + proof files) then a 14-px chevron #C4C8CE (expand_more; expand_less when open).
  Cards sort Overdue → timed → untimed. No other icons, no avatars, no ⋯ menu.
- Split by day: today's cards first (the title row carries today's date and count), then one folded row per coming day ("THU, 8 OCT  2" 11 caps #6B7280 + chevron); open shows quiet cards (title 13/500 #4B5563, module tag, due, reference) with no form, since the work is not due yet. Follows Odoo Activities (Today / Planned).
- Click a card: it opens in place (border #CBD0D6; hairline under the card head; facts as 11/500 caps labels #6B7280 over 13/500 ink values in two columns (contrast by size, case, colour and weight together; owner 11 Oct); a record number in the facts (SO / PO no.) is the link that opens it (dotted underline, solid on hover), so no "Open …" button, then the form). The list does not jump elsewhere; only the opened card grows. One card open at a time.
  - Result form (calls, chasing, payment): Result dropdown → when not finished: next step and date chips Suggested · Tomorrow · In 2 days · Next week · Pick a date, amber warning if on/after the customer date, "No reply · attempt n of 3" (amber at 3: manager notified) → proof (grey optional · amber required · green attached) → Save (charcoal). Saving a not-finished result creates the follow-up task on the chosen day.
  - Steps form (Send PO and similar): PDF list (download each, ✓, Download all) → Copy message · Open WhatsApp / Email → charcoal "Mark n POs sent" (greyed with "Download the PDFs first." until downloaded).
- Below the list: "n done today" with Undo (15 min) / Correct; one folded row per coming day; footer link "All my tasks in Workspace".
- Log form: see above (Carres Shell).

### 3.4 Purchasing (reference build: `Purchasing v2.dc.html` on Carres Shell + Carres Table; `#batch` / `#po` / `#po=PO-…` in the address; data and rules in `purchasing-data.js`; `Purchasing.dc.html` is the old own-frame build, do not use)
- Summary follows §4.17 (information only). SO Batch Purchase: TODAY · [date] (Late to order · Morning batch · 10:15 AM · Afternoon batch · 4:00 PM · Missed cut-off · Too late for customer date · Partly ordered; one line each, amber value when a cut-off passed and pieces are still not ordered; footnote "Now [time] · pieces to order") · NEXT 5 DAYS (Mon–Sat, today first) · THIS MONTH ‹ Oct 26 › (Sales orders in · Ordered · Ordered before cut-off · Missed cut-off) · PIECES ORDERED · [MON] (5 categories). Purchase Orders: THIS MONTH (POs sent · Received · Received on time) · NEEDS ATTENTION (Late · Due in 7 days · Claims open) · OPEN PIECES.
- The view menu on SO Batch Purchase is "Group by": By supplier (default) · By sales order · By category · By order deadline. Selection bar: "n items selected · from n sales orders · n POs | Use stock · n (only when ticked items have free stock) · Create n POs (charcoal) | Clear"; Create swaps the table for the Review table (PO no. + supplier · Items · Supplier delivers to · Ready by · Draft; row click opens the PDF) and the bar reads "Review n POs | Back · Place n POs"; Place opens the "n POs created" dialog (§4.16).
- Purchase Orders: the list follows §0.6; the PO detail opens in the middle (Shell `det`): header as the SO detail (← · PO no. 20/600 with supplier · version · deliver-to in grey under it · status pill · PO PDF (white) · Send PO (charcoal) · PO Duty avatar), then cards: sentence + supplier date row (PO date · Production · Deadline · New ETA · Received · Result, 11-caps labels), Items grouped by SO (item · qty · status pill), Documents (missing ones in one grey "Not yet" line) and History side by side.
- Status words: Waiting (n days left) · Due today · Late (n days late · no ETA) · Late · new ETA (deadline kept, still late) · Received (On time · n days early / n days late) · Claim open. Judged only against the supplier deadline.
- SO Batch Purchase Summary (follows SAP Fiori overview / Odoo Purchase dashboard): two groups. TODAY · [date] (Now [time]; never changes with the month): Morning batch · cut-off 10:15 AM · Afternoon batch · cut-off 4:00 PM (sub line Due / Cut-off passed · not ordered / Done; amber when passed and not ordered) · Missed cut-off (amber) · Too late for customer date (amber) · Partly ordered; then To buy by supplier. THIS MONTH ‹ month › (only this group follows the month; back to past months, next disabled at the current month, "This month" button when viewing an old month): Sales orders in · Ordered · Ordered before cut-off (x of y) · Missed cut-off; then Pieces ordered by category. Every number filters the list (month numbers open the Ordered tab for that month); each shows a one-line meaning on hover. SO status words: Morning batch / Afternoon batch (grey, cut-off time) · Missed cut-off (amber, since when) · Partly ordered (amber) · Ordered (green + PO). Proceed date shows date + time.
- SO Batch Purchase (built for 500–1,000 SOs a month; follows NetSuite Order Items / Odoo Replenishment): shared list page (3.1) with Summary · tabs To buy · Ordered (current month, ‹ month › in Summary) · All · view menu (⊞ view_column icon, as Sales Order) **By supplier** (default) · **By sales order**, grey "· By supplier view" after the tabs · toolbar, selection bar (theme pill) and footer ("Rows 20 ▾ ‹ 1 / n ›") exactly as Sales Order 3.1.
  - Group rows are #F8F9FA bands, 8 px corners, 8 px apart, collapsed by default; ▸ or row click expands, header button expands/collapses the page. Items sit below on white inside the same outline, ticks under the group tick. No tint on ticked rows.
  - By supplier: one group row per supplier + category (e.g. "Ohana Furniture Sdn Bhd · Bedframe" and "Ohana Furniture Sdn Bhd · Sofa" are two rows), matching the PO split. Group row: Supplier · Category (+ delivery method and that category's production days) · Items (total pcs, sofa in sets; "n models" under it — the model list is in the expanded rows) · Sales orders · Oldest Proceed date · Supplier deadline if sent today · Status. Groups with missed cut-off come first. Inside, items sort by model, then size, then SO; no extra category header.
  - By category: one group per category (Mattress, Bedframe, Sofa): Category (+ pcs) · Items (models) · Sales orders · Suppliers · Status; items sorted by model and size, with Supplier and Sales order columns.
  - By sales order: one group per SO — Proceed date · SO no. + customer · Items (n to buy · n ordered · n from stock) · Customer’s original requested delivery · Supplier · Status (New today / To buy grey · Waiting n days / Part ordered amber · Ordered green). Items: ☐ · Item · Qty · Status · Supplier · Supplier delivers to · Supplier deadline.
  - Group tick = all its To-buy items; each To-buy item has its own tick. Supplier delivers to: dropdown while To buy (default TEST Warehouse A, grey "Changed from …"), text once ordered. Deadline after the customer original delivery date shows amber "After customer date".
  - Tick → selection bar "n items selected · from n sales orders · n POs | Review n POs | Clear ✕" → review replaces the table in place (one PO per supplier and warehouse), bar shows Back · Place n POs. Tasks stays open; no side panel. No how-to text on the page.

### 3.5 Reports
- Period picker + compare · 4–6 KPI cards with change · one or two charts · detail table (row opens the filtered list in its module). Tabs: Overview · Operations · Suppliers · Logistics · Team · Finance.

## 4. UI rules
### 4.0 Brand (Carres Brand Guidelines 01.2026)
- Personality: Warmly Professional · Calm & Clear. Not cold, not playful.
- Colours: orange #D64F20 · charcoal #1F2937 · cream #F3F4F6.
- Colour base (fixed, all themes; follows the live ERP / Shopify Polaris): page ground #F6F7F9 (fixed) · surfaces #FFFFFF · structural borders #E5E7EB · row rules #F0F1F3 · open/selected border #CBD0D6 · ink #1F2937 · secondary and faint text #6B7280 (one grey for all small text, ≥ 4.5:1 on white and on every ground; #9CA3AF is never used for text) · three layers (follows Polaris / Fiori / NetSuite): content surfaces #FFFFFF (lightest; all text sits here) · page ground #F6F7F9 lightest grey (fixed, every theme) · table header, item sub-header and group bands #F8F9FA (fixed) · hover = selection tint at 45% over white (carres-theme.js `hov`; Blue = #E7EFFE), clearly lighter than the selection on table rows, task cards, menu items and summary rows (all state-driven); buttons hover per §4.5 · neutral tint #F1F2F4. Theme changes the selection pair (default peach #FBE6DB / #A33A14), the hover tint derived from it and the ground tint; the page ground is fixed lightest grey #F6F7F9 for every theme. Palette (owner, 10 Oct night, from the Purposium reference; follows Polaris / Atlassian): text on colour (owner 10 Oct night: "how to mix"; follows Linear / Apple segmented controls / Polaris): white text only on Navy buttons; everywhere else dark or blue text on a light ground. Selected item on the grey ground (menu, tabs, view chips) = white #FFFFFF pill + blue text #2F55E0 500 (5.1:1 on tints, 6.0 on white) · hover on the grey ground = darker grey #E2E4E8 · ticked table rows = light blue #EEF4FF (true blue, not lavender), text stays ink · the selection bar = white with a 1px #E5E7EB line, blue count text, white buttons (follows Polaris bulk-actions bar) · table-row hover = grey #F2F3F5 · no saturated blue fills · main buttons Navy #1B1B39 (hover #2B2B55) · links, keyboard focus ring and checkboxes Purposium Blue #3965FA · ink #1F2937 · secondary text #6B7280 · status colours unchanged; the secondary palette (greens, yellows, oranges) is for charts only.5:1, so ground and selection are the same family; lines and greys stay neutral. Brand cream and orange live in the logo and selection, not in the UI ground.
- Logo files: assets/carres-wordmark.png, assets/carres-mark.png. Never recolour or distort.
- Themes in Settings → Appearance (small swatches): Brand Carres · Cool Slate, Blue, Teal, Violet · Warm Honey, Olive, Rose, Latte. A theme changes only the page ground and the selected colour. The choice is per person and applies on every page (Sales Order, Purchasing, Workspace, Settings); picking it in Settings or in the Sales Order look menu changes all pages.

### 4.1 Colour
| Use | Colour |
|---|---|
| Selected (menu, tab, chip, filter, row, switch on) | theme light bg + theme dark text |
| Main button (one per area) | charcoal #1F2937, white text |
| Normal button | white with grey border, or grey #F1F2F4 |
| Link / document no. | charcoal 600, dotted grey underline at rest (#6B7280, offset 3), solid charcoal underline on hover; no arrow, no icon; the whole number is the click target |
| Done | green #E7F6EC / #1E7A40 |
| Needs action / late / changed | amber #FBF0D6 / #7A5A00 |
| Doing now / normal | grey #F1F2F4 / charcoal |
| Blocked / Finance hold | charcoal / white |
| Not yet / not recorded | grey text #6B7280 |
| Red | logo only (errors are amber) |
- Status colours never change with the theme. Badges: bell = charcoal (needs action); team = white with green dot (info).

### 4.2 Pills
- Status pill = colour + a word, always: 12/500, padding 3 10, fully round. Info pills are grey #E5E7EB with #374151 text (darker than the row hover #F2F3F5, so a pill never disappears under the pointer).
- Choice chip (pick one or many: Who, WhatsApp / Call, next-date chips, filters): 28 high, 12/500, radius 8, 1px #D5D9DE on white, selected = the theme selection pair with its text colour as border; an icon in a chip is 16. One size everywhere, in the Shell forms and in every module.

### 4.3 Type
- Inter only (Cera Pro is for marketing). Tabular numbers in tables.
- 20 page title · 15 card title · 13–14 body/table · 12 labels. Never below 11: 11 only for caps labels, tags and badges; everything else 12 or more.

### 4.4 Icons
- Material Symbols Rounded, outline, weight 300, size 16–20. An icon sits next to a word, except well-known ones (bell, search, ×, ←, ⋮, PDF, attach).
- Same thing = same icon: Sales Order receipt_long · Purchasing shopping_cart · Warehouse warehouse · Goods inventory_2 · Payments payments · Delivery local_shipping · Service Case support_agent · Issue Tracker assignment_late · Customer person · Address location_on · Team group · Call call (also the "Log call" / "Log contact" button) · WhatsApp chat · Photo photo_camera · Video videocam · Proof attach_file · Timeline history · Edit edit.
- Warning / error icons only for real alerts, never as menu icons. No keyboard symbols (!, ✓, ✎) as icons.

### 4.5 Buttons and controls
- One main button per area; others in ⋮ More actions.
- Up to 6 choices: chips; 7+: dropdown. Numbered steps in forms.
- Actions, one rule for every card and page (owner 11 Oct, option 1c; follows NetSuite / Odoo): one charcoal main button per card or area; going to another record or page is never a button: the record number itself (SO / PO / GRN / DO no.) or the page name is a link with a dotted underline; button words are 1–2 words, no icon unless the icon alone is the button.
- Button shape, one rule (follows Polaris / Material 3): a button with a word (Log contact, Request amendment, PO PDF, Summary) is a box, radius 8, white with 1px #E5E7EB or charcoal; a button with only an icon (←, ⋮, close, hide panel, month arrows) is round, no border, no fill, and shows only the round grey shade on hover. Never an icon in a bordered box.
- Hover and pressed (every button, same in every module; follows Shopify Polaris): white or grey buttons → #EDEFF2; icon buttons with no fill (hide panel, close, ⋮, month arrows) → a round grey shade rgba(31,41,55,.10) on hover and .16 when pressed (round = the button's own circle, 28–36 px; Material 3 state layer is 8% / 12%, ours is one step stronger because the ground is light; Polaris and Fiori use the same see-through grey), so it shows on every theme ground; the icon keeps its colour (theme colour = selection only); charcoal buttons → #111827; rows, task cards, menu items and summary rows → the theme hover tint (§4.0); document links → solid underline; disabled → 45% opacity, no hover. Every clickable thing shows one of these; nothing is silent under the pointer.
- Open state (a button that opens a form, menu or panel: Log call, Log contact, ⋮, columns, Summary, Tasks; follows Polaris "pressed" and Linear): it keeps its own look and just stays in its pressed shade while open (white/grey button → #EDEFF2 fill, border stays #E5E7EB, text and icon stay ink; icon button → the round .16 shade). Never blue: blue marks a choice that is picked (tab, chip, menu item, ticked row), not a button that is open.
- Hit area ≥ 32 px desktop, 44 px mobile/partner portal.
- Capital letters, one rule: **names** start every word with a capital — module and page names in the menu, page titles, breadcrumbs, and tabs or links that name a module or a screen (Sales Orders, Purchase Orders, SO Batch Purchase, Order Route, Timeline). **Everything else** is sentence case, only the first word capital — column headers, buttons, form labels, status words, messages (SO no., Import date, Request amendment, Log contact, Not ready, Delivery in 5d). Abbreviations and real names keep their capitals everywhere (SO, PO, GRN, NETS, WhatsApp, Kuala Lumpur). Follows Polaris / Material.
- Keyboard focus (Tab key; follows Polaris / Fiori / Material): 2px Purposium Blue #3965FA outline, 2px outside the element, radius 8 (fields: no gap). Mouse clicks show no outline. One rule in Carres Shell, so every module has it; never the browser blue ring.
- Proof control: round icon button 30 px. Empty = white grey paperclip · required = amber · attached = light green with check; file name only in the tooltip.
- Popovers are fixed to the screen, never clipped, scroll inside if tall.
- Every date field (delivery date, birthday, follow-up …) uses a date picker with a calendar, never free text. Shown as "Thu, 15 Oct".

### 4.6 Avatars
- Every staff member has an initials avatar with one fixed colour (same everywhere). Name in the tooltip, not printed.
- Several people: stacked avatars in the order header ("Team"), PIC first; tooltip lists name and roles. Cover: on the area card the original owner is faded → arrow → cover person; tooltip "Staff D covering for Staff B (MC today) · since 9:00". Timeline records the take-over.

### 4.7 Words
- Plain short English; say what is happening and what to do next. Each sentence starts with a capital.
- Never "—" alone: write "Not recorded" or "Not yet".
- Never cut information (owner 11 Oct: "it cannot cut info"): no "…" on any value. Columns are wide enough for the longest real value (Payment / status 150, Area 160); long category lists use the sheet's own short forms MS · BF · SOF · M.P with full names on hover; the item name spans the first three columns; the detail header shows the customer name only (address is in the Address card), so it fits on the one 36-px row.
- A second line under a value shows the value only, never its label again (owner 11 Oct: "Mason", not "Salesperson Mason"). The column header already names it.
- Dates "Thu, 1 Oct" or "1 Oct". Times always 12-hour with AM / PM ("9:00 AM", "2:01 PM"), on screen and in every time input. Money "RM 1,200.00".
- Delivery date words, same in every module: Customer’s original requested delivery · Customer new delivery date · Customer confirmed delivery date · Delivered. Never "Planned", "Agreed date", "Requested" or "ETA" for the customer delivery date (ETA is only for supplier goods).

### 4.8 Spacing and shape
- 12 px between zones, 14–16 px inside cards. Corners small and calm: cards, rows, inputs and buttons radius 8; menu items 8; status pills and avatars stay round. Never 16 or pill-shaped buttons.

## 4.9 Settings · Tasks · Playbook
- Settings: rules, default values, deadlines, who can change, change history.
- Tasks: who does what, by when.
- Playbook: why, who to contact, what to say, actual result, proof needed, next step.
- Settings screens show the setting name; the ID (e.g. PAY-03) shows only in the details drawer. Source list: `uploads/Carres Settings List.md`.
- Setting status: Not set = grey "Not set", no edit. To check = amber "To check", read only. Confirmed = has a source; it does not mean built.

## 4.10 List column order (every table; follows SAP Fiori table guidelines, same as Odoo / Shopify lists)
1. Tick and ▸ · 2. Identifier in bold with one supporting line (SO no. + customer, PO no. + supplier, Supplier · Category + days) · 3. Description (items, models) · 4. Quantities (pcs, sets, RM), right-aligned with tabular numbers (header right-aligned too). A column whose second line is a document number (Sales orders: "18" / "SO-1368 +17") is left-aligned, because the reader scans the number text · 5. Dates, the most important first · 6. Status tag, the last data column · 7. Row actions (⋮) at the far right, if any.

## 4.11 Outstation count on group rows
Amber tag next to the group name: "Outstation [n]/[total SOs]"; hover lists the states. Every list row is at most two lines of text (name + one supporting line); alerts are tags, never an extra line.
## 4.12 Column widths (every list in every module; follows SAP Fiori column sizing, same as Odoo / Shopify)
Only one column stretches: the identifier column. Every other column has a fixed width by what it holds, so the same kind of column is the same width on every screen and the list never has a wide empty gap.

| Column holds | Width | Examples |
| --- | --- | --- |
| ▸ expand · tick box | 24px each | — |
| Identifier (the only stretching column) | at least 220px, takes all spare width | SO no., PO no., Supplier · Category, Category |
| Count / quantity | 96px, right-aligned | Items, Sales orders, Qty (48px inside item rows) |
| Date | 120px | Proceed date, PO date, Deadline, Customer date, Received, ETA, Pay by |
| Status tag | 150px | Status, Supply, Stock, Payment, GRN, Now at, Hold, Problems, Loading |
| Document No. | 130px | PO no. as a side column, Supplier DO, GRN No., DO No., Receipt No. |
| Money | 110px, right-aligned | Order value, Paid, Balance |
| Short text / name | 160px | Supplier (side column), Order type, Sales location, Salesperson, Delivery location, Logistics, Area, module columns |
| Address-length text | 170px | Supplier delivers to |

- Item rows under an expanded group use the same table: the item name takes the identifier width, the other cells sit under their own column.
- Narrow screen (< 1000px): identifier + one count + status only; the same widths apply.
- New columns must pick one of the rows above; no other widths.

## 4.13 Group rows vs item rows (follows SAP / Odoo)
Group rows (by supplier, by category) show totals and the most urgent date only ("Earliest order deadline", amber when late). Each sales order's own dates show on the expanded item rows in their own column (Proceed date, next to Sales order); By sales order view keeps Proceed date as a column.

## 4.14 Wide tables (every list in every module; follows Odoo list view)
- Rows never grow taller to fit columns: no stacking extra facts under the name, no hiding columns on narrow screens.
- All columns stay; the table scrolls sideways when the screen is narrow. The first column (identifier) stays fixed on the left while scrolling.
- The one column button (top right of the list) opens one menu: "Columns" (tick which columns to show) and "Show columns for" (module view); the identifier column cannot be hidden; the choice is saved per person and per list.
- Applies to Sales Orders, Purchasing, Warehouse, Payments, Delivery and every later module in the same way.

## 4.15 Dates (every module)
- Month switch shows "Oct 26" (two-digit year). Day + short month, no year: "7 Oct" (weekday in grey below in tables, "Wed, 7 Oct" in text). Add the full year only when the date is not in the current year ("7 Jan 2027").
- Table date cells: line 1 "7 Oct", line 2 grey weekday ("Wed"), extra info after it ("Wed · 9 days ago"). Sentences, sub-lines and hovers use "7 Oct".
- Column header menu (every column, same order; follows Airtable / Shopify): Sort A→Z · Sort Z→A (dates oldest/newest, numbers low/high) │ filter by value with counts, or a search box for free-text columns │ Freeze up to here (n columns) / Unfreeze · Hide column. Headers show no pin and no arrow at rest; the arrow appears on hover, ↑/↓ on a sorted column, the filter icon on a filtered one. Drag a header left or right to reorder (theme-colour drop line). Sort, order, hidden and freeze are remembered per page; hidden columns come back from the footer "n columns hidden · Show". Default freeze 1 data column. Frozen columns (expand arrow, tick, then the frozen data columns) have a solid background in every row kind and no edge line; columns scrolling under them are fully hidden, never seen through.
- An open group is one box: the group row and its items share one 1px frame #D6D2CC (8px corners, no heavy or coloured outline); the group row stays pinned under the header while scrolling.

- Outstation mark (follows Shopify / Odoo text badges): amber tag with the word, "Outstation 3/18" on the group row, "Outstation" on item rows; hover shows the states. No icon.
- A left-aligned column right after a right-aligned number column gets 14px extra space on the left (e.g. Items → Sales orders). Built into Carres Table.
- When the columns are wider than the card, the whole table (header and rows together) scrolls sideways as one; the header never stops short. A soft white fade on the right edge shows there is more; it disappears at the end.

- Small windows (popovers, dialogs; follows Shopify Polaris modal): line 1 = the action in bold ("Choose stock"), with ? and × on the right · line 2 = the item ("FORTE L1202F · Queen") · line 3 grey = the order and need ("CR1431 · needs 1 pc"). Stock rows always show the location on their own line (where to pick it up), even when every row is the same. A per-row note shows only when it differs from the rest; a note that applies to every row is written once above the list.

- Delivery column (follows SAP / Odoo Incoterm field): one header "Delivery" for every supplier. Content says the type: "Pickup · NETS ⌄" when we collect (Nice Future), "To Carres Klang Warehouse ⌄" when the supplier delivers.

## 4.16 Create and send POs (follows Odoo: create on SO Batch Purchase, send in the Send PO window)
"Create POs" opens the Review window (one row per PO, View PDF, "Place n POs"; Back closes without placing). Place closes it and shows "n POs created" (520px dialog, follows Odoo: confirming and sending are separate): one group per supplier (short name · n PDFs), each PDF opens to view only (no download, no send buttons here; downloading and sending are done in Tasks); footer Close (white) + Go to Tasks (charcoal). Sending is done only in Tasks: one task per supplier "Send PO to [short name] · n POs" (short names drop Sdn Bhd; Ohana Furniture = Ohana). Clicking the task opens it in place: the PDFs (download each, ✓ when downloaded, "Download all"), Copy message (one line per PO "• PO-2610-0002 V1 · Bedframe · 20 pcs"), Open WhatsApp / Open Email, then "Mark n POs sent" (charcoal; greyed with "Download the PDFs first" until every PDF is downloaded). Marked tasks leave Tasks. The PO detail "Send PO" opens the same task. Tasks, the PO, the SO and Workspace share one record, so a task done in any of them is done everywhere.

## 4.17 Summary panel (every module; information only; follows Odoo Sales dashboard / Shopify Analytics side cards)
The Summary tells how this module is doing. It never filters: filtering lives in the tabs, the column menus and the NEEDS-ACTION chips of the toolbar. Rows are plain text (30px min, label 13/400 #4B5563, value 13/500 #1F2937, amber when it needs attention; a 12px trend line under Orders and Value: "▲ 12% vs Sep" green / "▼" amber; a row with a Reports link opens Reports on click (pointer cursor, no arrow), it never filters), one white card per section, 8 px apart, no scrollbar, fits one screen. Sections in this order: THIS MONTH ‹ Oct 26 › (Orders · Value · Delivered n of n · Avg days to deliver; footnote only when there is no previous month ("First month in TEST data")) · NEEDS ATTENTION (counts across all open orders: Late supply · Payment due · Finance hold · Problems) · PIECES ORDERED · OCT (the five catalog categories with their count, zeros included; no "Others" row). Purchasing adds NEXT 5 DAYS (5 boxes, 44px) because ordering is per day. Caps labels 10/500 #6B7280; the month switch sits in the THIS MONTH label row.

## 4.18 Compact layout (every module)
- Item rows do not repeat document dates (follows Odoo / SAP): Proceed date shows on hover over the SO number ("Proceed 30 Sep · 9 days ago") and on the SO row in By sales order. PO no. column only in Ordered / All, not in To buy.
- Row heights: group row 48px (two lines max) · item row 44px (two lines: model / size in grey; SO / "Order by [date]" amber when late, plus state if outstation). To buy item columns: Item · Qty · SO · Stock · Deliver to (Pickup). The supplier ready date shows on the group row ("Ready by") and on hover over the SO. Column headers one line, short words ("Order by", "Ready by"). No view-name text in the toolbar; the toolbar stays on one line.
- Wide screen = three panels: menu · list · detail. Detail sits on the right inside the page; it never pops over the list. Clicking another row changes the detail.
- Settings page pattern (owner reference: Houzs Century ERP screenshots, 8 Oct): only the system side menu on the left (Settings ⚙ at the bottom selected) — no second menu card. Page title + one grey line. Settings sections are a tab row under the title. Content one column (max 1100 px): small grey group title, then one bordered list (radius 8) with one row per setting — left: name 13 px 500 + one grey description line; right: value or control (plain text until Edit). ID, source and history only appear when the row is clicked. No Edit button per group: values are editable in place for people with access; changes show "n unsaved changes" with Discard and one Save changes button at the top right (sticky). People without access see plain text. No right detail card. Every list-of-rules page (Settings, Workspace rules, Playbook) uses this same pattern. Two formats only, chosen by the kind of data, the same in every module: (1) rules and single values → the one-column row list above; (2) lists of records (staff, offices, logistics companies, suppliers, and any future list) → "categories left + table right": left a small category list with counts (All · groups · Needs attention), right a compact table, one record per row, one fact per column, missing facts "Not set" in grey. A section can have both: the table first, its rules below.
- Detail: value + one plain sentence at the top; facts in two columns; empty ("Not set") items joined in one grey line; history one line per change; ID and source at the bottom.
- The page does not scroll; list and detail scroll inside.
- Density = the Sales Order detail page (v8), every module incl. Settings: key–value rows 32 px min height, 4 px × 14 px padding, 13 px text, label grey 400, value ink 400 (bold only for selected item or document no.); card header 38 px; 12 px between cards; 14 px card padding; small buttons 28 px, 12 px text, weight 500. Read-only values are plain text, no boxes; input boxes appear only while editing. Inner menus are never bolder or bigger than the main side menu (14 px · 500).

## 5. Data rules
- Real orders show only what the source has; missing = "Not recorded". TEST data is labelled TEST.

## 6. Build order
1. Shell · 2. Sales Order Outright list · 3. Sales Order detail · 4. Workspace · 5. Other modules, one at a time, reusing the shell.
