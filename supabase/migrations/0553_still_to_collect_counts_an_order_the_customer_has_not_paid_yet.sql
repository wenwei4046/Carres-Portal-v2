-- =============================================================================
-- 0553_still_to_collect_counts_an_order_the_customer_has_not_paid_yet.sql
-- =============================================================================
-- WHAT THIS FIXES (one defect in 0544's read; 0544 itself is untouched)
--
--   "Commission still to collect" was blind to an order nobody has paid.
--   0544:149-151 only returned an order that had at least one live, non
--   storage payment before month end, so an order the dealer sold and the
--   customer has not paid at all was absent from the source entirely. Its
--   commission never reached the "still to collect" column, which is the
--   one column whose whole job is to say what has not been paid yet.
--   "Earned" was right, because earned only ever counts collected money.
--
--   The order set is now every dealer-channel order placed before month end
--   that is not cancelled. The payment-existence test is gone; a placed_at
--   bound replaces it, because without a bound a past month's report would
--   pull in orders placed after that month ended.
--
--   §7 is untouched: still a read, still nothing owed, posted or stored.
--   An order with no live payment earns 0 and carries its full commission
--   in "still to collect" -- which is a statement about what the CUSTOMER
--   has not paid HQ, not a debt of HQ to the dealer.
--
-- THE MONTH IS A MALAYSIAN MONTH, NOT THE SESSION'S MONTH
--
--   orders.placed_at is timestamptz and v_end is a date, so a bare
--   `ord.placed_at < v_end` would compare the stored instant against
--   midnight IN WHATEVER TimeZone the session happens to carry. Production
--   runs the database clock on UTC, so an order placed at 1am on 1 October
--   in Kuala Lumpur is stored as 5pm on 30 September UTC and would be
--   counted into September -- a whole order's commission in the wrong
--   month, and the report would disagree with itself between two sessions
--   reading the same rows. The function sets search_path, not TimeZone.
--
--   So the bound reads the day in Malaysia, the way every other date
--   boundary in this database already does -- 0314, 0426, 0444 and 0453 all
--   bound a placed_at with `(placed_at at time zone 'Asia/Kuala_Lumpur')
--   ::date`, and 0475 states the rule: "the database clock is UTC in
--   production, and a payment at 7am MYT is still yesterday in UTC".
--
--   0544 had no such exposure: its only date bound was on
--   order_payments.paid_on, which is a plain date and carries no zone.
--   That bound is unchanged here.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
--
--   A line whose SKU has left product_skus still left-joins to a null
--   category and still takes the default rate. Telling those lines apart so
--   they earn nothing is a SECOND, SEPARATE rule change and an open owner
--   question, so it is not bundled into this bug fix. It sits alone and
--   UNAPPLIED in 0555, waiting on the owner's ruling. This file leaves
--   every earned figure exactly where 0544 put it.
--
-- AN OPEN OWNER QUESTION THIS FIX MAKES LOUDER (not a defect of this file)
--
--   The two money columns have always been measured over different stretches
--   of time: "Commission earned" counts only what the customer paid DURING
--   the chosen month, while "Commission still to collect" counts everything
--   still unpaid on that order SINCE IT WAS PLACED. So the two never have to
--   add up to an order's full commission, and they do not whenever money came
--   in an earlier month. This file does not touch either column's arithmetic,
--   but by returning orders nobody has paid it makes "still to collect" much
--   bigger next to an unchanged "earned". The owner's ruling is reported.
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
        'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                           'modelId', m.id, 'category', m.category, 'value', l.qty * l.unit_price)), '[]'::jsonb)
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
         -- The day the order was placed IN MALAYSIA. See the header: a bare
         -- timestamptz < date comparison would read the month off the
         -- session's TimeZone, and production's is UTC.
         and (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date < v_end), '[]'::jsonb)
  );
end
$fn$;

comment on function public.dealer_commission_source(date) is
  'The dealer-channel orders a commission month reads: every order whose Malaysian placed-on day falls before the month ends and that is not cancelled, whether or not the customer has paid. An unpaid order earns nothing and carries its full commission in "still to collect" (0553).';

revoke execute on function public.dealer_commission_source(date) from public, anon;
grant execute on function public.dealer_commission_source(date) to authenticated;

commit;
