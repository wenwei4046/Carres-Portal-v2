/**
 * Payables row menu and preview (Chew 2026-10-21, Finance MASTER §4.2, COPY
 * "Row menu and preview"): a right-click opens the ONE ROW MENU (View · Print,
 * one divider, the page's own items); a double-click on a document row opens
 * the read-only preview (facts, lines, ledger entries) whose one button,
 * View, opens the page the double-click used to open. Names are invented.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupplierBills, { billPayDoor } from "./SupplierBills";
import PaymentVouchers, { duplicateVoucherPath } from "./PaymentVouchers";
import SupplierCreditNotes from "./SupplierCreditNotes";
import SupplierDebitNotes from "./SupplierDebitNotes";
import ApOutstanding from "./ApOutstanding";

const api = vi.hoisted(() => ({
  routes: {} as Record<string, unknown>,
  calls: [] as Array<{ url: string; method: string; body: unknown }>,
}));
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    api.calls.push({ url, method, body: init?.body ? JSON.parse(init.body) : undefined });
    if (method !== "GET") return { id: "33333333-3333-4333-8333-333333333333" };
    const path = url.replace(/\?.*$/, "");
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
const pdf = vi.hoisted(() => ({ voucher: vi.fn(async (_data: unknown) => new Blob(["%PDF"])) }));
vi.mock("@/lib/pdf/render", () => ({ renderPaymentVoucherPdf: pdf.voucher }));

const B = "/api/finance/payables";
const L = "/api/finance/ledger/entries";
const SUP = "11111111-1111-4111-8111-111111111111";
const BILL1 = "77777777-7777-4777-8777-777777777771";
const BILL2 = "77777777-7777-4777-8777-777777777772";
const BILL3 = "77777777-7777-4777-8777-777777777773";
const PV = "88888888-8888-4888-8888-888888888888";
const PV_DRAFT = "88888888-8888-4888-8888-888888888889";
const CN = "22222222-2222-4222-8222-222222222222";
const DN = "44444444-4444-4444-8444-444444444444";

function billRow(over: Record<string, unknown>) {
  return {
    id: BILL1, bill_no: "BILL-4XK2", status: "confirmed", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: null,
    po_id: null, grn_nos: null, ap_account_code: "2110", total_amount: "1025.00", paid_total: "0.00",
    unpaid: "1025.00", price_flags: 0, file_count: 0, created_at: "2026-09-10T01:00:00Z", ...over,
  };
}
const billDoc = {
  bill: {
    id: BILL1, bill_no: "BILL-4XK2", status: "confirmed", supplier_id: SUP, supplier_name: "Lumen Sofa Works",
    supplier_kind: "supplier", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: "2026-10-10",
    po_id: null, ap_account_code: "2110", ap_account_name: "Trade payables", total_amount: "1025.00", narration: null,
    cancel_reason: null, created_at: "2026-09-10T01:00:00Z", created_by_name: "Aina", confirmed_at: null,
    confirmed_by_name: null, cancelled_at: null, cancelled_by_name: null, entry_no: "JE-202609-0011", reversal_entry_no: null,
  },
  lines: [
    { line_no: 1, account_code: "5100", account_name: "Cost of goods sold", description: "Three seater sofa", sku: null,
      qty: "1", unit_price: "1000.00", amount: "1000.00", warehouse_receipt_id: null, grn_no: null, grn_po_id: null,
      po_line_id: null, po_unit_cost: null, price_diff: null },
    { line_no: 2, account_code: "6500", account_name: "Transport", description: "Lorry", sku: null,
      qty: null, unit_price: null, amount: "25.00", warehouse_receipt_id: null, grn_no: null, grn_po_id: null,
      po_line_id: null, po_unit_cost: null, price_diff: null },
  ],
  payments: [], files: [], events: [], paid_total: "0.00", allocated_total: "0.00", unpaid: "1025.00",
  left_to_pay: "1025.00", advance_open: "0.00", go_live_on: "2026-09-01",
  can: { edit: false, confirm: false, cancel: false, add_file: false, apply_advance: false },
};
const entry = (no: string, lines: Array<[string, string, number, number, string | null]>) => ({
  entry: { id: `e-${no}`, entry_no: no, entry_date: "2026-09-10", source_type: "SUPPLIER_BILL", source_doc_no: "BILL-4XK2",
    narration: null, total_debit: 0, total_credit: 0, reversed: false, reverses: null, reverses_entry_no: null,
    reversed_by: null, reversed_by_entry_no: null, created_at: "2026-09-10T01:00:00Z" },
  lines: lines.map(([code, name, debit, credit, memo], i) => ({ line_no: i + 1, account_code: code, account_name: name,
    debit, credit, party_type: null, party_id: null, party_name: null, memo })),
  related: [],
});

function voucherRow(over: Record<string, unknown>) {
  return {
    id: PV, voucher_no: "PV-9M3Q", status: "approved", purpose: "SUPPLIER_BILLS", supplier_id: SUP,
    supplier_name: "Lumen Sofa Works", payee_name: "Lumen Sofa Works", voucher_date: "2026-09-11", amount: "1225.00",
    advance_amount: "0.00", advance_open: null, bill_nos: "BILL-4XK2", pay_from_account_code: "1120", pay_from_name: "Bank",
    pay_method: "BANK_TRANSFER", prepared_by_name: null, checked_by_name: null, approved_by_name: null, file_count: 0, ...over,
  };
}
const voucherDoc = {
  voucher: {
    id: PV, voucher_no: "PV-9M3Q", status: "approved", purpose: "SUPPLIER_BILLS", supplier_id: SUP,
    supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", payee_name: "Lumen Sofa Works",
    voucher_date: "2026-09-11", amount: "1225.00", advance_amount: "0.00", ap_account_code: "2110",
    ap_account_name: "Trade payables", pay_method: "BANK_TRANSFER", pay_reference: "TRX-1",
    pay_from_account_code: "1120", pay_from_name: "Bank", narration: "September goods", created_at: "2026-09-11T01:00:00Z",
    created_by_name: "Aina", prepared_at: null, prepared_by_name: "Aina", checked_at: null, checked_by_name: "Boon",
    approved_at: null, approved_by_name: "Chew", rejected_at: null, rejected_by_name: null, reject_reason: null,
    cancelled_at: null, cancelled_by_name: null, cancel_reason: null, entry_no: "JE-202609-0020", reversal_entry_no: null,
  },
  lines: [{ line_no: 1, account_code: "6500", account_name: "Bank charges", description: "Transfer fee", amount: "1.00",
    department_type: "OFFICE", department_id: null }],
  allocations: [
    { bill_id: BILL1, bill_no: "BILL-4XK2", supplier_invoice_no: "LSW-901", bill_date: "2026-09-10", due_date: null,
      bill_total: "1025.00", ap_account_code: "2110", amount_applied: "1025.00" },
    { bill_id: BILL3, bill_no: "BILL-7QQ3", supplier_invoice_no: "LSW-903", bill_date: "2026-09-10", due_date: null,
      bill_total: "199.00", ap_account_code: "2110", amount_applied: "199.00" },
  ],
  files: [], events: [], advance: null, go_live_on: "2026-09-10", you_prepared: false,
  can: { edit: false, prepare: false, check: false, approve: false, reject: false, cancel: false, add_file: false,
    apply_advance: false, take_advance_off: false, money_back: false, cancel_money_back: false },
};
const noteDoc = (kind: "credit" | "debit") => ({
  note: {
    id: kind === "credit" ? CN : DN, note_no: kind === "credit" ? "SCN-0001" : "PDN-0001", status: "confirmed",
    supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", supplier_note_no: "LSW-N-1",
    note_date: "2026-09-20", due_date: null, ap_account_code: "2110", ap_account_name: "Trade payables", total_amount: "50.00",
    narration: null, cancel_reason: null, created_at: "2026-09-20T02:00:00Z", created_by_name: "Aina",
    confirmed_at: null, confirmed_by_name: null, cancelled_at: null, cancelled_by_name: null,
    entry_no: null, reversal_entry_no: null,
  },
  lines: [{ line_no: 1, account_code: "4900", account_name: "Other income", description: "Rebate", amount: "50.00",
    department_type: null, department_id: null }],
  applications: [], payments: [], files: [], events: [], applied_total: "0.00", credit_open: "50.00",
  paid_total: "0.00", held_total: "0.00", debit_open: "50.00", go_live_on: "2026-09-01",
  can: { edit: false, confirm: false, cancel: false, add_file: false, apply: false, take_off: false },
});
const noteRow = (kind: "credit" | "debit") => ({
  id: kind === "credit" ? CN : DN, note_no: kind === "credit" ? "SCN-0001" : "PDN-0001", status: "confirmed",
  supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_kind: "supplier", supplier_note_no: "LSW-N-1",
  note_date: "2026-09-20", due_date: null, ap_account_code: "2110", total_amount: "50.00", applied_total: "0.00",
  credit_open: "50.00", paid_total: "0.00", held_total: "0.00", debit_open: "50.00", file_count: 0, created_at: "2026-09-20T02:00:00Z",
});

beforeEach(() => {
  api.calls.length = 0;
  api.routes = {
    "/api/finance/ledger/departments": { rows: [{ department_type: "OFFICE", department_id: null, name: "Office" }] },
    [`${B}/bills`]: { rows: [billRow({}), billRow({ id: BILL2, bill_no: null, status: "draft", unpaid: null, supplier_invoice_no: "LSW-902" })] },
    [`${B}/bills/${BILL1}`]: billDoc,
    [`${L}/JE-202609-0011`]: entry("JE-202609-0011", [["5100", "Cost of goods sold", 1000, 0, "Three seater sofa"],
      ["6500", "Transport", 25, 0, null], ["2110", "Trade payables", 0, 1025, null]]),
    [`${B}/vouchers`]: { rows: [voucherRow({}), voucherRow({ id: PV_DRAFT, voucher_no: null, status: "draft" })] },
    [`${B}/vouchers/${PV}`]: voucherDoc,
    [`${L}/JE-202609-0020`]: entry("JE-202609-0020", [["2110", "Trade payables", 1224, 0, null], ["1120", "Bank", 0, 1224, null]]),
    [`${B}/credit-notes`]: { rows: [noteRow("credit")] },
    [`${B}/credit-notes/${CN}`]: noteDoc("credit"),
    [`${B}/debit-notes`]: { rows: [noteRow("debit")] },
    [`${B}/debit-notes/${DN}`]: noteDoc("debit"),
    [`${B}/outstanding`]: { rows: [{ supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_kind: "supplier",
      open_bills: 1, billed_total: "1025.00", paid_total: "0.00", allocated_total: "0.00", unpaid_total: "1025.00",
      advance_open: "0.00", credit_open: "0.00", debit_open: "0.00", net_owing: "1025.00", uncommitted: "1025.00",
      oldest_unpaid_bill_date: "2026-09-10" }] },
  };
  localStorage.clear();
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function show(at: string, path: string, page: JSX.Element) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route path={path} element={page} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Right-click the row holding this text; the open menu's words, dividers as ─. */
async function menuOf(text: string): Promise<string[]> {
  fireEvent.contextMenu((await screen.findAllByText(text))[0]!);
  const menu = await screen.findByRole("menu", { name: "Row actions" });
  return Array.from(menu.children).map((el) => (el.getAttribute("role") === "separator" ? "─" : el.textContent ?? ""));
}
const choose = (word: string) => fireEvent.click(within(screen.getByRole("menu", { name: "Row actions" })).getByRole("menuitem", { name: word }));

describe("Bills: row menu", () => {
  it("a confirmed bill with something unpaid: View, then New Payment Voucher after one divider", async () => {
    show("/finance/bills", "/finance/bills/*", <SupplierBills />);
    expect(await menuOf("BILL-4XK2")).toEqual(["View", "─", "New Payment Voucher"]);
    choose("New Payment Voucher");
    expect(await screen.findByTestId("where")).toHaveTextContent(`/finance/payment-vouchers/new?supplier=${SUP}&bill=${BILL1}`);
  });

  it("a draft bill has nothing to pay: View only, and View opens the bill's page", async () => {
    api.routes[`${B}/bills/${BILL2}`] = { ...billDoc, bill: { ...billDoc.bill, id: BILL2, bill_no: null, status: "draft", entry_no: null } };
    show("/finance/bills", "/finance/bills/*", <SupplierBills />);
    expect(await menuOf("Draft, no number yet")).toEqual(["View"]);
    choose("View");
    expect(await screen.findByTestId("bill-status")).toHaveTextContent("Draft");
  });

  it("New Payment Voucher follows the bill page's own condition", () => {
    expect(billPayDoor({ id: BILL1, status: "confirmed", supplier_id: SUP, unpaid: "10.00" })).toBe(`/finance/payment-vouchers/new?supplier=${SUP}&bill=${BILL1}`);
    expect(billPayDoor({ id: BILL1, status: "confirmed", supplier_id: SUP, unpaid: "0.00" })).toBeNull();
    expect(billPayDoor({ id: BILL1, status: "draft", supplier_id: SUP, unpaid: null })).toBeNull();
    expect(billPayDoor({ id: BILL1, status: "cancelled", supplier_id: SUP, unpaid: "10.00" })).toBeNull();
  });
});

describe("Bills: double-click preview", () => {
  it("shows the bill's facts, its lines and its ledger entry, and View opens the page", async () => {
    show("/finance/bills", "/finance/bills/*", <SupplierBills />);
    fireEvent.doubleClick((await screen.findAllByText("BILL-4XK2"))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "BILL-4XK2 · Lumen Sofa Works" });
    const facts = await within(dialog).findByTestId("preview-facts");
    expect(facts).toHaveTextContent("Supplier invoiceLSW-901");
    expect(facts).toHaveTextContent("Unpaid");
    expect(within(dialog).getByTestId("preview-lines")).toHaveTextContent("Three seater sofa");
    expect(within(dialog).getByTestId("preview-lines")).toHaveTextContent("5100 Cost of goods sold");
    expect(within(dialog).getByTestId("preview-lines")).toHaveTextContent("RM 1,025.00");
    const ledger = await within(dialog).findByTestId("preview-entry-JE-202609-0011");
    expect(ledger).toHaveTextContent("Ledger entry JE-202609-0011");
    await waitFor(() => expect(ledger).toHaveTextContent("2110 Trade payables"));
    expect(ledger).toHaveTextContent("No memo");
    expect(ledger).toHaveTextContent("RM 1,025.00");
    for (const h of ["Account", "Description", "Debit", "Credit"]) expect(within(ledger).getByRole("columnheader", { name: h })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "View" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByTestId("bill-status")).toHaveTextContent("Confirmed");
  });

  it("Escape closes the preview and leaves the list as it was", async () => {
    show("/finance/bills", "/finance/bills/*", <SupplierBills />);
    fireEvent.doubleClick((await screen.findAllByText("BILL-4XK2"))[0]!);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByText("BILL-4XK2").length).toBeGreaterThan(0);
  });

  it("a bill not posted yet says so in the bill's own words", async () => {
    api.routes[`${B}/bills/${BILL1}`] = { ...billDoc, bill: { ...billDoc.bill, status: "draft", entry_no: null } };
    show("/finance/bills", "/finance/bills/*", <SupplierBills />);
    fireEvent.doubleClick((await screen.findAllByText("BILL-4XK2"))[0]!);
    const ledger = await screen.findByTestId("preview-ledger");
    expect(ledger).toHaveTextContent("None yet. Confirming the bill makes it");
  });
});

describe("Payment Vouchers: row menu", () => {
  it("an approved voucher: View, Print, then Duplicate after one divider", async () => {
    show("/finance/payment-vouchers", "/finance/payment-vouchers/*", <PaymentVouchers />);
    expect(await menuOf("PV-9M3Q")).toEqual(["View", "Print", "─", "Duplicate"]);
  });

  it("Print runs the voucher's own print flow from its document", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    URL.createObjectURL = vi.fn(() => "blob:pv");
    show("/finance/payment-vouchers", "/finance/payment-vouchers/*", <PaymentVouchers />);
    await menuOf("PV-9M3Q");
    choose("Print");
    await waitFor(() => expect(pdf.voucher).toHaveBeenCalled());
    expect(pdf.voucher.mock.calls[0]?.[0]).toMatchObject({ voucher_no: "PV-9M3Q", total: 1225 });
    expect(open).toHaveBeenCalledWith("blob:pv", "_blank", "noopener");
    open.mockRestore();
  });

  it("a draft voucher has no paper: View and Duplicate, no Print", async () => {
    show("/finance/payment-vouchers", "/finance/payment-vouchers/*", <PaymentVouchers />);
    expect(await menuOf("Draft, no number yet")).toEqual(["View", "─", "Duplicate"]);
  });

  it("Duplicate opens a new draft prefilled from the voucher, dated today, keeping only bills still open", async () => {
    // BILL1 still has 1,000.00 left; BILL3 is paid in full and drops off.
    api.routes[`${B}/suppliers`] = { rows: [{ id: SUP, name: "Lumen Sofa Works", kind: "supplier" }] };
    api.routes[`${B}/supplier-finance`] = { rows: [] };
    api.routes[`${B}/accounts`] = { rows: [
      { code: "6500", name: "Bank charges", kind: "EXPENSE", parent_code: "6000", is_control: false, control_for: null,
        for_bill_line: true, for_voucher_line: true, for_ap: false, for_pay_from: false },
    ] };
    api.routes["/api/finance/ledger/money-accounts"] = [{ code: "1120", name: "Bank", money_kind: "BANK", is_active: true }];
    api.routes[`${B}/bill-outstanding`] = { rows: [
      { bill_id: BILL1, bill_no: "BILL-4XK2", supplier_id: SUP, supplier_name: "Lumen Sofa Works", supplier_invoice_no: "LSW-901",
        bill_date: "2026-09-10", due_date: null, po_id: null, total_amount: "2025.00", paid_total: "1025.00", balance_owing: "1000.00",
        go_live_on: "2026-09-10", ap_account_code: "2110", allocated_total: "1025.00", unallocated: "1000.00", supplier_kind: "supplier" },
    ] };
    show("/finance/payment-vouchers", "/finance/payment-vouchers/*", <PaymentVouchers />);
    await menuOf("PV-9M3Q");
    choose("Duplicate");
    const form = await screen.findByTestId("voucher-form");
    expect(duplicateVoucherPath(PV)).toBe(`/finance/payment-vouchers/new?copy=${PV}`);
    await waitFor(() => expect(within(form).getByLabelText("Purpose")).toHaveValue("SUPPLIER_BILLS"));
    expect(within(form).getByDisplayValue("September goods")).toBeInTheDocument();
    expect(within(form).getByDisplayValue("Transfer fee")).toBeInTheDocument();
    // The reference is the new payment's own; the copy leaves it empty.
    expect(within(form).queryByDisplayValue("TRX-1")).not.toBeInTheDocument();
    // The open bill is ticked at what is left on it, at most the old amount.
    await waitFor(() => expect(within(form).getByDisplayValue("1000")).toBeInTheDocument());
    expect(within(form).queryByText("BILL-7QQ3")).not.toBeInTheDocument();
    // Nothing is saved until Save is pressed.
    expect(api.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
});

describe("Payment Vouchers: double-click preview", () => {
  it("shows the bills it paid and its direct line, then its ledger entry", async () => {
    show("/finance/payment-vouchers", "/finance/payment-vouchers/*", <PaymentVouchers />);
    fireEvent.doubleClick((await screen.findAllByText("PV-9M3Q"))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "PV-9M3Q · Lumen Sofa Works" });
    const lines = await within(dialog).findByTestId("preview-lines");
    expect(lines).toHaveTextContent("BILL-4XK2 · Supplier invoice LSW-901");
    expect(lines).toHaveTextContent("Transfer fee");
    expect(lines).toHaveTextContent("6500 Bank charges");
    await waitFor(() => expect(within(dialog).getByTestId("preview-entry-JE-202609-0020")).toHaveTextContent("1120 Bank"));
    fireEvent.click(within(dialog).getByRole("button", { name: "View" }));
    expect(await screen.findByTestId("voucher-status")).toBeInTheDocument();
  });
});

describe("Credit Notes and Debit Notes: View only, and the preview", () => {
  it("a credit note's menu is View; its preview has no ledger entry yet", async () => {
    show("/finance/credit-notes", "/finance/credit-notes/*", <SupplierCreditNotes />);
    expect(await menuOf("SCN-0001")).toEqual(["View"]);
    choose("View");
    expect(await screen.findByTestId("credit-note-status")).toBeInTheDocument();
  });

  it("a debit note's preview shows its lines and its own none yet words", async () => {
    show("/finance/debit-notes", "/finance/debit-notes/*", <SupplierDebitNotes />);
    expect(await menuOf("PDN-0001")).toEqual(["View"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    fireEvent.doubleClick((await screen.findAllByText("PDN-0001"))[0]!);
    const dialog = await screen.findByRole("dialog", { name: "PDN-0001 · Lumen Sofa Works" });
    expect(await within(dialog).findByTestId("preview-lines")).toHaveTextContent("Rebate");
    expect(within(dialog).getByTestId("preview-ledger")).toHaveTextContent("None yet. Confirming the debit note makes it");
  });
});

describe("Unpaid by Supplier: row menu", () => {
  it("a supplier has no page of its own: the menu is New Payment Voucher for that supplier", async () => {
    show("/finance/ap", "/finance/ap", <ApOutstanding />);
    expect(await menuOf("Lumen Sofa Works")).toEqual(["New Payment Voucher"]);
    choose("New Payment Voucher");
    expect(await screen.findByTestId("where")).toHaveTextContent(`/finance/payment-vouchers/new?supplier=${SUP}`);
  });
});
