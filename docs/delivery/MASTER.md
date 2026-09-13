# DELIVERY — MASTER

> **The only Delivery authority.** Overwrite it when re-ruled; Git is the archive.
> **Owner-approved complete Blueprint, 2026-09-13**, closing the 2026-09-12 to 09-13 owner
> corrections on the 2026-08-14 Blueprint. Sections 1 to 15 are the one current operating model.
> Section 16 is the production closure record of what has shipped; where an entry there quotes a
> word this MASTER has since retired, the entry is historical evidence of that day's build, never a
> second truth. Current implementation may lag this target; existing code, old Cards or legacy write
> doors do not regain authority by existing.

## 1 · Mission and ownership

Delivery turns Sales Order goods that may be delivered into a controlled Delivery Order, a clear
Warehouse-to-Logistics handover, a factual delivery history, accepted proof and either completion
or an explicit next action.

Delivery owns Logistics Partner identity, rules and assignment; the delivery arrangement
(confirmed operational date and time, ETA, driver and vehicle, condo registration, the partner's
actual reply proof); the customer contact record for a delivery; the Delivery Order document and
its lifecycle; each actual delivery event and item result; delivery proof and its review; delivery
exceptions; journey legs; goods-location observations; the two Delivery destinations; and
append-only history.

| Truth read or linked by Delivery | Owner |
|---|---|
| commercial order, `Requested Delivery Date`, customer, address, building type, floor, lift, access, ordered goods, services and permitted commercial split | Sales Orders |
| physical stock, readiness, `Where`, `Who has it`, Warehouse work, handover and return receipt | Stock / Warehouse |
| payment, outstanding, Finance exception and receipt | Payment / Money In |
| the money gate on a Delivery Order | Sales Orders, through the one money arithmetic |
| supplier and PO arrival dates | Purchasing |
| product identity, category and stock identity mode | Catalog |
| the loan obligation and the customer's loan decision | Sales Orders (Order Route) |
| repair, replacement, refund, compensation, claim or complaint | the owning downstream module |
| every action owner | the Shared Duty Resolver through `Workspace → Staff & Duties` |

Delivery never creates a second commercial-order, stock, money, duty, calendar, Service or
Guarantee editor. It records what happened and links the owner that must decide a remedy.

### 1.1 · One Unit, one physical event chain

**OWNER-APPROVED / LOCKED 2026-09-01.** Receiving, Stock / Warehouse and Delivery never keep
independent quantity truth. They reconcile through the same `Unit ID + Source Document + Handover
facts`:

```
Receiving  proves what physically arrived
Stock      owns where each Unit is and who has it now
Delivery   owns which exact Units must reach the customer
Outbound   proves which exact Units were handed to the Logistics Partner
```

The event is recorded once by its owner and read by every connected surface. A module may display
a derived count, risk or completion state; it may not ask an operator to re-enter the same
quantity as a second truth.

The connected evidence chain is always navigable:

```
Sales Order → Delivery Order → Outbound handover → exact Unit IDs
→ Delivery collection → customer arrival proof
```

Receiving's parallel inbound chain is Source PO / Consignment / Return → Receiving Session →
numbered GRN → exact Unit results → Stock consequences. Delivery reads Stock consequences; it
does not post or correct a receipt.

### 1.2 · Condition-gated Service collection

For a Service Case collection whose entitlement depends on item condition, Delivery may arrange
only after the Case carries approved pre-collection condition evidence. The Logistics Work screen
then requires a doorstep check before loading: required photos, governed condition answers and
customer/item match.

- Pass → `Accept collection`; custody transfers only when the item is loaded and acknowledged.
- Fail → `Do not collect — condition failed`; select factual reason, capture evidence and leave
  the item with the customer. Operation decides and communicates the policy outcome.
- Logistics never promises refund/exchange, waives a condition, or debates eligibility.
- A potentially contaminated item accepted in error is marked for Warehouse quarantine.

## 2 · Current Carres operating model

- **NETS Logistics is Klang Valley's current default and main Logistics Partner.** Default
  coverage is configurable and audited, never hard-coded; other partners remain selectable, and
  partner coverage informs the operator but never hides or disables a partner.
- Assigning a Klang Valley delivery pre-selects NETS. NETS is responsible immediately and does not
  click Accept. NETS remains responsible until it records `Cannot Deliver` with a reason and
  evidence.
- NETS contacts the customer and arranges the delivery date and time. Operation may record those
  facts on NETS' behalf; every such record says `Recorded by {person} on behalf of NETS`.
- Operation decides what follows a `Cannot Deliver`: keep NETS with a new date, correct the
  information, hold or cancel the arrangement, or `Change logistics`.
- AL, TT, TEOW, EU, SSY, HOUZS and other partners without Portal access are assigned manually. The
  Portal prepares WhatsApp, email or copy-message content; Operation uploads the partner's actual
  reply before recording a confirmation. Prepared, copied, opened or sent never means confirmed.
- One active Delivery Order has one active Logistics Partner. A permitted split uses separate
  Delivery Orders and may use different partners. A Journey leg is its own assignment.
- NETS Warehouse and NETS Logistics are separate roles and permissions even inside one company.

Current flow:

```
goods may be arranged
→ Operation assigns the Logistics Partner (Klang Valley pre-selects NETS)
→ the partner, or Operation on its behalf, contacts the customer
→ the confirmed day and time window are recorded on the Monitor row
→ the SYSTEM issues the Delivery Order when the governed gate is met
→ Warehouse prepares the exact Units and hands them over; Logistics confirms receipt
→ the partner delivers and records the result
→ Delivery records result, item results, goods location and proof
→ proof accepted and the obligation completes, or explicit next Work begins
```

## 3 · Delivery Order and goods scope

A Delivery Order is Carres' formal authority for a Warehouse to hand specified goods to a named
Logistics Partner for delivery to a customer. It is not proof of Warehouse handover and is never
proof of delivery.

Each DO stores a stable number, source Sales Order, customer, contact and address, Warehouse,
Logistics Partner, customer-contact owner, planned and confirmed date, time window, ETA, goods
and quantities, site and handling requirements, release restrictions, Warehouse status, latest
result, proof, problems and history.

- One Sales Order may have multiple DOs for different goods, Warehouses, dates or Partners.
- Bed-set goods remain inseparable. Sofa may travel separately only with customer agreement.
  Accessories do not block core large goods.
- The issue preview states **This delivery** and **Remaining after this delivery**, with the reason.
- **The SYSTEM issues the DO when its requirements are met.** No `New DO`, `Issue`, `Release` or
  `Approve` control exists on any surface. The one governed manual door is **`Request Delivery
  Order`** (owner ruling 2026-08-19): the outstation trip's door, the same single issuing path and
  the same gates, merely not waiting for the booking-confirm trigger.
- **Money in full before delivery is absolute (owner ruling 2026-09-01).** A DO issues only when
  outstanding = RM 0 and no OPEN Finance exception holds the order. The former Delivery Payment
  Approval door is closed; nothing can request one. An approval granted before the closure is
  still honoured by the 0362 gate, and a DO issued under it prints the COD instruction
  `COLLECT RM {amount} BY ONLINE TRANSFER BEFORE UNLOADING — NO CASH.` on the document. The gate
  record and the Finance exception are defined once in [`../orders/MASTER.md`](../orders/MASTER.md)
  §8; Delivery reads them and never writes them. No new payment exception door may be added.
- Issue rechecks permitted goods, split, Warehouse, address and applicable hold rules atomically,
  snapshots the scope and assigns the next owner. It does not create an actual delivery event.
- Reprint retains the number and logs the event. Once handed to Logistics, a DO is never deleted;
  cancellation, replacement or correction preserves the original history.

### 3.1 · The DO document model — built (migration `0356`)

**One delivery TRIP = one DO.** Most orders: one trip, one DO. A split delivery or two
destinations = one DO per trip, each with its own goods scope. The document rows live in
`ops_delivery_orders`, materialised by ONE trigger on `orders.do_number` so every existing mint
path produces the row. **A Journey leg's document is BUILT (Card 14, migration 0491):**
`ops_delivery_orders.leg` names the scope (0 the whole order, 1..n a leg of
`orders.delivery_stops`), one live document per scope; the leg document issues through the one
issuing discipline (`attemptLegDocumentIssue` → `delivery_leg_document_mint`) the moment the
leg's arrangement carries its partner and its agreed day and the order's money and Finance
gate holds, numbered on the order and the leg; the customer leg's number mirrors onto the
order for the legacy readers. A split-trip DO remains approved target (§15.1).

- **Numbering** stays the locked `DO-DDMMYY-NNNN` scheme (`docNumber`, seeded on the order id):
  a retry, refresh or reprint returns the SAME number; a rebooked trip is a NEW document on its
  own issue date.
- **Document status is DERIVED, never stored** (`deliveryOrderStatusOf`, one arithmetic): the void
  stamp, the `delivery_attempts` history matched to the document's number and the §4 handover
  facts decide `Created · Out for delivery · Delivered · Delivery exception (+ its ONE reason) ·
  Cancelled`. **This is the DOCUMENT's own vocabulary and it stays as it is.** **`Arrived`
  (BUILT 2026-09-13, Card 20):** an intermediate Journey leg's document — a leg before the
  last — whose `delivered` result (0491/0496) is the goods reaching the named partner warehouse
  reads `Arrived` over that stop; `Delivered` is reserved for the customer leg and the
  whole-order document, and a warehouse arrival owes no delivery proof. `Out for delivery`
  on the document = the §4 chain's `Received by logistics` fact with no result recorded yet; it is
  never derived from the calendar. The document ladder and the Monitor status dictionary in §8.4
  never borrow each other's words.
- **A failed document keeps its Delivery exception and reason FOREVER**; it is never rewritten as
  Delivered. When a new date is booked the system issues a NEW DO; the old one stays as history.
- **Staff can never delete or void a DO.** The ONE void door (`delivery_order_void`) accepts only
  `order_cancelled` or `rescheduled` and records reason, actor and time. The booking-confirm door
  supersedes a no-longer-matching active document; `cancel_order` (0357) voids un-delivered
  documents in the cancellation's own transaction. Every gate-completing door attempts issuance
  through the ONE issuing path.

## 4 · Warehouse and Logistics are separate

NETS Warehouse and NETS Logistics remain separate duties and business identities even when one
legal company supplies both. Warehouse owns Picking, Checking, Packing, readiness, physical
handover, returned-goods receipt, quantity, condition and location. Logistics owns customer
contact, arrangement, driver or team, transport, Logistics receipt, ETA, delivery result and
delivery proof.

```
Need Preparation → Picking → Checking → Packing → ready for handover
→ handed over → received by Logistics
```

Readiness is not handover. Handover is not Logistics receipt. Logistics receipt is not delivery.
On return, a Logistics report never substitutes for the Warehouse's actual receipt.

**Built (0494, 2026-09-13):** a Journey leg's document hands over to the LEG's partner — the
handover door resolves the goods-holder from the arrangement keyed `(order, leg)` of the document's
own scope; a whole-order document (leg 0) resolves exactly as before.

**Built (0497, 2026-09-13):** a later leg (2..n) hands over FROM the previous leg's partner at its
named warehouse — every Unit must be held by that partner's operating party (`unit_not_with_previous_leg`
otherwise), and that partner is the handing-over company; leg 0 and leg 1 still leave the Warehouse.
The customer leg's result and proof walk the ONE deliver door (`operation_attach_do_and_deliver`),
re-created for Stock's derived-total law and the Journey: the goods must be OUT WITH LOGISTICS (the live
document's `received_by_logistics`, or the legacy `dispatched` stage); the delivered document's exact
Units (0424 snapshot) become `sold`; no stock total is written; a Journey delivers on its LAST leg's own
document only after every earlier leg has arrived (`journey_document_required` · `journey_incomplete`),
and completes that last stop (`delivered`).

Handover records the exact required Unit IDs, each scanned Unit result, both parties, actual
receiver, time, vehicle when known and signature, photo or reply proof. The derived Outbound
control is:

```
Required Units = Handed over Units + Not handed over Units
```

A partial handover never marks the whole DO collected. Only the handed-over Units change `Who has
it` from the Warehouse holder to the Logistics holder. Every Unit not handed over keeps its prior
holder and its original dated Warehouse work remains open. A discrepancy creates investigation
Work linked to the same Unit IDs and handover evidence; neither party's fact is edited to agree.

Each Delivery Journey leg reconciles its own collected and arrived Unit facts. A two-leg journey
completes neither leg, nor the whole journey, from a count recorded on the other leg. **Built
(0491):** every leg document snapshots the same exact Units (0424), and the one-live-claim guard
refuses a second live claim only from ANOTHER order — a journey's own legs are the one journey.
`delivery_attempts.leg` binds a result to its scope; an intermediate leg records its ARRIVAL
(`delivered` on the leg, moving no Unit, mirrored as `handed_off` on the chain record), the
customer leg's success still walks the delivery door.

**DELIVERY-TO-OUTBOUND RECONCILIATION (owner-approved 2026-09-01).** The DO owns the exact
required goods scope; Warehouse Outbound reads that scope and does not re-create it. For each DO
and each journey leg the shared read-only tally prints `Required · Loaded · Not loaded · Driver
confirmed` and drills to the same Unit IDs. The clickable chain is `SO → DO → Outbound handover →
Unit IDs → Logistics receipt → customer arrival proof`. The shared contract is defined once in
`../ERP-ARCHITECTURE.md` §3.5.1.

One personal login may hold Warehouse, Logistics or both roles and switch between **Warehouse
Work** and **Logistics Work** without logging out. Every event records person, company and active
role. No shared company login is allowed.

### 4.1 · Built — the handover chain (migrations `0363` · `0424` · `0440`)

The chain's last three steps are live as append-only events on the Delivery Order
(`delivery_handover_events`): `ready_for_handover → handed_over → received_by_logistics`, one
pass per document, ordered and deletion-refused at the database. `handed_over` takes multiple
append-only batches naming exact Unit IDs (`delivery_handover_event_units`), each batch requiring
per-Unit `scanned → checked → packed` facts (`delivery_unit_prep`) plus the actual receiver and
proof; the same transaction moves ONLY the accepted Units' `Who has it` to the partner's governed
operating party. The receipt may carry the counterparty's own Unit list, preserved beside the
Warehouse's. Every handover keeps every evidence file (`delivery_handover_evidence`). The Warehouse
acts live on the approved Warehouse Outbound page; the DO object renders the chain read-only in its
Warehouse handover section with each recorder named, and keeps `Confirm logistics receipt` as the
counterparty's own act. On the DO page the recorded facts print their event words `Ready for
handover` · `Handed over` · `Received by logistics`; those are record words, not Monitor status
words (§8.4).

## 5 · Customer contact, confirmed date, time and ETA

- **`Requested Delivery Date`** is Sales Orders' customer fact. Delivery reads it and never writes
  it; a wrong or changed promise goes through `Open Sales Order to change`.
- **`Confirmed Delivery`** is the agreed operational day. **`Confirmed Time`** is the agreed time
  window. A delivery is booked only when BOTH are recorded; a day without a window prints `No time
  agreed` and stays contact work.
- **ETA** is Logistics' later estimated arrival time on the day and never rewrites the confirmed
  day or window.
- Every date prints through `fmtDate`: `Tue, 18 Aug`, with the year only when it is not the
  current year. Delivery never groups work as `Today` or `Tomorrow`.

### 5.1 · The customer contact record

Every contact names its purpose. Never `Contact Customer` or `Follow Up`. Purposes: `Confirm
Delivery Date` · `Confirm Delivery Time` · `Confirm Customer Availability` · `Confirm Delivery
Address` · `Confirm Site Access` · `Confirm Receiver` · `Obtain Missing Information` · `Confirm
New Delivery Date after Failed Delivery` · `Confirm Cancellation`.

Each contact record stores purpose, contact owner, channel, person contacted, actual time, result,
reply evidence, recorder, proxy provenance and explicit next action. **Four identities, separately
(0499, owner ruling 2026-09-13):** `contact_owner_user_id` is the order's NORMAL responsible
Operation person, filled by the writer from the one responsibility read
(`delivery_responsible_operation`) — never the recorder as such, never a shared login, never the
cover; `acting_user_id` is today's acting person (the buddy cover, else the normal person);
`recorded_by` is the actual signed-in recorder, evidence only; `on_behalf_of_partner_id` is
partner provenance when a partner's reply is recorded. Results: `Confirmed` · `No
Answer` · `Asked to Call Again` · `Requested Another Date` · `Contact Details Incorrect` ·
`Customer Refused Delivery` · `Waiting for Customer Reply`.

**Silence is never a result.** No surface infers `Waiting for customer reply` from a missing
confirmed date; the words appear only when a contact record carries that result. A sent, copied
or opened message is never reply evidence. **BUILT 2026-09-13 (CARD 11, 0487
`ops_delivery_contacts`)**: the one Worker door writes the record; the arrangement save that
carries `Information received from` records the contact in the same request.

### 5.2 · The contact deadline

Logistics contacts the customer at least THREE working days before `Requested Delivery Date`,
whether or not the goods are in. The deadline is the shared `chase` step (`deliveryStepDueIso`,
lead `logistics_call_working_days` = 3 since 0342, on the Mon–Sat delivery week with Malaysian
public holidays), read by the Orders list, the booking brief and Monitor alike. A customer who
has named no day has no deadline and is never late. A late contact keeps the deadline it missed.

### 5.3 · Backward planning — Delivery owns the ONE calculation

**OWNER-APPROVED / LOCKED 2026-09-01.** For every journey that rides a partner's own pickup or
delivery weekdays (JB, Melaka, the two-leg Singapore journey and any partner with a governed
calendar), Delivery owns the one backward calculation:

```
customer delivery date
→ latest arrival at the partner warehouse (JB, where the journey has one)
→ the partner's actual KL pickup day
→ latest Carres Warehouse ready date
```

The calculation reads each partner's governed pickup and delivery calendar from Partner Settings
(§11), never a weekday a member of staff remembers. Warehouse and Purchasing consume the calculated
latest Carres Warehouse ready date through dated Work and never recalculate it (the consuming half
is law in [`../stock/MASTER.md`](../stock/MASTER.md) §5).

### 5.4 · The partner's own screen

The NETS Portal arrange page presents only DO, customer, area, goods summary, requested date and
special requirements, then `Confirmed date`, `Time window`, `ETA`, contact result, note and reply
screenshot. Its two acts are **`Save Delivery Arrangement`** and **`Cannot Deliver`**. Operation
proxy records state `Recorded by {person} on behalf of {partner}` with source, reporter, reported
time, recorded time and original evidence.

## 6 · Actual delivery, results and proof

The formal append-only object for one actual trip to the customer is **Delivery Visit**, a
system, permission and audit term. Employee navigation and page sections use **Delivery
History**; the employee action is **`Record Delivery Result`** and an entry title reads
`Delivery on Mon, 17 Aug`. Employees never create a Delivery Visit directly.

A Delivery Visit exists only when delivery actually proceeds. Advance rescheduling, cancellation,
waiting for a reply, `Cannot Deliver` and Warehouse-not-ready are arrangement events, not visits.
Each actual event stores DO, Partner, driver or team, vehicle when known, planned and actual
times, item results, observed problem, goods location, proof, recorder and proxy provenance.

Employee results are **`Delivered`** · **`Partially Delivered`** · **`Failed Delivery`**.
`Rescheduled` and `Delivery Cancelled` are arrangement states, never results.

`Delivered` requires actual time, receiver, delivered goods and the governed evidence. Missing
evidence creates the `Upload delivery proof` work, whose row names `Upload delivery photo` and/or
`Upload signed Delivery Order`; completing or reviewing proof never renames the result.

For each exact delivered Unit, Delivery emits one idempotent success fact. If Stock says that Unit
was `Supplier Consignment`, Purchasing automatically creates the Consignment Sale Notice for that
supplier × Delivery Visit. Failed or refused goods create no notice.

`Partially Delivered` preserves delivered goods and requires failed quantity, reason, goods
location, proof and next Work for every remainder. `Failed Delivery` requires reason, explanation,
affected goods, actual time where applicable, goods location, reporter, proof and an explicit next
action. No bare `Failed Delivery` may be saved or closed.

### 6.1 · Proof and its review

Proof is bound to the exact event it proves: Logistics confirmation, customer confirmation,
Warehouse handover, Delivered, Failed Delivery, return or correction. An uploaded file records
what the driver sent; it is not proof accepted and not a successful delivery. Operation reviews
delivery proof as **`Proof Accepted`**, **`More Proof Required`** or **`Proof Rejected`**, each
with a reason. `Proof Accepted` is the fact that turns `Delivered` green everywhere and closes
`Upload delivery proof`; `Proof Rejected` reopens it with the reason. Saved delivery facts are
corrected through an append-only Correction containing old value, new value, reason, person, time
and approval where governed.

**BUILT 2026-09-13 (Card 13, migration 0489).** `delivery_attempt_evidence` binds every file to
the Delivery Visit it proves (the photo/video uploader stamps and binds in one act; the signed
paper's own door `delivery_signed_do_attach` files it against the latest delivered or partially
delivered attempt and re-records nothing); `delivery_proof_reviews` holds the append-only review.
The review state is ONE arithmetic (`proofReviewStateOf` over `latestEvidenceAtOf`): no file →
nothing to review; a file newer than the latest review → `Check delivery proof`; the latest review
otherwise decides. `Delivered` is orange everywhere until `Proof Accepted`; `Proof Rejected` and
`More Proof Required` reopen `Upload delivery proof` with the reason. The append-only Correction
record for saved delivery facts remains **APPROVED TARGET / NOT BUILT** (§15.1).

## 7 · Failed Delivery reasons and next Work

The reason dictionary is grouped, versioned, and historical records retain their original value.

- **Customer:** not present; could not be contacted; refused; requested change at arrival; payment
  not ready; information incorrect.
- **Location:** address incorrect or incomplete; access unavailable; lift unavailable; item cannot
  fit; security refusal; unsafe condition.
- **Goods:** damaged; wrong; missing; incorrect quantity; incomplete; not acceptable to customer.
- **Warehouse / preparation:** goods not ready; wrong goods loaded; missing during loading;
  documents missing; handover delayed.
- **Logistics:** vehicle problem; insufficient capacity; late; did not attend; insufficient team or
  equipment; transport damage.
- **Carres / Order:** wrong date or information; should not have been arranged; payment or approval
  problem; unclear instruction.
- **External:** severe weather; road disruption; government or building restriction.
- **Other:** explanation required.

The record also states whether goods remain with Logistics, returned to Warehouse, remain with the
customer or are unknown. The next action is concrete, in the two-line Work grammar of §10:
`Confirm New Delivery Date` · `Confirm Delivery Address` · `Confirm Customer Availability` ·
`Obtain Correct Contact Details` · `Confirm Site Access` · `Return Goods to Warehouse` · `Inspect
Returned Goods` · `Arrange Replacement Goods` · `Assign Another Logistics Partner` · `Keep NETS and
Change Date` · `Correct Delivery Information` · `Obtain Missing Delivery Proof` · `Confirm Delivery
Cancellation` · `Management Review`.

Every problem has one owner, due date, evidence and next action. Recording `Failed Delivery`
automatically creates the appropriate Work. A problem closes only when its fact, reason, affected
goods, location, evidence and completed or cancelled next action are present. Field staff record
observable facts; an authorised reviewer may append a root cause later without rewriting the
observation. Returned goods enter Inbound as `Check required`, never Ready Stock. **Built (Card
14, migrations 0490/0491):** a failed or partially delivered result whose goods are
`returned_to_warehouse` or `still_with_logistics` plans ONE `Failed Delivery return` arrival
(`arrival_sources`, bound to the Delivery Visit by `attempt_id`, named by the DO the goods went out
on, from the partner's operating party to the order's warehouse) for every required Unit that did
not reach the customer and is still reserved to the order; the Warehouse's receipt through Inbound
is what puts the Unit on `Check required` — the immediate inspection hold is retired because a
Logistics report never substitutes for the Warehouse's actual receipt (§4). A plan that cannot be
made is written to the order's history, never hidden.

## 8 · Information architecture: Monitor and Delivery Orders

### 8.1 · Two destinations

```
Monitor            daily delivery arrangement, assignment, customer confirmation, confirmed
                   day and time, ETA, current work, exceptions, partner filters and the
                   two-month calendar                                    ?tab=delivery
Delivery Orders    the formal Delivery Order register                    /operation/delivery-orders
Delivery Order     one formal DO, its evidence and history — a door on a number, never navigation
```

The sidebar carries the Delivery module with exactly two children, in this order: **Monitor**
and **Delivery Orders**. Monitor leads and is the collapsed icon's landing. **The Edit Delivery
page is retired (owner ruling 2026-09-13):** every arrangement write lives inside the Monitor
row's expanded panels (§8.6). There is no Delivery dashboard, Fleet, Trips, Regions, Schedule,
Exceptions, Partners, Report or Delivery Returns destination; those capabilities live inside the
two destinations, the DO object, central Settings and central Reports. Sales contains **Sales
Orders** and temporary **Old Orders** only. Central Settings retains the governed Delivery
settings door behind the page-header gear.

Delivery applies the governed Shell, Register and Object Detail Templates and invents no other UI
system.

### 8.2 · Monitor: two views, the rail, the calendar

Monitor answers the operator's morning question: *what do I owe today, and which row do I open?*
It has two tabs, each the page's own first control, each carrying its live count:

```
one 50px Destination Header  ·  Monitor (no page-owned control ever enters this row)
the two top-level tabs       ·  Work to do  (DEFAULT)  ·  Confirmed deliveries
page-owned 240px FilterRail  ·  the complete current month above the complete next month, fixed
                                on top; the filter groups scroll below
Work to do (DEFAULT)         ·  the selectable Register work list (shared DataGrid, §8.3) over the
                                picked WORK TO DO queue; `All delivery work` when the URL names none
Confirmed deliveries         ·  Day / Week / Month in the page toolbar; Week is the desktop default
                                and its six Mon–Sat columns fit without horizontal date scrolling
```

**The rail's two-month calendar.** The rail's first, fixed region is the complete current month
above the complete next month on the kit's one calendar primitive (`MonthCalendar`), never a
one-week strip. One pair of arrows moves both months by one month. The selected date wears the
governed blue selected state; today stays distinguishable; Sundays stay visible, muted and take
no click; a date holding confirmed deliveries carries a count under the date and the same fact in
its accessible sentence, never colour alone. Clicking a date opens that date's Day view on
`Confirmed deliveries` and keeps every STATE, LOGISTICS PARTNER and DELIVERY STATUS narrowing.

**The four rail groups.** Counts are deliveries (a Journey leg is its own delivery), each group's
counts computed over the rows the other groups already narrowed (Law D):

- **`WORK TO DO`**, rows in this order: `All delivery work` · `No logistics picked` · `Call
  customer` · `Overdue delivery` · `Failed Delivery` · `Upload delivery proof` · `Check delivery
  proof` (joined 2026-09-13 with the §6.1 record). Every queue comes from recorded
  facts, never a clock inference. The group belongs to `Work to do` and is not drawn on the
  calendar tab.
- **`STATE`**: a kit dropdown of the direct state names the data genuinely carries, ordered by
  count; leg 1 of a Singapore journey counts under Johor and leg 2 under Singapore; `All` clears
  only this group.
- **`LOGISTICS PARTNER`**: a kit dropdown of the partners genuinely carrying a row, governed roster
  order first; `No logistics picked` is never duplicated here.
- **`DELIVERY STATUS`**: a kit dropdown offering `All` plus the §8.4 status words, each with its
  live count, zero included.

A pick narrows whichever view is open and never switches it. `Clear filters` clears every
narrowing and stays on the view. The URL names the whole view in one param (`?view=` holds a
calendar word or a WORK TO DO queue), plus `?date=`, `?region=`, `?logistics=`, `?status=`,
`?q=`; every retired spelling still resolves. Below 1100px the rail starts collapsed behind a
44px `Show filters` strip; a remembered choice wins at any width. On a phone the rail becomes the
filter drawer and the work list becomes one card per delivery carrying the same facts.

**`Call customer` and the contact week.** Under `Call customer`, and under no other queue, a
Monday-to-Saturday strip lists the six operating days with the count of contact deadlines due on
each, its own arrows, and the caption `Contact deadlines — not supplier or delivery dates`. An
`Overdue contact` chip beside the six days answers across every date. `Overdue delivery` (the rail
queue: a confirmed trip whose day has passed with no result) and `Overdue contact` (a conversation
that missed its deadline) are two populations and never share one bare `Overdue` count. `Call
customer` lists earliest `Requested Delivery Date` first; a row with no requested date sorts last.

**The calendar writes nothing.** `Day` shows the selected operating day with full cards; `Week`
the Mon–Sat week containing the selected date; `Month` a capacity overview printing `Deliveries
{n}`, `Exceptions {n}` and `No logistics picked {n}` per date, zero lines omitted. A card shows
only the confirmed time, DO No or `No delivery order yet`, customer, city and state, goods
summary, Logistics Partner and the §8.4 status word; never a phone, money, an employee name,
driver, vehicle, expected arrival or upload time. An unconfirmed delivery never enters a date
cell. A fully empty range shows one spanning state `No deliveries are scheduled from {first} to
{last}.` with the real `{n} deliveries need a confirmed date.` count and its door.

### 8.3 · The Monitor register — owner ruling 2026-09-12, APPROVED / LOCKED

The work list is the shared `register/DataGrid` with the Register Template's toolbar, footer,
search, typed column filters, Columns and Export. Twelve columns, exactly, in this order:

| # | Column | Line 1 · the primary fact | Line 2 · supporting fact |
|---|---|---|---|
| 1 | checkbox | one per delivery | |
| 2 | expand | opens the four panels (§8.5) | |
| 3 | `Delivery Status` | one status word set (§8.4) | the failure reason, or the overdue act |
| 4 | `SO No` | `SO-1358`, opens the Sales Order | |
| 5 | `Customer` | customer name | phone |
| 6 | `Delivery Location` | city and state | building type and floor when recorded |
| 7 | `Requested Delivery Date` | `Thu, 24 Sep` · `To be confirmed` · `No delivery date` | `Customer requested this date` only when a window, not a date, was given |
| 8 | `Confirmed Delivery` | `Confirmed` · `Not confirmed` | `Thu, 22 Oct` then `2 PM to 5 PM`; `Mon, 14 Sep · No time agreed` for a half booking; `Call by Thu, 22 Oct` while unconfirmed |
| 9 | `Logistics` | partner name · `No logistics picked` | driver name once assigned |
| 10 | `Items & Stock` | `Ready` · `Not ready` | `2 of 2` · `1 of 2 · 1 short` · `Arriving after the requested date` |
| 11 | `Payment` | `Paid` · `Do not deliver` · `Collect RM {amount}` | `RM {amount} still to collect` · `Finance is holding this delivery` · `Cash on delivery` |
| 12 | `DO No` | the number, opens the DO · `No delivery order yet` | `DO date` |

**Row law.** The parent row is **72px** and carries exactly one primary fact and one supporting
line. This is the approved Delivery Monitor page-specific exception to the Register density law
(`../ui/MASTER.md` §6.5) and is not reopened. `SO No` and `Customer` pin during horizontal
scrolling; the sheet scrolls, never squeezes. The layout storage key moves to `workList.v5`.

**Cell law.** The first line states the exact operational result; the second line supports it.
No cell joins facts with an em dash. The SO, customer, Logistics Partner and object identity are
named once on the row. Dates print `Tue, 18 Aug`, the year only when not current. Every absence
is a governed word, never a dash. `Requested Delivery Date` opens no editor here.

**Colour law.** Semantic status uses clear words and text colour; colour never replaces the word.
Green: `Paid`, `Ready`, `Confirmed`, `Delivered`. Orange: a specific fact that needs an act and is
not yet late (`Not confirmed`, `Not ready`, `No logistics picked`, `No delivery date`, `Order
details incomplete`, an actor-first status word). Red: `Overdue`, `Failed Delivery`, `Do not
deliver`, a contact deadline that has passed. No generic attention label exists.

**Icon law.** No emoji, tick, checkmark, warning mark or decorative progress icon appears inside
a status fact. Governed functional icons remain: Search, Export, Columns, the expand chevron,
Download, Hide and Show filters, the calendar arrows and the rest of the existing Carres utility
set.

**The three delivery checks live in their columns.** Customer confirmation in `Confirmed Delivery`
and `Logistics`; stock in `Items & Stock`; money in `Payment`. Monitor has no checklist, alert,
due, next-action or priority column. Order Route shows the complete delivery checklist because it
is the full order journey.

**`Payment` arithmetic.** `orderMoney.outstanding` through the one money rule and the OPEN
Finance exception, the same predicate the DO gate asks. `Paid` when outstanding = RM 0 and no
exception holds; `Do not deliver` over `RM {amount} still to collect` while money is owed, or over
`Finance is holding this delivery` while an exception is open; `Collect RM {amount}` over `Cash on
delivery` only when the DO carries `cod_instruction` from an approval granted before the
2026-09-01 closure. Monitor never adds a payment door.

**`Items & Stock` arithmetic.** `deliveryStockReadinessOf` over the register rows for THIS
shipment's goods (`tripLinesOf`, the same derivation the DO page and the print path run); a
service moves no Unit and is never a shortage. `Arriving after the requested date` comes from
`deliveryArrivalStateOf`, the shared arrival reading; Delivery computes no arrival of its own.

**Chooser columns, off by default:** `State` · `Expected arrival` · `Accessories & services` ·
`Confirmed Time` · `Building` · `Phone`. Sortable, filterable and exported. `Actions` and `Edit
Delivery` are retired as columns; the row's acts live in the panels (§8.6).

**Selection.** Every row has a checkbox; the header checkbox selects the visible filtered rows;
changing a filter clears the selection; the selection toolbar replaces the normal toolbar at the
same height and reads `{N} selected · Clear · Assign logistics`. Bulk assignment is offered only
while every selected row is unassigned; a row that already carries a partner turns the act into
`Change logistics`, one row at a time, through the same governed door. Footer: `{n} deliveries`
or `{n} of {m} deliveries`; empty states `No deliveries` and `No matching deliveries.`.

**Required Sales facts and legacy gaps (owner ruling 2026-09-13).** Delivery address, state,
building type, floor, lift, access and the requested delivery information are required Sales
Portal facts of a valid new order. A row that reaches Monitor with any of them missing is a data
problem, never a normal empty delivery: its status reads `Order details incomplete`, the missing
fact prints in orange inside panel 1 (`Building type not recorded`), and the row offers `Open
Sales Order to change`. An order with no delivery address at all is not a delivery and stays
Sales-owned Work under the entry rule below.

**THE ENTRY RULE (owner ruling 2026-08-24).** A Sales Order does not become delivery work merely
by existing. A scope reaches Monitor only when it has a delivery address, goods that require
delivering and a valid scope or Journey leg. Cancelled orders, orders that need no delivery and
delivered scopes are not on Monitor; a delivered order lives in Delivery Orders and Delivery
History. One card = one delivery scope or one Journey leg.

### 8.4 · The Monitor status dictionary — owner ruling 2026-09-13, APPROVED / LOCKED

`Delivery Status` on Monitor is the OPERATION's progress in primary-school English that names the
actor and the fact. It is one arithmetic, read by the column, the `DELIVERY STATUS` dropdown, the
calendar card and every report; the partner's real name comes from the data and no partner is
ever hard-coded.

| Recorded facts | Line 1 | Colour | Line 2 |
|---|---|---|---|
| no partner on the scope | `Operation must assign logistics` | orange | |
| partner set, no contact record, the partner contacts the customer | `{partner} must contact the customer` | orange | `Call by {date}` |
| partner set, no contact record, Carres contacts the customer | `Operation must call the customer` | orange | `Call by {date}` |
| latest contact result is `Waiting for Customer Reply` | `Waiting for customer reply` | orange | `Asked {date}` |
| day and window recorded, no DO yet | `Confirmed for {weekday, date}` | green | the window |
| DO exists, no handover recorded | `Waiting for {partner} pickup` | none | `Handover {date}` when Warehouse scheduled it |
| Warehouse handed over and the partner's receipt is recorded | `Goods collected by {partner}` | none | `Collected {date} {time}` |
| collected, and the partner recorded departure or an ETA | `{partner} is delivering to the customer` | none | `ETA {time}` |
| confirmed day passed with no result | `Overdue` | red | `{partner} must record the result` |
| attempt `delivered` on an intermediate Journey leg — the goods reached the named partner warehouse (Card 20) | `Arrived` | green | the stop, `JB transit warehouse`; no proof line, the customer leg owes the proof |
| attempt `delivered` | `Delivered` | green | `Proof accepted {date}`, or `Delivery photo not uploaded` in orange |
| attempt `partial` or `failed` | `Failed Delivery` | red | the one reason |
| a required Sales fact missing on a Monitor row | `Order details incomplete` | orange | the missing fact |

**Retired on Monitor, never to return:** `Waiting for customer date` · `Delivery confirmed` ·
`Waiting for warehouse` · `Ready for handover` · `Out for delivery` · `Created` · any bare
`Waiting` that does not name who must act. `Ready for handover` and `Received by logistics`
survive only as the recorded handover event words on the DO page (§4.1). The Delivery Orders
register keeps the document ladder (§3.1); the two vocabularies never borrow each other's words.
`Rescheduled` and `Delivery Cancelled` are arrangement events; a voided trip has no Monitor row.

### 8.5 · The expanded row — the delivery brief, owner ruling 2026-09-12, APPROVED / LOCKED

The expand chevron has one job: the delivery brief, everything needed to act on this delivery
without leaving the row. Exactly four panels, in this order, on the kit `Panel`, joined by the
shared connector:

```
1  CUSTOMER, ADDRESS & ACCESS   (Sales Orders, read-only)
   left    customer · phone · emergency contact name · relationship · phone
   right   full delivery address · building type · floor · lift · access or registration
           requirements
   two internal columns on desktop; one column on narrow screens
   a missing required fact prints in orange as a problem (`Building type not recorded`) and
   the panel's one control is `Open Sales Order to change`

2  DELIVERY DATES   (Delivery)
   Customer requested          read-only Sales fact
   Confirmed delivery date · Confirmed delivery time
   the panel's one control     `Update date and time`  →  the panel's own edit state (§8.6)

3  LOGISTICS DETAILS   (Delivery; pickup facts read from Warehouse)
   Logistics Partner · driver · driver phone · vehicle plate · pickup fact · ETA
   pickup fact prints the recorded handover, `Handed over Thu, 22 Oct 12:53 · 2 of 2 Units`
   then `Received by NETS 13:10`; before any event, `Pickup not recorded`
   the panel's one control     `Assign logistics` or `Change logistics`; driver and vehicle are
                               chosen from the partner's saved fleet templates in the same edit
                               state; condo registration when the building type demands it

4  ITEMS, SERVICES & STOCK   (Sales, Purchasing, Stock, read-only)
   Item | Qty | Source | Status | Location
   Source    a purchased Unit prints its Unit ID on line one and its clickable PO No on line
             two; a counted or legacy Ready Stock Unit with no valid PO prints its Unit ID on
             line one and `Counted stock` on line two; a PO number is never invented
   Status    `Ready` · `Arriving Fri, 25 Sep` · `Arriving after the requested date` ·
             `No purchase order raised yet` · `Not received yet`
   Location  `Carres Klang` · `With NETS Delivery` · `PJ Showroom`
   `Ready` and the location are two cells; never `Ready at Carres Klang Warehouse`
   accessories one per line; services only from recorded Sales Order facts, for example
   `Stair carry · 3 items · floor 3` · `Dispose old mattress`; a loan line only while a loan
   exists: `Loan U1-000-045 · collect back on delivery day`
```

Panel 4 reads `tripLinesOf`, `deliveryStockReadinessOf`, `deliveryArrivalStateOf` and `unitIdOf`,
the same arithmetics the register, the DO page and the print path run. The expansion never
duplicates Sales, Stock, Warehouse, Purchasing or Payment truth; it reads and links.

### 8.6 · Inline arrangement writes — owner ruling 2026-09-13, APPROVED / LOCKED

The approved journey is: expand the row → act inside the panel → save → remain on the same
Monitor row, in the same queue, with the same narrowings; the row moves queues by itself.

**Delivery Dates edit state.** `Update date and time` is the panel's one right-slot control. It
flips the panel body into a focused edit state showing exactly: `Confirmed date` (Sunday and
Malaysian public holidays refused) · `Confirmed time` (governed windows) · `Information received
from` (`{partner}` · `Customer` · `Operation on behalf of {partner}`) · `WhatsApp proof` (required
when the new date is later than `Requested Delivery Date`) · `Save confirmed delivery`. The Save
button names its gap while disabled: `Save confirmed delivery — upload the WhatsApp reply`.
Cancel restores the read state. A day saved without a window keeps the row in `Call customer`
with `No time agreed`.

**A later date is never a silent edit.** When the new date is later than the customer's
`Requested Delivery Date`, Operation must have contacted the customer: the save records the
contact with purpose `Confirm New Delivery Date`, the customer's reply and the uploaded WhatsApp
proof (§5.1). The Sales promise is never touched; `Open Sales Order to change` remains the only
door to it. A customer-side reason also files Payment's written request to deliver later
(`../payment/MASTER.md` §6) so the storage witness starts from the same record.

**Logistics Details edit state.** The panel's one control opens the edit state for: partner
(coverage informs and pre-selects; it never hides a partner), the governed reason when an existing
partner changes (`Change logistics`, append-only history), driver and vehicle from the partner's
fleet templates, condo registration, the prepared chase message with `Copy message`, `Open
WhatsApp group` and the reply upload, and `Record Cannot Deliver on behalf of {partner}` with its
governed reason and evidence. The live DO document preview lives on the DO object.

No overflow menu and no separate dialog is invented for these acts; the kit `Panel` right slot is
the one control and the panel body is the edit surface. UI MASTER §4.1 records this as the Monitor
expansion's governed write state.

### 8.7 · The Delivery Orders register — production-verified 2026-09-11

`/operation/delivery-orders` is the shared Register engine top to bottom: row checkboxes, header
select-all over the visible filtered rows, the in-place same-height selection toolbar, ▸ expansion
showing THIS TRIP's goods lines read-only (the one `trip_groups` derivation), sticky `DO No`
identity, search, governed per-column filters, Export, Columns and the fixed 32px footer.

- **Default columns, in order:** `DO No` · `DO date` · `SO No` · `Customer` · `Status` ·
  `Requested Delivery Date` · `Confirmed Delivery` · `Confirmed Time` · `Logistics` · `Delivery
  Location` · `Driver submission`. Off by default: `Goods` · `Created`. `Requested Delivery Date`
  opens no editor here; `SO No` opens the Sales Order and `DO No` the Delivery Order. `Assign
  logistics` never appears on this register.
- **One `Status` column with the document ladder** (§3.1); line 2 of a `Delivery exception`
  carries the recorded result and its reason (`Partially Delivered · {reason}`); `Cancelled`
  keeps its void reason. Search, filter and export print the same spelling as the cell.
- **`Driver submission`**: `Photos {n}` opens the gallery, `Videos {n}` the player, `Signed
  Delivery Order` the paper, each a door; a kind with no files offers no button; an unknown ledger
  prints `Not recorded`; every viewer states that an upload is evidence of an upload. The media
  source is the Sales Order's ledger stamped with a server-verified `doNumber`; `driverSubmissionOf`
  is the one reader.
- **The proof gate follows the recorded result**: goods that reached the customer (delivered or
  partial) may attach a photo; a failed trip owes no delivery photo.
- **Rail:** `WORK TO DO` (`Record delivery result` · `Upload delivery photo` · `Upload signed
  Delivery Order` · `Check delivery proof`, joined 2026-09-13 with the §6.1 record) and the `DOCUMENT
  STATUS` dropdown. A picked queue puts that queue's own existing door on the row. The `Showing
  only:` strip lists every live condition. Below 1100px the rail starts collapsed.
- **Selection:** `{N} delivery orders selected · Clear · Print {N} delivery orders` plus the
  shared selected-row Excel export.

### 8.8 · The arrangement record and partner writes

**DELIVERY OWNS THE DELIVERY ARRANGEMENT (owner ruling 2026-08-24).** Who carries a scope, the
confirmed day and time, the ETA, the logistics note, the partner's actual reply proof, the driver
and vehicle and the condo registration are Delivery's writes on `ops_delivery_arrangements`,
keyed by the scope `(order_id, leg)`, never on a Sales Order column. Sales Orders remains the
owner of the customer, the address, the building facts and `Requested Delivery Date`.

**ONE ARITHMETIC FOR THE REQUESTED DATE (Law D).** `orders.delivery_date` under its
`delivery_date_tbd` guard is resolved in `requestedDeliveryOf` and spelled in
`requestedDeliveryText`; the Sales Orders register, Monitor and the Delivery Orders register read
those two and derive nothing again.

**PARTNER WRITES stay governed wherever they are made.** Only partners valid for the route and
coverage are offered first; Klang Valley pre-selects NETS and never locks it. An existing partner
is never silently replaced: `Change logistics` requires a reason from the governed list plus an
append-only history line, enforced by a database check constraint. Singapore Journey legs are
assigned separately. The write lands on the arrangement, never on the Sales Order.

**Driver and vehicle come from fleet templates.** The arrangement binds the partner's saved
driver and vehicle templates (§11) rather than free text; a template chosen once is the fact the
DO prints and the Warehouse handover shows. The templates exist since 2026-09-13 (CARD 12, 0488
`partner_drivers` · `partner_fleet.active`); the arrangement's binding is the remaining gap
(§15.1).

## 9 · Delivery Order object

The DO object uses the existing Carres Object Detail Template and only its governed section and
navigation mechanism. Object Header: `← Delivery Orders | DO-180826-3035 · SO-1322 · {customer}`
with `Print` and the global utilities. No tab strip is created for the sections below; they are
one governed scroll of kit `Panel` sections, in this order, each with its own header control only
where an act exists:

```
Delivery Order        customer, address, Warehouse, partner, arrangement, goods scope, site
                      requirements, restrictions, current facts, and the live document rendered
                      by the governed DO renderer, the same bytes `Print` opens
Delivery history      every recorded trip and result, `Delivery on Thu, 22 Oct`; `Record Delivery
                      Result` where a result is owed
Warehouse handover    the recorded chain with recorder, role, company and proof; `Open Outbound`;
                      `Confirm logistics receipt` as the counterparty's own act
Evidence              every file bound to the event it proves; the proof-review acts (§6.1)
Exceptions            open and historical problems with owner and next act
History               the append-only audit of every object change and proxy record
Related records       doors to the Sales Order, Units, Payment, Service Case and sibling DOs
```

**BUILT 2026-09-13 (Card 16):** `DeliveryOrderPage.tsx` is the seven sections above in order on
kit `Panel`s — section one prints the customer, address, Warehouse, partner, arrangement (day,
window, ETA, driver, vehicle from `ops_delivery_arrangements`), route, trip scope, site
requirements (building, floor, lift, stairs, access, customer request, instruction for
logistics), the goods and the live document rendered inline by the governed DO renderer;
On a Journey leg's document the `Warehouse` fact is that leg's own source stop — leg 1 the
configured Carres source, a later leg the previous partner's warehouse (`from_loc`) — never the
order-level warehouse (Card 20). Delivery history lists `Delivery on {day} · {result}`, an
intermediate leg's arrival spelled `Arrived`, and its Evidence section states that a warehouse
arrival owes no delivery proof; Exceptions lists failed and partial
visits, the open Finance exception, the pending payment approval, a cancellation and the Work
action lines with their owner (`No open problems` otherwise); History merges the issue, the
handover chain, the attempts and the order's own History lines in time order; Related records
doors to the Sales Order, the Order Route, Payments, every exact Unit, every Service Case and
every sibling document. The Object Header keeps `Print` and the one primary operational act.

Reference views a person opens rarely join the header's governed view mechanism only where the
Object Detail Template already admits one. Delivery history is actual delivery execution; History
is the audit trail; they are not the same section. Cross-module doors open the owner and never a
duplicate editor. `Loan collection` renders only while a loan exists. Reprint carries the same
number.

## 10 · Daily operator journey, Work and Quick Rail

Operation starts in Monitor and works the rail in order: `Failed Delivery`, `Overdue delivery`,
`Upload delivery proof`, `No logistics picked`, `Call customer`, then the calendar for the days
ahead. From assignment through confirmation, Warehouse preparation, handover, delivery day,
result, proof and return, every row states one concrete next fact and one resolved owner.

**Every Delivery Work sentence is two structured lines (owner ruling 2026-09-13).** Line one is
the act with its recipient; line two is the required result. Owner, source object and the actual
working date are structured metadata beside the sentence, never joined into it, and no `—`
appears in any line. The row's status word carries the fact.

| Trigger | Line 1 | Line 2 | Owner rule | Completion fact |
|---|---|---|---|---|
| no partner on the scope | `Assign logistics` | `Choose the company that carries this delivery` | `delivery_duty` | partner recorded |
| partner set, no day agreed, partner contacts the customer | `Call NETS` | `Confirm the delivery date` | `delivery_duty` | day and window recorded |
| partner set, no day agreed, Carres contacts the customer | `Call the customer` | `Confirm the delivery date` | `delivery_duty` | day and window recorded |
| day agreed, no window | `Call NETS` | `Confirm the delivery time` | `delivery_duty` | window recorded |
| new date later than the requested date, no reply proof | `Call the customer` | `Record the reply and upload the WhatsApp proof` | `delivery_duty` | contact record with proof |
| collected, no ETA | `Ask NETS` | `Record the delivery ETA` | `delivery_duty` | ETA recorded |
| confirmed day is today, no result | `Deliver on Thu, 22 Oct` | `Record the delivery result` | `delivery_duty` | attempt recorded |
| confirmed day passed, no result | `Ask NETS` | `Record the delivery result` | `delivery_duty` | attempt recorded |
| delivered, photo missing | `Upload the delivery photo` | `Attach the photo from NETS` | `delivery_duty` | photo on the ledger |
| delivered, signed DO missing | `Upload the signed Delivery Order` | `Attach the paper the customer signed` | `delivery_duty` | signed file on record |
| delivered, proof not reviewed | `Check the delivery proof` | `Accept it, ask for more, or reject it` | `delivery_duty` | review recorded |
| Failed Delivery recorded | the §7 next action, for example `Call the customer` | `Confirm a new delivery date` | `delivery_duty` | the named next fact |
| Cannot Deliver reported by the partner | `Decide the next step for this delivery` | `Keep NETS with a new date, correct the details, or change logistics` | `delivery_duty` | arrangement event recorded |
| loan out, delivery day | `Collect the loan item` | `Bring back U1-000-045 on the delivery day` | `delivery_duty` | loan row reads returned |
| handover counts disagree | `Check the handover` | `Find the Unit the driver did not confirm` | `grn_duty` | mismatch resolved |

The partner name always comes from the data. Delivery stores an action's owner rule, never a
copied staff assignment or roster; every owner avatar in Delivery, Dashboard, My Work and Team
Work comes from the shared Work Engine's resolved owner. Delivery may not read a rota table or
calculate a duty holder.

- **My Work Quick Rail** previews the person's owned Delivery actions and deep-links to the row or
  the DO; it is not another work store.
- **Team Quick Rail** shows the resolved Delivery Duty holder and today's cover.
- **Calendar Quick Rail** shows confirmed deliveries, contact deadlines, handover deadlines,
  Failed Delivery follow-up and return due dates on actual dates.
- **Activity Quick Rail** shows append-only assignment, arrangement, contact, handover, result,
  proof and correction events; it never completes work.

Alerts are reserved for `Cannot Deliver`, an overdue contact, Warehouse risk, a missing result,
`Failed Delivery`, missing or rejected proof, an overdue return or a commitment without an
arrangement. A routine ETA change is Activity unless it creates a real breach.

## 11 · Settings

Central Delivery Settings is one `Delivery` group in the Settings Workspace, behind the
page-header gear, on the Warehouse Settings grammar: readable rows, one `Save changes` per page,
`Not configured` for any value nobody has recorded, actor, time, old value, new value and
effective date on every change. It contains no roster, no owner list and no duty calculation.

| Section | Rows |
|---|---|
| `Logistics Partners` | one row per partner opening its object: `Partner details` (name, `Active` · `Inactive`, customer-facing number, office contact, address, WhatsApp group) · `Coverage` (states, cities and postcodes covered; excluded locations; the `Klang Valley default` flag and its fallback rule) · `Schedule` (pickup weekdays, delivery weekdays per region, transit days, cut-off time, capacity per day, closed dates) · `Warehouses & handover points` (the partner's own warehouse and the two-leg handover locations) · `Drivers` and `Vehicles` (templates: driver name and phone; plate, vehicle type, capacity) · `Services & charges` (stair carry, dismantling, disposal, surcharge areas, partner charges) · `Portal access` (Warehouse role, Logistics role, data visibility, API scope) |
| `Delivery Rules` | who contacts the customer, per partner · the record-on-behalf policy · the contact lead days (reads the shared `chase` setting, one home) · the payment-clearance read rule and DO availability, both read-only mirrors of Payment's clock and the DO gate · proof required by result and goods type · the supported delivery services |
| `Message Templates` | WhatsApp, email and copy-message templates per purpose, versioned, one Default per purpose, the Payment template-library grammar |
| `Access` | which People hold Delivery capabilities; a link to `Workspace → Staff & Duties`, never a copy |

**Current governed calendars (owner ruling 2026-09-01):** TEOW picks up from KL on Monday,
Wednesday and Friday, delivers to Melaka on Monday, Wednesday and Friday and to JB on Tuesday,
Thursday and Saturday. TT picks up from KL on Wednesday, delivers to JB only, and may charge extra
for Pontian, Kota Tinggi, Kulai Tesco and Sedenak. §5.3's backward calculation reads these
calendars; assigning such a partner raises the dated Warehouse and Purchasing Work computed from
them. Staff never memorise a pickup weekday.

**Partner contact is company master data**, stored and read through the partner record and never
printed on a calendar card. Payment reads the customer-facing partner number from here. The
numbers are entered by a manager in this surface, never typed into code.

Per-DO dates, partner, ETA, single-event handling, personal Columns and personal Saved Views are
not Settings. Historical objects retain the rule and version in force when their event occurred.
Delivery Settings stores only the duty keys its actions require, `delivery_duty` and
`delivery_charge_approver`; the people resolve from `Workspace → Staff & Duties`.

## 12 · Reports

Central Reports owns Delivery Commitment Performance, First Delivery Success, Failed Delivery
Analysis, Logistics Partner Performance, Warehouse Performance, Delivery Proof Control, Schedule
and Capacity, Customer Contact Performance, Return-to-Warehouse Control and Exception Ageing.

Every measure declares source fact, date basis, coverage and drill-through. First-delivery success
counts only actual delivery events. NETS has no acceptance-speed measure because NETS is
responsible without Accept; its contact and confirmation timeliness, `Cannot Deliver` rate, result
timeliness and proof are measured instead. Warehouse and Logistics performance stay separate even
when both are NETS. Observed reason and reviewed root cause stay separate. A rate with too few
records is not printed. Old events enter historical measures only.

**Built (【DELIVERY】 CARD 17, 2026-09-13).** `Reports → Delivery` (`/operation?tab=delivery-report`,
`apps/web/src/pages/operation/OperationDeliveryReport.tsx`; the arithmetic in `delivery-report.ts`)
prints the ten listings from the SAME reads Monitor and the Delivery Orders register run — the
register rows through `buildDoRegisterRow`, today's facts through `buildDeliveryMonitorCards` and
`isExceptionCard` — so a report figure and a register can never disagree (Law D). It stores nothing;
every row is a door (the Delivery Order object, the Monitor row, the Monitor day, the Inbound
arrival); each listing opens with its source fact, date basis and coverage sentence; a rate below
five records reads `Rate withheld · fewer than 5 records`; an unreadable read prints `Not
available`; Excel export writes one sheet per listing. The Cannot Deliver records (0417) reach the
report through the arrangements read (`cannotDeliver`, absent when unreadable). The words are in
`docs/COPY-STANDARD.md` (Reports → Delivery words). A Journey leg before the last is a warehouse
trip: Commitment, First Delivery, Proof Control and `Logistics Partner Performance` count
customer-leg results only and say so in their coverage sentence (Card 20, 2026-09-13).

## 13 · Owners, permissions and the external boundary

### 13.1 · The owner rule

Every routine Delivery action resolves through the existing `delivery_duty` owner rule and the
Shared Duty Resolver (`../ERP-ARCHITECTURE.md` Law F.1). The rule already exists in the Work
Engine; the approved architecture correction is only that it gains its assignment key
`delivery_duty` (`Delivery Duty`) in the shared Workspace catalogue. The Primary holder and Buddy
cover are configured only in `Workspace → Staff & Duties`. This is not a Delivery-local duty
system.

**The Responsible Delivery Operation owns the customer's money follow-up (owner ruling
2026-09-13; Payment MASTER §10, migrations 0489 · 0495).** When a Sales Order's collection first
becomes actionable, the order's recorded **contact owner** (§5.1 — the Operation person named on
its earliest customer contact, else its partner arrangement) becomes that order's stable
collection owner: the same person who has been contacting the customer about delivery asks for
the money. Delivery and Payment read ONE authority, `delivery_responsible_operation(order, day)`
(0499): the order's collection-owner ledger row (establishment or formal handover) · else the
normal responsible person on its earliest customer contact (an individual with a staff_code, not
covering that day) · else the configured NORMAL Delivery Duty holder on the day · else nobody;
today's acting person is that person's buddy cover, else the person. The contact writer fills the
record's four identities from that read (§5.1); the recorder — including the shared `Operations`
login — is evidence, never responsibility. The one remaining fact for automatic ownership on real
orders is the initial Delivery Duty holder, a one-time staffing configuration in Workspace →
Staff & Duties. The owner stays until the balance is RM 0; later duty rotation or a
later contact by someone else never moves it; only buddy cover (acting today) or a formal handover
changes who acts. Delivery configures nothing extra for this: the Payment module reads the contact
record and the resolver on the first actionable day and keeps its own append-only owner record.

When the resolver returns no active holder and no cover, the action stays visible in Team Work
under its duty word and the surface prints the governed configuration failure with its door:
`Nobody holds Delivery Duty.` and `Set the holder in Workspace → Staff & Duties`. The protected
act refuses with the same sentence. No action is routed to an Operations Superuser by default and
no fallback identity is invented; an authorised superuser who does act is recorded as the actual
actor with the normal owner and cover kept separate. Governed delivery-charge exceptions route to
the resolved `delivery_charge_approver`. Corrections of saved facts, exceptional proof and refusal
closure have no approved action definition yet; they enter no engine and are named in §15.1.

### 13.2 · Permissions

Permissions separate view, record, record-on-behalf, review, correct, approve, configure and
export.

- The Delivery Duty holder or cover may arrange, proxy-record, upload replies, assign after
  `Cannot Deliver`, record results and proof on behalf of a partner, review proof and manage
  problems. Nobody issues the DO by hand and nobody may impersonate Warehouse or rewrite results.
- Warehouse roles see and record only preparation, handover and returns for their Warehouse.
- The NETS Logistics role sees only assigned deliveries and minimum customer and handling data; it
  may arrange, update ETA, record departure, results and proof, and use `Cannot Deliver`. It never
  sees money, other Partners or commercial terms and cannot reassign.
- Sales, Finance and Service read the facts relevant to their ownership and act only in their own
  module.
- AL, TT, TEOW, EU, SSY, HOUZS and other no-Portal partners are represented only through truthful
  Operation proxy records with actual reply or report evidence.

WhatsApp and email preparation records target and content but never confirms a business fact. A
phone record states that a person recorded a call; governed high-risk facts may require additional
proof. Every uploaded file names the event it proves.

Future Partner APIs use authenticated Partner scope, assignment checks, idempotency, original
external reference, received time, governed state transitions, proof rules and append-only audit.
They call the same business actions and never write a derived status directly.

### 13.3 · Warehouse schedule and partner projection — controller lock 2026-09-01

**Warehouse Schedule is shared dated goods visibility, not Work.** It may read Delivery facts but
must not become a local queue, invent an owner or action, or write an arrangement, date, handover
or proof. The stable read contract is one row per assigned exact Unit and Delivery scope
`(order_id, leg)`, carrying only the permanent Carres Unit ID; the exact collection appointment as
**Customer delivery pickup** on its real Warehouse event date; **Operations ready by**, derived one
Office working day before pickup; actual collection and actual customer arrival from their
append-only event timestamps; the assigned Logistics Partner, DO number and source Sales Order; and
admitted evidence with doors to the exact scope, DO and source order. The read feed is
`/api/operation/delivery-arrangements/warehouse-schedule`. A Journey leg joins the feed once it
carries its own document (0491), whose 0424 scope names the exact Units; a leg with no document
is absence, never an invented row.

The same feed admits a Warehouse login only when its token is bound to a Warehouse and keeps only
that Warehouse's Units. The Logistics Partner boundary is the same projection narrowed by
authenticated assignment: a Partner sees only its assigned rows and only the admitted fields.
Visible Stock may say **On the way** only after the pickup carries confirmed collection evidence
and before confirmed arrival; Stock owns the custody word and Delivery never writes it. **DO No**
means an outbound customer Delivery Order; inbound receiving stays under its PO/CO source.

## 14 · Journeys, Loan, current versus intentional future

### 14.1 · Journeys

**Singapore.** A Singapore address creates two arrangement rows from the day the order arrives:
leg 1 `Klang WH → JB partner` and leg 2 `JB partner → Singapore customer`, each with its own
Logistics Partner, dates, DO, handover, `Who has it` fact and result. Leg 1 completion means the
goods reached the named JB warehouse, never that the customer received them. The route prints
without a `Leg` word; the leg number rides the URL only.

**East Malaysia (owner approval 2026-09-01).** A Sabah or Sarawak order travels through HOUZS:
Carres hands the goods to HOUZS with exact-Unit handover facts and proof, and HOUZS owns the
onward journey and the customer contact. Carres' governed facts end at the HOUZS handover and the
arrival proof HOUZS returns. Falsifier: an actual East Malaysia delivery carried by another
partner, or Carres contacting the East Malaysia customer directly.

### 14.2 · Loan

Loan is conditional and appears only when a real stock delay and a customer decision create the
need. Carres Operation offers the loan and records the customer's answer on the Sales Order; the
offer, acceptance or rejection is a record in Orders beside `ops_sofa_loans`. Logistics never
makes the commercial offer. Warehouse prepares the exact Loan Unit through Outbound; Delivery
transports it and collects it back on the delivery day; the recovered Unit goes to inspection,
never straight to Ready Stock. Order Route holds the whole loan history; Monitor prints only the
current loan line in panel 4 and the `Collect the loan item` Work on the day. A loan never blocks
a Delivery Order. **The offer record is BUILT (Card 15, migration 0492):** `ops_loan_offers` on
the Sales Order — `offered · accepted · declined`, append-only, through the one Orders door
`sales_order_loan_offer_record` (an answer answers an OPEN offer; a decline says why); the Sales
Order drawer's Loan panel offers and records the answer; Order Route prints the current state
(`Loan offered · …` / `Customer accepted the loan · …`) until the item is out, then the loan row
itself; Monitor panel 4 and the DO object print `Loan {Unit ID} · collect back on delivery day`
per loan Unit out.

### 14.3 · Current versus intentional future

**CURRENT:** NETS is the Klang Valley default and main partner; the partner contacts the customer
or Operation records on its behalf; other partners are assigned manually and proxy-recorded;
partner and date grouping is a derived schedule.

**NOT CURRENT OPERATING TRUTH:** customer self-scheduling, Carres central customer scheduling,
automatic partner allocation, routine multi-partner Klang Valley operation, route optimisation,
formal lorry or dispatch run, loading manifest, ordered stops or per-trip cost. The model is
partner-neutral, so Carres can later assign any partner and enable customer confirmation, Portal
or API without replacing the DO, history or proof model. A first-class dispatch run is admitted
only when a real vehicle-level fact exists.

## 15 · UI dictionary, intentional rejects and closure

| Do not use in employee Delivery UI | Governed wording |
|---|---|
| Release · Issue · Approve · New DO | the SYSTEM issues the Delivery Order; `Request Delivery Order` is the one manual door |
| Attempt · Create Delivery Visit | `Record Delivery Result` · `Delivery History` |
| Not Delivered | `Failed Delivery` |
| Contact Customer · Follow Up | the exact contact purpose |
| Carrier · Logistic · Delivery partner | `Logistics Partner`, and the actual company name |
| Accept for the default assignment | `Assigned to NETS` |
| Reject button | `Cannot Deliver` |
| POD | `Delivery Proof` or the concrete proof name |
| Today · Tomorrow | the actual weekday and date |
| Waiting for customer date · Delivery confirmed · Waiting for warehouse · Ready for handover · Out for delivery · Created, on Monitor | the §8.4 status words |
| Paid in full · Payment pending · Needs attention, on Monitor | `Paid` · `Do not deliver` over `RM {amount} still to collect` · a specific fact word |
| Ready at Carres Klang Warehouse | `Ready` in Status and `Carres Klang` in Location |
| Edit Delivery · Save Delivery | `Update date and time` · `Save confirmed delivery`; the other panel acts by their own names |
| `Call {partner} — confirm delivery date` | `Call NETS` over `Confirm the delivery date` |
| Alert · Attention · Checklist · Due · Next Action · Priority, as Monitor columns | none; the three checks live in their columns |

**Intentional rejects:** a New DO, Issue, Release or Approve control; a new payment exception
door; a Delivery dashboard, Fleet, Trips, Regions, Schedule, Exceptions, Partners, Report or
Delivery Returns destination; a copy of an arrangement; route optimisation, dispatch runs or
loading manifests; customer self-scheduling; a second quantity, stock, duty, calendar or owner
truth; `Waiting for customer reply` inferred from silence; a Loan on every order; relative dates;
emoji, ticks, checkmarks, warning marks or progress icons inside a status fact; a generic attention
label; a checklist column; a Delivery-local roster; an Operations Superuser fallback owner; a fake
tab strip on the DO object; a separate Edit Delivery page.

### 15.1 · Implementation gaps deferred to READY FOR CARD

The approved model is persisted here; the runtime lags it. These are named so that no build reads
their absence as a design blind spot:

| Gap | Where it lives today |
|---|---|
| the Edit Delivery page retirement and the relocated writes | `apps/web/src/pages/operation/EditDelivery.tsx`, `apps/api/src/routes/operation/delivery-arrangements.ts` |
| the append-only Correction of saved delivery facts (§6.1) | a new migration under the governed apply path |
| Payment's §6 written request filed from a later-date save (the storage-terms acknowledgement is not among the ruled edit-state fields) | `docs/payment/MASTER.md` §6, `payment_delivery_date_requests` |
| fleet-template binding on the arrangement (the brief still types the driver and vehicle; the saved templates exist in Delivery Settings) | `ops_delivery_arrangements`, `partner_drivers`, `partner_fleet` |
| the split-trip DO's own issuing door (a leg DO is built; a split-trip scope still has no door) | `apps/api/src/lib/delivery-order-issue.ts` |
| central Delivery reports | the Reports destination |
| the POS required-facts gate for address, state, building type, floor, lift and access | **BUILT 2026-09-13 (Delivery Card 18)** — `createOrderInputSchema`, `rawCreateOrderInputSchema`, the POS wizard and the office create door refuse the facts with one wording; `Order details incomplete` now names legacy rows only |

### 15.2 · Whole-domain closure

This Blueprint covers purpose, ownership and boundaries; the complete normal lifecycle; exception
journeys; the daily operator journey; navigation; Monitor's two views, rail, calendar and register;
the expanded delivery brief and its inline writes; the Delivery Orders register and DO object;
proof and its review; Failed Delivery and `Cannot Deliver`; the Loan seam; Singapore and East
Malaysia journeys; the Order Route, Work Engine and Quick Rail connections; Settings; Reports;
owners, permissions and the Partner Portal and API boundary; the cross-module reconciliation law;
authoritative completion facts; and the intentional rejects. Automatic allocation, vehicle routing
and customer self-scheduling are excluded from current truth rather than deferred blind spots.

**PLAN MISSION COMPLETE — 2026-09-13.** The owner approved the complete Blueprint after the
corrections of 2026-09-12 and 2026-09-13; this MASTER persists the approved operating model and the
contradicting older text in this file, `../orders/MASTER.md`, `../ui/MASTER.md`,
`../COPY-STANDARD.md`, `../workspace/MASTER.md` and `../ERP-ARCHITECTURE.md` is overwritten. No
unresolved owner decision remains. This MASTER authorises no Card, implementation sequencing,
migration or build work; §15.1 is the dependency list a later BUILD/DELIVERY lane derives its
scopes from.


## 16 · Production closure

**2026-09-13 · Cards 08–15 and 18 production-verified; the two-leg Journey walked end to end.** Journey legs
(0490/0491) landed on `d78b4e26` and were corrected on the authenticated walk of the governed fixture SO-1362 by
**0494** (`45238b71`), **0496** (`1984a7ba`) and **0497** (`9ee6db65`): leg 1 NETS `Carres Klang Warehouse → JB
transit warehouse` (DO-130926-0842: handover, receipt, arrival), leg 2 AL `JB transit warehouse → Customer
(Singapore)` (DO-130926-3223: handover from NETS, receipt, customer delivery with the signed DO and signature);
each leg on its own document with its own facts; the Journey completed only on the last leg after the earlier leg
arrived; the exact Unit `id-dtd627907` went reserved → with NETS → with AL → sold. Card 15 (0492, `0dc51c6b`) and
Card 18 (`4e944e51`) walked the same day. **Card 16** (`e0a6dc49`, the seven DO object sections) and **Card 17**
(`a2bc7d53`, `Reports → Delivery`) were then walked on the same two documents and the same month. Evidence: the
Card files. 🟡 Open after the walk, none blocking: (1) an intermediate leg's arrival is an `arrived` result but the
register/Monitor status word, the DO `Evidence` heading and the `Logistics Partner Performance` listing print it as
`Delivered` (+ `Delivery photo not uploaded`) — the Commitment and First Delivery listings already exclude it; the
status vocabulary for `arrived` is the next Delivery correction; (2) the DO object's `Warehouse` fact reads the
order's warehouse, so a Journey document prints `No warehouse recorded` beside a named source stop — read the leg's
`from_loc` there; (3) the legacy warehouse-pick door still writes a derived stock total (Card 14 note).

**DEPLOYED 2026-09-12 — the approved Monitor layout (D1 + D2 + D3) and the missing half of the
appointment, PR #1245 (`8a5fc05b`) with PR #1250's browser fixes on top, live at main SHA
`316a6ef473880d552d6812cb2202b4d13f380441`; all five canonical surfaces report it** (`erp` ·
`pos` · `carres-portal.pages.dev` in `/__carres_deploy.json`, plus the Worker's and
`api.carresofficial.com`'s `/health`). Walked in an AUTHENTICATED OPERATION session (role
`operation`) against **89 real delivery rows**.

- **1440×900.** The rail carries both months in the fixed 429px band, the six `WORK TO DO` rows,
  then `STATE` `All states (89)` · `LOGISTICS PARTNER` `All partners (89)` · `DELIVERY STATUS`
  `All (89)` as kit dropdowns. The filter box holds **506px in 421px and scrolls 85px** — the
  measured result, against 1152px in 421px (731px) before.
- **949×800.** The rail starts collapsed behind a 44px strip carrying a visible `Show filters`
  button and its label; the table viewport is **762px** of a 1821px sheet.
- **Scrolled to `Actions`,** `SO No` (left 62px) and `Customer` (left 212px) both stay pinned —
  `SO-1358 · Aina Rahman · No logistics picked` reads beside `Call NETS — confirm delivery date`
  and `Edit Delivery`. That pairing is the defect the second pin exists to end.

⚠️ **A CANCELLED DEPLOY RUN IS NOT A FAILED ONE, AND NOT A SHIPPED ONE EITHER.** The run for
`8a5fc05b` was superseded by a newer push while it queued. The commit is an ancestor of the live
SHA (`git merge-base --is-ancestor` verified), so the work shipped inside the following run — but
a cancelled run beside one's own SHA must be traced to CONTAINMENT before anything is called
deployed.

**NOT PROVEN ON PRODUCTION:** no live row today holds a day without a window, so
`Call {logistics} — confirm delivery time` and the corrected calendar card rest on unit tests and
the design preview (`apps/web/monitor-proposal-preview.html`), not on live data.


**DEPLOYED 2026-09-11 — the Monitor corrections and the arrival defect, PR #1240, main SHA
`7b06227d60103798ab5fc73b42835f8ca8c7f6ae`, all five canonical surfaces converged**
(`erp` · `pos` · `carres-portal.pages.dev` each report that SHA in `/__carres_deploy.json`, and
both `carres-portal-v2-api.wwch.workers.dev/health` and `api.carresofficial.com/health` report it
too). Verified through an AUTHENTICATED OPERATION session (role `operation`, not a principal)
against **89 real delivery rows**.

- **The landing is `Work to do` 89** beside `Confirmed deliveries` 1, rail
  `All delivery work 89 · No logistics picked 6 · Call customer 88 · Overdue delivery 1 ·
  Failed Delivery 0 · Upload delivery proof 0`, and no filter summary — its queue narrows nothing.
- **⭐ THE ARRIVAL DEFECT IS MEASURABLY FIXED ON REAL DATA.** Across the 89 rows:
  `No purchase order raised yet` 57 · `Not confirmed` 24 · `No expected arrival calculated` **4**
  · `Same as PO` 2 · `Supplier delivery date passed` 2. **Those 4 rows read
  `The factory has not given a date` on 2026-09-11 morning** (the PR #1235 closure above records
  exactly that count) — they were blaming the factory for a question nobody had asked. They now
  name OUR gap. The compact cell prints the date alone; the state word is its accessible name
  (`Expected arrival Thu, 13 Aug · Supplier delivery date passed`).
- **The compact contact deadline is live on 87 rows** — 17 ahead of time, 70 late — as
  `[phone] {date}`, with `Contact deadline Thu, 23 Jul — overdue, the deadline does not move` as
  the cell's accessible name. **`Call by` and `Late — was due` no longer appear anywhere on the
  page.**
- **The two overdue populations are distinguishable on one screen at last:** the rail reads
  `Overdue delivery 1` and the contact strip's chip reads `Overdue contact 70`. They used to be
  two bare `Overdue` counts of 1 and 70.
- **Delivery Orders (PRs #1238 / #1239) was verified in the same session** at
  `/operation/delivery-orders`: the ruled column order, `DOCUMENT STATUS` as the kit's dropdown
  (`All (2)`), the three work queues, and — on the two real documents, neither delivered —
  `Not delivered yet · No signed document yet` rather than a fabricated `Photos 0`.

⚠️ **What production could NOT prove, and why.** Three ruled states have no row in today's data:
a confirmed date with **no agreed time** (no such arrangement exists), **`Waiting supplier reply`**
(no advance arrival check is open today) and **`The factory has not given a date`** (no evidenced
`delayed` reply naming no day exists). Each is covered by a shared unit test and was walked on the
seeded Monitor fixture at 1440px, 949px and 375px. **The driver-submission GALLERY and PLAYER
likewise have no production file to open** — both live delivery orders are undelivered — so the
viewer's paging, its `This file could not be opened` state and its focus return were proved on
fixtures and in the kit's own tests, not on live data. §6 of this MASTER says how real files
arrive; until a delivery actually runs, that is the honest limit of the evidence.

**STILL NOT BUILT, and named rather than implied:** there is no per-ATTEMPT evidence record, so a
rebooked trip's second visit cannot be told from its first on a single-document order. A dedicated
`delivery_attempt_evidence` table is the right home; it needs a migration and the governed apply
path.


**DEPLOYED 2026-08-24 — PR #896, main SHA
`52804c005d7bf53bcbe9e1b1dcdd2b47cd684656`.** The first approved Delivery UI correction is live
in production and has been verified through an authenticated Operations session:

- the Portal sidebar has one direct **Delivery** destination, with no separate Delivery Work or
  Delivery Orders child;
- `/operation?tab=delivery` is the one operational listing for delivery planning and issued DO
  facts;
- the date rail uses **No confirmed date** and **Overdue**;
- the listing keeps Requested Delivery Date separate from Confirmed Delivery and Confirmed Time, shows
  Logistics Partner and Goods, and adds DO No and Delivery Status to the same row;
- expanding a row shows its product lines and the shared Stock facts Where, Who has it and Stock
  ETA without leaving Delivery;
- clicking an issued DO opens the formal DO object; its back door returns to **Delivery**;
- the retired `/operation/delivery-orders` list address redirects to the unified Delivery page.

This closure records only the production slice above. It does not claim that the remaining
Partner arrangement, proxy-recording, proof, exception, Settings, Reports or future Portal/API
capabilities in this Blueprint are already built.

**DEPLOYED 2026-09-01 — Delivery Card 03, PR #1042, main SHA
`668be4ee355e49755a9bc5794aca3e3b2e0f16ee`, production converged (deploy probe 14:32).**
Migration `0411` was verified in a rolled-back production transaction (columns · seeds ·
Sunday-pickup CHECK · anonymous-caller 42501, rollback clean), then applied as the exact
committed file under owner approval; the tracker tail reads `0411` and the TEOW/TT calendar
seeds were measured live. Assign logistics now shows the §5.1 backward-calculation fact for a
calendar partner. The calendar EDITOR is deliberately deferred to the Delivery Settings card.

**DEPLOYED 2026-09-01 — Delivery convergence (the #999 takeover), PR #1043, main SHA
`b0a1fb392caaba19f006f5d48735339cb12185e0`, production converged.** Kept: My Work / Team Work
deep-links to the exact arrangement/DO, `Record Delivery Result` with evidence and exact
reserved Units, the DO header's next handover act, exact source-order doors, the read-only
Warehouse Schedule feed and the narrow-layout rail control. Reverted before merge, per the
owner's takeover instruction: the `Delivery Status → Work` column rename and the
hide-empty-rail-choices change. PR #999 is closed with a pointer; split-trip DOs still do not
expose Delivery Result (order-scoped writers — a named follow-up, not an accident).

**DEPLOYED 2026-09-01 — Delivery Card 04, PR #1046, main SHA
`0c56739aa770f079acd0dbe86ee34c950e8de815`, production converged.** The REGION rail group
(states by their own names · fixed EAST MALAYSIA and SINGAPORE sub-headings · leg 1 under
Johor, leg 2 under Singapore · no `Other` bucket of any spelling) and the six-day generated
date window (Sunday and Malaysian public holidays never offered; a genuinely recorded
Sunday/holiday date still shows). The same PR persisted the East Malaysia boundary ruling into
§15 and the shared 240px rail-recipe correction into §8.

**DEPLOYED 2026-09-01 — Delivery Card 05, PR #1047, main SHA
`6707a454cd494407aa23d6062521fa65a3f8a281`, production converged.** The chase door in Edit
Delivery (`Ask {partner} for the delivery date` — prepared message · `Copy message` ·
`Open WhatsApp group` to the partner's own group, honest absence when none is saved, the
on-screen law *sending is not confirmation*) and the reply proof as a REAL upload through
`POST /delivery-arrangements/:orderId/reply-proof/sign-upload?leg=` into the private proof
bucket under `arrangement/{order}/{leg}/…`.

**DEPLOYED 2026-09-09 — the requested-vs-confirmed chase, PR #1181, main SHA
`21f992cdbcf2d6f3addcfa9e08e48da6abe1f785`, production converged (both Pages projects and the
production Worker report that exact SHA).** §8's chase ruling is LIVE and walked on real data.

`Monitor → No confirmed date` prints the ruled twelve columns in order — `SO No · Customer ·
State · Requested Delivery Date · Logistics Partner · Confirmed Delivery · Confirmed Time ·
DO No · Delivery Location · Goods · Delivery Status · Actions` — over 86 real deliveries,
ordered `Mon, 20 Jul` → `Tue, 21 Jul` → … → `Sat, 31 Oct`, with the one row carrying no
requested date printing `No delivery date` LAST. 81 rows read `Call {partner} — confirm delivery
date` above `Edit Delivery` and 5 read `Assign logistics`; the partner names came from the data
(NETS · AL · HOUZS · TEOW), none hard-coded. The retired words are absent from the live page
(`Promised Delivery` · `Customer Delivery` · `Deliver By` · `scope`), and the only `Leg` on
screen is a furniture line (`Leg 4"`), not a Journey word.

`Edit Delivery` from `No confirmed date · Selangor` opened
`/operation/delivery/edit/{order}?from=%2Foperation%3Ftab%3Ddelivery%26view%3Dno_confirmed_date%26region%3DSelangor`
and its back door returned to exactly that list, queue still active and the narrowing intact.
`/operation/delivery-orders` prints `DO No · SO No · Customer · Requested Delivery Date ·
Confirmed Delivery · Confirmed Time · Logistics Partner · Delivery Location · Delivery Result ·
Proof Status · Status · DO date`, and one live document proves the three dates are three facts:
requested `No delivery date` · confirmed `Thu, 20 Aug` · `DO date` `Tue, 18 Aug`.

Two defects were found and fixed on the way. The requested date had THREE arithmetics — one
`requestedDeliveryOf` now — and both registers exported `To be confirmed` as `No delivery date`,
telling an Excel reader a customer had named no day when they had asked for one still being
settled; one `requestedDeliveryText` now feeds the cell, the search, the per-column filter and
the export. Both layout storage keys were bumped (`workList.v2 → v3`, `register.v3 → v4`)
because a persisted `order` array outranks the default and would have hidden the new sheet from
every operator who had opened these pages before.

Desktop, tablet and phone were walked on the seeded preview (the phone shows the card list with
the requested date, the partner and the act, its own search box and the `{n} of {m} deliveries`
footer). Typecheck clean, 4,057 web tests green (30 new) and 2,865 api tests green,
design-standard lint clean, `ci:migrations` 464 filenames and 0 changes. **No migration, no RLS
change, no new field, no new writer, no API change** — every fact on screen was already being
read by these pages.

⚠️ **The production walk ran under the signed-in `principal@carres.com` session, not an
Operation account.** It is honest to name that: a principal read can hide an RLS gap. The gap
risk here is nil rather than unchecked — this PR added no query, no column, no policy and no
route, so an Operation account exercises exactly the reads it exercised before 2026-09-09. Jess
can confirm in a minute by opening the same two URLs as `operation@`.

**DEPLOYED 2026-09-11 — Monitor's two named views, the row that says what to do, and the
contact week, PR #1235, main SHA `016475d7e2811d863b21c08716746fb77fca286b`, all five canonical
surfaces converged (erp · pos · both pages.dev `/__carres_deploy.json` and the Worker
`/health` each report that exact SHA).** The 2026-09-10 owner ruling is LIVE and was verified
through an AUTHENTICATED OPERATION session on production (`operation-test@x.com`, role
`operation` — an Operation account, not a principal), against 88 real delivery rows.

`/operation?tab=delivery` lands on **`Work to do` 88** beside **`Confirmed deliveries` 1**, with
the rail reading `All delivery work 88 · No logistics picked 5 · Call customer 87 · Overdue 1 ·
Failed Delivery 0 · Upload delivery proof 0` and the ruled columns in order — `SO No · Customer ·
State · Requested Delivery Date · Items · Accessories & services · Expected arrival · Stock ·
Actions · Edit Delivery`. The landing prints no filter summary, because its queue narrows nothing.

**Every arrival state is exercised by REAL production data** — measured across the 88 rows:
`No purchase order raised yet` 56 · `Not confirmed` 24 (our production-plus-transit date, no
supplier reply) · `The factory has not given a date` 4 · `Same as PO` 2 · `Supplier delivery date
passed` 2. SO-1319 and SO-1328 print `Same as PO` over Tue 15 Sep and Mon 14 Sep from evidenced
`po_supplier_promises` replies; SO-1210 and SO-1204 wear the amber `Supplier delivery date passed`
over Thu 13 Aug and Wed 19 Aug; SO-1287 · SO-1213 · SO-1212 · SO-1207 state the gap rather than
guess. The goods split reads as ruled — `Trion · Queen × 1 — 1 short`, `Service · Dispose old sofa
(big size)`, `Floor 3 · No lift` — and `Stock` carries the whole shipment's shortage beside it.

**The contact week answers on real deadlines.** `Call customer` shows Mon 7 – Sat 12 Sep with live
per-day counts and an `Overdue 70` chip: 70 of the 87 chases are already past their T−3 day, which
is the truth of a year of imported orders and exactly the fact the strip exists to surface. The
`Overdue` chip narrowed to `70 deliveries` (`?late=1`), `Mon, 7 Sep` narrowed to `1 delivery`
(`?due=2026-09-07`, matching the strip's own count), and `Clear filters` returned `88 deliveries`
on `?view=all` WITHOUT leaving the work list. Rows print `Call by Thu, 22 Oct` ahead of time, the
red `Late — was due Thu, 16 Jul` once past — keeping the day it missed — and `No contact deadline`
on SO-1254, whose customer named no day. ⚠️ **The cell renderings quoted in this
paragraph — `Call by {date}`, `Late — was due {date}`, a bare `Overdue` chip, and the calendar
sentence naming a confirmed *date and time* — are what shipped THAT DAY and are OVERWRITTEN by the
2026-09-11 corrections in §8 above.** The counts and the URLs are unchanged evidence; the words
are not current law.

`Confirmed deliveries` opened the Mon 7 – Sat 12 Sep week with `Day · Week · Month`, the boundary
sentence `Only deliveries with a confirmed date and time appear here.` and — that week being
genuinely empty — the ONE spanning state with the REAL `87 deliveries need a confirmed date.` count
and its `Open Call customer` door. Paging to Mon 24 – Sat 29 Aug showed the single real
appointment under its confirmed date with its confirmed time: `Thu, 27 Aug · Afternoon (12pm–3pm) ·
No delivery order yet · Ah Mei · Likas, Sabah · Sonic · Queen ×1 · HOUZS · Delivery confirmed`.
The phone (390px) showed the tabs, the scrolling contact strip with its `Overdue` chip and the card
list carrying the red deadline; 1280px proved real horizontal scrolling with the sticky `SO No`
identity column clipping cleanly and `Actions` + `Edit Delivery` reachable.

**Two defects were found and fixed on the way.** A delivered row still owing evidence offered
`Assign logistics` as its next act — booking a carrier for goods the customer was already sitting
on; a recorded result now outranks an unassigned partner. And a service line was counted as a piece
the register could be short of, leaving every order that books a disposal permanently `Not ready`.

Typecheck clean across all three packages; **4,381 web · 3,093 api · 3,168 shared tests green**
(181 in the two Monitor suites, 12 new API, 19 new shared); design-standard clean;
`ci:migrations` 487 filenames and 0 changes. **No migration, no RLS change, no new writer, no new
route.** `GET /api/operation/orders` gained two batched reads on the query it already made
(`po_arrivals` and `allocated_units`), each probed under the Operation account's own RLS before
the change was written, and batched for the Worker's subrequest budget rather than per order.

⚠️ **Named limitation, not an accident:** production holds ONE confirmed delivery date and TWO
reserved Units across 88 delivery rows, so `Confirmed deliveries` is nearly empty and almost every
row reads `Not ready`. That is the DATA, not the page — and per the Constitution §6 every row
today is test data. The calendar's population will only be exercised at volume once operators
start recording confirmed dates.

**DEPLOYED 2026-09-07 — Monitor Day · Week · Month and rail correction, PR #1157, main SHA
`4f35842c87acea49cd0fcc0716d6acc0a3e31ce6`, all four canonical surfaces converged (erp ·
pos · pages.dev `/__carres_deploy.json` and the Worker `/health` each report that exact SHA;
the served entry bundle carries `Upload delivery proof` · `LOGISTICS PARTNER` · `DELIVERY
STATUS` and no `Delivered — Proof Required` or `delivery scopes selected`).** The §8 owner
correction is live and was verified through an authenticated Operations session on production:
`/operation?tab=delivery` lands on the **Week** calendar (Mon 7 – Sat 12 Sep) with `Day · Week ·
Month` in the page toolbar, the honest spanning state and the REAL `86 deliveries need a
confirmed date.` door; the rail reads the four ruled groups with real counts — WORK TO DO
(All delivery work 87 · No logistics picked 33 · No confirmed date 86 · Overdue 1 · Failed
Delivery 0 · Upload delivery proof 0), STATE as 13 direct names (Kuala Lumpur 37 · Selangor 23
· Pahang 6 · …), LOGISTICS PARTNER (NETS 46 · AL 7 · HOUZS 1) and DELIVERY STATUS (0 · 0 · 0)
— with no `Calendar` row, no `All …` rows and no proof-required status; `Month` on an empty
September showed the one spanning state, the toolbar's `Previous month` opened AUGUST 2026
printing `27 · Deliveries 1 · Exceptions 1`, and clicking 27 opened that date's `Day` with the
real card (afternoon window · `No delivery order yet` · customer · Likas, Sabah · goods · HOUZS
· `Delivery confirmed`); `No logistics picked` → header select-all read `33 selected · Clear ·
Assign logistics` in place with the footer `33 deliveries` (cleared; no production assignment
was submitted); `Week` returned the Calendar. Measured over SQL the same day: production holds
no recorded delivery attempt, photo ledger or signed document yet, so the `Upload delivery
proof` and `Failed Delivery` queues honestly read 0. Windows verified at all three breakpoints
on the seeded preview (desktop Week / Day / Month · tablet three-day Week and Month · phone Day
list with the kit date control and no Day/Week/Month control). Typecheck clean, 3,983 web tests
green (119 in the two Monitor suites). No migration, no RLS change, no new writer.

**DEPLOYED 2026-09-07 — Monitor default landing correction, PR #1125, main SHA
`ccc4c63b4aa8294fe91103dda0b36395606514a5`, production converged (deploy probe reports that
exact SHA and the served bundle carries the ruled view order).** The §8 owner correction is
live and was verified through an authenticated Operations session on production:
`/operation?tab=delivery` lands on **`All delivery work`** — the selectable DataGrid listing
all 87 real delivery scopes, DO-less/dateless/partnerless rows included, footer `87 delivery
scopes`; the rail reads the ruled order with the real counts (All delivery work 87 ·
No logistics picked 35 · No confirmed date 86 · Calendar 0 · Overdue 1 · Failed Delivery 0 ·
Delivered — Proof Required 0 · Waiting for warehouse 0) and LOGISTICS carries no duplicated
unassigned row; `No logistics picked` → header select-all read `35 delivery scopes selected ·
Clear · Assign logistics` (the governed dialog opened on the seeded preview; no production
assignment was submitted); the explicit `Calendar` pick opened the fixed week Mon 7 – Sat 12
Sep with the honest spanning state and the REAL `86 deliveries need a confirmed date.` door.
Typecheck clean, 3,979 web tests green (91 in the two Monitor suites, including the default
landing, the ruled order, the all-dates unassigned queue and the Selangor combination).

**DEPLOYED 2026-09-03 — Delivery Card 07, PRs #1065 + #1068, production converged at
`1ffb21e8882ebd7e46b2851ce090f24f17d1570a`.** The ruled partner screen (§5/§13) is live:
`Delivery dates` at `/delivery-partner/arrange` — one phone-first column, the ruled minimum
facts, and exactly two acts, `Save Delivery Arrangement` and `Cannot Deliver` (governed reason;
`other` demands the note; a reported scope reads *Carres Operations is deciding*). The API is
partner-gated with service-role reads narrowed in code; another partner's scope answers 404;
the PUT accepts only the four partner fields. Migration `0417_the_partner_says_it_cannot_deliver`
(probed in a rolled-back production transaction, applied as the exact file, tracker row matching
the file name) gave the arrangement-events table its scope columns — which also repaired 0412's
latent door defect, stated plainly in that migration's own header. The merge collided with a
sibling's `0417` sixteen seconds apart; the deploy gate correctly held production, and the pair
is baselined in `check-migrations.mjs` with its measured state (#1068). The legacy Accept-based
partner kanban's retirement, POD work and the Operations Work row raised by a Cannot Deliver
report remain named follow-ups, not accidents.

**DEPLOYED 2026-09-01 — Delivery Card 06, PR #1048, main SHA
`feec4618f053b183b8a66f94c884799db3051615`, production converged.** Migration `0412` was
probed in a rolled-back production transaction, then applied as the exact file; the tracker
tail reads `0412` and the column + door were measured live. Condominium registration is a
Delivery-owned arrangement field in Edit Delivery's Condo-only block, and `Copy message` /
`Open WhatsApp group` quietly record the `message_prepared` activity through the one SQL door —
an activity fact that confirms nothing and moves no arrangement field.

**DEPLOYED 2026-09-06 — Monitor month calendar + fixed windows, PR #1119, main SHA
`88c76100fd7a40623c1904030869c36031303de8`, all three canonical surfaces converged (deploy
probes).** The §8 month-calendar correction is live and was verified through an authenticated
Operations session on production: the complete SEPTEMBER 2026 month fixed at the rail's top
(Sunday-first per the owner's sketch, selected date blue, today distinguishable, Sundays
muted and unclickable, the work-day DOT visible on the real Thu 27 Aug confirmed delivery);
month arrows browsing to AUGUST 2026 and back; clicking 27 opening the fixed operating week
Mon 24 – Sat 29 Aug with its real card and partner, the picks cleared and `?date=2026-08-27`
on the URL; `All delivery work` listing all 87 real scopes in the corrected column order with
the month still in view. Windows verified at all three breakpoints on the seeded preview
(desktop week · tablet Thu–Sat half-week · phone one-day list with the kit date control).
Local full-suite runs that night were polluted by overlapping sibling vitest processes (the
rotating purchasing failures never reproduced twice and passed 126/126 solo and 235/235 on
clean main); CI's clean runner passed the full suite before merge.

**DEPLOYED 2026-09-06 — Monitor work lists + Delivery Orders Register correction, PR #1109,
main SHA `22bf71493b5c6f12c946c3898a2cf13477ca33eb`, all three canonical surfaces converged on
that exact SHA (deploy probes).** The 2026-09-06 owner UI correction in §8 is live and was
verified through an authenticated Operations session on production: one WORK TO DO rail group;
REGION as flat direct state names with real counts; LOGISTICS listing only carrying partners
plus `No logistics picked`; the spanning empty-range state printing the REAL 86-deliveries
count with its `Open No confirmed date` door; the `No confirmed date · No logistics picked`
combined summary narrowing 86 → 35 with `Clear filters`; select-all over the 35 visible rows
producing `35 delivery scopes selected · Clear · Assign logistics` in place; and the Delivery
Orders register on the full Register grammar with its WORK TO DO / DOCUMENT STATUS rail and
`Print {N} delivery orders` selection output. No migration, no RLS change, no new writer — the
one governed assignment door is reused. Named follow-up, not an accident: the `Check delivery
proof` queue joined on 2026-09-13 with the §6 proof-review record (Card 13).

**DEPLOYED 2026-09-04 — Delivery CARD 01 · Monitor Calendar, PR #1101, main SHA
`e04dc00708eb2f40f001b8dedd8a4721a24c3875`, production converged (deploy probe).** The four-page
map's first page is live: Monitor is the read-only six-operating-day calendar at
`?tab=delivery` (mobile: one-day list), the Portal sidebar carries the Delivery module with
Monitor and Delivery Orders, and `/operation/delivery-orders` reaches the existing register
again instead of redirecting. Every card is one link — an issued DO opens the Delivery Order
object, a scope without one opens Edit Delivery — and no Delivery writer, evidence change,
partner file or migration is in the diff. Walked on the seeded dev preview at 1920/1440/1130/
375px; the walk's own findings (raw partner id on the rail · NEEDS CHECKING hidden behind the
window · plain REGION rows) were fixed before merge. Named follow-ups, not accidents: a bulk
`Assign logistics` surface (the retired listing's door), the Delivery Orders register's own
redesign Card, and owner acceptance of the PROPOSAL copy (`Monitor` · `Calendar` ·
`NEEDS CHECKING` · `Search deliveries…`).


### Supplemental production acceptance · 2026-09-13 23:32 MYT

Card 12’s representative manager save is now verified as principal on the existing E2E LP-X fixture, persisted after reload and restored to its original value with both audit entries retained. Card 18’s office form was walked as principal: Building type is required, the retired address-later control is absent, and missing address/building/date facts disable Create order with the governed message. These are authenticated observations on `f2fb3efeb89c395dd9f7ee96cdc49d60e6e103ff`; see the supplemental sections of Cards 12 and 18 for exact test facts. Dealer POS remains open: the working dealer-test login reaches first-time staff PIN setup, not the wizard. No identity/security setup was changed. Cards 19/20 are being handled in their existing Delivery workspaces; Card 21 owns only legacy warehouse-pick application retirement, with database retirement explicitly still outstanding.

### Document ownership correction · Card 22 · build pending

The SO-1362 acceptance read found that an intermediate DO borrowed its sibling final DO’s signed document from the order mirror. Card 22 binds signed-file presence, download and review timestamps to the exact DO, using document-bound evidence or an explicitly matching order mirror. Intermediate arrivals retain their own recorded photos and show no customer signed-paper demand. This is a read correction with no migration or Unit write; production closure remains pending.

### Production convergence checkpoint · 2026-09-14

All five production surfaces converged to `9dd3945b8d451e142d223752bbe91f243357bd0e`. Authenticated checks confirm the intermediate SO-1362 DO is Arrived, each DO uses its own source warehouse, and customer delivery/partner/proof reports exclude the intermediate trip while warehouse handovers retain it. Both legacy warehouse-pick application doors return 410 without changing the fixture order or allocation. Database 0501 is recorded, its three retired functions are absent, and the post-migration derived-total refusal probe rolled back with qty 4 / reserved 2 unchanged. Exact observations are appended to Card 21. Signed-file ownership and the Register’s remaining intermediate proof absence are Card 22 work; SO-number door deployment acceptance and the dealer POS staff-PIN login remain outstanding at this checkpoint.
