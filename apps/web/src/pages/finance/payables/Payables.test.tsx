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

function billRow(over: Record<string, unknown>) {
  return {
    id: BILL1, bill_no: "BILL-4XK2", status: "confirmed", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: null,
    po_id: "PO-3001", grn_nos: "GRN-A1", ap_account_code: "2110", total_amount: "1025.00", paid_total: "0.00",
    unpaid: "1025.00", price_flags: 1, file_count: 2, created_at: "2026-09-10T01:00:00Z", ...over,
  };
}

function voucherDoc(over: { status: string; can: Record<string, boolean>; you_prepared?: boolean }) {
  return {
    voucher: {
      id: PV, voucher_no: "PV-9M3Q", status: over.status, purpose: "SUPPLIER_BILLS", supplier_id: SUP,
      supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", payee_name: "Lumen Sofa Works",
      voucher_date: "2026-09-11", amount: "1225.00", pay_method: "BANK_TRANSFER", pay_reference: "TRX-1",
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
    go_live_on: "2026-09-10", you_prepared: over.you_prepared ?? false,
    can: { edit: false, prepare: false, check: false, approve: false, reject: false, cancel: false, add_file: true, ...over.can },
  };
}

beforeEach(() => {
  api.calls.length = 0;
  api.fail.clear();
  api.routes = {
    [`${B}/suppliers`]: suppliers,
    [`${B}/accounts`]: accounts,
    [`${B}/bills`]: { rows: [billRow({}), billRow({ id: BILL2, bill_no: null, status: "draft", unpaid: null,
      supplier_invoice_no: "LSW-902", total_amount: "200.00", price_flags: 0, file_count: 0 })] },
    [`${B}/bills/grn-candidates`]: { rows: [{ receipt_id: GRN, grn_no: "GRN-A1", po_id: "PO-3001", supplier_id: SUP,
      supplier_name: "Lumen Sofa Works", received_on: "2026-09-10", posted_at: null, open_lines: 2, open_qty: "3",
      open_value_at_po_cost: "1020.00" }] },
    [`${B}/bills/grn-lines/${GRN}`]: { rows: [
      { receipt_id: GRN, grn_no: "GRN-A1", po_id: "PO-3001", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
        po_line_id: POL1, sku: "SOFA-3S", received_qty: "1", billed_qty: "0", open_qty: "1", po_unit_cost: "520.00",
        commercial_treatment: null },
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
        open_bills: 2, oldest_unpaid_bill_date: "2026-09-10" },
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

describe("Bill form — Convert GRN to bill", () => {
  it("fills the lines from the GRN at the PO price, flags a changed price, and saves the GRN link", async () => {
    show("/finance/bills/new");
    fireEvent.click(await screen.findByTestId("convert-grn"));
    fireEvent.click(await screen.findByRole("button", { name: "Use this GRN" }));

    await waitFor(() => expect(screen.getByLabelText("Line 1 qty")).toHaveValue("1"));
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const w = writes()[0]!;
    expect(w).toMatchObject({ url: `${B}/bills`, method: "POST" });
    expect(w.body).toMatchObject({
      supplierId: SUP,
      supplierInvoiceNo: "LSW-901",
      lines: [
        { warehouseReceiptId: GRN, poLineId: POL1, qty: 1, unitPrice: 525 },
        { warehouseReceiptId: GRN, poLineId: POL2, qty: 2, unitPrice: 250 },
      ],
    });
    // The database computes a GRN line's amount; the page never sends one.
    for (const l of (w.body as { lines: Array<Record<string, unknown>> }).lines) expect(l).not.toHaveProperty("amount");
  });

  it("a typed line for an other creditor sends the account and the amount", async () => {
    show(`/finance/bills/new?supplier=${LANDLORD}`);
    await waitFor(() => expect(screen.getByLabelText("Supplier")).toHaveValue(LANDLORD));
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.change(screen.getByLabelText("Line 1 description"), { target: { value: "August rent" } });
    fireEvent.change(screen.getByLabelText("Line 1 account"), { target: { value: "6500" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText("Supplier invoice No"), { target: { value: "RENT-08" } });
    fireEvent.change(screen.getByLabelText("Bill date"), { target: { value: "2026-08-15" } });
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
    expect(screen.getByTestId("voucher-form-total")).toHaveTextContent("RM 1,226.00");

    fireEvent.change(screen.getByLabelText("Paid from"), { target: { value: "1120" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    const w = writes()[0]!;
    expect(w).toMatchObject({ url: `${B}/vouchers`, method: "POST" });
    expect(w.body).toMatchObject({
      purpose: "SUPPLIER_BILLS", supplierId: SUP, payFromAccountCode: "1120", payMethod: "BANK_TRANSFER",
      allocations: [{ billId: BILL1, amount: 1025 }, { billId: BILL2, amount: 200 }],
      lines: [{ accountCode: "6500", amount: 1 }],
    });
    expect(w.body).not.toHaveProperty("amount");
  });

  it("a direct payment sends lines and no bills", async () => {
    show("/finance/payment-vouchers/new");
    fireEvent.change(await screen.findByLabelText("Purpose"), { target: { value: "DIRECT" } });
    expect(screen.queryByText("Bills to pay")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Payee"), { target: { value: "Quickfix Plumbing" } });
    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.change(screen.getByLabelText("Line 1 account"), { target: { value: "6500" } });
    fireEvent.change(screen.getByLabelText("Line 1 amount"), { target: { value: "150" } });
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

describe("Unpaid by Supplier", () => {
  it("shows what is owed per supplier, and what already sits on a voucher", async () => {
    show("/finance/ap-outstanding");
    await screen.findByText("Lumen Sofa Works");
    expect(screen.getByText("RM 1,025.00")).toBeInTheDocument(); // on a voucher, not approved
    expect(screen.getByTestId("ap-outstanding-summary")).toHaveTextContent("1 supplier · RM 1,225.00 unpaid");
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
  });
});
