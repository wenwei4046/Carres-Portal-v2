import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HrApp from "./HrApp";

// PortalSidebar pulls auth/staff stores + nav badges — stub it out; the shell
// under test is the tab switching + report rendering, not the rail.
vi.mock("@/pages/portal/PortalSidebar", () => ({
  default: () => <div data-testid="portal-sidebar" />,
}));

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

function wrap(ui: React.ReactNode, initialEntry = "/hr") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const STAFF = [
  {
    id: "6a2f8a30-0000-4000-8000-000000000001",
    name: "Aina Rahman",
    staffRole: "salesperson" as const,
    active: true,
    dealerId: "6a2f8a30-0000-4000-8000-00000000d001",
    outletId: "6a2f8a30-0000-4000-8000-00000000o001",
    storeName: "Carres Klang",
    outletName: "Main showroom",
  },
];

const REPORT = {
  year: 2026,
  month: 7,
  report: {
    perStaff: [
      {
        staff: STAFF[0],
        orderCount: 3,
        basis: 12000,
        pctUsed: 2,
        directCommission: 240,
        overrideCommission: 0,
        overrideDetail: [],
        perModel: [],
        perModelCommission: 0,
        milestones: [],
        milestoneCommission: 0,
        total: 240,
      },
    ],
    totalCommission: 240,
    totalBasis: 12000,
  },
  unattributed: [
    {
      orderId: "6a2f8a30-0000-4000-8000-00000000a001",
      so: 1201,
      placedAt: "2026-07-10T00:00:00Z",
      dealerId: "6a2f8a30-0000-4000-8000-00000000d001",
      outletId: null,
      storeName: "Carres Klang",
      customerName: "Tan Mei Ling",
      amount: 4500,
    },
  ],
  staff: STAFF,
  models: [],
  config: { schemes: [], rates: [], modelRates: [], modelTiers: [], milestones: [] },
};

describe("HrApp", () => {
  it("renders the commission tab table from the mocked month report", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />));

    // summary cards
    await waitFor(() => {
      expect(screen.getByText("Total commission")).toBeInTheDocument();
    });
    expect(screen.getByText("Total sales basis")).toBeInTheDocument();

    // per-staff row: name + role pill + store line + bold total
    expect(screen.getByText("Aina Rahman")).toBeInTheDocument();
    expect(screen.getByText("Salesperson")).toBeInTheDocument();
    expect(
      screen.getByText("Carres Klang · Main showroom"),
    ).toBeInTheDocument();
    // RM 240.00 shows as Direct, TOTAL and the summary card
    expect(screen.getAllByText("RM 240.00").length).toBeGreaterThanOrEqual(2);

    // unattributed warning banner links to the attribution worklist
    expect(
      screen.getByText(/1 order this month has no salesperson/),
    ).toBeInTheDocument();
    expect(screen.getByText("Assign now")).toBeInTheDocument();
  });

  it("renders the attribution worklist on ?tab=attribution", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=attribution"));

    await waitFor(() => {
      expect(screen.getByText("SO-1201")).toBeInTheDocument();
    });
    expect(screen.getByText("Tan Mei Ling")).toBeInTheDocument();
    expect(screen.getByText("RM 4,500.00")).toBeInTheDocument();
    // same-store active staff appears in the assign select
    expect(
      screen.getByText("Aina Rahman · Main showroom"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
  });

  it("shows the all-assigned empty state when nothing is unattributed", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return { ...REPORT, unattributed: [] };
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=attribution"));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Every order this month has a salesperson. Commission is complete.",
        ),
      ).toBeInTheDocument();
    });
  });
});
