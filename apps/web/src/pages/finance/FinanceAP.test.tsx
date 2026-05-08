import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import FinanceAP from "./FinanceAP";

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
import { apiFetch } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      {ui}
      <Toaster />
    </QueryClientProvider>
  );
}

const ROW_MATCHED = {
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
  pay_status:          "unpaid" as const,
  pay_status_ui:       "matched" as const,
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
  history: [],
};

const ROW_INPROD = {
  ...ROW_MATCHED,
  po_id:         "PO-2046",
  status:        "open",
  sup_status:    "in_production",
  pay_status_ui: "in_production" as const,
  do_number:     null,
  has_do:        false,
  total:         8400,
};

const AP_PAYLOAD = {
  rows: [ROW_MATCHED, ROW_INPROD],
  byPayStatus: {
    matched:       { amount: 12500, count: 1 },
    scheduled:     { amount: 0,     count: 0 },
    paid:          { amount: 0,     count: 0 },
    in_transit:    { amount: 0,     count: 0 },
    in_production: { amount: 8400,  count: 1 },
  },
};

describe("FinanceAP page", () => {
  it("renders 3 KPIs + 5 tabs with counts from byPayStatus", async () => {
    vi.mocked(apiFetch).mockResolvedValue(AP_PAYLOAD);

    render(wrap(<FinanceAP />));

    // Default tab is 'matched' so the matched row's PO renders
    await waitFor(() => {
      expect(screen.getByText("PO-2050")).toBeInTheDocument();
    });

    // KPI labels — "Ready to pay" appears twice (KPI + tab) so use getAll
    expect(screen.getAllByText("Ready to pay").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Paid this month")).toBeInTheDocument();
    expect(screen.getByText("Total exposure")).toBeInTheDocument();

    // Tab bar — 5 buttons with counts
    expect(screen.getByRole("button", { name: /Ready to pay.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /In production.*1/ })).toBeInTheDocument();
  });

  it("filters rows by tab selection (matched -> in_production)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(AP_PAYLOAD);

    render(wrap(<FinanceAP />));

    await waitFor(() => {
      expect(screen.getByText("PO-2050")).toBeInTheDocument();
    });

    // Default tab matched: PO-2050 visible, PO-2046 hidden
    expect(screen.queryByText("PO-2046")).not.toBeInTheDocument();

    // Click In production tab
    fireEvent.click(screen.getByRole("button", { name: /In production/ }));

    expect(screen.getByText("PO-2046")).toBeInTheDocument();
    expect(screen.queryByText("PO-2050")).not.toBeInTheDocument();
  });

  it("clicking View opens APDrawer with 3-way match card", async () => {
    vi.mocked(apiFetch).mockResolvedValue(AP_PAYLOAD);

    render(wrap(<FinanceAP />));

    await waitFor(() => {
      expect(screen.getByText("PO-2050")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "View" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Payable PO-2050/ })).toBeInTheDocument();
      expect(screen.getByText("Three-way match")).toBeInTheDocument();
    });
  });
});
