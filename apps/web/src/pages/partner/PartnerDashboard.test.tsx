import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("a failed read says Could not be loaded, not zero, and Try again refetches", async () => {
    let fail = true;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path.includes("/dashboard")) {
        if (fail) throw new Error("boom");
        return { upcoming: 0, ready: 0, assigned: 7, accepted: 0, in_transit: 0, delivered: 0, total: 7 };
      }
      return [];
    });
    render(wrap(<PartnerDashboard />));
    expect(await screen.findByText("Could not be loaded")).toBeInTheDocument();
    expect(screen.queryByText("Assigned")).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
  });

  it("a failed background refetch keeps the loaded page", async () => {
    let fail = false;
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (fail) throw new Error("boom");
      if (path.includes("/dashboard")) {
        return { upcoming: 0, ready: 0, assigned: 7, accepted: 0, in_transit: 0, delivered: 0, total: 7 };
      }
      return [];
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <PartnerDashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    fail = true;
    await act(async () => {
      await qc.refetchQueries();
    });
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.queryByText("Could not be loaded")).not.toBeInTheDocument();
  });
});
