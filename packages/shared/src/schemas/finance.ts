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
