import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OperationMovements from "./OperationMovements";
import { listMovementsQuery, type CatalogResponse } from "@carres/shared";
import type {
  MovementsFilters,
  MovementsListResponse,
  WarehouseListResponse,
} from "@/lib/queries";

/**
 * OperationMovements — covers the M5 Task 5 plan list (~15 tests).
 *
 * Same vi.mock(@/lib/queries) pattern as OperationWarehouse.test.tsx — each
 * test sets the mocked hook return states before rendering. The
 * `useOperationMovements` mock captures the filter argument so we can assert
 * server-side filter requests fire on chip / dropdown changes.
 */

let movementsHookState: {
  data: MovementsListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let warehouseHookState: { data: WarehouseListResponse | undefined };
let catalogHookState: { data: CatalogResponse | undefined };
const refetchSpy = vi.fn();
const movementsHookSpy = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useOperationMovements: (filters: MovementsFilters) => {
      movementsHookSpy(filters);
      return movementsHookState;
    },
    useOperationWarehouse: () => warehouseHookState,
    useCatalog: () => catalogHookState,
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
const SKU_BEDFRAME = "bedframe:oslo:Queen";

function setLoaded(rows: MovementsListResponse["rows"] = []) {
  movementsHookState = {
    data: { rows, limit: 200 },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchSpy,
  };
  warehouseHookState = {
    data: {
      warehouses: [WAREHOUSE_KL, WAREHOUSE_PG],
      byWarehouse: {},
      totalsBySku: {},
    },
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
          id: "11111111-1111-1111-1111-000000000aa3",
          modelId: "11111111-1111-1111-1111-000000000bb2",
          sku: SKU_BEDFRAME,
          variant: "Oslo · Queen",
          variantKind: "size",
          price: 1800,
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

const SAMPLE_ROWS: MovementsListResponse["rows"] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    sku: SKU_MATTRESS_KING,
    warehouse_id: WAREHOUSE_KL.id,
    qty: 10,
    kind: "in",
    ref: "PO-100",
    note: "Carres Manufacturing",
    by_role: "operation",
    occurred_at: "2026-04-15T03:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    sku: SKU_MATTRESS_KING,
    warehouse_id: WAREHOUSE_KL.id,
    qty: 4,
    kind: "out",
    ref: "SO-500",
    note: "Dealer Sample Sdn",
    by_role: "operation",
    occurred_at: "2026-04-22T05:30:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    sku: SKU_BEDFRAME,
    warehouse_id: WAREHOUSE_PG.id,
    qty: 6,
    kind: "in",
    ref: "PO-101",
    note: null,
    by_role: "operation",
    occurred_at: "2026-03-08T02:00:00.000Z",
  },
];

beforeEach(() => {
  refetchSpy.mockClear();
  movementsHookSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OperationMovements page", () => {
  it("1. renders 4 KPI tiles with values computed from rows", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    // count = 3, in = 10 + 6 = 16, out = 4, net = 12.
    const count = screen.getByTestId("movements-kpi-count");
    expect(count.textContent).toContain("3");
    const tin = screen.getByTestId("movements-kpi-in");
    expect(tin.textContent).toContain("+16");
    const tout = screen.getByTestId("movements-kpi-out");
    expect(tout.textContent).toContain("4");
    const net = screen.getByTestId("movements-kpi-net");
    expect(net.textContent).toContain("+12");
  });

  it("2. KPI tiles have proto color tokens (success / terracotta / danger)", () => {
    // Net = -2 (in:1 out:3) → danger.
    setLoaded([
      {
        id: "a",
        sku: SKU_MATTRESS_KING,
        warehouse_id: WAREHOUSE_KL.id,
        qty: 1,
        kind: "in",
        ref: null,
        note: null,
        by_role: "operation",
        occurred_at: "2026-04-22T03:00:00.000Z",
      },
      {
        id: "b",
        sku: SKU_MATTRESS_KING,
        warehouse_id: WAREHOUSE_KL.id,
        qty: 3,
        kind: "out",
        ref: null,
        note: null,
        by_role: "operation",
        occurred_at: "2026-04-22T03:00:00.000Z",
      },
    ]);
    render(wrap(<OperationMovements />));
    const tin = screen.getByTestId("movements-kpi-in");
    expect(tin.innerHTML).toContain("var(--success)");
    const tout = screen.getByTestId("movements-kpi-out");
    expect(tout.innerHTML).toContain("var(--terracotta)");
    const net = screen.getByTestId("movements-kpi-net");
    expect(net.innerHTML).toContain("var(--danger)");
  });

  it("3. clicking a period chip re-fires the hook with that period in filters", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    movementsHookSpy.mockClear();
    fireEvent.click(screen.getByTestId("movements-period-7d"));
    // Last call = filters with period:'7d'.
    const lastCall = movementsHookSpy.mock.calls.at(-1)?.[0] as
      | MovementsFilters
      | undefined;
    expect(lastCall?.period).toBe("7d");
  });

  it("4. all 5 period chips render and the active one has aria-pressed=true", () => {
    setLoaded([]);
    render(wrap(<OperationMovements />));
    expect(screen.getByTestId("movements-period-7d")).toBeInTheDocument();
    expect(screen.getByTestId("movements-period-30d")).toBeInTheDocument();
    expect(screen.getByTestId("movements-period-90d")).toBeInTheDocument();
    expect(screen.getByTestId("movements-period-all")).toBeInTheDocument();
    expect(screen.getByTestId("movements-period-custom")).toBeInTheDocument();
    // Default is 30d.
    expect(
      screen.getByTestId("movements-period-30d").getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("5. selecting custom period reveals from + to inputs and disables hook until both filled", () => {
    setLoaded([]);
    render(wrap(<OperationMovements />));
    fireEvent.click(screen.getByTestId("movements-period-custom"));
    expect(screen.getByTestId("movements-custom-range")).toBeInTheDocument();
    expect(screen.getByTestId("movements-custom-hint").textContent).toMatch(
      /pick both/i,
    );
    // Empty body shows "Pick a custom date range above" until both dates set.
    expect(screen.getByTestId("movements-empty").textContent).toMatch(
      /custom date range/i,
    );
  });

  it("6. Custom from + to inputs flow into ISO from/to filters", () => {
    setLoaded([]);
    render(wrap(<OperationMovements />));
    fireEvent.click(screen.getByTestId("movements-period-custom"));
    fireEvent.change(screen.getByTestId("movements-custom-from"), {
      target: { value: "2026-04-01" },
    });
    fireEvent.change(screen.getByTestId("movements-custom-to"), {
      target: { value: "2026-04-30" },
    });
    const lastCall = movementsHookSpy.mock.calls.at(-1)?.[0] as
      | MovementsFilters
      | undefined;
    expect(lastCall?.period).toBe("custom");
    // The component parses the date input as local time then serialises to
    // UTC ISO, so the exact prefix depends on the test runner's timezone.
    // Verify it round-trips through the shared schema (which is the actual
    // contract between web and api) instead of asserting the literal string.
    expect(lastCall?.from).toBeTruthy();
    expect(lastCall?.to).toBeTruthy();
    const schemaCheck = listMovementsQuery.safeParse(lastCall);
    expect(schemaCheck.success).toBe(true);
    // And `from` < `to` so the half-open .gte/.lt server query is non-empty.
    expect(new Date(lastCall!.from!).getTime()).toBeLessThan(
      new Date(lastCall!.to!).getTime(),
    );
  });

  it("7. all 5 filter selects fire the hook with the new value", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    movementsHookSpy.mockClear();
    fireEvent.change(screen.getByTestId("movements-filter-warehouse"), {
      target: { value: WAREHOUSE_PG.id },
    });
    fireEvent.change(screen.getByTestId("movements-filter-category"), {
      target: { value: "bedframe" },
    });
    fireEvent.change(screen.getByTestId("movements-filter-sku"), {
      target: { value: SKU_BEDFRAME },
    });
    fireEvent.change(screen.getByTestId("movements-filter-kind"), {
      target: { value: "in" },
    });
    fireEvent.change(screen.getByTestId("movements-filter-search"), {
      target: { value: "PO-101" },
    });
    const lastCall = movementsHookSpy.mock.calls.at(-1)?.[0] as
      | MovementsFilters
      | undefined;
    expect(lastCall?.warehouseId).toBe(WAREHOUSE_PG.id);
    expect(lastCall?.category).toBe("bedframe");
    expect(lastCall?.sku).toBe(SKU_BEDFRAME);
    expect(lastCall?.kind).toBe("in");
    expect(lastCall?.search).toBe("PO-101");
  });

  it("8. category change resets the SKU filter to 'all'", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    fireEvent.change(screen.getByTestId("movements-filter-sku"), {
      target: { value: SKU_MATTRESS_KING },
    });
    expect(
      (screen.getByTestId("movements-filter-sku") as HTMLSelectElement).value,
    ).toBe(SKU_MATTRESS_KING);
    fireEvent.change(screen.getByTestId("movements-filter-category"), {
      target: { value: "bedframe" },
    });
    expect(
      (screen.getByTestId("movements-filter-sku") as HTMLSelectElement).value,
    ).toBe("");
  });

  it("9. shell-char search input is rejected by the listMovementsQuery schema (round-trip safety)", () => {
    // The component itself doesn't enforce the regex (server does), but the
    // shared schema must reject it so injection-style strings can never reach
    // the DB. Round-trip the typed string through the schema.
    expect(
      listMovementsQuery.safeParse({ search: "%' OR 1=1 --" }).success,
    ).toBe(false);
    expect(listMovementsQuery.safeParse({ search: "PO-100" }).success).toBe(true);
  });

  it("10. view toggle switches list ↔ by-month", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    expect(screen.getByTestId("movements-list")).toBeInTheDocument();
    expect(screen.queryByTestId("movements-by-month")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("movements-view-month"));
    expect(screen.getByTestId("movements-by-month")).toBeInTheDocument();
    expect(screen.queryByTestId("movements-list")).not.toBeInTheDocument();
  });

  it("11. by-month groups rows into YYYY-MM headers with their own totals", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    fireEvent.click(screen.getByTestId("movements-view-month"));
    // SAMPLE_ROWS has 2 rows in 2026-04 and 1 row in 2026-03.
    expect(screen.getByTestId("movements-month-2026-04")).toBeInTheDocument();
    expect(screen.getByTestId("movements-month-2026-03")).toBeInTheDocument();
    // April: 1 in (10) + 1 out (4) → +10 / -4 / net +6.
    const apr = screen.getByTestId("movements-month-2026-04");
    expect(apr.textContent).toContain("+10");
    expect(apr.textContent).toContain("4");
    // March: 1 in (6) → +6 / -0 / net +6.
    const mar = screen.getByTestId("movements-month-2026-03");
    expect(mar.textContent).toContain("+6");
  });

  it("12. shows LIMIT 200 hint when rows.length === 200", () => {
    const big: MovementsListResponse["rows"] = Array.from({ length: 200 }, (_, i) => ({
      id: `${i}`,
      sku: SKU_MATTRESS_KING,
      warehouse_id: WAREHOUSE_KL.id,
      qty: 1,
      kind: i % 2 === 0 ? "in" : "out",
      ref: `R-${i}`,
      note: null,
      by_role: "operation",
      occurred_at: "2026-04-22T03:00:00.000Z",
    }));
    setLoaded(big);
    render(wrap(<OperationMovements />));
    expect(screen.getByTestId("movements-limit-hint")).toBeInTheDocument();
    expect(screen.getByTestId("movements-limit-hint").textContent).toMatch(
      /most recent 200/i,
    );
  });

  /**
   * jsdom's `Blob` does not implement `.text()` / `.arrayBuffer()`. To assert
   * CSV body contents we intercept the Blob constructor: capture every part
   * passed to `new Blob([parts], opts)` so the test can read what would have
   * been written to disk. This is more deterministic than trying to polyfill
   * jsdom's Blob (which doesn't store the source after construction).
   */
  function captureBlobAndUrl() {
    const captured: { csv: string | null; type: string | null } = {
      csv: null,
      type: null,
    };
    const RealBlob = globalThis.Blob;
    class CapturingBlob extends RealBlob {
      constructor(parts?: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        if (parts && parts.length > 0 && typeof parts[0] === "string") {
          captured.csv = parts[0] as string;
          captured.type = opts?.type ?? null;
        }
      }
    }
    Object.defineProperty(globalThis, "Blob", {
      value: CapturingBlob,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn().mockReturnValue("blob:fake"),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    return {
      captured,
      restore: () => {
        Object.defineProperty(globalThis, "Blob", {
          value: RealBlob,
          configurable: true,
          writable: true,
        });
      },
    };
  }

  it("13. CSV export downloads a blob with header + escaped rows", () => {
    setLoaded(SAMPLE_ROWS);
    const { captured, restore } = captureBlobAndUrl();
    try {
      render(wrap(<OperationMovements />));
      fireEvent.click(screen.getByTestId("movements-export-csv"));
      expect(captured.csv).not.toBeNull();
      expect(captured.type).toContain("text/csv");
      const csv = captured.csv!;
      expect(csv).toMatch(/^"When","Kind","SKU","Warehouse","Qty","Ref","Note","By"/);
      // 3 sample rows + 1 header line.
      expect(csv.split("\n")).toHaveLength(4);
      // First sample row: PO-100 from KL Warehouse.
      expect(csv).toContain("PO-100");
      expect(csv).toContain("KL Warehouse");
    } finally {
      restore();
    }
  });

  it("14. CSV export escapes commas, quotes, and newlines inside fields", () => {
    setLoaded([
      {
        id: "00000000-0000-0000-0000-0000000000ff",
        sku: SKU_MATTRESS_KING,
        warehouse_id: WAREHOUSE_KL.id,
        qty: 1,
        kind: "out",
        ref: 'order, "rush" #500',
        note: "line1\nline2",
        by_role: "operation",
        occurred_at: "2026-04-22T03:00:00.000Z",
      },
    ]);
    const { captured, restore } = captureBlobAndUrl();
    try {
      render(wrap(<OperationMovements />));
      fireEvent.click(screen.getByTestId("movements-export-csv"));
      expect(captured.csv).not.toBeNull();
      const csv = captured.csv!;
      // Embedded quote should be doubled, embedded newline should sit inside
      // the quoted field, embedded comma should not break the column count.
      expect(csv).toContain('"order, ""rush"" #500"');
      expect(csv).toContain('"line1\nline2"');
    } finally {
      restore();
    }
  });

  it("15. loading state shows the movements-skeleton; error state shows Retry that calls refetch", () => {
    movementsHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchSpy,
    };
    warehouseHookState = { data: { warehouses: [], byWarehouse: {}, totalsBySku: {} } };
    catalogHookState = {
      data: {
        models: [],
        skus: [],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    };
    const { rerender } = render(wrap(<OperationMovements />));
    expect(screen.getByTestId("movements-skeleton")).toBeInTheDocument();
    movementsHookState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("kaboom"),
      refetch: refetchSpy,
    };
    rerender(wrap(<OperationMovements />));
    expect(screen.getByText(/Couldn.+t load movements/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("16. empty rows render the empty-state hint in both views", () => {
    setLoaded([]);
    render(wrap(<OperationMovements />));
    expect(screen.getByTestId("movements-empty").textContent).toMatch(
      /no movements match/i,
    );
    fireEvent.click(screen.getByTestId("movements-view-month"));
    expect(screen.getByTestId("movements-empty").textContent).toMatch(
      /no movements match/i,
    );
  });

  it("17. Clear filters resets all 5 filters + period back to defaults", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    fireEvent.change(screen.getByTestId("movements-filter-warehouse"), {
      target: { value: WAREHOUSE_KL.id },
    });
    fireEvent.change(screen.getByTestId("movements-filter-kind"), {
      target: { value: "in" },
    });
    fireEvent.click(screen.getByTestId("movements-period-7d"));
    fireEvent.click(screen.getByTestId("movements-clear-filters"));
    expect(
      (screen.getByTestId("movements-filter-warehouse") as HTMLSelectElement)
        .value,
    ).toBe("");
    expect(
      (screen.getByTestId("movements-filter-kind") as HTMLSelectElement).value,
    ).toBe("all");
    expect(
      screen
        .getByTestId("movements-period-30d")
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("18. initialFilters prefill seeds the filters and consumes via clearInitialFilters", () => {
    setLoaded(SAMPLE_ROWS);
    const clear = vi.fn();
    render(
      wrap(
        <OperationMovements
          initialFilters={{ sku: SKU_MATTRESS_KING, warehouseId: WAREHOUSE_KL.id }}
          clearInitialFilters={clear}
        />,
      ),
    );
    expect(
      (screen.getByTestId("movements-filter-sku") as HTMLSelectElement).value,
    ).toBe(SKU_MATTRESS_KING);
    expect(
      (screen.getByTestId("movements-filter-warehouse") as HTMLSelectElement)
        .value,
    ).toBe(WAREHOUSE_KL.id);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("19. breadcrumb '← Warehouse' calls setTab('warehouse')", () => {
    setLoaded([]);
    const setTab = vi.fn();
    render(wrap(<OperationMovements setTab={setTab} />));
    fireEvent.click(screen.getByTestId("movements-back-warehouse"));
    expect(setTab).toHaveBeenCalledWith("warehouse");
  });

  it("20. a11y: filter selects + search expose accessible labels", () => {
    setLoaded([]);
    render(wrap(<OperationMovements />));
    expect(screen.getByLabelText(/Warehouse/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^SKU$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Kind/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Search ref or note/i)).toBeInTheDocument();
  });

  it("21. row-level: list view renders SKU + warehouse + qty for each movement", () => {
    setLoaded(SAMPLE_ROWS);
    render(wrap(<OperationMovements />));
    const row = screen.getByTestId("movements-row-00000000-0000-0000-0000-000000000001");
    expect(row.textContent).toContain("Carres Cloud · King");
    expect(row.textContent).toContain("KL Warehouse");
    expect(row.textContent).toContain("10");
    // IN badge.
    const kind = within(row).getByTestId(
      "movements-row-kind-00000000-0000-0000-0000-000000000001",
    );
    expect(kind.textContent).toContain("IN");
  });
});
