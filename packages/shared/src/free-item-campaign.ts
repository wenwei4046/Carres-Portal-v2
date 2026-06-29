// ----------------------------------------------------------------------------
// Free Item Campaign (standalone GWP giveaway, no qualifying purchase). PURE,
// shared by the POS cart "Make Free" picker and the Hono server-side SO
// validator so the two NEVER drift (honest-pricing). A campaign lists eligible
// targets as a P6 RuleTarget[]; a salesperson "Make Free"s an ELIGIBLE cart
// line (up to `maxFreeQty`) and the server forces that line's unitPrice to 0.
//
// Ported from 2990s `packages/shared/src/free-item-campaign.ts`, adapted to
// Carres by reusing the P6 RuleTarget matcher (`lineMatchesTargets`) directly —
// the line shape IS the P6 `RuleLineInput`.
//
// PURE: no IO, no Supabase, no React. Reuses rule-target.ts for all matching.
// ----------------------------------------------------------------------------
import {
  lineMatchesTargets,
  parseRuleTargets,
  type RuleLineInput,
  type RuleTarget,
} from "./rule-target";

export interface FreeItemCampaign {
  id: string;
  name: string;
  active: boolean;
  /** per-line max free units (>= 1). */
  maxFreeQty: number;
  /** eligibility = a P6 RuleTarget[] (model | variant | combo | compartment). */
  eligible: RuleTarget[];
}

/** Coerce raw jsonb into a clean RuleTarget[] (drops malformed entries; reads a
 *  legacy single `comboId` as `comboIds:[id]`). Thin wrapper over
 *  `parseRuleTargets` so callers read intent at the campaign boundary. */
export function parseFreeItemEligible(raw: unknown): RuleTarget[] {
  return parseRuleTargets(raw);
}

/**
 * Every ACTIVE campaign that covers this line, via the shared P6 matcher.
 * Returns ALL covering campaigns so the cart can let the salesperson pick.
 *
 * A Free Item Campaign must list EXPLICIT targets — an EMPTY `eligible` covers
 * NOTHING (guarded before delegating). `lineMatchesTargets` treats `[]` as
 * "match every line" (the delivery-fee semantic where the caller scopes
 * category); applying that here would make every model in every category
 * free-eligible, so the `eligible.length > 0` guard is load-bearing.
 */
export function campaignsCoveringLine(
  line: RuleLineInput,
  campaigns: FreeItemCampaign[],
  comboModulesById: Map<string, string[][]> = new Map(),
): FreeItemCampaign[] {
  if (!line.modelId) return [];
  return campaigns.filter(
    (c) =>
      c.active && c.eligible.length > 0 && lineMatchesTargets(line, c.eligible, comboModulesById),
  );
}
