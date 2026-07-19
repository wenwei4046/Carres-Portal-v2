-- 0238_order_addons_partner_read_only.sql
--
-- NETS pre-golive RLS audit, fix 3/3.
-- The old single ALL policy (order_addons_scoped) had USING include the
-- order's delivery partner but WITH CHECK exclude it. INSERT/UPDATE were
-- therefore blocked for partner — but DELETE only evaluates USING, so a
-- partner could silently DELETE addon rows (delivery fees, surcharges) on its
-- assigned orders. Same split as 0227 on order_lines: read audience unchanged,
-- write (incl. DELETE) = internal + the order's dealer only.
-- (Numbered 0238: remote tracker tail was 0237 at time of writing; 0229-0237
-- were applied by parallel sessions and their files live on other branches.)

drop policy if exists "order_addons_scoped" on public.order_addons;

-- Read: same audience as before (internal + order's dealer + assigned partner).
create policy "order_addons_select_scoped"
on public.order_addons
for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_addons.order_id
      and (
        ( select is_internal() )
        or o.dealer_id = ( select app_dealer_id() )
        or o.delivery_partner_id = ( select app_partner_id() )
      )
  )
);

-- Write (INSERT/UPDATE/DELETE): partner removed entirely.
create policy "order_addons_write_scoped"
on public.order_addons
for all
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_addons.order_id
      and (
        ( select is_internal() )
        or o.dealer_id = ( select app_dealer_id() )
      )
  )
)
with check (
  exists (
    select 1 from public.orders o
    where o.id = order_addons.order_id
      and (
        ( select is_internal() )
        or o.dealer_id = ( select app_dealer_id() )
      )
  )
);
