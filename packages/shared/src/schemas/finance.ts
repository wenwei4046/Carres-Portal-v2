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
 *     row with kind='refund', refers_to=`DL-{dl}`, dealer_id, amount.
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
