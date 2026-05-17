import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import FinanceInvoices from "./FinanceInvoices";

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

const ROW_PAID = {
  order_id: "00000000-0000-0000-0000-0000000000a1", dl: 1240,
  customer_name: "Tan Wei Ling", dealer_id: "d1", dealer_name: "Showroom KL",
  placed_at: "2026-04-30T00:00:00Z", days: 8, aging: "0-30",
  total: 5970, paid: 5970, outstanding: 0,
  invoice_no: "INV-2026-1240", status: "delivered",
};
const ROW_UNPAID = {
  ...ROW_PAID, order_id: "00000000-0000-0000-0000-0000000000a2", dl: 1241,
  customer_name: "Lee Kah Hong", paid: 0, outstanding: 5970,
  invoice_no: "INV-2026-1241", status: "place",
};
const ROW_PARTIAL = {
  ...ROW_PAID, order_id: "00000000-0000-0000-0000-0000000000a3", dl: 1242,
  customer_name: "Wong Mei Lin", paid: 2985, outstanding: 2985,
  invoice_no: "INV-2026-1242", status: "operation",
};

const PAYLOAD = {
  rows: [ROW_PAID, ROW_UNPAID, ROW_PARTIAL],
  buckets: { "0-30": { amount: 8955, count: 2 }, "31-60": { amount: 0, count: 0 }, "61-90": { amount: 0, count: 0 }, "90+": { amount: 0, count: 0 } },
};

describe("FinanceInvoices page", () => {
  it("renders 3 KPIs + 4 tabs with status counts derived from outstanding/paid", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/ar-aging")) return PAYLOAD;
      if (url.includes("/invoices")) return [];
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceInvoices />));

    await waitFor(() => {
      expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
    });

    expect(screen.getByText("Gross billed")).toBeInTheDocument();
    expect(screen.getByText("Net (excl. tax)")).toBeInTheDocument();
    expect(screen.getByText("SST collected")).toBeInTheDocument();

    // tabs render counts: All=3, Unpaid=1, Partial=1, Paid=1
    expect(screen.getByRole("button", { name: /All.*3/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unpaid.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Partial.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Paid.*1/ })).toBeInTheDocument();
  });

  it("filters table by status tab (Paid -> only paid invoice visible)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/ar-aging")) return PAYLOAD;
      if (url.includes("/invoices")) return [];
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceInvoices />));

    await waitFor(() => {
      expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Paid.*1/ }));

    expect(screen.getByText("INV-2026-1240")).toBeInTheDocument();
    expect(screen.queryByText("INV-2026-1241")).not.toBeInTheDocument();
    expect(screen.queryByText("INV-2026-1242")).not.toBeInTheDocument();
  });

  it("PDF button on unpaid row warns instead of downloading", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/ar-aging")) return PAYLOAD;
      if (url.includes("/invoices")) return [];
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceInvoices />));

    await waitFor(() => {
      expect(screen.getByText("INV-2026-1241")).toBeInTheDocument();
    });

    // Click Unpaid tab to isolate the unpaid row's PDF button
    fireEvent.click(screen.getByRole("button", { name: /Unpaid.*1/ }));
    const pdfBtn = screen.getByRole("button", { name: "PDF" });
    fireEvent.click(pdfBtn);

    // toast.warning shows the gating message — Sonner renders it asynchronously
    await waitFor(() => {
      expect(screen.getByText(/not yet finalised/i)).toBeInTheDocument();
    });
  });
});
