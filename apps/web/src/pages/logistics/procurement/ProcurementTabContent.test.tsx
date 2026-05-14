import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import ProcurementTabContent from "./ProcurementTabContent";
import type { CatalogResponse } from "@carres/shared";
import type {
  DeliveryPartnersListResponse,
  LogisticsPoListRow,
  LogisticsPosListResponse,
  SuppliersListResponse,
  WarehouseListResponse,
} from "@/lib/queries";

/**
 * ProcurementTabContent — channel-agnostic shared UI behavior.
 *
 * Phase 4.5 Chunk 2 Sprint F Task 36 — split out from the legacy
 * `LogisticsProcurement.test.tsx`. Per-channel behavior (Sofa pickup-flight
 * branches, Mattress catch-all) lives in the per-tab test files; this file
 * holds the assertions that hold the same regardless of which slug we pick.
 *
 * The default slug is `nice-future` (Mattress) because its catch-all "Receive"
 * branch is the simplest happy path. Tests that need a different sup_status
 * (`ready_for_pickup`, etc.) seed that on the PO directly — the `slug` choice
 * doesn't change those assertions because `ProcurementTabContent` ignores the
 * slug beyond passing it to `useProcurementTab`.
 */

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      })),
    },
  },
}));
import { apiFetch } from "@/lib/api";

let tabHookState: {
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
const refetchSpy = vi.fn();
const receiveMutateAsync = vi.fn().mockResolvedValue({});
const assignPickupMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useProcurementTab: () => tabHookState,
    useLogisticsSuppliers: () => suppliersHookState,
    useLogisticsWarehouse: () => warehouseHookState,
    useDeliveryPartners: () => partnersHookState,
    useCatalog: () => catalogHookState,
    useReceivePoWithDoMutation: () => ({
      mutateAsync: receiveMutateAsync,
      isPending: false,
    }),
    useAssignPickupPartnerMutation: () => ({
      mutateAsync: assignPickupMutateAsync,
      isPending: false,
    }),
  };
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/logistics/procurement/nice-future"]}>
        {node}
      </MemoryRouter>
    </QueryClientProvider>
  );
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
      {
        // 0076: line UUID — required by ReceivePOModal recv-state keying.
        id: "11111111-1111-4111-8111-111111111111",
        sku: "mattress:carres-cloud:King",
        qty: 5,
        received_qty: 0,
      },
    ],
    ...overrides,
  };
}

function setLoaded(pos: LogisticsPoListRow[]) {
  tabHookState = {
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
          cost: null,
        },
        {
          id: "s2",
          modelId: "m2",
          sku: "sofa:nordic:3s",
          variant: "Nordic Sofa · 3 seater",
          variantKind: "preset",
          price: 4500,
          cost: null,
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
  receiveMutateAsync.mockClear();
  assignPickupMutateAsync.mockClear();
  vi.mocked(apiFetch).mockReset();
  // 2026-05-15 (Task 12): ReceivePOModal fires
  // GET /api/logistics/pos/:poId/threads for own_logistics suppliers. Any
  // test that opens the modal would trigger an `undefined` query result
  // (the default vi.fn()) and React Query complains about undefined data.
  // Install a quiet default that returns `[]` for threads calls so the
  // per-thread section auto-hides; tests that drive the real receive flow
  // override this with their own mockImplementation.
  vi.mocked(apiFetch).mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/threads")) {
      return Promise.resolve([]) as ReturnType<typeof apiFetch>;
    }
    return Promise.resolve(undefined) as ReturnType<typeof apiFetch>;
  });
});

describe("ProcurementTabContent — list rendering + filter chips", () => {
  it("renders the PO list table with rows", () => {
    setLoaded([
      makePo({ id: "PO-2031" }),
      makePo({ id: "PO-2032", supplier_id: SUPPLIER_B.id }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    expect(screen.getByTestId("po-list-table-nice-future")).toBeInTheDocument();
    expect(screen.getByTestId("po-row-PO-2031")).toBeInTheDocument();
    expect(screen.getByTestId("po-row-PO-2032")).toBeInTheDocument();
  });

  // 2026-05-10 (Loo): regression — "Pickup action" used to count POs whose
  // status had already flipped to 'received' but kept sup_status='delivered'.
  // Same PO surfaced in both "Pickup action" and "Received" tabs, doubling
  // the perceived workload. needsPickup() now gates on status !== 'received'.
  it("Pickup action chip excludes already-received POs (sup_status=delivered + status=received)", () => {
    setLoaded([
      // Already received via warehouse — sup_status stays 'delivered' but
      // status flipped to 'received'. Belongs in Received only.
      makePo({ id: "PO-2080", status: "received", sup_status: "delivered" }),
      // Genuinely awaiting logistics action — partner just delivered to wh
      // but logistics hasn't pressed Receive yet.
      makePo({ id: "PO-2081", status: "open", sup_status: "delivered" }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    // Count chip shows 1, not 2.
    expect(
      screen.getByRole("tab", { name: /Pickup action · 1/ }),
    ).toBeInTheDocument();
    // Filter rows to Pickup action — only the still-open PO surfaces.
    fireEvent.click(screen.getByRole("tab", { name: /Pickup action · 1/ }));
    expect(screen.queryByTestId("po-row-PO-2080")).not.toBeInTheDocument();
    expect(screen.getByTestId("po-row-PO-2081")).toBeInTheDocument();
  });

  it("status filter chips narrow visible rows", () => {
    setLoaded([
      makePo({ id: "PO-2031", status: "open" }),
      makePo({ id: "PO-2032", status: "received" }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
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

  it("loading state renders the per-tab loading skeleton", () => {
    tabHookState = {
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
    catalogHookState = {
      data: {
        models: [],
        skus: [],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    };
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    expect(
      screen.getByTestId("procurement-tab-loading-nice-future"),
    ).toBeInTheDocument();
  });

  it("error state renders Retry button which calls refetch", () => {
    tabHookState = {
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
    catalogHookState = {
      data: {
        models: [],
        skus: [],
        sofaFabrics: [],
        addons: [],
        floorConfig: { id: 1, freeUpToFloor: 2, perFloorPerItem: 50 },
      },
    };
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    expect(
      screen.getByText(/Couldn.+t load purchase orders/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ProcurementTabContent — Receive button + ReceivePOModal", () => {
  it("clicking 'Receive →' opens ReceivePOModal", () => {
    setLoaded([
      makePo({
        id: "PO-2050",
        sup_status: "delivered",
        purchase_order_lines: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            sku: "sofa:nordic:3s",
            qty: 3,
            received_qty: 0,
          },
        ],
      }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    fireEvent.click(screen.getByTestId("receive-po-PO-2050"));
    expect(screen.getByText(/Receive PO-2050/)).toBeInTheDocument();
    expect(screen.getByTestId("receive-po-lines-table")).toBeInTheDocument();
  });

  it("ReceivePOModal 'Receive all pending' presets each line qty to its pending value", () => {
    setLoaded([
      makePo({
        id: "PO-2050",
        sup_status: "delivered",
        purchase_order_lines: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            sku: "sofa:nordic:3s",
            qty: 3,
            received_qty: 1,
          },
        ],
      }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    fireEvent.click(screen.getByTestId("receive-po-PO-2050"));
    // Pending = 3 - 1 = 2
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    expect(screen.getByText(/Σ 0 units this DO/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Receive all pending/ }));
    expect(screen.getByText(/Σ 2 units this DO/)).toBeInTheDocument();
  });

  it("ReceivePOModal submit fires one batched mutation call carrying every ticked line", async () => {
    setLoaded([
      makePo({
        id: "PO-2051",
        sup_status: "delivered",
        purchase_order_lines: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            sku: "sofa:nordic:3s",
            qty: 2,
            received_qty: 0,
          },
          {
            id: "77777777-7777-4777-8777-777777777777",
            sku: "mattress:carres-cloud:King",
            qty: 1,
            received_qty: 0,
          },
        ],
      }),
    ]);
    // Drive the DO upload deterministically by mocking sign-upload.
    // 2026-05-15 (Task 12): ReceivePOModal also fetches per-thread state for
    // own_logistics suppliers via GET /api/logistics/pos/:poId/threads — that
    // hook hits the same apiFetch mock. Route by URL so the threads call gets
    // an empty array (the per-thread section then auto-hides on length === 0)
    // and the upload call gets the { token, path } pair it needs.
    vi.mocked(apiFetch).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/threads")) {
        return Promise.resolve([]) as ReturnType<typeof apiFetch>;
      }
      return Promise.resolve({
        token: "sign-tok",
        path: "PO-2051/abc-DO-1.pdf",
      }) as ReturnType<typeof apiFetch>;
    });
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    fireEvent.click(screen.getByTestId("receive-po-PO-2051"));
    // Tick the signed checkbox (DO# is auto-suggested already)
    const signedLabel = screen.getByText(
      /Goods inspected and DO signed by warehouse/,
    );
    fireEvent.click(signedLabel.previousSibling as Element);
    // Upload a valid PDF — populates doFilePath state and unblocks Submit.
    const file = new File(["%PDF-1.4"], "do.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText(/^do file$/i), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Mark received/ }),
      ).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Mark received/ }));
    await waitFor(() => {
      expect(receiveMutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = receiveMutateAsync.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      doFilePath: "PO-2051/abc-DO-1.pdf",
      // 0076: payload keys by line UUID `id` (not sku) — see ReceivePOModal
      // submit() comments and packages/shared receivePoWithDoInput schema.
      lines: expect.arrayContaining([
        { id: "66666666-6666-4666-8666-666666666666", receivedQty: 2 },
        { id: "77777777-7777-4777-8777-777777777777", receivedQty: 1 },
      ]),
    });
    expect(payload.doNumber).toMatch(/^DO-\d+/);
  });

  // v3-S2.2 catch-all — every non-pickup-flight sup_status renders the
  // catch-all "Receive →" button. Consolidates 4 single-state guards into one
  // parametrized assertion (was tests 27/28/29/30 in the legacy file).
  it.each([
    ["in_production", "PO-3001"],
    ["acknowledged", "PO-3002"],
    ["pending", "PO-3003"],
    ["delivered", "PO-3004"],
  ])(
    "v3-S2.2 catch-all: shows Receive button when sup_status is %s",
    (supStatus, poId) => {
      setLoaded([
        makePo({
          id: poId,
          sup_status: supStatus as LogisticsPoListRow["sup_status"],
        }),
      ]);
      render(wrap(<ProcurementTabContent slug="nice-future" />));
      expect(screen.getByTestId(`receive-po-${poId}`)).toBeInTheDocument();
    },
  );

  // 2026-05-11 (Loo): Direct-Receive escape hatch. The receive RPC is
  // status='open'-gated, NOT sup_status-gated, so DO-from-supplier or
  // DO-from-warehouse-direct flows shouldn't have to wait for the partner
  // pickup state machine. Every non-terminal stage now exposes
  // `receive-po-{id}` as either the primary button or a "Direct receive"
  // text-link.
  it.each([
    ["ready_confirm_sent", "PO-4001"],
    ["ready_for_pickup", "PO-4002"],
    ["pickup_assigned", "PO-4003"],
    ["pickup_accepted", "PO-4004"],
    ["picked_up", "PO-4005"],
  ])(
    "Direct-receive link present at sup_status=%s (non-terminal stages)",
    (supStatus, poId) => {
      setLoaded([
        makePo({
          id: poId,
          sup_status: supStatus as LogisticsPoListRow["sup_status"],
        }),
      ]);
      render(wrap(<ProcurementTabContent slug="nice-future" />));
      expect(screen.getByTestId(`receive-po-${poId}`)).toBeInTheDocument();
    },
  );

  // Sanity: terminal states still don't expose Receive at all.
  it.each([
    ["received-status", "PO-4010", "open" /* sup_status */, "received" /* status */],
    ["cancelled-status", "PO-4011", "ready_for_pickup", "cancelled"],
  ])(
    "no Receive button when %s",
    (_label, poId, supStatus, status) => {
      setLoaded([
        makePo({
          id: poId,
          sup_status: supStatus as LogisticsPoListRow["sup_status"],
          status: status as LogisticsPoListRow["status"],
        }),
      ]);
      render(wrap(<ProcurementTabContent slug="nice-future" />));
      expect(screen.queryByTestId(`receive-po-${poId}`)).not.toBeInTheDocument();
    },
  );
});

describe("ProcurementTabContent — PoDetailModal (read-only PO detail)", () => {
  it("clicking a PO row opens PoDetailModal with the PO data", () => {
    setLoaded([
      makePo({
        id: "PO-2070",
        supplier_id: SUPPLIER_A.id,
        warehouse_id: WAREHOUSE_KL.id,
        eta_date: "2026-06-01",
        purchase_order_lines: [
          {
            id: "88888888-8888-4888-8888-888888888888",
            sku: "mattress:carres-cloud:King",
            qty: 5,
            received_qty: 2,
          },
        ],
      }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
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

  it("clicking 'Assign partner' button does NOT open PoDetailModal (stopPropagation)", () => {
    setLoaded([
      makePo({
        id: "PO-2071",
        sup_status: "ready_for_pickup",
        supplier_id: SUPPLIER_B.id,
      }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    fireEvent.click(screen.getByTestId("assign-pickup-PO-2071"));
    // The AssignPickupDialog opens
    expect(
      screen.getByText(/Assign pickup partner · PO-2071/),
    ).toBeInTheDocument();
    // But the read-only PoDetailModal does NOT
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
  });

  it("clicking 'Receive →' button does NOT open PoDetailModal (stopPropagation)", () => {
    setLoaded([
      makePo({
        id: "PO-2072",
        sup_status: "delivered",
        purchase_order_lines: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            sku: "sofa:nordic:3s",
            qty: 3,
            received_qty: 0,
          },
        ],
      }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    fireEvent.click(screen.getByTestId("receive-po-PO-2072"));
    expect(screen.getByText(/Receive PO-2072/)).toBeInTheDocument();
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
  });

  it("PoDetailModal Close button dismisses the modal", () => {
    setLoaded([makePo({ id: "PO-2073" })]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    fireEvent.click(screen.getByTestId("po-row-PO-2073"));
    expect(screen.getByTestId("po-detail-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("po-detail-close-button"));
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
  });

  it("PoDetailModal Print button fetches JSON + renders @react-pdf client-side", async () => {
    setLoaded([makePo({ id: "PO-2074" })]);
    // Mock the API JSON fetch + the client-side render.
    const apiMod = await import("@/lib/api");
    const apiFetchSpy = vi
      .spyOn(apiMod, "apiFetch")
      .mockResolvedValue({ po_number: "PO-2074" } as unknown as never);
    const renderMod = await import("@/lib/pdf/render");
    const renderSpy = vi
      .spyOn(renderMod, "renderPoPdf")
      .mockResolvedValue(new Blob(["%PDF-1.4 fake"], { type: "application/pdf" }));
    // Stub window.open + URL.createObjectURL/revokeObjectURL so the test
    // doesn't try to actually navigate.
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const originalCreate = (URL as unknown as { createObjectURL?: unknown })
      .createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: unknown })
      .revokeObjectURL;
    (
      URL as unknown as { createObjectURL: (b: Blob) => string }
    ).createObjectURL = vi.fn().mockReturnValue("blob:fake");
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      vi.fn();

    render(wrap(<ProcurementTabContent slug="nice-future" />));
    fireEvent.click(screen.getByTestId("po-row-PO-2074"));
    fireEvent.click(screen.getByTestId("po-detail-print-button"));

    await waitFor(() => {
      expect(apiFetchSpy).toHaveBeenCalledWith(
        "/api/logistics/pos/PO-2074/print-data",
      );
    });
    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        "blob:fake",
        "_blank",
        "noopener,noreferrer",
      );
    });

    apiFetchSpy.mockRestore();
    renderSpy.mockRestore();
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

  it("v3-S2.3: clicking Receive PO inside PoDetailModal opens ReceivePOModal for same PO", () => {
    setLoaded([
      makePo({
        id: "PO-4001",
        sup_status: "in_production",
        purchase_order_lines: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            sku: "mattress:carres-cloud:King",
            qty: 5,
            received_qty: 0,
          },
        ],
      }),
    ]);
    render(wrap(<ProcurementTabContent slug="nice-future" />));
    // Open the detail modal by clicking the row
    fireEvent.click(screen.getByTestId("po-row-PO-4001"));
    expect(screen.getByTestId("po-detail-modal")).toBeInTheDocument();
    // The Receive button is visible inside the detail modal
    const receiveBtn = screen.getByTestId("po-detail-receive-button");
    expect(receiveBtn).toBeInTheDocument();
    // Click it: detail modal closes, ReceivePOModal opens for the same PO
    fireEvent.click(receiveBtn);
    expect(screen.queryByTestId("po-detail-modal")).not.toBeInTheDocument();
    expect(screen.getByText(/Receive PO-4001/)).toBeInTheDocument();
  });
});
