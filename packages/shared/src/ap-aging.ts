/**
 * AP AGING — what is owed to suppliers on a day, by how old it is (migration
 * 0640; Chew 2026-10-03, docs/finance/MASTER.md §3.6, after Houzs Part 10 §9).
 *
 * `fin_ap_aging` serves the parts: the payables control accounts' balances on
 * the day, each supplier's balance on them, and its confirmed bills still open
 * that day. Everything else is worked out here and nowhere else (Law D), in
 * whole sen:
 *
 *   not tied to a bill = the supplier's balance − its open bills
 *       negative: money paid ahead, an advance not yet knocked off
 *       positive: owed with no bill behind it, such as an opening balance
 *   a bill's column    = how old the bill is on the day, by its date (or its
 *                        due date; a bill with none ages by its date)
 *   difference         = the suppliers' balances − the control accounts'
 *
 * Because the not-tied column is the rest of each supplier's balance, a row
 * always adds up to the books, and the difference is zero unless an answer is
 * broken; the page says so when it is not.
 */

import { z } from "zod";
import { sen } from "./daily-bank";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-03");

/** `GET /finance/payables/aging?asAt=` — omitted = today in Malaysia. */
export const apAgingQuery = z.object({ asAt: isoDay.optional() }).strict();
export type ApAgingQuery = z.infer<typeof apAgingQuery>;

type Wire = number | string;

export interface ApAgingBill {
  bill_id: string;
  bill_no: string;
  supplier_invoice_no: string | null;
  bill_date: string;
  due_date: string | null;
  total: Wire;
  open: Wire;
}

export interface ApAgingAnswer {
  as_at: string;
  go_live_on: string;
  controls: Array<{ account_code: string; name: string; balance: Wire }>;
  suppliers: Array<{ supplier_id: string; name: string | null; kind: string | null; balance: Wire; bills: ApAgingBill[] }>;
}

/** Age a bill by its own date or by its due date. */
export type AgingBasis = "bill" | "due";
/** Columns of whole calendar months, or of 30-day steps. */
export type AgingColumns = "month" | "day";
export const AGING_COLUMN_COUNT = 5;

const dayNumber = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;

/**
 * Which of the five columns a date falls in on the day.
 *   month: this month, 1, 2, 3, 4 months and over — whole calendar months
 *          between the date's month and the day's month.
 *   day:   0 to 30, 31 to 60, 61 to 90, 91 to 120, over 120 days.
 * A date after the day falls in the first column.
 */
export function agingColumn(date: string, asAt: string, columns: AgingColumns): number {
  if (columns === "month") {
    const months = (+asAt.slice(0, 4) * 12 + +asAt.slice(5, 7)) - (+date.slice(0, 4) * 12 + +date.slice(5, 7));
    return Math.min(Math.max(months, 0), AGING_COLUMN_COUNT - 1);
  }
  const days = dayNumber(asAt) - dayNumber(date);
  if (days <= 30) return 0;
  if (days <= 60) return 1;
  if (days <= 90) return 2;
  if (days <= 120) return 3;
  return 4;
}

export interface ApAgingBillLine {
  billId: string;
  billNo: string;
  supplierInvoiceNo: string | null;
  billDate: string;
  dueDate: string | null;
  total: number;
  open: number;
  column: number;
}

export interface ApAgingRow {
  supplierId: string;
  name: string;
  kind: string | null;
  balance: number;
  /** The open bills, added up by column. */
  cells: number[];
  notTied: number;
  bills: ApAgingBillLine[];
}

export interface ApAgingReport {
  asAt: string;
  rows: ApAgingRow[];
  totals: { balance: number; cells: number[]; notTied: number };
  controls: Array<{ code: string; name: string; balance: number }>;
  controlsTotal: number;
  /** The suppliers' balances less the control accounts'. Zero unless broken. */
  difference: number;
}

export function apAgingReport(a: ApAgingAnswer, basis: AgingBasis, columns: AgingColumns): ApAgingReport {
  const totalCells = Array<number>(AGING_COLUMN_COUNT).fill(0);
  let totalBalance = 0;
  let totalNotTied = 0;
  const rows = a.suppliers.map((s): ApAgingRow => {
    const cells = Array<number>(AGING_COLUMN_COUNT).fill(0);
    let openSum = 0;
    const bills = s.bills.map((b): ApAgingBillLine => {
      const open = sen(b.open);
      const column = agingColumn(basis === "due" && b.due_date ? b.due_date : b.bill_date, a.as_at, columns);
      cells[column]! += open;
      openSum += open;
      return {
        billId: b.bill_id, billNo: b.bill_no, supplierInvoiceNo: b.supplier_invoice_no, billDate: b.bill_date,
        dueDate: b.due_date, total: sen(b.total) / 100, open: open / 100, column,
      };
    });
    const balance = sen(s.balance);
    const notTied = balance - openSum;
    totalBalance += balance;
    totalNotTied += notTied;
    cells.forEach((c, i) => { totalCells[i]! += c; });
    return {
      supplierId: s.supplier_id, name: s.name ?? "Name not available", kind: s.kind,
      balance: balance / 100, cells: cells.map((c) => c / 100), notTied: notTied / 100, bills,
    };
  });
  const controls = a.controls.map((c) => ({ code: c.account_code, name: c.name, balance: sen(c.balance) }));
  const controlsTotal = controls.reduce((t, c) => t + c.balance, 0);
  return {
    asAt: a.as_at,
    rows,
    totals: { balance: totalBalance / 100, cells: totalCells.map((c) => c / 100), notTied: totalNotTied / 100 },
    controls: controls.map((c) => ({ ...c, balance: c.balance / 100 })),
    controlsTotal: controlsTotal / 100,
    difference: (totalBalance - controlsTotal) / 100,
  };
}
