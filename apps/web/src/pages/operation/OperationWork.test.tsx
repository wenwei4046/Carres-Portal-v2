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

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationWork: () => workState,
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
  useAuth: (select: (state: { role: string; user: { email: string } }) => unknown) =>
    select({ role: authState.role, user: { email: authState.email } }),
}));
const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

import OperationWork from "./OperationWork";

function item(overrides: Partial<OperationWorkItem> = {}): OperationWorkItem {
  return {
    id: "orders:order-1:ask_delivery_date",
    module: "orders",
    ruleKey: "ask_delivery_date",
    object: { kind: "sales_order", id: "order-1", label: "SO-1318" },
    problem: "No delivery date",
    action: "Ask customer for a delivery date",
    recipient: "Tan Qu Qu",
    requiredResult: "Customer Delivery exists",
    completionFact: "orders.delivery_date exists",
    owner: {
      rule: "salesperson",
      dutyKey: null,
      normal: { userId: SH, name: "Shasha" },
      activeCover: null,
      acting: { userId: SH, name: "Shasha" },
      state: "primary",
    },
    timing: { dueOn: "2026-09-06", workingDaysLate: 0, bucket: "today" },
    destination: "/operation/orders/so/order-1",
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
  authState = { role: "operation", email: "shasha@carres.test" };
  workState = {
    data: {
      items: [item()],
      staff: [
        { userId: SH, name: "Shasha", email: "shasha@carres.test" },
        { userId: YJ, name: "Yu Jun", email: "yujun@carres.test" },
      ],
      generatedOn: "2026-09-06",
    },
    isLoading: false,
    isError: false,
  };
});

describe("Operation Work — one server feed", () => {
  it("defaults everyone, including a manager, to My Work", () => {
    authState = { role: "principal", email: "shasha@carres.test" };
    show();
    expect(screen.getByTestId("work-view-mine")).toHaveClass("bg-base-900");
    expect(screen.getByTestId("work-row-SO-1318-ask_delivery_date")).toBeInTheDocument();
  });

  it("renders object, problem, then action without repeating the owner", () => {
    show();
    const row = screen.getByTestId("work-row-SO-1318-ask_delivery_date");
    expect(row).toHaveTextContent("SO-1318");
    expect(row).toHaveTextContent("No delivery date");
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
        acting: { userId: YJ, name: "Yu Jun" },
        state: "covered",
      },
    })];
    authState.email = "yujun@carres.test";
    show();
    expect(screen.getByTestId("work-row-SO-1318-ask_delivery_date")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("work-view-team"));
    expect(within(screen.getByTestId(`work-owner-group-${SH}`)).getByText(/Shasha/))
      .toBeInTheDocument();
  });

  it("opens the exact destination supplied by the owning module", () => {
    show();
    fireEvent.click(screen.getByTestId("work-row-SO-1318-ask_delivery_date"));
    expect(navigate).toHaveBeenCalledWith("/operation/orders/so/order-1");
  });

  it("shows server failure as an error rather than a clear desk", () => {
    workState = { data: undefined, isLoading: false, isError: true };
    show();
    expect(screen.getByTestId("work-error")).toBeInTheDocument();
  });

  it("shows an explicit empty state", () => {
    workState.data!.items = [];
    show();
    expect(screen.getByTestId("work-empty")).toBeInTheDocument();
  });
});

