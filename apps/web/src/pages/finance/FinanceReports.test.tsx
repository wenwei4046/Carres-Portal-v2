import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import FinanceReports from "./FinanceReports";

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

const PL_PAYLOAD = {
  rows: [
    { m: "Nov 25", revenue: 184500, cogs: 101475, opex: 42000, net: 41025 },
    { m: "Dec 25", revenue: 221800, cogs: 121990, opex: 42000, net: 57810 },
    { m: "Jan 26", revenue: 168300, cogs: 92565,  opex: 42000, net: 33735 },
    { m: "Feb 26", revenue: 192700, cogs: 105985, opex: 42000, net: 44715 },
    { m: "Mar 26", revenue: 245100, cogs: 134805, opex: 42000, net: 68295 },
    { m: "Apr 26", revenue: 228600, cogs: 125730, opex: 42000, net: 60870 },
  ],
};

const TOP_SKUS_PAYLOAD = {
  rows: [
    { sku: "SKU-A", name: "Hoo OK Mattress · Queen", qty: 24, revenue: 35880 },
    { sku: "SKU-B", name: "Bed Frame · Queen",       qty: 18, revenue: 22500 },
    { sku: "SKU-C", name: "Sofa · 3-seater",         qty: 12, revenue: 18000 },
  ],
};

describe("FinanceReports page", () => {
  it("renders 4 KPIs from latest month + period dropdown, and no Export button", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("monthly-pl")) return PL_PAYLOAD;
      if (url.includes("top-skus"))   return TOP_SKUS_PAYLOAD;
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceReports />));

    await waitFor(() => {
      // "Apr 26" appears in BOTH KPI labels AND P&L table — use getAllByText
      expect(screen.getAllByText(/Apr 26/).length).toBeGreaterThanOrEqual(1);
    });

    // KPI labels — Revenue + month label
    expect(screen.getByText(/Revenue · Apr 26/)).toBeInTheDocument();
    expect(screen.getByText("Net profit")).toBeInTheDocument();
    // "Opex" appears in BOTH KPI label AND P&L table column header
    expect(screen.getAllByText("Opex").length).toBeGreaterThanOrEqual(2);

    // Period dropdown; the YTD choice carries the business year, not a literal
    expect(screen.getByRole("combobox", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: `YTD ${new Date().getFullYear()}` })).toBeInTheDocument();
    // No export exists yet, so no button promises one
    expect(screen.queryByRole("button", { name: /export/i })).not.toBeInTheDocument();
  });

  it("renders P&L table rows + Top SKUs bar list", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("monthly-pl")) return PL_PAYLOAD;
      if (url.includes("top-skus"))   return TOP_SKUS_PAYLOAD;
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceReports />));

    await waitFor(() => {
      expect(screen.getByText("Hoo OK Mattress · Queen")).toBeInTheDocument();
    });

    // "Nov 25" / "Mar 26" appear in both the P&L table and the SVG chart's
    // x-axis text labels — getAllByText handles both render sites.
    expect(screen.getAllByText("Nov 25").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Mar 26").length).toBeGreaterThanOrEqual(1);

    // SKU rows render with unit counts
    expect(screen.getByText(/24 units sold/)).toBeInTheDocument();
  });

  it("changing period dropdown re-fetches with different months arg", async () => {
    let lastUrl = "";
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      lastUrl = url;
      if (url.includes("monthly-pl")) return PL_PAYLOAD;
      if (url.includes("top-skus"))   return TOP_SKUS_PAYLOAD;
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceReports />));

    await waitFor(() => {
      expect(screen.getAllByText(/Apr 26/).length).toBeGreaterThanOrEqual(1);
    });

    // Switch to Last 12 months — re-issues fetch with months=12
    fireEvent.change(screen.getByRole("combobox", { name: "Period" }), {
      target: { value: "12m" },
    });

    await waitFor(() => {
      expect(lastUrl).toMatch(/monthly-pl\?months=12/);
    });
  });
});
