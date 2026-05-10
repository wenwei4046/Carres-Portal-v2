import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
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
  // 2026-05-10: dashboard uses <Link> for "See all pickups" + preview cards.
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PartnerDashboard", () => {
  it("renders KPI tiles + 3-col pipeline preview + side rail", async () => {
    // 2026-05-10 (Loo) — page now fans out to three endpoints:
    // /api/partner/dashboard for KPI counts, /api/partner/pickups for the
    // active-pipeline preview, /api/partner/fleet for the side-rail Fleet
    // section. Mock each by URL.
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.includes("/dashboard")) {
        return {
          upcoming: 0,
          ready: 0,
          assigned: 3,
          accepted: 2,
          in_transit: 1,
          delivered: 5,
          total: 11,
        };
      }
      if (path.includes("/fleet")) return [];
      if (path.includes("/pickups")) return [];
      return [];
    });
    render(wrap(<PartnerDashboard />));
    await waitFor(() => expect(screen.getByText("3")).toBeInTheDocument());
    // KPI labels are unique enough; pipeline column labels overlap with KPIs.
    expect(screen.getAllByText(/assigned/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/in.transit/i).length).toBeGreaterThan(0);
    // "Delivered" appears in the KPI tile AND in the "Recently delivered"
    // side card title — both are intended.
    expect(screen.getAllByText(/delivered/i).length).toBeGreaterThan(0);
  });
});
