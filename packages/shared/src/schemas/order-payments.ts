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

/** How the money came in. */
export const PAYMENT_METHODS = [
  "cash",
  "bank",
  "card",
  "cheque",
  "online",
  "other",
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
  // 0343 — the void trio. The route has returned these since Card 4
  // (`PAYMENT_COLS`) but the type never declared them, so every consumer was
  // blind to a reversal it was already being handed.
  /** Set = this payment was reversed. The row is kept as history, never deleted. */
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  /** True = this row bumped `orders.paid`. False = a history mirror of money the
   *  raw-create door already put there. See §4 of 0343. */
  counted_in_paid: boolean;
}

export interface PaymentSummary {
  /** Σ of every ledger row (all kinds) — for the "total received" display. */
  paid: number;
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
 * A VOIDED row is skipped. Before 0343 a void DELETED the row, so summing
 * everything was correct; 0343 made void a STAMP (`voided_at`) that reverses the
 * `orders.paid` bump and leaves the row in place as history. Summing it would
 * count money that has been given back. Callers must therefore pass `voidedAt`
 * through — a caller that maps it away silently re-opens this hole, which is
 * why it is part of the input type rather than filtered by each caller.
 */
export function summarizePayments(
  payments: ReadonlyArray<{
    amount: number;
    kind: PaymentKind;
    /** `order_payments.voided_at` — set means the money was reversed (0343). */
    voidedAt?: string | null;
  }>,
  bill: number,
): PaymentSummary {
  const byKind: Record<PaymentKind, number> = { payment: 0, deposit: 0, storage: 0 };
  let paid = 0;
  for (const p of payments) {
    if (p.voidedAt) continue;
    const amt = Number(p.amount) || 0;
    byKind[p.kind] = (byKind[p.kind] ?? 0) + amt;
    paid += amt;
  }
  const goodsPaid = byKind.payment + byKind.deposit;
  const safeBill = Number(bill) || 0;
  return {
    paid,
    byKind,
    outstanding: safeBill > 0 ? Math.max(0, safeBill - goodsPaid) : 0,
    storageCollected: byKind.storage,
  };
}
