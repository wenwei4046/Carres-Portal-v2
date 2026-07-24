-- 0246_hr_source_models — extend hr_commission_source with a 'models' key
-- (2026-07-25, same session as 0245). The HR Settings page needs the product
-- model list (id/name/category) to author per-model rates + tiers, but HR is
-- deliberately NOT in is_internal() and cannot read the catalog — so the one
-- gated RPC carries the (non-discontinued) model roster too. Signature
-- unchanged (verified against the just-applied 0245 def — no ghost overload).

create or replace function public.hr_commission_source(p_year int, p_month int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_result jsonb;
begin
  if (select public.app_role()) not in ('hr', 'principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_month < 1 or p_month > 12 or p_year < 2020 or p_year > 2100 then
    raise exception 'invalid_month';
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end := v_start + interval '1 month';

  select jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'staffRole', s.staff_role,
        'active', s.active, 'dealerId', s.dealer_id, 'outletId', s.outlet_id,
        'storeName', d.name, 'outletName', o.name))
      from salespersons s
      join dealers d on d.id = s.dealer_id and d.channel = 'showroom'
      left join outlets o on o.id = s.outlet_id), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pm.id, 'name', pm.name, 'category', pm.category))
      from product_models pm
      where pm.discontinued_at is null
        and pm.category::text <> 'service'), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'salespersonId', ord.salesperson_id, 'dealerId', ord.dealer_id,
        'outletId', ord.outlet_id, 'modelId', m.id, 'modelName', m.name,
        'category', m.category, 'qty', l.qty, 'unitPrice', l.unit_price))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      join order_lines l on l.order_id = ord.id
      left join product_skus sk on sk.sku = l.sku
      left join product_models m on m.id = sk.model_id
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and coalesce(m.category::text, '') <> 'service'), '[]'::jsonb),
    'unattributed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,
        'storeName', d.name, 'customerName', ord.customer_name,
        'amount', (select coalesce(sum(l2.qty * l2.unit_price), 0)
                   from order_lines l2 where l2.order_id = ord.id)))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and ord.salesperson_id is null), '[]'::jsonb),
    'config', jsonb_build_object(
      'schemes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'dealerId', c.dealer_id, 'outletId', c.outlet_id, 'method', c.method))
        from commission_scheme_config c), '[]'::jsonb),
      'rates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'salespersonId', r.salesperson_id, 'pct', r.pct,
          'effectiveFrom', r.effective_from))
        from staff_commission_rates r), '[]'::jsonb),
      'modelRates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mr.model_id, 'perUnitAmount', mr.per_unit_amount))
        from model_commission_rates mr), '[]'::jsonb),
      'modelTiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mt.model_id, 'thresholdQty', mt.threshold_qty,
          'bonusAmount', mt.bonus_amount))
        from model_commission_tiers mt), '[]'::jsonb),
      'milestones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ms.id, 'category', ms.category, 'thresholdQty', ms.threshold_qty,
          'bonusAmount', ms.bonus_amount))
        from commission_milestones ms), '[]'::jsonb)))
  into v_result;

  return v_result;
end;
$$;
