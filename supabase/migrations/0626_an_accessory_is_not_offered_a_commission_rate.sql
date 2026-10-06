-- =============================================================================
-- 0626_an_accessory_is_not_offered_a_commission_rate.sql
-- =============================================================================
-- WHAT WAS WRONG
--
--   An accessory line earns no dealer commission (YH for finance, 30 Sep 2026;
--   NO_COMMISSION_CATEGORIES in packages/shared/src/dealer-commission.ts). But
--   the "Add a product rate" list on the Dealer commission report still
--   offered accessory products, because dealer_commission_source (latest body
--   0597) left out only service and guarantee. A rate saved on an accessory
--   did nothing.
--
-- WHAT THIS CHANGES
--
--   The 'models' list also leaves out category 'accessory'. That one word is
--   the only change to the function; the rest is the 0597 body, copied whole.
--
--   A rate already saved on an accessory still shows under Commission rates,
--   so Finance can remove it. It earns nothing either way.
--
-- DATA: none. §6, no backfill. Still a read (CLAUDE.md §7).
-- DR/CR: none.
-- =============================================================================

begin;

create or replace function public.dealer_commission_source(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
begin
  if not coalesce(public.gl_may_read(), false) then
    raise exception 'Finance or Principal only' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'settings', (select jsonb_build_object('defaultRate', s.default_rate)
                   from dealer_commission_settings s),
    'rates', coalesce((
      select jsonb_agg(jsonb_build_object('modelId', r.model_id, 'modelName', pm.name, 'rate', r.rate)
                       order by pm.name)
        from dealer_commission_rates r join product_models pm on pm.id = r.model_id), '[]'::jsonb),
    'quotas', coalesce((
      select jsonb_agg(jsonb_build_object('dealerId', q.dealer_id, 'quota', q.quota,
                                          'rebateRate', q.rebate_rate, 'startsOn', q.starts_on))
        from dealer_rebate_quotas q), '[]'::jsonb),
    'models', coalesce((
      select jsonb_agg(jsonb_build_object('id', pm.id, 'name', pm.name) order by pm.name)
        from product_models pm
       where pm.discontinued_at is null
         and pm.category::text not in ('service', 'guarantee', 'accessory')), '[]'::jsonb),
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
        from dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'outlets', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'dealerId', o.dealer_id)
                       order by o.name)
        from outlets o join dealers d on d.id = o.dealer_id and d.channel = 'dealer'), '[]'::jsonb),
    -- Collected = live customer payments that are not storage (the 0351 rule).
    -- An order with none of those is still here, earning nothing and carrying
    -- its whole commission in "still to collect".
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', ord.id, 'so', ord.so, 'dealerId', ord.dealer_id, 'outletId', ord.outlet_id,
        'addons', (select coalesce(sum(a.qty * a.unit_price), 0)
                     from order_addons a where a.order_id = ord.id),
        'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                           'modelId', m.id, 'category', m.category, 'value', l.qty * l.unit_price)), '[]'::jsonb)
                    from order_lines l
                    left join product_skus sk on sk.sku = l.sku
                    left join product_models m on m.id = sk.model_id
                   where l.order_id = ord.id),
        'payments', (select jsonb_agg(jsonb_build_object('paidOn', op.paid_on, 'amount', op.amount))
                       from order_payments op
                      where op.order_id = ord.id and op.kind <> 'storage'
                        and op.voided_at is null and op.paid_on < v_end),
        -- Refunds HQ has PAID OUT, by the Malaysian day paid (0597). The
        -- report takes them off collected money, never below zero, in the
        -- month they were paid. Requested, approved and rejected refunds are
        -- not money that left, so they are not here.
        'refunds', (select jsonb_agg(jsonb_build_object(
                             'paidOn', (rf.paid_at at time zone 'Asia/Kuala_Lumpur')::date,
                             'amount', rf.amount))
                      from order_refunds rf
                     where rf.order_id = ord.id and rf.status = 'paid'
                       and (rf.paid_at at time zone 'Asia/Kuala_Lumpur')::date < v_end)))
        from orders ord
        join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
       where ord.status <> 'cancelled'
         -- The day the order was placed IN MALAYSIA. See the header: a bare
         -- timestamptz < date comparison would read the month off the
         -- session's TimeZone, and production's is UTC.
         and (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date < v_end), '[]'::jsonb)
  );
end
$fn$;

comment on function public.dealer_commission_source(date) is
  'The dealer-channel orders a commission month reads: every order whose Malaysian placed-on day falls before the month ends and that is not cancelled, whether or not the customer has paid. An unpaid order earns nothing and carries its full commission in "still to collect" (0553). Each order also carries the refunds HQ has paid out by the Malaysian day paid, which the report takes off collected money (0597). The product list for a rate leaves out service, guarantee and accessory, which earn nothing (0626).';

revoke execute on function public.dealer_commission_source(date) from public, anon;
grant execute on function public.dealer_commission_source(date) to authenticated;

commit;
