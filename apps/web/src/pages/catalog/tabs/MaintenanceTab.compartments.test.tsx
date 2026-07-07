/**
 * MaintenanceTab — Sofa Compartments pool tests. (The FabricTierDeltasCard
 * tests that used to share this file moved to FabricTierDeltasCard.test.tsx
 * when the Maintenance tab's duplicate "Fabric Tiers" item was removed.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse } from "@carres/shared";
import MaintenanceTab from "./MaintenanceTab";

// ---------------------------------------------------------------------------
// Toast mock
// ---------------------------------------------------------------------------
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Mutation stubs
// ---------------------------------------------------------------------------
vi.mock("@/lib/queries", () => ({
  // 0178 — sofa compartment hooks (MaintenanceTab renders SofaCompartmentsSection).
  useCreateSofaCompartment:  () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSofaCompartment:  () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSofaCompartment:  () => ({ mutate: vi.fn(), isPending: false }),
  // Compartment photo hooks (icon_url upload/remove in the pool list).
  useSetCompartmentPhoto:    () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCompartmentPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  // 0201 — option pool hooks (PoolPanel children).
  useBatchSaveOptionPool:    () => ({ mutate: vi.fn(), isPending: false }),
  useCatalogConfigHistory:   () => ({ data: undefined, isLoading: false }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    fabricTierConfig: { sofaTier2Delta: 100, sofaTier3Delta: 200 },
    modelFabricTierOverrides: [],
    ...overrides,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

/** 0201 — the tab is sidebar-driven: each section lives behind its nav item,
 *  so every test opens the Sofa Compartments panel first. */
function renderPanel(catalog: CatalogResponse, isPrincipal: boolean) {
  render(wrap(<MaintenanceTab catalog={catalog} isPrincipal={isPrincipal} />));
  fireEvent.click(screen.getByTestId("maint-nav-compartments"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

// 0178 — Sofa Compartments pool section (sofa engine Phase 1).
describe("SofaCompartmentsSection — render + gating", () => {
  function catalogWithCompartments(): CatalogResponse {
    return makeCatalog({
      sofaCompartments: [
        {
          id: "00000000-0000-0000-0000-0000000c0001",
          code: "1A(LHF)",
          description: "1 seat, ONE arm (left)",
          seatCount: 1,
          armConfig: "left",
          iconUrl: null,
          defaultPrice: 250,
          sortOrder: 1,
          active: true,
        },
        {
          id: "00000000-0000-0000-0000-0000000c0002",
          code: "1NA",
          description: "1 seat, NO arms",
          seatCount: 1,
          armConfig: null,
          iconUrl: null,
          defaultPrice: 200,
          sortOrder: 2,
          active: false, // disabled → should NOT render
        },
      ],
    });
  }

  it("renders the heading + active rows, hides disabled compartments", () => {
    renderPanel(catalogWithCompartments(), true);
    // 0201: "Sofa Compartments" appears in the sidebar nav AND the panel title.
    expect(screen.getAllByText("Sofa Compartments").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("compartment-row-1A(LHF)")).toBeInTheDocument();
    expect(screen.queryByTestId("compartment-row-1NA")).not.toBeInTheDocument();
  });

  it("principal: shows the + Add compartment control + a Disable action", () => {
    renderPanel(catalogWithCompartments(), true);
    expect(screen.getByText("+ Add compartment")).toBeInTheDocument();
    expect(screen.getByText("Disable")).toBeInTheDocument();
  });

  it("non-principal: read-only — no Add control, no Disable button", () => {
    renderPanel(catalogWithCompartments(), false);
    expect(screen.queryByText("+ Add compartment")).not.toBeInTheDocument();
    expect(screen.getByTestId("compartment-row-1A(LHF)")).toBeInTheDocument();
    expect(screen.queryByText("Disable")).not.toBeInTheDocument();
  });

  it("has NO price column (prices live on the per-model SKUs in SKU Master)", () => {
    renderPanel(catalogWithCompartments(), true);
    expect(screen.queryByLabelText("1A(LHF) default price")).not.toBeInTheDocument();
    expect(screen.queryByText(/default price/i)).not.toBeInTheDocument();
  });

  it("principal: photo upload control per row (Remove only once a photo exists)", () => {
    renderPanel(catalogWithCompartments(), true);
    expect(screen.getByTestId("compartment-photo-input-1A(LHF)")).toBeInTheDocument();
    // iconUrl null in the fixture → SVG silhouette fallback + no Remove button.
    expect(screen.queryByLabelText("1A(LHF) remove photo")).not.toBeInTheDocument();
    expect(screen.getByTestId("compartment-silhouette")).toBeInTheDocument();
  });

  it("non-principal: no photo upload control", () => {
    renderPanel(catalogWithCompartments(), false);
    expect(screen.queryByTestId("compartment-photo-input-1A(LHF)")).not.toBeInTheDocument();
  });
});

// The Maintenance sidebar no longer carries a "Delivery & Pricing" group —
// Delivery Fees is a top-level tab and Fabric Tiers lives on the Fabrics tab.
describe("MaintenanceTab sidebar — no delivery / fabric entries", () => {
  it("only renders the Products Maintenance nav items", () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={true} />));
    expect(screen.getByTestId("maint-nav-bedframe_size")).toBeInTheDocument();
    expect(screen.getByTestId("maint-nav-mattress_size")).toBeInTheDocument();
    expect(screen.getByTestId("maint-nav-compartments")).toBeInTheDocument();
    expect(screen.getByTestId("maint-nav-supplier_category")).toBeInTheDocument();
    expect(screen.queryByTestId("maint-nav-delivery")).not.toBeInTheDocument();
    expect(screen.queryByTestId("maint-nav-fabric")).not.toBeInTheDocument();
  });
});
