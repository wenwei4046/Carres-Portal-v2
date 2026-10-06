-- =============================================================================
-- 0644_the_collection_report_reads_each_salespersons_orders_and_money.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Chew (Finance) listed a Collection report among Finance's reports on
--   2026-10-03 (docs/finance/MASTER.md §3.6), after the Houzs reference (Part
--   10 §6): per salesperson, how many orders were placed in a period, how much
--   deposit came with them and what share of the order value that is, how
--   many fell below a threshold, and — once delivered — how much of the
--   balance is paid and what is still owed. Nothing reads that today: Payment's
--   own reports are per order and per customer, never per salesperson.
--
-- WHAT THIS ADDS
--   fin_collection(p_from, p_to) → jsonb: one row per sales order placed in
--   the period (its SO Doc Date, orders.placed_at, as a Kuala Lumpur day), not
--   cancelled and not a rental order, with:
--     order_value   its lines and add-ons, qty × unit price (the Sales Order's
--                   own total, as orderMoney adds it)
--     deposit       live allocations of payments of kind 'deposit' — the money
--                   taken with the new order (0476)
--     balance_paid  live allocations of every other customer payment, storage
--                   excepted (storage money is never allocated to an order)
--     billed        the live issued sales invoice, amount + tax, when one exists
--     delivered     delivered, or a live sales invoice exists
--   Money is read from live allocations, not from the payment's order, because
--   a corrected allocation moves the money and keeps the payment's order (0450).
--   The salesperson is the order's salesperson now (attribution moves by
--   request, 0329). Totals per salesperson, the threshold and every percentage
--   are worked out in one place, packages/shared/src/collection.ts (law D).
--
-- RLS: none changed. The function is security definer and refuses a caller
-- gl_may_read() does not admit (Finance and the principal). It reads Orders'
-- and Payment's records and writes nothing (Finance MASTER §1).
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.fin_collection(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'finance reports are internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a period whose start is not after its end.'
      using errcode = '22023', detail = 'period_invalid';
  end if;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'orders', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.placed_on, x.so)
        from (
          select o.id, o.so, timezone('Asia/Kuala_Lumpur', o.placed_at)::date as placed_on,
                 o.status::text as status, o.customer_name,
                 o.salesperson_id, sp.name as salesperson_name,
                 d.channel::text as channel, d.name as dealer_name,
                 (coalesce(l.total, 0) + coalesce(ad.total, 0))::numeric(14,2) as order_value,
                 coalesce(pay.deposit, 0)::numeric(14,2) as deposit,
                 coalesce(pay.balance, 0)::numeric(14,2) as balance_paid,
                 inv.invoice_no, inv.billed::numeric(14,2) as billed, inv.issued_at,
                 (o.status::text = 'delivered' or inv.id is not null) as delivered
            from public.orders o
            left join public.salespersons sp on sp.id = o.salesperson_id
            left join public.dealers d on d.id = o.dealer_id
            left join lateral (
              select sum(ol.qty * ol.unit_price) as total from public.order_lines ol where ol.order_id = o.id
            ) l on true
            left join lateral (
              select sum(a.qty * a.unit_price) as total from public.order_addons a where a.order_id = o.id
            ) ad on true
            left join lateral (
              select sum(pa.amount) filter (where p.kind = 'deposit') as deposit,
                     sum(pa.amount) filter (where p.kind <> 'deposit') as balance
                from public.payment_allocations pa
                join public.order_payments p on p.id = pa.payment_id
               where pa.order_id = o.id
                 and pa.voided_at is null
                 and p.voided_at is null
                 and p.kind <> 'storage'
            ) pay on true
            left join lateral (
              select i.id, i.invoice_no, i.amount + coalesce(i.tax_amount, 0) as billed, i.issued_at
                from public.invoices i
               where i.order_id = o.id and i.kind = 'sales' and i.status = 'issued' and i.voided_at is null
               order by i.issued_at desc nulls last, i.created_at desc
               limit 1
            ) inv on true
           where o.status::text <> 'cancelled'
             and coalesce(o.source_system, '') <> 'rental'
             and timezone('Asia/Kuala_Lumpur', o.placed_at)::date between p_from and p_to
        ) x), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.fin_collection(date, date) from public, anon;
grant execute on function public.fin_collection(date, date) to authenticated;
comment on function public.fin_collection(date, date) is
  '0644 · Chew 2026-10-03 (Finance MASTER §3.6): the Collection report''s orders — every sales order placed in the period (Kuala Lumpur day of placed_at), not cancelled, not rental — with its value, deposit (live allocations of kind deposit), balance paid (other live allocations, storage excepted) and its live issued sales invoice. Reads only. Finance and principal (gl_may_read).';

do $sanity$
begin
  if has_function_privilege('anon', 'public.fin_collection(date, date)', 'execute') then
    raise exception '0644 sanity: an anonymous caller may run the collection report';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'fin_collection'
                    and p.prosecdef and p.provolatile = 's'
                    and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception '0644 sanity: fin_collection is not a stable security definer with its search_path';
  end if;
  begin
    perform public.fin_collection(current_date, current_date);
    raise exception '0644 sanity: an anonymous caller was not refused';
  exception
    when insufficient_privilege then null;
  end;
end
$sanity$;

commit;
