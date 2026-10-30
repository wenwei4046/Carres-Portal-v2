import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewSalesInvoiceDialog from "./NewSalesInvoiceDialog";

// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): office staff open a Sales
// Invoice by hand, part invoices allowed. Jess was not part of this decision.
const state = vi.hoisted(() => ({ fetch: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/api", () => ({
  apiFetch: state.fetch,
  ApiError: class ApiError extends Error {},
}));
vi.mock("sonner", () => ({ toast: { success: state.toast } }));

const OFFER = {
  order: { id: "o1", so: 1300, customer_name: "LIM KUAN YANG", cancelled: false },
  whole_invoice_no: null,
  addons_pending: true,
  addons: [{ addon_key: "DELIVERY", qty: 1, unit_price: 100 }],
  lines: [
    { order_line_id: "bed", sku: "MS12 Firmcare 10inch Queen", qty: 2, unit_price: 1000, invoiced: 1, left: 1 },
    { order_line_id: "sofa", sku: "SF03 Muro 2 Seater", qty: 1, unit_price: 500, invoiced: 0, left: 1 },
  ],
  delivery_order: { do_number: "DO-0001", groups: ["bed"] },
};

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NewSalesInvoiceDialog />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.fetch.mockReset();
  state.toast.mockReset();
  state.fetch.mockImplementation(async (url: string) =>
    url.includes("office-offer") ? OFFER : { invoiceNo: "INV-221026-0002", amount: 1100 });
});

describe("New Sales Invoice", () => {
  it("found by a DO, ticks only that DO's goods and invoices them", async () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "New Sales Invoice" }));
    fireEvent.change(screen.getByLabelText("SO No or DO No"), { target: { value: "do-0001" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));

    await screen.findByText("Invoice total RM 1,100.00", { exact: false });
    expect(state.fetch).toHaveBeenCalledWith("/api/finance/invoices/office-offer/do-0001");
    expect(screen.getByRole("checkbox", { name: /MS12 Firmcare/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /SF03 Muro/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Create Sales Invoice" }));
    await waitFor(() => expect(state.toast).toHaveBeenCalledWith("INV-221026-0002 created"));
    const [, init] = state.fetch.mock.calls.find(([u]) => u === "/api/finance/invoices/office")!;
    expect(JSON.parse(init.body)).toEqual({ orderId: "o1", lines: [{ orderLineId: "bed", qty: 1 }] });
  });

  it("refuses a Sales Order already on a whole-order invoice", async () => {
    state.fetch.mockResolvedValueOnce({ ...OFFER, whole_invoice_no: "INV-011026-0001", delivery_order: null });
    show();
    fireEvent.click(screen.getByRole("button", { name: "New Sales Invoice" }));
    fireEvent.change(screen.getByLabelText("SO No or DO No"), { target: { value: "1300" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    await screen.findByText("This Sales Order is already on Sales Invoice INV-011026-0001.");
    expect(screen.getByRole("button", { name: "Create Sales Invoice" })).toBeDisabled();
  });

  it("found by a part-invoiced SO, shows every line: a fully billed one unticked and locked, a part one at what is left", async () => {
    state.fetch.mockResolvedValueOnce({
      ...OFFER,
      delivery_order: null,
      lines: [
        { order_line_id: "bed", sku: "MS12 Firmcare 10inch Queen", qty: 2, unit_price: 1000, invoiced: 1, left: 1 },
        { order_line_id: "sofa", sku: "SF03 Muro 2 Seater", qty: 1, unit_price: 500, invoiced: 1, left: 0 },
      ],
    });
    show();
    fireEvent.click(screen.getByRole("button", { name: "New Sales Invoice" }));
    fireEvent.change(screen.getByLabelText("SO No or DO No"), { target: { value: "1300" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    const sofa = await screen.findByRole("checkbox", { name: /SF03 Muro .* 0 left to invoice/ });
    expect(sofa).not.toBeChecked();
    expect(sofa).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /MS12 Firmcare/ })).toBeChecked();
    expect(screen.getByLabelText("Qty", { selector: "#new-si-qty-bed" })).toHaveValue(1);
  });

  it("a failed find offers Try again, which reads again", async () => {
    state.fetch.mockRejectedValueOnce(new Error("Failed to fetch"));
    show();
    fireEvent.click(screen.getByRole("button", { name: "New Sales Invoice" }));
    fireEvent.change(screen.getByLabelText("SO No or DO No"), { target: { value: "1300" } });
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("Invoice total RM 1,100.00", { exact: false });
    expect(state.fetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

