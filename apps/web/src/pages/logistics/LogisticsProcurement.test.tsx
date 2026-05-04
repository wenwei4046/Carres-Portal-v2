import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LogisticsProcurement from "./LogisticsProcurement";
import CreatePOModal from "./components/CreatePOModal";
import { ApiError } from "@/lib/api";
import type { CatalogResponse } from "@carres/shared";
import type {
  DeliveryPartnersListResponse,
  LogisticsPosListResponse,
  LogisticsPoListRow,
  SuppliersListResponse,
  WarehouseListResponse,
} from "@/lib/queries";

// C5.3 — mock sonner so the auto-fill failure path can assert which toast
// variant fires. The default `toast(...)` call is the empty-state notice;
// `toast.error(...)` is the failure notice. The bug we fixed silently routed
// failures through the empty-state branch, so the test must distinguish them.
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

/**
 * LogisticsProcurement page + 4 modals — covers the M5 Task 3 plan list
 * (~12 tests).
 *
 * Same vi.mock(@/lib/queries) pattern as LogisticsOrders.test.tsx — each test
 * sets the mocked hook return states before rendering. Mutations resolve to
 * empty payloads; modal-specific submit behavior is exercised via the same
 * suite (CreatePOModal validation + ReceivePOModal per-line + AssignPickup
 * partner select).
 */

let posHookState: {
  data: LogisticsPosListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
};
let suppliersHookState: { data: SuppliersListResponse | undefined };
let warehouseHookState: { data: WarehouseListResponse | undefined };
let partnersHookState: { data: DeliveryPartnersListResponse | undefined };
let catalogHookState: { data: CatalogResponse | undefined };
// C5.3 — auto-fill hook state. `refetch` is a vi.fn so each test can program
// what the click resolves to (success / empty / error). isFetching/isFetched
// drive the button's disabled + label states. isError is optional so tests
// that don't exercise the failure path can keep their existing setup; the
// failure-path test sets it true to verify the disabled-state guard.
let shortageHookState: {
  data: { shortage: { sku: string; need: number; available: number; shortage: number }[] } | undefined;
  isFetching: boolean;
  isFetched: boolean;
  isError?: boolean;
  refetch: ReturnType<typeof vi.fn>;
};
const refetchSpy = vi.fn();
const createMutateAsync = vi.fn().mockResolvedValue({});
const createBatchMutateAsync = vi.fn().mockResolvedValue({ poIds: [] });
const receiveMutateAsync = vi.fn().mockResolvedValue({});
const assignPickupMutateAsync = vi.fn().mockResolvedValue({});
const reassignMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useLogisticsPos: () => posHookState,
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
    useReceivePoLineMutation: () => ({
      mutateAsync: receiveMutateAsync,
      isPending: false,
    }),
    useAssignPickupPartnerMutation: () => ({
      mutateAsync: assignPickupMutateAsync,
      isPending: false,
    }),
    useReassignPoWarehouseMutation: () => ({
      mutateAsync: reassignMutateAsync,
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

function makePo(overrides: Partial<LogisticsPoListRow> = {}): LogisticsPoListRow {
  return {
    id: "PO-2031",
    supplier_id: SUPPLIER_A.id,
    warehouse_id: WAREHOUSE_KL.id,
    status: "open",
    sup_status: "pending",
    dl: 1234,
    dl_refs: null,
    eta_date: "2026-05-15",
    placed_at: "2026-05-01T00:00:00Z",
    purchase_order_lines: [
      { sku: "mattress:carres-cloud:King", qty: 5, received_qty: 0 },
    ],
    ...overrides,
  };
}

function setLoaded(pos: LogisticsPoListRow[]) {
  posHookState = {
    data: { pos },
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchSpy,
  };
  suppliersHookState = {
    data: { suppliers: [SUPPLIER_A, SUPPLIER_B] },
  };
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
        {
          id: "s2",
          modelId: "m2",
          sku: "sofa:nordic:3s",
          variant: "Nordic Sofa · 3 seater",
          variantKind: "preset",
          price: 4500,
        },
        {
          id: "s3",
          modelId: "m1",
          sku: "mattress:carres-cloud:Queen",
          variant: "Carres Cloud · Queen",
          variantKind: "size",
          price: 3000,
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
  createMutateAsync.mockClear();
  createBatchMutateAsync.mockClear();
  receiveMutateAsync.mockClear();
  assignPickupMutateAsync.mockClear();
  reassignMutateAsync.mockClear();
  sonnerMocks.success.mockClear();
  sonnerMocks.error.mockClear();
  sonnerMocks.defaultFn.mockClear();
});

describe("LogisticsProcurement page", () => {
  it("1. renders the PO list table with rows", () => {
    setLoaded([
      makePo({ id: "PO-2031" }),
      makePo({ id: "PO-2032", supplier_id: SUPPLIER_B.id }),
    ]);
    render(wrap(<LogisticsProcurement />));
    expect(screen.getByTestId("po-list-table")).toBeInTheDocument();
    expect(screen.getByTestId("po-row-PO-2031")).toBeInTheDocument();
    expect(screen.getByTestId("po-row-PO-2032")).toBeInTheDocument();
  });

  it("2. status filter chips narrow visible rows", () => {
    setLoaded([
      makePo({ id: "PO-2031", status: "open" }),
      makePo({ id: "PO-2032", status: "received" }),
    ]);
    render(wrap(<LogisticsProcurement />));
    // Default filter is `open`
    expect(screen.getByTestId("po-row-PO-2031")).toBeInTheDocument();
    expect(screen.queryByTestId("po-row-PO-2032")).not.toBeInTheDocument();

    // Switch to "Received"
    fireEvent.click(screen.getByRole("tab", { name: /Received · 1/ }));
    expect(screen.queryByTestId("po-row-PO-2031")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-row-PO-2032")).toBeInTheDocument();

    // Switch to All
    fireEvent.click(screen.getByRole("tab", { name: /^All · 2/ }));
    expect(screen.getByTestId("po-row-PO-2031")).toBeInTheDocument();
    expect(screen.getByTestId("po-row-PO-2032")).toBeInTheDocument();
  });

  it("3. clicking '+ New PO' opens CreatePOModal", () => {
    setLoaded([makePo()]);
    render(wrap(<LogisticsProcurement />));
    expect(screen.queryByText(/New purchase order/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("new-po-button"));
    expect(screen.getByText(/New purchase order/)).toBeInTheDocument();
    expect(screen.getByTestId("po-lines-table")).toBeInTheDocument();
  });

  it("4. CreatePOModal disables 'Issue PO' when no warehouse picked", () => {
    setLoaded([]);
    // Empty warehouses
    warehouseHookState = {
      data: { warehouses: [], byWarehouse: {}, totalsBySku: {} },
    };
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).toBeDisabled();
  });

  it("5. CreatePOModal submit calls useCreatePoMutation per supplier group", async () => {
    setLoaded([]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
    // Default first SKU is `mattress:carres-cloud:King` which maps to SUPPLIER_A.
    // C5.2 — warehouse defaults blank per supplier group, so the button is
    // disabled until the user picks one. Pick KL for SUPPLIER_A then submit.
    const issueBtn = screen.getByRole("button", { name: /Issue PO/ });
    expect(issueBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    expect(issueBtn).not.toBeDisabled();
    fireEvent.click(issueBtn);
    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(1);
    });
    const callArg = createMutateAsync.mock.calls[0][0] as {
      supplierId: string;
      warehouseId: string;
      lines: { sku: string; qty: number }[];
    };
    expect(callArg.supplierId).toBe(SUPPLIER_A.id);
    expect(callArg.warehouseId).toBe(WAREHOUSE_KL.id);
    expect(callArg.lines.length).toBeGreaterThan(0);
  });

  it("6. clicking 'Receive →' on a delivered PO opens ReceivePOModal", () => {
    setLoaded([
      makePo({
        id: "PO-2050",
        sup_status: "delivered",
        purchase_order_lines: [
          { sku: "sofa:nordic:3s", qty: 3, received_qty: 0 },
        ],
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    // The default 'open' filter matches non-received, non-cancelled status ✔
    fireEvent.click(screen.getByTestId("receive-po-PO-2050"));
    expect(screen.getByText(/Receive PO-2050/)).toBeInTheDocument();
    expect(screen.getByTestId("receive-po-lines-table")).toBeInTheDocument();
  });

  it("7. ReceivePOModal 'Receive all pending' presets each line qty to its pending value", () => {
    setLoaded([
      makePo({
        id: "PO-2050",
        sup_status: "delivered",
        purchase_order_lines: [
          { sku: "sofa:nordic:3s", qty: 3, received_qty: 1 },
        ],
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("receive-po-PO-2050"));
    // Pending = 3 - 1 = 2
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(screen.getByText(/Σ 0 units this DO/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Receive all pending/ }));
    expect(screen.getByText(/Σ 2 units this DO/)).toBeInTheDocument();
  });

  it("8. ReceivePOModal submit loops one mutation call per ticked line", async () => {
    setLoaded([
      makePo({
        id: "PO-2051",
        sup_status: "delivered",
        purchase_order_lines: [
          { sku: "sofa:nordic:3s", qty: 2, received_qty: 0 },
          { sku: "mattress:carres-cloud:King", qty: 1, received_qty: 0 },
        ],
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("receive-po-PO-2051"));
    // Tick the signed checkbox (DO# is auto-suggested already)
    const signedLabel = screen.getByText(
      /Goods inspected and DO signed by warehouse/,
    );
    fireEvent.click(signedLabel.previousSibling as Element);
    fireEvent.click(screen.getByRole("button", { name: /Mark received/ }));
    await waitFor(() => {
      expect(receiveMutateAsync).toHaveBeenCalledTimes(2);
    });
  });

  it("9. clicking 'Assign partner' on a ready_for_pickup PO opens AssignPickupDialog", () => {
    setLoaded([
      makePo({
        id: "PO-2060",
        sup_status: "ready_for_pickup",
        supplier_id: SUPPLIER_B.id,
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("assign-pickup-PO-2060"));
    expect(
      screen.getByText(/Assign pickup partner · PO-2060/),
    ).toBeInTheDocument();
  });

  it("10. AssignPickupDialog submit fires the assign-pickup mutation", async () => {
    setLoaded([
      makePo({
        id: "PO-2061",
        sup_status: "ready_for_pickup",
        supplier_id: SUPPLIER_B.id,
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("assign-pickup-PO-2061"));
    // Two buttons named "Assign partner": the row CTA and the modal's primary.
    // The modal-rendered one is inside [role=dialog]; pick that one.
    const dialog = screen.getByRole("dialog");
    const modalAssignBtn = Array.from(
      dialog.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.trim() === "Assign partner");
    expect(modalAssignBtn).toBeDefined();
    fireEvent.click(modalAssignBtn!);
    await waitFor(() => {
      expect(assignPickupMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(assignPickupMutateAsync.mock.calls[0][0]).toEqual({
      partnerId: PARTNER_A.id,
    });
  });

  it("11. loading state renders the procurement-skeleton", () => {
    posHookState = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchSpy,
    };
    suppliersHookState = { data: { suppliers: [] } };
    warehouseHookState = {
      data: { warehouses: [], byWarehouse: {}, totalsBySku: {} },
    };
    partnersHookState = { data: { partners: [] } };
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch: vi.fn(),
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
    render(wrap(<LogisticsProcurement />));
    expect(screen.getByTestId("procurement-skeleton")).toBeInTheDocument();
  });

  it("12. error state renders Retry button which calls refetch", () => {
    posHookState = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: refetchSpy,
    };
    suppliersHookState = { data: { suppliers: [] } };
    warehouseHookState = {
      data: { warehouses: [], byWarehouse: {}, totalsBySku: {} },
    };
    partnersHookState = { data: { partners: [] } };
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch: vi.fn(),
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
    render(wrap(<LogisticsProcurement />));
    expect(screen.getByText(/Couldn.+t load purchase orders/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });

  it("13. CreatePOModal warns when 2 suppliers match → auto-split notice", () => {
    setLoaded([]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
    // Add a second SKU mapped to SUPPLIER_B (sofa:...)
    fireEvent.click(screen.getByRole("button", { name: /\+ Add SKU/ }));
    const skuSelects = screen.getAllByLabelText(/Line \d+ SKU/);
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

  it("14. focus-trap: pressing Esc closes the CreatePOModal", () => {
    setLoaded([]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
    expect(screen.getByText(/New purchase order/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(/New purchase order/)).not.toBeInTheDocument();
  });

  // ---- C5.1 — PoDetailModal (read-only PO detail + Print PO) ----

  it("15. clicking a PO row opens PoDetailModal with the PO data", () => {
    setLoaded([
      makePo({
        id: "PO-2070",
        supplier_id: SUPPLIER_A.id,
        warehouse_id: WAREHOUSE_KL.id,
        eta_date: "2026-06-01",
        purchase_order_lines: [
          { sku: "mattress:carres-cloud:King", qty: 5, received_qty: 2 },
        ],
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-row-PO-2070"));
    expect(screen.getByTestId("po-detail-modal")).toBeInTheDocument();
    // Header shows the short PO id (first 8 chars of "PO-2070").
    expect(
      screen.getByText(`#PO-${"PO-2070".slice(0, 8)}`),
    ).toBeInTheDocument();
    // Supplier + warehouse + eta from the row appear in the KV grid.
    const modal = screen.getByTestId("po-detail-modal");
    expect(modal.textContent).toContain("Carres Manufacturing");
    expect(modal.textContent).toContain("KL Warehouse");
    expect(modal.textContent).toContain("2026-06-01");
    // Line table rendered with friendly SKU label.
    expect(screen.getByTestId("po-detail-line-0")).toBeInTheDocument();
    expect(modal.textContent).toContain("Carres Cloud · King");
  });

  it("16. clicking 'Assign partner' button does NOT open PoDetailModal (stopPropagation)", () => {
    setLoaded([
      makePo({
        id: "PO-2071",
        sup_status: "ready_for_pickup",
        supplier_id: SUPPLIER_B.id,
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("assign-pickup-PO-2071"));
    // The AssignPickupDialog opens
    expect(
      screen.getByText(/Assign pickup partner · PO-2071/),
    ).toBeInTheDocument();
    // But the read-only PoDetailModal does NOT
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
  });

  it("17. clicking 'Receive →' button does NOT open PoDetailModal (stopPropagation)", () => {
    setLoaded([
      makePo({
        id: "PO-2072",
        sup_status: "delivered",
        purchase_order_lines: [
          { sku: "sofa:nordic:3s", qty: 3, received_qty: 0 },
        ],
      }),
    ]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("receive-po-PO-2072"));
    expect(screen.getByText(/Receive PO-2072/)).toBeInTheDocument();
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
  });

  it("18. PoDetailModal Close button dismisses the modal", () => {
    setLoaded([makePo({ id: "PO-2073" })]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("po-row-PO-2073"));
    expect(screen.getByTestId("po-detail-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-detail-close-button"));
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
  });

  it("19. PoDetailModal Print button calls fetch with /print URL + Bearer JWT", async () => {
    setLoaded([makePo({ id: "PO-2074" })]);
    // Stub fetch to return a tiny PDF blob.
    const blob = new Blob(["%PDF-1.4 fake"], { type: "application/pdf" });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(blob, { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    // Stub the auth store so we get a known token in the Authorization header.
    const authMod = await import("@/lib/auth");
    const getStateSpy = vi.spyOn(authMod.useAuth, "getState").mockReturnValue({
      session: { access_token: "fake-jwt", refresh_token: "r", expires_at: 0, user: null },
      user: null,
      role: null,
      bootstrap: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      resetPassword: vi.fn(),
    } as unknown as ReturnType<typeof authMod.useAuth.getState>);
    // Stub window.open + URL.createObjectURL/revokeObjectURL so the test
    // doesn't try to actually navigate. JSDOM doesn't ship these, so we
    // assign them directly instead of using vi.spyOn (which fails on missing
    // properties).
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({} as Window);
    const originalCreate = (URL as unknown as { createObjectURL?: unknown })
      .createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: unknown })
      .revokeObjectURL;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      vi.fn().mockReturnValue("blob:fake");
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      vi.fn();

    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("po-row-PO-2074"));
    fireEvent.click(screen.getByTestId("po-detail-print-button"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/logistics\/pos\/PO-2074\/print$/);
    const headers = (init?.headers as Headers) ?? new Headers();
    expect(headers.get("Authorization")).toBe("Bearer fake-jwt");
    // Modal opened the blob in a new tab (popup not blocked in test env).
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "blob:fake",
        "_blank",
        "noopener,noreferrer",
      );
    });

    fetchSpy.mockRestore();
    getStateSpy.mockRestore();
    openSpy.mockRestore();
    if (originalCreate === undefined) {
      delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
    } else {
      (URL as unknown as { createObjectURL: unknown }).createObjectURL =
        originalCreate;
    }
    if (originalRevoke === undefined) {
      delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    } else {
      (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL =
        originalRevoke;
    }
  });

  // ---- C5.3 — Auto-fill from awaiting stock button ----

  it("20. auto-fill button is visible in CreatePOModal when no prefill.dl and no prefill.dlRefs", () => {
    setLoaded([]);
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
    expect(
      screen.getByTestId("auto-fill-shortage-button"),
    ).toBeInTheDocument();
  });

  it("21. auto-fill button is HIDDEN when prefill.dl is set (single-order shortage flow)", () => {
    setLoaded([]);
    // Render the modal directly with a prefill.dl. The page only opens with
    // empty prefill, so this is the cleanest way to exercise the visibility
    // guard without forking the page's state machine for tests.
    render(wrap(<CreatePOModal prefill={{ dl: 1234 }} onClose={() => {}} />));
    expect(
      screen.queryByTestId("auto-fill-shortage-button"),
    ).not.toBeInTheDocument();
  });

  it("22. auto-fill button is HIDDEN when prefill.dlRefs is non-empty (bundle flow)", () => {
    setLoaded([]);
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

  it("23. clicking auto-fill triggers refetch and replaces lines (override behavior)", async () => {
    setLoaded([]);
    const refetch = vi.fn().mockResolvedValue({
      data: {
        shortage: [
          { sku: "sofa:nordic:3s", need: 5, available: 1, shortage: 4 },
          { sku: "mattress:carres-cloud:Queen", need: 3, available: 0, shortage: 3 },
        ],
      },
    });
    shortageHookState = {
      data: undefined,
      isFetching: false,
      isFetched: false,
      refetch,
    };
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
    // Modal default seeds first line with first SKU = "mattress:carres-cloud:King".
    expect(screen.getByDisplayValue("Carres Cloud · King")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("auto-fill-shortage-button"));
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledTimes(1);
    });
    // Override behavior — the previous default King line is gone, replaced by
    // the two SKUs returned from the server (Queen + Nordic). Verified via the
    // SKU labels rendered in the lines table.
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

  it("24. empty shortage result disables the button + shows the empty label", async () => {
    setLoaded([]);
    const refetch = vi.fn().mockResolvedValue({ data: { shortage: [] } });
    // Simulate the post-fetch state: isFetched=true, data is empty.
    shortageHookState = {
      data: { shortage: [] },
      isFetching: false,
      isFetched: true,
      refetch,
    };
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
    const btn = screen.getByTestId("auto-fill-shortage-button");
    expect(btn).toBeDisabled();
    expect(btn.textContent ?? "").toMatch(/No shortages/i);
  });

  it("25. auto-fill across 2 suppliers → user picks per-PO warehouse for each → batch RPC fires (5.3 → 5.2 chain)", async () => {
    setLoaded([]);
    // Program refetch with two SKUs whose categories map to two different
    // suppliers (mattress → SUPPLIER_A, sofa → SUPPLIER_B). After click the
    // modal must render BOTH supplier-group cards, accept a warehouse pick
    // for each, and submit via the batch RPC (NOT the single-PO RPC).
    const refetch = vi.fn().mockResolvedValue({
      data: {
        shortage: [
          { sku: "mattress:carres-cloud:King", need: 5, available: 0, shortage: 5 },
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
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
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
    // Issue button gates on per-supplier warehouse picks (Q4=A).
    const issueBtn = screen.getByRole("button", { name: /Issue 2 POs/ });
    expect(issueBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_A.id}`), {
      target: { value: WAREHOUSE_KL.id },
    });
    fireEvent.change(screen.getByTestId(`po-warehouse-${SUPPLIER_B.id}`), {
      target: { value: WAREHOUSE_PG.id },
    });
    expect(issueBtn).not.toBeDisabled();
    fireEvent.click(issueBtn);
    // Batch RPC fires (NOT the single-PO RPC) — atomic 2-PO commit.
    await waitFor(() => {
      expect(createBatchMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(createMutateAsync).not.toHaveBeenCalled();
    const callArg = createBatchMutateAsync.mock.calls[0][0] as {
      pos: { supplierId: string; warehouseId: string; lines: { sku: string; qty: number }[] }[];
    };
    expect(callArg.pos).toHaveLength(2);
    const aGroup = callArg.pos.find((p) => p.supplierId === SUPPLIER_A.id);
    const bGroup = callArg.pos.find((p) => p.supplierId === SUPPLIER_B.id);
    expect(aGroup?.warehouseId).toBe(WAREHOUSE_KL.id);
    expect(bGroup?.warehouseId).toBe(WAREHOUSE_PG.id);
    expect(aGroup?.lines).toEqual([
      { sku: "mattress:carres-cloud:King", qty: 5 },
    ]);
    expect(bGroup?.lines).toEqual([{ sku: "sofa:nordic:3s", qty: 3 }]);
  });

  it("26. auto-fill failure surfaces toast.error and does NOT show the misleading 'No shortages' notice", async () => {
    setLoaded([]);
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
    render(wrap(<LogisticsProcurement />));
    fireEvent.click(screen.getByTestId("new-po-button"));
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
