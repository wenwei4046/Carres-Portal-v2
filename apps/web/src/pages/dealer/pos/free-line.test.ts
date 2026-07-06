/**
 * POS free-gift / free-item preview helpers (2990s Products parity Phase 7).
 * PURE — asserts the resolver wiring + the Make-free toggle, both DORMANT when
 * nothing is configured.
 */
import { describe, it, expect } from "vitest";
import type { CatalogResponse, FreeItemCampaign } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import {
  coveringCampaignsForLine,
  isLineFreeItem,
  markLineFree,
  previewDefaultGifts,
  unmarkLineFree,
} from "./free-line";

const MATT = "22222222-2222-2222-2222-222222222222";
const ACC = "44444444-4444-4444-4444-444444444444";

function sku(over: Partial<CatalogResponse["skus"][number]> & { sku: string; modelId: string }) {
  return {
    id: `id-${over.sku}`,
    variant: "Queen",
    variantKind: "size" as const,
    price: 1200,
    cost: null,
    supplierId: null,
    posActive: true,
    description: `${over.sku} desc`,
    ...over,
  };
}

function catalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: MATT, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: ACC, category: "accessory", modelKey: "acc-x", name: "Acc X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      sku({ sku: "MATT-A", modelId: MATT }),
      sku({ sku: "PILLOW", modelId: ACC, price: 100, description: "Memory Pillow" }),
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    sofaCombos: [],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    ...over,
  };
}

function line(over: Partial<DraftLine> = {}): DraftLine {
  return { localId: "L1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen", ...over };
}

describe("previewDefaultGifts", () => {
  it("DORMANT: no config → []", () => {
    expect(previewDefaultGifts([line()], catalog())).toEqual([]);
  });

  it("resolves a model's gift, naming it from the sku description (one row per source model)", () => {
    const cat = catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] }] });
    const rows = previewDefaultGifts([line()], cat);
    expect(rows).toEqual([{ giftSku: "PILLOW", qty: 1, name: "Memory Pillow", sourceModelId: MATT }]);
  });

  it("a campaign-freed item KEEPS its default gift ('Make free' must not strip the GWP)", () => {
    const cat = catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] }] });
    const freed = line({ attrs: { free_item: { campaignId: "c1" } } });
    expect(previewDefaultGifts([freed], cat)).toEqual([
      { giftSku: "PILLOW", qty: 1, name: "Memory Pillow", sourceModelId: MATT },
    ]);
  });

  it("an appended gift line never triggers another gift (no recursion)", () => {
    const cat = catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] }] });
    const giftLine = line({ attrs: { free_gift: { giftSku: "PILLOW" } } });
    expect(previewDefaultGifts([giftLine], cat)).toEqual([]);
  });

  it("non-sofa gift qty scales by line qty", () => {
    const cat = catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] }] });
    const rows = previewDefaultGifts([line({ qty: 3 })], cat);
    expect(rows[0]!.qty).toBe(3);
  });

  it("F7a — hides a gift whose sku is NOT a real accessory (mirrors server fail-soft)", () => {
    // MATT-A is a mattress sku, not an accessory → the server would fail-soft drop
    // it, so the preview must hide it too.
    const cat = catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "MATT-A", qty: 1 }] }] });
    expect(previewDefaultGifts([line()], cat)).toEqual([]);
  });

  it("F7b — same gift sku from TWO source models → two rows (not merged across models)", () => {
    const MATT2 = "33333333-3333-3333-3333-333333333333";
    const cat = catalog({
      models: [
        { id: MATT, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
        { id: MATT2, category: "mattress", modelKey: "matt-y", name: "Matt Y", blurb: null, colors: null, gaps: null, sofaMode: null },
        { id: ACC, category: "accessory", modelKey: "acc-x", name: "Acc X", blurb: null, colors: null, gaps: null, sofaMode: null },
      ],
      skus: [
        sku({ sku: "MATT-A", modelId: MATT }),
        sku({ sku: "MATT-B", modelId: MATT2 }),
        sku({ sku: "PILLOW", modelId: ACC, price: 100, description: "Memory Pillow" }),
      ],
      modelDefaultFreeGifts: [
        { modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] },
        { modelId: MATT2, gifts: [{ giftSku: "PILLOW", qty: 1 }] },
      ],
    });
    const rows = previewDefaultGifts(
      [line({ localId: "L1", sku: "MATT-A" }), line({ localId: "L2", sku: "MATT-B" })],
      cat,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sourceModelId).sort()).toEqual([MATT, MATT2].sort());
    expect(rows.every((r) => r.giftSku === "PILLOW")).toBe(true);
  });
});

describe("coveringCampaignsForLine", () => {
  const campaign: FreeItemCampaign = {
    id: "camp-1",
    name: "Pillow promo",
    active: true,
    maxFreeQty: 2,
    eligible: [{ modelId: MATT, scope: "model" }],
  };

  it("DORMANT: no campaigns → []", () => {
    expect(coveringCampaignsForLine(line(), catalog())).toEqual([]);
  });

  it("returns an active covering campaign", () => {
    const cat = catalog({ freeItemCampaigns: [campaign] });
    expect(coveringCampaignsForLine(line(), cat).map((c) => c.id)).toEqual(["camp-1"]);
  });

  it("an inactive campaign does not cover", () => {
    const cat = catalog({ freeItemCampaigns: [{ ...campaign, active: false }] });
    expect(coveringCampaignsForLine(line(), cat)).toEqual([]);
  });

  it("a campaign for a different model does not cover", () => {
    const cat = catalog({ freeItemCampaigns: [{ ...campaign, eligible: [{ modelId: ACC, scope: "model" }] }] });
    expect(coveringCampaignsForLine(line(), cat)).toEqual([]);
  });

  it("F2 — never offers Make-free on a sofa-build line (returns [])", () => {
    const cat = catalog({ freeItemCampaigns: [campaign] });
    const buildLine = line({ attrs: { sofa_build: { cells: [{ moduleCode: "2A" }], height: "28" } } });
    expect(coveringCampaignsForLine(buildLine, cat)).toEqual([]);
  });
});

describe("markLineFree / unmarkLineFree", () => {
  const campaign: FreeItemCampaign = { id: "camp-1", name: "Pillow promo", active: true, maxFreeQty: 2, eligible: [] };

  it("marking forces unitPrice 0, stamps the marker, parks the real price", () => {
    const marked = markLineFree(line({ unitPrice: 1200 }), campaign);
    expect(marked.unitPrice).toBe(0);
    expect(marked.origUnitPrice).toBe(1200);
    expect((marked.attrs as Record<string, unknown>).free_item).toEqual({ campaignId: "camp-1", name: "Pillow promo" });
    expect(isLineFreeItem(marked)).toBe(true);
  });

  it("unmarking restores the real price + strips the marker (round-trips)", () => {
    const orig = line({ unitPrice: 1200, attrs: { mode: "x" } });
    const reverted = unmarkLineFree(markLineFree(orig, campaign));
    expect(reverted.unitPrice).toBe(1200);
    expect(reverted.origUnitPrice).toBeUndefined();
    expect((reverted.attrs as Record<string, unknown>).free_item).toBeUndefined();
    // unrelated attrs preserved
    expect((reverted.attrs as Record<string, unknown>).mode).toBe("x");
    expect(isLineFreeItem(reverted)).toBe(false);
  });
});
