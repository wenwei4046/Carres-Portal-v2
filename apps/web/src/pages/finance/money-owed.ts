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

// ── A/R Aging — how long each owing order has been open ─────────────────────
//
// The buckets finance_ar_aging used (0062, and 0125's body, which only renamed
// `dl` to `so`), reproduced over the rows above rather than read from that
// function, with the age counted from the invoice (owner ruling, YH 18 Sep 2026):
//
//   age      today − the day the order's sales invoice was issued, never below 0
//   buckets  0-30 · 31-60 · 61-90 · 90+ days, each upper edge inclusive
//   counted  only orders that still owe (outstanding > 0) on an issued invoice
//   Overdue  the 31-60, 61-90 and 90+ buckets together: older than 30 days
//
// An order whose sales invoice is still a draft (or was voided and not yet
// reissued) has no age: it stays in Outstanding but is in no bucket and never
// Overdue, so the buckets add up to what is owed on issued invoices.
//
// Both days are Malaysia days (UTC+8): a timestamp before 8 a.m. Malaysia
// time is still that Malaysia day, not the UTC day before.
//
// There is no due date here, and none is invented: "overdue" means invoiced
// more than 30 days ago and still owing.

export const AGE_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

const MYT_OFFSET_MS = 8 * 3_600_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The Malaysia calendar day of a timestamp (or of a bare `YYYY-MM-DD`). Null when unreadable. */
export function malaysiaDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (ISO_DAY.test(value)) return value;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t + MYT_OFFSET_MS).toISOString().slice(0, 10);
}

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/** Days since the invoice was issued, to `today` (both Malaysia days). Null when there is no readable issue date. */
export function invoiceAgeDays(issuedAt: string | null | undefined, today: string): number | null {
  const issued = malaysiaDay(issuedAt);
  if (!issued || !ISO_DAY.test(today)) return null;
  return Math.max(0, dayNumber(today) - dayNumber(issued));
}

/** The bucket an age falls in; each upper edge belongs to its own bucket (30 → 0-30, 31 → 31-60). */
export function ageBucket(days: number): AgeBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** `age=` on the AR · Receivables address: one bucket, or `over-30` for the Overdue tile. */
export type AgeScope = AgeBucket | "over-30";

export function isAgeScope(v: string | null): v is AgeScope {
  return v === "over-30" || (AGE_BUCKETS as readonly string[]).includes(v ?? "");
}

/** Does an order of this age belong to the scope? */
export function inAgeScope(days: number, scope: AgeScope): boolean {
  return scope === "over-30" ? days > 30 : ageBucket(days) === scope;
}

/** The owing orders in one age scope — what AR · Receivables lists behind `?age=`. */
export function rowsInAgeScope(rows: readonly CustomerOwingRow[], scope: AgeScope, today: string): CustomerOwingRow[] {
  return rows.filter((r) => {
    const days = invoiceAgeDays(r.issuedAt, today);
    return days !== null && inAgeScope(days, scope);
  });
}

export interface ArAging {
  buckets: Record<AgeBucket, { orders: number; total: number }>;
  /** Older than 30 days — the Overdue (>30d) tile. */
  overdue: { orders: number; total: number };
}

/**
 * The four buckets and Overdue, over the rows `customerOwingRows` returns.
 * An order with no issued invoice is in no bucket. Null when an issued
 * invoice's date cannot be read: a bucket that silently dropped it would not
 * add up, and a partial answer must not print as a whole one.
 */
export function arAging(rows: readonly CustomerOwingRow[], today: string): ArAging | null {
  if (rows.some((r) => r.issuedAt !== null && invoiceAgeDays(r.issuedAt, today) === null)) return null;
  const pick = (scope: AgeScope) => outstandingTotal(rowsInAgeScope(rows, scope, today));
  const buckets = Object.fromEntries(AGE_BUCKETS.map((b) => [b, pick(b)])) as ArAging["buckets"];
  return { buckets, overdue: pick("over-30") };
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
