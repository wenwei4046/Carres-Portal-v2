import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HrCommissionRunPanel from "./HrCommissionRunPanel";

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
      <MemoryRouter initialEntries={["/hr?tab=commission"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const check = (key: string, passed: boolean, blocking: boolean, title: string) => ({
  key, passed, blocking, title, detail: `${title} detail`,
});

/** Route the two GETs the panel makes. */
function mockApi(state: unknown, runs: unknown = { runs: [] }) {
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockImplementation((path: string) => {
    if (path.startsWith("/api/hr/runs/state")) return Promise.resolve(state as never);
    if (path === "/api/hr/runs") return Promise.resolve(runs as never);
    return Promise.resolve({} as never);
  });
}

const PEOPLE = [{ id: "11111111-1111-4111-8111-111111111111", name: "Mayson" }];

const BLOCKED = {
  run: null,
  unattributed: 0,
  pendingAdjustments: 0,
  locked: false,
  checks: [
    check("rates", false, true, "Nobody has a commission rate"),
    check("attribution", true, true, "Every sale has a salesperson"),
    check("month_over", false, false, "This month is still running"),
    check("no_run", true, true, "No run exists for this month yet"),
  ],
};

const READY = {
  ...BLOCKED,
  checks: [
    check("rates", true, true, "Everyone who sold has a rate"),
    check("attribution", true, true, "Every sale has a salesperson"),
    check("month_over", false, false, "This month is still running"),
    check("no_run", true, true, "No run exists for this month yet"),
  ],
};

describe("the month close", () => {
  it("disables Close and says why when nobody has a rate", async () => {
    mockApi(BLOCKED);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));

    expect(await screen.findByText(/can't be closed yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/would freeze RM 0 for people who sold/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close month/i })).toBeDisabled();
  });

  it("shows every check, not only the failing one", async () => {
    mockApi(BLOCKED);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    await screen.findByText("Nobody has a commission rate");
    expect(screen.getByText("Every sale has a salesperson")).toBeInTheDocument();
    expect(screen.getByText("This month is still running")).toBeInTheDocument();
    expect(screen.getByText("No run exists for this month yet")).toBeInTheDocument();
  });

  it("enables Close once the blocking checks pass, warning and all", async () => {
    mockApi(READY);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    expect(await screen.findByText(/ready to close/i)).toBeInTheDocument();
    // the unfinished-month warning is present but must NOT block
    expect(screen.getByText("This month is still running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close month/i })).toBeEnabled();
  });
});

describe("a draft waiting for approval", () => {
  const DRAFT = {
    ...READY,
    run: {
      id: "22222222-2222-4222-8222-222222222222",
      year: 2026, month: 7, program: "staff", status: "draft",
      peopleCount: 2, totalPayable: 1454.43, totalCommission: 1454.43,
      totalAdjustments: 0, closedByName: "HR",
    },
  };

  it("says the figures are captured but the month is still editable", async () => {
    mockApi(DRAFT);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    expect(await screen.findByText(/waiting for approval/i)).toBeInTheDocument();
    expect(screen.getByText(/RM 1,454.43/)).toBeInTheDocument();
    expect(screen.getByText(/still editable/i)).toBeInTheDocument();
  });

  it("offers Approve to a principal only", async () => {
    mockApi(DRAFT);
    const { unmount } = render(
      wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />),
    );
    expect(await screen.findByRole("button", { name: /approve/i })).toBeInTheDocument();
    unmount();

    mockApi(DRAFT);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal={false} />));
    await screen.findByText(/waiting for approval/i);
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("hides the pre-flight once a run exists — it has done its job", async () => {
    mockApi(DRAFT);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    await screen.findByText(/waiting for approval/i);
    expect(screen.queryByText(/before the month can be closed/i)).not.toBeInTheDocument();
  });
});

describe("an approved month", () => {
  const APPROVED = {
    run: {
      id: "33333333-3333-4333-8333-333333333333",
      year: 2026, month: 7, program: "staff", status: "approved",
      peopleCount: 2, totalPayable: 1454.43, totalCommission: 1454.43,
      totalAdjustments: 0, closedByName: "HR", approvedByName: "Loo",
    },
    unattributed: 0,
    pendingAdjustments: 0,
    locked: true,
    checks: [],
  };

  it("reads as frozen and says what that blocks", async () => {
    mockApi(APPROVED);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    expect(await screen.findByText(/approved and frozen/i)).toBeInTheDocument();
    expect(screen.getByText(/approved by Loo/)).toBeInTheDocument();
    expect(
      screen.getByText(/Attribution and rate changes for this month are refused/i),
    ).toBeInTheDocument();
  });

  it("offers the CSV and, to a principal, Reopen", async () => {
    mockApi(APPROVED);
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    await screen.findByText(/approved and frozen/i);
    expect(screen.getByText(/export csv/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reopen/i })).toBeInTheDocument();
  });

  it("takes the adjustment door away — a locked month cannot receive one", async () => {
    mockApi(APPROVED, { runs: [APPROVED.run] });
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    await screen.findByText(/approved and frozen/i);
    expect(screen.queryByRole("button", { name: /add adjustment/i })).not.toBeInTheDocument();
  });
});

describe("runs history", () => {
  it("lists every close with its status and total", async () => {
    mockApi(BLOCKED, {
      runs: [
        { id: "r1", year: 2026, month: 7, program: "staff", status: "approved",
          peopleCount: 2, totalPayable: 1454.43, closedByName: "HR", approvedByName: "Loo" },
        { id: "r2", year: 2026, month: 6, program: "staff", status: "void",
          peopleCount: 0, totalPayable: 0 },
      ],
    });
    render(wrap(<HrCommissionRunPanel year={2026} month={7} people={PEOPLE} isPrincipal />));
    const july = (await screen.findByText("July 2026")).closest("div")!;
    expect(within(july).getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText("Discarded")).toBeInTheDocument();
  });
});
