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
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>;

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
 */
export function summarizePayments(
  payments: ReadonlyArray<{ amount: number; kind: PaymentKind }>,
  bill: number,
): PaymentSummary {
  const byKind: Record<PaymentKind, number> = { payment: 0, deposit: 0, storage: 0 };
  let paid = 0;
  for (const p of payments) {
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
