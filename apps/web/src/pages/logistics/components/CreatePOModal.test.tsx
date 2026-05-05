import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CreatePOModal from "./CreatePOModal";
import type { CatalogResponse } from "@carres/shared";
import type {
  DeliveryPartnersListResponse,
  SuppliersListResponse,
  WarehouseListResponse,
} from "@/lib/queries";

/**
 * CreatePOModal — focused tests for v3-S4.5 Stockpile PO mode.
 *
 * The bulk of CreatePOModal coverage lives in LogisticsProcurement.test.tsx
 * (auto-fill, supplier groups, batch RPC, etc.). This file isolates the new
 * stockpile-mode toggle so the behavior contract is asserted independently
 * of the parent page wiring.
 *
 * Stockpile PO = a PO with no `dl` / `dlRefs` — pure inventory replenishment
 * ahead of customer demand. v3 spec §17.1 A3 promotes this from an audit-trail
 * edge case to a 1st-class flow with explicit UI.
 */

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

const WAREHOUSE_KL = {
  id: "22222222-2222-2222-2222-000000000001",
  name: "KL Warehouse",
  address: "Subang Jaya",
};

const PARTNER_A = {
  id: "33333333-3333-3333-3333-000000000001",
  name: "GD Express",
  contact: "+60 3-9999 9999",
  zones: "Klang Valley",
};

function setLoaded() {
  suppliersHookState = { data: { suppliers: [SUPPLIER_A] } };
  warehouseHookState = {
    data: {
      warehouses: [WAREHOUSE_KL],
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
      models: [],
      skus: [
        {
          id: "s1",
          modelId: "m1",
          sku: "mattress:carres-cloud:King",
          variant: "Carres Cloud · King",
          variantKind: "size",
          price: 3500,
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
  setLoaded();
});

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
      lines: { sku: string; qty: number }[];
      dl?: number | null;
      dlRefs?: number[] | null;
    };
    expect(callArg.supplierId).toBe(SUPPLIER_A.id);
    expect(callArg.warehouseId).toBe(WAREHOUSE_KL.id);
    expect(callArg.lines.length).toBeGreaterThan(0);
    // The contract: stockpile mode forces dl/dlRefs out of the payload.
    // Either omitted or explicitly null is acceptable per the API zod
    // (dl/dlRefs are .optional()), but neither must carry a value.
    expect(callArg.dl ?? null).toBeNull();
    expect(callArg.dlRefs ?? null).toBeNull();
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

    // Pick warehouse — now the form is valid even though dl is unset.
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    expect(issueBtn).not.toBeDisabled();
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
    catalogHookState = {
      data: {
        models: [],
        skus: [
          ...(catalogHookState.data?.skus ?? []),
          ...extra.map((e) => ({
            ...e,
            variantKind: "size" as const,
            price: 0,
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
});
