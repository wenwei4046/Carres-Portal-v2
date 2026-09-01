# STOCK / WAREHOUSE — MASTER

> **APPROVED / LOCKED — owner-reviewed 2026-08-20; navigation, daily work and duty continuity
> amended 2026-09-01.**
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
| material adjustment, write-off and major dispute approval | Management |

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
supplier adds CARRES UNIT ID to its own label; Carres does not routinely print supplier labels.
A wrong or unreadable label starts a controlled issue, never a second Unit. Replacement labels keep
the original ID and full evidence. IDs are never reused.

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
with its last confirmed holder. Customer Delivery remains Delivery's record; Stock reads its
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
| Written off | COO approves the governed Stock Adjustment | Written off |
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
Purchasing-owned supplier collection is physically completed; a correction is approved; or the COO
approves write-off and separate physical-disposal proof later records disposal. Write-off approval
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

The COO view adds exception summaries over the same drillable facts: unresolved Stock differences,
Adjustments awaiting COO approval, damaged Units requiring a decision and Month-end submissions not
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
investigation, Adjustment request, COO approval, completion and reversal in one control surface.
The first count is blind. Difference is evidence requiring comparison and recount; it is not an
automatic Adjustment.

The page starts with the shared actual-date strip. Its Register defaults are:

```
Count No · Site · Stock date · Count date · Must submit by · Result · Work
```

It retains scheduled, submitted, differences found, Count again, investigation, Adjustment waiting
for COO, completed and reversed records in this one view. The governed path is:

```
blind first Count → compare → Count again → investigate Receiving/handovers/Delivery/repair/
Transfers → record result → Correct this record OR Request Adjustment → COO decision
```

NETS performs physical Count and Unit-level Count again with evidence. The current GRN Duty
investigates a persistent difference and submits any Adjustment request. Only the COO approves or
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
  buddy/cover and counts from the same Work Engine. Team is the only duty edit door. External NETS
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
- Only the COO approves a material Adjustment, write-off or unexplained major difference; the
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
actual work date and any required COO decision. Staff do not manufacture a zero-difference report
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
reconciles and submits by the governed submission date; the COO decides any Adjustment on its own
actual date. Completion comes from the Count submission, Month-end submission or COO decision fact,
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
- The COO is the sole Management approver for material adjustment, write-off, compensation and
  major dispute; approval does
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
  correction, Adjustment request, COO decision and reversal. A final adjusted total may not hide the
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
facts; the COO receives all Warehouse reports and approval evidence. Cost, settlement, customer
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
  Warehouse, NETS Delivery, Showroom, GRN Duty, PO Duty, Sales, Purchasing, Finance and COO receive
  only the actions stated in §10. The COO governs approval limits; a permission never overrides
  segregation or evidence.
- **External partners:** maintain organisation, warehouse/delivery roles, governed Sites, calendar,
  allowed actions, evidence requirements and active dates. No rule hard-codes NETS, so another 3PL
  or a future Carres-operated warehouse uses the same Unit/Receiving/Inventory/Outbound model.

The shared **Team** duty door remains the one place to view or correct PO Duty, GRN Duty and
buddy/cover. The governed **People** record supplies active status, access and last working date.
Warehouse Settings links to those homes and must not copy either rota or employment truth.

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
product service; Sales Order displays promise risk only; COO alone approves governed material
Adjustment, write-off or unexplained major difference.

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
only the COO may approve or reject it. Approval creates an append-only Unit correction while
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
investigation, correction, Adjustment request, COO decision, resulting Unit events and History.
No ordinary-user plus/minus form exists.

**CROSS-MODULE CONNECTION →** Stock owns Count/Difference/investigation and physical correction;
Receiving and Delivery/Outbound supply missing receipt/handover facts; Purchasing handles supplier
quantity/product consequence; Finance consumes approved results and the Month-end version; COO
alone approves governed material or unexplained Adjustment.

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
owns Supplier Invoice/Credit Note/settlement; COO approves major unexplained difference/write-off/
compensation.

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
consequence; COO owns Adjustment approval; Finance acknowledges and uses a version for valuation/
submission; Reports exports but never becomes authority.

## 13 · Current implementation reality — evidence, not law

The superseded implementation has one Stock entry with On hand, In & out and a reorder-planning
page called Ready stock; ops_stock_items and stock_balances can diverge; bulk quantity rows, legacy
on_hold, take-out and movement defects, reorder points and pool-usage rules exist.

These are not approved business law. They are gaps to re-measure before any build. The old
three-tab IA, wording, Ready stock meaning, generic Held stock or Quarantine, rollup authority,
bulk sofa identity and claim-only issue route are superseded.

## 14 · Resolved contradictions and plan state

Resolved: legacy tab shell to Warehouse destinations; On hand to Stock; Ready stock planning to
eligible Units; warehouse-only scope to all governed Sites and journeys; rollup to Unit authority;
bulk sofa to Unit identity; Quarantine to observable issue and automatic control; Receiving-only
supplier fault to Receiving and Service entrances; NETS-as-place to Site/operator separation;
one movement status to collection, transit and arrival; bulk reservation to Sales Order exact-Unit
binding; missing month-end to Stock date, window, reconciliation and version; generic task to the
shared Action contract; and hard-coded NETS to role-based partner/future-self-operation.

Intentional rejects now: duplicate Warehouse Dashboard, second exception register, manual totals,
negative stock, generic status editing, Position or slot at current scale, heavy WMS without
measured need, and assumed external cutover.

**RESOLVED FROM AUTHORITY:** Unit authority, ownership seams, shared Work and UI grammar and
upstream/downstream owners.

**APPROVED TARGET / NOT BUILT:** this complete Warehouse operating model and UI.

**BUILT / VERIFIED:** only the implementation evidence in §13, to be re-measured before build.

**REAL GAP / CONTRADICTION:** none requiring an owner decision.

**OWNER DECISIONS:** none unresolved.
