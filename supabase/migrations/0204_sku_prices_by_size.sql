-- 0204_sku_prices_by_size.sql
-- Per-size à-la-carte pricing for sofa compartment SKUs (Loo 2026-07-06).
--
-- `prices_by_size` is a {size → RM} map keyed by the `sofa_size` pool values
-- (catalog_option_pools, 0201 — e.g. "24" … "37", "Flat"). A missing key or a
-- NULL map ⇒ the SKU's flat `price` applies, so the column is DORMANT until
-- the principal authors per-size prices in SKU Master. Only sofa compartment
-- SKUs use it today; it lives on product_skus generically, mirroring the
-- other SKU economics columns (`price` / `cost` / `pwp_price`).
--
-- The 0175 principal price-lock trigger (already extended by 0186 for
-- pwp_price) is extended again to cover prices_by_size: only the principal
-- (or the NULL-role service/migration path) may set or change it. The live
-- prod definition was read back via pg_get_functiondef before this rewrite
-- (single overload, signature unchanged) per the CREATE-OR-REPLACE discipline.

alter table public.product_skus
  add column if not exists prices_by_size jsonb;

comment on column public.product_skus.prices_by_size is
  'Per-size selling price map {size → RM}; keys = catalog_option_pools sofa_size values. Missing key / NULL → flat price applies. Principal-only (0175/0204 trigger).';

create or replace function public.enforce_sku_price_cost_principal_only()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_role text := (select public.app_role())::text;
BEGIN
  IF v_role IS NULL OR v_role = 'principal' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.price IS DISTINCT FROM OLD.price)
       OR (NEW.cost IS DISTINCT FROM OLD.cost)
       OR (NEW.pwp_price IS DISTINCT FROM OLD.pwp_price)
       OR (NEW.prices_by_size IS DISTINCT FROM OLD.prices_by_size) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, cost, pwp_price, or prices_by_size'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF (NEW.price IS DISTINCT FROM 0)
       OR (NEW.cost IS NOT NULL)
       OR (NEW.pwp_price IS NOT NULL)
       OR (NEW.prices_by_size IS NOT NULL) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, cost, pwp_price, or prices_by_size'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
