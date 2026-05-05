import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PartnerDashboard from "./PartnerDashboard";

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

describe("PartnerDashboard", () => {
  it("renders KPI tiles + 3-col pipeline", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      assigned: 3,
      accepted: 2,
      in_transit: 1,
      delivered: 5,
      total: 11,
    });
    render(wrap(<PartnerDashboard />));
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    // "Assigned", "Accepted", "In transit" appear in both the KPI tile and the
    // pipeline column header, so use getAllByText (≥1) — both are intended.
    expect(screen.getAllByText(/assigned/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/in.transit/i).length).toBeGreaterThan(0);
    // "Delivered" only appears in the KPI strip (no pipeline column for it),
    // so the singular query is fine here.
    expect(screen.getByText(/delivered/i)).toBeInTheDocument();
  });
});
