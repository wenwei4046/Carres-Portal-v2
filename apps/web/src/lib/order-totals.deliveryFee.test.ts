/**
 * order-totals — delivery TRIP fee PREVIEW (0184) tests.
 *
 *  - Dormant config (0/0) → 0 result (totals unchanged / byte-identical).
 *  - Configured base + cross-category → folded in correctly.
 *  - Charged-category gate: a line outside chargedCategories → no base fee.
 *  - additionalFee + cross-category follow-up paths.
 *  - buildDeliveryRuleLines resolves category/size from the catalog + reads a
 *    sofa build's compartments.
 *  - draftTotals folds lines + addons + stair + delivery into ONE grand total
 *    (the shared number every POS surface shows).
 */
import { describe, it, expect } from "vitest";
import type { CatalogResponse } from "@carres/shared";
import { buildDeliveryRuleLines, deliveryFeePreview, draftTotals } from "./order-totals";

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

  // PREVIEW MATH ONLY — a sofa + mattress cart is unreachable on a real Carres
  // order (the POS category mutex + migration 0089 reject it at submit, so it
  // never books); this asserts the pure preview engine, not a bookable cart.
  it("adds the cross-category surcharge when sofa shares the cart with a mattress (preview engine only — unreachable on a Carres order, 0089 mutex)", () => {
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

describe("draftTotals — the ONE grand total every POS surface shows", () => {
  // floorConfig in baseCatalog: freeUpToFloor 1, perFloorPerItem 50.
  const noStairDelivery = { floor: 1, hasLift: false, stairItems: null };

  it("grand = lines + addons + stair + delivery (the RM 2,570 vs RM 2,920 mismatch)", () => {
    const catalog = baseCatalog({
      deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100 },
    });
    const t = draftTotals(
      {
        lines: [{ ...matLine, qty: 1, unitPrice: 2000 }],
        addons: [{ qty: 2, unitPrice: 80 }],
        /* `stairItems` is STATED — unset means NONE since the 2026-08-27
           ruling, so a null here would zero the stair leg and stop this test
           checking the grand total it is named for. */
        delivery: { floor: 3, hasLift: false, stairItems: 1 },
      },
      catalog,
    );
    expect(t.lineSub).toBe(2000);
    expect(t.addonSub).toBe(160);
    expect(t.stair).toBe(100); // (3−1) flights × 50 × 1 item
    expect(t.deliveryTotal).toBe(100);
    expect(t.grand).toBe(2360);
  });

  it("respects the dealer-picked stairItems count, clamped to the cart's units", () => {
    const lines = [{ ...matLine, qty: 3, unitPrice: 1000 }];
    const pick = (stairItems: number | null) =>
      draftTotals(
        { lines, addons: [], delivery: { floor: 3, hasLift: false, stairItems } },
        baseCatalog(),
      ).stair;
    /* ⭐ `null` USED TO MEAN ALL 3 UNITS and now means none — owner ruling
       2026-08-27 (YH). Somebody has to say how many pieces need carrying
       before the customer is charged for carrying them. The clamp above it is
       untouched, which is what the rest of this test is for. */
    expect(pick(null)).toBe(0); // nobody said → nothing charged
    expect(pick(1)).toBe(100); // dealer charged only 1 unit
    expect(pick(3)).toBe(300); // all 3 units, stated
    expect(pick(99)).toBe(300); // clamped to the 3 units in the cart
  });

  it("no deliveryFeeConfig in the bundle → delivery null, grand still includes stair", () => {
    const t = draftTotals(
      {
        lines: [{ ...matLine, qty: 1, unitPrice: 500 }],
        addons: [{ qty: 2, unitPrice: 80 }],
        delivery: { floor: 3, hasLift: false, stairItems: 1 },
      },
      baseCatalog({ deliveryFeeConfig: undefined }),
    );
    expect(t.delivery).toBeNull();
    expect(t.deliveryTotal).toBe(0);
    expect(t.grand).toBe(500 + 160 + 100);
  });

  it("threads additionalDeliveryFee + the cross-category follow-up flag into the preview", () => {
    const catalog = baseCatalog({
      deliveryFeeConfig: { ...baseCatalog().deliveryFeeConfig!, baseFee: 100, crossCategoryFee: 40 },
    });
    const t = draftTotals(
      {
        lines: [{ ...matLine, qty: 1, unitPrice: 500 }],
        addons: [],
        delivery: noStairDelivery,
        additionalDeliveryFee: 25,
        crossCategorySourceSo: " SO-1042 ", // whitespace-only would NOT count
      },
      catalog,
    );
    expect(t.delivery!.isFollowup).toBe(true);
    expect(t.delivery!.base).toBe(40); // follow-up rate replaces the base
    expect(t.delivery!.additional).toBe(25);
    expect(t.grand).toBe(500 + 40 + 25);
  });

  it("a negative additionalDeliveryFee is clamped to 0", () => {
    const t = draftTotals(
      {
        lines: [{ ...matLine, qty: 1, unitPrice: 500 }],
        addons: [],
        delivery: noStairDelivery,
        additionalDeliveryFee: -50,
      },
      baseCatalog(),
    );
    expect(t.grand).toBe(500);
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
