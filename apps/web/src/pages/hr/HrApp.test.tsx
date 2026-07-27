import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  legacyUnattributed: 37,
  monthSold: { amount: 80817, orderCount: 18 },
  staff: STAFF,
  models: [],
  // 0250/0251 — BD commission (paid by what their assigned dealers sell);
  // Herng is the CBO, earning the rate difference on Alex's dealer sales.
  bdMethod: "percentage" as const,
  bdReport: {
    method: "percentage" as const,
    perBd: [
      {
        user: {
          id: "6a2f8a30-0000-4000-8000-00000000b001",
          name: "Herng Lim",
          email: "herng@carres.com",
          position: "cbo" as const,
        },
        position: "cbo" as const,
        dealerCount: 1,
        orderCount: 5,
        basis: 40000,
        pctUsed: 1.5,
        directCommission: 500,
        overrideCommission: 100,
        overrideDetail: [
          {
            fromStaffId: "6a2f8a30-0000-4000-8000-00000000b002",
            fromStaffName: "Alex Tan",
            amount: 100,
          },
        ],
        perModel: [],
        perModelCommission: 0,
        milestones: [],
        milestoneCommission: 0,
        commission: 600,
        portfolio: [
          {
            dealerId: "6a2f8a30-0000-4000-8000-00000000d101",
            dealerName: "Deluxe Living",
            orderCount: 5,
            amount: 40000,
            commission: 600,
          },
        ],
      },
    ],
    unassignedDealers: [],
    totalCommission: 600,
    totalBasis: 40000,
  },
  bdUsers: [
    {
      id: "6a2f8a30-0000-4000-8000-00000000b001",
      name: "Herng Lim",
      email: "herng@carres.com",
      position: "cbo" as const,
    },
  ],
  dealers: [
    {
      id: "6a2f8a30-0000-4000-8000-00000000d101",
      name: "Deluxe Living",
      status: "active",
      bdOwnerUserId: "6a2f8a30-0000-4000-8000-00000000b001",
    },
  ],
  config: {
    schemes: [],
    rates: [],
    modelRates: [],
    modelTiers: [],
    milestones: [],
    bdRates: [
      {
        userId: "6a2f8a30-0000-4000-8000-00000000b001",
        pct: 1.5,
        effectiveFrom: "2026-01-01",
      },
    ],
  },
};

describe("HrApp", () => {
  // O1 moved the no-tab default to Overview, so the commission table is now
  // reached by its deep link. Asserting it here is what pins the promise that
  // existing /hr?tab=... bookmarks kept working.
  it("renders the commission tab table on ?tab=commission", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=commission"));

    // summary cards
    await waitFor(() => {
      expect(screen.getByText("Total commission")).toBeInTheDocument();
    });
    expect(screen.getByText("Total sales basis")).toBeInTheDocument();

    // per-staff row: name + role pill + store line + bold total. The pill is
    // matched INSIDE its own row — since the worklist moved onto this page its
    // "Salesperson" column header is a second match for a bare getByText.
    expect(screen.getByText("Aina Rahman")).toBeInTheDocument();
    const ainaRow = screen.getByText("Aina Rahman").closest("tr") as HTMLElement;
    expect(within(ainaRow).getByText("Salesperson")).toBeInTheDocument();
    expect(
      screen.getByText("Carres Klang · Main showroom"),
    ).toBeInTheDocument();
    // RM 240.00 shows as Direct, TOTAL and the summary card
    expect(screen.getAllByText("RM 240.00").length).toBeGreaterThanOrEqual(2);

    // under-count warning, with the assign worklist opened right below it
    expect(
      screen.getByText(/1 order this month has no salesperson/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign" })).toBeInTheDocument();

    // 0250 — the BD commission section renders the BD name + commission
    expect(
      screen.getByText("BD commission — paid by dealer sales"),
    ).toBeInTheDocument();
    expect(screen.getByText("Herng Lim")).toBeInTheDocument();
    expect(screen.getByText("RM 600.00")).toBeInTheDocument();
    // 0251 — the method shows under the section title + the CBO position pill
    expect(screen.getByText("% of dealer sales")).toBeInTheDocument();
    expect(screen.getByText("CBO")).toBeInTheDocument();
  });

  // Loo 2026-07-27 — Commission Setup left the rail and became a sub-tab of
  // Commission. These two pin the merge: one entry, two sub-tabs, and every
  // `?tab=setup` deep link (Overview card, "Assign in Setup") still lands.
  it("Commission carries a sub-tab bar with Earnings selected", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=commission"));

    await waitFor(() => {
      expect(screen.getByTestId("hr-commission-tabs")).toBeInTheDocument();
    });
    expect(screen.getByTestId("hr-commission-tab-commission")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const setupTab = screen.getByTestId("hr-commission-tab-setup");
    expect(setupTab).toHaveAttribute("href", "/hr?tab=setup");
    expect(setupTab).toHaveAttribute("aria-selected", "false");
  });

  it("?tab=setup still opens the rate config — now under the Commission module", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=setup"));

    await waitFor(() => {
      expect(screen.getByText("Commission method per store")).toBeInTheDocument();
    });
    expect(screen.getByText("Staff rates (% of sales method)")).toBeInTheDocument();
    expect(screen.getByTestId("hr-commission-tab-setup")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The bar says "Setup", so the header must not repeat it (module-tab law)
    // and must not stamp a month onto rates that take effect from today.
    expect(
      screen.getByRole("heading", { level: 1 }),
    ).toHaveTextContent(/^Commission$/);
  });

  it("lands on the Overview digest when no tab is given", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />));

    await waitFor(() => {
      expect(screen.getByText("Needs a human")).toBeInTheDocument();
    });
    // headline tiles read the month, not the commission basis
    expect(screen.getByText("RM 80,817.00")).toBeInTheDocument();
    expect(screen.getByText("18 orders")).toBeInTheDocument();
    // the one real unattributed order IS a todo…
    expect(
      screen.getByText("1 order without a salesperson"),
    ).toBeInTheDocument();
    // …while imported archive is counted out loud, never as a todo
    expect(
      screen.getByText(/37 imported archive orders are not counted here/),
    ).toBeInTheDocument();
  });

  it("Overview says nothing needs you when the worklist is genuinely clear", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) {
        return {
          ...REPORT,
          unattributed: [],
          config: { ...REPORT.config, rates: [{ salespersonId: STAFF[0].id, pct: 2, effectiveFrom: "2026-01-01" }] },
        };
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />));

    await waitFor(() => {
      expect(screen.getByText("Nothing needs you today.")).toBeInTheDocument();
    });
    // the archive footnote survives the empty state — it is context, not an alert
    expect(
      screen.getByText(/37 imported archive orders are not counted here/),
    ).toBeInTheDocument();
  });

  it("Overview survives a Worker that predates 0265 (no monthSold key)", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) {
        const { monthSold: _m, legacyUnattributed: _l, ...old } = REPORT;
        return old;
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />));

    await waitFor(() => {
      expect(screen.getByText("Needs a human")).toBeInTheDocument();
    });
    // falls back to the report's own basis rather than rendering RM 0
    expect(screen.getByText("RM 12,000.00")).toBeInTheDocument();
    // and no archive footnote, because that count is unknown — not zero
    expect(screen.queryByText(/imported archive/)).not.toBeInTheDocument();
  });

  // Attribution retired (Loo 2026-07-27). These three pin what replaced it:
  // the worklist opens inside Earnings when — and ONLY when — an order is
  // unassigned, which is also where the blocking close-check complains.
  it("Earnings opens the assign worklist when an order has no salesperson", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=commission"));

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

  it("a healthy month shows no worklist at all — silence, not an all-clear card", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return { ...REPORT, unattributed: [] };
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=commission"));

    await waitFor(() => {
      expect(screen.getByText("Total commission")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
    expect(screen.queryByText(/no salesperson/)).not.toBeInTheDocument();
  });

  it("an old ?tab=attribution bookmark falls through to Overview", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/hr/report")) return REPORT;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrApp />, "/hr?tab=attribution"));

    await waitFor(() => {
      expect(screen.getByText("Needs a human")).toBeInTheDocument();
    });
    // and the digest still routes the same todo — now to Commission
    expect(
      screen.getByText("1 order without a salesperson").closest("a"),
    ).toHaveAttribute("href", "/hr?tab=commission");
  });
});
