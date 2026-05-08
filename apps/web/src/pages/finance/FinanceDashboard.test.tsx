import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FinanceDashboard from "./FinanceDashboard";

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

const SUMMARY = {
  ar: { outstanding: 21325, count: 6, overdueAmt: 0, overdueCount: 0 },
  ap: { dueAmt: 8400, count: 2 },
  cashflow12w: { inflow: 92000, outflow: 41000, net: 51000 },
  agingBuckets: {
    "0-30":  { amount: 21325, count: 6 },
    "31-60": { amount: 0,     count: 0 },
    "61-90": { amount: 0,     count: 0 },
    "90+":   { amount: 0,     count: 0 },
  },
};
const AGING = {
  rows: [],
  buckets: SUMMARY.agingBuckets,
};

describe("FinanceDashboard", () => {
  it("renders 4 KPIs sourced from finance_dashboard_summary RPC", async () => {
    // Both hooks fire on mount; route by URL so we serve each its own payload
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("dashboard-summary")) return SUMMARY;
      if (url.includes("ar-aging")) return AGING;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<FinanceDashboard />));

    await waitFor(() => {
      expect(screen.getByText("A/R Outstanding")).toBeInTheDocument();
    });

    // 4 KPI labels (now that the loading state is gone)
    expect(screen.getByText(/Overdue.*30d/i)).toBeInTheDocument();
    expect(screen.getByText("A/P Due")).toBeInTheDocument();
    expect(screen.getByText(/Net cash.*12 wks/i)).toBeInTheDocument();

    // Net cash positive -> shows compact value (RM 51.0k)
    expect(screen.getByText("RM 51.0k")).toBeInTheDocument();
  });

  it("renders A/R Aging card with 4 bucket rows (0-30, 31-60, 61-90, 90+)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("dashboard-summary")) return SUMMARY;
      if (url.includes("ar-aging")) return AGING;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<FinanceDashboard />));

    await waitFor(() => {
      expect(screen.getByText("Outstanding by age")).toBeInTheDocument();
    });

    // All 4 buckets render in the card
    expect(screen.getByText("0-30 days")).toBeInTheDocument();
    expect(screen.getByText("31-60 days")).toBeInTheDocument();
    expect(screen.getByText("61-90 days")).toBeInTheDocument();
    expect(screen.getByText("90+ days")).toBeInTheDocument();
  });

  it("falls back to defaults + still renders skeleton when API errors", async () => {
    // Even on error, the page should render the structure (won't crash);
    // the summary error banner appears once the hook surfaces an error.
    vi.mocked(apiFetch).mockRejectedValue(new Error("network down"));

    render(wrap(<FinanceDashboard />));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load dashboard summary/i)).toBeInTheDocument();
    });
  });
});
