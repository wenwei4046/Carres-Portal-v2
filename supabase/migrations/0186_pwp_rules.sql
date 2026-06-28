-- 0186_pwp_rules.sql
-- 2990s Products parity Phase 8a — PWP voucher + Promo, the DORMANT, STATELESS
-- foundation (the FINAL phase of the 9-tab parity initiative). P8a scope ONLY:
-- the rule config table + the per-SKU / per-sofa-combo PWP reward price + (in
-- shared) the pure engine + admin UI. NO voucher codes, NO order-path change
-- (those are P8b/P8c/P8d). After P8a, orders are BYTE-IDENTICAL — nothing applies
-- a PWP/promo price yet.
--
-- 2990s "PWP & Promo" is NOT a code editor — the principal authors RULES: a
-- trigger category/scope unlocks a reward category/scope at the ratio
-- qty_per_trigger. type 'pwp' = the reward is sold at a per-SKU discounted price;
-- type 'promo' = the reward is FREE (price 0). The reward PRICE is NOT on the
-- rule — it lives per-SKU (product_skus.pwp_price) / per-sofa-combo
-- (sofa_combo_pricing.pwp_prices_by_height).
--
-- CARRES ADAPTATION: 2990s scoped triggers/rewards with separate columns; Carres
-- expresses scope with the P6 RuleTarget[] abstraction (the same adaptation P7's
-- free_item_campaigns made). trigger_targets / reward_targets are RuleTarget[]
-- jsonb; an EMPTY [] means "the whole (category-scoped) category" (the 2990s
-- "[] = whole category" semantic).
--
-- Additive; pwp_rules is principal-only write (mirrors 0181/0182/0184/0185) and
-- DORMANT (active default false; no order consumer in P8a). Both new price
-- columns are NULLABLE principal-only ECONOMIC fields: combos / sofa_combo_pricing
-- are already entirely principal-only write so sofa_combo_pricing.pwp_prices_by_height
-- inherits that lock (like 0183 cost_by_height), while product_skus has an
-- internal/operation write path so the 0175 principal-lock trigger is EXTENDED to
-- also cover pwp_price (same NULL-role service/migration bypass, same ERRCODE
-- 42501). Tail after this = 0186.

BEGIN;

-- ---------------------------------------------------------------------------
-- pwp_rules — principal-owned PWP/Promo RULES. trigger_targets / reward_targets
-- jsonb = RuleTarget[] (scopes model|variant|combo|compartment); [] = whole
-- category. type 'pwp' (reward at per-SKU pwp_price) | 'promo' (reward FREE).
-- ---------------------------------------------------------------------------
CREATE TABLE public.pwp_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL CHECK (type IN ('pwp', 'promo')),
  trigger_category text NOT NULL,
  trigger_targets  jsonb NOT NULL DEFAULT '[]'::jsonb,
  reward_category  text NOT NULL,
  reward_targets   jsonb NOT NULL DEFAULT '[]'::jsonb,
  qty_per_trigger  integer NOT NULL DEFAULT 1 CHECK (qty_per_trigger >= 1),
  active           boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid
);

CREATE INDEX pwp_rules_active_idx
  ON public.pwp_rules (active);

ALTER TABLE public.pwp_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY pwp_rules_read_all
  ON public.pwp_rules
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY pwp_rules_write_principal
  ON public.pwp_rules
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- ---------------------------------------------------------------------------
-- Per-SKU PWP reward price (the price a 'pwp'-rule reward LINE is sold at).
-- Principal-only economic field, mirrors product_skus.cost. NULL = "no PWP
-- price set". Benchmark only in P8a (no order consumer yet).
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_skus
  ADD COLUMN pwp_price numeric(14,2);

COMMENT ON COLUMN public.product_skus.pwp_price IS
  'Principal-only PWP reward price (RM) — the price a PWP-rule reward line is sold at; null = unset. Locked to principal by the extended 0175 trigger. DORMANT — no order consumer in P8a (0186).';

-- ---------------------------------------------------------------------------
-- Per-sofa-combo PWP reward price (per seat height; mirrors P5 cost_by_height).
-- sofa_combo_pricing is already principal-only write so no extra lock needed.
-- ---------------------------------------------------------------------------
ALTER TABLE public.sofa_combo_pricing
  ADD COLUMN pwp_prices_by_height jsonb;

COMMENT ON COLUMN public.sofa_combo_pricing.pwp_prices_by_height IS
  'Principal-only per-seat-height PWP reward price { height -> numeric|null } companion to prices_by_height; null = unset. DORMANT — no order consumer in P8a (0186).';

-- ---------------------------------------------------------------------------
-- EXTEND the 0175 principal-lock trigger to also lock product_skus.pwp_price.
-- Verified against the live function body (2026-06-28): identical to the 0175
-- file. Same NULL-role (service_role/migrations/cron/auth-hook) bypass + same
-- ERRCODE 42501; we just add pwp_price to the OLD-vs-NEW comparison so a
-- non-principal can neither change pwp_price on UPDATE nor set it on INSERT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_sku_price_cost_principal_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := (select public.app_role())::text;
BEGIN
  -- Bypass for the principal (Master Admin) and for the service / admin
  -- context (NULL role = no end-user JWT: service_role, migrations, cron,
  -- auth hook). NULL-safe: the `= 'principal'` clause is only reached when
  -- v_role is non-null, so a NULL role short-circuits via the first clause.
  IF v_role IS NULL OR v_role = 'principal' THEN
    RETURN NEW;
  END IF;

  -- Non-principal authenticated caller: forbid setting/changing price, cost, or
  -- the 0186 PWP reward price (pwp_price).
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.price IS DISTINCT FROM OLD.price)
       OR (NEW.cost IS DISTINCT FROM OLD.cost)
       OR (NEW.pwp_price IS DISTINCT FROM OLD.pwp_price) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, cost, or pwp_price'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Allow creating an UNPRICED sku (price 0 / cost null / pwp_price null);
    -- block any priced creation by a non-principal.
    IF (NEW.price IS DISTINCT FROM 0)
       OR (NEW.cost IS NOT NULL)
       OR (NEW.pwp_price IS NOT NULL) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, cost, or pwp_price'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_sku_price_cost_principal_only() IS
  'Phase 2 Master-Admin lock (extended 0186): only principal may set/change product_skus.price, .cost, or .pwp_price. NULL role (service_role/migrations/cron/auth-hook) bypasses. Touches only product_skus.';

COMMIT;
