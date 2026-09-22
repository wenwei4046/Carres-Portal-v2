-- =============================================================================
-- 0553_still_to_collect_counts_an_order_the_customer_has_not_paid_yet.sql
-- =============================================================================
-- WHAT THIS FIXES (two defects in 0544's read; 0544 itself is untouched)
--
--   1. "Commission still to collect" was blind to an order nobody has paid.
--      0544:149-151 only returned an order that had at least one live, non
--      storage payment before month end, so an order the dealer sold and the
--      customer has not paid at all was absent from the source entirely. Its
--      commission never reached the "still to collect" column, which is the
--      one column whose whole job is to say what has not been paid yet.
--      "Earned" was right, because earned only ever counts collected money.
--
--      The order set is now every dealer-channel order placed before month
--      end that is not cancelled. The payment-existence test is gone; the
--      placed_at bound replaces it, because without a bound a past month's
--      report would pull in orders placed after that month ended.
--
--      §7 is untouched: still a read, still nothing owed, posted or stored.
--      An order with no live payment earns 0 and carries its full commission
--      in "still to collect" -- which is a statement about what the CUSTOMER
--      has not paid HQ, not a debt of HQ to the dealer.
--
--   2. A line whose SKU is no longer in product_skus left-joined to null, so
--      it missed the service/guarantee exclusion and took the default 25%.
--      A renamed service SKU therefore silently earned commission. There is
--      no other route from order_lines to a model: the sku text is the only
--      link, and attrs carries nothing. So the line cannot be re-resolved --
--      it can only be told apart. Its category now comes back as 'unmatched'
--      instead of null, and packages/shared/src/dealer-commission.ts treats
--      'unmatched' the way it already treats service and guarantee: the line
--      stays in the bill (the customer owes it) and earns nothing.
--
--      This reports LESS commission than today, which is the safe direction
--      for a report that a payout voucher is written from. Making the
--      unrateable line visible on screen is not done here -- see the report.
--
-- Nothing else in 0544 changes: no table, no rate, no quota, no RLS, no grant
--   (create or replace keeps the function's ACL; the grants are restated so
--   the file reads as the whole truth). Still security definer, still behind
--   gl_may_read(), still finance and principal only.
-- DATA: none. §6 -- no backfill, no cleanup. Existing rows need none: this is
--   a read, so the next open of the report is already correct.
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
        -- 'unmatched': the SKU is gone from product_skus, so the line cannot be
        -- rated. It stays in the bill and earns nothing (dealer-commission.ts).
        'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                           'modelId', m.id,
                           'category', coalesce(m.category::text, 'unmatched'),
                           'value', l.qty * l.unit_price)), '[]'::jsonb)
                    from order_lines l
                    left join product_skus sk on sk.sku = l.sku
                    left join product_models m on m.id = sk.model_id
                   where l.order_id = ord.id),
        'payments', (select jsonb_agg(jsonb_build_object('paidOn', op.paid_on, 'amount', op.amount))
                       from order_payments op
                      where op.order_id = ord.id and op.kind <> 'storage'
                        and op.voided_at is null and op.paid_on < v_end)))
        from orders ord
        join dealers d on d.id = ord.dealer_id and d.channel = 'dealer'
       where ord.status <> 'cancelled'
         and ord.placed_at < v_end), '[]'::jsonb)
  );
end
$fn$;

comment on function public.dealer_commission_source(date) is
  'The dealer-channel orders a commission month reads: every order placed before the month ends that is not cancelled, whether or not the customer has paid. An unpaid order earns nothing and carries its full commission in "still to collect" (0553). A line whose SKU has left product_skus comes back as category ''unmatched'' and earns nothing.';

revoke execute on function public.dealer_commission_source(date) from public, anon;
grant execute on function public.dealer_commission_source(date) to authenticated;

commit;
