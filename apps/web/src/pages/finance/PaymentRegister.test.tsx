import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaymentRegister from "./PaymentRegister";

const state = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false,
  refetch: vi.fn(), error: null as Error | null, sheet: vi.fn((_data: unknown) => ({})) }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: state.sheet, book_new: () => ({}),
  book_append_sheet: vi.fn() }, writeFile: vi.fn() }));
vi.mock("@/lib/queries", () => ({
  usePaymentRegister: () => state,
  useWorkspaceDuties: () => ({ data: { duties: [
    { key: "payment_approver", resolution: { actor_user_id: duty.actor } },
  ] } }),
  qk: { finance: { paymentRegister: () => ["finance", "payment-register"],
    invoiceRegister: () => ["finance", "invoice-register"] } },
}));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
const doc = vi.hoisted(() => ({ fetch: vi.fn(), render: vi.fn() }));
const duty = vi.hoisted(() => ({ me: null as string | null, role: "operation" as string | null,
  actor: null as string | null }));
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: unknown) => unknown) =>
    sel({ user: duty.me ? { id: duty.me } : null, role: duty.role }),
}));
vi.mock("@/lib/api", () => ({ apiFetch: doc.fetch }));
vi.mock("@/lib/pdf/render", () => ({ renderReceiptPdf: doc.render }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
const payment = {
  id: "p1", order_id: "o1", receipt_no: "RC-060926-0001", paid_on: "2026-09-06",
  amount: 200, method: "bank", kind: "payment", reference: "BANK-123",
  created_at: "2026-09-06T01:00:00Z", recorded_by: null, receipt_url: null,
  orders: { id: "o1", so: 123, customer_name: "Customer One" },
  payment_allocations: [{ id: "a1", order_id: "o1", amount: 200, voided_at: null }],
};
beforeEach(() => {
  state.data = [payment, { ...payment, id: "p2", receipt_no: "RC-060926-0002", amount: 100,
    voided_at: "2026-09-06", void_reason: "Duplicate" }];
  state.isError = false;
  state.isLoading = false;
  state.error = null;
  state.sheet.mockClear();
  duty.me = null; duty.role = "operation"; duty.actor = null;
  localStorage.clear();
});
function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter><PaymentRegister /></MemoryRouter>
  </QueryClientProvider>);
}
describe("Payments Register", () => {
  it("shows canonical receipts in the six approved columns, with voids excluded from received total", () => {
    show();
    const table = screen.getByRole("table");
    for (const label of ["Receipt No", "Paid Date", "Customer", "SO No", "Amount", "Method"]) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("RC-060926-0001")).toBeInTheDocument();
    expect(screen.getByText("VOIDED")).toBeInTheDocument();
    expect(screen.getByTestId("payment-register-summary")).toHaveTextContent("2 payments · RM 200.00 received");
    expect(screen.queryByText("New Payment")).not.toBeInTheDocument();
    expect(screen.queryByText("Recorded")).not.toBeInTheDocument();
  });
  it("keeps Inspect read-only and opens a continuous full-width object", () => {
    show();
    fireEvent.click(screen.getAllByTitle("Inspect payment")[0]);
    expect(screen.getByText("Open payment")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Open payment"));
    expect(screen.getByTestId("payment-object-scroll")).toBeInTheDocument();
    for (const title of ["Payment facts", "Allocated to", "Evidence", "Receipt", "History"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Void payment" })).not.toBeInTheDocument();
  });
  it("selection only offers output and leaves the same table in place", () => {
    show();
    const table = screen.getByRole("table");
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[0]);
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("table")).toBe(table);
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export Excel (1)" })).toBeInTheDocument();
  });
  it("shows a failed source with recovery rather than a zero total", () => {
    state.isError = true;
    state.data = [];
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("Payments could not be loaded.");
    expect(screen.queryByTestId("payment-register-summary")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalled();
  });
  it("keeps the VOIDED mark when exporting an original receipt amount", async () => {
    show();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select row" })[1]);
    fireEvent.click(screen.getByRole("button", { name: "Export Excel (1)" }));
    await waitFor(() => expect(state.sheet).toHaveBeenCalled());
    expect(state.sheet.mock.calls[0][0]).toEqual([
      expect.objectContaining({ "Receipt No": "RC-060926-0002 · VOIDED", Amount: "100" }),
    ]);
  });
});

// §4 (0449) — the reprint reads the receipt's own snapshot.
describe("Print receipt", () => {
  beforeEach(() => {
    doc.fetch.mockReset();
    doc.render.mockReset().mockResolvedValue(new Blob(["pdf"]));
    Object.defineProperty(URL, "createObjectURL", { value: () => "blob:x", writable: true });
    Object.defineProperty(window, "open", { value: vi.fn(), writable: true });
  });

  function openFirstPayment() {
    show();
    fireEvent.click(screen.getAllByTitle("Inspect payment")[0]);
    fireEvent.click(screen.getByText("Open payment"));
  }

  it("asks the receipt-document door, never the live register row", async () => {
    doc.fetch.mockResolvedValue({
      voided: false, void_reason: null, from_snapshot: true,
      document: { receipt_no: "RC-060926-0001", issue_date: "2026-09-06",
        order_code: "SO-123", customer: { name: "Customer One" }, amount: 200,
        method: "bank", kind: "payment", reference: "BANK-123", note: null, currency: "MYR" },
    });
    openFirstPayment();
    fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    await waitFor(() => expect(doc.render).toHaveBeenCalled());
    expect(doc.fetch).toHaveBeenCalledWith("/api/finance/payments/p1/receipt-document");
    expect(doc.render.mock.calls[0][0]).toMatchObject({
      receipt_no: "RC-060926-0001", voided: false,
    });
  });

  it("carries the VOIDED state into the paper, with its reason", async () => {
    doc.fetch.mockResolvedValue({
      voided: true, void_reason: "Duplicate", from_snapshot: true,
      document: { receipt_no: "RC-060926-0002", issue_date: "2026-09-06",
        order_code: "SO-123", customer: { name: "Customer One" }, amount: 100,
        method: "bank", kind: "payment", reference: null, note: null, currency: "MYR" },
    });
    show();
    fireEvent.click(screen.getAllByTitle("Inspect payment")[1]);
    fireEvent.click(screen.getByText("Open payment"));
    fireEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    await waitFor(() => expect(doc.render).toHaveBeenCalled());
    expect(doc.render.mock.calls[0][0]).toMatchObject({
      voided: true, void_reason: "Duplicate",
    });
  });
});

// §5 · §12 (0450) — reallocation is the Payment Approver's, and the server says so.
describe("Correct allocation", () => {
  function openFirstPayment() {
    show();
    fireEvent.click(screen.getAllByTitle("Inspect payment")[0]);
    fireEvent.click(screen.getByText("Open payment"));
  }

  it("is not offered to an operator who does not hold the duty", () => {
    duty.me = "someone-else";
    openFirstPayment();
    expect(screen.queryByRole("button", { name: "Correct allocation" })).not.toBeInTheDocument();
  });

  it("is offered to the Payment Approver duty holder", () => {
    duty.me = "approver"; duty.actor = "approver";
    openFirstPayment();
    expect(screen.getByRole("button", { name: "Correct allocation" })).toBeInTheDocument();
  });

  it("is offered to principal even with the duty unassigned", () => {
    duty.role = "principal"; duty.me = "boss"; duty.actor = null;
    openFirstPayment();
    expect(screen.getByRole("button", { name: "Correct allocation" })).toBeInTheDocument();
  });

  /** The money is CONSERVED. A short set never reaches the door. */
  it("keeps the door shut until the lines add up to what was received", () => {
    duty.role = "principal"; duty.me = "boss";
    openFirstPayment();
    fireEvent.click(screen.getByRole("button", { name: "Correct allocation" }));
    fireEvent.change(screen.getByLabelText("Why is this being corrected"),
      { target: { value: "wrong SO" } });
    fireEvent.change(screen.getByLabelText("Amount 1"), { target: { value: "150" } });
    expect(screen.getByTestId("correct-allocation-total"))
      .toHaveTextContent("RM 50.00 still to place");
    expect(screen.getAllByRole("button", { name: "Correct allocation" })[0]).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Amount 1"), { target: { value: "200" } });
    expect(screen.getAllByRole("button", { name: "Correct allocation" })[0]).toBeEnabled();
  });

  it("sends the split and its reason to the one door", async () => {
    duty.role = "principal"; duty.me = "boss";
    doc.fetch.mockReset().mockResolvedValue({ payment_id: "p1" });
    openFirstPayment();
    fireEvent.click(screen.getByRole("button", { name: "Correct allocation" }));
    fireEvent.change(screen.getByLabelText("Amount 1"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Add a Sales Order" }));
    fireEvent.change(screen.getByLabelText("Sales Order 2"), { target: { value: "o2" } });
    fireEvent.change(screen.getByLabelText("Amount 2"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Why is this being corrected"),
      { target: { value: "the customer paid for both SOs" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Correct allocation" })[0]);
    await waitFor(() => expect(doc.fetch).toHaveBeenCalled());
    const [url, init] = doc.fetch.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/finance/payments/p1/correct-allocation");
    expect(JSON.parse(init.body)).toEqual({
      reason: "the customer paid for both SOs",
      allocations: [{ orderId: "o1", amount: 120 }, { orderId: "o2", amount: 80 }],
    });
  });
});

