// ----------------------------------------------------------------------------
// Delivery TRIP fee — the PURE money core (migration 0184, 2990s Products parity
// Phase 6). Ported from 2990s `pricing.ts` (computeSoDeliveryFee) +
// `apps/api/src/lib/special-delivery.ts` (per-rule matching), adapted to Carres
// conventions: numeric MYR throughout (NO ×100 to sen), and the base fee is
// gated by the principal-selected `chargedCategories` set (the caller filters
// the cart's categories down to the charged ones before passing `categoryIds`).
//
// SOLE source of truth — the POS preview and the Hono server-recompute import
// the SAME `computeDeliveryFee`, so client + server agree in the common case
// (the server is authoritative and simply wins; no drift gate needed).
//
// PURE: no IO, no Supabase, no React. The floor STAIR surcharge (floor_config)
// is a DIFFERENT charge and is KEPT — the delivery trip fee is ADDITIVE.
// ----------------------------------------------------------------------------
import type { RuleLineInput, RuleTarget } from "./rule-target";
import { lineMatchesTargets } from "./rule-target";

// The camelCase config shape doubles as the engine config (the singleton `id`
// is irrelevant to the math). Re-exported so callers can `import { ...,
// DeliveryFeeConfig } from "@carres/shared"` alongside the engine.
export type { DeliveryFeeConfig } from "./domain";
import type { DeliveryFeeConfig } from "./domain";

/* ─── Cross-category rule ───────────────────────────────────────────────────
 * Mattress + bedframe count as ONE delivery category — the bedroom set travels
 * together. Only sofa mixed with a mattress and/or bedframe trips the surcharge
 * (a 2nd vehicle trip); mattress + bedframe alone does NOT. `categories` are the
 * lowercased charged-category ids the caller already filtered. */
const tripsCrossCategory = (categories: ReadonlySet<string>): boolean =>
  categories.has("sofa") && (categories.has("mattress") || categories.has("bedframe"));

/** Highest of a list of fees, clamping negatives to 0; `0` when the list is empty. */
const maxFee = (fees: number[]): number =>
  fees.reduce((m, f) => Math.max(m, Math.max(0, f)), 0);

/**
 * One SPECIAL model's delivery override (a matched special_delivery_fee_rules
 * row contributes one of these; `computeDeliveryFee` folds in the highest).
 */
export interface SpecialModelDeliveryFee {
  /** Standalone special transport fee. Supersedes the normal base when present
   *  in the cart; highest wins (never summed). */
  standaloneFee: number;
  /** Reduced fee when THIS order is a cross-category follow-up linked to an
   *  earlier SO; highest wins. */
  crossCategoryFollowupFee: number;
}

export interface DeliveryFeeInput {
  /** DISTINCT charged-category ids present in the cart (the caller has already
   *  filtered to `config.chargedCategories`). Mattress + bedframe count as one
   *  category for the cross-category rule — only sofa × (mattress|bedframe)
   *  trips the surcharge. EMPTY = no charged-category line → base 0. */
  categoryIds: string[];
  /** One entry per SPECIAL model matched in the cart. Empty when none. */
  specialModels: SpecialModelDeliveryFee[];
  /** True when this order is linked to the customer's earlier SO as a
   *  cross-category follow-up (the full base was paid on the first SO). */
  isCrossCategoryFollowup: boolean;
  /** Free-form fee keyed by the operator at handover. Negatives clamped to 0. */
  additionalFee: number;
}

export interface DeliveryFeeResult {
  /** The (possibly special / possibly follow-up) base portion. */
  base: number;
  /** In-order cross-category surcharge (0 on a follow-up order — the link IS
   *  the cross). */
  crossCategory: number;
  /** Free-form operator fee. */
  additional: number;
  /** base + crossCategory + additional. */
  total: number;
  /** A special model was present in the cart (for display / audit). */
  isSpecial: boolean;
  /** The cross-order follow-up rate was applied. */
  isFollowup: boolean;
}

/**
 * Compute an order's delivery trip fee (faithful port of 2990s
 * `computeSoDeliveryFee`, adapted to Carres's chargedCategories gate + MYR
 * units). Pure — the server gathers the inputs (fresh config + matched special
 * rules + cart categories) and calls this; no client-sent fee total is trusted.
 *
 *   base          = max(config.baseFee, max specialModels.standaloneFee),
 *                   GATED to 0 when `categoryIds` is empty (no charged line).
 *   crossCategory = sofa × (mattress|bedframe) in categoryIds ? config.crossCategoryFee : 0
 *   followup path = base := max(config.crossCategoryFee, max specialModels.crossCategoryFollowupFee),
 *                   crossCategory := 0 (the cross-order link replaces the in-order surcharge).
 *   additional    = max(0, additionalFee)
 *   total         = base + crossCategory + additional
 *
 * Dormant: when config seeds 0 and no special rule matches, base + crossCategory
 * are 0, so `total` is just the operator's free-form `additionalFee` (usually 0).
 */
export const computeDeliveryFee = (
  input: DeliveryFeeInput,
  config: DeliveryFeeConfig,
): DeliveryFeeResult => {
  const additional = Math.max(0, input.additionalFee || 0);
  const categories = new Set(
    (input.categoryIds ?? [])
      .filter((id): id is string => Boolean(id))
      .map((id) => id.toLowerCase()),
  );
  const specials = input.specialModels ?? [];
  const hasSpecial = specials.length > 0;

  // Gate: no charged-category line → no trip fee, only the operator's free-form
  // fee (if any). Dormant 0-rate config + no charged line → total 0.
  if (categories.size === 0) {
    return {
      base: 0,
      crossCategory: 0,
      additional,
      total: additional,
      isSpecial: false,
      isFollowup: false,
    };
  }

  if (input.isCrossCategoryFollowup) {
    // Linked follow-up order — full base already paid on the first SO. Charge
    // only the cross portion: the higher of the normal cross rate and any
    // matched special follow-up fee.
    const base = Math.max(
      Math.max(0, config.crossCategoryFee),
      maxFee(specials.map((s) => s.crossCategoryFollowupFee)),
    );
    return {
      base,
      crossCategory: 0,
      additional,
      total: base + additional,
      isSpecial: hasSpecial,
      isFollowup: true,
    };
  }

  // Standalone / first order. A special standalone fee (highest) supersedes the
  // normal base; the in-order cross-category surcharge stacks only when sofa
  // shares the cart with a mattress / bedframe.
  const base = Math.max(
    Math.max(0, config.baseFee),
    maxFee(specials.map((s) => s.standaloneFee)),
  );
  const crossCategory = tripsCrossCategory(categories)
    ? Math.max(0, config.crossCategoryFee)
    : 0;
  return {
    base,
    crossCategory,
    additional,
    total: base + crossCategory + additional,
    isSpecial: hasSpecial,
    isFollowup: false,
  };
};

/* ─── specialModelsForLines ─────────────────────────────────────────────── */

/** A special_delivery_fee_rules row reduced to what the matcher needs. */
export interface SpecialDeliveryRule {
  target: RuleTarget[];
  standaloneFee: number;
  crossCategoryFollowupFee: number;
}

/**
 * For each rule whose target matches ANY cart line, emit one
 * `SpecialModelDeliveryFee` (port of 2990s `specialDeliveryFeesForLines` matching
 * loop). Uses the shared `lineMatchesTargets` so the POS preview + the server
 * recompute match identically. Fees pass through in MYR (Carres convention — NO
 * ×100). An EMPTY `target` matches every line (a global special fee).
 */
export function specialModelsForLines(
  lines: RuleLineInput[],
  rules: SpecialDeliveryRule[],
  comboModulesById: Map<string, string[][]>,
): SpecialModelDeliveryFee[] {
  const out: SpecialModelDeliveryFee[] = [];
  for (const rule of rules) {
    const matched = lines.some((line) =>
      lineMatchesTargets(line, rule.target, comboModulesById),
    );
    if (matched) {
      out.push({
        standaloneFee: rule.standaloneFee,
        crossCategoryFollowupFee: rule.crossCategoryFollowupFee,
      });
    }
  }
  return out;
}
