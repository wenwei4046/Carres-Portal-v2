/**
 * AR AGING — what customers and other debtors owe on a day, by how old it is
 * (migration 0686; Chew 2026-10-03 and 2026-10-12, docs/finance/MASTER.md
 * §3.6: 「就根据开了invoice还没还的就出现…包括普通顾客」).
 *
 * `fin_ar_aging` serves the parts: the debtor control accounts' balances on
 * the day, each debtor's balance on them, and its invoices still open that
 * day (a customer's order money fills its earliest invoice first; an other
 * debtor's receipts count by allocation). Since 0690 it also gives each
 * debtor's balance by channel, so money paid ahead names its order's channel. Everything else is worked out here
 * and nowhere else (Law D), in whole sen, the way AP Aging is (`ap-aging`,
 * whose columns this reuses):
 *
 *   not tied to an invoice = the debtor's balance − its open invoices
 *       negative: money paid ahead of an invoice, such as an order's deposit
 *       positive: owed with no invoice behind it, such as an opening balance
 *   an invoice's column    = how old the invoice is on the day, by its date
 *                            (or its due date; one with none ages by its date)
 *   difference             = the debtors' balances − the control accounts'
 *
 * Because the not-tied column is the rest of each debtor's balance, a row
 * always adds up to the books, and the difference is zero unless an answer is
 * broken; the page says so when it is not.
 */

import { z } from "zod";
import { AGING_COLUMN_COUNT, agingColumn, type AgingColumns } from "./ap-aging";
import { sen } from "./daily-bank";

/** Age an invoice by its own date or by its due date. */
export type ArAgingBasis = "invoice" | "due";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-03");

/** `GET /finance/ledger/ar-aging?asAt=` — omitted = today in Malaysia. */
export const arAgingQuery = z.object({ asAt: isoDay.optional() }).strict();
export type ArAgingQuery = z.infer<typeof arAgingQuery>;

type Wire = number | string;

/** A customer's sales or storage invoice (Payment's), or an other debtor's (Finance's). */
export type ArInvoiceKind = "sales" | "storage" | "additional_storage" | "other";

export interface ArAgingInvoice {
  invoice_id: string;
  invoice_no: string;
  kind: ArInvoiceKind;
  order_id: string | null;
  so: number | null;
  invoice_date: string;
  due_date: string | null;
  total: Wire;
  open: Wire;
  /** The order's channel (fin_order_channels); null for an other debtor's invoice. */
  department_type: string | null;
  department_id: string | null;
}

export interface ArAgingAnswer {
  as_at: string;
  go_live_on: string;
  controls: Array<{ account_code: string; name: string; balance: Wire }>;
  debtors: Array<{
    party_type: "CUSTOMER" | "OTHER";
    party_id: string | null;
    name: string | null;
    /** `customer`, or an other debtor's kind (`company` / `person`). */
    kind: string | null;
    balance: Wire;
    invoices: ArAgingInvoice[];
    /** 0690: the debtor's balance by the department the reports give each of
     *  its lines (gl_line_departments); a channel at RM 0.00 is left out.
     *  Absent from an answer made before 0690. */
    channels?: Array<{ department_type: string; department_id: string | null; amount: Wire }>;
  }>;
  /** Live invoices issued before the ledger started: the books never held them. */
  before_go_live: { count: number; amount: Wire };
}

export interface ArAgingInvoiceLine {
  invoiceId: string;
  invoiceNo: string;
  kind: ArInvoiceKind;
  orderId: string | null;
  so: number | null;
  invoiceDate: string;
  dueDate: string | null;
  total: number;
  open: number;
  column: number;
  departmentType: string | null;
  departmentId: string | null;
}

/** The one channel a debtor's balance sits in, `several`, or null when it has none. */
export type ArAgingChannel = { type: string; id: string | null } | "several" | null;

export interface ArAgingRow {
  /** `CUSTOMER:{id}` or `OTHER:{id}`: a customer and an other debtor never share a row. */
  key: string;
  partyType: "CUSTOMER" | "OTHER";
  partyId: string | null;
  name: string;
  kind: string | null;
  balance: number;
  /** The open invoices, added up by column. */
  cells: number[];
  notTied: number;
  channel: ArAgingChannel;
  invoices: ArAgingInvoiceLine[];
}

export interface ArAgingReport {
  asAt: string;
  rows: ArAgingRow[];
  totals: { balance: number; cells: number[]; notTied: number };
  controls: Array<{ code: string; name: string; balance: number }>;
  controlsTotal: number;
  /** The debtors' balances less the control accounts'. Zero unless broken. */
  difference: number;
  beforeGoLive: { count: number; amount: number };
}

/** 0690: the channels the debtor's balance sits in, so money paid ahead of an
 *  invoice names its order's channel too. An answer made before 0690 has no
 *  `channels`, and then the open invoices name it, as before. */
function rowChannel(
  channels: ArAgingAnswer["debtors"][number]["channels"],
  invoices: readonly ArAgingInvoiceLine[],
): ArAgingChannel {
  const seen = new Map<string, { type: string; id: string | null }>();
  const add = (type: string | null, id: string | null) => {
    if (type) seen.set(`${type}:${id ?? ""}`, { type, id });
  };
  if (channels) {
    for (const c of channels) if (sen(c.amount) !== 0) add(c.department_type, c.department_id);
  } else {
    for (const i of invoices) add(i.departmentType, i.departmentId);
  }
  if (seen.size === 0) return null;
  return seen.size === 1 ? [...seen.values()][0]! : "several";
}

export function arAgingReport(a: ArAgingAnswer, basis: ArAgingBasis, columns: AgingColumns): ArAgingReport {
  const totalCells = Array<number>(AGING_COLUMN_COUNT).fill(0);
  let totalBalance = 0;
  let totalNotTied = 0;
  const rows = a.debtors.map((d): ArAgingRow => {
    const cells = Array<number>(AGING_COLUMN_COUNT).fill(0);
    let openSum = 0;
    const invoices = d.invoices.map((i): ArAgingInvoiceLine => {
      const open = sen(i.open);
      const column = agingColumn(basis === "due" && i.due_date ? i.due_date : i.invoice_date, a.as_at, columns);
      cells[column]! += open;
      openSum += open;
      return {
        invoiceId: i.invoice_id, invoiceNo: i.invoice_no, kind: i.kind, orderId: i.order_id, so: i.so,
        invoiceDate: i.invoice_date, dueDate: i.due_date, total: sen(i.total) / 100, open: open / 100, column,
        departmentType: i.department_type, departmentId: i.department_id,
      };
    });
    const balance = sen(d.balance);
    const notTied = balance - openSum;
    totalBalance += balance;
    totalNotTied += notTied;
    cells.forEach((c, i) => { totalCells[i]! += c; });
    return {
      key: `${d.party_type}:${d.party_id ?? "none"}`, partyType: d.party_type, partyId: d.party_id,
      name: d.name ?? "Name not available", kind: d.kind,
      balance: balance / 100, cells: cells.map((c) => c / 100), notTied: notTied / 100,
      channel: rowChannel(d.channels, invoices), invoices,
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
    beforeGoLive: { count: Number(a.before_go_live?.count ?? 0), amount: sen(a.before_go_live?.amount ?? 0) / 100 },
  };
}
