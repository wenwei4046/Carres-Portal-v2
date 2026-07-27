-- 0283_partner_delivery_rules.sql
-- Delivery execution queue T9 — logistic partner profiles (promotes L6).
-- docs/delivery-execution-queue.md T9, Jess 2026-07-27:
--   "Working days · blackout dates · daily capacity · booking lead time — and
--    the confirm flow warns when an operator books a date the partner cannot
--    honour."
--
-- FOUR additive columns on delivery_partners, nothing else. Today every partner
-- is a bare row (name + zones), so the eight live carriers all read as "no rules
-- recorded" — and a partner with no rules produces NO warnings. Absent data
-- means "we never asked", never "it's fine" (the T7 degrade-instead-of-lie law).
--
--   * off_days          — weekday numbers the partner does NOT run (0=Sun…6=Sat).
--                         Default {0}: the Carres 6-day week, which is what
--                         every existing row already means. A partner that also
--                         rests Saturday carries {0,6}. Half-days are NOT
--                         modelled — L3 parks the per-site refinement, and half
--                         a day answers neither question asked here.
--   * blackout_dates    — "truck maintenance 15–18 Feb".
--   * daily_capacity    — most drops in a day. NULL = not recorded, which is not
--                         "unlimited": the rule simply stays quiet.
--   * booking_lead_days — WORKING days of notice the partner needs.
--
-- The rule ENGINE is not stored: `packages/shared/partner-delivery-rules.ts`
-- turns these four facts into the operator's warning, and the API and the drawer
-- both read that one module (the HR-P5 no-second-engine lesson). What lives here
-- is only the data a carrier states about itself.
--
-- These WARN, they never BLOCK. The gates that refuse a confirmation
-- (booking-gate.ts: goods reserved · balance collected · no Sunday) are about
-- OUR obligations. A carrier's working pattern is not one of ours, and the
-- carrier is reachable by phone: an operator who already called NETS and got a
-- yes must be able to record that yes. A refusal here would teach staff to type
-- fake dates, which is worse than a real date with a note against it.
--
-- WRITE PATH — an RPC, not a table policy. `partners_principal_write` (0002)
-- is principal-only, and operation is exactly who maintains these rules; but an
-- UPDATE policy cannot be narrowed to four columns, so widening it would hand
-- operation the partner's name, contact and rate card as well. A SECURITY
-- DEFINER function names the four columns and nothing else.

set search_path = public;

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.delivery_partners
  add column if not exists off_days          smallint[] not null default '{0}'::smallint[],
  add column if not exists blackout_dates    date[]     not null default '{}'::date[],
  add column if not exists daily_capacity    smallint,
  add column if not exists booking_lead_days smallint   not null default 0;

-- A weekday number is 0..6, and a partner that works no day at all is a partner
-- we would never assign — that is a deletion, not a profile.
alter table public.delivery_partners
  drop constraint if exists dp_off_days_valid;
alter table public.delivery_partners
  add constraint dp_off_days_valid
    check (
      off_days <@ array[0,1,2,3,4,5,6]::smallint[]
      and coalesce(array_length(off_days, 1), 0) <= 6
    );

alter table public.delivery_partners
  drop constraint if exists dp_daily_capacity_valid;
alter table public.delivery_partners
  add constraint dp_daily_capacity_valid
    check (daily_capacity is null or daily_capacity between 1 and 999);

-- Notice longer than a fortnight of working days is data entry gone wrong, not
-- a carrier. The ceiling keeps the earliest-date walk bounded.
alter table public.delivery_partners
  drop constraint if exists dp_booking_lead_days_valid;
alter table public.delivery_partners
  add constraint dp_booking_lead_days_valid
    check (booking_lead_days between 0 and 30);

alter table public.delivery_partners
  drop constraint if exists dp_blackout_dates_bounded;
alter table public.delivery_partners
  add constraint dp_blackout_dates_bounded
    check (coalesce(array_length(blackout_dates, 1), 0) <= 200);

comment on column public.delivery_partners.off_days is
  'T9 (0283): weekday numbers this carrier does NOT run, 0=Sun…6=Sat. Default {0} = the Carres 6-day week, which is what every pre-T9 row means. Read by packages/shared/partner-delivery-rules.ts to warn (never block) on a date the partner may not honour.';
comment on column public.delivery_partners.blackout_dates is
  'T9 (0283): specific dates this carrier is not running (e.g. truck maintenance). Warning only.';
comment on column public.delivery_partners.daily_capacity is
  'T9 (0283): most deliveries this carrier takes in one day. NULL = not recorded, which is NOT unlimited — the capacity warning stays silent instead of guessing.';
comment on column public.delivery_partners.booking_lead_days is
  'T9 (0283): WORKING days of notice this carrier needs before a delivery day. 0 = takes same-day work.';

-- ── the write door ───────────────────────────────────────────────────────────
-- Operation + principal (is_operation() admits principal since 0189 and, since
-- 0266, requires status='active'). Four columns, named explicitly; a caller
-- cannot reach name / contact / rate_card through it.
create or replace function public.set_partner_delivery_rules(
  p_partner_id       uuid,
  p_off_days         smallint[],
  p_blackout_dates   date[],
  p_daily_capacity   smallint,
  p_booking_lead_days smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_name text;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may set a carrier''s delivery rules'
      using errcode = '42501';
  end if;

  select name into v_name from public.delivery_partners where id = p_partner_id;
  if v_name is null then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;

  update public.delivery_partners
     set off_days          = coalesce(p_off_days, '{0}'::smallint[]),
         blackout_dates    = coalesce(p_blackout_dates, '{}'::date[]),
         daily_capacity    = p_daily_capacity,
         booking_lead_days = coalesce(p_booking_lead_days, 0)
   where id = p_partner_id;

  -- A delivery promise is made against these rules, so a change to them is a
  -- change to what the portal will warn about tomorrow. It does not happen
  -- silently.
  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from public.app_users where id = auth.uid()),
          format('Logistic rules · %s: off days %s · %s blackout date(s) · capacity %s · %s day notice',
                 v_name,
                 coalesce(array_to_string(coalesce(p_off_days, '{0}'::smallint[]), ','), '—'),
                 coalesce(array_length(p_blackout_dates, 1), 0),
                 coalesce(p_daily_capacity::text, 'not set'),
                 coalesce(p_booking_lead_days, 0)),
          p_partner_id::text);
end;
$function$;

-- Guardrail #6: `revoke … from public` alone does nothing on Supabase and
-- `from anon` alone does nothing either — it takes the pair PLUS the explicit
-- grant back, and both directions get asserted below.
revoke all on function public.set_partner_delivery_rules(uuid, smallint[], date[], smallint, smallint) from public;
revoke all on function public.set_partner_delivery_rules(uuid, smallint[], date[], smallint, smallint) from anon;
grant execute on function public.set_partner_delivery_rules(uuid, smallint[], date[], smallint, smallint) to authenticated;

-- =============================================================================
-- Sanity — every assertion checks a FLAG set outside its own handler
-- (guardrail #4: an assert that RAISEs inside the EXCEPTION block it is testing
-- catches itself and proves nothing).
-- =============================================================================
do $sanity$
declare
  v_ok      boolean;
  v_id      uuid;
  v_cols    int;
  v_anon    boolean;
  v_auth    boolean;
  v_defaults int;
begin
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'delivery_partners'
     and column_name in ('off_days','blackout_dates','daily_capacity','booking_lead_days');
  assert v_cols = 4, format('0283: expected 4 new columns, found %s', v_cols);

  -- Every pre-T9 row must read as "the house week, nothing else claimed" —
  -- otherwise the backfill silently invented a rule.
  select count(*) into v_defaults
    from public.delivery_partners
   where off_days = '{0}'::smallint[]
     and blackout_dates = '{}'::date[]
     and daily_capacity is null
     and booking_lead_days = 0;
  assert v_defaults = (select count(*) from public.delivery_partners),
    '0283: existing partners must all default to the house week with no rules';

  select id into v_id from public.delivery_partners limit 1;
  if v_id is not null then
    v_ok := false;
    begin
      update public.delivery_partners set off_days = array[7]::smallint[] where id = v_id;
      raise exception using errcode = 'P0001', message = '0283-probe-accepted';
    exception
      when check_violation then v_ok := true;
      when raise_exception then v_ok := false;
    end;
    assert v_ok, '0283: an out-of-range weekday must be refused';

    v_ok := false;
    begin
      update public.delivery_partners set daily_capacity = 0::smallint where id = v_id;
      raise exception using errcode = 'P0001', message = '0283-probe-accepted';
    exception
      when check_violation then v_ok := true;
      when raise_exception then v_ok := false;
    end;
    assert v_ok, '0283: a zero daily capacity must be refused (NULL means not recorded)';

    v_ok := false;
    begin
      update public.delivery_partners set booking_lead_days = 31::smallint where id = v_id;
      raise exception using errcode = 'P0001', message = '0283-probe-accepted';
    exception
      when check_violation then v_ok := true;
      when raise_exception then v_ok := false;
    end;
    assert v_ok, '0283: an absurd notice period must be refused';
  end if;

  -- The gate itself, probed — but only from a session that genuinely lacks the
  -- role, so the probe can never false-fail when a human applies this while
  -- logged in as operation.
  if v_id is not null and not (select public.is_operation()) then
    v_ok := false;
    begin
      perform public.set_partner_delivery_rules(
        v_id, array[0]::smallint[], '{}'::date[], null::smallint, 0::smallint);
      raise exception using errcode = 'P0001', message = '0283-probe-accepted';
    exception
      when insufficient_privilege then v_ok := true;
      when raise_exception then v_ok := false;
    end;
    assert v_ok, '0283: a caller without the operation role must be refused';
  end if;

  -- Both directions of the grant, asserted (guardrail #6).
  select has_function_privilege('anon',
    'public.set_partner_delivery_rules(uuid, smallint[], date[], smallint, smallint)', 'execute')
    into v_anon;
  select has_function_privilege('authenticated',
    'public.set_partner_delivery_rules(uuid, smallint[], date[], smallint, smallint)', 'execute')
    into v_auth;
  assert v_anon = false, '0283: anon must NOT be able to execute set_partner_delivery_rules';
  assert v_auth = true,  '0283: authenticated MUST be able to execute set_partner_delivery_rules';

  -- Exactly one copy of the function — a ghost overload would be a second door
  -- with a different gate.
  select count(*) into v_cols from pg_proc
   where proname = 'set_partner_delivery_rules' and pronamespace = 'public'::regnamespace;
  assert v_cols = 1, format('0283: expected exactly 1 set_partner_delivery_rules, found %s', v_cols);

  raise notice '0283 OK: partner delivery rules columns + audited write door in place';
end $sanity$;

-- =============================================================================
-- ROLLBACK NOTE
-- Dropping the four columns reverts T9 entirely: the shared module reads a
-- partner with no rules as "nothing known", so the drawer simply stops warning.
-- No other reader depends on them — the booking GATE is untouched by this
-- migration and keeps refusing exactly what it refused before.
-- =============================================================================
