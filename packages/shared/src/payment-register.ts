import { z } from "zod";
import type { OrderPaymentRow } from "./schemas/order-payments";

export const paymentRegisterQuery = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export interface PaymentRegisterRow extends OrderPaymentRow {
  recorded_by_name?: string | null;
  /** §5 (0448): a Payment Approver continued past a likely duplicate. Derived
   *  server-side from the payment's own metadata — the raw metadata, which can
   *  hold a payment provider's payload, never reaches the browser. */
  duplicate_acknowledged?: boolean;
  orders: { id: string; so: number; customer_name: string } | null;
  payment_allocations: Array<{
    id: string; order_id: string; invoice_id?: string | null;
    amount: number; allocated_at: string; voided_at: string | null;
    invoices?: { invoice_no: string | null } | { invoice_no: string | null }[] | null;
  }>;
}

/** The invoice numbers a payment's LIVE allocations sit on, deduped and in
 *  order. §11 asks history to be filterable by invoice; one payment may cover
 *  several (§4), so this is a list, and a payment allocated to no invoice
 *  answers with none rather than a guess. */
export function paymentInvoiceNumbers(row: PaymentRegisterRow): string[] {
  const out: string[] = [];
  for (const a of row.payment_allocations ?? []) {
    if (a.voided_at != null) continue;
    const inv = Array.isArray(a.invoices) ? a.invoices[0] : a.invoices;
    const no = inv?.invoice_no;
    if (no && !out.includes(no)) out.push(no);
  }
  return out;
}

/** §11's `exception` axis, in the governed words a payment row can carry. */
export function paymentExceptionWord(row: PaymentRegisterRow): string {
  if (row.voided_at != null) return "Voided";
  if (row.duplicate_acknowledged) return "Duplicate checked";
  return "None";
}

export interface PaymentRegisterPage {
  rows: PaymentRegisterRow[];
  total: number;
}
