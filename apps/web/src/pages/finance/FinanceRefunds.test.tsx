import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import FinanceRefunds from "./FinanceRefunds";

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

const CN_ISSUED = {
  id:                  "00000000-0000-0000-0000-000000ee0001",
  order_id:            "00000000-0000-0000-0000-000000ee0011",
  dealer_id:           "d1",
  amount:              480,
  reason:              "Frame defect — partial credit",
  status:              "approved" as const,
  approval_id:         null,
  approved_at:         "2026-04-08T00:00:00Z",
  paid_at:             null,
  credit_note_no:      "CN-0024",
  applied_to_order_id: null,
  created_at:          "2026-04-08T00:00:00Z",
};
const CN_APPLIED = {
  ...CN_ISSUED,
  id:                  "00000000-0000-0000-0000-000000ee0002",
  amount:              2100,
  reason:              "Wrong size — refund balance",
  status:              "paid" as const,
  paid_at:             "2026-04-12T00:00:00Z",
  credit_note_no:      "CN-0023",
  applied_to_order_id: "00000000-0000-0000-0000-000000ee0099",
};
const RF_PENDING = {
  ...CN_ISSUED,
  id:                  "00000000-0000-0000-0000-000000ee0003",
  amount:              3290,
  reason:              "Cancelled before delivery",
  status:              "pending" as const,
  approved_at:         null,
  credit_note_no:      null,
  applied_to_order_id: null,
};

describe("FinanceRefunds page", () => {
  it("renders 3 KPIs + table with CN/RF rows + correct UI status labels", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/refunds")) return [CN_ISSUED, CN_APPLIED, RF_PENDING];
      if (url.includes("/ar-aging")) return { rows: [], buckets: {} };
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceRefunds />));

    await waitFor(() => {
      expect(screen.getByText("CN-0024")).toBeInTheDocument();
    });

    expect(screen.getByText("CN-0023")).toBeInTheDocument();
    // RF row uses synthetic prefix from id
    expect(screen.getByText(/^RF-/)).toBeInTheDocument();

    // KPI labels — "Issued" shows in BOTH KPI label AND pill (for CN-0024)
    expect(screen.getAllByText("Issued").length).toBeGreaterThanOrEqual(2);
    // "Pending / approved" appears as KPI label
    expect(screen.getByText("Pending / approved")).toBeInTheDocument();
    expect(screen.getByText("Applied / paid")).toBeInTheDocument();

    // Status pills — Applied appears once (CN-0023), Pending once (RF row)
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("clicking + Issue credit note opens modal with kind toggle", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/refunds")) return [];
      if (url.includes("/ar-aging")) return { rows: [], buckets: {} };
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceRefunds />));

    await waitFor(() => {
      expect(screen.getByText(/No refunds or credit notes yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "+ Issue credit note" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Credit note" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refund" })).toBeInTheDocument();
    });
  });

  it("modal switches to refund kind + shows RM 1,000 approval warning when amount exceeds", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.includes("/refunds")) return [];
      if (url.includes("/ar-aging")) return { rows: [] };
      throw new Error(`unexpected fetch ${url}`);
    });
    render(wrap(<FinanceRefunds />));

    await waitFor(() => {
      expect(screen.getByText(/No refunds or credit notes yet/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "+ Issue credit note" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Refund" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Amount" }), {
      target: { value: "1500" },
    });

    await waitFor(() => {
      expect(screen.getByText(/require principal approval/i)).toBeInTheDocument();
    });
  });
});
