import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import InvoiceRegister from "./InvoiceRegister";

const state = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false,
  refetch: vi.fn(), error: null as Error | null }));
vi.mock("@/lib/queries", () => ({
  useInvoiceRegister: () => state,
  useRecordPayment: () => ({ mutate: vi.fn(), isPending: false }),
  qk: { finance: {
    invoiceRegister: () => ["finance", "invoice-register"],
    paymentRegister: () => ["finance", "payment-register"],
  } },
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
const auth = vi.hoisted(() => ({ role: "finance" as string }));
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string }) => unknown) => selector({ role: auth.role }),
}));

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function row(over: Partial<InvoiceRegisterRow> & {
  paid?: number;
  control?: Record<string, unknown>;
  delivery_date?: string | null;
} = {}): InvoiceRegisterRow {
  return {
    id: over.id ?? "i1",
    invoice_no: over.invoice_no ?? null,
    status: over.status ?? "draft",
    kind: "sales",
    amount: over.amount ?? 1000,
    tax_amount: 0,
    issued_at: over.issued_at ?? null,
    voided_at: over.voided_at ?? null,
    void_reason: over.void_reason ?? null,
    replaces_invoice_id: null,
    created_at: "2026-09-06T00:00:00Z",
    order_id: "o1",
    orders: {
      id: "o1", so: 1300, customer_name: "LIM KUAN YANG",
      status: "proceed_order", paid: over.paid ?? 0,
      delivery_date: over.delivery_date ?? null, delivery_date_tbd: false, delivered_at: null,
      ops_assigned_logistic: null,
      delivery_partners: { name: "NETS", contact: null },
      order_payments: [{ id: "p1", receipt_no: "RC-040926-1207", amount: 400,
        paid_on: "2026-09-04", voided_at: null }],
      order_lines: [{ qty: 1, unit_price: 1000 }],
      order_addons: [],
      ops_order_control: [{
        balance: null,
        confirmed_date: null,
        line_etas: (over.control?.line_etas as Record<string, string>) ?? null,
        line_stock_status: (over.control?.line_stock_status as Record<string, string>) ?? null,
      }],
    },
  };
}

beforeEach(() => {
  state.data = [
    // Goods not ready, no arrival — the wait rule holds even with a date.
    row({ id: "i1", paid: 400, delivery_date: iso(14) }),
    // Issued and ready with a future delivery — a due deadline.
    row({ id: "i2", invoice_no: "INV-060926-0001", status: "issued", issued_at: "2026-09-06",
      delivery_date: iso(14), control: { line_stock_status: { A: "ready" } } }),
    // Voided keeps its number and mark.
    row({ id: "i3", invoice_no: "INV-050926-0002", status: "voided", issued_at: "2026-09-05",
      voided_at: "2026-09-06", void_reason: "Wrong amount" }),
  ];
  state.isError = false;
  state.isLoading = false;
  localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><InvoiceRegister /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Invoices Register", () => {
  it("shows the eight approved columns in order", () => {
    show();
    const table = screen.getByRole("table");
    for (const label of ["Invoice No", "Customer", "SO No", "Needed", "Goods",
      "Expected arrival", "Customer Delivery", "Payment Timing"]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("New Invoice")).not.toBeInTheDocument();
  });
  it("waits before a blind chase, and marks drafts and voids honestly", () => {
    show();
    expect(screen.getAllByText("Wait").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft").length).toBe(1);
    expect(screen.queryByText("DRAFT")).not.toBeInTheDocument();
    expect(screen.getAllByText("VOIDED").length).toBeGreaterThan(0);
    expect(screen.getByText("INV-060926-0001")).toBeInTheDocument();
    // The ready row shows the shared T−2 deadline, not Wait.
    expect(screen.getAllByText(/^Due /).length).toBe(1);
  });
  it("sums only live invoices in the footer", () => {
    show();
    // i1 owes 600 (1000−400), i2 owes 1000, the voided row is excluded.
    expect(screen.getByTestId("invoice-register-summary"))
      .toHaveTextContent("3 invoices · RM 1,600.00 still needed");
  });
  it("keeps Inspect read-only and opens a one-scroll object", () => {
    show();
    fireEvent.click(screen.getAllByTitle("Inspect invoice")[0]);
    expect(screen.getByText("Open invoice")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Void invoice" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Open invoice"));
    expect(screen.getByTestId("invoice-object-scroll")).toBeInTheDocument();
    for (const title of ["Money", "Goods and Delivery", "What to do", "Invoice",
      "Related Payments", "Communication History"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // The waiting order says Wait and forbids the blind chase in plain words.
    expect(screen.getByText("Do not ask the customer to pay yet.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("RC-040926-1207", { exact: false })).toBeInTheDocument();
  });
  it("the Record payment door opens only for staff the posting door admits", () => {
    auth.role = "operation";
    show();
    fireEvent.click(screen.getAllByTitle("Inspect invoice")[1]);
    fireEvent.click(screen.getByText("Open invoice"));
    expect(screen.getByRole("button", { name: "Record payment" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(screen.getByTestId("invoice-record-payment")).toBeInTheDocument();
    // The 50/50 composition: the action form and the customer document preview.
    expect(screen.getByTestId("invoice-receipt-preview")).toBeInTheDocument();
    auth.role = "finance";
  });
  it("finance reads money; it does not post normal collection (§12)", () => {
    auth.role = "finance";
    show();
    fireEvent.click(screen.getAllByTitle("Inspect invoice")[1]);
    fireEvent.click(screen.getByText("Open invoice"));
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });
  it("the chase door never opens on a waiting invoice (催钱前先看货)", () => {
    auth.role = "operation";
    show();
    // Row i1 waits: goods not ready, no arrival.
    fireEvent.click(screen.getAllByTitle("Inspect invoice")[0]);
    fireEvent.click(screen.getByText("Open invoice"));
    expect(screen.getByText("Do not ask the customer to pay yet.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask the customer to pay" })).not.toBeInTheDocument();
    auth.role = "finance";
  });
  it("a due invoice offers the chase door and renders the sent-message history", () => {
    auth.role = "operation";
    state.data = [row({ id: "i2", invoice_no: "INV-060926-0001", status: "issued",
      issued_at: "2026-09-06", delivery_date: iso(14),
      control: { line_stock_status: { A: "ready" } } })];
    const orders = (state.data[0] as InvoiceRegisterRow).orders!;
    orders.payment_communications = [{
      id: "c1", kind: "reminder", message_text: "Hi, just a friendly reminder…",
      template_key: "customer_reminder", sent_screenshot_url: "orders-attachments/x.png",
      recorded_at: "2026-09-06T03:00:00Z",
    }];
    show();
    fireEvent.click(screen.getAllByTitle("Inspect invoice")[0]);
    fireEvent.click(screen.getByText("Open invoice"));
    expect(screen.getByRole("button", { name: "Ask the customer to pay" })).toBeInTheDocument();
    expect(screen.getByText("Reminder sent")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ask the customer to pay" }));
    expect(screen.getByTestId("invoice-ask-to-pay")).toBeInTheDocument();
    auth.role = "finance";
  });
  it("shows a failed source with recovery rather than a zero total", () => {
    state.isError = true;
    state.data = [];
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("Invoices could not be loaded.");
    expect(screen.queryByTestId("invoice-register-summary")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalled();
  });
});
