import { z } from "zod";

/**
 * Order payment ledger — the balance job's foundation (Jess 2026-06-26
 * "complete all the balance job"). Replaces the single
 * `ops_order_control.paid_amount` stopgap with a real multi-entry ledger: each
 * row is one payment received (goods, deposit, OR a storage-fee collection).
 *
 * Outstanding (goods) = order bill − Σ(payment + deposit). Storage collected is
 * summed separately and compared against `computeStorageFee` for the
 * collect-before-delivery gate. See `docs/superpowers/plans/2026-06-26-balance-job.md`.
 */

/** How the money came in. 0430 adds the governed manual methods from
 *  payment/MASTER.md §16 — duitnow_qr · credit_card · debit_card — matching
 *  the widened SQL dictionary and column CHECK. `online` remains
 *  provider-recorded (Stripe) and is never a manual selection. */
export const PAYMENT_METHODS = [
  "cash",
  "bank",
  "card",
  "cheque",
  "online",
  "other",
  "duitnow_qr",
  "credit_card",
  "debit_card",
] as const;
export type OrderPaymentMethod = (typeof PAYMENT_METHODS)[number];

/** What the payment is for. `storage` = a storage-fee collection (proof of
 *  collection gates delivery); `deposit`/`payment` reduce the goods balance. */
export const PAYMENT_KINDS = ["payment", "deposit", "storage"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd");

/** Record one payment — POST /api/operation/orders/:id/payments. */
export const recordPaymentInputSchema = z.object({
  amount: z.number().positive("amount must be greater than 0"),
  paidOn: isoDate,
  method: z.enum(PAYMENT_METHODS).default("cash"),
  kind: z.enum(PAYMENT_KINDS).default("payment"),
  reference: z.string().trim().max(120).nullish(),
  note: z.string().trim().max(500).nullish(),
  /** Customer proof-of-payment (Balance v3, 2026-07-17): the storage path of
   *  the uploaded slip ("orders-attachments/orders/<id>/payments/…") or an
   *  https receipt URL → order_payments.receipt_url. DEPLOY-GATED persistence:
   *  the live Worker's older (non-strict) schema strips this key harmlessly —
   *  payments still record, only the slip link waits for the deploy. */
  receiptUrl: z.string().trim().max(300).nullish(),
  idempotencyKey: z.string().uuid().optional(),
  /** §5 (0448): the operator opened the earlier payment this one resembles and
   *  says it is a different one. The SERVER decides whether that continuation
   *  is allowed — a match only continues for the Payment Approver duty or
   *  principal — so this flag ASKS, it never grants. Distinct from
   *  `idempotencyKey`, which answers whether this is the same submission. */
  duplicateAck: z.boolean().optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>;

/** Collect a storage fee — POST /api/operation/orders/:id/storage/collect. Same
 *  shape as a payment minus `kind` (the route forces `kind:'storage'` + stamps
 *  ops_order_control.storage_collected_at, which opens the delivery gate). */
export const collectStorageInput = recordPaymentInputSchema.omit({ kind: true });
export type CollectStorageInput = z.infer<typeof collectStorageInput>;

/**
 * SO V2 CARD 7 (0345) — the refund lifecycle: requested → approved | rejected
 * (principal) → paid. An APPROVED, UNPAID refund means Carres still owes the
 * customer — the SO is not clear.
 */
export const refundRequestInputSchema = z.object({
  amount: z.number().positive("amount must be greater than 0"),
  reason: z.string().trim().min(1, "a refund states its reason").max(500),
});
export type RefundRequestInput = z.infer<typeof refundRequestInputSchema>;

export const refundDecideInputSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "reject" && !v.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "A rejection says why",
      });
    }
  });
export type RefundDecideInput = z.infer<typeof refundDecideInputSchema>;

export const refundMarkPaidInputSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(120).nullish(),
});
export type RefundMarkPaidInput = z.infer<typeof refundMarkPaidInputSchema>;

export interface OrderRefundRow {
  id: string;
  order_id: string;
  amount: number;
  reason: string;
  status: "requested" | "approved" | "rejected" | "paid";
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decide_note: string | null;
  paid_at: string | null;
  paid_by: string | null;
  paid_method: OrderPaymentMethod | null;
  paid_reference: string | null;
}

/** One ledger row as the API returns it (snake_case DB shape from `order_payments`). */
export interface OrderPaymentRow {
  id: string;
  order_id: string;
  amount: number;
  paid_on: string;
  method: OrderPaymentMethod;
  kind: PaymentKind;
  reference: string | null;
  receipt_no: string | null;
  receipt_url: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
  /** 0343 — did this row bump `orders.paid`? False on a HISTORY MIRROR of a
   *  deposit the create door already put inside `orders.paid`, and on every
   *  storage collection (storage is not goods money). Void reverses exactly
   *  this. */
  counted_in_paid?: boolean;
  /** 0343 — a void is a STAMP, never a delete. Set = this row is NOT money. */
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
}

/**
 * **The one "is this a valid payment?" predicate** (CARD 4 closing slice,
 * 2026-08-13 — Law D).
 *
 * 0343 turned VOID from a DELETE into a STAMP, which is right: money history is
 * never erased. But every reader of this ledger was written when a void deleted
 * the row, so four of them counted and PRINTED a reversed payment — the SO
 * PDF's `PAYMENTS RECEIVED` block, the drawer's storage-collected sum and its
 * receipt list, and the collections desk. The ledger held zero rows, so none of
 * it was visible; all four would have gone wrong on the first void.
 *
 * Every reader asks THIS question, and no reader spells `voided_at` itself.
 */
export function isLivePayment(p: { voided_at?: string | null }): boolean {
  return p.voided_at == null;
}

/**
 * NO `paid` FIELD, deliberately (2026-08-17). It used to carry Σ of every row
 * REGARDLESS OF KIND, and it had zero readers — measured across `apps/` and
 * `packages/`. That is not merely dead weight, it is a loaded gun: goods money
 * and a storage collection are different debts with different clocks and
 * different gates, and the whole codebase is arranged to keep them apart. The
 * first person to reach for an innocent-looking "total paid" would have got
 * them silently added together.
 *
 * Whoever needs "how much has this order received" must say WHICH money:
 * `byKind.payment + byKind.deposit` for goods, `storageCollected` for storage.
 * Being made to name it is the point.
 */
export interface PaymentSummary {
  byKind: Record<PaymentKind, number>;
  /** Order-goods balance still owed = bill − (payment + deposit), floored at 0. */
  outstanding: number;
  /** Σ of `storage`-kind rows — compared against the computed storage fee. */
  storageCollected: number;
}

/**
 * Pure roll-up of a payment ledger against an order bill. Goods outstanding
 * counts only `payment`/`deposit` (storage is a separate fee, tracked in
 * `storageCollected`). Outstanding floors at 0 — an overpayment reads 0, never
 * negative. Bill ≤ 0 (AutoCount orders often carry no price) → outstanding 0.
 *
 * **A VOIDED ROW IS NOT MONEY** (0347): it stays in the array because it stays
 * in the history, and it contributes nothing to any figure. This is the ONE
 * place the ledger is added up, so it is the one place that has to know.
 */
export function summarizePayments(
  payments: ReadonlyArray<{ amount: number; kind: PaymentKind; voided_at?: string | null }>,
  bill: number,
): PaymentSummary {
  const byKind: Record<PaymentKind, number> = { payment: 0, deposit: 0, storage: 0 };
  for (const p of payments) {
    if (!isLivePayment(p)) continue;
    byKind[p.kind] = (byKind[p.kind] ?? 0) + (Number(p.amount) || 0);
  }
  const goodsPaid = byKind.payment + byKind.deposit;
  const safeBill = Number(bill) || 0;
  return {
    byKind,
    outstanding: safeBill > 0 ? Math.max(0, safeBill - goodsPaid) : 0,
    storageCollected: byKind.storage,
  };
}
