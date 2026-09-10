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
separate journey leg, the shared read-only tally prints `Required · Loaded · Not loaded ·
Driver confirmed` (the 2026-09-06 `Loaded` copy ruling plus the unified card 2026-09-07: the
Logistics side's own per-Unit receipt is the fourth number, never merged into the loading count)
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

Delivered requires actual time, receiver, delivered goods/quantity and the governed evidence.
The recorded result always reads **Delivered**. Missing evidence creates the separate
**Upload delivery proof** work queue, whose row names `Upload delivery photo` and/or
`Upload signed Delivery Order`; completing or reviewing proof never renames the result.

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

**THE FOUR-PAGE MAP — CARD-2026-09-04-delivery-01, overwriting the 2026-08-24 one-destination
ruling.** Delivery is four pages with four distinct jobs:

```
Monitor           plan/read delivery days and open the right record      ?tab=delivery
Delivery Orders   find and finish formal DO records                      /operation/delivery-orders
Delivery Order    read one formal DO and its evidence/history            /operation/delivery-orders/:doId
Edit Delivery     write arrangement/result/evidence                      /operation/delivery/edit/:orderId
```

**DELIVERY NAVIGATION.** The sidebar carries the Delivery module with exactly two children, in
this order: **Monitor** and **Delivery Orders**. Monitor leads and is the collapsed icon's
landing. The DO object page and Edit Delivery are never navigation — they are doors on cards and
rows. Delivery applies the governed Shell, Register and Object Detail Templates and does not
invent another UI system.

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

**MONITOR — calendar first, with operational queues that open the selectable work list (owner UI
correction 2026-09-07, overwriting the earlier `Calendar` rail row and work-list-default landing).** Monitor answers
the operator's morning question — *what customer deliveries are planned, and which record do I
open or act on?* — through **two projections of the SAME canonical scope rows**:

```
one 50px Destination Header  ·  Monitor (no page-owned control ever enters this row)
page-owned 240px FilterRail  ·  the COMPLETE MONTH CALENDAR fixed on top, then
                                WORK TO DO + STATE + LOGISTICS PARTNER + DELIVERY STATUS
                                scrolling below it
Calendar (DEFAULT)           ·  Day / Week / Month in the page toolbar; Week is the desktop default
                                and its six Mon–Sat columns fit without horizontal date scrolling
Operational queue selected  ·  the standard selectable Register work list (shared DataGrid):
                                selection ☐ · ▸ expansion · SO No · Customer · State ·
                                Requested Delivery Date · Logistics Partner ·
                                Confirmed Delivery · Confirmed Time · DO No ·
                                Delivery Location · Goods · Delivery Status ·
                                Actions — sticky identity, real horizontal scrolling
```

**Calendar is a VIEW, never a `WORK TO DO` row.** `Day · Week · Month` stays in the page toolbar
on BOTH projections (nothing lit while the work list shows, never on a phone). Choosing any of the
three clears the selected work queue and every STATE / LOGISTICS PARTNER / DELIVERY STATUS pick and
returns the right workspace to the Calendar. Choosing `All delivery work` or another work queue replaces the Calendar with the
selectable DataGrid. `All delivery work` still contains every delivery-eligible Sales Order row,
including rows with **no formal DO yet, no confirmed delivery date, and no Logistics Partner yet**.
The governed entry rule below still gates the population (no cancelled orders, no orders that need
no delivery, no row missing its minimum facts). Calendar continues to show only rows with a
confirmed date and never places undated work into date columns.

**THE RAIL'S FULL-MONTH CALENDAR (owner correction 2026-09-06).** The rail's first, FIXED
region is the complete current month — never a one-week strip, never the Portal sidebar:
month arrows move exactly one month; the selected date wears the governed blue selected
state; today stays distinguishable from the selection; Sundays — the non-operating day —
stay visible in the governed muted treatment and take no click; a date holding confirmed
deliveries carries a dot mark (shape, never colour alone); the arithmetic is real and
locale-aware, hard-coded to no month. It renders the ONE calendar primitive the kit already
pins (`react-day-picker`, the DatePicker's own exported skin). The filter groups scroll
independently BELOW it; scrolling them never removes the month from view. **Clicking a date opens
that date's Day view in the right workspace** and clears the selected work queue. Clicking a day
in the right-side Month view does the same.

A work queue (`All delivery work` · `No logistics picked` · `No confirmed date` · `Overdue` ·
`Failed Delivery` · `Upload delivery proof`), a STATE row, a LOGISTICS PARTNER row or a DELIVERY
STATUS row is an operational question, and its answer is the Register grammar every other module
answers with — **never a full-width card wall**. The ▸ expansion has exactly one job: the row's
goods lines, read-only. `SO No` opens the Sales Order, `DO No` opens the Delivery Order,
double-click opens Edit Delivery. **`scope` and `leg` are never employee-facing words** (owner
correction 2026-09-07): the footer counts `{n} deliveries` / `{n} of {m} deliveries`, the empty
list says `No deliveries` / `No matching deliveries.`, the assignment door counts `{n} deliveries`,
and a Journey row prints its own route (`Klang WH → JB transit`) with no `Leg` prefix — the leg
number rides only the Edit Delivery URL.

**THE CHASE — `Requested Delivery Date` vs `Confirmed Delivery` (owner correction 2026-09-09),
overwriting the column order above's earlier `Delivery Location`-first spelling and the Delivery
Orders register's `Requested Delivery Date` chooser default.** A delivery with no confirmed date is
a customer waiting for an answer, and the operator's four questions have four answers ON THE ROW:

```
What date did the customer request?   Requested Delivery Date — Sales Orders' fact, READ-ONLY here
Has anyone confirmed a date?          Confirmed Delivery + Confirmed Time — Delivery's own facts
Who must be contacted?                Logistics Partner, and the Actions cell's call line
Where is the confirmed date recorded? Edit Delivery, the one Delivery-owned editor
```

- The two dates are **never the same column and never two names for one fact**. `DO date` is the
  day the document issued and is neither of them.
- **`No confirmed date` lists earliest `Requested Delivery Date` first**; a row with no requested
  date — including `To be confirmed` — sorts LAST and prints the governed absence, never a
  substitute date. Every other queue keeps the canonical row order: re-ranking work that is not a
  chase by a Sales date would move rows for a reason the queue does not mean.
- **`Actions` is the row's one next act**, derived from recorded facts only:
  `no Logistics Partner → Assign logistics` (the same governed door as the bulk journey, for ONE
  delivery) · `partner but no confirmed date → Call {Logistics Partner} — confirm delivery date`
  (the COPY-STANDARD row line, the name always from the data) then `Edit Delivery` · `everything
  agreed → Edit Delivery`. **No carrier and no employee name is ever hard-coded**; staff identity,
  where a Delivery surface needs one, comes from the shared Staff & Duties resolver.
- **`Edit Delivery` carries the workspace back.** The editor opens with the queue and every active
  narrowing on its URL and returns to exactly that list after `Save Delivery`, so the operator
  watches the row leave `No confirmed date` and reappear on the Calendar day the partner agreed —
  it is not merely told that it did. Only a portal path is honoured.
- **The phone's work list is a LIST, not the sheet squeezed.** Below the phone breakpoint a work
  queue renders one card per delivery carrying `SO No · Customer · Requested Delivery Date ·
  Confirmed Delivery · Logistics Partner` and the same Actions act, with its own visible search
  box and the sheet's `{n} of {m} deliveries` footer — **none of those three facts may require a
  Columns chooser to see**. Bulk selection stays a desk act: a phone assigns one delivery at a
  time, through the same governed door.
- **The Calendar boundary is unchanged.** An unconfirmed delivery never enters a Day, Week or
  Month date cell, cards stay read-only, and the chase happens in `No confirmed date`. The empty
  week keeps its real `{n} deliveries need a confirmed date.` count and its `Open No confirmed
  date` door.

`Upload delivery proof` contains recorded delivered results whose required evidence is incomplete
— the Delivery Orders register's OWN missing-evidence arithmetic (`missingDeliveryProofOf`: the
T6 photo ledger known and empty, and/or no signed document on `orders.do_file_path`), never a
second copy. The queue name tells the operator the job; each row then names the exact missing
evidence beneath its `Delivered` status as `Upload delivery photo` and/or `Upload signed Delivery
Order` — both when both are missing. Completed evidence leaves this queue. `Delivered — Proof
Required` does not appear on Monitor. `Overdue` never holds a recorded delivery: a confirmed date
behind us with a delivered result is proof work, not a late trip.

`Waiting for warehouse` remains a Delivery Status filter, not a `WORK TO DO` queue. It means the
delivery has been arranged but Warehouse has not recorded `Ready for handover`; it never means
that stock is missing or that delivery is in progress. Warehouse records the readiness fact and
the row then advances to `Ready for handover`.

**BULK INITIAL LOGISTICS ASSIGNMENT LIVES ON MONITOR (owner correction 2026-09-06)** — the
planning population includes deliveries that have no formal DO yet, so the journey is
`Monitor → No logistics picked → header select-all → Assign logistics`, and the queue answers
across ALL dates — rows without a DO and rows without a confirmed date included. Selection
follows the shared engine: every row has a checkbox; the header checkbox selects only the
visible filtered rows (a combined `Selangor · No logistics picked` narrowing selects only those
Selangor rows); changing a filter clears the selection; a completed assignment clears the
selection and refreshes the rail counts; the selection toolbar replaces the normal toolbar
at the same height and reads `{N} selected · Clear · Assign logistics`. The
write goes through the ONE governed assignment door (coverage-checked partners, Klang Valley
pre-selects NETS, history preserved). **Bulk assignment is offered only while every selected
row is unassigned**; a selected row that already carries a partner turns the act into the
governed **`Change logistics`** (reason + append-only history), one row at a time — an
uncontrolled batch replacement of assigned partners does not exist. `Edit Delivery` is offered
for exactly ONE selected row, never many. Every combined narrowing prints above the work list
(`No confirmed date · No logistics picked`) with `Clear filters`, and every pick rides the URL.

**The CALENDAR still writes nothing** — no inline edit, upload, result, proof review, selection
or drag/drop reschedule. Every card is ONE accessible link: an issued DO opens the formal
Delivery Order object; a scope without one says `No delivery order yet` and opens Edit
Delivery. There is no `New DO`, `Issue`, `Release` or `Approve` — §3's ruling stands: **the
SYSTEM issues the Delivery Order** when the governed gate becomes true. A fully empty visible
range shows ONE spanning state — `No deliveries are scheduled from {first} to {last}.`, the
REAL `{n} deliveries need a confirmed date.` count when true, and the `Open No confirmed date`
door — never the same absence repeated in every column; an individually empty day says
`No deliveries`.

- **DAY / WEEK / MONTH (owner correction 2026-09-07).** Desktop defaults to `Week` and may switch
  to `Day` or `Month`. `Day` shows the selected operating day with full work cards; its arrows
  move one operating day. `Month` is a capacity overview on the kit's one calendar primitive:
  each date prints compact counts in the rail row's own grammar — `Deliveries {n}`, then
  `Exceptions {n}` (only when > 0: exactly the rows the `Overdue` + `Failed Delivery` + `Upload
  delivery proof` queues would list, one arithmetic) and `No logistics picked {n}` (only when
  > 0) — never full delivery cards; a date with nothing prints only its number; Sunday stays
  visible, muted and unclickable; a Sunday-recorded delivery is still counted; the toolbar's
  `Previous month` / `Next month` replace the whole month; clicking a date opens `Day`. A month
  holding nothing shows the same ONE spanning state as an empty week. `Week` shows the week-aligned Mon–Sat containing
  the selected date, fitting its
  available width — no unlimited horizontal date scrolling; previous/next REPLACES the whole
  displayed work week (six operating days). A tablet shows the fixed three-day half-week
  (Mon–Wed / Thu–Sat) for the week projection, previous/next replacing the visible window. The default selected date
  is business today, a Sunday snapping forward to Monday.
- **No hour-by-hour vertical timeline.** The planned window is text; card height never implies
  duration. Cards order by window start, then customer (locale-aware), then stable scope id. An
  empty day says `No deliveries` (owner correction 2026-09-06).
- **One card shows only (owner correction 2026-09-07):** confirmed time · DO No (or `No delivery
  order yet`) · Customer · City and State · Goods summary · Logistics Partner · Delivery Status.
  **Never** a customer or partner phone, money, an internal employee name, driver, vehicle,
  expected arrival, upload timestamp or actual delivery time. Staff facts, where a Delivery
  surface ever needs one, come from the shared Staff & Duties resolver — never a hard-coded name.
- **The status is the shared seven-word operational ladder** (`deliveryWorkStatusOf`) — one
  arithmetic with the old workspace, never a second copy. **A planned time window ending proves
  nothing**: no failure, no "result needed", no invented status reads the clock.
  A delivered result with incomplete evidence remains `Delivered` on the Calendar and enters the
  `Upload delivery proof` work queue only from recorded proof facts — never from time.
- **The URL is the state** — ONE selected date (`?date=`) drives every viewport's window,
  plus `?view=` (`day` · `week` · `month`, or the one WORK TO DO queue) · `?region=` (the STATE
  pick) · `?logistics=` · `?status=` · `?q=`, so refresh, share and Back all restore the same
  view. An absent `?view=` is the default `Week`; the retired `?schedule=` / `?checking=` /
  `?start=` / `?day=` / `?view=calendar` / `?view=delivered_proof_required` /
  `?view=waiting_warehouse` spellings still resolve so an old shared link keeps answering —
  `calendar`, `?start=` and `?day=` open the week, the old proof queue opens `Upload delivery
  proof`, and the old `waiting_warehouse` queue opens the DELIVERY STATUS filter.
- **Mobile is the `Day` list, never the Week or Month grid squeezed into a phone.** Below the phone breakpoint
  the rail becomes the filter drawer, the visible range becomes one selected operating day with a
  sticky date heading and 44px rows, previous/next skips Sunday, **the full month opens through
  the kit's one standard date control (UI-KIT §11)**, and the cards and href arithmetic are
  identical to desktop.

**The 240px rail is PAGE-OWNED filtering, not the Portal sidebar** — the ONE shared
`FilterRail`/`FilterRailGroup`/`FilterRailRow` grammar (the LOCAL FILTER RAIL law: 240px, 36px
minimum rows, wrapping labels, right-aligned counts, blue active row, `Hide filters` /
`Show filters` collapse remembered by the browser; on a phone the rail becomes the filter
drawer). **Four single-pick groups that COMBINE**; each group's counts are computed over the
cards the other groups already narrowed (Architecture Law D):

- **`WORK TO DO` is ONE group (owner correction 2026-09-06 — never split into "Delivery
  Schedule" and "Needs Checking"), in the ruled order (owner correction 2026-09-07):**
  **`All delivery work`** (every open row, the unfiltered selectable
  listing) · **`No logistics picked`** (a PRIMARY work queue, visible without scrolling past
  STATE and the partner rows — never buried in, or duplicated under, LOGISTICS PARTNER) ·
  `No confirmed date` · **`Overdue`** · `Failed Delivery` · `Upload delivery proof` — never
  `Calendar`, `Today` or `Tomorrow`; every queue comes from recorded facts, never a clock inference.
- **`STATE`** (owner correction 2026-09-07, the heading formerly `REGION`) — the direct state
  names ruled below, straight from the data, no `All …` row: picking again unpicks, and `Clear
  filters` above the list clears everything. A STATE pick combines with a work queue
  (`Selangor · No logistics picked`), and header select-all then takes only those visible
  filtered rows.
- **`LOGISTICS PARTNER`** (the heading formerly `LOGISTICS`) — only the governed partners
  genuinely carrying a matching row, per the rows ruled below; no invented company, no `All …`
  row.
- **`DELIVERY STATUS`** — `Waiting for warehouse` · `Ready for handover` · `Out for delivery`.
  These are filters over recorded operational progress, not actions and not document statuses;
  the three rows are fixed and print their live counts, zero included.

**DELIVERY ORDERS — the formal document register on the Sales Orders grammar (owner UI
correction 2026-09-06, overwriting the 2026-09-04 "restored unchanged" state).**
`/operation/delivery-orders` is the shared Register engine top to bottom: row checkboxes ·
header select-all over the visible filtered rows · the in-place same-height selection toolbar ·
▸ expansion showing THIS TRIP's goods lines read-only (the one `trip_groups` derivation the DO
page and the print path already run) · sticky `DO No` identity with real horizontal scrolling ·
search · governed per-column filters · Export · Columns · the fixed 32px result footer.

- **Default columns, in order (owner correction 2026-09-09, overwriting the 2026-09-06 order and
  its `Requested Delivery Date` chooser default):** `DO No` · `SO No` · `Customer` ·
  **`Requested Delivery Date`** · **`Confirmed Delivery`** · **`Confirmed Time`** ·
  `Logistics Partner` · `Delivery Location` · `Delivery Result` · `Proof Status` · `Status` ·
  `DO date`. In the chooser, off by default: `Goods` · `Created`.
  **`Requested Delivery Date` and `Confirmed Delivery` are ADJACENT** — the register answers *what
  did the customer ask for, and has anyone agreed a day?* in one glance, and a column hidden in the
  chooser answers nobody. **`DO date` falls to the end**: it is the day the paper issued and is
  neither delivery date; it stays available because a document register must be able to say when
  its documents were made. The ambiguous `Delivery date` label stays retired for
  **`Confirmed Delivery`**, `Confirmed Time` is its own column, and the customer date keeps its
  governed word `Requested Delivery Date`. `Requested Delivery Date` opens no editor here —
  Sales Orders owns it; `SO No` opens the Sales Order and `DO No` the formal Delivery Order, and
  **`Assign logistics` still never appears on this register**.
- **The cell, the search, the per-column filter and the Excel export print ONE spelling** of the
  requested date (`requestedDeliveryText`): the day · `To be confirmed` · `No delivery date`. The
  export used to flatten the middle into the last, telling a sheet's reader that a customer had
  named no day when the customer had asked for one still being settled. The governed **DO document
  PDF is unchanged** — it prints the trip's own confirmed delivery date and has never carried the
  customer's request.
- **The `SO No` cell is identity only** — the inline `Order Route` second-line action is
  retired; the route stays one right-click away in the governed context menu.
- **Its page-owned 240px FilterRail** carries `WORK TO DO` — the queues canonical data can
  honestly compute: `Record delivery result` (derived `Out for delivery`, no result yet) ·
  `Upload delivery photo` (recorded Delivered/Partially Delivered whose photo ledger is KNOWN
  and empty — an unknown ledger claims nothing) · `Upload signed Delivery Order` (the same
  recorded result with no signed document on file). One document sits in at most ONE primary
  queue, in that priority; finished work leaves the queue and the document stays in the status
  views forever. **`Check delivery proof` is deliberately NOT a queue yet** — no canonical
  proof-review record exists (§6's Proof Accepted / More Proof Required / Proof Rejected is
  approved target, not built), and a queue is never faked. `DOCUMENT STATUS` lists `All` plus
  the ladder's own five words.
- **Selection is document-oriented output only:** `{N} delivery orders selected · Clear ·
  Print {N} delivery orders` (each document's governed single-DO page, assembled server-side
  under RLS, one file) plus the shared selected-row Excel export. **`Assign logistics` never
  appears here** — initial assignment is Monitor's journey, because Monitor's population
  includes scopes without a DO.

The document-status vocabulary stays the register's own (`Created → Out for delivery →
Delivered`, `Delivery exception` with its ONE reason, `Cancelled`), and **`Created` may not
appear on Monitor** — the operational and document vocabularies never borrow each other's
words.

**THE ARRANGEMENT OWNERSHIP RULING (owner, 2026-08-24) STANDS UNCHANGED:**

> **DELIVERY OWNS THE DELIVERY ARRANGEMENT.** Who carries a scope, the confirmed operational
> date and time, the expected arrival, the logistics note, the partner's actual reply proof and the
> Condo driver/vehicle are **Delivery's writes**. **Sales Orders remains
> the owner of the commercial customer promise** — the customer, the address, the building facts and
> the customer-requested `Requested Delivery Date` — and Delivery may never write one of them.

**ONE ARITHMETIC FOR THE REQUESTED DATE (Architecture Law D, 2026-09-09).** `orders.delivery_date`
under its `delivery_date_tbd` guard is resolved in exactly one place (`requestedDeliveryOf`) and
spelled in exactly one place (`requestedDeliveryText`). The Sales Orders register, Delivery Monitor
and the Delivery Orders register all read those two; none of them derives the date or spells its
absence again.

What changed is WHERE the writes are made: the arrangement lives on **Edit Delivery** (and the
governed partner door). **The bulk `Assign logistics` gap is CLOSED (owner correction
2026-09-06):** Monitor's work list is the one bulk initial-assignment surface, through the same
governed door — and the `Change logistics` rules below still bind every partner write wherever
it is made.

The arrangement is its OWN record (`ops_delivery_arrangements`, migration 0386) keyed by the scope
`(order_id, leg)` — never `orders.delivery_partner_id`, which is a Sales Order column and could
hold only one carrier for a two-leg Journey, kept no history, and had two writers.

**THE ENTRY RULE (owner ruling 2026-08-24).** A Sales Order does not become delivery work merely by
existing. A scope reaches Monitor only when it has **a delivery location/address · building
and access facts · goods that require delivering · a valid scope or Journey leg**. An order missing
its address stays **Sales-owned Work** and must not appear here as a card of `Not given` — measured
before the correction, 59 of 90 rows carried no location at all, which is two thirds of a logistics
screen that no logistics operator could act on.

**`STATE` (owner correction 2026-09-07, the heading formerly `REGION`; the flat grammar is the
2026-09-06 correction overwriting the 2026-09-01 sub-headings)** answers *where is each delivery
going?* with **direct state/jurisdiction names only, derived
from the real records** — Johor, Kedah, Kelantan, Kuala Lumpur, Melaka, Pahang, Penang,
Putrajaya, Sabah, Sarawak, Selangor, Singapore and the rest as the data genuinely carries them:

- **One flat list.** No `EAST MALAYSIA`, `WEST MALAYSIA` or `SINGAPORE` sub-group headings, no
  `Other` bucket, no state split into extra categories, and no fixed zero-count filler rows —
  a state appears while it genuinely holds a matching scope, ordered by count; a picked state
  stays visible at 0 until it is unpicked. **The East Malaysia BUSINESS boundary is untouched:**
  HOUZS still owns the onward journey beyond the handover (§15) — that is an operating ruling,
  not a rail heading.
- **Leg 1 of a Singapore journey (KL → JB) still counts under Johor and leg 2 under Singapore.**
- State detection reuses the ONE address classifier; a delivery whose address resolves to no
  state joins no region row and shows while no region is picked — fixing its address is Sales
  work through `Open Sales Order to change`.

**`LOGISTICS PARTNER` (owner correction 2026-09-07)** lists only the partners
**genuinely carrying a matching row** — the governed roster order (NETS · AL · TEOW · TT ·
EU · SSY · HOUZS) among those present, then others by name, a picked partner staying visible
at 0. **`No logistics picked` does NOT appear here**: it is a primary WORK TO DO queue (the
bulk-assignment journey's entry) and is never duplicated in two groups. A long list of
irrelevant zero-count partners is not a planning fact. Counts are **deliveries — a Journey leg
is its own delivery — never whole Sales Orders.**

**One card = one Delivery scope, or one Journey leg.** A Singapore order's two legs are two
cards, each with its own Logistics Partner, day, arrangement and result: leg 1 completing means the
goods reached the named JB warehouse, which is not the event the Singapore customer is waiting for.
Singapore Journey legs are **separate assignments**. A delivered order leaves Monitor — that
is Delivery Orders and Delivery History.

**`Delivery Status` on Monitor is the OPERATION's progress, not the document's** (owner ruling
2026-08-24):

```
Waiting for customer date · Delivery confirmed · Waiting for warehouse ·
Ready for handover · Out for delivery · Delivered · Failed Delivery
```

**`Created` may not appear on Monitor.** It is a true fact about a piece of paper and a
useless one on a planning screen — two scopes reading `Created` can be a week of real work apart. It
stays in the Delivery Orders register, which is where the document's own life is described. The two
vocabularies are separate and neither may borrow the other's words.

**PARTNER WRITES stay governed wherever they are made.** Only partners valid for the route/
coverage are offered; **Klang Valley defaults to NETS** per §2, as a pre-selection and never a
lock. **An existing Logistics Partner is never silently replaced:** changing one is the governed
**`Change logistics`** act and requires a reason from the governed list plus an append-only
history line, enforced by a database check constraint rather than only by a dialog. Singapore
Journey legs are assigned separately. The write lands on the arrangement, never on the Sales
Order.

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

**Goods inspection lives on the formal pages, not on Monitor.** A Monitor card carries only the
goods SUMMARY; the exact Units, `Where` · `Who has it` · `Stock ETA` and any `Items to collect`
Loan facts are read on the record the card opens. Stock owns Where/Who has it/Stock ETA, Sales
Orders owns the customer, address, promise and ordered goods, Warehouse owns readiness and
handover, Payment owns the release gate; no Delivery surface creates duplicate Sales, Stock,
Warehouse, Purchasing or Payment truth.

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
- per-Partner Portal/WhatsApp/email/API confirmation method, deadline, proof and rejection reasons.
  **Partner contact is company MASTER DATA, stored and read through
  `delivery_partners.contact` — HOUZS's confirmed company contact is `011-11108855`.** It is
  read wherever partner contact is needed and never printed on a Monitor calendar card;
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
Delivered, Partially Delivered and Failed Delivery have the meanings governed above. Missing
evidence is work under `Upload delivery proof`, never a second spelling of the result. Rescheduled and Delivery Cancelled are arrangement
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

## 16 · Production closure

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
proof` queue waits for the §6 proof-review record to exist.

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
