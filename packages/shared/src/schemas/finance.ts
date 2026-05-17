import { z } from 'zod';

/**
 * Phase 5 — HQ Finance role inputs.
 *
 * Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.6.
 *
 * Maps 1:1 to the SQL `payment_method` enum (0001:36-38) — cash /
 * bank_transfer / cheque / credit_card / debit_card / duitnow_qr /
 * dealer_deposit. Distinct from `orders.payment_method` (which is the
 * customer-side "online | credit | installment" instrument). This enum
 * is for the `payments` table on the inbound (receipt) and outbound
 * (refund / supplier) sides.
 */
export const paymentMethodEnum = z.enum([
  'cash',
  'bank_transfer',
  'cheque',
  'credit_card',
  'debit_card',
  'duitnow_qr',
  'dealer_deposit',
]);
export type PaymentMethod = z.infer<typeof paymentMethodEnum>;

/**
 * `financeTopupApproveInput` — POST /api/finance/payments/topup-approve.
 * Maps to RPC `finance_topup_approve(approval_id, method, reference, receipt_url)`
 * (migration 0062). Q1=A locked 2026-05-08 — wraps approval_decide +
 * dealer_topup atomically. Caller supplies the approval row id (from a
 * pending top_up approval) plus the actual payment instrument used.
 */
export const financeTopupApproveInput = z.object({
  approvalId:  z.string().uuid(),
  method:      paymentMethodEnum,
  reference:   z.string().min(1).max(255).nullable().optional(),
  receiptUrl:  z.string().min(1).max(2048).nullable().optional(),
}).strict();
export type FinanceTopupApproveInput = z.infer<typeof financeTopupApproveInput>;

/**
 * `financeRecordReceiptInput` — POST /api/finance/payments/order-receipt.
 * Maps to RPC `finance_record_receipt(order_id, amount, method, reference)`
 * (migration 0062). The AR drawer's "Record receipt" panel calls this
 * when finance keys in a customer payment against an order.
 *
 * Server enforces `amount > 0` AND order existence. Overpayment is
 * allowed (V1) and surfaces in AR as outstanding clamped to 0.
 */
export const financeRecordReceiptInput = z.object({
  orderId:    z.string().uuid(),
  amount:     z.number().positive().finite(),
  method:     paymentMethodEnum,
  reference:  z.string().min(1).max(255).nullable().optional(),
}).strict();
export type FinanceRecordReceiptInput = z.infer<typeof financeRecordReceiptInput>;

/**
 * `refundPayInput` — POST /api/finance/refunds/:id/pay.
 * Maps to RPC `refund_pay(refund_id, method, reference)` (migration 0062).
 * Marks an `approved` refund as `paid` AND inserts an outbound payments
 * row tied to the refund. Caller MUST first decide the approval row via
 * `approval_decide` (kind=refund) so the refund row reaches `approved`
 * status — this RPC rejects pending / paid / rejected refunds with
 * ERRCODE 22023.
 */
export const refundPayInput = z.object({
  method:     paymentMethodEnum,
  reference:  z.string().min(1).max(255).nullable().optional(),
}).strict();
export type RefundPayInput = z.infer<typeof refundPayInput>;

/**
 * `paymentsListQuery` — GET /api/finance/payments?orderId&dealerId&direction&from&to.
 * Query string parser for the payments list. All fields optional. The
 * route does the actual SELECT against the `payments` table via userClient
 * + RLS — there's no RPC for the list because RLS already restricts to
 * principal/finance via existing 0002 policies on payments (read access).
 *
 * Date filters are inclusive on both ends per finance UX expectation.
 */
export const paymentsListQuery = z.object({
  orderId:    z.string().uuid().optional(),
  dealerId:   z.string().uuid().optional(),
  direction:  z.enum(['in', 'out']).optional(),
  from:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit:      z.coerce.number().int().min(1).max(500).optional(),
}).strict();
export type PaymentsListQuery = z.infer<typeof paymentsListQuery>;

/**
 * `financeInvoiceIssueInput` — POST /api/finance/invoices/issue.
 * Wraps the existing `invoice_issue(order_id, amount, tax_amount)` RPC
 * (0003:289). Q2=A locked 2026-05-08: manual click only, NOT auto on
 * order_advance. The route additionally gates on `orders.status =
 * 'delivered'` before calling the RPC (returns 422 otherwise) — proto
 * AR drawer also gates the "Download invoice" button on
 * delivered + paid >= total.
 *
 * SST 8% inclusive (per proto finance-invoices.jsx:34): caller passes the
 * GROSS amount (incl. tax) and the tax portion separately. Server stores
 * both on `invoices.amount` (gross) and `invoices.tax_amount` (the SST).
 */
export const financeInvoiceIssueInput = z.object({
  orderId:    z.string().uuid(),
  amount:     z.number().positive().finite(),
  taxAmount:  z.number().nonnegative().finite().optional(),
}).strict();
export type FinanceInvoiceIssueInput = z.infer<typeof financeInvoiceIssueInput>;

/**
 * `financeInvoiceVoidInput` — POST /api/finance/invoices/:id/void.
 * Marks an issued invoice as voided by stamping `voided_at`. Reason is
 * captured for audit; the RPC layer doesn't enforce a reason length, but
 * the route requires non-empty since proto's void modal demands a reason.
 */
export const financeInvoiceVoidInput = z.object({
  reason: z.string().min(1).max(500),
}).strict();
export type FinanceInvoiceVoidInput = z.infer<typeof financeInvoiceVoidInput>;

/**
 * `invoicesListQuery` — GET /api/finance/invoices?status&dealerId&from&to.
 * Status is the derived field (paid|partial|unpaid|void) computed by the
 * route from `invoices.voided_at` + `orders.paid` vs `invoices.amount`.
 * The DB doesn't store derived status, so the filter is applied
 * post-fetch in the route handler.
 */
export const invoicesListQuery = z.object({
  status:    z.enum(['all', 'unpaid', 'partial', 'paid', 'voided']).optional(),
  dealerId:  z.string().uuid().optional(),
  from:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit:     z.coerce.number().int().min(1).max(500).optional(),
}).strict();
export type InvoicesListQuery = z.infer<typeof invoicesListQuery>;

/**
 * `refundCreateInput` — POST /api/finance/refunds/create.
 * Q5=A locked 2026-05-08: kind is `credit` (CN-{N}) or `refund` (RF-{N}).
 *
 * Behavior (matches proto finance-refunds.jsx:13-46):
 *   - Always inserts a refunds row with reason + amount.
 *   - For `kind=refund` AND amount > RM 1000, ALSO inserts an approvals
 *     row with kind='refund', refers_to=`SO-{dl}`, dealer_id, amount.
 *     Refunds row stays at status='pending' until approval_decide
 *     (existing 0016 RPC) flips it via the kind=refund side-effect.
 *   - For `kind=refund` AND amount <= RM 1000, refunds row is created
 *     directly at status='approved' (no approval gate per proto).
 *   - For `kind=credit`, refunds row is created at status='issued' (the
 *     credit-note path uses `status='issued'` semantics; `apply` later
 *     deducts from a target order).
 */
export const refundCreateInput = z.object({
  orderId:  z.string().uuid(),
  amount:   z.number().positive().finite(),
  reason:   z.string().min(1).max(500),
  kind:     z.enum(['credit', 'refund']),
}).strict();
export type RefundCreateInput = z.infer<typeof refundCreateInput>;

/**
 * `refundsListQuery` — GET /api/finance/refunds?status&dealerId&from&to.
 * Status filter accepts the actual `refund_status` enum values
 * (pending/approved/rejected/paid) plus the credit-note pseudo-status
 * `issued` (which maps to the `refunds.status='issued'` if we choose
 * to extend the enum, OR a synthetic value for credit-note rows).
 */
export const refundsListQuery = z.object({
  status:    z.enum(['all', 'pending', 'approved', 'rejected', 'paid', 'issued', 'applied']).optional(),
  dealerId:  z.string().uuid().optional(),
  from:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit:     z.coerce.number().int().min(1).max(500).optional(),
}).strict();
export type RefundsListQuery = z.infer<typeof refundsListQuery>;

/**
 * `financePoPayInput` — POST /api/finance/payments/po-pay.
 *
 * Spec: §5.1. Inserts a payments row (direction='out', po_id=...,
 * amount=...) AND flips purchase_orders.pay_status to 'paid' atomically.
 * The route runs both writes via userClient — RLS allows finance/principal
 * to write payments + update pay_status (per 0046 partner_role_rls trigger
 * which whitelists pay_status as a finance-mutable column).
 *
 * Amount is required so finance can pay partial / rounded amounts even
 * when the PO total is computed. Reference is bank ref no., audit only.
 *
 * APDrawer "Mark paid" button is gated on derived pay_status_ui='matched'
 * client-side; the API does NOT enforce that gate (V1) — server trusts the
 * caller to only fire this on matched POs. Finance can in theory pay
 * earlier (advance payment) and the row will jump to 'paid'.
 */
export const financePoPayInput = z.object({
  poId:      z.string().min(1).max(64),
  amount:    z.number().positive().finite(),
  method:    paymentMethodEnum,
  reference: z.string().min(1).max(255).nullable().optional(),
}).strict();
export type FinancePoPayInput = z.infer<typeof financePoPayInput>;

/**
 * `financePoScheduleInput` — POST /api/finance/payments/po-schedule.
 *
 * Spec: §5.1. Flips purchase_orders.pay_status from 'unpaid' to
 * 'scheduled'. There is NO scheduled_for column on purchase_orders (V1
 * doesn't store the planned date) — `scheduledFor` is captured in the
 * audit_log entry only. Phase 9 may add a real schedule table for batch
 * payment runs.
 *
 * No payments row is inserted at this step; the actual outbound payment
 * lands when finance fires po-pay.
 */
export const financePoScheduleInput = z.object({
  poId:         z.string().min(1).max(64),
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();
export type FinancePoScheduleInput = z.infer<typeof financePoScheduleInput>;

/**
 * `bankStatementCreateInput` — POST /api/finance/bank-statements.
 * Manual single-row insert. CSV bulk import (Q3=B Maybank2u) is deferred
 * to Chunk C / Phase 9. Amount is signed: positive = inflow, negative =
 * outflow (matches the bank_statements column convention from 0061).
 */
export const bankStatementCreateInput = z.object({
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description:   z.string().min(1).max(500),
  amount:        z.number().finite(),
  reference:     z.string().min(1).max(255).nullable().optional(),
  currency:      z.string().min(3).max(3).default('MYR'),
}).strict();
export type BankStatementCreateInput = z.infer<typeof bankStatementCreateInput>;

/**
 * `bankStatementsListQuery` — GET /api/finance/bank-statements.
 * Filters: from/to date range, matched=true|false (post-fetch derive via
 * left join check on reconciliations).
 */
export const bankStatementsListQuery = z.object({
  from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  matched: z.enum(['true', 'false']).optional(),
  limit:   z.coerce.number().int().min(1).max(500).optional(),
}).strict();
export type BankStatementsListQuery = z.infer<typeof bankStatementsListQuery>;

/**
 * `reconciliationCreateInput` — POST /api/finance/reconciliations.
 * Links a bank_statements row to ONE OF: payment / invoice / refund /
 * manual_ref. Server enforces the same check constraint as the table
 * (at least one target). manual_ref is the escape hatch for lines that
 * don't have a clean record match (proto: customer transferred without
 * quoting SO).
 */
export const reconciliationCreateInput = z.object({
  bankStatementId: z.string().uuid(),
  paymentId:       z.string().uuid().nullable().optional(),
  invoiceId:       z.string().uuid().nullable().optional(),
  refundId:        z.string().uuid().nullable().optional(),
  manualRef:       z.string().min(1).max(255).nullable().optional(),
  note:            z.string().min(1).max(1000).nullable().optional(),
}).strict().refine(
  (v) => !!(v.paymentId || v.invoiceId || v.refundId || v.manualRef),
  { message: 'At least one of paymentId / invoiceId / refundId / manualRef is required' },
);
export type ReconciliationCreateInput = z.infer<typeof reconciliationCreateInput>;

/**
 * `cashflowSeriesQuery` / `monthlyPlQuery` / `topSkusQuery` — report params.
 * Each clamps the period parameter to a sensible range before passing to
 * the SQL RPC (which also clamps server-side).
 */
export const cashflowSeriesQuery = z.object({
  weeks: z.coerce.number().int().min(1).max(52).optional(),
}).strict();
export type CashflowSeriesQuery = z.infer<typeof cashflowSeriesQuery>;

export const monthlyPlQuery = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
}).strict();
export type MonthlyPlQuery = z.infer<typeof monthlyPlQuery>;

export const topSkusQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict();
export type TopSkusQuery = z.infer<typeof topSkusQuery>;

/**
 * `refundApplyInput` — POST /api/finance/refunds/:id/apply.
 *
 * Spec: §5.3. Marks a credit-note refund row as applied against a future
 * order. Wraps the `finance_apply_credit_note` RPC (migration 0065) which
 * validates the refund is a credit note (credit_note_no IS NOT NULL) AND
 * status='approved' (UI label "issued") + flips status='paid' (UI label
 * "applied") + records applied_to_order_id + paid_at=now().
 */
export const refundApplyInput = z.object({
  targetOrderId: z.string().uuid(),
}).strict();
export type RefundApplyInput = z.infer<typeof refundApplyInput>;
