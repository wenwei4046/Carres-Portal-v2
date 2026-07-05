/**
 * ProductModelDrawer — 0182 size-pool quick-add SUGGESTIONS.
 *
 * The global option pool (catalog.optionPools) feeds the per-model size picker
 * as curated suggestions ONLY. Covers:
 *  - mattress model: only ACTIVE mattress_size pool entries show as chips
 *    (wrong-pool + inactive entries are filtered out);
 *  - a pool value already in the model's sizes is NOT re-suggested;
 *  - clicking a suggestion reuses the EXISTING useToggleSizesActive write
 *    (appends to allowed_options.sizes — no new persistence path);
 *  - a sofa model (no size-pool mapping) shows no suggestions block.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, ProductModelDto, ProductSkuDto } from "@carres/shared";
import ProductModelDrawer from "./ProductModelDrawer";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockToggleSizes = vi.fn();

vi.mock("@/lib/queries", () => ({
  usePatchCatalogModel:             () => ({ mutate: vi.fn(), isPending: false }),
  usePatchCatalogSku:               () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useSetModelPhoto:                 () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteModelPhoto:              () => ({ mutate: vi.fn(), isPending: false }),
  useToggleSizesActive:             () => ({ mutate: mockToggleSizes, isPending: false }),
  useGenerateSkus:                  () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSofaFabric:              () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  usePatchSofaFabric:               () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSofaFabric:              () => ({ mutate: vi.fn(), isPending: false }),
  useUpsertModelFabricTierOverride: () => ({ mutate: vi.fn(), isPending: false }),
  useUpsertModelSofaCompartment:    () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteModelSofaCompartment:    () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSofaCombo:               () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useUpdateSofaCombo:               () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useDeleteSofaCombo:               () => ({ mutate: vi.fn(), isPending: false }),
}));

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

const SKUS: ProductSkuDto[] = [];

// One active mattress entry, one wrong-pool entry, one inactive mattress entry,
// and one mattress entry already present in the model's sizes (must not re-show).
const OPTION_POOLS: CatalogResponse["optionPools"] = [
  { id: "op-1", pool: "mattress_size", value: "Super King", label: "7FT", dimensions: "200X200CM", surcharge: null, active: true, sortOrder: 1 },
  { id: "op-2", pool: "bedframe_size", value: "King Frame", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 1 },
  { id: "op-3", pool: "mattress_size", value: "Cot", label: null, dimensions: null, surcharge: null, active: false, sortOrder: 2 },
  { id: "op-4", pool: "mattress_size", value: "Queen", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 3 },
];

function makeCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [MODEL_MATTRESS, MODEL_SOFA],
    skus: SKUS,
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    optionPools: OPTION_POOLS,
    ...overrides,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductModelDrawer — 0182 size-pool suggestions", () => {
  it("shows only ACTIVE, correct-pool, not-already-present sizes as chips", () => {
    render(
      wrap(
        <ProductModelDrawer model={MODEL_MATTRESS} skus={SKUS} catalog={makeCatalog()} isPrincipal onClose={() => {}} />,
      ),
    );
    // active mattress entry not already in the model → suggested
    expect(screen.getByTestId("size-suggestion-Super King")).toBeInTheDocument();
    // wrong pool (bedframe) → not suggested
    expect(screen.queryByTestId("size-suggestion-King Frame")).toBeNull();
    // inactive → not suggested
    expect(screen.queryByTestId("size-suggestion-Cot")).toBeNull();
    // already in allowed_options.sizes → not re-suggested
    expect(screen.queryByTestId("size-suggestion-Queen")).toBeNull();
  });

  it("clicking a suggestion appends to allowed_options.sizes via the existing toggle write", () => {
    render(
      wrap(
        <ProductModelDrawer model={MODEL_MATTRESS} skus={SKUS} catalog={makeCatalog()} isPrincipal onClose={() => {}} />,
      ),
    );
    fireEvent.click(screen.getByTestId("size-suggestion-Super King"));
    expect(mockToggleSizes).toHaveBeenCalledTimes(1);
    const [arg] = mockToggleSizes.mock.calls[0];
    expect(arg.modelId).toBe("m-mat-1");
    expect(arg.input.sizes).toEqual(expect.arrayContaining(["Queen", "King", "Super King"]));
  });

  it("a sofa model (no size-pool mapping) renders no suggestions block", () => {
    render(
      wrap(
        <ProductModelDrawer model={MODEL_SOFA} skus={SKUS} catalog={makeCatalog()} isPrincipal onClose={() => {}} />,
      ),
    );
    expect(screen.queryByTestId("size-suggestions")).toBeNull();
  });
});
