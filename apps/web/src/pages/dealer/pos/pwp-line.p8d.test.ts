/**
 * pwp-line — 2990s Products parity Phase 8d (cross-order voucher carry-forward,
 * migration 0188). PURE unit tests for the cross-order marker helpers:
 *   - markLinePwpWithAvailableCode stamps attrs.pwp = { ruleId, code, claimGroup,
 *     crossOrder: true } AND forces the preview price (parking the real price in
 *     origUnitPrice) — same authority contract as the same-cart P8c binding, plus
 *     the crossOrder discriminator the order route reads to pick the AVAILABLE
 *     claim RPC.
 *   - linePwpCrossOrder reads the discriminator (true only for a cross-order
 *     binding; false for same-cart / P8b / unmarked).
 * The crossOrder flag REACHING the DraftLine is the load-bearing P8d contract
 * (the server re-validates the phone binding + forces price regardless).
 */
import { describe, it, expect } from "vitest";
import type { PwpRuleDto } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import {
  linePwpCrossOrder,
  linePwpCode,
  linePwpClaimGroup,
  linePwpRuleId,
  markLinePwp,
  markLinePwpWithCode,
  markLinePwpWithAvailableCode,
} from "./pwp-line";

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

const promoRule: PwpRuleDto = { ...pwpRule, id: "rule-promo", type: "promo" };

function bedLine(over: Partial<DraftLine> = {}): DraftLine {
  return { localId: "R1", sku: "BED-A", qty: 1, attrs: null, unitPrice: 800, label: "Bed X · Queen", ...over };
}

describe("markLinePwpWithAvailableCode (P8d cross-order)", () => {
  it("stamps { ruleId, code, claimGroup, crossOrder: true } + forces the reward price", () => {
    const out = markLinePwpWithAvailableCode(bedLine(), pwpRule, 300, "PWP-9999ZZZZ", "cg-1");
    expect(out.unitPrice).toBe(300);
    expect(out.origUnitPrice).toBe(800);
    expect((out.attrs as Record<string, unknown>).pwp).toEqual({
      ruleId: "rule-pwp",
      code: "PWP-9999ZZZZ",
      claimGroup: "cg-1",
      crossOrder: true,
    });
  });

  it("crossOrder:true reaches the DraftLine — linePwpCrossOrder reads it", () => {
    const out = markLinePwpWithAvailableCode(bedLine(), pwpRule, 300, "PWP-9999ZZZZ", "cg-1");
    expect(linePwpCrossOrder(out)).toBe(true);
    expect(linePwpCode(out)).toBe("PWP-9999ZZZZ");
    expect(linePwpClaimGroup(out)).toBe("cg-1");
    expect(linePwpRuleId(out)).toBe("rule-pwp");
  });

  it("a promo rule forces FREE (0) and still carries crossOrder", () => {
    const out = markLinePwpWithAvailableCode(bedLine(), promoRule, 0, "PWP-0000AAAA", "cg-2");
    expect(out.unitPrice).toBe(0);
    expect(linePwpCrossOrder(out)).toBe(true);
  });

  it("preserves any existing non-pwp attrs while stamping the marker", () => {
    const out = markLinePwpWithAvailableCode(
      bedLine({ attrs: { combo_key: "C1" } }),
      pwpRule,
      300,
      "PWP-9999ZZZZ",
      "cg-1",
    );
    const attrs = out.attrs as Record<string, unknown>;
    expect(attrs.combo_key).toBe("C1");
    expect((attrs.pwp as { crossOrder?: boolean }).crossOrder).toBe(true);
  });
});

describe("linePwpCrossOrder discriminator", () => {
  it("false for a same-cart (P8c) binding — the marker omits crossOrder", () => {
    const same = markLinePwpWithCode(bedLine(), pwpRule, 300, "PWP-1111BBBB", "cg-1");
    expect(linePwpCrossOrder(same)).toBe(false);
    expect((same.attrs as Record<string, unknown>).pwp).not.toHaveProperty("crossOrder");
  });

  it("false for a code-less P8b claim", () => {
    expect(linePwpCrossOrder(markLinePwp(bedLine(), pwpRule, 300))).toBe(false);
  });

  it("false for an unmarked line", () => {
    expect(linePwpCrossOrder(bedLine())).toBe(false);
  });
});
