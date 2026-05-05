import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerPickupsPage from "./PartnerPickupsPage";

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

describe("PartnerPickupsPage", () => {
  it("renders rows with sup_status chips", async () => {
    // Phase 4.5 Chunk 2 Sprint C T8' — the 4 customer-leg fields
    // (confirm_delivery_date, request_for_delivery_at, partner_accepted_at,
    // partner_rejected_at) were dropped from `purchase_orders` (migration
    // 0052/0053) — they live on `order_supplier_threads` now. The
    // PO-sourced RFD-pending indicator + Accept/Reject button were removed
    // from PartnerPickupsPage; customer-leg RFD UI for partners is a Chunk 2
    // carry-forward and must source state from threads when it lands.
    vi.mocked(apiFetch).mockResolvedValue([
      {
        id: "PO-001",
        sup_status: "pickup_assigned",
      },
      {
        id: "PO-002",
        sup_status: "delivered",
      },
    ]);
    render(wrap(<PartnerPickupsPage />));
    await waitFor(() => expect(screen.getByText("PO-001")).toBeInTheDocument());
    expect(screen.getByText(/pickup_assigned/i)).toBeInTheDocument();
    expect(screen.getByText("PO-002")).toBeInTheDocument();
    expect(screen.getByText(/delivered/i)).toBeInTheDocument();
  });
});
