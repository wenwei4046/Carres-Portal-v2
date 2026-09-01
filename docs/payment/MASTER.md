# PAYMENT — MASTER

> **APPROVED / LOCKED by Jess, 2026-08-14.** This is the only Payment document and the complete
> owner-approved Payment Blueprint. Current implementation may lag this target; code absence does
> not reopen it. Overwrite this file when the owner re-rules it; never create another version.
>
> Read `CLAUDE.md` → `ERP-ARCHITECTURE.md` → this MASTER. The Customer Order money gate remains in
> [`../orders/MASTER.md`](../orders/MASTER.md) §8 because it decides whether goods move.

---

## 1 · Mission, ownership and boundary

Payment is **customer money / Money In**. It answers:

> What has the customer paid, what is still owed in either direction, and what must the Payment
> operator do next?

**催钱前先看货.** Do not call a customer for money before knowing whether Carres can answer the
customer's delivery question.

Payment owns:

- incoming customer payment records and allocation;
- outstanding arithmetic;
- receipts and customer invoices;
- collection work, contact observations and promise-to-pay;
- storage charges, collection and waiver;
- customer refund obligations and actual refund payment;
- customer-money bank-match evidence and exceptions.

Payment does not own:

- customer order value, revision or cancellation — Sales Orders;
- delivery hold/release — Sales Orders;
- stock readiness/location — Stock;
- delivery booking/DO/proof — Sales Orders/Delivery under their ruled split;
- Catalog category — Catalog;
- supplier bills, supplier payments or AP — Finance / Money Out;
- PO, Receiving or Supplier Claim facts — their owning modules;
- Rental agreement/billing truth — Rental;
- P&L, COGS, GL, tax or enterprise cash management — Finance/Reports.

Supplier AP appearing in the older `/finance` implementation does not broaden Payment. Purchasing
supplies PO/Receiving/Claim summaries to Finance but never writes money. Payment remains the one
locked Finance navigation destination for customer money.

---

## 2 · One object model

```text
Customer Order + immutable revision
        │
        ├── Invoice / charge document ── immutable issue/void lineage
        │
        ├── Payment ── amount · direction=in · method · paid date · source
        │      ├── Allocation(s) to order/invoice/storage charge
        │      ├── Receipt snapshot
        │      └── Bank match(es) — verification evidence
        │
        ├── Storage charge ── trigger witness · rate snapshot · calculated amount
        │      └── Waiver decision — amount · reason · manager · time
        │
        └── Refund obligation ── reason · source revision · approval · amount
               └── Refund payment ── direction=out · evidence · bank match
```

Manual collection, Stripe, Rental billing and future providers are adapters into one canonical
Payment posting service. Each preserves source and an idempotency key. No adapter independently
updates `orders.paid`, creates a second payment truth or mints a second receipt identity.

The target replaces the overlapping customer-money parts of the old operational desk and broad
Finance application with one owner. Useful capabilities move; duplicate customer-money records,
forms and writers retire through a governed migration. Nothing here authorises deletion or cutover.

---

## 3 · Frozen money rules

- **ONE arithmetic, many readers.** No screen computes outstanding independently.
- The current compatible rule is:
  `outstanding = priced lines + add-ons + chargeable storage − canonical money received`.
- `null` and zero are different. Unknown value says `No price yet`; unknown warns and never blocks.
- **ONE payment writer.** Posting, allocation, receipt identity and activity are one transaction.
- Direct ledger writes are closed. Provider/top-up paths must converge through the same service.
- **A void is a stamp, never deletion.** It reverses only the contribution the payment made.
- A voided or reversed payment is not money. Every reader asks one shared predicate.
- Payment state is derived, never typed: `No price yet · Unpaid · Partial · Paid`, with due/late
  presentation supplied separately by the collection clock.
- Money uses one formatter: `RM 1,250.50`, always two decimals. Never `$`, `MYR` in row text,
  rounded figures or duplicated `RM`.
- A payment leaves `payment.received`/`payment.voided` evidence on its Order in the same transaction.
- Delivered does not mean paid. Collection and refund obligations survive delivery.
- Completion in both directions means the customer owes Carres zero and Carres owes the customer
  zero. An approved unpaid refund remains open until actual refund payment is recorded.
- A credit note may correct/apply a document amount; it never silently converts an approved refund
  into future customer credit. Customer credit is not part of the approved model.

---

## 4 · Normal incoming-money lifecycle

1. Sales Orders creates or revises the commercial obligation.
2. Payment derives outstanding from the current obligation and canonical prior postings.
3. When delivery becomes credible, the shared collection clock raises T−3 attention and the
   T−2 final deadline (owner ruling 2026-08-19 — logistics takes the DO at T−1).
4. Payment shows stock/delivery summaries so the operator knows whether calling is useful.
5. The operator records the actual amount, paid date, method, reference/evidence and allocation.
6. The server atomically creates payment, allocations, receipt identity and activity.
7. At outstanding zero, collection work closes. Sales Orders independently evaluates its gate.
8. A bank/provider match later adds verification evidence; it never creates a second payment.

### Partial, overpaid and unallocated money

- **Partial:** allocate the received amount and keep the remainder/action visible.
- **Overpayment:** hold the excess as an unapplied customer balance and raise
  `Allocate or refund RM {amount} for {customer}`. Never hide it as negative outstanding.
- **Unidentified/unallocated:** record only when bank/provider evidence proves money arrived; keep
  it visible until fully allocated or refunded.
- **Wrong allocation:** reverse the allocation with reason and reallocate the same real payment;
  do not void money that genuinely arrived.
- **Duplicate posting:** reject by idempotency; suspected duplicates enter an exception queue.

### Void, returned payment and chargeback

- A mistaken internal posting is manager-voided with reason; payment and receipt remain visible.
- A returned payment/chargeback is a linked reversal event, never edit/delete.
- The shared arithmetic reopens outstanding and Work raises collection again.
- Unmatching bank evidence reverses only the match; it does not erase the payment.

---

## 5 · Collection clock, contact and Work

Payment uses the portal-wide structured Action contract in `docs/ACTION-FLOW-STANDARD.md`.
Payment supplies each action's trigger, Payment-specific owner rule, completion fact and due rule;
the Work Engine resolves the person and roster/buddy cover. Payment never invents a universal
Sales Order owner and never writes the resolved staff name into the action sentence. Register,
My Work and Team Work use the same action facts at different display densities.

The one collection clock is `delivery − 2 working days` (owner ruling 2026-08-19 — the T−1
deadline was one day too late), Mon–Sat plus Malaysian public holidays, anchored on
customer-confirmed date, else promised date; no anchor means no clock.

- T−3 = attention — chase begins.
- T−2 = DEADLINE — money in full, or the payment-approval request is already raised.
- T−1 = logistics takes the DO; the trip is scheduled. Still owing here is already `late`
  (`t1` is retired from the attention type).
- A promise-to-pay is the customer's word; the collection deadline is Carres' business rule.
  They remain two facts. A promise changes presentation, never erases overdue work.
- `Collect RM {amount} from {customer}` triggers when known outstanding > 0 and completes only at
  outstanding = 0 or a governed reversal of the obligation.
- The same action survives delivery and appears in Work, which deep-links to Payments.
- No Done button: Payment's structured completion fact closes Work.
- One customer receives one grouped reminder/message, never one per order.
- `Chase` is banned visible copy. Use the governed `Remind`/`Call` vocabulary.
- The portal records only what it observed. Opening/copying WhatsApp is not proof of send/receipt.

Work definitions:

| Trigger | Owner | Action | Due | Completion |
|---|---|---|---|---|
| Outstanding > 0 in collection window | Payment duty | `Collect RM {amount} from {customer}` | shared working-date clock | outstanding = 0 |
| Promise date reached and still owing | Payment duty | same collection action, late | promised weekday/date | outstanding = 0 |
| Approved refund unpaid | Payment duty | `Refund RM {amount} to {customer}` | governed due date; absent one, same working day | refund payment recorded |
| Unallocated receipt | Payment duty | `Allocate RM {amount} from {payer}` | receipt date | fully allocated/refunded |
| Unmatched bank line | finance-control duty | `Match bank payment RM {amount}` | import date | fully matched/classified |
| Suspected duplicate/return | manager | `Review payment RM {amount}` | observed date | distinct/voided/reversed |

---

## 6 · Delivery release and storage

The delivery money gate belongs to Sales Orders, not Payment.

- ⭐ **MONEY IN FULL BEFORE DELIVERY IS ABSOLUTE — owner instruction 2026-09-01, tightening the
  2026-08-19 reversal of 2026-08-16.** A Delivery Order issues only when **outstanding = 0 and
  no OPEN Finance exception holds it.** The one exception door (Delivery Payment Approval) was
  removed from the screen (PR #1031): nothing can request one any more, and an owing order is
  undeliverable until it is paid. An approval granted before the closure is still honoured by
  the 0362 gate — history honoured, not a live path. The governing ruling and the 0362 record
  live once in [`../orders/MASTER.md`](../orders/MASTER.md) §8, which owns the gate; this
  MASTER does not restate it.
- **RELEASE NEVER FORGIVES MONEY — survives every version of the gate.** A COD-approved order
  still OWES: collection work stays open (and survives delivery), and the **waiver is
  untouched**: writing off a receivable remains a money decision, manager-gated, owned here,
  with amount, reason, actor and time. A waiver is not a release and never was. There is still
  **no Release button and no Approve button on the DO path** — the approval is a recorded
  decision on the order, not a button on the document.
- **Payment's own ownership is unchanged by all of this.** Payment supplies the ONE outstanding
  answer and owns the one arithmetic; Sales Orders owns the delivery gate and decides what blocks
  goods. That boundary did not move — what moved (back) is Sales Orders' answer.
- **`Finance exception` (0355) — Finance owns it, and it is the SECOND blocker.** An explicit
  Finance-created record; only Finance creates or clears it, clearing costs evidence. `OPEN`
  blocks the DO gate **regardless of payment, and a payment approval does not clear it**;
  `CLEARED` removes the block. It is a decision, never a derived state.
- **THE COLLECTION CLOCK'S DEADLINE IS T−2 — owner ruling 2026-08-19** (§5 above): logistics
  takes the DO at T−1 and the DO door refuses while money holds, so the money must be settled
  before that day. Same calendar, same anchor, one arithmetic, both consumers follow.
- Operations sees the resulting Work change; no duplicate alert/status is created.

Storage is split by record:

- Sales Orders owns trigger and hold from the customer promise.
- Stock supplies physical witness only.
- Catalog supplies product category; SKU-prefix guessing is forbidden.
- Payment owns effective-dated rates, one calculation, charge snapshot, collection and waiver.
- A manager may release the hold while leaving the fee owed, or separately waive some/all with
  amount, reason, actor and time.
- A waiver preserves what would otherwise have been owed; editing an arbitrary row amount is not
  a waiver.

---

## 7 · Receipts, invoices, documents and History

- A receipt number is unique, minted once and reprints the same immutable snapshot.
- A voided payment retains a visibly voided receipt record and cannot print as live money.
- A customer invoice is issued/voided/reprinted through one Payment-owned door.
- Issued invoice versions are immutable; correction uses explicit void/credit lineage.
- Every invoice/receipt links to its source SO revision and canonical transaction IDs.
- A customer statement derives from canonical obligations, payments, refunds and unapplied balances
  for a selected date range.
- Order Route may show Invoice → Payment/Receipt → Refund read-only and links to Payment.

Payment History is one append-only timeline covering:

- payment posting and allocation/reallocation;
- receipt/invoice issue and void;
- observed contact/channel-open and promise-to-pay;
- bank match/unmatch and import batch;
- void, reversal and chargeback;
- storage charge/waiver;
- refund request, decision and payment.

Orders reads only its related subset and never gains a Payment form.

---

## 8 · Refund lifecycle

1. A governed Sales Order change/cancel or approved remedy creates one refund obligation with
   source, reason, amount and immutable commercial lineage.
2. A manager approves or rejects it. Approval does not mean paid.
3. Approved refunds appear in Payments → Refunds with customer payment details and evidence.
4. Payment duty records the actual outgoing payment/reference/evidence.
5. The server marks the obligation paid and writes Order activity in one transaction.
6. Bank reconciliation later verifies the outgoing payment.
7. Sales Order completion remains open until refund payment is recorded.

`order_refunds` is the target customer-refund authority. The older generic refund/credit forms may
not create parallel customer debts. Refund records are never copied or deleted.

---

## 9 · Bank verification and exceptions

```text
Upload statement file
→ validate bank/account/period/opening/closing totals
→ reject exact duplicate import hash
→ immutable import batch + bank lines
→ suggest matches by reference + amount + customer + date
→ review exact, split, combined and unmatched cases
→ apply matches
→ keep exception queues until resolved
```

Three axes remain separate:

- Payment: `Recorded · Voided · Reversed`.
- Bank evidence: `Not checked · Matched · Exception`.
- Obligation: derived `No price yet · Unpaid · Partial · Paid · Refund owed`.

Under the approved Carres rule, governed payment recording changes money truth and the order gate.
Bank matching is later control/evidence, not a second settlement definition.

Required exception journeys:

- unmatched/partially matched bank line;
- duplicate import or duplicate payment;
- unallocated/overpaid money;
- wrong-order allocation;
- returned payment/chargeback;
- disputed payment/reference;
- failed refund;
- receipt/invoice numbering collision;
- unknown order value.

No difference disappears through a tolerance. Any future write-off requires its own governed amount,
reason, approver and evidence.

---

## 10 · Information architecture and UI

Locked destination: Sidebar → Finance → **Payments**.

One Payments page owns four page-level jobs:

1. **Collect** — primary daily customer-balance Register, stock-aware and work-ordered.
2. **Refunds** — customer refund obligations and payment.
3. **Bank matching** — statement imports, matches and exceptions.
4. **History** — all canonical customer-money transactions and documents.

Reports and Settings remain central destinations:

- Payment's report shortcut opens central Reports filtered to Payment.
- Payment's gear opens central Settings → Payments.

There is no second Finance dashboard, AR, Order Payments or Invoices destination. Useful functions
relocate into Collect, History, object detail and central Reports. Supplier AP, P&L and Rental
approval never become hidden Payment subpages.

### Collect Register

Apply the governed Register Template:

- Header `Payments`, freshness and admitted actions; no duplicate breadcrumb/title.
- Search, filters, columns and export.
- `To collect` and `All` scopes.
- Useful facts: collection due/late, goods ready/waiting/late, money state, region and PIC.
- Core columns: Customer · Order · Current Action · Outstanding · Collection Due · Promise to Pay ·
  Goods · Requested Delivery Date · Last Contact.
- Footer: visible count, exact outstanding total and separate `No price yet` count.
- Expansion/detail: obligation breakdown, timeline, documents, contact brief and one posting form.

Waiting/late stock is read-only context. Payment links to the owning module and never contacts the
supplier or edits stock.

### Payment object detail

Apply the Object Detail Template:

- identity, amount/direction and factual state;
- customer, SO, invoice/charge, paid date, method, source/reference and allocation;
- immutable receipt/invoice documents;
- bank match/batch or explicit exception;
- append-only history;
- related Order, refund/storage charge, Work and Issue Tracker links.

---

## 11 · Daily operator journey

### Morning

1. Open Payments → Collect; actionable balances appear in risk/date order.
2. Read amount, goods readiness, customer delivery and last contact without another page.
3. Open a row, use the pre-call brief and governed customer contact action.
4. Record only confirmed money through the one posting door; receipt is immediately available.

### During the day

5. Process approved refunds in Refunds.
6. Allocate unallocated money and review returned/duplicate exceptions.
7. Import a statement when received; accept reviewed matches and resolve exceptions.

### Close

8. Confirm no overdue collection/refund or unexplained bank exception lacks an owner.
9. Open central Reports → Payment for daily totals and open exceptions.

---

## 12 · Permissions

Duty, not email, determines permission.

| Capability | Duty |
|---|---|
| View customer money | Payment duty/principal; relevant cross-module views read-only |
| Record and allocate payment | Payment duty |
| Contact customer / record observed channel-open | Payment duty |
| Set promise-to-pay | Payment duty |
| Issue invoice / reprint receipt | Payment duty under document rules |
| Void payment / waive charge / approve refund | manager/principal duty |
| Pay approved refund | Payment duty; separate requester/approver where practical |
| Import/match bank statement | finance-control duty |
| Change Payment settings | principal/authorised settings duty |

Server-side permission is mandatory. Existing broad role checks are implementation evidence, not the
final duty model.

---

## 13 · Settings

Central Settings → Payments owns:

- active collection methods and required evidence;
- receipt/invoice number formats and templates;
- effective-dated storage rates and Catalog category mapping;
- bank accounts and statement-import formats;
- reconciliation suggestion rules with audit; exact amount is the default;
- refund payment methods and evidence;
- customer statement/contact templates under Copy authority.

Historical transactions snapshot applicable settings. Editing configuration changes future use only.
Sales Order checkout may read admitted payment-method choices but does not own Money In configuration.

---

## 14 · Reports and export

Central Reports → Payment provides:

- outstanding by due/aging, customer, PIC, region and delivery readiness;
- collection due/late and promise-to-pay kept/missed;
- money received by date, method and source, with voids/reversals separate;
- storage charged, collected and waived with reason/approver;
- refund obligations approved/paid/late;
- bank imports matched/unmatched/duplicate/returned;
- customer statement and stable transaction export;
- collection velocity only when complete history supports it; withhold rather than fabricate.

Payment does not report P&L, COGS, supplier AP or top-SKU profitability.

---

## 15 · Current implementation versus approved target

### Built / verified in repository

- operational collections desk with queue/facets and stock-aware context;
- shared `orderMoney`, exact formatter and the T−3-attention / T−2-deadline clock (2026-08-19);
- `payment_record`/`payment_void`, direct-ledger write closure and receipt uniqueness;
- canonical `_customer_payment_post` transaction used by operational/manual Payment, Sales/POS
  top-up, Finance AR receipt and customer Stripe checkout, with source idempotency, one allocation,
  one receipt identity and one Order activity event;
- legacy generic customer-order receipt history migrated into the canonical ledger; new generic
  `payments` writes for incoming customer-order money are refused;
- derived money states and void-aware readers;
- payment history, promise-to-pay, receipt PDF, invoice download and WhatsApp brief;
- order refund request/decision/paid lifecycle and derived SO completion;
- older Finance AR/AP/payments/invoices/refunds/reconciliation/reports implementation.

### Approved target / not complete

- migration/retirement of duplicate customer-money writers/tables/forms;
- explicit unallocated/overpayment/reallocation/return/chargeback records;
- immutable bank import batches linked to canonical Payment objects;
- one Payment History and object detail;
- storage category from Catalog and Payment-owned effective rates/waiver;
- one Payments page with Collect/Refunds/Bank matching/History;
- duty permissions, central Payment Settings and truthful Payment Reports;
- bulk reminders grouped one message per customer;
- collection velocity only after sufficient evidence.

Implementation absence does not reopen approved business truth. Old Finance/AP code is preserved as
measured evidence but does not change Payment's customer-money boundary.

---

## 16 · Intentional rejects and external boundary

- No second customer-money Finance application.
- No typed `Paid` status or second outstanding arithmetic.
- No duplicate payment/refund writer.
- No payment deletion, copied transaction or mutable issued document.
- No bank match silently creating money recorded elsewhere.
- No supplier AP, P&L, COGS, GL or tax engine inside Payment.
- No future customer credit inferred from an old credit-note form.
- No customer portal/payment provider until separately planned and authorised.
- No external message, bank transfer, production migration, partner invitation or cutover from PLAN.

---

## 17 · Plan completion state

**PLAN MISSION COMPLETE.** The complete customer-money domain has been authority-resolved,
whole-domain audited, benchmarked against available 2990 evidence and mature ERP patterns,
owner-reviewed, approved and persisted here as the one current truth.

Locked operating model: Payment is customer Money In; one canonical posting/allocation model; one
outstanding arithmetic; one Payments workspace; receipts/invoices/refunds/storage/bank evidence and
exceptions preserve immutable lineage; Sales Orders owns the delivery gate; supplier AP stays
outside Payment.

Only after this state may dependency-ordered, unnumbered build scopes be derived. No official Card
number or implementation status is created by this MASTER update.
