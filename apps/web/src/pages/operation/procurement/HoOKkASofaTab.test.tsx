import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import HoOKkASofaTab from "./HoOKkASofaTab";
import type { CatalogResponse } from "@carres/shared";
import type {
  DeliveryPartnersListResponse,
  operationPoListRow,
  operationPosListResponse,
  SuppliersListResponse,
  WarehouseListResponse,
} from "@/lib/queries";

/**
 * HoOKkASofaTab — Phase 4.5 Chunk 2 Sprint F Task 34/36.
 *
 * The Sofa tab is the home for sofa-channel behavior:
 *   - factory_pickup pickup-flight states (`ready_for_pickup`,
 *     `pickup_assigned`, `pickup_accepted`, `picked_up`) — these branches
 *     replace the catch-all "Receive →" button with state-specific text or a
 *     "Assign partner" CTA.
 *   - LP Pre-flight 代按 dialog when `sup_status='ready_confirm_sent'`.
 *   - AssignPickupDialog wiring + submit fires
 *     `useAssignPickupPartnerMutation` with the correct destination warehouse.
 *
 * Mattress-channel + Bed-frame-channel both flow through the catch-all
 * "Receive →" branch — those tests live on `ProcurementTabContent.test.tsx`
 * because they're channel-agnostic.
 */
const useProcurementTabSpy = vi.fn();

let posListState: operationPoListRow[] = [];

const SUPPLIER_HOOKKA = {
  id: "11111111-1111-1111-1111-000000000002",
  name: "HoOKkA Furniture",
  kind: "factory_pickup" as const,
  cat_covered: ["sofa", "bedframe"],
  lead_time: "10–14 days",
  contact: "+60 3-2222 2222",
};

const WAREHOUSE_KL = {
  id: "22222222-2222-2222-2222-000000000001",
  name: "KL Warehouse",
  address: "Subang",
};

const PARTNER_A = {
  id: "33333333-3333-3333-3333-000000000001",
  name: "GD Express",
  contact: "+60 3-9999 9999",
  zones: "Klang Valley",
};

const assignPickupMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    useProcurementTab: (slug: string) => {
      useProcurementTabSpy(slug);
      const data: operationPosListResponse = { pos: posListState };
      return {
        data,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    },
    useOperationSuppliers: (): { data: SuppliersListResponse } => ({
      data: { suppliers: [SUPPLIER_HOOKKA] },
    }),
    useOperationWarehouse: (): { data: WarehouseListResponse } => ({
      data: {
        warehouses: [WAREHOUSE_KL],
        byWarehouse: {},
        totalsBySku: {},
      },
    }),
    useDeliveryPartners: (): { data: DeliveryPartnersListResponse } => ({
      data: { partners: [PARTNER_A] },
    }),
    useCatalog: (): { data: CatalogResponse } => ({
      data: {
        models: [],
        skus: [
          {
            id: "s2",
            modelId: "m2",
            sku: "sofa:nordic:3s",
            variant: "Nordic Sofa · 3 seater",
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
    }),
    useAssignPickupPartnerMutation: () => ({
      mutateAsync: assignPickupMutateAsync,
      isPending: false,
    }),
  };
});

function makeSofaPo(
  overrides: Partial<operationPoListRow> = {},
): operationPoListRow {
  return {
    id: "PO-SOFA-001",
    supplier_id: SUPPLIER_HOOKKA.id,
    warehouse_id: WAREHOUSE_KL.id,
    status: "open",
    sup_status: "in_production",
    so: 9100,
    so_refs: null,
    eta_date: "2026-06-15",
    placed_at: "2026-05-02T00:00:00Z",
    purchase_order_lines: [
      { id: "00000000-0000-0000-0000-aa0000000128", sku: "sofa:nordic:3s", qty: 1, received_qty: 0 },
    ],
    ...overrides,
  };
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/operation/procurement/hookka-sofa"]}>
        {node}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  posListState = [];
  useProcurementTabSpy.mockClear();
  assignPickupMutateAsync.mockClear();
});

describe("HoOKkASofaTab — slug + read view", () => {
  it("calls useProcurementTab with slug='hookka-sofa' and renders fetched sofa POs", () => {
    posListState = [
      makeSofaPo({ id: "PO-SOFA-001", sup_status: "ready_confirm_sent" }),
    ];
    render(wrap(<HoOKkASofaTab />));
    expect(useProcurementTabSpy).toHaveBeenCalledWith("hookka-sofa");
    expect(screen.getByTestId("po-row-PO-SOFA-001")).toBeInTheDocument();
    expect(screen.getByText("Nordic Sofa · 3 seater")).toBeInTheDocument();
    // Sofa channel sup_status='ready_confirm_sent' triggers the LP Pre-flight
    // 代按 button, distinct from the Receive default — verifies the per-row
    // ActionCell branched on the sofa-specific state.
    expect(
      screen.getByTestId("lp-inbound-confirm-PO-SOFA-001"),
    ).toBeInTheDocument();
  });
});

describe("HoOKkASofaTab — AssignPickupDialog (factory_pickup ready_for_pickup)", () => {
  it("clicking 'Assign partner' on a ready_for_pickup PO opens AssignPickupDialog", () => {
    posListState = [
      makeSofaPo({
        id: "PO-2060",
        sup_status: "ready_for_pickup",
      }),
    ];
    render(wrap(<HoOKkASofaTab />));
    fireEvent.click(screen.getByTestId("assign-pickup-PO-2060"));
    expect(
      screen.getByText(/Assign pickup partner · PO-2060/),
    ).toBeInTheDocument();
  });

  it("AssignPickupDialog submit fires the assign-pickup mutation with partnerId + warehouseId", async () => {
    posListState = [
      makeSofaPo({
        id: "PO-2061",
        sup_status: "ready_for_pickup",
      }),
    ];
    render(wrap(<HoOKkASofaTab />));
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
    // v3-S2.4 — FE sends the chosen destination warehouse alongside the
    // partner. Default selection = po.warehouse_id (= WAREHOUSE_KL).
    expect(assignPickupMutateAsync.mock.calls[0][0]).toEqual({
      partnerId: PARTNER_A.id,
      warehouseId: WAREHOUSE_KL.id,
    });
  });
});

describe("HoOKkASofaTab — pickup-flight sup_status branches (v3-S2.2)", () => {
  // The factory_pickup branch carve-outs that exist BECAUSE Sofa is the only
  // channel with factory_pickup supplier kind. NiceFutureMattress + HoOKkA
  // BedFrame both fall through to the catch-all "Receive →" branch (covered
  // in ProcurementTabContent.test.tsx).
  it("shows Assign partner button (NOT Receive) when sup_status is ready_for_pickup", () => {
    posListState = [
      makeSofaPo({ id: "PO-3005", sup_status: "ready_for_pickup" }),
    ];
    render(wrap(<HoOKkASofaTab />));
    expect(screen.getByTestId("assign-pickup-PO-3005")).toBeInTheDocument();
    expect(screen.queryByTestId("receive-po-PO-3005")).not.toBeInTheDocument();
  });

  it("shows 'awaiting accept' text (NOT Receive) when sup_status is pickup_assigned", () => {
    posListState = [
      makeSofaPo({ id: "PO-3006", sup_status: "pickup_assigned" }),
    ];
    render(wrap(<HoOKkASofaTab />));
    expect(screen.queryByTestId("receive-po-PO-3006")).not.toBeInTheDocument();
    const row = screen.getByTestId("po-row-PO-3006");
    expect(row.textContent).toContain("awaiting accept");
  });

  it("shows 'pickup scheduled' text (NOT Receive) when sup_status is pickup_accepted (regression guard)", () => {
    posListState = [
      makeSofaPo({ id: "PO-3007", sup_status: "pickup_accepted" }),
    ];
    render(wrap(<HoOKkASofaTab />));
    expect(screen.queryByTestId("receive-po-PO-3007")).not.toBeInTheDocument();
    const row = screen.getByTestId("po-row-PO-3007");
    expect(row.textContent).toContain("pickup scheduled");
  });

  it("shows 'in transit' text (NOT Receive) when sup_status is picked_up (regression guard)", () => {
    posListState = [
      makeSofaPo({ id: "PO-3008", sup_status: "picked_up" }),
    ];
    render(wrap(<HoOKkASofaTab />));
    expect(screen.queryByTestId("receive-po-PO-3008")).not.toBeInTheDocument();
    const row = screen.getByTestId("po-row-PO-3008");
    expect(row.textContent).toContain("in transit");
  });
});
