-- =============================================================================
-- 0643_a_provisional_stock_value_is_read_from_the_units_at_month_end.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Finance has no stock value for a month end. Stock MASTER §12.10's
--   Month-end Stock Confirmation (the governed count Finance acknowledges) is
--   not built. Chew (Finance) ruled on 2026-10-03 (docs/finance/MASTER.md
--   §3.5): until it exists, Finance works out a PROVISIONAL value from Stock's
--   Units, reading only, and marks it provisional; four groups — warehouse,
--   showroom, in transit, sent for repair; supplier consignment and dealer
--   stock left out.
--
-- WHAT THIS ADDS
--   fin_stock_value(p_month_end) → jsonb: every Carres-owned Unit Carres still
--   held at the end of that day (23:59 Kuala Lumpur), one row each, with the
--   group it falls in, where it was, who held it, and its cost. It reads only;
--   nothing is saved, because Stock MASTER §9 says Finance never saves its own
--   month-end stock total. The groups and totals are added up in one place,
--   packages/shared/src/stock-value.ts (law D).
--
--   As at the cut: each Unit's status, Site, holder and ownership are read
--   back from Stock's own log (stock_unit_events): the from_value of the first
--   change of each at or after the cut, else the value now. A Unit born after
--   the cut is not there yet. For the current month the cut is in the future
--   and every value is today's.
--
--   Held at the cut: status free · reserved · on_hold · transferred, and owned
--   by Carres. Incoming (not yet received), sold and ended Units are not
--   Carres's stock; consignment Units are counted, never valued, in left_out.
--
--   Group, first match wins:
--     repair     moved (transferred) by a repair-return the carrier collected
--                before the cut
--     transit    any other transferred Unit; a Unit a logistics company holds
--                (customer delivery, partner legs); a Unit at a transit point
--                (a Site run by an operation partner: AL, HOUZS)
--     showroom   held by a showroom party, at a Site whose profile names one,
--                or at a Site named as a showroom (Stock has no Site type yet:
--                its own register finds PJ Showroom by its name, §12.9)
--     warehouse  any other Carres Site
--     unclassified  anything else, listed by Unit ID, never dropped
--
--   Cost: the Unit's PO line cost (purchase_order_lines.cost); a free-of-charge
--   line costs nothing. A Unit with no PO line, or a line with no price, has
--   no cost recorded: it is listed and counted, never valued as zero.
--
-- RLS: none changed. The function is security definer and refuses a caller
-- gl_may_read() does not admit (Finance and the principal). DATA: none —
-- nothing is written. DR/CR: none.
-- SECTION 6: today's Units are test data (opening imports with no PO line);
-- the reading works on whatever is there and assumes nothing about it.
-- =============================================================================

begin;

create or replace function public.fin_stock_value(p_month_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_cut   timestamptz;
  v_today date := timezone('Asia/Kuala_Lumpur', now())::date;
begin
  if not public.gl_may_read() then
    raise exception 'finance reports are internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  if p_month_end is null then
    raise exception 'Choose the month end.'
      using errcode = '22023', detail = 'month_end_missing';
  end if;
  -- The end of the day in Kuala Lumpur: midnight that starts the next day.
  v_cut := (p_month_end + 1)::timestamp at time zone 'Asia/Kuala_Lumpur';

  return (
    with there as (
      -- Units that existed at the cut.
      select s.*
        from public.ops_stock_items s
        left join lateral (
          select min(e.event_at) as born_at
            from public.stock_unit_events e
           where e.unit_id = s.id and e.event = 'unit_born'
        ) b on true
       where coalesce(b.born_at, s.created_at) < v_cut
    ),
    at_cut as (
      -- Each fact as it stood at the cut: the from_value of its first change
      -- at or after the cut, else the value now. A hit with a null from_value
      -- is a real null (no Site, no holder), not "no change".
      select t.id, t.unit_code, t.sku, t.qty, t.identity_scope, t.po_no, t.po_line_id,
             case when st.hit then st.v else t.status end as status,
             case when si.hit then nullif(si.v, '')::uuid else t.warehouse_id end as site_id,
             case when ho.hit then nullif(ho.v, '')::uuid else t.holder_party_id end as holder_id,
             case when ow.hit then ow.v else t.ownership end as ownership
        from there t
        left join lateral (select true as hit, e.from_value as v from public.stock_unit_events e
                            where e.unit_id = t.id and e.event = 'status_changed' and e.event_at >= v_cut
                            order by e.seq limit 1) st on true
        left join lateral (select true as hit, e.from_value as v from public.stock_unit_events e
                            where e.unit_id = t.id and e.event = 'site_changed' and e.event_at >= v_cut
                            order by e.seq limit 1) si on true
        left join lateral (select true as hit, e.from_value as v from public.stock_unit_events e
                            where e.unit_id = t.id and e.event = 'holder_changed' and e.event_at >= v_cut
                            order by e.seq limit 1) ho on true
        left join lateral (select true as hit, e.from_value as v from public.stock_unit_events e
                            where e.unit_id = t.id and e.event = 'ownership_changed' and e.event_at >= v_cut
                            order by e.seq limit 1) ow on true
    ),
    held as (
      select a.*
        from at_cut a
       where a.status in ('free', 'reserved', 'on_hold', 'transferred')
    ),
    placed as (
      select h.*,
             w.name as site_name, w.kind::text as site_kind,
             hp.name as holder_name, hp.kind as holder_kind,
             sp.kind as site_party_kind,
             src.kind as moved_by,
             case
               when h.status = 'transferred' and src.kind = 'repair-return' then 'repair'
               when h.status = 'transferred' then 'transit'
               when hp.kind = 'delivery_operator' then 'transit'
               when w.kind::text = 'operation_partner' then 'transit'
               when hp.kind = 'showroom' or sp.kind = 'showroom' or w.name ~* 'showroom' then 'showroom'
               when w.kind::text = 'own' then 'warehouse'
               else 'unclassified'
             end as bucket,
             case when pol.id is null then null
                  when pol.commercial_treatment = 'free_of_charge' then 0::numeric
                  else pol.cost end as unit_cost
        from held h
        left join public.warehouses w on w.id = h.site_id
        left join public.stock_operating_parties hp on hp.id = h.holder_id
        left join public.warehouse_site_profiles wp on wp.site_id = h.site_id
        left join public.stock_operating_parties sp on sp.id = wp.operating_party_id
        left join public.purchase_order_lines pol on pol.id = h.po_line_id
        -- The movement that took a transferred Unit away: the latest source
        -- of it the carrier collected before the cut.
        left join lateral (
          select a.kind
            from public.arrival_source_units au
            join public.arrival_sources a on a.id = au.source_id
            join lateral (
              select max(ev.occurred_at) as at
                from public.arrival_source_events ev
               where ev.source_id = a.id
                 and ev.kind in ('collected', 'carrier_received')
                 and ev.occurred_at < v_cut
                 and (cardinality(ev.unit_ids) = 0 or h.id = any (ev.unit_ids))
            ) moved on moved.at is not null
           where au.stock_item_id = h.id
             and (a.cancelled_at is null or a.cancelled_at >= v_cut)
           order by moved.at desc
           limit 1
        ) src on h.status = 'transferred'
    )
    select jsonb_build_object(
      'month_end', p_month_end,
      'cut_at', v_cut,
      'today', v_today,
      'provisional', true,
      'units', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id, 'unit_code', p.unit_code, 'sku', p.sku, 'qty', p.qty,
                 'scope', p.identity_scope, 'status', p.status, 'bucket', p.bucket,
                 'site_name', p.site_name, 'holder_name', p.holder_name,
                 'po_no', p.po_no, 'unit_cost', p.unit_cost,
                 'value', case when p.unit_cost is null then null else round(p.qty * p.unit_cost, 2) end)
               order by array_position(array['warehouse','showroom','transit','repair','unclassified'], p.bucket),
                        p.site_name nulls last, p.unit_code)
          from placed p
         where p.ownership = 'carres_owned'), '[]'::jsonb),
      'left_out', jsonb_build_object(
        'consignment_units', (select count(*) from held h where h.ownership is distinct from 'carres_owned'),
        'consignment_qty',   (select coalesce(sum(h.qty), 0) from held h where h.ownership is distinct from 'carres_owned'))
    )
  );
end;
$fn$;

revoke all on function public.fin_stock_value(date) from public, anon;
grant execute on function public.fin_stock_value(date) to authenticated;
comment on function public.fin_stock_value(date) is
  '0643 · Chew 2026-10-03 (Finance MASTER §3.5): the PROVISIONAL month-end stock value until Stock''s Month-end Stock Confirmation exists. Every Carres-owned Unit held at the end of p_month_end (Kuala Lumpur), its state read back from stock_unit_events, its group (warehouse · showroom · transit · repair · unclassified) and its PO line cost. Reads only; saves nothing. Finance and principal (gl_may_read).';

-- ── sanity ──────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.fin_stock_value(date)', 'execute') then
    raise exception '0643 sanity: an anonymous caller may run the stock value';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'fin_stock_value'
                    and p.prosecdef and p.provolatile = 's'
                    and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception '0643 sanity: fin_stock_value is not a stable security definer with its search_path';
  end if;
  -- fail closed: a caller with no internal role gets an error, never rows.
  begin
    perform public.fin_stock_value(current_date);
    raise exception '0643 sanity: an anonymous caller was not refused';
  exception
    when insufficient_privilege then null;
  end;
end
$sanity$;

commit;
