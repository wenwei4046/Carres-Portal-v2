# STOCK / WAREHOUSE — MASTER

> **APPROVED / LOCKED — complete owner-reviewed Warehouse Blueprint, 2026-09-01.**
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

Warehouse has four operator destinations: **Dashboard · Inbound · Inventory · Outbound**.

- Dashboard: dated read-only projection of Warehouse work and exceptions; never a second truth.
- Inbound: physical goods expected at and received into a governed Site.
- Inventory: the one current Unit authority, including Ready Stock and Counts & Adjustments views.
- Outbound: dated physical work for Units that must leave a governed Site.

Ready Stock is one shared eligible-Unit view of Inventory. Operations reaches it through Warehouse
Inventory; Sales reaches the same authority through `Sales → Ready Stock`. It is not another stock
table or a fifth Warehouse destination. Counts, differences and Adjustment requests remain one
`Counts & Adjustments` control view within Inventory, not three separate pages.

Reports, Settings, Work, Quick Rail and Calendar keep their shared Shell homes. Receiving,
Purchasing, Delivery, Payments and Service Cases keep their own doors.

Approved operator words include **Where · Who has it · Carres Owned · Supplier Consignment ·
Report issue · Count again**.

Rejected Warehouse UI words include On hand as the master-list name, Stock Units as the list name,
Movements, Custody, bare Hold, Quarantine, and generic Review, Handle, Follow up,
Next Action, Priority, Edit, Delete, Add stock, Remove stock or Mark done. Shared copy remains
governed by the Copy Standard.

## 3 · Unit operating model

Every physical sofa Carres controls has one permanent Carres Unit ID, including Carres-owned and
supplier-consignment display goods, sold display goods awaiting delivery, and goods awaiting repair,
change, return or supplier collection.

The ID is created when a PO or Consignment Order is confirmed and supplied to the supplier. The
locked human format is `U1-000-001`: six system-controlled digits grouped 3 + 3. After
`U1-999-999`, allocation continues at `U2-000-001`. Allocation is company-wide, never reset,
manually created or reused. Search/scan may normalise punctuation, but the visible identity never
changes.

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

Each of the four Warehouse destinations starts with the governed six-working-day strip. It prints
actual weekday and calendar date, for example `Tue, 1 Sep · 4`, never `Today`, `Tomorrow`,
`Upcoming` or an undated priority bucket. Clicking a date reveals the work governed for that date.
Unfinished work remains under its original date and reads `{n} not done`; the Portal does not move
it into a misleading current-day bucket.

The shared six-working-day strip is the Warehouse daily operating spine, not a decorative filter.
For a week beginning Tue, 1 Sep it reads `Tue, 1 Sep · Wed, 2 Sep · Thu, 3 Sep · Fri, 4 Sep · Sat,
5 Sep · Mon, 7 Sep`; the governed weekly closure is omitted. Public/partner closed dates and every
later working date come from the Warehouse calendar rather than staff memory.

For any selected date, the operator journey is always:

1. **Open Dashboard:** read everything that must happen on that actual date across Inbound,
   Inventory, `Needs checking`, Outbound and Month-end.
2. **Complete Inbound work:** receive and check the exact PO/Consignment/Return/Transfer/Repair
   Units through Receiving; unresolved arrivals remain under their promised date.
3. **Complete Inventory work:** Count or Count again, inspect reported damage, look for an exact
   Unit not found and confirm an observed holder/Site mismatch. Inventory does not invent a NETS
   Zone, Rack or Bin.
4. **Complete Outbound work:** check, pack and hand over the exact DO/Transfer/Return/Repair Units;
   the accepted event transfers holder authority to the individually identified next person.
5. **Close the date:** Dashboard separates `Completed on {date}`, `{n} not done`, `Evidence not
   submitted` and `Units still with NETS Delivery`. Each total drills to the source object and exact
   Units.

The sequence changes presentation only, never ownership. Receiving completes receipt facts;
Inventory/Count completes physical facts; Delivery completes journey facts; the Work Engine
re-resolves the responsible person. Dashboard and the date strip store none of them.

Work not completed stays visibly under its original actual date, for example `Wed, 2 Sep · 2 not
done`, followed by `[JL] Receive and check 3 Units for PO-2041` and `[AM] Count U-1012 again at NETS
Warehouse`. It is not silently carried forward, relabelled `Overdue` or hidden when the operator
opens another date.

Dashboard is the dated Warehouse morning-to-close workspace. It projects, but never copies, facts
from Inbound, Inventory, Outbound, Month-end and the shared Work Engine. After the operator chooses
an actual date, the page groups the one work set in business order:

```
INBOUND         expected arrival and receiving work
INVENTORY       governed Count and Unit-control work
NEEDS CHECKING  exact damage, missing Unit, mismatch and unresolved-difference work
OUTBOUND        check, pack and handover work
MONTH-END       count-window and Stock Confirmation work when applicable
```

Every row shows its source document/Unit identity, concrete fact, resolved owner avatar and plain
action. Examples are `PO-2041 · 5 Units expected` / `Receive and check 5 Units`, `U-1005 was not
found in the stock count` / `Find out why U-1005 did not match the count`, and `DO-1048 · SO-1318 ·
2 Units` / `Check, pack and hand over 2 Units`. The source identity is clickable:

- PO/Consignment arrival → its Receiving Session;
- Unit or Count difference → Unit Detail or `Counts & Adjustments`;
- DO handover → the Outbound work with linked Delivery Order;
- Month-end requirement → the Month-end Stock Confirmation.

Dashboard stores no status, quantity, owner, completion tick or copied action. It cannot edit a PO
or GRN, change a Unit's holder, finish Delivery, approve an Adjustment or manually assign routine
work. Completion occurs only when the authoritative source fact exists, after which the shared row
updates everywhere.

The management view adds exception summaries over the same drillable facts: unresolved Stock differences,
Adjustments awaiting Stock Adjustment Approver decision, damaged Units requiring a decision and Month-end submissions not
done. Every number expands to exact Units/documents, actual dates and resolved owners; a KPI with no
drill-down is invalid.

An individually signed-in NETS operator sees only permitted physical work: receive and check, Count
or Count again, check and pack, hand over, Report a problem and upload evidence. NETS cannot see
purchase cost, Supplier Invoice, customer payment, Adjustment approval or unrelated staff work.

Inbound is the dated projection of physical goods expected to enter Carres control. It answers what
should arrive, what Receiving proved arrived, what has not yet arrived and what Warehouse must do;
it is not a second Receiving form. It covers Purchase Order, Consignment Order, Customer Return,
Site-transfer arrival, supplier replacement and a Unit returning from repair while preserving each
source object's own authority.

For the selected actual date, the Register defaults are:

```
Expected arrival · Source · Supplier/source party · Destination ·
Expected · Received · Not yet received · Work
```

`Source` is the clickable PO, Consignment Order, Return, Transfer, replacement or Repair record.
When customer demand is connected, the row also shows `SO No · SO date`; PO-backed work shows
`PO No · PO date`. The Workspace shows the same document identity, expected/received/not-yet-
received tally, `With issue` as a subset of received goods, and the governed Unit IDs. The one
action door is `Open Receiving Session`; Inbound cannot submit or post a receipt.

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

An Outbound row shows `Handover date · source document · destination · exact Units · Work · resolved
operator`. Customer work also shows clickable DO No, SO No and SO date. Transfer, Supplier Return
and Repair work shows its own clickable governed document. Detail shows Unit ID, product, From → To,
current `Who has it`, condition, required packages, evidence and handover result.

The NETS operator journey is:

1. Sign in with their own email and open the actual work date.
2. Open the source DO, Transfer, Supplier Return or Repair record and scan every exact Unit ID.
3. Check product, visible condition, required components and packaging; then pack where required.
4. If an observable problem exists, use `Report a problem` with the governed evidence. The operator
   cannot substitute a Unit, change the source order or guess a business outcome.
5. Hand the Unit to the named receiving party and submit minimum scan/photo/handover evidence.
6. Only the completed physical handover changes `Who has it`; a scheduled plan alone never moves
   authority from NETS Warehouse to NETS Delivery, showroom, supplier or repair partner.

Delivery owns customer DO, journey, Logistics Partner and customer-delivery proof. Stock owns the
Unit's current holder and physical history. Purchasing owns Supplier Return and supplier decision.
Service Case owns the repair need and resolution. Outbound stores no duplicate business status.

Inbound, Inventory and Outbound use the shared cross-module reconciliation contract in
`../ERP-ARCHITECTURE.md` §3.5.1. They do not ask an operator to tally Receiving or Delivery again:

- Inbound reads `Expected · Received · Not yet received · With issue` from the PO/Consignment and
  Receiving Session/GRN; only posted arrival facts enter Inventory.
- Inventory derives the current Unit and `Who has it` from the append-only arrival and handover
  facts; each Unit has only one current answer.
- Outbound reads the exact Units required by the source DO, Transfer, Supplier Return or Repair
  record and prints `Required · Handed over · Not handed over` with drill-down to IDs.
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
Dashboard, panel or object menu may create a second Settings door. The page sections are `Sites &
operators · Warehouse calendar · Stock Count · Month-end Stock Confirmation · Problems & evidence ·
Unit ID · Permissions & approvals · External partners`. Settings governs rules/master data only; it
never edits a Unit, reservation, Count result, Transfer/event or Month-end version.

- **Sites & operators:** maintain governed Site name/type, active/closed dates, operating
  organisation and permitted receiving/Count/handover acts. Every external person has individual
  email, name/avatar, organisation, Site/role scope and active dates. Shared company credentials are
  invalid. Carres does not configure NETS internal Zone, Rack, Bin, forklift or pick wave.
- **Warehouse calendar:** maintain the six-day working week, weekly closure, public/partner closed
  dates, receiving/collection cut-offs and Count-submission rule. Every module consumes its computed
  actual weekday/date; staff do not calculate the next working day.
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
  segregation or evidence.
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

**UI / PAGE / OBJECT PLACEMENT →** Inventory is the one Register under `Dashboard · Inbound ·
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

**OPERATOR JOURNEY →** open Inbound on the actual date; read source and exact expected Units; choose
`Open Receiving Session`; scan each Unit and record only the observed result/evidence; submit the
session; read the resulting Received/Not yet received/With issue tally. No operator repeats the
receipt through Inventory.

**UI / PAGE / OBJECT PLACEMENT →** Inbound defaults are `Expected arrival · Source · Supplier/source
party · Destination · SO No · SO date · PO No · PO date · Expected · Received · Not yet received ·
With issue · Work`. Inbound is the dated work/progress Register; Receiving Session is the only
submit door; Inventory has no Add Stock action. Unit Detail links Receiving Session, GRN,
individual receiver, actual date and evidence. No NETS internal Rack, Bin, Zone or placement task
appears.

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
problem · Evidence · Work · Business consequence · Physical outcome · History`. Dashboard,
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

**UI / PAGE / OBJECT PLACEMENT →** Outbound Register defaults are `Required handover · DO No · SO
No · SO date · Journey/leg · From · To · Logistics partner · Units required · Handed over · Not
handed over · Warehouse operator avatar · Delivery person avatar · Evidence · Work`. The linked
Workspace shows exact Unit, product, reservation, check, pack, both scans, evidence, not-handed-over
reason and History. It cannot edit customer date, route, partner, SO, DO or price; `Confirm
handover` appears only when the physical checkpoint is valid. No Zone/Rack/staging/wave page exists.

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

**UI / PAGE / OBJECT PLACEMENT →** Dashboard shows the month, Count window and concrete submission
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
· Unit History`. Reports use the Register Template with filter rail and drill-through. Dashboard
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

## 13 · Current implementation reality — evidence, not law

### 13.1 · BUILT / VERIFIED — the Unit authority foundation (0366, 2026-08-20)

`CARD-2026-08-20-warehouse-unit-authority` is built and applied. The exact physical Unit register
`ops_stock_items` is now the one inventory authority, enforced in the database rather than by
convention. Measured on production before the change, and again after it:

| What the card required | How it is enforced now | Verified |
|---|---|---|
| One permanent Unit ID, never duplicated | `unit_code` NOT NULL, defaulted from `gen_unit_code()`, FULL unique index `ops_stock_items_unit_code_uq` (it was PARTIAL, and 88 of 136 live units carried no id at all) | duplicate insert refused |
| Never reused after cancellation, delivery, return, write-off or disposal | ledger table `stock_unit_ids` — every id ever minted, never pruned; the generator asks the LEDGER, and a birth trigger re-registers | a written-off unit's id refused for reuse |
| A row is never deleted | `stock_unit_identity_permanence` refuses every DELETE (0341 protected only committed units); `trg_po_units_follow_destination` now VOIDS surplus incoming units instead of deleting them | delete refused |
| A replacement label keeps the original id | the same trigger refuses any change to `unit_code` | rename refused |
| No bulk sofa row acts as several reservable Units | CHECK `ops_stock_items_bulk_never_reserved`; trigger refuses `qty > 1` when the CATALOG says the SKU is a sofa | bulk reservation refused |
| Ownership: Carres Owned vs Supplier Consignment | `ownership` column + CHECK; consignment must name its supplier | — |
| Site, operating party and role are separate | `warehouses` = Site; new `stock_operating_parties` = WHO HAS IT (`carres_warehouse`, `nets_warehouse`, `nets_delivery`, `pj_showroom`); `holder_party_id` on the Unit. NETS is a row, never hard-coded | two doors, neither moves the other |
| Last verified date | `last_verified_at`, stamped only by `ops_stock_verify_unit` | — |
| Append-only identity and physical event lineage | `stock_unit_events`, written by a TRIGGER on the register itself so no door can forget it; UPDATE and DELETE both refused; ordered by a monotonic `seq` (0372) | a Unit driven through a governed life in one transaction reads `unit_born -> status_changed -> reservation_changed -> protection_changed -> holder_changed -> verified -> ownership_changed -> condition_changed`, 8 events, 8 distinct sequences, and the sequence itself refused a rewrite |
| ONE availability arithmetic | `unit_availability(status, needs_repair, hold_reason, condition)` in SQL and `unitAvailability()` in `packages/shared/src/unit-availability.ts`, pinned to each other by tests | six words, both sides |
| Availability is never a stored number | view `stock_sku_availability` computes from the register on every read — it cannot be stale. A trigger-kept column was rejected: a second copy is still a second copy (Architecture Law D) | — |
| Every derived total drills to the exact ids | view `stock_unit_availability_v` carries id, availability, lifecycle outcome, catalog category and source status | 74 (sku, site) rows all drill |
| A bulk record is never mistaken for promisable stock | `stock_sku_availability` carries THREE named numbers (0368) | 85 bindable · 893 bulk · 978 sellable |
| Negative stock impossible | availability is counted from units that exist; `stock_balances_qty_nonneg` | 0 impossible rows |
| No generic Edit, Delete, Add stock, Remove stock or status selector | `ops_stock_items` lost its write policy entirely; `POST /api/ops/stock` ("+ Add stock"), `DELETE /:itemId`, `POST /api/operation/warehouse/adjust`, `operation_adjust_stock` and the `+ Adjust` modal are all gone | adjust refused in words |
| One governed door per fact | `ops_stock_set_condition` · `refurbish` · `refurbish_complete` · `bind_units` · `unbind_unit` · `set_site` · `set_holder` · `set_ownership` · `verify_unit` · `book_in_units` · `set_thresholds` | — |
| No second reservation writer | the two raw writers measured on live (POS post-receive labelling, the sofa-loan claim and its rollback) now go through `ops_stock_bind_units` / `ops_stock_unbind_unit`. Sales Order still decides WHICH unit; Stock only records it | — |
| A stock total can never be hand-written | `stock_balances_derived_only` refuses any write to `qty`/`reserved` outside the rollup | hand-write refused |

**The two arithmetics that did not agree, measured.** `ops_rollup_stock_balances` used `count(*)`,
not `sum(qty)`, so the five live bulk rows (qty 2 · 555 · 15 · 319 · 2) counted as ONE unit each.
They contribute **893 units**; the rollup saw 5. After the change the cache and the authority agree
on every row (`cache_drift = 0`), and the live figures are 978 available · 2 reserved · 43 incoming
across 74 (sku, site) rows.

**`stock_balances` survives as a NON-AUTHORITATIVE CACHE, and nothing may read it as truth.**
Eighteen live SECURITY DEFINER functions across Orders, Purchasing, Receiving and Delivery still
read its `qty`/`reserved`; dragging them into a Warehouse foundation card would have been a worse
change. So it lost its independence instead: no hand write, recomputed by statement trigger inside
the same transaction as the change, and every screen that decides whether goods can be OFFERED —
the alert RPC, the POS shortage feed, the warehouse totals, the stock summary, the order drawer,
the purchase assembly and the PO-duty cron — now reads `stock_sku_availability`. Its
`low_threshold`/`high_threshold` remain, because those are Settings and configuration is what
survives go-live. **Retiring the cache entirely is the next card's work, not a gap in this one.**

**THREE NAMED NUMBERS, because there are three questions (0368).** 0366 shipped ONE `available`
and it answered two of them at once — the defect this whole card exists to remove, found by review
before merge. `ops_stock_items_bulk_never_reserved` forbids a `qty > 1` record from ever being
reserved, yet `available` summed those records: it said **978** where **85** could actually be
promised. Corrected to:

| Number | The question it answers | Live 2026-08-20 |
|---|---|---|
| `available` | which exact Units can a Sales Order BIND right now | **85** |
| `bulk_on_hand` | pieces present in a `qty > 1` record — real goods no exact-Unit promise can name | **893** in 5 records |
| `sellable` | must we BUY more? (`available + bulk_on_hand`) | **978** |
| `on_hand` | what is physically at this Site, reserved and controlled included | **980** |

`sellable` is what the reorder alert, the POS shortage feed, the purchase assembly, the PO-duty cron
and the Stock page's sellable column read — a shelf holding 555 pillows needs no purchase order,
whether or not a pillow carries an identity. `available` is what an exact-Unit promise reads.
Nothing computes `on_hand - reserved`. `stock_balances.qty` deliberately did NOT move: it tracks
`sellable + reserved`, which is the free + reserved membership it has meant since 0137.

**THE ONE THING THIS CARD SURFACED AND DID NOT DECIDE — an owner question.** 893 real pieces
(pillows, mattress protectors) sit in 5 bulk records, and **no Sales Order can bind any of them to a
customer**, because a record standing for 555 anonymous pieces cannot carry one customer's promise.
Splitting them into 893 Units was proposed and rejected here: MASTER §3 requires an identity for
every sofa and every independently saleable or replaceable module, the id is printed by the SUPPLIER
on its own label, and Carres does not label 555 pillows one at a time — minting 893 ids would change
how Carres operates, which is Jess's call and not a migration's. The card also forbids a backfill
over imported rows, and every live row is test data.

So the question stands, and it is a real operating choice, not an engineering one:

```
AUTHORITY SEARCHED       Stock MASTER §3 (Unit identity, supplier-printed label) ·
                         §4 (availability) · Card §2/§6 · Constitution §6 (clean start)
WHY NOT ALREADY RESOLVED the approved model requires identity for FURNITURE and is silent on
                         whether an accessory piece carries one
TWO REAL OPTIONS         (a) every accessory piece is a Unit with a supplier-printed id -
                             honest binding, but the supplier must label pillows one by one
                         (b) accessory demand is satisfied WITHOUT exact-Unit binding -
                             no labelling burden, but the Sales Order can never promise a
                             specific pillow and Stock needs a quantity-draw door for them
RECOMMENDATION           (b). The labelling cost in (a) falls on the supplier for goods nobody
                         traces individually, and the operator gains nothing from it.
OPERATIONAL CONSEQUENCE  under (b) a later card owes Stock a governed quantity-draw door for
                         bulk records; until then those pieces are visible and countable but
                         not promisable, which is exactly what the screens now say.
```

Nothing is blocked on the answer: the numbers are honest either way, and both options build on the
same Unit authority.

**CLOSED 2026-09-01 — the Blueprint answered it as option (b).** §14.1 G3 rules that every sofa and
independently saleable module carries a Unit ID while governed interchangeable goods use quantity
scope without exact-Unit binding. The governed quantity-draw door for bulk records remains an
approved target for a later card.

**`ended` never erases how a life ended.** `unit_lifecycle_outcome()` is a separate authoritative
answer beside the availability word — `delivered` · `cancelled_before_receipt` · `written_off` ·
`returned_to_supplier` · `active` — so Delivered / history can tell them apart without a second
query or a second arithmetic. Physical disposal is not a fifth word until that fact is recorded.

**Seven migrations, because self-review and review kept finding real holes. Every one was found by
looking again, not by a failing test — which is the point of Law 4. Two of them (0369, 0370) exist
because a guard described as protecting the numbers could not fire at all, and one (0371) because
the new authority disagreed with the oldest reader it was meant to replace.**

| | What it does | Why it exists |
|---|---|---|
| **0366** | the foundation above | the card |
| **0367** | revokes the write grants on the five objects 0366 created | **found by self-review.** 0366 §10 revoked INSERT/UPDATE/DELETE on the register and the cache by name, but assumed a NEW table starts with no write grant. Supabase's `ALTER DEFAULT PRIVILEGES` hands `authenticated` ALL on every new table in `public`, so all five came out carrying INSERT/UPDATE/DELETE/TRUNCATE. RLS still refused the three tables — but `stock_unit_availability_v` is a simple view over one table and therefore **auto-updatable**, a latent second door onto the inventory authority. 0366's sanity block checked policies and never checked grants, which is why it passed. 0367 revokes, and asserts grants from here on. It also revokes TRUNCATE, which empties a table without firing the row trigger that refuses a delete |
| **0368** | the three named numbers above, and widens the bulk guard from sofa-only to sofa/bedframe/mattress | **found by review.** `available` overstated promisable stock ~11x; and two of the five live bulk records (`DIVAN ONLY (K)`, `SONIC-L1202S-Q`) are furniture, which a sofa-only guard never covered. The guard asks the CATALOG, so a SKU the catalog does not hold cannot be judged and passes — at go-live the catalog is configuration that survives, so every real SKU has a row; today none of the five does, which is why the sofa-only guard never fired on any of them |

| **0369** | every bucket in `stock_sku_availability` is `coalesce(..., 0)`; `anon` loses its SELECT on all seven objects; the sanity block is rewritten NULL-safe and carries its own negative control | **found by review, and the sharpest of the three.** 0366 counted rows (`count(*) filter`, which returns 0 for an empty group); 0368 had to SUM `qty` so a bulk record contributes 555 rather than 1 — and `sum(...) filter` returns **NULL** for an empty group. Measured: `reserved` NULL on 73 of 74 rows, `bulk_on_hand` on 69, `incoming` on 50. Worse, 0368's own reconciliation guard was written `where sellable <> available + bulk_on_hand`, and a NULL on either side makes that predicate NULL — neither true nor false — so it never raised. **The predicate evaluated to NULL on all 74 rows: the guard was not passing, it was not testing anything.** A test believed to hold while the thing it guards is broken. 0369's guards use `is distinct from` and one of them is a deliberate negative control that proves the reconciliation check CAN fail |

| **0370** | the rollup upserts every pair (no `> 0` predicate), then RE-READS what it wrote and raises if it disagrees with the register | **found by review, and it had already caused harm.** During the window between 0368 and 0369 the view returned NULL for empty buckets, and the rollup's two predicates both read `(sellable + reserved)`: `NULL > 0` is NULL, so the INSERT skipped the row and the follow-up `update ... set qty = 0 where not exists (... > 0)` matched it and **zeroed it**. The cache said Carres held **5** units where the register held **980** — and eighteen SECURITY DEFINER functions read that cache. Repaired by re-running the rollup (980 = 980, 0 drifted rows). But the real defect was that a function whose whole job is to keep two numbers equal could write a wrong answer and return success, so it now proves its own answer and a disagreement aborts the statement that caused it |

| **0371** | `unit_availability()` gains CONDITION, and the three-argument signature is dropped | **found by review, comparing the new authority against the oldest free-stock reader in the repo.** `readFreeStock` in the To Order engine has excluded damaged goods since 2026-08-04, and said why: R4 releases a quarantined unit back to `free` keeping the condition it was released with, so a damaged unit can be free, sound and unsellable. 0366's arithmetic never asked about condition — so the moment a damaged unit is released, the AUTHORITY would offer a unit every other reader refuses. Live exposure is zero today (0 damaged units; live conditions are `new` and `exhibition`), which is the same reason To Order closed it early. The old signature is DROPPED rather than defaulted: a fourth parameter with a default leaves the wrong call resolvable, which is how this existed in the first place |

| **0372** | `stock_unit_events` gains a monotonic `seq`, and `event_at` moves from `now()` to `clock_timestamp()` | **found by review, the first time anyone READ a lineage instead of asserting the trigger fired.** Driving one Unit through a governed life in a single transaction wrote all eight events correctly and returned them as `status_changed -> unit_born -> …` — a Unit that was BORN SECOND. `now()` is the TRANSACTION start time, so every event written in one transaction ties to the microsecond and the order collapses to a uuid tiebreak. Every governed door writes several events per transaction, so this was the normal case, not an edge. MASTER §7 asks In & out for "actual time … event", and §6 asks a correction to preserve the original event and its time; an append-only history whose order cannot be reconstructed answers neither |

**Verification evidence.** All seven migrations applied to production; each sanity block passed.
Eight negative controls were run against production in a rolled-back transaction after 0366 —
duplicate id · delete · id reuse after write-off · rename · bulk reservation · hand-written total ·
the retired adjust door · editing a unit event — and **all eight fired**; the register was unchanged
afterwards (136 units · 136 ledger ids · 0 events · 0 units without an identity). After 0367 the
seven Warehouse objects carry SELECT and nothing else. After 0368 the three numbers reconcile
(85 + 893 = 978) and `stock_balances` did not move (`cache_moved = 0`). After 0369, across the same
74 rows: **0 NULL buckets** in any of the eight columns, the reconciliation guard passes for real
and its negative control proves it can fail, and **0 grants of any kind remain to `anon`** on the
seven objects. Live figures unchanged throughout: on_hand 980 · available 85 · bulk_on_hand 893 ·
sellable 978 · reserved 2 · incoming 43. After 0370 the cache equals the register exactly (**980 = 980**, 0 drifted
rows), and healing was proven end to end in a rolled-back transaction against production: the cache
was zeroed deliberately, ONE unit was touched, and the statement trigger restored all 980 units for
the whole Site.

**All seven applied migrations were reconciled against their repository files** by comment-stripped
md5 — every one an exact match, so what production runs is what the repository says:

| Migration | md5 (repo == applied) |
|---|---|
| 0366 | `33ab7586e227a63366f0ba44d9c7ebc8` |
| 0367 | `a98022030312d9071a60b3b2c55d1ada` |
| 0368 | `c13fbeab0f2cb7fa4772bf9b46be3d96` |
| 0369 | `c9860a6375a0d89ebb0bc6e954170a38` |
| 0370 | `07357039f1ad66aa1bd11163a1aa43d4` |
| 0371 | `a45dea200a0556fea6bd060ae812b690` |
| 0372 | `5c3b8be145f1382c553009b42aa550fc` |

**Card §6 coverage, item by item.** Each row says how it is proven, not that it is.

| Card §6 requires | Proven by | Result |
|---|---|---|
| duplicate and reused Unit IDs are refused | production negative controls ①③ — duplicate insert, and reuse of a written-off unit's id | both refused |
| traceable goods cannot be an over-reserving bulk row | CHECK `ops_stock_items_bulk_never_reserved` + the catalog-driven trigger; negative control ⑤ | refused |
| Carres Owned and Supplier Consignment stay distinct | production controls — a third word refused, consignment-without-supplier refused, consignment-with-supplier persists, default is `carres_owned` | 4 of 4 fired |
| Site and operating party change independently | route tests: two doors, and neither call carries the other's parameter | green |
| Sales Order reservation reflected with no second Stock writer | the register has no write policy; the two raw writers now call `ops_stock_bind_units`; route test asserts no direct `.update()` | green |
| incoming, in-transit, protected and reserved absent from available | live view query — rows that are `available` while not free/sound/unreserved/undamaged | **0 leaks** |
| every derived total drills to the exact contributing ids | live query comparing each `available` against the sum of its own contributing unit rows | **0 that do not drill** |
| direct or unauthorised writes and deletes are refused | negative controls ②④⑥⑧ + the grant assertions in 0367/0369 | all refused |
| existing Purchasing, Receiving, Orders and Delivery tests green | full API suite | 2293 green |

**The one item this card does NOT prove: "incomplete".** Card §6 asks that an *incomplete* Unit be
absent from available results. Missing components/packages is not a fact the register records — there
is no column for it and no door that sets one — so nothing here can enforce it. `damaged` and the
protection reasons cover the adjacent cases. Recording completeness is Receiving's scan surface
(MASTER §5) and belongs to that card; it is named here so it is not mistaken for shipped.

**Local release gate:** shared (2474) and API (2293) suites fully green; typecheck, lint, build
clean; no server secret in the web bundle. The web suite is green on 265 of 266 files. The one
exception is **pre-existing flakiness this card did not cause and did not fix**:
`apps/web/src/pages/operation/OperationPurchaseOrders.test.tsx` (last touched by PR #858, untouched
by this branch) passes 132/132 in isolation but times out under full parallel load — three
consecutive full runs failed a DIFFERENT set of its tests each time (16, then 2, then 1), with the
drag-and-drop column-reorder tests taking 68s and 36s before failing. It is flagged for its own
card rather than papered over here.

### 13.2 · BUILT / VERIFIED — the Stock Register (0373, 2026-08-21)

`CARD-2026-08-20-stock-register` is built. **`Stock` replaced `On hand`** as the Warehouse master
list: the rail row, the destination header, the page and `Jump to` all say Stock, and the word
`On hand` is absent from every operator surface. The `?tab=stock-onhand` address is unchanged, so
no bookmark and no learned rail position moved.

| What the card required | How it is met | Verified |
|---|---|---|
| The destination says **Stock** | `portal-nav.ts` row, `ModuleHeader word="Stock"`, `Jump to` reads the same word | test asserts `On hand` appears nowhere on the surface |
| One register, not separate stores | the page reads `stock_unit_register_v` and nothing else | test asserts `ops_stock_items` and `stock_balances` are never fetched |
| Every count derives from Card 1's authority | `availability` and `lifecycle_outcome` arrive already decided; the page copies them | test feeds a row whose `status` contradicts its `availability` and asserts the VIEW wins |
| Rail sections, cross-section filtering, clear-all, deep-link | rail state lives in the URL; sections AND together; `All stock` clears everything | 13 page tests + 29 pure tests |
| `Changed` uses PHYSICAL events only | `stock_unit_register_v.last_event_at` (0373), ordered by `seq` per 0372 — never `updated_at` | migration sanity + negative control |
| Exact Unit search opens the correct Unit Object | `/operation/stock/unit/:unitCode`, looked up by the PERMANENT id | API test asserts the lookup is by `unit_code`, never row uuid |
| Ended Units out of the default view, still findable | `ended` is filtered out unless the id is typed EXACTLY, or `Delivered / history` is chosen | test asserts a delivered Unit is hidden by default, found by exact id, and NOT found by prefix or product |
| No dead controls, generic editor or second reservation door | the page is read-only | test asserts no Reserve/Release/Edit/Delete/Add stock/Adjust/Mark done control exists |
| Current/non-current year formatting | the ONE governed formatter, `fmtDate` | — |

**THE FOOTER PRINTS TWO NUMBERS, AND THAT IS THE POINT.** `85 you can promise · 893 pieces you
cannot`. §13.1 established that a `qty > 1` record can never be reserved; a Register that printed
one number would either hide 893 real pillows or promise 893 that no Sales Order can name. The row
itself repeats the warning inline — *"555 pieces in one record — cannot be promised individually"* —
which is the one permitted inline second line, and it earns it. This keeps the open owner question
in §13.1 visible on the screen where it matters instead of buried in a document.

**Date spelling — a deliberate deference.** Card §4 spells time `Tue, 18 Aug · 10:42 AM`; the
portal's one governed formatter spells it `Tue, 18 Aug 10:42`. `fmt-date.ts` records that three
page-local formatters were deleted for disagreeing with it, so the Register uses the governed one.
Changing the spelling is a one-line change in that file for whoever wants it — and it must happen
THERE, for every page at once, never here.

### 13.3 · The rail is drawn from facts that exist — and five are missing

Card §3 names nine Attention reasons. **Four shipped; five have no fact to read**, and inventing a
chip that reads a column nobody writes would put a number on screen that means nothing.

| Reason | State | What it waits for |
|---|---|---|
| waiting inspection · damaged · in repair · no purchase order | **BUILT** | — |
| cannot find | not built | a "cannot find" observation — Issues/Counts card (§6) |
| Unit ID issue | not built | the governed relabel/issue record (§3) |
| Site differs | not built | a second Site, and Counts (§6). One Site exists today |
| components missing | not built | a components manifest — Receiving's scan surface (§5) |
| evidence incomplete | not built | an evidence-completeness fact (§5) |

Two more reasons are measurable but were deliberately NOT shipped as chips because they flag
**136 of 136 Units**, which is the same as flagging nothing: `last_verified_at IS NULL` (the column
shipped hours earlier) and `holder_party_id IS NULL` (no door populates it yet). They become useful
the moment Counts and the handover doors write them. `Who has it` is still shown as a COLUMN, and
reads **Not recorded** rather than inventing a holder.

`Where` and `Ownership` render only when the data holds more than one value — one Site and no
consignment Unit exist today, and a filter offering one choice is not a filter
(`03-page-patterns.md:149`). Each section appears by itself when a second value arrives; no code
changes.

`Changed` shows **0 in all three scopes**, honestly: `stock_unit_events` holds 0 rows because every
Unit predates 0366's lineage trigger and nothing has physically moved since. The rail says so in
words rather than showing three empty filters that look broken.

### 13.4 · Still not built

The superseded planning-page meaning of Ready stock, generic Held stock or Quarantine, and the
claim-only issue route remain superseded. Transfers (PR #860), Counts, month-end, Ready stock as
eligible Units, Showroom Sites, the partner mobile surfaces and the reports in §11 remain
**APPROVED TARGET / NOT BUILT**.

**`OperationStockOnHand.tsx` IS DE-ROUTED, NOT DELETED, AND THE REASON IS A DEPENDENCY.** No
operator can reach it. It is kept because TWO capabilities still live only there:
`ReorderStockCard` (the K1 reorder points, migration 0286 — the one door where a reorder point and
lead days are set) and `ImportStockDialog` (the Klg Warehouse sheet import). Deleting the file would
destroy both without replacing them, and an existing useful capability defaults to KEEP. Their
homes are **Ready stock** (reorder points) and **Settings/Maintenance** (the sheet import) — a
relocation this card's scope excluded. **The file dies in the PR that gives those two a home, and
that is the next Warehouse scope.**

0366's five governed doors that could legitimately live on Unit Detail — `ops_stock_set_site` ·
`set_holder` · `set_ownership` · `verify_unit` · `set_condition` — are **NOT wired**. Each needs its
own confirmation copy, permission surface and evidence rule; wiring them half-way would put five
buttons on screen whose refusals nobody had designed. They are the scope after the relocation.

### 13.5 · BUILT — the four destinations in the rail (CARD 01, PR #1045)

`CARD-2026-09-01-warehouse-01-sidebar` shipped the §2 map: the Warehouse module rows are
**Dashboard · Inbound · Inventory · Outbound**, complete from day one. `Inventory` is the one
live door — the same Unit Register page, key and `?tab=stock-onhand` address unchanged, its
destination header/docTitle/export renamed to the rail's word. Dashboard, Inbound and Outbound
print `Coming soon` as non-controls and go live in their own pages' PRs. The collapsed 60px
icon opens the NAMED landing (`WAREHOUSE_LANDING_KEY` = Inventory) until Dashboard exists.

The superseded `Stock · Ready stock · In & out · Transfers · Counts` rows left the rail.
**De-navigated, not deleted:** `?tab=stock-plan` (reorder points K1 · urgent restock K3 · pool
usage K4) and `?tab=movements` (event history) keep their routes until their capabilities
relocate — replenishment to Purchasing/Settings under this Blueprint, the history into Unit
History/Inventory. Those relocations join the `OperationStockOnHand` debt above as the named
next scopes. Production proof rides the PR's deploy record.

### 13.6 · BUILT — Inventory works and tells the truth (CARD 02, PR #TBD)

`CARD-2026-09-03-warehouse-02-inventory` closed three measured P0s. **The register API had
answered 500 since birth**: the route selected `site_name`/`holder_name` from
`stock_unit_register_v` and no migration ever gave the view either column — the route merged
2026-08-21, its migration never landed (the inverse of red line 7). **0417** adds the two
governed-name joins on 0373's exact shape. **A Unit's permanent address rendered the
Dashboard**: `stock/unit/:unitCode` had a Route but never joined `isUrlDriven`; fixed with the
route-gate test that only mounting the app can provide. **Every Warehouse surface drew two top
rows**: the register, both de-navigated legacy pages and Unit Detail draw their own Destination
Header and none suppressed the slim global bar; all four do now, with a dashboard control test.
The rail group and column that said `Attention` say **`Needs checking`** (§2's rejected-word
list, applied). Column/rail re-architecture to §12.1's defaults remains the next Inventory
slice, deliberately.

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
| G9 | Delivery selection without physical Warehouse handover lets digital state outrun reality; Outbound requires exact two-sided handover. | approved cross-module target / not built |
| G10 | return state without return receipt/inspection leaves false holder and availability; Return/Repair uses new out-and-back events and check required. | approved lifecycle target / not built |
| G11 | unknown import cannot become new/sellable/reserved truth; reject to review and never allocate through migration. | data-governance/engineering gap |
| G12 | giant mixed UI and drifting copy are not business decisions; governed Shell/Register/Object Detail and four destinations consolidate presentation. | UI/engineering consolidation gap |
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
for this coverage. No lifecycle or cross-module seam remains an unknown deferred blind spot;
implementation may later be dependency-sliced only after a separate BUILD/DELIVERY takeover.

### 14.3 Resolution classification

Resolved: legacy tab shell to Warehouse destinations; On hand master list to Inventory; Ready stock planning to
eligible Units; warehouse-only scope to all governed Sites and journeys; rollup to Unit authority;
bulk sofa to Unit identity; Quarantine to observable issue and automatic control; Receiving-only
supplier fault to Receiving and Service entrances; NETS-as-place to Site/operator separation;
one movement status to collection, transit and arrival; bulk reservation to Sales Order exact-Unit
binding; missing month-end to Stock date, window, reconciliation and version; generic task to the
shared Action contract; and hard-coded NETS to role-based partner/future-self-operation.

Intentional rejects now: Dashboard as a second truth/KPI wall, second exception register, manual totals,
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
