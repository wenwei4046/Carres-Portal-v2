/**
 * Money in that is not a sale (migration 0478) — the Finance documents for it.
 *
 *   · a PARTY that is neither a customer nor a supplier (a sister company, a
 *     lender, a director), kept in `finance_parties`;
 *   · the OTHER DEBTOR INVOICE (`ARI-YYYYMMDD-RRRR`) Finance raises to one;
 *   · the RECEIPT (`RV-YYYYMMDD-RRRR`) for money that reached our bank or cash
 *     and is not customer order money: a loan in, a director putting money in,
 *     other income, or money against those invoices.
 *
 * Customer money never comes through here — it is recorded in Payments
 * (docs/payment/MASTER.md). The database refuses a receipt line that credits a
 * customer revenue account or customer money held; these schemas only catch the
 * typing mistakes before the round trip.
 *
 * PURE — no clock, no I/O.
 */
import { lineDepartmentFieldsSnake } from "./department";
import { z } from "zod";
import { ledgerAccountCodeShape } from "./finance-ledger";

/* ── input ─────────────────────────────────────────────────────────────────── */

/** Money a person typed: more than zero, at most two decimals (ruling N). A
 *  third decimal is refused, never rounded — rounding would post a figure
 *  nobody typed. */
export const moneyInAmount = z
  .number({ invalid_type_error: "Type the amount." })
  .positive("The amount must be more than RM 0.00.")
  .max(9_999_999_999.99, "The amount is larger than the ledger can hold.")
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "An amount has at most two decimals.");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const accountCode = z.string().regex(ledgerAccountCodeShape, "Choose an account.");
const optionalText = (max: number) => z.string().max(max).nullable().optional();

export const financePartyInput = z.object({
  name: z.string().trim().min(1, "Type the party's name.").max(200, "The name is too long."),
  kind: z.enum(["company", "person"], { errorMap: () => ({ message: "Choose company or person." }) }),
  registration_no: optionalText(60),
  phone: optionalText(40),
  email: optionalText(200),
  address: optionalText(500),
  notes: optionalText(1000),
});
export type FinancePartyInput = z.infer<typeof financePartyInput>;

export const financePartyUpdateInput = financePartyInput.extend({ is_active: z.boolean() });
export type FinancePartyUpdateInput = z.infer<typeof financePartyUpdateInput>;

export const moneyInLineInput = z.object({
  account_code: accountCode,
  description: optionalText(500),
  amount: moneyInAmount,
  ...lineDepartmentFieldsSnake,
});
export type MoneyInLineInput = z.infer<typeof moneyInLineInput>;

export const otherDebtorInvoiceInput = z.object({
  party_id: z.string().uuid("Choose who the invoice is for."),
  invoice_date: isoDate,
  due_date: isoDate.nullable().optional(),
  reference: optionalText(120),
  narration: optionalText(500),
  lines: z.array(moneyInLineInput).min(1, "An invoice needs at least one line.").max(50, "An invoice takes at most 50 lines."),
  /** Issue in the same act as saving. A refused issue saves nothing. */
  issue: z.boolean().optional(),
});
export type OtherDebtorInvoiceInput = z.infer<typeof otherDebtorInvoiceInput>;

export const moneyInCancelInput = z.object({
  reason: z.string().trim().min(1, "Type the reason.").max(500, "The reason is too long."),
});
export type MoneyInCancelInput = z.infer<typeof moneyInCancelInput>;

export const otherReceiptInput = z
  .object({
    receipt_date: isoDate,
    money_account_code: z.string().regex(ledgerAccountCodeShape, "Choose where the money was received."),
    party_id: z.string().uuid().nullable().optional(),
    payer_name: optionalText(200),
    reference: optionalText(120),
    narration: optionalText(500),
    lines: z.array(moneyInLineInput).max(50, "A receipt takes at most 50 lines.").default([]),
    allocations: z
      .array(z.object({ invoice_id: z.string().uuid(), amount: moneyInAmount }))
      .max(50, "A receipt takes at most 50 invoices.")
      .default([]),
    /** One per opening of the form: a second press sends the same key and the
     *  server returns the first receipt instead of recording the money twice. */
    idempotency_key: z.string().uuid(),
  })
  .refine((r) => r.lines.length + r.allocations.length > 0, {
    message: "A receipt needs at least one line, or one invoice it pays.",
  })
  .refine((r) => r.allocations.length === 0 || !!r.party_id, {
    message: "Money against an invoice needs the party the invoice was issued to.",
  })
  .refine((r) => !!r.party_id || !!r.payer_name?.trim(), {
    message: "Who paid? Type the payer's name, or choose a party.",
  });
export type OtherReceiptInput = z.input<typeof otherReceiptInput>;

/* ── rows, as the 0478 read functions return them ─────────────────────────── */

export type FinancePartyKind = "company" | "person";
export type OtherDebtorInvoiceStatus = "draft" | "issued" | "cancelled";
export type OtherReceiptStatus = "posted" | "voided";

/** `other_debtor_outstanding()` — one row per party, EVERY party, owing or not. */
export interface OtherDebtorPartyRow {
  party_id: string;
  name: string;
  kind: FinancePartyKind;
  registration_no: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  invoices_open: number;
  invoiced_total: number;
  received_total: number;
  outstanding: number;
  oldest_open_invoice_date: string | null;
  created_at: string;
  go_live_on: string | null;
}

/** `other_debtor_invoice_list()`. `outstanding` is null unless the invoice is issued. */
export interface OtherDebtorInvoiceRow {
  invoice_id: string;
  invoice_no: string | null;
  status: OtherDebtorInvoiceStatus;
  party_id: string;
  party_name: string;
  invoice_date: string;
  due_date: string | null;
  reference: string | null;
  narration: string | null;
  first_line: string | null;
  line_count: number;
  total_amount: number;
  received_amount: number;
  outstanding: number | null;
  created_at: string;
  issued_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  go_live_on: string | null;
}

export interface MoneyInDocumentLine {
  line_no: number;
  account_code: string;
  account_name: string;
  description: string | null;
  amount: number;
  /** 0540 */
  department_type?: string | null; department_id?: string | null;
}

export interface OtherDebtorInvoiceDetail {
  invoice: OtherDebtorInvoiceRow & {
    debtor_account_code: string | null;
    entry_no: string | null;
    reversal_entry_no: string | null;
    created_by_name: string | null;
    issued_by_name: string | null;
    cancelled_by_name: string | null;
  };
  lines: MoneyInDocumentLine[];
  receipts: Array<{
    receipt_id: string;
    receipt_no: string;
    receipt_date: string;
    amount: number;
    status: OtherReceiptStatus;
  }>;
}

/** `other_receipt_list()`. */
export interface OtherReceiptRow {
  receipt_id: string;
  receipt_no: string;
  status: OtherReceiptStatus;
  receipt_date: string;
  party_id: string | null;
  party_name: string | null;
  payer_name: string;
  money_account_code: string;
  money_account_name: string;
  reference: string | null;
  narration: string | null;
  /** What the money was: the chart's own account names, then the invoice numbers. */
  what: string | null;
  total_amount: number;
  allocated_amount: number;
  created_at: string;
  created_by_name: string | null;
  voided_at: string | null;
  void_reason: string | null;
  go_live_on: string | null;
}

export interface OtherReceiptDetail {
  receipt: OtherReceiptRow & {
    entry_no: string | null;
    reversal_entry_no: string | null;
    voided_by_name: string | null;
  };
  lines: MoneyInDocumentLine[];
  allocations: Array<{
    invoice_id: string;
    invoice_no: string;
    invoice_date: string;
    invoice_total: number;
    amount: number;
  }>;
}

/** `fin_money_in_account_options()` — which account each form may offer. */
export interface MoneyInAccountOption {
  code: string;
  name: string;
  kind: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
  parent_code: string | null;
  for_money: boolean;
  for_receipt_line: boolean;
  for_invoice_line: boolean;
}

/* ── the words a stored value prints as (COPY-STANDARD: no enum on screen) ── */

const INVOICE_STATUS_WORD: Record<OtherDebtorInvoiceStatus, string> = {
  draft: "Draft",
  issued: "Issued",
  cancelled: "Cancelled",
};
export function otherDebtorInvoiceStatusWord(status: OtherDebtorInvoiceStatus): string {
  return INVOICE_STATUS_WORD[status] ?? "Status not available";
}

/** `posted` and `voided` are database words and never reach the screen. */
const RECEIPT_STATUS_WORD: Record<OtherReceiptStatus, string> = {
  posted: "Recorded",
  voided: "Cancelled",
};
export function otherReceiptStatusWord(status: OtherReceiptStatus): string {
  return RECEIPT_STATUS_WORD[status] ?? "Status not available";
}

export function financePartyKindWord(kind: FinancePartyKind): string {
  return kind === "person" ? "Person" : "Company";
}

/** An invoice number, or what stands in its place before it has one. */
export function otherDebtorInvoiceNumberWord(row: Pick<OtherDebtorInvoiceRow, "invoice_no">): string {
  return row.invoice_no ?? "Draft — no number yet";
}

/**
 * The Outstanding cell of one invoice, as words or as a figure:
 * a draft owes nothing yet, a cancelled invoice owes nothing ever, and an
 * issued one owes its total less what live receipts put against it.
 * `null` means "print the figure `outstanding`".
 */
export function otherDebtorOutstandingWord(row: Pick<OtherDebtorInvoiceRow, "status" | "outstanding">): string | null {
  if (row.status === "draft") return "Not issued yet";
  if (row.status === "cancelled") return "Cancelled";
  if (row.outstanding == null) return "Outstanding not available";
  if (row.outstanding <= 0) return "Paid in full";
  return null;
}

/** Sum money in whole sen, so 0.1 + 0.2 is 0.30 and never 0.30000000000000004. */
export function sumMoney(amounts: ReadonlyArray<number | null | undefined>): number {
  let sen = 0;
  for (const a of amounts) {
    const v = Number(a);
    if (Number.isFinite(v)) sen += Math.round(v * 100);
  }
  return sen / 100;
}

/**
 * A typed amount field → a number the schema can check, or null for "left
 * blank". Commas are thousands separators people type (`1,500.00`).
 */
export function parseTypedAmount(typed: string): number | null {
  const t = typed.replace(/,/g, "").trim();
  if (t === "") return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}
