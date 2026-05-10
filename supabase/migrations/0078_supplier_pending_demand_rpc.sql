-- =============================================================================
-- 0078_supplier_pending_demand_rpc.sql (Loo 2026-05-10)
-- =============================================================================
-- Pre-commit demand visibility for supplier role. Closes the
-- `phase-6-incoming-server-side` carry-forward — V1 (Phase 6 base) only
-- showed the supplier their already-issued POs, but the proto's incoming-
-- demand page was supposed to surface SALES ORDERS that match the
-- supplier's `cat_covered` so they can pre-plan production capacity.
--
-- RLS context: the supplier role can read its own POs (RLS on
-- purchase_orders.supplier_id) but CANNOT read `orders` / `order_lines`
-- directly — those are dealer-side. This RPC bridges that with a
-- SECURITY DEFINER aggregation: it joins `orders + order_lines + suppliers`
-- internally, returns ONLY (sku, pending_qty, order_count) — no customer
-- name, no dealer detail, no order id. Same privacy posture as the existing
-- aggregate-only demand contract on the page disclaimer.
--
-- Filter rules:
--   • Caller must be role='supplier' (helper raise otherwise).
--   • supplier_id is read from JWT via app_supplier_id() — no parameter.
--   • Match SKUs whose category prefix (split_part(sku, ':', 1)) appears in
--     `suppliers.cat_covered` (text[]).
--   • Order status != 'delivered' AND != 'cancelled' (these are terminal).
--   • Logistics_stage NOT 'delivered' for double-belt safety.
--   • Exclude lines whose corresponding (order, supplier, category) thread
--     already has a non-null po_id — that demand has already been formally
--     committed via a PO and is counted in the openQty bucket. Keeps the
--     two buckets disjoint.
--
-- Return shape mirrors the open-PO aggregate so the UI can join them by sku:
--   sku            text   — `category:model:variant`
--   pending_qty    int    — sum of order_lines.qty
--   order_count    int    — distinct orders contributing
-- =============================================================================


create or replace function public.supplier_pending_demand()
returns table(sku text, pending_qty int, order_count int)
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_supplier_id uuid;
  v_cat_covered text[];
begin
  if public.app_role() <> 'supplier' then
    raise exception 'forbidden: supplier only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  v_supplier_id := public.app_supplier_id();
  if v_supplier_id is null then
    raise exception 'no supplier_id on JWT'
      using errcode = '42501', detail = 'no_supplier_id';
  end if;

  select s.cat_covered
    into v_cat_covered
    from suppliers s
   where s.id = v_supplier_id;
  if v_cat_covered is null or array_length(v_cat_covered, 1) is null then
    return;
  end if;

  return query
    select ol.sku::text                                   as sku,
           sum(ol.qty)::int                               as pending_qty,
           count(distinct ol.order_id)::int               as order_count
      from order_lines ol
      join orders o on o.id = ol.order_id
     where split_part(ol.sku, ':', 1) = ANY (v_cat_covered)
       and o.status not in ('delivered', 'cancelled')
       and (o.logistics_stage is distinct from 'delivered')
       -- Exclude lines already covered by a PO for this supplier+category.
       -- The (order_id, supplier_id, category) thread carries po_id once
       -- procurement has issued the PO; non-null means the demand is now
       -- formal and lives on the openQty side.
       and not exists (
         select 1
           from order_supplier_threads t
          where t.order_id = ol.order_id
            and t.supplier_id = v_supplier_id
            and t.category = split_part(ol.sku, ':', 1)
            and t.po_id is not null
       )
     group by ol.sku
     order by sum(ol.qty) desc;
end;
$$;

revoke all on function public.supplier_pending_demand() from public;
revoke all on function public.supplier_pending_demand() from anon;
grant execute on function public.supplier_pending_demand() to authenticated;
