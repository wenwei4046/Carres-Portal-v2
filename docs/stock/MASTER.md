# STOCK / WAREHOUSE — MASTER

> **APPROVED / LOCKED — owner-reviewed 2026-08-20.**
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

Warehouse destinations are **Stock · Ready stock · In & out · Transfers · Counts**.

- Stock: every currently controlled Unit.
- Ready stock: exact Units currently eligible for a new customer promise.
- In & out: append-only physical events.
- Transfers: Site-to-Site movement and handover.
- Counts: dated physical counts and Unit-level differences.

Reports, Settings, Work, Quick Rail and Calendar keep their shared Shell homes. Receiving,
Purchasing, Delivery, Payments and Service Cases keep their own doors.

Approved operator words include **Where · Who has it · Carres Owned · Supplier Consignment ·
Report issue · Count again**.

Rejected Warehouse UI words include On hand as the master-list name, Stock Units as the list name,
Inventory, Movements, Custody, bare Hold, Quarantine, and generic Review, Handle, Follow up,
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

Inspection records an actual result and permits only governed paths: restore eligibility, dated
repair, Purchasing decision, supplier collection, Count again, approved Site correction or proposed
write-off. Generic Close issue is invalid.

Counts are dated Site work. The first count hides the expected list. After submission, differences
are per Unit. A repeat creates new evidence and says **Count these Units again**. Multiple
mismatches say **Find out why {n} Units do not match the count**.

Cannot find does not reduce Stock. The flow checks last handover and holder, incomplete journeys
and an exact-Unit repeat count. Only an unexplained result becomes a proposed adjustment, and the
proposer cannot approve a material adjustment.

Correct this record preserves the original event, corrected fact, reason, evidence, actor, time and
approval. It is not a stock adjustment. No physical event or submitted report is edited or deleted.

## 7 · Pages and daily journeys

All surfaces reuse the governed Shell, Register, Workspace and Object Detail grammar.

Stock is the one current list. Its left rail filters the same authority by All stock, Attention,
Availability, Site or Where, Ownership, Catalog category, and Changed today, this week or this
month. Time choices are filters, not Work dates.

Ready stock groups eligible Units by Catalog product and Site and expands to exact IDs. Sales enters
its own Choose Unit door; Stock has no second reservation editor.

In & out shows actual time, Unit, event, From, To, handled by, source and evidence. Transfers
provides Register, Detail, mobile collection and arrival. Counts provides Register, mobile scan
workspace and difference surface.

Unit Detail is titled by Unit ID and product. It shows Where, Who has it, ownership, condition,
availability, reservation, last verified, one current attention item, connected records, evidence,
history and permitted actions. There is no generic Edit, status selector or Delete.

- NETS Warehouse opens dated Work, scans receipt, Count and handover, and supplies evidence.
- NETS Delivery scans collection and arrival; unresolved Units remain visibly with it.
- Showroom scans arrivals and departures, sees and counts its Site, and reports observations.
- Carres Warehouse / Stock maintains evidence-backed Unit truth, exceptions, returns and month-end.
- Finance receives frozen month-end facts and never edits Units.
- Management decides material exceptions; approval never replaces physical proof.

## 8 · Work and dates

Warehouse uses the one shared Work Engine. Owner and cover are structured metadata, not sentence
text. The business object has no fake universal Owner. Labels tell a new operator the concrete act;
completion is an authoritative fact, never Mark done.

Every Work row has an actual weekday and date; appointments also have time. Today, This week,
This month and Upcoming are view or group labels only. Without a governed real date, the action
contract is incomplete and cannot enter Work.

- current year: Tue, 18 Aug;
- non-current year: Fri, 1 Jan 2027;
- with time: Tue, 18 Aug · 10:42 AM;
- standalone formal reports, audit evidence and cross-year ranges show the year.

The Stock rail finds Units. Quick Rail finds actions. Calendar shows dated Count, collection,
arrival, return, inspection, repair, supplier collection and month-end commitments.

## 9 · Month-end Stock Confirmation

Each month produces a formal Month-end Stock Confirmation:

- Stock date: final calendar day at 11:59 PM;
- count date: actual date, allowed within two calendar days before or after Stock date;
- submission date: governed Warehouse date after the window.

Stock operations never close. The Portal reconciles exact timestamped Unit events between count and
Stock date; it never guesses, backdates or adjusts a total to match. The frozen report separates
Carres Owned, Supplier Consignment, Sites, In transit, Reserved or sold, controlled Units, approved
adjustments and unresolved differences, with drill-down to IDs.

Warehouse may submit on time with disclosed unresolved differences. Finance acknowledges a specific
version. Later correction creates a reasoned Version 2; Version 1 remains. Finance valuation reads
ownership and source facts but does not write physical Stock.

## 10 · Permissions

- Sales searches and chooses through Sales Order, and reports issues; no physical edits.
- Purchasing owns PO, Consignment, supplier, claim and Sold to Settle; no physical handover/payment.
- NETS Warehouse owns only assigned receipt, warehouse handover, evidence and Count execution.
- NETS Delivery owns only assigned collection, transport, arrival, return and evidence.
- Showroom owns only its Site arrival, count and observation.
- Warehouse / Stock owns Unit, location, condition, availability control, differences, returns and
  month-end; no commercial terms, customer promise or payment.
- Finance owns invoice, settlement, payment, valuation and report acknowledgement; no Unit edits.
- Management approves material adjustment, write-off, compensation and major dispute; approval does
  not replace evidence.

No person completes demand, ordering, receipt, stock adjustment and payment end to end. Cover moves
Work but grants no new capability.

## 11 · Reports, Settings and external boundary

Reports cover Stock by Site, product, ownership and availability; Showroom; stale verification;
receipt, Transfer and Count; partner evidence; current issues; corrections and adjustments; and
month-end versions. Reports are read-only. Export never becomes authority.

Central Settings owns Sites, operators and roles, Stock calendar, month-end and Count rules, issue
reasons, evidence rules, Unit ID rules, permissions and approval limits. Settings never edits a
Unit, reservation, event or report.

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
