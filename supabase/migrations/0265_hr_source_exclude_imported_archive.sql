-- =====================================================================
-- 0265 — HR-O1: the attribution worklist stops counting imported archive
-- =====================================================================
-- APPLIED to prod 2026-07-26. Tail re-checked immediately before apply
-- (0264_rental_offers) — no collision. Single-overload pre-check done:
-- hr_commission_source(p_year integer, p_month integer) was the ONLY
-- overload and this REPLACE matches it exactly.
--
-- WHY (verified against prod 2026-07-26):
--   55 orders exist. 18 are native POS orders and ALL 18 carry a
--   salesperson. The other 37 are `source_system='autocount'` archive rows
--   imported on 2026-07-23 — every one unattributed, every one carrying
--   RM 0.00 of order_lines value.
--
--   The slice is on placed_at, which the import stamped into July, so those
--   37 landed in the CURRENT month's unattributed worklist and could never
--   be actioned: an archive row was never sold by anyone in this system, so
--   no salesperson is the right answer. HR therefore saw a permanent
--   "37 things need you" that never cleared — and a count that can never
--   reach zero is a count people stop reading. The one real unattributed
--   order that shows up later would hide among them.
--
-- WHAT: exclude imported archive from `unattributed`, and return the count
-- separately as `legacyUnattributed` so the UI can say so out loud rather
-- than silently hiding rows.
--
-- Deliberately NOT a flag column + a "mark as legacy" button (the shape the
-- O1 proposal suggested): the fact is already in the data (`source_system`),
-- so a button would ask a human to tell the system something it already
-- knows. Deriving it also means a FUTURE import needs no clicks at all.
--
-- Everything else in this function is byte-identical to the 0252 version.
-- Rollback = re-apply the 0252 body; nothing else references the new key
-- (both the API and the web treat it as optional).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hr_commission_source(p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        and ord.salesperson_id is null
        -- 0265: imported archive is never "waiting for a human"
        and coalesce(ord.source_system, '') <> 'autocount'), '[]'::jsonb),
    -- 0265: counted, named, and shown — not silently dropped.
    'legacyUnattributed', coalesce((
      select count(*)
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'showroom'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and ord.salesperson_id is null
        and coalesce(ord.source_system, '') = 'autocount'), 0),
    'bdUsers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name, 'email', u.email,
        'position', coalesce(bp.position, 'executive')))
      from app_users u
      left join bd_profiles bp on bp.user_id = u.id
      where u.role = 'bd'), '[]'::jsonb),
    'bdMethod', coalesce((select method from bd_commission_config limit 1), 'percentage'),
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'name', d.name, 'status', d.status,
        'bdOwnerUserId', d.bd_owner_user_id))
      from dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'dealerOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id,
        'amount', (
          select coalesce(sum(l.qty * l.unit_price), 0)
          from order_lines l
          left join product_skus sk on sk.sku = l.sku
          left join product_models m on m.id = sk.model_id
          where l.order_id = ord.id
            and coalesce(m.category::text, '') <> 'service')))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'), '[]'::jsonb),
    'dealerLines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'placedAt', ord.placed_at,
        'dealerId', ord.dealer_id, 'modelId', m.id, 'modelName', m.name,
        'category', m.category, 'qty', l.qty, 'unitPrice', l.unit_price))
      from orders ord
      join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
      join order_lines l on l.order_id = ord.id
      left join product_skus sk on sk.sku = l.sku
      left join product_models m on m.id = sk.model_id
      where ord.placed_at >= v_start and ord.placed_at < v_end
        and ord.status <> 'cancelled'
        and coalesce(m.category::text, '') <> 'service'), '[]'::jsonb),
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
      'bdRates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'userId', br.user_id, 'pct', br.pct,
          'effectiveFrom', br.effective_from))
        from bd_commission_rates br), '[]'::jsonb),
      'modelRates', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mr.model_id, 'perUnitAmount', mr.per_unit_amount,
          'program', mr.program))
        from model_commission_rates mr), '[]'::jsonb),
      'modelTiers', coalesce((
        select jsonb_agg(jsonb_build_object(
          'modelId', mt.model_id, 'thresholdQty', mt.threshold_qty,
          'bonusAmount', mt.bonus_amount, 'program', mt.program))
        from model_commission_tiers mt), '[]'::jsonb),
      'milestones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ms.id, 'category', ms.category, 'thresholdQty', ms.threshold_qty,
          'bonusAmount', ms.bonus_amount, 'program', ms.program))
        from commission_milestones ms), '[]'::jsonb)))
  into v_result;

  return v_result;
end;
$function$;
