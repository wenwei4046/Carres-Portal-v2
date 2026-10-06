# Payment scope 1 · Invoice at RM 0 · Phase A build note

**This is a build note, not law.** Authority: `docs/payment/MASTER.md` §2 (THE MONEY RULE,
2026-09-25; `Balance due` IS THE GOODS MONEY ONLY, 2026-10-06), §4, §16. Measured on
`origin/main` `04e734c2d` and production (read-only SQL), 2026-10-06. Phase B starts only
after the Payment PLAN chat replies.

---

## 0 · CRITICAL DEPENDENCY: collection Work is invoice-keyed today

Today every customer-money Work item hangs off an ISSUED invoice:

| Where | What it does today |
|---|---|
| `apps/api/src/routes/operation/work.ts:721-722` | `input.invoices.flatMap(...)`, `if (invoice.status !== "issued" ...) return []` |
| `work.ts:741-746` | `payment.collect_customer_balance` / `payment.missed_promise`, `orderId: invoice.id` |
| `work.ts:774` | destination `/finance/monitor?invoice={invoice.id}` |
| `work.ts:870-908` | `payment.review_overpayment`, destination `/finance/invoices?invoice=` |
| `work.ts:1367` `readAllInvoices` | the only source is `/finance-invoices/register` (invoice rows) |
| `packages/shared/src/work-engine.ts:346` | trigger text "an issued invoice has an outstanding balance" |
| `packages/shared/src/payment-monitor.ts` (header) | Monitor `Amount needed` = `soRemaining` = issued live invoice obligations |

Scope 1 issues the Sales Invoice only at RM 0. **If it ships alone, an SO with a balance has no
issued invoice, so `Ask customer to pay` disappears from Work and the Monitor.** The approved rule
already answers this: MASTER §3 "Payment inside Work" (owner 2026-09-25) — "the object is the
Sales Order, never an Invoice"; the Monitor row is the SO; deep links are `?order=`.

**Phase B therefore re-keys, in the same PR as auto-issue (never after):**

- `payment.collect_customer_balance` and `payment.missed_promise`: one item per Proceeded SO
  whose goods `Balance due` (`orderMoney`, `packages/shared/src/order-money.ts:108-125`) is above
  RM 0, through the same 催钱前先看货 admission and the same collection clock. Object
  `{ kind: "sales_order", id: orderId, label: "SO-{n}" }` (the kind already exists,
  `packages/shared/src/operation-work.test.ts:18`). Destination `/finance/monitor?order={orderId}`.
  It closes when goods `Balance due` reaches RM 0.
- `payment.review_overpayment`: keyed on the SO (paid above the goods total), destination
  `/finance/monitor?order={orderId}`.
- `payment.send_storage_invoice` (`work.ts:790-850`): **unchanged**, still keyed on the live
  issued storage papers (kind ≠ sales).
- `work-engine.ts:344-346, 361, 377, 613-615`: registry text says "a Proceeded Sales Order has
  goods Balance due above RM 0" / "Balance due is RM 0".

**The SO-keyed source.** Work and the Monitor must read ONE order-keyed source (Law C/D). The
money is already order-derived — `invoiceNeeded(row)` reads only `row.orders`
(`packages/shared/src/payment-invoice-register.ts:197-224`); only the identity and the clock's
start date are invoice fields. Recommendation: a new order-keyed read (one row per Proceeded,
non-rental, non-cancelled SO; the same `orders` select the register uses, plus that order's
invoices of every kind) in `apps/api/src/routes/finance/invoices.ts`, with its row type and
order-keyed clock/needed helpers in a NEW `packages/shared/src/payment-order-register.ts`. The
old invoice helpers are left untouched so the Line 1 Monitor agent's files keep compiling.

**Where my work meets the Line 1 Monitor agent** (it owns `PaymentMonitor.tsx`,
`PaymentRecords.tsx`):

1. URL contract: Work emits `/finance/monitor?order={orders.id}` (uuid). The Monitor already
   honours `?order=` for the day (`PaymentMonitor.tsx:247-250`); selecting the row by `order`
   instead of `invoice` (`PaymentMonitor.tsx:471`) is the Line 1 agent's change. `?invoice=`
   stays readable as a legacy door until both land.
2. Source: if the Line 1 agent already builds an order-keyed read, Phase B consumes it instead
   of adding a second one. **Coordinator to confirm which agent ships the source first.**
3. `PaymentRecords.tsx:399` still says `Send receipt`; the combined composition comes for free
   through `InvoiceSendReceipt.tsx` (mine), but the button word on Payment Records is the Line 1
   agent's one-line change.

Tests: (W1) a Proceeded SO with goods balance RM 500 and NO invoice raises exactly one
`payment.collect_customer_balance` item, object kind `sales_order`, destination
`?order={id}`; (W2) the same SO at goods RM 0 with an unpaid storage paper raises no collection
item but still raises `payment.send_storage_invoice`; (W3) a broken promise on an invoice-less
SO raises `payment.missed_promise`; (W4) an SO paid above its goods total raises
`payment.review_overpayment` keyed on the SO. Negative control: feed the old invoice-keyed
projector the W1 fixture and assert it raises nothing (proves the test can fail).

---

## 1 · Evidence map (FACT, file:line)

### 1.1 Where a Sales Invoice is created or issued today

| Door | Evidence | Note |
|---|---|---|
| `payment_invoice_prepare` (draft) | `supabase/migrations/0429_*.sql:96-148`; live body = 0500 rewrite (`0500_*.sql:7712-7786`, hash `28d2280c…`) | staff door, role gate |
| `payment_invoice_issue` (THE issue door) | `0476_*.sql:1048-1118`; live body = `0500_*.sql:7634-7698` (hash `2c95fdf9…` measured live) | role gate `operation/finance/principal` (`0500:7648`); `for update` (`:7656`); draft only (`:7660`); number `INV-DDMMYY-NNNN` (`:7667-7672`); order stamp (`:7682-7685`); history (`:7687-7690`); **posts revenue** `_sales_invoice_to_ledger` (`:7694`) |
| `payment_invoice_void_replace` | `0429_*.sql:225-292`; latest body `0560_*.sql:4198` | Payment Approver duty or principal; voids, drafts linked replacement (`replaces_invoice_id`) |
| `issue_order_invoice` (`Generate invoice`) | `0476_*.sql:1259-1388` | issues through `payment_invoice_issue` (`:1347`); snapshot shape (`:1347-1363`) |
| dispatch trigger `orders_auto_issue_on_dispatched` | `0476_*.sql:1131-1239` | BEFORE UPDATE on `orders`; adopts a live issued invoice, else issues inline + posts |
| `payment_storage_invoice` (storage) | `0438_*.sql:38`, calls `payment_invoice_issue` at `:103` | storage papers share the issue door |
| legacy `invoice_issue` | revoked `0476_*.sql:1402` | dead |
| API `POST /api/orders/:id/issue-invoice` | `apps/api/src/routes/orders.ts:4484-4520` | calls `issue_order_invoice` |
| API `POST /api/finance/invoices/prepare` · `/:id/issue` | `apps/api/src/routes/finance/invoices.ts:354-405`, `407-475` | no web caller found |
| UI `Generate invoice` | `apps/web/src/pages/operation/components/OrderDetailDrawer.tsx:3749-3760` (menu), `:3874-3890` (mount) → `GenerateInvoiceOverlay.tsx:227` | old-orders TEMPORARY door (`OperationApp.tsx:25`) |

Uniqueness already in production: `invoices_live_sales_per_order_uidx` UNIQUE (order_id) WHERE
kind='sales' AND status<>'voided' (`0429_*.sql:80`, measured live); `invoices_invoice_no_key`.

### 1.2 The posting path

- ONE writer `_customer_payment_post` — latest body `0605_*.sql:48-256` (live hash
  `887a3d6b…`). Idempotent on `(source_channel, idempotency_key)` before AND after the order lock
  (`:91-103`, `:105`, `:111-122`), unique index `order_payments_source_idempotency_uidx`
  (`0351_*.sql:11-12`). `orders.paid` changes ONLY for `p_counts_toward_paid` non-storage money
  (`:213`, `:225-233`); a storage payment never touches `orders.paid` (`:219-224`).
- Callers (measured live, `prosrc`): `payment_record` (manual; `0500_*.sql:7798-7886`, live adds
  `workspace_is_person`), `record_stripe_checkout_payment` (Stripe; keyed `stripe_checkout` +
  session id), `finance_record_receipt`, `top_up_order`, `_order_create_deposit`
  (`0476_*.sql:1413-1461`, key `order_create:{orderId}`).
- Other `orders.paid` writers: `payment_void` (subtracts), `payment_correct_allocation` (moves
  money between orders), legacy `order_record_payment` (not executable by `authenticated`).
- API: `apps/api/src/routes/operation/order-payments.ts:615-655` (`payment_record`),
  `stripe-webhook.ts:120`, `stripe-checkout.ts:318`, `finance/payments.ts:306`,
  `orders.ts:958` (`create_order_from_sales_portal`), `orders.ts:1238` (`create_raw_order`).
- POS / order-create: `create_order_from_sales_portal` (`0476_*.sql:1467-1514`) creates at RM 0,
  records the deposit through the writer, then `_sales_order_proceed` in the same transaction.
  `_sales_order_proceed` (live) is also reached from `proceed_order`,
  `_sales_order_retry_submitted` and the deferred trigger `orders_auto_handoff_deferred`
  (AFTER INSERT OR UPDATE OF … paid, status, DEFERRABLE INITIALLY DEFERRED). It requires
  status `place`, priced total > 0 and paid ≥ 50 % (live body).

### 1.3 How `Balance due` reaches RM 0

`orderMoney` goods side (`packages/shared/src/order-money.ts:99-125`):
`priced = Σ order_lines qty×unit_price + Σ order_addons qty×unit_price`; priced > 0 ⇒
`goodsOwing = max(0, priced − orders.paid)`, source `lines`; else a keyed
`ops_order_control.balance` ⇒ source `keyed`; else `unknown` (total null). The SO page uses it
with `controlBalance: null` (`apps/web/src/pages/operation/SalesOrderWorkspace.tsx:2106-2121`,
`sales-order-facts.ts:77-86`). The DO gate repeats the goods side in SQL
(`0441_*.sql:37-…`, latest `0447`). No SQL helper returns goods `Balance due` today.

### 1.4 The invoice PDF template modes

- `apps/web/src/lib/pdf/invoice-template.tsx:169-172` — `doc_title ?? "TAX INVOICE"`;
  `isTaxInvoice` switch. SST rows `:362-375` (`Subtotal (excl. SST)`, `SST 8%`); label
  `TOTAL` / `TOTAL DUE` `:377`; footer `:395-399` (`Tax invoice · SST 8% …` /
  `Payment request. Not a tax invoice.`). Header comment `:2-21`.
- `apps/web/src/lib/pdf/types.ts:152-155` — `doc_title?: string`.
- Setters: `GenerateInvoiceOverlay.tsx:154` (`PAYMENT REQUEST` for imported);
  `apps/api/src/routes/finance/invoices.ts:507-508, 521, 568` (`INVOICE` / `STORAGE INVOICE` /
  `ADDITIONAL STORAGE INVOICE` + ` · VOIDED`). The legacy `invoice-pdf-data` path
  (`DownloadInvoiceButton.tsx:61`) sends no title ⇒ prints `TAX INVOICE` + SST rows today.
- So today a Storage Invoice prints `TOTAL DUE` + `Payment request. Not a tax invoice.`

### 1.5 The Send receipt flow (0434)

- Ledger `payment_communications` + door `payment_record_message_sent`
  (`0434_*.sql:24-118`; latest body in `0560`). Screenshot required (`:76-80`). Kinds
  CHECK = `payment_request, reminder, receipt, storage, other` (measured live).
  History line today: `Payment message sent · {kind}` (`:102-105`).
- API `POST /api/finance/invoices/:id/record-message` (`invoices.ts:594-628`) — keyed by an
  invoice id.
- UI `apps/web/src/pages/finance/InvoiceSendReceipt.tsx:28-166` (posts kind `receipt`, `:112`),
  opened from `InvoiceRecordPayment.tsx:156-167` and `PaymentRecords.tsx:363, 399`.
- Words: `Receipt and invoice sent` and `Invoice issued` are registered history events
  (`docs/COPY-STANDARD.md:2685`). **`Send receipt and invoice` is in Payment MASTER (§3 :439,
  :513, §16 :2341) but NOT in COPY-STANDARD** — Phase B registers it, citing the MASTER.

### 1.6 Production shape (TEST data, Constitution §6 — code evidence only)

Proceeded/delivered priced orders paid in full with no issued Sales Invoice exist today (3 + 1).
**No backfill.** They are test rows; the go-live database starts clean.

---

## 2 · The owner's four checks

### 2.1 The EXACT "goods paid in full" condition

One new SQL helper `_sales_order_goods_money(p_order_id)` mirrors the `orderMoney` goods side
(`order-money.ts:99-125`) and nothing else. The system issues the Sales Invoice when ALL hold:

```text
source = 'lines'        priced = Σ lines qty×unit_price (null price = 0) + Σ add-ons > 0
paid  >= priced         orders.paid (2-dp numeric) — goods Balance due = RM 0
status in ('proceed_order','delivered')   Proceeded; not 'place', not 'cancelled'
no rental_agreements row                  Rental owns its own SINV papers
no live ISSUED Sales Invoice yet
```

- **Unknown value never issues** (`source = 'unknown'`, total null). **Keyed never issues**
  (`source = 'keyed'`: AutoCount-imported test rows; a payment never moves a keyed balance).
- **Voided payments**: `payment_void` subtracts from `orders.paid`, so a voided payment does not
  count. **Overpayment**: issues; the invoice amount is `priced`, never `paid`; the excess stays
  `payment.review_overpayment` (§5). **Storage payments**: kind `storage` never changes
  `orders.paid` (`0605:213, 219-224`), so they never count toward goods.
- **Amount** = `priced` exactly (goods + services), tax 0. Never storage (owner 2026-10-06), so
  `_sales_invoice_to_ledger`'s `storage_fee_on_two_documents` refusal can never fire.
- Parity test: the same fixtures through `orderMoney` (TS) and the SQL helper give the same
  `goodsOwing` and source.

### 2.2 Duplicate notifications never mint a second Sales Invoice

| Threat | Guard |
|---|---|
| double click / retried API call / Stripe callback + poll twice | `order_payments_source_idempotency_uidx` + the writer's early `already` return (`0605:91-103, 111-122`) — `orders.paid` is not updated, so the hook does not even fire |
| two different postings racing | both lock the order row (`0605:105`; helper re-locks `for update`); the second sees the first's invoice and returns `already` |
| any path reaching issue twice | helper returns early when a live ISSUED Sales Invoice exists; `invoices_live_sales_per_order_uidx` makes a second live Sales Invoice impossible (23505) |
| ledger | `gl_entries_one_active_per_source` UNIQUE (source_type, source_doc_no) + `gl_post` step-1 idempotency (`0468_*.sql:110-114`) |

### 2.3 A failure is safely retryable — design choice: payment never rolls back

**Chosen:** the invoice step runs in its own subtransaction (PL/pgSQL `begin … exception when
others … end` = savepoint) inside the posting transaction.

- Invoice number + snapshot + order stamp + history + its GL entry are **atomic with each
  other**: all commit or none.
- **The payment is never rolled back by an invoice failure.** Payment, receipt, allocation and
  the receipt's GL entry commit; the invoice part rolls back to the savepoint, so there is no
  half-issued number and no orphan GL entry.
- The failure is recorded as a fact: `ops_activity_log` action `invoice.issue_failed`
  (SQLSTATE + message) and `audit_log` actor `System`.
- **Retry:** the helper is idempotent. It re-runs on the next `orders.paid` / `status` change,
  on void-and-replace, and through a recovery RPC `payment_invoice_issue_due(order_id)`
  (operation/finance/principal; no amount, no draft, no choice — it performs the same system act
  only if due, and surfaces the error). The dispatch trigger remains the last backstop.
  A retry after a failed attempt cannot double-post: the failed attempt left no number and no
  entry.
- Conversely a payment that fails rolls back everything in its transaction, including an
  invoice issued in it — never an invoice without its money.

Why not "both atomic": the ledger refuses an invoice for configuration reasons (an add-on with no
income account, `0476_*.sql` §`_sales_invoice_to_ledger`). Atomic would refuse the customer's
money at the till for a chart-of-accounts gap. Why not "API after commit": a second network call
can be lost (Worker crash, Stripe webhook path has no staff session), Stripe and POS deposits run
with roles the gated issue door refuses, and two paths would need two idempotency stories.

### 2.4 Storage invoicing is unaffected

- `payment_storage_invoice` (0438), `payment_invoice_issue`'s storage behaviour, the INV number
  and the storage ledger split are unchanged; `ops_delivery_orders_money_gate` (0441/0447) is
  not touched.
- `payment_invoice_issue` becomes `role gate + _payment_invoice_issue_core(...)` with the SAME
  body (0500 `:7651-7696`), signature and return — one numbering body, two callers.
- Proof (test S1–S4, §5): storage paper issued before and after 0652 on the replayed database
  gives the same status, number shape, snapshot keys and journal lines; a storage payment does
  not create a Sales Invoice; the DO gate still refuses a DO with goods paid and a storage paper
  unpaid; `md5(prosrc)` of `payment_storage_invoice` and `ops_delivery_orders_money_gate`
  identical before/after.

---

## 3 · Design decision: SQL, in the posting transaction, hooked by a trigger

**Hook door: a new AFTER UPDATE OF `paid`, `status` row trigger on `orders`** (not deferred),
calling the system helper inside a savepoint. Plus one explicit call at the end of
`payment_invoice_void_replace` (Payment-owned) so a replacement issues at once when the goods are
already paid.

Why the trigger and not the posting RPC body:

- every way goods money reaches RM 0 changes `orders.paid` (all five writer callers,
  `payment_correct_allocation`), and Proceed changes `status` (all four Proceed callers,
  including the deferred handoff at commit). One hook covers all of them.
- **zero edits** to `_customer_payment_post`, `payment_record`, the Stripe RPC, the create
  wrappers, `_sales_order_proceed` (Sales Orders-owned), the DO gate or the storage door — the
  smallest collision surface with SO A3-2 (0651 edits `_sales_order_edit_baseline*` and
  `sales_order_commit_staff_change` only) and Delivery.
- the issue core updates `orders.invoice_no/invoiced_at`, not `paid`/`status`, so the trigger
  cannot re-fire itself.

Trade-off: a trigger is invisible to a function grep (memory: "an RPC write is invisible to a
table grep"). Mitigation: the migration comments every touched function, the probe asserts the
trigger exists, and MASTER §14 names it at closure.

**Actor `System`:** `issued_by` null, `order_history.by_user_id` null with
`metadata {"actor":"System","automatic":true}`, history text `Invoice issued · {no} (RM {x})`,
`audit_log.actor_text 'System'`.

**Snapshot:** built in SQL in the shape `issue_order_invoice` already uses
(`0476_*.sql:1347-1363`) plus add-on lines, `issued_from: "system_rm0"`.

**Not changed:** `INV-DDMMYY-NNNN` numbering (`INVYYMM` stays APPROVED TARGET / NOT BUILT);
storage; Monitor, rail and panel; the dispatch trigger (its adopt path becomes the normal path).

---

## 4 · Migration — YES · `0652`

**Number:** MAX of production tracker `0650` (`0650_ready_stock_priority_is_a_purchasing_setting`,
read-only list), repository `origin/main` tail `0650`, every remote branch (1,005 scanned with
`git ls-tree`) and local worktrees: `0651_a_commit_carries_the_order_the_editor_opened.sql` on
`origin/fix/so-edit-baseline-20261006` (SO A3-2). **Next free: `0652`.** No Delivery migration
file exists on any remote branch yet; if Delivery or SO lands `0652` first, take the next free
number at Phase B time.

**File:** `supabase/migrations/0652_the_invoice_issues_itself_when_the_goods_are_paid.sql`

**Contents:**

1. `_payment_invoice_issue_core(p_invoice_id, p_snapshot, p_actor uuid, p_actor_role app_role)`
   — the live `payment_invoice_issue` body minus the role gate. Revoked from public, anon,
   authenticated.
2. `payment_invoice_issue(uuid, jsonb)` — coalesced role gate + `return core(...)`. Guarded
   rewrite: only if live `md5` = `2c95fdf98bad5cd42e0d3baa4134295f`, else raise.
3. `_sales_order_goods_money(p_order_id)` → `(source, total, paid, balance_due)` — the SQL
   mirror of `orderMoney` goods side.
4. `_sales_invoice_issue_at_rm0(p_order_id)` — the system door: lock order; eligibility (§2.1);
   live issued ⇒ `already`; live draft (a void-and-replace replacement) ⇒ amount = priced,
   issue it; none ⇒ insert draft, issue it. Actor System.
5. `orders_sales_invoice_at_rm0()` + trigger `orders_sales_invoice_at_rm0_trg` AFTER UPDATE OF
   paid, status ON orders FOR EACH ROW WHEN (paid or status changed) — savepoint + failure fact.
6. `payment_invoice_void_replace` — the 0560 body + system issue of the replacement when due
   (savepoint); lineage via `replaces_invoice_id` unchanged.
7. `payment_invoice_issue_due(p_order_id)` — the recovery RPC (§2.3).
8. Manual doors closed: `revoke execute` from `authenticated` on `issue_order_invoice(uuid,
   numeric)`, `payment_invoice_prepare(uuid, numeric, numeric)`, `payment_invoice_issue(uuid,
   jsonb)` (the storage door is SECURITY DEFINER and still calls it). Functions stay.
9. `payment_communications` kind CHECK widened with `receipt_and_invoice` (drop + re-add the
   CHECK; no row touched); `payment_record_message_sent` (0560 body) — that kind requires
   `p_invoice_id` = the order's live ISSUED Sales Invoice and a screenshot, history text
   `Receipt and invoice sent`.
10. Sanity block: trigger present; core/door bodies; grants; storage bodies' md5 unchanged.

No DROP TABLE / TRUNCATE / DELETE. No RLS change. No row written, no backfill.

### Impact · Verification · Recovery

- **Impact.** From apply: the next posting or Proceed that brings a Proceeded, priced SO's goods
  `Balance due` to RM 0 issues one Sales Invoice (actor System) and posts Dr 1210 / Cr revenue
  once. Staff can no longer issue a Sales Invoice by hand (RPCs revoked; API doors answer 410).
  Storage papers, DO gate, numbering unchanged. Orders already at RM 0 are untouched until their
  next `paid`/`status` change.
- **Verification.** (a) replay: `node scripts/dry-run-migrations.mjs --changed-since origin/main
  --keep`, then `scripts/probe-invoice-at-rm0.sql` (all tests in §5) on the kept database;
  (b) production: one rolled-back `do` statement `probe_0652_rolled_back_do_not_track` executing
  the exact file + the probe + named negative control (`NC-0652: drop the trigger inside the probe
  → the RM 0 posting must issue 0 invoices`), ending `raise exception 'PROBE_ROLLBACK …'`;
  re-read proves nothing persisted; (c) apply with `apply_migration` named
  `0652_the_invoice_issues_itself_when_the_goods_are_paid`; reconcile CR-normalised
  `md5(prosrc)` of every touched function against `git show HEAD:<file>`; (d) after deploy, a
  test-data SO walked to RM 0 in production shows one `Invoice issued` line and one journal entry.
- **Recovery.** Forward-only (never edit 0652): a new migration `drop trigger
  orders_sales_invoice_at_rm0_trg` stops auto-issue instantly; re-`grant execute` restores the
  manual doors; `payment_invoice_issue` keeps its signature so the storage door is unaffected.
  An invoice issued wrongly is corrected by the existing Void and replace (reverses its entry,
  `invoices_reverse_ledger_on_void`). No data loss is possible: the migration writes no rows.

---

## 5 · Phase B — files

**Change:**

| File | Change |
|---|---|
| `supabase/migrations/0652_the_invoice_issues_itself_when_the_goods_are_paid.sql` | new (§4) |
| `scripts/probe-invoice-at-rm0.sql` | new — replay + rolled-back production probe |
| `apps/api/src/routes/finance/invoices.ts` | `/prepare`, `/:id/issue` → 410 `door_closed`; `record-message` accepts `receipt_and_invoice`; new order-keyed collection read (§0, unless the Line 1 agent ships it) |
| `apps/api/src/routes/orders.ts` (NOT `operation/orders.ts`) | `POST /:id/issue-invoice` → 410 `door_closed` (`:4464-4520`) |
| `apps/api/src/routes/operation/work.ts` | re-key `projectPaymentCollectionWork`, `projectOverpaymentReviewWork` to the SO; loader reads the order-keyed source; storage projector unchanged |
| `packages/shared/src/work-engine.ts` | registry text `:344-346, 361, 377, 613-615` |
| `packages/shared/src/payment-order-register.ts` (+ test) | new — order-keyed row, needed, clock (start = Proceed day) |
| `packages/shared/src/schemas/finance.ts` | `recordMessageInput.kind` adds `receipt_and_invoice` |
| `apps/web/src/lib/pdf/invoice-template.tsx`, `apps/web/src/lib/pdf/types.ts` | retire `doc_title` + SST rows + `TAX INVOICE` + `Payment request` mode; typed `kind` + `voided`; Sales Invoice prints `INVOICE`, `TOTAL`, `Paid in full`; storage faces print as today |
| `apps/api/src/routes/finance/invoices.ts` document route `:507-568` | send `kind`/`voided` instead of `doc_title` |
| `apps/web/src/pages/operation/components/OrderDetailDrawer.tsx` | remove the `Generate invoice` menu item and overlay mount |
| `apps/web/src/pages/operation/components/GenerateInvoiceOverlay.tsx` (+ test) | becomes unused; deleted only with coordinator OK (red line 5) |
| `apps/web/src/pages/finance/InvoiceSendReceipt.tsx` | `Send receipt and invoice` mode: both numbers, both documents, kind `receipt_and_invoice`, record only with the screenshot |
| `apps/web/src/pages/finance/InvoiceRecordPayment.tsx` | after posting, re-read the SO's live Sales Invoice; blue `Send receipt and invoice` when issued |
| `apps/web/src/pages/finance/PaymentCollectionWorkspace.tsx` | `Paid in full` bar door `Send receipt and invoice`; the Invoice appears once issued |
| `apps/web/src/pages/finance/InvoiceVoidReplace.tsx` | sentence: the replacement is issued by the system (word registered first) |
| `docs/COPY-STANDARD.md` | register `Send receipt and invoice` (Payment MASTER §16:2341) + the void-replace sentence |
| `docs/pdf/DOCUMENT-KIT.md`, `docs/payment/MASTER.md` §14/§16 | closure after production verification |
| tests | `work.test.ts`, invoices route tests, `InvoiceSendReceipt.test.tsx`, `InvoiceRecordPayment.test.tsx`, invoice-template render/source-scan test, order-money parity test |

**Confirmed NOT needed** (none is read or written by the design): `apps/api/src/routes/operation/orders.ts`
(amendment/save/list), `delivery-monitor.ts`, `PartnerArrangePage`, `DeliveryLinkPage`,
`SalesOrdersRegister` Stock Status paths, `packages/shared/src/payment-collection-owner.ts`
(owner stays resolved by `order_id`), `apps/web/src/pages/finance/PaymentMonitor.tsx`,
`apps/web/src/pages/finance/PaymentRecords.tsx`, `InvoiceCollectionOwner.tsx`.

---

## 6 · Acceptance tests (each with its negative control)

All SQL tests run in `scripts/probe-invoice-at-rm0.sql` on the replayed database and inside the
rolled-back production probe.

| # | Test | Fails without the fix because |
|---|---|---|
| T1 | priced RM 1,000 SO, Proceeded, deposit 500 ⇒ 0 Sales Invoices; pay 500 ⇒ exactly 1 issued, amount 1,000, `issued_by` null, 1 `SALES_INVOICE` entry, history `Invoice issued` | NC: drop the trigger inside the probe ⇒ count 0 ⇒ assert fails |
| T2 | repeat the same `payment_record` key; `record_stripe_checkout_payment` twice; a further overpayment ⇒ still 1 invoice, 1 entry | NC: helper without the `live issued ⇒ already` guard ⇒ 23505 / second number ⇒ assert fails |
| T3 | `create_order_from_sales_portal` paid in full ⇒ 1 invoice at Proceed in the same transaction; paid in full but Proceed blocked (no signature) ⇒ 0; then `proceed_order` ⇒ 1 | NC: trigger without `status` in its column list ⇒ 0 at Proceed |
| T4 | Void and replace as Payment Approver ⇒ old `voided` with reason, its entry reversed, replacement issued automatically with a new number and `replaces_invoice_id` = old; a payment voided first ⇒ replacement waits as draft and issues at the next RM 0 | NC: replacement without lineage / left draft at RM 0 ⇒ assert fails |
| T5 | render `kind: sales` ⇒ text has no `SST`, no `TAX INVOICE`, no `PAYMENT REQUEST` / `Payment request`; `doc_title` gone from the type (`@ts-expect-error`); storage kinds render as today | NC: restore the SST row ⇒ source-scan test fails |
| T6 | `receipt_and_invoice` with blank screenshot ⇒ `screenshot_required`; without the invoice, or with a draft/voided one ⇒ refused; with all ⇒ 1 row + `Receipt and invoice sent`. Web: Record disabled until a photo is chosen; posts kind `receipt_and_invoice` | NC: remove the screenshot check ⇒ refusal test fails |
| C1 | unknown value, keyed import, cancelled, rental, `place` ⇒ 0 invoices; storage payment ⇒ 0; payment void after issue ⇒ invoice stays, no second at re-payment; SQL helper = `orderMoney` on shared fixtures | NC: drop the `source = 'lines'` test ⇒ keyed fixture issues |
| C3 | force the ledger to refuse (unmapped add-on income account) ⇒ payment + receipt committed, 0 invoices, 0 invoice entries, `invoice.issue_failed` logged; map the account, call `payment_invoice_issue_due` ⇒ 1 invoice, 1 entry | NC: remove the savepoint ⇒ the payment rolls back ⇒ assert fails |
| S1–S4 | storage paper before/after 0652 identical (status, number shape, snapshot keys, journal lines); storage payment no Sales Invoice; DO gate refuses goods-paid + storage-unpaid; storage + gate `md5(prosrc)` unchanged | NC: system invoice amount includes storage ⇒ `storage_fee_on_two_documents` |
| W1–W4 | §0 Work re-key | NC: old invoice-keyed projector raises nothing for W1 |

---

## 7 · Blockers and ambiguities (quoted)

1. **Clock start day.** MASTER §3 Collection timing: *"A clock runs under the rule in force on
   the day it started — the invoice's issue day"*. Under the 2026-09-25 money rule there is no
   invoice before RM 0. Recommendation (engineering, not an owner question): the SO's Proceed day
   (`orders.proceeded_at`, Kuala Lumpur date). The PLAN chat should overwrite that line.
2. **Stale manual-issue text.** MASTER §16: *"Draft may be edited and issued. … the replacement
   draft is issued from the order's `Generate invoice`, which draws a new number."* contradicts
   §2: *"There is no manual `Generate invoice` door and no draft/issue step for staff."* §2 is the
   later ruling; Phase B follows §2. PLAN to overwrite §16.
3. **Storage paper footer.** DOCUMENT-KIT §1: *"Payment Request … RETIRED … The `doc_title`
   switch inside the Invoice template goes with it."* Today a Storage Invoice prints `TOTAL DUE`
   and *"Payment request. Not a tax invoice."* (`invoice-template.tsx:377, 395-399`). The
   coordinator's check 4 says storage behaves exactly as today. Phase B keeps the storage face
   unchanged; PLAN decides whether that footer sentence changes on storage papers.
4. **SO-keyed source owner.** §0: one order-keyed read must serve Work and the Monitor. Who
   ships it first (me or the Line 1 agent) — coordinator to confirm.
5. **Price decrease reaching RM 0.** Payment MASTER header: a price decrease after Proceed needs
   Sales Approver and is *"TARGET NOT BUILT"*. It changes `order_lines`, not `orders.paid`, so the
   trigger does not see it. When the SO amendment lane builds it, it calls
   `_sales_invoice_issue_at_rm0`. Not hooked in scope 1.
6. **Deposit receipt with no invoice.** `record-message` is keyed by invoice id
   (`invoices.ts:594-628`); before RM 0 there is no invoice, so a deposit `Send receipt` has no
   door. Out of scope 1; flagged for the Line 1 / Payment Records work.
