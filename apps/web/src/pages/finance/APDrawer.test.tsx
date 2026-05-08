import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import APDrawer from "./APDrawer";
import type { FinanceApAgingRow } from "@/lib/queries";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, message: string, body: unknown) {
      super(message);
      this.status = status;
      this.body = body;
      this.name = "ApiError";
    }
  },
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
}

const BASE: FinanceApAgingRow = {
  po_id:               "PO-2050",
  dl:                  1240,
  supplier_id:         "s1",
  supplier_name:       "Acme Bedworks",
  warehouse_id:        "w1",
  delivery_partner_id: null,
  placed_at:           "2026-04-29T00:00:00Z",
  expected_ready_date: "2026-05-10",
  eta_date:            "2026-05-12",
  pickup_date:         null,
  status:              "received",
  sup_status:          "delivered",
  pay_status:          "unpaid",
  pay_status_ui:       "matched",
  qty:                 10,
  total:               12500,
  do_number:           "DO-44128",
  has_do:              true,
  due_in:              4,
  lines: [
    {
      sku:          "SKU-A",
      sku_name:     "Bed Frame · Queen",
      qty:          10,
      received_qty: 10,
      unit_cost:    1250,
      line_total:   12500,
    },
  ],
  history: [
    { text: "PO created", occurred_at: "2026-04-29T08:00:00Z", by_role: "logistics" },
  ],
};

describe("APDrawer", () => {
  it("renders 3-way match card with all 3 pills resolved on matched row", () => {
    render(wrap(<APDrawer row={BASE} onClose={() => {}} />));

    // 3-way match section title
    expect(screen.getByText("Three-way match")).toBeInTheDocument();

    // All 3 labels present (PO / DO / SI)
    expect(screen.getByText("Purchase Order")).toBeInTheDocument();
    expect(screen.getByText("Delivery Order")).toBeInTheDocument();
    expect(screen.getByText("Supplier Invoice")).toBeInTheDocument();

    // The DO pill resolves to the actual do_number
    expect(screen.getByText("DO-44128")).toBeInTheDocument();
  });

  it("shows Schedule + Mark paid buttons on matched row, swaps to Confirm payment when Mark paid clicked", () => {
    render(wrap(<APDrawer row={BASE} onClose={() => {}} />));

    expect(screen.getByRole("button", { name: "Schedule payment" })).toBeInTheDocument();
    const markPaidBtn = screen.getByRole("button", { name: "Mark as paid" });
    expect(markPaidBtn).toBeInTheDocument();

    fireEvent.click(markPaidBtn);

    // Form panel opens — amount field + Confirm payment button
    expect(screen.getByRole("textbox", { name: "Amount" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm payment" })).toBeInTheDocument();
  });

  it("shows Release payment on scheduled row, no Schedule button", () => {
    const scheduled: FinanceApAgingRow = { ...BASE, pay_status_ui: "scheduled", pay_status: "scheduled" };
    render(wrap(<APDrawer row={scheduled} onClose={() => {}} />));

    expect(screen.getByRole("button", { name: "Release payment" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as paid" })).not.toBeInTheDocument();
  });

  it("shows no action buttons on paid / in_production rows", () => {
    const paid: FinanceApAgingRow = { ...BASE, pay_status_ui: "paid", pay_status: "paid" };
    render(wrap(<APDrawer row={paid} onClose={() => {}} />));

    expect(screen.queryByRole("button", { name: "Schedule payment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark as paid" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Release payment" })).not.toBeInTheDocument();
  });
});
