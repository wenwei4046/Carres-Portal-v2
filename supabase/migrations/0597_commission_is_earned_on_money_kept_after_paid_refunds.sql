-- =============================================================================
-- 0597_commission_is_earned_on_money_kept_after_paid_refunds.sql
-- =============================================================================
-- WHAT WAS BROKEN
--
--   Dealer commission and the renovation rebate were earned on money HQ had
--   already handed back. dealer_commission_source (latest body 0553) built
--   "collected" from order_payments only and never looked at order_refunds
--   (0345). A customer who paid RM1000 and was refunded RM400 still earned
--   the dealer 25% of RM1000, and 5% rebate on it.
--
-- WHAT THIS CHANGES
--
--   Each order now also carries 'refunds': every order_refunds row with
--   status 'paid' (money that actually left HQ), with its paid day in
--   Malaysia and its amount, bounded before month end the same way payments
--   are. packages/shared/src/dealer-commission.ts takes them off collected,
--   never below zero, in the month the refund was paid, so a refund paid in
--   October lowers October and leaves September as it was reported.
--
--   paid_at is timestamptz, so the day is read in Malaysia, exactly like the
--   placed_at bound 0553 explains: production's clock is UTC.
--
-- BUILT ON 0553, NOT 0555
--
--   0555 is a later create or replace of this function, but its own header
--   says it is NOT APPLIED and awaits the owner's ruling. Production runs the
--   0553 body, so this file starts from 0553 and adds only the refunds key.
--   If 0555 is ever approved it must be rewritten on top of this file, or it
--   will silently drop the refunds again.
--
-- Nothing else changes: order set, rates, quotas, RLS, grants, security
--   definer and the gl_may_read() gate are exactly as 0553 left them. Still a
--   read (CLAUDE.md §7): nothing owed, posted or stored.
-- DATA: none. §6, no backfill. The next open of the report is correct.
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
         and pm.category::text not in ('service', 'guarantee')), '[]'::jsonb),
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
  'The dealer-channel orders a commission month reads: every order whose Malaysian placed-on day falls before the month ends and that is not cancelled, whether or not the customer has paid. An unpaid order earns nothing and carries its full commission in "still to collect" (0553). Each order also carries the refunds HQ has paid out by the Malaysian day paid, which the report takes off collected money (0597).';

revoke execute on function public.dealer_commission_source(date) from public, anon;
grant execute on function public.dealer_commission_source(date) to authenticated;

commit;
