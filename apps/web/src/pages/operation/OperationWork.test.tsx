import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    expect(screen.getByRole("tab", { name: "My Work" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("work-row-SO-1318-ask_delivery_date")).toBeInTheDocument();
  });

  it("gives a manager with no My Work a truthful door into Team Work", async () => {
    authState = { role: "principal", email: "shasha@carres.test" };
    workState.data!.items = [item({
      owner: {
        rule: "salesperson",
        dutyKey: null,
        normal: { userId: YJ, name: "Yu Jun" },
        activeCover: null,
        coverEvidence: null,
        acting: { userId: YJ, name: "Yu Jun" },
        state: "primary",
      },
    })];
    show();
    expect(screen.getByTestId("work-empty")).toHaveTextContent("Nothing assigned to you");
    fireEvent.click(screen.getByRole("button", { name: "Open Team Work" }));
    expect(await screen.findByTestId(`work-owner-group-${YJ}`)).toBeInTheDocument();
  });

  it("does not expose Team Work to a My Work-only role, even through a copied URL", () => {
    authState = { role: "salesperson", email: "shasha@carres.test" };
    show("/operation?tab=work&scope=team");
    expect(screen.getByRole("tab", { name: "My Work" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: "Team Work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Team Work" })).not.toBeInTheDocument();
  });

  it("renders fact then action, with the object in the footer and no repeated owner", () => {
    show();
    const row = screen.getByTestId("work-row-SO-1318-ask_delivery_date");
    expect(row).toHaveTextContent("No delivery date");
    expect(row).toHaveTextContent("Ask customer for a delivery date");
    expect(row).not.toHaveTextContent("Shasha");
    expect(screen.getByTestId("work-card-footer")).toHaveTextContent("SO-1318");
  });

  it("routes covered work to the acting person's My Work but groups Team Work under normal owner", async () => {
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
    expect(screen.getByTestId("work-row-SO-1318-ask_delivery_date"))
      .toHaveTextContent("Covered for Shasha");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Team Work" }), { button: 0, ctrlKey: false });
    const group = await screen.findByTestId(`work-owner-group-${SH}`);
    expect(within(group).getByText(/Shasha/)).toBeInTheDocument();
    expect(within(group).getByTestId("work-row-SO-1318-ask_delivery_date"))
      .toHaveTextContent("Covered by Yu Jun");
  });

  it("keeps promise failures inside Missed and keeps No date separate", () => {
    workState.data!.items = [
      item({ id: "orders:broken", broken: true, timing: timing("2026-09-04", 2) }),
      item({ id: "orders:late", ruleKey: "issue_po", timing: timing("2026-09-05", 1) }),
      item({ id: "orders:none", ruleKey: "confirm_supplier_date", timing: timing(null) }),
    ];
    show("/operation?tab=work&day=all");
    expect(screen.queryByTestId("work-section-broken")).not.toBeInTheDocument();
    expect(screen.getByTestId("work-section-overdue")).toBeInTheDocument();
    expect(screen.getByTestId("work-section-no_date")).toBeInTheDocument();
  });

  it("uses separate Missed and dated group headings, never the retired combined heading", () => {
    workState.data!.items = [
      item({ id: "orders:late", timing: timing("2026-09-04", 1) }),
      item({ id: "orders:today", ruleKey: "confirm_delivery_date", timing: timing("2026-09-07") }),
    ];
    show();
    expect(screen.getByTestId("work-section-overdue")).toHaveTextContent("Missed 1");
    expect(screen.getByTestId("work-section-date-2026-09-07")).toHaveTextContent("Mon, 7 Sep 1");
    expect(screen.queryByText(/Missed 1 · Mon, 7 Sep 1/)).not.toBeInTheDocument();
  });

  it("draws Working day and Module as separate governed panels", () => {
    show();
    const rail = screen.getByRole("complementary", { name: "Work filters" });
    expect(rail.querySelector('[data-rail-group="Working day"]')).toHaveClass("rounded-panel", "border");
    expect(rail.querySelector('[data-rail-group="Module"]')).toHaveClass("rounded-panel", "border");
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
    expect(screen.getByRole("searchbox", { name: "Search work…" })).toHaveValue("Acme");
  });

  it("groups an unheld duty under its governed word with the Staff & Duties door — never a person", async () => {
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
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Team Work" }), { button: 0, ctrlKey: false });
    await waitFor(() => expect(screen.getByRole("tab", { name: "Team Work" })).toHaveAttribute("aria-selected", "true"));
    const group = await screen.findByTestId("work-owner-group-duty:delivery_duty");
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
    expect(screen.getByRole("region", { name: "Selected work" })).toHaveTextContent("No delivery date");
    expect(screen.getByRole("region", { name: "Selected work" })).not.toHaveTextContent("REQUIRED RESULT");
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
