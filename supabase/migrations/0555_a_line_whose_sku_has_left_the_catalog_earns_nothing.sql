-- =============================================================================
-- 0555_a_line_whose_sku_has_left_the_catalog_earns_nothing.sql
-- =============================================================================
-- ⛔ NOT APPLIED. NOT APPROVED. AWAITING THE OWNER'S RULING.
--
--   It is written down here so the ruling, when it comes, is one file away.
--   Until then it must not be applied. It was split out of 0553 for exactly
--   this reason: 0553 is an approved bug fix and can ship today, this is a
--   change to WHAT A DEALER EARNS and cannot.
--
--   It has been run exactly once, on a throwaway local clone, only to prove
--   it parses and to measure what it costs (below); that clone was then put
--   back by re-applying 0553. No production, staging or shared database has
--   ever carried it.
--
-- THE QUESTION THIS ANSWERS, IF THE OWNER SAYS YES
--
--   order_lines stores a SKU as text. If that SKU is later renamed or removed
--   from product_skus, the line no longer reaches a product_model, so it comes
--   back from dealer_commission_source with a null category. A null category
--   misses the service/guarantee exclusion in
--   packages/shared/src/dealer-commission.ts and falls through to the DEFAULT
--   RATE -- so a renamed service SKU quietly pays 25% commission on a line
--   that is not supposed to earn at all.
--
--   There is no other route from order_lines to a model: the sku text is the
--   only link and attrs carries nothing. So the line cannot be re-resolved --
--   it can only be TOLD APART. This file makes it come back as the word
--   'unmatched' instead of null. The shared arithmetic already lists
--   'unmatched' beside 'service' and 'guarantee', so the line stays in the
--   bill (the customer owes it) and earns nothing.
--
-- WHAT IT COSTS, MEASURED
--
--   Every unrateable line stops earning. On a ten-order local clone that was
--   one order: dealer earned 1500.00 before, 1250.00 after. This reports LESS
--   commission than today, which is the safe direction for a report a payout
--   voucher is written from -- but it IS less, so it is the owner's call, not
--   a build agent's. The line that stops earning is also not yet visible on
--   any screen, so the dealer sees a smaller number with nothing naming why.
--
-- Nothing else changes: the order set, the rates, the payment rule, the RLS,
--   the grants and the §7 read-only nature are all exactly as 0553 left them.
--   Only the 'category' expression on the lines subquery differs.
-- DATA: none. §6 -- no backfill, no cleanup. It is a read.
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
        -- ⛔ THE ONE LINE THIS FILE EXISTS FOR. 'unmatched': the SKU is gone
        -- from product_skus, so the line cannot be rated. It stays in the bill
        -- and earns nothing (dealer-commission.ts).
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
         and (ord.placed_at at time zone 'Asia/Kuala_Lumpur')::date < v_end), '[]'::jsonb)
  );
end
$fn$;

comment on function public.dealer_commission_source(date) is
  'The dealer-channel orders a commission month reads: every order whose Malaysian placed-on day falls before the month ends and that is not cancelled, whether or not the customer has paid. An unpaid order earns nothing and carries its full commission in "still to collect" (0553). A line whose SKU has left product_skus comes back as category ''unmatched'' and earns nothing (0555).';

revoke execute on function public.dealer_commission_source(date) from public, anon;
grant execute on function public.dealer_commission_source(date) to authenticated;

commit;
