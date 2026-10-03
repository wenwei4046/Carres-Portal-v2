/**
 * FINANCE LISTINGS PREVIEW — DEV ONLY (visual evidence for the portal-wide
 * listing styling change, 2026-09-17).
 *
 * Same contract as every `src/dev/*-preview.tsx` entry: the REAL FinanceApp
 * shell (portal sidebar + page), the REAL stylesheet, only the session seeded
 * and every API read answered by a local fixture. A separate vite entry — it
 * cannot reach production, and nothing leaves the browser.
 *
 * `?page=` ar · bills · payment-vouchers · ap-outstanding · suppliers ·
 * other-debtors · other-debtor-parties · other-receipts · daily-bank ·
 * journal · general-ledger · trial-balance · reports · cash-flow · ap-aging ·
 * credit-notes · credit-note · credit-note-new · forecast (last month, so the
 * actual is a whole month).
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
    advance_open: "0.00", credit_open: "650.00", net_owing: "22560.00" },
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

// ── Payables → Suppliers: Finance's own tax and bank details (0636) ─────────
const SUPPLIER_FINANCE = [
  { supplier_id: "s-1", name: LONG_SUPPLIER, kind: "factory_pickup", tax_no: "C 2001234567", registration_no: "201901012345",
    bank_name: "Maybank", bank_account_no: "514012345678", bank_account_holder: "Ohana Furniture Manufacturing Industries (M) Sdn Bhd",
    updated_at: at(-2), updated_by_name: "Chew" },
  { supplier_id: "s-2", name: "Lumen Sofa Works", kind: "factory_pickup", tax_no: null, registration_no: null,
    bank_name: "Public Bank", bank_account_no: "3123456789", bank_account_holder: "Lumen Sofa Works Sdn Bhd",
    updated_at: at(-30), updated_by_name: null },
  { supplier_id: "s-3", name: "Bayview Properties", kind: "other_creditor", tax_no: null, registration_no: null,
    bank_name: null, bank_account_no: null, bank_account_holder: null, updated_at: null, updated_by_name: null },
];

// ── Bank & Cards → Daily Bank (0637): every money account on one day ────────
const bankLine = (entry: number, source_type: string, source_doc_no: string, party: [string, string] | null,
  description: string | null, received: number, paid: number) => ({
  entry_no: `JE-${TODAY.slice(2, 4)}${TODAY.slice(5, 7)}-${String(entry).padStart(4, "0")}`, source_type, source_doc_no,
  description, party_type: party?.[0] ?? null, party_name: party?.[1] ?? null, received, paid,
});
const money = (account_code: string, name: string, money_kind: string, brought_forward: number,
  lines: ReturnType<typeof bankLine>[] = [], pending_vouchers: Array<Record<string, unknown>> = []) => ({
  account_code, name, money_kind, is_active: true, brought_forward,
  received: lines.reduce((s, l) => s + l.received, 0), paid: lines.reduce((s, l) => s + l.paid, 0),
  pending: pending_vouchers.reduce((s, v) => s + Number(v.amount), 0), pending_vouchers, lines,
});
const DAILY_BANK = (day: string) => ({
  day, go_live_on: GO_LIVE,
  accounts: [
    money("1110", "Cash in hand", "CASH", 1250, [
      bankLine(41, "CUSTOMER_PAYMENT", "OR-2610-0031", ["CUSTOMER", LONG_CUSTOMER], "Deposit for SO-1405", 300, 0),
      bankLine(42, "OTHER_RECEIPT", "ORC-2610-0004", ["OTHER", LONG_PARTY], "Hall rental refund", 80, 0),
    ]),
    money("1121", "Public Bank", "BANK", 48210.55, [
      bankLine(43, "CUSTOMER_PAYMENT", "OR-2610-0032", ["CUSTOMER", "NURUL AIN BINTI ISMAIL"], null, 6400, 0),
      bankLine(44, "PAYMENT_VOUCHER", "PV-2610-0011", ["SUPPLIER", LONG_SUPPLIER], "Bills for September", 0, 12850),
    ], [
      { voucher_id: "v-1", voucher_no: "PV-2610-0012", supplier_id: "s-1", payee_name: LONG_SUPPLIER, voucher_date: soon(-1),
        purpose: "SUPPLIER_BILLS", narration: null, amount: 7200 },
      { voucher_id: "v-2", voucher_no: "PV-2610-0013", supplier_id: null, payee_name: "Tenaga Nasional Berhad", voucher_date: TODAY,
        purpose: "DIRECT", narration: "Electricity September, PJ Showroom", amount: 2400 },
    ]),
    money("1122", "Maybank", "BANK", 15000),
    money("1123", "Hong Leong", "BANK", -1200),
    money("1131", "GHL", "HOLDING", 3580, [
      bankLine(45, "CUSTOMER_PAYMENT", "OR-2610-0033", ["CUSTOMER", "LIM KUAN YANG"], "Card, 6 months instalment", 2150, 0),
      bankLine(46, "CARD_PAYOUT", "MM-20261002-0002", null, "Card settlement GHL 2 Oct 2026", 0, 3580),
    ]),
    money("1132", "AhaPay", "HOLDING", 0, [bankLine(47, "CUSTOMER_PAYMENT", "OR-2610-0034", ["CUSTOMER", "SITI AMINAH"], null, 899, 0)]),
    money("1133", "Online", "HOLDING", 0),
  ],
});

// ── Reports → Cash Flow (0638): the period's cash and bank money ────────────
const CASH_FLOW = (from: string, to: string) => ({
  from, to, go_live_on: GO_LIVE,
  accounts: [
    { account_code: "1110", name: "Cash in hand", money_kind: "CASH", is_active: true, opening: 1250, receipts: 2380, payments: 2000 },
    { account_code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true, opening: 48210.55, receipts: 61497.5, payments: 38850 },
    { account_code: "1122", name: "Maybank", money_kind: "BANK", is_active: true, opening: 15000, receipts: 0, payments: 0 },
  ],
  rows: [
    { side: "IN", account_code: "1210", name: "Trade receivables", kind: "ASSET", money_kind: null, amount: 55300 },
    { side: "IN", account_code: "1131", name: "GHL", kind: "ASSET", money_kind: "HOLDING", amount: 6197.5 },
    { side: "IN", account_code: "4900", name: "Other income", kind: "INCOME", money_kind: null, amount: 380 },
    { side: "IN", account_code: "1110", name: "Cash in hand", kind: "ASSET", money_kind: "CASH", amount: 2000 },
    { side: "OUT", account_code: "2110", name: "Trade payables", kind: "LIABILITY", money_kind: null, amount: 31250 },
    { side: "OUT", account_code: "6100", name: "Staff cost and commission", kind: "EXPENSE", money_kind: null, amount: 4200 },
    { side: "OUT", account_code: "6800", name: "Electricity and water, PJ Showroom and Carres Klang warehouse", kind: "EXPENSE", money_kind: null, amount: 3400 },
    { side: "OUT", account_code: "1121", name: "Public Bank", kind: "ASSET", money_kind: "BANK", amount: 2000 },
  ],
  card: { taken: 8350, waiting: 2152.5 },
});

// ── Ledger → General Ledger (0639): gl_account_ledger's rows per account ────
const glRow = (code: string, name: string, kind: string, over: Record<string, unknown>) => ({
  row_kind: "LINE", account_code: code, account_name: name, kind, entry_date: soon(-2), entry_no: null,
  source_type: null, source_doc_no: null, narration: null, memo: null, debit: null, credit: null, running_balance: 0, ...over,
});
const glBlock = (code: string, name: string, kind: string, opening: number,
  lines: Array<[string, string, string, string | null, number, number]>) => {
  const debitSide = kind === "ASSET" || kind === "EXPENSE";
  let bal = opening;
  const rows = [glRow(code, name, kind, { row_kind: "OPENING", entry_date: null, running_balance: opening })];
  for (const [entry, source, doc, memo, dr, cr] of lines) {
    bal = Math.round((bal + (debitSide ? dr - cr : cr - dr)) * 100) / 100;
    rows.push(glRow(code, name, kind, { entry_no: entry, source_type: source, source_doc_no: doc, memo, narration: "Posted",
      debit: dr, credit: cr, running_balance: bal }));
  }
  rows.push(glRow(code, name, kind, { row_kind: "CLOSING", entry_date: null, running_balance: bal }));
  return { account_code: code, rows };
};
const GENERAL_LEDGER = (from: string, to: string) => ({
  status: "OK", go_live_on: GO_LIVE, from, to,
  accounts: [
    glBlock("1121", "Public Bank", "ASSET", 48210.55, [
      ["JE-2610-0043", "CUSTOMER_PAYMENT", "OR-2610-0032", null, 6400, 0],
      ["JE-2610-0044", "PAYMENT_VOUCHER", "PV-2610-0011", "Bills for September, Ohana Furniture Manufacturing Industries", 0, 12850],
      ["JE-2610-0046", "CARD_PAYOUT", "MM-20261002-0002", null, 3500.5, 0],
    ]),
    glBlock("2110", "Trade payables", "LIABILITY", 31250, [
      ["JE-2610-0040", "SUPPLIER_BILL", "BILL-2610-0007", null, 0, 7200],
      ["JE-2610-0044", "PAYMENT_VOUCHER", "PV-2610-0011", null, 12850, 0],
    ]),
    glBlock("6800", "Electricity and water", "EXPENSE", 0, [["JE-2610-0047", "PAYMENT_VOUCHER", "PV-2610-0013", "Electricity September, PJ Showroom", 2400, 0]]),
  ],
});

// ── Payables → Credit Notes (0642) ──────────────────────────────────────────
const CREDIT_NOTES = [
  { id: "cn-1", note_no: "SCN-20261001-4821", status: "confirmed", supplier_id: "s-1", supplier_name: LONG_SUPPLIER,
    supplier_kind: "supplier", supplier_note_no: "OH-CN-2210", note_date: soon(-2), ap_account_code: "2110",
    total_amount: "1650.00", applied_total: "1000.00", credit_open: "650.00", file_count: 1, created_at: at(-2) },
  { id: "cn-2", note_no: "SCN-20260924-1187", status: "confirmed", supplier_id: "s-5", supplier_name: "Dorsettloft",
    supplier_kind: "supplier", supplier_note_no: "DL-CN-31", note_date: soon(-9), ap_account_code: "2110",
    total_amount: "420.00", applied_total: "420.00", credit_open: "0.00", file_count: 0, created_at: at(-9) },
  { id: "cn-3", note_no: null, status: "draft", supplier_id: "s-3", supplier_name: "Nice Future",
    supplier_kind: "supplier", supplier_note_no: "NF-RB-0930", note_date: soon(-1), ap_account_code: "2110",
    total_amount: "300.00", applied_total: null, credit_open: null, file_count: 0, created_at: at(-1) },
  { id: "cn-4", note_no: "SCN-20260912-0954", status: "cancelled", supplier_id: "s-2", supplier_name: "Hooka",
    supplier_kind: "supplier", supplier_note_no: "HK-CN-4", note_date: soon(-21), ap_account_code: "2110",
    total_amount: "90.00", applied_total: null, credit_open: null, file_count: 0, created_at: at(-21) },
];
const CREDIT_NOTE = {
  note: { id: "cn-1", note_no: "SCN-20261001-4821", status: "confirmed", supplier_id: "s-1", supplier_name: LONG_SUPPLIER,
    supplier_kind: "supplier", supplier_note_no: "OH-CN-2210", note_date: soon(-2), ap_account_code: "2110",
    ap_account_name: "Trade payables", total_amount: "1650.00", narration: "Two sofas returned damaged, and the September volume rebate",
    cancel_reason: null, created_at: at(-2), created_by_name: "Chew", confirmed_at: at(-2), confirmed_by_name: "Chew",
    cancelled_at: null, cancelled_by_name: null, entry_no: "JE-2610-0051", reversal_entry_no: null },
  lines: [
    { line_no: 1, account_code: "5100", account_name: "Cost of goods sold", description: "Two 3 seater sofas returned, damaged in transit",
      amount: "1400.00", department_type: "OFFICE", department_id: null },
    { line_no: 2, account_code: "4900", account_name: "Other income", description: "September volume rebate",
      amount: "250.00", department_type: "SUBSCRIPTION", department_id: null },
  ],
  applications: [
    { application_id: "ca-1", bill_id: "b-1", bill_no: "BILL-2609-0012", supplier_invoice_no: "OH-INV-88231", bill_date: soon(-9),
      amount: "1000.00", status: "applied", created_at: at(-1), applied_on: soon(-1), created_by_name: "Chew", cancelled_at: null, cancel_reason: null },
  ],
  files: [{ id: "f-1", file_name: "OH-CN-2210.pdf", mime_type: "application/pdf", size_bytes: 182000,
    storage_path: "SUPPLIER_CREDIT_NOTE/cn-1/OH-CN-2210.pdf", uploaded_at: at(-2), uploaded_by_name: "Chew" }],
  events: [
    { action: "created", note: null, at: at(-2), actor_name: "Chew" },
    { action: "confirmed", note: "SCN-20261001-4821", at: at(-2), actor_name: "Chew" },
    { action: "credit_applied", note: "BILL-2609-0012 · RM 1,000.00", at: at(-1), actor_name: "Chew" },
  ],
  applied_total: "1000.00", credit_open: "650.00", go_live_on: GO_LIVE,
  can: { edit: false, confirm: false, cancel: false, add_file: true, apply: true, take_off: true },
};
const AP_ACCOUNT_CHOICES = [
  { code: "2110", name: "Trade payables", kind: "LIABILITY", parent_code: "2100", is_control: true, control_for: "SUPPLIER",
    for_bill_line: false, for_voucher_line: false, for_ap: true, for_pay_from: false, for_credit_line: false },
  { code: "2120", name: "Other payables", kind: "LIABILITY", parent_code: "2100", is_control: true, control_for: "SUPPLIER",
    for_bill_line: false, for_voucher_line: false, for_ap: true, for_pay_from: false, for_credit_line: false },
  { code: "4900", name: "Other income", kind: "INCOME", parent_code: "4000", is_control: false, control_for: null,
    for_bill_line: false, for_voucher_line: false, for_ap: false, for_pay_from: false, for_credit_line: true },
  { code: "5100", name: "Cost of goods sold", kind: "EXPENSE", parent_code: "5000", is_control: false, control_for: null,
    for_bill_line: true, for_voucher_line: true, for_ap: false, for_pay_from: false, for_credit_line: true },
  { code: "6500", name: "Bank charges", kind: "EXPENSE", parent_code: "6000", is_control: false, control_for: null,
    for_bill_line: true, for_voucher_line: true, for_ap: false, for_pay_from: false, for_credit_line: true },
];
const BILL_OUTSTANDING = [
  { bill_id: "b-1", bill_no: "BILL-2609-0012", supplier_id: "s-1", supplier_name: LONG_SUPPLIER, supplier_invoice_no: "OH-INV-88231",
    bill_date: soon(-9), due_date: soon(21), po_id: null, total_amount: "18250.00", paid_total: "1000.00", balance_owing: "17250.00",
    go_live_on: GO_LIVE, ap_account_code: "2110", allocated_total: "1000.00", unallocated: "17250.00", supplier_kind: "supplier" },
  { bill_id: "b-2", bill_no: "BILL-2608-0007", supplier_id: "s-1", supplier_name: LONG_SUPPLIER, supplier_invoice_no: "OH-INV-87001",
    bill_date: soon(-40), due_date: soon(-10), po_id: null, total_amount: "15000.00", paid_total: "2000.00", balance_owing: "13000.00",
    go_live_on: GO_LIVE, ap_account_code: "2110", allocated_total: "2000.00", unallocated: "13000.00", supplier_kind: "supplier" },
];

// ── Reports → Stock value (0643): provisional, at a month end ───────────────
const STOCK_UNITS = [
  ...Array.from({ length: 14 }, (_, i) => ({ unit_code: `U2-${String(100 + i)}-001`, sku: i % 2 ? "MAT-QUEEN-PLUSH" : "SOFA-3S-OSLO-GREY",
    bucket: "warehouse", status: i % 3 ? "free" : "reserved", site_name: "Carres Klang", cost: i % 5 === 0 ? null : 480 + i * 35 })),
  ...Array.from({ length: 6 }, (_, i) => ({ unit_code: `U2-${String(200 + i)}-001`, sku: "SOFA-L-HARBOUR-OATMEAL",
    bucket: "showroom", status: "free", site_name: "PJ Showroom", cost: i < 4 ? null : 2150 })),
  { unit_code: "U2-300-001", sku: "BED-KING-WALNUT", bucket: "transit", status: "reserved", site_name: "AL Sungai Buloh", cost: 1290 },
  { unit_code: "U2-301-001", sku: "SOFA-3S-OSLO-GREY", bucket: "transit", status: "transferred", site_name: "Carres Klang", cost: 515 },
  { unit_code: "U2-400-001", sku: "SOFA-2S-DUNE-SAND", bucket: "repair", status: "transferred", site_name: "Carres Klang", cost: 990 },
].map((u, i) => ({
  id: `su-${i}`, unit_code: u.unit_code, sku: u.sku, qty: 1, scope: "unit", status: u.status, bucket: u.bucket,
  site_name: u.site_name, holder_name: null, po_no: u.cost === null ? null : `PO2609${String(10 + i)}-4827`,
  unit_cost: u.cost === null ? null : u.cost.toFixed(2), value: u.cost === null ? null : u.cost.toFixed(2),
}));
const STOCK_VALUE = (monthEnd: string) => ({
  month_end: monthEnd, cut_at: `${monthEnd}T16:00:00Z`, today: TODAY, provisional: true, units: STOCK_UNITS,
  left_out: { consignment_units: 3, consignment_qty: 3 },
});

// ── Reports → Collection (0644): deposit and balance per salesperson ────────
const SALESPEOPLE = [["s1", "NUR AISYAH BINTI KAMARUL ZAMAN"], ["s2", "Boon Keat"], ["s3", "Priya Raman"]] as const;
const COLLECTION_ORDERS = Array.from({ length: 18 }, (_, i) => {
  const [sid, sname] = SALESPEOPLE[i % 3]!;
  const value = 1800 + (i * 377) % 4200;
  const depositShare = [0.3, 0.5, 0.2, 0.6, 0.45, 1][i % 6]!;
  const delivered = i % 4 === 0 || i % 5 === 0;
  const deposit = Math.round(value * depositShare);
  return {
    id: `co-${i}`, so: 1500 + i, placed_on: soon(-25 + i), status: delivered ? "delivered" : "proceed_order",
    customer_name: i === 2 ? LONG_CUSTOMER : ["LIM KUAN YANG", "SITI AMINAH", "WONG MEI LING"][i % 3]!,
    salesperson_id: i === 17 ? null : sid, salesperson_name: i === 17 ? null : sname, channel: "showroom", dealer_name: "PJ Showroom",
    order_value: value.toFixed(2), deposit: deposit.toFixed(2),
    balance_paid: delivered ? Math.round((value - deposit) * (i % 2 ? 1 : 0.4)).toFixed(2) : "0.00",
    invoice_no: delivered ? `INV-2609-${String(100 + i)}` : null, billed: delivered ? value.toFixed(2) : null,
    issued_at: delivered ? soon(-3) : null, delivered,
  };
});

// ── Payables → Payment Requests (0645): staff ask Finance to pay ────────────
const PRQ_ROW = (i: number, over: Record<string, unknown>) => ({
  id: `prq-${i}`, request_no: `PRQ2610${String(10 + i).padStart(2, "0")}-${4821 + i}`, status: "submitted",
  requested_by: `u-${i % 3}`, requested_by_name: ["NUR AISYAH BINTI KAMARUL ZAMAN", "Boon Keat", "Priya Raman"][i % 3],
  payee_name: ["Bayview Properties", "Persatuan Penduduk Taman Bukit Indah Kota Damansara", "Quickfix Plumbing", "Tenaga Nasional Berhad"][i % 4],
  amount: (350 + i * 415).toFixed(2), pay_by: soon(3 + i), purpose: ["October rent, PJ showroom", "Booth at the Kota Damansara fair",
    "Pipe repair, Klang warehouse", "Electricity, September"][i % 4],
  note: null, bank_name: "Maybank", bank_account_no: "514012345678", bank_account_holder: "Bayview Properties Sdn Bhd",
  bill_no: `BV-${1000 + i}`, bill_date: soon(-2 - i), return_note: null, decided_at: null, decided_by_name: null,
  created_at: at(-i), updated_at: at(-i), file_count: 1, voucher: null, bill: null, ...over,
});
const PAYMENT_REQUESTS = [
  PRQ_ROW(0, {}),
  PRQ_ROW(1, {}),
  PRQ_ROW(2, { status: "answered", voucher: { id: "v-1", voucher_no: "PV261002-1187", status: "checked", voucher_date: soon(-1) } }),
  PRQ_ROW(3, { status: "answered", bill: { id: "b-1", bill_no: "BILL-2609-0016", status: "confirmed", total: "2400.00", paid: "0.00" } }),
  PRQ_ROW(4, { status: "returned", return_note: "Attach the official invoice, not the quotation", decided_by_name: "Chew" }),
  PRQ_ROW(5, { status: "answered", voucher: { id: "v-2", voucher_no: "PV260928-0954", status: "approved", voucher_date: soon(-5) } }),
];
const PAYMENT_REQUEST_DOC = {
  request: PAYMENT_REQUESTS[0],
  files: [{ id: "pf-1", file_name: "BV-1000 October rent.pdf", mime_type: "application/pdf", size_bytes: 182000,
    storage_path: "prq-0/f.pdf", uploaded_at: at(0), uploaded_by_name: "NUR AISYAH BINTI KAMARUL ZAMAN" }],
  events: [
    { action: "submitted", note: null, at: at(0), actor_name: "NUR AISYAH BINTI KAMARUL ZAMAN" },
    { action: "file_added", note: "BV-1000 October rent.pdf", at: at(0), actor_name: "NUR AISYAH BINTI KAMARUL ZAMAN" },
  ],
  finance: true,
  can: { edit: false, withdraw: false, add_file: true, return: true, answer: true },
};
const REQUEST_GRANTS = [
  { user_id: "u-0", name: "NUR AISYAH BINTI KAMARUL ZAMAN", role: "operation", allowed: true, granted_at: at(-30), granted_by_name: "Jess" },
  { user_id: "u-1", name: "Boon Keat", role: "operation", allowed: true, granted_at: at(-12), granted_by_name: "Jess" },
  { user_id: "u-2", name: "Priya Raman", role: "operation", allowed: false, granted_at: null, granted_by_name: null },
];

// ── Reports → AP Aging (0640): owed to suppliers on a day ───────────────────
const AP_AGING = (asAt: string) => ({
  as_at: asAt, go_live_on: GO_LIVE,
  controls: [{ account_code: "2110", name: "Trade payables", balance: 44350 }, { account_code: "2120", name: "Other payables", balance: 2400 }],
  suppliers: [
    { supplier_id: "s-1", name: LONG_SUPPLIER, kind: "factory_pickup", balance: 31250, bills: [
      { bill_id: "b-1", bill_no: "BILL-2609-0012", supplier_invoice_no: "OH-INV-88231", bill_date: soon(-9), due_date: soon(21), total: 18250, open: 18250 },
      { bill_id: "b-2", bill_no: "BILL-2608-0007", supplier_invoice_no: "OH-INV-87001", bill_date: soon(-40), due_date: soon(-10), total: 15000, open: 13000 },
    ] },
    { supplier_id: "s-2", name: "Lumen Sofa Works", kind: "factory_pickup", balance: 13100, bills: [
      { bill_id: "b-3", bill_no: "BILL-2606-0002", supplier_invoice_no: "LS-31", bill_date: soon(-110), due_date: null, total: 9800, open: 9800 },
      { bill_id: "b-4", bill_no: "BILL-2609-0015", supplier_invoice_no: "LS-77", bill_date: soon(-3), due_date: soon(27), total: 4000, open: 4000 },
    ] },
    { supplier_id: "s-3", name: "Tenaga Nasional Berhad", kind: "other_creditor", balance: 2400, bills: [
      { bill_id: "b-5", bill_no: "BILL-2609-0016", supplier_invoice_no: "TNB-0930", bill_date: soon(-2), due_date: soon(12), total: 2400, open: 2400 },
    ] },
  ],
});

// ── Forecast (0646): a plan on the live chart's accounts, and that month's
// Profit and Loss in the statement's own rows. Figures are invented.
const FORECAST_ACCOUNTS = ([
  ["4100", "Furniture sales", "income"], ["4200", "Rental income", "income"], ["4300", "Delivery income", "income"],
  ["4400", "Storage fee income", "income"], ["4900", "Other income", "income"],
  ["5100", "Cost of goods sold", "cost"], ["5200", "Inbound freight and duty", "cost"],
  ["6100", "Staff cost and commission", "expense"], ["6200", "Rent and utilities", "expense"],
  ["6300", "Outbound delivery and transport", "expense"], ["6400", "Service and warranty cost", "expense"],
  ["6500", "Bank and payment charges", "expense"], ["6900", "Office, marketing and general", "expense"],
] as const).map(([code, name, block]) => ({ code, name, kind: block === "income" ? "INCOME" : "EXPENSE", active: true, block }));
const FORECAST_PLAN = {
  "4100": { amount: 180000 }, "4200": { amount: 12000 }, "4300": { amount: 6000 }, "4400": { amount: 1500 },
  "5100": { share: 5500 }, "5200": { share: 400 },
  "6100": { amount: 28000 }, "6200": { amount: 15000 }, "6300": { share: 300 }, "6400": { share: 100 }, "6500": { share: 150 }, "6900": { amount: 6000 },
};
const monthBefore = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const FORECAST = (month: string) => ({
  month, accounts: FORECAST_ACCOUNTS, lines: FORECAST_PLAN, updated_at: at(-2), updated_by_name: "Chew",
  previous: { month: monthBefore(month), lines: FORECAST_PLAN }, planned_months: [monthBefore(month), month],
});
function forecastPl(from: string, to: string) {
  const common = { report_status: "OK", go_live_on: GO_LIVE, period_from: from, period_to: to };
  const actual: Record<string, number> = {
    "4100": 171250, "4200": 11400, "4300": 6350, "4400": 1180, "4900": 420,
    "5100": 96800, "5200": 7950, "6100": 29400, "6200": 15000, "6300": 6120, "6400": 1250, "6500": 2960, "6900": 4880,
  };
  const head = (b: string) => (b === "income" ? ["4000", "Income"] : b === "cost" ? ["5000", "Cost of sales"] : ["6000", "Operating expenses"]);
  const rows: Record<string, unknown>[] = [];
  let income = 0;
  let expense = 0;
  for (const section of ["INCOME", "EXPENSE"] as const) {
    for (const block of section === "INCOME" ? ["income"] : ["cost", "expense"]) {
      const [hc, hn] = head(block);
      let sub = 0;
      for (const a of FORECAST_ACCOUNTS.filter((x) => x.block === block)) {
        rows.push({ row_kind: "ACCOUNT", section, header_code: hc, header_name: hn, account_code: a.code, account_name: a.name, amount: actual[a.code] });
        sub += actual[a.code]!;
      }
      rows.push({ row_kind: "HEADER_SUBTOTAL", section, header_code: hc, header_name: hn, amount: sub });
      if (section === "INCOME") income += sub; else expense += sub;
    }
    rows.push({ row_kind: "SECTION_TOTAL", section, amount: section === "INCOME" ? income : expense });
  }
  rows.push({ row_kind: "NET", section: "NET", amount: income - expense });
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
  if (url.includes("/api/finance/payment-requests/me")) return json({ may_request: true, finance: true, boss: true });
  if (url.includes("/api/finance/payment-requests/grants")) return json({ rows: REQUEST_GRANTS });
  if (url.includes("/api/finance/payment-requests/prq-")) return json(PAYMENT_REQUEST_DOC);
  if (url.includes("/api/finance/payment-requests")) return json({ rows: PAYMENT_REQUESTS });
  if (url.includes("/api/finance/payables/bills")) return json({ rows: BILLS });
  if (url.includes("/api/finance/payables/vouchers")) return json({ rows: VOUCHERS });
  if (url.includes("/api/finance/payables/outstanding")) return json({ rows: OUTSTANDING });
  if (url.includes("/api/finance/payables/bill-outstanding")) return json({ rows: BILL_OUTSTANDING });
  if (url.includes("/api/finance/payables/credit-notes/cn-1")) return json(CREDIT_NOTE);
  if (url.includes("/api/finance/payables/credit-notes")) return json({ rows: CREDIT_NOTES });
  if (url.includes("/api/finance/payables/accounts")) return json({ rows: AP_ACCOUNT_CHOICES });
  if (url.includes("/api/finance/ledger/departments"))
    return json({ rows: [{ department_type: "SUBSCRIPTION", department_id: null, name: "Subscription" },
      { department_type: "OFFICE", department_id: null, name: "Office" }] });
  if (url.includes("/api/finance/payables/suppliers"))
    return json({ rows: OUTSTANDING.map((o) => ({ id: o.supplier_id, name: o.supplier_name, kind: o.supplier_kind })) });
  if (url.includes("/api/finance/payables/supplier-finance")) return json({ rows: SUPPLIER_FINANCE });
  if (url.includes("/api/finance/payables/aging")) return json(AP_AGING(q.get("asAt") ?? TODAY));
  if (url.includes("/api/finance/payables/")) return json({ rows: [] });
  if (url.includes("/api/finance/ledger/daily-bank")) return json(DAILY_BANK(q.get("day") ?? TODAY));
  if (url.includes("/api/finance/ledger/cash-flow")) return json(CASH_FLOW(q.get("from") ?? TODAY, q.get("to") ?? TODAY));
  if (url.includes("/api/finance/ledger/general-ledger")) return json(GENERAL_LEDGER(q.get("from") ?? TODAY, q.get("to") ?? TODAY));
  if (url.includes("/api/finance/ledger/stock-value")) return json(STOCK_VALUE(q.get("monthEnd") ?? TODAY));
  if (url.includes("/api/finance/ledger/collection"))
    return json({ from: q.get("from") ?? TODAY, to: q.get("to") ?? TODAY, orders: COLLECTION_ORDERS });
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
  if (url.includes("/api/finance/ledger/forecast")) return json(FORECAST(q.get("month") ?? TODAY.slice(0, 7)));
  if (url.includes("/api/finance/ledger/profit-and-loss")) {
    return json((PAGE.startsWith("forecast") ? forecastPl : plRows)(q.get("from") ?? "", q.get("to") ?? ""));
  }
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
  suppliers: "/finance/suppliers",
  "daily-bank": "/finance/daily-bank",
  "other-debtors": "/finance/other-debtors",
  "other-debtor-parties": "/finance/other-debtors?view=parties",
  "other-receipts": "/finance/other-receipts",
  journal: "/finance/ledger",
  "trial-balance": "/finance/ledger/trial-balance",
  reports: "/finance/reports",
  "cash-flow": "/finance/reports/cash-flow",
  "general-ledger": "/finance/ledger/general-ledger",
  "ap-aging": "/finance/reports/ap-aging",
  "credit-notes": "/finance/credit-notes",
  "credit-note": "/finance/credit-notes/cn-1",
  "credit-note-new": "/finance/credit-notes/new",
  "stock-value": "/finance/reports/stock-value",
  collection: "/finance/reports/collection",
  "payment-requests": "/finance/payment-requests",
  "payment-request": "/finance/payment-requests/prq-0",
  "payment-request-new": "/finance/payment-requests/new",
  "request-access": "/finance/settings?tab=requests",
  forecast: `/finance/reports/forecast?month=${monthBefore(TODAY.slice(0, 7))}`,
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
