/**
 * Fabric-tier pricing helpers (migration 0176).
 *
 * Sofas now have 3 price tiers keyed by `sofa_fabrics.tier`:
 *   PRICE_1 — base (no surcharge delta; same as old single-tier behaviour)
 *   PRICE_2 — mid tier; delta from per-model override or global config
 *   PRICE_3 — premium tier; same fallback chain
 *
 * The delta is additive on top of the fabric's existing `surcharge` field —
 * exactly the way `fabric_surcharge` rides today in the DraftLine price.
 */

export type FabricTier = "PRICE_1" | "PRICE_2" | "PRICE_3";

/**
 * Per-model tier delta override (mirrors `model_fabric_tier_overrides` row).
 * `null` on a delta means "inherit from global config" (not "zero").
 * `0` means "this tier has no premium for this model" (overrides global 0).
 * The `??` operator below correctly distinguishes these two states.
 */
export interface FabricTierOverride {
  tier2Delta: number | null;
  tier3Delta: number | null;
}

/**
 * Global tier config singleton (mirrors `fabric_tier_addon_config` row id=1).
 * Non-nullable in the DB (default 0) so these are plain numbers, not null.
 */
export interface FabricTierGlobalConfig {
  sofaTier2Delta: number;
  sofaTier3Delta: number;
}

/**
 * Resolve the pricing delta (in RM) for a given fabric tier.
 *
 * Resolution order:
 *   1. PRICE_1 → always 0 (base tier)
 *   2. Per-model override (if present and the tier's delta is not null)
 *   3. Global config singleton
 *   4. 0 (safe fallback when neither is configured)
 *
 * The result is clamped to `Math.max(0, x)` — negative deltas are treated as
 * 0 rather than reducing the price below the base surcharge.
 *
 * IMPORTANT: uses `??` (nullish coalescing) not `||`, so an override delta of
 * `0` is treated as "explicitly set to zero" and takes precedence over the
 * global config. Only `null` / `undefined` triggers the fallback chain.
 */
export function resolveFabricDelta(
  tier: FabricTier,
  override: FabricTierOverride | null | undefined,
  config: FabricTierGlobalConfig | null | undefined,
): number {
  if (tier === "PRICE_1") return 0;

  let raw: number;
  if (tier === "PRICE_2") {
    raw = override?.tier2Delta ?? config?.sofaTier2Delta ?? 0;
  } else {
    // PRICE_3
    raw = override?.tier3Delta ?? config?.sofaTier3Delta ?? 0;
  }

  return Math.max(0, raw);
}
