import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

/* The party cards read Delivery through their own queries; their behaviour is
   held by work/LogisticsCard.test.tsx. The shell tests do not render them. */
vi.mock("@/pages/operation/components/GlobalTopBar", () => ({ TopBarIcons: () => <span data-testid="top-bar-icons" /> }));
vi.mock("./work/WorkParties", () => ({ default: () => null }));
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
  return render(
    <MemoryRouter initialEntries={[url]}>
      <OperationWork />
    </MemoryRouter>,
  );
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

describe("Operation Work — one server feed", () => {
  it("defaults everyone, including a manager, to My Work", () => {
    authState = { role: "principal", email: "shasha@carres.test" };
    show();
    expect(screen.getByTestId("work-view-mine")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("work-row-SO-1318-ask_delivery_date")).toBeInTheDocument();
  });

  it("renders object, problem, then action without repeating the owner", () => {
    show();
    const row = screen.getByTestId("work-row-SO-1318-ask_delivery_date");
    expect(row).toHaveTextContent("SO-1318");
    expect(row).toHaveTextContent("Mon, 7 Sep");
    expect(row).toHaveTextContent("Ask customer for a delivery date");
    expect(row).not.toHaveTextContent("Shasha");
  });

  it("routes covered work to the acting person's My Work but groups Team Work under normal owner", () => {
    workState.data!.items = [item({
      owner: {
        rule: "salesperson",
        dutyKey: null,
        normal: { userId: SH, name: "Shasha" },
        activeCover: { userId: YJ, name: "Yu Jun" },
        coverEvidence: { id: "cover-1", startsOn: "2026-09-07", endsOn: "2026-09-07" },
        acting: { userId: YJ, name: "Yu Jun" },
        state: "covered",
      },
    })];
    authState.email = "yujun@carres.test";
    show();
    /* My Work names the normal owner on the row (`For Shasha`, Jess
       2026-09-26); Team Work says it once, on the owner's group line. */
    expect(screen.getByTestId("work-row-SO-1318-ask_delivery_date"))
      .toHaveTextContent("For Shasha");
    fireEvent.click(screen.getByTestId("work-view-team"));
    const group = screen.getByTestId(`work-owner-group-${SH}`);
    expect(within(group).getByTestId(`work-owner-heading-${SH}`)).toHaveTextContent("Cover today: Yu Jun");
    expect(within(group).getByTestId("work-row-SO-1318-ask_delivery_date"))
      .not.toHaveTextContent("For Shasha");
  });

  it("keeps the governed My Work order in one card run: broken, missed, then No date", () => {
    workState.data!.items = [
      item({ id: "orders:none", ruleKey: "confirm_supplier_date", timing: timing(null) }),
      item({ id: "orders:late", ruleKey: "issue_po", timing: timing("2026-09-05", 1) }),
      item({ id: "orders:broken", broken: true, timing: timing("2026-09-04", 2) }),
    ];
    show("/operation?tab=work&day=all");
    const cards = [...screen.getByTestId("work-section-list").querySelectorAll("[data-work-row]")];
    expect(cards.map((card) => card.getAttribute("data-testid"))).toEqual([
      "work-row-SO-1318-ask_delivery_date",
      "work-row-SO-1318-issue_po",
      "work-row-SO-1318-confirm_supplier_date",
    ]);
    expect(cards[2]).toHaveTextContent("No date");
  });

  /* THE §6.0 SHELL (owner ruling 2026-09-25): Work follows the Sales Orders
     shell — the 50px Destination Header, one plain toolbar row, search 340px,
     Date and Page as selects, no rail and no Filters button. */
  it("draws the Sales Orders shell with the Payment Monitor rail: Destination Header, plain toolbar row, search 340px, rail", () => {
    show();
    expect(screen.getByTestId("work-destination-header")).toBeInTheDocument();
    expect(screen.queryByTestId("workspace-header")).toBeNull();
    expect(screen.queryByTestId("work-header-count")).toBeNull();
    const toolbar = screen.getByTestId("work-toolbar");
    /* The picker's controls sit over the picker, unframed (Jess, 2026-09-26). */
    expect(toolbar.className).not.toMatch(/rounded-work|border-work-line|border-b/);
    expect(within(toolbar).queryByTestId("work-filters-toggle")).toBeNull();
    expect(within(toolbar).getByTestId("work-view-mine").className).toContain("h-[34px]");
    /* The scope tabs and the search sit over the picker column (Jess, 2026-09-26). */
    expect(screen.queryByRole("searchbox")).toBeNull(); // no search on Work (Jess, 2026-09-26)
    expect(screen.getByTestId("work-list").className).toContain("bg-white");
    expect(within(screen.getByTestId("work-list")).getByTestId("work-toolbar")).toBeInTheDocument();
    /* No `Covering` button (Jess, 2026-09-26): cover shows on the row. */
    expect(within(toolbar).queryByRole("button", { name: "Covering" })).toBeNull();
    const rail = screen.getByTestId("work-rail");
    expect(within(rail).getByRole("button", { name: "Hide filters" })).toBeInTheDocument();
    expect(screen.getByTestId("work-rail-week")).toBeInTheDocument();
    expect(screen.getByTestId("work-rail-missed")).toBeInTheDocument();
    expect(screen.getByTestId("work-rail-page-all")).toHaveTextContent("All pages");
  });

  it("locks the Team owner line: 32px avatar, 12px initials, 15px name, 12px counts on one 32px line", () => {
    show();
    fireEvent.click(screen.getByTestId("work-view-team"));
    const heading = screen.getByTestId(`work-owner-heading-${SH}`);
    expect(heading.className).toContain("h-8");
    expect(heading.className).toContain("gap-2");
    expect(heading.className).toContain("whitespace-nowrap");
    const [avatar, name, count] = Array.from(heading.children) as HTMLElement[];
    expect(avatar.className).toContain("h-8");
    expect(avatar.className).toContain("w-8");
    expect(avatar.className).toContain("text-[12px]");
    expect(name).toHaveTextContent("Shasha");
    expect(name.className).toContain("text-[15px]");
    expect(name.className).toContain("leading-5");
    expect(count.className).toContain("text-[12px]");
    expect(count.className).toContain("font-normal");
  });

  it("reads search and filters from the URL", () => {
    workState.data!.items = [
      item(),
      item({
        id: "payment:invoice-1:collect",
        module: "payment",
        ruleKey: "collect",
        object: { kind: "invoice", id: "invoice-1", label: "INV-2041" },
        problem: "Customer balance due",
        action: "Ask the customer to pay",
        recipient: "Acme",
        timing: timing(null),
      }),
    ];
    show("/operation?tab=work&q=Acme&module=payment&when=no_date");
    expect(screen.queryByTestId("work-row-SO-1318-ask_delivery_date")).not.toBeInTheDocument();
    expect(screen.getByTestId("work-row-INV-2041-collect")).toBeInTheDocument();
  });

  it("groups an unheld duty under its governed word with the Staff & Duties door — never a person", () => {
    workState.data!.items = [item({
      id: "delivery:order-1:assign_logistics",
      module: "delivery",
      ruleKey: "assign_logistics",
      action: "Assign logistics",
      owner: {
        rule: "delivery_duty",
        dutyKey: "delivery_duty",
        normal: null,
        activeCover: null,
        coverEvidence: null,
        acting: null,
        state: "not_assigned",
      },
    })];
    show();
    fireEvent.click(screen.getByTestId("work-view-team"));
    const group = screen.getByTestId("work-owner-group-duty:delivery_duty");
    expect(within(group).getByText("Delivery Duty")).toBeInTheDocument();
    expect(group).not.toHaveTextContent("Shasha");
    const failure = within(group).getByTestId("work-duty-unassigned-delivery_duty");
    expect(failure).toHaveTextContent("Nobody holds Delivery Duty.");
    expect(within(failure).getByRole("link", { name: "Set the holder in Workspace → Staff & Duties" }))
      .toHaveAttribute("href", "/operation?tab=staff-duties");
  });

  it("selects work in the action panel before opening the owning module", () => {
    show();
    fireEvent.click(screen.getByTestId("work-row-SO-1318-ask_delivery_date"));
    /* §5.10: a Sales Order's result lives on its party cards; the summary
       says what is wrong, what to do and which record opens. */
    expect(screen.getByRole("region", { name: "Work summary" })).toHaveTextContent("Ask customer for a delivery date");
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open SO-1318" }));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/order-1");
  });

  it("keeps a Delivery item on its exact Delivery Order door", () => {
    workState.data!.items = [item({
      id: "delivery:DO-2041:deliver_today",
      module: "delivery",
      ruleKey: "deliver_today",
      object: { kind: "delivery_order", id: "DO-2041", label: "DO-2041" },
      problem: "Delivery due today",
      action: "Record the delivery result",
      destination: "/operation/delivery-orders/DO-2041",
    })];
    show();
    fireEvent.click(screen.getByTestId("work-row-DO-2041-deliver_today"));
    fireEvent.click(screen.getByRole("button", { name: "Open DO-2041" }));
    expect(navigate).toHaveBeenCalledWith("/operation/delivery-orders/DO-2041");
  });

  it("keeps Payment collection on its exact Invoice door", () => {
    workState.data!.items = [item({
      id: "payment:invoice-1:payment.collect_customer_balance",
      module: "payment",
      ruleKey: "payment.collect_customer_balance",
      object: { kind: "invoice", id: "invoice-1", label: "INV-2041" },
      problem: "Customer balance due",
      action: "Ask the customer to pay",
      destination: "/finance/invoices?invoice=invoice-1",
    })];
    show();
    fireEvent.click(screen.getByTestId("work-row-INV-2041-payment.collect_customer_balance"));
    fireEvent.click(screen.getByRole("button", { name: "Open INV-2041" }));
    expect(navigate).toHaveBeenCalledWith("/finance/invoices?invoice=invoice-1");
  });

  it("shows server failure as an error rather than a clear desk", () => {
    workState = { data: undefined, isLoading: false, isError: true };
    show();
    expect(screen.getByTestId("work-error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("keeps the last good list and the filters when a refresh fails, with one retry row", () => {
    workState = { ...workState, isError: true };
    show("/operation?tab=work&day=all");
    expect(screen.getByTestId("work-refresh-failed")).toHaveTextContent("Work could not be loaded. Try again.");
    expect(screen.getByTestId("work-row-SO-1318-ask_delivery_date")).toBeInTheDocument();
    expect(screen.queryByTestId("work-error")).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("work-refresh-failed")).getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("draws 50 cards, then 50 more when the list end scrolls into view; choosing a card never shrinks it", () => {
    let reveal: (() => void) | null = null;
    const Observer = vi.fn(function (this: unknown, callback: IntersectionObserverCallback) {
      reveal = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as IntersectionObserver);
      return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn(), takeRecords: vi.fn() };
    });
    vi.stubGlobal("IntersectionObserver", Observer);
    workState.data!.items = Array.from({ length: 120 }, (_, n) => item({
      id: `orders:${n}`,
      object: { kind: "sales_order", id: `so-${n}`, label: `SO-${2000 + n}` },
    }));
    show("/operation?tab=work&day=all");
    const cards = () => screen.getByTestId("work-section-list").querySelectorAll("[data-work-row]");
    expect(cards()).toHaveLength(50);
    act(() => reveal?.());
    expect(cards()).toHaveLength(100);
    fireEvent.click(cards()[80]);
    expect(cards()).toHaveLength(100);
    act(() => reveal?.());
    expect(cards()).toHaveLength(120);
    expect(screen.queryByTestId("work-list-more")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows a stable loading shell", () => {
    workState = { data: undefined, isLoading: true, isError: false };
    show();
    expect(screen.getByTestId("work-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("work-empty")).not.toBeInTheDocument();
  });

  it("shows an explicit empty state", () => {
    workState.data!.items = [];
    show();
    expect(screen.getByTestId("work-empty")).toHaveTextContent("Nothing assigned to you");
  });
});
