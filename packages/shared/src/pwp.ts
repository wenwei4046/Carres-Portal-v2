// ----------------------------------------------------------------------------
// Purchase-with-purchase (PWP / 换购优惠) + Promo (买X送X) — the SOLE source of
// truth for which reward lines in an order get the PWP/promo price. PURE — no I/O.
//
// Buying a TRIGGER (a scoped product) unlocks buying a REWARD (a scoped product)
// at its PWP price ('pwp') or FREE ('promo'). The POS configurator (to show the
// toggle + price) AND the server recompute (to lock the price + anti-tamper) will
// import THIS same function so the figure cannot drift (honest-pricing). The
// reward PRICE is NOT on the rule — it lives per-SKU (product_skus.pwp_price) /
// per-sofa-combo (sofa_combo_pricing.pwp_prices_by_height); this module only
// decides WHICH lines are eligible + which trigger they bind to.
//
//   allowance(rule) = qtyPerTrigger × (Σ qty of eligible trigger lines)
//
// Each reward line that the salesperson toggled on is granted greedily by order
// (idx), consuming its qty from the allowance — whole-line, all-or-nothing
// (a line whose qty exceeds the remaining allowance is simply NOT granted; the
// POS hides its toggle rather than splitting the line). A granted line is bound
// to a specific trigger unit (the item it is "redeemed against") so the invoice
// can print "PWP Price · 换购自 <Trigger>". POS-SELLING only.
//
// Ported FAITHFULLY from 2990s `packages/shared/src/pwp.ts`, adapted to Carres:
// the 2990s engine scoped triggers/rewards with separate columns
// (triggerEligibleModelIds + triggerSizeCodes + triggerCompartments +
// triggerComboIds) and imported 2990s's `passesRefinementColumns`. Carres has no
// such columns — it expresses scope with the P6 **RuleTarget[]** abstraction (the
// same adaptation the P7 `free-item-campaign.ts` made) and reuses
// `lineMatchesTargets` from `rule-target.ts`. So a line is a TRIGGER iff its
// (UPPERCASED) category equals the rule's triggerCategory AND `lineMatchesTargets`
// covers it with the rule's triggerTargets; a REWARD iff the reward equivalents.
// Empty triggerTargets / rewardTargets => `lineMatchesTargets` returns true =>
// the whole (category-scoped) category — the 2990s `[]` semantic. PURE: no IO, no
// Supabase, no React. Reuses rule-target.ts for all matching.
// ----------------------------------------------------------------------------
import {
  lineMatchesTargets,
  parseRuleTargets,
  type RuleLineInput,
  type RuleTarget,
} from "./rule-target";

export interface PwpRule {
  /** 'pwp' = reward at its per-SKU pwp_price; 'promo' = reward FREE. Promo is
   *  ONE-WAY (Loo 2026-06-06): a line that is itself a reward never creates
   *  trigger slots for a promo rule — a free ARRUS must not free another ARRUS.
   *  'pwp' rules are unaffected (rewards may chain into further 换购). Optional —
   *  absent reads as 'pwp'. */
  type: "pwp" | "promo";
  /** UPPERCASE mfg category of the qualifying TRIGGER, e.g. 'MATTRESS'. */
  triggerCategory: string;
  /** P6 RuleTarget[] scoping the trigger (model|variant|combo|compartment).
   *  [] = the whole trigger category (the 2990s "[] = whole category" semantic;
   *  NO free-item-style `eligible.length>0` guard — empty-within-a-category is
   *  intentional for PWP). */
  triggerTargets: RuleTarget[];
  /** UPPERCASE mfg category of the REWARD, e.g. 'BEDFRAME'. */
  rewardCategory: string;
  /** P6 RuleTarget[] scoping the reward. [] = the whole reward category. */
  rewardTargets: RuleTarget[];
  /** Reward units unlocked per qualifying trigger unit (>= 1). */
  qtyPerTrigger: number;
}

export interface PwpLineInput extends RuleLineInput {
  /** Stable line index (cart line order / order item order). */
  idx: number;
  /** Units on this line (>= 0). */
  qty: number;
  /** Display label of the product (for the trigger reference on the invoice). */
  productName?: string;
  /** Product code (for the trigger reference). */
  productCode?: string;
  /** The salesperson toggled "use PWP price" on this reward line. */
  pwpRequested: boolean;
  /** This line IS a reward already (bought with a PWP/promo grant). Reward lines
   *  still trigger 'pwp' rules but never 'promo' rules (one-way). */
  isReward?: boolean;
}

export interface PwpGrant {
  /** The reward line (idx) that is granted the PWP/promo price. */
  idx: number;
  /** The trigger unit this reward is redeemed against (for the invoice), or null. */
  triggerRef: { name: string; code: string } | null;
}

/** Coerce raw jsonb into a clean RuleTarget[] for a PWP trigger/reward scope.
 *  Thin wrapper over `parseRuleTargets` (mirrors `parseFreeItemEligible`) so
 *  callers read intent at the rule boundary. */
export function parsePwpTargets(raw: unknown): RuleTarget[] {
  return parseRuleTargets(raw);
}

/** PwpLineInput → the RuleLineInput shape the P6 matcher needs. */
const toRuleLine = (l: PwpLineInput): RuleLineInput => ({
  category: l.category,
  modelId: l.modelId,
  sizeCode: l.sizeCode ?? null,
  builtCompartments: l.builtCompartments ?? [],
});

const safeQty = (n: number): number => {
  const q = Math.floor(Number(n) || 0);
  return q > 0 ? q : 0;
};

const upper = (s: string): string => String(s ?? "").toUpperCase();

/**
 * Decide, per reward line, whether the PWP/promo price applies and which trigger
 * unit it binds to. Deterministic: rules in order, lines greedily by idx. A
 * reward line is granted only if it was toggled (pwpRequested), its category +
 * RuleTargets match the rule's reward scope, and the remaining allowance covers
 * its full qty.
 *
 * Returns one PwpGrant per granted reward line. Lines not granted are absent.
 */
export function resolvePwp(
  rules: PwpRule[],
  lines: PwpLineInput[],
  comboModulesById: Map<string, string[][]> = new Map(),
): PwpGrant[] {
  const grants: PwpGrant[] = [];
  const granted = new Set<number>(); // reward idx already granted (a line matches <= 1 rule)
  const ordered = [...lines].sort((a, b) => a.idx - b.idx);

  for (const rule of rules) {
    const qpt = Math.max(1, Math.floor(Number(rule.qtyPerTrigger) || 1));
    const triggerCat = upper(rule.triggerCategory);
    const rewardCat = upper(rule.rewardCategory);

    // Build the trigger slot queue: each eligible trigger unit contributes
    // qtyPerTrigger slots, labelled with its product so a grant can reference it.
    const slots: Array<{ name: string; code: string }> = [];
    for (const line of ordered) {
      if (upper(line.category) !== triggerCat) continue;
      if (!lineMatchesTargets(toRuleLine(line), rule.triggerTargets, comboModulesById)) continue;
      // Promo is one-way (Loo 2026-06-06): a reward-side line (already bought
      // with a grant, or asking to be priced as a reward right now) never opens
      // promo allowance — else a rule whose trigger set == reward set (buy ARRUS
      // → free ARRUS) lets the free unit fund the next free unit.
      if (rule.type === "promo" && (line.isReward === true || line.pwpRequested)) continue;
      const units = safeQty(line.qty);
      for (let u = 0; u < units * qpt; u++) {
        slots.push({ name: line.productName ?? "", code: line.productCode ?? "" });
      }
    }

    let cursor = 0; // next free slot
    for (const line of ordered) {
      if (granted.has(line.idx)) continue;
      if (!line.pwpRequested) continue;
      if (upper(line.category) !== rewardCat) continue;
      if (!lineMatchesTargets(toRuleLine(line), rule.rewardTargets, comboModulesById)) continue;
      const need = safeQty(line.qty);
      if (need <= 0) continue;
      if (cursor + need > slots.length) continue; // not enough allowance → not granted
      const ref = slots[cursor];
      cursor += need;
      granted.add(line.idx);
      grants.push({ idx: line.idx, triggerRef: ref ? { ...ref } : null });
    }
  }

  return grants;
}
