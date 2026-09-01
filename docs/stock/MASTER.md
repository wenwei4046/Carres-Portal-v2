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

Delivery works backward from the customer date using governed calendars, cut-offs and transit.
Warehouse consumes the calculated latest Carres Warehouse ready date and completes exact-Unit
check, completeness, pack and handover facts; it never guesses the date.

A Transfer has exact Units, From, To, collection and arrival. Collection and arrival are separate
facts. Partial handover changes only affected Units. A Unit not confirmed at destination remains
with its last confirmed holder. Customer Delivery remains Delivery's record; Stock reads its
handover facts instead of creating a duplicate Transfer.

A Singapore SO has two Delivery legs: Carres Klang Warehouse to the selected JB partner warehouse,
then that warehouse to the Singapore customer through EU or SSY. Each leg has its own logistics
partner, linked DO or trip scope, dates, handovers and proof.

A returned Unit is Returned — check required, never automatically Available. Repair requires
outbound handover, external-holder truth, return handover and inspection. Supplier collection
requires Purchasing authority and actual handover. Write-off approval and physical disposal are
separate facts. Ended Units leave the default view but remain searchable in Delivered / history.

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

Central Settings owns Sites, external operators and roles, Stock calendar, month-end and Count
rules, issue reasons, evidence rules, Unit ID rules, permissions and approval limits. The shared
**Team** duty door remains the one place to view or correct PO Duty, GRN Duty and buddy/cover; the
governed People/account record supplies active status, access and last working date. Warehouse
Settings must not copy either rota or employment truth. Settings never edits a Unit, reservation,
event or report.

Carres Portal is the minimum control plane. NETS receives narrow mobile Work, scan, observable
outcome and evidence surfaces, not the full ERP. Optional APIs may propose events but cannot
overwrite Unit truth. Offline scans remain visibly Not submitted and non-authoritative until
submission; actual and submitted times are separate.

The model never hard-codes NETS. Site, operating party, role, permission, calendar and evidence
remain separate. Current scope rejects unproven heavy-WMS bin, rack, put-away, pick-wave, forklift
and packing-station complexity. Zone, Rack or Bin may extend the same Unit model when measured need
justifies it.

## 12 · Current implementation reality — evidence, not law

The superseded implementation has one Stock entry with On hand, In & out and a reorder-planning
page called Ready stock; ops_stock_items and stock_balances can diverge; bulk quantity rows, legacy
on_hold, take-out and movement defects, reorder points and pool-usage rules exist.

These are not approved business law. They are gaps to re-measure before any build. The old
three-tab IA, wording, Ready stock meaning, generic Held stock or Quarantine, rollup authority,
bulk sofa identity and claim-only issue route are superseded.

## 13 · Resolved contradictions and plan state

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

**BUILT / VERIFIED:** only the implementation evidence in §12, to be re-measured before build.

**REAL GAP / CONTRADICTION:** none requiring an owner decision.

**OWNER DECISIONS:** none unresolved.
