import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupplierBills, { lineAmount } from "./SupplierBills";
import PaymentVouchers, { voucherTotal } from "./PaymentVouchers";
import ApOutstanding from "./ApOutstanding";
import { money, priceDiffWord, refusal, word, VOUCHER_STATUS_WORD } from "./payables-words";

/* Every read and write goes through apiFetch; the mock answers by URL, and
   records the writes so a test can read the exact payload the page sent.
   Names are invented. */
const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; method: string; body: unknown }>,
  fail: new Set<string>(),
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    api.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    const path = url.replace(/\?.*$/, "");
    if (api.fail.has(path)) throw Object.assign(new Error("boom"), { status: 500, body: {} });
    if (method !== "GET") return { id: "33333333-3333-4333-8333-333333333333" };
    if (!(path in api.routes)) throw new Error(`unexpected read ${url}`);
    return api.routes[path];
  }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/supabase", () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) => sel({ user: { id: "u1" }, role: "finance" }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const B = "/api/finance/payables";
const SUP = "11111111-1111-4111-8111-111111111111";
const LANDLORD = "44444444-4444-4444-8444-444444444444";
const GRN = "55555555-5555-4555-8555-555555555555";
const POL1 = "66666666-6666-4666-8666-666666666661";
const POL2 = "66666666-6666-4666-8666-666666666662";
const BILL1 = "77777777-7777-4777-8777-777777777771";
const BILL2 = "77777777-7777-4777-8777-777777777772";
const PV = "88888888-8888-4888-8888-888888888888";

const suppliers = { rows: [
  { id: SUP, name: "Lumen Sofa Works", kind: "supplier" },
  { id: LANDLORD, name: "Bayview Properties", kind: "other_creditor" },
] };
const accounts = { rows: [
  { code: "1110", name: "Cash in hand", kind: "ASSET", parent_code: "1100", is_control: false, control_for: null,
    for_bill_line: false, for_voucher_line: false, for_ap: false, for_pay_from: true },
  { code: "1120", name: "Bank", kind: "ASSET", parent_code: "1100", is_control: false, control_for: null,
    for_bill_line: false, for_voucher_line: false, for_ap: false, for_pay_from: true },
  { code: "2110", name: "Trade payables", kind: "LIABILITY", parent_code: "2100", is_control: true, control_for: "AP",
    for_bill_line: false, for_voucher_line: false, for_ap: true, for_pay_from: false },
  { code: "5100", name: "Cost of goods sold", kind: "EXPENSE", parent_code: "5000", is_control: false, control_for: null,
    for_bill_line: true, for_voucher_line: true, for_ap: false, for_pay_from: false },
  { code: "6500", name: "Bank charges", kind: "EXPENSE", parent_code: "6000", is_control: false, control_for: null,
    for_bill_line: true, for_voucher_line: true, for_ap: false, for_pay_from: false },
] };
// The one money-account list (0512) — what Paid from and Received into offer.
const MONEY = "/api/finance/ledger/money-accounts";
const moneyAccounts = [
  { code: "1110", name: "Cash in hand", money_kind: "CASH", is_active: true },
  { code: "1120", name: "Bank", money_kind: "BANK", is_active: true },
  { code: "1121", name: "Public Bank", money_kind: "BANK", is_active: true },
  { code: "1123", name: "Hong Leong", money_kind: "BANK", is_active: false },
  { code: "1131", name: "GHL", money_kind: "HOLDING", is_active: true },
];

// 0540: the department list every line picker reads.
const OUTLET = "99999999-9999-4999-8999-999999999991";
const departments = { rows: [
  { department_type: "SHOWROOM", department_id: OUTLET, name: "Bangsar showroom" },
  { department_type: "SUBSCRIPTION", department_id: null, name: "Subscription" },
  { department_type: "OFFICE", department_id: null, name: "Office" },
] };
async function pickDept(label: string, value: string) {
  await screen.findAllByRole("option", { name: "Office" });
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function billRow(over: Record<string, unknown>) {
  return {
    id: BILL1, bill_no: "BILL-4XK2", status: "confirmed", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: null,
    po_id: "PO-3001", grn_nos: "GRN-A1", ap_account_code: "2110", total_amount: "1025.00", paid_total: "0.00",
    unpaid: "1025.00", price_flags: 1, file_count: 2, created_at: "2026-09-10T01:00:00Z", ...over,
  };
}

function voucherDoc(over: {
  status: string; can: Record<string, boolean>; you_prepared?: boolean; advance?: unknown; advance_amount?: string;
}) {
  return {
    voucher: {
      id: PV, voucher_no: "PV-9M3Q", status: over.status, purpose: "SUPPLIER_BILLS", supplier_id: SUP,
      supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", payee_name: "Lumen Sofa Works",
      voucher_date: "2026-09-11", amount: "1225.00", advance_amount: over.advance_amount ?? "0.00",
      ap_account_code: "2110", ap_account_name: "Trade payables", pay_method: "BANK_TRANSFER", pay_reference: "TRX-1",
      pay_from_account_code: "1120", pay_from_name: "Bank", narration: null, created_at: "2026-09-11T01:00:00Z",
      created_by_name: "Aina", prepared_at: "2026-09-11T02:00:00Z", prepared_by_name: "Aina",
      checked_at: over.status === "checked" ? "2026-09-11T03:00:00Z" : null,
      checked_by_name: over.status === "checked" ? "Boon" : null,
      approved_at: null, approved_by_name: null, rejected_at: null, rejected_by_name: null, reject_reason: null,
      cancelled_at: null, cancelled_by_name: null, cancel_reason: null, entry_no: null, reversal_entry_no: null,
    },
    lines: [],
    allocations: [
      { bill_id: BILL1, bill_no: "BILL-4XK2", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: null,
        bill_total: "1025.00", ap_account_code: "2110", amount_applied: "1025.00" },
      { bill_id: BILL2, bill_no: "BILL-8PZ7", supplier_invoice_no: "LSW-902", bill_date: "2026-09-10", due_date: null,
        bill_total: "200.00", ap_account_code: "2110", amount_applied: "200.00" },
    ],
    files: [], events: [{ action: "prepared", note: null, at: "2026-09-11T02:00:00Z", actor_name: "Aina" }],
    advance: over.advance ?? null,
    go_live_on: "2026-09-10", you_prepared: over.you_prepared ?? false,
    can: { edit: false, prepare: false, check: false, approve: false, reject: false, cancel: false, add_file: true,
      apply_advance: false, take_advance_off: false, money_back: false, cancel_money_back: false, ...over.can },
  };
}

beforeEach(() => {
  api.calls.length = 0;
  api.fail.clear();
  api.routes = {
    [`${B}/suppliers`]: suppliers,
    [`${B}/accounts`]: accounts,
    [MONEY]: moneyAccounts,
    // AutoCount-shaped roles: the form names the usual accounts from these.
    "/api/finance/ledger/accounts": {
      go_live_on: "2026-09-01",
      accounts: [
        { code: "400-0000", name: "TRADE CREDITORS", kind: "LIABILITY", parent_code: null, is_control: true, control_for: "AP", is_active: true, is_header: false, sort_order: 0 },
        { code: "405-0000", name: "OTHER CREDITORS", kind: "LIABILITY", parent_code: null, is_control: true, control_for: "AP", is_active: true, is_header: false, sort_order: 0 },
        { code: "610-0000", name: "PURCHASES", kind: "EXPENSE", parent_code: null, is_control: false, control_for: null, is_active: true, is_header: false, sort_order: 0 },
      ],
      roles: { TRADE_PAYABLE: "400-0000", OTHER_PAYABLE: "405-0000", COST_OF_GOODS_SOLD: "610-0000" },
    },
    ["/api/finance/ledger/departments"]: departments,
    [`${B}/bills`]: { rows: [billRow({}), billRow({ id: BILL2, bill_no: null, status: "draft", unpaid: null,
      supplier_invoice_no: "LSW-902", total_amount: "200.00", price_flags: 0, file_count: 0 })] },
    [`${B}/bills/grn-candidates`]: { rows: [{ receipt_id: GRN, grn_no: "GRN-A1", po_id: "PO-3001", supplier_id: SUP,
      supplier_name: "Lumen Sofa Works", received_on: "2026-09-10", posted_at: null, open_lines: 2, open_qty: "3",
      open_value_at_po_cost: "1020.00" }] },
    [`${B}/bills/grn-lines/${GRN}`]: { rows: [
      { receipt_id: GRN, grn_no: "GRN-A1", po_id: "PO-3001", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
        po_line_id: POL1, sku: "SOFA-3S", received_qty: "1", billed_qty: "0", open_qty: "1", po_unit_cost: "520.00",
        commercial_treatment: null, department_type: "SHOWROOM", department_id: OUTLET },
      { receipt_id: GRN, grn_no: "GRN-A1", po_id: "PO-3001", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
        po_line_id: POL2, sku: "STOOL-1", received_qty: "2", billed_qty: "0", open_qty: "2", po_unit_cost: "250.00",
        commercial_treatment: null },
    ] },
    [`${B}/bill-outstanding`]: { rows: [
      { bill_id: BILL1, bill_no: "BILL-4XK2", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
        supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: null, po_id: "PO-3001",
        total_amount: "1025.00", paid_total: "0.00", balance_owing: "1025.00", go_live_on: "2026-09-10",
        ap_account_code: "2110", allocated_total: "0.00", unallocated: "1025.00", supplier_kind: "supplier" },
      { bill_id: BILL2, bill_no: "BILL-8PZ7", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
        supplier_invoice_no: "LSW-902", bill_date: "2026-09-10", due_date: null, po_id: null,
        total_amount: "200.00", paid_total: "0.00", balance_owing: "200.00", go_live_on: "2026-09-10",
        ap_account_code: "2110", allocated_total: "0.00", unallocated: "200.00", supplier_kind: "supplier" },
    ] },
    [`${B}/outstanding`]: { rows: [
      { supplier_id: SUP, supplier_name: "Lumen Sofa Works", bills_confirmed: 2, billed_total: "1225.00",
        allocated_total: "1025.00", paid_total: "0.00", balance_owing: "1225.00", uncommitted: "200.00",
        oldest_confirmed_bill_date: "2026-09-10", go_live_on: "2026-09-10", supplier_kind: "supplier",
        open_bills: 2, oldest_unpaid_bill_date: "2026-09-10", advance_open: "300.00", net_owing: "925.00" },
    ] },
    [`${B}/advances`]: { rows: [
      { voucher_id: PV, voucher_no: "PV-9M3Q", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
        supplier_kind: "supplier", voucher_date: "2026-09-11", ap_account_code: "2110", advance_amount: "500.00",
        applied_total: "200.00", money_back_total: "0.00", advance_open: "300.00" },
    ] },
    [`${B}/vouchers`]: { rows: [] },
  };
  localStorage.clear();
});

function show(at: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path="/finance/bills/*" element={<SupplierBills />} />
          <Route path="/finance/payment-vouchers/*" element={<PaymentVouchers />} />
          <Route path="/finance/ap-outstanding" element={<ApOutstanding />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () => api.calls.filter((c) => c.method !== "GET");

describe("Bills register", () => {
  it("lists bills in words, with the unpaid total in the footer", async () => {
    show("/finance/bills");
    await screen.findByText("BILL-4XK2");
    expect(screen.getByText("Draft, no number yet")).toBeInTheDocument();
    expect(screen.getByText("1 line differs from PO")).toBeInTheDocument();
    expect(screen.getByText("Not confirmed")).toBeInTheDocument();
    expect(screen.queryByText("confirmed")).not.toBeInTheDocument();
    expect(screen.getByTestId("bills-summary")).toHaveTextContent("2 bills · RM 1,025.00 unpaid");
    expect(screen.getByTestId("new-bill")).toHaveTextContent("+ New Bill");
    expect(within(screen.getByTestId("payables-switch")).getByRole("link", { name: "Payment Vouchers" }))
      .toHaveAttribute("href", "/finance/payment-vouchers");
  });

  it("says a failed read failed — never an empty register", async () => {
    api.fail.add(`${B}/bills`);
    show("/finance/bills");
    expect(await screen.findByRole("alert")).toHaveTextContent("Bills could not be loaded");
  });
});

describe("Payment vouchers register", () => {
  it("the voucher number is a blue link, not plain text", async () => {
    api.routes[`${B}/vouchers`] = { rows: [{ id: PV, voucher_no: "PV-9M3Q", status: "approved", purpose: "SUPPLIER_BILLS",
      supplier_id: SUP, supplier_name: "Lumen Sofa Works", payee_name: "Lumen Sofa Works", voucher_date: "2026-09-11",
      amount: "1225.00", pay_method: "BANK_TRANSFER", pay_reference: null, pay_from_account_code: "1120",
      pay_from_name: "Bank", bill_nos: "BILL-4XK2", line_count: 0, prepared_by_name: "Aina", checked_by_name: "Boon",
      approved_by_name: "Dina", file_count: 0, created_at: "2026-09-11T01:00:00Z", advance_amount: "0.00",
      advance_open: null }] };
    show("/finance/payment-vouchers");
    expect(await screen.findByRole("link", { name: "PV-9M3Q" })).toHaveClass("text-kit-blue-11");
  });
});

describe("Bill form — Convert GRN to bill", () => {
  it("fills the lines from the GRN at the PO price, flags a changed price, and saves the GRN link", async () => {
    show("/finance/bills/new");
    fireEvent.click(await screen.findByTestId("convert-grn"));
    fireEvent.click(await screen.findByRole("button", { name: "Use this GRN" }));

    await waitFor(() => expect(screen.getByLabelText("Line 1 qty")).toHaveValue("1"));
    // The usual accounts are named from the chart's roles, never a number the page knows.
    await waitFor(() => expect(screen.getByLabelText("Line 1 account").querySelector("option")).toHaveTextContent("610-0000 PURCHASES (usual)"));
    expect(screen.getByLabelText("Payables account").querySelector("option")).toHaveTextContent("400-0000 TRADE CREDITORS (usual)");
    expect(screen.getByLabelText("Line 1 unit price")).toHaveValue("520.00");
    expect(screen.getByLabelText("Line 2 qty")).toHaveValue("2");
    expect(screen.getByTestId("line-1-price-check")).toHaveTextContent("Same as PO price");
    // The supplier came across with the GRN.
    expect(screen.getByLabelText("Supplier")).toHaveValue(SUP);

    // The supplier's invoice says 525 — flagged, not blocked.
    fireEvent.change(screen.getByLabelText("Line 1 unit price"), { target: { value: "525" } });
    expect(screen.getByTestId("line-1-price-check")).toHaveTextContent("RM 5.00 above PO price");
    expect(screen.getByTestId("bill-form-total")).toHaveTextContent("RM 1,025.00");

    fireEvent.change(screen.getByLabelText("Supplier invoice No"), { target: { value: "LSW-901" } });
    // Line 1 took its department from the PO's sales order (DEPT-6); line 2 is picked.
    expect(screen.getByLabelText("Line 1 department")).toHaveValue(`SHOWROOM:${OUTLET}`);
    await pickDept("Line 2 department", "OFFICE");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const w = writes()[0]!;
    expect(w).toMatchObject({ url: `${B}/bills`, method: "POST" });
    expect(w.body).toMatchObject({
      supplierId: SUP,
      supplierInvoiceNo: "LSW-901",
      lines: [
        { warehouseReceiptId: GRN, poLineId: POL1, qty: 1, unitPrice: 525, departmentType: "SHOWROOM", departmentId: OUTLET },
        { warehouseReceiptId: GRN, poLineId: POL2, qty: 2, unitPrice: 250, departmentType: "OFFICE", departmentId: null },
      ],
    });
    // The database computes a GRN line's amount; the page never sends one.
    for (const l of (w.body as { lines: Array<Record<string, unknown>> }).lines) expect(l).not.toHaveProperty("amount");
  });

  it("fills the due date from the supplier's terms, then the PO's, and keeps a typed one (0530)", async () => {
    api.routes[`${B}/suppliers`] = { rows: [
      { id: SUP, name: "Lumen Sofa Works", kind: "supplier", terms_days: 30 },
    ] };
    const grn = api.routes[`${B}/bills/grn-candidates`] as { rows: Array<Record<string, unknown>> };
    api.routes[`${B}/bills/grn-candidates`] = { rows: grn.rows.map((r) => ({ ...r, po_terms_days: 14 })) };
    show("/finance/bills/new");
    await screen.findByRole("option", { name: "Lumen Sofa Works" });
    fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: SUP } });
    fireEvent.change(screen.getByLabelText("Bill date"), { target: { value: "2026-09-10" } });
    await waitFor(() => expect(screen.getByLabelText("Due date")).toHaveValue("2026-10-10"));
    expect(screen.getByTestId("due-from-terms")).toHaveTextContent("from the supplier's terms");

    fireEvent.click(screen.getByTestId("convert-grn"));
    fireEvent.click(await screen.findByRole("button", { name: "Use this GRN" }));
    await waitFor(() => expect(screen.getByLabelText("Due date")).toHaveValue("2026-09-24"));
    expect(screen.getByTestId("due-from-terms")).toHaveTextContent("from the PO's terms");

    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-09-30" } });
    fireEvent.change(screen.getByLabelText("Bill date"), { target: { value: "2026-09-11" } });
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-09-30");
    expect(screen.queryByTestId("due-from-terms")).toBeNull();
  });

  it("leaves the due date empty when no terms are set (0530)", async () => {
    show("/finance/bills/new");
    await screen.findByRole("option", { name: "Lumen Sofa Works" });
    fireEvent.change(screen.getByLabelText("Supplier"), { target: { value: SUP } });
    expect(screen.getByLabelText("Due date")).toHaveValue("");
  });

  it("a typed line for an other creditor sends the account and the amount", async () => {
    show(`/finance/bills/new?supplier=${LANDLORD}`);
    await waitFor(() => expect(screen.getByLabelText("Supplier")).toHaveValue(LANDLORD));
    await waitFor(() => expect(screen.getByLabelText("Payables account").querySelector("option")).toHaveTextContent("405-0000 OTHER CREDITORS (usual)"));
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "August rent" } });
    fireEvent.change(screen.getByLabelText("Line 1 account"), { target: { value: "6500" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Supplier invoice No"), { target: { value: "RENT-08" } });
    fireEvent.change(screen.getByLabelText("Bill date"), { target: { value: "2026-08-15" } });
    await pickDept("Line 1 department", "OFFICE");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toMatchObject({
      supplierId: LANDLORD, billDate: "2026-08-15",
      lines: [{ accountCode: "6500", description: "August rent", amount: 3000, qty: null, unitPrice: null }],
    });
  });
});

describe("Payment voucher form", () => {
  it("pays two bills plus a bank charge; the total is added up, never typed", async () => {
    show(`/finance/payment-vouchers/new?supplier=${SUP}`);
    fireEvent.click(await screen.findByLabelText("Pay BILL-4XK2"));
    fireEvent.click(screen.getByLabelText("Pay BILL-8PZ7"));
    expect(screen.getByLabelText("Amount for BILL-4XK2")).toHaveValue("1025");
    expect(screen.getByTestId("voucher-form-total")).toHaveTextContent("RM 1,225.00");

    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.change(screen.getByLabelText("Line 1 account"), { target: { value: "6500" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "1" } });
    await pickDept("Line 1 department", "SUBSCRIPTION");
    expect(screen.getByTestId("voucher-form-total")).toHaveTextContent("RM 1,226.00");

    // The bill's price check shows where Finance ticks it (P2P-4).
    expect(await screen.findByTestId(`price-check-${BILL1}`)).toHaveTextContent("1 line differs from PO");

    fireEvent.change(screen.getByLabelText("Paid from"), { target: { value: "1120" } });
    // 0536: a line without a description cannot be saved.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "Transfer fee" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const w = writes()[0]!;
    expect(w).toMatchObject({ url: `${B}/vouchers`, method: "POST" });
    expect(w.body).toMatchObject({
      purpose: "SUPPLIER_BILLS", supplierId: SUP, payFromAccountCode: "1120", payMethod: "BANK_TRANSFER",
      allocations: [{ billId: BILL1, amount: 1025 }, { billId: BILL2, amount: 200 }],
      lines: [{ accountCode: "6500", description: "Transfer fee", amount: 1, departmentType: "SUBSCRIPTION", departmentId: null }],
    });
    expect(w.body).not.toHaveProperty("amount");
    expect(w.body).toMatchObject({ advanceAmount: 0 });
  });

  it("Paid from offers cash and banks in use, never a holding account (0512)", async () => {
    show("/finance/payment-vouchers/new");
    const paidFrom = await screen.findByLabelText("Paid from");
    await waitFor(() => expect(within(paidFrom).getAllByRole("option")).toHaveLength(4));
    const offered = within(paidFrom).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(offered).toEqual(["", "1110", "1120", "1121"]);
    expect(paidFrom.closest("div.grid")).toHaveClass("grid", "grid-cols-1", "md:grid-cols-2", "gap-4");
  });

  it("an advance before the bill needs no bill ticked, and is sent as advanceAmount (0484)", async () => {
    show(`/finance/payment-vouchers/new?supplier=${SUP}`);
    fireEvent.change(await screen.findByLabelText("Advance"), { target: { value: "500" } });
    expect(screen.getByTestId("voucher-form-total")).toHaveTextContent("RM 500.00");
    fireEvent.change(screen.getByLabelText("Paid from"), { target: { value: "1120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toMatchObject({ purpose: "SUPPLIER_BILLS", supplierId: SUP, advanceAmount: 500, allocations: [] });
  });

  it("a direct payment sends lines and no bills", async () => {
    show("/finance/payment-vouchers/new");
    fireEvent.change(await screen.findByLabelText("Purpose"), { target: { value: "DIRECT" } });
    expect(screen.queryByText("Bills to pay")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Payee"), { target: { value: "Quickfix Plumbing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.change(screen.getByLabelText("Line 1 account"), { target: { value: "6500" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "150" } });
    await pickDept("Line 1 department", "OFFICE");
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "Pipe repair" } });
    fireEvent.change(screen.getByLabelText("Paid from"), { target: { value: "1110" } });
    fireEvent.change(screen.getByLabelText("Method"), { target: { value: "CASH" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]!.body).toMatchObject({
      purpose: "DIRECT", supplierId: null, payeeName: "Quickfix Plumbing", payFromAccountCode: "1110",
      payMethod: "CASH", allocations: [], lines: [{ accountCode: "6500", amount: 150 }],
    });
  });
});

describe("Payment voucher detail", () => {
  it("offers exactly the step the database allows — Approve payment — and posts it", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "checked", can: { approve: true, reject: true } });
    show(`/finance/payment-vouchers/${PV}`);
    await screen.findByTestId("voucher-amount");
    expect(screen.getByTestId("voucher-status")).toHaveTextContent("Checked");
    expect(screen.queryByRole("button", { name: "Prepare voucher" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check voucher" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to draft" })).toBeInTheDocument();
    expect(screen.getByTestId("voucher-bills")).toHaveTextContent("BILL-8PZ7");
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Approve payment" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Approve paying RM 1,225.00 to Lumen Sofa Works from 1120 Bank");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve payment" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: `${B}/vouchers/${PV}/approve`, method: "POST" });
  });

  it("tells the preparer someone else checks it, and offers them no step", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "prepared", can: { reject: true }, you_prepared: true });
    show(`/finance/payment-vouchers/${PV}`);
    expect(await screen.findByTestId("voucher-self-note"))
      .toHaveTextContent("You prepared this voucher, so someone else checks and approves it.");
    expect(screen.queryByRole("button", { name: "Check voucher" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve payment" })).not.toBeInTheDocument();
  });

  it("cancelling an approved voucher needs a reason and sends it", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "approved", can: { cancel: true } });
    show(`/finance/payment-vouchers/${PV}`);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel voucher" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("The ledger entry is reversed on");
    const go = within(dialog).getByRole("button", { name: "Cancel voucher" });
    expect(go).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Paid twice" } });
    fireEvent.click(go);
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: `${B}/vouchers/${PV}/cancel`, body: { reason: "Paid twice" } });
  });
});

const APP = "99999999-9999-4999-8999-999999999991";
const MB = "99999999-9999-4999-8999-999999999992";
const advanceOf = () => ({
  advance_amount: "500.00", applied_total: "200.00", money_back_total: "0.00", advance_open: "300.00",
  applications: [{ id: APP, bill_id: BILL1, bill_no: "BILL-4XK2", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10",
    amount: "200.00", status: "applied", created_at: "2026-09-12T01:00:00Z", created_by_name: "Aina",
    cancelled_at: null, cancelled_by_name: null, cancel_reason: null },
  { id: "99999999-9999-4999-8999-999999999993", bill_id: BILL2, bill_no: "BILL-8PZ7", supplier_invoice_no: "LSW-902",
    bill_date: "2026-09-10", amount: "100.00", status: "cancelled", created_at: "2026-09-11T05:00:00Z",
    created_by_name: "Aina", cancelled_at: "2026-09-11T06:00:00Z", cancelled_by_name: "Boon",
    cancel_reason: "Supplier sent a new invoice" }],
  money_back: [{ id: MB, money_back_no: "SMB-20260912-4821", money_back_date: "2026-09-12", money_account_code: "1120",
    money_account_name: "Bank", amount: "50.00", reference: null, narration: null, status: "posted", entry_no: "JE-1",
    reversal_entry_no: null, created_at: "2026-09-12T02:00:00Z", created_by_name: "Aina", voided_at: null,
    voided_by_name: null, void_reason: null }],
});

describe("Supplier advance (0484–0485)", () => {
  it("the voucher shows what is left of the advance, and applies it to a bill", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "approved", advance_amount: "500.00",
      advance: advanceOf(), can: { apply_advance: true, take_advance_off: true, money_back: true } });
    show(`/finance/payment-vouchers/${PV}`);
    expect(await screen.findByTestId("voucher-advance-left")).toHaveTextContent("RM 300.00");
    const appRows = within(screen.getByTestId("voucher-advance-applications")).getAllByRole("row");
    // Row 0 is the header ("Applied" is also a column title there).
    expect(appRows[1]!).toHaveTextContent("BILL-4XK2");
    expect(within(appRows[1]!).getByText("Applied")).toBeInTheDocument();
    expect(within(appRows[1]!).getByRole("button", { name: "Take advance off" })).toBeInTheDocument();
    expect(appRows[2]!).toHaveTextContent("Taken off — Supplier sent a new invoice");
    expect(within(appRows[2]!).queryByRole("button", { name: "Take advance off" })).not.toBeInTheDocument();
    expect(screen.getByTestId("voucher-money-back")).toHaveTextContent("SMB-20260912-4821");
    // An approver-only step is not offered to this person.
    expect(screen.queryByRole("button", { name: "Cancel money back" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply advance" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Bill"), { target: { value: BILL1 } });
    // Defaults to the smaller of what is left of the advance and of the bill.
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("300");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply advance" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: `${B}/vouchers/${PV}/advance-applications`,
      body: { billId: BILL1, amount: 300 } });
  });

  it("taking an advance off needs a reason", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "approved", advance_amount: "500.00",
      advance: advanceOf(), can: { take_advance_off: true } });
    show(`/finance/payment-vouchers/${PV}`);
    fireEvent.click((await screen.findAllByRole("button", { name: "Take advance off" }))[0]!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason"), { target: { value: "Wrong bill" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Take advance off" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: `${B}/advance-applications/${APP}/cancel`, body: { reason: "Wrong bill" } });
  });

  it("money back names the account it came into and carries a key against a double press", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "approved", advance_amount: "500.00",
      advance: advanceOf(), can: { money_back: true } });
    show(`/finance/payment-vouchers/${PV}`);
    fireEvent.click(await screen.findByRole("button", { name: "Record money back" }));
    const dialog = await screen.findByRole("dialog");
    const go = within(dialog).getByRole("button", { name: "Record money back" });
    expect(go).toBeDisabled();
    const into = await within(dialog).findByLabelText("Received into");
    // Money back may come into a holding account (a card refund); never one out of use.
    expect(within(into).getAllByRole("option").map((o) => (o as HTMLOptionElement).value))
      .toEqual(["", "1110", "1120", "1121", "1131"]);
    fireEvent.change(into, { target: { value: "1120" } });
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "301" } });
    expect(dialog).toHaveTextContent("More than the advance left");
    expect(go).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "120" } });
    // The first press fails; a press with a changed amount must not reuse its key.
    api.fail.add(`${B}/vouchers/${PV}/money-back`);
    fireEvent.click(go);
    await waitFor(() => expect(writes()).toHaveLength(1));
    const first = writes()[0]!;
    expect(first).toMatchObject({ url: `${B}/vouchers/${PV}/money-back`, body: { moneyAccountCode: "1120", amount: 120 } });
    const key1 = (first.body as { idempotencyKey: string }).idempotencyKey;
    expect(key1).toMatch(/^[0-9a-f-]{36}$/);

    api.fail.clear();
    fireEvent.change(within(dialog).getByLabelText("Amount"), { target: { value: "110" } });
    await waitFor(() => expect(go).not.toBeDisabled());
    fireEvent.click(go);
    await waitFor(() => expect(writes()).toHaveLength(2));
    const second = writes()[1]!;
    expect(second.body).toMatchObject({ amount: 110 });
    expect((second.body as { idempotencyKey: string }).idempotencyKey).not.toBe(key1);
  });

  it("money back never offers an empty account list while the accounts load or fail", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "approved", advance_amount: "500.00",
      advance: advanceOf(), can: { money_back: true } });
    api.fail.add(MONEY);
    show(`/finance/payment-vouchers/${PV}`);
    fireEvent.click(await screen.findByRole("button", { name: "Record money back" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("The accounts could not be loaded. Try again.")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Received into")).not.toBeInTheDocument();
  });

  it("a cancelled voucher does not say its advance is waiting to be paid", async () => {
    api.routes[`${B}/vouchers/${PV}`] = voucherDoc({ status: "cancelled", advance_amount: "500.00",
      advance: { ...advanceOf(), advance_open: null, applications: [], money_back: [] }, can: {} });
    show(`/finance/payment-vouchers/${PV}`);
    const card = await screen.findByTestId("voucher-advance");
    expect(card).toHaveTextContent("RM 500.00");
    expect(screen.getByTestId("voucher-advance-cancelled"))
      .toHaveTextContent("This voucher is cancelled, so its advance was never paid or has been reversed.");
    expect(card).not.toHaveTextContent("Not paid yet");
    expect(screen.queryByTestId("voucher-advance-left")).not.toBeInTheDocument();
    expect(card).not.toHaveTextContent("Applied to bills");
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("the bill lists an advance knocked off it, and applies one", async () => {
    api.routes[`${B}/bills/${BILL1}`] = {
      bill: { id: BILL1, bill_no: "BILL-4XK2", status: "confirmed", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
        supplier_kind: "supplier", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: null, po_id: null,
        ap_account_code: "2110", ap_account_name: "Trade payables", total_amount: "1025.00", narration: null,
        cancel_reason: null, created_at: "2026-09-10T01:00:00Z", created_by_name: "Aina", confirmed_at: null,
        confirmed_by_name: null, cancelled_at: null, cancelled_by_name: null, entry_no: "JE-2", reversal_entry_no: null },
      lines: [],
      payments: [{ kind: "advance", application_id: APP, voucher_id: PV, voucher_no: "PV-9M3Q", status: "applied",
        voucher_date: "2026-09-11", applied_on: "2026-09-12", amount_applied: "200.00" }],
      files: [], events: [], paid_total: "200.00", allocated_total: "200.00", unpaid: "825.00", left_to_pay: "825.00",
      advance_open: "300.00", go_live_on: "2026-09-10",
      can: { edit: false, confirm: false, cancel: false, add_file: false, apply_advance: true, take_advance_off: true },
    };
    show(`/finance/bills/${BILL1}`);
    const card = await screen.findByTestId("bill-payments");
    expect(card).toHaveTextContent("Advance from PV-9M3Q · Applied");
    expect(within(card).getByRole("button", { name: "Take advance off" })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Apply advance" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Advance"), { target: { value: PV } });
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("300");
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply advance" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ url: `${B}/vouchers/${PV}/advance-applications`,
      body: { billId: BILL1, amount: 300 } });
  });
});

describe("Unpaid by Supplier", () => {
  it("shows what is owed per supplier, and what already sits on a voucher", async () => {
    show("/finance/ap-outstanding");
    await screen.findByText("Lumen Sofa Works");
    expect(screen.getByText("RM 1,025.00")).toBeInTheDocument(); // on a voucher, not approved
    expect(screen.getByTestId("ap-outstanding-summary")).toHaveTextContent("1 supplier · RM 1,225.00 unpaid");
    // 0484: the advance left and what is owed after it, both from the database.
    expect(screen.getByText("RM 300.00")).toBeInTheDocument();
    expect(screen.getByText("RM 925.00")).toBeInTheDocument();
  });

  it("under a supplier, every advance and what is left of it (P2P-12)", async () => {
    show("/finance/ap-outstanding");
    await screen.findByText("Lumen Sofa Works");
    fireEvent.click(screen.getAllByTitle("Show unpaid bills")[0]!);
    expect(await screen.findByTestId(`ap-outstanding-advances-${SUP}`))
      .toHaveTextContent("PV-9M3Q · Fri, 11 Sep · RM 300.00 left of RM 500.00");
  });
});

describe("payables words and sums", () => {
  it("never shows a raw value or a fake zero", () => {
    expect(word(VOUCHER_STATUS_WORD, "approved")).toBe("Approved");
    expect(word(VOUCHER_STATUS_WORD, "released")).toBe("Not known");
    expect(money(null)).toBe("—");
    expect(money("abc")).toBe("—");
    expect(priceDiffWord(-2.5)).toBe("RM 2.50 below PO price");
    expect(priceDiffWord(null)).toBe("No PO price");
    expect(refusal({ body: { code: "not_finance_approver" }, message: "x" })).toBe("Only a finance approver can do this.");
    expect(refusal(new Error("A voucher needs a bill."))).toBe("A voucher needs a bill.");
  });

  it("adds a line and a voucher the way the database does", () => {
    expect(lineAmount({ qty: "3", unitPrice: "0.07", amount: "" })).toBe(0.21);
    expect(lineAmount({ qty: "", unitPrice: "", amount: "12.5" })).toBe(12.5);
    expect(lineAmount({ qty: "", unitPrice: "", amount: "" })).toBeNull();
    const picks = { a: { on: true, amount: "10.10" }, b: { on: false, amount: "99" } };
    expect(voucherTotal("SUPPLIER_BILLS", picks, [{ amount: "0.20" }])).toBe(10.3);
    expect(voucherTotal("DIRECT", picks, [{ amount: "0.20" }])).toBe(0.2);
    expect(voucherTotal("SUPPLIER_BILLS", picks, [], "250.05")).toBe(260.15);
    expect(voucherTotal("DIRECT", picks, [], "250")).toBe(0);
  });
});
