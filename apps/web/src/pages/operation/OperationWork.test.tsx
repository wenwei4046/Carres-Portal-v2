import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OperationWorkItem, OperationWorkResponse } from "@carres/shared";

const SH = "00000000-0000-4000-8000-0000000000aa";
const YJ = "00000000-0000-4000-8000-0000000000bb";
let workState: {
  data: OperationWorkResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};
let authState = { role: "operation", email: "shasha@carres.test" };
const refetch = vi.fn();

/* The Mission and Communication read their orders through their own queries;
   their behaviour is held by work/work-stops.test.ts and the kit tests. */
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => <span data-testid="top-bar-icons" /> }));
vi.mock("./work/WorkMission", () => ({
  default: ({ orderId, acts }: { orderId: string; acts: Array<{ title: string; button: string }> }) => (
    <div data-testid="work-mission-stub" data-order={orderId}>{acts.map((a) => <p key={a.title}>{`${a.title} · ${a.button}`}</p>)}</div>
  ),
}));
vi.mock("./work/WorkCommunication", () => ({ default: () => <div data-testid="work-comm-stub" /> }));
vi.mock("./work/LogisticsCard", () => ({ useLogisticsModel: () => ({ model: null }) }));
vi.mock("./work/PoWindowPanel", () => ({ default: () => <div data-testid="po-window-panel-stub" />, usePoWindow: () => ({ window: null, loading: false, failed: false }) }));
let indexState: import("./work/work-orders").WorkOrderIndex = { poOrders: new Map(), orderBySo: new Map(), soByOrder: new Map(), windows: [] };
vi.mock("./work/use-work-data", () => ({ useWorkOrderIndex: () => ({ index: indexState, loading: false }) }));
vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationWork: () => ({ ...workState, refetch }),
    useOperationStaff: () => ({
      data: {
        staff: [
          { user_id: SH, name: "Shasha", email: "shasha@carres.test", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
          { user_id: YJ, name: "Yu Jun", email: "yujun@carres.test", pooled: true, available: true, note: null, last_seen_at: null, duties: [] },
        ],
        myDuties: [],
      },
      isLoading: false,
    }),
  };
});
vi.mock("@/lib/auth", () => ({
  useAuth: (select: (state: { role: string; user: { id: string; email: string } }) => unknown) =>
    select({
      role: authState.role,
      // The one identity is the signed-in account id (HF-3); these fixtures
      // sign in by email, so the account id follows the email.
      user: { id: authState.email.startsWith("yujun") ? YJ : SH, email: authState.email },
    }),
}));
const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

import OperationWork from "./OperationWork";

function timing(actionOn: string | null, workingDaysLate = 0): OperationWorkItem["timing"] {
  return {
    businessDueOn: actionOn,
    actionOn,
    placement: actionOn === null ? "no_working_date" : workingDaysLate > 0 ? "missed" : "on_day",
    missedAge: {
      state: "counted",
      workingDays: workingDaysLate,
      basis: { calendarKey: "module+person", from: actionOn ?? "2026-09-07", to: "2026-09-07" },
    },
    eligibility: "eligible",
    noDateReason: actionOn === null ? "The owning rule has no working date" : null,
    calendar: {
      module: { key: "orders", source: "orders", state: "ready" },
      actor: { key: "person:shasha", source: "people", state: "ready" },
      holidayName: null,
    },
  };
}

function item(overrides: Partial<OperationWorkItem> = {}): OperationWorkItem {
  return {
    contractVersion: 2,
    id: "orders:order-1:ask_delivery_date",
    module: "orders",
    ruleKey: "ask_delivery_date",
    ruleVersion: 1,
    object: { kind: "sales_order", id: "order-1", label: "SO-1318" },
    problem: "No delivery date",
    action: "Ask customer for a delivery date",
    recipient: "Tan Qu Qu",
    requiredResult: "Customer Delivery exists",
    completionPredicate: "orders.delivery_date exists",
    completionStatement: "Customer Delivery exists",
    owner: {
      rule: "salesperson",
      dutyKey: null,
      normal: { userId: SH, name: "Shasha" },
      activeCover: null,
      coverEvidence: null,
      acting: { userId: SH, name: "Shasha" },
      state: "primary",
    },
    timing: timing("2026-09-07"),
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: { mode: "open_module", fallbackDestination: "/operation/orders/so/order-1" },
    destination: "/operation/orders/so/order-1",
    observedAt: "2026-09-07T01:00:00.000Z",
    sourceVersion: "2026-09-07T01:00:00.000Z",
    tone: "warning",
    locked: false,
    broken: false,
    ...overrides,
  };
}

function show(url = "/operation?tab=work") {
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <OperationWork />
    </MemoryRouter>,
  );
  return view;
}

beforeEach(() => {
  navigate.mockReset();
  refetch.mockReset();
  authState = { role: "operation", email: "shasha@carres.test" };
  workState = {
    data: {
      contractVersion: 2,
      complete: true,
      items: [item()],
      staff: [
        { userId: SH, name: "Shasha", email: "shasha@carres.test" },
        { userId: YJ, name: "Yu Jun", email: "yujun@carres.test" },
      ],
      generatedOn: "2026-09-07",
      closureReceipt: null,
      sources: (["orders", "purchasing", "receiving", "delivery", "payment", "issue_tracker"] as const).map((key) => ({
        key,
        state: "healthy" as const,
        observedAt: "2026-09-07T01:00:00.000Z",
        lastSuccessfulAt: "2026-09-07T01:00:00.000Z",
        errorLabel: null,
      })),
    },
    isLoading: false,
    isError: false,
  };
});

describe("Workspace Work page — §5.10", () => {
  it("opens everyone, a manager included, on My Task", () => {
    authState = { role: "principal", email: "shasha@carres.test" };
    show();
    expect(screen.getByTestId("work-view-mine")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("work-view-mine")).toHaveTextContent("My Task");
    expect(screen.getByTestId("work-view-team")).toHaveTextContent("Team Work");
  });

  it("draws the rail: search, the month, Attention and Module, then one row per order with its task count", () => {
    show();
    const rail = screen.getByTestId("work-rail");
    expect(within(rail).getByPlaceholderText("Search work…")).toBeInTheDocument();
    expect(within(rail).getByTestId("work-rail-month")).toBeInTheDocument();
    expect(rail).toHaveTextContent("Attention");
    expect(rail).toHaveTextContent("Module");
    expect(screen.getByTestId("work-rail-module-all")).toHaveTextContent("All modules1");
    const row = screen.getByTestId("work-order-row-SO-1318");
    expect(row).toHaveTextContent(/^SO-13181$/);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("work-mission-stub")).toHaveAttribute("data-order", "order-1");
  });

  it("shows only my occurrences in My Task and everyone's in Team Work", () => {
    workState.data!.items = [
      item(),
      item({ id: "orders:order-2:ask_delivery_date", object: { kind: "sales_order", id: "order-2", label: "SO-1319" }, owner: { ...item().owner, normal: { userId: YJ, name: "Yu Jun" }, acting: { userId: YJ, name: "Yu Jun" } } }),
    ];
    const first = show();
    expect(screen.getAllByTestId(/^work-order-row-/)).toHaveLength(1);
    first.unmount();
    show("/operation?tab=work&scope=team");
    expect(screen.getAllByTestId(/^work-order-row-/)).toHaveLength(2);
  });

  it("counts a PO window ONCE on its order and puts one Send act per unsent PO sourced from it alone", () => {
    indexState = {
      poOrders: new Map([["PO260903-4316", ["order-1"]], ["PO260903-7907", ["order-1"]]]),
      orderBySo: new Map([[1318, "order-1"]]),
      soByOrder: new Map([["order-1", 1318]]),
      windows: [{
        key: "2026-09-03T11:30", date: "2026-09-03", time: "11:30", timeWord: "11:30 AM", dueAt: "2026-09-03T11:30:00+08:00",
        demand: { items: 0, orders: 0, rowIds: [], suppliers: [] },
        pos: [
          { poId: "PO260903-4316", documentNo: "PO260903-4316", supplierId: null, supplierName: "Ohana", sent: false, channel: null, act: null, orderIds: ["order-1"] },
          { poId: "PO260903-7907", documentNo: "PO260903-7907", supplierId: null, supplierName: "Nice Future", sent: false, channel: null, act: null, orderIds: ["order-1"] },
        ],
        unsent: 2,
        card: { objectLabel: "11:30 AM PO window", problem: "", action: "", recipient: null, requiredResult: "" },
      }],
    };
    workState.data!.items = [
      item(),
      item({ id: "purchasing:w:po_window", module: "purchasing", ruleKey: "purchasing.po_window", object: { kind: "po_window", id: "2026-09-03T11:30", label: "11:30 AM PO window" } }),
    ];
    show();
    expect(screen.getByTestId("work-order-row-SO-1318")).toHaveTextContent(/^SO-13182$/);
    const mission = screen.getByTestId("work-mission-stub");
    expect(mission).toHaveTextContent("Send PO260903-4316 to Ohana · PO sent to supplier");
    expect(mission).toHaveTextContent("Send PO260903-7907 to Nice Future · PO sent to supplier");
    indexState = { poOrders: new Map(), orderBySo: new Map(), soByOrder: new Map(), windows: [] };
  });

  it("reads search, the day and the module from the URL", () => {
    show("/operation?tab=work&q=nothing-matches");
    expect(screen.queryAllByTestId(/^work-order-row-/)).toHaveLength(0);
    expect(screen.getByTestId("work-empty")).toBeInTheDocument();
  });

  it("shows a server failure as an error rather than a clear desk", () => {
    workState = { data: undefined, isLoading: false, isError: true };
    show();
    expect(screen.getByText("Work could not be loaded. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing assigned to you")).toBeNull();
  });

  it("shows a stable loading shell", () => {
    workState = { data: undefined, isLoading: true, isError: false };
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
  });

  it("offers Team Work when My Task is empty and the team has work", () => {
    workState.data!.items = [item({ owner: { ...item().owner, normal: { userId: YJ, name: "Yu Jun" }, acting: { userId: YJ, name: "Yu Jun" } } })];
    show();
    expect(screen.getByTestId("work-empty")).toHaveTextContent("Nothing assigned to you");
    fireEvent.click(screen.getByTestId("work-empty-team-door"));
    expect(screen.getByTestId("work-view-team")).toHaveAttribute("aria-pressed", "true");
  });

  it("prints no dash anywhere on the page", () => {
    const { container } = show();
    expect(container.textContent ?? "").not.toMatch(/[—–]/);
  });
});
