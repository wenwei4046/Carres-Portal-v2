# Compact module card — contract

The one card contract for the right Working Panel (owner rules 2026-10-03 / 10-04 / 10-05): one shared
card structure and style for every module, with the owner's Stock and Customer corrections. **The outer
identity belongs to the host module with the shared structure and style; an embedded SO uses the same
component in embedded presentation** (owner 2026-10-05). The law that every module uses it, the host-module identity rule, standalone versus embedded Sales Order and
the adoption status per module are in UI MASTER §4.3. **Numbers** live in
[01 §7.6](../01-design-tokens.md#76-compact-module-card--compactmodulecard); **words** in COPY-STANDARD
"Compact module card words" (`CARD_WORDS`). This file holds the card's rules once.

**Use the kit component, never these files:** `apps/web/src/components/kit/CompactModuleCard.tsx`
inside the kit `Drawer variant="compact-card"` (live on `/ui#compact-card` with Info and Delivery,
including the long-address state). The reference page `module-card-reference.html` (SHA-256
`98c1ae5396a53143…`, published at `/ui-kit/module-card`; the retired `/ui-kit/delivery-card` and
`/ui-kit/delivery-card.html` answer with a 301 that keeps the query string) is the proof target.
`node scripts/compact-card-states.mjs <dev url>` drives both through 25 states at five widths,
compares geometry, text and styles, and must report **no unexplained difference**.
`module-card-measurements.json` holds the historical 25-state × 5-width parity heights — evidence of
that run, never fixed heights for the current card.

Read Orders MASTER for the full-page Items/Payment rules and Delivery MASTER for Customer, Logistics
and DO business rules before reuse. Never copy HTML/CSS, substitute sample facts, or assume another
module has customer or SO fields.

## Rules

**Owner-confirmed SO template — 2026-10-05:** shared dark Header → address → sales facts → module
tabs → module summary. In Info the address is visible by default: the full wrapping address left,
access facts right (200px column, 12px gap), grouped as `Condo · Floor 1` and
`No lift · Stair carry: 4 items`; omit stair carry when empty, not recorded or zero; at card widths
≤440px the access facts move below. Never truncate the address or reserve a fixed height. Sales facts
in this exact order: **SO Doc Date / Proceed date / Sales Location / Salesperson**, label above value,
four columns above 440px and two at ≤440px. SO Doc Date reads `placed_at`; Proceed date reads
`proceed_date`, not the actual hand-off `proceeded_at` (the word conflict is a REAL GAP in UI MASTER
§7.2). Missing Proceed date is `Not recorded`. Sales Location uses the outlet name with dealer
fallback; Dealer is not a duplicate display field. Info summary is **Total payable / Paid to date /
Balance due**, matching the saved PDF. No SO Info details panel, Email, Dealer, repeated
Stock/Payment/Delivery status rows or Related documents: item-level PO/stock and module-owned
documents stay in their owning surfaces. In the standalone card, Items, Communication and Timeline
start closed.

- **Host-owned identity:** every module card uses the same Header structure and style; the HOST module
  fills it with its own identity (a Sales Order shows its customer, a Purchase Order its supplier and PO
  number). A Sales Order shown inside another module is the same component in embedded presentation
  (below), never a second Header. The standalone SO Header, as built:
- **Standalone SO Header:** name · order · phone; a ▾/▴ at the lower right of the customer cell opens
  the sales facts (no `Order info` words); the address with its own toggle (▴ while open); the target
  date; Open (↗, only when the page passes `onOpen`) and Close (×). The phone glyph and number form one wrapping unit. The Header grows
  with a long name; nothing overlaps.
- **Shared Header colour — owner approved 2026-10-04:** existing Radix slate-12 background, white
  primary text and day count, slate-4 contact text, slate-11 dividers/hover; the day count uses the
  label token (11/500/14) with no pale badge fill; focus is visibly white inside the dark Header. Only
  the identity Header is dark; address, tabs, summary and body stay light. Every consumer inherits it;
  no per-module copy. This does not decide the remaining card palette, font or radius.
- **SO Header composition — owner approved 2026-10-05:** no separate area cell (the full address stays
  below the Header). The requested-date label is two small lines, with date and day count together
  beneath.
- **Customer’s original requested date and day count — owner correction 2026-10-05 (DEPLOYED #1919 /
  #1920, `9294659a2`; production verification pending).** Label: `Customer’s original` /
  `requested delivery`. `{n}d` = **calendar days from Proceed date (`proceed_date`) to the customer’s
  original requested delivery date** (original minus Proceed, calendar dates in Asia/Kuala_Lumpur).
  It is not days remaining from today, order age, days since SO Doc Date, actual delivery duration, a
  confirmed date or a Logistics ETA. Example: Proceed `30 Sep 2026`, original `31 Oct 2026` →
  `31d · Sat, 31 Oct`; the number never changes day by day; same date → `0d`; either date missing →
  omit the count; an original before Proceed needs a data check and omits the count. Tooltip:
  `Calendar days from Proceed date to customer’s original requested date`. The SO table, card,
  requested-delivery filter and export read revision 1’s immutable `snapshot.header.delivery_date`
  (respecting `delivery_date_tbd`), never the mutable `delivery_date`; a missing revision 1 reads
  `Not recorded` in the Header and leaves the required table cell blank; a failed list read stays a
  failed list. The retired today-based countdown is never reused. Delivery's Customer confirmation and
  Logistics ETA stay separate facts. Acceptance includes changing "today": the count must not move.
- **Standalone: Info opens sales facts and address; every other module starts with both closed.**
  Switching module applies that module's default and closes items and editors. Embedded: both always
  open (below).
- **Summary cells:** title row, value, optional status line — top aligned on common baselines, left
  aligned, ▾ at the right of the title row for a fact with an editor; values take the fewest lines,
  four at most. Each module shows only its own facts: Info `Total payable · Paid to date · Balance due`;
  Delivery `Stock · Logistics · Customer · DO`. Nothing in a module repeats the Header, a date, the
  sales facts or a completion note.
- **Stock:** value `{ready}/{goods}`, status `Ready` on its own line; only goods count. Service lines
  are not goods: the item list reads `Service`, never a dash.
- **Logistics:** empty value `Not assigned`.
- **Customer** (Delivery MASTER, "Customer summary cell"): before agreement `Date not confirmed`; after
  agreement the date plus only the agreed precision on one line — `31 Oct`, `31 Oct · Afternoon`,
  `31 Oct · 3:00 PM` — and status `Date confirmed`. No placeholder time, no empty row. It is the
  customer-agreed arrangement, never the Logistics ETA. Only the final customer leg is titled
  `Customer`; a warehouse leg names its actual receiver.
- **Editors:** one open at a time, inside the card; a successful save folds it and updates the summary
  at once; reopening shows what was saved; Cancel leaves the summary unchanged; a refused or failed
  save keeps the input and says why; `Cancel` then `Save` at the right. No saved-note or recorded-at
  stamp — the Timeline records who recorded it. Logistics contacts the customer; Operation may record
  Logistics' reply, and the Timeline names Operation only as the recorder. Embedded kit controls keep
  their shared field skin: the card's universal border and button resets exclude `data-kit` (visible
  dropdown/date borders production verified). Compact Customer fields use two columns above 400px card
  width and one at 400px or below; the compact condo input uses its two natural rows and omits the long
  hint; Logistics crew fields share a row with ETA, condo and reply proof retained.
- **DO:** read-only conditions, one per line; no manual tick, no repeated explanation; cannot issue or
  release a document.
- **Items contains goods and services only.**
- **Standalone: Items, Communication and Timeline start closed** (embedded: items show at once, no
  Communication or Timeline). Times show without a zone suffix
  (`30 Sep · 4:08 PM`); the full instant stays in the element; a date-only source shows the date and
  `Time unavailable`. Timeline uses recorded events and avatar identity without repeating names; its
  loading/error state stays inside its section.
- **Communication:** channel select in its header, `To`, `Subject` for Email only, Message ⋯ for Find /
  Save as / Manage templates (Escape or a press outside closes it), a 320px naming dialog, one
  attachment entry (preview only), `Copy message` and `Open WhatsApp` / `Open email`. Links open drafts
  only; copying or opening a channel never records sending or contact.
- **The saved document — owner approved 2026-10-04:** the source-owned SO number lazily opens the
  current saved-version document through the shared `PdfPreviewHeader`: `Sales order PDF · {actual SO
  number}` at left, the saved-document `Download` and `Close PDF` × at right; zoom on the next row,
  then the actual PDF. Identity and Close stay available during loading/error; Download is disabled
  until its saved Blob exists; no separate Close row. Close PDF returns to Info and focuses the SO
  number; the dark Header `Close order` × closes the whole Register Drawer and returns to its opener.
  Neither control saves business facts or changes current or historical issued documents.

## Embedded presentation — owner confirmed 2026-10-05 · DEPLOYED (PR #1926, `dc631e1a`; PO full page `Sales Order` view; production SHA verified 2026-10-05); owner acceptance owed

`<CompactModuleCard presentation="embedded" …>` draws one record inside a host module's tab. The host owns
the outer Header, its tabs and every business action; the host's own tabs and which one opens first follow
UI MASTER's shared module page flow (§0.2, §4.3.1), not this component. A host shows a `Sales Order` tab
only when at least one Sales Order is linked; an empty list draws nothing. Hosts: the Purchase Order full
page (`Sales Order` view, deployed, production SHA verified) and the Purchase Order working panel and round panel (approved; their
work-content layouts are localhost-first in the Purchasing lane). Standalone and embedded rules are
separate; nothing below changes a standalone card. Numbers for both presentations: 01 §7.6.

| | Standalone (default) | Embedded |
|---|---|---|
| Identity area | dark slate-12 Header, white text | light: `--cc-soft` background, `--cc-ink` text, `--cc-line` dividers, `--cc-muted` requested-date label; hover `--cc-toggle-hover` with `--cc-brand`; focus outline `--cc-brand` |
| Header grid | `minmax(0,1fr) 156px 64px` (no area cell); ≤440px `142px 60px` | `minmax(0,1fr) 156px 32px`; ≤440px `142px 32px`; identity is one column (no toggle column) |
| Close × / module tabs | drawn | not drawn |
| Sales ▾/▴ and address toggle | drawn; Info opens both, other modules start closed | not drawn; address and sales facts always open — closing the PDF or a module reset cannot fold them |
| Items | start closed behind the Items icon | the first module's items show at once, no toggle, no `Items` title |
| Communication / Timeline | toggles in the module bar | not drawn |
| ↗ full page | only when `onOpen` is passed (true for both) | same rule |
| SO No | underlined; opens the saved-version PDF in place; Close PDF returns focus to the SO No | same |
| Outer box | 1px `--cc-line` border, radius 8px, max width 560px | same when placed directly on a page (PO full page); border 0 and radius 0 when nested in a host card's tab (`.panel .embedded`) |
| Body | 10px padding under the module bar | 1px `--cc-line` top rule (the rule the module bar gave), then 10px padding |

**Embedded SO items:** the kit `DocumentTable` with five columns `Item / Qty / Unit (RM) / Disc (RM) /
Amount (RM)`: goods then services, in the saved document's order; the item name with its configuration on a
second line (the full SO page's `configWords`); `Disc (RM)` is `0.00` unless the line carries a discount, as
on the PDF; digits as the full SO page (`2,499.00`); numbers right-aligned, tabular and unwrapped; the item
text may wrap. Inside the card, `DocumentTable` descendants skip the card's reference border and button
resets (the PR #1897 `data-kit` exclusion, narrowed to `[data-kit="document-table"] *`), so its rules and row
doors keep their recipe; other kit components' descendants are unchanged. Table numbers: 01 §7.6.

**Date meaning:** `{n}d · [calendar] {weekday, d Mon}` is the customer's original requested date (revision
1, `originalRequestedDeliveryOf`) minus `proceed_date` (`originalRequestDays`): never today-based, never a
later date; the count is omitted when either date is missing.

**Entry points:** `components/kit/CompactModuleCard.tsx` (`presentation`, module `content`: a module that is
only content draws no body inset); `pages/operation/components/sales-order-card.tsx` — the ONE SO builder
(`salesOrderCardHeader`, `salesOrderMoneySummary`, `originalRequestDays`) used by both
`SalesOrderCompactView` (standalone) and `EmbeddedSalesOrders`; `pages/operation/components/EmbeddedSalesOrders.tsx`
— `EmbeddedSalesOrders({ orderIds })` (one block per linked SO, once each, source order),
`linkedSalesOrderIds(sources)`, `SalesOrderItemsTable`. Reads only: the row from
`GET /api/operation/orders?orderId=` (the Register's own one-order row), items from
`/api/orders/:id/sales-order-data` (the saved PDF's source). States: `Loading…`; a failed read
`Could not be loaded` + `Try again`; an SO the Operation list does not return `Order details unavailable`;
a refused read `You cannot view this record`.

## Adapters

**Sales Orders (owner authorised 2026-10-04; PRODUCTION VERIFIED 2026-10-05, PR #1893/#1896/#1897,
`2ce91e2d`).** The Listing Table/Cards quick view uses `SalesOrderCompactView` (`SalesOrderCardDocument`
/ `PdfPreview` for the saved document); ↗ continues to `/operation/orders/so/:id` and its existing
deliberate Edit gate. Info opens address and sales facts; Delivery starts collapsed. Missing facts stay
unknowns, never zero. Delivery reads the existing Monitor projection for the final receiver (goods
exclude services); the existing Delivery-owned `DeliveryDatesEdit` / `LogisticsDetailsEdit` forms are
reused through their governed door with reason/evidence rules, permission checks and server refusals.
The compact Customer editor starts with no inferred information source and requires an actual choice;
the save door records contact/proxy separately from the signed-in recorder. Coverage-based Logistics
preselection is an unsaved draft labelled `Assign logistics`; the summary shows only the saved partner.
Info supplies Payment's active current reminder/follow-up templates (Default first, the governed
wording as fallback) only when money is actually outstanding; Delivery supplies only the saved
Logistics recipient and its active `ask_partner_for_date` templates (or the governed Delivery wording);
no saved partner means no Logistics communication door. Save as/Manage keep the kit's browser-template
scope and never write the backend template library. Orders MASTER owns the measured path matrix; a
`/ui` result alone never proves a business entry, and a live successful save from the card is not
claimed.

**Receiving (DEPLOYED, PR #1894; wrapped summary labels PRODUCTION VERIFIED, #1906).** The same card
and Drawer take a supplier/source name and GRN reference without customer sales or address fields.
`modulesLabel` gives domain-specific accessible navigation; a module's `detailsLabel` names the owning
object's disclosure; `referenceStatus` places an exceptional document state below the reference
(`Cancelled` for a voided GRN; omitted on a normal document). Empty address and target slots collapse;
Sales Order geometry is unchanged. Receipt quantities, evidence and history come from Receiving; the
full GRN owns PDF, amendment and void.

**SO Batch (DEPLOYED, PR #1891)** uses `SoBatchCompactView`; its Header still shows the current request
with a today-based countdown until the Purchasing lane ships the original-date rule above.

**Reuse boundary:** `CompactModuleCard` owns card content; `Drawer` owns the Register overlay, not the
Workspace Work panel container. Modules provide facts, editors, actions and permissions through the kit
API; a missing shared capability returns to the shared UI owner. Customer/SO Header assumptions are
never imposed on supplier POs or source-free purchasing objects.

## What the /ui example is — and is not

A **UI example**. SO-1368 order facts (customer, order date, Sales Location, Salesperson, Total
payable/Paid to date/Balance due, the payment at 2026-09-30T08:08:32Z, receipt RC-300926-3735) are the
verified handoff sample. Stock `1/1 Ready` is a layout sample. Any Customer date or Logistics company
saved on /ui exists only in that browser tab: **nothing is written to the ERP**, and it is not an order
fact. `Preview: next save fails` simulates a failed save. ↗ opens the existing Sales Order page; ×
closes the card. `Purchase Order · Sales Order tab` shows the embedded presentation: a host card
(`{Supplier}` · `{PO No}` in braces, because no real PO links SO-1368) opening on its own `Purchase Order`
tab, with `Info` and `Sales Order`; the `Sales Order` tab holds the SO-1368 sample and the
`SO2609-4827(1)` long-number, long-address layout sample. SO-1368's number opens its real saved PDF when
signed in; the layout sample has no saved document and shows the real failure state, and has no ↗ because
it has no full page.

## Differences from the reference page (125 checks: 25 states × 5 widths)

`compact-card-states.mjs` names a reason for every difference. Strictly identical states: **0**,
because three global fixes touch every state. Card height equal: **118 of 125**. Unexplained: **0**.

| Kind | Checks | What differs | Height |
|---|---:|---|---|
| Global fix · governed word | 45 | Logistics empty `Not assigned` (reference prints `No logistics picked`, retired in COPY-STANDARD 2026-09-24) | same |
| Global fix · reference defect | 55 | Info values stay left aligned and keep the Paid \| Balance due divider (a leftover flex rule centres them and drops the divider) | same |
| Global fix · reference defect | 50 | Address arrow `▴` while the address is open (reference shows `▾` on first load) | same |
| Owner rule | 5 | Reopened Customer editor shows the saved answer (reference opens an empty form) | **+99px** |
| Owner rule | 5 | DO conditions one per line (reference two per line on wide cards) | **+26px** on the two widest cards |
| Owner rule | 5 | After a not-agreed result the cell keeps `Date not confirmed` (reference prints `No Answer`) | same |
| Owner rule | 10 | Service lines read `Service`, not `—` | same |
| Reference behaviour removed | Customer saves | No `Preview only · Recorded at …` note | same |

## Open — not approved (tracked in UI MASTER §7)

- Palette, font family, radii and drawn glyphs are the reference's own, not `01-design-tokens.md`
  (token decision pending); the editor's red error line (`#ce2c31`, the kit red-11 value) awaits review.
- Phone: controls stay 32px; a 40px touch version needs a module-tab-row decision.
- The editable `To` differs from the Work panel's recorded-channels-only rule.
- The native Input/Textarea cascade inside `.panel` (01 §7.6 records the actual values).
- The owner-confirmed standalone preview differs from the kit in three places (UI MASTER §7.2).
