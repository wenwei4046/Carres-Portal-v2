/**
 * order-totals — delivery TRIP fee PREVIEW (0184) tests.
 *
 *  - Dormant config (0/0) → 0 result (totals unchanged / byte-identical).
 *  - Configured base + cross-category → folded in correctly.
 *  - Charged-category gate: a line outside chargedCategories → no base fee.
 *  - additionalFee + cross-category follow-up paths.
 *  - buildDeliveryRuleLines resolves category/size from the catalog + reads a
 *    sofa build's compartments.
 */
import { describe, it, expect } from "vitest";
import type { CatalogResponse } from "@carres/shared";
import { buildDeliveryRuleLines, deliveryFeePreview } from "./order-totals";

const SOFA_MODEL = "00000000-0000-0000-0000-0000000000s1";
const MAT_MODEL = "00000000-0000-0000-0000-0000000000m1";

function baseCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: SOFA_MODEL, category: "sofa", modelKey: "lounge", name: "Lounge", blurb: null, colors: null, gaps: null, sofaMode: "custom", allowedOptions: {} },
      { id: MAT_MODEL, category: "mattress", modelKey: "cloud", name: "Cloud", blurb: null, colors: null, gaps: null, sofaMode: null, allowedOptions: { sizes: ["Queen", "King"] } },
    ],
    skus: [
      { id: "s1", modelId: SOFA_MODEL, sku: "SOFA-LOUNGE", variant: "preset", variantKind: "preset", price: 3000, cost: null, supplierId: null },
      { id: "m1", modelId: MAT_MODEL, sku: "MAT-CLOUD-Q", variant: "Queen", variantKind: "size", price: 2000, cost: null, supplierId: null },
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    deliveryFeeConfig: {
      baseFee: 0,
      crossCategoryFee: 0,
      chargedCategories: ["sofa", "mattress", "bedframe"],
      mattressBedframeLeadDays: 14,
      sofaLeadDays: 21,
    },
    specialDeliveryFeeRules: [],
    ...overrides,
  };
}

const matLine = { sku: "MAT-CLOUD-Q", attrs: null };
const sofaLine = { sku: "SOFA-LOUNGE", attrs: null };

describe("deliveryFeePreview — dormant", () => {
  it("returns null when no deliveryFeeConfig in the bundle", () => {
    const catalog = baseCatalog({ deliveryFeeConfig: undefined });
    expect(deliveryFeePreview([matLine], catalog)).toBeNull();
  });

  it("dormant config (0/0) + no additional → 0 total (totals unchanged)", () => {
    const res = deliveryFeePreview([matLine], baseCatalog());
    expect(res).not.toBeNull();
    expect(res!.total).toBe(0);
    expect(res!.base).toBe(0);
    expect(res!.crossCategory).toBe(0);
  });

  it("empty cart → 0 base (no charged-category line)", () => {
    const catalog = baseCatalog({ deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100 } });
    const res = deliveryFeePreview([], catalog);
    expect(res!.base).toBe(0);
    expect(res!.total).toBe(0);
  });
});

describe("deliveryFeePreview — configured", () => {
  it("charges the base fee once when a charged-category line is present", () => {
    const catalog = baseCatalog({ deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100 } });
    const res = deliveryFeePreview([matLine], catalog);
    expect(res!.base).toBe(100);
    expect(res!.crossCategory).toBe(0);
    expect(res!.total).toBe(100);
  });

  it("adds the cross-category surcharge when sofa shares the cart with a mattress", () => {
    const catalog = baseCatalog({ deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100, crossCategoryFee: 60 } });
    const res = deliveryFeePreview([matLine, sofaLine], catalog);
    expect(res!.base).toBe(100);
    expect(res!.crossCategory).toBe(60);
    expect(res!.total).toBe(160);
  });

  it("no cross surcharge for a sofa-only cart", () => {
    const catalog = baseCatalog({ deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100, crossCategoryFee: 60 } });
    const res = deliveryFeePreview([sofaLine], catalog);
    expect(res!.crossCategory).toBe(0);
    expect(res!.total).toBe(100);
  });

  it("a category NOT in chargedCategories does not trip the base fee", () => {
    const catalog = baseCatalog({
      deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100, chargedCategories: ["sofa"] },
    });
    // mattress-only cart, but only sofa is charged → no base
    expect(deliveryFeePreview([matLine], catalog)!.base).toBe(0);
    // sofa present → base charged
    expect(deliveryFeePreview([sofaLine], catalog)!.base).toBe(100);
  });

  it("additionalFee is added on top of the base", () => {
    const catalog = baseCatalog({ deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100 } });
    const res = deliveryFeePreview([matLine], catalog, { additionalFee: 25 });
    expect(res!.additional).toBe(25);
    expect(res!.total).toBe(125);
  });

  it("cross-category follow-up replaces the base with the cross rate, no in-order cross", () => {
    const catalog = baseCatalog({
      deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100, crossCategoryFee: 40 },
    });
    const res = deliveryFeePreview([matLine, sofaLine], catalog, { isCrossCategoryFollowup: true });
    expect(res!.isFollowup).toBe(true);
    expect(res!.base).toBe(40); // the reduced cross rate
    expect(res!.crossCategory).toBe(0);
    expect(res!.total).toBe(40);
  });

  it("a matching special rule's standalone fee supersedes the base (highest wins)", () => {
    const catalog = baseCatalog({
      deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100 },
      specialDeliveryFeeRules: [
        { id: "r1", target: [{ modelId: MAT_MODEL, scope: "model" }], standaloneFee: 250, crossCategoryFollowupFee: 0, label: null, active: true, sortOrder: 0 },
      ],
    });
    const res = deliveryFeePreview([matLine], catalog);
    expect(res!.isSpecial).toBe(true);
    expect(res!.base).toBe(250);
  });
});

describe("buildDeliveryRuleLines", () => {
  it("resolves a mattress line's category + size from the catalog", () => {
    const lines = buildDeliveryRuleLines([matLine], baseCatalog());
    expect(lines).toEqual([
      { category: "mattress", modelId: MAT_MODEL, sizeCode: "QUEEN", builtCompartments: [] },
    ]);
  });

  it("reads a sofa build line's compartments from attrs.sofa_build.cells", () => {
    const buildLine = {
      sku: "SOFA-LOUNGE",
      attrs: { sofa_build: { cells: [{ moduleCode: "1A(LHF)" }, { moduleCode: "L" }], height: "32" } },
    };
    const lines = buildDeliveryRuleLines([buildLine], baseCatalog());
    expect(lines[0]).toMatchObject({ category: "sofa", builtCompartments: ["1A(LHF)", "L"] });
  });
});
