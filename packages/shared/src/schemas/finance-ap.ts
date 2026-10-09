import { z } from "zod";
import { lineDepartmentFields } from "../department";

/**
 * Supplier bills and payment vouchers — the wire contract (migration 0477).
 *
 * The database decides every rule (accounts, GRN ceilings, who may prepare,
 * check and approve). These schemas only refuse what is obviously not a
 * request, so a typo never costs a round-trip to Postgres.
 *
 * Money travels as a JSON number with at most two decimals; the database
 * stores numeric(12,2).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-10");
const money = z
  .number()
  .finite()
  // At most two decimals. `n * 100` is not exact in floating point (0.07 * 100
  // is 7.000000000000001), so compare against the nearest whole cent.
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use an amount like 1250.00")
  .refine((n) => Math.abs(n) < 10_000_000_000, "That amount is too large");
const optText = (max: number) => z.string().max(max).nullable().optional();

export const AP_FILE_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const AP_FILE_MAX_BYTES = 20 * 1024 * 1024;

// ── payment terms (0530) ────────────────────────────────────────────────────
/** Days, or null to clear. Owner ruling 17 Sep 2026: set per supplier and per PO. */
export const termsDays = z.number().int().min(0).max(365).nullable();
export const setTermsDaysInput = z.object({ days: termsDays }).strict();
export type SetTermsDaysInput = z.infer<typeof setTermsDaysInput>;

/**
 * The due date a new bill starts with: bill date + terms days. The PO's terms
 * win when set, otherwise the supplier's. No terms, or no valid bill date,
 * gives null (no due date) — nothing blocks.
 */
export function defaultBillDueDate(
  billDate: string,
  poTermsDays: number | null | undefined,
  supplierTermsDays: number | null | undefined,
): string | null {
  const days = poTermsDays ?? supplierTermsDays;
  if (days == null || !/^\d{4}-\d{2}-\d{2}$/.test(billDate)) return null;
  const d = new Date(`${billDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── bills ────────────────────────────────────────────────────────────────────
export const supplierBillLineInput = z
  .object({
    warehouseReceiptId: z.string().uuid().nullable().optional(),
    poLineId: z.string().uuid().nullable().optional(),
    accountCode: optText(10),
    description: optText(300),
    sku: optText(120),
    qty: money.nullable().optional(),
    unitPrice: money.nullable().optional(),
    amount: money.nullable().optional(),
    ...lineDepartmentFields,
  })
  .strict();
export type SupplierBillLineInput = z.infer<typeof supplierBillLineInput>;

export const supplierBillDraftInput = z
  .object({
    supplierId: z.string().uuid(),
    supplierInvoiceNo: z.string().trim().min(1, "Type the supplier's invoice number").max(80),
    billDate: isoDate,
    dueDate: isoDate.nullable().optional(),
    apAccountCode: optText(10),
    narration: optText(500),
    lines: z.array(supplierBillLineInput).min(1, "A bill needs at least one line").max(300),
  })
  .strict();
export type SupplierBillDraftInput = z.infer<typeof supplierBillDraftInput>;

export const otherCreditorInput = z
  .object({
    name: z.string().trim().min(2, "Type the creditor's name").max(120),
    contact: optText(120),
    contactEmail: z.string().email().max(200).nullable().optional(),
  })
  .strict();
export type OtherCreditorInput = z.infer<typeof otherCreditorInput>;

// ── a supplier's finance details (0636; Chew 2026-10-03, Finance MASTER §3.2) ─
/** Blank text means no value, exactly as the database door stores it. */
const blankToNull = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

/**
 * Finance's own tax and bank details for a supplier. The supplier stays
 * Purchasing's record. finance_supplier_profile_save checks the same rules;
 * this only turns a bad form into a sentence before the round trip.
 */
export const supplierFinanceInput = z
  .object({
    taxNo: z.string().max(40, "The tax number is too long.").nullable().optional(),
    registrationNo: z.string().max(60, "The registration number is too long.").nullable().optional(),
    bankName: z.string().max(100, "The bank name is too long.").nullable().optional(),
    bankAccountNo: z.string().max(40, "An account number is 6 to 20 digits.").nullable().optional(),
    bankAccountHolder: z.string().max(200, "The account holder's name is too long.").nullable().optional(),
  })
  .strict()
  .transform((v) => ({
    taxNo: blankToNull(v.taxNo),
    registrationNo: blankToNull(v.registrationNo),
    bankName: blankToNull(v.bankName),
    // Spaces and dashes typed with the number are dropped (0636, as 0598 does for dealers).
    bankAccountNo: blankToNull(v.bankAccountNo?.replace(/[\s-]/g, "")),
    bankAccountHolder: blankToNull(v.bankAccountHolder),
  }))
  .refine((v) => v.bankAccountNo === null || /^[0-9]{6,20}$/.test(v.bankAccountNo), {
    message: "An account number is 6 to 20 digits.",
    path: ["bankAccountNo"],
  })
  .refine((v) => v.bankAccountNo === null || v.bankName !== null, {
    message: "Choose the bank for this account number.",
    path: ["bankName"],
  });
export type SupplierFinanceInput = z.infer<typeof supplierFinanceInput>;
/** What the form sends, before blanks become null. */
export type SupplierFinanceFormInput = z.input<typeof supplierFinanceInput>;

/** One supplier on Finance's Suppliers page (finance_supplier_list, 0636). */
export interface SupplierFinanceRow {
  supplier_id: string;
  name: string;
  kind: string;
  tax_no: string | null;
  registration_no: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_holder: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

/** Where a payment to this supplier goes, on one line: `Maybank · 514012345678 ·
 *  Ah Seng Trading`. Null while Finance keeps no account number. */
export function supplierPayTo(
  row: Pick<SupplierFinanceRow, "bank_name" | "bank_account_no" | "bank_account_holder">,
): string | null {
  if (!row.bank_account_no) return null;
  return [row.bank_name, row.bank_account_no, row.bank_account_holder].filter(Boolean).join(" · ");
}

export const apReasonInput = z
  .object({ reason: z.string().trim().min(1, "Say why").max(500) })
  .strict();
export type ApReasonInput = z.infer<typeof apReasonInput>;

// ── supplier credit notes (0642; Chew 2026-10-03, Finance MASTER §3.2) ────────
/** One line of a supplier's credit note: what the credit is for, and where it
 *  goes back to (an expense, asset or income account — the database checks). */
export const supplierCreditNoteLineInput = z
  .object({
    accountCode: z.string().trim().min(1, "Choose an account").max(10),
    description: z.string().trim().min(1, "Say what this credit is for").max(200, "The description is too long"),
    amount: money.refine((n) => n > 0, "The amount must be more than RM 0.00"),
    ...lineDepartmentFields,
  })
  .strict();
export type SupplierCreditNoteLineInput = z.infer<typeof supplierCreditNoteLineInput>;

export const supplierCreditNoteDraftInput = z
  .object({
    supplierId: z.string().uuid({ message: "Choose who sent this credit note" }),
    supplierNoteNo: z.string().trim().min(1, "Type the supplier's credit note number").max(60, "The credit note number is too long"),
    noteDate: isoDate,
    apAccountCode: optText(10),
    narration: optText(500),
    lines: z.array(supplierCreditNoteLineInput).min(1, "A credit note needs at least one line").max(300),
  })
  .strict();
export type SupplierCreditNoteDraftInput = z.infer<typeof supplierCreditNoteDraftInput>;

// ── payment vouchers ─────────────────────────────────────────────────────────
export const PAYMENT_VOUCHER_PURPOSES = ["SUPPLIER_BILLS", "DIRECT"] as const;
export const PAYMENT_VOUCHER_METHODS = ["BANK_TRANSFER", "CHEQUE", "CASH", "OTHER"] as const;

export const paymentVoucherLineInput = z
  .object({
    accountCode: z.string().trim().min(1, "Choose an account").max(10),
    // 0536: a voucher line says what it is for.
    description: z.string().trim().min(1, "Say what this payment is for").max(300),
    amount: money,
    ...lineDepartmentFields,
  })
  .strict();

export const paymentVoucherAllocationInput = z
  .object({ billId: z.string().uuid(), amount: money })
  .strict();

export const paymentVoucherDraftInput = z
  .object({
    purpose: z.enum(PAYMENT_VOUCHER_PURPOSES),
    supplierId: z.string().uuid().nullable().optional(),
    payeeName: optText(160),
    voucherDate: isoDate,
    payFromAccountCode: z.string().trim().min(1, "Choose where the money is paid from").max(10),
    payMethod: z.enum(PAYMENT_VOUCHER_METHODS),
    payReference: optText(120),
    narration: optText(500),
    lines: z.array(paymentVoucherLineInput).max(100).default([]),
    allocations: z.array(paymentVoucherAllocationInput).max(200).default([]),
    // 0484: money paid to the supplier before its bill. 0 = no advance.
    advanceAmount: money.refine((n) => n >= 0, "An advance cannot be less than RM 0.00").default(0),
  })
  .strict();
export type PaymentVoucherDraftInput = z.infer<typeof paymentVoucherDraftInput>;

// ── supplier advances (0484–0485) ────────────────────────────────────────────
const moneyAbove0 = money.refine((n) => n > 0, "The amount must be more than RM 0.00");

/** Knock part of an approved advance off one confirmed bill. Posts nothing. */
export const advanceApplyInput = z
  .object({ billId: z.string().uuid(), amount: moneyAbove0 })
  .strict();
export type AdvanceApplyInput = z.infer<typeof advanceApplyInput>;

/** Money the supplier sent back out of an approved advance. */
export const moneyBackInput = z
  .object({
    moneyBackDate: isoDate,
    moneyAccountCode: z.string().trim().min(1, "Choose where the money came into").max(10),
    amount: moneyAbove0,
    reference: optText(120),
    narration: optText(500),
    // A double press sends the same key; the database returns the first record.
    idempotencyKey: z.string().uuid().nullable().optional(),
  })
  .strict();
export type MoneyBackInput = z.infer<typeof moneyBackInput>;

// ── files ────────────────────────────────────────────────────────────────────
export const apFileSignInput = z
  .object({
    mimeType: z.enum(AP_FILE_MIME),
    sizeBytes: z.number().int().positive().max(AP_FILE_MAX_BYTES),
  })
  .strict();

export const apFileAddInput = z
  .object({
    path: z.string().min(1).max(400),
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.enum(AP_FILE_MIME),
    sizeBytes: z.number().int().positive().max(AP_FILE_MAX_BYTES),
  })
  .strict();

// ── what the readers return (rows are snake_case, as Postgres names them) ────
export type ApMoney = number | string;

export interface SupplierBillRegisterRow {
  id: string;
  bill_no: string | null;
  status: "draft" | "confirmed" | "cancelled";
  supplier_id: string;
  supplier_name: string;
  supplier_kind: string;
  supplier_invoice_no: string;
  bill_date: string;
  due_date: string | null;
  po_id: string | null;
  grn_nos: string | null;
  ap_account_code: string;
  total_amount: ApMoney;
  paid_total: ApMoney;
  unpaid: ApMoney | null;
  price_flags: number;
  file_count: number;
  created_at: string;
}

export interface ApEvent {
  action: string;
  note: string | null;
  at: string;
  actor_name: string | null;
}

export interface ApFile {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

export interface SupplierBillDocument {
  bill: {
    id: string;
    bill_no: string | null;
    status: "draft" | "confirmed" | "cancelled";
    supplier_id: string;
    supplier_name: string;
    supplier_kind: string;
    supplier_invoice_no: string;
    bill_date: string;
    due_date: string | null;
    po_id: string | null;
    ap_account_code: string;
    ap_account_name: string | null;
    total_amount: ApMoney;
    narration: string | null;
    cancel_reason: string | null;
    created_at: string;
    created_by_name: string | null;
    confirmed_at: string | null;
    confirmed_by_name: string | null;
    cancelled_at: string | null;
    cancelled_by_name: string | null;
    entry_no: string | null;
    reversal_entry_no: string | null;
  };
  lines: Array<{
    line_no: number;
    account_code: string;
    account_name: string | null;
    description: string | null;
    sku: string | null;
    qty: ApMoney | null;
    unit_price: ApMoney | null;
    amount: ApMoney;
    warehouse_receipt_id: string | null;
    grn_no: string | null;
    grn_po_id: string | null;
    po_line_id: string | null;
    po_unit_cost: ApMoney | null;
    price_diff: ApMoney | null;
    /** 0540 */
    department_type?: string | null; department_id?: string | null;
    /** 0659: a person chose this line's account. A goods line nobody chose an
     *  account for takes its item group's purchase account when confirmed. */
    account_chosen?: boolean;
  }>;
  /** A voucher that pays the bill, (0485) an advance knocked off it, or
   *  (0642) a supplier credit note knocked off it. For a credit note,
   *  voucher_id / voucher_no / voucher_date are the note's own. */
  payments: Array<{
    kind: "voucher" | "advance" | "credit_note";
    /** The knock-off's own id — set for kinds "advance" and "credit_note". */
    application_id: string | null;
    voucher_id: string;
    voucher_no: string | null;
    /** The voucher's status, or the knock-off's: "applied" · "cancelled". */
    status: string;
    voucher_date: string;
    /** The day a knock-off was made; null for a voucher. */
    applied_on: string | null;
    amount_applied: ApMoney;
  }>;
  files: ApFile[];
  events: ApEvent[];
  paid_total: ApMoney;
  allocated_total: ApMoney;
  unpaid: ApMoney | null;
  /** Total less what is paid or already on a voucher; null unless confirmed. */
  left_to_pay: ApMoney | null;
  /** The supplier's advances left on this bill's payables account. */
  advance_open: ApMoney;
  go_live_on: string | null;
  can: {
    edit: boolean;
    confirm: boolean;
    cancel: boolean;
    add_file: boolean;
    apply_advance: boolean;
    take_advance_off: boolean;
  };
}

export interface GrnCandidateRow {
  receipt_id: string;
  grn_no: string | null;
  po_id: string;
  supplier_id: string;
  supplier_name: string;
  received_on: string;
  posted_at: string | null;
  open_lines: number;
  open_qty: ApMoney;
  open_value_at_po_cost: ApMoney;
  /** 0530 — the PO's own payment terms. Null = not set on the PO. */
  po_terms_days: number | null;
}

export interface GrnLineRow {
  receipt_id: string;
  grn_no: string | null;
  po_id: string;
  supplier_id: string;
  supplier_name: string;
  po_line_id: string;
  sku: string;
  received_qty: ApMoney;
  billed_qty: ApMoney;
  open_qty: ApMoney;
  po_unit_cost: ApMoney | null;
  commercial_treatment: string | null;
  /** 0540 (DEPT-6): the default department, from the PO line's sales orders. */
  department_type?: string | null; department_id?: string | null;
}

export interface ApAccountChoice {
  code: string;
  name: string;
  kind: string;
  parent_code: string | null;
  is_control: boolean;
  control_for: string | null;
  for_bill_line: boolean;
  for_voucher_line: boolean;
  for_ap: boolean;
  for_pay_from: boolean;
  /** 0642: a supplier credit note line — expense, asset or income. */
  for_credit_line?: boolean;
}

export interface ApCreditor {
  id: string;
  name: string;
  kind: string;
  /** 0530 — days after the bill date the supplier is paid. Null = not set. */
  terms_days: number | null;
}

export interface ApOutstandingRow {
  supplier_id: string;
  supplier_name: string;
  bills_confirmed: number;
  billed_total: ApMoney;
  allocated_total: ApMoney;
  paid_total: ApMoney;
  balance_owing: ApMoney;
  uncommitted: ApMoney;
  oldest_confirmed_bill_date: string | null;
  go_live_on: string | null;
  supplier_kind: string;
  open_bills: number;
  oldest_unpaid_bill_date: string | null;
  /** 0484: advance paid and not yet knocked off a bill or sent back. */
  advance_open: ApMoney;
  /** 0484 · 0642: balance_owing less advance_open and credit_open — what the
   *  ledger says is owed. */
  net_owing: ApMoney;
  /** 0642: confirmed supplier credit notes not yet knocked off a bill. */
  credit_open?: ApMoney;
}

/** One supplier credit note on its register (0642 supplier_credit_note_register). */
export interface SupplierCreditNoteRegisterRow {
  id: string;
  note_no: string | null;
  status: "draft" | "confirmed" | "cancelled";
  supplier_id: string;
  supplier_name: string;
  supplier_kind: string;
  supplier_note_no: string;
  note_date: string;
  ap_account_code: string;
  total_amount: ApMoney;
  /** Knocked off bills; null unless confirmed. */
  applied_total: ApMoney | null;
  /** Not knocked off yet; null unless confirmed. */
  credit_open: ApMoney | null;
  file_count: number;
  created_at: string;
}

/** One supplier credit note, whole (0642 supplier_credit_note_document). */
export interface SupplierCreditNoteDocument {
  note: {
    id: string;
    note_no: string | null;
    status: "draft" | "confirmed" | "cancelled";
    supplier_id: string;
    supplier_name: string;
    supplier_kind: string;
    supplier_note_no: string;
    note_date: string;
    ap_account_code: string;
    ap_account_name: string | null;
    total_amount: ApMoney;
    narration: string | null;
    cancel_reason: string | null;
    created_at: string;
    created_by_name: string | null;
    confirmed_at: string | null;
    confirmed_by_name: string | null;
    cancelled_at: string | null;
    cancelled_by_name: string | null;
    entry_no: string | null;
    reversal_entry_no: string | null;
  };
  lines: Array<{
    line_no: number;
    account_code: string;
    account_name: string | null;
    description: string;
    amount: ApMoney;
    department_type: string | null;
    department_id: string | null;
  }>;
  /** Each knock-off of this note's credit off a bill. */
  applications: Array<{
    application_id: string;
    bill_id: string;
    bill_no: string | null;
    supplier_invoice_no: string;
    bill_date: string;
    amount: ApMoney;
    status: "applied" | "cancelled";
    created_at: string;
    applied_on: string;
    created_by_name: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
  }>;
  files: ApFile[];
  events: ApEvent[];
  applied_total: ApMoney | null;
  credit_open: ApMoney | null;
  go_live_on: string | null;
  can: {
    edit: boolean;
    confirm: boolean;
    cancel: boolean;
    add_file: boolean;
    apply: boolean;
    take_off: boolean;
  };
}

/** One approved advance and what is left of it (0485 supplier_advances). */
export interface SupplierAdvanceRow {
  voucher_id: string;
  voucher_no: string;
  supplier_id: string;
  supplier_name: string;
  supplier_kind: string;
  voucher_date: string;
  ap_account_code: string;
  advance_amount: ApMoney;
  applied_total: ApMoney;
  money_back_total: ApMoney;
  advance_open: ApMoney;
}

export interface ApBillOutstandingRow {
  bill_id: string;
  bill_no: string;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_no: string;
  bill_date: string;
  due_date: string | null;
  po_id: string | null;
  total_amount: ApMoney;
  paid_total: ApMoney;
  balance_owing: ApMoney;
  go_live_on: string | null;
  ap_account_code: string;
  allocated_total: ApMoney;
  unallocated: ApMoney;
  supplier_kind: string;
}

export type PaymentVoucherStatus = "draft" | "prepared" | "checked" | "approved" | "cancelled";

export interface PaymentVoucherRegisterRow {
  id: string;
  voucher_no: string | null;
  status: PaymentVoucherStatus;
  purpose: "SUPPLIER_BILLS" | "DIRECT";
  supplier_id: string | null;
  supplier_name: string | null;
  payee_name: string;
  voucher_date: string;
  amount: ApMoney;
  pay_method: string;
  pay_reference: string | null;
  /** 0666: empty on a draft the system raised (a dealer's commission) until Finance picks it. */
  pay_from_account_code: string | null;
  pay_from_name: string | null;
  bill_nos: string | null;
  line_count: number;
  prepared_by_name: string | null;
  checked_by_name: string | null;
  approved_by_name: string | null;
  file_count: number;
  created_at: string;
  /** 0485: the advance this voucher carries (0 = none). */
  advance_amount: ApMoney;
  /** 0485: what is left of it; null unless the voucher is approved (a draft
   *  advance is not paid yet; a cancelled one was never paid or is reversed). */
  advance_open: ApMoney | null;
}

export interface SupplierAdvanceApplication {
  id: string;
  bill_id: string;
  bill_no: string | null;
  supplier_invoice_no: string;
  bill_date: string;
  amount: ApMoney;
  status: "applied" | "cancelled";
  created_at: string;
  created_by_name: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
}

export interface SupplierMoneyBack {
  id: string;
  money_back_no: string;
  money_back_date: string;
  money_account_code: string;
  money_account_name: string | null;
  amount: ApMoney;
  reference: string | null;
  narration: string | null;
  status: "posted" | "voided";
  entry_no: string | null;
  reversal_entry_no: string | null;
  created_at: string;
  created_by_name: string | null;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
}

export interface PaymentVoucherAdvance {
  advance_amount: ApMoney;
  applied_total: ApMoney;
  money_back_total: ApMoney;
  /** Null unless the voucher is approved: a draft advance is not money yet, and
   *  a cancelled voucher's advance was never paid or has been reversed. */
  advance_open: ApMoney | null;
  applications: SupplierAdvanceApplication[];
  money_back: SupplierMoneyBack[];
}

export interface PaymentVoucherDocument {
  voucher: {
    id: string;
    voucher_no: string | null;
    status: PaymentVoucherStatus;
    purpose: "SUPPLIER_BILLS" | "DIRECT";
    supplier_id: string | null;
    supplier_name: string | null;
    supplier_kind: string | null;
    payee_name: string;
    voucher_date: string;
    amount: ApMoney;
    /** 0484: the part of `amount` paid before any bill. */
    advance_amount: ApMoney;
    /** The payables account the advance sits on (2110 / 2120); null without one. */
    ap_account_code: string | null;
    ap_account_name: string | null;
    pay_method: string;
    pay_reference: string | null;
    /** 0666: empty on a draft the system raised until Finance picks it. */
    pay_from_account_code: string | null;
    pay_from_name: string | null;
    narration: string | null;
    created_at: string;
    created_by_name: string | null;
    prepared_at: string | null;
    prepared_by_name: string | null;
    checked_at: string | null;
    checked_by_name: string | null;
    approved_at: string | null;
    approved_by_name: string | null;
    rejected_at: string | null;
    rejected_by_name: string | null;
    reject_reason: string | null;
    cancelled_at: string | null;
    cancelled_by_name: string | null;
    cancel_reason: string | null;
    entry_no: string | null;
    reversal_entry_no: string | null;
  };
  lines: Array<{ line_no: number; account_code: string; account_name: string | null; description: string | null; amount: ApMoney; department_type?: string | null; department_id?: string | null }>;
  allocations: Array<{
    bill_id: string;
    bill_no: string | null;
    supplier_invoice_no: string;
    bill_date: string;
    due_date: string | null;
    bill_total: ApMoney;
    ap_account_code: string;
    amount_applied: ApMoney;
  }>;
  /** 0485: null when the voucher carries no advance. */
  advance: PaymentVoucherAdvance | null;
  files: ApFile[];
  events: ApEvent[];
  go_live_on: string | null;
  you_prepared: boolean;
  can: {
    edit: boolean;
    prepare: boolean;
    check: boolean;
    approve: boolean;
    reject: boolean;
    cancel: boolean;
    add_file: boolean;
    apply_advance: boolean;
    take_advance_off: boolean;
    money_back: boolean;
    cancel_money_back: boolean;
  };
}
