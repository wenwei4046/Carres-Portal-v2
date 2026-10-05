# Compact module card — contract

Owner rules 2026-10-03 / 2026-10-04 / 2026-10-05: one shared card structure and style for every module,
with the owner's Stock and Customer corrections. **The outer identity belongs to the host module with the
shared structure and style; an embedded SO uses the same component in embedded presentation** (owner
2026-10-05). This is the only card contract.

**Use the kit component, never these files:** `apps/web/src/components/kit/CompactModuleCard.tsx`
(live on `/ui#compact-card` with Info and Delivery). The reference page `module-card-reference.html`
(SHA-256 `98c1ae5396a53143…`, published at `/ui-kit/module-card`; the retired `/ui-kit/delivery-card`
and `/ui-kit/delivery-card.html` answer with a 301 that keeps the query string) is the proof target.
`node scripts/compact-card-states.mjs <dev url>` drives both through 25 states at five widths, compares
geometry, text and styles, and must report **no unexplained difference**.
`module-card-measurements.json` holds reference and component heights per state and width.

**Measurement lookup:** UI MASTER §4.3 “Compact-card measurements” records the complete source dimensions, responsive rules, live evidence and pending reference values. It is the single lookup; do not create another page-local measurement guide. Historical state-height JSON is parity evidence, not fixed card height.

## Rules

**Shared Header colour — owner approved 2026-10-04:** use existing Radix slate-12 background, white primary text and day count, slate-4 contact text, slate-11 dividers/hover. Day count uses the existing label token (11px/500/14px), with no pale badge fill. Focus is visibly white inside the dark header. Only the identity Header changes; address details, tabs, summary and body stay light. Every CompactModuleCard consumer inherits this treatment; no per-module copy. This scoped approval does not decide the remaining card palette, font or radius.

- **Host-owned identity:** every module card uses the same Header structure and style; the HOST module
  fills it with its own identity (a Sales Order shows its customer, a Purchase Order its supplier and PO
  number). A Sales Order shown inside another module is the same component in embedded presentation
  (below), never a second Header. The standalone SO Header, as built:
- **Standalone SO Header:** name · order · phone; a ▾/▴ at the lower right of the customer cell
  opens the sales facts (no `Order info` words); address with its own toggle (▴ while open); target
  date (`d Mon`) with the Proceed-date-to-original-request calendar-day count; Open and Close.
  The phone glyph and number form one wrapping unit. The header grows with a long name; nothing overlaps.
- **Sales facts:** `SO Doc Date` · `Proceed date` · `Sales Location` · `Salesperson`, label above value.
- **Standalone: Info opens sales facts and address; every other module starts with both closed.** Switching
  module applies that module's default and closes items and editors. Embedded: both always open (below).
- **Summary cells:** title row, value, optional status line — top aligned on common baselines, left
  aligned, ▾ at the right of the title row for a fact with an editor. Each module shows only its own
  facts: Info `Total payable · Paid to date · Balance due`; Delivery `Stock · Logistics · Customer · DO`.
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
  Logistics' reply, and the Timeline names Operation only as the recorder.
- **DO:** read-only conditions, one per line; no manual tick, no repeated explanation.
- **Items contains goods and services only.** SO Info has no separate details panel: remove Email, Dealer, repeated Stock/Payment/Delivery statuses and Related documents. Documents belong to their owning module; PO belongs with its item.
- **Standalone: Items, Communication and Timeline start closed** (embedded: items show at once, no
  Communication or Timeline). Times show without a zone suffix
  (`30 Sep · 4:08 PM`); the full instant stays in the element; a date-only source shows the date and
  `Time unavailable`.
- Communication: channel select in its header, `To`, `Subject` for Email only, Message ⋯ for Find /
  Save as / Manage templates (Escape or a press outside closes it), a 320px naming dialog, one
  attachment entry, `Copy message` and `Open WhatsApp` / `Open email`. Links open drafts only.

## Embedded presentation — owner confirmed 2026-10-05

`<CompactModuleCard presentation="embedded" …>` draws one record inside a host module's tab. The host owns
the outer Header, its tabs and every business action; the host's own tabs and which one opens first follow
UI MASTER's shared module page flow, not this component. A host shows a `Sales Order` tab only when at
least one Sales Order is linked; an empty list draws nothing. Hosts: the Purchase Order full page
(`Sales Order` view, built) and the Purchase Order working panel and round panel (approved; their
work-content layouts are localhost-first in the Purchasing lane). Standalone and embedded rules are
separate; nothing below changes a standalone card.

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

**Shared measurements (both presentations, `compact-card.module.css`):** Header minimum 56px, padding 6×12px
(≤460px card: 6×8px, gap 5px); name 14px/18px 700; SO No and phone 11px (≤460px: 10px), phone glyph 12×12px,
SO No underline offset 2px; requested-date label two lines 10px/11px (≤440px: 9px); date 13px with the 16px
calendar glyph, day count 11px/500; ↗ 32×32px, 18px. Address detail padding 8×12px, 12px type, 16px pin glyph
(stroke 1.6), full address left, access facts right in a 200px column with 12px gap, stacking at ≤440px.
Sales facts padding 10×12px (≤460px: 10×8px), `SO Doc Date / Proceed date / Sales Location / Salesperson`
in columns `1fr 1fr 1.55fr .75fr` with 12px gap, two columns at ≤440px (8px gap at ≤420px); label 11px,
value 12px/17px 500. Summary strip `Total payable · Paid to date · Balance due` as in Info. Card width is the
available width up to 560px; checked at 560/440/416/396/366px with no overflow.

**Embedded SO items:** the kit `DocumentTable` with five columns `Item / Qty / Unit (RM) / Disc (RM) /
Amount (RM)`: goods then services, in the saved document's order; the item name with its configuration on a
second 12px/16px slate-11 line (the full SO page's `configWords`); `Disc (RM)` is `0.00` unless the line
carries a discount, as on the PDF; digits as the full SO page (`2,499.00`). Table type 13px/18px, header
11px/14px 500, 8px cell insets, 1px slate-5 row rules, numbers right-aligned, tabular and unwrapped; the item
text may wrap. Inside the card, `DocumentTable` descendants skip the card's reference border and button
resets (the PR #1897 `data-kit` exclusion, narrowed to `[data-kit="document-table"] *`), so its rules and row
doors keep their recipe; other kit components' descendants are unchanged.

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

## What the /ui example is — and is not

It is a **UI example**. SO-1368 order facts (customer, order date, Sales Location, Salesperson,
Total payable/Paid to date/Balance due, the payment at 2026-09-30T08:08:32Z, receipt RC-300926-3735) are the verified
handoff sample. Stock `1/1 Ready` is a layout sample. Any Customer date or Logistics company saved on
/ui exists only in that browser tab: **nothing is written to the ERP**, and it is not an order fact.
`Preview: next save fails` is a /ui control that simulates a failed save. The header ↗ opens the existing Sales Order page. × closes the card.
`Purchase Order · Sales Order tab` shows the embedded presentation: a host card (`{Supplier}` · `{PO No}` in
braces, because no real PO links SO-1368) opening on its own `Purchase Order` tab, with `Info` and `Sales
Order`; the `Sales Order` tab holds the SO-1368 sample and the `SO2609-4827(1)` long-number, long-address layout
sample. SO-1368's number opens its real saved PDF when signed in; the layout sample has no saved document and
shows the real failure state, and has no ↗ because it has no full page.

**SO file preview — owner approved 2026-10-04:** The source-owned preview uses the shared `PdfPreviewHeader`: `Sales order PDF · {actual SO number}` at left, existing saved-document `Download` and `Close PDF` × at right. Zoom stays on the next row, then the actual PDF. Identity and Close remain available during loading/error; Download is disabled until its saved Blob exists. No separate Close row. Close PDF returns to Info and focuses the SO number; the dark Header `Close order` × closes the whole Register Drawer and returns to its opener. Neither control saves business facts or changes current/historical issued documents.

## Real Sales Orders adoption — owner authorised 2026-10-04

The Listing Table/Cards quick view uses `SalesOrderCompactView` and this kit, rather than reference
HTML/CSS. The SO number lazily opens the Orders endpoint’s current saved-version document through
`SalesOrderCardDocument` / `PdfPreview`; ↗ opens the full order and its existing deliberate Edit gate.
The shared Drawer `compact-card` variant supplies focus containment, Escape, background scroll lock
and return focus with an accessible hidden title; visible identity and Close belong to this card.
Info opens address and sales facts; Delivery starts with them collapsed. Items contains goods/services only. Missing facts remain unknowns rather than fabricated zero values. No sample dates, stock quantities or customer details become live facts.
Delivery reads the existing Monitor projection for the final receiver; goods exclude services. Missing
or failed reads stay explicit. Customer date and optional time remain separate from crew ETA.
Existing Delivery-owned `DeliveryDatesEdit` / `LogisticsDetailsEdit` forms are reused through their
governed arrangement door, including reason/evidence rules, permission checks and server refusals.
Their compact action row uses Cancel then Save; failure retains input and exposes its reason.
Embedded kit controls must preserve their shared field skin; the card universal border reset and
button reset exclude `data-kit`, and visible dropdown/date borders are production verified.
UI MASTER §4.3 records the remaining native Input/Textarea cascade discrepancy (font/padding/radius/card-line border); do not claim that part already matches the canonical recipe unchanged. Compact Customer fields use two columns
above 400px card width and one at 400px or below, without reserved blank rows. Compact condo input uses its
two natural rows and omits the long instructional hint; evidence and all save gates remain.
The compact Customer editor starts with no inferred information source and requires an actual choice;
the existing save door records contact/proxy separately from the logged-in recorder. Coverage-based
Logistics preselection remains an unsaved assignment draft, labelled `Assign logistics`; the summary
continues to show only the saved partner. Compact crew fields share a row, with ETA, condo and reply
proof retained. Its prepared message belongs in Communication, outside the assignment editor.
DO conditions are read-only and cannot issue or release a document. Timeline uses recorded events,
full instants and avatar identity without repeating names; its loading/error state stays inside its
collapsed section. Communication only prepares drafts; attachments remain explicitly preview-only. Info supplies the
Payment’s active current reminder/follow-up templates (Default first), with the existing governed
wording as the same fallback its Invoice composer uses, only when money is actually outstanding.
Delivery supplies only the saved Logistics recipient and its existing group door, active current
`ask_partner_for_date` templates from Delivery Settings (Default first), or the existing governed
Delivery details wording when no active template exists. No saved partner means no Logistics
communication door. Shared Settings versions are read here; Save as/Manage retain the kit’s existing
browser-template scope and do not write the backend template library.
This scoped adoption does not change tokens, phone navigation or Work contacts.

**Reuse and verification boundary (2026-10-04):** `CompactModuleCard` owns card content;
`Drawer` owns this Register overlay, not the Workspace Working Panel container. Modules provide
facts, editors, actions and permissions through the kit API; a new missing shared capability returns
to the shared UI owner rather than being drawn locally. The current contract is the owner-rules
2026-10-03/04 contract in this file; a production commit is recorded only after release proof.
SO ↗ continues to `/operation/orders/so/:id`. Its existing `SalesOrderWorkspace` supplies the
responsive two-pane form/document view and deliberate Edit; successful saves end editing and refresh
its source facts/revisions, while Back returns to the Register. This release does not change those
mechanics or claim that one navigation click proves the whole save/return journey. Existing full-page
contract/document tests passed (105 checks); authenticated navigation, Edit/Cancel, formal preview
and Back are verified below. A live successful save is not claimed.
Workspace Working Panel and other modules have not adopted this adapter. Their placement, recorded
contact channels, domain headers and approved full-page composition remain module-owned; customer/SO
header assumptions must not be imposed on supplier POs or source-free purchasing objects.

**Earlier register/navigation production acceptance — 2026-10-04:** PR1888 exact head
`dd581fb3139b9539216f1f1c9ddc25b107e3d4a5` passed full CI37207794735 and deployed as
`36d96ac427f059901f6fdf2d623bd6277adeb611` (Deploy37208534384); independent verification matched
all five revision surfaces. Orders MASTER owns the measured existing-path matrix and boundaries.
On that release, the real Carres Kota Damansara + Mattress October door opens only SO-1368;
loaded reload and Table → Cards retain its visible conditions and blank search. At390px removing
only category opens SO-1368 + SO-1358 while retaining the same location/month.121 Register/monthly
UI checks and16 shared arithmetic checks cover additional combinations;45 baseline report checks
remain fixture evidence. Purchasing retains responsibility for its equivalent month door.
Supporting PR1883/7f662b5 proof verifies real390px History long-note expansion/Escape without nested
buttons or page overflow, original/current Revisions and Cards/search return. A live Revisions
long-note sample was absent;136 functional checks prove its cut-note/no-version-action variant.
Priorf7857f6 retains completed/open Delivery, Monitor, widths and formal-object proof;086f23d retains
source/template/context/monthly evidence. PR1879's approved header/Balance due law remains preserved.
Live Save/send, Print/Download, Workspace/other-module adoption and all-role historical/exception
variants remain outside this proof. This acceptance does not certify the whole module.
A /ui result alone does not prove a business entry; the actual Orders entry supplies this evidence.

**Confirmed corrections production verified — 2026-10-05:** UI MASTER §4.3 records the current release proof for PR1893/1896/1897, deployed `2ce91e2d0ce7b118cfd7bb95c2b8e6974233ad3f` (CI37212809683, Deploy37213753695). Actual Customer/Logistics fields retain solid1px borders at560/440/416/396/366px card widths; Customer stacks at400px or below. Orders MASTER owns the full-page duplicate Items-prose removal and attachment icon + `Slip` wording. Preserve those confirmed continuations without changing full-page layout or financial calculations. Shared rules apply to kit consumers; migration/production acceptance remains per module.

## Differences from the reference page (125 checks: 25 states × 5 widths)

`compact-card-states.mjs` compares geometry, text and styles and names a reason for every difference.
Strictly identical states: **0**, because three global fixes touch every state. Card height equal:
**118 of 125**. Unexplained differences: **0**.

| Kind | Checks | What differs | Height |
|---|---:|---|---|
| Global fix · governed word | 45 | Logistics empty `Not assigned` (reference prints `No logistics picked`, retired in COPY-STANDARD 2026-09-24) | same |
| Global fix · reference defect | 55 | Info values stay left aligned and keep the Paid \| Balance due divider (a leftover flex rule centres them and drops the divider) | same |
| Global fix · reference defect | 50 | Address arrow `▴` while the address is open (reference shows `▾` on first load) | same |
| Owner rule | 5 | Reopened Customer editor shows the saved answer (reference opens an empty form) | **+99px** |
| Owner rule | 5 | DO conditions one per line (reference two per line on wide cards) | **+26px** on the two widest cards |
| Owner rule | 5 | After a not-agreed result the cell keeps `Date not confirmed` (reference prints `No Answer`) | same |
| Owner rule | 10 | Service lines read `Service`, not `—` | same |
| Reference behaviour removed | Customer saves | No `Preview only · Recorded at …` note (hidden in the reference before comparing) | same |

100 checks differ only by the three global fixes; 25 differ by an owner rule.

## Open — not approved

- Palette, font family, radii and drawn glyphs are the reference's own, not `01-design-tokens.md`.
- Phone: controls stay 32px; a 40px touch version needs a module-tab-row decision (shown separately).
- The editable `To` differs from the Work panel's recorded-channels-only rule.
- The editor's red error line (`#ce2c31`, the kit red-11 value) is new to the card and awaits review.

**Receiving adapter — built on branch, not production verified (2026-10-04).**
The same card/Drawer accepts a supplier/source name and GRN reference, without customer sales or
address fields. `modulesLabel` supplies domain-specific accessible navigation; optional module
`detailsLabel` supplies the owning object's disclosure name. Defaults remain unchanged for Sales
Orders. `referenceStatus` places an exceptional document state below its reference using existing
header tokens (`Cancelled` for a voided GRN); normal receipts omit it. When address and target
are both absent, their empty header slots collapse; Sales Order geometry is unchanged. Receipt quantities and
evidence come from Receiving; the existing full-page object owns PDF, amendment and void actions.

**SO Header composition correction — owner approved 2026-10-05:** remove the separate Ampang/area cell; retain the full address below Header. Requested-date label has two small lines, date and day count together beneath. The day-count tooltip states `Calendar days from Proceed date to customer’s original requested date`. This changes no SO numbering or existing issued documents.

**Customer original requested date and day count — owner correction 2026-10-05 / BUILT ON RELEASE BRANCH; production verification pending.** Header label uses two small lines: `Customer’s original` / `requested delivery`. `{n}d` means **calendar days from Proceed date (`proceed_date`) to the customer’s original requested delivery date**, calculated as original requested date minus Proceed date using calendar dates in Asia/Kuala_Lumpur. It is not days remaining from today, order age, days since SO Doc Date, actual delivery duration, a confirmed delivery date or Logistics ETA. Example: Proceed date `30 Sep 2026` and original requested date `31 Oct 2026` show `31d · Sat, 31 Oct`; the number does not change each day. Same date shows `0d`. Missing either date: omit the day count; never invent a date or show a placeholder count. An original requested date before Proceed date requires a data check; omit the count rather than present a negative delivery duration. Changing a later requested/confirmed date must not overwrite the original date used here. The SO table, card, requested-delivery filter and export read the same revision 1’s immutable `snapshot.header.delivery_date` (respecting its `delivery_date_tbd`), not the mutable order `delivery_date`. The list embeds only revision 1 via its existing user-authorized read; missing revision 1 has no original date (Header `Not recorded`, required table cell blank). A failed list read remains a failed list. Never silently substitute the current date. Other chats must not reuse the retired today-based countdown for this SO Header. Delivery’s Customer confirmation and Logistics ETA remain separate facts. Acceptance must include changing today without changing either stored date: the day count stays unchanged.

**Owner-confirmed SO template — 2026-10-05:** shared dark Header → address → sales facts → module tabs → module summary. Address stays visible by default in Info: full wrapping address left, access facts right (200px column, 12px gap), grouped as `Condo · Floor 1` and `No lift · Stair carry: 4 items`; omit stair carry when empty, not recorded or zero; at card widths ≤440px access facts move below. Never truncate the address or reserve a fixed height. Sales facts follow in this exact order: **SO Doc Date / Proceed date / Sales Location / Salesperson**, label above value, four columns above440px and two at≤440px. SO Doc Date reads `placed_at`; Proceed date reads `proceed_date`, not the actual handoff `proceeded_at`. Missing Proceed date is `Not recorded`. Sales Location uses outlet name with dealer fallback; Dealer is not a duplicate display field. Info summary is **Total payable / Paid to date / Balance due**, matching the PDF. Remove the SO Info details panel, Email, Dealer, repeated Stock/Payment/Delivery status rows and Related documents. Item-level PO/stock and module-owned documents remain in their owning surfaces. In the standalone card, Items, Communication and Timeline start closed. All chats must reuse `CompactModuleCard` and its `/ui#compact-card` example; no copied preview HTML.
