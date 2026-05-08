import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import FinanceAR from "./FinanceAR";

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

const ROW_OPEN = {
  order_id:      "00000000-0000-0000-0000-000000000a01",
  dl:            1240,
  customer_name: "Tan Wei Ling",
  dealer_id:     "d1",
  dealer_name:   "Showroom KL",
  placed_at:     "2026-04-30T00:00:00Z",
  days:          8,
  aging:         "0-30",
  total:         5970,
  paid:          0,
  outstanding:   5970,
  invoice_no:    "INV-2026-1240",
  status:        "place",
};
const ROW_SETTLED = {
  ...ROW_OPEN,
  order_id:      "00000000-0000-0000-0000-000000000a02",
  dl:            1239,
  customer_name: "Lee Kah Hong",
  outstanding:   0,
  paid:          5970,
  status:        "delivered",
  invoice_no:    "INV-2026-1239",
};

const AR_PAYLOAD = {
  rows: [ROW_OPEN, ROW_SETTLED],
  buckets: {
    "0-30":  { amount: 5970, count: 1 },
    "31-60": { amount: 0,    count: 0 },
    "61-90": { amount: 0,    count: 0 },
    "90+":   { amount: 0,    count: 0 },
  },
};

describe("FinanceAR page", () => {
  it("renders KPIs + table rows for outstanding receivables (default 'open' filter)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("ar-aging")) return AR_PAYLOAD;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<FinanceAR />));

    await waitFor(() => {
      // The open row's invoice number renders
      expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
    });

    // KPI labels (Gross billed unique; Outstanding appears in KPI + column
    // header so getAllByText length >= 1)
    expect(screen.getByText("Gross billed")).toBeInTheDocument();
    expect(screen.getAllByText("Outstanding").length).toBeGreaterThan(0);

    // Default filter is 'open' — settled row should NOT appear
    expect(screen.queryByText("INV-2026-1239")).not.toBeInTheDocument();
  });

  it("toggles to 'all' filter and surfaces settled rows", async () => {
    vi.mocked(apiFetch).mockResolvedValue(AR_PAYLOAD);

    render(wrap(<FinanceAR />));

    await waitFor(() => {
      expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
    });

    // Click "All" — both rows visible
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("INV-2026-1239")).toBeInTheDocument();
  });

  it("opens AR drawer when View clicked, shows Record receipt button", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("ar-aging")) return AR_PAYLOAD;
      if (url.includes("payments?orderId=")) return [];
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<FinanceAR />));

    await waitFor(() => {
      expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
    });

    // First View button — opens drawer for the open row
    const viewBtns = screen.getAllByText("View");
    fireEvent.click(viewBtns[0]);

    await waitFor(() => {
      // Drawer renders Record receipt button (only on outstanding > 0)
      expect(screen.getByRole("button", { name: "Record receipt" })).toBeInTheDocument();
    });
  });

  it("settled row drawer renders Issue invoice as enabled when status=delivered + outstanding=0", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("ar-aging")) return AR_PAYLOAD;
      if (url.includes("payments?orderId=")) return [];
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<FinanceAR />));

    await waitFor(() => {
      expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
    });

    // Switch to All filter, then click View on settled row
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    const viewBtns = screen.getAllByText("View");
    // settled row is INV-2026-1239 (the lower invoice number renders second
    // since rows aren't re-sorted in the page; the test fixture has settled
    // second). Click the second View button.
    fireEvent.click(viewBtns[1]);

    await waitFor(() => {
      const issueBtn = screen.getByRole("button", { name: /Issue invoice/i });
      expect(issueBtn).toBeInTheDocument();
      expect(issueBtn).not.toBeDisabled();
    });
  });
});
