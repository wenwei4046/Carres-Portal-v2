# STOCK / WAREHOUSE — MASTER

> **APPROVED / LOCKED — complete owner-reviewed Warehouse Blueprint, re-closed 2026-09-04.**
> This is the only Warehouse operating model. It overwrites the former On hand, Ready stock
> planning and Held stock model. Current code is evidence only, never target authority.

## 1 · Mission and ownership

Warehouse answers: **Which exact Unit is where, who has it, what condition is it in, and can it
be used?**

Carres currently uses third-party warehouse and delivery operators. NETS performs physical work;
Carres Portal preserves Carres-controlled inventory truth. The model must work unchanged with
another 3PL or a future Carres-operated warehouse.

| Fact | Owner |
|---|---|
| PO, Consignment Order, supplier promise/claim and commercial reason | Purchasing |
| Unit ID, Where, Who has it, condition, availability and physical history | Stock / Warehouse |
| receiving session and receipt evidence | Receiving |
| exact Unit promised, reservation and release decision | Sales Order |
| journey, carrier handover and proof | Delivery |
| customer problem after delivery | Service Case |
| invoice, settlement, payment and valuation | Finance |
| material adjustment, write-off and major dispute approval | Stock Adjustment Approver |

Purchasing explains why Carres obtained the Unit. Stock explains where it is now. A consequence
never transfers write ownership.

## 2 · Navigation and words

Warehouse has five operator destinations: **Arrival Schedule · Pickup Schedule · Inbound · Inventory · Outbound**.
The two schedules are separate read-only projections. They use large working-day dates, white cards,
quiet Expected/Scheduled badges and warning colour only for actual overdue work. They keep distinct
orders identifiable, retain delayed and undated work, and never reschedule goods automatically.

Inbound uses actual governed Receiving Site tabs. Its default register keeps Document and its dates,
Receive, Product/quantity and receiving progress visible together. Supplier DOs link to their actual
receipts; multiple receipts remain distinct. Expected arrival, PO Delivery Date, Supplier Delivery
Date and Goods received on are different facts. The date filter uses expected arrival (the evidenced
supplier date where present, otherwise the PO/source date). Awaiting receipt / Fully received / All
arrivals are the three filters. Physical arrival never substitutes for accepted correct quantity.
Receive opens the existing ReceivingWorkspace full width in Inbound; returning preserves the list.

Outbound keeps DO/SO, pickup date, product quantity, the Loading entry and separate Required / Loaded /
Driver confirmed counts visible. The default includes outstanding loading, missing loading evidence
and outstanding driver confirmation. Warehouse loading does not impersonate driver acceptance.
Loading opens the existing exact-Unit work surface full width; product expansion has only product
and Unit identity details. Dates and actions must be measured inside the actual shell and filter rails.

Inventory is the one current Unit authority. Exact goods show Unit ID separately; quantity goods
show SKU/quantity without an invented Unit ID. Actual in/out dates must describe the same Site visit
using owning receipt/handover evidence, never a PO-issued date_in value. Returns start another visit.
Ready Stock is a shared eligible-Unit view; Counts & Adjustments belongs within Inventory.
Reports, Settings, Work and Calendar keep their shared Shell homes. There is no Warehouse-local
Dashboard, Monitor, Transfer, Ready Stock or Counts top-level destination.

Approved words include Where · Who has it · Carres Owned · Supplier Consignment · Report issue ·
Count again. Generic status editing, Add stock, Remove stock and Mark done remain forbidden.
UI Kit acceptance remains pending the owner's visual review; implementation is not a design freeze.

## 3 · Unit operating model

Every physical sofa Carres controls has one permanent Carres Unit ID, including Carres-owned and
supplier-consignment display goods, sold display goods awaiting delivery, and goods awaiting repair,
change, return or supplier collection.

The ID is born when the official PO or Consignment Order is issued — in the same transaction as
the document number, bound to its document line, for every destination (owner ruling 2026-09-07;
Purchasing §6.2). The locked human format is `U1-000-001`: six system-controlled digits grouped
3 + 3. After `U1-999-999`, allocation continues at `U2-000-001`. Allocation is company-wide, never
reset, manually created or reused. Search/scan may normalise punctuation, but the visible identity
never changes. **Which goods carry a Unit ID is Catalog's stored answer** (`stock_identity_mode`):
traceable furniture and independently saleable or replaceable modules are exact Units; governed
interchangeable accessories and bulk goods are **quantity goods** — counted, never given a Unit ID.
A quantity good lives in the register as a bulk row (`qty` > 1 pieces, `identity_scope =
quantity`, 0218) whose technical register key is never shown, printed or scanned as a Unit ID.
That key is `QTY-000000001` (0453) — deliberately not the shape of a Unit ID — and both register
views expose `identity_scope` so no surface has to guess. **Every screen, PDF, export and scan
resolves identity through the one shared resolver** (`unitIdOf()`), which answers `null` for
counted goods; `null` prints `—`. A counted row cannot be reached by scanning, because nothing was
ever printed for it.
Receiving verifies the identities Purchasing issued and never creates, replaces or renumbers one.

The supplier currently adds `CARRES UNIT ID: U1-000-001` only to its own package label. A supplier
physical-Unit label, QR, barcode and Carres template are not required now. Carres Operations attaches
the same text ID to the physical Unit at the showroom. Future supplier labelling or QR/barcode is
only a carrier for the same Unit ID. A wrong or unreadable label starts a controlled issue, never a
second Unit. Replacement labels keep the original ID and full evidence.

Every active Unit has Catalog identity, source order, ownership, **Where**, **Who has it**,
condition, calculated availability, reservation connection, last verified date, evidence and
append-only history.

| Where | Who has it |
|---|---|
| Carres Klang Warehouse | NETS Warehouse |
| On the way to PJ Showroom | NETS Delivery |
| PJ Showroom | PJ Showroom |
| selected JB partner warehouse | JB partner |
| On the way to the Singapore customer | EU or SSY |

NETS is not a Site. Site, operating party and role are separate. Independently saleable or
replaceable modules each have a Unit ID; pure shipping packages are children of their Unit.
Missing required modules, components or packages prevents Ready stock eligibility.

## 4 · Availability, reservation and replenishment

The Unit register is authority. Every quantity is derived from identifiable Units; no rollup,
page or integration maintains another available quantity.

| Facts | Result |
|---|---|
| received, inspected, complete, unreserved and uncontrolled | Available |
| bound by Sales Order | Reserved / sold |
| ordered but not received | Incoming |
| between confirmed handovers | In transit |
| issue, inspection, repair, missing component or other control | Not available |
| customer accepted or lifecycle ended | Delivered / history |

Successful customer delivery of an exact `Supplier Consignment` Unit emits the authoritative sold
event Purchasing uses to create a Consignment Sale Notice. Stock records the ownership/history
consequence once; it does not issue the notice, create supplier payable or settle money. A failed or
refused delivery emits no sale event.

Sales Order owns choosing, binding, changing and releasing the exact promised Unit. Stock validates
eligibility and reflects the result. Warehouse may report a problem but cannot silently release or
substitute a reserved Unit.

**A RESERVATION NAMES THE ITEM LINE, NOT JUST THE ORDER — BUILT AND PRODUCTION-VERIFIED
2026-09-10, migration 0471.** `ops_stock_items.reserved_ref` says which Sales Order a Unit is
committed to; `ops_stock_items.reserved_order_line_id` says which of that order's ITEM LINES it
answers. Both are needed: a Sales Order may carry two item lines of one SKU, and three do today.
The binding is a column on the Unit row rather than a second table, because the Unit row already is
the reservation — so release and reassignment clear it in the same write and the customer's
requirement returns to Purchasing by itself. It survives the sale, so a delivered requirement never
returns as something to buy. Both register views expose it.

`ops_stock_pool_draw` is still the one reserve door and now validates the binding in SQL on the
locked row: the line belongs to that Sales Order, the goods match by `stock_match_key`, the Unit is
an exact Unit and never a counted row (§3 · 0368), it is `available` by `unit_availability`, and the
line still has a remaining requirement of ordered quantity less bound Ready Stock less
non-cancelled purchase-order lineage. There is no override. A caller that names no line has one
RESOLVED — a single candidate, or a refusal by name; the door never picks out of several.

Ready stock contains only exact Units satisfying every eligibility rule; every total drills to IDs.
A customer shortage separates available Units from remaining demand: Warehouse receives dated
preparation work for available Units, Purchasing receives dated arrival work for the missing demand,
and Sales Order displays promise risk. General replenishment is a Purchasing decision.

## 5 · Physical lifecycle

Confirmed PO or Consignment Order creates expected Incoming Units. Receiving owns the session.
NETS Warehouse scans each actual ID, checks product, visible condition, required components,
packages and label, supplies governed evidence, and records one outcome per Unit: Check in,
check in with issue, reject, or not delivered. A bulk total cannot replace Unit results. Partial
receipt preserves received Units and leaves the remainder Incoming. Unexpected Units are
investigated, never added through a shortcut.

Showrooms are formal Sites. Staff scan arrival and departure, report observations and perform dated
counts. A reserved display Unit remains at its Site but leaves Ready stock. Display start and last
condition check are visible. No governed Position or slot exists now; reconsider when three to four
outlets or measured finding time proves Site alone inadequate.

The `Showroom Display` Inventory view includes every physical sofa at PJ Showroom and future
outlets: Carres Owned display, Supplier Consignment, sold/reserved display awaiting Delivery,
waiting repair/change and waiting supplier collection. Its defaults are `Unit ID · Product · Site ·
Ownership · Stock use · SO No · Display since · Last verified`. This is a filtered view of the one
Unit Register, not a separate showroom spreadsheet.

Showroom arrival and departure require two-sided physical evidence. A planned Transfer states exact
Unit, From, To and actual expected date but changes no holder. NETS Delivery records collection;
the individually signed-in showroom/outlet person scans arrival, checks Unit ID/product/visible
condition and submits arrival evidence before `Who has it` becomes that Site. Departure similarly
changes the holder only after the showroom person scans the handover to the actual recipient.

The showroom date strip generates concrete arrival, Count, condition-check and handover work. A
showroom/outlet person may scan arrival/departure, Count Units, Report a problem and view their
Site's processing status. They cannot change ownership or supplier cost, create PO/Consignment
Order, release an SO reservation, approve an Adjustment or close a Supplier Claim.

When Sales Order chooses a display Unit, Inventory immediately reads `Reserved for Sales Orders ·
{SO No}` while `Who has it` remains the showroom until actual collection. Delivery derives the
showroom collection/customer dates; Outbound creates the dated check/pack/handover work; the
showroom person scans the handover. Reservation is a customer promise, never a physical move.

Showroom Count is blind and Unit-level. An equal total does not cancel mismatched identities: if
the Portal says eight and the scan also finds eight but one governed Unit is missing and one
unregistered Unit is present, both differences remain and must be investigated.

A consignment Unit always retains `Supplier Consignment`, source Consignment Order and Supplier
while Stock records its Site/holder and condition. A sale produces the Sales Order reservation and
Purchasing's `Sold to Settle` consequence; Finance handles Supplier Invoice/settlement. Warehouse
cannot change ownership or settlement price. Purchasing may authorise change, return or supplier
collection, but that decision cannot remove the Unit from the showroom: Outbound handover and the
actual recipient evidence must move it. Repair follows the same out-and-back physical truth.

Delivery works backward from the customer date using governed calendars, cut-offs and transit.
Warehouse consumes the calculated latest Carres Warehouse ready date and completes exact-Unit
check, completeness, pack and handover facts; it never guesses the date.

A Transfer has exact Units, From, To, collection and arrival. Collection and arrival are separate
facts. Partial handover changes only affected Units. A Unit not confirmed at destination remains
with its last confirmed holder. Requested Delivery Date remains Delivery's record; Stock reads its
handover facts instead of creating a duplicate Transfer.

Transfer is one Stock object projected into two dated Warehouse destinations, never a fifth top
page: Outbound holds the origin check/handover work; Inbound holds destination receipt work;
Inventory shows the resulting current holder and History. It is used only for governed Site-to-Site
movement within Carres control. Customer Delivery uses its DO/Journey, while Supplier Return and
Repair retain their own source documents and reuse the same physical-handover contract.

Transfer Detail follows the Object Detail Template and shows `Transfer No · source request · exact
Units · From · To · collection date · arrival date · delivery party · Outbound work · Inbound work ·
evidence · History`. Its lifecycle is factual: `Planned → Collected from origin → With delivery
party → Arrived at destination`. `Moved` is not a sufficient status.

At origin, the individually identified holder scans the exact Units and records handover to the
actual NETS Delivery person/party with evidence; only affected Units change to that holder. At
destination, the individually signed-in Site person scans and checks arrival; only received Units
change to the destination Site. If two of three Units move, the third remains with its last
confirmed holder and its original dated work stays not done.

Origin handover and delivery-party receipt are separate evidence. If origin records two Units and
NETS Delivery confirms one, both records remain; the exact unmatched Unit enters `Needs checking`.
Likewise, a collected Unit without destination receipt remains with the recorded delivery party and
creates `Confirm where {Unit ID} is by {actual date}` for the governed owner. No whole-Transfer
status may hide a per-Unit difference.

A planned collection/arrival date change records reason and history and re-resolves only future
Work. It never moves a Unit or rewrites an actual handover. A Transfer may be cancelled with reason
only before collection, leaving Units at origin. After collection, cancel cannot teleport goods
back; a governed return or redirect journey records the next handover while `Who has it` continues
to state the actual current holder.

The requesting module explains why the movement is needed. Stock owns the Transfer and Unit-holder
truth; origin operator, NETS Delivery and destination operator own their own physical evidence. The
COO handles only major unexplained difference/Adjustment. No one changes location through a status
selector.

A Singapore SO has two Delivery legs: Carres Klang Warehouse to the selected JB partner warehouse,
then that warehouse to the Singapore customer through EU or SSY. Each leg has its own logistics
partner, linked DO or trip scope, dates, handovers and proof.

A returned Unit is Returned — check required, never automatically Available. Repair requires
outbound handover, external-holder truth, return handover and inspection. Supplier collection
requires Purchasing authority and actual handover. Write-off approval and physical disposal are
separate facts. Ended Units leave the default view but remain searchable in Delivered / history.

### Unit lifecycle outcomes

`Ended` may exist only as an internal availability grouping. It is not a sufficient operator,
report or History label. Inventory Detail and every history/report surface preserve the distinct
authoritative outcome:

| Lifecycle outcome | Authoritative completion fact | Inventory presentation |
|---|---|---|
| Delivered | Delivery records customer arrival/acceptance and required proof | Delivered to customer |
| Returned to supplier | actual supplier collection/handover is accepted | Returned to supplier |
| Written off | the `Stock Adjustment Approver` approves the governed Stock Adjustment | Written off |
| Disposed | authorised disposal has both approval and disposal evidence | Disposed |
| Voided/cancelled before receipt | the source is cancelled and no physical receipt ever occurred | Never received · Source cancelled |
| Returned by customer | Receiving proves the Unit is physically back under Carres control | the actual current holder and `Check required` |
| Sent for repair | actual handover to the repair partner is accepted | `Who has it = {Repair partner}` |
| Returned from repair | Receiving proves return to the warehouse/showroom and inspection occurs | the current Inventory availability/condition |

Closing a Service Case does not end a Unit. Closing a Supplier Claim does not prove supplier
collection. An expected-source cancellation cannot remove a Unit that was already received. Only
an accepted physical receipt/handover/arrival event or a governed approved Adjustment changes the
Unit's physical or lifecycle truth.

Every outcome remains searchable by Unit ID and preserves the linked SO, PO, DO, Transfer, Return,
Repair, Claim or Adjustment number; actual date/time; individually identified actor/avatar;
evidence; previous holder; new holder where applicable; and append-only event history. Availability
reports may group these outcomes for totals, but every total drills to Units and shows the actual
outcome rather than `Ended`.

## 6 · Issues, Counts and correction

Anyone who observes a Unit may Report issue. Reasons are observable: damaged, product different,
Unit ID unreadable, Unit cannot be found, Unit at another Site, components missing, packaging
problem, unsafe, supplier or destination refused, or another observed problem. The Portal explains
the consequence, requests reason-specific evidence, protects the Unit and raises Work. Staff do not
guess Hold or Quarantine.

The report door is available on Unit Detail and the exact Receiving, Count, Inbound, Outbound,
Showroom or Delivery surface where the observation occurs. NETS Warehouse, NETS Delivery,
Showroom/outlet and authorised Carres staff use their individual identity. The form asks for Unit
ID, `What did you see?`, governed Site/current holder context, required photo/evidence and a plain
factual note. It never asks the observer to choose Quarantine, Hold, write-off, Supplier Claim,
compensation, replacement or another business remedy.

On submission, policy derives the immediate control rather than asking the observer to guess it.
Where the observed fact affects suitability, the Unit leaves Ready Stock and cannot receive a new
SO reservation; unsafe or incomplete goods cannot be handed over. An existing SO reservation stays
linked but is shown at risk so Sales Order sees the consequence. `Who has it` never changes merely
because a problem was reported; only evidence-backed handover/location facts move it.

The full observed fact creates the one shared Action contract. For example, damage at NETS
Warehouse routes `Check the damage and record the result by {actual date}` to the governed Carres
owner; a Unit not found routes `Look for {Unit ID} at NETS Warehouse and scan it again by {actual
date}` to the individually assigned counter, then persistent difference investigation to current
GRN Duty. The row never stops at `Damaged`, `Not found`, `Wrong position`, `Review` or `Handle`.

Wrong-Site comparison uses governed Sites only. It prints `Portal says {Site/holder}` and `Count
found {actual Site}`, then checks the missing handover, wrong record, unauthorised movement or Count
error. Carres records no NETS internal position, Zone, Rack or Bin. Product/label mismatch preserves
the permanent Unit ID, supplier label and physical-product evidence; staff never mint a second ID to
make the records appear consistent.

Inspection records an actual result and permits only governed paths: restore eligibility, dated
repair, Purchasing decision, supplier collection, Count again, approved Site correction or proposed
write-off. Generic Close issue is invalid.

Problem Detail follows the Object Detail Template: observed fact and Unit · actual date/Site ·
reporter/avatar and evidence · automatic effect on availability/customer risk · current Action ·
connected PO/GRN/SO/DO/Count/Service records · append-only History. A problem completes only from an
authoritative fact: inspection restores eligibility; repair returns and passes inspection;
Purchasing-owned supplier collection is physically completed; a correction is approved; or the
`Stock Adjustment Approver` approves write-off and separate physical-disposal proof later records disposal. Write-off approval
and disposal are never one fact, and no generic `Close issue` may replace either.

Counts are dated Site work. The first count hides the expected list. After submission, differences
are per Unit. A repeat creates new evidence and says **Count these Units again**. Multiple
mismatches say **Find out why {n} Units do not match the count**.

For governed traceable goods, the individually signed-in counter scans each Unit ID. Duplicate
scan, unreadable label and an unregistered Unit are explicit observed results with evidence; a
counter cannot skip required scope and still submit Complete. Only genuinely interchangeable goods
use a quantity count. The first pass offers no `Match all` and reveals no expected Unit list or
expected quantity that could coach the answer.

Submission compares, but never adjusts, the facts. The result separates exact matches, Units not
found, Units found at another Site, unregistered Units, unreadable IDs and duplicates. A result such
as `Portal record 136 · Counted 135 · 132 match · 2 not found · 1 another Site · 1 unregistered`
drills to the affected IDs; the category totals never replace those details.

Cannot find does not reduce Stock. The flow checks last handover and holder, incomplete journeys
and an exact-Unit repeat count. Only an unexplained result becomes a proposed adjustment, and the
proposer cannot approve a material adjustment.

Correct this record preserves the original event, corrected fact, reason, evidence, actor, time and
approval. It is not a stock adjustment. No physical event or submitted report is edited or deleted.

## 7 · Pages and daily journeys

All surfaces reuse the governed Shell, Register, Workspace and Object Detail grammar.

Arrival Schedule and Pickup Schedule are separate full-width six-working-day projections. Registers
have date filters instead of calendar strips. Cards preserve the owning document and Site, use
quiet Expected/Scheduled badges, and show real loading separately from driver acceptance. Delayed
and undated work stays reachable under its real dates; no automatic rescheduling occurs.

The daily journey is: open the appropriate schedule, follow its exact Inbound or Outbound entry,
complete the owning receipt or loading action, and read the resulting Inventory and evidence.
Counts, differences and month-end work belong to their Inventory/control objects and shared Work,
not a second Warehouse Monitor. These capabilities remain approved targets where unbuilt.
Delivery alone owns logistics assignment, driver/vehicle facts and customer delivery dates.
Receiving owns receipt; Warehouse owns preparation/loading; the driver owns independent acceptance.

An individually signed-in NETS operator sees only permitted physical work: receive and check, Count
or Count again, check and pack, hand over, Report a problem and upload evidence. NETS cannot see
purchase cost, Supplier Invoice, customer payment, Adjustment approval or unrelated staff work.

Inbound is the dated projection of physical goods expected to enter Carres control. It answers what
should arrive, what Receiving proved arrived, what has not yet arrived and what Warehouse must do;
it is not a second Receiving form. It covers Purchase Order, Consignment Order, Customer Return,
Site-transfer arrival, supplier replacement and a Unit returning from repair while preserving each
source object's own authority.

**THE RECEIVING WORKSPACE — owner card 2026-09-15. This OVERWRITES the 2026-09-07 unified
register card; that version is in Git history and is not a second authority.**

One row = one dated arrival arrangement with its own goods scope — never automatically the whole
PO, never one row per Unit. A formal split makes its own arrangement counting only its own scope;
a part-received arrangement keeps its remainder; a formal date change preserves history and overdue
work stays under its original date.

**SITE IS A TAB.** Inbound answers *what is arriving HERE*, so the place is the first question and
not a rail row. The strip is built from the governed Sites the operator may see and opens on
`Carres Klang Warehouse`; a partner Site appears because it is a governed Site with receiving
access, never because its name was written into the page. Where a purchasing destination has goods
coming and NO governed Site linked, those arrangements get their own final tab, named and counted,
carrying the destinations' own recorded names — **an unlinked destination is a MAPPING GAP and may
never be rendered as "no incoming goods"**. Those rows carry NO receiving door: goods that never
reach a Carres Site must not mint a warehouse receipt.

**PHYSICAL ARRIVAL AND ACCEPTED FULFILMENT ARE DIFFERENT FACTS.** The Register prints the five
governed receiving quantities (`COPY-STANDARD`), each its own number:

```
Order Qty · Received Qty · Damaged Qty · Wrong Item Qty · Pending Delivery Qty
```

`Received Qty` is the CORRECT goods accepted. `Damaged` and `Wrong Item` are present, unavailable
and reported separately; **they never reduce `Pending Delivery Qty`**, because the supplier still
owes a replacement. Order Qty 10 with six correct, two damaged and two never sent reads
`Received Qty 6 · Damaged Qty 2 · Pending Delivery Qty 4`, and eight pieces are physically in
custody. **FULLY ARRIVED IS NOT FULLY FULFILLED.** Every figure is read from the one receiving/PO
arithmetic (`receivingSummaryOf`); Inbound owns no second subtraction engine. An unreadable receipt
reports the absence — **an unknown quantity is never printed as a zero**. The exact Unit counts
remain the separate PHYSICAL answer the Schedule reads, and the two never merge into one number.

**THE DEFAULT COLUMN SET IS WHAT FITS THE SCREEN (correction 2026-09-15).** The first cut of this
card declared FOURTEEN default columns — 2,130px of them — inside roughly 1,010px of grid at
1280px with the rail open, so every date, every quantity and the `Receive` control sat past the
right edge. **`No page-level horizontal scroll` is not a usability measurement**; the grid scrolls,
and an operator does not find an action they cannot see. A default set is judged by what is
readable together at 1280px, measured, not by how many facts it can name.

**THE GRID'S WIDTH IS NOT THIS PAGE'S TO CHOOSE, so ORDER is what keeps the important things on
screen.** Measured on PRODUCTION 2026-09-15: at a 1,366px viewport the grid is **826px**, because
the portal navigation (240px) and the filter rail (240px) take 480px before it begins. A local
harness that omits the portal navigation reports ~240px more than exists and must never be used to
size a register — the first two attempts at this card were both tuned against exactly that.

The Register defaults, in OPERATIONAL PRIORITY order:

```
Document · Receiving · Product · Receiving progress · Supplier & DO No
      ↑ all inside the visible width at 1280px WITH the portal nav and rail open
PO Delivery Date · Supplier Delivery Date · Status · Exceptions
      ↑ follow, reachable by scrolling
```

**`Receiving` sits SECOND, beside the identity.** The operator sees which document, what to do,
what is in it and how much is still owed before anything scrolls. An action placed after the facts
it belongs to is an action that disappears on the first narrow screen.

`Receiving progress` prints the governed quantities, each with its own number —
`Order Qty` · `Received Qty` · `Pending Delivery Qty`, and `Damaged Qty` / `Wrong Item Qty` when
either is above zero. **`Receiving` sits AHEAD of `Status`** so the action is inside the visible
width by construction. `To` is hidden inside a Site's own tab, where it would repeat that Site's
name on every row, and returns automatically on the `Destinations without a Site` tab where every
row differs. Nothing is deleted: `To` · `Goods received on` · each of the five quantities on its
own sortable, number-filterable column · `PO Issued` · `SO No` all remain one click away in the
Columns chooser and persist once chosen. **No governed font size may be reduced to fit, and no
column may be squeezed below its content** — a column that will not fit leaves the default set.

The arrival-date filter names the date it filters (`Arrival date from … to …`): the date in force,
which is the supplier's evidenced answer where one exists and the PO's own date otherwise.

**MEASURED IN THE BROWSER, not asserted (2026-09-15).** Fourteen default columns rendered 2,243px;
the set above renders **1,286px**, and a governed header is not allowed to set a column's width —
`PO Delivery Date` declared 95px and rendered 143 until the grid's own two-line header
(`headerLines`) let the governed words stand over two rows. Measured at the preview:

```
               grid    fully visible
1366px  prod    826    Document · Receiving · Product · Receiving progress ·
                       Supplier & DO No · PO Delivery Date
1280px          784    Document · Receiving · Product · Receiving progress ·
                       Supplier & DO No
 760px          744    rail collapses to Filters; the grid scrolls, and only
                       the leading columns are reachable without scrolling
```

The default Register uses four columns: Document (supplier, dates and linked Supplier DO receipts),
Receiving, Product, and Receiving progress. Independent sortable/filterable fact columns remain
available in Columns. Composition must be verified with both shell rails present; dates, quantities
and the owning action must be visible without shrinking typography. Narrow devices retain the
document/action first and expose filters in their drawer.

`Document` is the fixed header; the cell prints the record's own number with `PO Issued {date}`
beneath, and a non-PO arrangement keeps its OWN document word (`Transfer No` · `Repair Order No` ·
`Claim No` / `Case No`) — **`PO / Source No` is forbidden**. `Product` lists EVERY product of the
arrangement with its quantity; `+N more` and dropping a product stay forbidden. One product's NAME
wraps in full, and **the quantity is pinned
and never clipped**. `Supplier`/`To` are parties and places; a carrier never substitutes for a
location and a missing origin reads `Origin not recorded`. **Three dates, three questions:**
`PO Delivery Date` is the official date on the PO, `Supplier Delivery Date` is the supplier's own
evidenced answer (`Not confirmed` · `Same as PO` · the different date — absence is tested BEFORE
equality), and `Goods received on` lists each supplier delivery note by its own DO number, linking
to its own receipt and its own actual date. `Status` speaks one progress word; `Exceptions` lists
each named difference beside it — the two never merge. `SO No` remains an optional column.

**THREE ARRIVAL FILTERS, NOT FIVE.**

```
Awaiting receipt    correct goods are still owed     (the menu default)
Received        the required correct goods are accepted
All arrivals    both
```

`Expected`, `Part received` and `With issue` are retired as filters: they overlapped each other and
every other word, and they are FACTS ON THE ROW. A retired deep link falls back to `Awaiting receipt` —
an old link shows the work, never an empty page.

**RECEIVING HAPPENS ON THIS PAGE.** The row's own `Receive` control opens the authoritative
Receiving Workspace FULL-WIDTH on Inbound. It is the SAME component and the SAME write path
Receiving uses — one receiving engine, two hosts — and a Goods Receipt is never squeezed into a
side panel. The Register stays MOUNTED beneath it, so Site, filters, search and list position are
exactly as they were on return. The resolved receiving permission is passed in explicitly: while
the authority is still answering the row says so and offers nothing, and a refusal names the duty
rather than hiding the row. After a successful save the affected row, its quantities, the rail
counts and the receipt records are re-read; a failed save preserves what the operator typed.
Inbound still owns no write path and carries no Work column or duty avatar.

Clicks are explicit: the Document number opens the document; the Product cell (its arrow and its
content are ONE expansion entry) expands the row; a Unit ID inside the expansion opens that Unit's
record; the row itself navigates nowhere. **The expansion has ONE job: the full product detail** —
the complete products with their own quantities, the exact Units with per-Unit results, and every
posted receipt with its supplier DO number and actual date. From the menu the Register defaults to
every UNFINISHED arrangement under its original date; an exact Schedule deep link inherits date,
Site ID and document scope and shows its arrangement even when finished. The rail counts, the
listed rows, the footer summary (counted in arrangements, labelled so) and the export always
describe one shared scope, and a status pick composes with the date filter instead of cancelling it.

**THE GOVERNED RECEIVING SITES — owner ruling, Jess 2026-09-15 (migration 0509).**
`Carres Klang Warehouse` (own) · `AL Sungai Buloh` · `HOUZS Balakong` (both
`operation_partner`, owned by the AL and HOUZS delivery partners, each operated by its own
`warehouse_operator` party — one organisation, two roles, exactly as NETS already is). AL and
HOUZS physically accept goods, so that arrival is that Site's Inbound work; their later handover
to the customer is a SEPARATE outbound/delivery event for the same goods and creates no second
receipt. `Ohana` and `Hookka Industries` remain destinations with NO Site: Ohana delivers straight
to the final customer, and goods that never reach a Carres Site must not mint a warehouse receipt.

🔴 **MEASURED PERMISSION BOUNDARY — RECEIVING AUTHORITY IS NOT SITE-SCOPED, AND NOTHING ELSE
GATES IT (verified against the live database 2026-09-15).** Read from `pg_proc`, not from a file:

- `office_receive_post` opens with `v_ctx := public.receiving_require_post_authority();` →
  `receiving_actor_context()`, **which takes no site argument**. That is the whole authority check.
- The only site test in the entire function is existence:
  `if p_actual_site_id is not null and not exists (select 1 from warehouses where id = …)`.
- `warehouse_holds_capability` — the function that reads a `confirm_inbound_receipt` grant — is
  referenced by `warehouse_grant_capability` and `warehouse_settings_gate` and by nothing else.
  **The capability guards Warehouse Settings; it does not guard receiving.**
- `warehouse_working_hours` is never consulted on the posting path.

**Therefore a holder of GRN duty, its dated cover, or an Operations Superuser can post a receipt at
ANY existing Site**, including `AL Sungai Buloh` and `HOUZS Balakong`. Creating those Sites (0509)
widened where a receipt can land. An earlier version of this section claimed that missing hours and
a missing Site duty holder meant nothing could be received there — **that claim was false**; neither
is a gate. The UI offers the `Receive` control on exactly the same global answer, so screen and
server agree and no false door is drawn. **Whether receiving authority becomes per-Site is an owner
decision and is not assumed here.**

**COUNTED STOCK IS NOT A MISSING RECORD.** A purchase line whose `identity_mode` is `quantity`
mints no Unit IDs by design; calling that arrangement `Records incomplete` accuses the operator of
a gap that does not exist. Only an `exact_unit` scope missing its minted identities is incomplete,
and damage on counted stock is reported by QUANTITY because there is no Unit ID to name.

An individually signed-in NETS operator uses Receiving to scan each actual Unit and record Received,
Received with issue, rejected/not delivered or another governed receipt outcome. After the GRN is
posted, Inbound updates from that authority:

- received acceptable Unit → Inventory at the actual receiving Site/current holder;
- received with issue → Inventory under `Needs checking`, never Ready Stock;
- not yet received → remains in Inbound;
- the supplier/PO consequence routes to Purchasing; Warehouse does not guess a replacement date.

When the expected date passes with no Receiving result, Inbound must not accuse the supplier of
being late. It states `Expected arrival was {actual date}` and `No Receiving result was submitted`,
then routes the dated action `Check whether these {n} Units arrived at {Site}` to the current GRN
Duty. The investigation resolves to one evidence-backed path: complete Receiving if goods arrived;
Purchasing contacts the supplier if they did not; Purchasing records a formally changed promise;
or Receiving records the actual Site and `Needs checking` handles a wrong-Site result.

The expected row remains under its original actual date with `{n} not done` until an authoritative
result exists. Inbound never moves it into `Today`, silently changes its date or treats a planned
arrival as physical Stock.

Inventory is the one current list. Its left rail filters the same Unit authority:

```
STOCK                         WHO HAS IT               OWNERSHIP
All Stock                     NETS Warehouse           Carres Owned
Reserved for Sales Orders     NETS Delivery            Supplier Consignment
Ready Stock                   PJ Showroom
Showroom Display              Other outlets            CONTROL
Service Case                                            Counts & Adjustments
Needs checking                                          History
```

The dated work strip remains above the Register. For the selected actual date it shows only the
Inventory work governed for that date — Count, Count again, investigate a difference, inspect a
problem or decide an Adjustment — with the resolved owner/avatar and concrete action. The Register
below answers the different question, `What physical Stock does Carres control now?`; work dates
never replace or filter away the current-Stock authority unless the operator deliberately selects a
Register filter.

The default current-Inventory columns are:

```
Unit ID · Product · Stock use · Who has it · SO No · SO date ·
PO/Source No · PO/Source date · Received
```

`Unit ID`, SO, PO/Consignment and GRN/source references are clickable. A reserved Unit must expose
the exact SO No and SO date. Every Unit exposes the document that explains why Carres controls it.
No SO No means unallocated only; it does not make the Unit Ready Stock. Goods not formally received
remain in Inbound, not current Inventory. Delivered, returned-to-supplier, written-off or otherwise
ended Units leave the default current list but remain searchable in History with their distinct
lifecycle outcome.

Low-volume purchase categories such as Internal Staff Purchase, Subsidiary Purchase and Other
Purchase remain visible as the Unit's `Category` and connected document while Carres controls the
Unit; they do not require permanent rail rows. `Needs checking` states the exact observed problem,
Unit, recorded holder/Site, finding, resolved owner/avatar, actual date and concrete action. It never
uses a vague `Attention` label. Ready Stock groups eligible Units by Catalog product and Site and
expands to exact IDs. Sales uses `Choose Ready Unit`; Operations uses `Make available for sale` only
after the Unit passes eligibility. Stock owns neither reservation nor release from an SO.

`Make available for sale` is permitted only for an existing Unit whose current Site and `Who has
it` are confirmed, condition and required components/packages are acceptable, ownership permits
sale, and which has no unresolved issue, active transfer, repair, handover or SO reservation. It
does not create Stock. When the checks pass, the same Unit becomes visible automatically through
the shared Ready Stock authority.

Sales reaches that authority through `Sales → Ready Stock`; Operations reaches it inside Inventory.
Both see the same eligible Unit IDs in real time. Sales defaults to `Product · Unit ID · Where ·
Earliest handover` and acts through `Choose Ready Unit`. Operations sees the physical-control facts
and `Make available for sale`. Choosing a Unit atomically creates the Sales Order reservation;
Inventory immediately reads `Reserved for Sales Orders · {SO No}`. Warehouse cannot release or
change that promise. A legal SO release returns the Unit to Ready Stock only if it still satisfies
every eligibility check.

`Needs checking` never stops at a label such as Damaged, Not found or Wrong position. It prints the
full observable fact, Unit ID, recorded Site/holder, latest evidence, actual governed date, resolved
owner/avatar and action. Examples are `U-1003 was reported damaged at NETS Warehouse` / `Check the
damage and record the result by Wed, 2 Sep`, and `U-1012 was not found in the Stock Count; Portal
says NETS Warehouse` / `Look for U-1012 at NETS Warehouse and scan it again by Thu, 3 Sep`.
Carres does not record a NETS internal Zone, Rack or Bin, so a fabricated location such as
`Zone A3` is invalid.

`Counts & Adjustments` contains scheduled counts, submitted counts, differences, recount,
investigation, Adjustment request, Stock Adjustment Approver decision, completion and reversal in one control surface.
The first count is blind. Difference is evidence requiring comparison and recount; it is not an
automatic Adjustment.

The page starts with the shared actual-date strip. Its Register defaults are:

```
Count No · Site · Stock date · Count date · Must submit by · Result · Work
```

It retains scheduled, submitted, differences found, Count again, investigation, Adjustment waiting
for the Stock Adjustment Approver, completed and reversed records in this one view. The governed path is:

```
blind first Count → compare → Count again → investigate Receiving/handovers/Delivery/repair/
Transfers → record result → Correct this record OR Request Adjustment → Stock Adjustment Approver decision
```

NETS performs physical Count and Unit-level Count again with evidence. The current GRN Duty
investigates a persistent difference and submits any Adjustment request. Only the resolved
`Stock Adjustment Approver` approves or
rejects an Adjustment or write-off; the requester cannot approve it. An Adjustment request exposes
Unit, Portal fact, first and second Count results, last evidence, investigation performed, requester
and approval state. Original Count and investigation evidence remain immutable.

`Correct this record` applies when the physical Unit exists and an earlier Portal fact was wrong. It
preserves before, corrected fact, reason, evidence, actor, actual time and required approval and is
not a quantity Adjustment. `Request Adjustment` is available only when recount and evidence review
cannot explain the physical difference. Reversal preserves the posted Adjustment and records the
counter-event; nothing material is deleted.

Outbound is a dated Warehouse work page, not a document, second DO or inventory-event register. It
brings together every governed reason physical goods leave a Site: customer DO, Site transfer,
Supplier Return, send for repair, Internal Staff Purchase and Subsidiary Purchase. The source module
continues to own why the movement exists; Outbound tells the assigned NETS Warehouse operator what
must physically be checked, packed and handed over on each actual date.

One Outbound row is one DO + Site scope. Defaults are Document (DO/SO, scheduled handover,
origin/destination, logistics/driver), Loading, Product, and Units (Required / Loaded / Not loaded /
Driver confirmed, with named differences). Optional fact columns preserve sorting and filtering.
Product expansion only exposes product and exact Unit identity. Loading opens the existing work
surface full width with scans, checks, packing, loading evidence and separate driver confirmation.
The default includes outstanding loading, missing evidence and unmatched driver acceptance;
Not loaded yet, Awaiting driver confirmation, Loaded and Evidence not submitted remain specific
filters. Loading completion never claims the driver's act. Counts, rows and exports use one scope.

The NETS operator journey is:

1. Sign in with their own email and open the actual work date.
2. Open the source DO, Transfer, Supplier Return or Repair record and scan every exact Unit ID.
3. Check product, visible condition, required components and packaging; then pack where required.
4. If an observable problem exists, use `Report a problem` with the governed evidence. The operator
   cannot substitute a Unit, change the source order or guess a business outcome.
5. Hand the Unit to the named receiving party and submit minimum scan/photo/handover evidence.
6. Only the completed physical handover changes `Who has it`; a scheduled plan alone never moves
   authority from NETS Warehouse to NETS Delivery, showroom, supplier or repair partner.

Delivery owns customer DO, journey, Logistics and customer-delivery proof. Stock owns the
Unit's current holder and physical history. Purchasing owns Supplier Return and supplier decision.
Service Case owns the repair need and resolution. Outbound stores no duplicate business status.

Inbound, Inventory and Outbound use the shared cross-module reconciliation contract in
`../ERP-ARCHITECTURE.md` §3.5.1. They do not ask an operator to tally Receiving or Delivery again:

- Inbound reads `Order Qty · Received Qty · Damaged Qty · Wrong Item Qty · Pending Delivery Qty`
  from the PO/Consignment and Receiving Session/GRN through the ONE receiving arithmetic; damaged
  and wrong goods never reduce `Pending Delivery Qty`. Only posted arrival facts enter Inventory.
- Inventory derives the current Unit and `Who has it` from the append-only arrival and handover
  facts; each Unit has only one current answer.
- Outbound reads the exact Units required by the source DO, Transfer, Supplier Return or Repair
  record and prints `Required · Loaded · Not loaded · Driver confirmed` with drill-down to IDs.
- Partial receipt or handover changes only the affected Units. Any quantity disagreement preserves
  both parties' evidence and creates a dated `Needs checking` action.

Unit Detail follows the governed Object Detail Template and is titled by Unit ID and product. Its
current-facts block shows Stock use, Where, Who has it, ownership, condition and last verified. Its
connected-records block shows clickable SO, PO/Consignment, GRN, Transfer, DO, Service/Repair and
Count records where present. Current Work renders the one shared Action contract; History renders
append-only receipt, reservation, Count, preparation and handover facts with actual actor/evidence.
There is no generic Edit, status selector or Delete.

- NETS Warehouse opens dated Work, scans receipt, Count and handover, and supplies evidence.
- NETS Delivery scans collection and arrival; unresolved Units remain visibly with it.
- Showroom scans arrivals and departures, sees and counts its Site, and reports observations.
- Carres Warehouse / Stock maintains evidence-backed Unit truth, exceptions, returns and month-end.
- Finance receives frozen month-end facts and never edits Units.
- Management decides material exceptions; approval never replaces physical proof.

NETS is an organisation, not one avatar. Every NETS operator uses an individual email login and
appears by their own name/avatar on count, receipt, recount and handover evidence. Shared NETS
credentials are invalid. Carres staff ownership does not become NETS ownership merely because NETS
performed the physical act.

## 8 · Work and dates

Warehouse uses the one shared Work Engine. Owner and cover are structured metadata, not sentence
text. The business object has no fake universal Owner. Labels tell a new operator the concrete act;
completion is an authoritative fact, never Mark done.

Warehouse Settings contains no Duty roster. Supplier/PO problems use `Current PO Duty`; receiving,
persistent stock differences and adjustment requests use `Current GRN Duty`; adjustment approval
uses `Stock Adjustment Approver`; physical Count/recount and outbound handover use the assigned NETS individual; customer
delivery problems use the Delivery ownership rule. Every displayed avatar is the Shared Work
Engine's resolved owner. Stock pages do not save `assigned_to`, read a rota table or calculate PO /
GRN Duty.

Every Work row has an actual weekday and date; appointments also have time. Warehouse work is never
grouped under `Today`, `Tomorrow`, `Upcoming` or a generic `Overdue` heading. Without a governed real
date, the action contract is incomplete and cannot enter Work.

- current year: Tue, 18 Aug;
- non-current year: Fri, 1 Jan 2027;
- with time: Tue, 18 Aug · 10:42 AM;
- standalone formal reports, audit evidence and cross-year ranges show the year.

The Inventory rail finds Units. Quick Rail finds actions. Calendar shows dated Count, collection,
arrival, return, inspection, repair, supplier collection and month-end commitments.

Every Warehouse Action uses the shared contract `Trigger · Owner rule · Resolved owner · Action ·
Completion fact · governed date · source object · cover rule`. Module rows render the owner as a
separate avatar/metadata chip and keep the sentence to the action. My Work omits the current user's
repeated avatar and groups under actual dates; owner context appears only for cover/handover.
Team Work groups the one work set under avatar/full name and `{n} actions to do · {n} late`, then
shows source identity, fact and action without repeating the grouped person on every row.

The shared Quick Rail remains `Team · Calendar · My Work · Activity`:

- **Team** shows every active Carres staff member, including zero work, current PO/GRN Duty,
  Buddy cover and counts from the same Work Engine. `Workspace → Staff & Duties` is the only Duty
  edit door; Team is a read-only workload/coverage view. External NETS
  people appear only inside their permitted Warehouse/partner scope; they do not gain the full
  Carres team view.
- **Calendar** projects expected arrivals, Counts/Count again, collections, arrivals, Outbound
  handovers, returns, repair out/back, supplier collection and Month-end commitment on their actual
  dates. It deep-links to the source and never edits it.
- **My Work** is only the compact preview of formal My Work, never another work set.
- **Activity** projects append-only Unit/receipt/Count/handover facts with actual date/time,
  actor/avatar and source link. It never replaces Unit or object History.

Open actions re-resolve when duty, cover, active staff or last-working-date facts change; completed
actions and historical actors/evidence never change. One active Carres staff member may visibly
hold both PO and GRN Duty. With any assignable staff, routine duty-owned Work cannot say
`Not assigned`.

NETS physical Work first belongs to the authorised organisation/Site queue when no individual has
accepted it. The first authorised NETS person to accept or begin the governed scan becomes the
resolved individual operator; organisation and personal identity both remain visible. If that
person is disabled before work starts, it returns to the authorised queue. If work has started, a
governed handover to an authorised replacement preserves the first person's scans/evidence and
names the replacement. A shared `NW` identity may never stand in for multiple people.

Warehouse does not create another rota. It consumes the one approved PO Duty / GRN Duty rotation
through the shared Duty Resolver and Work Engine governed by `../ERP-ARCHITECTURE.md` Law F. Team is
the one duty edit door; People supplies active/access and last-working-date facts; Warehouse pages
may only render the returned resolved owner/avatar. The duty model itself remains in
`../purchasing/MASTER.md` §2.2:

- NETS's individually identified operator performs the physical count or recount.
- The current GRN Duty investigates a persistent Stock difference and, when evidence cannot resolve
  it, submits the Adjustment request.
- The current PO Duty owns supplier/PO follow-up and Supplier Claim work.
- Only the resolved `Stock Adjustment Approver` approves a material Adjustment, write-off or unexplained major difference; the
  requester cannot approve it.
- When a Carres staff member leaves, the shared duty engine removes them from the effective-date
  assignment pool and automatically re-resolves open and future Warehouse Actions. Two active staff
  rotate PO/GRN Duty; one active staff holds both. Historical actor and cover evidence never change.

## 9 · Month-end Stock Confirmation

Each month produces a formal Month-end Stock Confirmation:

- Stock date: final calendar day at 11:59 PM;
- count date: actual date, allowed within two calendar days before or after Stock date;
- submission date: governed Warehouse date after the window.

The page prints all three as actual dates, for example `Stock date Mon, 31 Aug · Actual count Tue,
1 Sep · Must submit by Wed, 2 Sep`. A Count performed inside the permitted window keeps its true
Count date. The Portal reconciles every receipt, handover, Delivery, return and correction between
the Count time and Stock date; it never pretends the late/early Count happened at month-end.

If the submission fact does not exist by the governed date, the original date reads `not done` and
the shared Work Engine keeps two distinct responsibilities visible: the named NETS operator must
complete and submit the physical Count, while the current GRN Duty receives the dated action to
check why NETS has not submitted. Neither action becomes a generic `Overdue` reminder.

Stock operations never close. The Portal reconciles exact timestamped Unit events between count and
Stock date; it never guesses, backdates or adjusts a total to match. The frozen report separates
Carres Owned, Supplier Consignment, Reserved for Sales Orders, Ready Stock, Showroom Display, each
recorded journey holder, `Needs checking`, approved Adjustments and unresolved differences. Every
section and total drills to exact Unit IDs, source documents and evidence; a summary number without
that lineage is invalid.

Warehouse may submit on time with disclosed unresolved differences. Finance acknowledges a specific
version. Submission therefore may truthfully read `136 Units confirmed · 3 unresolved differences`
and expose the three Units, first Count, Count again, current investigation, resolved owner, next
actual work date and any required Stock Adjustment Approver decision. Staff do not manufacture a zero-difference report
to meet Finance's deadline.

Finance may `Acknowledge Version {n}` for valuation and reporting. It cannot edit a Unit, holder,
Count, difference, Adjustment or physical event and must not save another month-end Stock total.
Purchasing supplies ownership and PO/Consignment source facts; Sales Order supplies reservations;
Delivery supplies handover and journey-holder facts. Reading those consequences never transfers
their write ownership into Finance or Month-end.

A later resolved difference or corrected physical fact creates a reasoned Version 2 containing the
new evidence; Version 1 remains immutable and identifiable as the version Finance previously
acknowledged. No new version silently overwrites history, and Finance valuation always identifies
the exact acknowledged version it used.

The dated Work set keeps the acts separate: NETS counts on its actual date; the current GRN Duty
reconciles and submits by the governed submission date; the `Stock Adjustment Approver` decides any
Adjustment on its own actual date. Completion comes from the Count submission, Month-end submission or stored approver decision fact,
never a generic `Mark done`.

## 10 · Permissions

- Sales searches and chooses through Sales Order, and reports issues; no physical edits.
- Purchasing owns PO, Consignment, supplier, claim and Sold to Settle; no physical handover/payment.
- NETS Warehouse owns only assigned receipt, warehouse handover, evidence and Count execution.
- NETS Delivery owns only assigned collection, transport, arrival, return and evidence.
- Showroom owns only its Site arrival, count and observation.
- Warehouse / Stock owns Unit, location, condition, availability control, differences, returns and
  month-end; no commercial terms, customer promise or payment.
- Finance owns invoice, settlement, payment, valuation and report acknowledgement; no Unit edits.
- The `Stock Adjustment Approver` is the sole resolved approver for material adjustment, write-off,
  compensation and major dispute; approval does
  not replace evidence.

No person completes demand, ordering, receipt, stock adjustment and payment end to end. Cover moves
Work but grants no new capability.

## 11 · Reports, Settings and external boundary

Reports cover Stock by Site, product, ownership and availability; Showroom; stale verification;
receipt, Transfer and Count; partner evidence; current issues; corrections and adjustments; and
month-end versions. Reports are read-only. Export never becomes authority.

The shared Reports destination exposes the Warehouse catalogue, not repeated buttons on every
page: `Current Stock · Ready Stock · Showroom Stock · Stock by Ownership · Receiving & Inbound ·
Outbound & Handovers · Transfers · Stock Counts · Stock Differences & Adjustments · Problems &
Condition · Month-end Stock Confirmations · Partner Evidence · Unit History`.

- **Current/Ready/Showroom/Ownership:** expose exact Unit ID, Product, Stock use, Site, `Who has it`,
  ownership, SO and source document, condition and last verified. Ready Stock also exposes earliest
  handover and days available; every total drills to IDs. Showroom separates Carres Owned,
  Consignment, Reserved/awaiting Delivery and `Needs checking`, plus last Count/condition check and
  display since. A bare `Available Qty` is invalid.
- **Receiving & Inbound:** expose source, Supplier/source party, expected arrival, actual received,
  Expected/Received/Not yet received/With issue, Receiving Session/GRN, submitter and poster. Promise
  provenance distinguishes supplier commitment from Carres estimate before lateness is attributed.
- **Outbound/Handovers/Transfers:** expose actual date, DO/Transfer/Return/Repair and SO No, From,
  To, Required/Handed over/Not handed over, individually identified parties and evidence. Partial
  events stay Unit-level.
- **Counts/Differences/Adjustments:** expose Count No, Site, Stock date, actual Count/submission,
  counter, Portal/Counted/matched/difference IDs, first Count, Count again, investigation,
  correction, Adjustment request, Stock Adjustment Approver decision and reversal. A final adjusted total may not hide the
  original Count or merge Difference with Adjustment.
- **Problems & Condition:** expose observable problem, Unit, holder/Site, actual reported date,
  reporter/evidence, affected SO/customer consequence, current Action/resolved owner, completion
  fact and distinct physical outcome; `Closed` alone is not a reportable outcome.
- **Month-end:** expose Stock date, version, Count/submission, confirmed Units, unresolved
  differences, approved Adjustments, Finance acknowledgement and the version used for valuation.
  Versions remain separate.
- **Partner Evidence/Unit History:** expose individual actor as well as organisation, Site/journey,
  scans, Count, handover/arrival, missing evidence and late submission, plus the Unit's append-only
  event chain. An organisation name cannot hide who performed the act.

Every export prints generation time/person, applied filters, Stock/report date, version, Unit-level
rows and source document numbers. It is a fixed snapshot, cannot be uploaded to overwrite Portal
truth and never becomes a second authority.

Report visibility follows need: Sales receives Ready Stock and permitted showroom availability;
NETS receives its authorised organisation/Site work/evidence; Purchasing receives Receiving,
ownership, Consignment and supplier consequences; Finance receives Month-end/ownership/valuation
facts; management receives all Warehouse reports and approval evidence. Cost, settlement, customer
payment and unrelated-outlet information remain hidden where the role does not require them.

The only Warehouse Settings entry is `Page Header → Settings → Warehouse`. No Inventory rail,
Monitor, panel or object menu may create a second Settings door. Settings governs rules/master data
only; it never edits a Unit, reservation, Count result, Transfer/event or Month-end version.

**THE BUILT SURFACE — PRODUCTION-VERIFIED, owner card 2026-09-09, migrations 0456 · 0457 · 0458.**
Merged in PR #1191 (`05b36bd8`) and PR #1194 (`d3630bea`); both Pages projects and the Worker
report `d3630bea`. Walked signed in at `erp.carresofficial.com/operation/settings/warehouse/*`
with the app's own stylesheet applied: the five rail rows, the identity block
`Carres Klang Warehouse / Operated by NETS Warehouse · Active`, a disabled `Save changes`, every
weekday `Not configured` for both activities, `Public-holiday policy    Not configured`, no
calendar imported, no Special Date, and every capability held by nobody. `Settings → Warehouse`
is a
live route with five rail sections and ONE `Save changes`, disabled until something changes and
naming its gap when a value would be refused:

```
Warehouse Settings                              [Save changes]
Carres Klang Warehouse
Operated by NETS Warehouse · Active

Warehouse Details · Working Hours · Public Holidays · Special Dates · Access
```

- **Warehouse Details** — `Warehouse site · Status · Operated by · Full address · Time zone ·
  Key contact · Contact number`. `Operated by` is an ORGANISATION and `Key contact` is a PERSON;
  the two are separate fields and neither may be typed free-hand. **Both are narrowed at the
  door, not only in the picker** (0458, from the production walk): the operating organisation
  must be an active `warehouse_operator` — the twelve `delivery_operator` rows and the showroom
  are real organisations performing a different role and are refused — and a key contact must be
  a real individual, which this ERP defines as an active account carrying a **CRnnn staff code**.
  The four active role mailboxes (`BD@` · `finance@` · `operation@` · the E2E login) carry none
  and are therefore not people; §11 already forbids shared company credentials from the other
  side. Carres records no individual NETS Warehouse
  operator, so the key contact reads `Not assigned` / `No individual recorded`, and the address and
  contact number read `Not configured` until somebody verifies them.
- **Working Hours** — a seven-day table with SEPARATE `Receiving hours` and `Collection hours`.
  Either may be `Closed` while the other is open. **No day is seeded and Sunday is not assumed
  closed**: a day with no row reads `Not configured`. A window may be cleared back to unconfigured.
- **Public Holidays** — `Follow public holidays · Country · State · Observed/replacement holidays ·
  Default public-holiday availability`, whose choices are `Closed · Receiving only · Collection
  only · Normal working hours · Special hours`. Malaysia and Selangor are selectable; the policy is
  never silently enabled and reads `Public-holiday policy    Not configured` until saved. Holiday
  DATES live in a versioned, locally persisted calendar that names its source, its reference and
  when it was verified. **No date ships and none is invented** — the starter list in
  `packages/shared/src/my-holidays.ts` is deliberately not copied in, because its own header says
  eleven of its rows are unverified. **There is no automatic official-calendar sync**, and the page
  says so.
- **Special Dates** — `Closed all day · Receiving unavailable · Collection unavailable · Special
  receiving hours · Special collection hours`, each with a REQUIRED reason, split into Upcoming and
  Past. A Special Date whose day has passed is history: the door refuses to create or change one.
- **Access** — `Manage Warehouse Settings · Confirm inbound receipt · Confirm collection from
  Warehouse · Perform stock count`, granted to ACTIVE People only — the same CRnnn person test,
  so a shared or role account can never hold a Warehouse capability. A grant is never deleted;
  revoking stamps it, so the audit still says who held what and when. **`Manage Warehouse Settings`
  is enforced** — it widens the manager gate, additively, so nobody who could already configure
  Warehouse lost anything. The other three are recorded configuration whose acts are still
  authorised by the doors that own them today (GRN Duty for receiving; the signed-in Site operator
  for handover; Counts are not built), and each row states that on screen rather than implying an
  enforcement that does not exist. No Warehouse capability reaches a Delivery date, ETA, route or
  customer-delivery information.

**SCHEDULE PRECEDENCE — one arithmetic, `packages/shared/src/warehouse-settings.ts`.**
`Special Date override → Company closure (the Site's own Status) → applicable public-holiday policy
→ normal weekly working hours`, and `Not configured` when nothing above answers. The resolved day
always says WHICH rule decided it. There is deliberately no SQL copy of the ladder.

**THE FOLLOWING REMAIN APPROVED TARGET / NOT BUILT.** They are the rest of the approved Settings
surface and are not deleted by the card above:

- **Stock Count:** maintain participating Sites, monthly/cycle rule, scope, blind first Count,
  Count-again and evidence requirements, physical-person assignment mechanism and `current GRN
  Duty` investigation rule. `Match all`, automatic difference Adjustment and complete-with-skipped-
  scope are invalid settings.
- **Month-end:** maintain final calendar day at 11:59 PM, the permitted two-calendar-day Count
  window and the submission-date rule over the Warehouse calendar. Each month's record, actual
  Count, submission and version remain Month-end facts, never settings.
- **Problems & evidence:** maintain only observable reason choices and their minimum scan/photo/
  receiver/factual-note evidence. Quarantine, Hold, Claim, write-off, compensation or replacement
  are downstream outcomes and cannot become observer reasons.
- **Unit ID:** maintain format, governed product scope, supplier-label requirement, duplicate
  prevention, replacement-label rule and never-reuse law. Settings cannot rename an existing Unit;
  label error enters `Report a problem`.
- **Permissions & approvals:** capability follows role/duty, never a hard-coded email. NETS
  Warehouse, NETS Delivery, Showroom, GRN Duty, PO Duty, Sales, Purchasing and Finance receive only
  the actions stated in §10. The governed approval Duties resolve approval work; a permission never overrides
  segregation or evidence. **PARTLY BUILT** — the `Access` section above holds the four Warehouse
  capabilities; the per-organisation and per-Site scoping of them is not built.
- **External partners:** maintain organisation, warehouse/delivery roles, governed Sites, calendar,
  allowed actions, evidence requirements and active dates. No rule hard-codes NETS, so another 3PL
  or a future Carres-operated warehouse uses the same Unit/Receiving/Inventory/Outbound model.

**Workspace → Staff & Duties** is the one place to view or correct PO Duty, GRN Duty and
Buddy cover. The governed **People** record supplies identity, active status, access, leave and last
working date. Warehouse Settings links to those homes and must not copy either Duty assignment or
employment truth.

### External warehouse / NETS Portal boundary

Carres Portal is the Stock authority and minimum control plane. NETS or another future partner
receives narrow mobile Work, scan, observable outcome and evidence surfaces, not the full ERP and
not a second inventory ledger.

The permitted external work is deliberately small and written as actual dated actions:

- **NETS Warehouse:** receive and check the listed Units; Count or Count again; check and pack the
  listed Units; hand them to the named next party; report an observable problem; add the required
  scan, photo, receiver and factual note.
- **NETS Delivery:** collect the listed Units; record actual collection; record actual arrival or
  return; identify the person who handed over and received; report an observable problem; add the
  required scan, photo and proof.

An external operator may submit only the fact they personally observed. They cannot create or edit
a PO, SO, DO, customer promise, cost, price, settlement, ownership, Ready Stock decision,
reservation, Stock Adjustment or approval. They cannot rewrite Unit History, delete an event or
move a Unit merely by changing a status. A validated receipt, collection, arrival, return or
handover event is what changes the authoritative holder.

NETS is an organisation, never one user. Every person signs in with their own email and carries
their own name/avatar, organisation, authorised role, governed Sites and active dates. A person may
hold both NETS Warehouse and NETS Delivery roles, but every event records the role used for that
act. Shared login, shared avatar and impersonation are forbidden. Removing or expiring one person
stops future access without erasing their historical evidence.

Optional partner APIs may **propose** receipt, collection, arrival, return and proof events. Before
acceptance, Portal validates the partner organisation, individual operator, active role, permitted
Site/journey, source document, exact Unit ID, event order, duplicate submission, actual time,
evidence and current holder. An integration may never overwrite the Unit Register, Ready Stock,
reservation, approval, Count/Adjustment, append-only history or a previous event.

Offline scans remain visibly `Not submitted` and change no inventory fact until Portal accepts
them. Every accepted offline event preserves both the actual scan time and submitted time; a late
upload cannot pretend it was submitted on time.

Where a partner cannot use Portal, an authorised Carres operator may record the partner's physical
fact on its behalf only when the record identifies the Carres recorder, actual partner
organisation, actual external person where known, actual event time, recorded time and minimum
evidence. A sent message or WhatsApp request alone is not receipt, handover or delivery proof.

The same contract is future-ready. Replacing NETS with another 3PL, or operating a Carres warehouse
in the future, changes the operating organisation, people, Sites and permissions; it does not
change the Unit, Receiving, Inventory, Outbound, Count, evidence or Work Engine contracts.

The model never hard-codes NETS. Site, operating party, role, permission, calendar and evidence
remain separate. Current scope rejects unproven heavy-WMS bin, rack, put-away, pick-wave, forklift
and packing-station complexity. Zone, Rack or Bin may extend the same Unit model when measured need
justifies it.

## 12 · 2990 and mature-ERP capability rulings

These rulings are operating recommendations, not a product-copy matrix. 2990 is challenged together
with current Carres. Useful capability is adopted into the governed Carres Shell/Register/Object
Detail system; unsafe terminology, layout, authority or business rules are rejected.

### 12.1 Inventory authority and stock finding

**CURRENT CARRES →** Unit ID, On hand/Reserved/Free information, Ready Stock and PO/SO lineage
exist, but legacy Unit rows, `stock_balances` totals and page calculations can disagree.

**2990 / MATURE ERP LESSON →** keep 2990's product-to-warehouse/batch/movement drilldown,
source-document Stock Card links and ageing/availability analysis. Mature serial systems confirm
that totals must trace to physical Units. Reject 2990's signed-quantity centre, negative-stock or
ship-despite-shortage behaviour, duplicate rack/bin quantities and accounting-led Warehouse view.

**RULING → KEEP + ADAPT + IMPROVE + REJECT.** Keep Carres Unit ID; adapt progressive drilldown and
source-linked history; improve every quantity into a derived projection of exact Units; reject
editable totals, negative Stock and a second Rack/Bin ledger.

**RECOMMENDED CARRES BUSINESS FLOW →** Purchasing explains acquisition; Receiving proves the exact
Units received; Inventory states current holder, Site, condition and Stock use; Sales Order binds
an eligible Unit; accepted Outbound/Delivery handovers change holder; Count compares Portal truth
with the physical Units. No page or integration may directly set an `Available` total.

**OPERATOR JOURNEY →** open Inventory; search Unit ID, SKU, SO No, PO No or product; filter Stock,
`Who has it` and ownership through the left rail; expand every total to exact Units; open Unit
Detail for source, reservation, handover, problem and append-only history.

**UI / PAGE / OBJECT PLACEMENT →** Inventory is the one Register under `Arrival Schedule · Pickup Schedule · Inbound ·
Inventory · Outbound`. Defaults are `Unit ID · Product · Stock use · Who has it · Site · Condition
· SO No · SO date · PO No · PO date · Expected arrival · Last verified · Work`. Ready Stock is a
saved view of the same authority; Sales and Operations read the same eligible Units with different
permissions. History belongs in Unit Detail and the Inventory rail, not a second accounting Stock
Card destination.

**CROSS-MODULE CONNECTION →** Purchasing owns PO/Consignment reason; Receiving owns receipt;
Sales Order owns reservation; Delivery owns journey proof; Finance consumes physical events for
valuation without editing location; Reports remain read-only projections.

### 12.2 Inbound and Receiving-to-Inventory handoff

**CURRENT CARRES →** PO/Consignment expected arrivals and Receiving/GRN exist, but legacy Stock
Add, import or quantity mutation can act as a contradictory second receipt door.

**2990 / MATURE ERP LESSON →** keep 2990's GRN-linked inbound movement, source document, actual
date and received/not-received/issue visibility. Mature systems confirm that receipt acceptance and
subsequent inventory control are separate responsibilities. Reject optional Rack/Bin placement in
Carres Receiving, a second Warehouse Stock In action and automatic saleability immediately after
posting.

**RULING → ADAPT + IMPROVE + REJECT.** Receiving/GRN is the one normal physical receipt door. Every
governed Unit records `Received`, `Received with issue`, `Rejected/not delivered` or the applicable
observable receipt result. Warehouse Add Stock, direct import into physical Stock and NETS
Rack/Bin/Zone placement are rejected; receipt never makes a Unit Ready Stock without eligibility.

**RECOMMENDED CARRES BUSINESS FLOW →** PO, Consignment, Return, Transfer or Repair supplies expected
Units and actual work date; NETS Warehouse opens the linked Receiving Session; the individually
identified operator scans and checks each Unit; accepted GRN facts project into Inventory. Normal
received Units show actual Site/holder and are tested for eligibility; issue Units enter `Needs
checking`; rejected/not-delivered Units do not enter physical Stock; partial receipt preserves both
the accepted Units and outstanding expected Units; unknown or wrong-Site Units enter investigation.

**OPERATOR JOURNEY →** open Inbound on the Site's tab; read source and exact expected Units; choose
`Receive` ON THE ROW; scan each Unit and record only the observed result/evidence; save the
session; read the resulting `Received Qty` / `Pending Delivery Qty` / `Damaged Qty` beside the same
row, without having left the list. No operator repeats the
receipt through Inventory.

**UI / PAGE / OBJECT PLACEMENT →** Inbound's Register defaults, Site tabs, three filters and the
five governed receiving quantities are the receiving-workspace card above (owner card 2026-09-15).
Inbound is the dated work/progress Register and now HOSTS the one Receiving Workspace full-width;
the Receiving Session remains the only submit door and the only write path; Inventory has no Add
Stock action; the Register carries no Work column or duty avatar. Unit Detail links Receiving Session,
GRN, individual receiver, actual date and evidence. No NETS internal Rack, Bin, Zone or placement
task appears.

**CROSS-MODULE CONNECTION →** Purchasing owns PO/Consignment and supplier promise; Receiving owns
receipt; Stock owns the accepted Unit/holder/condition/eligibility; Supplier Claim receives product,
quantity or damage consequence; Sales Order reads availability risk; Finance uses GRN and physical
facts to verify Supplier Invoice.

### 12.3 Ready Stock, Sales Order reservation and manually purchased goods

**CURRENT CARRES →** legacy `Free`, Ready Stock, no SO No and Manual Purchase can be mistaken for
the same fact; Ready Stock can appear as both a purchase plan and physical availability, and Sales
and Operations may read different lists.

**2990 / MATURE ERP LESSON →** keep 2990's On hand/Reserved/Incoming/Available distinction,
oldest-suitable recommendation, source drilldown and sofa set/batch integrity. Mature reservation
systems bind an obligation to eligible physical supply. Reject quantity-only reservation,
ship/reserve despite shortage, silent substitution and UI language stored as database buckets.

**RULING → IMPROVE + ADAPT + REJECT.** Ready Stock is an eligible saved view of the one Unit
Register. The engine may recommend the oldest suitable Unit while Sales retains governed choice.
No SO No means only unallocated; Manual Purchase means only the acquisition route; neither makes a
Unit Ready Stock. Negative reservation, quantity-only promises and silent replacement are invalid.

**RECOMMENDED CARRES BUSINESS FLOW →** Manual Purchase keeps one explicit category: `Ready Stock`,
`Showroom Display`, `Service Case`, `Internal Staff Purchase`, `Subsidiary Purchase` or `Other
Purchase`. After Receiving, the Unit retains that source category. A `Ready Stock` purchase still
appears for Sales only when it is received, correctly identified, complete, acceptable, unreserved
and free of issue/repair/transfer/control. Another unallocated Unit enters the view only through
authorised `Make available for sale` and the same eligibility validation. Sales uses `Choose Ready
Unit`; successful selection atomically binds the exact Unit to the SO. A governed SO release returns
it to Ready Stock only if it remains eligible.

**OPERATOR JOURNEY →** Sales opens `Sales → Ready Stock`, searches product/SKU/configuration/Site,
reads exact Unit, holder, condition and earliest handover, then chooses the Unit and SO line.
Operations opens `Inventory → Ready Stock`, reads the same Unit IDs plus physical/source facts,
uses `Make available for sale` where permitted or `Report a problem`; Operations cannot substitute
or release the SO promise.

**UI / PAGE / OBJECT PLACEMENT →** the Inventory rail contains `Reserved for Sales Orders · Ready
Stock · Showroom Display · Service Case · Needs checking`. Operations Ready Stock defaults to `Unit
ID · Product · Who has it · Site · Condition · PO No · PO date · Received date · Days available ·
Earliest handover · Work`. Sales uses a permission-reduced projection of the same Units. Unit Detail
shows Stock use, eligibility, reserved SO, source purchase category and PO/Receiving history.

**CROSS-MODULE CONNECTION →** Purchasing owns purchase category/PO; Receiving proves receipt;
Stock owns physical eligibility and `Make available for sale`; Sales Order owns choose/bind/release/
substitute; Delivery consumes the exact reserved Unit and dated readiness; Finance owns cost and
ownership accounting without deciding sale availability.

### 12.4 Observable problems and Needs checking

**CURRENT CARRES →** legacy `Hold`, `Quarantine` and `Attention` wording does not explain what
happened or what an inexperienced operator must do. Damage can be confused with immediate
write-off; `Wrong position` invents an internal NETS location Carres does not record; Case/Claim
state can be mistaken for physical Unit state.

**2990 / MATURE ERP LESSON →** keep structured reason, factual note, actor/date and append-only
correction history. Mature quality control confirms that suspect goods must immediately stop
downstream use. Reject direct damage quantity adjustment, a general plus/minus form and a generic
quality/quarantine object that competes with Carres Receiving, Stock, Claim and Service authority.

**RULING → ADAPT + IMPROVE + REJECT.** An observed problem automatically removes the affected Unit
from Ready Stock and blocks new reservation/handover while retaining its last confirmed holder.
The Portal uses `Needs checking` plus the exact fact and action. It rejects `Attention`, `Hold`,
`Quarantine`, automatic write-off and `Wrong position`; the correct fact is a holder/Site or
handover mismatch.

**RECOMMENDED CARRES BUSINESS FLOW →** an authorised person reports only an observable reason:
`Damaged · Not found · Unexpected Unit · Wrong Unit/product · Missing component · Label/Unit ID
problem · Portal holder does not match the physical handover · Evidence not submitted`. Required
scan/photo/receiver/factual note is captured. Portal applies the immediate control, creates the
shared dated Action and routes the commercial/physical consequence to the governing owner. A later
accepted inspection, handover, receipt, repair outcome or approved Adjustment completes the Action;
there is no independent Mark done.

**OPERATOR JOURNEY →** from Receiving, Inventory, Outbound, Showroom or Delivery choose `Report a
problem`; scan/select the Unit; choose what was actually observed; provide the minimum evidence;
read the plain consequence; then the individually identified NETS operator, current GRN Duty,
current PO Duty, Delivery owner or COO receives the concrete action according to the shared Duty
Resolver. The observer never guesses Claim, compensation, replacement, write-off or another final
outcome.

**UI / PAGE / OBJECT PLACEMENT →** Inventory rail uses `Needs checking`. Every row shows `Unit ID ·
What happened · recorded Who has it · actual Site · reported date · reporter avatar · evidence ·
resolved owner avatar · action · source document`. Unit Detail shows `Current control · Observed
problem · Evidence · Work · Business consequence · Physical outcome · History`. Monitor,
Inventory, My Work and Team Work render the one Action; no second Problems Register is created.

**CROSS-MODULE CONNECTION →** Stock owns physical availability, last confirmed holder and
investigation fact; Receiving owns receipt observations; Purchasing owns Supplier Claim/exchange/
supplier return; Delivery owns transport and handover investigation; Service Case owns customer or
product service; Sales Order displays promise risk only; the `Stock Adjustment Approver` alone
approves governed material Adjustment, write-off or unexplained major difference.

### 12.5 Stock Count, Difference and Adjustment

**CURRENT CARRES →** a Receiving count control is not a formal Stock Count. Legacy design lacks one
complete Count object, blind first Count, Unit-level variance, Count again, investigation,
approval and history; separate Stock Take/Difference/Adjustment pages or direct Add/Remove can
fragment the same control journey.

**2990 / MATURE ERP LESSON →** keep 2990's expected snapshot, untouched-versus-zero distinction,
scoped count, actor/date, found/lost variance, terminal result and history. Dynamics/Odoo reinforce
blind first Count, worker-scoped execution, scheduled cycle counts and supervisor variance review.
Reject 2990 `Match All`, variant-flattened SKU totals, automatic quantity adjustment and posting to
an ambiguous bucket.

**RULING → ADAPT + IMPROVE + RESTRICT + REJECT.** Count snapshots the Portal Unit scope but hides
the answer during the first physical pass. Unit identity, not equal aggregate quantity, determines
match. Difference never automatically becomes Adjustment; ordinary operators cannot directly add
or subtract Stock; skipped scope and casual mass match cannot complete a Count.

**RECOMMENDED CARRES BUSINESS FLOW →** Portal snapshots expected Unit IDs; an individually signed-
in NETS Warehouse person blindly scans observed Units and explicitly closes the scope; Portal then
reveals exact matched, missing, unexpected, holder/Site and condition differences; NETS performs a
dated Unit-level Count again where required; current GRN Duty investigates Receiving, Transfer,
Outbound, Delivery and Unit History. Evidence-backed source correction completes an explainable
difference. Only a genuinely unresolved physical difference becomes an Adjustment Request, and
only the resolved `Stock Adjustment Approver` may approve or reject it. Approval creates an append-only Unit correction while
preserving snapshot, first Count, Count again, investigation and decision.

**OPERATOR JOURNEY →** NETS opens the actual dated Count Work, scans every Unit without seeing the
Portal answer, closes the governed scope and later rechecks only requested Units. GRN Duty compares
both Counts with source documents and handovers, completes the missing authoritative event when one
exists, or submits a reasoned Adjustment Request. COO reviews before, counted, recount, evidence and
investigation, then approves or rejects; requester and approval control remain segregated.

**UI / PAGE / OBJECT PLACEMENT →** `Inventory rail → CONTROL → Counts & Adjustments` is one page
with saved views `Scheduled counts · Counting · Differences to check · Adjustment requested ·
Completed`. Count Register defaults are `Count No · Site · Stock date · Actual count date ·
Submitted date · Scope · Counter avatar · Portal Units · Counted Units · Differences · State ·
Work`. Count Detail contains scope, first Count, Count again, exact Unit differences,
investigation, correction, Adjustment request, Stock Adjustment Approver decision, resulting Unit events and History.
No ordinary-user plus/minus form exists.

**CROSS-MODULE CONNECTION →** Stock owns Count/Difference/investigation and physical correction;
Receiving and Delivery/Outbound supply missing receipt/handover facts; Purchasing handles supplier
quantity/product consequence; Finance consumes approved results and the Month-end version; the
`Stock Adjustment Approver` alone approves governed material or unexplained Adjustment.

### 12.6 Outbound exact-Unit handover

**CURRENT CARRES →** legacy Take out or status mutation can make digital Stock leave before the
physical handover. Delivery may select Units without one complete Warehouse scan chain; `Outbound`
can be mistaken for another DO editor; quantity-only rows and a company-level NETS identity can hide
the exact SO/DO/Unit and people involved.

**2990 / MATURE ERP LESSON →** keep 2990 OUT movement source links, actual date and movement
history. Mature WMS confirms exact-item check, load-list verification, two-sided custody evidence
and hard blockers for wrong/missing/controlled goods. Reject 2990 ship-despite-shortage or
quantity-only deduction, document-post-equals-physical-handover, Warehouse costing/freight and
unproven wave, staging bay/rack, pallet/license-plate, forklift or route-optimisation work.

**RULING → ADAPT + IMPROVE + REJECT.** Outbound is an actual-dated exact-Unit check, pack and
handover workspace driven by the owning DO/Journey. Every affected Unit changes holder only through
an accepted physical handover. Missing/incorrect/ineligible Units block only their own handover and
remain with the last confirmed holder; a whole-document status cannot conceal partial truth.

**RECOMMENDED CARRES BUSINESS FLOW →** Delivery works backward from customer delivery through the
governed journey/calendar and supplies DO, leg, partner, collection date and exact Unit scope.
Outbound gives NETS Warehouse the dated action. The individually identified warehouse operator
checks Unit ID/product/condition/completeness, packs and scans each Unit; the individually
identified NETS Delivery person accepts the Units and evidence. Only matched two-sided evidence
changes `Who has it` to that delivery person/journey. A Singapore SO preserves separate KL-to-JB
and JB-to-customer legs and their own handovers/proof.

**OPERATOR JOURNEY →** NETS Warehouse opens Outbound on the actual date; reads DO No, SO No,
destination, collection time and exact Units; scans each Unit; Portal validates source,
reservation, issue/control and prior handover; operator checks/packs; actual NETS Delivery person
signs in and scans acceptance; both identities/evidence are retained. NETS Delivery then completes
journey arrivals through Delivery, not Outbound.

**UI / PAGE / OBJECT PLACEMENT →** Outbound follows §7: visible document/date, Loading entry,
product and separate quantities. Product expansion is read-only. The full-width owning work shows
exact Unit, product, reservation, check/pack dates, both sides' evidence and remaining responsibility.
It cannot edit the customer date, route, partner, SO, DO or price.

**CROSS-MODULE CONNECTION →** Sales Order owns customer promise and exact reservation; Delivery
owns DO/Journey/partners/dates and customer outcome; Stock owns Unit eligibility and holder; NETS
Warehouse owns check/pack/handover evidence; NETS Delivery owns acceptance/transport/arrival/return
evidence; Purchasing receives dated shortage/late-arrival work; Finance consumes events without
controlling physical handover.

### 12.7 Transfer between governed Sites

**CURRENT CARRES →** legacy transferred status or direct warehouse/location change can teleport a
Unit without origin handover, transport holder and destination receipt. Transfer, Delivery and PO
relocation may duplicate one movement; partial arrival and post-collection cancellation can be
hidden by a whole-document state.

**2990 / MATURE ERP LESSON →** keep 2990 Transfer number, From/To, paired OUT/IN events, batch/Unit
trace and correction history. Mature ERP confirms that dispatch and receipt are separate facts and
the carrier holds goods between them. Reject instant posting, overdraw warning with continue,
variant/batch flattening, Warehouse freight/cost allocation and destructive cancellation after
dispatch.

**RULING → ADAPT + IMPROVE + REJECT.** Transfer is one exact-Unit Stock object, projected into
origin Outbound and destination Inbound; it does not add a fifth Warehouse destination. Each Unit
changes holder only through accepted handovers. A whole Transfer cannot hide partial collection,
acceptance, arrival or an unmatched Unit.

**RECOMMENDED CARRES BUSINESS FLOW →** a Transfer request states exact Units, From, To, collection
date and arrival date. The origin person scans and hands affected Units to the actual NETS Delivery
person; only those Units change holder. Destination Inbound provides the dated work; the authorised
destination person scans/checks each actual arrival and only accepted Units change to that Site.
Computed presentation may read `Planned · Collected from origin · With delivery person · Arrived at
destination`; `Moved` is insufficient. Before collection the Transfer may be cancelled with reason;
after collection, return or redirect requires a new governed handover journey.

**OPERATOR JOURNEY →** origin opens the Transfer through Outbound, reads number/From/To/date/exact
Units, scans what is handed over and identifies the actual delivery person. Destination opens the
same Transfer through Inbound, scans what arrived, checks identity/condition and records each receipt
outcome. Investigation compares origin handover, delivery acceptance and destination receipt
without deleting conflicting evidence; each unmatched Unit receives its own concrete Action.

**UI / PAGE / OBJECT PLACEMENT →** no Transfer top navigation is added. Outbound hosts origin work;
Inbound hosts destination work; Inventory shows current holder and History. Transfer Detail uses
the Object Detail Template with `Transfer No · source request · exact Units · From · To · collection
date · arrival date · delivery party · Outbound work · Inbound work · evidence · History`.
Inventory/Reports may filter Transfer History but do not create a second movement ledger.

**CROSS-MODULE CONNECTION →** Stock owns Transfer and Unit-holder truth; Outbound owns origin work;
Inbound/Receiving owns destination receipt; NETS Delivery owns transport-period evidence; customer
Delivery keeps its own DO/Journey; supplier return keeps Purchase Return/Supplier Claim authority;
Finance consumes physical movement without maintaining freight allocation in Transfer.

### 12.8 Customer Return, Supplier Return and Repair

**CURRENT CARRES →** a failed Delivery or return can leave the Unit falsely with Delivery; returned
goods may become Ready Stock without inspection; Service Case/Supplier Claim closure can be
mistaken for physical completion; Warehouse may duplicate the owning Return document; repair out
and back can lack a continuous holder story.

**2990 / MATURE ERP LESSON →** keep explicit Delivery Return/Purchase Return documents, source,
actual date and new reverse-direction movement history. Mature ERP confirms that return is a new
physical journey and must not delete the original dispatch/delivery attempt. Reject Warehouse-owned
commercial return documents, quantity-only return, automatic availability after posting and
destructive reversal of the original event.

**RULING → ADAPT + IMPROVE + REJECT.** The commercial owner authorises why a Unit returns, leaves
or is repaired; Stock/Receiving/Outbound prove the actual Unit, holder, condition and handovers.
Every returned Unit is `Check required`, never automatically Ready Stock. Case/Claim closure does
not move a Unit; original delivery/handover evidence remains append-only.

**RECOMMENDED CARRES BUSINESS FLOW →** an authorised Customer/failed-Delivery Return creates dated
Inbound work; NETS Delivery hands back the exact Unit; NETS Warehouse scans/checks it; accepted
receipt changes holder and sends the Unit to inspection, then governed outcome may return it to
Ready Stock/reservation or route it to repair/service/write-off request. Purchasing-authorised
Supplier Return creates Outbound work; only actual supplier/collection-party acceptance produces
`Returned to supplier`. Repair creates Outbound handover to the actual repair partner, continuous
`Who has it`, dated expected return, Inbound receipt and new inspection before any availability is
restored.

**OPERATOR JOURNEY →** return receiver opens the expected Inbound work, scans Unit/source,
condition/components/evidence and submits receipt into `Needs checking`. Supplier-return operator
opens Outbound, scans the exact Unit and identifies the actual supplier collector. Repair operator
records out handover; Portal keeps the repair partner as holder and creates a concrete follow-up if
the dated return is not submitted; actual return is scanned through Inbound and checked again.

**UI / PAGE / OBJECT PLACEMENT →** no Warehouse Return top page exists. Inbound hosts `Customer
Return · Return from repair · Supplier replacement · Failed Delivery return`; Outbound hosts
`Return to supplier · Send for repair · Return to showroom/warehouse`. Unit Detail shows `Return/
Repair reason · owning document · expected date · actual outbound handover · current Who has it ·
expected return · actual receipt · condition before/after · evidence · physical outcome · History`.

**CROSS-MODULE CONNECTION →** Sales/Delivery owns customer-return authorisation and outcome;
Service Case owns customer problem and repair treatment; Purchasing owns Supplier Claim/return/
replacement; Stock owns physical holder/condition/availability; Receiving owns return receipt;
Outbound owns supplier/repair handover; Finance owns refund, Credit Note, write-off value and
supplier settlement.

### 12.9 Showroom Stock and Supplier Consignment

**CURRENT CARRES →** display sofas can live in staff memory, a supplier list or separate showroom
sheet; Carres-owned, Consignment, sold-awaiting-Delivery and repair/change/collection goods may be
split; showroom can be treated as a sales address rather than a Stock Site; ownership, holder,
reservation and settlement can collapse into one status.

**2990 / MATURE ERP LESSON →** keep warehouse/Site breakdown, source/batch/Unit trace and linked
sale/transfer/return movements. Mature consignment control separates legal ownership, physical
holder/location, customer allocation and supplier settlement. Reject a showroom stock ledger,
Rack/Bin as a substitute for handover, quantity-only display stock and any status that merges
supplier ownership with current place.

**RULING → KEEP + ADAPT + IMPROVE + REJECT.** Every physical display sofa carries a Carres Unit ID
and belongs to the one Unit Register; PJ Showroom and future outlets are governed Sites. Inventory
may filter by Site and ownership but keeps one authority. Current scope rejects fabricated display
Position/Zone/slot. Stock cannot change legal ownership or supplier settlement price.

**RECOMMENDED CARRES BUSINESS FLOW →** `Showroom Display` includes Carres Owned, Supplier
Consignment, reserved/sold awaiting Delivery, waiting repair/change and waiting supplier collection.
An actual arrival requires the showroom person to scan/check the Unit and submit evidence before
the Site/holder changes; departure requires an actual recipient handover. Sales Order reservation
binds the exact display Unit while holder remains the showroom until collection. Consignment sale
creates Purchasing `Sold to Settle`; Finance verifies invoice/payment. Purchasing authority to
change/return/collect never moves the Unit without Outbound and recipient proof.

**OPERATOR JOURNEY →** a personally signed-in showroom operator sees the Site's actual dated
arrival, departure, Count and condition-check Work; scans arrival/departure, Counts, reports a
problem and reads processing state; cannot change ownership/cost/SO reservation/Claim. Sales chooses
an authorised exact display Unit without moving it. Purchasing manages Consignment Order, exchange,
Claim, collection and Sold to Settle without editing holder.

**UI / PAGE / OBJECT PLACEMENT →** Inventory rail contains `Showroom Display`, `WHO HAS IT → PJ
Showroom / Other outlets` and `OWNERSHIP → Carres Owned / Supplier Consignment`. The saved view
defaults to `Unit ID · Product · Site · Ownership · Stock use · SO No · Display since · Last
condition check · Who has it · Expected collection · Work`. `Zone A3`, `Position 6`, Rack and other
unverified placement fields are absent unless future measured outlet operations justify a governed
extension.

**CROSS-MODULE CONNECTION →** Purchasing owns Consignment Order/supplier/exchange/Claim/Sold to
Settle; Stock owns Unit/Site/holder/condition/Count; Showroom owns physical scans and evidence;
Sales Order owns exact reservation/sale; Delivery owns collection/return/customer handover; Finance
owns Supplier Invoice/Credit Note/settlement; the `Stock Adjustment Approver` approves major
unexplained difference/write-off/compensation.

### 12.10 Month-end Stock Confirmation and Finance handoff

**CURRENT CARRES →** a warehouse may not finish the physical Count on the month's final day;
Stock date, actual Count and submission can be collapsed or backdated; Finance may receive an
untraceable spreadsheet total; later correction can overwrite the version Finance used.

**2990 / MATURE ERP LESSON →** keep dated Stock snapshots, Count/Adjustment history and movement-
source trace. Mature period control separates accounting cut-off from observation time, reconciles
intervening movements, preserves before/after approval and records the version used. Reject
backdating, overwriting the first Count/report, declaring unresolved difference fully confirmed and
letting an export become inventory authority.

**RULING → ADAPT + IMPROVE + REJECT.** Stock date is the final calendar day at 11:59 PM. Physical
Count may occur within two calendar days before or after that point, always with its actual Count
and submission dates. Portal reconstructs the cut-off through Unit events, preserves unresolved
differences and approved Adjustments, versions every confirmation and records Finance acknowledgement.
Finance cannot edit the Unit or Count.

**RECOMMENDED CARRES BUSINESS FLOW →** the governed calendar creates the Count window and concrete
dated Work; NETS submits the blind Count on the actual day; Portal compares the Count with all
Receiving, Transfer, Outbound, Delivery and Return events between observation and Stock date; GRN
Duty investigates Unit differences; COO decides governed Adjustments; Portal issues an immutable
version showing confirmed Units, unresolved differences, movement reconciliation and approvals;
Finance acknowledges the exact version used for valuation/submission. A later correction creates a
new version without deleting the previous one.

**OPERATOR JOURNEY →** NETS reads `Submit the {month} Stock Count for {Site}` under the governed
actual date and submits honestly. GRN Duty reconciles source events around the cut-off and resolves
or requests Adjustment. COO reviews remaining material/unexplained Units. Finance reads Stock date,
actual Count, submission, version and difference/approval evidence, then acknowledges the chosen
version without changing physical truth.

**UI / PAGE / OBJECT PLACEMENT →** Monitor shows the month, Count window and concrete submission
date under `MONTH-END`. Month-end Detail shows `Stock month · Stock date · Count window · actual
Count date · submitted date · version · confirmed Units · unresolved differences · approved
Adjustments · movement reconciliation · Finance acknowledgement · History`. Reports provides
`Month-end Stock Confirmations`; every export prints Stock date/version/generation person/date/
filters/exact Unit rows/unresolved differences and remains read-only.

**CROSS-MODULE CONNECTION →** Stock owns cut-off reconstruction, Count, reconciliation and version;
Receiving/Outbound/Delivery supplies actual events; Purchasing handles missing inbound/supplier
consequence; `Stock Adjustment Approver` owns Adjustment approval; Finance acknowledges and uses a version for valuation/
submission; Reports exports but never becomes authority.

### 12.11 Work, Duty Roster and automatic owner resolution

**CURRENT CARRES →** page-local `assigned_to`, manager-by-manager task allocation, shared NETS
identity, generic Due/Overdue/Next Action and Mark done can leave work with departed staff, obscure
the actual external actor, duplicate tasks across modules and close work before the business fact
exists. Carres currently has one Manager/COO and three staff but must continue safely with two or
one; NETS may have many warehouse/delivery people.

**2990 / MATURE ERP LESSON →** keep worker-specific work, receiving/count/outbound responsibility,
team visibility and actor/time evidence. Mature work execution assigns by governed role/queue and
preserves handover. Reject page-local manual assignment, dependency on a full-time warehouse
supervisor, shared warehouse login and premature labour-planning/shift/productivity complexity.

**RULING → ADAPT + IMPROVE + REJECT.** The shared Work Engine stores `Trigger · Owner rule ·
Resolved owner · Action · Completion fact · governed actual date · source object · cover rule`.
Duty Resolver consumes Staff & Duties/People facts and automatically adapts open/future Work; completed actor
history never changes. Routine work has no Mark done and no undated generic task.

**RECOMMENDED CARRES BUSINESS FLOW →** `Workspace → Staff & Duties` maintains the one PO Duty/GRN
Duty rotation and Buddy cover. With three active staff, approved rotation and cover apply; with two, duties split/rotate;
with one, the same person holds both; only zero assignable staff may produce `No active Carres staff
can take this work` for COO attention. People `Last working date` removes a leaver from the effective
pool and re-resolves open/future Actions. NETS physical Work begins in the authorised organisation/
Site queue; the first personally signed-in operator who starts the scan becomes resolved actor;
governed handover preserves both people if work changes hands.

**OPERATOR JOURNEY →** My Work groups the user's own source/fact/action under actual weekday/date
without repeating their avatar. Team Work groups the same Action set under owner avatar/full name
and action/late counts. Cover shows normal owner and today's cover as structured metadata. Every
Warehouse page reads the same resolved owner and completes only when its stated authoritative fact
exists.

**UI / PAGE / OBJECT PLACEMENT →** Quick Rail is `Team · Calendar · My Work · Activity`. Team shows
coverage but `Workspace → Staff & Duties` is the only PO/GRN Duty and Buddy-cover edit door; People owns active/access/last-working-date facts;
Warehouse Settings links but copies neither. Warehouse pages render returned avatar/owner only and
store no assignee. NETS uses individual email/name/avatar; shared `NW`/company identity and
impersonation are invalid.

**CROSS-MODULE CONNECTION →** People supplies effective people facts; Staff & Duties owns Duty assignments;
Work Engine owns Action/date/owner/cover/completion; Purchasing consumes PO Duty; Receiving/Stock
consumes GRN Duty and individually identified NETS operators; Delivery consumes its own journey
owner rules; the relevant approval Duty handles approvals and management handles the genuine zero-staff exception rather than routine task
assignment.

### 12.12 Reports and analytical boundaries

**CURRENT CARRES →** dashboard or Ready Stock/health/reorder totals can lack Unit drilldown; exports
can be mistaken for new truth; Warehouse may expose Finance cost/margin or appear to decide buys;
final Count/Adjustment totals can hide original difference and version.

**2990 / MATURE ERP LESSON →** keep 2990 Incoming, reserved horizons, availability, ageing,
warehouse/batch breakdown, ABC/dead-stock/turnover analysis and source-linked Stock Card drilldown.
Mature ERP separates physical execution, replenishment decisions and financial valuation. Reject a
Finance-led Warehouse centre, non-drillable KPI preamble, report-side mutation and uploadable export
as authority.

**RULING → KEEP + ADAPT + SPLIT + REJECT.** Every Warehouse total derives from and drills to exact
Units/source documents. Warehouse owns physical ageing, holder, verification, Difference and Work
load; Purchasing owns shortage/incoming/replenishment decision; Finance owns value, turnover, COGS
and valuation. Reports are read-only evidence, never another write door.

**RECOMMENDED CARRES BUSINESS FLOW →** permission-filtered Reports project the Unit Register,
Receiving, reservation, handover, Count/Adjustment and Month-end version. A user drills from an
aggregate to exact Unit/document and completes the owning action there; the report neither changes
Stock nor initiates an unapproved purchase. Every export is a generated fixed snapshot with date,
person, filters, Stock/report date, version where applicable, source numbers and exact rows.

**OPERATOR JOURNEY →** COO reads cross-Site unresolved differences, damaged Units, late evidence and
Month-end approval facts and drills to owner/source. Operations reads current/Ready/Inbound/
Outbound/Count physical facts without margin/settlement. Sales receives only permitted Ready/
showroom availability. Finance consumes Month-end/ownership/valuation evidence without changing
holder. NETS sees only authorised Site/journey work and evidence.

**UI / PAGE / OBJECT PLACEMENT →** the single entry is `Page Header → Reports → Warehouse`; module
pages do not repeat report buttons. Catalogue is `Current Stock · Ready Stock · Showroom Stock ·
Stock by Ownership · Receiving & Inbound · Outbound & Handovers · Transfers · Stock Counts · Stock
Differences & Adjustments · Problems & Condition · Month-end Stock Confirmations · Partner Evidence
· Unit History`. Reports use the Register Template with filter rail and drill-through. Monitor
keeps dated work/exceptions ahead of analytical KPI bands.

**CROSS-MODULE CONNECTION →** Stock supplies physical facts; Purchasing owns incoming/shortage/buy
decision; Sales Order supplies reservation/demand; Receiving and Delivery supply actual events;
Finance owns value/COGS/turnover and acknowledged Month-end version; COO consumes cross-module
exception/approval evidence.

### 12.13 Settings, permissions and external warehouse boundary

**CURRENT CARRES →** page-local settings/assignees, hard-coded staff email, shared NETS account,
external direct status/quantity write, message-as-proof and speculative heavy WMS can fragment
authority. NETS Warehouse and NETS Delivery acts may also be confused because one organisation
performs both.

**2990 / MATURE ERP LESSON →** keep governed warehouse/Site master, explicit action permissions,
structured reasons, source documents and actor history. Mature 3PL control separates organisation,
person, role, Site, active dates and evidence; API/offline submissions are attributable,
idempotent and validated. Reject broad warehouse administrator access, Carres maintenance of NETS
internal Rack/Bin/labour, shared login, direct external overwrite and future-only WMS complexity.

**RULING → ADAPT + RESTRICT + FUTURE-PROOF + REJECT.** Warehouse has one Settings entry; Team has
the only duty rota; People has employment/access truth. External people may submit only personally
observed, authorised physical facts. Carres Portal validates and owns the Unit result. Partner,
3PL or future Carres-operated warehouse changes organisation/people/Sites/permissions, not the
Unit/Receiving/Inventory/Outbound/Count/Work/evidence contracts.

**RECOMMENDED CARRES BUSINESS FLOW →** `Page Header → Settings → Warehouse` governs `Sites &
operators · Warehouse calendar · Stock Count · Month-end Stock Confirmation · Problems & evidence
· Unit ID · Permissions & approvals · External partners`. NETS Warehouse is limited to receive,
Count/Count again, check/pack, handover, problem and evidence; NETS Delivery to collection,
arrival, return, handover, problem and evidence. Neither may create/edit PO/SO/DO, promise, cost,
price, ownership, Ready Stock, reservation, Adjustment/approval, payment or history. Every external
person has personal email/name/avatar, organisation, role, Sites/journeys and active dates; one
person with two roles records the role used on each event.

**OPERATOR JOURNEY →** an external operator receives a narrow mobile actual-date page with source,
exact Units, scan, observable outcome, evidence and submit. Partner API may propose receipt,
collection, arrival, return, handover or proof; Portal validates organisation/person/role/Site or
journey/source/Unit/current holder/event order/duplicate/time/evidence before acceptance. Offline
work remains `Not submitted` and changes no truth; acceptance preserves actual scan and submitted
times. If Carres records on behalf, it preserves recorder, actual partner/person/time, recorded time
and evidence; a sent message alone is not proof.

**UI / PAGE / OBJECT PLACEMENT →** one Warehouse Settings surface and links to Team/People; no local
settings or copied rota. External UI omits full ERP navigation, costs, payments, unrelated Sites and
staff work. Heavy Zone/Rack/Bin/Wave/Forklift screens remain absent until measured operational need
supports an extension of the same Unit model.

**CROSS-MODULE CONNECTION →** People owns personal/effective access; Staff & Duties owns PO/GRN Duty;
Warehouse Settings owns Site/calendar/Count/evidence/partner permission; Purchasing owns supplier/
PO/Consignment; Receiving owns receipt; Delivery owns journey/arrival; Finance owns payment/
settlement; governed approval Duties and their limits preserve segregation.

### 12.14 Complete reference-to-Carres capability matrix

| Reference capability | Carres current equivalent / owner | Ruling | Why | Dependency / conflict result |
|---|---|---|---|---|
| 2990 Inventory totals, warehouse/batch drilldown and Stock Card | legacy Unit rows, rollups and history fragments / Stock | KEEP + ADAPT + IMPROVE | preserve finding power while exact Units remain authority | rollup is read-only; no negative Stock or rack ledger |
| 2990 GRN inbound movement and rack choice | Receiving/GRN plus legacy Stock Add / Receiving, Stock | ADAPT + REJECT | one physical receipt door; no second Stock In or NETS placement model | Receiving posts; Inventory projects accepted results |
| 2990 availability, reserve horizons and FIFO/batch logic | Ready Stock and reservation / Stock, Sales Order | ADAPT + IMPROVE | exact eligible Unit and set integrity fit Carres | Sales Order owns bind/release; no quantity-only promise |
| Dynamics quality/quarantine and 2990 damage adjustment reason | issue/hold fragments / Stock, Claim, Service | ADAPT + REJECT | suspect Unit must stop use, but observer reports facts only | `Needs checking`; no generic Quarantine or instant write-off |
| 2990 Stock Take snapshot, untouched/zero and variance | incomplete count controls / Stock | ADAPT + IMPROVE | blind exact-Unit Count and history protect physical truth | Difference precedes investigation/Stock-Adjustment-Approver decision |
| 2990 OUT movement and mature load verification | take-out/Delivery links / Stock, Delivery | ADAPT + IMPROVE | exact two-sided handover prevents digital/physical drift | Delivery owns DO/Journey; no wave/staging/shortage override |
| 2990 paired Transfer OUT/IN and reversal | movement primitives / Stock | ADAPT + IMPROVE | origin, transport holder and destination are separate facts | projects into Outbound/Inbound/Inventory; no fifth page |
| 2990 Delivery/Purchase Return documents | return states / Delivery, Purchasing, Service, Stock | ADAPT | commercial owner authorises; Stock proves physical return | every returned/repaired Unit is checked before availability |
| Mature multi-location consignment control | showroom/supplier lists / Purchasing, Stock | KEEP + IMPROVE | ownership, Site, holder, reservation and settlement differ | one Unit Register; no showroom ledger or fabricated Position |
| Mature period cut-off, Count reconciliation and versioning | no complete Month-end confirmation / Stock, Finance | ADAPT + IMPROVE | honest Count dates and immutable versions support Finance | ±2-day Count window; Finance acknowledges a version |
| Mature worker-scoped work and actor history | page assignees/shared accounts / Work, Team, People | ADAPT + IMPROVE | automatic Duty resolution survives staffing change | 3/2/1 staff continuity; personal NETS identities |
| 2990 ageing, ABC, turnover, availability and source drilldown | fragmented reports / Stock, Purchasing, Finance | KEEP + SPLIT | physical, buy and value decisions have different owners | exact-Unit drilldown; exports never write back |
| Mature 3PL role/API/offline controls | partner/manual paths / Stock and owning event modules | ADAPT + RESTRICT | partner submits observed evidence; Portal keeps authority | future 3PL/Carres operation reuses the same contracts |

No relevant 2990 capability is adopted because of terminology or layout alone. Carres explicitly
rejects negative Stock, shortage override, duplicate quantity/rack ledgers, direct adjustment,
instant Transfer, automatic returned-stock availability, broad external administration, and
unmeasured pallet/license-plate/wave/labour/robotics complexity.

## 13 · Implementation evidence and remaining limits

This section describes implementation, not a second set of business rules. The current delivery is
being verified on 2026-09-15. A passing test, a merged PR, a deployed build and user visual acceptance
are separate milestones. No Warehouse surface is frozen into the UI Kit by this delivery.

| Capability | Existing owner and implementation | Current limit / delivery evidence |
|---|---|---|
| Unit identity and availability | 0366 authority, 0371 condition correction, 0453 quantity identity separation; stock_unit_register_v is the listing | Quantity records have no displayable Unit ID; no negative or manually adjusted total |
| Inbound | warehouse-inbound shared projection; actual Receiving Site, formal source, full products and receipt outcomes | Awaiting receipt / Fully received / All arrivals; accepted, physical arrived and pending quantities remain distinct |
| Receiving | ReceivingWorkspace and existing receipt writer; posted GRN and receiving_unit_results | Same-page work, stable retry identity, source evidence and actual goods receipt date; no second Stock Add |
| Outbound | 0424 exact DO Unit scope, prep and two-sided handover; explicit Loading workspace | Loading does not confirm for the driver; loaded with zero driver confirmations remains open |
| Inventory | WarehouseStockRegister and WarehouseUnitDetail read the Unit authority | Four default fact groups retain independent Unit ID. PO issue dates never stand in for actual receipts |
| Physical Site visits | Posted receiving_unit_results + warehouse_receipts.actual_site_id / goods_received_at; arrival_source_events.collected with source.from_site_id | Only unambiguous same-Unit, same-Site evidence pairs. Every later receipt opens another visit. Missing or overlapping evidence remains visibly unpaired |
| Historical DO departures | delivery_handover_event_units warehouse side + handed_over event | These old events have no historical Site field. Preserve the departure independently; do not infer Site from the Unit's current warehouse, rewrite history or fabricate a backfill |
| Arrival Schedule / Pickup Schedule | WarehouseWorkspace, warehouse-schedule projection and Site operating dates | Separate pages; normal white cards and quiet date provenance badges, overdue work highlighted, undated/delayed work reachable, including older overdue and dated non-working-day entries without changing their dates. Pickup opens exact Loading scope |
| Transfer and return arrival sources | Migration 0490 is committed, replacing the former unnumbered draft; existing arrival source writer and Receiving engine | Do not rebuild a parallel Transfer/Return engine. Planned, collected, carrier-received and received are distinct facts |
| Stock Count / Difference / approved Adjustment | Approved business design in §6 and §12.5 | Not built as a complete stocktake engine. WarehouseCountModal records truck/loading counts and is not a stocktake |
| Month-end / Finance handoff | Approved business design in §9 and §12.10 | Complete versioned confirmation and Finance acknowledgement are not claimed shipped |
| Duty / permission / external operations | Existing personal-role guards and RLS remain authoritative | No new external rights, service-role browser access, shared credentials or second stock writer |

### 13.1 · Required read and failure behavior

A source failure is not an empty register. Existing source-warning and receiving-action gates from
PR #1368 are incorporated. Unit physical history has an independent read and retry: a failed history
feed leaves current Unit facts available and says that the history could not be loaded. No failing
read may be replaced with zero, a guessed receipt date or the current Site as historical evidence.

### 13.2 · Delivery verification

PR #1372 contains the Inbound / Outbound layout, receiving product context, explicit loading entry,
driver-confirmation distinction and visible-viewport empty-state correction. Inventory Site-visit
projection and the Schedule-to-Loading link are follow-up work in the same delivery. Tests cover
receipt outcomes, wrong Site/Unit, return visits, ambiguous and absent evidence, driver count zero,
retry/input preservation and register state. Final deployment identifiers and rendered checks belong
in the delivery evidence record; they do not turn approved but unbuilt controls into shipped features.

## 14 · Whole-domain completion gate

### 14.1 Challenge of the original 14 findings

| ID | Final challenge and ruling | Final class |
|---|---|---|
| G1 | Stock Add/import duplicates Receiving; retire it as a normal door and keep only governed migration/count correction paths. | authority consolidation gap; not a business contradiction |
| G2 | `stock_balances` or page totals can diverge; every decision reads the Unit Register and derives rollups. | engineering/authority consolidation gap |
| G3 | mixed bulk and Unit identity cannot reserve traceable furniture truthfully; every sofa/independently saleable module uses Unit ID, while governed interchangeable goods may use quantity scope. | approved model rule; implementation gap only |
| G4 | legacy take-out quantity/event errors do not change business design; exact affected Units/quantity and append-only event must agree. | engineering correctness gap |
| G5 | the old audit claimed internal location was required. Challenged and rejected: Carres does not operate NETS internal storage and currently governs Site + actual holder, not Zone/Rack/Bin. Add finer position only after measured multi-outlet/finding need. | not a current business gap; intentional rejection with future trigger |
| G6 | Add/Remove is not a Count. Blind Count, Count again, Difference, investigation and approved Adjustment are the complete control. | approved target / not built |
| G7 | generic reservation cannot prove customer promise; Sales Order binds/releases/substitutes the exact eligible Unit atomically. | integrity/authority consolidation gap |
| G8 | one status cannot combine holder, Site, condition, availability, reservation and work; these remain separate facts over one event history. | engineering/authority consolidation gap |
| G9 | Delivery selection without physical Warehouse handover lets digital state outrun reality; Outbound requires exact two-sided handover. | built exact-Unit handover; UI completion and driver distinction verified separately |
| G10 | return state without return receipt/inspection leaves false holder and availability; Return/Repair uses new out-and-back events and check required. | 0490 arrival-source and receiving path exists; completeness is movement-specific |
| G11 | unknown import cannot become new/sellable/reserved truth; reject to review and never allocate through migration. | data-governance/engineering gap |
| G12 | giant mixed UI and drifting copy are not business decisions; governed Shell/Register/Object Detail and five destinations consolidate presentation. | UI/engineering consolidation gap |
| G13 | legacy Stock/Receiving/partner/PO write paths cannot coexist as authorities; each physical act has one owning door and forbidden external overwrite. | engineering/authority consolidation gap |
| G14 | appointment/customer-date ownership was once contradictory. It is now resolved: Sales Order owns the customer promise; Delivery derives DO/Journey dates; Warehouse consumes dated Inbound/Outbound work and never owns the promise. | resolved cross-module authority; no Warehouse owner decision |

### 14.2 Blueprint completeness result

Coverage is complete across purpose/ownership; Unit creation and identity; acquisition reason;
Inbound/Receiving; Inventory/Ready Stock/reservation; Showroom/Consignment; problems/condition;
Count/Difference/Adjustment; Outbound/Delivery; Transfer; Return/Repair; lifecycle outcomes;
morning-to-close dated Work; Duty/cover/offboarding; navigation/Register/Workspace/Object Detail;
Quick Rail/Calendar; Settings; Reports/export; permissions/segregation; Month-end/Finance; NETS/3PL/
offline/API boundaries; history/audit; cancellation/partial/concurrency consequences; and future
Carres-operated warehouse compatibility.

The former 11-task roadmap is research history, not current Blueprint authority and not a substitute
for this coverage. Implementation status is recorded in §13. Approved target coverage does not mean every control is built,
and missing historical evidence remains an explicit limit rather than a fabricated fact.

### 14.3 Resolution classification

Resolved: legacy tab shell to Warehouse destinations; On hand master list to Inventory; Ready stock planning to
eligible Units; warehouse-only scope to all governed Sites and journeys; rollup to Unit authority;
bulk sofa to Unit identity; Quarantine to observable issue and automatic control; Receiving-only
supplier fault to Receiving and Service entrances; NETS-as-place to Site/operator separation;
one movement status to collection, transit and arrival; bulk reservation to Sales Order exact-Unit
binding; missing month-end to Stock date, window, reconciliation and version; generic task to the
shared Action contract; and hard-coded NETS to role-based partner/future-self-operation.

Intentional rejects now: Monitor as a second truth/KPI wall, second exception register, manual totals,
negative stock, generic status editing, Position or slot at current scale, heavy WMS without
measured need, and assumed external cutover.

**RESOLVED FROM AUTHORITY:** Unit authority, ownership seams, shared Work and UI grammar and
upstream/downstream owners.

**APPROVED TARGET / NOT BUILT:** the rest of this Warehouse operating model and its UI — the
remaining destinations in §2 (Ready stock as eligible Units, Transfers, Counts), the journeys in §5,
Issues/Counts/correction in §6, month-end in §9 and the reports in §11.

**BUILT / VERIFIED:** the Unit-authority foundation and the exact-Unit Stock Register that
replaced On hand as the Warehouse master list — merged as `4246ff91` (PR #878) with all seven
migrations, production-verified 2026-08-21 and proved by ancestry (`git merge-base --is-ancestor
4246ff91 <live>` stays true as main moves). Measured then: 136 units · 0 without identity ·
0 write policies/grants on the seven Warehouse objects · exactly 1 `unit_availability`.
Everything else in §13 is evidence to re-measure before build, not target authority.

**REAL GAP / CONTRADICTION:** none requiring an owner decision. The formerly open accessory
question — does an accessory piece carry a Unit identity? — is closed by §14.1 G3: every sofa
and independently saleable module uses Unit ID; governed interchangeable goods use quantity
scope, without exact-Unit binding.

**OWNER DECISIONS:** none unresolved.

**PLAN MISSION COMPLETE.** The complete Warehouse operating model is approved and persisted. PLAN
does not author Cards or choose implementation mechanics.
