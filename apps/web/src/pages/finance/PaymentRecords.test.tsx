import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaymentRecords from "./PaymentRecords";

/**
 * PAYMENT RECORDS (owner ruling 2026-09-12): the only permanent incoming-money
 * listing — six ruled columns, one row per Payment, a genuine exception beside
 * the Receipt No, `12 payments · RM … received`, no `New Payment`, and the
 * full-width Payment Record object with its ruled section order.
 */
const state = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false,
  refetch: vi.fn(), isSuccess: true, error: null as Error | null, sheet: vi.fn((_data: unknown) => ({})),
  invoices: [] as unknown[], voidMutate: vi.fn() }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: state.sheet, book_new: () => ({}),
  book_append_sheet: vi.fn() }, writeFile: vi.fn() }));
vi.mock("@/lib/queries", () => ({
  usePaymentRegister: () => state,
  useInvoiceRegister: () => ({ data: state.invoices, isSuccess: true, isLoading: false, isError: false }),
  usePaymentSettings: () => ({ data: { bank_accounts: [
    { route_source: "pj_showroom", bank_name: "Hong Leong Bank", account_name: "Carres", account_no: "12345678" },
  ], collection_timing: [] } }),
  useVoidPayment: () => ({ mutate: state.voidMutate, isPending: false }),
  useWorkspaceDuties: () => ({ data: { duties: [
    { key: "payment_approver", resolution: { actor_user_id: duty.actor } },
  ] } }),
  qk: { finance: { paymentRegister: () => ["finance", "payment-register"],
    invoiceRegister: () => ["finance", "invoice-register"],
    paymentSettings: () => ["finance", "payment-settings"] } },
}));
vi.mock("@/lib/payment-methods", () => ({
  usePaymentMethodRegistry: () => ({ data: { methods: [
    { method: "bank", label: "Bank transfer", account_code: "1120", account_name: "Bank", active: true, sort: 1 },
  ], money_accounts: [] } }),
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
const doc = vi.hoisted(() => ({ fetch: vi.fn(), render: vi.fn(), slip: vi.fn() }));
const duty = vi.hoisted(() => ({ me: null as string | null, role: "operation" as string | null,
  actor: null as string | null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({ user: duty.me ? { id: duty.me } : null, role: duty.role }),
}));
vi.mock("@/lib/api", () => ({ apiFetch: doc.fetch }));
vi.mock("@/lib/pdf/render", () => ({ renderReceiptPdf: doc.render }));
vi.mock("@/lib/payment-display", () => ({ viewSlip: doc.slip }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const payment = {
  id: "p1", order_id: "o1", receipt_no: "RC-060926-0001", paid_on: "2026-09-06",
  amount: 200, method: "bank", kind: "payment", reference: "BANK-123",
  created_at: "2026-09-06T01:00:00Z", recorded_by: "u1", recorded_by_name: "Shasha",
  receipt_url: "orders-attachments/o1/slip.png", source_channel: "manual_payment",
  orders: { id: "o1", so: 123, customer_name: "Customer One" },
  payment_allocations: [{ id: "a1", order_id: "o1", invoice_id: "i1", amount: 200,
    voided_at: null, invoices: { invoice_no: "INV-060926-0001" } }],
};
const INVOICE = {
  id: "i1", invoice_no: "INV-060926-0001", status: "issued", kind: "sales", amount: 1000, tax_amount: 0,
  issued_at: "2026-09-06", voided_at: null, void_reason: null, replaces_invoice_id: null,
  created_at: "2026-09-06T00:00:00Z", order_id: "o1",
  orders: { id: "o1", so: 123, customer_name: "Customer One", status: "proceed_order", paid: 200,
    delivery_date: null, delivery_date_tbd: false, delivered_at: null,
    order_lines: [{ sku: "A", qty: 1, unit_price: 1000 }], order_addons: [],
    ops_order_control: [{ balance: null, confirmed_date: null, line_etas: null, line_stock_status: null }] },
};
beforeEach(() => {
  state.data = [payment, { ...payment, id: "p2", receipt_no: "RC-060926-0002", amount: 100,
    voided_at: "2026-09-06", void_reason: "Duplicate" }];
  state.invoices = [INVOICE];
  state.isError = false; state.isSuccess = true; state.isLoading = false; state.error = null;
  state.sheet.mockClear(); state.voidMutate.mockClear();
  doc.fetch.mockReset(); doc.render.mockReset(); doc.slip.mockReset();
  doc.fetch.mockImplementation(async (url: string) => {
    if (url.includes("/templates")) return { templates: [] };
    return {};
  });
  duty.me = null; duty.role = "operation"; duty.actor = null;
  localStorage.clear();
});
function show(at = "/finance/payments") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={[at]}><PaymentRecords /></MemoryRouter>
  </QueryClientProvider>);
}
/** Radix opens its menu on keyboard Enter under jsdom (the kit test does the same). */
const openMenu = (el: HTMLElement) => fireEvent.keyDown(el, { key: "Enter" });

function openFirstPayment() {
  show();
  fireEvent.click(screen.getAllByTitle("Inspect payment")[0]);
  fireEvent.click(screen.getByText("Open payment"));
}

describe("Payment Records — the listing", () => {
  it("shows the six ruled columns in order; nothing of the Monitor's facts", () => {
    show();
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent?.trim() ?? "");
    const words = ["Receipt No", "Paid date", "Customer", "SO No", "Amount received", "Method"];
    const positions = words.map((w) => headers.findIndex((h) => h.startsWith(w)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    for (const absent of ["Goods", "Storage", "Customer delivery", "Payment timing", "Invoice", "Recorded by", "Recorded"]) {
      expect(headers.some((h) => h.startsWith(absent))).toBe(false);
    }
    expect(screen.getByText("RC-060926-0001")).toBeInTheDocument();
    expect(screen.getByText("VOIDED")).toBeInTheDocument();
    expect(screen.getByTestId("payment-records-summary")).toHaveTextContent("2 payments · RM 200.00 received");
    expect(screen.queryByText("New Payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Recorded")).not.toBeInTheDocument();
  });
  it("money past every obligation reads `RM … needs review` beside the receipt", () => {
    state.invoices = [{ ...INVOICE, orders: { ...INVOICE.orders, paid: 1300 } }];
    show();
    expect(screen.getAllByTestId("payment-needs-review")[0]).toHaveTextContent("RM 300.00 needs review");
  });
  it("Inspect is read-only and opens the Payment Record", () => {
    show();
    fireEvent.click(screen.getAllByTitle("Inspect payment")[0]);
    const inspect = screen.getByTestId("payment-inspect");
    expect(inspect).toHaveTextContent("INV-060926-0001 · RM 200.00");
    expect(within(inspect).getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(inspect).toHaveTextContent("Recorded by Shasha");
    for (const absent of ["Record payment", "Edit", "Correct allocation", "Void payment", "Send receipt"]) {
      expect(within(inspect).queryByRole("button", { name: absent })).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByText("Open payment"));
    expect(screen.getByTestId("payment-object-scroll")).toBeInTheDocument();
  });
  it("selection replaces the toolbar in place and names customer documents honestly", () => {
    show();
    const table = screen.getByRole("table");
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]);
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[1]);
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBe(table);
    expect(screen.getByRole("button", { name: "Print 2 receipts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Excel (2)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Export.*receipt/i })).not.toBeInTheDocument();
  });
  it("shows a failed source with recovery rather than a zero total", () => {
    state.isError = true; state.data = [];
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("Payment Records could not be loaded.");
    expect(screen.queryByTestId("payment-records-summary")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalled();
  });
  it("keeps the VOIDED mark when exporting an original receipt amount", async () => {
    show();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Export Excel (1)" }));
    await waitFor(() => expect(state.sheet).toHaveBeenCalled());
    expect(state.sheet.mock.calls[0][0]).toEqual([
      expect.objectContaining({ "Receipt No": "RC-060926-0002 · VOIDED", "Amount received": "100" }),
    ]);
  });
  it("keeps the optional Columns chooser fields — Reference, Source, Evidence, Void reason", () => {
    localStorage.setItem("carres.payment.records.v1", JSON.stringify({
      order: ["receipt", "paid", "customer", "so", "amount", "method", "invoice", "reference", "actor", "recorded", "source", "evidence", "void_reason", "exception"],
      hidden: [],
    }));
    show();
    const table = screen.getByRole("table");
    for (const label of ["Invoice", "Reference", "Recorded by", "Recorded at", "Source", "Evidence", "Void reason", "Exception"]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("Recorded by staff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Duplicate").length).toBeGreaterThan(0);
  });
  it("the footer counts in English", () => {
    state.data = [payment];
    show();
    expect(screen.getByTestId("payment-records-summary")).toHaveTextContent("1 payment · RM 200.00 received");
  });
  it("a read that has not succeeded never reads as zero", () => {
    state.isSuccess = false; state.data = [];
    show();
    expect(screen.queryByText("No payments yet. Recorded customer money will appear here.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("payment-records-summary")).not.toBeInTheDocument();
  });
});

describe("the Payment Record object", () => {
  it("is one scroll in the ruled section order, with the identity and state in the header", () => {
    openFirstPayment();
    expect(screen.getByTestId("object-identity")).toHaveTextContent("RC-060926-0001");
    expect(screen.getByTestId("payment-record-state")).toHaveTextContent("Payment recorded");
    const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(["Payment facts", "Allocated to", "Evidence", "Actions", "Receipt", "History"]);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
  it("Payment facts carry amount, date, method, money account with masked ending, reference, recorder, time and source", () => {
    openFirstPayment();
    const scroll = screen.getByTestId("payment-object-scroll");
    expect(scroll).toHaveTextContent("Amount received RM 200.00");
    expect(scroll).toHaveTextContent("Payment method Bank transfer");
    expect(scroll).toHaveTextContent("Money account Bank · Hong Leong Bank ····5678");
    expect(scroll).not.toHaveTextContent("12345678");
    expect(scroll).toHaveTextContent("Reference BANK-123");
    expect(scroll).toHaveTextContent("Recorded by Shasha");
    expect(scroll).toHaveTextContent("Source Recorded by staff");
    expect(scroll).toHaveTextContent("INV-060926-0001 · RM 200.00");
    expect(scroll).toHaveTextContent("Amount still needed RM 800.00");
  });
  it("Evidence has a governed View; Actions carry Send receipt only for staff with a template", () => {
    openFirstPayment();
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(doc.slip).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
    expect(screen.getByText("No receipt template yet. Ask a manager to add the approved wording in Settings.")).toBeInTheDocument();
  });
  it("a provider-recorded payment and an un-invoiced order say so in plain words", () => {
    state.data = [{ ...payment, method: "online", source_channel: "order_create", order_id: "o-none",
      orders: { id: "o-none", so: 777, customer_name: "No Invoice Yet" }, payment_allocations: [] }];
    openFirstPayment();
    const scroll = screen.getByTestId("payment-object-scroll");
    expect(scroll).toHaveTextContent("Money account settled by the payment provider");
    expect(scroll).toHaveTextContent("Source Sales Portal deposit");
    expect(scroll).toHaveTextContent("No Invoice issued for this order yet");
  });
  it("a voided payment keeps its Receipt marked VOIDED and cannot send it", () => {
    show();
    fireEvent.click(screen.getAllByTitle("Inspect payment")[1]);
    fireEvent.click(screen.getByText("Open payment"));
    expect(screen.getByTestId("payment-record-state")).toHaveTextContent("VOIDED");
    expect(screen.getByText("A voided Receipt cannot be sent as a valid Receipt.")).toBeInTheDocument();
    expect(screen.getAllByText(/VOIDED · Duplicate/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("payment-record-overflow")).not.toBeInTheDocument();
  });
});

describe("Print receipt — the immutable snapshot", () => {
  beforeEach(() => {
    doc.fetch.mockImplementation(async (url: string) => {
      if (url.includes("/templates")) return { templates: [] };
      if (url.includes("/receipt-document")) return {
        document: { receipt_no: "RC-060926-0001", issue_date: "2026-09-06", customer_name: "Customer One", amount: 200 },
        voided: false, void_reason: null,
      };
      return {};
    });
    doc.render.mockResolvedValue(new Blob(["pdf"]));
    vi.stubGlobal("open", vi.fn());
    if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => "blob:x");
  });
  it("asks the receipt-document door, never the live register row", async () => {
    openFirstPayment();
    fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    await waitFor(() => expect(doc.render).toHaveBeenCalled());
    expect(doc.fetch).toHaveBeenCalledWith("/api/finance/payments/p1/receipt-document");
  });
});

describe("Correct allocation and Void payment — the overflow, for the authorised only", () => {
  it("an operator without the duty sees no overflow at all", () => {
    duty.me = "someone-else";
    openFirstPayment();
    expect(screen.queryByTestId("payment-record-overflow")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Correct allocation" })).not.toBeInTheDocument();
  });
  it("the Payment Approver duty holder gets both doors in the overflow", () => {
    duty.me = "approver"; duty.actor = "approver";
    openFirstPayment();
    openMenu(screen.getByTestId("payment-record-overflow"));
    expect(screen.getByRole("menuitem", { name: "Correct allocation" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Void payment" })).toBeInTheDocument();
  });
  it("principal gets them even with the duty unassigned, and Correct allocation opens the one door", () => {
    duty.role = "principal"; duty.me = "boss"; duty.actor = null;
    openFirstPayment();
    openMenu(screen.getByTestId("payment-record-overflow"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Correct allocation" }));
    expect(screen.getByLabelText("Why is this being corrected")).toBeInTheDocument();
  });
  it("Void payment needs a reason and goes through the one void door", () => {
    duty.role = "principal"; duty.me = "boss";
    openFirstPayment();
    openMenu(screen.getByTestId("payment-record-overflow"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Void payment" }));
    const form = screen.getByTestId("payment-void-form");
    expect(within(form).getByRole("button", { name: "Void payment" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Why is this payment being voided"), { target: { value: "Keyed twice" } });
    fireEvent.click(within(form).getByRole("button", { name: "Void payment" }));
    expect(state.voidMutate).toHaveBeenCalledWith({ paymentId: "p1", reason: "Keyed twice" });
  });
});

describe("Payment Records — the order scope", () => {
  it("shows only the scoped order, says which, and leaves on one control", () => {
    state.data = [payment, { ...payment, id: "p9", receipt_no: "RC-060926-0009",
      orders: { id: "o9", so: 999, customer_name: "Other" } }];
    show("/finance/payments?order=999");
    expect(screen.getByTestId("payment-records-order-scope")).toHaveTextContent("SO-999 only");
    expect(screen.queryByText("RC-060926-0001")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all payments" }));
    expect(screen.getByText("RC-060926-0001")).toBeInTheDocument();
  });
});
