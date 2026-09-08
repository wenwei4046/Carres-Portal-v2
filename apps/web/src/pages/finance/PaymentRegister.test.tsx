import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaymentRegister from "./PaymentRegister";

const state = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false,
  refetch: vi.fn(), error: null as Error | null, sheet: vi.fn((_data: unknown) => ({})) }));
vi.mock("xlsx", () => ({ utils: { json_to_sheet: state.sheet, book_new: () => ({}),
  book_append_sheet: vi.fn() }, writeFile: vi.fn() }));
vi.mock("@/lib/queries", () => ({ usePaymentRegister: () => state }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
const doc = vi.hoisted(() => ({ fetch: vi.fn(), render: vi.fn() }));
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
  localStorage.clear();
});
function show() { return render(<MemoryRouter><PaymentRegister /></MemoryRouter>); }
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
