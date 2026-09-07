# PAYMENT — MASTER

> **APPROVED / LOCKED by Jess, 2026-09-03.** This is the only Payment Blueprint. It completely
> overwrites the former routine Refund, Bank Matching and storage model. Git is the history.
> **Customer payment posting convergence is PRODUCTION-VERIFIED.** The rest of this Blueprint is
> approved target truth and is not claimed built by that closure.
>
> Read `CLAUDE.md` → `docs/ERP-ARCHITECTURE.md` → this MASTER. Sales Orders owns the delivery
> money gate; Workspace owns people/duties; Payment never creates a second owner, calendar,
> product category or delivery fact.

## 1 · Mission and ownership

Payment is **customer Money In**: what the customer paid, what is still needed, and what the
collection owner must do next. **催钱前先看货**: collection always reads goods readiness and the
delivery commitment before telling staff to contact the customer.

Payment owns canonical incoming Payment records and allocation; one outstanding arithmetic;
customer invoices and receipts; collection outcomes and promise-to-pay; storage commercial
settings, calculation, charge, collection and waiver evidence; payment corrections and reports.

Payment does not own SO value/revision/cancellation; physical stock facts; delivery booking and
partner proof; partner AP, tax, GL or external bank control; Catalog category; Workspace duty
assignment; or ordinary refunds.

## 2 · One money model

```text
Customer Order + immutable revision
 ├─ Invoice/charge ── issue · void · replacement lineage
 ├─ Payment ── amount · method · paid date · source · evidence
 │   ├─ Allocation(s)
 │   └─ Receipt snapshot
 └─ Storage case
     ├─ readiness + customer-delay witnesses
     ├─ effective rule snapshot + product-group charge(s)
     ├─ free-storage request/decision
     └─ invoice(s) · payment(s) · receipt(s)
```

All entry paths use one Payment posting service and idempotency key. Operation may post money
received in delivery/storage; Payment Duty may post normal collection. Neither writes a second
`orders.paid` truth or receipt identity.

`outstanding = issued live invoice obligations − canonical allocated money received`.
Unknown and zero differ. No screen recalculates outstanding or storage independently.

One successful `Record payment` atomically creates Payment, allocates it, updates derived
outstanding, mints one receipt, appends SO activity, and closes/recalculates Work. Failure rolls
everything back. Partial payment keeps the remainder open.

## 3 · Collection lifecycle and UI

`Finance → Payments` has **Payments** and **Invoices** listings. Payment actions live only in
shared **Work → My Work / Team Work**. Settings and Reports use their shared destinations.
There is no Payment Monitor, Dashboard, module-local Work page or KPI preamble. Payments and
Invoices Registers have no left filter rail. The Calendar view uses the dated owner ruling in
§17; this does not create another Work owner or replace the Registers.

Shared Payment Work sorts by risk: delivery tomorrow and unpaid; storage holding the DO; missed promise;
balance entering its collection window; then balance with no delivery date. A row shows SO,
customer, goods readiness, delivery date, amount and one next action. Object/customer/owner are
not repeated in the action sentence.

The shared collection clock uses the customer-confirmed delivery date, else promised date, on the
Mon–Sat Malaysian working calendar: T−3 is attention; **T−2 is the payment deadline**; T−1 and
later while owing is already `should have been paid`. No delivery anchor means no clock.

Staff record a structured result: `Customer paid` · `Customer will pay on a date` · `Customer
needs help` · `Customer disputes the amount` · `Customer did not answer`. The system creates the
next action. `Done` never replaces authoritative completion.

The posting form pre-fills SO, customer, invoice, current amount, today and oldest-unpaid
allocation. Staff confirm amount, date, method, reference and evidence. The result is **Payment
recorded**, never **Bank confirmed**.

Operation uploads evidence received. Finance checks the bank outside daily Payment. Delivery
continues from recorded money unless Finance explicitly raises an open Finance Exception. Carres
has no observed fake-receipt case; the product does not invent a routine gate for one.

## 4 · Documents

- Invoice asks for money; Receipt proves money was recorded.
- Sales Invoice, Storage Invoice and Additional Storage Invoice use one governed numbering and
  immutable document service.
- An issued invoice is never edited; correction voids it and issues a linked replacement.
- One payment may cover several invoices; its one receipt lists the allocations.
- Reprint uses the same number/snapshot. Voided Payment keeps a visible `VOIDED` receipt.
- SO detail reads `Invoice → Payment → Receipt` from the same canonical records.

## 5 · Payment exceptions

- Likely duplicate: compare customer, amount, paid date and reference; staff must inspect the
  earlier payment before privileged continuation.
- Partial: record actual amount; keep remaining collection open.
- Overpayment/unallocated: record actual money, allocate valid obligation, show `RM {amount} needs
  review`; never auto-create Customer Credit or Refund.
- Wrong allocation: `Correct allocation` preserves before/after, actor, time and reason.
- Wrong/duplicate posting: Payment Approver uses `Void payment`; original and reason remain.
- There is no delete, silent amount edit or ordinary Negative Payment control.

## 6 · Storage trigger and customer evidence

Storage begins only when both facts exist: **Carres can complete the agreed delivery scope** and
**the customer delays/refuses it or will not arrange receipt**. Storage Start is the later fact.
Supplier/Carres delay and goods-not-ready days are never charged. The system derives the date;
staff cannot key an earlier one.

The first valid Storage Start is permanent. Later delay never resets it, a free period or a cycle.

During the delivery-window call, Operation sends the prepared `Request a later delivery date`
form. Customer supplies new date, structured reason, acknowledgement of shown storage terms and,
where eligible, a free-storage request. Submitted form is default evidence; uploaded WhatsApp
written confirmation is the fallback. Telephone alone cannot formally change the date or obtain
free storage.

Customer refusal/non-response does not stop the clock once readiness plus customer delay is
witnessed. Original delivery date remains until written confirmation; no written request means no
free-storage approval.

At Storage Start, Warehouse records location, packaging, condition, photos, actor and date. Every
configured inspection interval (currently 30 days) raises `Check the stored furniture`. Damage
opens Service Case/Issue, not a Payment note.

## 7 · Storage commercial rule

Rates apply per customer order and **product group**, never quantity:

| Product group | Automatic free | Charge after free | Extra-free authority |
|---|---:|---:|---|
| Mattress / bedframe | 14 calendar days | RM150 per commenced 30-day period | Operation through total day 21; Storage Waiver Approver through total day 30 |
| Sofa | 14 calendar days | RM200 per commenced 14-day period | None |

Mattress plus bedframe is one RM150 group; either alone is also one group. Mixed orders add groups.
An approved free-until date becomes that group's free end; its first cycle starts next day.

```text
Mattress/bedframe default: day 1–14 RM0 · 15–44 RM150 · 45–74 RM300
Approved through day 21:   day 1–21 RM0 · 22–51 RM150 · 52–81 RM300
Sofa:                      day 1–14 RM0 · 15–28 RM200 · 29–42 RM400
```

Approval limits count total days from Storage Start, not extra days. From day 31,
mattress/bedframe has no ordinary free approval. Sofa never offers extra free storage.

A group ends only when its last item leaves Carres through authoritative delivery/collection
evidence. Planned date is not completion. Carres-caused non-delivery days are excluded. Each group
in mixed/partial delivery ends separately.

During storage show `Storage charge so far`. Once delivery is confirmed, calculate through that
date, issue Storage Invoice and collect before delivery. If customer delays after issue/payment,
keep the old invoice immutable and issue Additional Storage Invoice for only the new amount. A
live storage invoice holds the DO. Under the locked 2026-09-01 Sales Order money gate, full money
must be in before delivery and there is no live unpaid-release request door.

## 8 · Free-storage journey

The customer form shows the exact free-until date, rate and period in Primary School English and
says request is not approval.

```text
Mattress/bedframe day 1–14 automatic
day 15–21 Operation may approve written request
day 22–30 Storage Waiver Approver decides
day 31+ ordinary free request unavailable
Sofa day 1–14 automatic; day 15+ ordinary free request unavailable
```

Operation decision is due same working day; Storage Waiver Approver by next working day and before
requested delivery. Pending says `Free storage is not confirmed`; estimated charge continues.
Decision stores request, requested/approved end, decision, actor, time and notification evidence.
Approval requires an exact end date.

Operation sends the prepared decision message. Completion is message-sent or WhatsApp evidence,
not `Done`.

At sofa day 14 and mattress/bedframe day 30, `Arrange delivery and collect RM {amount}` becomes
urgent. Continued non-arrangement escalates with exact days and amount. The system invents no
cancellation, disposal or resale authority.

## 9 · Delivery service charge seam

Delivery Operations records partner, destination, floor, quantity, carry-up, dismantle,
disposal/take-out, actual service and evidence. Normal delivery does not wait for quote/price.
After service, Operation may upload the partner's actual cost and negotiate disputed partner cost.

Finance/Commercial authority owns customer invoice total, invoice-value percentage, RM2,000
boundary, SST, currency, customer-charge calculation, approval and correction. Operation never
changes those customer-money inputs. `Customer charge being checked` does not block Delivery.
Confirmed customer charge flows to Payment for invoice/collection. Only exceptional extra service
explicitly requiring a quote gains a quote step.

## 10 · Work Engine contract

Every action has Trigger · Owner rule · Resolved owner · Action · Completion fact · Due · Source
object · Cover rule. Object identity is row/card header; owner is metadata/avatar; sentence is act.

| Trigger | Owner rule | Action | Completion |
|---|---|---|---|
| Balance in window | Payment Duty | `Ask the customer to pay` | outstanding = RM0 |
| Missed promise | Payment Duty | same, should-have-been-done state | outstanding = RM0 |
| Storage invoice live | responsible Delivery Operation | `Send the invoice and collect payment` | invoice fully paid |
| Free request through day 21 | responsible Delivery Operation | `Review the free storage request` | decision exists |
| Free request day 22–30 | Storage Waiver Approver | same | decision exists |
| Overpaid/unallocated money | Payment Approver | `Review RM {amount}` | allocated/classified |
| Suspected wrong/duplicate | Payment Approver | `Review payment RM {amount}` | distinct/corrected/voided |
| Finance Exception | Finance Control Duty | `Review payment evidence` | exception resolved |

My Work omits self avatar; Team Work groups by owner. Cover preserves normal owner, today's cover
and actor. Summaries name work: `5 customer balances need collection`, `2 storage payments need
collection`, `1 customer promise was missed`. `8 open · 2 late` is forbidden.

## 11 · History, calendar and reports

History is append-only/filterable by date, customer, SO, amount, method, invoice, receipt, actor and
exception, and links immutable documents/source SO. Calendar shows dated promise/deadline,
free end, charge start and approved-free end, plus read-only Expected arrival and Customer Delivery
context under §17. Payment record is not a calendar event. Quick Rail
uses concrete copy and source deep-link.

One read-only customer statement derives invoices, allocations, payments, voids and amount needed.
Read-only reports/export: Money received · Customer balances · Storage charged/collected/waived
with reason/approver · Payment corrections · Money needing review. No Refund report or Bank
Matching workspace.

## 12 · Settings, duties and permissions

`Settings → Payment` owns receiving bank accounts, source-based bank routing, active manual payment
methods, versioned WhatsApp templates, automatic document numbering and effective-dated storage values:
free days, amount, cycle, Operation limit, Storage Waiver Approver limit, extra-free allowed, long-storage warning
and inspection interval per Catalog group. Only manager permission edits them. Every change keeps
old/new, actor, time and effective date. Storage Start snapshots the then-effective rule; later
changes never recalculate old cases/invoices. Validate free ≤ Operation ≤ manager where enabled.

Payment reads Calendar, Catalog category, Workspace duty/cover, Delivery/Order facts and
Stock/Warehouse facts; it never duplicates them.

Sales Orders owns the hard gate and reads Payment's one answer: the DO requires outstanding = RM0
and no open Finance Exception. A storage waiver changes the governed receivable; it is not an
unpaid-delivery release.

| Duty/role | Authority |
|---|---|
| Payment Duty | normal collection/posting/receipt |
| responsible Delivery Operation | delivery/storage contact, send invoice, evidence, normal posting |
| Storage Waiver Approver | mattress/bedframe day 22–30 decision |
| Payment Approver | void, reallocation, overpayment review |
| Finance | read/export, external bank control, Finance Exception |
| Manager | Payment settings; Workspace still owns duty assignment |

## 13 · Intentional rejects and exceptional refund

No routine Refund queue/page/action/report; Negative Payment; automatic Customer Credit; full Bank
Matching workspace; supplier AP; arbitrary outstanding/storage edit; direct staff `No storage`;
delete Payment; or universal SO Owner.

Carres has no-refund policy. The single known mattress-sagging refund was exceptional: Service
Case/Operation handled customer/application, Management decided, Finance transferred externally,
Operation informed customer. Payment may show linked read-only history; it does not generalise it.

## 14 · Current build truth

**OVERALL PAYMENT DELIVERY STATUS: PARTIALLY DELIVERED.** The posting core is
production-verified and the §16/§17 registers, objects, actions, Settings and Calendar are
deployed with exact-SHA proof and local walks, but the governed acceptance is not complete:
the authenticated production walk, the complete §16 message assembly (blocked on the
owner-approved Important Notes wording), Reports, Stripe convergence, the storage journeys and
the Refund/Recon retirement remain open below.

### Production-verified — Customer payment posting convergence

Every current customer-order money entrance delegates to the canonical `_customer_payment_post`
transaction: Finance receipt, operational/manual Payment, Sales/POS top-up and customer Stripe
checkout. Source channel plus idempotency key prevents a retry from recording money twice. One
successful transaction creates the canonical Payment, its allocation, one receipt identity, the
derived `orders.paid` change and one Order activity fact; failure rolls the transaction back.

The old generic `payments` table cannot accept new incoming customer-order money. Existing Finance
receipt history was linked into the canonical ledger without increasing paid money again. A void
preserves the Payment and reverses its live allocation and paid contribution; there is no delete.
All current money readers and the Delivery gate derive from the same paid truth.

Production evidence, reconfirmed 2026-09-03: migration
`0351_customer_payment_posting_convergence.sql` is on `main`; focused API tests prove every posting
entrance, idempotency mapping, role gate and void contract; focused web tests prove the shared money
states and Finance reader; the production ERP, POS, both Pages projects and API Worker reported the
same deployed `main` SHA.

### Deployed — the Payments Register answers the Finance door, 2026-09-06

PR #1104 merged as `caebd3e3` and the production deploy converged that exact SHA on the ERP
page, the POS page and the API Worker; the served bundle carries the Register's own strings.
`Finance → Payments` opens the canonical receipt Register: fail-closed paginated
`GET /finance/payments/register`, six approved columns with sticky Receipt No, view-scoped
selection/export retaining the VOIDED mark, void-aware footer total, read-only Inspect and the
one-scroll payment object. The sidebar row says the governed word `Payments`; the Phase-5
bucket page left the route. The shared Order/Work action engine now checks collection
readiness: goods not ready with no usable arrival date creates no collection action; arrival
confirmation creates it; delivered balances stay collectible. No money arithmetic or Delivery
gate changed. An authenticated owner walk of the live page is still owed; exact-SHA and bundle
evidence are the current production proof.

### Deployed — invoice lifecycle and the Invoices Register, 2026-09-06

Migration `0429` is APPLIED (tracker tail confirmed) and PR #1108 merged as `60e8814c`;
the ERP page, POS page and API Worker converged that exact SHA and the served bundle carries
the Invoices Register's own strings. `invoices` now carries the governed lifecycle: kind
(Sales/Storage/Additional Storage), draft → issued → voided status, immutable issue snapshot,
void reason/actors and the replacement lineage; one live Sales Invoice per order; allocations
may name an invoice. `payment_invoice_prepare` drafts idempotently, `payment_invoice_issue`
mints the governed `INV-DDMMYY-NNNN` number and freezes the snapshot, and
`payment_invoice_void_replace` — Payment Approver duty via the Shared Duty Resolver, or
principal — voids with a required reason and drafts the linked replacement. The dispatch
trigger adopts a prepared live invoice instead of minting a twin. `Finance → Invoices` opens
the §16 Register (eight approved columns; Needed/Goods/arrival/timing derived through the one
shared `orderMoney`/`collectionClock` arithmetic), read-only Inspect, and the one-scroll
invoice object with honest empty states. The rolled-back production probe's negative controls
were run before apply; an authenticated owner walk is still owed.

### Deployed — record payment, and a void wears its reason, 2026-09-06

Migration `0430` is APPLIED and PR #1110 merged as `124140a5` (deploy convergence in
progress at this edit; the closure note carries the proof). `payment_void` requires a reason
and gates on Payment Approver duty (Shared Duty Resolver) or principal; the posting service +
column CHECK speak the §16 manual methods (`duitnow_qr` · `credit_card` · `debit_card`) with
the arithmetic byte-for-byte 0351. The Invoice object carries the §16 Record payment
composition — 50/50 action-and-receipt-preview, the six manual methods with their required
evidence words, Review stating `This records customer money.` / `This does not confirm the
bank account.`, one idempotency key per opening, upload-first posting through the canonical
door, and typed input retained on failure. The void doors in the order drawer and control
panel ask the reason inline. `/finance/*` admits operation staff to the Payments and Invoices
destinations only (§12); finance-only pages bounce them.

### Merged — Payment Settings foundation, 2026-09-06

Migration `0431` is APPLIED and PR #1112 merged as `f43bdbf9` (the rolled-back production
probe proved the manager gate refuses a non-manager, saves keep old/new/actor in the change
log, and the last Active method cannot be switched off). `Settings → Payment` has its storage:
receiving bank accounts keyed by the governed routing source (PJ own-showroom → Hong Leong
Bank · Dealer → RHB — the BANKS are seeded approved truth, the account numbers are the
manager's to enter), the six §16 manual methods with Active flags (`online` deliberately has
no row), and append-only effective-dated §7 storage rules seeded with the approved rates. The
Settings Workspace gains the Payment section: readable summaries, focused bank-account Edit,
method toggles, the two storage cards, and the numbering summary that says only the next
example and `Numbers are created automatically.` Record payment's method list now reads the
Active set. No approver name, Payment Duty or roster appears in Payment Settings.

### Deployed — a sent message is recorded with its proof, 2026-09-06

Migration `0434` is APPLIED and PR #1114 merged as `52659282`; production converged that
exact SHA. The rolled-back production probe proved a screenshotless record is refused, a
cross-order invoice is refused, and a real record lands
with its proof, the order-history fact and the shared chase stamp. The migration creates
`payment_communications`, the append-only sent-message ledger, and
`payment_record_message_sent`, its one recording door. The Invoice object gains
`Ask the customer to pay` — the door exists only when the shared clock says due or late, never
while `Wait` — opening the 50/50 message composition: editable ordinary wording beside the
real message the customer receives, Copy message → Open WhatsApp → Upload sent screenshot →
Record message sent. Opening WhatsApp records nothing. Communication History renders the
ledger. The message body is the CURRENT locked customer template (Jess 2026-07-13); the
complete §16 payment message swaps in when its owner-approved Important Notes wording
arrives — the bottom rules are never invented or shortened. `waLink` converged from two
page-local copies into the one shared implementation.

### Deployed — the invoice document prints from its snapshot, and the §17 Calendar, 2026-09-06

PR #1115 merged as `53853a12` and production converged that exact SHA (ERP page + Worker); PR
#1114 (`52659282` — the sent-message ledger and Ask the customer to pay, migration 0434
applied) converged before it. `GET /finance/invoices/:id/document` serves the issued
invoice's IMMUTABLE snapshot as the governed InvoiceTemplate data (a voided invoice keeps its
paper and says VOIDED in the title; a pre-0429 invoice has no snapshot, falls back to a live
read and says so); the Invoice object header gains the direct `Print` output. The §17 Calendar
navigation is built as ruled: Customer/SO/Invoice cells open the collection details (never an
automatic Calendar switch); a Customer Delivery or Expected arrival date cell opens the
Calendar at that date's fixed workweek with the exact SO highlighted and the Expected arrival
label explicit; a record without a usable date keeps its honest words and no door. The
Calendar view: 240px rail with the complete month fixed on top (arrows one month at a time),
business date filters scrolling below, one fixed Mon–Sun workweek with Sunday visible and
muted as `not a working day` (Malaysian holidays too), the selected date on the blue token,
every indicator carrying words. Entries are read-only facts from their authoritative owners;
an Expected arrival entry creates no deadline and no chase, and voided invoices place nothing.

### Deployed — the template library keeps every version, 2026-09-06

Migration `0435` is APPLIED and PR #1116 merged as `012887af`; production converged that exact
SHA. The rolled-back production probe proved: a non-manager is refused, an edit appends
version 2 while version 1 stays history, one Default per purpose holds, and an inactive
template cannot be the Default. The migration creates
`payment_message_templates`, the append-only version store, and its three manager doors
(save · set default · set active) through the same settings gate and change log. Seeds carry
ONLY the two already-locked customer wordings (Jess 2026-07-13) as the `Gentle reminder` and
`Payment should have been received` Defaults, with protected merge fields
`{customer} {ref} {outstanding} {items}`; every other governed purpose says
`No template yet. The approved wording must come from its owner.` — nothing invents customer
copy. `Settings → Payment → WhatsApp templates` gains the library: heads under the governed
§16 purpose words, New template · Duplicate · Edit · Set as default · Make inactive · View
history, and the governed 50/50 editor (ordinary wording left, real preview right, protected
fields, a lost amount field blocks Review, Review changes before Save). `Ask the customer to
pay` now recommends the Default template from the shared clock's answer, offers
`Change template` across Active templates, renders protected fields from structured facts,
and falls back to the built-in locked wording when the library is unreachable.

### Deployed — Send receipt, 2026-09-06

PR #1118 merged as `314b3d87` (no migration): after a successful posting, the done panel says Payment
recorded · Receipt number · Amount still needed and offers **Send receipt** — template-driven
ONLY. A full payment recommends the `Payment received` template, a partial one
`Partial payment received`; the composition renders the manager's wording with the receipt
facts (`{receipt_no}` `{amount}` `{still_needed}` join the protected fields) and records into
the immutable ledger as kind `receipt` with the sent-screenshot proof. With no Active receipt
template the panel says `No receipt template yet. Ask a manager to add the approved wording
in Settings.` — nothing invents customer copy.

### Deployed — the Calendar review corrections, 2026-09-07

The #1115 review found five gaps; the correction rebuilds the Calendar view on the kit's ONE
pinned `MonthCalendar` primitive (shared with Receiving and Delivery) instead of the
hand-rolled month grid. Built and locally verified (13 focused Calendar tests, 364 web tests
across every MonthCalendar consumer, design guard clean, walked at desktop, 390px and a
640px ≈200%-zoom viewport with no horizontal scroll):

- **Sunday-first month** with `SUN MON TUE WED THU FRI SAT` three-letter headings — the kit
  formatter now says the short weekday name, never a single ambiguous letter.
- **`‹ Previous week` / `Next week ›`** stand beside the week range and move exactly one
  fixed Mon–Sun workweek.
- **Filter → listing → Calendar**: a business date filter (Customer Delivery · Expected
  arrival — Payment-owned words only, no Delivery logistics-assignment copied) opens its
  dated LISTING while the complete month stays visible and its markers follow the filter;
  choosing any month date returns to Calendar at that week. `All dates` is the Calendar.
- **One SO, once — and the money is the SO across kinds**: entries dedupe on SO · date ·
  type, so an SO carrying Sales, Storage and Additional Storage invoices is ONE Customer
  Delivery and ONE Expected arrival; the Sales invoice is the door and the other obligations
  stay reachable through the Register and the opened details. The card's amount is the
  shared `soRemaining` derivation — goods value from the same `orderMoney` stores as
  `Needed`, PLUS the SO's live ISSUED storage-kind invoice obligations with their tax
  (a draft asks for nothing, a voided one is dead), MINUS `orders.paid` subtracted exactly
  ONCE (the Work engine's combined law), so the Sales door never hides an unpaid storage
  obligation and a payment posted against a storage invoice is never double-counted. Proven
  by the fixture the review asked for: all three kinds + partial payment + a voided
  obligation asserts RM 758 from goods 1,000 + live storage 158 − paid 400, with the
  never-values (600 · 858 · 918 · 508) each excluded, and the paid-past-goods case (1,100)
  spills into storage (58) instead of inflating it.
- **The kit fix the correction surfaced**: `MonthCalendar` passed no `onSelect` to
  `react-day-picker` v10, so selection was internal-state only and a day set from OUTSIDE
  (a register date door, a week arrow) never repainted; it now uses DayPicker's own
  controlled `onSelect`, keeping the pick-again-clears contract for every consumer.

PR #1124 merged as `4d717422` and the ERP page, POS page and API Worker all reported that
exact SHA. The verification evidence, each result stated for exactly what it proves:

- **Production DOM-interaction walk — DONE** (same day, through the operator's signed-in
  browser session): the live Register's Customer Delivery cell opened the Calendar at its
  fixed workweek with the exact SO highlighted; the month headed `Sun Mon Tue Wed Thu Fri
  Sat`; `‹ Previous week` moved the week and the month repainted its selected day (the
  controlled-selection kit fix, live); the filter opened its dated listing with the month
  visible; a month date returned to Calendar with `All dates` active. This proves the
  interactions; it does NOT prove visual layout.
- **Production VISUAL inspection — NOT DONE, precise blocker**: the authenticated session
  exists only in the owner's own browser, whose window is minimised (a zero-width window
  cannot be captured), and signing in from any automated browser would mean handling the
  owner's credentials, which is refused on principle. One owner action clears it: keep a
  normal-sized signed-in window open and ask for the visual pass.
- **200% zoom — layout-equivalent evidence, not native-zoom acceptance**: a browser's 200%
  page zoom on a 1280px window lays out at a 640px viewport, and that exact walk ran locally
  at 640×400 — week navigation, month repaint, filter → listing with the month visible,
  month-date return, ZERO elements clipped outside the viewport, no horizontal scroll, and
  the filter list owns its own scroller with the month outside it (fixed). Neither
  automation surface can drive the browser-chrome zoom control itself, and a CSS `zoom`
  emulation was rejected as evidence because it does not re-evaluate media queries the way
  real page zoom does — so glyph rasterisation at true 200% remains unexercised and this is
  recorded as layout-equivalent proof, not full visual acceptance.
- The multi-invoice dedupe could not be exercised on production data (one live invoice, and
  every live row is TEST data): its proof is the shared-arithmetic fixture tests and the
  local multi-invoice fixture walk, where the deduped SO card said RM 2,350 = goods 5,400 +
  storage 150 − paid 3,200.

### Outstanding governed acceptance — why the status stays PARTIALLY DELIVERED

Message assembly with bank routing and Partner contact, Reports, Stripe convergence, storage
journeys and the retirement of the rejected Refund/Bank Matching surfaces remain unfinished
target work. The complete approved customer
Important Notes wording has not been located in the repository and has been requested from its
owner; it must not be invented or shortened during implementation — the manager can also paste
it into a `Standard bank transfer` template once approved. The Calendar correction's
production DOM-interaction walk is done (above); the production VISUAL pass (blocked on a
visible signed-in owner window), a native-zoom 200% pass, an owner walk of the whole Payment
surface and the remaining target work keep the overall status PARTIALLY DELIVERED.

### Approved target / not claimed built by this scope

Payments + Invoices Registers and full-width object UI; structured collection outcomes and promise-to-pay; immutable
invoice/receipt snapshots beyond the present receipt identity; overpayment/reallocation review;
Payment-owned storage rules, requests, invoices and settings; global Duty/cover; complete reports;
and retirement of the rejected routine Refund/Bank Matching/Negative Payment surfaces remain
approved target work. Their absence does not reopen this production-verified posting contract.

## 15 · Migration and module done-when

Adapt 2990's useful lineage: SO → DO → Sales Invoice → canonical Payment → Receipt, ledger-derived
balance, history and export. Reject its routine negative-payment/refund/credit surface.

Cutover: inventory writers/documents → reconcile balance/evidence → route through canonical service
→ prove parity/idempotency → make old forms read-only → retire duplicates only under separate live
authorisation. The 2026-09-06 BUILD/DELIVERY instruction authorises implementation, PR delivery, governed merge,
deployment and authenticated verification. It does not authorise customer messages, deletion or
fabricated payment/communication evidence.

Done means production proves one writer/arithmetic; atomic posting; Payments + Invoices Registers; system-led
Primary School English actions; global Duty/cover; approved storage trigger/rates/customer evidence/
tiered waiver/per-group clock/incremental invoices; effective snapshots; Delivery/Finance boundary;
append-only exceptions/reports; and no re-entry of rejected Refund/Bank Matching/Negative Payment.


## 16 · Locked Payment UI delivery contract — owner instruction 2026-09-06

### Register and Inspect

Use the UI MASTER Register Shell: 50px destination header `Payments` with global utilities only;
45px toolbar with `Payments · Invoices` at left and Search, Export, Columns at right. No
`New Payment`. Column filters live in table headers. Selection replaces the same toolbar in place.
The footer names visible record count and money total. The first data identity remains sticky.
At 390px and 200% zoom preserve one semantic Register with governed horizontal scrolling.

Payments defaults, in order: `Receipt No · Paid Date · Customer · SO No · Amount · Method`.
Do not repeat `Recorded`; show factual `VOIDED` or `RM {amount} needs review` only when true.
Invoices defaults: `Invoice No · Customer · SO No · Needed · Goods · Expected arrival ·
Customer Delivery · Payment Timing`. Goods copy: `Goods ready`, `Arriving Monday, 7 Sep`,
`Arrival not confirmed`.

Expansion is read-only Inspect. Payment Inspect shows allocation, evidence, recorded time/actor
and `Open payment`. Invoice Inspect shows money, goods, delivery, Logistics Partner/customer
contact, latest communication and `Open invoice`. No Record, Edit, Void or WhatsApp-send controls.

### Object views and action composition

Ordinary View is full-width, one continuous scroll. Payment order: Payment facts → Allocated to →
Evidence → Receipt → History. Persistent identity: Receipt No · Customer, source SO and factual
state. Print is direct output. Authorised Correct allocation / Void payment live in header overflow;
unauthorised staff never see them. A void preserves the original Receipt with VOIDED, reason and history.

Invoice order: Money → Goods and Delivery → What to do → Invoice → Related Payments → Communication
History. Check money, goods readiness/arrival and customer Delivery before creating collection Work.
When goods are not ready and arrival is unknown, show `Wait`; never create a blind payment chase.
Draft may be edited and issued. Issued Invoice has no ordinary Edit; correction voids the old
Invoice and creates a linked replacement.

50/50 is used only while editing a customer-facing message/Invoice, recording Payment, or sending
Invoice/Receipt. Narrow widths stack action/form first, customer document/message preview second.

### Bank transfer and evidence

Shared Work opens Invoice → prepared WhatsApp → staff sends → customer returns slip in WhatsApp →
staff uploads it in the same Invoice → Review payment → Record payment → atomic Payment,
allocation, outstanding, Receipt, History and Work closure → Send receipt.
Uploading evidence is not Payment or Bank confirmed. Review explicitly states:
`This records customer money.` / `This does not confirm the bank account.`
Operation uploads; Finance checks the external bank separately. Only a real Finance Exception
stops Delivery. Failed atomic posting retains entered information and writes none of the results.

Order source selects bank automatically: PJ own-showroom → configured Hong Leong Bank; Dealer →
configured RHB. Staff cannot choose/type an account ad hoc. Account details belong in Settings.
Payment live-reads the assigned Partner customer-facing contact from Delivery Settings. Approved
contacts remain owned there: NETS 012-474 9881; AL 011-1268 7582; TEOW 016-703 3373;
TT 011-1778 7883; EU 012-942 7922; HOUZS 011-1110 8855. Missing Partner number uses the
configured Carres Delivery Line 011-1225 7456. Never expose an internal Partner WhatsApp group.

### Messages and template library

Preserve the complete approved customer message: customer, Delivery date/range, amount needed,
correct bank/link, slip instruction where applicable, assigned Partner, Partner's 1–3-day contact
statement, customer-facing number, and complete Important Notes/storage rules. Never shorten by
removing bottom rules. Actual sent messages and template versions are immutable history.

Sending: Edit message → Copy message → Open WhatsApp → Upload sent screenshot → Record message sent.
Opening WhatsApp alone is neither sent nor read. Ordinary wording is editable for one message;
amount, bank, Delivery date, Partner contact and charge facts remain protected source fields.

Settings → Payment → WhatsApp Templates holds multiple named Active templates per purpose and one
Default per governed situation. Structured facts recommend a template; `Change template` chooses
another Active template. Examples: Standard bank transfer, Gentle reminder, Payment should have
been received, Customer promised to pay, Standard payment link, New link after expiry, Payment
received, Partial payment received. Manager actions: New template, Duplicate, Edit, Set as default,
Make inactive, View history. Template Edit uses 50/50 ordinary wording and real preview; protected
merge fields; required-field checks before Review; Review changes before Save.

### Online link and Receipt

Converge existing Stripe-hosted checkout through the canonical posting service. Create payment link
shows amount, `Waiting for payment`, exact expiry → Copy payment message → Open WhatsApp → Upload
sent screenshot → Record link sent. Created/sent/opened is not Payment. Only successful provider
callback/poll posts Payment and Receipt atomically. Unpaid expiry says `Payment link expired`,
`Amount needed remains unchanged`, `Create a new payment link`. No general Customer Portal.

Successful posting shows Payment recorded, Receipt number, Amount still needed, Open receipt,
Send receipt. Receipt message includes amount received, Receipt number, actual remainder,
Delivery date/range, Partner's 1–3-day contact statement and customer contact. Full payment says
`Amount still needed: RM0`. Sending requires sent proof. Preserve the earlier complete Payment
message and Important Notes in Communication History.

### Methods, Settings, Reports and states

Selectable Active manual methods and required evidence: Bank transfer — transfer slip;
DuitNow QR — payment screenshot; Cheque — cheque photo and cheque number; Cash — cash collection
proof; Credit card / Debit card — terminal receipt and approval code. Online payment is provider-
recorded and is never a manual method. Cash never bypasses the paid-before-delivery gate.

Settings groups: Receiving bank accounts; Which bank to use; Payment methods; WhatsApp templates;
Invoice and Receipt numbers; Storage charges. Default View uses readable summaries and focused
Edit / Review changes, not raw fields. Numbering shows only next example and
`Numbers are created automatically.` No prefix, sequence length, year/month toggle, reset or
per-document number editing. No named approver, Payment Duty or staff roster in Payment Settings.

Storage cards are separate. Mattress / Bedframe: 14 calendar days free; RM150 every 30 calendar
days; Operation through Day 21; Storage Waiver Approver through Day 30; inspection every 30 days.
Sofa: 14 days free; RM200 every 14 calendar days; extra free storage not allowed; inspection every
30 days. Existing cases keep the Storage Start rule snapshot. Shared Staff & Duties resolves people.

Shared Reports → Payment: Money received; Customer balances; Storage charged and collected;
Storage waived; Payment corrections; Money needing review. No Refund, Bank Matching or Negative
Payment report. Loading, empty, error, stale and permission states use Primary School English.
Upload, Review, Record, Send, Back and recovery remain usable at 390px and 200% zoom.

## 17 · Calendar navigation — owner-approved target, 2026-09-06

**RULING / APPROVED TARGET, NOT CLAIMED BUILT.** The owner approved the recommendation:
click a customer or document to inspect the relevant collection object; click a date to see its
schedule. This supersedes the earlier suggestion that clicking a customer automatically switches
to Calendar and chooses Delivery before Expected arrival. It qualifies the earlier blanket
no-left-rail wording only for the Calendar view. Payments / Invoices remain Registers.

| Selection | Required result |
|---|---|
| Customer / SO / Invoice in the collection listing | Open the corresponding order's collection details, including money needed, goods arrival and delivery facts; preserve the selected SO identity when a customer has several orders |
| Customer Delivery date | Open Calendar at that date's fixed workweek and highlight the selected SO |
| Expected arrival date | Open Calendar at that date's fixed workweek and highlight the selected SO; explicitly label Expected arrival |
| Date in the left month calendar | Show the fixed workweek containing that date |
| Record without a relevant date | Keep it available in the listing, explain the missing date, and never invent a calendar position |

The Calendar view uses the owner-described shared composition: 240px page rail with a complete
month fixed at its top, month arrows moving one month at a time, and business filters scrolling
vertically below it independently. Sunday remains visible and is muted when non-working. The
selected date uses the standard blue selection token. A work indicator must have a textual or
accessible explanation and must not rely on colour alone. The right side shows a fixed workweek,
without infinite horizontal scrolling. Choosing a business listing filter keeps the month visible;
choosing a month date returns to Calendar. Apply the shared responsive authority at narrow widths.

Expected arrival, Customer Delivery and collection follow-up are distinct date types. Read arrival
and delivery facts from their authoritative modules; never create editable copies in Payment.
Appearance on an Expected arrival date does not itself create a collection deadline or chase.
Preserve the shared collection clock and readiness rules, including Wait when goods are not ready
and arrival is unconfirmed. Do not merge two dated facts for one SO into two apparent payments.

This ruling specifies Payment's Calendar interaction and source boundaries. It does not introduce
a Payment Monitor, module-local Work queue, new sidebar destination or changes to other modules.
Implementation and production verification remain required; this documentation is not delivery proof.
