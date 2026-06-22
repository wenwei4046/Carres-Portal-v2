import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OperationOrders from "./OperationOrders";
import type {
  operationOrdersListResponse,
  operationOrderListRow,
  operationOrderDetailResponse,
  DeliveryPartnersListResponse,
} from "@/lib/queries";

/**
 * OperationOrders kanban — covers the M5 Task 2 plan list (15+ tests).
 *
 * Uses the same vi.mock(@/lib/queries) pattern as OperationDashboard.test.tsx.
 * Each test sets `listHookState` (and optionally `detailHookState`) before
 * rendering. Mutation hooks return inert mocks (mutateAsync resolves to
 * empty payload) — modal submit flows are exercised via individual modal
 * tests rather than the kanban suite to keep this file focused on the page.
 */

let listHookState: {
  data: operationOrdersListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let detailHookState: {
  data: operationOrderDetailResponse | undefined;
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
// Pipeline v2 (C3.2): warehouse fixture must be test-mutable so the
// TransferReadyDialog pre-flight branch can be exercised both with stock
// (sufficient → submit enabled) and without (shortage → submit blocked).
let warehouseHookState: {
  data:
    | {
        warehouses: { id: string; name: string; address: string | null }[];
        byWarehouse: Record<
          string,
          { sku: string; qty: number; reserved: number; low_stock_status: "ok" }[]
        >;
        totalsBySku: Record<string, never>;
      }
    | undefined;
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
    useOperationOrders: () => listHookState,
    useOperationOrder: () => detailHookState,
    useDeliveryPartners: () => partnersHookState,
    // Pipeline v2 (C3): warehouses list powers the ConfirmProceed +
    // TransferReady dialog pickers. Driven by test state so individual
    // cases can flip the byWarehouse fixture between sufficient + short.
    useOperationWarehouse: () => warehouseHookState,
    useAssignPartnerMutation: () => inertMutation(),
    useAttachDoMutation: () => inertMutation(),
    useAbandonOrderMutation: () => inertMutation(),
    useIssuePosForOrderMutation: () => inertMutation(),
    useRecheckStockMutation: () => inertMutation(),
    useConfirmProceedRequest: () => inertMutation(),
    useTransferReady: () => inertMutation(),
  };
});

function wrap(node: React.ReactNode, initialPath = "/operation/orders") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 2026-05-10 redesign: OperationOrders is now URL-driven (Overall vs
  // per-stage). Mount under a Routes table so `useParams<{ stage }>()` reads
  // the slug from the URL the same way OperationApp wires it in production.
  // Tests start at the Overall path by default; pass `initialPath` to land
  // on a specific stage page.
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/operation/orders" element={node} />
          <Route path="/operation/orders/:stage" element={node} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function makeOrder(overrides: Partial<operationOrderListRow> = {}): operationOrderListRow {
  return {
    id: "ord-" + Math.random().toString(36).slice(2, 10),
    so: 9000 + Math.floor(Math.random() * 999),
    status: "proceed_order",
    operation_stage: "awaiting_operation_action",
    warehouse_id: "wh-1",
    customer_name: "Alice Tan",
    placed_at: "2026-04-28T08:00:00Z",
    delivery_date: "2026-05-05",
    delivery_partner_id: null,
    // Migration 0147 (item h, 2026-05-23) — order-level LP request state.
    request_for_delivery_at: null,
    partner_accepted_at: null,
    partner_rejected_at: null,
    partner_rejected_reason: null,
    delivery_partners: null,
    do_number: null,
    dispatched_at: null,
    delivered_at: null,
    outlet_id: null,
    dealer_id: "d-1",
    dealers: { name: "ComfortBeds" },
    // Phase 4.5 Chunk 2 (T9) — embedded threads default to empty array. Tests
    // that exercise the LP pill path override with realistic thread fixtures.
    order_supplier_threads: [], order_annotations: [],
    ...overrides,
  };
}

function makeDetail(): operationOrderDetailResponse {
  return {
    order: {
      id: "ord-1",
      so: 9001,
      status: "proceed_order",
      operation_stage: "ready_to_dispatch",
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
      delivery_stops: null,
      dealer_id: "d-1",
      outlet_id: null,
      invoice_no: null,
      invoiced_at: null,
      paid: 2250,
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
    // Phase 4.5 Chunk 2 (T9) — drawer detail now exposes thread customer-leg
    // LP fields. Default to empty array; tests that exercise the partner-
    // assignment ActionBar branches override with assigned threads.
    threads: [],
  };
}

function setLoaded(orders: operationOrderListRow[]) {
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
  // Default to a single warehouse with sufficient stock — individual tests
  // can override before render to drive the dialog into shortage state.
  warehouseHookState = {
    data: {
      warehouses: [{ id: "wh-1", name: "KL Warehouse", address: "Subang" }],
      byWarehouse: {
        "wh-1": [
          { sku: "SOFA-NORD-3S", qty: 5, reserved: 0, low_stock_status: "ok" },
        ],
      },
      totalsBySku: {},
    },
    isLoading: false,
    isError: false,
  };
}

beforeEach(() => {
  refetchSpy.mockClear();
});

describe("OperationOrders — kanban", () => {
  it("1. renders all 6 Pipeline v2 stage columns including Placed and Proceed Request", () => {
    setLoaded([
      makeOrder({ id: "a", operation_stage: "awaiting_operation_action" }),
      makeOrder({ id: "b", operation_stage: "ready_to_dispatch" }),
      makeOrder({ id: "c", operation_stage: "dispatched" }),
      makeOrder({ id: "d", operation_stage: "delivered" }),
    ]);
    render(wrap(<OperationOrders />));

    expect(screen.getByTestId("stage-column-placed")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-proceed_request")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-awaiting_operation_action")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-ready_to_dispatch")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-dispatched")).toBeInTheDocument();
    expect(screen.getByTestId("stage-column-delivered")).toBeInTheDocument();
  });

  it("2. clicking a pipeline chip navigates to the per-stage page (URL + view both update)", () => {
    setLoaded([
      makeOrder({ id: "a", so: 1, operation_stage: "awaiting_operation_action", customer_name: "Awaiting" }),
      makeOrder({ id: "b", so: 2, operation_stage: "ready_to_dispatch", customer_name: "Ready" }),
    ]);
    render(wrap(<OperationOrders />));
    // Overall view shows BOTH orders (kanban with all 6 columns).
    expect(screen.getByText("Awaiting")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();

    // Click chip → Link nav to /operation/orders/ready_to_dispatch.
    fireEvent.click(screen.getByTestId("pipeline-chip-ready_to_dispatch"));

    // Stage page now shows only the ready order; the awaiting one is hidden.
    expect(screen.getByTestId("stage-page-ready_to_dispatch")).toBeInTheDocument();
    expect(screen.queryByText("Awaiting")).not.toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    // Banner reflects the count for that stage.
    expect(screen.getByTestId("stage-banner-count-ready_to_dispatch").textContent).toBe("1");
  });

  it("3. pipeline header renders all 7 chips (Overall + 6 stages) with correct counts", () => {
    setLoaded([
      makeOrder({ id: "a", operation_stage: "awaiting_operation_action" }),
      makeOrder({ id: "b", operation_stage: "awaiting_operation_action" }),
      makeOrder({ id: "c", operation_stage: "delivered" }),
    ]);
    render(wrap(<OperationOrders />));
    // All 7 chips present.
    expect(screen.getByTestId("pipeline-chip-overall")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-chip-placed")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-chip-proceed_request")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-chip-awaiting_operation_action")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-chip-ready_to_dispatch")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-chip-dispatched")).toBeInTheDocument();
    expect(screen.getByTestId("pipeline-chip-delivered")).toBeInTheDocument();
    // Counts reflect the loaded orders.
    expect(
      screen.getByTestId("pipeline-chip-awaiting_operation_action").textContent,
    ).toMatch(/2/);
    expect(screen.getByTestId("pipeline-chip-delivered").textContent).toMatch(/1/);
    // Overall sums to 3.
    expect(screen.getByTestId("pipeline-chip-overall").textContent).toMatch(/3/);
  });

  it("4. search input updates state (header search box, new aria label)", () => {
    setLoaded([
      makeOrder({ id: "a", so: 9001, customer_name: "Alice" }),
      makeOrder({ id: "b", so: 9002, customer_name: "Bob" }),
    ]);
    render(wrap(<OperationOrders />));
    const search = screen.getByLabelText(/Search by order ID/);
    fireEvent.change(search, { target: { value: "9001" } });
    expect((search as HTMLInputElement).value).toBe("9001");
  });

  it("4b. landing on /operation/orders/:stage directly renders the stage page (deep-link)", () => {
    setLoaded([
      makeOrder({ id: "a", operation_stage: "delivered", customer_name: "DeepLink" }),
      makeOrder({ id: "b", operation_stage: "awaiting_operation_action", customer_name: "OtherStage" }),
    ]);
    render(wrap(<OperationOrders />, "/operation/orders/delivered"));
    expect(screen.getByTestId("stage-page-delivered")).toBeInTheDocument();
    // Banner copy reflects the stage description.
    expect(screen.getByTestId("stage-banner-delivered").textContent).toMatch(
      /DO on file/i,
    );
    // Other stage's order is filtered out.
    expect(screen.queryByText("OtherStage")).not.toBeInTheDocument();
    expect(screen.getByText("DeepLink")).toBeInTheDocument();
  });

  it("4c. stage page with no matching orders shows the empty state", () => {
    setLoaded([
      makeOrder({ id: "a", operation_stage: "awaiting_operation_action" }),
    ]);
    render(wrap(<OperationOrders />, "/operation/orders/dispatched"));
    expect(screen.getByTestId("stage-empty-state")).toBeInTheDocument();
    expect(screen.getByText(/No orders in this stage/i)).toBeInTheDocument();
  });

  it("5. clicking an order card opens the detail drawer", () => {
    setLoaded([
      makeOrder({ id: "ord-1", so: 1234, customer_name: "Click Me" }),
    ]);
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Click Me"));
    expect(screen.getByTestId("order-detail-drawer")).toBeInTheDocument();
  });

  it("6. drawer shows the right action buttons for ready_to_dispatch", () => {
    setLoaded([
      makeOrder({ id: "ord-1", so: 9001, customer_name: "Click Me", operation_stage: "ready_to_dispatch" }),
    ]);
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Click Me"));
    expect(
      screen.getByRole("button", { name: /Assign delivery partner/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Abandon/ }),
    ).toBeInTheDocument();
  });

  it("7. multi-select awaiting_operation_action orders → bundle sheet appears", () => {
    setLoaded([
      makeOrder({ id: "a", so: 1, operation_stage: "awaiting_operation_action" }),
      makeOrder({ id: "b", so: 2, operation_stage: "awaiting_operation_action" }),
    ]);
    render(wrap(<OperationOrders />));
    expect(screen.queryByTestId("cross-order-bundle-sheet")).not.toBeInTheDocument();

    // Find the two checkboxes (filter for the order-card ones — the column
    // also has a "select all" checkbox).
    const awaitingCol = screen.getByTestId("stage-column-awaiting_operation_action");
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
      makeOrder({ id: "a", so: 1, operation_stage: "awaiting_operation_action" }),
    ]);
    render(wrap(<OperationOrders />));
    const awaitingCol = screen.getByTestId("stage-column-awaiting_operation_action");
    const checkboxes = awaitingCol.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checkboxes[1].parentElement!);
    expect(screen.getByTestId("cross-order-bundle-sheet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(screen.queryByTestId("cross-order-bundle-sheet")).not.toBeInTheDocument();
  });

  it("9. checkbox is rendered ONLY on awaiting_operation_action cards", () => {
    setLoaded([
      makeOrder({ id: "a", so: 1, operation_stage: "awaiting_operation_action" }),
      makeOrder({ id: "b", so: 2, operation_stage: "ready_to_dispatch" }),
      makeOrder({ id: "c", so: 3, operation_stage: "dispatched" }),
      makeOrder({ id: "d", so: 4, operation_stage: "delivered" }),
    ]);
    render(wrap(<OperationOrders />));
    const awaitingCol = screen.getByTestId("stage-column-awaiting_operation_action");
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
      makeOrder({ id: "a", so: 1, customer_name: "王小明", operation_stage: "awaiting_operation_action" }),
    ]);
    render(wrap(<OperationOrders />));
    const node = screen.getByText("王小明");
    expect(node.className).toContain("font-cjk");
  });

  it("11. CJK customer name receives font-cjk class on the drawer header", () => {
    setLoaded([
      makeOrder({ id: "ord-1", so: 9001, customer_name: "王小明" }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: { ...makeDetail().order, customer_name: "王小明" },
      },
    };
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("王小明"));
    // The drawer header repeats the name as a 22px display title — find it.
    const drawer = screen.getByTestId("order-detail-drawer");
    const cjkNodes = drawer.querySelectorAll(".font-cjk");
    expect(cjkNodes.length).toBeGreaterThanOrEqual(1);
  });

  it("12. drawer ESC key closes the drawer", () => {
    setLoaded([makeOrder({ id: "ord-1", so: 9001, customer_name: "Alice" })]);
    render(wrap(<OperationOrders />));
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
    warehouseHookState = { data: undefined, isLoading: true, isError: false };
    render(wrap(<OperationOrders />));
    expect(screen.getByTestId("operation-orders-skeleton")).toBeInTheDocument();
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
    warehouseHookState = { data: undefined, isLoading: false, isError: true };
    render(wrap(<OperationOrders />));
    expect(screen.getByText(/Couldn’t load orders/)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("15. drawer 'Print DO' button only renders when order is delivered", () => {
    setLoaded([makeOrder({ id: "ord-1", so: 9001, customer_name: "Alice" })]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          status: "delivered",
          operation_stage: "delivered",
          do_number: "DO-9801",
        },
      },
    };
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Alice"));
    // Doc reprints (incl. Print DO) moved into the ⋮ actions menu → Download ▶
    // submenu — open the menu, then the submenu.
    fireEvent.click(screen.getByRole("button", { name: /More actions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Download/ }));
    expect(screen.getByRole("button", { name: /Print DO/ })).toBeInTheDocument();
  });

  it("16. drawer awaiting_operation_action action bar shows Re-check stock + Issue POs + Abandon", () => {
    setLoaded([
      makeOrder({ id: "ord-1", so: 9001, customer_name: "Alice", operation_stage: "awaiting_operation_action" }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          operation_stage: "awaiting_operation_action",
        },
        // Force a shortage so "Issue POs" surfaces.
        stockBalances: [
          { sku: "SOFA-NORD-3S", warehouse_id: "wh-1", qty: 0, reserved: 0 },
        ],
      },
    };
    render(wrap(<OperationOrders />));
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
      makeOrder({ id: "ord-1", so: 9001, customer_name: "Alice", operation_stage: "dispatched" }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          operation_stage: "dispatched",
          delivery_partner_id: "p-1",
        },
      },
    };
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Alice"));
    expect(
      screen.getByRole("button", { name: /Attach DO & mark delivered/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Abandon/ }),
    ).not.toBeInTheDocument();
  });

  it("18. order with status='place' lands in the Placed column", () => {
    setLoaded([
      makeOrder({
        id: "ord-place",
        so: 7001,
        status: "place",
        // Place orders may have operation_stage NULL (legacy seed) or 'placed'
        // (post-C2). The kanban must bucket them by status, not stage.
        operation_stage: null,
        customer_name: "Pending Push",
      }),
    ]);
    render(wrap(<OperationOrders />));

    const placedCol = screen.getByTestId("stage-column-placed");
    expect(placedCol).toContainElement(screen.getByText("Pending Push"));
    // Sanity: not in any other column.
    expect(
      screen.getByTestId("stage-column-awaiting_operation_action"),
    ).not.toContainElement(screen.queryByText("Pending Push"));
  });

  it("19. drawer ActionBar shows Confirm proceed when stage is proceed_request", () => {
    setLoaded([
      makeOrder({
        id: "ord-1",
        so: 9001,
        customer_name: "Alice",
        status: "proceed_order",
        operation_stage: "proceed_request",
      }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          status: "proceed_order",
          operation_stage: "proceed_request",
        },
      },
    };
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Alice"));
    expect(
      screen.getByRole("button", { name: /Confirm proceed/ }),
    ).toBeInTheDocument();
    // Abandon is the second action on proceed_request — keep it visible so
    // operation can reject without a stage trip first.
    expect(
      screen.getByRole("button", { name: /Abandon/ }),
    ).toBeInTheDocument();
  });

  it("20. drawer ActionBar on stage='placed' shows informational copy and no buttons", () => {
    setLoaded([
      makeOrder({
        id: "ord-placed",
        so: 9050,
        customer_name: "Awaiting Push",
        status: "place",
        operation_stage: null,
      }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          status: "place",
          operation_stage: null,
        },
      },
    };
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Awaiting Push"));
    expect(
      screen.getByText(/Waiting for them to push it to operation/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Confirm proceed/ }),
    ).not.toBeInTheDocument();
  });

  it("21. clicking a column header toggles its expanded state", () => {
    setLoaded([
      makeOrder({ id: "a", operation_stage: "awaiting_operation_action" }),
      makeOrder({ id: "b", operation_stage: "ready_to_dispatch" }),
    ]);
    render(wrap(<OperationOrders />));

    const awaitingCol = screen.getByTestId("stage-column-awaiting_operation_action");
    expect(awaitingCol).toHaveAttribute("data-expanded", "false");

    // Header is the column-toggle button (first button inside the column wrapper).
    const header = awaitingCol.querySelector("button[aria-expanded]") as HTMLElement;
    expect(header).toBeTruthy();
    fireEvent.click(header);
    expect(awaitingCol).toHaveAttribute("data-expanded", "true");

    // Click again to collapse.
    fireEvent.click(header);
    expect(awaitingCol).toHaveAttribute("data-expanded", "false");
  });

  it("22. clicking a different column header transfers expansion focus instantly", () => {
    setLoaded([
      makeOrder({ id: "a", operation_stage: "awaiting_operation_action" }),
      makeOrder({ id: "b", operation_stage: "ready_to_dispatch" }),
    ]);
    render(wrap(<OperationOrders />));

    const awaitingCol = screen.getByTestId("stage-column-awaiting_operation_action");
    const readyCol = screen.getByTestId("stage-column-ready_to_dispatch");
    const awaitingHeader = awaitingCol.querySelector("button[aria-expanded]") as HTMLElement;
    const readyHeader = readyCol.querySelector("button[aria-expanded]") as HTMLElement;

    fireEvent.click(awaitingHeader);
    expect(awaitingCol).toHaveAttribute("data-expanded", "true");
    expect(readyCol).toHaveAttribute("data-expanded", "false");

    // Click ready directly — focus flips, no need to collapse first.
    fireEvent.click(readyHeader);
    expect(awaitingCol).toHaveAttribute("data-expanded", "false");
    expect(readyCol).toHaveAttribute("data-expanded", "true");
  });

  it("23. drawer awaiting_operation_action action bar exposes Transfer to ready (stock on-hand)", () => {
    setLoaded([
      makeOrder({
        id: "ord-1",
        so: 9001,
        customer_name: "Alice",
        operation_stage: "awaiting_operation_action",
      }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          operation_stage: "awaiting_operation_action",
        },
      },
    };
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Alice"));
    expect(
      screen.getByRole("button", { name: /Transfer to ready \(stock on-hand\)/ }),
    ).toBeInTheDocument();
  });

  it("24. TransferReadyDialog blocks submit when shortages > 0 (RPC will reject)", () => {
    setLoaded([
      makeOrder({
        id: "ord-1",
        so: 9001,
        customer_name: "Alice",
        operation_stage: "awaiting_operation_action",
      }),
    ]);
    detailHookState = {
      ...detailHookState,
      data: {
        ...makeDetail(),
        order: {
          ...makeDetail().order,
          operation_stage: "awaiting_operation_action",
        },
        // Drawer-side shortage list also needs to be empty so calcShortages
        // doesn't surface "Issue POs" only — but the dialog itself reads from
        // useOperationWarehouse.byWarehouse, which we override below.
        stockBalances: [
          { sku: "SOFA-NORD-3S", warehouse_id: "wh-1", qty: 0, reserved: 0 },
        ],
      },
    };
    // Override the warehouse fixture: zero on-hand at wh-1 so the dialog's
    // pre-flight reports a shortage and the submit button is disabled.
    warehouseHookState = {
      data: {
        warehouses: [{ id: "wh-1", name: "KL Warehouse", address: "Subang" }],
        byWarehouse: {
          "wh-1": [
            { sku: "SOFA-NORD-3S", qty: 0, reserved: 0, low_stock_status: "ok" },
          ],
        },
        totalsBySku: {},
      },
      isLoading: false,
      isError: false,
    };
    render(wrap(<OperationOrders />));
    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(
      screen.getByRole("button", { name: /Transfer to ready \(stock on-hand\)/ }),
    );

    // Pre-flight surfaces the shortage warning.
    const preflight = screen.getByTestId("transfer-ready-preflight");
    expect(preflight).toBeInTheDocument();
    expect(preflight.textContent).toMatch(/Some lines short/);
    expect(preflight.textContent).toMatch(/insufficient_stock_for_reserve/);

    // The dialog's primary submit button is disabled.
    const submit = screen.getByRole("button", { name: /Transfer to ready$/ });
    expect(submit).toBeDisabled();
  });

  // -----------------------------------------------------------------------
  // Phase 4.5 Chunk 2 (T9) — LP pill is sourced from
  // `order_supplier_threads[].delivery_partner_id`, not the order-level
  // `delivery_partner_id`. Three cases: no threads, single LP, multi-LP.
  // -----------------------------------------------------------------------

  it("25. (Chunk 2 T9) hides the LP pill when no thread has an assigned partner", () => {
    setLoaded([
      makeOrder({
        id: "ord-no-lp",
        so: 9100,
        customer_name: "Unassigned Anya",
        operation_stage: "ready_to_dispatch",
        // Order-level delivery_partner_id deliberately set; Chunk 2 ignores it
        // and reads from threads. With empty threads, no pill should render.
        delivery_partner_id: "00000000-0000-0000-0000-000000000fff",
        order_supplier_threads: [], order_annotations: [],
      }),
    ]);
    render(wrap(<OperationOrders />));

    const card = screen.getByTestId("order-card-9100");
    expect(card.textContent).toContain("Unassigned Anya");
    expect(
      card.querySelector('[data-testid="order-card-lp-pill"]'),
    ).toBeNull();
  });

  it("26. (Chunk 2 T9 + 2026-05-18 name join) renders LP pill with partner NAME when threads share the same delivery_partner_id + joined name", () => {
    const PARTNER_ID = "00000000-0000-0000-0000-0000000abcde";
    const PARTNER_NAME = "NETS";
    setLoaded([
      makeOrder({
        id: "ord-single-lp",
        so: 9101,
        customer_name: "Single Sam",
        operation_stage: "ready_to_dispatch",
        delivery_partner_id: null,
        order_supplier_threads: [
          {
            id: "thread-1",
            supplier_id: "sup-1",
            category: "mattress",
            operation_stage: "ready_to_dispatch",
            po_id: "PO-1",
            delivery_partner_id: PARTNER_ID,
            delivery_partners: { id: PARTNER_ID, name: PARTNER_NAME },
            confirm_delivery_date: "2026-05-08",
            request_for_delivery_at: "2026-05-04T08:00:00Z",
            partner_accepted_at: "2026-05-04T09:00:00Z",
            partner_rejected_at: null,
          },
          {
            id: "thread-2",
            supplier_id: "sup-2",
            category: "bed_frame",
            operation_stage: "ready_to_dispatch",
            po_id: "PO-2",
            // Same partner across both threads → pill is single.
            delivery_partner_id: PARTNER_ID,
            delivery_partners: { id: PARTNER_ID, name: PARTNER_NAME },
            confirm_delivery_date: "2026-05-08",
            request_for_delivery_at: "2026-05-04T08:00:00Z",
            partner_accepted_at: "2026-05-04T09:00:00Z",
            partner_rejected_at: null,
          },
        ],
      }),
    ]);
    render(wrap(<OperationOrders />));

    const card = screen.getByTestId("order-card-9101");
    const pill = card.querySelector('[data-testid="order-card-lp-pill"]');
    expect(pill).not.toBeNull();
    const partnerPill = card.querySelector(
      '[data-testid="order-card-lp-pill-partner"]',
    );
    expect(partnerPill).not.toBeNull();
    // 2026-05-18 — pill now renders the partner NAME from the joined embed.
    // UUID slug is the fallback when the name embed is null (kept covered in
    // the dedicated fallback test below).
    expect(partnerPill?.textContent).toContain(PARTNER_NAME);
    expect(partnerPill?.textContent).not.toContain(PARTNER_ID.slice(0, 8));
    // The "multi" variant is mutually exclusive with single.
    expect(
      card.querySelector('[data-testid="order-card-lp-pill-multi"]'),
    ).toBeNull();
  });

  it("26b. (2026-05-18) falls back to LP-<uuid-slug> when delivery_partners embed is null", () => {
    const PARTNER_ID = "00000000-0000-0000-0000-0000000abcde";
    setLoaded([
      makeOrder({
        id: "ord-fallback-lp",
        so: 9103,
        customer_name: "Fallback Fred",
        operation_stage: "ready_to_dispatch",
        delivery_partner_id: null,
        order_supplier_threads: [
          {
            id: "thread-fb",
            supplier_id: "sup-1",
            category: "mattress",
            operation_stage: "ready_to_dispatch",
            po_id: "PO-FB",
            delivery_partner_id: PARTNER_ID,
            // Embed missing (legacy data or RLS-hidden delivery_partner row).
            delivery_partners: null,
            confirm_delivery_date: "2026-05-08",
            request_for_delivery_at: "2026-05-04T08:00:00Z",
            partner_accepted_at: "2026-05-04T09:00:00Z",
            partner_rejected_at: null,
          },
        ],
      }),
    ]);
    render(wrap(<OperationOrders />));

    const partnerPill = screen
      .getByTestId("order-card-9103")
      .querySelector('[data-testid="order-card-lp-pill-partner"]');
    expect(partnerPill?.textContent).toContain(`LP-${PARTNER_ID.slice(0, 8)}`);
  });

  it("27. (Chunk 2 T9) renders Multi-LP hint when threads disagree on delivery_partner_id", () => {
    setLoaded([
      makeOrder({
        id: "ord-multi-lp",
        so: 9102,
        customer_name: "Multi Mei",
        operation_stage: "ready_to_dispatch",
        delivery_partner_id: null,
        order_supplier_threads: [
          {
            id: "thread-A",
            supplier_id: "sup-1",
            category: "mattress",
            operation_stage: "ready_to_dispatch",
            po_id: "PO-A",
            delivery_partner_id: "00000000-0000-0000-0000-000000000aaa",
            delivery_partners: {
              id: "00000000-0000-0000-0000-000000000aaa",
              name: "Partner Alpha",
            },
            confirm_delivery_date: "2026-05-08",
            request_for_delivery_at: "2026-05-04T08:00:00Z",
            partner_accepted_at: "2026-05-04T09:00:00Z",
            partner_rejected_at: null,
          },
          {
            id: "thread-B",
            supplier_id: "sup-2",
            category: "sofa",
            operation_stage: "ready_to_dispatch",
            po_id: "PO-B",
            // Different partner → multi-LP summary.
            delivery_partner_id: "00000000-0000-0000-0000-000000000bbb",
            delivery_partners: {
              id: "00000000-0000-0000-0000-000000000bbb",
              name: "Partner Bravo",
            },
            confirm_delivery_date: "2026-05-09",
            request_for_delivery_at: "2026-05-04T08:00:00Z",
            partner_accepted_at: "2026-05-04T10:00:00Z",
            partner_rejected_at: null,
          },
        ],
      }),
    ]);
    render(wrap(<OperationOrders />));

    const card = screen.getByTestId("order-card-9102");
    const multi = card.querySelector(
      '[data-testid="order-card-lp-pill-multi"]',
    );
    expect(multi).not.toBeNull();
    expect(multi?.textContent).toMatch(/Multi-LP/);
    expect(multi?.textContent).toContain("2");
    // Single-partner pill must NOT render in this case.
    expect(
      card.querySelector('[data-testid="order-card-lp-pill-partner"]'),
    ).toBeNull();
  });

  it("28. (Chunk 2 T9) hides the LP pill when threads exist but every delivery_partner_id is null", () => {
    // Realistic post-confirm-proceed, pre-RFD kanban state: threads have been
    // spawned (one per supplier leg) but no LP has been assigned yet, so
    // every `delivery_partner_id` is still `null`. The pill must stay hidden
    // — non-empty threads alone don't justify rendering a partner chip.
    setLoaded([
      makeOrder({
        id: "ord-threads-no-lp",
        so: 9103,
        customer_name: "Pending Priya",
        operation_stage: "awaiting_operation_action",
        delivery_partner_id: null,
        order_supplier_threads: [
          {
            id: "thread-X",
            supplier_id: "sup-1",
            category: "mattress",
            operation_stage: "awaiting_operation_action",
            po_id: "PO-X",
            delivery_partner_id: null,
            delivery_partners: null,
            confirm_delivery_date: null,
            request_for_delivery_at: null,
            partner_accepted_at: null,
            partner_rejected_at: null,
          },
          {
            id: "thread-Y",
            supplier_id: "sup-2",
            category: "bed_frame",
            operation_stage: "awaiting_operation_action",
            po_id: "PO-Y",
            delivery_partner_id: null,
            delivery_partners: null,
            confirm_delivery_date: null,
            request_for_delivery_at: null,
            partner_accepted_at: null,
            partner_rejected_at: null,
          },
        ],
      }),
    ]);
    render(wrap(<OperationOrders />));

    const card = screen.getByTestId("order-card-9103");
    expect(card.textContent).toContain("Pending Priya");
    // None of the three pill testids should be rendered when every
    // thread's `delivery_partner_id` is still null.
    expect(
      card.querySelector('[data-testid="order-card-lp-pill"]'),
    ).toBeNull();
    expect(
      card.querySelector('[data-testid="order-card-lp-pill-partner"]'),
    ).toBeNull();
    expect(
      card.querySelector('[data-testid="order-card-lp-pill-multi"]'),
    ).toBeNull();
  });
});
