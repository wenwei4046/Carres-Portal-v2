import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import OperationDashboard from "./OperationDashboard";
import type {
  operationDashboardResponse,
  operationOrdersListResponse,
  operationOrderListRow,
  operationStockAlertsResponse,
} from "@/lib/queries";

/**
 * Tests cover the M5 plan list:
 *   1. Renders all KPI tiles with mocked data
 *   2. KPI tile click → calls setTab with correct tab name
 *   3. Pipeline column renders top 5 most recent orders
 *   4. CJK customer name receives `font-cjk` class
 *   5. Empty pipeline → empty state hint ("—")
 *   6. Loading state → skeleton
 *   7. Error state → retry button works
 *   8. a11y: KPI tiles have aria-label
 *   9. KPI count formats with RM thousands separator (e.g. "RM 1,234,567")
 *  10. Side card "View all" link navigates correctly
 */

// Hook return state — flipped per test via `setHookState({...})`.
let hookState: {
  data: operationDashboardResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let ordersHookState: { data: operationOrdersListResponse | undefined };
let stockAlertsHookState: {
  data: operationStockAlertsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
};
const refetchSpy = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationDashboard: () => hookState,
    useOperationOrders: () => ordersHookState,
    // T21 — `StockAlertsTile` (rendered alongside the other side cards) calls
    // `useStockAlerts` directly. Mock returns a benign empty-list state by
    // default so the dashboard tests stay focused on KPI / pipeline / side
    // card rendering rather than alert behavior (covered in
    // `StockAlertsTile.test.tsx`).
    useStockAlerts: () => stockAlertsHookState,
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Kept hermetic with MemoryRouter so any descendant that touches router
  // hooks resolves (the dashboard tree mounts several child cards). The
  // StockAlertsTile itself no longer navigates (see
  // `phase-4.5-chunk-2-alerts-tab-routing`).
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

const baseSummary: operationDashboardResponse = {
  kpis: {
    today_deliveries: 3,
    open_pos: 7,
    overdue_orders: 1,
    active_orders: 12,
    active_gmv: 1234567,
  },
  pipeline: {
    placed: 5,
    proceed_request: 3,
    awaiting_operation_action: 4,
    ready_to_dispatch: 2,
    dispatched: 1,
  },
  open_pos: [
    {
      id: "po-aaaaaa01",
      supplier_id: "sup-1",
      warehouse_id: "wh-1",
      status: "open",
      sup_status: "in_production",
      eta_date: "2026-05-10",
      placed_at: "2026-05-01T00:00:00Z",
      so: 9001,
      so_refs: null,
    },
  ],
  low_stock: [
    {
      sku: "SOFA-NORD-3S",
      warehouse_id: "wh-1",
      qty: 0,
      reserved: 0,
      available: 0,
    },
    {
      sku: "BED-OAK-Q",
      warehouse_id: "wh-1",
      qty: 1,
      reserved: 0,
      available: 1,
    },
  ],
  audit_recent: [],
  alerts: { out_of_stock_skus: 1 },
};

function makeOrder(
  overrides: Partial<operationOrderListRow> = {},
): operationOrderListRow {
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
    // Phase 4.5 Chunk 2 (T9) — embedded threads default to empty array. The
    // dashboard kanban surface shows the LP pill only when threads carry an
    // assigned `delivery_partner_id`; default fixtures stay unassigned.
    order_supplier_threads: [], order_annotations: [],
    ...overrides,
  };
}

function setLoaded(
  summary: operationDashboardResponse = baseSummary,
  orders: operationOrderListRow[] = [],
) {
  hookState = {
    data: summary,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchSpy,
  };
  ordersHookState = { data: { orders } };
  // T21 — default: empty-alerts state (tile shows the "All SKUs above
  // threshold" empty body). Each test that needs a different StockAlertsTile
  // payload can overwrite `stockAlertsHookState` directly.
  stockAlertsHookState = {
    data: { alerts: [] },
    isLoading: false,
    isError: false,
  };
}

describe("OperationDashboard", () => {
  it("renders all 3 KPI tiles with mocked data", () => {
    setLoaded();
    render(wrap(<OperationDashboard setTab={() => {}} />));

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Open POs")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();

    // Each KPI value renders inside a `data-kpi-value` element.
    const values = document.querySelectorAll("[data-kpi-value]");
    expect(values).toHaveLength(3);
    expect(values[0].textContent).toBe("3");
    expect(values[1].textContent).toBe("7");
    expect(values[2].textContent).toBe("1");
  });

  it("KPI tile click → calls setTab with the right tab name", () => {
    setLoaded();
    const setTab = vi.fn();
    render(wrap(<OperationDashboard setTab={setTab} />));

    fireEvent.click(screen.getByLabelText(/Today: 3/));
    expect(setTab).toHaveBeenLastCalledWith("orders");

    fireEvent.click(screen.getByLabelText(/Open POs: 7/));
    expect(setTab).toHaveBeenLastCalledWith("procurement");

    fireEvent.click(screen.getByLabelText(/Overdue: 1/));
    expect(setTab).toHaveBeenLastCalledWith("orders");
  });

  it("pipeline column renders top 5 most recent orders, slicing the rest", () => {
    // Make 7 awaiting_operation_action orders — only 5 should render.
    const orders = Array.from({ length: 7 }, (_, i) =>
      makeOrder({
        id: `ord-${i}`,
        so: 9100 + i,
        customer_name: `Customer ${i}`,
        operation_stage: "awaiting_operation_action",
      }),
    );
    setLoaded(baseSummary, orders);
    render(wrap(<OperationDashboard setTab={() => {}} />));

    // The 5 cards we expect:
    for (let i = 0; i < 5; i += 1) {
      expect(screen.getByText(`Customer ${i}`)).toBeInTheDocument();
    }
    // The 6th and 7th must NOT be rendered.
    expect(screen.queryByText("Customer 5")).not.toBeInTheDocument();
    expect(screen.queryByText("Customer 6")).not.toBeInTheDocument();
  });

  it("CJK customer name receives the font-cjk class", () => {
    const orders = [
      makeOrder({
        id: "ord-cjk",
        customer_name: "王小明",
        operation_stage: "awaiting_operation_action",
      }),
    ];
    setLoaded(baseSummary, orders);
    render(wrap(<OperationDashboard setTab={() => {}} />));

    const node = screen.getByText("王小明");
    expect(node.className).toContain("font-cjk");
  });

  it("empty pipeline shows the em-dash hint", () => {
    setLoaded(
      {
        ...baseSummary,
        pipeline: {
          placed: 0,
          proceed_request: 0,
          awaiting_operation_action: 0,
          ready_to_dispatch: 0,
          dispatched: 0,
        },
      },
      [],
    );
    render(wrap(<OperationDashboard setTab={() => {}} />));

    // Pipeline v2 (C3): five columns × five em-dashes.
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });

  it("loading state renders the skeleton placeholder", () => {
    hookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchSpy,
    };
    ordersHookState = { data: undefined };
    // T21 — `OperationDashboard` returns early on loading so StockAlertsTile
    // is never rendered, but we still keep the alert hook stub defined so the
    // mock factory always has a value to hand back.
    stockAlertsHookState = {
      data: { alerts: [] },
      isLoading: false,
      isError: false,
    };
    render(wrap(<OperationDashboard setTab={() => {}} />));
    expect(
      screen.getByTestId("operation-dashboard-skeleton"),
    ).toBeInTheDocument();
  });

  it("error state shows retry button that calls refetch", () => {
    refetchSpy.mockClear();
    hookState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: refetchSpy,
    };
    ordersHookState = { data: undefined };
    stockAlertsHookState = {
      data: { alerts: [] },
      isLoading: false,
      isError: false,
    };
    render(wrap(<OperationDashboard setTab={() => {}} />));

    expect(screen.getByText(/Couldn’t load dashboard/)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("KPI tiles have aria-label for screen readers", () => {
    setLoaded();
    render(wrap(<OperationDashboard setTab={() => {}} />));

    expect(
      screen.getByLabelText(/Today: 3, deliveries scheduled/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Open POs: 7, with suppliers/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Overdue: 1, past delivery date/),
    ).toBeInTheDocument();
  });

  it("active GMV is formatted with RM thousands separator", () => {
    setLoaded({
      ...baseSummary,
      kpis: { ...baseSummary.kpis, active_gmv: 1234567 },
    });
    render(wrap(<OperationDashboard setTab={() => {}} />));

    // Locale separator may vary in CI (US: "1,234,567" vs others). We assert
    // by structural shape: the strong tag adjacent to "value" carries the
    // formatted RM string and contains at least one separator char from the
    // expected set: comma, period, space, narrow nbsp.
    const node = screen.getByText(/RM\s/);
    expect(node.textContent).toMatch(/RM\s+[\d.,   ]+/);
    // The thousands separator MUST appear at least twice for 1,234,567.
    const separatorCount = (node.textContent ?? "").replace(/[^,.   ]/g, "").length;
    expect(separatorCount).toBeGreaterThanOrEqual(2);
  });

  it("Pipeline v2 (C3): renders 5 pipeline columns in kanban order", () => {
    setLoaded();
    render(wrap(<OperationDashboard setTab={() => {}} />));

    // All 5 column labels render. Use exact-match to avoid colliding with the
    // hero strap line ("ready to ship") or KPI hints.
    expect(screen.getByText("Placed")).toBeInTheDocument();
    expect(screen.getByText("Proceed Request")).toBeInTheDocument();
    expect(screen.getByText("Awaiting operation action")).toBeInTheDocument();
    expect(screen.getByText("Ready to dispatch")).toBeInTheDocument();
    expect(screen.getByText("Dispatched")).toBeInTheDocument();
  });

  it("Pipeline v2 (C3): placed column filters by status='place' (not operation_stage)", () => {
    // status='place' orders may have operation_stage NULL. They MUST still
    // render in the Placed column, mirroring the kanban's `stageOf` rule.
    const orders = [
      makeOrder({
        id: "ord-place-1",
        customer_name: "Placed Pal",
        status: "place",
        operation_stage: null,
      }),
      makeOrder({
        id: "ord-pr-1",
        customer_name: "Proceed Person",
        status: "proceed_order",
        operation_stage: "proceed_request",
      }),
    ];
    setLoaded(baseSummary, orders);
    render(wrap(<OperationDashboard setTab={() => {}} />));

    expect(screen.getByText("Placed Pal")).toBeInTheDocument();
    expect(screen.getByText("Proceed Person")).toBeInTheDocument();
  });

  it("side card View all links navigate to the right tab", () => {
    setLoaded();
    const setTab = vi.fn();
    render(wrap(<OperationDashboard setTab={setTab} />));

    fireEvent.click(screen.getByRole("button", { name: /Manage POs/ }));
    expect(setTab).toHaveBeenLastCalledWith("procurement");

    fireEvent.click(screen.getByRole("button", { name: /Open warehouse/ }));
    expect(setTab).toHaveBeenLastCalledWith("warehouse");
  });

  it("StockAlertsTile 'View alerts' calls goWarehouse({ alert: true })", () => {
    // The alert deep-link routes through goWarehouse (which seeds the warehouse
    // Alerts view), NOT a bare setTab — closes
    // `phase-4.5-chunk-2-alerts-tab-routing`.
    setLoaded();
    const setTab = vi.fn();
    const goWarehouse = vi.fn();
    render(
      wrap(<OperationDashboard setTab={setTab} goWarehouse={goWarehouse} />),
    );
    fireEvent.click(screen.getByTestId("stock-alerts-open"));
    expect(goWarehouse).toHaveBeenCalledWith({ alert: true });
    expect(setTab).not.toHaveBeenCalledWith("warehouse");
  });

  it("StockAlertsTile falls back to setTab('warehouse') when goWarehouse is absent", () => {
    setLoaded();
    const setTab = vi.fn();
    render(wrap(<OperationDashboard setTab={setTab} />));
    fireEvent.click(screen.getByTestId("stock-alerts-open"));
    expect(setTab).toHaveBeenLastCalledWith("warehouse");
  });
});
