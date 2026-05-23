-- =============================================================================
-- 0148_supplier_forecast_category.sql (Loo 2026-05-24)
-- =============================================================================
-- Fix the supplier "Incoming" forecast: it was empty because
-- supplier_pending_demand derived category via split_part(sku, ':', 1), which
-- assumes the legacy `category:model:variant` SKU shape. Neither AutoCount
-- legacy SKUs (free text) nor native canonical Item Codes (MS01-/BF0x-/SF0x-)
-- carry that prefix, so it matched no supplier's cat_covered.
--
-- Fix = resolve_demand_category(sku): exact catalog join for native orders,
-- model-keyword regex for legacy AutoCount. Used by BOTH buckets:
--   • supplier_pending_demand  (Forecast: active line, po_id IS NULL)
--   • supplier_committed_demand (Commit:  open-status PO lines)
-- Authorized in conversation 2026-05-24. Spec:
-- docs/superpowers/specs/2026-05-24-supplier-place-forecast-design.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- resolve_demand_category(sku) → 'mattress' | 'bedframe' | 'sofa' | NULL
-- Layer 1: native canonical catalog (exact; Portal orders always hit this).
-- Layer 2: keyword classifier (legacy AutoCount free-text; native never reaches
--          it because layer 1 short-circuits). NULL = accessory/service.
-- The keyword list is maintained for the one-time pre-Portal AutoCount backfill.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_demand_category(p_sku text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $func$
  select coalesce(
    (select pm.category::text
       from product_skus ps
       join product_models pm on pm.id = ps.model_id
      where ps.sku = p_sku
      limit 1),
    (select case
       when z.n ~ 'disposal|transport fee|no lift|per floor|memory pillow|protector|microfiber' then null
       when z.n ~ 'jager|cody|trion|hilton|fenrir|ricardo|regal|divan|/fab[0-9]'                 then 'bedframe'
       when z.n ~ 'hk55|dsl90|dsl80|am90|th50|th51|glano|muro|nuvio|lunor|modulo|seater|incliner|eleganz' then 'sofa'
       when z.n ~ 'firmcare|softcloud|breeze|lumi|forte|sonic|haven|solace|meridian|b120|l120|h140|m140|s160' then 'mattress'
       when z.n ~ '^ms[0-9]' then 'mattress'
       when z.n ~ '^bf[0-9]' then 'bedframe'
       when z.n ~ '^sf[0-9]' then 'sofa'
       else null
     end
     from (select lower(coalesce(p_sku, '')) as n) z)
  );
$func$;

revoke all on function public.resolve_demand_category(text) from public, anon;
grant execute on function public.resolve_demand_category(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Forecast bucket. Active order lines NOT yet covered by a PO (po_id IS NULL),
-- scoped to the caller-supplier's cat_covered. category via resolver.
-- Boundary is "not yet POed" (leverages 0124 per-line threads.order_line_id),
-- NOT status='place' — a proceeded-but-unPOed line stays in Forecast.
--
-- DROP first: the return type gains a `category` column, and Postgres refuses
-- CREATE OR REPLACE on a changed OUT-row shape (42P13). No DB object depends on
-- it (only the Hono route calls it at runtime), so the drop is safe.
-- ---------------------------------------------------------------------------
drop function if exists public.supplier_pending_demand();
create or replace function public.supplier_pending_demand()
returns table(sku text, category text, pending_qty int, order_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $func$
declare
  v_supplier_id uuid;
  v_cat_covered text[];
begin
  if public.app_role() <> 'supplier' then
    raise exception 'forbidden: supplier only' using errcode = '42501', detail = 'forbidden';
  end if;
  v_supplier_id := public.app_supplier_id();
  if v_supplier_id is null then
    raise exception 'no supplier_id on JWT' using errcode = '42501', detail = 'no_supplier_id';
  end if;
  select s.cat_covered into v_cat_covered from suppliers s where s.id = v_supplier_id;
  if v_cat_covered is null or array_length(v_cat_covered, 1) is null then
    return;
  end if;

  return query
    with lines as (
      select ol.id, ol.order_id, ol.sku, ol.qty,
             public.resolve_demand_category(ol.sku) as cat
        from order_lines ol
        join orders o on o.id = ol.order_id
       where o.status not in ('delivered', 'cancelled')
         and not exists (
           select 1 from order_supplier_threads t
            where t.order_line_id = ol.id and t.po_id is not null
         )
    )
    select l.sku::text,
           l.cat                                as category,
           sum(l.qty)::int                      as pending_qty,
           count(distinct l.order_id)::int      as order_count
      from lines l
     where l.cat = ANY (v_cat_covered)
     group by l.sku, l.cat
     order by sum(l.qty) desc;
end;
$func$;

revoke all on function public.supplier_pending_demand() from public, anon;
grant execute on function public.supplier_pending_demand() to authenticated;

-- ---------------------------------------------------------------------------
-- Commit bucket. Open-status PO lines for the caller-supplier. category via
-- resolver. 'delivered' is excluded → a delivered PO drops the bucket to 0.
-- ---------------------------------------------------------------------------
create or replace function public.supplier_committed_demand()
returns table(sku text, category text, committed_qty int, po_count int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $func$
declare
  v_supplier_id uuid;
begin
  if public.app_role() <> 'supplier' then
    raise exception 'forbidden: supplier only' using errcode = '42501', detail = 'forbidden';
  end if;
  v_supplier_id := public.app_supplier_id();
  if v_supplier_id is null then
    raise exception 'no supplier_id on JWT' using errcode = '42501', detail = 'no_supplier_id';
  end if;

  return query
    select pol.sku::text,
           public.resolve_demand_category(pol.sku) as category,
           sum(pol.qty)::int                       as committed_qty,
           count(distinct pol.po_id)::int          as po_count
      from purchase_order_lines pol
      join purchase_orders po on po.id = pol.po_id
     where po.supplier_id = v_supplier_id
       and po.sup_status in (
         'pending','acknowledged','in_production','ready_for_pickup',
         'pickup_assigned','pickup_accepted','partially_shipped','shipped','reassign_needed'
       )
     group by pol.sku
     order by sum(pol.qty) desc;
end;
$func$;

revoke all on function public.supplier_committed_demand() from public, anon;
grant execute on function public.supplier_committed_demand() to authenticated;

-- Sanity: the forecast RPC must no longer reference split_part.
do $sanity$
begin
  if pg_get_functiondef('public.supplier_pending_demand()'::regprocedure) ilike '%split_part%' then
    raise exception '0148 sanity: supplier_pending_demand still references split_part';
  end if;
end;
$sanity$;
