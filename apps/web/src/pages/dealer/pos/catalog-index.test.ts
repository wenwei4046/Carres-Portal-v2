import { describe, it, expect } from "vitest";
import type { CatalogResponse, FabricTierGlobalConfig, ModelFabricTierOverrideDto } from "@carres/shared";
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
      { id: "f1", modelId: "m-sofa", fabricName: "Linen Natural", surcharge: 300, colors: null, tier: "PRICE_1" as const },
      { id: "f2", modelId: "m-sofa", fabricName: "Velvet Teal", surcharge: 800, colors: null, tier: "PRICE_1" as const },
    ],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  };
}

/** Catalog with P2/P3 fabrics for the sofa model. */
function catalogWithTiers(): CatalogResponse {
  return {
    ...catalog(),
    sofaFabrics: [
      { id: "f1", modelId: "m-sofa", fabricName: "Linen Natural", surcharge: 0, colors: null, tier: "PRICE_1" as const },
      { id: "f2", modelId: "m-sofa", fabricName: "Velvet Teal", surcharge: 0, colors: null, tier: "PRICE_2" as const },
      { id: "f3", modelId: "m-sofa", fabricName: "Silk Premium", surcharge: 0, colors: null, tier: "PRICE_3" as const },
    ],
  };
}

const CONFIG: FabricTierGlobalConfig = { sofaTier2Delta: 100, sofaTier3Delta: 200 };

describe("buildCatalogIndex", () => {
  it("includes card categories (accessory too, 2990s parity) with ≥1 sku", () => {
    const idx = buildCatalogIndex(catalog());
    const ids = idx.productModels.map((m) => m.id).sort();
    // m-empty (no skus) excluded; service models never become cards.
    expect(ids).toEqual(["m-acc", "m-mat", "m-sofa"]);
    expect(idx.meta.get("m-acc")!.optionNoun).toBe("option");
  });

  it("computes from-price as the cheapest sku for mattress", () => {
    const idx = buildCatalogIndex(catalog());
    expect(idx.meta.get("m-mat")!.fromPrice).toBe(2890);
    expect(idx.meta.get("m-mat")!.optionNoun).toBe("size");
    expect(idx.meta.get("m-mat")!.optionCount).toBe(2);
  });

  // --- P1 backward-compat: no tier config → from-price still uses delta=0 ---
  it("sofa from-price: all P1 fabrics with no config → delta 0 (unchanged from before)", () => {
    const idx = buildCatalogIndex(catalog());
    // base 5000 + min(delta for P1, P1) = 5000 + 0
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5000);
  });

  it("sofa from-price: all P1 fabrics with config present → delta 0 (P1 always 0)", () => {
    const idx = buildCatalogIndex(catalog(), CONFIG);
    // Both fabrics are PRICE_1 → delta 0 regardless of config
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5000);
  });

  // --- Legacy test preserved: surcharge field no longer drives from-price ---
  // (fabrics have surcharge=300/800 but tier=P1 so delta=0; from-price = 5000)
  it("sofa from-price uses tier delta not surcharge field", () => {
    const idx = buildCatalogIndex(catalog(), CONFIG);
    // surcharge field is 300 and 800 but tier is PRICE_1 → delta 0
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5000);
  });

  // --- P2/P3 tier delta path ---
  it("sofa from-price: P1/P2/P3 fabrics → min delta applied (P1=0 wins)", () => {
    const idx = buildCatalogIndex(catalogWithTiers(), CONFIG);
    // min delta: P1→0, P2→100, P3→200 → min is 0; from-price = 5000 + 0
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5000);
  });

  it("sofa from-price: only P2/P3 fabrics → min tier delta applied", () => {
    const onlyTiered: CatalogResponse = {
      ...catalog(),
      sofaFabrics: [
        { id: "f2", modelId: "m-sofa", fabricName: "Velvet Teal", surcharge: 0, colors: null, tier: "PRICE_2" as const },
        { id: "f3", modelId: "m-sofa", fabricName: "Silk Premium", surcharge: 0, colors: null, tier: "PRICE_3" as const },
      ],
    };
    const idx = buildCatalogIndex(onlyTiered, CONFIG);
    // min delta: P2→100, P3→200 → min is 100; from-price = 5000 + 100
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5100);
  });

  it("sofa from-price: per-model override wins over global config", () => {
    const overrides: ModelFabricTierOverrideDto[] = [
      { modelId: "m-sofa", tier2Delta: 50, tier3Delta: null },
    ];
    const onlyP2: CatalogResponse = {
      ...catalog(),
      sofaFabrics: [
        { id: "f2", modelId: "m-sofa", fabricName: "Velvet Teal", surcharge: 0, colors: null, tier: "PRICE_2" as const },
      ],
    };
    const idx = buildCatalogIndex(onlyP2, CONFIG, overrides);
    // override tier2Delta=50 wins over global 100; from-price = 5000 + 50
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5050);
  });

  it("sofa from-price: no config → delta 0 even for P2/P3 (safe fallback)", () => {
    const idx = buildCatalogIndex(catalogWithTiers());
    // No config → resolveFabricDelta returns 0 for all tiers
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5000);
  });

  it("sofa from-price: 0 fabrics → just min sku price", () => {
    const noFabrics: CatalogResponse = { ...catalog(), sofaFabrics: [] };
    const idx = buildCatalogIndex(noFabrics, CONFIG);
    expect(idx.meta.get("m-sofa")!.fromPrice).toBe(5000);
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

  it("builds skuPrice + skuLabel flat lookups for combo explode", () => {
    const idx = buildCatalogIndex(catalog());
    expect(idx.skuPrice.get("CLOUD-QUEEN")).toBe(2890);
    expect(idx.skuPrice.get("KESTREL-3S")).toBe(5000);
    // label = "model name · variant" when no description on the sku.
    expect(idx.skuLabel.get("CLOUD-QUEEN")).toBe("Carres Cloud · Queen");
    expect(idx.skuLabel.get("KESTREL-3S")).toBe("Kestrel · 3-seater");
  });

  it("skuLabel prefers a sku's description when present", () => {
    const withDesc: CatalogResponse = {
      ...catalog(),
      skus: [
        { id: "s1", modelId: "m-mat", sku: "CLOUD-QUEEN", variant: "Queen", variantKind: "size", price: 2890, cost: null, supplierId: null, description: "Cloud Mattress (Queen, firm)" },
      ],
    };
    const idx = buildCatalogIndex(withDesc);
    expect(idx.skuLabel.get("CLOUD-QUEEN")).toBe("Cloud Mattress (Queen, firm)");
  });

  it("surfaces only ACTIVE combos; empty/absent → []", () => {
    // No combos key → empty array.
    expect(buildCatalogIndex(catalog()).combos).toEqual([]);

    const withCombos: CatalogResponse = {
      ...catalog(),
      combos: [
        {
          id: "cA", comboKey: "live-combo", name: "Live Combo", comboPrice: 5000, cost: null, active: true,
          effectiveFrom: "2026-06-20", components: [{ sku: "CLOUD-QUEEN", qty: 1, sortOrder: 0 }],
        },
        {
          id: "cB", comboKey: "dead-combo", name: "Dead Combo", comboPrice: 1000, cost: null, active: false,
          effectiveFrom: "2026-06-20", components: [{ sku: "CLOUD-KING", qty: 1, sortOrder: 0 }],
        },
      ],
    };
    const idx = buildCatalogIndex(withCombos);
    expect(idx.combos.map((c) => c.comboKey)).toEqual(["live-combo"]);
  });
});
