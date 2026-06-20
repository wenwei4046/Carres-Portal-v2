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
  vi.clearAllMocks();
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
    fireEvent.click(screen.getByTestId("fabric-add-toggle"));
    expect(screen.queryByTestId("fabric-add-tier")).not.toBeInTheDocument();
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
