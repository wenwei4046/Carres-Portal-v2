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
 * Resolution order (highest precedence first):
 *   1. PRICE_1 → always 0 (base tier)
 *   2. Per-compartment special (0205) — the winning special of the compartments
 *      the sofa build uses (see `pickCompartmentSpecial`). When set for the tier
 *      it REPLACES (overwrites) the per-model / global delta for the whole sofa.
 *   3. Per-model override (0176)
 *   4. Global config singleton (0176)
 *   5. 0 (safe fallback when none is configured)
 *
 * The result is clamped to `Math.max(0, x)` — negative deltas are treated as
 * 0 rather than reducing the price below the base surcharge.
 *
 * IMPORTANT: uses `??` (nullish coalescing) not `||`, so a delta of `0` at any
 * layer is "explicitly set to zero" and takes precedence over the layers below.
 * Only `null` / `undefined` falls through to the next. `compartmentSpecial` is
 * the last positional param (back-compat) but is checked FIRST — highest wins.
 */
export function resolveFabricDelta(
  tier: FabricTier,
  override: FabricTierOverride | null | undefined,
  config: FabricTierGlobalConfig | null | undefined,
  compartmentSpecial?: FabricTierOverride | null,
): number {
  if (tier === "PRICE_1") return 0;

  let raw: number;
  if (tier === "PRICE_2") {
    raw =
      compartmentSpecial?.tier2Delta ??
      override?.tier2Delta ??
      config?.sofaTier2Delta ??
      0;
  } else {
    // PRICE_3
    raw =
      compartmentSpecial?.tier3Delta ??
      override?.tier3Delta ??
      config?.sofaTier3Delta ??
      0;
  }

  return Math.max(0, raw);
}

/**
 * Collapse the per-compartment fabric-tier specials (0205) of every compartment a
 * sofa build uses into the single winning delta override. HIGHEST wins per tier
 * (Loo 2026-07-06: a build spanning several special compartments takes the max so
 * the sofa can't be under-priced) → one whole-sofa delta. A tier with no special
 * on any used compartment stays `null` and falls through to the per-model /
 * global delta in `resolveFabricDelta`. Pure; `null`/`undefined`-safe (only a
 * non-null delta participates, so an unpriced tier never drags the max to 0).
 */
export function pickCompartmentSpecial(
  specials: ReadonlyArray<{ tier2Delta: number | null; tier3Delta: number | null }>,
): FabricTierOverride {
  let tier2Delta: number | null = null;
  let tier3Delta: number | null = null;
  for (const s of specials) {
    if (s.tier2Delta != null) {
      tier2Delta = tier2Delta == null ? s.tier2Delta : Math.max(tier2Delta, s.tier2Delta);
    }
    if (s.tier3Delta != null) {
      tier3Delta = tier3Delta == null ? s.tier3Delta : Math.max(tier3Delta, s.tier3Delta);
    }
  }
  return { tier2Delta, tier3Delta };
}
