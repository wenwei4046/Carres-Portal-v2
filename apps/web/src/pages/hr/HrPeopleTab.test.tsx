import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HrPeopleTab from "./HrPeopleTab";

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
      <MemoryRouter initialEntries={["/hr?tab=people"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const base = {
  entity: "carres",
  positionName: null,
  band: null,
  staffRole: null,
  departmentName: null,
  storeName: null,
  reportsToName: null,
  joinDate: null,
  confirmDate: null,
  exitDate: null,
  employmentType: null,
  filled: 0,
};

/** The live shape hr_people_source returns (verified against prod 2026-07-26). */
const SOURCE = {
  totalFields: 8,
  accessWithoutExit: 1,
  people: [
    {
      ...base,
      employeeId: "e1",
      kind: "hq" as const,
      subjectId: "u1",
      staffCode: "CR003",
      name: "Khor Yee",
      workEmail: "khoryee@carres.com",
      positionName: "Admin Assistant",
      band: "executive",
      departmentName: "Operation",
      access: "can_login" as const,
      employment: "active" as const,
      joinDate: "2025-03-03",
      filled: 3,
    },
    {
      ...base,
      employeeId: "e2",
      kind: "hq" as const,
      subjectId: "u2",
      staffCode: "CR006",
      name: "Samantha",
      workEmail: "samantha@carres.com",
      access: "disabled" as const,
      employment: "not_recorded" as const,
    },
    {
      ...base,
      employeeId: "e3",
      kind: "floor" as const,
      subjectId: "s1",
      staffCode: "CR008",
      name: "Mayson",
      workEmail: null,
      staffRole: "manager",
      storeName: "Carres Kelana Jaya",
      access: "pin_only" as const,
      employment: "not_recorded" as const,
    },
  ],
};

function mockSource(data: unknown = SOURCE) {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue(data as never);
}

describe("People register", () => {
  it("lists everyone with a CR code, grouped", async () => {
    mockSource();
    render(wrap(<HrPeopleTab />));
    await screen.findByText("Khor Yee");
    expect(screen.getByText("Samantha")).toBeInTheDocument();
    expect(screen.getByText("Mayson")).toBeInTheDocument();
    // floor staff group under their store, HQ under their band
    expect(screen.getByText("Showroom · Carres Kelana Jaya")).toBeInTheDocument();
    expect(screen.getByText("Executive")).toBeInTheDocument();
  });

  it("keeps employment and access as SEPARATE answers on the same row", async () => {
    mockSource();
    render(wrap(<HrPeopleTab />));
    const row = (await screen.findByText("Samantha")).closest("button")!;
    // her login is cut...
    expect(within(row).getByText("Disabled")).toBeInTheDocument();
    // ...and HR has not written down why. One field could not say both.
    expect(within(row).getByText("Exit not recorded")).toBeInTheDocument();
  });

  it("does not call a PIN-only person disabled", async () => {
    mockSource();
    render(wrap(<HrPeopleTab />));
    const row = (await screen.findByText("Mayson")).closest("button")!;
    expect(within(row).getByText("PIN only")).toBeInTheDocument();
    expect(within(row).queryByText("Disabled")).not.toBeInTheDocument();
    // staff_role arrives raw ("manager") and is labelled on the client via
    // STAFF_TIER_LABEL — labelling it in SQL would fork that constant.
    expect(within(row).getByText("Manager")).toBeInTheDocument();
  });

  it("raises the banner while someone has lost access with no exit", async () => {
    mockSource();
    const { unmount } = render(wrap(<HrPeopleTab />));
    expect(
      await screen.findByText(/Samantha lost access with no exit recorded/i),
    ).toBeInTheDocument();
    unmount();
  });

  it("drops the banner once the exit is on file", async () => {
    mockSource({
      ...SOURCE,
      accessWithoutExit: 0,
      people: SOURCE.people.map((p) =>
        p.employeeId === "e2" ? { ...p, exitDate: "2026-06-30", employment: "left" } : p,
      ),
    });
    render(wrap(<HrPeopleTab />));
    await screen.findByText("Samantha");
    expect(
      screen.queryByText(/lost access with no exit recorded/i),
    ).not.toBeInTheDocument();
  });

  it("counts complete profiles against the server's own denominator", async () => {
    mockSource();
    render(wrap(<HrPeopleTab />));
    const summary = await screen.findByText(/profiles complete/);
    // 3 people on the register, none at 8/8 yet
    expect(summary.textContent?.replace(/\s+/g, " ")).toContain("3 people");
    expect(summary.textContent?.replace(/\s+/g, " ")).toContain("0 profiles complete");
  });

  it("says so plainly when the API is not deployed yet", async () => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockRejectedValue(new Error("404"));
    render(wrap(<HrPeopleTab />));
    // an empty register would read as "no staff" — that would be a lie
    expect(await screen.findByText(/People is not available yet/i)).toBeInTheDocument();
  });
});
