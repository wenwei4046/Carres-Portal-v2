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
goods-location observations, Delivery Work and append-only history.

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
→ Issue Delivery Order
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
- ⭐ **THE MONEY HALF IS RE-RULED 2026-08-19 (SUPERSEDING 2026-08-16):** **money in full before
  delivery is the only default** — a DO issues only when **outstanding = 0, or an APPROVED
  Delivery Payment Approval covers the order (COD: full balance by online transfer before
  unloading, no cash), and no OPEN Finance exception holds it.** The 0362 approval record, the
  0355 Finance exception and the COD terms are defined once in
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
- **Status is DERIVED, never stored** (`deliveryOrderStatusOf`, one arithmetic): the void stamp
  and the `delivery_attempts` history matched to the document's number decide
  `Created · Delivered · Delivery exception (+ its ONE reason) · Cancelled`.
  `Out for delivery` is registered vocabulary awaiting the handover fact (§4's chain is approved
  target, not built) — it is never derived from the calendar, because a departure nobody recorded
  is not a fact.
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

Handover records goods/quantity, both parties, actual receiver, time, vehicle when known and
signature/photo/reply proof. A discrepancy creates investigation Work without overwriting either
party's original fact.

One personal login may hold Warehouse, Logistics or both duties and switch between **Warehouse
Work** and **Logistics Work** without logging out. Every event records person, company and active
duty. No shared company login is allowed. Even when one authorised person performs both sides, the
events and evidence remain separate.

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

**SIDEBAR — owner ruling 2026-08-16 (blueprint card; supersedes the SUPPLY CHAIN draft for the
DO Register).** The **Delivery Orders Register lives under SALES**, beside Sales Orders — the
register answers "which documents exist" for the order's own journey. The **Delivery work page
stays under Supply Chain** as the execution view and writes nothing. Delivery applies the governed
Shell, Register and Object Detail Templates and does not invent another UI system.

Delivery navigation (the rest is approved target):

1. **Delivery Work** — actionable operational home (today: the Delivery page under Supply Chain);
2. **Delivery Orders** — formal DO truth Register, under SALES · **BUILT**;
3. **Schedule** — Week, Day and List by actual date;
4. **Delivery History** — actual delivery results Register;
5. **Exceptions** — problem, owner and explicit next action;
6. **Partners** — Partner coverage, capability, contact and access;
7. central **Settings → Delivery**;
8. central **Reports → Delivery**.

There is no separate Delivery dashboard, Fleet, Trips, Regions or Delivery Returns destination.
KPI cards do not precede the work/Register.

**Delivery Orders Register defaults — owner column ruling 2026-08-18 (OVERWRITES the 2026-08-16
seven; same table as Sales Orders — one register engine, same typography, search, filters,
export and chooser):**

```
DO No · DO date · SO No · Customer · Customer Delivery · Delivery date · Delivery Location · Status
```

`DO date` = the day the system issued the document · `Customer Delivery` = the date promised to
the customer (from the SO) · `Delivery date` = this trip's confirmed date. `Created` and the
rest stay in the chooser, off by default. `DO No` and `SO No` are mono links — DO No opens the
document, SO No the source order. Status pills: **Created grey · Out for delivery blue ·
Delivered green · Delivery exception amber** with its ONE reason as the small second line. One
row = one trip; a split order shows one row per DO.

Statuses are the document's own: `Created → Out for delivery → Delivered`, plus
`Delivery exception` carrying its ONE reason, and `Cancelled` for a voided document. There is NO
`Waiting for goods` status — a DO cannot exist before goods are ready; waiting lives on the Order
Route. **The register shows NO owner, NO avatar and NO action sentence** — a register finds
documents; work lives in My Work / Team Work. Rows open the DO object page; document numbers are
doors (`DO → DO`, `SO → SO`).

**Delivery Work defaults:** `Due · Work · DO No · Customer · Delivery Date · Warehouse · Logistics
Partner · Owner · Waiting Since · Priority`. Every row presents one current primary action.

**Delivery History defaults:** `Delivery Date · DO No · Customer · Logistics Partner · Result ·
Failed Delivery Reason · Goods · Proof Status · Recorded By`.

**Exceptions defaults:** `Opened · Problem · DO No · Customer · Affected Goods · Goods Location ·
Owner · Next Action · Due · Status`.

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

**BUILT 2026-08 (blueprint card §5) — the first DO object page**, one read-only page whose blocks
are, in order: `CUSTOMER · GOODS (this trip's lines only, human words first, SKU mono second) ·
DELIVERY DETAILS · SOURCE SALES ORDER door · DELIVERY STATUS · DELIVERY PHOTO ·
SIGNATURE / PROOF · LOAN COLLECTION (only when a loan exists) · HISTORY`, plus header
`Print` (reprint = same number). Everything renders facts owned by other modules; **the page
writes nothing.** Driver/vehicle render governed absences until a per-trip fact exists
(`partner_fleet` is keyed to the partner, not the trip). The multi-view shape above remains the
approved target this page grows into.

## 10 · Daily operator journey, Work and Quick Rail

Operations starts in Delivery Work and prioritises Failed Delivery action, commitment risk,
Warehouse delay, Logistics reply, missing proof, overdue return and then routine confirmation.
From issue through arrangement, Warehouse preparation, handover, delivery day, result, proof and
return, every row states one concrete next action and one owner.

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

- Operations may issue, arrange, proxy-record, upload replies, assign after Cannot Deliver, manage
  problems and request proof; it may not impersonate Warehouse or silently rewrite results.
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
no-portal confirmation, customer arrangement, Warehouse preparation and handover, Logistics
receipt, actual delivery and partial/failure results, proof review, goods custody and return,
correction/audit, Work, Schedule, Quick Rail, Settings, Reports, permissions, Portal/API and every
cross-module owner. Automatic allocation, vehicle routing and customer self-scheduling are
explicitly excluded from current truth rather than deferred blind spots.

**PLAN MISSION COMPLETE.** The complete Blueprint has been owner-reviewed and no unresolved Owner
Decision remains. This MASTER persists the approved operating model only. It does not authorise
Cards, implementation sequencing, migration or build work.
