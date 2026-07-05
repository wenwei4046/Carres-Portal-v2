/**
 * MaintenanceTab — FabricTierDeltasCard tests.
 *
 * Covers Task-5 requirements:
 *  - Global tier delta card renders (P2 + P3 inputs + summary).
 *  - Principal can edit and save global deltas.
 *  - Non-principal sees read-only disabled inputs (no Save button).
 *  - Summary text reflects the catalog config values.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
const mockTierConfigMutate = vi.fn();
const mockFloorConfigMutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  usePatchFloorConfig:       () => ({ mutate: mockFloorConfigMutate, isPending: false }),
  useUpdateFabricTierConfig: () => ({ mutate: mockTierConfigMutate, isPending: false }),
  // 0178 — sofa compartment hooks (MaintenanceTab now renders SofaCompartmentsSection).
  useCreateSofaCompartment:  () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSofaCompartment:  () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSofaCompartment:  () => ({ mutate: vi.fn(), isPending: false }),
  // Compartment photo hooks (icon_url upload/remove in the pool list).
  useSetCompartmentPhoto:    () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteCompartmentPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  // 0201 — option pool hooks (PoolPanel children).
  useBatchSaveOptionPool:    () => ({ mutate: vi.fn(), isPending: false }),
  useCatalogConfigHistory:   () => ({ data: undefined, isLoading: false }),
  // 0184 — delivery TRIP fee hooks (MaintenanceTab now renders the trip-fee +
  // special-rules sections).
  useUpdateDeliveryFeeConfig:       () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSpecialDeliveryFeeRule:  () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSpecialDeliveryFeeRule:  () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteSpecialDeliveryFeeRule:  () => ({ mutate: vi.fn(), isPending: false }),
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

/** 0201 — the tab is sidebar-driven now: each section lives behind its nav
 *  item ("fabric" = Fabric Tiers, "compartments" = Sofa Compartments), so
 *  every test opens the right panel first. */
function renderPanel(
  catalog: CatalogResponse,
  isPrincipal: boolean,
  nav: "fabric" | "compartments",
) {
  render(wrap(<MaintenanceTab catalog={catalog} isPrincipal={isPrincipal} />));
  fireEvent.click(screen.getByTestId(`maint-nav-${nav}`));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockTierConfigMutate.mockReset();
  mockFloorConfigMutate.mockReset();
  vi.clearAllMocks();
});

describe("FabricTierDeltasCard — render", () => {
  it("renders the Fabric tier deltas heading", () => {
    renderPanel(makeCatalog(), true, "fabric");
    expect(screen.getByText("Fabric tier deltas")).toBeInTheDocument();
  });

  it("shows P2 and P3 numeric inputs", () => {
    renderPanel(makeCatalog(), true, "fabric");
    expect(screen.getByTestId("global-tier2-delta")).toBeInTheDocument();
    expect(screen.getByTestId("global-tier3-delta")).toBeInTheDocument();
  });

  it("renders summary with config values", () => {
    renderPanel(makeCatalog(), true, "fabric");
    const summary = screen.getByTestId("fabric-tier-summary");
    expect(summary.textContent).toContain("100.00");
    expect(summary.textContent).toContain("200.00");
  });

  it("summary falls back to 0.00 when fabricTierConfig is absent", () => {
    renderPanel(makeCatalog({ fabricTierConfig: undefined }), true, "fabric");
    const summary = screen.getByTestId("fabric-tier-summary");
    expect(summary.textContent).toContain("0.00");
  });
});

describe("FabricTierDeltasCard — principal-gating", () => {
  it("principal: inputs are enabled + Save button present", () => {
    renderPanel(makeCatalog(), true, "fabric");
    const t2 = screen.getByTestId("global-tier2-delta") as HTMLInputElement;
    const t3 = screen.getByTestId("global-tier3-delta") as HTMLInputElement;
    expect(t2).not.toBeDisabled();
    expect(t3).not.toBeDisabled();
    expect(screen.getByTestId("global-tier-save")).toBeInTheDocument();
  });

  it("non-principal: inputs are disabled, no Save button", () => {
    renderPanel(makeCatalog(), false, "fabric");
    const t2 = screen.getByTestId("global-tier2-delta") as HTMLInputElement;
    const t3 = screen.getByTestId("global-tier3-delta") as HTMLInputElement;
    expect(t2).toBeDisabled();
    expect(t3).toBeDisabled();
    expect(screen.queryByTestId("global-tier-save")).not.toBeInTheDocument();
  });

  it("principal: changing inputs and saving calls mutate with correct values", async () => {
    renderPanel(makeCatalog(), true, "fabric");
    const t2 = screen.getByTestId("global-tier2-delta");
    const t3 = screen.getByTestId("global-tier3-delta");
    fireEvent.change(t2, { target: { value: "120" } });
    fireEvent.change(t3, { target: { value: "250" } });
    fireEvent.click(screen.getByTestId("global-tier-save"));
    await waitFor(() => expect(mockTierConfigMutate).toHaveBeenCalledOnce());
    const call = mockTierConfigMutate.mock.calls[0][0];
    expect(call.sofaTier2Delta).toBe(120);
    expect(call.sofaTier3Delta).toBe(250);
  });

  it("principal: Save is disabled when values are unchanged (not dirty)", () => {
    renderPanel(makeCatalog(), true, "fabric");
    const saveBtn = screen.getByTestId("global-tier-save") as HTMLButtonElement;
    // No changes made — dirty=false → disabled
    expect(saveBtn).toBeDisabled();
  });
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
    renderPanel(catalogWithCompartments(), true, "compartments");
    // 0201: "Sofa Compartments" appears in the sidebar nav AND the panel title.
    expect(screen.getAllByText("Sofa Compartments").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("compartment-row-1A(LHF)")).toBeInTheDocument();
    expect(screen.queryByTestId("compartment-row-1NA")).not.toBeInTheDocument();
  });

  it("principal: shows the + Add compartment control + a Disable action", () => {
    renderPanel(catalogWithCompartments(), true, "compartments");
    expect(screen.getByText("+ Add compartment")).toBeInTheDocument();
    expect(screen.getByText("Disable")).toBeInTheDocument();
  });

  it("non-principal: read-only — no Add control, no Disable button", () => {
    renderPanel(catalogWithCompartments(), false, "compartments");
    expect(screen.queryByText("+ Add compartment")).not.toBeInTheDocument();
    expect(screen.getByTestId("compartment-row-1A(LHF)")).toBeInTheDocument();
    expect(screen.queryByText("Disable")).not.toBeInTheDocument();
  });

  it("has NO price column (prices live on the per-model SKUs in SKU Master)", () => {
    renderPanel(catalogWithCompartments(), true, "compartments");
    expect(screen.queryByLabelText("1A(LHF) default price")).not.toBeInTheDocument();
    expect(screen.queryByText(/default price/i)).not.toBeInTheDocument();
  });

  it("principal: photo upload control per row (Remove only once a photo exists)", () => {
    renderPanel(catalogWithCompartments(), true, "compartments");
    expect(screen.getByTestId("compartment-photo-input-1A(LHF)")).toBeInTheDocument();
    // iconUrl null in the fixture → SVG silhouette fallback + no Remove button.
    expect(screen.queryByLabelText("1A(LHF) remove photo")).not.toBeInTheDocument();
    expect(screen.getByTestId("compartment-silhouette")).toBeInTheDocument();
  });

  it("non-principal: no photo upload control", () => {
    renderPanel(catalogWithCompartments(), false, "compartments");
    expect(screen.queryByTestId("compartment-photo-input-1A(LHF)")).not.toBeInTheDocument();
  });
});
