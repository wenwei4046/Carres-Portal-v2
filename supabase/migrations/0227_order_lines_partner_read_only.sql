-- 0227_order_lines_partner_read_only.sql
--
-- NETS pre-golive RLS audit, fix 1/3.
-- Before: a single permissive ALL policy (order_lines_scoped) let the order's
-- delivery partner INSERT/UPDATE/DELETE order_lines (incl. unit_price/qty) on
-- its assigned orders — an unlogged money-edit door (guardrail #4).
-- After: read audience unchanged (internal + order's dealer + order's delivery
-- partner); write audience = internal + order's dealer only. Partner writes go
-- exclusively through SECURITY DEFINER RPCs (partner_confirm_receive etc.),
-- which are unaffected by this change.

drop policy if exists "order_lines_scoped" on public.order_lines;

-- Read: same audience as before.
create policy "order_lines_select_scoped"
on public.order_lines
for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_lines.order_id
      and (
        ( select is_internal() )
        or o.dealer_id = ( select app_dealer_id() )
        or o.delivery_partner_id = ( select app_partner_id() )
      )
  )
);

-- Write: partner removed; internal + the order's own dealer keep exactly the
-- access the old policy gave them.
create policy "order_lines_write_scoped"
on public.order_lines
for all
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_lines.order_id
      and (
        ( select is_internal() )
        or o.dealer_id = ( select app_dealer_id() )
      )
  )
)
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_lines.order_id
      and (
        ( select is_internal() )
        or o.dealer_id = ( select app_dealer_id() )
      )
  )
);
