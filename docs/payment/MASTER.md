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

### Deployed — Reports → Payment, 2026-09-07

`Finance → Reports` gains the Payment door and `/finance/reports/payment` renders the six
approved §16 listings — Money received · Customer balances · Storage charged and collected ·
Storage waived · Payment corrections · Money needing review — and never a Refund, Bank
Matching or Negative Payment report. The governed report laws hold: the page STORES NOTHING
(one read of the same payments wire the Payments Register reads, one read of the same
invoices wire the Invoices Register reads, every figure computed at render time by the
shared `soRemaining`/`isLivePayment` arithmetic); EVERY ROW IS A DOOR (a payment opens its
record at `?payment=`, an SO opens its collection object at `?invoice=`); EVERY EXCLUSION IS
SAID ON SCREEN (voided payments out of Money received, settled and unpriced orders out of
Customer balances with the unpriced count, drafts out of Storage). The month filter governs
the dated sections; balances, storage and review money are today's facts and say so.
`soRemaining` gains the `overpaid` field — money past every recorded obligation — which
feeds `RM {amount} needs review` (§5) without a second arithmetic. Storage waived states
honestly that the waiver journey is not built. The page stays finance-only under the §12
door (operation staff reach Payments and Invoices only). Verified by 9 focused report tests
(102 finance page tests green), a preview walk of all six sections with fixture data, and
390px/640px checks with zero clipped elements. PR #1130 merged as `da00900f`; the live SHA
carries it on the ERP page, POS page and Worker (ancestry-verified — a sibling push had
cancelled the exact-SHA run). Production-walked through the signed-in session: all six
heads render, the exclusion sentences are on screen, the month control stands, a balance
row doors to its invoice object, and SO-1313 said the SAME number the Calendar says —
Law D holding live.

### Deployed — the Online link journey on the Invoice, 2026-09-07

The §16 "Online link and Receipt" operator journey is built around the ALREADY-converged
Stripe checkout (0223 → 0351 — only a successful provider callback/poll posts Payment and
Receipt atomically; nothing here re-touches money). The Invoice object gains
`Create payment link` for the posting door's staff: create shows the amount (prefilled from
the shared goods outstanding the server cap enforces), then the standing link says
`Waiting for payment` · the amount · the exact expiry, and the sending sequence is the
governed Copy payment message → Open WhatsApp → Upload sent screenshot → Record link sent
(into the immutable communications ledger; created, sent or opened is NOT Payment and the
card says so). The customer message is TEMPLATE-DRIVEN ONLY — `Standard payment link`, with
`New link after expiry` recommended after one died; with no Active template nothing invents
customer wording: the page says the owner's words are owed and only the bare link URL (a
fact, not wording) can be copied. An unpaid expiry says `Payment link expired` ·
`Amount needed remains unchanged.` · `Create a new payment link`; a paid one says
`Payment recorded` with the remainder. While a link stands open the composition polls the
reconcile route, so a counter payment records within one poll even before the webhook. The
API gains read-only `GET /orders/:id/stripe/checkout` (the order's recent links, RLS-gated
on the order read) — no migration. Verified by 8 focused composition tests + 2 API route
tests (31 stripe route tests green). PR #1131 merged as `b3fc3c3b`; the live SHA carries it
on all three surfaces (ancestry-verified). Production-walked through the signed-in session:
the `Create payment link` door stands on the invoice header, the composition renders with
the amount prefilled from the shared outstanding (RM 2,499 on the walk invoice) and the
honest empty preview — no real Stripe link was minted during the walk, deliberately.

### Deployed — the storage case foundation, 2026-09-07

Migration `0436` creates `payment_storage_cases` — one case per order + product group,
FOREVER — and its two doors. The §6 truth is structural: a case is born only from BOTH
witnessed facts (Carres can complete the delivery scope · the customer delays it), the
system derives Storage Start as the LATER fact (a CHECK pins it; staff cannot key an
earlier one), the first valid start is permanent (a second start for the same order + group
is refused by the unique constraint), and the then-effective §7 rule is SNAPSHOTTED onto
the case so a later Settings change never recalculates an old case.
`payment_storage_extra_free` carries the §7 decision ladder: Operation through its limit
day, the Storage Waiver Approver duty (Shared Duty Resolver) through its limit day, nobody
beyond — even principal is refused past every limit; sofa always refuses; a WRITTEN request
is required and an approval may only extend. Both doors append the order history fact. The
shared `storageChargeOf` arithmetic (Law D) reproduces the §7 worked examples exactly
(1–14 RM0 · 15–44 RM150 · 45–74 RM300; approved-day-21 shift; sofa 14-day cycles) and is
the ONE derivation any card, report or future Storage Invoice may print.
`GET/POST /api/finance/payment-storage` are thin RPC wrappers.

The operator journey is on the Invoice object: a **Storage** section between the goods facts
and the money action (the §16 one-scroll order gains it — storage is a goods-side fact that
becomes money). A case says its witnessed start, which storage day today is, the free end
with its approval named, and the §7 charge so far through the ONE shared arithmetic —
honestly marked `not on a Storage Invoice yet.` The posting door's staff get
`Record storage start` (both witnessed facts + the note; the page says the system derives
the LATER date) and, where §7 allows, `Request more free days` — the customer's WRITTEN
request is uploaded first, and the form says a phone call is not enough. Finance reads the
same facts with no doors.

Closure: migration `0436` is APPLIED (tracker tail confirmed) and PR #1132 merged as
`f4aea2a5`; the ERP page, POS page and Worker all converged on a SHA carrying it, and the
served bundle prints the Storage section's own strings. The production DOM walk of the
section is owed: the signed-in browser's renderer froze mid-walk (a minimized window that
stopped answering the debugger) — recorded as the precise blocker, not as acceptance; the
DB layer's behaviour is production-proven by the rolled-back probe above.

The rolled-back production probe proved, with negative controls: a future witness refused ·
the later-fact start with the seeded rule snapshot · a second start refused · Operation
refused past day 21 while the waiver duty is unassigned · approval without written evidence
refused · Operation approving day 21 exactly · principal refused beyond every limit · sofa
extra-free refused · an unknown caller refused (`app_role()` resolves from `app_users`, so
a forged JWT role claim changes nothing). Charging (commenced cycles → Storage Invoice) and
the operator journey UI (the delivery-window form, the case surfaces, §16 composition
extension) are the named next slices — this one records the facts they derive from.

### Deployed — a commenced period becomes a Storage Invoice, 2026-09-07

Migration `0438` closes the charge side of the storage case: `payment_storage_invoice` turns
commenced, UNBILLED §7 periods into a real invoice through the EXISTING 0429 lifecycle —
the same `INV-` numbering authority, the same immutable snapshot (a server-composed
document carrying the case, the period range and the per-period charge), the same
void/replacement lineage; nothing invents a second document authority. The first paper for
a case is kind `storage`, every later one `additional_storage`; `billed_through_period`
advances atomically with the paper, a charge with nothing newly commenced is refused, a
storage paper never stamps the order's Sales-Invoice number, and the door is Operation /
principal (§12 — Finance reads and exports). The case card says
`{n} charge periods started · RM {x} — {m} not on a Storage Invoice yet.` and offers
`Create Storage Invoice` exactly while something is unbilled. The SQL arithmetic and the
shared `storageChargeOf` are both pinned to the §7 worked examples (the rolled-back
production probe asserted 1-period Aug-start RM150 · 7-period sofa RM1,400 ·
additional-storage RM200 top-up · double-charge refused · unknown caller refused).
Closure: migration `0438` is APPLIED (tracker tail confirmed) and PR #1140 merged as
`96ac6197`; the ERP page, POS page and Worker all converged on `90a8f3ef` carrying it, and
the served bundle prints `Create Storage Invoice`. The section's production DOM walk shares
the storage-foundation blocker above (the signed-in browser's frozen renderer); the DB
behaviour — including the real INV number minted inside the rolled-back probe — is
production-proven.

### Deployed — one money answer: the reader audit, 2026-09-07

Every Payment reader of "what this SO still needs" was audited against the §2 model and
converged on the ONE shared `soRemaining` arithmetic (SO across every live invoice kind;
`orders.paid` subtracted exactly once): the Calendar card, the Reports listings, the
Register's `Needed` cells and number filter, the Register FOOTER (a real defect found and
fixed — it summed the SO's outstanding once per ROW, so an SO carrying Sales and Storage
papers was double-counted; each SO with a live visible row now counts exactly once), the
Invoice object's Money section (`includes storage RM x` named), the timing's paid check
(an SO settled on goods but owing storage is NOT `paid` — the collection door stays open),
the Record payment prefill, the Ask-to-pay `{outstanding}` fact, and the payment link's
prefill AND server cap (the cap is now goods value + live storage obligations − paid, the
subtract-once shape; the invariant — a payment may never exceed what is owed — is
unchanged, and a link can now collect a storage fee).

**The obligation model, stated precisely.** Goods obligation reads the order's own live
value (priced lines/addons; the keyed imported balance is the explicit LEGACY FALLBACK for
unpriced imported rows, and it is already an outstanding, so nothing subtracts `paid` from
it twice). The issued Sales Invoice equals that value at issue by construction (the paper
snapshots it; corrections travel revision → void/replace), and reading the value keeps the
money visible BEFORE a paper is prepared. Storage obligation reads the SO's live ISSUED
storage-kind invoices with tax, PLUS a draft that REPLACES a voided one — the 0429
correction lineage exists precisely so an obligation survives its void, and the reader must
not lose the money between void and reissue (test-pinned); a fresh draft asks nothing and a
voided paper is dead.

**RESOLVED — the gate convergence (2026-09-07 slice).** The shared Work engine, the TS
booking gate's one feeder (`booking-context`), the completion reader and the DATABASE door
now consume the canonical §2 storage obligation through ONE precedence law
(`storageObligation`, shared): when the SO carries ANY live ISSUED storage paper, the
papers ARE the storage figure (the same shape as priced-lines-beat-keyed — never both,
never a double count), netted so `orders.paid` subtracts exactly once (a payment past the
goods value spills into storage; a fully paid SO leaves NO stale hold); with no paper the
LEGACY C9 answer passes through byte-identical (`collected_at` clears it, the override
ladder holds, existing C9 cases unchanged). Migration `0441` teaches the 0362 database door
— the one place the money law binds every DO mint — the same papers: an unpaid Storage /
Additional Storage Invoice now blocks a DO whatever path mints it. What deliberately does
NOT change: the legacy accrual stays TS-side (Law D division as 0362 recorded); a C9
`release` still lifts only the TS gate's HOLD and never this door (money in full is
ABSOLUTE per the 2026-09-01 delivery ruling; §12 — a waiver changes the receivable by
VOIDING the paper, it is not an unpaid-delivery release); the historical 0362 approval rows
stay honoured. Proven both directions by the rolled-back production probe on the real DO
door (unpaid paper blocks naming the RM; partial blocks with the remainder; combined-paid
opens; waiver-by-void opens; a draft asks nothing; the historical approval opens; a
fully-paid-goods baseline passes) and by Work-engine tests (an unpaid paper keeps the
collect work open on a goods-paid SO; combined payment closes it; no paper invents
nothing).

Closure: PR #1145 merged as `94acc54f` and the ERP page and Worker converged that exact
SHA. CORRECTED in the gate-convergence slice: the draft-REPLACEMENT clause #1145 added was
a new debt rule the approved lifecycle does not contain, and it is REVERTED — §2 reads
`issued live invoice obligations` exactly, so a correction in flight (void → reissue) asks
nothing until the replacement is ISSUED. Continuity is the lifecycle's own: the voided
paper is dead and never double-counted, `billed_through_period` never rolls back (0439),
the replacement exists to be issued, and the Storage section says `A Storage Invoice
correction is in progress` so nothing is silently lost from the operator's view. The
production DOM verification of the fixed readers is owed with the standing visual-pass
blocker below.

### Deployed — the storage facts are immutable, and a case can close, 2026-09-07

Migration `0439` makes the §6 permanence STRUCTURAL instead of disciplinary: a BEFORE
UPDATE trigger refuses any change to the witnessed facts, the derived start or the rule
snapshot (even a definer-function bug or a privileged hand cannot recalculate an old case),
refuses rolling `billed_through_period` backwards (a paper, once minted, is corrected
through the 0429 void lineage — never un-billed by an update), and refuses reopening a
closed case. `payment_storage_close` is the one closing door — Operation/principal, a
stated reason, the order history fact — and a closed case refuses charging, extra-free
decisions and every other door. The case card gains `End storage` (reason first) and a
closed case shows history with no doors. The rolled-back production probe passed with
negative controls: start/snapshot edits refused · billed rollback refused · close stored ·
charge and extra-free refused on the closed case · reopen refused · double close refused ·
unknown caller refused. Supplier/Carres delay staying unchargeable is structural (a charge
derives only from a start that REQUIRES the readiness witness); mixed product groups run as
separate cases per 0436; automatic close on delivery completion is Delivery-side wiring and
stays a named next step. Closure: migration `0439` is APPLIED (tracker tail confirmed) and
PR #1147 merged as `7b47adbf`; production converged it.

### Deployed — export, waivers on the report, the visible Reports door, and the §13 convergence, 2026-09-07

Reports → Payment gains: **Export Excel** (one sheet per section, computed at export time
from the same reads — the report still stores nothing); the **Storage waived** section now
lists every approved free-storage decision with its free-until date, reason and approver's
NAME (the §11 promise; the same case wire the Storage section reads, approver resolved
server-side so an id never reaches the screen); and the shared `Finance → Reports` page
carries a first-class **Payment** door card — the destination is discoverable, not a bare
route. The §13 convergence, non-destructively: **Refunds & Credit Notes is now READ-ONLY
history** — the create door and its modal left with the ruling (Carres has a no-refund
policy; the exceptional path runs Service Case → Management decision → Finance external
transfer, said on the page); the data, the list read and the API route remain untouched.
**Recon** keeps its function and gains the governed note (Finance checks the bank outside
daily Payment; the workspace is scheduled to retire under §13). Destructive retirement of
either surface still requires its own explicit authorization and has not been performed.
Closure: PR #1148 merged as `72779db7`; the ERP page, POS page and Worker all reported that
exact SHA.

### Stripe business verification — what is proven, and what live keys refuse

A rolled-back production probe proved the §16 Online-link money contract end-to-end on the
real posting service: a paid session posts Payment + Receipt atomically (`orders.paid`
moved once, an `RC-` receipt minted, the session flipped to paid); the DUPLICATE
callback/poll answers `already` and records nothing twice (one live payment per session
key, money unchanged); an unpaid expiry posts nothing and the amount needed stays
unchanged. Creation with the exact amount and expiry is covered by the route tests and the
signed-in production walk of the composition. The one unexercised path is a FRESH live
end-to-end payment: the production Stripe keys are LIVE mode (`cs_live_` sessions on
record), so a real end-to-end verification would mint a genuinely payable link — refused
deliberately, and the rolled-back posting probes verify DATABASE behaviour, not the
complete provider lifecycle. Provider end-to-end testing is PENDING authorised test-mode
access (a Stripe test-mode key set); where the governed acceptance requires the full
provider lifecycle, that access is a requirement, not an option. No live payable link is
ever created for testing.

### Deployed — the gate consumes the canonical obligations, 2026-09-07

The convergence slice itself (the RESOLVED entry above records the model): shared
`storageObligation` + `invoiceStorageSumOf`; feeders wired in `booking-context` (the one
TS-gate feeder), the Work projector (per-order sums off the same invoices read the
collection work already makes) and the completion reader; migration `0441` teaches the
0362 database door the storage papers with the same subtract-once arithmetic (priced:
`greatest(0, priced + storage − paid)`; keyed: `greatest(0, keyed) + storage`; unknown
goods still never block, but a storage PAPER is known money and does). The §13
convergence also completes within approved scope: the RECON WORKSPACE — inspected and
serving NO other authorised owner (its only consumers were its own page and routes) — loses
its navigation row and its page; the route lands on Payments; the reconciliation DATA and
its API routes remain untouched, and git is the history. Refunds stays as read-only
history. Verified by the 0441 rolled-back production probe (seven controls, both
directions), 9 composer tests, the Work both-directions test (26 work tests), 234
finance+portal page tests, design guard and typecheck. Closure: migration `0441` is
APPLIED (tracker tail confirmed; the Warehouse lane took `0440` mid-CI and the later file
renumbered — the 0398 law) and PR #1154 merged as `5cdccd13`; the ERP page, POS page and
Worker all reported that exact SHA. The DB-door behaviour is production-proven by the
rolled-back probe; the authenticated interaction and visual passes share the standing
blocker recorded under the verification categories.

### BUILD — the two storage-model boundary cases, 2026-09-08

The 2026-09-07 precedence law asked `a live paper exists`, and the boundary review found
two defects in it. Both are fixed; both are pinned by tests that use REAL C9 history, not
invoice-only fixtures.

**(a) Voiding the last paper resurrected the old C9 charge.** A void is the §12
waiver/correction path, so falling back to the legacy figure brought a waived obligation
back from the dead. FIXED: precedence is now keyed on storage-paper HISTORY (any
storage-kind invoice ever, voided ones included). An order with history is under the
invoice model permanently — zero live papers means ZERO storage owing, never a fallback.

**(b) A mixed order hid money.** One product group invoiced while another still sat in the
legacy columns meant the papers silently spoke for the whole order. The two models cannot be
reconciled by arithmetic — the legacy columns are ONE per-order figure with no group
breakdown, so nothing in the data can say whether a keyed fee is the same debt as a paper or
a different group's. RESOLVED without guessing: the invoice model DECIDES the money (which
also forces the zero-paper and one-paper answers in (a) to agree), and the legacy figure is
carried out as `unreconciledLegacy` — never merged into a paper figure, never silently
dropped. `GET /api/finance/payment-storage?orderId=` returns it through the same shared
composition the gate and Work use, and the Storage section says: *This order also carries
RM x of storage fee from the old records, which no Storage Invoice covers. Collect it, or
set the storage fee to 0 in the order, so the two do not disagree.*

**The state is also made unbirthable.** Migration `0445` refuses to open a storage case while
the order carries an uncollected KEYED legacy fee (override, else the imported pair), naming
the amount and the fix. It changes no row, migrates nothing and forgives no money. Measured
before writing (production, 2026-09-08): ZERO orders carry any legacy storage signal, ZERO
cases, ZERO papers — the refusal is a guard for the future, not a cleanup, and the go-live
database starts clean (CLAUDE.md §6). Rolled-back production probe, five controls: no-legacy
baseline opens · an imported RM 300 refuses naming RM 300.00 · an override RM 150 beats the
imported pair and refuses naming RM 150.00 · override 0 (the operator's "no storage") opens ·
a COLLECTED legacy fee opens.

**ONE EXPECTED AMOUNT, RECONCILED ACROSS FIVE SURFACES** (`storage-reconciliation.test.ts`):
for an invoice-only order and for a mixed order, Calendar · Reports · Invoice details
(`soRemaining`), shared Work and the TS booking gate (`orderMoney` ← `storageObligation`),
and the DATABASE gate (0441's arithmetic mirrored) all produce the SAME figure; the legacy
fee is named apart. With every paper voided, all five say zero and nothing resurrects. A
correction in flight changes nothing anywhere — no draft debt, no invented hold.

**THE ONE KNOWN DIVERGENCE, stated rather than papered over.** On a LEGACY-ONLY order (no
paper history) shared Work and the TS gate carry the C9 fee, while the Payment screens and
the 0441 database door do not — Payment's screens read the invoice model only, and 0362's
Law D split left the date-walked accrual TS-side. It is bounded: production carries zero
legacy storage signals, go-live starts clean, and 0445 keeps an order in exactly one model,
so the divergence has no live instance. Closing it would mean either teaching the Payment
register read the C9 columns or retiring the legacy columns outright — recorded in the gap
list below, not done silently.

**⛔ OPEN OWNER DECISION — does an unreconciled legacy fee HOLD the delivery?** Today it does
not: it is a named fact and work to resolve, because the alternative (holding on both) would
double-hold whenever the keyed fee and the paper are the same debt, and inventing a hold was
explicitly out of scope. The recommendation is to keep it as work, since 0445 prevents the
state and no live order can reach it. It is listed in the gap list as an owner decision.

### BUILD — the customer's answer is a recorded result, 2026-09-08

§3 asked for a structured collection result and the 2026-09-08 audit found it NOT BUILT:
0434 recorded the message we SENT, but nothing recorded what the customer ANSWERED, so no
next action could be derived from a result and the risk sort could never rank a missed
promise. Migration `0446` adds the missing half: `payment_collection_outcomes`, append-only,
one row per recorded conversation, and `payment_record_collection_outcome`, its one door.
The five approved §3 words are the only vocabulary; `Customer will pay on a date` REQUIRES
its date and may not be in the past, and no other result may carry one. The door appends the
order history fact and stamps the shared chase clock exactly as the message ledger does.

**An outcome is never money.** `Customer paid` records what the customer SAID: it does not
write `orders.paid`, mint a receipt or close a balance — the canonical posting service stays
the only money writer (§2), and the composition says so on screen. That is §3's "`Done`
never replaces authoritative completion", enforced rather than described.

The Invoice object gains `Record the result` beside `Ask the customer to pay`, with one
obvious button per result and the next step named under each. Rolled-back production probe,
eight controls: an unknown outcome word refused · a dateless promise refused · a promise in
the past refused · a stray date on another result refused · a promise stored with history and
the chase stamp · `Customer paid` moving neither `orders.paid` nor any payment row · an
invoice from another order refused · an unknown caller refused.

The remaining half of #8 — the shared Work feed RANKING a missed promise — belongs to the
Workspace-owned rule registry and stays listed as PARTIAL rather than reached into from here.

### Verification evidence — the four categories, stated separately

Each §14 slice's evidence is one or more of: **DEPLOYMENT** (exact-SHA or ancestry-verified
convergence + served-bundle strings — proves the code shipped, nothing more) ·
**AUTHENTICATED INTERACTION** (signed-in production DOM walks — proves the interactions,
not the pixels) · **VISUAL INSPECTION** (a human-visible rendered page at real sizes and
real browser zoom) · **BUSINESS VERIFICATION** (the business outcome proven end-to-end —
rolled-back production probes with negative controls, or a live walk that exercises the
rule). Current standing: deployment evidence exists for every shipped slice; authenticated
interaction walks exist for the Calendar, Reports and the payment-link door; DB-layer
business verification exists for every migration (probes) and the §7 arithmetic; **visual
inspection and native-200%-zoom acceptance exist for NO slice** — they need a visible
signed-in browser window, and automation cannot drive the browser-chrome zoom control; the
Storage journey's authenticated interaction walk is also still owed. The observed tool
failures, precisely and in the order they happened — two DIFFERENT modes, not one:

1. **Renderer unresponsive (while the signed-in window was minimised).** Screenshot
   capture returned `Cannot take screenshot with 0 width`; JavaScript evaluation timed out
   after 45s (`Runtime.evaluate` — "renderer may be frozen or unresponsive") on the
   existing tab AND on a freshly created tab. The minimised window is the correlated
   condition; renderer suspension is a plausible cause and was NOT measured.
2. **Extension not connected (later, 2026-09-07).** The browser tool returned
   `Claude in Chrome is not connected` — the extension is unreachable, a different failure
   from (1) and not a page-state problem at all.

Neither mode is a product defect and neither is evidence about the pages. ONE owner action
should clear both: with the Claude in Chrome extension connected and signed in, bring the
signed-in `erp.carresofficial.com` window to a normal visible size and leave it open; the
visual pass, the native-zoom pass, the Storage interaction walk and the production check of
the converged Work/gate readers all run from there. **Deployment evidence measured
meanwhile (2026-09-07), which is NOT visual or interaction acceptance:** the served ERP
bundle carries `A Storage Invoice correction is in progress`, `Create Storage Invoice`, the
Reports→Payment door card and the §13 no-refund wording, and carries NO `Reconciliation`
string; the live `ops_delivery_orders_money_gate` function body contains the 0441 storage
block, reads the storage kinds and performs the subtract-once arithmetic.

### The three external dependencies, stated exactly (2026-09-08)

**1 · Browser — what connecting it does and does NOT unlock.** Verified against the tool
contracts before promising anything: BOTH browser surfaces state that page-zoom shortcuts
(`cmd+=` / `ctrl+-` / `cmd+0`) are **not supported and return an error** — only a
magnify-a-region screenshot exists. So native browser zoom is **not drivable by automation
at all**, and connecting the browser does NOT unlock the native-200% check. What it does
unlock: the production VISUAL inspection at real sizes, the Storage journey's authenticated
interaction walk, and the production check of the converged Work/gate readers. The
native-200% pass needs a HUMAN keypress (⌘ + twice on the signed-in page) — or it stays what
it is today: layout-equivalent viewport evidence, never called acceptance.

**2 · Stripe — the approved test environment and its credential setup.** The Worker reads
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from Cloudflare Worker secrets
(`apps/api/wrangler.toml`), and today's production values are LIVE mode (`cs_live_` sessions
on record). Provider end-to-end verification therefore requires, and must not be faked:
a Stripe **test-mode** key pair (`sk_test_…` plus the test webhook endpoint's `whsec_…`), set
as secrets on a **separate non-production Worker environment** — `wrangler secret put
STRIPE_SECRET_KEY --env <non-production>` and the same for the webhook secret, entered by the
owner straight into Wrangler. Secrets are never pasted into a chat, never read back, and the
production live pair is never replaced for testing. Until that environment exists, the
provider lifecycle stays PENDING and the database posting contract stands on its probes.

**3 · The business content owed, consolidated into one request.** Two owner-supplied facts,
and nothing may be invented or shortened in their place:
   · the approved customer **Important Notes** wording — the bottom rules of the payment
     message (may be pasted straight into `Settings → Payment → WhatsApp templates` as the
     `Standard bank transfer` template);
   · the **receiving bank account numbers** for the two seeded, approved banks — PJ
     own-showroom → Hong Leong Bank, Dealer → RHB (both rows exist with the account number
     empty; a manager enters them in `Settings → Payment`, never through this chat).
Both block only the dependent customer messages (#20 in the list below); no other delivery
waits on them.

### THE ONE FACTUAL GAP LIST — audited 2026-09-08, whole approved mission

Audit method: every approved capability in §2–§17 was searched for in the repository and,
where it is data-bearing, counted in production. `BUILT` means shipped code plus at least
deployment evidence; `PARTIAL` names exactly what is missing; `NOT BUILT` means no
implementation exists. **Production data facts, measured 2026-09-08:** 1 invoice row (0 with
a snapshot — the pre-0429 row), 0 live payments, 0 receipts, 0 allocations, 0 recorded
messages, 2 seeded templates, 2 bank-account rows with NO account numbers, 0 storage cases,
0 storage papers, 0 legacy storage signals. The posting chain has therefore never been
exercised on live rows — its verification is probe/test based, as recorded in §14.

| # | Approved capability | § | State | The precise gap |
|---|---|---|---|---|
| 1 | Canonical posting, allocation, receipt identity, idempotency | 2 | **BUILT** | Production-verified 0351; no live rows exist yet |
| 2 | Payments + Invoices Registers, one-scroll objects, Inspect | 3·16 | **BUILT** | — |
| 3 | Record payment (6 methods, evidence, review sentences) | 3·16 | **BUILT** | — |
| 4 | Invoice lifecycle: draft → issue → void + replacement lineage | 4 | **BUILT** | — |
| 5 | Invoice document from its immutable snapshot | 4·16 | **BUILT** | — |
| 6 | **Receipt reprint from an immutable snapshot** | 4 | **PARTIAL** | A receipt PDF template and `Print receipt` exist, but the receipt renders from a LIVE read; there is no receipt snapshot column and no receipt document route. §4 asks reprint to use "the same number/snapshot" |
| 7 | Structured collection outcomes (`Customer paid` · `will pay on a date` · `needs help` · `disputes the amount` · `did not answer`) | 3 | **BUILT** | 0446 with probe; `Record the result` on the Invoice object |
| 8 | **Promise-to-pay and the missed-promise Work sort** | 3 | **PARTIAL** | The promise is recorded with its date and `missedPromise` derives the fact from the ledger; the shared Work FEED's risk sort does not consume it yet — that ranking lives in the Workspace-owned rule registry and is its own slice |
| 9 | **`Correct allocation`** (before/after, actor, time, reason) | 5 | **NOT BUILT** | No door and no audit shape; a wrong allocation can only be voided |
| 10 | **Likely-duplicate inspection before privileged continuation** | 5 | **NOT BUILT** | Posting is idempotent per key, but nothing compares customer/amount/date/reference or forces inspection |
| 11 | Overpayment surfaced as `RM x needs review` | 5·11 | **PARTIAL** | The Reports row and the shared `overpaid` figure exist; the REVIEW action (reallocate/decide) does not |
| 12 | Void payment with reason + approver duty | 5 | **BUILT** | — |
| 13 | Storage case: witnesses, derived permanent start, rule snapshot | 6·7 | **BUILT** | 0436/0439 with probes |
| 14 | Storage charging → Storage / Additional Storage Invoice | 4·7 | **BUILT** | 0438 with probe |
| 15 | Storage waiver ladder (Operation → Waiver Approver → nobody) | 7 | **BUILT** | 0436 with probe |
| 16 | **`Request a later delivery date` customer form** | 6 | **NOT BUILT** | §6's DEFAULT storage evidence. Today a case can only be opened from a typed witness note; the structured customer submission (new date, reason, terms acknowledgement, free-storage request) does not exist |
| 17 | **`Check the stored furniture` inspection work every 30 days** | 6 | **NOT BUILT** | The interval is configured in Settings (0431) and nothing raises the work |
| 18 | Storage obligations reconciled across every reader + the DB gate | 2·14 | **BUILT** | Five-surface reconciliation test; 0441/0445 probes |
| 19 | Ask the customer to pay + immutable message ledger | 16 | **BUILT** | — |
| 20 | **Complete §16 customer message assembly** (bank routing, Partner contact, Important Notes) | 16 | **BLOCKED — owner content** | Wording and bank account numbers are owner inputs; 2 bank rows exist with NO account numbers. Never invented |
| 21 | Template library, versions, defaults, manager gate | 16 | **BUILT** | 0435 with probe |
| 22 | Online payment link journey + provider posting | 16 | **PARTIAL** | Journey and DB posting proven by probe; **provider end-to-end pending authorised Stripe test-mode access** — production keys are live mode |
| 23 | Send receipt (template-driven) | 16 | **BUILT** | — |
| 24 | Reports → Payment, six listings + Excel export | 11·16 | **BUILT** | — |
| 25 | **One read-only customer statement** | 11 | **NOT BUILT** | §11 asks for a statement deriving invoices, allocations, payments, voids and amount needed; no such surface exists |
| 26 | Payment history filterable by date/customer/SO/amount/method/actor/exception | 11 | **PARTIAL** | Register filters and the communications ledger exist; there is no single history surface over the §11 axes |
| 27 | Settings → Payment (banks, methods, templates, numbering, storage) | 12 | **BUILT** | 0431/0435; bank account NUMBERS are the manager's to enter and are empty |
| 28 | Permissions: §12 role door, duties via the Shared Duty Resolver | 12 | **BUILT** | — |
| 29 | Intentional rejects: no Refund queue, no Bank Matching workspace | 13 | **BUILT** | Refunds read-only history; Recon page and navigation retired; data and API kept |
| 30 | Production VISUAL pass · native 200% zoom · Storage interaction walk | 14 | **BLOCKED — external** | Browser unavailable; both observed failure modes are recorded above |

**Owner decisions open (not engineering choices):**
- Does an unreconciled legacy storage fee HOLD the delivery, or stay work? (Today: work.)
- The §16 Important Notes wording and the receiving bank account numbers (#20).

**Overall status: PARTIALLY DELIVERED** — nine gaps above are unbuilt or partial approved
capability, two are blocked on owner content, one on external access. The §14 build entries
record what IS shipped; this table is the single list of what is not.

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

Invoice order: Money → Goods and Delivery → Storage → What to do → Invoice → Related Payments → Communication
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
