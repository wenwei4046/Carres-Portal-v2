import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { computeScorecards, type KpiSource } from "@carres/shared";
import HrPerformanceTab from "./HrPerformanceTab";

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
      <MemoryRouter initialEntries={["/hr?tab=performance"]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const STORE = "11111111-1111-1111-1111-111111111111";
const SP_M = "22222222-2222-2222-2222-222222222222";
const SP_K = "33333333-3333-3333-3333-333333333333";
const EMP_M = "44444444-4444-4444-4444-444444444444";
const EMP_K = "55555555-5555-5555-5555-555555555555";
const MGR = "66666666-6666-6666-6666-666666666666";
const TGT_STORE = "77777777-7777-7777-7777-777777777777";

function person(over: Partial<KpiSource["people"][number]>): KpiSource["people"][number] {
  return {
    employeeId: EMP_M,
    appUserId: null,
    salespersonId: SP_M,
    staffCode: "CR008",
    name: "Mayson",
    positionName: null,
    departmentName: null,
    dealerId: STORE,
    storeName: "Carres Kelana Jaya",
    staffRole: "salesperson",
    canSell: true,
    ...over,
  };
}

function source(over: Partial<KpiSource> = {}): KpiSource {
  return {
    targets: [
      {
        id: TGT_STORE,
        kpiKey: "sales_basis",
        scopeKind: "store",
        employeeId: null,
        dealerId: STORE,
        subjectName: "Carres Kelana Jaya",
        staffCode: null,
        targetValue: 60000,
        effectiveFrom: "2026-07-01",
        note: null,
        setByName: "Loo",
      },
    ],
    people: [
      person({}),
      person({ employeeId: EMP_K, salespersonId: SP_K, staffCode: "CR009", name: "kaan" }),
      person({
        employeeId: "88888888-8888-8888-8888-888888888888",
        appUserId: MGR,
        salespersonId: null,
        staffCode: "CR003",
        name: "Khor Yee",
        departmentName: "Operation",
        dealerId: null,
        storeName: null,
        staffRole: null,
        canSell: false,
      }),
    ],
    stores: [
      {
        dealerId: STORE,
        name: "Carres Kelana Jaya",
        managerUserId: null,
        managerName: null,
        staffCount: 2,
      },
    ],
    manualActuals: [],
    managerCoverage: { hqTotal: 7, hqWithManager: 1, storesTotal: 1, storesWithManager: 0 },
    managerCandidates: [{ appUserId: MGR, name: "Jess", staffCode: "CR002", positionName: "COO" }],
    ...over,
  };
}

const staff = [SP_M, SP_K].map((id) => ({
  id,
  name: id === SP_M ? "Mayson" : "kaan",
  staffRole: "salesperson" as const,
  active: true,
  dealerId: STORE,
  outletId: null,
  storeName: "Carres Kelana Jaya",
}));

const lines = [
  ...Array.from({ length: 5 }, (_, i) => ({ orderId: `m${i}`, salespersonId: SP_M, unitPrice: 6096 })),
  ...Array.from({ length: 8 }, (_, i) => ({ orderId: `k${i}`, salespersonId: SP_K, unitPrice: 2700.125 })),
].map((l) => ({
  ...l,
  so: 1200,
  placedAt: "2026-07-10T02:00:00Z",
  dealerId: STORE,
  outletId: null,
  modelId: null,
  modelName: null,
  category: "mattress",
  qty: 1,
}));

/** Build the response the way the Worker does, so the UI is fed real engine output. */
function payload(over: Partial<KpiSource> = {}, extra: Record<string, unknown> = {}) {
  const src = source(over);
  return {
    source: src,
    scorecards: computeScorecards({
      kpiKey: "sales_basis",
      year: 2026,
      month: 7,
      staff,
      lines,
      source: src,
    }),
    monthLocked: false,
    runStatus: null,
    ...extra,
  };
}

beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("HrPerformanceTab", () => {
  it("shows the store's attainment and both sellers", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPerformanceTab year={2026} month={7} />));

    await waitFor(() => expect(screen.getByText("This month")).toBeInTheDocument());
    expect(screen.getAllByText("Carres Kelana Jaya").length).toBeGreaterThan(0);
    expect(screen.getByText("CR008")).toBeInTheDocument();
    expect(screen.getByText("CR009")).toBeInTheDocument();
    // 52,081 of 60,000 -> floor(86.8) = 86. It appears twice on purpose: the
    // store row and the Attainment tile are the same number.
    expect(screen.getAllByText("86%").length).toBe(2);
  });

  it("reads 'No target' for a person with no target of their own", async () => {
    // The store's RM 60,000 is NOT split across heads — that would be inventing
    // a number and judging somebody against it.
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("This month")).toBeInTheDocument());
    expect(screen.getAllByText("No target").length).toBe(2);
  });

  it("marks each seller on track or behind against their own target", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      payload({
        targets: [
          ...source().targets,
          {
            id: "t-m", kpiKey: "sales_basis", scopeKind: "person", employeeId: EMP_M,
            dealerId: null, subjectName: "Mayson", staffCode: "CR008",
            targetValue: 25000, effectiveFrom: "2026-07-01", note: null, setByName: "Loo",
          },
          {
            id: "t-k", kpiKey: "sales_basis", scopeKind: "person", employeeId: EMP_K,
            dealerId: null, subjectName: "kaan", staffCode: "CR009",
            targetValue: 30000, effectiveFrom: "2026-07-01", note: null, setByName: "Loo",
          },
        ],
      }),
    );
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("121%")).toBeInTheDocument());
    // "On track" is also a tile label, so assert the PILL specifically.
    expect(
      screen.getAllByText("On track").filter((el) => el.className.includes("pill")),
    ).toHaveLength(1);
    // Mayson 30,480 / 25,000
    expect(screen.getByText("72%")).toBeInTheDocument(); // kaan 21,601 / 30,000
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("keeps HQ staff off a sales scoreboard but shows their department", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("This month")).toBeInTheDocument());
    expect(screen.queryByText("CR003")).not.toBeInTheDocument();
    expect(screen.getByText("Operation")).toBeInTheDocument();
    expect(screen.getByText(/no sales target/)).toBeInTheDocument();
  });

  it("says the month is open, and says closed once the run is approved", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    const { unmount } = render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Open · figures live")).toBeInTheDocument());
    unmount();

    vi.mocked(apiFetch).mockResolvedValue(
      payload({}, { monthLocked: true, runStatus: "approved" }),
    );
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() =>
      expect(screen.getByText("Closed · commission settled")).toBeInTheDocument(),
    );
  });

  it("ships the manager view OFF and names both reasons", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Manager view")).toBeInTheDocument());
    const card = screen.getByText("Manager view").closest("section") as HTMLElement;
    expect(
      within(card).getAllByText("Off").filter((el) => el.className.includes("pill")),
    ).toHaveLength(1);
    expect(within(card).getByText(/6 of 7 HQ staff have no manager set/)).toBeInTheDocument();
    expect(
      within(card).getByText(/Showroom staff have no manager field at all/),
    ).toBeInTheDocument();
  });

  it("turns the manager view on once every store has an owner", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      payload({
        stores: [
          {
            dealerId: STORE,
            name: "Carres Kelana Jaya",
            managerUserId: MGR,
            managerName: "Jess",
            staffCount: 2,
          },
        ],
        managerCoverage: { hqTotal: 7, hqWithManager: 7, storesTotal: 1, storesWithManager: 1 },
      }),
    );
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Manager view")).toBeInTheDocument());
    const card = screen.getByText("Manager view").closest("section") as HTMLElement;
    expect(
      within(card).getAllByText("On").filter((el) => el.className.includes("pill")),
    ).toHaveLength(1);
  });

  it("saves a target through PUT and sends exactly one scope", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path?: string) => {
      if (path?.startsWith("/api/hr/kpi/target")) return { ok: true, id: "new" };
      return payload();
    });
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("This month")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Set a target for Mayson/i }));
    const box = screen.getByLabelText(/Monthly target/i);
    fireEvent.change(box, { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save target/i }));

    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/hr/kpi/target",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const call = vi
      .mocked(apiFetch)
      .mock.calls.find((c) => c[0] === "/api/hr/kpi/target");
    const sent = JSON.parse((call?.[1] as { body: string }).body) as Record<string, unknown>;
    expect(sent.employeeId).toBe(EMP_M);
    expect(sent.dealerId).toBeNull();
    expect(sent.targetValue).toBe(25000);
    expect(sent.effectiveFrom).toBe("2026-07-01");
  });

  it("refuses to save a zero target without calling the API", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("This month")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Set a target for Mayson/i }));
    fireEvent.change(screen.getByLabelText(/Monthly target/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Save target/i }));
    expect(
      vi.mocked(apiFetch).mock.calls.filter((c) => c[0] === "/api/hr/kpi/target"),
    ).toHaveLength(0);
  });

  it("sets a store owner through the picker", async () => {
    vi.mocked(apiFetch).mockImplementation(async (path?: string) => {
      if (path?.startsWith("/api/hr/kpi/store-manager")) return { ok: true };
      return payload();
    });
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("Manager view")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Owner of Carres Kelana Jaya"), {
      target: { value: MGR },
    });
    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/hr/kpi/store-manager",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
  });

  it("switches metric and asks the API for that metric", async () => {
    vi.mocked(apiFetch).mockResolvedValue(payload());
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("This month")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Orders" }));
    await waitFor(() =>
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
        "/api/hr/kpi?year=2026&month=7&kpi=orders_count",
      ),
    );
  });

  it("says so out loud when sales belong to somebody with no staff code", async () => {
    const src = source();
    const extraStaff = [
      ...staff,
      {
        id: "99999999-9999-9999-9999-999999999999",
        name: "New hire",
        staffRole: "salesperson" as const,
        active: true,
        dealerId: STORE,
        outletId: null,
        storeName: "Carres Kelana Jaya",
      },
    ];
    vi.mocked(apiFetch).mockResolvedValue({
      source: src,
      scorecards: computeScorecards({
        kpiKey: "sales_basis",
        year: 2026,
        month: 7,
        staff: extraStaff,
        lines: [
          ...lines,
          {
            ...lines[0],
            orderId: "new-1",
            salespersonId: "99999999-9999-9999-9999-999999999999",
            unitPrice: 1000,
          },
        ],
        source: src,
      }),
      monthLocked: false,
      runStatus: null,
    });
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() => expect(screen.getByText("This month")).toBeInTheDocument());
    expect(screen.getByText(/sold by somebody with no\s+staff code yet/)).toBeInTheDocument();
  });

  it("explains itself when no showroom is scoreable yet", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      payload({
        stores: [],
        people: [],
        targets: [],
        managerCoverage: { hqTotal: 7, hqWithManager: 1, storesTotal: 0, storesWithManager: 0 },
      }),
    );
    render(wrap(<HrPerformanceTab year={2026} month={7} />));
    await waitFor(() =>
      expect(screen.getByText(/No showroom is set up for scoring yet/)).toBeInTheDocument(),
    );
  });
});
