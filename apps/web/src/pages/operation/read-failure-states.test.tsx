import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import OperationAllOrders from "./OperationAllOrders";
import OperationPurchaseInvoices from "./OperationPurchaseInvoices";
import SalesOrderAmendments from "./SalesOrderAmendments";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (path: string) => apiFetch(path) }));

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockRejectedValue(new Error("network down"));
});

function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
  return qc;
}

/** The first read succeeds, then a refetch fails: TanStack keeps data and sets isError. */
async function failRefetch(qc: QueryClient) {
  apiFetch.mockRejectedValue(new Error("network down"));
  await qc.refetchQueries();
  await waitFor(() => expect(qc.getQueryCache().getAll().some((q) => q.state.status === "error")).toBe(true));
}

it("Purchase Invoices: a failed read says so and Try again reads again", async () => {
  mount(<OperationPurchaseInvoices />);
  expect(await screen.findByText("Could not be loaded")).toBeInTheDocument();
  expect(screen.queryByText(/No purchase invoice yet/)).not.toBeInTheDocument();
  const calls = apiFetch.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(apiFetch.mock.calls.length).toBe(calls + 1));
});

it("All Orders: a failed read never reads as no orders, and names the tab", async () => {
  mount(<OperationAllOrders />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not be loaded");
  expect(screen.queryByText("No orders match those filters.")).not.toBeInTheDocument();
  expect(document.title).toBe("All Orders · Sales Orders · Carres");
  expect(screen.getByRole("searchbox", { name: "Search orders" })).toBeInTheDocument();
  const calls = apiFetch.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(apiFetch.mock.calls.length).toBe(calls + 1));
});

it("All Orders: a failed refresh keeps the rows and the count", async () => {
  apiFetch.mockResolvedValue({ orders: [{ id: "o1", so: 101, dealerId: "d1", dealerName: "Dealer One", status: "place", customerName: "Ali", paid: 0, total: 100, qtyTotal: 1, placedAt: null }] });
  const qc = mount(<OperationAllOrders />);
  expect(await screen.findByText("SO-101")).toBeInTheDocument();
  await failRefetch(qc);
  expect(await screen.findByText(/Could not refresh/)).toBeInTheDocument();
  expect(screen.getByText("SO-101")).toBeInTheDocument();
  expect(screen.getByText(/1 order. Read-only/)).toBeInTheDocument();
  expect(screen.queryByText("Could not be loaded")).not.toBeInTheDocument();
});

it("Purchase Invoices: a failed refresh keeps the rows", async () => {
  apiFetch.mockResolvedValue({ rows: [{ id: "b1", bill_no: "BILL-7", status: "posted", supplier_name: "Supplier Seven", supplier_invoice_no: "INV-7", bill_date: "2026-10-01", due_date: null, po_id: null, total_amount: 10, paid_total: 0, unpaid: 10, mine: false }] });
  const qc = mount(<OperationPurchaseInvoices />);
  expect(await screen.findByText("BILL-7")).toBeInTheDocument();
  await failRefetch(qc);
  expect(screen.getByText("BILL-7")).toBeInTheDocument();
  expect(screen.queryByText("Could not be loaded")).not.toBeInTheDocument();
});

it("Amendments: a failed refresh keeps the rows", async () => {
  apiFetch.mockResolvedValue({ amendments: [{ id: "a1", orderId: "o1", so: 202, status: "waiting", customerName: "Customer Two", reason: "Change colour", submittedBy: "Staff", submittedAt: "2026-10-01", agreementRecorded: false, decidedBy: null, decidedAt: null, decisionNote: null }] });
  const qc = mount(<SalesOrderAmendments />);
  expect(await screen.findByText("SO-202")).toBeInTheDocument();
  await failRefetch(qc);
  expect(screen.getByText("SO-202")).toBeInTheDocument();
  expect(screen.queryByText("Could not be loaded")).not.toBeInTheDocument();
});
