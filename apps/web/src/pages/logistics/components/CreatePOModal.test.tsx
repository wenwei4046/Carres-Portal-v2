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
