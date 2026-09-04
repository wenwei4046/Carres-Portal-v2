# DELIVERY — MASTER

> **The only Delivery authority.** Overwrite it when re-ruled; Git is the archive.
> Owner-approved top-to-toe Blueprint, 2026-08-14. Current implementation may lag this target;
> existing code, old Cards or legacy write doors do not regain authority by existing.

## 1 · Mission and ownership

Delivery turns Sales Order goods that may be delivered into a controlled Delivery Order, a clear
Warehouse-to-Logistics handover, a factual delivery history, accepted proof and either completion
or an explicit next action.

Delivery owns Logistics Partner identity/rules and assignment, Delivery Orders, delivery
arrangements, each actual delivery event and item result, delivery proof, delivery problems,
goods-location observations, the Delivery workspace and append-only history.

| Truth read or linked by Delivery | Owner |
|---|---|
| commercial order, promised customer date, ordered goods and permitted commercial split | Sales Orders |
| physical stock, readiness, location, Warehouse work, handover and return receipt | Stock / Warehouse |
| payment, outstanding and receipt | Finance / Money In |
| payment-based delivery hold | Sales Orders |
| supplier and PO ETA | Purchasing |
| product/category and minimum photo rule source | Catalog |
| repair, replacement, refund, compensation, claim or complaint | owning downstream module |

Delivery never creates a second commercial-order, stock, money, Service or Guarantee editor. It
records what happened and links the owner that must decide a remedy.

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

### CONDITION-GATED SERVICE COLLECTION

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

- **NETS Logistics is Klang Valley's current default and main Logistics Partner.**
- Issuing a Klang Valley Delivery Order auto-assigns NETS. NETS is responsible immediately and
  does not click Accept.
- NETS contacts the customer and arranges the delivery date/time. Operations may record the facts
  on NETS' behalf until direct portal use is mature.
- NETS uses **Cannot Deliver** only when it cannot perform the arrangement. A reason and actual
  reply/report evidence are required. Operations decides whether to keep NETS with a new date,
  correct information, hold/cancel the arrangement or assign another Logistics Partner.
- AL, TT, Teow and other partners without portal access are assigned manually. The portal prepares
  WhatsApp/email content; Operations uploads the partner's actual reply before recording Confirmed
  or Rejected. Prepared, copied, opened or sent never means confirmed.
- One active Delivery Order has one active Logistics Partner. A permitted split uses separate
  Delivery Orders/scopes and may use different partners.
- Default coverage is configurable and audited, never hard-coded to NETS. Future Carres may assign
  any partner, but current routine Klang Valley operation remains NETS-first.

Current flow:

```
goods may be arranged
→ the SYSTEM issues the Delivery Order when the governed gate is met
→ Klang Valley auto-assigns NETS
→ NETS contacts customer; NETS or Operations records arrangement
→ Warehouse prepares goods
→ Warehouse hands over; Logistics confirms receipt
→ actual delivery occurs
→ Record Delivery Result + item results + goods location + proof
→ proof accepted and obligation completes, or explicit next Work begins
```

## 3 · Delivery Order and goods scope

A Delivery Order is Carres' formal authority for a Warehouse to hand specified goods to a named
Logistics Partner for delivery to a customer. It is not proof of Warehouse handover and is never
proof of delivery.

Each DO stores a stable number, source Sales Order, customer/contact/address, Warehouse, Logistics
Partner, customer-contact owner, planned and confirmed date, time window, ETA, goods/quantities,
site and handling requirements, release restrictions, Warehouse status, latest result, proof,
problems and history.

- One Sales Order may have multiple DOs for different goods, Warehouses, dates or Partners.
- Bed-set goods remain inseparable. Sofa may travel separately only with customer agreement.
  Accessories do not block core large goods.
- The issue preview states **This delivery** and **Remaining after this delivery**, with the reason.
- ⛔ **SUPERSEDED 2026-08-16 — *"Issue Delivery Order is the only employee act"*.** The owner ruled
  that **the system issues the DO when its requirements are met**; it is no longer an employee act.
  The rest of that sentence stands and is reinforced: **never use Release or free-form Create DO**,
  and there is **no Release button and no Approve button** on this path (§15's dictionary entry
  `Release → Issue Delivery Order` is unchanged and still binding). The one governed manual door is
  **`Request Delivery Order`** (owner ruling 2026-08-19) — the outstation trip's door, same single
  issuing path and same gates, merely not waiting for the booking-confirm trigger.
- ⭐ **THE MONEY HALF IS RE-RULED 2026-09-01 (SUPERSEDING 2026-08-19): money in full before
  delivery is ABSOLUTE** — a DO issues only when **outstanding = 0 and no OPEN Finance
  exception holds it.** The one exception door (Delivery Payment Approval) was removed from the
  screen by owner instruction (PR #1031): nothing can request one any more, and an owing order
  is undeliverable until it is paid. The 0362 gate still honours an approval granted before the
  removal — history honoured, not a live path. The 0362 record and
  the 0355 Finance exception are defined once in
  [`../orders/MASTER.md`](../orders/MASTER.md) §8, which owns the gate — Delivery READS it and may
  never write it. A DO issued under an approval **prints the COD instruction** on the document.
  Delivery remains the writer of the document and the owner of the carrier, the trip derivation
  and the proof.
- Issue rechecks permitted goods, split, Warehouse, address and applicable hold rules atomically,
  snapshots the scope and assigns the next owner. It does not create an actual delivery event.
  **These rechecks survive system issuance unchanged** — what changed is who triggers the act, not
  what the act verifies.
- Reprint retains the number and logs the event. Once handed to Logistics, a DO is never deleted;
  cancellation, replacement or correction preserves the original history.

### THE DO DOCUMENT MODEL — blueprint card, owner-approved 2026-08-16 · BUILT (migration `0356`)

**One delivery TRIP = one DO.** Most orders: one trip, one DO. A split delivery or two
destinations = one DO per trip, each with its own goods scope. The document rows live in
`ops_delivery_orders` (0356), materialised by ONE trigger on `orders.do_number` so every existing
mint path produces the row; a future split-trip door inserts directly and mirrors the active
number.

- **Numbering** stays the locked `DO-DDMMYY-NNNN` scheme (`docNumber`, seeded on the order id):
  a retry, refresh or reprint returns the SAME number; a rebooked trip is a NEW document on its
  own issue date.
- **Status is DERIVED, never stored** (`deliveryOrderStatusOf`, one arithmetic): the void stamp,
  the `delivery_attempts` history matched to the document's number and the §4 handover facts
  (0363) decide `Created · Out for delivery · Delivered · Delivery exception (+ its ONE reason) ·
  Cancelled`. **`Out for delivery` = the §4 chain's `Received by Logistics` fact with no result
  recorded yet (BUILT 2026-08-19, slice 1)** — Ready for Handover alone derives nothing, Handed
  Over alone derives nothing, a recorded result always outranks the derivation, and it is never
  derived from the calendar, because a departure nobody recorded is not a fact.
- **A failed document keeps its Delivery exception + reason FOREVER** — it is never rewritten as
  Delivered. When a new date is booked the system issues a NEW DO; the old one stays as history,
  both linked to the Sales Order.
- **Staff can never delete or void a DO.** Deletion is refused by trigger; the ONE void door
  (`delivery_order_void`) accepts only `order_cancelled` or `rescheduled` and records reason +
  actor + time. No UI exposes a void control. **BUILT (Slice 3):** the booking-confirm door
  supersedes a no-longer-matching active document (void `rescheduled` when un-run; a failed one
  keeps its exception and stops being active; a delivered one is untouched) and the system mints
  the new document; `cancel_order` (0357) voids un-delivered documents in the cancellation's own
  transaction. Every gate-completing door — booking confirm · stock reserve · finance clear —
  attempts issuance through the ONE issuing path; no button exists anywhere.

## 4 · Warehouse and Logistics are separate

NETS Warehouse and NETS Logistics remain separate duties and business identities even when one
legal company supplies both.

Warehouse owns Picking, Checking, Packing, Ready for Handover, physical handover, returned-goods
receipt, quantity, condition and location. Logistics owns customer contact, arrangement, driver or
team, transport, Logistics receipt, ETA, Delivery Result and delivery proof.

```
Need Preparation → Picking → Checking → Packing → Ready for Handover
→ Handed Over → Received by Logistics
```

Ready for Handover is not handover. Handed Over is not Logistics receipt. Logistics receipt is not
delivery. On return, a Logistics report never substitutes for the Warehouse's actual receipt.

Handover records the exact required Unit IDs, each scanned Unit result, both parties, actual
receiver, time, vehicle when known and signature/photo/reply proof. The derived Outbound control
is:

```
Required Units = Handed over Units + Not handed over Units
```

A partial handover never marks the whole DO collected. Only the handed-over Units change `Who has
it` from the Warehouse holder to the Logistics holder. Every Unit not handed over keeps its prior
holder and its original dated Warehouse work remains open. Delivery shows the Journey risk but
does not invent a replacement quantity or overwrite either party's original fact. A discrepancy
creates investigation Work linked to the same Unit IDs and handover evidence.

Each Delivery Journey leg reconciles its own `Collected` and `Arrived` Unit facts. A two-leg
journey therefore completes neither leg, nor the whole journey, from a count recorded on the
other leg.

**DELIVERY-TO-OUTBOUND RECONCILIATION — owner-approved 2026-09-01.** The DO owns the exact required
goods scope; Warehouse Outbound reads that scope and does not re-create it. For each DO and each
separate journey leg, the shared read-only tally prints `Required · Handed over · Not handed over`
and drills to the same Unit IDs. A partial handover changes only the scanned Units: handed-over
Units move to the evidence-backed journey holder; Units not handed over remain with their last
confirmed holder and retain the original dated Warehouse work.

Logistics receipt remains its own counterparty fact. If Warehouse says two Units were handed over
and Logistics confirms only one, the Portal preserves both results, identifies the exact unmatched
Unit and creates `Needs checking`; it never marks the whole DO collected or edits either event to
force agreement. The clickable chain is `SO → DO → Outbound handover → Unit IDs → Logistics
receipt → customer arrival proof`. The shared contract is defined once in
`../ERP-ARCHITECTURE.md` §3.5.1.

One personal login may hold Warehouse, Logistics or both duties and switch between **Warehouse
Work** and **Logistics Work** without logging out. Every event records person, company and active
duty. No shared company login is allowed. Even when one authorised person performs both sides, the
events and evidence remain separate.

### BUILT 2026-08-19 — slice 1: the three facts that light `Out for delivery`
(card `CARD-2026-08-19-warehouse-handover-chain`)

The chain's last three steps are live as **append-only events on the Delivery Order**
(`delivery_handover_events`, migration `0363`): `ready_for_handover → handed_over →
received_by_logistics`, one pass per document (a rebooked trip is a NEW DO), ordered and
deletion-refused at the database. Each event records person, company, **active duty word**
(`warehouse` for Ready/Handed, `logistics` for the receipt — stamped by the act; no roster
exists yet), time and proof link. The ONE door (`delivery_handover_record`) refuses an
out-of-order fact, a duplicate fact and a voided document; **Handed Over requires the actual
receiver and proof** (signature/photo/reply, bound to the exact event under
`handover/{do_id}/` in the private proof bucket). A Logistics receipt may carry its OWN goods
count — a discrepancy keeps both facts visible and overwrites neither (the investigation Work
it should raise is a later slice). Every fact also lands on `order_history` in business words,
so the Sales Order's History reads the same truth.

**EXTENDED 2026-09-04 — Warehouse Card 03 (migration `0424`).** The chain now speaks exact
Units: the DO's required scope is snapshotted immutably at issue (`delivery_order_units`, from
the ONE Sales Order allocation), `handed_over` takes MULTIPLE append-only batches naming exact
Unit IDs (`delivery_handover_event_units`; a Unit is accepted once per scope), each batch
requires per-Unit `scanned → checked → packed` facts (`delivery_unit_prep`) plus the actual
receiver and proof, and the same transaction moves ONLY the accepted Units' `Who has it` to the
partner's governed operating party (`delivery_partners.operating_party_id`, resolved
server-side — never client text). `ready_for_handover` and `received_by_logistics` stay
once-per-document; the receipt may name the counterparty's OWN Unit list, preserved beside the
Warehouse's without overwriting it. Legacy 0363 quantity rows remain readable history and are
never presented as invented exact IDs.

**The Warehouse acts moved to the approved Warehouse Outbound page** (Stock MASTER §12.6): the
Delivery/DO surfaces keep `Confirm logistics receipt` (the counterparty's own act) and offer the
**Open Outbound** door for the physical work; the DO object page renders the chain read-only in
its **Warehouse handover** block and its History, with each recorder named. Returned-goods
receipt and discrepancy investigation Work remain approved target, not built.

## 5 · Customer contact, date, time and ETA

Every contact task names its purpose. Never show generic **Contact Customer** or **Follow Up**.
Allowed purposes include Confirm Delivery Date, Confirm Delivery Time, Confirm Customer
Availability, Confirm Delivery Address, Confirm Site Access, Confirm Receiver, Obtain Missing
Information, Confirm New Delivery Date after Failed Delivery and Confirm Cancellation.

Each contact record stores purpose, contact owner, channel, person contacted, actual time, result,
reply/evidence, recorder and explicit next action. Results include Confirmed, No Answer, Asked to
Call Again, Requested Another Date, Contact Details Incorrect, Customer Refused Delivery and
Waiting for Customer Reply.

- **Promised delivery date** is Sales Orders' customer commitment.
- **Confirmed Delivery Date** is the agreed operational day.
- **Time Window** is the agreed range.
- **ETA** is Logistics' later estimated arrival and never rewrites the confirmed date/window.
- All Delivery grouping and due displays use actual weekday + date, for example **Monday, 17 Aug
  2026**. Delivery UI does not group work as Today or Tomorrow.

### 5.1 · Backward planning — Delivery owns the ONE calculation

**OWNER-APPROVED / LOCKED 2026-09-01.** For every journey that rides a partner's own pickup or
delivery weekdays — JB, Melaka, the two-leg Singapore journey and any partner with a governed
calendar — Delivery owns the one backward calculation:

```
customer delivery date
→ latest arrival at the partner warehouse (JB, where the journey has one)
→ the partner's actual KL pickup day
→ latest Carres Warehouse ready date
```

The calculation reads each partner's governed pickup/delivery calendar from Partner Settings
(§11) — never a weekday a member of staff remembers. Warehouse and Purchasing CONSUME the
calculated latest Carres Warehouse ready date through dated Work; they never recalculate it
(the consuming half is already law in [`../stock/MASTER.md`](../stock/MASTER.md) §5). When
Operations assigns TEOW or TT, Delivery computes the actual latest Warehouse-ready date from
that partner's pickup weekdays and raises the dated Work that informs Warehouse and Purchasing.

The current NETS portal presents only DO, customer, area, goods summary, requested date and special
requirements, then simple fields for Confirmed Delivery Date, Time Window, ETA, contact result,
note and reply screenshot. Its actions are **Save Delivery Arrangement** and **Cannot Deliver**.
Operations proxy records state `Recorded by [person] on behalf of NETS`, source, reporter, reported
time, recorded time and original evidence.

## 6 · Actual delivery, results and proof

The formal append-only object for one actual trip to the customer is **Delivery Visit**. It is a
system, permission and audit term. Employee navigation and page sections use **Delivery History**;
the employee action is **Record Delivery Result** and an entry title reads, for example,
`Delivery on Monday, 17 Aug 2026`. Employees never create a Delivery Visit directly.

A Delivery Visit exists only when delivery actually proceeds. Advance rescheduling, cancellation,
waiting for a reply, Partner rejection and Warehouse-not-ready are arrangement events, not visits.
Each actual event stores DO, Partner, driver/team, vehicle when known, planned and actual times,
item results, observed problem, goods location, proof, recorder and proxy provenance.

Employee results are:

- **Delivered** — all scoped goods delivered;
- **Partially Delivered** — some goods/quantity delivered and every remainder accounted for;
- **Failed Delivery** — actual delivery proceeded but did not complete delivery.

**Rescheduled** and **Delivery Cancelled** are arrangement states, not actual Delivery Results.

Delivered requires actual time, receiver, delivered goods/quantity and governed signature/photos.
Until proof is complete and accepted, show **Delivered — Proof Required**; after acceptance show
**Delivered — Complete**.

For each exact delivered Unit, Delivery emits one idempotent success fact. If Stock says that Unit
was `Supplier Consignment`, Purchasing automatically creates the Consignment Sale Notice for that
supplier × Delivery Visit. Failed/refused goods create no notice; a partial result creates notice
lines only for the exact Units successfully handed to the customer. Delivery owns the result and
proof, but cannot issue/correct the supplier document or settle supplier money.

Partially Delivered preserves delivered goods and requires failed quantity, reason, goods location,
proof and next Work for every remainder. Failed Delivery requires reason, explanation, affected
goods, actual time where applicable, goods location, reporter, proof and an explicit next action.
No bare Failed Delivery may be saved or closed.

Proof is bound to the exact event it proves: Logistics confirmation, customer confirmation,
Warehouse handover, Delivered, Failed Delivery, return or correction. Operations reviews delivery
proof as **Proof Accepted**, **More Proof Required** or **Proof Rejected**, with a reason. A sent
message is never reply evidence. Saved delivery facts are corrected through an append-only
Correction containing old value, new value, reason, person, time and approval where governed.

## 7 · Failed Delivery reasons and next Work

The reason dictionary is grouped, versioned and historical records retain their original value.

- **Customer:** not present; could not be contacted; refused; requested change at arrival; payment
  not ready; information incorrect.
- **Location:** address incorrect/incomplete; access unavailable; lift unavailable; item cannot fit;
  security refusal; unsafe condition.
- **Goods:** damaged; wrong; missing; incorrect quantity; incomplete; not acceptable to customer.
- **Warehouse / preparation:** goods not ready; wrong goods loaded; missing during loading;
  documents missing; handover delayed.
- **Logistics:** vehicle problem; insufficient capacity; late; did not attend; insufficient team or
  equipment; transport damage.
- **Carres / Order:** wrong date or information; should not have been arranged; payment/approval
  problem; unclear instruction.
- **External:** severe weather; road disruption; government/building restriction.
- **Other:** explanation required.

The record also states whether goods remain with Logistics, returned to Warehouse, remain with the
customer or are unknown. The next action is concrete: Confirm New Delivery Date, Confirm Delivery
Address, Confirm Customer Availability, Obtain Correct Contact Details, Confirm Site Access,
Return Goods to Warehouse, Inspect Returned Goods, Arrange Replacement Goods, Assign Another
Logistics Partner, Keep NETS and Change Date, Correct Delivery Information, Obtain Missing Delivery
Proof, Confirm Delivery Cancellation or Management Review.

Every problem has one primary owner, due time, evidence and next action. Recording Failed Delivery
automatically creates the appropriate Work. A problem closes only when its fact, reason, affected
goods, location, evidence and completed/cancelled next action are present. Creating another task
does not itself close the problem. Field staff record observable facts; an authorised reviewer may
append Root Cause later without rewriting the observation.

## 8 · Information architecture and templates

**SIDEBAR — owner ruling 2026-08-24.** Delivery is one direct sidebar destination, not an
expandable parent. It has no separate Delivery Work or Delivery Orders child. Delivery Orders
remain Delivery-owned formal objects, but operators find them in the one Delivery listing.
Delivery applies the governed Shell, Register and Object Detail Templates and does not invent
another UI system.

**DELIVERY NAVIGATION — owner ruling 2026-08-24.** The sidebar carries exactly one Delivery door:
**Delivery** · `/operation?tab=delivery`. There is no Delivery parent chevron, child elbow,
separate Delivery Orders list, hairline or `Coming soon` label.

`Schedule`, `Delivery History`, `Exceptions`, `Partners` and `Report` were rows an operator could
read, count and want, and every one of them refused the click. Five dead controls in a module with
two working pages do not teach *not yet*; they teach that the rail cannot be trusted.

**The capabilities are NOT retired.** Delivery History and Exceptions remain inside the DO object
and filtered Delivery listing. Partners stay in Central Settings and Report stays central under
Reports consolidation. They do not become duplicate Delivery pages.

Sales contains **Sales Orders** and temporary **Old Orders** only. Central Settings retains the
governed Delivery settings door.

There is no separate Delivery dashboard, Fleet, Trips, Regions or Delivery Returns destination.
KPI cards do not precede the work/Register.

**The unified Delivery listing — owner ruling 2026-08-24:**

```
SO / Ref · Customer · Requested Delivery Date · Delivery Location · Building · Logistics Partner ·
Confirmed Delivery · Confirmed Time · Goods · DO No · Delivery Status
```

`Requested Delivery Date` is the date the customer asked for, owned by Sales Orders. `Confirmed Delivery` and `Confirmed Time` are
Delivery's operational arrangement. `DO No` appears in that same row only after system issue;
before issue it says `No delivery order yet`. DO No opens the formal document and SO / Ref opens
the source Sales Order. One row = one Delivery scope/Journey leg; a split or multi-leg journey
shows one row per scope.

Statuses are the document's own: `Created → Out for delivery → Delivered`, plus
`Delivery exception` carrying its ONE reason, and `Cancelled` for a voided document. There is NO
`Waiting for goods` status — a DO cannot exist before goods are ready; waiting lives on the Order
Route. **The register shows NO owner, NO avatar and NO action sentence** — a register finds
documents; work lives in My Work / Team Work. Rows open the DO object page; document numbers are
doors (`DO → DO`, `SO → SO`).

**Delivery — the one planning and document workspace. TWO OWNER RULINGS OF 2026-08-24, merged
here as one truth:** the UNITING ruling (it replaces the separate Delivery Work and Delivery Orders
lists while preserving the formal DO object) and the BEHAVIOUR CORRECTION
(`CARD-2026-08-21-delivery-02-work-layout` §0), which overwrites the 2026-08-21 ruling wherever
the two disagree. The
three-pane action-card screen is deleted, not deprecated beside this: the `Work list / Calendar`
switch, the KPI/count preamble, the Refresh control, the action-card wall, the permanent detail
pane and the third working column are gone, and no Delivery surface carries the generic employee
labels `Due`, `Next Action` or `Priority`. That page answered *who should be nagged today*, which
is My Work / Team Work's question; this one answers the logistics question — **everything going out
on a given day, who is carrying it, and what is still missing.**

⛔ **SUPERSEDED — *"it writes nothing"*.** The 2026-08-21 text said the workspace is read-only. The
owner overturned that on 2026-08-24 and the sentence is deleted rather than kept beside its
replacement:

> **THE DELIVERY WORKSPACE OWNS THE DELIVERY ARRANGEMENT.** Who carries a scope, the confirmed operational
> date and time, the expected arrival, the logistics note, the partner's actual reply proof and the
> Condo driver/vehicle are **Delivery's writes**, made from this workspace. **Sales Orders remains
> the owner of the commercial customer promise** — the customer, the address, the building facts and
> the customer-requested `Requested Delivery Date` — and Delivery may never write one of them.

It is an operational workspace with formal DO doors in the same listing; arrangement facts and the
issued DO remain different objects. What is unchanged is §3's ruling: **the SYSTEM issues the
Delivery Order** when the governed gate becomes true. There is no `New DO`, no `Issue`, no `Release` and no `Approve` on this page or in any
dialog it opens. `Save Delivery` records an arrangement; issuance reads it.

The arrangement is its OWN record (`ops_delivery_arrangements`, migration 0386) keyed by the scope
`(order_id, leg)` — never `orders.delivery_partner_id`, which is a Sales Order column and could
hold only one carrier for a two-leg Journey, kept no history, and had two writers.

```
one 50px Destination Header  ·  Delivery
local rail (the shared governed rail recipe, 240px) ·
                                DELIVERY SCHEDULE + REGION + LOGISTICS, page-owned FILTERING
one expandable DataGrid      ·  the Sales Orders engine, density and toolbar
```

The rail uses the ONE shared `RailGroup`/`RailItem` recipe every Register page uses (240px —
the FilterRail law). The earlier page-local 200px predates that shared recipe; a page-private
rail width would be a second rail kit, which the UI system forbids.

**THE ENTRY RULE (owner ruling 2026-08-24).** A Sales Order does not become delivery work merely by
existing. A scope enters this workspace only when it has **a delivery location/address · building
and access facts · goods that require delivering · a valid scope or Journey leg**. An order missing
its address stays **Sales-owned Work** and must not appear here as a row of `Not given` — measured
before the correction, 59 of 90 rows carried no location at all, which is two thirds of a logistics
screen that no logistics operator could act on.

**The rail.** `DELIVERY SCHEDULE` lists `No confirmed date`, then **`Overdue`** (renamed from
`Date passed`), then the actual weekday + calendar dates ascending — **never Today, never
Tomorrow** — and it shows the **near-term operating dates even when their count is zero**, because
a planner has to be able to see that a day is free. **The generated window is the next seven
OPERATING days (owner ruling 2026-09-01): logistics runs six days, so a Sunday or a Malaysian
public holiday is never offered as a plannable choice** — the same calendar
`ACTION-FLOW-STANDARD.md` Law 2A already states. A scope genuinely recorded on a Sunday or
holiday still reaches the rail through its own count: evidence is never hidden, only the empty
generated choice is. The schedule reads **`Confirmed Delivery`**,
never the customer's promised date.

**`REGION` (owner ruling 2026-09-01)** sits between the schedule and the partners and answers
*where is each scope going?* in the words the address actually carries:

- **Peninsular states are listed by their own names, never merged and never bucketed under an
  `Other`** — a state appears while it genuinely holds a scope (the same admission rule the
  LOGISTICS rail applies to a partner outside the governed roster), ordered by count.
- **`EAST MALAYSIA` is a fixed sub-heading with Sabah and Sarawak beneath it, always visible** —
  it is a DIFFERENT journey (HOUZS owns it beyond the handover), not just another state.
- **`SINGAPORE` is a fixed sub-heading with Singapore beneath it, always visible** — the two-leg
  journey's home. **Leg 1 (KL → JB) counts under Johor** — the truck the planner sees on the JB
  run — **and leg 2 under Singapore.**
- State detection reuses the ONE address classifier; a row whose address resolves to no state
  joins no region row and stays reachable through `All` — fixing its address is Sales work
  through `Open Sales Order to change`.

`LOGISTICS` lists `All`, then the governed partners
**NETS · AL · TEOW · TT · EU · SSY · HOUZS in that order and visible at zero**, then any other
partner while it is genuinely carrying a scope, then `No logistics picked` when scopes have none.
The three groups COMBINE, each group's counts are computed over the rows the others have already
narrowed, and counts are **delivery scopes or Journey legs, never whole Sales Orders.** Choices ride
the URL (`?date=` · `?region=` · `?logistics=`).

**One parent row = one Delivery scope, or one Journey leg.** A Singapore order's two legs are two
rows, each with its own Logistics Partner, day, arrangement and result: leg 1 completing means the
goods reached the named JB warehouse, which is not the event the Singapore customer is waiting for.
Singapore Journey legs are **separate assignments**. A delivered order leaves the workspace — that
is Delivery Orders and Delivery History.

**Default columns, in this order (owner ruling 2026-08-24, OVERWRITING the 2026-08-21 order):**

```
☐ · ▸ · SO / Ref · Customer · Delivery Location · Building · Requested Delivery Date ·
Confirmed Delivery · Confirmed Time · Logistics Partner · Goods · DO No · Delivery Status
```

Date and time stay **separate columns**. `SO / Ref` is the sticky identity column and stays visible
through horizontal scroll. **No Owner column, no avatar, no action sentence.** Dates print the
actual weekday + date. `Confirmed Delivery` is Delivery's own operational date — the document's when
one exists, else the arrangement, else the confirmed booking; a carrier's provisional date is never
printed as confirmed. `Phone` and `Delivery address` ship in the chooser, off by default.

**THE INTERACTION CONTRACT (owner ruling 2026-08-24).**

```
Click SO No          →  open the Sales Order
Click DO No          →  open the Delivery Order
Click ▸              →  expand and inspect this scope's goods — READ-ONLY
Double-click a row   →  open Edit Delivery          (never the Sales Order)
Select one row       →  Assign logistics + Edit Delivery
Select many rows     →  Assign logistics only
```

The 45px toolbar is **replaced in place** when rows are selected — never a second toolbar row — and
reads `1 delivery scope selected` / `3 delivery scopes selected`, `Clear`, then the actions.
`Edit Delivery` may never redirect to the Sales Order.

**THE DISCLOSURE.** The governed chevron: `▸` collapsed, rotated when expanded, **neutral grey and
never the danger ink**, in the 32px control gutter, titled `Show delivery items`, carrying a correct
`aria-expanded`. It is an ENGINE property, so every register wears it.

**`Delivery Status` is the OPERATION's progress, not the document's** (owner ruling 2026-08-24):

```
Waiting for customer date · Delivery confirmed · Waiting for warehouse ·
Ready for handover · Out for delivery · Delivered · Failed Delivery
```

**`Created` may not appear on the Delivery workspace.** It is a true fact about a piece of paper and a
useless one on a planning screen — two scopes reading `Created` can be a week of real work apart. It
stays in the Delivery Orders Register, which is where the document's own life is described. The two
vocabularies are separate and neither may borrow the other's words.

**ASSIGN LOGISTICS — Delivery's own write.** One or many selected scopes at once. Only partners
valid for the selected routes/coverage are offered; **Klang Valley defaults to NETS** per §2, as a
pre-selection and never a lock. **An existing Logistics Partner is never silently replaced:**
changing one is the governed **`Change logistics`** act and requires a reason from the governed list
plus an append-only history line, enforced by a database check constraint rather than only by a
dialog. Singapore Journey legs are assigned separately. The write lands on the arrangement, never on
the Sales Order.

**EDIT DELIVERY — the Delivery-owned full-screen 50/50 surface.** Left, the form; right, a **live
preview rendered by the actual governed Delivery Order renderer**, which reads
`Preview · No delivery order yet` before issuance and the real number after it, and re-renders as
printable fields change.

```
LEFT — read-only, from the Sales Order      LEFT — Delivery owns and edits these
  Customer · Phone                            Logistics Partner
  Delivery location                           Confirmed Delivery · Confirmed Time
  Building / floor / lift                     Expected arrival time
  Requested Delivery Date                           Logistics note · Actual reply proof
  Customer preferred time                     Driver / Vehicle — Condo only
                                              Condominium registration details — Condo only
```

Condominium registration is a Delivery-owned arrangement fact: the details the building's
management requires before the truck may enter (driver name, vehicle plate, permit/registration
reference and the registered time window, as the building demands them). It rides the same
arrangement record and prints on the document where governed; it is never a Sales fact.

A wrong Sales fact is corrected through the door **`Open Sales Order to change`**, never silently
from Delivery: the save payload has no field for one, so it cannot be written from here even by a
hand-made request. **`Save Delivery` records the arrangement and does not issue the document.**

**▸ has exactly one job:** that scope's goods and physical facts, read-only. The shared Goods
mini-table (`Category · Unit ID · Deliver To · SKU · Qty · Item`), then `Where` · `Who has it` ·
`Stock ETA`, then **`Items to collect`** and only when a Loan exists. **No editable field, no
Partner selector, no Save, no second Delivery form inside the expansion.** Stock owns Where/Who has
it/Stock ETA, Sales Orders owns the customer, address, promise and ordered goods, Warehouse owns
readiness and handover, Payment owns the release gate; the Delivery workspace creates no duplicate Sales,
Stock, Warehouse, Purchasing or Payment truth.

**Delivery History defaults:** `Delivery Date · DO No · Customer · Logistics Partner · Result ·
Failed Delivery Reason · Goods · Proof Status · Recorded By`.

**Exceptions defaults:** `Opened · Problem · DO No · Customer · Affected Goods · Goods Location ·
Work · Status` — `Work` renders the shared two-line action contract (fact, then the concrete act
with its actual weekday + date), with the resolved owner as avatar metadata; the generic labels
`Owner`, `Next Action` and `Due` may not head a Delivery column.

**Partners defaults:** `Logistics Partner · Service Area · Default Role · Contact Method · Portal
Access · Capacity Status · Active · Confirmation Performance`.

Registers have one Search, direct column filters, Columns, Export and governed saved personal
views. Selection in a truth Register scopes output only; it never bulk Issues, Delivers, Closes,
Assigns or Confirms. Exports obey data permissions.

## 9 · Delivery Order object

The object header has one back destination, persistent `DO number · customer` identity, governed
actions, More and Print. Applicable views are:

- **Delivery Order** — current customer, address, Warehouse, Partner, contact owner, arrangement,
  goods, site requirements, restrictions and current facts;
- **Delivery History** — every actual delivery event and result;
- **Warehouse** — preparation, handover and return facts owned by Warehouse;
- **Evidence** — confirmation, handover, delivery, failure, return and correction proof;
- **Exceptions** — open and historical problems with owner and next action;
- **History** — append-only audit of every object change and proxy record;
- **Related** — links to Sales Order, customer, Warehouse, stock, Finance, Service, Guarantee,
  returns/replacements and related DOs.

Delivery History is actual delivery execution. History is the complete audit trail; they are not
the same view. Cross-module links open the owner and never create a duplicate editor.

**BUILT 2026-08 (blueprint card §5; Warehouse block added 2026-08-19, handover slice 1) — the
first DO object page**, one read-only page whose blocks are, in order: `CUSTOMER · GOODS (this
trip's lines only, human words first, SKU mono second) · DELIVERY DETAILS · SOURCE SALES ORDER
door · DELIVERY STATUS · WAREHOUSE HANDOVER (the §4 facts with recorder, duty, company and
proof — the Warehouse view's first slice) · DELIVERY PHOTO · SIGNATURE / PROOF ·
LOAN COLLECTION (only when a loan exists) · HISTORY (now including each handover event)`, plus
header `Print` (reprint = same number). Everything renders facts owned by other modules; **the
page writes nothing** — the handover acts live on the Delivery page. Driver/vehicle render
governed absences until a per-trip fact exists (`partner_fleet` is keyed to the partner, not the
trip; a handover's recorded vehicle is that event's own fact). The multi-view shape above remains
the approved target this page grows into.

## 10 · Daily operator journey, Work and Quick Rail

Operations starts in Delivery and prioritises Failed Delivery action, commitment risk,
Warehouse delay, Logistics reply, missing proof, overdue return and then routine confirmation.
From issue through arrangement, Warehouse preparation, handover, delivery day, result, proof and
return, every row states one concrete next action and one owner.

Delivery stores an action's Delivery ownership rule, never a copied staff assignment or Duty
roster. Every owner avatar in Delivery, Dashboard, My Work and Team Work comes from the same Shared
Work Engine resolved owner. Delivery may not read PO / GRN rota tables or independently calculate
who is on Duty; linked Purchasing, Receiving and Warehouse action owners remain projections from
their own rule through the shared resolver.

On delivery day, Schedule/Work shows actual date/time, DO, customer, address, Partner, Warehouse,
goods, special requirements and current progress. Missing ETA creates **Obtain Delivery ETA**.
End-of-day control finds DOs without results, Delivered records without accepted proof, Failed
Delivery without next Work, goods still with Logistics, unconfirmed Warehouse returns and future
arrangements without owners.

- **My Work Quick Rail** previews the current person's owned Delivery actions and deep-links to the
  owner; it is not another work store.
- **Team Quick Rail** shows duty coverage for Operations, Warehouse, proof review, problem manager
  and NETS coordination.
- **Calendar Quick Rail** shows the person's confirmed deliveries, handover deadlines, Failed
  Delivery follow-up and return due dates using actual weekday + date.
- **Activity Quick Rail** shows append-only assignment, arrangement, handover, result, proof and
  correction events; it never completes work.

Alerts are reserved for Cannot Deliver, overdue Partner confirmation, Warehouse risk, missing
result, Failed Delivery, missing/rejected proof, overdue return or a commitment without an
arrangement. Routine ETA change is Activity unless it creates a real breach.

## 11 · Settings

Central Delivery Settings uses readable summaries first and an explicit focused Edit context. It
owns audited/versioned:

- default Logistics assignment by area/postcode and unresolved-address handling;
- **per-Partner pickup and delivery weekday calendars and surcharge areas (owner ruling
  2026-09-01)** — Partner Settings owns these facts; staff never memorise a pickup weekday.
  Current governed calendars: **TEOW** — pickup from KL Monday/Wednesday/Friday · delivery to
  Melaka Monday/Wednesday/Friday · delivery to JB Tuesday/Thursday/Saturday. **TT** — pickup
  from KL Wednesday · JB only · additional charges may apply to Pontian, Kota Tinggi, Kulai
  Tesco and Sedenak. §5.1's backward calculation reads these calendars; assigning such a
  partner raises the dated Warehouse/Purchasing Work computed from them;
- customer-contact responsibility and record-on-behalf policy;
- per-Partner Portal/WhatsApp/email/API confirmation method, deadline, proof and rejection reasons;
- Warehouse preparation, checking, handover and return requirements;
- minimum proof by result, Partner and goods type;
- Failed Delivery reason, required proof, suggested next action and default owner;
- confirmation, preparation, result, proof, problem and return due/escalation times;
- Partner Portal Warehouse/Logistics roles, data visibility, record/upload/reject/export/API access;
- DO numbering and document/print/signature rules;
- correction and approval rules for reassignment, dates, results, exceptional proof, refusal,
  cancellation after handover and quantity.

Per-DO dates/Partner/ETA, single-event handling, personal Columns and personal Saved Views are not
Settings. Historical objects retain the rule/version used when their event occurred.

Delivery Settings contains no PO Duty, GRN Duty, Warehouse Duty or Buddy-cover roster. Those facts
exist only in `Workspace → Staff & Duties`; Delivery consumes their resolved action owner through
the shared Work Engine. Delivery Settings stores only the required `Delivery Charge Approver` Duty
key for governed charge exceptions, never a person's name or local approver list.

## 12 · Reports

Central Reports owns Delivery Commitment Performance, First Delivery Success, Failed Delivery
Analysis, Logistics Partner Performance, Warehouse Performance, Delivery Proof Control, Schedule
and Capacity, Customer Contact Performance, Return-to-Warehouse Control and Exception Ageing.

Every measure declares source fact, date basis, coverage and drill-through. First-delivery success
counts only actual delivery events, not advance rescheduling/cancellation. NETS has no acceptance-
speed KPI because NETS is responsible without Accept; measure its contact/confirmation timeliness,
Cannot Deliver rate, result timeliness and proof instead. Warehouse and Logistics performance stay
separate even when both are NETS. Observed reason and reviewed Root Cause stay separate. Old events
enter historical measures only and never become current work.

## 13 · Permissions and external boundary

Permissions separate view, record, record-on-behalf, review, correct, approve, configure and export.

- Operations may arrange, proxy-record, upload replies, assign after Cannot Deliver, manage
  problems and request proof; it does not issue the DO (the SYSTEM issues it, §3) and may not
  impersonate Warehouse or silently rewrite results.
- Delivery Manager additionally approves governed reassignment, exceptional proof, corrections,
  refusal closure and rule changes.
- Governed delivery-charge exceptions route only to the resolved `Delivery Charge Approver`; the
  normal Primary, today's Cover and actual actor remain separate evidence.
- Warehouse roles see and record only preparation, handover and returns for their Warehouse.
- NETS Logistics sees only assigned deliveries and minimum customer/handling data; it may arrange,
  update ETA, record results/proof and use Cannot Deliver. It never sees money, other Partners or
  commercial terms and cannot reassign.
- Sales, Finance and Service read the facts relevant to their ownership and act only in their own
  module.
- AL, TT, Teow and other no-portal Partners are represented only through truthful Operations proxy
  records with actual reply/report evidence.

WhatsApp/email preparation records target and content but never confirms a business fact. Phone
records state that a person recorded a call; governed high-risk facts may require additional proof
or approval. Every uploaded file names the event it proves.

Future Partner APIs use authenticated Partner scope, assignment checks, idempotency, original
external reference, received time, governed state transitions, proof rules and append-only audit.
They call the same business actions and never write a derived status directly.

### WAREHOUSE SCHEDULE AND PARTNER PROJECTION — controller lock 2026-09-01

**Warehouse Schedule is shared dated goods visibility, not Work.** It may read Delivery facts but
must not become a local queue, invent an owner/action, or write an arrangement, date, handover or
proof. The stable read contract is one row per **assigned exact Unit** and Delivery scope
`(order_id, leg)`, carrying only:

- the permanent Carres Unit ID from Stock's allocation;
- the exact Delivery collection appointment as **Customer delivery pickup** on its real Warehouse
  event date (Warehouse Mon–Sat), and a separate **Customer handover** event when governed — never
  the Sales promise as a substitute;
- **Operations ready by**, derived one Office Mon–Fri working day before pickup; a Saturday pickup
  remains Saturday while readiness normally reads Friday;
- actual collection and actual customer arrival from their append-only event timestamps — never
  the time a user later entered the record;
- the assigned Logistics Partner, Delivery Order number and source Sales Order;
- admitted handover/delivery evidence and doors to the exact Delivery scope, DO and source order.

The read feed is `/api/operation/delivery-arrangements/warehouse-schedule`. The current whole-order
implementation uses Delivery's confirmed appointment, the formal DO, Stock's exact Unit allocation,
Warehouse location and append-only handover/proof facts. It deliberately omits Journey legs because
the current allocation read does not bind one exact Unit to one split-trip DO. Absence stays absence:
a consumer prints **Not recorded** or omits the row; it may not copy a PO ETA or attach an order-level
Unit to an arbitrary split DO. That gap is completed only by extending Delivery's one arrangement/DO
contract and Stock's one Unit allocation contract — never by a Warehouse writer.

The same feed admits a Warehouse login only when its token is bound to a Warehouse, then keeps only
exact Units whose Stock location is that Warehouse. The external **Handover** projection therefore
shows only that Warehouse's assigned **Customer delivery pickup** rows: Unit, From Location, customer
destination within permission, Logistics Partner, appointment/window, driver/vehicle, DO, collection
fact and whether admitted evidence exists. It carries no price, payment, commercial term or internal
note. A Transfer collection may join the same Warehouse projection only from Stock's exact Transfer
object; Delivery does not create a second transfer record.

Warehouse may record only the physical handover through the one governed handover writer. This PR's
feed is read-only; an external Handover control must extend that same writer's Warehouse assignment
gate, never add a route that writes the fact itself. Warehouse cannot edit the DO, customer promise,
arrangement, price, payment or delivery proof. **DO No** means an outbound customer Delivery Order.
Inbound Warehouse receiving stays under its PO/CO source and the document label **Supplier DO No.**;
those facts never enter this outbound feed.

The Logistics Partner boundary is the same projection narrowed by authenticated assignment. A
Partner sees only its assigned delivery/transfer rows and only the customer, handling and evidence
fields admitted for that act. Unrelated customers, Stock, money, commercial terms and internal
notes never cross that boundary. Signed evidence upload/view doors recheck the exact assigned
scope; knowing a storage path is not permission.

Visible Stock may say **On the way** only after the pickup carries confirmed collection evidence and
before confirmed arrival. A future booked Delivery, assigned Partner or confirmed customer date does
not make goods On the way. Delivery exposes the append-only collection/arrival facts; Stock owns the
resulting custody and visibility word and Delivery never writes or stores it.

## 14 · Current versus intentional future

**CURRENT:** NETS is Klang Valley default/main; NETS contacts the customer; Operations may record
on its behalf; other Partners are assigned manually only when needed; partner+date grouping is a
derived schedule.

**NOT CURRENT OPERATING TRUTH:** customer self-scheduling, Carres central customer scheduling,
automatic Partner recommendation/allocation, routine multi-Partner Klang Valley operation, route
optimisation, formal lorry/Dispatch Run, loading manifest, ordered stops or per-trip cost.

The model is Partner-neutral, so Carres can later assign any Logistics Partner and enable customer
confirmation, Portal or API without replacing the DO/history/proof model. A first-class Dispatch
Run/Trip is admitted only when a real vehicle-level fact exists: own-fleet dispatch, ordered stops,
signed loading manifest or per-trip cost.

## 15 · UI dictionary and whole-domain closure

| Do not use in employee Delivery UI | Governed wording |
|---|---|
| Release | Issue Delivery Order |
| Attempt / Create Delivery Visit | Record Delivery Result / Delivery History |
| Not Delivered | Failed Delivery |
| Contact Customer / Follow Up | the exact confirmation or information purpose |
| Carrier | Logistics Partner |
| Accept for NETS default assignment | Assigned to NETS |
| Reject button | Cannot Deliver |
| POD | Delivery Proof or the concrete proof name |
| Today / Tomorrow | actual weekday + date |

The formal audit object remains Delivery Visit; employee navigation remains Delivery History.
Delivered, Delivered — Proof Required, Delivered — Complete, Partially Delivered and Failed
Delivery have the meanings governed above. Rescheduled and Delivery Cancelled are arrangement
states. `Recorded on behalf of` always names the true Partner and Carres recorder.

The Blueprint covers DO splits, multiple Warehouses/Partners/dates, NETS default/rejection,
no-portal confirmation, customer arrangement, partner pickup/delivery calendars and the one
backward date calculation, the two-leg Singapore Journey and exact-Unit reconciliation,
Warehouse preparation and handover, Logistics receipt, actual delivery and partial/failure
results, proof review, goods custody and return, correction/audit, Work and the Shared Duty
Resolver, Schedule, Quick Rail, Settings, Reports, permissions, Portal/API and every
cross-module owner. Automatic allocation, vehicle routing and customer self-scheduling are
explicitly excluded from current truth rather than deferred blind spots.

**PLAN MISSION COMPLETE — re-closed 2026-09-01** after the Delivery completion audit: the
2026-09-01 owner rulings (one physical event chain §1.1/§4, Shared Duty Resolver §10/§11,
backward planning §5.1, partner calendars §11, absolute money gate §3) are persisted and the
contradicting older text in this MASTER, `../orders/MASTER.md`, `../payment/MASTER.md`,
`../ERP-ARCHITECTURE.md`, `../COPY-STANDARD.md`, `../ACTION-FLOW-STANDARD.md`, `../ui/MASTER.md`
and `../workspace/MASTER.md` is overwritten. **The East Malaysia journey boundary was ruled
the same day (owner approval 2026-09-01): an East Malaysia (Sabah / Sarawak) order travels
through HOUZS — Carres hands the goods to HOUZS with exact-Unit handover facts and proof, and
HOUZS owns the onward journey and the customer contact, the same shape as the Singapore
partner-warehouse boundary. Carres' governed facts end at the HOUZS handover and the arrival
proof HOUZS returns.** Falsifier: an actual East Malaysia delivery carried by another partner,
or Carres contacting the East Malaysia customer directly, overturns this.
No unresolved Owner Decision remains.
This MASTER persists the approved operating model only. It does not authorise Cards,
implementation sequencing, migration or build work.

## 16 · Production closure — unified Delivery page

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

---

## 17 · Monitor — complete surface proposal for owner review, 2026-09-03

**PROPOSAL — OWNER APPROVAL REQUIRED. NOT LAW. NOT BUILT.**

This section is a review proposal in an isolated, documentation-only checkout. It does not
overrule §§1–16 or claim approval, implementation, visual testing or production deployment.
The earlier chat sketches of a second full register and a wall of date cards are withdrawn,
not accumulated as alternative designs. No Monitor proposal has been approved in this chat.
After owner approval, replace conflicting current-law paragraphs and the affected dictionary
entries; do not leave this proposal beside a competing approved rule.

本节只完整设计 **Monitor 这一主要 surface**，包括它的日期概览、某日明细、筛选结果、
货品展开和窄屏状态。Edit Delivery 与 DO object 在这里定义准确入口和返回行为；它们自己的
完整页面 Blueprint 仍需分别展示。本节不是整个 Delivery UI Blueprint 的完成声明。

### 17.1 · Decision, scope and evidence

**RECOMMENDATION — Monitor 是日期概览加按需打开的交付明细；Delivery Orders 是永久正式文件 register。**
Monitor 不是另一张永久 DO register，也不是员工任务卡墙。默认主体显示交付安排与实际结果的日期分布。
需要比较详细字段、查看 Units 或批量安排时，在同一个 Monitor 内打开某日／某个筛选范围的明细。
没有 Calendar/List 两个顶层 Tab，没有新增第三个 Delivery 页面，没有常驻右侧详情或第二个表单。

这个组合保留现有表格在精确比较、展开和批量操作上的能力，但不再让它充当 Monitor 的全部入口。
不能只为两页外观不同而换布局：日期概览必须帮助员工少查日期、少漏交付；明细必须保留完成工作的能力。

**FACT — baseline read at `origin/main` = `0649b7c32efe68b2aa2ce995ac95175eac93253e`.**
ERP public deployment marker returned that same SHA; this is not a fresh authenticated production walk.
The user-specified new DO register was found in local code snapshot
`700504ea1f9c9adea658baa5d1e46b31bfdf91ca`, not in that main revision. A separate read/test checkout
passed 158 related web tests and 13 API tests, web/API type checks and the design-standard check.
No build ran. Those checks do not prove the new Monitor or complete arbitrary split-Unit handling.

| Classification | Relevant finding and exact evidence |
|---|---|
| RESOLVED FROM AUTHORITY | This chat's starter locks `Delivery > Monitor`, `Delivery > Delivery Orders`, the DO register's ten-column order, sticky DO No, 240px rail, below-1280 overlay and automatic DO issue. Delivery MASTER §§2–7, 11–15 and Architecture §§3.5.1/3.6 own the business boundaries. |
| BUILT / VERIFIED | Existing Monitor predecessor: `OperationDelivery.tsx:170–294` goods inspection, `:387–425` combined filtering, `:885–940` DataGrid/selection; `delivery-work.ts` scope/date/region projections; `delivery-arrangements.ts` arrangement and reply doors. These are code findings, not a new visual acceptance claim. |
| APPROVED TARGET / NOT BUILT | Exact Unit reconciliation and partial handover, complete proof/exception follow-through, shared Staff & Duties resolution, calendar Settings editor. Business approval is not UI or production completion. |
| REAL GAP / CONTRADICTION | MASTER §8 and COPY-STANDARD's 2026-08-24 module wording still demand one direct Delivery destination. Current scope projection excludes delivered orders wholesale, copies whole-SO goods into leg rows, and does not provide complete split-to-Unit lineage. A calendar cannot repair these facts by changing appearance. |
| REAL GAP / CONTRADICTION | The requested `docs/UI-KIT.md` is absent from main. Current Constitution names 01/02/03 and UI MASTER. No alternative token system is adopted here; resolve the obsolete reference before build handoff. |

**Primary reference lessons, not imported business law:**

| CURRENT CARRES → reference lesson | KEEP / ADAPT / IMPROVE / REJECT | Recommended flow → operator journey → placement → cross-module connection |
|---|---|---|
| Existing day/region/partner filters → Microsoft schedule board separates dated bookings and unscheduled requirements | ADAPT | Confirmed delivery dates form the overview; undated scopes retain an explicit entry. Employee sees dates, then opens a scope. Monitor reads Delivery arrangements; it does not schedule staff shifts. |
| Existing expandable list → 2990 `DeliveryPlanning.tsx`, `MfgDeliveryOrdersList.tsx` separate operational planning and formal records | KEEP + RELOCATE | Keep scoped selection, goods inspection and document links in focused Monitor detail; keep the permanent DO register separate. Sales and Stock remain source owners. |
| Current date and document projections can diverge → SAP Monitor Outbound Deliveries tracks fulfillment, events and item/shipment relationships | IMPROVE | Each visible entry identifies a real scope/leg/visit and links to its own evidence; inspection follows the same Units. Actual handover/result drives progress, not the calendar. |
| Reply upload exists → reference systems distinguish demand, booking and execution | KEEP | Prepare request → receive real reply → Save Delivery → arrangement changes. Copy/open/send alone changes no confirmation. NETS portal and Operations proxy use the same fact. |
| Current readiness is partly order-scoped → mature warehouse execution distinguishes preparation, handover and receipt | IMPROVE | Monitor shows readiness and discrepancies; Warehouse and Logistics record their separate exact-Unit facts. Delivery does not manufacture a stock count. |
| Existing Work deep-links → mature exception drill-down | ADAPT | An unresolved reason/proof/loan remains reachable across dates, with the shared Work action leading to its owning page. No local assignment list or manual completion checkbox. |
| International boards also offer staff resources, GPS, drag/drop and optimization | REJECT in this scope | Carres buys partner services and records agreed dates. No invented live location, driver availability, route optimizer, manual DO creation, or drag-to-confirm. |

References inspected: [Microsoft schedule board](https://learn.microsoft.com/en-us/dynamics365/field-service/work-with-schedule-board),
[SAP Monitor Outbound Deliveries](https://help.sap.com/docs/business-network-global-track-and-trace/shipping-specialist-test-tenants/about-monitor-outbound-deliveries-app),
[SAP filter documentation](https://help.sap.com/docs/SAP_LOGISTICS_BUSINESS_NETWORK_GLOBAL_TRACK_AND_TRACE_OPTION_V2/c020ec3d720342e59c76abe196fefa55/f875a59a70091014902e5e61bf035c23.html?locale=en-US&state=PRODUCTION&version=Cloud),
and actual source under `/Users/chaichiewlim/Desktop/2990s/apps/backend/src/pages/`.
Microsoft supplies the overview/unscheduled principle, not a literal Carres screen. SAP supplies
the evidence/relationship principle, not authority for a Carres calendar layout.

**INFERENCE / trade-off:** overview plus focused detail uses one additional navigation step for
dense comparison, but direct `Edit Delivery` and `Show delivery items` shortcuts avoid a forced
detour for one scope. A dates-only board would lose the current batch/Unit tools; a register-only
Monitor would not add a useful overview beside the permanent DO register.

**Falsifier:** reject or simplify the calendar composition if a representative operator walk cannot
find an undated scope, an overdue delivery, an unresolved result and a named date's partner/goods
without hunting; if the same work consistently takes longer than the current filtered list; or if
scope/date/Unit identity cannot be reconciled between overview, detail and owning records.
Synthetic sketches and imported test-data volume are not evidence of real operator speed.

### 17.2 · One page, explicit internal states

```text
Portal sidebar                       Monitor (one destination)
Delivery                             ├─ date overview (default)
├─ Monitor                           ├─ a named day's detail
└─ Delivery Orders                   ├─ No confirmed date / Overdue results
                                     └─ specific unfinished-work results

Monitor scope ── Edit Delivery ── Save / return ── same Monitor context
             ├─ SO number / Order Route ── owning Sales Order
             └─ DO number ── exact formal Delivery Order object
```

这些不是 Tab。日期标题、筛选项和记录上的明确按钮改变当前 Monitor 内容；浏览器 Back 恢复
前一个范围、滚动位置、展开项和焦点。没有双重 breadcrumb、没有点击父菜单打开的第三个页面。
进入 Edit 或对象页后，返回保持原来日期、地区、物流和搜索；已经不符合筛选的记录正常离开结果，
页面告知保存成功，不把它偷偷塞回列表。

### 17.3 · Desktop date overview — exact anatomy

```text
 Portal sidebar 232       Page header, 50
┌───────────────────┬────────────────────────────────────────────────────────────┐
│ ▾ Delivery        │ Monitor                          Jump to…       [bell ? gear]│
│   ▌ Monitor       ├────────────────────────────────────────────────────────────┤
│   Delivery Orders │ [Search delivery scopes…]  [‹] [Fri, 4 Sep — Fri, 11 Sep] [›] │ 45
│                   ├───────────────────┬────────────────────────────────────────┤
│                   │ Local rail 240    │ Fri, 4 Sep · 3       Sat, 5 Sep · 1     │
│                   │                   │ ┌─────────────────┐ ┌─────────────────┐│
│                   │ DELIVERY SCHEDULE │ │ SO-1321          │ │ SO-1323         ││
│                   │ Calendar          │ │ TAN MEI          │ │ LEE WEN         ││
│                   │ No confirmed date │ │ Ampang · Condo   │ │ JB → Singapore  ││
│                   │ Overdue           │ │ NETS             │ │ EU              ││
│                   │ Fri, 4 Sep        │ │ 09:00–12:00      │ │ 14:00–17:00     ││
│                   │ Sat, 5 Sep        │ │ ETA 10:30        │ │ No ETA          ││
│                   │ Mon, 7 Sep        │ │ 3 items          │ │ 2 items         ││
│                   │ …                 │ │ Ready for        │ │ Delivery        ││
│                   │                   │ │ handover         │ │ confirmed       ││
│                   │ DELIVERY WORK *   │ │ DO-040926-0001   │ │ No delivery     ││
│                   │ Cannot Deliver    │ │ Edit Delivery    │ │ order yet       ││
│                   │ Failed Delivery   │ │ Show delivery    │ │ Edit Delivery   ││
│                   │ Delivery Proof    │ │ items            │ │ Show delivery   ││
│                   │ Items to collect  │ └─────────────────┘ │ items           ││
│                   │ Needs checking    │ ┌─────────────────┐ └─────────────────┘│
│                   │                   │ │ SO-1322 …       │                      │
│                   │ REGION            │ └─────────────────┘                      │
│                   │ …                 │ ┌─────────────────┐                      │
│                   │ LOGISTICS         │ │ SO-1323 · Leg 1 │                      │
│                   │ …                 │ └─────────────────┘                      │
│                   │                   │        grid-owned horizontal scroll →   │
│                   ├───────────────────┴────────────────────────────────────────┤
│                   │ 4 deliveries · Fri, 4 Sep — Fri, 11 Sep                    │ 32
└───────────────────┴────────────────────────────────────────────────────────────┘
```

Illustrative records/counts only, not production data. Columns after Saturday are omitted from the
drawing, not from navigation. `*` marks proposed placement/copy, detailed in §17.11.
The calendar composition is new and needs shared-kit composition approval as part of this proposal;
there is no claim that a proven Calendar component already exists. Reuse shared shell, controls,
cards, status, date formatting and inspection components; do not create a parallel token kit.

- **Default range:** the next seven Delivery operating dates, starting at the current business
  date if it is open. Date range navigation moves the window, not a booking. A date picker reaches
  any required date. Sunday/public-holiday exclusions come from the shared calendar, not browser
  weekday guesses; a real event on a closed day remains accessible on its actual date.
- **Date placement, not date rewriting:** a not-yet-resulted delivery sits on Confirmed Delivery.
  Once an actual visit is recorded with its business occurrence date, that same delivery entry
  sits on the actual date. If different, its card also prints the original Confirmed Delivery.
  The two facts remain intact; neither upload time nor record-entry time is the occurrence date.
  A failed visit stays on its actual date; a rebooked delivery is a different entry. Closed dates
  with real visits are included as evidence columns inside a viewed range, never offered as new
  allowed booking days. If an actual date has not been recorded, keep the known confirmed date
  and disclose the missing fact; do not infer it from a timestamp with a different meaning.
- **Not an hourly Gantt:** Confirmed Time may be a named/free-text agreed window. Cards sort by a
  trustworthy normalized start only when available; otherwise retain a stable order. Do not draw
  fake start/duration blocks from a phrase or turn an ETA into booked time.
- **Density:** date columns have a proposed minimum width of 300px; they do not shrink seven
  detailed cards into unreadable strips. The work area owns horizontal scrolling, sticky date
  headers and a single vertical scroll. No independently scrolling card columns. At small content
  width the view becomes the focused daily layout in §17.9, not a miniature seven-column board.
- **Card content, in order:** source SO/ref; customer; this scope's destination/building or leg
  route; actual Logistics Partner; Confirmed Time; ETA; scoped goods summary; operational status;
  actual DO link/absence; `Show delivery items`, plus `Edit Delivery` only for an authorized,
  currently editable arrangement. Historical/resulted entries never inherit an Edit control
  that would modify a replacement arrangement.
  The date is already in the column heading. Requested Delivery Date appears on undated entries
  and when different from the operational date; full facts remain in focused detail/Edit.
- **ETA scope:** read only the logistics estimate belonging to this exact arrangement/leg and
  agreed date. A current whole-order estimate is not an old DO's estimate; an uncertain split
  estimate is No ETA. A later ETA never rewrites the confirmed date/window. Historical result
  entries do not borrow an estimate from a replacement arrangement.
- **No false summaries:** goods summary counts this scope, excludes money/service-only lines and
  does not label an entire SO as one trip. A missing scope mapping produces a named unavailable
  fact, never a guessed quantity. A grouped count is not a vehicle-capacity estimate.
- **Status is text plus the governed tone:** no partner rainbow, status-by-color-only, KPI cards,
  manual status dropdown, owner/avatar column or generic next-action sentence.
- **Shortcuts:** date heading opens that day's detail; `Show delivery items` opens that scope's
  exact detail context with the goods row expanded and focused. `Edit Delivery` opens the exact
  arrangement directly. A DO/SO link never behaves like a card-selection click.

### 17.4 · Focused day / filter detail, selection and goods inspection

This is the same Monitor, with the calendar work area replaced by the relevant detail list.
The Portal sidebar, page header and local rail remain. `Calendar` returns to the overview and
restores its date position; it is a return control, not a competing top-level Tab.

```text
Monitor
────────────────────────────────────────────────────────────────────────────────
[Calendar]  Fri, 4 Sep       [Search delivery scopes…]        [Export] [Columns]
────────────────────────────────────────────────────────────────────────────────
☐ ▸ SO / Ref │ Customer │ Delivery Location │ Building │ Requested Delivery Date
             │ Confirmed Delivery │ Confirmed Time │ Logistics Partner │ Goods
             │ ETA │ DO No │ Delivery Status                    (horizontal →)
────────────────────────────────────────────────────────────────────────────────
☐ ▾ SO-1321  │ TAN MEI …                                      Ready for handover
     Category │ Unit ID   │ Deliver To    │ SKU       │ Qty │ Item
     Mattress │ U1-000-001│ Carres Klang  │ H1401F-K  │ 1   │ King mattress
     Bedframe │ U1-000-002│ Carres Klang  │ BF-EXAMPLE│ 1   │ King bedframe
     Sofa     │ U1-000-003│ Carres Klang  │ SF-EXAMPLE│ 1   │ Three-seat sofa

     Unit ID   │ Source Document │ Where        │ Who has it
     U1-000-001│ PO-EXAMPLE      │ Carres Klang │ Carres Warehouse
     U1-000-002│ PO-EXAMPLE      │ Carres Klang │ Carres Warehouse
     U1-000-003│ PO-EXAMPLE      │ Carres Klang │ Carres Warehouse

     Required 3 · Handed over 0 · Not handed over 3
     Expected arrival: [supplier fact only when goods remain short]
     Items to collect: [appears only for this scope's linked collection]
────────────────────────────────────────────────────────────────────────────────
3 deliveries
```

示例 Unit/PO/SKU 用于说明关联，不是实际记录或新的编号规则。最终格式继续使用已有 formatter。

- **Default field order:** control gutter → SO / Ref → Customer → Delivery Location → Building →
  Requested Delivery Date → Confirmed Delivery → Confirmed Time → Logistics Partner → Goods →
  ETA → DO No → Delivery Status. Existing optional Phone/Delivery address remain chooser-only.
  ETA placement on Monitor is a proposal; this never modifies the locked DO register columns.
- **Identity and powers:** sticky control gutter + SO / Ref; current shared DataGrid density,
  resize, permitted column arrangement, horizontal scrolling and browser layout preferences.
  Defaults must be readable without manual repair. Return controls cannot obscure the identity.
- **Inspect has one job:** the six-column Goods mini-table, physical facts tied to the exact Unit
  and Source Document, then conditional collection facts. No partner picker, Save or editable
  stock fields. Different holders must remain associated with their own Unit IDs; two unrelated
  lists of holder names and locations are not an acceptable substitute.
- **Keyboard:** Enter/Space on the disclosure opens it; up/down moves through inspectable rows;
  Escape closes the inspection and returns focus. Double-click Edit may remain a shortcut but
  is never the only editing route. SO number and Order Route go to the owning SO.
- **No selection:** normal toolbar. **One selection:** `Clear`, the scoped count,
  `Assign logistics`, `Edit Delivery`, shared selection export. **Many:** `Assign logistics`
  and read-only selection export only. Replace the 45px toolbar in place, not a second band.
  Historical/resulted/cancelled entries may be included in read-only export selection, but must
  never become eligible for Assign/Edit merely because they are selected. Mixed eligibility
  suppresses the write action and explains the exact ineligible records. A failed old delivery
  does not edit the replacement arrangement under the old identity.
- **Bulk limits:** selected scopes only; no mass date/ETA/result/proof/status update. Partner
  choices must cover the intersection of selected destinations. A replacement requires the
  governed reason and history. The existing all-or-nothing business contract remains: a refused
  batch must not leave some scopes reassigned. After an uncertain response, reconcile the actual
  outcome rather than retrying blindly or claiming success. A filter/range
  change clears selection and makes the reset visible; hidden selections are never acted upon.
- **External communication is not a bulk side effect:** assigning a carrier neither sends a
  message nor proves agreement. Save/assignment refresh the same projections and preserve context.

**Work-filter detail is not another assignment register.** After choosing Delivery Proof, Items
to collect, Needs checking, Cannot Deliver or Failed Delivery, the main area uses the shared
compact Work-row presentation for that particular obligation. Identity/fact is first; the
resolved owner is structured metadata; the exact shared action is the single direct control.
This is a filtered projection of Work, not locally stored work. It is the intentional exception
to the fact-only overview/day-list display: those ordinary calendar/register entries have no
owner/action column. Multiple obligations on one delivery do not acquire multiple fake deliveries.

```text
Monitor
[Calendar]  Delivery Proof · All dates            [Search delivery scopes…]
────────────────────────────────────────────────────────────────────────────
DO-010926-0007 · WONG MEI · Tue, 1 Sep
Delivered · No delivery photo yet
[resolved staff avatar]                 [Upload delivery photo]
────────────────────────────────────────────────────────────────────────────
```

The button opens the same exact DO/photo action as My Work, with no intermediate search and no
second upload form on Monitor. Partner refusal opens the exact arrangement's governed response;
failure opens its remaining Delivery act; collection opens its linked collection act; discrepancy
opens the exact reconciliation work. If no duty is configured, show the shared resolver's missing-
duty state and its authorized Staff & Duties route, not a guessed salesperson or page-local picker.

### 17.5 · Rail, count meaning, search and zero states

The rail is exactly 240px, including padding; it is not the 232px Portal sidebar. Group order is
`DELIVERY SCHEDULE → DELIVERY WORK → REGION → LOGISTICS`. The new work-filter group and its
placement are a proposal; the relative Date/Region/Logistics order is retained.

| Group | Entries / scope |
|---|---|
| DELIVERY SCHEDULE | `Calendar` returns to the current overview range; `No confirmed date`; `Overdue`; next seven operating dates including zero; selected/outside-window dates remain reachable through the date picker. |
| DELIVERY WORK | `Cannot Deliver` means an unresolved partner refusal before a run; `Failed Delivery` means an actual failed result with remaining Delivery work; `Delivery Proof` means a due/open proof obligation, not every future DO without a photo; `Items to collect` means an open linked Loan collection; `Needs checking` means unresolved exact-Unit handover/receipt discrepancy. |
| REGION | Actual Peninsular states; Sabah/Sarawak always under EAST MALAYSIA, Singapore under SINGAPORE; Labuan when applicable. Unknown classification remains reachable without inventing an Other region. Leg 1 KL→JB is Johor, leg 2 is Singapore. |
| LOGISTICS | All; NETS, AL, TEOW, TT, EU, SSY, HOUZS fixed and visible at zero; other actual partners; No logistics picked when applicable or selected. |

**Selection model:** one schedule/work mode at a time, not five contradictory simultaneous date
filters. Region and Logistics selections combine with it and with search; alternatives within
one of those groups are OR, groups combine with AND. Mode and date range are explicit in the
work-area heading. Picking a work filter changes to its all-date detail results, retaining region,
partner and search; it does not silently retain last week's date window. Picking a day returns
to that day's mode. This is one content navigation model, not hidden Tabs.

**Entry identity:** an entry is one planned or actually performed delivery within its exact scope
and leg, linked to its source arrangement/DO/visit. Issuing a DO does not create a second calendar
entry for the same delivery. Rebooking after failure creates a new delivery entry; the previous
visit is history. The view must not use SO number alone as identity or create its own trip store.
Calendar/day result totals therefore use proposed `{n} deliveries`; active arrangement selection
retains the governed `{n} delivery scopes selected`. Counts are not customer-order or Unit totals.

**Counts:** date/work entry counts are distinct matching delivery identities after search,
region and partner, independent of the currently selected date/work entry so other outstanding
work remains visible. Region counts honor active mode/search/partner; Logistics counts honor
active mode/search/region. No group sums overlapping work categories into a fabricated total.
A scope may need both proof and collection; it counts once in each relevant filter and once in
the resulting union if an aggregate is ever shown. A two-leg journey counts two leg entries,
not two customer orders and not twice the physical stock.

The rail work counts cover unresolved work across dates; the calendar footer covers only entries
in its displayed range. Both name their scope. Do not display a grand total above the calendar
that mixes undated, historical, active and completed documents.

Search covers the current mode's SO/ref, customer, actual DO, locality, partner and scoped goods.
It does not cross authorization or silently discard the selected range. A no-match state exposes
the active range/filters, clear controls and the separate Delivery Orders destination for a
historical formal-document search. Filter choices and selected-zero entries remain available.

**Zero is not availability:** an empty date says no matching deliveries; it does not promise the
partner has capacity. A zero partner row remains selectable. A zero work filter means no such
matching open obligations, never missing data or a reason to remove the entry.

### 17.6 · Which facts appear where — including after delivery

| Case | Monitor placement and behavior | Fact/owner boundary |
|---|---|---|
| Complete Sales delivery facts but no DO/date/money clearance | No confirmed date, or the confirmed day if one exists; arranging logistics proceeds independently of the issue gate | Sales owns customer/address/access/goods/requested date; money remains Payment; no DO button |
| Missing Sales address/access or invalid goods scope | Does not enter an actionable Delivery scope; correction stays on Sales Work | Do not pad Monitor with guessed destinations; a formerly valid scope that becomes invalid must not vanish silently from its linked exception/history |
| Confirmed day in current range | One entry for the current arrangement/leg; show accurate readiness even before a DO exists | Document issue remains the shared automatic gate |
| Actual handover/receipt | Same entry's progress updates; only exact moved Units change holder | Warehouse outbound and Logistics receipt remain separate records |
| Date passed, no physical result | Overdue across all dates, retain the missed date | Do not redate automatically or treat a passed date as an actual visit |
| Delivered within viewed date range | Retain the factual Delivered entry for that day's review; it leaves the rolling default range as dates move | This proposal deliberately avoids making the day's successful deliveries disappear immediately; it is not a permanent document register |
| Delivered but proof still owed | Delivered remains true; Delivery Proof filter stays populated across dates | Do not rename it Failed Delivery or close Work merely because goods arrived |
| Loan still with customer | Items to collect remains visible independent of the sale's completion | Collection has its own obligation; Warehouse inspection gates future availability |
| Failed actual run, not rebooked | Failed Delivery filter; result/reason stay on the failed visit/DO | A partner refusal before a run is not this case |
| Rebooked after failure | New arrangement/new DO when gates permit; old visit remains on its real date and in formal history | Never repurpose the failed DO number or count old and new plans as two physical Units |
| Order cancelled / system-rescheduled document | Remove the cancelled plan from active calendar execution; exact old document/reason remains reachable through SO lineage and Delivery Orders | Cancellation is not an actual failed run or an invented eighth operational status; staff cannot manually void a DO |
| Partially handed over/delivered | Show scoped progress plus exact unmatched Units; outstanding part stays open | No whole-order successful label, no count-only forced reconciliation |
| Unit scope or source fact cannot load | Named data error on that part, inspection/result unavailable until reliable | Never substitute the whole SO or turn a load failure into Qty 0 |

**Important implementation gap:** the current `isOpenDeliveryScope` excludes every delivered
order, and the current expansion starts from all `row.o.order_lines`. Those reads cannot be
treated as ready for the above lifecycle merely because the existing tests pass. Correct source
projection is a dependency of the target, not a new operating question for the owner.

### 17.7 · A new employee's complete daily journey

1. **Open Monitor.** The actual date range and global filter choices are visible. Cross-date
   failure/proof/collection/refusal/discrepancy counts remain accessible in the rail.
2. **Arrange an undated NETS delivery.** No confirmed date → relevant scope → Edit Delivery.
   The NETS default follows configured coverage. NETS records the actual customer agreement, or
   Operations records it on behalf of NETS with actor/source/evidence. Save returns to Monitor;
   the entry moves to its agreed day and the rail recounts. There is no Accept gate.
3. **Arrange non-portal logistics.** Edit Delivery shows the source facts and prepared request.
   Copy/open WhatsApp/email records preparation only. A real reply/evidence is recorded before
   confirmation; rejection leads to governed Change logistics/replanning, not a failed visit.
   Monitor itself does not add another composer or send without an explicit operator act.
4. **Check a confirmed date.** Open the day → compare destination/time/logistics → expand goods.
   The same Unit IDs, source documents, holders and shared readiness tally explain what is
   missing. Warehouse/Purchasing Work opens at its owner; Delivery does not edit their facts.
5. **Record execution.** Exact DO opens the owning object and authorized result/handover doors.
   Work deep-links land on that same governed act. Delivered/partial/failed records update the
   Monitor projection. No activity copy, date passage or uploaded unrelated photo marks success.
6. **Close the operational day.** Review that date including actual successes, then the cross-date
   unfinished filters. Every remaining item has its source, concrete shared Work action and
   resolved duty owner. There is no Mark done and no locally assigned staff list.

### 17.8 · Partner, journey and module seams

| Capability | What Monitor exposes; exact next destination | What it never owns |
|---|---|---|
| NETS / proxy | Assignment, agreed date/window, ETA, actual reply; Edit Delivery for proxy record; distinct recorder and reporting partner | No Accept gate, no owner inferred from the proxy recorder |
| TEOW / TT calendars | Read-only calculated pickup/arrival/Warehouse-ready chain in focused scope facts; Edit Delivery uses central rules | No guessed weekdays, stock-ready-before-planning rule, or separate backward calculation |
| KL→JB→Singapore | Separate leg entries, each destination, partner, date/time and result; own source/Unit mapping; related leg link via SO Order Route | Leg 1 arrival never claims customer receipt; no reuse of a whole-order DO on both legs without a real link |
| HOUZS East Malaysia | Carres-to-HOUZS handover and returned onward-arrival evidence, linked to the same scope | No fabricated last-mile ETA, GPS, route or HOUZS fleet; no external cutover |
| Condo | Building/access read-only from Sales; driver/IC/phone/vehicle and registration facts in Delivery's governed Edit context | Monitor does not invent driver data or let a logistics actor alter the Sales address |
| Outbound / partial / discrepancy | Required, Handed over, Not handed over; actual Logistics receipt; unmatched Unit links; Needs checking filter | No copying aggregate numbers into another record or editing one party's count to agree |
| Failure / proof | Actual reason, original date and specific remaining obligation; exact result/evidence object and shared Work action | No overwrite of failed history; no claim that preparing a message supplies proof |
| Loan | Open collection source, item/Unit and return destination; collection result remains separate from goods delivery | No free-to-sell return before Warehouse inspection; no automatic loan closure |
| Settings / Reports | Global gear reaches central Delivery settings; reports read the same date/result/scope facts | No extra sidebar pages, local partner calendar editor, or KPI dashboard on Monitor |
| Work / duty / Quick Rail | People → Staff & Duties → shared resolver → Work action/deep-link; Quick Rail previews those same dates/actions | No local roster, `assigned_to`, page-specific owner arithmetic, or duplicate booking calendar store |

### 17.9 · Responsive behavior, keyboard and accessibility

**Desktop:** Portal sidebar follows its shared 232/60px behavior. Local filter rail is in-flow
240px at viewport ≥1280px. The calendar owns overflow and the focused list owns its grid
overflow; document body must not grow sideways. Date columns remain at least 300px. Depending
on available content width, users see as many full columns as fit and can reach the rest by
horizontal scrolling or direct date choice. These are layout budgets, not measured browser proof.

**Below 1280px:** local rail starts closed regardless of a wider-screen open preference; Show
filters opens the same 240px rail as an overlay, with backdrop, Escape, focus containment and
focus return. Active filters remain applied and visibly indicated. Resizing must never leave a
hidden interactive panel focused or accidentally erase the filter choices.

**Content width below 640px:** the calendar becomes a single-date agenda, not a squeezed week.
Actual date picker/previous/next remain; undated and unfinished modes use the same stacked scope
layout. The data, source links and permitted actions are unchanged. The focused list's dense
columns become a readable identity/facts summary; no required information is discarded because
an optional column could not fit. Unit inspection may scroll horizontally inside its own area.

```text
Monitor                       [global controls]
[Show filters]    [Search]
[‹]              Fri, 4 Sep             [›]
────────────────────────────────────────────
SO-1321 · TAN MEI
Ampang · Condo · NETS
Confirmed Time 09:00–12:00
ETA 10:30 · 3 items
Ready for handover
DO-040926-0001
[Edit Delivery]  [Show delivery items]
────────────────────────────────────────────
SO-1322 · LIM …
```

Compact toolbar controls remain governed; no clipped 45px row. In a narrow selection toolbar,
the one-scope Edit action remains direct and secondary assignment/export use the shared action
overflow; with multiple scopes Assign logistics remains direct. Every icon-only control has a
governed accessible name. Do not add a permanent second toolbar or make horizontal scrolling the
only way to discover the primary action.

Keyboard order: toolbar → local filter choices → date heading → each scope's source links and
actions → next date. No nested clickable card with conflicting links. Controls work without
double-click, hover, drag or color recognition. Date headings announce full actual dates; scope
controls announce source identity/leg; selected/expanded/loading states are conveyed explicitly.
200% zoom and a 390px-wide viewport preserve the same source/action paths. Destructive or changing
actions are never triggered by moving keyboard focus or changing a filter.

### 17.10 · Loading, empty, stale, failure and permission states

| State | Visible behavior | Safe next step |
|---|---|---|
| Initial load | Stable header/rail shell; loading placeholders, no zero counts presented as fact | Wait for the authorized scope projection |
| Entire read fails | Named page error; preserve filter controls; no empty-success wording | Try again; keep query/context |
| One scope's Units fail | Scope remains visible, goods area states failure; no guessed SO fallback | Retry that inspection; no partial/result submission on unreliable scope |
| Valid empty date | Date heading remains; no matching-delivery message | Choose another date/filter; no New DO |
| Valid empty work filter | State the exact missing obligation count is zero | Change filters or return to Calendar |
| Search excludes everything | Show current filter/range context and clear controls | Clear the narrowed scope; formal historical lookup stays Delivery Orders |
| New facts arrive | Refresh the source projection; do not reorder the record being edited or discard entered changes | On return/save, reconcile against latest facts and explain any conflict |
| Save conflicts with another actor | Preserve entered values; explain which source fact changed; no blind last-writer win | Reload/review the governed arrangement |
| Cancelled/historical object | View permitted facts with history; no current execution controls | Open exact related/current record where one exists |
| Unauthorized scope | No customer/address/proof leakage through cards, counts, search, exports or links | Authenticated permission refusal / non-disclosing not-found as appropriate |

Internal Operations may inspect and arrange authorized scopes. Warehouse/Logistics duties execute
only their own doors. NETS and other partner identities stay in the limited Partner Portal/API,
not an unrestricted internal Monitor. Manager capability is not a second duty assignment system.
Prepared external content must contain only that partner's relevant scope; full IC/phone data
belongs only in the authorized registration context, not a calendar card or general export.

### 17.11 · Wording ledger — no invented word treated as approved

**Already-authorized words reused:** `Monitor` / `Delivery Orders` (current user starter);
`DELIVERY SCHEDULE`, `No confirmed date`, `Overdue`, `Assign logistics`, `Change logistics`,
`Edit Delivery`, `Save Delivery`, `Show delivery items`, `Items to collect`, scoped selection
counts and the operational status set (COPY-STANDARD delivery sections); `Show filters` /
`Hide filters` (COPY-STANDARD shared controls); `Expected arrival` (booking-call dictionary);
`Required · Handed over · Not handed over` and `Needs checking` (Delivery §4 / Architecture
§3.5.1); `Cannot Deliver` (partner screen authority). `Calendar` is an existing shared word,
but its use as this Monitor mode/return control is proposed, not prior placement approval.

**PROPOSAL — OWNER APPROVAL REQUIRED:** all phrases and new contexts below are part of this
surface proposal, not strings silently added to the dictionary. Approval is reviewed with the
complete surface, not as a sequence of wording questions.

| Exact proposed text / context | Intended meaning |
|---|---|
| `DELIVERY WORK` as a local filter-group heading, never a sidebar destination | Specific unresolved Delivery obligations |
| `All dates` in a work-filter result heading | This result ignores the previously displayed calendar range |
| `No deliveries match these filters.` | Valid empty calendar/date results |
| `Clear filters` | Clear narrowing controls without creating or changing a record |
| `No deliveries without a confirmed date match these filters.` | Valid empty No confirmed date results |
| `No overdue deliveries match these filters.` | Valid empty Overdue results |
| `No delivery proof is missing for these filters.` | Valid empty proof-obligation results; never claims every partner/date is clear |
| `No items need collecting for these filters.` | Valid empty linked Loan-collection results |
| `No deliveries need checking for these filters.` | Valid empty discrepancy results |
| `No partner reports need a reply for these filters.` | Valid empty Cannot Deliver results |
| `No failed deliveries need work for these filters.` | Valid empty unresolved failure results |
| `Delivery details could not be loaded. Try again.` | Full Monitor read failure |
| `Goods for this delivery could not be loaded.` | Scope inspection failure; not zero goods |
| `Goods for this delivery are not linked yet.` | Missing exact scope-to-line/Unit mapping |
| `These delivery details changed. Check them before saving.` | Concurrent arrangement change |
| `Selection cleared because the filters changed.` | Prevent hidden bulk mutation |
| `Previous dates` / `Next dates` / `Choose delivery date` | Accessible names for range navigation and date picker |
| `Show deliveries on {date}` | Accessible name for date-heading drill-down |
| `More actions` | Narrow-toolbar secondary-action overflow |
| `{n} deliveries` | Distinct planned/performed delivery entries; not SO, physical Unit or Work-row totals |
| `Leg {n}` | Scope identity alongside its actual origin/destination on a journey card |
| `Actual delivery date not recorded` | Missing visit occurrence date; never filled from upload/entry time |
| `No time agreed`, `No ETA`, `Search delivery scopes…`, `Calendar` on this new composition | Existing code/current starter/shared wording reused in a new Monitor context; ratify context and dictionary gaps explicitly |

Example people, partners, dates, SO/DO/Unit values are data, not newly coined labels. Actual cards
must use the current registered partner display name rather than normalize a name from a sketch.
Do not borrow stale banned `Stock ETA`, generic Due/Next Action/Priority/Follow Up, or Today/Tomorrow.

### 17.12 · Acceptance boundary, unresolved dependencies and review status

The following are product acceptance scenarios, not implementation tasks or a build Card:

1. A new employee can find one undated scope, open its correct arrangement and return after Save
   without losing region/partner context; copying a message alone leaves it unconfirmed.
2. A selected date shows its relevant arrangements and actual results. Completed visits remain
   available for that date; date passage does not invent a result or move an ETA into a booking.
3. An old failed visit, outstanding photo, open Loan and unmatched Unit remain findable across
   dates; each action has an owning source and shared duty resolution, with no Mark done.
4. Two legs of one Singapore journey show their own dates/partners/Units/results. Completing
   Johor never completes the Singapore customer leg. No whole-order DO link is fabricated.
5. Partial handover changes only named Units. Both counterparty counts and the discrepancy remain
   visible. Original work and original evidence survive. A split scope never falls back to SO totals.
6. One/many selection exposes only the permitted acts; changed partner requires reason/history;
   no hidden selection or half-success message can mislead the operator.
7. Show delivery items is read-only and exact; wrong Sales facts leave through Sales, Warehouse
   facts through Outbound, missing supplier facts through Purchasing, and money through Payment.
8. At 1920, 1440, 1280, 1130, 920 and 390px, plus 200% zoom and keyboard-only use, dates, source
   identity, filters, inspection and the permitted action remain reachable without body overflow.
   These widths are required future checks, not checks claimed to have run on this proposal.
9. Partner or unauthorized users cannot recover other scopes through counts, deep-links, search,
   proof URLs, exports or registration data. No external message/account/channel is changed here.
10. The new Monitor does not change the locked DO register sequence, fixed identity, rail width,
    automatic issuance, formal history or DO/SO link semantics. The existing 500-row/scope/ETA/
    narrow-preference defects remain explicit convergence requirements, not accepted behavior.

**Dependency conclusions — no business re-interview needed:** exact scope/Unit/visit identities,
evidence-linked date/partner reads, a complete rather than capped result set, open-work projection
after delivery, shared duty resolution, governed bulk failure behavior, and source-backed proof
enforcement are required to support this design. Current code gaps do not authorize guessed UI.

**Still awaiting review, not silently decided:** the Monitor composition and its focus navigation;
retaining completed entries within the inspected date; the new all-date work-filter placement;
and the explicitly proposed copy. The owner has not approved them. No runtime implementation,
Card, migration, build, PR, external contact or deploy is authorized by this section.

**Whole Blueprint remains open:** this section connects all requested Delivery lifecycle seams,
but the DO register, full Edit/preview, DO object, dedicated partner experience, central Settings
and Reports still require their own complete surface presentations and owner review. Do not
declare `DELIVERY UI BLUEPRINT COMPLETE` or prepare a build handoff from this section alone.
