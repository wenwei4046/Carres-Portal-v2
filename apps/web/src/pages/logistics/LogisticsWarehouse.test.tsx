import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LogisticsWarehouse from "./LogisticsWarehouse";
import type { CatalogResponse } from "@carres/shared";
import type {
  LogisticsReservedDrilldownResponse,
  WarehouseListResponse,
} from "@/lib/queries";

/**
 * LogisticsWarehouse + AdjustStockModal — covers the M5 task 4 plan list
 * (~10 tests).
 *
 * Same vi.mock(@/lib/queries) pattern as LogisticsProcurement.test.tsx — each
 * test sets the mocked hook return states before rendering. The
 * `useAdjustStockMutation` mock resolves to an empty payload so the modal
 * always succeeds; per-test variations (validation, mutation arg shape) are
 * exercised end-to-end through the page.
 */

let warehouseHookState: {
  data: WarehouseListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let catalogHookState: { data: CatalogResponse | undefined };
let drilldownHookState: {
  data: LogisticsReservedDrilldownResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
const refetchSpy = vi.fn();
const drilldownRefetchSpy = vi.fn();
const adjustMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useLogisticsWarehouse: () => warehouseHookState,
    useCatalog: () => catalogHookState,
    useReservedDrilldown: () => drilldownHookState,
    useAdjustStockMutation: () => ({
      mutateAsync: adjustMutateAsync,
      isPending: false,
    }),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const WAREHOUSE_KL = {
  id: "22222222-2222-2222-2222-000000000001",
  name: "KL Warehouse",
  address: "Subang Jaya",
};
const WAREHOUSE_PG = {
  id: "22222222-2222-2222-2222-000000000002",
  name: "Penang Warehouse",
  address: "George Town",
};

const SKU_MATTRESS_KING = "mattress:carres-cloud:King";
const SKU_MATTRESS_QUEEN = "mattress:carres-cloud:Queen";
const SKU_BEDFRAME = "bedframe:oslo:Queen";
const SKU_SOFA = "sofa:nordic:3s";

function setLoaded(overrides: Partial<WarehouseListResponse> = {}) {
  warehouseHookState = {
    data: {
      warehouses: [WAREHOUSE_KL, WAREHOUSE_PG],
      byWarehouse: {
        [WAREHOUSE_KL.id]: [
          {
            sku: SKU_MATTRESS_KING,
            qty: 8,
            reserved: 2,
            low_stock_status: "ok",
            // T42-pass3-C1 — fixtures default both thresholds to null;
            // tests that exercise the SetThresholdDialog button override.
            low_threshold: null,
            high_threshold: null,
          },
          {
            sku: SKU_MATTRESS_QUEEN,
            qty: 1,
            reserved: 0,
            low_stock_status: "low",
            low_threshold: null,
            high_threshold: null,
          },
          {
            sku: SKU_BEDFRAME,
            qty: 0,
            reserved: 0,
            low_stock_status: "out",
            low_threshold: null,
            high_threshold: null,
          },
          {
            sku: SKU_SOFA,
            qty: 4,
            reserved: 1,
            low_stock_status: "ok",
            low_threshold: null,
            high_threshold: null,
          },
        ],
        [WAREHOUSE_PG.id]: [
          {
            sku: SKU_MATTRESS_KING,
            qty: 3,
            reserved: 0,
            low_stock_status: "ok",
            low_threshold: null,
            high_threshold: null,
          },
        ],
      },
      totalsBySku: {
        [SKU_MATTRESS_KING]: {
          total_qty: 11,
          total_reserved: 2,
          low_stock_status_aggregate: "ok",
        },
        [SKU_MATTRESS_QUEEN]: {
          total_qty: 1,
          total_reserved: 0,
          low_stock_status_aggregate: "low",
        },
        [SKU_BEDFRAME]: {
          total_qty: 0,
          total_reserved: 0,
          low_stock_status_aggregate: "out",
        },
        [SKU_SOFA]: {
          total_qty: 4,
          total_reserved: 1,
          low_stock_status_aggregate: "ok",
        },
      },
      ...overrides,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchSpy,
  };
  catalogHookState = {
    data: {
      models: [],
      skus: [
        {
          id: "11111111-1111-1111-1111-000000000aa1",
          modelId: "11111111-1111-1111-1111-000000000bb1",
          sku: SKU_MATTRESS_KING,
          variant: "Carres Cloud · King",
          variantKind: "size",
          price: 3500,
          cost: null,
          supplierId: null,
        },
        {
          id: "11111111-1111-1111-1111-000000000aa2",
          modelId: "11111111-1111-1111-1111-000000000bb1",
          sku: SKU_MATTRESS_QUEEN,
          variant: "Carres Cloud · Queen",
          variantKind: "size",
          price: 3000,
          cost: null,
          supplierId: null,
        },
        {
          id: "11111111-1111-1111-1111-000000000aa3",
          modelId: "11111111-1111-1111-1111-000000000bb2",
          sku: SKU_BEDFRAME,
          variant: "Oslo · Queen",
          variantKind: "size",
          price: 1800,
          cost: null,
          supplierId: null,
        },
        {
          id: "11111111-1111-1111-1111-000000000aa4",
          modelId: "11111111-1111-1111-1111-000000000bb3",
          sku: SKU_SOFA,
          variant: "Nordic · 3 seater",
          variantKind: "preset",
          price: 4500,
          cost: null,
          supplierId: null,
        },
      ],
      sofaFabrics: [],
      addons: [],
      floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
    },
  };
}

beforeEach(() => {
  refetchSpy.mockClear();
  drilldownRefetchSpy.mockClear();
  adjustMutateAsync.mockClear();
  // Default drill-down state — empty result, idle. Tests that need a populated
  // drill-down override this directly via `drilldownHookState = ...`.
  drilldownHookState = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: drilldownRefetchSpy,
  };
});

describe("LogisticsWarehouse page", () => {
  it("1. renders warehouse selector tiles with units + SKU counts", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    expect(screen.getByTestId("warehouse-tiles")).toBeInTheDocument();
    expect(
      screen.getByTestId(`warehouse-tile-${WAREHOUSE_KL.id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`warehouse-tile-${WAREHOUSE_PG.id}`),
    ).toBeInTheDocument();
    // KL tile: 8 + 1 + 0 + 4 = 13 units, 3 SKUs > 0
    const klTile = screen.getByTestId(`warehouse-tile-${WAREHOUSE_KL.id}`);
    expect(klTile.textContent).toContain("13");
    expect(klTile.textContent).toContain("3");
    expect(klTile.textContent?.toLowerCase()).toContain("subang jaya");
  });

  it("2. defaults to first warehouse active and shows mattress rows", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    const klTile = screen.getByTestId(`warehouse-tile-${WAREHOUSE_KL.id}`);
    expect(klTile.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByTestId(`warehouse-row-${SKU_MATTRESS_KING}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`warehouse-row-${SKU_MATTRESS_QUEEN}`),
    ).toBeInTheDocument();
    // Bedframe + sofa are filtered out by the default 'mattress' tab.
    expect(
      screen.queryByTestId(`warehouse-row-${SKU_BEDFRAME}`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`warehouse-row-${SKU_SOFA}`),
    ).not.toBeInTheDocument();
  });

  it("3. clicking a warehouse tile switches the active warehouse", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId(`warehouse-tile-${WAREHOUSE_PG.id}`));
    expect(
      screen.getByTestId(`warehouse-tile-${WAREHOUSE_PG.id}`).getAttribute("aria-selected"),
    ).toBe("true");
    // Penang only has the mattress King row in the seed data.
    expect(
      screen.getByTestId(`warehouse-row-${SKU_MATTRESS_KING}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`warehouse-row-${SKU_MATTRESS_QUEEN}`),
    ).not.toBeInTheDocument();
    // "This warehouse" cell shows 3 (Penang qty) not 8 (KL qty).
    const row = screen.getByTestId(`warehouse-row-${SKU_MATTRESS_KING}`);
    expect(row.textContent).toContain("3");
  });

  it("4. category tabs filter rows by SKU prefix", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    // Switch to bedframe
    fireEvent.click(screen.getByTestId("warehouse-cat-bedframe"));
    expect(
      screen.getByTestId(`warehouse-row-${SKU_BEDFRAME}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`warehouse-row-${SKU_MATTRESS_KING}`),
    ).not.toBeInTheDocument();
    // Switch to sofa
    fireEvent.click(screen.getByTestId("warehouse-cat-sofa"));
    expect(
      screen.getByTestId(`warehouse-row-${SKU_SOFA}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`warehouse-row-${SKU_BEDFRAME}`),
    ).not.toBeInTheDocument();
  });

  it("5. status badges render with correct color tokens per state", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    // Mattress tab: King = ok, Queen = low. Switch to bedframe to see Out.
    const okBadge = screen.getByTestId(`warehouse-badge-${SKU_MATTRESS_KING}`);
    expect(okBadge.textContent).toBe("OK");
    expect(okBadge.getAttribute("style")).toContain("var(--success)");
    const lowBadge = screen.getByTestId(`warehouse-badge-${SKU_MATTRESS_QUEEN}`);
    expect(lowBadge.textContent).toBe("Low");
    expect(lowBadge.getAttribute("style")).toContain("var(--warning)");
    fireEvent.click(screen.getByTestId("warehouse-cat-bedframe"));
    const outBadge = screen.getByTestId(`warehouse-badge-${SKU_BEDFRAME}`);
    expect(outBadge.textContent).toBe("Out");
    expect(outBadge.getAttribute("style")).toContain("var(--danger)");
  });

  it("6. empty category shows the empty-state hint", () => {
    setLoaded({
      byWarehouse: {
        [WAREHOUSE_KL.id]: [
          // Only sofa stock at KL; mattress + bedframe tabs should be empty.
          {
            sku: SKU_SOFA,
            qty: 4,
            reserved: 1,
            low_stock_status: "ok",
            low_threshold: null,
            high_threshold: null,
          },
        ],
        [WAREHOUSE_PG.id]: [],
      },
      totalsBySku: {
        [SKU_SOFA]: {
          total_qty: 4,
          total_reserved: 1,
          low_stock_status_aggregate: "ok",
        },
      },
    });
    render(wrap(<LogisticsWarehouse />));
    // Default mattress tab should be empty for KL.
    const empty = screen.getByTestId("warehouse-empty");
    expect(empty.textContent).toMatch(/no mattress stock at KL Warehouse/i);
  });

  it("7. loading state renders the warehouse-skeleton", () => {
    warehouseHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchSpy,
    };
    catalogHookState = {
      data: {
        models: [],
        skus: [],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    };
    render(wrap(<LogisticsWarehouse />));
    expect(screen.getByTestId("warehouse-skeleton")).toBeInTheDocument();
  });

  it("8. error state renders Retry button which calls refetch", () => {
    warehouseHookState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("kaboom"),
      refetch: refetchSpy,
    };
    catalogHookState = {
      data: {
        models: [],
        skus: [],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    };
    render(wrap(<LogisticsWarehouse />));
    expect(screen.getByText(/Couldn.+t load warehouse/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("9. clicking '+ Adjust' opens AdjustStockModal pre-filled with sku + warehouse + qty", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    expect(screen.queryByText(/Adjust stock/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`warehouse-adjust-${SKU_MATTRESS_KING}`));
    expect(
      screen.getByText(`Adjust stock · ${SKU_MATTRESS_KING}`),
    ).toBeInTheDocument();
    const ctx = screen.getByTestId("adjust-stock-context");
    // "Carres Cloud · King" friendly label + "KL Warehouse" + qty 8 / reserved 2
    expect(ctx.textContent).toContain("Carres Cloud");
    expect(ctx.textContent).toContain("KL Warehouse");
    expect(ctx.textContent).toContain("8");
    expect(ctx.textContent).toContain("2");
  });

  it("10. AdjustStockModal disables 'Apply' when delta is 0 or empty, and when reason is blank", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId(`warehouse-adjust-${SKU_MATTRESS_KING}`));
    const apply = screen.getByRole("button", { name: /Apply adjustment/ });
    expect(apply).toBeDisabled(); // empty delta + empty reason

    const deltaInput = screen.getByTestId(
      "adjust-delta-input",
    ) as HTMLInputElement;
    const reasonInput = screen.getByTestId(
      "adjust-reason-input",
    ) as HTMLTextAreaElement;

    // delta=0 + reason set → still disabled (no-op)
    fireEvent.change(deltaInput, { target: { value: "0" } });
    fireEvent.change(reasonInput, { target: { value: "found goods" } });
    expect(apply).toBeDisabled();

    // delta non-zero + reason blank → still disabled
    fireEvent.change(deltaInput, { target: { value: "-2" } });
    fireEvent.change(reasonInput, { target: { value: "" } });
    expect(apply).toBeDisabled();

    // both valid → enabled
    fireEvent.change(reasonInput, { target: { value: "damaged in transit" } });
    expect(apply).not.toBeDisabled();
  });

  it("11. AdjustStockModal submit calls useAdjustStockMutation with sku/warehouseId/delta/reason", async () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId(`warehouse-adjust-${SKU_MATTRESS_KING}`));
    const deltaInput = screen.getByTestId(
      "adjust-delta-input",
    ) as HTMLInputElement;
    const reasonInput = screen.getByTestId(
      "adjust-reason-input",
    ) as HTMLTextAreaElement;
    fireEvent.change(deltaInput, { target: { value: "-3" } });
    fireEvent.change(reasonInput, {
      target: { value: "forklift dented 3 boxes on receiving" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply adjustment/ }));
    await waitFor(() => {
      expect(adjustMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(adjustMutateAsync.mock.calls[0][0]).toEqual({
      sku: SKU_MATTRESS_KING,
      warehouseId: WAREHOUSE_KL.id,
      delta: -3,
      reason: "forklift dented 3 boxes on receiving",
    });
  });

  it("12. AdjustStockModal pre-empts a delta that would dip below reserved", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    // King: qty 8, reserved 2 → delta -7 would land at qty 1, below reserved 2.
    fireEvent.click(screen.getByTestId(`warehouse-adjust-${SKU_MATTRESS_KING}`));
    const deltaInput = screen.getByTestId(
      "adjust-delta-input",
    ) as HTMLInputElement;
    const reasonInput = screen.getByTestId(
      "adjust-reason-input",
    ) as HTMLTextAreaElement;
    fireEvent.change(deltaInput, { target: { value: "-7" } });
    fireEvent.change(reasonInput, { target: { value: "loss" } });
    expect(
      screen.getByTestId("adjust-warning-reserved"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Apply adjustment/ }),
    ).toBeDisabled();
  });

  it("13. focus-trap: pressing Esc closes the AdjustStockModal", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId(`warehouse-adjust-${SKU_MATTRESS_KING}`));
    expect(
      screen.getByText(`Adjust stock · ${SKU_MATTRESS_KING}`),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByText(`Adjust stock · ${SKU_MATTRESS_KING}`),
    ).not.toBeInTheDocument();
  });

  it("14. 'Movement log' button calls setTab('movements')", () => {
    setLoaded();
    const setTab = vi.fn();
    render(wrap(<LogisticsWarehouse setTab={setTab} />));
    fireEvent.click(screen.getByTestId("warehouse-movement-log-button"));
    expect(setTab).toHaveBeenCalledWith("movements");
  });

  it("15. search filter narrows table by SKU code or friendly variant", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    const searchInput = screen.getByLabelText(/Search SKU/);
    fireEvent.change(searchInput, { target: { value: "queen" } });
    // Mattress tab + "queen" search → only Carres Cloud · Queen.
    expect(
      screen.queryByTestId(`warehouse-row-${SKU_MATTRESS_KING}`),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`warehouse-row-${SKU_MATTRESS_QUEEN}`),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Pipeline v2 (C4) — Reserved tab + drill-down dialog
  // -------------------------------------------------------------------------

  it("16. Reserved tab swaps the table layout and lists every SKU with reserved>0", () => {
    setLoaded();
    render(wrap(<LogisticsWarehouse />));
    expect(screen.getByTestId("warehouse-cat-reserved")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("warehouse-cat-reserved"));
    // Stock-table is gone; reserved-table is visible.
    expect(screen.queryByTestId("warehouse-stock-table")).not.toBeInTheDocument();
    expect(screen.getByTestId("warehouse-reserved-table")).toBeInTheDocument();
    // KL has King (reserved 2) + Queen (reserved 0) + Bedframe (reserved 0)
    // + Sofa (reserved 1). Reserved view should only show King + Sofa.
    expect(
      screen.getByTestId(`warehouse-reserved-row-${SKU_MATTRESS_KING}`),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId(`warehouse-reserved-row-${SKU_SOFA}`),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId(`warehouse-reserved-row-${SKU_MATTRESS_QUEEN}`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId(`warehouse-reserved-row-${SKU_BEDFRAME}`),
    ).not.toBeInTheDocument();
  });

  it("17. Reserved tab shows empty state when no SKUs at this warehouse have reserved>0", () => {
    setLoaded({
      byWarehouse: {
        [WAREHOUSE_KL.id]: [
          // All zero reserves at KL.
          { sku: SKU_MATTRESS_KING, qty: 8, reserved: 0, low_stock_status: "ok", low_threshold: null, high_threshold: null },
          { sku: SKU_SOFA, qty: 4, reserved: 0, low_stock_status: "ok", low_threshold: null, high_threshold: null },
        ],
        [WAREHOUSE_PG.id]: [],
      },
      totalsBySku: {
        [SKU_MATTRESS_KING]: { total_qty: 8, total_reserved: 0, low_stock_status_aggregate: "ok" },
        [SKU_SOFA]: { total_qty: 4, total_reserved: 0, low_stock_status_aggregate: "ok" },
      },
    });
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId("warehouse-cat-reserved"));
    expect(screen.getByTestId("warehouse-reserved-empty")).toBeInTheDocument();
    expect(
      screen.getByTestId("warehouse-reserved-empty").textContent,
    ).toMatch(/no SKUs are currently reserved at KL Warehouse/i);
  });

  it("18. clicking the drill-down trigger opens ReserveDrilldownDialog with summary + orders", () => {
    setLoaded();
    drilldownHookState = {
      data: {
        warehouseId: WAREHOUSE_KL.id,
        sku: SKU_MATTRESS_KING,
        total: 2,
        orders: [
          {
            id: "33333333-3333-3333-3333-000000000a01",
            dl: 4001,
            customerName: "Ahmad Customer",
            logisticsStage: "ready_to_dispatch",
            reservedQty: 2,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: drilldownRefetchSpy,
    };
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId("warehouse-cat-reserved"));
    // Drill-down trigger present per row.
    fireEvent.click(
      screen.getByTestId(`warehouse-reserved-drilldown-${SKU_MATTRESS_KING}`),
    );
    // Dialog is open — title contains friendly SKU label.
    expect(screen.getByText(/Reserved orders/)).toBeInTheDocument();
    const summary = screen.getByTestId("reserve-drilldown-summary");
    expect(summary.textContent).toMatch(/2 reserved across 1 order/i);
    expect(summary.textContent).toContain("KL Warehouse");
    // Order row visible with #SO + customer + stage chip + qty.
    const row = screen.getByTestId(
      "reserve-drilldown-row-33333333-3333-3333-3333-000000000a01",
    );
    expect(row.textContent).toContain("#SO4001");
    expect(row.textContent).toContain("Ahmad Customer");
    expect(row.textContent?.toLowerCase()).toContain("ready to dispatch");
    expect(row.textContent).toContain("×2");
  });

  it("19. ReserveDrilldownDialog shows empty state when no orders hold reserve", () => {
    setLoaded();
    drilldownHookState = {
      data: {
        warehouseId: WAREHOUSE_KL.id,
        sku: SKU_MATTRESS_KING,
        total: 0,
        orders: [],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: drilldownRefetchSpy,
    };
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId("warehouse-cat-reserved"));
    fireEvent.click(
      screen.getByTestId(`warehouse-reserved-drilldown-${SKU_MATTRESS_KING}`),
    );
    expect(
      screen.getByTestId("reserve-drilldown-empty"),
    ).toBeInTheDocument();
  });

  it("20. ReserveDrilldownDialog renders loading skeleton when query pending", () => {
    setLoaded();
    drilldownHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: drilldownRefetchSpy,
    };
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId("warehouse-cat-reserved"));
    fireEvent.click(
      screen.getByTestId(`warehouse-reserved-drilldown-${SKU_MATTRESS_KING}`),
    );
    expect(screen.getByTestId("reserve-drilldown-loading")).toBeInTheDocument();
  });

  it("21. ReserveDrilldownDialog renders error banner with Retry on isError", () => {
    setLoaded();
    drilldownHookState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: drilldownRefetchSpy,
    };
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId("warehouse-cat-reserved"));
    fireEvent.click(
      screen.getByTestId(`warehouse-reserved-drilldown-${SKU_MATTRESS_KING}`),
    );
    expect(screen.getByTestId("reserve-drilldown-error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(drilldownRefetchSpy).toHaveBeenCalledTimes(1);
  });

  it("22. clicking Copy SO on a drill-down row writes #SO{n} to the clipboard", async () => {
    setLoaded();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    drilldownHookState = {
      data: {
        warehouseId: WAREHOUSE_KL.id,
        sku: SKU_MATTRESS_KING,
        total: 1,
        orders: [
          {
            id: "33333333-3333-3333-3333-000000000a02",
            dl: 4007,
            customerName: "Bee",
            logisticsStage: "dispatched",
            reservedQty: 1,
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: drilldownRefetchSpy,
    };
    render(wrap(<LogisticsWarehouse />));
    fireEvent.click(screen.getByTestId("warehouse-cat-reserved"));
    fireEvent.click(
      screen.getByTestId(`warehouse-reserved-drilldown-${SKU_MATTRESS_KING}`),
    );
    fireEvent.click(
      screen.getByTestId(
        "reserve-drilldown-copy-33333333-3333-3333-3333-000000000a02",
      ),
    );
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("#SO4007");
    });
  });

  it("23. ⚙ Threshold button per row opens SetThresholdDialog prefilled (T42-pass3-C1)", () => {
    // Codex pass-3 comment 1 wiring: SetThresholdDialog must be reachable from
    // the warehouse page so logistics users can configure low/high WITHOUT
    // touching SQL. The button passes the row's current thresholds so opening
    // an already-configured row pre-populates the inputs (a blank-open save
    // would clear existing values per parseField's empty→null contract).
    //
    // Both fixtures live in the default `mattress` category so the test sees
    // both rows without a tab click — King has thresholds set, Queen has none.
    setLoaded({
      byWarehouse: {
        [WAREHOUSE_KL.id]: [
          {
            sku: SKU_MATTRESS_KING,
            qty: 8,
            reserved: 0,
            low_stock_status: "ok",
            low_threshold: 5,
            high_threshold: 12,
          },
          {
            sku: SKU_MATTRESS_QUEEN,
            qty: 4,
            reserved: 0,
            low_stock_status: "ok",
            low_threshold: null,
            high_threshold: null,
          },
        ],
        [WAREHOUSE_PG.id]: [],
      },
      totalsBySku: {
        [SKU_MATTRESS_KING]: { total_qty: 8, total_reserved: 0, low_stock_status_aggregate: "ok" },
        [SKU_MATTRESS_QUEEN]: { total_qty: 4, total_reserved: 0, low_stock_status_aggregate: "ok" },
      },
    });
    render(wrap(<LogisticsWarehouse />));
    // Per-row Threshold button is present.
    const threshBtn = screen.getByTestId(`warehouse-threshold-${SKU_MATTRESS_KING}`);
    expect(threshBtn).toBeInTheDocument();
    // Title shows current values so the user can sanity-check before opening.
    expect(threshBtn.getAttribute("title")).toBe("Low 5 / High 12");
    // Queen row has no threshold yet — title hints at empty state.
    expect(
      screen.getByTestId(`warehouse-threshold-${SKU_MATTRESS_QUEEN}`).getAttribute("title"),
    ).toBe("No threshold set — click to configure");
    // Click opens the dialog (Modal renders inline — header text is the
    // SetThresholdDialog title prefix).
    fireEvent.click(threshBtn);
    expect(
      screen.getByText(/Set thresholds/),
    ).toBeInTheDocument();
    // Inputs are pre-populated with the row's current thresholds, so saving
    // unchanged values doesn't accidentally clear them.
    expect(
      (screen.getByTestId("set-threshold-low-input") as HTMLInputElement).value,
    ).toBe("5");
    expect(
      (screen.getByTestId("set-threshold-high-input") as HTMLInputElement).value,
    ).toBe("12");
  });
});
