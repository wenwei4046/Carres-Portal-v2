import { describe, it, expect } from "vitest";
import type { CatalogResponse } from "@carres/shared";
import { buildCatalogIndex } from "./catalog-index";

function catalog(): CatalogResponse {
  return {
    models: [
      { id: "m-mat", category: "mattress", modelKey: "cloud", name: "Carres Cloud", blurb: "Pocket spring", colors: null, gaps: null, sofaMode: null },
      { id: "m-sofa", category: "sofa", modelKey: "kestrel", name: "Kestrel", blurb: null, colors: null, gaps: null, sofaMode: "preset" },
      { id: "m-empty", category: "bedframe", modelKey: "ghost", name: "Ghost Frame", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: "m-acc", category: "accessory", modelKey: "pillow", name: "Pillow", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      { id: "s1", modelId: "m-mat", sku: "CLOUD-QUEEN", variant: "Queen", variantKind: "size", price: 2890, cost: null, supplierId: null },
      { id: "s2", modelId: "m-mat", sku: "CLOUD-KING", variant: "King", variantKind: "size", price: 3490, cost: null, supplierId: null },
      { id: "s3", modelId: "m-sofa", sku: "KESTREL-3S", variant: "3-seater", variantKind: "preset", price: 5000, cost: null, supplierId: null },
      { id: "s4", modelId: "m-acc", sku: "PILLOW-STD", variant: "Std", variantKind: "size", price: 120, cost: null, supplierId: null },
    ],
    sofaFabrics: [
      { id: "f1", modelId: "m-sofa", fabricName: "Linen Natural", surcharge: 300, colors: null },
      { id: "f2", modelId: "m-sofa", fabricName: "Velvet Teal", surcharge: 800, colors: null },
    ],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  };
}

describe("buildCatalogIndex", () => {
  it("includes only mattress/bedframe/sofa models with ≥1 sku", () => {
    const idx = buildCatalogIndex(catalog());
    const ids = idx.productModels.map((m) => m.id).sort();
    // m-acc (accessory) excluded; m-empty (no skus) excluded.
    expect(ids).toEqual(["m-mat", "m-sofa"]);
  });

  it("computes from-price as the cheapest sku for mattress", () => {
    const idx = buildCatalogIndex(catalog());
    expect(idx.meta.get("m-mat")!.fromPrice).toBe(2890);
    expect(idx.meta.get("m-mat")!.optionNoun).toBe("size");
    expect(idx.meta.get("m-mat")!.optionCount).toBe(2);
  });

  it("adds the cheapest fabric surcharge to sofa from-price", () => {
    const idx = buildCatalogIndex(catalog());
    // base 5000 + cheapest fabric 300
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5300);
    expect(idx.meta.get("m-sofa")!.optionNoun).toBe("option");
  });

  it("maps sku → category for the mutex", () => {
    const idx = buildCatalogIndex(catalog());
    expect(idx.skuToCategory.get("CLOUD-QUEEN")).toBe("mattress");
    expect(idx.skuToCategory.get("KESTREL-3S")).toBe("sofa");
  });

  it("builds a lowercased search blob over name/sku/fabric", () => {
    const blob = buildCatalogIndex(catalog()).meta.get("m-sofa")!.searchBlob;
    expect(blob).toContain("kestrel");
    expect(blob).toContain("kestrel-3s");
    expect(blob).toContain("velvet teal");
  });
});
