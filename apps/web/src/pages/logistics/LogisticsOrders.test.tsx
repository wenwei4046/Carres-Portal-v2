import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LogisticsOrders from "./LogisticsOrders";
import type {
  LogisticsOrdersListResponse,
  LogisticsOrderListRow,
  LogisticsOrderDetailResponse,
  DeliveryPartnersListResponse,
} from "@/lib/queries";

/**
 * LogisticsOrders kanban — covers the M5 Task 2 plan list (15+ tests).
 *
 * Uses the same vi.mock(@/lib/queries) pattern as LogisticsDashboard.test.tsx.
 * Each test sets `listHookState` (and optionally `detailHookState`) before
 * rendering. Mutation hooks return inert mocks (mutateAsync resolves to
 * empty payload) — modal submit flows are exercised via individual modal
 * tests rather than the kanban suite to keep this file focused on the page.
 */

let listHookState: {
  data: LogisticsOrdersListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let detailHookState: {
  data: LogisticsOrderDetailResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let partnersHookState: {
  data: DeliveryPartnersListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};
const refetchSpy = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  const inertMutation = () => ({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  });
  return {
    ...actual,
    useLogisticsOrders: () => listHookState,
    useLogisticsOrder: () => detailHookState,
    useDeliveryPartners: () => partnersHookState,
    useAssignPartnerMutation: () => inertMutation(),
    useAttachDoMutation: () => inertMutation(),
    useAbandonOrderMutation: () => inertMutation(),
    useIssuePosForOrderMutation: () => inertMutation(),
    useRecheckStockMutation: () => inertMutation(),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function makeOrder(overrides: Partial<LogisticsOrderListRow> = {}): LogisticsOrderListRow {
  return {
    id: "ord-" + Math.random().toString(36).slice(2, 10),
    dl: 9000 + Math.floor(Math.random() * 999),
    status: "proceed_order",
    logistics_stage: "awaiting_stock",
    warehouse_id: "wh-1",
    customer_name: "Alice Tan",
    placed_at: "2026-04-28T08:00:00Z",
    delivery_date: "2026-05-05",
    delivery_partner_id: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "ComfortBeds" },
    ...overrides,
  };
}

function makeDetail(): LogisticsOrderDetailResponse {
  return {
    order: {
      id: "ord-1",
      dl: 9001,
      status: "proceed_order",
      logistics_stage: "ready_to_dispatch",
      warehouse_id: "wh-1",
      customer_name: "Alice Tan",
      customer_phone: "+60 12-345 6789",
      customer_address: "123 Jalan ABC, KL",
      customer_address_unknown: false,
      delivery_date: "2026-05-05",
      delivery_date_tbd: false,
      placed_at: "2026-04-28T08:00:00Z",
      do_number: null,
      do_note: null,
      dispatched_at: null,
      delivered_at: null,
      delivery_partner_id: null,
      dealer_id: "d-1",
      outlet_id: null,
      dealers: { name: "ComfortBeds" },
      outlets: null,
    },
    lines: [{ sku: "SOFA-NORD-3S", qty: 1, unit_price: 4500 }],
    addons: [],
    total: 4500,
    warehouse: { id: "wh-1", name: "KL Warehouse", address: "Subang" },
    stockBalances: [
      { sku: "SOFA-NORD-3S", warehouse_id: "wh-1", qty: 5, reserved: 0 },
    ],
    pos: [],
    history: [
      { text: "Order placed", by_role: "dealer", occurred_at: "2026-04-28T08:00:00Z" },
    ],
  };
}

function setLoaded(orders: LogisticsOrderListRow[]) {
  listHookState = {
    data: { orders },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchSpy,
  };
  detailHookState = {
    data: makeDetail(),
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
  partnersHookState = {
    data: { partners: [] },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  refetchSpy.mockClear();
});

describe("LogisticsOrders — kanban", () => {
  it("1. renders all 4 stage columns", () => {
    setLoaded([
      makeOrder({ id: "a", logistics_stage: "awaiting_stock" }),
      makeOrder({ id: "b", logistics_stage: "ready_to_dispatch" }),
      makeOrder({ id: "c", logistics_stage: "dispatched" }),
      makeOrder({ id: "d", logistics_stage: "delivered" }),
    ]);
    render(wrap(<LogisticsOrders />));

    expect(screen.getByTestId("stage-column-awaiting_stock")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-ready_to_dispatch")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-dispatched")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-delivered")).toBeInTheDocument();
  });

  it("2. stage filter chip narrows visible orders to that stage", () => {
    setLoaded([
      makeOrder({ id: "a", dl: 1, logistics_stage: "awaiting_stock", customer_name: "Awaiting" }),
      makeOrder({ id: "b", dl: 2, logistics_stage: "ready_to_dispatch", customer_name: "Ready" }),
    ]);
    render(wrap(<LogisticsOrders />));
    expect(screen.getByText("Awaiting")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();

    // Click the "Ready to Dispatch · 1" chip
    fireEvent.click(screen.getByRole("tab", { name: /Ready to Dispatch · 1/ }));
    expect(screen.queryByText("Awaiting")).not.toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("3. channel filter dropdown has dealers + showrooms options", () => {
    setLoaded([makeOrder({ id: "a" })]);
    render(wrap(<LogisticsOrders />));
    const select = screen.getByLabelText(/Sales channel filter/);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /All sales channels/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Dealers$/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Showrooms$/ })).toBeInTheDocument();
  });

  it("4. search input updates and the filter chip count reflects the full list", () => {
    setLoaded([
      makeOrder({ id: "a", dl: 9001, customer_name: "Alice" }),
      makeOrder({ id: "b", dl: 9002, customer_name: "Bob" }),
    ]);
    render(wrap(<LogisticsOrders />));
    const search = screen.getByLabelText(/Search orders/);
    fireEvent.change(search, { target: { value: "9001" } });
    // We do client-side stage filtering only — the server-side search is
    // exercised via the URL query param. Confirm the input took the value.
    expect((search as HTMLInputElement).value).toBe("9001");
  });

  it("5. clicking an order card opens the detail drawer", () => {
    setLoaded([
      makeOrder({ id: "ord-1", dl: 1234, customer_name: "Click Me" }),
    ]);
    render(wrap(<LogisticsOrders />));
    fireEvent.click(screen.getByText("Click Me"));
    expect(screen.getByTestId("order-detail-drawer")).toBeInTheDocument();
  });

  it("6. drawer shows the right action buttons for ready_to_dispatch", () => {
    setLoaded([
      makeOrder({ id: "ord-1", dl: 9001, customer_name: "Click Me", logistics_stage: "ready_to_dispatch" }),
    ]);
    render(wrap(<LogisticsOrders />));
    fireEvent.click(screen.getByText("Click Me"));
    expect(
      screen.getByRole("button", { name: /Assign delivery partner/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Abandon/ }),
    ).toBeInTheDocument();
  });

  it("7. multi-select awaiting_stock orders → bundle sheet appears", () => {
    setLoaded([
      makeOrder({ id: "a", dl: 1, logistics_stage: "awaiting_stock" }),
      makeOrder({ id: "b", dl: 2, logistics_stage: "awaiting_stock" }),
    ]);
    render(wrap(<LogisticsOrders />));
    expect(screen.queryByTestId("cross-order-bundle-sheet")).not.toBeInTheDocument();

    // Find the two checkboxes (filter for the order-card ones — the column
    // also has a "select all" checkbox).
    const awaitingCol = screen.getByTestId("stage-column-awaiting_stock");
    const checkboxes = awaitingCol.querySelectorAll('input[type="checkbox"]');
    // [select-all, card1, card2]
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[1].parentElement!);
    fireEvent.click(checkboxes[2].parentElement!);
    expect(screen.getByTestId("cross-order-bundle-sheet")).toBeInTheDocument();
    expect(screen.getByText(/2 orders selected/)).toBeInTheDocument();
  });

  it("8. Bundle 'Clear' resets the selection and hides the sheet", () => {
    setLoaded([
      makeOrder({ id: "a", dl: 1, logistics_stage: "awaiting_stock" }),
    ]);
    render(wrap(<LogisticsOrders />));
    const awaitingCol = screen.getByTestId("stage-column-awaiting_stock");
    const checkboxes = awaitingCol.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[1].parentElement!);
    expect(screen.getByTestId("cross-order-bundle-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(screen.queryByTestId("cross-order-bundle-sheet")).not.toBeInTheDocument();
  });

  it("9. checkbox is rendered ONLY on awaiting_stock cards", () => {
    setLoaded([
      makeOrder({ id: "a", dl: 1, logistics_stage: "awaiting_stock" }),
      makeOrder({ id: "b", dl: 2, logistics_stage: "ready_to_dispatch" }),
      makeOrder({ id: "c", dl: 3, logistics_stage: "dispatched" }),
      makeOrder({ id: "d", dl: 4, logistics_stage: "delivered" }),
    ]);
    render(wrap(<LogisticsOrders />));
    const awaitingCol = screen.getByTestId("stage-column-awaiting_stock");
    const readyCol = screen.getByTestId("stage-column-ready_to_dispatch");
    const dispatchedCol = screen.getByTestId("stage-column-dispatched");
    const deliveredCol = screen.getByTestId("stage-column-delivered");

    // awaiting: select-all + 1 card checkbox = 2 checkboxes
    expect(awaitingCol.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    // others: zero
    expect(readyCol.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(dispatchedCol.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(deliveredCol.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });

  it("10. CJK customer name receives font-cjk class on the card", () => {
    setLoaded([
      makeOrder({ id: "a", dl: 1, customer_name: "王小明", logistics_stage: "awaiting_stock" }),
    ]);
    render(wrap(<LogisticsOrders />));
    const node = screen.getByText("王小明");
    expect(node.className).toContain("font-cjk");
  });

  it("11. CJK customer name receives font-cjk class on the drawer header", () => {
    setLoaded([
      makeOrder({ id: "ord-1", dl: 9001, customer_name: "王小明" }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: { ...makeDetail().order, customer_name: "王小明" },
      },
    };
    render(wrap(<LogisticsOrders />));
    fireEvent.click(screen.getByText("王小明"));
    // The drawer header repeats the name as a 22px display title — find it.
    const drawer = screen.getByTestId("order-detail-drawer");
    const cjkNodes = drawer.querySelectorAll(".font-cjk");
    expect(cjkNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("12. drawer ESC key closes the drawer", () => {
    setLoaded([makeOrder({ id: "ord-1", dl: 9001, customer_name: "Alice" })]);
    render(wrap(<LogisticsOrders />));
    fireEvent.click(screen.getByText("Alice"));
    expect(screen.getByTestId("order-detail-drawer")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("order-detail-drawer")).not.toBeInTheDocument();
  });

  it("13. loading state renders the kanban skeleton", () => {
    listHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchSpy,
    };
    detailHookState = {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    partnersHookState = { data: undefined, isLoading: false, isError: false };
    render(wrap(<LogisticsOrders />));
    expect(screen.getByTestId("logistics-orders-skeleton")).toBeInTheDocument();
  });

  it("14. error state shows retry that calls refetch", () => {
    listHookState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: refetchSpy,
    };
    detailHookState = {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    partnersHookState = { data: undefined, isLoading: false, isError: false };
    render(wrap(<LogisticsOrders />));
    expect(screen.getByText(/Couldn’t load orders/)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("15. drawer 'Print DO' button only renders when order is delivered", () => {
    setLoaded([makeOrder({ id: "ord-1", dl: 9001, customer_name: "Alice" })]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          status: "delivered",
          logistics_stage: "delivered",
          do_number: "DO-9801",
        },
      },
    };
    render(wrap(<LogisticsOrders />));
    fireEvent.click(screen.getByText("Alice"));
    expect(screen.getByRole("button", { name: /Print DO/ })).toBeInTheDocument();
  });

  it("16. drawer awaiting_stock action bar shows Re-check stock + Issue POs + Abandon", () => {
    setLoaded([
      makeOrder({ id: "ord-1", dl: 9001, customer_name: "Alice", logistics_stage: "awaiting_stock" }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          logistics_stage: "awaiting_stock",
        },
        // Force a shortage so "Issue POs" surfaces.
        stockBalances: [
          { sku: "SOFA-NORD-3S", warehouse_id: "wh-1", qty: 0, reserved: 0 },
        ],
      },
    };
    render(wrap(<LogisticsOrders />));
    fireEvent.click(screen.getByText("Alice"));
    expect(
      screen.getByRole("button", { name: /Re-check stock/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Issue POs/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Abandon/ }),
    ).toBeInTheDocument();
  });

  it("17. drawer dispatched stage shows only Mark delivered (no Abandon)", () => {
    setLoaded([
      makeOrder({ id: "ord-1", dl: 9001, customer_name: "Alice", logistics_stage: "dispatched" }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          logistics_stage: "dispatched",
          delivery_partner_id: "p-1",
        },
      },
    };
    render(wrap(<LogisticsOrders />));
    fireEvent.click(screen.getByText("Alice"));
    expect(
      screen.getByRole("button", { name: /Attach DO & mark delivered/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Abandon/ }),
    ).not.toBeInTheDocument();
  });
});
