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
  it("renders rows with sup_status chips and RFD-pending indicator", async () => {
    vi.mocked(apiFetch).mockResolvedValue([
      {
        id: "PO-001",
        sup_status: "pickup_assigned",
        request_for_delivery_at: null,
        partner_accepted_at: null,
        partner_rejected_at: null,
        confirm_delivery_date: null,
      },
      {
        id: "PO-002",
        sup_status: "delivered",
        request_for_delivery_at: "2026-05-10T00:00:00Z",
        partner_accepted_at: null,
        partner_rejected_at: null,
        confirm_delivery_date: null,
      },
    ]);
    render(wrap(<PartnerPickupsPage />));
    await waitFor(() => expect(screen.getByText("PO-001")).toBeInTheDocument());
    expect(screen.getByText(/pickup_assigned/i)).toBeInTheDocument();
    expect(screen.getByText(/RFD pending/i)).toBeInTheDocument();
  });
});
