-- 0729 · FINANCE LISTS CANCELLED ORDERS THAT STILL HOLD CUSTOMER MONEY
--
-- Cancelling an order creates no refund and moves no payment (0350), so a
-- cancelled order can keep the customer's money with nobody looking at it.
-- This is the READ Finance needs: every cancelled order whose goods money
-- (orders.paid, which payment_void and the 0450 allocation correction both
-- keep true) is more than the refunds already PAID out (order_refunds, 0345).
-- It writes nothing, posts nothing and decides nothing: whether that money is
-- refunded or moved to another order is Finance's open ruling (Q15).
--
-- Storage collections are not counted: they never enter orders.paid (0343).
-- Gate: Finance and principal only (gl_may_read, 0461). Nothing is dropped.

create or replace function public.finance_cancelled_orders_holding_money()
returns table (
  order_id      uuid,
  so            int,
  customer_name text,
  paid          numeric(12,2),
  refunded      numeric(12,2),
  held          numeric(12,2),
  cancelled_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'Cancelled orders holding money are for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return query
  select o.id, o.so, o.customer_name, o.paid, r.refunded, o.paid - r.refunded,
         coalesce(
           (select max(h.occurred_at) from public.order_history h
             where h.order_id = o.id and h.metadata ->> 'kind' = 'cancel'),
           o.updated_at)
    from public.orders o
    cross join lateral (
      select coalesce(sum(f.amount) filter (where f.status = 'paid'), 0)::numeric(12,2) as refunded
        from public.order_refunds f where f.order_id = o.id
    ) r
   where o.status = 'cancelled' and o.paid - r.refunded > 0
   order by 7 desc, o.so desc;
end;
$fn$;

revoke all on function public.finance_cancelled_orders_holding_money() from public, anon;
grant execute on function public.finance_cancelled_orders_holding_money() to authenticated;

comment on function public.finance_cancelled_orders_holding_money() is
  '0729: read-only. Cancelled orders whose orders.paid exceeds the refunds already paid. Finance and principal only. Refund versus move is not decided here.';
