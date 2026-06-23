-- =============================================================================
-- 0179_sofa_combo_pricing.sql — Sofa engine Phase 2: sofa-combo price model
-- =============================================================================
-- WHY:
--   The sofa pricing engine (computeSofaPrice, packages/shared) needs a
--   principal-owned catalog of SOFA COMBOS.  A sofa combo = a base model + an
--   ordered list of SLOTS (each slot an OR-set of compartment codes) priced
--   per SEAT HEIGHT.  When a built sofa's compartments cover every slot (subset
--   match via Kuhn bipartite matching), the combo price for the chosen height
--   REPLACES the matched subset's à-la-carte sum (applies even if pricier —
--   the "only-if-cheaper" guard was removed by the Chairman 2026-05-30); extra
--   modules beyond the matched slots add at full à-la-carte; fabric-tier delta
--   adds on top.  This is the faithful Carres port of the 2990s
--   sofa_combo_pricing model (2990s migrations 0090/0093 + matchComboSubset).
--
-- PRICES BY HEIGHT (Loo 2026-06-21):
--   prices_by_height is a jsonb map { "<height>": <RM numeric> | null }, keyed
--   by the canonical sofa seat-height set ('24','28','30','32','35' = SOFA_HEIGHTS
--   in packages/shared; = 2990s sofaSizes).  À-la-carte compartment prices stay
--   FLAT (height-independent, in 0178) — only combos vary by height, exactly as
--   2990s does.  A height with no/null price = the combo does not apply at that
--   height (the build prices à-la-carte instead).  prices_by_height IS the
--   selling price (numeric MYR).
--
-- model_id (NOT 2990s base_model text):
--   product_models has no base_model/code column (verified live 2026-06-21), so
--   this table keys on model_id uuid FK — Carres-idiomatic, mirrors
--   model_sofa_compartments / model_fabric_tier_overrides.  The Phase-4 explode
--   itemCode (= {BASE_MODEL}-{compartmentCode}) sources its base-model code then,
--   not here.
--
-- DEFERRED (NOT in v1, per Loo 2026-06-21):
--   customer_id (combos are company-wide only — Carres is B2C dealer POS),
--   supplier_id (no supplier-scope combos), and the promo columns
--   selling_prices_by_height / pwp_prices_by_height / default_free_gifts
--   (PWP/GWP promo is a separate future initiative).  All can be added additively
--   later if needed.
--
-- PRINCIPAL-OWNED:
--   Pricing knobs are principal-only.  RLS mirrors floor_config / 0176 / 0177 /
--   0178 exactly via (select public.is_principal()) — read by any authenticated
--   user, ALL writes gated to the principal.
--
-- ADDITIVE (table) + ONE DEFENSE-IN-DEPTH TRIGGER (sofa_fabrics.tier):
--   Section 1-3 only CREATE one new table — no existing columns/data modified.
--   Section 4 (OPTIONAL — flag at the §7 gate) adds a trigger that locks
--   sofa_fabrics.tier changes to the principal (mirrors 0175's
--   enforce_sku_price_cost_principal_only).  Once combo pricing keys off a
--   fabric's tier, the tier label IS a price input, so it should be principal-
--   owned like every other pricing knob.  ZERO behaviour risk today (0 fabrics
--   in prod).  If Loo prefers v1 UI-gate-only, DROP section 4 before applying.
--   (Never edit frozen migrations 0001–0178.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sofa combos — one row per (model, slot-set, tier) priced per seat height.
--    slots            : jsonb string[][] — ordered SLOTS, each slot an OR-set of
--                       compartment codes, e.g.
--                       [["2A(LHF)","2A(RHF)"],["L(LHF)","L(RHF)"]].
--                       A singleton slot ["1NA"] = a required exact code.
--    tier             : NULL = applies to any fabric tier; else PRICE_1/2/3.
--    prices_by_height : { "24": 2640, "28": 2750, "30": null, ... } numeric MYR.
--    effective_from   : tie-break among equal-priority matches (newest wins) +
--                       future-dating.
--    active / discontinued_at : soft-delete (mirror 0177 combos).
--    updated_by is a plain nullable uuid (no FK — system edits have no actor),
--    mirroring how 0176/0177/0178 left updated_by un-FK'd.
--    ON DELETE CASCADE on model_id: deleting a model removes its sofa combos.
-- -----------------------------------------------------------------------------
CREATE TABLE public.sofa_combo_pricing (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         uuid        NOT NULL REFERENCES public.product_models(id) ON DELETE CASCADE,
  slots            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tier             text        CHECK (tier IS NULL OR tier IN ('PRICE_1','PRICE_2','PRICE_3')),
  prices_by_height jsonb       NOT NULL DEFAULT '{}'::jsonb,
  label            text,
  effective_from   date        NOT NULL DEFAULT current_date,
  active           boolean     NOT NULL DEFAULT true,
  discontinued_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

-- Lookup index: filter by model + tier + effective_from (the pick path).
CREATE INDEX idx_sofa_combo_pricing_lookup
  ON public.sofa_combo_pricing (model_id, tier, effective_from);

-- GIN on slots for future containment queries (mirrors 2990s GIN on modules).
CREATE INDEX idx_sofa_combo_pricing_slots
  ON public.sofa_combo_pricing USING gin (slots jsonb_path_ops);

-- -----------------------------------------------------------------------------
-- 2. RLS — mirror floor_config / 0176 / 0177 / 0178 pattern exactly:
--      SELECT: any authenticated user (auth.uid() is not null)
--      ALL write: principal-only via (select public.is_principal()) [InitPlan wrap]
--
--   public.is_principal() verified on live DB 2026-06-21:
--     args='', prosecdef=true, provolatile='s' (STABLE)
--     → §8 compliant: STABLE + SECURITY DEFINER + (select …) wrap
-- -----------------------------------------------------------------------------
ALTER TABLE public.sofa_combo_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY sofa_combo_pricing_read_all
  ON public.sofa_combo_pricing
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY sofa_combo_pricing_write_principal
  ON public.sofa_combo_pricing
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- -----------------------------------------------------------------------------
-- 3. (no further tables)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. DEFENSE-IN-DEPTH — lock sofa_fabrics.tier changes to the principal.
--    OPTIONAL: flagged at the §7 gate.  Once sofa combo pricing keys off a
--    fabric's tier (and the fabric-tier delta in 0176 already does), the tier
--    label is a PRICE input — it should be principal-owned like price/cost (0175)
--    and the tier-delta config (0176).  Closes CF `fabric-tier-db-lock-sofa-
--    fabrics-tier`.  Mirrors 0175's enforce_sku_price_cost_principal_only:
--    NULL-role (service/migration) bypass, ERRCODE 42501, only sofa_fabrics.tier.
--    Zero behaviour risk today (0 fabrics in prod); does NOT block creating a
--    fabric at the default tier (PRICE_1) — only re-tiering / inserting a
--    non-default tier as a non-principal.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_sofa_fabric_tier_principal_only()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := (select public.app_role())::text;
BEGIN
  -- service_role / migrations run with NULL app_role → bypass (as in 0175).
  IF v_role IS NULL OR v_role = 'principal' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can change a sofa fabric tier'
        USING ERRCODE = '42501', DETAIL = 'sofa_fabric_tier_principal_only';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Allow creating a fabric at the default tier; block setting a higher tier.
    IF NEW.tier IS DISTINCT FROM 'PRICE_1' THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set a sofa fabric tier'
        USING ERRCODE = '42501', DETAIL = 'sofa_fabric_tier_principal_only';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER enforce_sofa_fabric_tier_principal_only_trg
  BEFORE INSERT OR UPDATE ON public.sofa_fabrics
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sofa_fabric_tier_principal_only();
