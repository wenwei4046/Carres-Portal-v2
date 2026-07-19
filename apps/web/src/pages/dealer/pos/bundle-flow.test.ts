import { describe, expect, it } from "vitest";
import type { CatalogResponse, ProductBundleDto } from "@carres/shared";
import { assembleBundleLines, bundleNeedsConfig, deriveBundleSlots, slotNeedsConfig } from "./bundle-flow";

const CATALOG = {
  models: [
    { id: "m-mat", category: "mattress", modelKey: "cloud", name: "Cloud", blurb: null, colors: null, gaps: null, sofaMode: null },
    { id: "m-bed", category: "bedframe", modelKey: "kayu", name: "Kayu", blurb: null, colors: null, gaps: null, sofaMode: null },
  ],
  skus: [
    { id: "s1", modelId: "m-mat", sku: "MAT-K", variant: "King", variantKind: "size", price: 3000, cost: null, supplierId: null },
    { id: "s2", modelId: "m-mat", sku: "MAT-Q", variant: "Queen", variantKind: "size", price: 2500, cost: null, supplierId: null },
    { id: "s3", modelId: "m-bed", sku: "BED-K", variant: "King", variantKind: "size", price: 2000, cost: null, supplierId: null },
  ],
  sofaFabrics: [],
  addons: [],
  floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
} as unknown as CatalogResponse;

const bundle = (over: Partial<ProductBundleDto>): ProductBundleDto => ({
  id: "b1",
  name: "Set",
  price: 4000,
  kind: "fixed",
  components: [],
  slots: [],
  active: true,
  sortOrder: 0,
  ...over,
});

describe("bundle-flow", () => {
  it("derives pinned slots from a fixed bundle's components", () => {
    const b = bundle({ components: [{ sku: "MAT-K", qty: 1 }, { sku: "BED-K", qty: 2 }] });
    const slots = deriveBundleSlots(b, (sku) => CATALOG.skus.find((s) => s.sku === sku)?.modelId ?? null);
    expect(slots).toEqual([
      { qty: 1, modelIds: ["m-mat"], variant: "fixed", sku: "MAT-K" },
      { qty: 2, modelIds: ["m-bed"], variant: "fixed", sku: "BED-K" },
    ]);
  });

  it("slotNeedsConfig: bedframe always; pinned mattress no; any-variant multi-sku mattress yes", () => {
    expect(slotNeedsConfig({ qty: 1, modelIds: ["m-bed"], variant: "fixed", sku: "BED-K" }, CATALOG)).toBe(true);
    expect(slotNeedsConfig({ qty: 1, modelIds: ["m-mat"], variant: "fixed", sku: "MAT-K" }, CATALOG)).toBe(false);
    expect(slotNeedsConfig({ qty: 1, modelIds: ["m-mat"], variant: "any" }, CATALOG)).toBe(true);
  });

  it("bundleNeedsConfig: mattress-only fixed bundle direct-adds; bedframe bundle walks; custom always walks", () => {
    expect(bundleNeedsConfig(bundle({ components: [{ sku: "MAT-K", qty: 1 }, { sku: "MAT-Q", qty: 1 }] }), CATALOG)).toBe(false);
    expect(bundleNeedsConfig(bundle({ components: [{ sku: "MAT-K", qty: 1 }, { sku: "BED-K", qty: 1 }] }), CATALOG)).toBe(true);
    expect(
      bundleNeedsConfig(
        bundle({ kind: "custom", slots: [{ qty: 1, modelIds: ["m-mat"], variant: "any" }] }),
        CATALOG,
      ),
    ).toBe(true);
  });

  it("assembleBundleLines: Σ = bundle price + spec surcharges; attrs merge the bundle markers", () => {
    const lines = assembleBundleLines(
      { id: "b1", name: "Set", price: 4000 },
      [
        { sku: "MAT-K", catalogPrice: 3000, unitPrice: 3000, qty: 1, attrs: null, label: "Cloud · King" },
        { sku: "BED-K", catalogPrice: 2000, unitPrice: 2150, qty: 1, attrs: { options: [{ kind: "fabric", value: "BF-01", surcharge: 150 }], options_total: 150 }, label: "Kayu · King · BF-01" },
      ],
      "grp-1",
    );
    expect(lines).not.toBeNull();
    const cents = lines!.reduce((s, l) => s + Math.round(l.unitPrice * 100) * l.qty, 0);
    expect(cents).toBe(400000 + 15000); // bundle + the fabric surcharge
    const bed = lines!.find((l) => l.sku === "BED-K")!;
    expect(bed.attrs.options_total).toBe(150);
    expect(bed.attrs.bundle_key).toBe("b1");
    expect(bed.attrs.bundle_group).toBe("grp-1");
    // The mattress line carries the split share of 4000 (weights 3000/2000).
    const mat = lines!.find((l) => l.sku === "MAT-K")!;
    expect(mat.unitPrice).toBe(2400);
    expect(bed.unitPrice).toBe(1600 + 150);
  });

  it("assembleBundleLines refuses when a pick is unpriceable", () => {
    expect(
      assembleBundleLines({ id: "b1", name: "Set", price: 100 }, [], "g"),
    ).toBeNull();
  });
});
