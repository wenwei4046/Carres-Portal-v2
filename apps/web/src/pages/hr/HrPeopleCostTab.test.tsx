import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { computePeopleCost, type StaffCompSource } from "@carres/shared";
import HrPeopleCostTab from "./HrPeopleCostTab";

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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/hr?tab=people-cost"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const STORE = "11111111-1111-1111-1111-111111111111";
const E_MAYSON = "44444444-4444-4444-4444-444444444444";
const E_KAAN = "55555555-5555-5555-5555-555555555555";
const E_ADMIN = "66666666-6666-6666-6666-666666666666";
const E_COO = "77777777-7777-7777-7777-777777777777";
const APP_USER = "88888888-8888-8888-8888-888888888888";

function source(over: Partial<StaffCompSource> = {}): StaffCompSource {
  return {
    comp: [
      {
        id: "c-mayson", employeeId: E_MAYSON, baseMonthly: 2500, fixedAllowance: 300,
        employerBurdenPct: 13.7, effectiveFrom: "2026-07-01", note: null, setByName: "Loo",
      },
      {
        id: "c-coo", employeeId: E_COO, baseMonthly: 12000, fixedAllowance: 1500,
        employerBurdenPct: 13.7, effectiveFrom: "2026-07-01", note: null, setByName: "Loo",
      },
    ],
    people: [
      {
        employeeId: E_MAYSON, appUserId: null, staffCode: "CR008", name: "Mayson",
        kind: "floor", positionName: null, departmentName: null, dealerId: STORE,
        storeName: "Carres Kelana Jaya", staffRole: "salesperson", accessActive: true,
      },
      {
        employeeId: E_KAAN, appUserId: null, staffCode: "CR009", name: "kaan",
        kind: "floor", positionName: null, departmentName: null, dealerId: STORE,
        storeName: "Carres Kelana Jaya", staffRole: "salesperson", accessActive: true,
      },
      {
        employeeId: E_ADMIN, appUserId: APP_USER, staffCode: "CR003", name: "Khor Yee",
        kind: "hq", positionName: "Admin Assistant", departmentName: "Operation",
        dealerId: null, storeName: null, staffRole: null, accessActive: true,
      },
      {
        employeeId: E_COO, appUserId: APP_USER, staffCode: "CR002", name: "Jess",
        kind: "hq", positionName: "COO", departmentName: null,
        dealerId: null, storeName: null, staffRole: null, accessActive: true,
      },
    ],
    stores: [
      { dealerId: STORE, name: "Carres Kelana Jaya", managerUserId: null, managerName: null },
    ],
    coverage: {
      firstOrderDate: "2026-07-21", lastOrderDate: "2026-07-26",
      daysWithOrders: 6, orderCount: 19, daysInMonth: 31,
    },
    ...over,
  };
}

/** Build the response the way the Worker does — real engine output, not hand-made. */
function payload(opts: {
  over?: Partial<StaffCompSource>;
  commissionCost?: number;
  today?: { year: number; month: number };
} = {}) {
  const src = source(opts.over);
  return {
    source: src,
    cost: computePeopleCost({
      year: 2026,
      month: 7,
      source: src,
      storeRevenue: [{ dealerId: STORE, sold: 52081 }],
      commissionCost: opts.commissionCost ?? 0,
      today: opts.today ?? { year: 2026, month: 7 },
    }),
  };
}

/** Mirrors lib/format-currency rm() so expectations read as money, not floats. */
function rmText(n: number): string {
  return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("HrPeopleCostTab", () => {
  it("shows the loaded monthly cost and the composition", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Where the cost sits")).toBeInTheDocument());
    // (2500+300)*1.137 + (12000+1500)*1.137 = 3183.60 + 15349.50 = 18533.10
    expect(screen.getAllByText("RM 18,533.10").length).toBeGreaterThan(0);
    expect(screen.getByText(/base \+/)).toBeInTheDocument();
  });

  it("keeps commission in its OWN tile, never folded into the salary figure", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload({ commissionCost: 1454.43 }));
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Commission")).toBeInTheDocument());
    expect(screen.getByText("RM 1,454.43")).toBeInTheDocument();
    // 18,533.10 + 1,454.43 = 19,987.53 must appear NOWHERE on the page.
    expect(screen.queryByText("RM 19,987.53")).not.toBeInTheDocument();
  });

  it("says why commission is zero rather than just showing RM 0", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText(/no rates set up yet/)).toBeInTheDocument());
  });

  it("excludes commission from the average per person", async () => {
    const withCommission = payload({ commissionCost: 999999 });
    const without = payload({ commissionCost: 0 });
    // The average must be IDENTICAL whether or not commission exists — that is
    // the ruling. Derived from the engine rather than hardcoded so a float
    // rounding artifact cannot make this test lie either way.
    expect(withCommission.cost.avgFixedPerPerson).toBe(without.cost.avgFixedPerPerson);

    vi.mocked(apiFetch).mockResolvedValue(withCommission);
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Average per person")).toBeInTheDocument());
    expect(screen.getByText(rmText(withCommission.cost.avgFixedPerPerson))).toBeInTheDocument();
    expect(screen.getByText(/excludes commission/)).toBeInTheDocument();
  });

  it("withholds the store ratio while the month is running, and says why", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() =>
      expect(screen.getByText("Carres Kelana Jaya")).toBeInTheDocument(),
    );
    expect(screen.getByText("ratio not shown yet")).toBeInTheDocument();
    expect(screen.getByText(/6 of\s+31 days/)).toBeInTheDocument();
    expect(screen.getByText(/would read as a\s+wildly wrong ratio/)).toBeInTheDocument();
  });

  it("shows the ratio once the month is over, with no switch to flip", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload({ today: { year: 2026, month: 8 } }));
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() =>
      expect(screen.getByText("Carres Kelana Jaya")).toBeInTheDocument(),
    );
    expect(screen.queryByText("ratio not shown yet")).not.toBeInTheDocument();
    // store staff cost 3183.60 of 52,081 -> 6%. It appears twice by design: the
    // Showrooms group row and the store card are the same number, and the whole
    // point of reading the store aggregate is that they agree.
    expect(screen.getAllByText("6%")).toHaveLength(2);
  });

  it("never allocates head-office cost to the store", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload({ today: { year: 2026, month: 8 } }));
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Staff cost")).toBeInTheDocument());
    // the store carries Mayson only (kaan has nothing recorded), never a slice of Jess
    const card = screen.getByText("Carres Kelana Jaya").closest("section") as HTMLElement;
    expect(within(card).getByText("RM 3,183.60")).toBeInTheDocument();
    expect(within(card).queryByText("RM 15,349.50")).not.toBeInTheDocument();
    expect(screen.getByText(/never divided across stores/)).toBeInTheDocument();
  });

  it("labels a non-selling department instead of printing 0%", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Operation")).toBeInTheDocument());
    expect(screen.getByText("does not sell")).toBeInTheDocument();
    expect(screen.getByText("company overhead")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("files the department-less COO under Management", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getAllByText("Management").length).toBeGreaterThan(0));
    // the group ROW, not the sentence that also names it
    const rows = screen.getAllByText("Management").filter((el) => el.tagName === "TD");
    expect(rows).toHaveLength(1);
    expect(screen.getByText(/department-less by design/)).toBeInTheDocument();
  });

  it("marks people with nothing on file and offers a Record button", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Salary register")).toBeInTheDocument());
    expect(screen.getByText("2 of 4 recorded")).toBeInTheDocument();
    expect(screen.getAllByText("Nothing recorded yet")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Record a salary for kaan/i })).toBeInTheDocument();
  });

  it("previews the loaded cost live in the dialog", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Salary register")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Record a salary for kaan/i }));
    fireEvent.change(screen.getByLabelText(/Base monthly/i), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText(/Fixed allowance/i), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText(/Employer burden/i), { target: { value: "10" } });
    // (3000 + 200) * 1.10 = 3520
    expect(screen.getByTestId("comp-loaded-preview")).toHaveTextContent("RM 3,520.00");
  });

  it("saves through PUT with the numbers coerced", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path?: string) => {
      if (path === "/api/hr/comp" || path?.startsWith("/api/hr/comp/")) {
        return { ok: true, id: "new" };
      }
      return payload();
    });
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Salary register")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Record a salary for kaan/i }));
    fireEvent.change(screen.getByLabelText(/Base monthly/i), { target: { value: "3000" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/hr/comp",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const call = vi.mocked(apiFetch).mock.calls.find((c) => c[0] === "/api/hr/comp");
    const sent = JSON.parse((call?.[1] as { body: string }).body) as Record<string, unknown>;
    expect(sent.employeeId).toBe(E_KAAN);
    expect(sent.baseMonthly).toBe(3000);
    expect(sent.effectiveFrom).toBe("2026-07-01");
  });

  it("refuses a burden over 100% without calling the API", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Salary register")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Record a salary for kaan/i }));
    fireEvent.change(screen.getByLabelText(/Base monthly/i), { target: { value: "3000" } });
    fireEvent.change(screen.getByLabelText(/Employer burden/i), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    expect(vi.mocked(apiFetch).mock.calls.filter((c) => c[0] === "/api/hr/comp")).toHaveLength(0);
  });

  it("states the statutory boundary on the screen", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() =>
      expect(screen.getByText(/never computes EPF, SOCSO, EIS or PCB/)).toBeInTheDocument(),
    );
  });

  it("survives a month where nothing has been recorded at all", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload({ over: { comp: [] } }));
    render(wrap(<HrPeopleCostTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Salary register")).toBeInTheDocument());
    expect(screen.getByText("0 of 4 recorded")).toBeInTheDocument();
    expect(screen.getAllByText("Nothing recorded yet")).toHaveLength(4);
  });
});
