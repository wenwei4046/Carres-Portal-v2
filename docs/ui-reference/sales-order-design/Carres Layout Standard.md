# Carres Operations — Layout Standard
Last updated: 8 Oct 2026 (4.9 added). Current rules only; old versions are removed. Reference build: `Sales Order Outright Layout v8.dc.html`. Check every new screen against section 4 before showing it.

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
- Header: page title only. Right: search (SO / PO / customer / phone, ⌘K) · team (avatar icon + online count) · bell.
- Summary panel: ‹ month ›, numbers that filter the table when clicked, pieces by category.
- Toolbar: view tabs (Open · Delivered · All) · search this list · columns · ⋮.
- ⋮ More actions (list): EXPORT Download Excel · Download PDF | VIEW Save as my view | DATA Sync from Sales Portal now (last sync time).
- Ticking rows replaces the toolbar with the selection bar: "☑ n selected · n pcs · Total RM x | Export · Print SO | Clear ✕".
- Table: header fixed, row lines kept, every cell can have two lines. Click anywhere on a row to open; checkbox and in-row buttons do not open; selecting text does not open; Ctrl/⌘-click opens a new tab; Back returns to the same scroll position.
- Summary line at the bottom: "n orders · Qty: Mattress 7 · Bed frame 4 …".

### 3.2 Order detail
- Header: ← · SO no. · customer · status pill · PIC avatar · Rev n (if amended) …… Log contact · **Request amendment** · ⋮ | Tasks (when closed).
- ⋮ (order): SALES ORDER Preview SO PDF · Print SO · Download PDF | COPY SO No. · customer phone | OTHER Open in Sales Portal · Withdraw amendment (if pending).
- Tabs: **Sales Order · Order Route · Timeline**.
- Sales Order tab: Sales strip (SO Doc Date · Proceed Date · Dealer · Sales Location · Salesperson); cards Customer + Emergency contact | Delivery + Address (label left, value right next to it); Items table; Payment.
- Amendment: page stays; pencil appears next to editable details; click → that detail becomes an input; sticky bar at the top of the tab: "Amendment · n changes · Why? ⌄ · proof · Cancel · Submit for approval". Cancel with changes asks "Discard?".
- Revisions: "Rev n" in the header opens Revision history (newest first, before → after, who, why, View this version). Viewing an old version shows an amber read-only bar with "Back to current". Changed fields show "Rev n · AMD-xxxx" and the old value struck through.
- Order Route tab: one status card — requested date · days left · problem pill ("Goods · problem" / "3 problems · Goods, Delivery, Payment" / "On track") · view switch **Overview · Steps · Details**.
  - Overview: three cards side by side — Goods · Delivery · Payment (stack on narrow screens). Each card in layers: (1) icon · name · status pill (2) plain sentence (3) facts: Now at · Due · Document · Next (4) Goods card only: ITEMS — one block per item (by product, e.g. Mattress, Bed frame, Sofa): item × qty with a one-word status pill, then lines Supplier · PO · Status. Problem items amber. (Grouping by supplier/PO belongs in Purchasing.) (Received / Waiting · ETA / Late / Damaged · claim) and supplier · PO below; problem items amber (5) STEPS list of that area with mark, name, date; current step highlighted (6) owner avatar · "Waiting for …". Problem cards are amber and come first. A fourth card "Loan" appears only when a loan sofa is out (icon chair).
  - Steps: node map — SO → Goods / Delivery / Payment lanes → Goods in + Paid + Date agreed → Delivery Order → Delivered.
  - Details: Step · Who · Planned · Actual · Status · Document.
  - Every document number opens a preview drawer (SO opens the SO PDF).
- Timeline tab: every event (contacts, amendments, module events), filters All · Contacts · Amendments · by module. Each row: date + time (hover: full date and time) · who (staff avatar; grey gear for System; dashed "?" when not recorded) with a small status dot · what happened · details · source line ("Logged by Staff A · Call", "Sales Portal · auto") · 📎 n when files are attached · document number that opens it. Records are never edited or deleted.

### 3.3 Tasks (right panel)
- Title "Tasks", date, n left; Log button; module filter icons: every work module always shown, in menu order (Sales Orders · Purchasing · Warehouse · Payments · Delivery · Service Case · Issue Tracker). Modules with jobs today show the count; modules with none are pale grey with no number. Tooltip: "Purchasing · 2" / "Warehouse · none today".
- Task row: whole row opens the result form; ▾ / ▴ shows open/closed; the open row has the selected background.
- Log form: WhatsApp / Call → 1 Who → 2 What happened → details → 3 Remark → 4 Proof → Save.

### 3.4 Reports
- Period picker + compare · 4–6 KPI cards with change · one or two charts · detail table (row opens the filtered list in its module). Tabs: Overview · Operations · Suppliers · Logistics · Team · Finance.

## 4. UI rules
### 4.0 Brand (Carres Brand Guidelines 01.2026)
- Personality: Warmly Professional · Calm & Clear. Not cold, not playful.
- Colours: orange #D64F20 · charcoal #221F20 · cream #F5F3F0.
- Default theme Carres: page cream, white cards with 1 px border, ink #221F20, selected = light orange #FBE6DB + dark orange text #A33A14.
- Logo files: assets/carres-wordmark.png, assets/carres-mark.png. Never recolour or distort.
- Themes in Settings → Appearance (small swatches): Brand Carres · Cool Slate, Blue, Teal, Violet · Warm Honey, Olive, Rose, Latte. A theme changes only the page ground and the selected colour.

### 4.1 Colour
| Use | Colour |
|---|---|
| Selected (menu, tab, chip, filter, row, switch on) | theme light bg + theme dark text |
| Main button (one per area) | charcoal #221F20, white text |
| Normal button | white with grey border, or grey #F0F1F3 |
| Link / document no. | charcoal, bold |
| Done | green #E7F6EC / #1E7A40 |
| Needs action / late / changed | amber #FBF0D6 / #7A5A00 |
| Doing now / normal | grey #F0F1F3 / charcoal |
| Blocked / Finance hold | charcoal / white |
| Not yet / not recorded | grey text #8A9099 |
| Red | logo only (errors are amber) |
- Status colours never change with the theme. Badges: bell = charcoal (needs action); team = white with green dot (info).

### 4.2 Pills
- Status pill = colour + a word, always. Info pills are grey.

### 4.3 Type
- Inter only (Cera Pro is for marketing). Tabular numbers in tables.
- 20 page title · 15 card title · 13–14 body/table · 12 labels. Never below 12 (11 for badges).

### 4.4 Icons
- Material Symbols Rounded, outline, weight 300, size 16–20. An icon sits next to a word, except well-known ones (bell, search, ×, ←, ⋮, PDF, attach).
- Same thing = same icon: Sales Order receipt_long · Purchasing shopping_cart · Warehouse warehouse · Goods inventory_2 · Payments payments · Delivery local_shipping · Service Case support_agent · Issue Tracker assignment_late · Customer person · Address location_on · Team group · Call call · WhatsApp chat · Photo photo_camera · Video videocam · Proof attach_file · Timeline history · Edit edit.
- Warning / error icons only for real alerts, never as menu icons. No keyboard symbols (!, ✓, ✎) as icons.

### 4.5 Buttons and controls
- One main button per area; others in ⋮ More actions.
- Up to 6 choices: chips; 7+: dropdown. Numbered steps in forms.
- Hit area ≥ 32 px desktop, 44 px mobile/partner portal.
- Proof control: round icon button 30 px. Empty = white grey paperclip · required = amber · attached = light green with check; file name only in the tooltip.
- Popovers are fixed to the screen, never clipped, scroll inside if tall.
- Every date field (delivery date, birthday, follow-up …) uses a date picker with a calendar, never free text. Shown as "Thu, 15 Oct".

### 4.6 Avatars
- Every staff member has an initials avatar with one fixed colour (same everywhere). Name in the tooltip, not printed.
- Several people: stacked avatars in the order header ("Team"), PIC first; tooltip lists name and roles. Cover: on the area card the original owner is faded → arrow → cover person; tooltip "Staff D covering for Staff B (MC today) · since 9:00". Timeline records the take-over.

### 4.7 Words
- Plain short English; say what is happening and what to do next. Each sentence starts with a capital.
- Never "—" alone: write "Not recorded" or "Not yet".
- Dates "Thu, 1 Oct" or "1 Oct". Times always 12-hour with AM / PM ("9:00 AM", "2:01 PM"), on screen and in every time input. Money "RM 1,200.00".
- Delivery date words, same in every module: Customer original delivery date · Customer new delivery date · Customer confirmed delivery date · Delivered. Never "Planned", "Agreed date", "Requested" or "ETA" for the customer delivery date (ETA is only for supplier goods).

### 4.8 Spacing and shape
- 12 px between zones, 14–16 px inside cards. Corners small and calm: cards, rows, inputs and buttons radius 8; menu items 8; status pills and avatars stay round. Never 16 or pill-shaped buttons.

## 4.9 Settings · Tasks · Playbook
- Settings: rules, default values, deadlines, who can change, change history.
- Tasks: who does what, by when.
- Playbook: why, who to contact, what to say, actual result, proof needed, next step.
- Settings screens show the setting name; the ID (e.g. PAY-03) shows only in the details drawer. Source list: `uploads/Carres Settings List.md`.
- Setting status: Not set = grey "Not set", no edit. To check = amber "To check", read only. Confirmed = has a source; it does not mean built.

## 4.10 Compact layout (every module)
- Wide screen = three panels: menu · list · detail. Detail sits on the right inside the page; it never pops over the list. Clicking another row changes the detail.
- Settings page pattern (owner reference: Houzs Century ERP screenshots, 8 Oct): only the system side menu on the left (Settings ⚙ at the bottom selected) — no second menu card. Page title + one grey line. Settings sections are a tab row under the title. Content one column (max 1100 px): small grey group title, then one bordered list (radius 8) with one row per setting — left: name 13 px 500 + one grey description line; right: value or control (plain text until Edit). ID, source and history only appear when the row is clicked. No Edit button per group: values are editable in place for people with access; changes show "n unsaved changes" with Discard and one Save changes button at the top right (sticky). People without access see plain text. No right detail card. Every list-of-rules page (Settings, Workspace rules, Playbook) uses this same pattern. Two formats only, chosen by the kind of data, the same in every module: (1) rules and single values → the one-column row list above; (2) lists of records (staff, offices, logistics companies, suppliers, and any future list) → "categories left + table right": left a small category list with counts (All · groups · Needs attention), right a compact table, one record per row, one fact per column, missing facts "Not set" in grey. A section can have both: the table first, its rules below.
- Detail: value + one plain sentence at the top; facts in two columns; empty ("Not set") items joined in one grey line; history one line per change; ID and source at the bottom.
- The page does not scroll; list and detail scroll inside.
- Density = the Sales Order detail page (v8), every module incl. Settings: key–value rows 32 px min height, 4 px × 14 px padding, 13 px text, label grey 400, value ink 400 (bold only for selected item or document no.); card header 38 px; 12 px between cards; 14 px card padding; small buttons 28 px, 12 px text, weight 500. Read-only values are plain text, no boxes; input boxes appear only while editing. Inner menus are never bolder or bigger than the main side menu (14 px · 500).

## 5. Data rules
- Real orders show only what the source has; missing = "Not recorded". TEST data is labelled TEST.

## 6. Build order
1. Shell · 2. Sales Order Outright list · 3. Sales Order detail · 4. Workspace · 5. Other modules, one at a time, reusing the shell.
