/**
 * FINANCE LISTINGS PREVIEW — DEV ONLY (visual evidence for the portal-wide
 * listing styling change, 2026-09-17).
 *
 * Same contract as every `src/dev/*-preview.tsx` entry: the REAL FinanceApp
 * shell (portal sidebar + page), the REAL stylesheet, only the session seeded
 * and every API read answered by a local fixture. A separate vite entry — it
 * cannot reach production, and nothing leaves the browser.
 *
 * `?page=` ar · bills · payment-vouchers · ap-outstanding · other-debtors ·
 * other-debtor-parties · other-receipts · journal · trial-balance · reports.
 * Every listing carries at least one 60+ character party name so wrapping and
 * truncation are visible. Fixture evidence is not production evidence.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import FinanceApp from "@/pages/finance/FinanceApp";
import "@/index.css";

const params = new URLSearchParams(window.location.search);
const PAGE = params.get("page") ?? "ar";
const ROLE = params.get("role") ?? "finance";

useAuth.setState({
  role: ROLE as never, hydrated: true, loading: false,
  user: { id: "u-fin", email: `${ROLE}@carres.co` } as never,
  session: { access_token: "preview", user: { id: "u-fin", email: `${ROLE}@carres.co` } } as never,
});

const TODAY = appTodayIso();
function soon(days: number): string {
  const [y, m, d] = TODAY.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}
const at = (days: number) => `${soon(days)}T03:00:00Z`;
const GO_LIVE = soon(-60);

const LONG_CUSTOMER = "TAN SRI DATO' SERI MUHAMMAD HAFIZUDDIN BIN ABDUL RAHMAN AL-HAJ (KOTA DAMANSARA)";
const LONG_SUPPLIER = "Ohana Furniture Manufacturing Industries (Malaysia) Sdn Bhd — Muar Johor Factory";
const LONG_PARTY = "Persatuan Penduduk Taman Bukit Indah Kota Damansara Petaling Jaya Selangor Darul Ehsan";

// ── AR · Receivables — the Invoices Register wire ───────────────────────────
const AR_SPECS = [
  { so: 1401, name: LONG_CUSTOMER, total: 3200, paid: 1500, placed: -12 },
  { so: 1402, name: "NURUL AIN BINTI ISMAIL", total: 2400, paid: 800, placed: -40 },
  { so: 1403, name: "LIM KUAN YANG", total: 1800, paid: 0, placed: -75 },
  { so: 1404, name: "WONG MEI LING", total: 2600, paid: 1000, placed: -95, storage: 200 },
  { so: 1405, name: "SITI AMINAH", total: 4100, paid: 2000, placed: -5 },
  { so: 1406, name: "CHONG WEI JIE", total: 1500, paid: 500, placed: -33 },
];
const INVOICES = AR_SPECS.flatMap((s) => {
  const order = {
    id: `o-${s.so}`, so: s.so, customer_name: s.name, customer_phone: "0123456789", source_ref: [],
    status: "proceed_order", paid: s.paid, placed_at: at(s.placed),
    delivery_date: soon(10), delivery_date_tbd: false, delivered_at: null,
    ops_assigned_logistic: null, delivery_partners: { name: "NETS", contact: null },
    order_payments: s.paid ? [{ id: `p-${s.so}`, receipt_no: `RCP-${s.so}`, amount: s.paid, paid_on: soon(-7), voided_at: null }] : [],
    payment_communications: [], latest_promise: null,
    order_lines: [{ sku: "mattress:M1401F-K", qty: 1, unit_price: s.total }],
    order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, booking_stage: null, confirmed_time_slot: null,
      line_etas: null, line_stock_status: { "mattress:M1401F-K": "ready" } }],
    ops_delivery_arrangements: [], ops_delivery_orders: [],
  };
  const sales = { id: `i-${s.so}`, invoice_no: `INV-${s.so}`, status: "issued", kind: "sales", amount: s.total, tax_amount: 0,
    issued_at: at(-20), voided_at: null, void_reason: null, replaces_invoice_id: null,
    created_at: at(-20), order_id: `o-${s.so}`, orders: order };
  return s.storage
    ? [sales, { ...sales, id: `is-${s.so}`, invoice_no: `SINV-${s.so}`, kind: "storage", amount: s.storage }]
    : [sales];
});

// ── Payables ────────────────────────────────────────────────────────────────
const BILLS = [
  { id: "b-1", bill_no: "BILL-2609-0012", status: "confirmed", supplier_id: "s-1", supplier_name: LONG_SUPPLIER,
    supplier_kind: "supplier", supplier_invoice_no: "OH-INV-88231", bill_date: soon(-9), due_date: soon(21),
    po_id: "PO-20260901-4001", grn_nos: "GRN-20260903-1184", ap_account_code: "2100", total_amount: "12480.00",
    paid_total: "5000.00", unpaid: "7480.00", price_flags: 2, file_count: 3, created_at: at(-9) },
  { id: "b-2", bill_no: "BILL-2609-0011", status: "confirmed", supplier_id: "s-2", supplier_name: "Hooka",
    supplier_kind: "supplier", supplier_invoice_no: "HK-2091", bill_date: soon(-14), due_date: soon(-1),
    po_id: "PO-20260828-3350", grn_nos: "GRN-20260830-4102", ap_account_code: "2100", total_amount: "3890.50",
    paid_total: "3890.50", unpaid: "0.00", price_flags: 0, file_count: 1, created_at: at(-14) },
  { id: "b-3", bill_no: null, status: "draft", supplier_id: "s-3", supplier_name: "Nice Future",
    supplier_kind: "supplier", supplier_invoice_no: "NF/26/0931", bill_date: soon(-2), due_date: null,
    po_id: null, grn_nos: null, ap_account_code: "2100", total_amount: "2150.00",
    paid_total: "0.00", unpaid: null, price_flags: 0, file_count: 0, created_at: at(-2) },
  { id: "b-4", bill_no: "BILL-2608-0098", status: "cancelled", supplier_id: "s-4", supplier_name: "TNB Tenaga Nasional Berhad",
    supplier_kind: "other_creditor", supplier_invoice_no: "TNB-220938811", bill_date: soon(-30), due_date: soon(-16),
    po_id: null, grn_nos: null, ap_account_code: "2150", total_amount: "1288.40",
    paid_total: "0.00", unpaid: null, price_flags: 0, file_count: 1, created_at: at(-30) },
  { id: "b-5", bill_no: "BILL-2609-0010", status: "confirmed", supplier_id: "s-5", supplier_name: "Dorsettloft",
    supplier_kind: "supplier", supplier_invoice_no: "DL-00417", bill_date: soon(-18), due_date: soon(12),
    po_id: "PO-20260826-2210", grn_nos: "GRN-20260829-3001, GRN-20260901-3022", ap_account_code: "2100",
    total_amount: "9760.00", paid_total: "0.00", unpaid: "9760.00", price_flags: 1, file_count: 2, created_at: at(-18) },
];

const VOUCHERS = [
  { id: "v-1", voucher_no: "PV-2609-0031", status: "approved", purpose: "SUPPLIER_BILLS", supplier_id: "s-1",
    supplier_name: LONG_SUPPLIER, payee_name: LONG_SUPPLIER, voucher_date: soon(-3), amount: "5000.00",
    pay_method: "bank_transfer", pay_reference: "MBB-7781204", pay_from_account_code: "1010",
    pay_from_name: "Maybank Current Account", bill_nos: "BILL-2609-0012", line_count: 1,
    prepared_by_name: "Shasha", checked_by_name: "Li Ching", approved_by_name: "Jess", file_count: 1,
    created_at: at(-4), advance_amount: "0", advance_open: "0" },
  { id: "v-2", voucher_no: "PV-2609-0030", status: "checked", purpose: "SUPPLIER_BILLS", supplier_id: "s-5",
    supplier_name: "Dorsettloft", payee_name: "Dorsettloft", voucher_date: soon(-1), amount: "9760.00",
    pay_method: "bank_transfer", pay_reference: null, pay_from_account_code: "1010",
    pay_from_name: "Maybank Current Account", bill_nos: "BILL-2609-0010", line_count: 1,
    prepared_by_name: "Shasha", checked_by_name: "Li Ching", approved_by_name: null, file_count: 0,
    created_at: at(-1), advance_amount: "0", advance_open: null },
  { id: "v-3", voucher_no: null, status: "draft", purpose: "DIRECT", supplier_id: null,
    supplier_name: null, payee_name: "Syarikat Air Selangor Sdn Bhd", voucher_date: soon(0), amount: "312.60",
    pay_method: "online_banking", pay_reference: null, pay_from_account_code: "1010",
    pay_from_name: "Maybank Current Account", bill_nos: null, line_count: 2,
    prepared_by_name: "Shasha", checked_by_name: null, approved_by_name: null, file_count: 0,
    created_at: at(0), advance_amount: "0", advance_open: null },
  { id: "v-4", voucher_no: "PV-2609-0028", status: "approved", purpose: "SUPPLIER_BILLS", supplier_id: "s-2",
    supplier_name: "Hooka", payee_name: "Hooka", voucher_date: soon(-10), amount: "5890.50",
    pay_method: "cheque", pay_reference: "CHQ 004512", pay_from_account_code: "1020",
    pay_from_name: "Public Bank Current Account", bill_nos: "BILL-2609-0011", line_count: 1,
    prepared_by_name: "Li Ching", checked_by_name: "Shasha", approved_by_name: "Jess", file_count: 2,
    created_at: at(-10), advance_amount: "2000.00", advance_open: "2000.00" },
  { id: "v-5", voucher_no: "PV-2609-0025", status: "cancelled", purpose: "DIRECT", supplier_id: "s-4",
    supplier_name: "TNB Tenaga Nasional Berhad", payee_name: "TNB Tenaga Nasional Berhad", voucher_date: soon(-20),
    amount: "1288.40", pay_method: "online_banking", pay_reference: null, pay_from_account_code: "1010",
    pay_from_name: "Maybank Current Account", bill_nos: null, line_count: 1,
    prepared_by_name: "Shasha", checked_by_name: null, approved_by_name: null, file_count: 0,
    created_at: at(-20), advance_amount: "0", advance_open: null },
];

const OUTSTANDING = [
  { supplier_id: "s-1", supplier_name: LONG_SUPPLIER, bills_confirmed: 4, billed_total: "48210.00", allocated_total: "30000.00",
    paid_total: "25000.00", balance_owing: "23210.00", uncommitted: "18210.00", oldest_confirmed_bill_date: soon(-50),
    go_live_on: GO_LIVE, supplier_kind: "supplier", open_bills: 2, oldest_unpaid_bill_date: soon(-9),
    advance_open: "0.00", net_owing: "23210.00" },
  { supplier_id: "s-5", supplier_name: "Dorsettloft", bills_confirmed: 2, billed_total: "15760.00", allocated_total: "9760.00",
    paid_total: "6000.00", balance_owing: "9760.00", uncommitted: "0.00", oldest_confirmed_bill_date: soon(-40),
    go_live_on: GO_LIVE, supplier_kind: "supplier", open_bills: 1, oldest_unpaid_bill_date: soon(-18),
    advance_open: "0.00", net_owing: "9760.00" },
  { supplier_id: "s-3", supplier_name: "Nice Future", bills_confirmed: 3, billed_total: "11450.00", allocated_total: "4000.00",
    paid_total: "4000.00", balance_owing: "7450.00", uncommitted: "7450.00", oldest_confirmed_bill_date: soon(-45),
    go_live_on: GO_LIVE, supplier_kind: "supplier", open_bills: 2, oldest_unpaid_bill_date: soon(-25),
    advance_open: "1500.00", net_owing: "5950.00" },
  { supplier_id: "s-2", supplier_name: "Hooka", bills_confirmed: 1, billed_total: "3890.50", allocated_total: "3890.50",
    paid_total: "3890.50", balance_owing: "0.00", uncommitted: "0.00", oldest_confirmed_bill_date: soon(-14),
    go_live_on: GO_LIVE, supplier_kind: "supplier", open_bills: 0, oldest_unpaid_bill_date: null,
    advance_open: "2000.00", net_owing: "-2000.00" },
  { supplier_id: "s-6", supplier_name: "Pos Laju Malaysia Berhad", bills_confirmed: 1, billed_total: "420.00", allocated_total: "0.00",
    paid_total: "0.00", balance_owing: "420.00", uncommitted: "420.00", oldest_confirmed_bill_date: soon(-6),
    go_live_on: GO_LIVE, supplier_kind: "other_creditor", open_bills: 1, oldest_unpaid_bill_date: soon(-6),
    advance_open: "0.00", net_owing: "420.00" },
];

// ── Other money in ──────────────────────────────────────────────────────────
const PARTIES = [
  { party_id: "11111111-1111-4111-8111-000000000001", name: LONG_PARTY, kind: "company", registration_no: "PPM-004-10-12082019",
    phone: "0378881234", email: "setiausaha@ppbi.org.my", address: "Dewan Serbaguna, Jalan Bukit Indah 3", notes: null,
    is_active: true, invoices_open: 2, invoiced_total: 4200, received_total: 1200, outstanding: 3000,
    oldest_open_invoice_date: soon(-35), created_at: at(-50), go_live_on: GO_LIVE },
  { party_id: "11111111-1111-4111-8111-000000000002", name: "Ikea Malaysia Sdn Bhd", kind: "company", registration_no: "199601034567",
    phone: "0379521000", email: null, address: null, notes: "Display rental", is_active: true,
    invoices_open: 1, invoiced_total: 2800, received_total: 0, outstanding: 2800,
    oldest_open_invoice_date: soon(-12), created_at: at(-40), go_live_on: GO_LIVE },
  { party_id: "11111111-1111-4111-8111-000000000003", name: "Tan Mei Hua", kind: "person", registration_no: "880412-10-5566",
    phone: "0162230099", email: "meihua@gmail.com", address: null, notes: null, is_active: true,
    invoices_open: 0, invoiced_total: 650, received_total: 650, outstanding: 0,
    oldest_open_invoice_date: null, created_at: at(-30), go_live_on: GO_LIVE },
  { party_id: "11111111-1111-4111-8111-000000000004", name: "Wisma Kota Damansara Management Corporation", kind: "company",
    registration_no: null, phone: null, email: null, address: null, notes: null, is_active: false,
    invoices_open: 0, invoiced_total: 0, received_total: 0, outstanding: 0,
    oldest_open_invoice_date: null, created_at: at(-20), go_live_on: GO_LIVE },
];
const DEBTOR_INVOICES = [
  { invoice_id: "22222222-2222-4222-8222-000000000001", invoice_no: "ODI-2609-0007", status: "issued", party_id: PARTIES[0]!.party_id,
    party_name: LONG_PARTY, invoice_date: soon(-35), due_date: soon(-5), reference: "Hall booking Aug",
    narration: "Showroom event space sublet — community furniture exhibition weekend", first_line: "Event space sublet",
    line_count: 2, total_amount: 2400, received_amount: 1200, outstanding: 1200, created_at: at(-35), issued_at: at(-35),
    cancelled_at: null, cancel_reason: null, go_live_on: GO_LIVE },
  { invoice_id: "22222222-2222-4222-8222-000000000002", invoice_no: "ODI-2609-0008", status: "issued", party_id: PARTIES[0]!.party_id,
    party_name: LONG_PARTY, invoice_date: soon(-20), due_date: soon(10), reference: null, narration: null,
    first_line: "Delivery lorry hire", line_count: 1, total_amount: 1800, received_amount: 0, outstanding: 1800,
    created_at: at(-20), issued_at: at(-20), cancelled_at: null, cancel_reason: null, go_live_on: GO_LIVE },
  { invoice_id: "22222222-2222-4222-8222-000000000003", invoice_no: "ODI-2609-0009", status: "issued", party_id: PARTIES[1]!.party_id,
    party_name: "Ikea Malaysia Sdn Bhd", invoice_date: soon(-12), due_date: soon(18), reference: "PO 44120",
    narration: "Display unit rental", first_line: "Display rental — Sep", line_count: 1, total_amount: 2800,
    received_amount: 0, outstanding: 2800, created_at: at(-12), issued_at: at(-12), cancelled_at: null, cancel_reason: null, go_live_on: GO_LIVE },
  { invoice_id: "22222222-2222-4222-8222-000000000004", invoice_no: null, status: "draft", party_id: PARTIES[2]!.party_id,
    party_name: "Tan Mei Hua", invoice_date: soon(-1), due_date: null, reference: null, narration: null,
    first_line: "Old display mattress sale", line_count: 1, total_amount: 650, received_amount: 0, outstanding: null,
    created_at: at(-1), issued_at: null, cancelled_at: null, cancel_reason: null, go_live_on: GO_LIVE },
  { invoice_id: "22222222-2222-4222-8222-000000000005", invoice_no: "ODI-2608-0004", status: "cancelled", party_id: PARTIES[2]!.party_id,
    party_name: "Tan Mei Hua", invoice_date: soon(-40), due_date: null, reference: null, narration: null,
    first_line: "Old display mattress sale", line_count: 1, total_amount: 650, received_amount: 0, outstanding: null,
    created_at: at(-40), issued_at: at(-40), cancelled_at: at(-38), cancel_reason: "Wrong party", go_live_on: GO_LIVE },
];
const RECEIPTS = [
  { receipt_id: "33333333-3333-4333-8333-000000000001", receipt_no: "ORC-2609-0014", status: "posted", receipt_date: soon(-6),
    party_id: PARTIES[0]!.party_id, party_name: LONG_PARTY, payer_name: LONG_PARTY, money_account_code: "1010",
    money_account_name: "Maybank Current Account", reference: "IBG 88120931", narration: null,
    what: "ODI-2609-0007", total_amount: 1200, allocated_amount: 1200, created_at: at(-6), created_by_name: "Shasha",
    voided_at: null, void_reason: null, go_live_on: GO_LIVE },
  { receipt_id: "33333333-3333-4333-8333-000000000002", receipt_no: "ORC-2609-0013", status: "posted", receipt_date: soon(-9),
    party_id: null, party_name: null, payer_name: "Walk-in buyer (scrap cardboard)", money_account_code: "1000",
    money_account_name: "Petty Cash", reference: null, narration: "Sold used carton boxes",
    what: "Other income", total_amount: 85, allocated_amount: 0, created_at: at(-9), created_by_name: "Li Ching",
    voided_at: null, void_reason: null, go_live_on: GO_LIVE },
  { receipt_id: "33333333-3333-4333-8333-000000000003", receipt_no: "ORC-2609-0012", status: "posted", receipt_date: soon(-15),
    party_id: PARTIES[2]!.party_id, party_name: "Tan Mei Hua", payer_name: "Tan Mei Hua", money_account_code: "1010",
    money_account_name: "Maybank Current Account", reference: "DuitNow 0162230099", narration: null,
    what: "Display item sale", total_amount: 650, allocated_amount: 0, created_at: at(-15), created_by_name: "Shasha",
    voided_at: null, void_reason: null, go_live_on: GO_LIVE },
  { receipt_id: "33333333-3333-4333-8333-000000000004", receipt_no: "ORC-2609-0011", status: "voided", receipt_date: soon(-18),
    party_id: null, party_name: null, payer_name: "Insurance claim — Etiqa General Takaful", money_account_code: "1010",
    money_account_name: "Maybank Current Account", reference: null, narration: null,
    what: "Insurance claim", total_amount: 3100, allocated_amount: 0, created_at: at(-18), created_by_name: "Li Ching",
    voided_at: at(-17), void_reason: "Recorded twice", go_live_on: GO_LIVE },
];

// ── Ledger ──────────────────────────────────────────────────────────────────
const ENTRIES = [
  ["SALES_INVOICE", "INV-1405", `Sales invoice SO-1405 · ${LONG_CUSTOMER}`, 4100],
  ["CUSTOMER_PAYMENT", "RCP-1405", "Customer payment SO-1405 · bank transfer", 2000],
  ["SUPPLIER_BILL", "BILL-2609-0012", `Supplier bill · ${LONG_SUPPLIER}`, 12480],
  ["PAYMENT_VOUCHER", "PV-2609-0031", "Payment voucher to Ohana", 5000],
  ["OTHER_RECEIPT", "ORC-2609-0014", null, 1200],
  ["MANUAL", "MJ-2609-0002", "Month-end accrual for electricity", 1288.4],
  ["SALES_INVOICE_REVERSAL", "INV-1398", "Reversal of wrong amount", 2100],
].map(([source, doc, narration, amount], i) => ({
  id: `e-${i + 1}`, entry_no: `JE-2609-${String(120 - i).padStart(4, "0")}`, entry_date: soon(-i * 2),
  source_type: source, source_doc_no: doc, narration, total_debit: amount, total_credit: amount,
  reversed: false, reverses: null, reverses_entry_no: null, reversed_by: null, reversed_by_entry_no: null,
  created_at: at(-i * 2),
}));
const ACCOUNTS = [
  ["1000", "Petty Cash", "ASSET"], ["1010", "Maybank Current Account", "ASSET"], ["1200", "Trade Receivables — Customers", "ASSET"],
  ["1300", "Inventory — Finished Goods Held at Carres Klang Warehouse and Showrooms", "ASSET"],
  ["2100", "Trade Payables — Suppliers", "LIABILITY"], ["2150", "Other Payables", "LIABILITY"],
  ["3000", "Share Capital", "EQUITY"], ["4000", "Sales — Furniture", "INCOME"], ["4100", "Other Income", "INCOME"],
  ["5000", "Cost of Goods Sold", "EXPENSE"], ["6100", "Utilities", "EXPENSE"],
] as const;
const TB = {
  status: "ok", go_live_on: GO_LIVE, as_of: TODAY,
  accounts: [
    ["1000", 85, 0], ["1010", 3850, 5000], ["1200", 4100, 2000], ["1300", 12480, 0],
    ["2100", 5000, 12480], ["2150", 0, 1288.4], ["4000", 0, 4100], ["4100", 0, 85], ["6100", 1288.4, 0], ["3000", 0, 1850],
  ].map(([code, dr, cr]) => {
    const a = ACCOUNTS.find((x) => x[0] === code)!;
    const debitNatural = a[2] === "ASSET" || a[2] === "EXPENSE";
    return { account_code: a[0], account_name: a[1], kind: a[2], is_control: code === "1200" || code === "2100", is_active: true,
      total_debit: dr, total_credit: cr, natural_balance: debitNatural ? Number(dr) - Number(cr) : Number(cr) - Number(dr) };
  }),
  total_debit: 26803.4, total_credit: 26803.4, difference: 0, balances: true,
};

function plRows(from: string, to: string) {
  const common = { report_status: "OK", go_live_on: GO_LIVE, period_from: from, period_to: to };
  const rows = [
    { row_kind: "ACCOUNT", section: "INCOME", header_code: "4", header_name: "Income", account_code: "4000", account_name: "Sales — Furniture", amount: 4100 },
    { row_kind: "ACCOUNT", section: "INCOME", header_code: "4", header_name: "Income", account_code: "4100", account_name: "Other Income — Display Rental, Event Space Sublet and Scrap Sales", amount: 85 },
    { row_kind: "HEADER_SUBTOTAL", section: "INCOME", header_code: "4", header_name: "Income", amount: 4185 },
    { row_kind: "SECTION_TOTAL", section: "INCOME", amount: 4185 },
    { row_kind: "ACCOUNT", section: "EXPENSE", header_code: "6", header_name: "Operating expenses", account_code: "6100", account_name: "Utilities", amount: 1288.4 },
    { row_kind: "HEADER_SUBTOTAL", section: "EXPENSE", header_code: "6", header_name: "Operating expenses", amount: 1288.4 },
    { row_kind: "SECTION_TOTAL", section: "EXPENSE", amount: 1288.4 },
    { row_kind: "NET", section: "NET", amount: 2896.6 },
  ];
  return { rows: rows.map((r, i) => ({ ...common, ordinal: i + 1, ...r })) };
}
function bsRows(asOf: string) {
  const common = { report_status: "OK", go_live_on: GO_LIVE, as_of: asOf, equation_balances: true, equation_difference: 0 };
  const rows = [
    { row_kind: "ACCOUNT", section: "ASSET", header_code: "1", header_name: "Current assets", account_code: "1010", account_name: "Maybank Current Account", amount: -1150 },
    { row_kind: "ACCOUNT", section: "ASSET", header_code: "1", header_name: "Current assets", account_code: "1200", account_name: "Trade Receivables — Customers", amount: 2100 },
    { row_kind: "ACCOUNT", section: "ASSET", header_code: "1", header_name: "Current assets", account_code: "1300", account_name: "Inventory — Finished Goods Held at Carres Klang Warehouse and Showrooms", amount: 12480 },
    { row_kind: "ACCOUNT", section: "ASSET", header_code: "1", header_name: "Current assets", account_code: "1000", account_name: "Petty Cash", amount: 85 },
    { row_kind: "HEADER_SUBTOTAL", section: "ASSET", header_code: "1", header_name: "Current assets", amount: 13515 },
    { row_kind: "SECTION_TOTAL", section: "ASSET", amount: 13515 },
    { row_kind: "ACCOUNT", section: "LIABILITY", header_code: "2", header_name: "Current liabilities", account_code: "2100", account_name: "Trade Payables — Suppliers", amount: 7480 },
    { row_kind: "ACCOUNT", section: "LIABILITY", header_code: "2", header_name: "Current liabilities", account_code: "2150", account_name: "Other Payables", amount: 1288.4 },
    { row_kind: "HEADER_SUBTOTAL", section: "LIABILITY", header_code: "2", header_name: "Current liabilities", amount: 8768.4 },
    { row_kind: "SECTION_TOTAL", section: "LIABILITY", amount: 8768.4 },
    { row_kind: "ACCOUNT", section: "EQUITY", header_code: "3", header_name: "Equity", account_code: "3000", account_name: "Share Capital", amount: 1850 },
    { row_kind: "HEADER_SUBTOTAL", section: "EQUITY", header_code: "3", header_name: "Equity", amount: 1850 },
    { row_kind: "DERIVED", section: "EQUITY", amount: 2896.6 },
    { row_kind: "SECTION_TOTAL", section: "EQUITY", amount: 4746.6 },
    { row_kind: "EQUATION", section: "CHECK", amount: 0 },
  ];
  return { rows: rows.map((r, i) => ({ ...common, ordinal: i + 1, ...r })) };
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/") && !url.includes("127.0.0.1:88") && !url.includes("localhost:88")) return realFetch(input, init);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (init?.method && init.method !== "GET") return json({ message: "Local preview does not save records." }, 405);
  const q = new URL(url, window.location.origin).searchParams;
  if (url.includes("/api/finance/invoices/register")) return json({ rows: INVOICES, total: INVOICES.length });
  if (url.includes("/api/finance/payments/register")) return json({ rows: [], total: 0 });
  if (url.includes("/api/finance/payables/bills")) return json({ rows: BILLS });
  if (url.includes("/api/finance/payables/vouchers")) return json({ rows: VOUCHERS });
  if (url.includes("/api/finance/payables/outstanding")) return json({ rows: OUTSTANDING });
  if (url.includes("/api/finance/payables/bill-outstanding")) return json({ rows: [] });
  if (url.includes("/api/finance/payables/suppliers"))
    return json({ rows: OUTSTANDING.map((o) => ({ id: o.supplier_id, name: o.supplier_name, kind: o.supplier_kind })) });
  if (url.includes("/api/finance/payables/")) return json({ rows: [] });
  if (url.includes("/api/finance/other-money-in/parties")) return json(PARTIES);
  if (url.includes("/api/finance/other-money-in/invoices")) return json(DEBTOR_INVOICES);
  if (url.includes("/api/finance/other-money-in/receipts")) return json(RECEIPTS);
  if (url.includes("/api/finance/other-money-in/me")) return json({ mayCancel: true });
  if (url.includes("/api/finance/other-money-in/accounts")) return json([]);
  if (url.includes("/api/finance/ledger/entries/")) return json({ entry: ENTRIES[0], lines: [], related: [] });
  if (url.includes("/api/finance/ledger/entries")) return json({ rows: ENTRIES, total: ENTRIES.length });
  if (url.includes("/api/finance/ledger/accounts"))
    return json({ go_live_on: GO_LIVE, accounts: ACCOUNTS.map(([code, name, kind]) => ({ code, name, kind, parent_code: null,
      is_control: code === "1200" || code === "2100", control_for: null, is_active: true, is_header: false })) });
  if (url.includes("/api/finance/ledger/trial-balance")) return json({ ...TB, as_of: q.get("asOf") ?? TODAY });
  if (url.includes("/api/finance/ledger/profit-and-loss")) return json(plRows(q.get("from") ?? "", q.get("to") ?? ""));
  if (url.includes("/api/finance/ledger/balance-sheet")) return json(bsRows(q.get("asOf") ?? ""));
  if (url.includes("/api/finance/payment-settings"))
    return json({ bank_accounts: [], manual_methods: [], storage_rules: [], collection_timing: [], setting_changes: [],
      online_provider: { name: "Stripe", configured: false } });
  if (url.includes("/api/finance/payment-storage")) return json({ cases: [], requests: [] });
  if (url.includes("/rest/")) return json([]);
  return json({}, 404);
};

const ROUTES: Record<string, string> = {
  ar: "/finance/ar",
  bills: "/finance/bills",
  "payment-vouchers": "/finance/payment-vouchers",
  "ap-outstanding": "/finance/ap-outstanding",
  "other-debtors": "/finance/other-debtors",
  "other-debtor-parties": "/finance/other-debtors?view=parties",
  "other-receipts": "/finance/other-receipts",
  journal: "/finance/ledger",
  "trial-balance": "/finance/ledger/trial-balance",
  reports: "/finance/reports",
};
window.history.replaceState(null, "", ROUTES[PAGE] ?? ROUTES.ar);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/finance/*" element={<FinanceApp />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
