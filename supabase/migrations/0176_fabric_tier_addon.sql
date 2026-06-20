-- =============================================================================
-- 0176_fabric_tier_addon.sql — Phase 3: 2990s-style sofa fabric-tier pricing
-- =============================================================================
-- WHY:
--   Mirrors the 2990s pricing model where sofa fabrics are banded into three
--   tiers (PRICE_1 / PRICE_2 / PRICE_3).  P2 and P3 carry a configurable
--   SELLING-price delta that is added on top of the base model price.
--   Design mirrors 2990s migrations 0124 (global delta singleton) +
--   0172 (per-model override).
--
-- SCOPE:
--   Sofa-only / selling-side only.  Columns are named `sofa_*` so a bedframe
--   axis can be added later without name collisions.
--
-- ZERO BEHAVIOUR CHANGE ON APPLY:
--   - sofa_fabrics.tier defaults to 'PRICE_1' for all existing rows → no delta applied.
--   - fabric_tier_addon_config is seeded with sofa_tier2_delta=0, sofa_tier3_delta=0 → no price change.
--   - model_fabric_tier_overrides starts empty → no per-model adjustment.
--
-- ADDITIVE ONLY:
--   This migration only ADDs a column + creates 2 new tables.  No existing
--   columns, constraints, triggers, or data are modified.
--   (Never edit frozen migrations 0001–0175.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add tier column to sofa_fabrics
--    Default 'PRICE_1' ensures every existing fabric stays in tier 1 (no delta).
-- -----------------------------------------------------------------------------
ALTER TABLE public.sofa_fabrics
  ADD COLUMN tier text NOT NULL DEFAULT 'PRICE_1'
    CHECK (tier IN ('PRICE_1', 'PRICE_2', 'PRICE_3'));

-- -----------------------------------------------------------------------------
-- 2. Global tier-delta config singleton
--    A single row (id=1) stores the global P2 and P3 selling-price deltas.
--    The CHECK (id = 1) + PRIMARY KEY enforces exactly one row — same pattern
--    as floor_config in 0001_init.sql.
--    updated_by references auth.users (nullable — system edits have no actor).
-- -----------------------------------------------------------------------------
CREATE TABLE public.fabric_tier_addon_config (
  id                 int          PRIMARY KEY DEFAULT 1,
  sofa_tier2_delta   numeric(12,2) NOT NULL DEFAULT 0 CHECK (sofa_tier2_delta >= 0),
  sofa_tier3_delta   numeric(12,2) NOT NULL DEFAULT 0 CHECK (sofa_tier3_delta >= 0),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  updated_by         uuid,
  CHECK (id = 1)
);

-- Seed the singleton row; no-op if already exists (idempotent re-run safety).
INSERT INTO public.fabric_tier_addon_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Per-model tier-delta overrides
--    Optional row per product_model that overrides the global deltas.
--    NULL delta = fall back to global singleton value (not 0).
--    ON DELETE CASCADE: if a model is deleted, its override row is also removed.
-- -----------------------------------------------------------------------------
CREATE TABLE public.model_fabric_tier_overrides (
  model_id     uuid         PRIMARY KEY REFERENCES public.product_models(id) ON DELETE CASCADE,
  tier2_delta  numeric(12,2) CHECK (tier2_delta  IS NULL OR tier2_delta  >= 0),
  tier3_delta  numeric(12,2) CHECK (tier3_delta  IS NULL OR tier3_delta  >= 0),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  updated_by   uuid
);

-- -----------------------------------------------------------------------------
-- 4. RLS — mirror floor_config pattern exactly (0002_rls.sql lines 117-118):
--      SELECT: any authenticated user (auth.uid() is not null)
--      ALL write: principal-only via (select public.is_principal()) [InitPlan wrap]
--
--   public.is_principal() verified on live DB:
--     proname=is_principal, args='', prosecdef=true, provolatile='s' (STABLE)
--     → §8 compliant: STABLE + SECURITY DEFINER + (select …) wrap
-- -----------------------------------------------------------------------------

ALTER TABLE public.fabric_tier_addon_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_fabric_tier_overrides ENABLE ROW LEVEL SECURITY;

-- fabric_tier_addon_config: read by all authenticated, write by principal only
CREATE POLICY tier_addon_config_read_all
  ON public.fabric_tier_addon_config
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY tier_addon_config_write_principal
  ON public.fabric_tier_addon_config
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- model_fabric_tier_overrides: read by all authenticated, write by principal only
CREATE POLICY model_tier_overrides_read_all
  ON public.model_fabric_tier_overrides
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY model_tier_overrides_write_principal
  ON public.model_fabric_tier_overrides
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));
