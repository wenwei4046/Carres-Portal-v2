-- =============================================================================
-- 0373_the_register_can_say_when_a_unit_last_moved.sql
-- CARD-2026-08-20-stock-register · Stock MASTER §7 · Card §3 ("Changed")
-- =============================================================================
--
-- THE ONE FACT THIS ADDS: when did this Unit last physically change?
--
-- Card §3 gives the Stock rail a `Changed` section — Today · This week · This
-- month — and defines it exactly: "at least one Warehouse PHYSICAL EVENT in the
-- chosen period, not viewed, edited copy, financial note or another module's
-- unrelated update."
--
-- 0366 already records precisely that in `stock_unit_events`, append-only,
-- written by trigger from the row's own before/after. What is missing is only
-- the ability to ASK it per Unit in one read: PostgREST cannot GROUP BY, so a
-- register wanting the latest event per Unit would have to pull the warehouse's
-- entire physical history into the browser to answer "did this move today".
--
-- ORDER BY `seq`, NEVER `event_at` — 0372's ruling, and it is load-bearing here.
-- `event_at` defaults to `clock_timestamp()` now, but two events written in one
-- statement can still read identically to the microsecond; `seq` cannot tie.
-- A "last event" chosen by a tying key is not the last event.
--
-- WHY THIS IS NOT A SECOND REGISTER. `stock_unit_register_v` SELECTs FROM
-- `stock_unit_availability_v`; it adds two derived columns and decides nothing.
-- Availability, lifecycle outcome, ownership and every count still come from
-- 0366/0368/0371's one arithmetic — this view cannot disagree with them because
-- it does not compute them. Law A holds (the Unit register is still the single
-- owner of Unit truth) and so does Law B (a summary is read-only, forever).
--
-- `updated_at` WAS NOT USED, DELIBERATELY. `ops_stock_items.updated_at` moves
-- for any write at all, including ones that are not physical facts — which is
-- the reading of "Changed" that Card §3 forbids by name. The event ledger is the
-- only source that can tell a Unit that MOVED from a Unit that was touched.
--
-- MEASURED BEFORE WRITING (production, 2026-08-21): `stock_unit_events` holds 0
-- rows. Every Unit predates the lineage trigger and nothing has moved since, so
-- `last_event_at` is NULL on all 136 Units today. That is an honest fact, not a
-- missing one, and the Register says so rather than showing an empty filter that
-- looks broken. It populates itself the moment anything physically moves.
--
-- The migration runner supplies the transaction; this repository's migrations
-- carry no explicit begin/commit (0366-0372 all follow that convention), so the
-- file committed here is byte-for-byte the file applied to production.
--
-- Migration number: repository and tracker tail 0372 (0366–0372 are the Unit
-- Authority card), and branch `build/warehouse-transfers` (open PR #860) claims
-- 0365. Taken as MAX + 1 per ENGINEERING §5, never from `ls`.
-- =============================================================================

create or replace view public.stock_unit_register_v
with (security_invoker = true) as
  select
    v.*,
    e.last_event_at,
    e.last_event
  from public.stock_unit_availability_v v
  left join lateral (
    select ev.event_at as last_event_at,
           ev.event    as last_event
      from public.stock_unit_events ev
     where ev.unit_id = v.id
     order by ev.seq desc
     limit 1
  ) e on true;

comment on view public.stock_unit_register_v is
  '0373 — the Stock Register''s read surface: stock_unit_availability_v plus the '
  'Unit''s last PHYSICAL event (Card §3 "Changed"), ordered by seq per 0372. It '
  'DERIVES nothing: availability, lifecycle_outcome and ownership all still come '
  'from the one arithmetic. Never use updated_at for "Changed" — it moves for '
  'writes that are not physical facts.';

-- 0367's lesson, applied on the way IN rather than after the fact: Supabase's
-- ALTER DEFAULT PRIVILEGES hands `authenticated` ALL on every new object in
-- `public`, and a view over one table is auto-updatable. Revoke first, then
-- grant the one privilege this object exists to give. `anon` is revoked too —
-- 0369 closed that half on the Unit Authority objects and a new object must not
-- quietly reopen it.
revoke all on public.stock_unit_register_v from authenticated, anon;
grant select on public.stock_unit_register_v to authenticated;

-- ─── SANITY, WITH A NEGATIVE CONTROL ────────────────────────────────────────
-- ENGINEERING §7: a test that passes when you break the thing it guards is
-- measuring nothing.
do $$
declare
  v_units int; v_reg int; v_mismatch int; v_ctl int;
begin
  select count(*) into v_units from public.stock_unit_availability_v;
  select count(*) into v_reg   from public.stock_unit_register_v;

  -- A lateral that returned more than one row would silently multiply the
  -- register. This is the assertion that catches it.
  if v_units <> v_reg then
    raise exception '0373: the register view changed the row count (% vs %)', v_units, v_reg;
  end if;

  -- The added column must never disagree with the ledger it reads.
  select count(*) into v_mismatch
    from public.stock_unit_register_v r
    left join lateral (
      select ev.event_at as mx
        from public.stock_unit_events ev
       where ev.unit_id = r.id
       order by ev.seq desc
       limit 1
    ) m on true
   where r.last_event_at is distinct from m.mx;

  if v_mismatch > 0 then
    raise exception '0373: % Units disagree with the event ledger', v_mismatch;
  end if;

  -- NEGATIVE CONTROL — prove the check above can actually fail. It compares the
  -- SAME rows against a deliberately wrong value. `coalesce` is load-bearing:
  -- the ledger is empty today, so without it every comparison would be
  -- `NULL is distinct from NULL` → false, the control would report zero, and
  -- this guard would "fail" for the one reason that does not mean it is broken.
  select count(*) into v_ctl
    from public.stock_unit_register_v r
    left join lateral (
      select ev.event_at as mx
        from public.stock_unit_events ev
       where ev.unit_id = r.id
       order by ev.seq desc
       limit 1
    ) m on true
   where r.last_event_at is distinct from (coalesce(m.mx, now()) + interval '1 second');

  if v_ctl = 0 then
    raise exception '0373: negative control did not fire — the drift check is vacuous';
  end if;

  -- The grant this migration exists to make, and the one it must not make.
  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'stock_unit_register_v'
       and grantee = 'anon'
  ) then
    raise exception '0373: anon holds a grant on the register view';
  end if;

  raise notice '0373 OK: % Units, % register rows, % drift, % control hits',
    v_units, v_reg, v_mismatch, v_ctl;
end;
$$;
