# Payment module — full proposal (LOCKED 2026-07-22)

> Spec for the Payment module redesign. Current state: `Payments` sidebar item exists (shipped 2026-06-12 via migration 0165 · storage fees LOCKED: MS/BF RM150/mo · Sofa RM200/2wk from ETA). This doc EXTENDS that with cockpit discipline + supplier AP side + refunds + bank reconciliation.

---

## How to resume (any machine, any new chat)

Paste this into a fresh chat:

> Continue Payment module build. Read in order:
> 1. `docs/payment-module-proposal.md` — this file, the SPEC
> 2. `docs/COPY-STANDARD.md` — microcopy rules
> 3. `docs/UI-KIT.md` §A0 — Module-tab law
> 4. `docs/purchasing/MASTER.md` — Purchasing reference *(corrected 2026-07-29: `purchase-cockpit-handoff.md` deleted 2026-07-27)*
> 5. `orders/MASTER.md` — Orders sibling (Payment's ③ 钱 track lives in Orders)
> 6. `docs/inventory-module-proposal.md` + `docs/delivery-module-proposal.md` — siblings
>
> Live-poke `https://erp.carresofficial.com/operation?tab=payments` for current state.
>
> Start with **Phase 0 · user research** (observe Jess doing 1 morning of Collect $ + 1 afternoon of pay-supplier).

---

## Contract

- **EXTEND existing Payments panel** (shipped 2026-06-12). Don't tear down migration 0165 storage fee model.
- Cockpit discipline (3-pane · row action-line · What-to-do) applied.
- Add supplier AP side + refund workflow + bank statement reconciliation.
- Zero danger-zone breakage — existing `orders.paid` / `orders.balance` / storage fee calc UNTOUCHED.
- One PR per phase.
- Deploy only from `main`.

---

## LOCKED decisions

**HARD:**

| # | Decision | Why |
|---|---|---|
| 1 | Module name = **Payments** (plural, keep current) | Already deployed; consistency |
| 2 | 4 tabs = **Collect · Pay · Reconcile · Refunds** | Each = one distinct workflow. SAP FI-AR / FI-AP / GL / Refunds pattern; Odoo Accounting same |
| 3 | Storage fee model (RM150/mo MS-BF · RM200/2wk Sofa from ETA) LOCKED | Signed off 2026-06-12, in production, revenue-critical |
| 4 | Bank reconciliation via Maybank2u CSV import (5 col · Q3=B format) | Locked in memory (`phase-10-csv-bulk-import` CF) |
| 5 | Refund workflow separate from Collect (money flows OUT, not IN) | Different accounting treatment (contra-revenue vs receivable) |
| 6 | 3-pane inline split for all 4 tabs | Consistency with Purchase + Orders + Inventory + Delivery |
| 7 | Row action-line + inline What-to-do per stage (COPY-STANDARD) | Zero-experience friendly · same discipline |
| 8 | PayHold gate — customer owes → block Delivery Assign (already in Delivery LOCK #2, mirrored here) | Money is upstream of goods movement |

**NEGOTIABLE:**

| # | Decision | Alternative |
|---|---|---|
| 9 | Collect tab shows balance + storage in one row | Could split into 2 tabs (Balance · Storage) |
| 10 | Pay tab includes both PO payments + operational expenses | Could be 2 separate tabs (Pay-supplier · Opex) |
| 11 | Refund reasons pre-defined dropdown vs free text | Dropdown recommended for reporting |
| 12 | Bank reconciliation auto-match rules (name similarity + amount + date range) | Configurable per bank |

---

## Executive rating trajectory

| Point | Rating | State |
|---|---|---|
| Now | 5/10 | Payments panel exists with Balance tab · storage fees LOCKED · no supplier AP · no refund · no reconciliation |
| After Phase 1 (copy audit + cockpit) | 6/10 | Vocab aligned, 3-pane applied to Collect |
| After Phase 2 (Pay tab · supplier AP) | 7/10 | Full 2-way money view |
| After Phase 3 (Refunds tab) | 8/10 | Refund lifecycle |
| After Phase 4 (Reconcile tab · Maybank2u import) | 9/10 | Book-vs-bank matched |
| After Phase 5 (Phase 0 findings + live-tune) | 9.5/10 | Real ops feedback baked in |
| After 2 weeks live-usage + real accountant review | 10/10 | Only real audit reveals |

---

## Full ASCII layouts

### Tab 1 · Collect · customer AR (extends current Balance)

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Payments │ [Collect 45 · RM 128k] [Pay 12 · RM 45k] [Reconcile] [Refunds 3] │ ⟳ 🔔 ❓ ⚙   │  Row 1 · 42px
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ① Balance owing 32 · RM 95k ] [ ② Storage overdue 8 · RM 12k ] [ ③ Deposit pending 5 ]   │  Row 2 · 32px · sub-stages
├──────────┬────────────────────────────────────┬──────────────────────────────────────────┤
│ FACET    │ MIDDLE LIST                         │ DETAIL (always visible)                    │
│ (200)    │ (420)                                │ (fills)                                    │
│          │                                      │                                            │
│ NEEDS    │ 💰 SO-1210 · dato · KV              │ Collect from dato · SO-1210               │
│ Late 8   │ RM 2,500 owing · 12 days overdue    │ Delivery held 🔒 until paid                │
│          │ Blocks delivery Mon 27.              │ ─────────────────                          │
│ BY       │                                      │  BREAKDOWN     AMT           STATUS       │
│ REGION   │ 💰 SO-1207 · PETER · Klang          │  Balance       RM 2,000      13d overdue  │
│  KV 12   │ RM 1,800 owing · 5 days overdue     │  Storage MS    RM 300        (from ETA)   │
│  Klang 8 │ Call PETER for payment.              │  Storage SOF   RM 200        (14-day)    │
│  Outstn 5│                                      │  TOTAL         RM 2,500                    │
│          │ 💰 SO-1204 · ella · KL              │                                            │
│ BY       │ Storage MS RM 150 · 3d overdue       │ RECENT CONTACT                            │
│ AGE      │ Deposit already paid.                │ 20 Jul · SMS reminder sent                │
│  0-3d 5  │                                      │ 15 Jul · Called, no answer                │
│  4-14d 10│                                      │                                            │
│  >14d 8  │                                      │ WHAT TO DO (③ balance owing 13d)          │
│          │                                      │ 1. WhatsApp dato with SS statement         │
│ BY       │                                      │ 2. Wait 24h for reply                      │
│ AMOUNT   │                                      │ 3. If no reply → escalate to Jess          │
│  <500 5  │                                      │ 4. If paid → confirm bank + release hold   │
│  <5k 20  │                                      │                                            │
│  >5k 8   │                                      │ [ Send SMS reminder ] [Confirm payment]   │
└──────────┴────────────────────────────────────┴──────────────────────────────────────────┘
```

### Tab 2 · Pay · supplier AP

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ① Due this week 6 ] [ ② Due later 4 ] [ ③ Overdue 2 · RM 8k ]                             │
├──────────┬────────────────────────────────────┬──────────────────────────────────────────┤
│ FACET    │ MIDDLE LIST                         │ DETAIL                                     │
│ (200)    │ (420)                                │ (fills)                                    │
│          │                                      │                                            │
│ NEEDS    │ 💸 PO-88 · Ohana                    │ Pay Ohana for PO-88                       │
│ Overdue 2│ RM 12,500 due Wed 24                 │ Sofa 5539-CNR · 3 units                    │
│          │ Pay Ohana Wed by 5pm.                │ ─────────────────                          │
│ BY       │                                      │  AMOUNT       RM 12,500                    │
│ SUPPLIER │ 💸 PO-86 · Nice Future              │  DUE          Wed 24 Jul (in 2d)          │
│ Ohana 4  │ RM 3,200 due Fri 26                  │  METHOD       Bank transfer (Maybank)      │
│ NiceF 3  │ Pay Nice Future by Fri.              │  ACCOUNT      Ohana Furniture Sdn Bhd     │
│ Bedfr 1  │                                      │                RHB 6-12345-6789           │
│          │ 💸 PO-84 · Ohana                    │  REFERENCE    PO-88 / Carres              │
│          │ RM 4,800 delivered · confirm arrived │                                            │
│          │ Confirm goods before releasing pay.  │ WHAT TO DO                                 │
│          │                                      │ 1. Verify GRN complete (from Receiving)   │
│          │                                      │ 2. Screenshot bank transfer receipt        │
│          │                                      │ 3. Upload receipt here                     │
│          │                                      │ 4. Notify Ohana via WhatsApp               │
│          │                                      │                                            │
│          │                                      │ [ Mark paid ] [ Upload receipt ]          │
└──────────┴────────────────────────────────────┴──────────────────────────────────────────┘
```

### Tab 3 · Reconcile · bank statement matching

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Upload Maybank2u CSV                             [ 📤 Upload July 2026.csv ]                 │
│ Last uploaded: 20 Jul · covers 1-19 Jul                                                      │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ IMPORT PREVIEW · 82 transactions read                                                        │
│                                                                                              │
│ ✅ Auto-matched · 65 transactions (customer paid → SO closed)                                 │
│ ⚠  Unmatched · 12 transactions (unknown ref)                       [ Match manually ▾ ]     │
│ ⚠  Duplicate suspect · 5 transactions (same amount 2 days apart)   [ Review ▾ ]              │
│                                                                                              │
│ SAMPLE UNMATCHED                                                                              │
│ Date        Amount      Description                              Suggested match             │
│ 18 Jul      RM 2,500    IB FUND TRANSFER (DATO XXXX)              [ SO-1210 (RM 2,500) ▼ ]  │
│ 17 Jul      RM 1,800    IB FUND TRANSFER (PETER SXXX)             [ SO-1207 (RM 1,800) ▼ ]  │
│ 15 Jul      RM 4,800    OHANA FURNITURE SDN BHD                   [ PO-84 (RM 4,800) ▼ ]    │
│ ...                                                                                          │
│                                                                                              │
│ [ Apply all matched ]                                     [ Skip · review later ]           │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Tab 4 · Refunds · customer refunds pending

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ① Approval needed 2 ] [ ② Ready to pay 1 · RM 500 ] [ ③ Paid this month 3 · RM 1,850 ]   │
├──────────┬────────────────────────────────────┬──────────────────────────────────────────┤
│ FACET    │ MIDDLE LIST                         │ DETAIL                                     │
│ (200)    │ (420)                                │ (fills)                                    │
│          │                                      │                                            │
│ BY       │ 💵 SO-1195 · Ali · KV               │ Refund Ali · SO-1195                      │
│ REASON   │ RM 500 refund · defective mattress  │ Reason: defective mattress                 │
│ Defect 1 │ Awaiting Jess approval.              │ Requested 20 Jul by sales@                 │
│ Cancel 1 │                                      │ ─────────────────                          │
│ Downgrd 1│ 💵 SO-1180 · Amy · Klang            │  ORIGINAL PAID  RM 3,500                   │
│          │ RM 200 refund · cancelled service    │  REFUND AMT     RM 500                     │
│          │ Ready to pay via bank.               │  RESIDUAL       RM 3,000 (customer keeps)  │
│          │                                      │  METHOD         Bank transfer              │
│          │                                      │  CUSTOMER BANK  Maybank 5-14567-234        │
│          │                                      │                                            │
│          │                                      │ APPROVAL CHAIN                             │
│          │                                      │ ✅ Requested · 20 Jul · sales@             │
│          │                                      │ ⚠  Awaiting · Jess (COO)                   │
│          │                                      │                                            │
│          │                                      │ WHAT TO DO                                 │
│          │                                      │ 1. Verify defect via Service Case link     │
│          │                                      │ 2. Approve or reject                       │
│          │                                      │ 3. If approve → moves to ② Ready to pay    │
│          │                                      │                                            │
│          │                                      │ [ Reject ] [ Approve → Ready to pay ]      │
└──────────┴────────────────────────────────────┴──────────────────────────────────────────┘
```

---

## Data model (LOCKED · additive migrations)

**Migration 0250 · supplier_payments (Pay tab data)**

```sql
create table supplier_payments (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id),
  supplier_id uuid references suppliers(id),
  amount numeric(12,2) not null,
  due_date date not null,
  paid_at timestamptz,
  paid_by uuid references salespersons(id),
  payment_method text check (payment_method in ('bank_transfer', 'cheque', 'cash', 'other')),
  bank_receipt_url text,
  reference_no text,
  status text not null check (status in ('due', 'paid', 'overdue', 'disputed')),
  created_at timestamptz default now()
);
```

**Migration 0251 · refunds**

```sql
create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id),
  amount numeric(12,2) not null,
  reason text not null check (reason in ('defective', 'cancelled', 'downgrade', 'wrong_item', 'other')),
  reason_note text,
  requested_by uuid references salespersons(id),
  requested_at timestamptz default now(),
  approved_by uuid references salespersons(id),
  approved_at timestamptz,
  paid_by uuid references salespersons(id),
  paid_at timestamptz,
  customer_bank_account text,
  status text not null check (status in ('pending_approval', 'ready_to_pay', 'paid', 'rejected'))
);
```

**Migration 0252 · bank_statement_imports + bank_transactions**

```sql
create table bank_statement_imports (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz default now(),
  uploaded_by uuid references salespersons(id),
  source_file text not null,
  bank text not null check (bank in ('maybank', 'cimb', 'public_bank', 'rhb', 'other')),
  covers_from date not null,
  covers_to date not null,
  total_txns int not null,
  auto_matched int not null,
  unmatched int not null,
  status text not null check (status in ('draft', 'applied', 'discarded'))
);

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references bank_statement_imports(id) on delete cascade,
  txn_date date not null,
  amount numeric(12,2) not null,       -- signed: + = incoming, - = outgoing
  description text,
  reference_no text,
  matched_type text check (matched_type in ('customer_payment', 'supplier_payment', 'refund_out', 'opex', 'unknown')),
  matched_ref_id uuid,                 -- FK to orders / supplier_payments / refunds
  matched_by uuid references salespersons(id),
  matched_at timestamptz,
  status text not null check (status in ('unmatched', 'suggested', 'confirmed', 'skipped'))
);
```

**No migration for Collect tab** — extends existing `orders.paid` + storage fee calc (migration 0165). Just UI redesign.

---

## PayHold integration (LOCKED #8)

**Downstream modules query:**

```sql
-- Is delivery blocked for this SO?
select exists (
  select 1 from orders
  where id = $1
  and status not in ('placed', 'delivered', 'cancelled')
  and (balance > 0 or storage_owed > 0)
) as delivery_blocked;
```

**Delivery module Assign action:** if `delivery_blocked = true` → modal:
```
This customer owes RM 2,500 (RM 2,000 balance + RM 500 storage).
[ Wait for payment ]                    [ Deliver anyway (Jess override) ]
```

Jess override logs to `audit_log` with `reason` required.

---

## Executable phases

- **Phase 0** (~2h · RESEARCH)
  - Observe Jess: 1 morning Collect $ (calls, WA reminders, bank checks) + 1 afternoon pay-supplier (bank transfer, receipt upload)
  - 5 questions: (1) How do you know today who to chase? (2) What blocks a Collect from happening? (3) How do you decide storage waiver? (4) How do you verify supplier bank account? (5) What's the annoying part of bank reconciliation?
  - Write `docs/payment-phase-0-findings.md`

- **Phase 1** (~4h + 3h review) — Collect tab cockpit
  - Extend existing `OperationPayments.tsx` with 3-pane
  - Facet + row action-line + What-to-do per stage
  - Sub-tabs (Balance / Storage / Deposit)
  - Copy audit

- **Phase 2** (~5h + 3h review) — Pay tab (new)
  - Migration 0250 · `supplier_payments`
  - 3-sub-stage tabs (Due this week / Due later / Overdue)
  - Detail pane with bank account + reference
  - `[ Mark paid ]` + `[ Upload receipt ]` (Storage bucket `payment-receipts`)

- **Phase 3** (~3h + 2h review) — Refunds tab (new)
  - Migration 0251 · `refunds`
  - 3-sub-stage tabs (Approval / Ready / Paid)
  - Approval workflow with Jess override
  - Link to Service Case (post-delivery reason)

- **Phase 4** (~6h + 4h review) — Reconcile tab (new)
  - Migration 0252 · `bank_statement_imports` + `bank_transactions`
  - Maybank2u CSV parser (5-col, Q3=B format)
  - Auto-match algorithm (customer name similarity + amount + date range)
  - `[ Apply all matched ]` bulk action

- **Phase 5** (~3h + 2h review) — PayHold + Phase 0 findings
  - `orders.payment_hold_at` computed column
  - Integrate with Delivery module Assign gate
  - Jess override + audit_log
  - Live-tune based on findings

**Total: ~23h impl + 14h review = ~37h across 6-7 weeks · 5 PRs · Payments 5/10 → 9.5/10.**

---

## Critical self-audit · rating 7/10

### Real gaps

| # | Gap | Fix |
|---|---|---|
| 1 | **Storage fee override / waiver** UI missing | Phase 1: `[ Waive storage ]` action requires Jess approval + reason |
| 2 | **Partial payment** (customer pays RM 1,000 of RM 2,500 owing) not detailed | Phase 1: multiple payment records per SO; balance = SUM logic |
| 3 | **Supplier payment method beyond bank transfer** (cheque, cash) | Phase 2: method dropdown + cheque number field |
| 4 | **Refund flows OUT before verification** — risk if defect claim fraudulent | Phase 3: refund gated by Service Case status = `verified` |
| 5 | **Multi-bank reconciliation** — Carres uses only Maybank today, but future | Phase 4: bank enum extendable; CSV format per bank |
| 6 | **Foreign currency** — supplier from China/Vietnam paid USD | Phase 5+: add `currency` field to `supplier_payments`; FX rate at time of pay |
| 7 | **Petty cash tracking** missing | Phase 5+: separate `petty_cash_transactions` table |
| 8 | **Financial reports (P&L basic)** missing | Phase 5+: `Reports` sub-tab in Payments OR separate Reports module (P4 in overall roadmap) |
| 9 | **PayHold override chain** — who besides Jess can override? What audit for accountant? | Phase 5: role-based override permissions + monthly audit report |
| 10 | **Bank statement CSV format** may change (Maybank UI updates) | Phase 4: format version detection; graceful fallback + operator alert |

### Solutions to lift 7→9/10

- **Solution A · Storage waiver + partial payment** (Fixes 1, 2)
- **Solution B · Multi-bank + FX** (Fixes 5, 6)
- **Solution C · Refund verification gate** (Fix 4)
- **Solution D · Reports foundation** (Fix 8 · handoff to future Reports module)

Rated after these: 9/10.
Rated after 2 weeks live + external accountant review: 10/10 (audit-grade only comes from actual audit).

---

## Anti-drift note for next chat

If a fresh chat reads this and thinks any LOCKED decision is wrong:
1. HARD-locked → ASK Jess in chat first
2. NEGOTIABLE-locked → open a doc-amendment PR
3. NOT silently redesign

Reference the LOCKED # when proposing changes.
