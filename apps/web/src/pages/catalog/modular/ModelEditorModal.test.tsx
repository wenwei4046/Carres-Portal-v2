/**
 * ModelEditorModal — THE one centered Modular editor (Loo 2026-07-06: one
 * base window; Modular = ON/OFF ticks · rename · description · photo ONLY).
 * Covers:
 *  - sofa: Seat sizes (pool) · Compartments · Leg heights · Specials ·
 *    Fabrics (series-grouped) render; Save = ONE model PATCH (name/blurb/
 *    allowed_options) + compartment offer/un-offer diff;
 *  - leg seeding: key ABSENT → all ON; saved [] → all OFF (exact set);
 *  - bedframe: no Compartments; size universe = model sizes ∪ size variants;
 *    changed sizes go through the cascade endpoint; NO add-size / generate UI;
 *  - variant SKU ON/OFF drafts apply on Save via patchSku diffs (all
 *    categories — this is the flat-category on/off too);
 *  - name is part of the Save batch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, ProductModelDto, ProductSkuDto } from "@carres/shared";
import ModelEditorModal from "./ModelEditorModal";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockPatchModel = vi.fn().mockResolvedValue({});
const mockToggleSizes = vi.fn().mockResolvedValue({});
const mockUpsertComp = vi.fn().mockResolvedValue({});
const mockDelComp = vi.fn().mockResolvedValue({});
const mockPatchSku = vi.fn().mockResolvedValue({});

vi.mock("@/lib/queries", () => ({
  usePatchCatalogModel: () => ({ mutateAsync: mockPatchModel, isPending: false }),
  useToggleSizesActive: () => ({ mutateAsync: mockToggleSizes, isPending: false }),
  useUpsertModelSofaCompartment: () => ({ mutateAsync: mockUpsertComp, isPending: false }),
  useDeleteModelSofaCompartment: () => ({ mutateAsync: mockDelComp, isPending: false }),
  usePatchCatalogSku: () => ({ mutateAsync: mockPatchSku, isPending: false }),
  useSetModelPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteModelPhoto: () => ({ mutate: vi.fn(), isPending: false }),
}));

const SOFA: ProductModelDto = {
  id: "m-sofa",
  category: "sofa",
  modelKey: "booqit",
  name: "Booqit",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "custom",
  allowedOptions: {},
};

const BED: ProductModelDto = {
  id: "m-bed",
  category: "bedframe",
  modelKey: "kayu",
  name: "Kayu",
  blurb: "Solid ash",
  colors: null,
  gaps: null,
  sofaMode: null,
  allowedOptions: { sizes: ["Queen"] },
};

const ACC: ProductModelDto = {
  id: "m-acc",
  category: "accessory",
  modelKey: "pillow",
  name: "Square Pillow",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
  allowedOptions: {},
};

const ACC_SKUS: ProductSkuDto[] = [
  { id: "a1", modelId: "m-acc", sku: "PILLOW-1", variant: "One size", variantKind: "preset", price: 99, cost: null, supplierId: null, posActive: true },
  { id: "a2", modelId: "m-acc", sku: "PILLOW-2", variant: "Large", variantKind: "preset", price: 129, cost: null, supplierId: null, posActive: true },
];

const BED_SKUS: ProductSkuDto[] = [
  { id: "b1", modelId: "m-bed", sku: "KAYU-K", variant: "King", variantKind: "size", price: 1990, cost: null, supplierId: null, posActive: true },
];

function makeCatalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [SOFA, BED, ACC],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    optionPools: [
      { id: "p1", pool: "sofa_size", value: "24", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 1 },
      { id: "p2", pool: "sofa_size", value: "28", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 2 },
      { id: "p3", pool: "sofa_size", value: "Flat", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 3 },
      { id: "p4", pool: "sofa_leg_height", value: "No Leg", label: null, dimensions: null, surcharge: null, active: true, sortOrder: 1 },
      { id: "p5", pool: "sofa_leg_height", value: '6"', label: null, dimensions: null, surcharge: 90, active: true, sortOrder: 2 },
      { id: "p6", pool: "bedframe_leg_height", value: '4"', label: null, dimensions: null, surcharge: 60, active: true, sortOrder: 1 },
    ],
    sofaCompartments: [
      { id: "c1", code: "1A(LHF)", description: null, seatCount: 1, armConfig: "left", iconUrl: null, defaultPrice: 0, sortOrder: 1, active: true },
      { id: "c2", code: "2S", description: null, seatCount: 2, armConfig: "both", iconUrl: null, defaultPrice: 0, sortOrder: 2, active: true },
      { id: "c3", code: "OLD", description: null, seatCount: 1, armConfig: null, iconUrl: null, defaultPrice: 0, sortOrder: 3, active: false },
    ],
    modelSofaCompartments: [{ modelId: "m-sofa", compartmentId: "c2", priceOverride: null, sortOrder: 0 }],
    specialAddons: [
      { id: "sa1", code: "Sofa Full Fabric", label: "Sofa Full Fabric", soDescription: "", categories: ["sofa"], sellingPrice: 0, cost: null, optionGroups: [], active: true, sortOrder: 0 },
      { id: "sa2", code: "Hydraulic", label: "Hydraulic", soDescription: "", categories: ["bedframe"], sellingPrice: 0, cost: null, optionGroups: [], active: true, sortOrder: 1 },
    ],
    fabrics: [
      { id: "f1", fabricCode: "BF-01", series: "BF", description: null, supplierCode: null, sofaTier: "PRICE_1", bedframeTier: "PRICE_1", active: true, sortOrder: 1 },
      { id: "f2", fabricCode: "BF-02", series: "BF", description: null, supplierCode: null, sofaTier: "PRICE_2", bedframeTier: "PRICE_2", active: true, sortOrder: 2 },
      { id: "f3", fabricCode: "CG-01", series: "CG", description: "Pearl", supplierCode: null, sofaTier: "PRICE_1", bedframeTier: "PRICE_1", active: true, sortOrder: 3 },
      { id: "f4", fabricCode: "GONE", series: "CG", description: null, supplierCode: null, sofaTier: "PRICE_1", bedframeTier: "PRICE_1", active: false, sortOrder: 4 },
    ],
    ...over,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

function renderModal(model: ProductModelDto, skus: ProductSkuDto[] = []) {
  render(
    wrap(
      <ModelEditorModal
        model={model}
        skus={skus}
        catalog={makeCatalog()}
        isPrincipal
        onClose={() => {}}
      />,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModelEditorModal — sofa (2990s arrangement)", () => {
  it("renders photo/name/description + Seat sizes · Compartments · Legs · Specials · Fabrics-by-series", () => {
    renderModal(SOFA);
    expect(screen.getByTestId("model-photo")).toBeInTheDocument();
    expect((screen.getByTestId("model-name-input") as HTMLInputElement).value).toBe("Booqit");
    expect(screen.getByTestId("model-blurb-input")).toBeInTheDocument();
    expect(screen.getByTestId("allowed-sizes")).toHaveTextContent("Seat sizes (inches)");
    expect(screen.getByTestId("allowed-size-Flat")).toBeInTheDocument();
    expect(screen.getByTestId("allowed-comp-1A(LHF)")).toBeInTheDocument();
    expect(screen.queryByTestId("allowed-comp-OLD")).toBeNull();
    expect(screen.getByTestId("allowed-comp-2S").getAttribute("aria-pressed")).toBe("true");
    // legs seeded ALL ON (key absent)
    expect(screen.getByTestId("allowed-leg-No Leg").getAttribute("aria-pressed")).toBe("true");
    // category-matching specials only
    expect(screen.getByTestId("allowed-special-Sofa Full Fabric")).toBeInTheDocument();
    expect(screen.queryByTestId("allowed-special-Hydraulic")).toBeNull();
    // fabrics grouped by series, actives only
    expect(screen.getByTestId("allowed-fabric-CG-01")).toHaveTextContent("Pearl");
    expect(screen.queryByTestId("allowed-fabric-GONE")).toBeNull();
    // NO creation affordances in Modular
    expect(screen.queryByText(/Generate SKUs/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/Add a size/i)).toBeNull();
  });

  it("a saved [] leg set renders every leg chip OFF (exact-set semantics)", () => {
    renderModal({ ...SOFA, allowedOptions: { leg_heights: [] } });
    expect(screen.getByTestId("allowed-leg-No Leg").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId('allowed-leg-6"').getAttribute("aria-pressed")).toBe("false");
  });

  it("Save = ONE model PATCH (name/blurb/allowed_options) + compartment diff", async () => {
    renderModal(SOFA);
    fireEvent.change(screen.getByTestId("model-name-input"), { target: { value: "Booqit II" } });
    fireEvent.change(screen.getByTestId("model-blurb-input"), { target: { value: "Corner king" } });
    fireEvent.click(screen.getByTestId("allowed-size-24"));
    fireEvent.click(screen.getByTestId("allowed-comp-1A(LHF)")); // offer c1
    fireEvent.click(screen.getByTestId("allowed-comp-2S")); // un-offer c2
    fireEvent.click(screen.getByTestId("allowed-fabrics-allon-BF"));
    fireEvent.click(screen.getByTestId("model-editor-save"));

    await waitFor(() => expect(mockPatchModel).toHaveBeenCalledTimes(1));
    const [{ id, patch }] = mockPatchModel.mock.calls[0];
    expect(id).toBe("m-sofa");
    expect(patch.name).toBe("Booqit II");
    expect(patch.blurb).toBe("Corner king");
    expect(patch.allowedOptions.sizes).toEqual(["24"]);
    expect(patch.allowedOptions.fabrics).toEqual(["BF-01", "BF-02"]);
    expect(mockToggleSizes).not.toHaveBeenCalled(); // sofa sizes don't cascade
    expect(mockUpsertComp).toHaveBeenCalledWith({ modelId: "m-sofa", compartmentId: "c1", input: {} });
    expect(mockDelComp).toHaveBeenCalledWith({ modelId: "m-sofa", compartmentId: "c2" });
  });

  it("non-principal: compartment chips disabled, other ticks editable", () => {
    render(
      wrap(
        <ModelEditorModal
          model={SOFA}
          skus={[]}
          catalog={makeCatalog()}
          isPrincipal={false}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId("allowed-comp-1A(LHF)")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("allowed-leg-No Leg")).toHaveProperty("disabled", false);
  });
});

describe("ModelEditorModal — bedframe", () => {
  it("no Compartments; sizes = model axis ∪ variants; changed sizes cascade on Save", async () => {
    renderModal(BED, BED_SKUS);
    expect(screen.queryByTestId("allowed-compartments")).toBeNull();
    expect(screen.getByTestId("allowed-sizes")).toHaveTextContent("Sizes");
    expect(screen.getByTestId("allowed-size-Queen").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("allowed-size-King").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId('allowed-leg-4"')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("allowed-size-King"));
    fireEvent.click(screen.getByTestId("model-editor-save"));
    await waitFor(() => expect(mockToggleSizes).toHaveBeenCalledTimes(1));
    expect(mockToggleSizes.mock.calls[0][0]).toEqual({
      modelId: "m-bed",
      input: { sizes: ["Queen", "King"] },
    });
  });
});

describe("ModelEditorModal — variant SKU ON/OFF (draft, applies on Save)", () => {
  it("accessory: no tick sections; SKU pills flip pos_active via Save diffs", async () => {
    renderModal(ACC, ACC_SKUS);
    expect(screen.queryByTestId("allowed-sizes")).toBeNull();
    expect(screen.queryByTestId("allowed-fabrics")).toBeNull();
    // draft-toggle one SKU off, save → exactly ONE patchSku call
    fireEvent.click(screen.getByTestId("sku-toggle-PILLOW-1"));
    fireEvent.click(screen.getByTestId("model-editor-save"));
    await waitFor(() => expect(mockPatchSku).toHaveBeenCalledTimes(1));
    expect(mockPatchSku).toHaveBeenCalledWith({ id: "a1", patch: { posActive: false } });
    // name unchanged → no model PATCH at all
    expect(mockPatchModel).not.toHaveBeenCalled();
  });

  it("All off flips every SKU in one save", async () => {
    renderModal(ACC, ACC_SKUS);
    fireEvent.click(screen.getByText("All off"));
    fireEvent.click(screen.getByTestId("model-editor-save"));
    await waitFor(() => expect(mockPatchSku).toHaveBeenCalledTimes(2));
  });
});
