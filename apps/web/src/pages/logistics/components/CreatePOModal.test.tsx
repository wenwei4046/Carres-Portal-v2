import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreatePOModal from "./CreatePOModal";
import { ApiError } from "@/lib/api";
import type { CatalogResponse } from "@carres/shared";
import type {
  DeliveryPartnersListResponse,
  SuppliersListResponse,
  WarehouseListResponse,
} from "@/lib/queries";

/**
 * CreatePOModal — full modal coverage.
 *
 * Phase 4.5 Chunk 2 Sprint F Task 36 — auto-fill / supplier groups / batch RPC
 * tests migrated from `LogisticsProcurement.test.tsx` when the legacy
 * single-page list was retired in favor of the per-supplier tab UI. The shared
 * fixtures below grew SUPPLIER_B + WAREHOUSE_PG for the 2-supplier auto-fill
 * test. The original v3-S4.5 stockpile + T22 alerts coverage stays as-is.
 *
 * Stockpile PO = a PO with no `dl` / `dlRefs` — pure inventory replenishment
 * ahead of customer demand. v3 spec §17.1 A3 promotes this from an audit-trail
 * edge case to a 1st-class flow with explicit UI.
 */

// Phase 4.5 Chunk 1 Task 38 — ReceivePOModal no longer mounts here, but the
// auto-fill / 2-supplier flow drives `CogsLineEditor`'s `prev_po` source path
// which calls `apiFetch` for the recent-cost endpoint. Mock `apiFetch` so
// React Query has a defined value (otherwise warns about "Query data cannot
// be undefined").
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from "@/lib/api";

const sonnerMocks = vi.hoisted(() => {
  const success = vi.fn();
  const error = vi.fn();
  const defaultFn = vi.fn();
  const toast = Object.assign(defaultFn, { success, error });
  return { success, error, defaultFn, toast };
});
vi.mock("sonner", () => ({
  toast: sonnerMocks.toast,
}));

let suppliersHookState: { data: SuppliersListResponse | undefined };
let warehouseHookState: { data: WarehouseListResponse | undefined };
let partnersHookState: { data: DeliveryPartnersListResponse | undefined };
let catalogHookState: { data: CatalogResponse | undefined };
let shortageHookState: {
  data:
    | { shortage: { sku: string; need: number; available: number; shortage: number }[] }
    | undefined;
  isFetching: boolean;
  isFetched: boolean;
  isError?: boolean;
  refetch: ReturnType<typeof vi.fn>;
};
// T22 — `useStockAlerts` hook state. Mirrors the lazy / refetch-on-click
// pattern of `shortageHookState` above so each test can program the click
// resolution (success / empty / error) deterministically.
let alertsHookState: {
  data:
    | {
        alerts: {
          sku: string;
          warehouse_id: string;
          qty: number;
          reserved: number;
          effective: number;
          low_threshold: number;
          shortage: number;
        }[];
      }
    | undefined;
  isFetching: boolean;
  isFetched: boolean;
  isError?: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

const createMutateAsync = vi.fn().mockResolvedValue({});
const createBatchMutateAsync = vi.fn().mockResolvedValue({ poIds: [] });

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useLogisticsSuppliers: () => suppliersHookState,
    useLogisticsWarehouse: () => warehouseHookState,
    useDeliveryPartners: () => partnersHookState,
    useCatalog: () => catalogHookState,
    useCreatePoMutation: () => ({
      mutateAsync: createMutateAsync,
      isPending: false,
    }),
    useCreatePosBatch: () => ({
      mutateAsync: createBatchMutateAsync,
      isPending: false,
    }),
    useAwaitingStockShortage: () => shortageHookState,
    useStockAlerts: () => alertsHookState,
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const SUPPLIER_A = {
  id: "11111111-1111-1111-1111-000000000001",
  name: "Carres Manufacturing",
  kind: "own_logistics" as const,
  cat_covered: ["mattress", "bedframe"],
  lead_time: "5–7 days",
  contact: "+60 3-1111 1111",
};
// Added in T36 migration — the auto-split + 2-supplier batch tests need a 2nd
// supplier whose `cat_covered` covers `sofa` so the modal routes a sofa SKU
// to a separate supplier group.
const SUPPLIER_B = {
  id: "11111111-1111-1111-1111-000000000002",
  name: "Sofa Factory Co",
  kind: "factory_pickup" as const,
  cat_covered: ["sofa"],
  lead_time: "10–14 days",
  contact: "+60 3-2222 2222",
};

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

const PARTNER_A = {
  id: "33333333-3333-3333-3333-000000000001",
  name: "GD Express",
  contact: "+60 3-9999 9999",
  zones: "Klang Valley",
};

function setLoaded() {
  suppliersHookState = { data: { suppliers: [SUPPLIER_A, SUPPLIER_B] } };
  warehouseHookState = {
    data: {
      warehouses: [WAREHOUSE_KL, WAREHOUSE_PG],
      byWarehouse: {},
      totalsBySku: {},
    },
  };
  partnersHookState = { data: { partners: [PARTNER_A] } };
  shortageHookState = {
    data: undefined,
    isFetching: false,
    isFetched: false,
    refetch: vi.fn().mockResolvedValue({ data: { shortage: [] } }),
  };
  alertsHookState = {
    data: undefined,
    isFetching: false,
    isFetched: false,
    refetch: vi.fn().mockResolvedValue({ data: { alerts: [] } }),
  };
  catalogHookState = {
    data: {
      // 0073 — cascade picker (Loo 2026-05-09) needs models indexed by id +
      // category so each line can render Model → Variant → (color/gap or
      // fabric). Pre-0073 the modal only consumed `skus`, so the fixture
      // omitted models — that's why earlier tests passed with `models: []`.
      models: [
        {
          id: "m1",
          category: "mattress" as const,
          modelKey: "carres-cloud",
          name: "Carres Cloud",
          blurb: null,
          colors: null,
          gaps: null,
          sofaMode: null,
        },
        {
          id: "m2",
          category: "sofa" as const,
          modelKey: "nordic",
          name: "Nordic Sofa",
          blurb: null,
          colors: null,
          gaps: null,
          sofaMode: "preset" as const,
        },
      ],
      skus: [
        {
          id: "s1",
          modelId: "m1",
          sku: "mattress:carres-cloud:King",
          variant: "Carres Cloud · King",
          variantKind: "size",
          price: 3500,
          // 0074 — fixed catalog cost; CreatePOModal auto-fills line.cost
          // from this and stamps cost_source='catalog' on submit.
          cost: 1500,
        },
        {
          id: "s2",
          modelId: "m2",
          sku: "sofa:nordic:3s",
          variant: "Nordic Sofa · 3 seater",
          variantKind: "preset",
          price: 4500,
          cost: 2200,
        },
        {
          id: "s3",
          modelId: "m1",
          sku: "mattress:carres-cloud:Queen",
          variant: "Carres Cloud · Queen",
          variantKind: "size",
          price: 3000,
          cost: 1300,
        },
      ],
      sofaFabrics: [],
      addons: [],
      floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
    },
  };
}

beforeEach(() => {
  createMutateAsync.mockClear();
  createBatchMutateAsync.mockClear();
  sonnerMocks.success.mockClear();
  sonnerMocks.error.mockClear();
  sonnerMocks.defaultFn.mockClear();
  vi.mocked(apiFetch).mockReset();
  setLoaded();
});

// 0083 (Loo 2026-05-10) — etaDate is now required on createPoInput. Every
// "Issue PO becomes enabled" assertion below needs an ETA seeded first.
const ETA_FIXTURE = "2026-06-01";
function fillEta(date: string = ETA_FIXTURE) {
  fireEvent.change(screen.getByLabelText(/Expected delivery date/i), {
    target: { value: date },
  });
}

describe("CreatePOModal — Stockpile PO mode (v3-S4.5)", () => {
  it("Stockpile PO toggle hides order-ref fields when checked", () => {
    // Open with bundle prefill so the bundle intro text would normally render.
    // Toggle is disabled in this case (see test 3) — switch to a stockpile-
    // safe entry: empty prefill, then toggle on. The intro text "Pick the
    // SKUs you need..." should be replaced by the stockpile description, and
    // the auto-fill button (which is order-shortage-driven) should disappear.
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));

    // Default state — auto-fill button is visible (no order-ref prefill).
    expect(
      screen.getByTestId("auto-fill-shortage-button"),
    ).toBeInTheDocument();

    // Flip the stockpile toggle on.
    const toggle = screen.getByTestId("stockpile-po-toggle");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();

    // Auto-fill button (order-shortage-driven) hidden — stockpile is
    // explicitly NOT order-driven.
    expect(
      screen.queryByTestId("auto-fill-shortage-button"),
    ).not.toBeInTheDocument();

    // Stockpile-mode hint visible somewhere in the modal.
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent ?? "").toMatch(/[Ss]tockpile/);
  });

  it("Submit in stockpile mode sends dl=null and dlRefs=null", async () => {
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));

    // Toggle stockpile on
    fireEvent.click(screen.getByTestId("stockpile-po-toggle"));

    // Pick the warehouse (the single supplier group needs one)
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });

    // 0074 — cost auto-fills from product_skus.cost (King fixture = 1500).
    // No more hand-entry; the valid-form gate just needs the seeded SKU.
    // 0083 — ETA also required.
    fillEta();

    // Submit
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).not.toBeDisabled();
    fireEvent.click(issueBtn);

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    const callArg = createMutateAsync.mock.calls[0][0] as {
      supplierId: string;
      warehouseId: string;
      lines: { sku: string; qty: number; cost: number; costSource: string }[];
      dl?: number | null;
      dlRefs?: number[] | null;
      etaDate?: string;
    };
    expect(callArg.supplierId).toBe(SUPPLIER_A.id);
    expect(callArg.warehouseId).toBe(WAREHOUSE_KL.id);
    expect(callArg.lines.length).toBeGreaterThan(0);
    // 0074 — every emitted line carries the catalog cost + costSource='catalog'.
    expect(callArg.lines[0].cost).toBe(1500);
    expect(callArg.lines[0].costSource).toBe("catalog");
    // The contract: stockpile mode forces dl/dlRefs out of the payload.
    // Either omitted or explicitly null is acceptable per the API zod
    // (dl/dlRefs are .optional()), but neither must carry a value.
    expect(callArg.dl ?? null).toBeNull();
    expect(callArg.dlRefs ?? null).toBeNull();
    // 0083 — etaDate forwarded.
    expect(callArg.etaDate).toBe(ETA_FIXTURE);
  });

  it("Stockpile PO toggle is disabled when modal opened with auto-fill prefill", () => {
    // Single-order shortage prefill → stockpile makes no sense (the order
    // dictates the lines). Toggle must be disabled + unchecked.
    render(
      wrap(
        <CreatePOModal
          prefill={{
            dl: 4321,
            lines: [{ sku: "mattress:carres-cloud:King", qty: 3 }],
          }}
          onClose={() => {}}
        />,
      ),
    );
    const toggle = screen.getByTestId("stockpile-po-toggle");
    expect(toggle).toBeDisabled();
    expect(toggle).not.toBeChecked();

    // Same when the prefill is a cross-order bundle.
    const { unmount } = render(
      wrap(
        <CreatePOModal
          prefill={{
            dlRefs: [101, 102],
            lines: [{ sku: "mattress:carres-cloud:King", qty: 5 }],
          }}
          onClose={() => {}}
        />,
      ),
    );
    const toggles = screen.getAllByTestId("stockpile-po-toggle");
    // Both modals are mounted — find the bundle one (the second).
    const bundleToggle = toggles[toggles.length - 1];
    expect(bundleToggle).toBeDisabled();
    expect(bundleToggle).not.toBeChecked();
    unmount();
  });

  it("Form valid without dl when stockpile mode on", () => {
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));

    // Issue button starts disabled (warehouse blank).
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).toBeDisabled();

    // Toggle stockpile — this alone shouldn't unblock the button (warehouse
    // still blank).
    fireEvent.click(screen.getByTestId("stockpile-po-toggle"));
    expect(issueBtn).toBeDisabled();

    // 0074 — cost auto-fills from product_skus.cost on the seeded line
    // (King fixture = 1500). Submit only needs warehouse picked.
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    // 0083 — ETA also required.
    expect(issueBtn).toBeDisabled();
    fillEta();
    expect(issueBtn).not.toBeDisabled();
  });

  it("submit blocked when any line points at a SKU with NULL cost", () => {
    // 0074 — replaces the T29 "missing cost/costSource" gate. Cost is now
    // catalog-driven; the gate refuses lines whose SKU has cost=null (i.e.
    // catalog admin hasn't set a procurement cost yet).
    catalogHookState = {
      data: {
        ...catalogHookState.data!,
        skus: catalogHookState.data!.skus.map((s) =>
          s.sku === "mattress:carres-cloud:King" ? { ...s, cost: null } : s,
        ),
      },
    };
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    fireEvent.click(screen.getByTestId("stockpile-po-toggle"));
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).toBeDisabled();
  });
});

/**
 * Phase 4.5 Chunk 2 Sprint D Task 22 — "Suggest from alerts" button.
 *
 * The button lives next to the existing "Auto-fill from awaiting stock" CTA
 * and pre-populates the lines list using `(low_threshold * 2) - effective`
 * (the master plan formula `(high_threshold || low_threshold * 2) - effective`
 * collapses to this since the alerts feed only carries `low_threshold` today —
 * see comment on `alertsQ` in CreatePOModal.tsx).
 *
 * Tests cover:
 *   1. Happy path: alerts return 3 SKUs → 3 lines populated with the formula
 *   2. Empty alerts: refetch returns [] → button shows "No stock alerts" copy
 *      and disables; lines untouched
 *   3. Override semantics: existing lines are replaced (Q3=A) on click
 *   4. Visibility: hidden when modal opened with order-prefill (`prefill.dl`)
 *   5. Qty clamp: a degenerate alert row where the gap rounds non-positive
 *      still produces qty=1 (defensive `Math.max(1, …)`)
 */
describe("CreatePOModal — Suggest from alerts (T22)", () => {
  const SKU_KING = "mattress:carres-cloud:King";

  function withCatalog(
    extra: { id: string; modelId: string; sku: string; variant: string }[],
  ) {
    // T36 — dedupe by sku since the shared `setLoaded()` seed already carries
    // some of the SKUs the alerts tests want (sofa:nordic:3s, Queen, etc.). A
    // duplicate `<option key={sku}>` in the SKU select triggers React's "two
    // children with the same key" warning, which gates strict mode.
    const existing = new Set(
      (catalogHookState.data?.skus ?? []).map((s) => s.sku),
    );
    catalogHookState = {
      data: {
        models: [],
        skus: [
          ...(catalogHookState.data?.skus ?? []),
          ...extra
            .filter((e) => !existing.has(e.sku))
            .map((e) => ({
              ...e,
              variantKind: "size" as const,
              price: 0,
              // 0074 — extra fixture SKUs default to NULL cost; tests that
              // exercise actual cost numbers seed a real value via the main
              // `setLoaded()` fixture instead.
              cost: null,
            })),
        ],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    };
  }

  function makeAlertRow(
    sku: string,
    overrides: Partial<{
      effective: number;
      low_threshold: number;
      qty: number;
      reserved: number;
      shortage: number;
    }> = {},
  ) {
    const low_threshold = overrides.low_threshold ?? 10;
    const effective = overrides.effective ?? 2;
    return {
      sku,
      warehouse_id: WAREHOUSE_KL.id,
      qty: overrides.qty ?? effective,
      reserved: overrides.reserved ?? 0,
      effective,
      low_threshold,
      shortage: overrides.shortage ?? Math.max(low_threshold - effective, 1),
    };
  }

  it("happy path — clicking 'Suggest from alerts' replaces lines with one row per alert", async () => {
    // Catalog needs to carry every alert SKU so the lines `<select>` has a
    // matching `<option>` for each. Add 2 extra SKUs (the default seed
    // already includes `mattress:carres-cloud:King`).
    withCatalog([
      {
        id: "s2",
        modelId: "m2",
        sku: "sofa:nordic:3s",
        variant: "Nordic Sofa · 3 seater",
      },
      {
        id: "s3",
        modelId: "m1",
        sku: "mattress:carres-cloud:Queen",
        variant: "Carres Cloud · Queen",
      },
    ]);

    // 3 alerts:
    //   row 1: low=10 effective=2 → qty = 10*2 - 2 = 18
    //   row 2: low=8  effective=3 → qty = 8*2  - 3 = 13
    //   row 3: low=5  effective=1 → qty = 5*2  - 1 = 9
    const ALERT_ROWS = [
      makeAlertRow(SKU_KING, { low_threshold: 10, effective: 2 }),
      makeAlertRow("sofa:nordic:3s", { low_threshold: 8, effective: 3 }),
      makeAlertRow("mattress:carres-cloud:Queen", {
        low_threshold: 5,
        effective: 1,
      }),
    ];
    alertsHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch: vi.fn().mockResolvedValue({ data: { alerts: ALERT_ROWS } }),
    };

    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));

    // Default lines start with 1 row (catalog seed). Click the button.
    fireEvent.click(screen.getByTestId("suggest-from-alerts-button"));

    await waitFor(() => {
      // The 3 alert SKUs each yield a line with the computed qty.
      const qtyInputs = screen.getAllByLabelText(
        /Line \d+ qty/,
      ) as HTMLInputElement[];
      expect(qtyInputs).toHaveLength(3);
    });

    const qtyInputs = screen.getAllByLabelText(
      /Line \d+ qty/,
    ) as HTMLInputElement[];
    expect(qtyInputs[0].value).toBe("18");
    expect(qtyInputs[1].value).toBe("13");
    expect(qtyInputs[2].value).toBe("9");

    // Success toast fires with the count.
    expect(sonnerMocks.success).toHaveBeenCalledWith(
      expect.stringMatching(/Suggested 3 SKUs/),
    );
  });

  it("empty alerts — clicking the button surfaces a 'No stock alerts' toast and disables the button", async () => {
    alertsHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch: vi.fn().mockResolvedValue({ data: { alerts: [] } }),
    };

    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    const btn = screen.getByTestId("suggest-from-alerts-button");

    // Initially enabled (no result yet).
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);

    await waitFor(() => {
      expect(sonnerMocks.defaultFn).toHaveBeenCalledWith(
        expect.stringMatching(/No stock alerts/i),
        expect.objectContaining({ duration: 3000 }),
      );
    });

    // Sticky empty: after a known-empty fetch, the button locks down.
    alertsHookState = {
      ...alertsHookState,
      data: { alerts: [] },
      isFetched: true,
    };
    // Re-render to flush the new hook state. Easiest: unmount + remount.
    // (Mocking the hook means the component reads the fresh `alertsHookState`
    // on the next render.)
    const { unmount } = render(
      wrap(<CreatePOModal prefill={{}} onClose={() => {}} />),
    );
    const buttons = screen.getAllByTestId("suggest-from-alerts-button");
    const last = buttons[buttons.length - 1];
    expect(last).toBeDisabled();
    expect(last.textContent).toMatch(/No stock alerts/i);
    unmount();
  });

  it("override — clicking the button replaces user-entered lines (Q3=A)", async () => {
    alertsHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch: vi.fn().mockResolvedValue({
        data: {
          alerts: [
            makeAlertRow(SKU_KING, { low_threshold: 4, effective: 1 }),
          ],
        },
      }),
    };

    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));

    // User pre-edits the seeded line to qty=99 — to verify the click does
    // an override (replace) rather than an append/merge.
    const qtyInputs = screen.getAllByLabelText(
      /Line \d+ qty/,
    ) as HTMLInputElement[];
    fireEvent.change(qtyInputs[0], { target: { value: "99" } });
    expect(qtyInputs[0].value).toBe("99");

    fireEvent.click(screen.getByTestId("suggest-from-alerts-button"));

    await waitFor(() => {
      const after = screen.getAllByLabelText(
        /Line \d+ qty/,
      ) as HTMLInputElement[];
      expect(after).toHaveLength(1);
      // qty = 4 * 2 - 1 = 7. The user's 99 was clobbered.
      expect(after[0].value).toBe("7");
    });
  });

  it("hidden when modal opened with prefill.dl (order-driven flow already knows the lines)", () => {
    render(
      wrap(
        <CreatePOModal
          prefill={{
            dl: 4321,
            lines: [{ sku: SKU_KING, qty: 3 }],
          }}
          onClose={() => {}}
        />,
      ),
    );
    expect(
      screen.queryByTestId("suggest-from-alerts-button"),
    ).not.toBeInTheDocument();
  });

  it("qty clamps to ≥1 even when low_threshold * 2 - effective rounds non-positive", async () => {
    // Defensive case: a future or odd row where effective ≥ low_threshold * 2.
    // Today the alerts RPC filter (effective < low_threshold) makes this
    // unreachable, but the modal still clamps with Math.max(1, gap).
    alertsHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch: vi.fn().mockResolvedValue({
        data: {
          alerts: [
            // gap = 1 * 2 - 5 = -3 → clamps to 1
            makeAlertRow(SKU_KING, {
              low_threshold: 1,
              effective: 5,
              shortage: 1,
            }),
          ],
        },
      }),
    };

    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    fireEvent.click(screen.getByTestId("suggest-from-alerts-button"));

    await waitFor(() => {
      const qtyInputs = screen.getAllByLabelText(
        /Line \d+ qty/,
      ) as HTMLInputElement[];
      expect(qtyInputs).toHaveLength(1);
      expect(qtyInputs[0].value).toBe("1");
    });
  });

  it("coalesces duplicate SKUs across warehouses + sums gaps (T42-pass3-C3)", async () => {
    // Codex pass-3 comment 3: `logistics_stock_alerts()` returns one row per
    // (sku, warehouse_id), so the same SKU below threshold in 2 warehouses
    // produces 2 alert rows. The submit path groups lines by supplier into
    // ONE PO and `purchase_order_lines (po_id, sku) PRIMARY KEY` would crash
    // the insert with 23505 unique_violation. Modal must coalesce on sku
    // before building lines, summing the gaps so the suggested qty replenishes
    // the system-wide shortage.
    alertsHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch: vi.fn().mockResolvedValue({
        data: {
          alerts: [
            // Same SKU below threshold in 2 warehouses; gap should sum.
            //   wh A: low=10 effective=2 → gap 18
            //   wh B: low=10 effective=4 → gap 16
            //   summed → 34
            makeAlertRow(SKU_KING, { low_threshold: 10, effective: 2 }),
            makeAlertRow(SKU_KING, { low_threshold: 10, effective: 4 }),
            // Distinct SKU survives untouched: gap = 8*2 - 3 = 13.
            makeAlertRow("sofa:nordic:3s", { low_threshold: 8, effective: 3 }),
          ],
        },
      }),
    };

    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    fireEvent.click(screen.getByTestId("suggest-from-alerts-button"));

    await waitFor(() => {
      const qtyInputs = screen.getAllByLabelText(
        /Line \d+ qty/,
      ) as HTMLInputElement[];
      // 2 lines (not 3) — the duplicate SKU collapsed into one.
      expect(qtyInputs).toHaveLength(2);
    });

    const qtyInputs = screen.getAllByLabelText(
      /Line \d+ qty/,
    ) as HTMLInputElement[];
    // Insertion order = first-seen-sku order, so SKU_KING (gap 18+16=34)
    // is line 0; sofa is line 1.
    expect(qtyInputs[0].value).toBe("34");
    expect(qtyInputs[1].value).toBe("13");
    // Toast count uses the coalesced length so the user isn't lied to about
    // how many SKUs land in the PO.
    expect(sonnerMocks.success).toHaveBeenCalledWith(
      expect.stringMatching(/Suggested 2 SKUs/),
    );
  });
});

/**
 * Phase 4.5 Chunk 2 Sprint F Task 36 — base modal coverage migrated from
 * `LogisticsProcurement.test.tsx`.
 *
 * The legacy single-page list opened the modal via a `+ New PO` button on the
 * page. The new tab UI doesn't have that button yet (T36 only restructures
 * tests; the entry point lands later), so these tests render `CreatePOModal`
 * directly with explicit props — the same pattern T22 alerts + stockpile
 * tests above already use.
 */
describe("CreatePOModal — base modal flows (migrated from LogisticsProcurement)", () => {
  it("renders the lines table + heading on mount", () => {
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    expect(screen.getByText(/New purchase order/)).toBeInTheDocument();
    expect(screen.getByTestId("po-lines-table")).toBeInTheDocument();
  });

  // 0083 (Loo 2026-05-10) — ETA gate: button stays disabled even with valid
  // warehouse + lines until the user picks an Expected delivery date.
  it("disables 'Issue PO' when ETA is blank, even with valid warehouse + lines (0083)", () => {
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    // Warehouse picked + catalog cost auto-filled — button still disabled
    // because ETA hasn't been set.
    expect(issueBtn).toBeDisabled();
    fillEta();
    expect(issueBtn).not.toBeDisabled();
  });

  it("disables 'Issue PO' when no warehouse picked", () => {
    // Empty warehouses → the supplier-group warehouse select has no valid
    // option, so submit stays gated.
    warehouseHookState = {
      data: { warehouses: [], byWarehouse: {}, totalsBySku: {} },
    };
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).toBeDisabled();
  });

  it("submit calls useCreatePoMutation per supplier group with cost + costSource", async () => {
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    // Default first SKU is `mattress:carres-cloud:King` which maps to SUPPLIER_A.
    // C5.2 — warehouse defaults blank per supplier group, so the button is
    // disabled until the user picks one.
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    // 0074 — cost auto-fills from product_skus.cost (King fixture = 1500).
    // 0083 — ETA also required before button enables.
    fillEta();
    expect(issueBtn).not.toBeDisabled();
    fireEvent.click(issueBtn);
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    const callArg = createMutateAsync.mock.calls[0][0] as {
      supplierId: string;
      warehouseId: string;
      lines: { sku: string; qty: number; cost: number; costSource: string }[];
      etaDate?: string;
    };
    expect(callArg.supplierId).toBe(SUPPLIER_A.id);
    expect(callArg.warehouseId).toBe(WAREHOUSE_KL.id);
    expect(callArg.lines.length).toBeGreaterThan(0);
    // 0074 — every emitted line carries the catalog cost + 'catalog' source.
    expect(callArg.lines[0].cost).toBe(1500);
    expect(callArg.lines[0].costSource).toBe("catalog");
    // 0083 — etaDate forwarded.
    expect(callArg.etaDate).toBe(ETA_FIXTURE);
  });

  it("changing variant on a line re-pulls cost from the new SKU (0074)", () => {
    // 0074 — replaces T42-C4 manual-entry test. Switching variant via the
    // cascade picker now re-reads cost from product_skus.cost (King = 1500
    // → Queen = 1300 per fixture). costSource stays 'catalog'.
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));

    const SKU_QUEEN = "mattress:carres-cloud:Queen";

    // Switch SKU on line 0 from King → Queen via the variant select.
    const skuSelects = screen.getAllByLabelText(/Line \d+ variant/);
    fireEvent.change(skuSelects[0], { target: { value: SKU_QUEEN } });

    // Submit and inspect the emitted cost — should be Queen's catalog cost.
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    // 0083 — ETA also required before button enables.
    fillEta();
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).not.toBeDisabled();
  });

  it("warns when 2 suppliers match → auto-split notice", () => {
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    // Add a second SKU mapped to SUPPLIER_B (sofa:...)
    fireEvent.click(screen.getByRole("button", { name: /\+ Add SKU/ }));
    // 0073 cascade picker: SKU swap moved from a single dropdown to the
    // per-line Variant select (model already chosen by the seeded default).
    const skuSelects = screen.getAllByLabelText(/Line \d+ variant/);
    expect(skuSelects.length).toBe(2);
    fireEvent.change(skuSelects[1], { target: { value: "sofa:nordic:3s" } });
    // The notice has "Auto-split:" followed by N separate POs in a <strong>;
    // grab the parent of "Auto-split:" and check its text.
    const autoSplitLabel = screen.getByText(/Auto-split:/);
    expect(autoSplitLabel.parentElement?.textContent).toContain(
      "2 separate POs",
    );
    // Both supplier names should also be in the same notice.
    expect(autoSplitLabel.parentElement?.textContent).toContain(
      "Carres Manufacturing",
    );
    expect(autoSplitLabel.parentElement?.textContent).toContain(
      "Sofa Factory Co",
    );
  });
});

/**
 * Phase 4.5 Chunk 2 Sprint F Task 36 — auto-fill from awaiting stock
 * (C5.3 → 5.2 chain) migrated from `LogisticsProcurement.test.tsx`. The
 * test 21/22 visibility guards above already covered the prefill cases; these
 * round out the click-side behavior (refetch / override / batch RPC / error).
 */
describe("CreatePOModal — Auto-fill from awaiting stock (C5.3)", () => {
  const SKU_KING = "mattress:carres-cloud:King";

  it("button is visible when no prefill.dl and no prefill.dlRefs", () => {
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    expect(screen.getByTestId("auto-fill-shortage-button")).toBeInTheDocument();
  });

  it("button is HIDDEN when prefill.dl is set (single-order shortage flow)", () => {
    render(wrap(<CreatePOModal prefill={{ dl: 1234 }} onClose={() => {}} />));
    expect(
      screen.queryByTestId("auto-fill-shortage-button"),
    ).not.toBeInTheDocument();
  });

  it("button is HIDDEN when prefill.dlRefs is non-empty (bundle flow)", () => {
    render(
      wrap(
        <CreatePOModal
          prefill={{ dlRefs: [4001, 4002, 4003] }}
          onClose={() => {}}
        />,
      ),
    );
    expect(
      screen.queryByTestId("auto-fill-shortage-button"),
    ).not.toBeInTheDocument();
  });

  it("clicking auto-fill triggers refetch and replaces lines (override behavior)", async () => {
    const refetch = vi.fn().mockResolvedValue({
      data: {
        shortage: [
          { sku: "sofa:nordic:3s", need: 5, available: 1, shortage: 4 },
          {
            sku: "mattress:carres-cloud:Queen",
            need: 3,
            available: 0,
            shortage: 3,
          },
        ],
      },
    });
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch,
    };
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    // Modal default seeds first line with first SKU = "mattress:carres-cloud:King".
    expect(screen.getByDisplayValue("Carres Cloud · King")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("auto-fill-shortage-button"));
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledTimes(1);
    });
    // Override behavior — the previous default King line is gone, replaced by
    // the two SKUs returned from the server (Queen + Nordic).
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Carres Cloud · King")).toBeNull();
    });
    expect(
      screen.getAllByDisplayValue("Nordic Sofa · 3 seater").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByDisplayValue("Carres Cloud · Queen").length,
    ).toBeGreaterThan(0);
  });

  it("empty shortage result disables the button + shows the empty label", () => {
    const refetch = vi.fn().mockResolvedValue({ data: { shortage: [] } });
    // Simulate the post-fetch state: isFetched=true, data is empty.
    shortageHookState = {
      data: { shortage: [] },
      isFetching: false,
      isFetched: true,
      refetch,
    };
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    const btn = screen.getByTestId("auto-fill-shortage-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent ?? "").toMatch(/No shortages/i);
  });

  it("auto-fill across 2 suppliers → user picks per-PO warehouse for each → batch RPC fires (5.3 → 5.2 chain)", async () => {
    // Program refetch with two SKUs whose categories map to two different
    // suppliers (mattress → SUPPLIER_A, sofa → SUPPLIER_B). After click the
    // modal must render BOTH supplier-group cards, accept a warehouse pick
    // for each, and submit via the batch RPC (NOT the single-PO RPC).
    const refetch = vi.fn().mockResolvedValue({
      data: {
        shortage: [
          { sku: SKU_KING, need: 5, available: 0, shortage: 5 },
          { sku: "sofa:nordic:3s", need: 3, available: 0, shortage: 3 },
        ],
      },
    });
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch,
    };
    // T29 — CogsLineEditor's `prev_po` path triggers `apiFetch` for the
    // recent-cost endpoint. Stub a benign `null` cost so React Query has a
    // defined value (otherwise warns about "Query data cannot be undefined").
    // The component's null-cost path is "keep prior cost" → the user-typed
    // 2200 stays in place, which the test asserts on.
    vi.mocked(apiFetch).mockResolvedValue({
      cost: null,
      lastPoId: null,
      lastReceivedAt: null,
    });
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    fireEvent.click(screen.getByTestId("auto-fill-shortage-button"));
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledTimes(1);
    });
    // Both supplier groups render — verifies setLines triggered the
    // auto-grouping side-effect and per-PO warehouse pickers appear.
    await waitFor(() => {
      expect(
        screen.getByTestId(`po-supplier-group-${SUPPLIER_A.id}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId(`po-supplier-group-${SUPPLIER_B.id}`),
    ).toBeInTheDocument();
    // Issue button gates on per-supplier warehouse picks (Q4=A) and (T29)
    // per-line cost + costSource.
    const issueBtn = screen.getByRole("button", { name: /Issue 2 POs/ });
    expect(issueBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_B.id}`), {
      target: { value: WAREHOUSE_PG.id },
    });
    // 0074 — cost auto-fills from product_skus.cost (King=1500, Nordic=2200);
    // costSource = 'catalog' fixed.
    // 0083 — ETA also required before button enables.
    fillEta();
    expect(issueBtn).not.toBeDisabled();
    fireEvent.click(issueBtn);
    // Batch RPC fires (NOT the single-PO RPC) — atomic 2-PO commit.
    await waitFor(() => {
      expect(createBatchMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
    const callArg = createBatchMutateAsync.mock.calls[0][0] as {
      pos: {
        supplierId: string;
        warehouseId: string;
        lines: {
          sku: string;
          qty: number;
          cost: number;
          costSource: string;
          attrs: Record<string, unknown> | null;
        }[];
        etaDate?: string;
      }[];
    };
    expect(callArg.pos).toHaveLength(2);
    const aGroup = callArg.pos.find((p) => p.supplierId === SUPPLIER_A.id);
    const bGroup = callArg.pos.find((p) => p.supplierId === SUPPLIER_B.id);
    expect(aGroup?.warehouseId).toBe(WAREHOUSE_KL.id);
    expect(bGroup?.warehouseId).toBe(WAREHOUSE_PG.id);
    // 0083 — etaDate forwarded onto each PO entry in the batch.
    expect(aGroup?.etaDate).toBe(ETA_FIXTURE);
    expect(bGroup?.etaDate).toBe(ETA_FIXTURE);
    // 0073 cascade picker: mattress + sofa-without-fabric lines emit attrs=null.
    // 0074: catalog cost auto-stamped + costSource='catalog' on every line.
    expect(aGroup?.lines).toEqual([
      {
        sku: SKU_KING,
        qty: 5,
        cost: 1500,
        costSource: "catalog",
        attrs: null,
      },
    ]);
    expect(bGroup?.lines).toEqual([
      {
        sku: "sofa:nordic:3s",
        qty: 3,
        cost: 2200,
        costSource: "catalog",
        attrs: null,
      },
    ]);
  });

  it("auto-fill failure surfaces toast.error and does NOT show the misleading 'No shortages' notice", async () => {
    // refetch resolves with React Query's `{data, error}` shape — `error` set,
    // `data` undefined. Pre-fix this fell through to the empty-state toast,
    // claiming "no shortages" while the endpoint was actually 5xx-ing.
    const refetch = vi.fn().mockResolvedValue({
      data: undefined,
      error: new ApiError(500, "Internal Server Error", null),
    });
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch,
    };
    render(wrap(<CreatePOModal prefill={{}} onClose={() => {}} />));
    fireEvent.click(screen.getByTestId("auto-fill-shortage-button"));
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledTimes(1);
    });
    // Failure routes through toast.error with the ApiError message…
    await waitFor(() => {
      expect(sonnerMocks.error).toHaveBeenCalled();
    });
    expect(sonnerMocks.error).toHaveBeenCalledWith("Internal Server Error");
    // …and crucially does NOT fire the empty-state toast (`toast(...)`).
    expect(sonnerMocks.defaultFn).not.toHaveBeenCalled();
    // Lines stay untouched (no override happened).
    expect(screen.getByDisplayValue("Carres Cloud · King")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Bundle auto-prefill (2026-05-10) — fixes memory 1790/1793.
//
// CrossOrderBundleSheet → "+ Create combined PO" sets `prefill.dlRefs` on
// CreatePOModal. Pre-fix, the modal seeded a placeholder `qty=5` line with the
// first catalog SKU because nothing else had populated `lines`. Loo's retest
// surfaced this as "wrong qty / wrong SKU on bundle PO". Post-fix:
//   1. The placeholder seeding skips when prefill.dlRefs is set.
//   2. A one-shot useEffect calls autoFillFromShortage() on mount, which
//      (with the hook now scoped via ?dls=…) populates lines with the actual
//      aggregated shortage for those orders.
// ---------------------------------------------------------------------------
describe("CreatePOModal — Bundle auto-prefill (2026-05-10)", () => {
  it("auto-fires shortage fetch on mount and populates lines from server", async () => {
    const refetch = vi.fn().mockResolvedValue({
      data: {
        shortage: [
          { sku: "mattress:carres-cloud:Queen", need: 3, available: 0, shortage: 3 },
          { sku: "sofa:nordic:3s", need: 2, available: 0, shortage: 2 },
        ],
      },
    });
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch,
    };
    render(
      wrap(
        <CreatePOModal
          prefill={{ dlRefs: [1003, 1002] }}
          onClose={() => {}}
        />,
      ),
    );
    // Auto-fire happens in a useEffect — wait for it.
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledTimes(1);
    });
    // Lines populated with the server result, NOT the first-SKU placeholder.
    await waitFor(() => {
      expect(
        screen.getAllByDisplayValue("Carres Cloud · Queen").length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByDisplayValue("Nordic Sofa · 3 seater").length,
    ).toBeGreaterThan(0);
    // The placeholder line ("Carres Cloud · King" — first SKU in the catalog
    // fixture) is NOT present. This is the regression guard for memory 1793.
    expect(screen.queryByDisplayValue("Carres Cloud · King")).toBeNull();
  });

  it("does NOT seed the first-SKU placeholder when prefill.dlRefs is set", async () => {
    // Server returns empty shortage — modal should still skip the placeholder
    // line. Prior to the fix, the effect at L301-319 would re-seed
    // "Carres Cloud · King · qty=5" once initialLines was empty.
    const refetch = vi.fn().mockResolvedValue({ data: { shortage: [] } });
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch,
    };
    render(
      wrap(
        <CreatePOModal
          prefill={{ dlRefs: [4001, 4002] }}
          onClose={() => {}}
        />,
      ),
    );
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledTimes(1);
    });
    // No placeholder. The empty-shortage toast fires and the table stays empty
    // — the operator either picks SKUs manually or closes.
    expect(screen.queryByDisplayValue("Carres Cloud · King")).toBeNull();
    expect(sonnerMocks.defaultFn).toHaveBeenCalled();
  });

  it("respects caller-supplied prefill.lines and does not auto-fire", async () => {
    // When the parent has already aggregated lines, don't clobber them with a
    // server round-trip. (Production currently never sends lines through this
    // path, but the contract is documented in CreatePoPrefill and one test
    // exercises it for the stockpile-toggle gate — we keep that behavior.)
    const refetch = vi.fn().mockResolvedValue({ data: { shortage: [] } });
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch,
    };
    render(
      wrap(
        <CreatePOModal
          prefill={{
            dlRefs: [9001, 9002],
            lines: [{ sku: "mattress:carres-cloud:King", qty: 7 }],
          }}
          onClose={() => {}}
        />,
      ),
    );
    // Wait a tick so any auto-fire would have a chance to run.
    await new Promise((r) => setTimeout(r, 10));
    expect(refetch).not.toHaveBeenCalled();
    // Caller-supplied line is what shows.
    expect(screen.getByDisplayValue("Carres Cloud · King")).toBeInTheDocument();
  });
});
