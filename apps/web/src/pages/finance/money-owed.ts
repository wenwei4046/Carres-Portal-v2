/**
 * Money owed — the ONE place a Finance summary reads what customers still owe
 * and what Carres still owes suppliers (Law D: one arithmetic).
 *
 * Neither figure is computed here. Each is ADDED UP here from the canonical
 * per-row figure its owner already computes:
 *
 *   Customer Outstanding  `customerBalanceRows` (Reports → Payment) — one row
 *                         per order through the shared `soRemaining`, storage
 *                         included. An order with no price yet is left out.
 *   Supplier Unpaid       `ap_outstanding.balance_owing` (0477) — billed minus
 *                         paid on confirmed bills, per supplier or creditor.
 *
 * The Finance Dashboard and the AR page read these helpers, never their own
 * sum. `supplierUnpaid` is the one line to change when the per-supplier figure
 * changes (for example a supplier advance netted off).
 */
import type { ApOutstandingRow } from "@carres/shared/schemas/finance-ap";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { customerBalanceRows } from "./FinancePaymentReport";
import { cents, num } from "./payables/payables-words";

export type CustomerOwingRow = ReturnType<typeof customerBalanceRows>[number];

/** Every order a customer still owes money on, largest first. */
export function customerOwingRows(rows: readonly InvoiceRegisterRow[]): CustomerOwingRow[] {
  return customerBalanceRows(rows).filter((r) => r.outstanding > 0);
}

/** What customers owe in total, over the rows `customerOwingRows` returns. */
export function outstandingTotal(rows: readonly CustomerOwingRow[]): { orders: number; total: number } {
  return {
    orders: rows.length,
    total: cents(rows.reduce((sum, r) => sum + r.outstanding, 0)),
  };
}

/** What one supplier or creditor is still owed. `null` when the figure is unreadable. */
export function supplierUnpaid(row: ApOutstandingRow): number | null {
  return num(row.balance_owing);
}

/** What Carres owes suppliers in total. `suppliers` counts only those still owed money. */
export function unpaidTotal(rows: readonly ApOutstandingRow[]): { suppliers: number; total: number } {
  let suppliers = 0;
  let total = 0;
  for (const r of rows) {
    const unpaid = supplierUnpaid(r) ?? 0;
    if (unpaid > 0) suppliers += 1;
    total += unpaid;
  }
  return { suppliers, total: cents(total) };
}
