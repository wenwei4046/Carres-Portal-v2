import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FinancePayments from "./FinancePayments";

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
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const PAYLOAD = {
  rows: [
    {
      order_id: "o1", so: 1240, customer_name: "Tan Wei Ling",
      dealer_id: "d1", dealer_name: "Showroom KL",
      placed_at: "2026-04-30T00:00:00Z", days: 8, aging: "0-30",
      total: 5970, paid: 0, outstanding: 5970,
      invoice_no: "INV-2026-1240", status: "place",
    },
    {
      order_id: "o2", so: 1241, customer_name: "Lee Kah Hong",
      dealer_id: "d2", dealer_name: "Showroom Penang",
      placed_at: "2026-04-25T00:00:00Z", days: 13, aging: "0-30",
      total: 4000, paid: 2000, outstanding: 2000,
      invoice_no: "INV-2026-1241", status: "proceed_order",
    },
    {
      order_id: "o3", so: 1239, customer_name: "Ng Sue Mei",
      dealer_id: "d1", dealer_name: "Showroom KL",
      placed_at: "2026-04-20T00:00:00Z", days: 18, aging: "0-30",
      total: 5970, paid: 5970, outstanding: 0,
      invoice_no: "INV-2026-1239", status: "delivered",
    },
  ],
  buckets: {
    "0-30":  { amount: 7970, count: 2 },
    "31-60": { amount: 0,    count: 0 },
    "61-90": { amount: 0,    count: 0 },
    "90+":   { amount: 0,    count: 0 },
  },
};

describe("FinancePayments page", () => {
  it("renders all 3 buckets when default 'All' filter active", async () => {
    vi.mocked(apiFetch).mockResolvedValue(PAYLOAD);
    render(wrap(<FinancePayments />));

    await waitFor(() => {
      expect(screen.getByText("SO-1240")).toBeInTheDocument();
    });

    expect(screen.getByText("SO-1241")).toBeInTheDocument();
    expect(screen.getByText("SO-1239")).toBeInTheDocument();
  });

  it("filters to 'Unpaid' (only SO-1240 with paid=0)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(PAYLOAD);
    render(wrap(<FinancePayments />));

    await waitFor(() => {
      expect(screen.getByText("SO-1240")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Unpaid" }));
    expect(screen.getByText("SO-1240")).toBeInTheDocument();
    expect(screen.queryByText("SO-1241")).not.toBeInTheDocument();
    expect(screen.queryByText("SO-1239")).not.toBeInTheDocument();
  });

  it("filters to 'Fully paid' (only SO-1239 with paid=total)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(PAYLOAD);
    render(wrap(<FinancePayments />));

    await waitFor(() => {
      expect(screen.getByText("SO-1239")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Fully paid" }));
    expect(screen.getByText("SO-1239")).toBeInTheDocument();
    expect(screen.queryByText("SO-1240")).not.toBeInTheDocument();
  });

  it("KPI 'Balance to collect' sums outstanding across visible rows", async () => {
    vi.mocked(apiFetch).mockResolvedValue(PAYLOAD);
    render(wrap(<FinancePayments />));

    // wait for actual data to land (SO-1240 row); the KPI labels appear
    // immediately even during loading (rendering with 0 totals), so waiting
    // for them isn't enough.
    await waitFor(() => {
      expect(screen.getByText("SO-1240")).toBeInTheDocument();
    });

    // Default "All" filter:
    //   gross   = 5970 + 4000 + 5970 = 15940 -> RM 15.9k
    //   paid    = 0 + 2000 + 5970    = 7970  -> RM 8.0k (also matches balance)
    //   balance = 5970 + 2000 + 0    = 7970  -> RM 8.0k
    // "RM 8.0k" appears twice (Collected + Balance to collect) — assert
    // both via getAllByText.
    expect(screen.getAllByText("RM 8.0k").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("RM 15.9k")).toBeInTheDocument();
  });
});
