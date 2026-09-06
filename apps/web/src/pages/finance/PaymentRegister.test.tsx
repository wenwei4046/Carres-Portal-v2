import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaymentRegister from "./PaymentRegister";

const state = vi.hoisted(() => ({ data: [] as unknown[], isLoading: false, isError: false,
  refetch: vi.fn(), error: null as Error | null }));
vi.mock("@/lib/queries", () => ({ usePaymentRegister: () => state }));
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => null }));
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
});
