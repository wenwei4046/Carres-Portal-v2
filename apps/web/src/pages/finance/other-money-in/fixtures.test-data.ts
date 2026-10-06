/**
 * Invented rows for the Other debtors / Other receipts page tests. Every name
 * is made up — no real customer, party or phone appears here.
 */
import type {
  MoneyInAccountOption,
  OtherDebtorInvoiceDetail,
  OtherDebtorInvoiceRow,
  OtherDebtorPartyRow,
  OtherReceiptDetail,
  OtherReceiptRow,
} from "@carres/shared/other-money-in";

export const P1 = "11111111-1111-4111-8111-111111111111";
export const P2 = "22222222-2222-4222-8222-222222222222";
export const I_DRAFT = "aaaaaaaa-0000-4000-8000-000000000001";
export const I_OPEN = "aaaaaaaa-0000-4000-8000-000000000002";
export const I_PAID = "aaaaaaaa-0000-4000-8000-000000000003";
export const I_CANCELLED = "aaaaaaaa-0000-4000-8000-000000000004";
export const R1 = "bbbbbbbb-0000-4000-8000-000000000001";
export const R2 = "bbbbbbbb-0000-4000-8000-000000000002";

/** 0540: the department list the line pickers read. */
export const DEPARTMENTS = { rows: [
  { department_type: "SUBSCRIPTION", department_id: null, name: "Subscription" },
  { department_type: "OFFICE", department_id: null, name: "Office" },
] };

export const ACCOUNTS: MoneyInAccountOption[] = [
  { code: "1110", name: "Cash on hand", kind: "ASSET", parent_code: "1100", for_money: true, for_receipt_line: false, for_invoice_line: false },
  { code: "1120", name: "Bank — current account", kind: "ASSET", parent_code: "1100", for_money: true, for_receipt_line: false, for_invoice_line: false },
  { code: "2360", name: "Loans received", kind: "LIABILITY", parent_code: "2350", for_money: false, for_receipt_line: true, for_invoice_line: false },
  { code: "4900", name: "Other income", kind: "INCOME", parent_code: "4000", for_money: false, for_receipt_line: true, for_invoice_line: true },
  { code: "6200", name: "Rent", kind: "EXPENSE", parent_code: "6000", for_money: false, for_receipt_line: true, for_invoice_line: true },
];

/** The one money-account list (0512) — what Received into offers. */
export const MONEY_ACCOUNTS = [
  { code: "1110", name: "Cash on hand", money_kind: "CASH", is_active: true },
  { code: "1120", name: "Bank — current account", money_kind: "BANK", is_active: true },
  { code: "1123", name: "Hong Leong", money_kind: "BANK", is_active: false },
  { code: "1131", name: "GHL", money_kind: "HOLDING", is_active: true },
];

const partyBase = {
  registration_no: null,
  phone: null,
  email: null,
  address: null,
  notes: null,
  created_at: "2026-09-10T01:00:00Z",
  go_live_on: "2026-09-10",
};

export const PARTIES: OtherDebtorPartyRow[] = [
  {
    ...partyBase,
    party_id: P1,
    name: "Example Sister Sdn Bhd",
    kind: "company",
    registration_no: "202601000001",
    is_active: true,
    invoices_open: 1,
    invoiced_total: 3000,
    received_total: 2100,
    outstanding: 900,
    oldest_open_invoice_date: "2026-09-15",
  },
  {
    ...partyBase,
    party_id: P2,
    name: "Example Director",
    kind: "person",
    is_active: true,
    invoices_open: 0,
    invoiced_total: 0,
    received_total: 0,
    outstanding: 0,
    oldest_open_invoice_date: null,
  },
];

const invoiceBase = {
  party_id: P1,
  party_name: "Example Sister Sdn Bhd",
  due_date: null,
  reference: null,
  narration: null,
  first_line: "Office rent September",
  line_count: 2,
  created_at: "2026-09-15T01:00:00Z",
  issued_at: null,
  cancelled_at: null,
  cancel_reason: null,
  go_live_on: "2026-09-10",
};

export const INVOICES: OtherDebtorInvoiceRow[] = [
  { ...invoiceBase, invoice_id: I_DRAFT, invoice_no: null, status: "draft", invoice_date: "2026-09-20", total_amount: 1500, received_amount: 0, outstanding: null },
  { ...invoiceBase, invoice_id: I_OPEN, invoice_no: "ARI-20260915-4821", status: "issued", invoice_date: "2026-09-15", total_amount: 1500, received_amount: 600, outstanding: 900, issued_at: "2026-09-15T02:00:00Z" },
  { ...invoiceBase, invoice_id: I_PAID, invoice_no: "ARI-20260912-1377", status: "issued", invoice_date: "2026-09-12", total_amount: 1500, received_amount: 1500, outstanding: 0, issued_at: "2026-09-12T02:00:00Z" },
  { ...invoiceBase, invoice_id: I_CANCELLED, invoice_no: "ARI-20260911-9056", status: "cancelled", invoice_date: "2026-09-11", total_amount: 700, received_amount: 0, outstanding: null, cancelled_at: "2026-09-11T05:00:00Z", cancel_reason: "Typed the wrong party" },
];

const detailExtras = {
  debtor_account_code: "1240",
  entry_no: null,
  reversal_entry_no: null,
  created_by_name: "Finance Tester",
  issued_by_name: null,
  cancelled_by_name: null,
};

export const DRAFT_DETAIL: OtherDebtorInvoiceDetail = {
  invoice: { ...INVOICES[0], ...detailExtras },
  lines: [
    { line_no: 1, account_code: "6200", account_name: "Rent", description: "Office rent September", amount: 1400, department_type: "OFFICE", department_id: null },
    { line_no: 2, account_code: "4900", account_name: "Other income", description: "Service charge", amount: 100, department_type: "SUBSCRIPTION", department_id: null },
  ],
  receipts: [],
};

export const OPEN_DETAIL: OtherDebtorInvoiceDetail = {
  invoice: { ...INVOICES[1], ...detailExtras, entry_no: "JE-202609-0001", issued_by_name: "Finance Tester" },
  lines: DRAFT_DETAIL.lines,
  receipts: [{ receipt_id: R1, receipt_no: "RV-20260916-3390", receipt_date: "2026-09-16", amount: 600, status: "posted" }],
};

const receiptBase = {
  reference: null,
  narration: null,
  created_at: "2026-09-16T01:00:00Z",
  created_by_name: "Finance Tester",
  voided_at: null,
  void_reason: null,
  go_live_on: "2026-09-10",
  money_account_code: "1120",
  money_account_name: "Bank — current account",
};

export const RECEIPTS: OtherReceiptRow[] = [
  { ...receiptBase, receipt_id: R1, receipt_no: "RV-20260916-3390", status: "posted", receipt_date: "2026-09-16", party_id: P1, party_name: "Example Sister Sdn Bhd", payer_name: "Example Sister Sdn Bhd", what: "ARI-20260915-4821", total_amount: 600, allocated_amount: 600 },
  { ...receiptBase, receipt_id: R2, receipt_no: "RV-20260917-7102", status: "posted", receipt_date: "2026-09-17", party_id: null, party_name: null, payer_name: "Example Lender Bhd", what: "Loans received", total_amount: 10000, allocated_amount: 0 },
  { ...receiptBase, receipt_id: "bbbbbbbb-0000-4000-8000-000000000003", receipt_no: "RV-20260917-5518", status: "voided", receipt_date: "2026-09-17", party_id: null, party_name: null, payer_name: "Example Lender Bhd", what: "Other income", total_amount: 50, allocated_amount: 0, voided_at: "2026-09-17T06:00:00Z", void_reason: "Recorded twice" },
];

export const RECEIPT_DETAIL: OtherReceiptDetail = {
  receipt: { ...RECEIPTS[0], entry_no: "JE-202609-0002", reversal_entry_no: null, voided_by_name: null },
  lines: [],
  allocations: [{ invoice_id: I_OPEN, invoice_no: "ARI-20260915-4821", invoice_date: "2026-09-15", invoice_total: 1500, amount: 600 }],
};
