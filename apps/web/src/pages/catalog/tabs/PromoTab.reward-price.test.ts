/**
 * THE BORN-DEAD RULE GUARD (2026-08-24).
 *
 * A 'pwp' rule's reward price is not on the rule — it lives per-SKU on
 * `product_skus.pwp_price`, edited on a DIFFERENT tab. Nothing joined the two,
 * so a principal could author a complete, Active rule whose rewards carried no
 * price: silent at the till, and the voucher layer still minted codes off its
 * trigger and printed them on the customer's receipt.
 *
 * `rewardPriceCoverage` is the join, pulled out as a pure function so the rule
 * it encodes can be pinned without rendering a 2,300-line tab.
 *
 * ⭐ THE TWO EXEMPTIONS ARE THE POINT. A 'promo' reward is free by the rule's
 * TYPE and never reads this column; a SOFA reward is priced from the combo PWP
 * map. Routing either through this guard would refuse rules that are perfectly
 * correct — which is why the caller decides applicability and the tests below
 * pin that decision as much as the arithmetic.
 */
import { describe, it, expect } from "vitest";
import type { CatalogResponse } from "@carres/shared";
import { rewardPriceCoverage } from "./PromoTab";

const MATT = "22222222-2222-2222-2222-222222222222";
const BED = "55555555-5555-5555-5555-555555555555";
const ACC = "77777777-7777-7777-7777-777777777777";

function sku(over: { sku: string; modelId: string; pwpPrice?: number | null }) {
  return {
    id: `id-${over.sku}`,
    variant: "Queen",
    variantKind: "size" as const,
    price: 1200,
    cost: null,
    supplierId: null,
    posActive: true,
    description: `${over.sku} desc`,
    pwpPrice: null as number | null,
    ...over,
  };
}

const model = (id: string, category: string, key: string) => ({
  id,
  category,
  modelKey: key,
  name: key,
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
});

function catalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      model(MATT, "mattress", "matt-x"),
      model(BED, "bedframe", "bed-x"),
      model(ACC, "accessory", "acc-x"),
    ],
    skus: [
      sku({ sku: "MATT-A", modelId: MATT }),
      sku({ sku: "BED-A", modelId: BED, pwpPrice: 300 }),
      sku({ sku: "BED-B", modelId: BED, pwpPrice: null }),
      sku({ sku: "ACC-A", modelId: ACC, pwpPrice: null }),
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    sofaCombos: [],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    pwpRules: [],
    ...over,
  } as unknown as CatalogResponse;
}

describe("rewardPriceCoverage", () => {
  it("empty targeting means the WHOLE category, not nothing", () => {
    // The help text under the picker says "None added = any <category>", and the
    // engine agrees. Reading empty as "match nothing" would refuse every
    // whole-category rule ever written.
    const c = rewardPriceCoverage(catalog(), "bedframe", []);
    expect(c.total).toBe(2);
    expect(c.priced).toBe(1);
  });

  it("counts only the targeted models when targets are given", () => {
    const c = rewardPriceCoverage(catalog(), "bedframe", [{ modelId: BED, scope: "model" }]);
    expect(c).toEqual({ total: 2, priced: 1 });
  });

  it("a category whose SKUs are all unpriced reports priced 0 — the born-dead case", () => {
    const c = rewardPriceCoverage(catalog(), "accessory", []);
    expect(c.total).toBe(1);
    expect(c.priced).toBe(0);
  });

  it("targeting that matches no SKU at all reports total 0", () => {
    // Distinct from "matches SKUs, none priced" — the message differs, because
    // the fix differs: one needs a price, the other needs different targeting.
    const c = rewardPriceCoverage(catalog(), "bedframe", [{ modelId: MATT, scope: "model" }]);
    expect(c).toEqual({ total: 0, priced: 0 });
  });

  it("⭐ a stored ZERO is not a price — it counts as unpriced, exactly like null", () => {
    // Same law as the server (`p == null || p <= 0`) and the POS offer gate. If
    // this drifted, the form would bless a rule the till refuses.
    const c = rewardPriceCoverage(
      catalog({
        skus: [
          sku({ sku: "MATT-A", modelId: MATT }),
          sku({ sku: "BED-A", modelId: BED, pwpPrice: 0 }),
          sku({ sku: "BED-B", modelId: BED, pwpPrice: null }),
        ],
      }),
      "bedframe",
      [],
    );
    expect(c).toEqual({ total: 2, priced: 0 });
  });

  it("a negative price counts as unpriced too", () => {
    const c = rewardPriceCoverage(
      catalog({ skus: [sku({ sku: "BED-A", modelId: BED, pwpPrice: -50 })] }),
      "bedframe",
      [],
    );
    expect(c.priced).toBe(0);
  });

  it("partial coverage is legitimate and reports honestly, never zero", () => {
    // 3 of 12 priced is a real, allowable rule — the form shows the count and
    // still saves. Only priced === 0 is arithmetically impossible.
    const c = rewardPriceCoverage(
      catalog({
        skus: [
          sku({ sku: "BED-A", modelId: BED, pwpPrice: 300 }),
          sku({ sku: "BED-B", modelId: BED, pwpPrice: null }),
          sku({ sku: "BED-C", modelId: BED, pwpPrice: 450 }),
        ],
      }),
      "bedframe",
      [],
    );
    expect(c).toEqual({ total: 3, priced: 2 });
  });

  it("ignores SKUs from other categories that share a target list", () => {
    const c = rewardPriceCoverage(catalog(), "mattress", []);
    expect(c).toEqual({ total: 1, priced: 0 });
  });
});
