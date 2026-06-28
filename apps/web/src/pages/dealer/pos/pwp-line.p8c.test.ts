/**
 * POS PWP voucher state-machine helpers (2990s Products parity Phase 8c, migration
 * 0187). PURE — asserts the P8c additions to `pwp-line.ts`:
 *   - `triggerLinesInCart` detects the cart's TRIGGER lines (sku matching an
 *     active rule's trigger scope), mirroring the server reserve route's matcher;
 *   - `markLinePwpWithCode` binds `{ ruleId, code, claimGroup }` onto attrs.pwp +
 *     forces the preview price (the P8b code-less marker stays `{ ruleId }`);
 *   - `linePwpCode` / `linePwpClaimGroup` read the bound fields back.
 * DORMANT when nothing is configured (no trigger lines, no codes).
 */
import { describe, it, expect } from "vitest";
import type { CatalogResponse, PwpRuleDto } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import {
  linePwpClaimGroup,
  linePwpCode,
  markLinePwpWithCode,
  triggerLinesInCart,
} from "./pwp-line";

const MATT = "22222222-2222-2222-2222-222222222222";
const BED = "55555555-5555-5555-5555-555555555555";

function sku(
  over: Partial<CatalogResponse["skus"][number]> & { sku: string; modelId: string },
) {
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

function catalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: MATT, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: BED, category: "bedframe", modelKey: "bed-x", name: "Bed X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      sku({ sku: "MATT-A", modelId: MATT }),
      sku({ sku: "BED-A", modelId: BED, price: 800, description: "Bed Frame", pwpPrice: 300 }),
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    combos: [],
    sofaCombos: [],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    pwpRules: [],
    ...over,
  };
}

function line(over: Partial<DraftLine> = {}): DraftLine {
  return { localId: "L1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen", ...over };
}

const pwpRule: PwpRuleDto = {
  id: "rule-pwp",
  type: "pwp",
  triggerCategory: "mattress",
  triggerTargets: [],
  rewardCategory: "bedframe",
  rewardTargets: [],
  qtyPerTrigger: 1,
  active: true,
};

const mattLine = (over: Partial<DraftLine> = {}): DraftLine =>
  line({ localId: "T1", sku: "MATT-A", label: "Matt X · Queen", ...over });
const bedLine = (over: Partial<DraftLine> = {}): DraftLine =>
  line({ localId: "R1", sku: "BED-A", unitPrice: 800, label: "Bed X · Queen", ...over });

describe("triggerLinesInCart", () => {
  it("DORMANT: no rules → []", () => {
    expect(triggerLinesInCart([mattLine(), bedLine()], catalog())).toEqual([]);
  });

  it("returns the mattress TRIGGER line (matches the rule's trigger scope), not the bedframe reward", () => {
    const cat = catalog({ pwpRules: [pwpRule] });
    const triggers = triggerLinesInCart([mattLine({ qty: 2 }), bedLine()], cat);
    expect(triggers).toEqual([{ cartLineKey: "T1", sku: "MATT-A", qty: 2 }]);
  });

  it("a reward-only cart (no trigger) → []", () => {
    const cat = catalog({ pwpRules: [pwpRule] });
    expect(triggerLinesInCart([bedLine()], cat)).toEqual([]);
  });

  it("an inactive rule contributes no trigger", () => {
    const cat = catalog({ pwpRules: [{ ...pwpRule, active: false }] });
    expect(triggerLinesInCart([mattLine(), bedLine()], cat)).toEqual([]);
  });
});

describe("markLinePwpWithCode + accessors", () => {
  it("binds { ruleId, code, claimGroup } onto attrs.pwp + forces the price", () => {
    const next = markLinePwpWithCode(bedLine(), pwpRule, 300, "PWP-1234ABCD", "cg-1");
    expect(next.unitPrice).toBe(300);
    expect(next.origUnitPrice).toBe(800);
    expect((next.attrs as Record<string, unknown>).pwp).toEqual({
      ruleId: "rule-pwp",
      code: "PWP-1234ABCD",
      claimGroup: "cg-1",
    });
    expect(linePwpCode(next)).toBe("PWP-1234ABCD");
    expect(linePwpClaimGroup(next)).toBe("cg-1");
  });

  it("a P8b code-less line reads null code/claimGroup", () => {
    const l = bedLine({ attrs: { pwp: { ruleId: "rule-pwp" } } });
    expect(linePwpCode(l)).toBeNull();
    expect(linePwpClaimGroup(l)).toBeNull();
  });

  it("an unmarked line reads null code/claimGroup", () => {
    expect(linePwpCode(bedLine())).toBeNull();
    expect(linePwpClaimGroup(bedLine())).toBeNull();
  });
});
