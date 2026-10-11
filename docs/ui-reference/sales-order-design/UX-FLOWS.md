> Supplied with `Sales Order_11 Oct.zip`. The example customer and phone are TEST values. Words follow COPY-STANDARD and business rules follow the module MASTERs; where a flow below differs, it is PROPOSAL / NOT LAW (`docs/01-design-tokens.md` §10).

# UX flows — Sales Order Outright (and every module on the template)

Each flow is written as **steps → expected result**. Every line is a test. Build it in the code, then automate it (Playwright). The reference behaviour is the HTML in this folder: open `Sales Order Outright v12.dc.html` and click through it; the code must behave the same. Data: `sales-test.js` (examples use CR0284, customer TEST customer B, phone 012-0000002, ETA Mon 10 Aug, balance RM 1,000).

Screenshots of each state: `screens/` (file name given after each flow).

---

## A. List

**A1 Open the list** · `SO-01`
1. Open `/sales-orders/outright`.
→ Tab **Open** is selected (white on grey track, theme text, 500). Default view "Sales Order" columns: Proceed date · SO no. · Items · Sales location · Delivery location · ETA. 17 rows. Footer: "17 orders · Qty: Mattress 30 · Pillow 20 · Bedframe 20 · Mattress protector 7 · Sofa 3 sets · Service 3" (full names, never cut).

**A2 Switch tabs**
1. Click **Delivered**. → 3 rows (Logistic remark "Completed"). Filters cleared.
2. Click **All**. → 20 rows.

**A3 Expand a row** · `SO-02`
1. Click ▸ on CR0284.
→ A framed box: parent row + header "Item · Qty · Supplier" + one 44-px row per item. Item = model (13 ink) with spec under it (12 grey), e.g. "Breeze FirmCare B1201F / Queen". Pillow and protector show "Warehouse stock" in grey. Nothing is cut; no row is taller than 44 unless the name wraps by design.
2. Click the ⇕ icon in the header. → All rows expand / collapse.

**A4 Open a record**
1. Click anywhere on the CR0284 row (not the tick, not ▸).
→ Detail opens in the middle, address bar `#so=CR0284`, Summary and toolbar hide, Tasks stays.
2. Selecting text in a row does not open it. Ctrl/⌘-click opens a new tab.
3. Back (←) returns to the list at the same scroll position.

**A5 Column views** · `SO-04`, `SO-05`
1. Click the columns icon. → Menu "SHOW COLUMNS FOR": Overview · Sales Order ✓ · Purchasing · Warehouse · Payment · Delivery · Service.
2. Pick Overview. → 8 columns; when the middle is too narrow the table scrolls sideways with SO no. frozen. Nothing cut.

**A6 Filter by a column**
1. Click a column header that has options (e.g. Sales location). → Menu with values + counts.
2. Pick "PJ Showroom". → Chip "Sales location: PJ Showroom ×" appears in the toolbar; rows filtered. Click × → filter removed.

**A7 Tick rows** · `SO-06`
1. Tick two rows. → Toolbar becomes the selection bar: "☑ 2 selected · 8 pcs | Export · Print SO | Clear". Only ☑ and Clear are blue.
2. Clear → bar goes away, ticks cleared.

**A8 List ⋮** · `SO-03`
1. Click ⋮. → EXPORT Download Excel (.xlsx) · Download PDF | VIEW Save as my view | DATA Sync from Sales Portal now (hint "Last sync …" on a second line).
2. Click outside or ⋮ again → menu closes. While open, ⋮ shows its pressed grey (never blue).

**A9 Search (top bar)**
1. Type "CR02". → Dropdown grouped SALES ORDERS / PURCHASE ORDERS / SUPPLIERS, max 6 each.
2. Enter → opens the first result. Esc → clears. No match → "No match for “…”".

## B. Order detail — header and menu

**B1 Header** · `SO-10`
→ ← (round, no border) · **CR0284** 20/600 with "TEST customer B" under it · status pill **Late** (ETA passed, not delivered) · grey avatar (tooltip "SO PIC not recorded") …… Log contact · **Request amendment** (charcoal) · ⋮. The only 20/600 text on the page is the SO no.

**B2 Detail ⋮** · `SO-11`
1. Click ⋮. → Menu is **visible** above the content (never clipped): SALES ORDER Preview SO PDF · Print SO · Download PDF | COPY SO no. · Customer phone. (OTHER Withdraw amendment only while one is pending.)
2. Copy SO no. → clipboard "CR0284", toast "Copied CR0284" (bottom centre, ~2.2 s).
3. Copy customer phone with no phone → toast "Phone not recorded".
4. Preview SO PDF → `SO-14`: A4 preview dialog with Download · Print · ✕.
5. Print SO / Download PDF → browser print dialog with **only the SO page** (not the app). "Save as PDF" in that dialog = download.

**B3 Log contact**
1. Click Log contact. → Tasks panel shows the Log form at the top with SO no. preselected (CR0284). Button stays grey while open.

## C. Sales Order tab

**C1 Layout** · `SO-10`
→ Sales strip: 5 fields always on one row (SO Doc Date · Proceed Date · Sales Location · Salesperson · Dealer); long values wrap inside their own column. Two cards: Customer + Emergency contact | Delivery + Address. Items and payment card: # · Item · Qty · Unit price · Amount; Total · Received · **Balance due RM 1,000** (amber row because > 0); Payment: Method · Bank reference · Bank slip. Missing = "Not recorded" grey.

## D. Amendment

**D1 Start** · `SO-12`
1. Click Request amendment. → Sales Order tab opens; a sticky bar: "Amendment · 0 changes · Click the pencil next to a detail to change it. · Why? Choose ⌄ · Add proof · Cancel · Submit for approval (disabled at 0 changes)". A pencil appears next to each editable field. **No pencil** on: Sales strip, Items, Payment, ETA, Stair carry fee.

**D2 Edit a field**
1. Click the pencil by Phone. → Field becomes an input with the current value, focused. Changing it updates "1 change"; the input border turns theme colour.

**D3 Reasons and proof** · `SO-13`
1. Click Why? → chips FROM CUSTOMER (Changed phone, Moved / new address, Changed email, Changed delivery date, Floor or lift changed, Other customer request) · OUR SIDE (Key-in error (Sales), Salesperson asked, Delivery team found wrong info). Many can be picked; button reads "Why: n chosen".
2. Submit with changes but no reason → reasons open, message "Choose why."
3. Add proof → file picker (image / PDF) → button reads "Proof added".

**D4 Submit — contact change (no approval)**
1. Change Phone to 012-0000000, reason Changed phone, Submit.
→ Saved at once. Toast "Saved · no approval needed". Phone shows 012-0000000. Header gets **Rev 1** chip. Timeline: "Updated Phone · Changed phone · no approval needed". **No task** is created for the requester.
Fields in this group: Customer Phone, Customer Email, every Address field, every Emergency contact field.

**D5 Submit — other change (Jess approves)** · `SO-15`
1. Change Floor to 3, reason Floor or lift changed, Submit.
→ Toast "Sent to Jess (COO) for approval". Header chip **"Waiting for Jess"** (tooltip: changes · why). Timeline entry. ⋮ now shows OTHER → Withdraw amendment. An "Approve amendment" task appears **only in Jess's Tasks** (approver), due within 1 working day. Stair carry fee is recalculated from Floor (floors above 2F × items × RM 50, max 3F) when approved.
2. Mixed submit (Phone + Floor) → Phone saved now, Floor sent to Jess; toast "Saved 1 · 1 sent to Jess (COO)".

**D6 Cancel / withdraw**
1. Cancel with 0 changes → bar closes.
2. Cancel with changes → inline "Discard 1 change? Keep editing · Discard".
3. ⋮ → Withdraw amendment → chip gone, Timeline "Amendment withdrawn", toast.

## E. Order Route tab

**E1 Overview** · `SO-20`
→ Card "Delivery date" with switch Overview · Steps · Details (segmented). Facts: Customer’s original requested delivery · Customer confirmed delivery date · Days to ETA · Now at. Three cards Goods · Delivery · Payment; a card needing action has an amber frame (never amber fill).

**E2 Steps** · `SO-21`
→ Map: Sales order → one box per supplier side by side (Nice Future with its own PO, Ohana with its own PO, Warehouse stock) with items (model / spec two lines) → Goods in warehouse → Logistics → Delivery slot → Delivered. Current step 1-px blue frame. Fits without sideways scroll.

**E3 Details** · `SO-22`
→ Table Step · Who · Planned · Actual · Status · Document; header 40, rows 44; fits without scroll. Document numbers are links (dotted underline) that open a preview.

## F. Timeline · `SO-30`
→ Events newest first; filters All · Contacts · Amendments · System (chips). Each row: date + time · who · what.

## G. Tasks panel (every page)
1. Click a task card. → It opens in place: facts as 11/500 caps labels over 13/500 values. **The SO / PO no. in the facts is a link**: clicking CR0284 opens the order. No "Open sales order" button. One charcoal button "Mark done".
2. Mark done → card leaves; "n done today" with Undo (15 min).
3. Log call → form at the top; button pressed grey while open, never blue.

## H. Settings → Appearance · `SH-01`
1. Click ⚙ (bottom of the menu). → Top bar "Settings / Appearance"; tabs Appearance · Staff and duties (segmented); THEME card: Cool (Cool Slate · **Blue Default ✓** · Teal · Violet) · Brand (Carres) · Warm (Warm Honey · Olive · Rose · Latte).
2. Pick a theme → only the selection colour changes everywhere (tabs, ticked rows, links, focus), saved per person (localStorage `carres.theme`, default `blue`). Page ground, charcoal buttons, greys, amber and green never change.

## I. Purchasing (same template) · `PO-01..03`
Same rules: list on Carres Table, PO detail header with PO no. 20/600 + supplier line, ⋮ visible, item rows 44 with model / spec, task cards link the PO no.

---

## Rules that apply to every flow
- Hover: white/grey buttons #EDEFF2; icon buttons round grey shade .10 (.16 pressed); rows / menu items theme hover tint; links dotted → solid.
- Disabled: 45 % opacity, no hover, no click.
- A menu, dialog or toast must be visible (never clipped by a parent).
- Nothing is cut with "…"; text wraps inside its own cell/column.
- Run `carres-check.js` (ported to tests) on every state above at 1025, 1164 and 1440 px: all PASS.
