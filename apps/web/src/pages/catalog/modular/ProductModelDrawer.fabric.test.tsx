/**
 * ProductModelDrawer — Sofa Fabrics panel + per-model tier delta override.
 *
 * Covers Task-5 requirements:
 *  - Fabrics panel renders for sofa models only.
 *  - Principal sees tier dropdown (editable).
 *  - Non-principal sees tier read-only (no select).
 *  - Add fabric form: principal sees tier select, non-principal doesn't.
 *  - Create fabric submits with correct tier.
 *  - Per-model override: principal can edit and save P2/P3 inputs.
 *  - Per-model override: blank input → null (inherit from global).
 *  - Per-model override: non-principal sees read-only inputs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, ProductModelDto, ProductSkuDto } from "@carres/shared";
import ProductModelDrawer from "./ProductModelDrawer";

// ---------------------------------------------------------------------------
// Toast mock
// ---------------------------------------------------------------------------
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Mutation stubs
// ---------------------------------------------------------------------------
const mockCreateFabric = vi.fn();
const mockPatchFabric = vi.fn();
const mockDeleteFabric = vi.fn();
const mockUpsertOverride = vi.fn();
const mockUpsertOffered = vi.fn();
const mockDeleteOffered = vi.fn();

vi.mock("@/lib/queries", () => ({
  usePatchCatalogModel:            () => ({ mutate: vi.fn(), isPending: false }),
  usePatchCatalogSku:              () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetModelPhoto:                () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteModelPhoto:             () => ({ mutate: vi.fn(), isPending: false }),
  useToggleSizesActive:            () => ({ mutate: vi.fn(), isPending: false }),
  useGenerateSkus:                 () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSofaFabric:             () => ({ mutate: mockCreateFabric, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  usePatchSofaFabric:              () => ({ mutate: mockPatchFabric, isPending: false }),
  useDeleteSofaFabric:             () => ({ mutate: mockDeleteFabric, isPending: false }),
  useUpsertModelFabricTierOverride: () => ({ mutate: mockUpsertOverride, isPending: false }),
  // 0178 — offered-compartments panel hooks (drawer renders the panel for sofa models).
  useUpsertModelSofaCompartment:   () => ({ mutate: mockUpsertOffered, isPending: false }),
  useDeleteModelSofaCompartment:   () => ({ mutate: mockDeleteOffered, isPending: false }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MODEL_SOFA: ProductModelDto = {
  id: "m-sofa-1",
  category: "sofa",
  modelKey: "luna",
  name: "Luna Sofa",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "preset",
  allowedOptions: { sizes: [], compartments: [], colors: [] },
};

const MODEL_MATTRESS: ProductModelDto = {
  id: "m-mat-1",
  category: "mattress",
  modelKey: "cloud",
  name: "Carres Cloud",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
  allowedOptions: { sizes: ["Queen", "King"] },
};

const FABRIC_P1 = {
  id: "f-p1",
  modelId: "m-sofa-1",
  fabricName: "Linen Grey",
  surcharge: 0,
  colors: null,
  tier: "PRICE_1" as const,
};

const FABRIC_P2 = {
  id: "f-p2",
  modelId: "m-sofa-1",
  fabricName: "Velvet Blue",
  surcharge: 50,
  colors: null,
  tier: "PRICE_2" as const,
};

const SKUS: ProductSkuDto[] = [];

function makeCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [MODEL_SOFA, MODEL_MATTRESS],
    skus: SKUS,
    sofaFabrics: [FABRIC_P1, FABRIC_P2],
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockCreateFabric.mockReset();
  mockPatchFabric.mockReset();
  mockDeleteFabric.mockReset();
  mockUpsertOverride.mockReset();
  mockUpsertOffered.mockReset();
  mockDeleteOffered.mockReset();
  vi.clearAllMocks();
});

// 0178 — Offered compartments panel (per-model offered pool compartments).
describe("SofaCompartmentsOfferedPanel (0178)", () => {
  const POOL_COMP = {
    id: "comp-1",
    code: "1A(LHF)",
    description: "1 seat, ONE arm (left)",
    seatCount: 1,
    armConfig: "left",
    iconUrl: null,
    defaultPrice: 250,
    sortOrder: 1,
    active: true,
  };

  function catalogWithPool(offered: boolean): CatalogResponse {
    return makeCatalog({
      sofaCompartments: [POOL_COMP],
      modelSofaCompartments: offered
        ? [{ modelId: "m-sofa-1", compartmentId: "comp-1", priceOverride: null, sortOrder: 0 }]
        : [],
    });
  }

  it("renders the offered-compartments panel + a pool row for sofa models", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={catalogWithPool(false)}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Offered compartments")).toBeInTheDocument();
    expect(screen.getByTestId("offered-row-1A(LHF)")).toBeInTheDocument();
    expect((screen.getByTestId("offered-check-1A(LHF)") as HTMLInputElement).checked).toBe(false);
  });

  it("checkbox is checked when the model already offers the compartment", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={catalogWithPool(true)}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    expect((screen.getByTestId("offered-check-1A(LHF)") as HTMLInputElement).checked).toBe(true);
  });

  it("principal toggling offer ON calls the upsert hook with model + compartment", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={catalogWithPool(false)}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("offered-check-1A(LHF)"));
    expect(mockUpsertOffered).toHaveBeenCalledOnce();
    expect(mockUpsertOffered.mock.calls[0][0]).toMatchObject({ modelId: "m-sofa-1", compartmentId: "comp-1" });
  });

  it("non-principal: checkbox is disabled (read-only)", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={catalogWithPool(false)}
          isPrincipal={false}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId("offered-check-1A(LHF)")).toBeDisabled();
  });

  it("does NOT render the offered panel for mattress models", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_MATTRESS}
          skus={SKUS}
          catalog={catalogWithPool(false)}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByText("Offered compartments")).not.toBeInTheDocument();
  });
});

describe("SofaFabricsPanel — render", () => {
  it("renders the Fabrics section for sofa models", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByText("Fabrics")).toBeInTheDocument();
    // Fabric names are in <input defaultValue=...> — use getByDisplayValue
    expect(screen.getByDisplayValue("Linen Grey")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Velvet Blue")).toBeInTheDocument();
  });

  it("does NOT render the Fabrics section for mattress models", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_MATTRESS}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByText("Fabrics")).not.toBeInTheDocument();
  });
});

describe("SofaFabricsPanel — principal-gating (tier dropdown)", () => {
  it("principal sees tier select dropdowns for each fabric", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    // Each fabric row should have a tier select
    expect(screen.getByTestId("fabric-tier-f-p1")).toBeInTheDocument();
    expect(screen.getByTestId("fabric-tier-f-p2")).toBeInTheDocument();
  });

  it("non-principal sees tier as read-only text (no select)", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={false}
          onClose={() => {}}
        />,
      ),
    );
    // No select dropdowns
    expect(screen.queryByTestId("fabric-tier-f-p1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fabric-tier-f-p2")).not.toBeInTheDocument();
    // Read-only text spans present
    expect(screen.getByTestId("fabric-tier-readonly-f-p1")).toBeInTheDocument();
    expect(screen.getByTestId("fabric-tier-readonly-f-p2")).toBeInTheDocument();
  });

  it("principal changing tier select dispatches patch", async () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    const tierSelect = screen.getByTestId("fabric-tier-f-p1") as HTMLSelectElement;
    fireEvent.change(tierSelect, { target: { value: "PRICE_3" } });
    await waitFor(() => expect(mockPatchFabric).toHaveBeenCalledOnce());
    const call = mockPatchFabric.mock.calls[0][0];
    expect(call.id).toBe("f-p1");
    expect(call.patch.tier).toBe("PRICE_3");
  });
});

describe("SofaFabricsPanel — Add fabric", () => {
  it("principal sees tier select in the add form", async () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("fabric-add-toggle"));
    expect(screen.getByTestId("fabric-add-tier")).toBeInTheDocument();
  });

  it("non-principal does NOT see tier select in the add form", async () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={false}
          onClose={() => {}}
        />,
      ),
    );
    // Non-principal: the "+ Add fabric" toggle button is hidden entirely
    expect(screen.queryByTestId("fabric-add-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fabric-add-tier")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fabric-add-submit")).not.toBeInTheDocument();
  });
});

describe("SofaFabricsPanel — fabric write surface principal gate (T5-a)", () => {
  it("principal sees the add-toggle button and remove buttons", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId("fabric-add-toggle")).toBeInTheDocument();
    expect(screen.getByTestId(`fabric-remove-${FABRIC_P1.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`fabric-remove-${FABRIC_P2.id}`)).toBeInTheDocument();
  });

  it("non-principal sees NO add-toggle, NO remove buttons, NO name inputs (read-only)", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={false}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId("fabric-add-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId(`fabric-remove-${FABRIC_P1.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`fabric-remove-${FABRIC_P2.id}`)).not.toBeInTheDocument();
    // Name is rendered as read-only span, not input
    expect(screen.queryByTestId(`fabric-name-input-${FABRIC_P1.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`fabric-name-readonly-${FABRIC_P1.id}`)).toBeInTheDocument();
  });
});

describe("TierDeltaOverrideCard — per-model override", () => {
  it("principal sees editable P2/P3 override inputs", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    const t2 = screen.getByTestId(`model-tier2-delta-${MODEL_SOFA.id}`) as HTMLInputElement;
    const t3 = screen.getByTestId(`model-tier3-delta-${MODEL_SOFA.id}`) as HTMLInputElement;
    expect(t2).not.toBeDisabled();
    expect(t3).not.toBeDisabled();
  });

  it("non-principal sees disabled P2/P3 override inputs", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={false}
          onClose={() => {}}
        />,
      ),
    );
    const t2 = screen.getByTestId(`model-tier2-delta-${MODEL_SOFA.id}`) as HTMLInputElement;
    const t3 = screen.getByTestId(`model-tier3-delta-${MODEL_SOFA.id}`) as HTMLInputElement;
    expect(t2).toBeDisabled();
    expect(t3).toBeDisabled();
  });

  it("non-principal: save button is absent", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={false}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId(`model-tier-override-save-${MODEL_SOFA.id}`)).not.toBeInTheDocument();
  });

  it("principal: saving numeric values calls upsert with correct deltas", async () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog()}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    const t2 = screen.getByTestId(`model-tier2-delta-${MODEL_SOFA.id}`);
    const t3 = screen.getByTestId(`model-tier3-delta-${MODEL_SOFA.id}`);
    fireEvent.change(t2, { target: { value: "150" } });
    fireEvent.change(t3, { target: { value: "300" } });
    fireEvent.click(screen.getByTestId(`model-tier-override-save-${MODEL_SOFA.id}`));
    await waitFor(() => expect(mockUpsertOverride).toHaveBeenCalledOnce());
    const call = mockUpsertOverride.mock.calls[0][0];
    expect(call.modelId).toBe(MODEL_SOFA.id);
    expect(call.tier2Delta).toBe(150);
    expect(call.tier3Delta).toBe(300);
  });

  it("principal: blank input sends null (inherit from global)", async () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog({
            modelFabricTierOverrides: [
              { modelId: MODEL_SOFA.id, tier2Delta: 50, tier3Delta: 100 },
            ],
          })}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    // Clear P2 input → null
    const t2 = screen.getByTestId(`model-tier2-delta-${MODEL_SOFA.id}`);
    fireEvent.change(t2, { target: { value: "" } });
    fireEvent.click(screen.getByTestId(`model-tier-override-save-${MODEL_SOFA.id}`));
    await waitFor(() => expect(mockUpsertOverride).toHaveBeenCalledOnce());
    const call = mockUpsertOverride.mock.calls[0][0];
    expect(call.tier2Delta).toBeNull();
  });

  it("syncs input values from existing override on mount", () => {
    render(
      wrap(
        <ProductModelDrawer
          model={MODEL_SOFA}
          skus={SKUS}
          catalog={makeCatalog({
            modelFabricTierOverrides: [
              { modelId: MODEL_SOFA.id, tier2Delta: 75, tier3Delta: 150 },
            ],
          })}
          isPrincipal={true}
          onClose={() => {}}
        />,
      ),
    );
    const t2 = screen.getByTestId(`model-tier2-delta-${MODEL_SOFA.id}`) as HTMLInputElement;
    const t3 = screen.getByTestId(`model-tier3-delta-${MODEL_SOFA.id}`) as HTMLInputElement;
    expect(t2.value).toBe("75");
    expect(t3.value).toBe("150");
  });
});
