/**
 * AllowedOptionsModal — the centered 2990s-parity Allowed Options editor
 * (Loo 2026-07-06). Covers:
 *  - sofa: Seat sizes (sofa_size pool) · Compartments · Leg heights ·
 *    Special Add-ons · Fabrics (series-grouped) render; Save writes ONE model
 *    PATCH + the compartment offer/un-offer diff;
 *  - leg seeding: key ABSENT → all chips ON; saved [] → all OFF (exact set);
 *  - bedframe: NO compartments; size universe = model sizes ∪ size variants
 *    (not the pool); changed sizes go through the cascade endpoint;
 *  - accessory: single Show-in-POS switch bulk-flips pos_active on Save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, ProductModelDto, ProductSkuDto } from "@carres/shared";
import AllowedOptionsModal from "./AllowedOptionsModal";

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
  blurb: null,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AllowedOptionsModal — sofa (2990s arrangement)", () => {
  function renderSofa(model: ProductModelDto = SOFA) {
    render(
      wrap(
        <AllowedOptionsModal
          model={model}
          skus={[]}
          catalog={makeCatalog()}
          isPrincipal
          onOpenSetup={() => {}}
          onClose={() => {}}
        />,
      ),
    );
  }

  it("renders Seat sizes (pool) · Compartments · Leg heights · Specials · Fabrics by series", () => {
    renderSofa();
    expect(screen.getByTestId("allowed-sizes")).toHaveTextContent("Seat sizes (inches)");
    expect(screen.getByTestId("allowed-size-24")).toBeInTheDocument();
    expect(screen.getByTestId("allowed-size-Flat")).toBeInTheDocument();
    // active compartments only (OLD inactive filtered out)
    expect(screen.getByTestId("allowed-comp-1A(LHF)")).toBeInTheDocument();
    expect(screen.queryByTestId("allowed-comp-OLD")).toBeNull();
    // offered compartment pre-ticked
    expect(screen.getByTestId("allowed-comp-2S").getAttribute("aria-pressed")).toBe("true");
    // legs seeded ALL ON (key absent)
    expect(screen.getByTestId("allowed-leg-No Leg").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId('allowed-leg-6"').getAttribute("aria-pressed")).toBe("true");
    // category-matching specials only
    expect(screen.getByTestId("allowed-special-Sofa Full Fabric")).toBeInTheDocument();
    expect(screen.queryByTestId("allowed-special-Hydraulic")).toBeNull();
    // fabrics grouped by series, actives only
    expect(screen.getByTestId("allowed-fabrics")).toHaveTextContent("BF");
    expect(screen.getByTestId("allowed-fabric-CG-01")).toHaveTextContent("Pearl");
    expect(screen.queryByTestId("allowed-fabric-GONE")).toBeNull();
  });

  it("a saved [] leg set renders every leg chip OFF (exact-set semantics)", () => {
    renderSofa({ ...SOFA, allowedOptions: { leg_heights: [] } });
    expect(screen.getByTestId("allowed-leg-No Leg").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId('allowed-leg-6"').getAttribute("aria-pressed")).toBe("false");
  });

  it("Save writes ONE model PATCH + the compartment offer/un-offer diff", async () => {
    renderSofa();
    fireEvent.click(screen.getByTestId("allowed-size-24")); // tick a seat size
    fireEvent.click(screen.getByTestId("allowed-comp-1A(LHF)")); // offer c1
    fireEvent.click(screen.getByTestId("allowed-comp-2S")); // un-offer c2
    fireEvent.click(screen.getByTestId('allowed-leg-6"')); // untick one leg
    fireEvent.click(screen.getByTestId("allowed-fabrics-allon-BF")); // BF series on
    fireEvent.click(screen.getByTestId("allowed-save"));

    await waitFor(() => expect(mockPatchModel).toHaveBeenCalledTimes(1));
    const [{ id, patch }] = mockPatchModel.mock.calls[0];
    expect(id).toBe("m-sofa");
    expect(patch.allowedOptions.sizes).toEqual(["24"]);
    expect(patch.allowedOptions.leg_heights).toEqual(["No Leg"]);
    expect(patch.allowedOptions.fabrics).toEqual(["BF-01", "BF-02"]);
    // sofa seat sizes do NOT go through the size-cascade endpoint
    expect(mockToggleSizes).not.toHaveBeenCalled();
    // compartment diff
    expect(mockUpsertComp).toHaveBeenCalledWith({ modelId: "m-sofa", compartmentId: "c1", input: {} });
    expect(mockDelComp).toHaveBeenCalledWith({ modelId: "m-sofa", compartmentId: "c2" });
  });

  it("non-principal: compartment chips disabled, everything else editable", () => {
    render(
      wrap(
        <AllowedOptionsModal
          model={SOFA}
          skus={[]}
          catalog={makeCatalog()}
          isPrincipal={false}
          onOpenSetup={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId("allowed-comp-1A(LHF)")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("allowed-leg-No Leg")).toHaveProperty("disabled", false);
  });
});

describe("AllowedOptionsModal — bedframe", () => {
  it("no Compartments; sizes = model sizes ∪ size variants; changed sizes cascade", async () => {
    render(
      wrap(
        <AllowedOptionsModal
          model={BED}
          skus={BED_SKUS}
          catalog={makeCatalog()}
          isPrincipal
          onOpenSetup={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId("allowed-compartments")).toBeNull();
    // universe = saved "Queen" + materialized "King" variant (NOT pool codes)
    expect(screen.getByTestId("allowed-size-Queen").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("allowed-size-King").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId('allowed-leg-4"')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("allowed-size-King"));
    fireEvent.click(screen.getByTestId("allowed-save"));
    await waitFor(() => expect(mockToggleSizes).toHaveBeenCalledTimes(1));
    expect(mockToggleSizes.mock.calls[0][0]).toEqual({
      modelId: "m-bed",
      input: { sizes: ["Queen", "King"] },
    });
    expect(mockUpsertComp).not.toHaveBeenCalled();
  });
});

describe("AllowedOptionsModal — accessory (flat)", () => {
  it("renders only the Show-in-POS switch; Save bulk-flips pos_active", async () => {
    render(
      wrap(
        <AllowedOptionsModal
          model={ACC}
          skus={ACC_SKUS}
          catalog={makeCatalog()}
          isPrincipal
          onOpenSetup={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.queryByTestId("allowed-sizes")).toBeNull();
    const sw = screen.getByTestId("allowed-show-in-pos");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(sw); // → Off
    fireEvent.click(screen.getByTestId("allowed-save"));
    await waitFor(() => expect(mockPatchSku).toHaveBeenCalledTimes(2));
    expect(mockPatchSku).toHaveBeenCalledWith({ id: "a1", patch: { posActive: false } });
    expect(mockPatchSku).toHaveBeenCalledWith({ id: "a2", patch: { posActive: false } });
    expect(mockPatchModel).not.toHaveBeenCalled();
  });
});
