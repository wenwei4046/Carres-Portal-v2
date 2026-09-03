# PAYMENT — MASTER

> **APPROVED / LOCKED by Jess, 2026-09-03.** This is the only Payment Blueprint. It completely
> overwrites the former routine Refund, Bank Matching and storage model. Git is the history.
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

`Finance → Payments` has only **Collect** and **History**.

Collect sorts by risk: delivery tomorrow and unpaid; storage holding the DO; missed promise;
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
exception, and links immutable documents/source SO. Calendar shows only dated promise/deadline,
free end, charge start and approved-free end. Payment record is not a calendar event. Quick Rail
uses concrete copy and source deep-link.

One read-only customer statement derives invoices, allocations, payments, voids and amount needed.
Read-only reports/export: Money received · Customer balances · Storage charged/collected/waived
with reason/approver · Payment corrections · Money needing review. No Refund report or Bank
Matching workspace.

## 12 · Settings, duties and permissions

`Settings → Payment` owns payment methods, document numbering, and effective-dated storage values:
free days, amount, cycle, Operation limit, manager limit, extra-free allowed, long-storage warning
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

## 14 · Migration and done-when

Adapt 2990's useful lineage: SO → DO → Sales Invoice → canonical Payment → Receipt, ledger-derived
balance, history and export. Reject its routine negative-payment/refund/credit surface.

Cutover: inventory writers/documents → reconcile balance/evidence → route through canonical service
→ prove parity/idempotency → make old forms read-only → retire duplicates only under separate live
authorisation. This Blueprint authorises no deploy, delete, external message or production cutover.

Done means production proves one writer/arithmetic; atomic posting; Collect + History; system-led
Primary School English actions; global Duty/cover; approved storage trigger/rates/customer evidence/
tiered waiver/per-group clock/incremental invoices; effective snapshots; Delivery/Finance boundary;
append-only exceptions/reports; and no re-entry of rejected Refund/Bank Matching/Negative Payment.
