# Balance job — full plan (2026-06-26)

> Jess: **"complete all the balance job."** He's the boss + operator; do NOT gate
> him or ask which piece to start — this plan IS the sequence. Build it
> end-to-end across sessions. Branch `feat/orders-drawer-redesign` (worktree
> `C:\Users\User\carres-worktrees\orders-drawer`). NOT pushed/deployed.

## What "the balance job" is
Per-customer **balance owing + storage fee + payment status**, plus the
**collect-before-delivery** workflow Jess defined 6/23. Four parts:

| Part | State |
|---|---|
| A. Payments panel (Balance tab) + storage auto-compute | ✅ built + on prod (main, 6/12, migration 0165). All key-in. |
| B. Balance number source (AutoCount Balance import) | Jess keys it in today; AutoCount import is his own optional convenience (NOT a separate dev / no gating). Out of scope for this build. |
| C. Storage collection + delivery GATE + waiver approval | ⏳ build (Phase 2 below) |
| D. Payment ledger (multi-entry + receipts) | ⏳ build (Phase 1 below) |

Locked storage rule (already in `computeStorageFee`): from ETA, **MS/BF
RM150/month · Sofa RM200/2 weeks**, per commenced period, override-able.

## Foundation — DONE this session (committed, verified)
- **Migration `0184_order_payments_ledger.sql`** (NOT yet applied — Jess applies via MCP):
  - `order_payments` ledger table (`order_id` → orders CASCADE; amount>0; method
    cash/bank/card/cheque/online/other; kind payment/deposit/storage; reference /
    receipt_no / receipt_url / note / recorded_by). RLS: internal read +
    operation/principal write (mirrors `ooc_*`).
  - `ops_order_control` += `storage_collected_at`, `storage_waiver_status`
    (none/requested/approved/rejected), `storage_waiver_reason`,
    `storage_waiver_requested_by/decided_by/decided_at`.
- **`packages/shared/src/schemas/order-payments.ts`** (8 tests, tsc clean):
  `PAYMENT_METHODS`, `PAYMENT_KINDS`, `recordPaymentInputSchema`,
  `OrderPaymentRow`, `summarizePayments(payments, bill)` →
  `{ paid, byKind, outstanding, storageCollected }` (goods outstanding = bill −
  (payment+deposit), floored at 0; storage summed separately). Exported from
  `@carres/shared`.

## Phase 1 — Payment ledger (D) [BUILD NEXT]
Replace the single `paid_amount` with the real ledger.
1. **API** (`apps/api/src/routes/operation/...`):
   - `GET  /api/operation/orders/:id/payments` → list `order_payments` for the order.
   - `POST /api/operation/orders/:id/payments` → validate `recordPaymentInputSchema`,
     insert (set `recorded_by` from JWT). operation/principal only.
   - `DELETE /api/operation/orders/:id/payments/:pid` → void a wrong entry (optional, principal-only).
   - Add the embedded payment summary to the Payments-panel read + the order detail
     (`useOperationOrder`) so the drawer + panel show outstanding from the ledger.
2. **Shared query keys + hooks** (`apps/web/src/lib/queries.ts`): `useOrderPayments(id)`,
   `useRecordPayment(id)` (invalidate `qk.operation.order(id)` + `["operation","payments"]`).
3. **Drawer Payment section** (`OrderControlPanel.tsx` `PaymentControlFields` →
   add a ledger): list payments (date · amount · method · kind · receipt) + an
   "Add payment" inline form (amount, date, method, kind) → `summarizePayments`
   shows Paid / Outstanding live. Keep `paid_amount` read-only fallback until the
   panel is migrated.
4. **Payments panel** (`OperationPayments.tsx`): Outstanding column reads the
   ledger summary; row expands to the payment history.
5. **Receipt PDF**: mirror the invoice/DO PDF (`apps/web/src/lib/pdf/`) — one
   receipt per payment; store to a `receipts` bucket, write `receipt_url`. (Can
   be a fast-follow after the ledger records.)

## Phase 2 — Storage collection + delivery gate + waiver (C)
Builds on Phase 1 (a storage collection = an `order_payments` row, kind `storage`).
1. **Collect storage**: in the drawer Storage section, "Collect storage fee" →
   records a `kind:'storage'` payment + sets `ops_order_control.storage_collected_at`
   + issues a receipt (reuse Phase 1 receipt). Shows computed fee vs collected.
2. **Delivery GATE**: in the dispatch path (`apps/api/.../operation/orders/:id/assign-partner`
   / dispatch RPC), REJECT (422) if a storage fee is due AND
   `storage_collected_at IS NULL` AND `storage_waiver_status <> 'approved'`. Surface
   the reason in the drawer ActionBar so the operator knows why dispatch is blocked.
3. **Waiver (principal-approved)**: operator "Request waiver" (reason) →
   `storage_waiver_status='requested'`. Principal approves/rejects (mirror the
   existing `approvals` flow from 0013/0014 — route it to the principal's
   approvals inbox). On approve → status `approved`, gate opens. **Only principal
   may approve** — enforce in the Hono route (role check) + ideally a trigger
   (0175-style) rejecting non-principal status→approved. Jess IS the principal, so
   this never gates him; it's a guardrail for junior operators.

## Acceptance
- Record N payments on an order → Outstanding = bill − Σ(payment+deposit), live in
  drawer + panel; storage collection shows separately.
- Dispatch blocked until storage collected or waiver approved; reason shown.
- Waiver request → principal approves → dispatch allowed. Non-principal cannot approve.
- Receipts generated + retrievable.
- Tests: shared (done) + API routes (msw) + a drawer ledger component test + an
  E2E happy path (record payment → outstanding updates; collect storage → dispatch allowed).
- tsc + build clean; SERVICE_ROLE dist scan 0; no new regressions vs the
  pre-existing 5 web / 3 api fails (§17.7).

## Notes / guardrails
- Migrations applied MANUALLY via MCP by Jess (Supabase MCP write-blocked for Claude).
  Next free number is **0184** (branch has 0180–0183 unapplied).
- Shared worktree with a parallel chat (filter work = `OperationOrdersControl.tsx`).
  Balance touches `order_payments` / `OperationPayments.tsx` / `OrderControlPanel.tsx`
  payment+storage sections / API — **commit explicit paths only**, don't clobber the
  parallel chat's uncommitted files (e.g. the checkpoint doc).
- Jess = sole authority ([[feedback-jess-full-authority-no-gating]]). Drive; present
  defaults; don't ask permission-type questions.
