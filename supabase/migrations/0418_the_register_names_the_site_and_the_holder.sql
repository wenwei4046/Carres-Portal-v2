-- =============================================================================
-- 0418_the_register_names_the_site_and_the_holder.sql
-- 【WAREHOUSE】 CARD 02 · Inventory — Stock MASTER §7 · §13.2
-- =============================================================================
--
-- THE DEFECT THIS CLOSES, measured on production 2026-09-03: the register API
-- (`GET /api/ops/stock/register`, apps/api/src/routes/ops/stock.ts) has
-- selected `site_name` and `holder_name` from `stock_unit_register_v` since the
-- Stock Register card (888b89ac, 2026-08-21) — and NO migration ever gave the
-- view either column. Every call answers 42703 → 500, and the Inventory page
-- renders over an error. The route merged; its migration never landed — the
-- inverse of red line 7's "an applied migration missing from the repository",
-- and just as much a P0.
--
-- THE FIX IS THE ROUTE'S OWN CONTRACT, nothing more: the view gains the two
-- human names the register prints — the Site's name (`Where`) and the operating
-- party's name (`Who has it`). Both are governed rows (Stock MASTER §3: Site,
-- operating party and role are separate; NETS is a row, never hard-coded), so
-- the names come from their owners by join, never copied onto the Unit.
--
-- WHY NOT #1005's 0410: that draft rebuilt this view around a Schedule landing
-- (`next_movement_*`) for a navigation candidate the owner-approved 2026-09-01
-- Blueprint supersedes (Dashboard · Inbound · Inventory · Outbound). This
-- migration restores the shipped route's contract only; Inbound/Outbound read
-- models arrive with their own pages' cards.
--
-- 0373's shape is preserved verbatim — availability, lifecycle_outcome and
-- every count still come from the one arithmetic (stock_unit_availability_v);
-- this view still decides nothing (Law B/D).
--
-- Migration number: 0418, and this file has worn TWO numbers — the 0398 lesson
-- repeated to the digit. It was authored as 0417 against MAX(tracker 0412,
-- repo 0416, branches 0416) + 1; PR #1065 merged its own 0417
-- (`the_partner_says_it_cannot_deliver`, applied 2026-09-03 01:56) minutes
-- after this card's PR #1066, and the deploy gate refused main with two
-- migrations sharing one number. The APPLIED 0417 keeps its number; this one
-- was still unapplied, so it renumbers — re-check siblings AT MERGE TIME.
-- =============================================================================

create or replace view public.stock_unit_register_v
with (security_invoker = true) as
  select
    v.*,
    e.last_event_at,
    e.last_event,
    w.name as site_name,
    p.name as holder_name
  from public.stock_unit_availability_v v
  left join public.warehouses w on w.id = v.warehouse_id
  left join public.stock_operating_parties p on p.id = v.holder_party_id
  left join lateral (
    select ev.event_at as last_event_at,
           ev.event    as last_event
      from public.stock_unit_events ev
     where ev.unit_id = v.id
     order by ev.seq desc
     limit 1
  ) e on true;

comment on view public.stock_unit_register_v is
  '0418 — the Stock Register''s read surface: stock_unit_availability_v plus the '
  'Unit''s last PHYSICAL event (0373, ordered by seq per 0372) plus the governed '
  'Site name and operating-party name the register prints as Where / Who has it. '
  'It DERIVES nothing: availability, lifecycle_outcome and ownership all still '
  'come from the one arithmetic. Never use updated_at for "Changed".';

-- 0367's lesson, applied on the way IN: CREATE OR REPLACE VIEW re-runs default
-- privileges, and a view over base tables can be auto-updatable. Revoke first,
-- then grant the one privilege this object exists to give.
revoke all on public.stock_unit_register_v from authenticated, anon;
grant select on public.stock_unit_register_v to authenticated;

-- ─── SANITY, WITH A NEGATIVE CONTROL ────────────────────────────────────────
do $$
declare
  v_units int; v_reg int; v_named int; v_orphan int; v_ctl int;
begin
  select count(*) into v_units from public.stock_unit_availability_v;
  select count(*) into v_reg   from public.stock_unit_register_v;

  -- A join that multiplied or dropped rows would corrupt the register.
  if v_units <> v_reg then
    raise exception '0418: the register view changed the row count (% vs %)', v_units, v_reg;
  end if;

  -- The two columns this migration exists to add must be selectable, and a
  -- Unit standing at a real warehouse must resolve that warehouse's name.
  select count(*) into v_named
    from public.stock_unit_register_v
   where site_name is not null;
  select count(*) into v_orphan
    from public.stock_unit_register_v r
    join public.warehouses w on w.id = r.warehouse_id
   where r.site_name is distinct from w.name;
  if v_orphan > 0 then
    raise exception '0418: % Units disagree with their warehouse''s own name', v_orphan;
  end if;

  -- NEGATIVE CONTROL — prove the check above can fail: compare the SAME rows
  -- against a deliberately wrong name. Zero hits would mean the comparison is
  -- vacuous (no Unit carries a warehouse at all), which is itself news.
  select count(*) into v_ctl
    from public.stock_unit_register_v r
    join public.warehouses w on w.id = r.warehouse_id
   where r.site_name is distinct from (w.name || ' CONTROL');
  if v_named > 0 and v_ctl = 0 then
    raise exception '0418: negative control did not fire — the name check is vacuous';
  end if;

  -- The grant this migration must not make.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'stock_unit_register_v'
       and grantee = 'anon'
  ) then
    raise exception '0418: anon holds a grant on the register view';
  end if;

  raise notice '0418 OK: % Units, % with a Site name, % control hits',
    v_reg, v_named, v_ctl;
end;
$$;
