/**
 * POS PWP / promo preview helpers (2990s Products parity Phase 8b, migration
 * 0186). PURE — asserts the shared-resolver wiring (the toggle is offered ONLY
 * when `resolvePwp` would grant the line), the honest-pricing invariant (preview
 * price == the server-forced price), and the marker round-trip. DORMANT when
 * nothing is configured.
 */
import { describe, it, expect } from "vitest";
import type { CatalogResponse, PwpRuleDto } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import {
  coveringPwpForLine,
  isLinePwp,
  linePwpRuleId,
  markLinePwp,
  pwpRewardPrice,
  unmarkLinePwp,
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

/** A 'pwp' rule: buy a MATTRESS trigger → reward a BEDFRAME at its pwp_price. */
const pwpRule: PwpRuleDto = {
  id: "rule-pwp",
  type: "pwp",
  triggerCategory: "mattress",
  triggerTargets: [],
  rewardCategory: "bedframe",
  rewardTargets: [],
  qtyPerTrigger: 1,
  active: true,
  carryForward: true,
  carryForwardDays: null,
};

/** A 'promo' rule: buy a MATTRESS → reward a BEDFRAME FREE. */
const promoRule: PwpRuleDto = { ...pwpRule, id: "rule-promo", type: "promo" };

const mattLine = (): DraftLine => line({ localId: "T1", sku: "MATT-A", label: "Matt X · Queen" });
const bedLine = (over: Partial<DraftLine> = {}): DraftLine =>
  line({ localId: "R1", sku: "BED-A", unitPrice: 800, label: "Bed X · Queen", ...over });

describe("coveringPwpForLine", () => {
  it("DORMANT: no rules → []", () => {
    const cat = catalog();
    expect(coveringPwpForLine(bedLine(), [mattLine(), bedLine()], cat)).toEqual([]);
  });

  it("offers the rule when a qualifying trigger is in the cart with spare allowance", () => {
    const cat = catalog({ pwpRules: [pwpRule] });
    const lines = [mattLine(), bedLine()];
    expect(coveringPwpForLine(bedLine(), lines, cat).map((r) => r.id)).toEqual(["rule-pwp"]);
  });

  it("no trigger in the cart → not offered", () => {
    const cat = catalog({ pwpRules: [pwpRule] });
    const lines = [bedLine()]; // reward only, no mattress trigger
    expect(coveringPwpForLine(bedLine(), lines, cat)).toEqual([]);
  });

  it("an inactive rule is never offered", () => {
    const cat = catalog({ pwpRules: [{ ...pwpRule, active: false }] });
    const lines = [mattLine(), bedLine()];
    expect(coveringPwpForLine(bedLine(), lines, cat)).toEqual([]);
  });

  it("a 'pwp' rule whose reward sku has NO pwpPrice is not offered (server would 409)", () => {
    const cat = catalog({
      skus: [sku({ sku: "MATT-A", modelId: MATT }), sku({ sku: "BED-A", modelId: BED, pwpPrice: null })],
      pwpRules: [pwpRule],
    });
    const lines = [mattLine(), bedLine()];
    expect(coveringPwpForLine(bedLine(), lines, cat)).toEqual([]);
  });

  it("over-allowance: a 2nd reward line beyond the trigger's allowance is not offered", () => {
    const cat = catalog({ pwpRules: [pwpRule] }); // qtyPerTrigger 1, one trigger → allowance 1
    const r1 = bedLine({ localId: "R1" });
    const r2 = bedLine({ localId: "R2" });
    // R1 claims it (consuming the single slot); R2 should NOT be offerable when R1
    // is already PWP-claimed.
    const claimedR1 = markLinePwp(r1, pwpRule, 300);
    const lines = [mattLine(), claimedR1, r2];
    expect(coveringPwpForLine(r2, lines, cat)).toEqual([]);
  });

  it("Hard rule #1 — never offered on a sofa-build line (returns [])", () => {
    const cat = catalog({ pwpRules: [pwpRule] });
    const build = bedLine({ attrs: { sofa_build: { cells: [{ moduleCode: "2A" }], height: "28" } } });
    expect(coveringPwpForLine(build, [mattLine(), build], cat)).toEqual([]);
  });

  it("a promo rule is offered (no pwpPrice needed, reward is free)", () => {
    const cat = catalog({ pwpRules: [promoRule] });
    const lines = [mattLine(), bedLine()];
    expect(coveringPwpForLine(bedLine(), lines, cat).map((r) => r.id)).toEqual(["rule-promo"]);
  });
});

describe("pwpRewardPrice (honest-pricing)", () => {
  it("a 'pwp' rule returns the sku's pwpPrice", () => {
    expect(pwpRewardPrice(bedLine(), catalog(), pwpRule)).toBe(300);
  });

  it("a 'promo' rule returns 0", () => {
    expect(pwpRewardPrice(bedLine(), catalog(), promoRule)).toBe(0);
  });

  it("a 'pwp' rule with no pwpPrice returns null (not offerable)", () => {
    const cat = catalog({
      skus: [sku({ sku: "MATT-A", modelId: MATT }), sku({ sku: "BED-A", modelId: BED, pwpPrice: null })],
    });
    expect(pwpRewardPrice(bedLine(), cat, pwpRule)).toBeNull();
  });
});

describe("markLinePwp / unmarkLinePwp", () => {
  it("marking forces unitPrice to the reward price, stamps { ruleId } only, parks the real price", () => {
    const marked = markLinePwp(bedLine(), pwpRule, 300);
    expect(marked.unitPrice).toBe(300);
    expect(marked.origUnitPrice).toBe(800);
    // ANTI-TAMPER: the client marker carries ONLY ruleId — the server re-derives
    // type + triggerRef + the price.
    expect((marked.attrs as Record<string, unknown>).pwp).toEqual({ ruleId: "rule-pwp" });
    expect(isLinePwp(marked)).toBe(true);
    expect(linePwpRuleId(marked)).toBe("rule-pwp");
  });

  it("a promo claim forces unitPrice 0", () => {
    const marked = markLinePwp(bedLine(), promoRule, 0);
    expect(marked.unitPrice).toBe(0);
    expect((marked.attrs as Record<string, unknown>).pwp).toEqual({ ruleId: "rule-promo" });
  });

  it("unmarking restores the real price + strips the marker (round-trips)", () => {
    const orig = bedLine({ attrs: { mode: "x" } });
    const reverted = unmarkLinePwp(markLinePwp(orig, pwpRule, 300));
    expect(reverted.unitPrice).toBe(800);
    expect(reverted.origUnitPrice).toBeUndefined();
    expect((reverted.attrs as Record<string, unknown>).pwp).toBeUndefined();
    expect((reverted.attrs as Record<string, unknown>).mode).toBe("x"); // unrelated attrs preserved
    expect(isLinePwp(reverted)).toBe(false);
  });

  it("preview-equals-server invariant: the marked unitPrice == pwpRewardPrice", () => {
    // The honesty guard — the price stamped by markLinePwp is the SAME figure the
    // server forces, because both read catalog.skus[].pwpPrice.
    const cat = catalog({ pwpRules: [pwpRule] });
    const price = pwpRewardPrice(bedLine(), cat, pwpRule)!;
    const marked = markLinePwp(bedLine(), pwpRule, price);
    expect(marked.unitPrice).toBe(300);
  });
});
