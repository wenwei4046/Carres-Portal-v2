import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HrTeamTab from "./HrTeamTab";

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

// The tab reads only the caller's role (principal may mint principal accounts).
vi.mock("@/lib/auth", () => ({
  useAuth: (sel: (s: { role: string }) => unknown) => sel({ role: "principal" }),
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/hr?tab=team"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const POSITIONS = [
  { id: "7b000000-0000-4000-8000-000000000001", name: "Chairman", band: "c_level" as const, sort: 0, active: true },
  { id: "7b000000-0000-4000-8000-000000000002", name: "COO", band: "c_level" as const, sort: 1, active: true },
  { id: "7b000000-0000-4000-8000-000000000003", name: "Admin Assistant", band: "executive" as const, sort: 22, active: true },
];

const TEAM = {
  accounts: [
    {
      id: "7a000000-0000-4000-8000-000000000001",
      email: "principal@carres.com",
      name: "Loo",
      role: "principal",
      title: null,
      status: "active",
      staffCode: "CR001",
      positionId: POSITIONS[0].id,
      positionName: "Chairman",
      band: "c_level" as const,
      reportsToUserId: null,
      lastSeenAt: null,
      createdAt: "2026-05-02T00:00:00Z",
      orgName: null,
    },
    {
      id: "7a000000-0000-4000-8000-000000000002",
      email: "jess@carres.com",
      name: "Jess",
      role: "operation",
      title: "COO",
      status: "active",
      staffCode: "CR002",
      positionId: POSITIONS[1].id,
      positionName: "COO",
      band: "c_level" as const,
      reportsToUserId: "7a000000-0000-4000-8000-000000000001",
      lastSeenAt: null,
      createdAt: "2026-05-02T00:00:00Z",
      orgName: null,
    },
    {
      id: "7a000000-0000-4000-8000-000000000003",
      email: "khoryee@carres.com",
      name: "Khor Yee",
      role: "operation",
      title: null,
      status: "active",
      staffCode: "CR003",
      positionId: null,
      positionName: null,
      band: null,
      reportsToUserId: null,
      lastSeenAt: null,
      createdAt: "2026-05-02T00:00:00Z",
      orgName: null,
    },
    {
      id: "7a000000-0000-4000-8000-000000000004",
      email: "hookka@gmail.com",
      name: "Ohana · Sales",
      role: "supplier",
      title: null,
      status: "active",
      staffCode: null,
      positionId: null,
      positionName: null,
      band: null,
      reportsToUserId: null,
      lastSeenAt: null,
      createdAt: "2026-05-02T00:00:00Z",
      orgName: "Ohana",
    },
  ],
  showroomStores: [{ id: "7d000000-0000-4000-8000-000000000001", name: "Carres Kelana Jaya" }],
  showroomStaff: [
    {
      id: "7c000000-0000-4000-8000-000000000001",
      name: "Mayson",
      staffRole: "manager" as const,
      staffCode: "CR008",
      active: true,
      email: null,
      phone: null,
      dealerId: "7d000000-0000-4000-8000-000000000001",
      storeName: "Carres Kelana Jaya",
      outletId: null,
      outletName: null,
      hasPin: true,
    },
    {
      id: "7c000000-0000-4000-8000-000000000002",
      name: "kaan",
      staffRole: "salesperson" as const,
      staffCode: "CR009",
      active: true,
      email: "kaan@x.com",
      phone: null,
      dealerId: "7d000000-0000-4000-8000-000000000001",
      storeName: "Carres Kelana Jaya",
      outletId: null,
      outletName: null,
      hasPin: true,
    },
  ],
  positions: POSITIONS,
  history: [
    {
      id: "7e000000-0000-4000-8000-000000000001",
      subjectKind: "hq_user" as const,
      subjectId: "7a000000-0000-4000-8000-000000000002",
      subjectName: "Jess",
      prevPosition: null,
      newPosition: "COO",
      changedAt: "2026-07-25T09:00:00Z",
      changedBy: "Loo",
    },
  ],
};

describe("HrTeamTab", () => {
  it("renders bands, staff codes, showroom ladder and history", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/hr/team") return TEAM;
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrTeamTab />));

    // band group renders C-level people with their codes
    await waitFor(() => expect(screen.getByText("Loo")).toBeInTheDocument());
    expect(screen.getByText("CR001")).toBeInTheDocument();
    // "Jess" shows on her row AND in the history line — both are wanted
    expect(screen.getAllByText("Jess").length).toBeGreaterThanOrEqual(1);
    // no-position internal account falls into the unassigned group
    expect(screen.getByText("No position yet")).toBeInTheDocument();
    // her name also appears as a reports-to option on other rows
    expect(screen.getAllByText("Khor Yee").length).toBeGreaterThanOrEqual(1);

    // showroom staff: derived position labels + minted codes
    expect(screen.getByText("Mayson")).toBeInTheDocument();
    expect(screen.getByText("Sales Manager")).toBeInTheDocument();
    expect(screen.getByText("Sales Executive")).toBeInTheDocument();
    expect(screen.getByText("CR008")).toBeInTheDocument();

    // external account listed without a staff code, with its org
    expect(screen.getByText("Ohana · Sales")).toBeInTheDocument();
    expect(screen.getByText("Ohana")).toBeInTheDocument();

    // positions registry chips (name also appears in the row selects) + the
    // 职位更替 history line
    expect(screen.getAllByText("Chairman").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("— → COO")).toBeInTheDocument();
    expect(screen.getByText("by Loo")).toBeInTheDocument();
  });

  it("dealer-side staff exclusion note is always visible", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url: string) => {
      if (url === "/api/hr/team") return { ...TEAM, showroomStaff: [] };
      throw new Error(`unexpected fetch ${url}`);
    });

    render(wrap(<HrTeamTab />));
    await waitFor(() =>
      expect(
        screen.getByText(/Dealer-side staff are not Carres staff/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("No showroom staff yet.")).toBeInTheDocument();
  });
});
