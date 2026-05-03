-- 0015_dealer_with_stats_enrich.sql
-- Phase 3 smoke-test fix: `dealer_with_stats(p_id)` from migration 0013 returned
-- `setof dealers` — just the basic row with no computed stats. The Principal
-- Dealer drawer reads `dealer.order_count`, `dealer.gmv`, `dealer.outstanding`,
-- but those columns don't exist on the raw dealers table, so the drawer rendered
-- 0 / RM 0.0k / — for every dealer.
--
-- Fix: drop the old function and recreate with `returns table(...)` mirroring
-- `dealers_with_stats_list()` but filtered to one dealer (no `<> 'rejected'`
-- guard — opening the drawer on a rejected dealer should still show their stats).

drop function if exists public.dealer_with_stats(uuid);

create or replace function public.dealer_with_stats(p_id uuid)
returns table (
  id uuid, name text, region text, contact text, status dealer_status,
  joined_date date, credit_limit numeric, payment_terms text, deposit_balance numeric,
  order_count bigint, gmv numeric, outstanding numeric
)
language sql security definer stable as $$
  select d.id, d.name, d.region, d.contact, d.status, d.joined_date,
         d.credit_limit, d.payment_terms, d.deposit_balance,
         coalesce(s.order_count, 0)::bigint,
         coalesce(s.gmv, 0)::numeric,
         coalesce(s.outstanding, 0)::numeric
    from dealers d
    left join lateral (
      select count(*) as order_count,
             coalesce(sum(line_total + addon_total), 0) as gmv,
             coalesce(sum(greatest(0, (line_total + addon_total) - o.paid)), 0) as outstanding
        from orders o
        left join lateral (select coalesce(sum(unit_price * qty), 0) as line_total
                             from order_lines where order_id = o.id) ol on true
        left join lateral (select coalesce(sum(unit_price * qty), 0) as addon_total
                             from order_addons where order_id = o.id) oa on true
        where o.dealer_id = d.id
    ) s on true
   where d.id = p_id;
$$;

revoke all on function public.dealer_with_stats(uuid) from public;
grant execute on function public.dealer_with_stats(uuid) to authenticated;
