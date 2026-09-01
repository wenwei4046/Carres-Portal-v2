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

**The acts live on the Delivery page's detail** (one next act at a time: `Mark ready for
handover` · `Record handover` · `Confirm logistics receipt` — COPY-STANDARD registers all
strings); the DO object page renders the same facts read-only in its **Warehouse handover**
block and its History, with each recorder named. Picking · Checking · Packing detail steps,
returned-goods receipt and discrepancy investigation Work remain approved target, not built.

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
200px local rail             ·  DELIVERY SCHEDULE + LOGISTICS, page-owned FILTERING
one expandable DataGrid      ·  the Sales Orders engine, density and toolbar
```

**THE ENTRY RULE (owner ruling 2026-08-24).** A Sales Order does not become delivery work merely by
existing. A scope enters this workspace only when it has **a delivery location/address · building
and access facts · goods that require delivering · a valid scope or Journey leg**. An order missing
its address stays **Sales-owned Work** and must not appear here as a row of `Not given` — measured
before the correction, 59 of 90 rows carried no location at all, which is two thirds of a logistics
screen that no logistics operator could act on.

**The rail.** `DELIVERY SCHEDULE` lists `No confirmed date`, then **`Overdue`** (renamed from
`Date passed`), then the actual weekday + calendar dates ascending — **never Today, never
Tomorrow** — and it shows the **near-term operating dates even when their count is zero**, because
a planner has to be able to see that a day is free. The schedule reads **`Confirmed Delivery`**,
never the customer's promised date. `LOGISTICS` lists `All`, then the governed partners
**NETS · AL · TEOW · TT · EU · SSY · HOUZS in that order and visible at zero**, then any other
partner while it is genuinely carrying a scope, then `No logistics picked` when scopes have none.
The two groups COMBINE, each group's counts are computed over the rows the other has already
narrowed, and counts are **delivery scopes or Journey legs, never whole Sales Orders.** Choices ride
the URL (`?date=` · `?logistics=`).

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

Delivery Settings contains no PO Duty, GRN Duty, Warehouse Duty or buddy-cover roster. Those facts
exist only in Team; Delivery consumes their resolved action owner through the shared Work Engine.

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
and `../workspace/BLUEPRINT.md` is overwritten. One named coverage item awaits an owner
statement of fact — the East Malaysia journey boundary (which partner carries, and where
Carres' governed facts end); East Malaysia is not in current governed coverage until ruled.
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
