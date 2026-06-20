-- 0175_lock_sku_price_cost_to_principal.sql
-- ===========================================================================
-- Phase 2 / Master-Admin pricing lock (2026-06-20).
--
-- WHY: Loo wants the principal ("Master Admin", 2990s model) to OWN retail
-- pricing. Today product_skus.price (selling) + product_skus.cost are writable
-- by ANY internal role (operation / principal / finance / bd) via the
-- skus_write_internal RLS policy (0002). This trigger narrows the gap: only the
-- principal may SET or CHANGE price/cost. All other catalog edits
-- (pos_active, description, name, supplier_id, allowed_options, …) stay open to
-- internal roles via the unchanged RLS policy.
--
-- SCOPE: this migration touches ONLY product_skus. It does NOT touch the
-- PO / purchase_order_lines cost path (operation writes cost to
-- purchase_order_lines.cost when creating a PO; it never UPDATEs
-- product_skus.cost — verified). The CogsLineEditor and all PO flows are
-- unaffected.
--
-- ROLE SOURCE: uses the project's canonical STABLE SECURITY DEFINER helper
-- public.app_role() (0002), wrapped `(select …)` for InitPlan caching per
-- CLAUDE.md §8. We only USE it — never CREATE OR REPLACE it.
--
-- SERVICE / ADMIN BYPASS: under service_role / migrations / cron / the auth
-- hook context there is no end-user JWT, so auth.uid() is NULL and
-- app_role() returns NULL. We bypass the lock in that case (NULL role) so
-- admin ops, seeds, and service_role are NEVER blocked — mirroring the
-- NULL-safe service bypass established in 0067_lp_whitelist_trigger_null_safe.
--
-- RULES:
--   UPDATE: block if NEW.price IS DISTINCT FROM OLD.price
--           OR     NEW.cost  IS DISTINCT FROM OLD.cost,  unless principal.
--   INSERT: block if NEW.price <> 0 OR NEW.cost IS NOT NULL, unless principal.
--           (A non-principal MAY create an UNPRICED sku — price 0 / cost null —
--            which the principal prices later. Unpriced creation is allowed.)
--
-- Additive only: no frozen migration edited, no data mutated.
-- Authorize + apply per CLAUDE.md §7 (controller applies after Loo's explicit
-- OK; this file is written but NOT applied by the author).
-- ===========================================================================

BEGIN;

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

  -- Non-principal authenticated caller: forbid setting/changing price or cost.
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.price IS DISTINCT FROM OLD.price)
       OR (NEW.cost IS DISTINCT FROM OLD.cost) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price or cost'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Allow creating an UNPRICED sku (price 0 / cost null); block any priced
    -- creation by a non-principal.
    IF (NEW.price IS DISTINCT FROM 0)
       OR (NEW.cost IS NOT NULL) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price or cost'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sku_price_cost_principal_only ON public.product_skus;

CREATE TRIGGER trg_enforce_sku_price_cost_principal_only
  BEFORE INSERT OR UPDATE ON public.product_skus
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sku_price_cost_principal_only();

COMMENT ON FUNCTION public.enforce_sku_price_cost_principal_only() IS
  'Phase 2 Master-Admin lock: only principal may set/change product_skus.price or .cost. NULL role (service_role/migrations/cron/auth-hook) bypasses. Touches only product_skus.';

COMMIT;
