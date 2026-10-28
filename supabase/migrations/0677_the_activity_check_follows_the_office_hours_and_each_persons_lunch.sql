-- =============================================================================
-- 0677 — the activity check follows the Office hours and each person's lunch
-- =============================================================================
-- OWNER ORDER (Jess, 9 Oct 2026): "The activity check must read the effective
-- Office time and each person's personal lunch setting; no work is transferred
-- during lunch. Do not keep 9:00 / 14:00 hard-coded." The activity commit
-- door's working-day calculation connects to the stored Office calendar.
-- Governing rules: docs/workspace/MASTER.md §4.4 "Office, publication and
-- checks" and "Lunch"; docs/hr/MASTER.md §7 (one hour lunch, configured start
-- between noon and 2:00 PM, the check skips actual lunch until one minute after
-- it ends); Carres Settings List OFF-02 · OFF-03 · OFF-04 · WS-02 · WS-03 ·
-- WS-04 ("Keep assigned tasks; exclude actual lunch from availability check;
-- no task transfer solely for lunch").
--
-- WHAT THIS CHANGES
--  1 workspace_staff_lunch (+ workspace_staff_lunch_changes, append only) —
--      each person's standing lunch start. No row, or an empty start, means the
--      Office lunch. The length is always the Office lunch length. The allowed
--      start is the Office lunch start moved by up to the Office lunch shift
--      either way, kept inside Office hours (defaults: 12:00 PM to 2:00 PM).
--      A saved start the Office calendar no longer allows falls back to the
--      Office lunch; it is never moved to a guessed time.
--  2 _workspace_person_lunch(user) — THE one lunch arithmetic.
--  3 _workspace_activity_window(user, day, period) — THE one window arithmetic,
--      in Asia/Kuala_Lumpur local time:
--        morning   Office start → the morning check time, but never into the
--                  person's lunch (then the person's lunch start);
--        afternoon the person's lunch end → lunch end + (afternoon check time −
--                  Office lunch end), at least one minute, never after Office
--                  end. Derived from configuration, no new constant: at the
--                  owner defaults (lunch 1:00 to 2:00 PM, check 2:01 PM) a
--                  12:00 lunch is checked at 1:01 PM and a 2:00 PM lunch at
--                  3:01 PM.
--  4 _workspace_record_activity_at (0613 body): records from Office start to
--      Office end plus the Office flexi allowance (default one hour, the old
--      7:00 PM), never during the person's own lunch. Was 9:00 AM to 1:00 PM
--      and 2:00 PM to 7:00 PM, fixed.
--  5 workspace_activity_checkpoint_snapshot (0617 body): evidence from Office
--      start (was 9:00 AM); each scope carries its assigned person's own
--      `window` (the Office lunch when nobody is assigned) and `windows`
--      carries every assigned person's and candidate's window.
--  6 workspace_commit_activity_checkpoint (0670 body): the working day is the
--      stored Office work_days, the passed holidays and the recorded Office
--      holidays (was Saturday and Sunday, fixed). The assigned person is judged
--      on their own window; a candidate counts only with an event inside their
--      own window up to now, and never while at lunch now — work is not handed
--      to someone at lunch either. office_calendar is read FOR SHARE and
--      workspace_staff_lunch joins the share-locked tables, so a lunch or
--      Office change cannot slip between the check and the receipt.
--  7 workspace_record_assignment_checkpoint (0618 body): due at, and stores as
--      cutoff_at, the assigned person's own cutoff.
--  8 workspace_set_activity_times (0670 body) and the table CHECK: the check
--      times follow the Office calendar — morning from Office start and before
--      the Office lunch; afternoon after the Office lunch and before Office
--      end. A CHECK cannot read office_calendar, so the fixed
--      10:00/13:00/14:00/18:00 CHECKs are dropped by looked-up name (0670's
--      pattern) and replaced by whole minutes and morning before afternoon.
--      The stored live values are NOT touched; any value the old CHECKs
--      accepted satisfies the new one.
--  9 workspace_staff_lunch_view / workspace_set_staff_lunch — the doors.
--      The person sets their own; a Staff & Duties editor
--      (settings_can_edit('staff_duties'), 0668/0674) sets anyone's.
--
-- NOT CHANGED, ON PURPOSE: the receipt table, the scope engine
-- (_workspace_activity_scope), leave and the movement loop. Lunch is never
-- leave and never unavailability: nobody is marked away or moved for lunch.
--
-- RLS / POLICIES (Constitution §5 red line 2 — what and why):
--   workspace_staff_lunch          SELECT for internal staff (is_internal():
--                                  principal, operation, finance, bd). A lunch
--                                  time is a team routing fact like the duty
--                                  rota; colleagues may see when a person is
--                                  at lunch. No INSERT/UPDATE/DELETE grant:
--                                  workspace_set_staff_lunch is the only
--                                  writer.
--   workspace_staff_lunch_changes  no authenticated grant at all (history is
--                                  read by the service role only, like
--                                  workspace_activity_setting_changes).
--
-- DATA: none moved, none deleted, no row seeded, no row count asserted.
-- =============================================================================

begin;

set search_path = public, pg_temp;

-- ── 1 · each person's standing lunch start ─────────────────────────────────
create table if not exists public.workspace_staff_lunch (
  user_id     uuid primary key references public.app_users(id),
  -- null = follow the Office lunch.
  lunch_start time check (lunch_start is null or extract(second from lunch_start) = 0),
  changed_by  uuid not null references public.app_users(id),
  changed_at  timestamptz not null default clock_timestamp()
);
create table if not exists public.workspace_staff_lunch_changes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.app_users(id),
  old_start  time,
  new_start  time,
  changed_by uuid not null references public.app_users(id),
  changed_at timestamptz not null default clock_timestamp()
);
create index if not exists workspace_staff_lunch_changes_person
  on public.workspace_staff_lunch_changes (user_id, changed_at desc);

alter table public.workspace_staff_lunch enable row level security;
alter table public.workspace_staff_lunch_changes enable row level security;
revoke all on public.workspace_staff_lunch, public.workspace_staff_lunch_changes
  from public, anon, authenticated;
grant select on public.workspace_staff_lunch to authenticated;
drop policy if exists workspace_staff_lunch_read on public.workspace_staff_lunch;
create policy workspace_staff_lunch_read on public.workspace_staff_lunch
  for select to authenticated using ((select public.is_internal()));
grant all on public.workspace_staff_lunch, public.workspace_staff_lunch_changes to service_role;
grant usage, select on sequence public.workspace_staff_lunch_changes_id_seq to service_role;

-- ── 2 · minutes since local midnight, and back ─────────────────────────────
create or replace function public._workspace_clock_minutes(p_time time)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select (extract(hour from p_time) * 60 + extract(minute from p_time))::integer
$fn$;
revoke all on function public._workspace_clock_minutes(time) from public, anon, authenticated;

create or replace function public._workspace_clock_text(p_minutes integer)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select to_char(time '00:00' + make_interval(mins => p_minutes), 'HH24:MI')
$fn$;
revoke all on function public._workspace_clock_text(integer) from public, anon, authenticated;

-- ── 3 · THE one lunch arithmetic ───────────────────────────────────────────
create or replace function public._workspace_person_lunch(p_user uuid)
returns table (
  saved_start      time,
  lunch_start_min  integer,
  lunch_end_min    integer,
  earliest_min     integer,
  latest_min       integer,
  office_start_min integer,
  office_end_min   integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_office public.office_calendar;
  v_saved  time;
  v_start  integer;
  v_end    integer;
  v_ls     integer;
  v_dur    integer;
  v_lo     integer;
  v_hi     integer;
  v_pick   integer;
begin
  select * into strict v_office from public.office_calendar c where c.id = 1;
  v_start := public._workspace_clock_minutes(v_office.start_time);
  v_end   := public._workspace_clock_minutes(v_office.end_time);
  v_ls    := public._workspace_clock_minutes(v_office.lunch_start);
  v_dur   := public._workspace_clock_minutes(v_office.lunch_end) - v_ls;
  -- The Office lunch start, moved by up to the shift either way, inside
  -- Office hours. The Office lunch itself always lies inside this range
  -- (office_calendar_lunch keeps it within the hours).
  v_lo := greatest(v_ls - v_office.lunch_shift_minutes, v_start);
  v_hi := least(v_ls + v_office.lunch_shift_minutes, v_end - v_dur);
  select l.lunch_start into v_saved from public.workspace_staff_lunch l where l.user_id = p_user;
  v_pick := case
    when v_saved is not null and public._workspace_clock_minutes(v_saved) between v_lo and v_hi
      then public._workspace_clock_minutes(v_saved)
    else v_ls
  end;
  return query select v_saved, v_pick, v_pick + v_dur, v_lo, v_hi, v_start, v_end;
end;
$fn$;
revoke all on function public._workspace_person_lunch(uuid) from public, anon, authenticated, service_role;
comment on function public._workspace_person_lunch(uuid) is
  '0677: THE one lunch arithmetic — the person''s saved lunch start when the Office range allows it, else the Office lunch; the Office lunch length; minutes since local midnight.';

-- ── 4 · THE one window arithmetic ──────────────────────────────────────────
create or replace function public._workspace_activity_window(p_user uuid, p_day date, p_period text)
returns table (
  window_start  timestamptz,
  window_cutoff timestamptz,
  lunch_from    timestamptz,
  lunch_until   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_settings public.workspace_activity_settings;
  v_office   public.office_calendar;
  v_lunch    record;
  v_base     timestamp;
  v_from     integer;
  v_to       integer;
begin
  if p_day is null or p_period is null or p_period not in ('morning', 'afternoon') then
    raise exception 'invalid checkpoint period' using errcode = '22023';
  end if;
  v_base := p_day::timestamp;
  select * into strict v_settings from public.workspace_activity_settings s where s.id = 1;
  select * into strict v_office from public.office_calendar c where c.id = 1;
  select * into strict v_lunch from public._workspace_person_lunch(p_user);
  if p_period = 'morning' then
    v_from := v_lunch.office_start_min;
    -- Never into the person's lunch: a later check waits for nobody at lunch.
    v_to := least(public._workspace_clock_minutes(v_settings.morning), v_lunch.lunch_start_min);
  else
    v_from := v_lunch.lunch_end_min;
    -- The same distance after the person's lunch as the shared check time is
    -- after the Office lunch; at least one minute; never after Office end.
    v_to := least(
      v_lunch.lunch_end_min + greatest(
        public._workspace_clock_minutes(v_settings.afternoon)
          - public._workspace_clock_minutes(v_office.lunch_end), 1),
      v_lunch.office_end_min);
  end if;
  v_to := greatest(v_to, v_from);
  return query select
    (v_base + make_interval(mins => v_from)) at time zone 'Asia/Kuala_Lumpur',
    (v_base + make_interval(mins => v_to)) at time zone 'Asia/Kuala_Lumpur',
    (v_base + make_interval(mins => v_lunch.lunch_start_min)) at time zone 'Asia/Kuala_Lumpur',
    (v_base + make_interval(mins => v_lunch.lunch_end_min)) at time zone 'Asia/Kuala_Lumpur';
end;
$fn$;
revoke all on function public._workspace_activity_window(uuid, date, text) from public, anon, authenticated, service_role;
comment on function public._workspace_activity_window(uuid, date, text) is
  '0677: THE one activity window — morning Office start to the morning check (never into the person''s lunch); afternoon the person''s lunch end to lunch end plus (afternoon check minus Office lunch end), at least one minute, never after Office end.';

create or replace function public._workspace_activity_window_json(p_user uuid, p_day date, p_period text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select jsonb_build_object('start', w.window_start, 'cutoff', w.window_cutoff,
                            'lunchStart', w.lunch_from, 'lunchEnd', w.lunch_until)
    from public._workspace_activity_window(p_user, p_day, p_period) w
$fn$;
revoke all on function public._workspace_activity_window_json(uuid, date, text) from public, anon, authenticated, service_role;

-- ── 5 · recording follows the Office hours and skips the person's lunch ────
create or replace function public._workspace_record_activity_at(p_now timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_now timestamptz := p_now; v_day date := timezone('Asia/Kuala_Lumpur', v_now)::date;
  v_office public.office_calendar; v_lunch record;
begin
  if not exists (select 1 from public.app_users u where u.id = auth.uid()
     and u.status = 'active' and u.is_person and u.role in ('operation','principal')) then
    raise exception 'active Operation person required' using errcode = '42501', detail = 'not_operation_person';
  end if;
  select * into strict v_office from public.office_calendar where id = 1;
  select w.lunch_from, w.lunch_until into strict v_lunch
    from public._workspace_activity_window(auth.uid(), v_day, 'afternoon') w;
  -- Before Office start, after Office end plus the flexi allowance, and the
  -- person's own lunch cannot populate a work-period event.
  if v_now < (v_day + v_office.start_time) at time zone 'Asia/Kuala_Lumpur'
     or v_now > (v_day + v_office.end_time + make_interval(mins => v_office.flexi_minutes)) at time zone 'Asia/Kuala_Lumpur'
     or (v_now >= v_lunch.lunch_from and v_now < v_lunch.lunch_until) then
    return;
  end if;
  insert into public.workspace_activity_events(user_id,minute_at,observed_at)
    values(auth.uid(),date_trunc('minute',v_now),v_now)
    on conflict(user_id,minute_at) do nothing;
end;
$$;
revoke all on function public._workspace_record_activity_at(timestamptz) from public, anon, authenticated;

-- ── 6 · the snapshot carries each person's own window ──────────────────────
create or replace function public.workspace_activity_checkpoint_snapshot(p_period text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_now timestamptz:=public._workspace_activity_clock(); v_day date:=timezone('Asia/Kuala_Lumpur',v_now)::date;
  v_settings public.workspace_activity_settings; v_office public.office_calendar;
  v_scopes jsonb; v_windows jsonb; v_events jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service only' using errcode='42501'; end if;
  if p_period is null or p_period not in ('morning','afternoon') then raise exception 'invalid period' using errcode='22023'; end if;
  select * into strict v_settings from public.workspace_activity_settings where id=1;
  select * into strict v_office from public.office_calendar where id=1;
  with s as materialized (
    select public._workspace_activity_scope(t,k,v_day) sc from (
      select 'duty'::text t, unnest(array['po_duty','grn_duty','delivery_duty']) k
      union all select 'order',oc.order_id::text from public.ops_order_control oc join public.orders o on o.id=oc.order_id
        where o.status is distinct from 'cancelled' and o.status is distinct from 'delivered' and o.operation_stage is distinct from 'delivered'
    ) scopes where not exists(select 1 from public.workspace_assignment_checkpoints r
      where r.scope_type=t and r.scope_key=k and r.office_day=v_day and r.period=p_period)
  ), people as (
    select distinct p from (
      select nullif(s.sc->>'assignedUserId','')::uuid p from s
      union all select c::uuid from s cross join lateral jsonb_array_elements_text(s.sc->'candidateUserIds') c
    ) x where p is not null
  )
  select
    coalesce((select jsonb_agg(s.sc || jsonb_build_object('window',
      public._workspace_activity_window_json(nullif(s.sc->>'assignedUserId','')::uuid, v_day, p_period))) from s), '[]'::jsonb),
    coalesce((select jsonb_object_agg(people.p::text, public._workspace_activity_window_json(people.p, v_day, p_period))
      from people), '{}'::jsonb)
    into v_scopes, v_windows;
  select coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'observedAt',observed_at)),'[]'::jsonb) into v_events
    from public.workspace_activity_events where observed_at >= (v_day+v_office.start_time) at time zone 'Asia/Kuala_Lumpur'
      and observed_at <= v_now;
  return jsonb_build_object('day',v_day,'now',v_now,
    'settings',jsonb_build_object('morning',to_char(v_settings.morning,'HH24:MI'),'afternoon',to_char(v_settings.afternoon,'HH24:MI'),'revision',v_settings.revision),
    'evidence',jsonb_build_object('status','healthy','events',v_events),'scopes',v_scopes,'windows',v_windows);
end;
$$;
revoke all on function public.workspace_activity_checkpoint_snapshot(text) from public,anon,authenticated;
grant execute on function public.workspace_activity_checkpoint_snapshot(text) to service_role;

-- ── 7 · the commit door: Office working days, each person's own window ─────
create or replace function public.workspace_commit_activity_checkpoint(
  p_scope_type text,p_scope_key text,p_office_day date,p_period text,p_settings_revision bigint,
  p_previous_receipt_id bigint,p_from_user_id uuid,p_to_user_id uuid,p_outcome text,p_reason text,
  p_office_holidays date[]
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_scope jsonb; v_settings public.workspace_activity_settings; v_office public.office_calendar;
 v_window record; v_clock timestamptz;
 v_active boolean; v_candidate uuid; v_existing public.workspace_assignment_checkpoints;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service only' using errcode='42501'; end if;
  if p_period is null or p_period not in ('morning','afternoon') then raise exception 'invalid period' using errcode='22023'; end if;
  -- Source changes take row-exclusive table locks. Hold these short share locks
  -- across validation and receipt insert so a concurrent leave/assignment/source
  -- completion, or a lunch change, cannot invalidate the decision between its
  -- check and commit.
  lock table public.workspace_duty_assignments,public.workspace_duty_covers,public.app_users,
    public.ops_staff_settings,public.hr_employees,public.orders,public.ops_order_control,public.payment_collection_owners,
    public.staff_leave,public.workspace_staff_lunch in share mode;
  select * into strict v_office from public.office_calendar where id=1 for share;
  -- The stored Office calendar decides the working day: its working weekdays,
  -- the holidays the caller passes (the calendar in force, built-in years
  -- included) and every recorded Office holiday.
  if p_office_day is null or p_office_holidays is null or p_office_day=any(p_office_holidays)
     or not (extract(dow from p_office_day)::smallint = any(v_office.work_days))
     or exists(select 1 from public.office_holidays h where h.holiday_date=p_office_day) then
    raise exception 'not an Office working day' using errcode='22023'; end if;
  select * into strict v_settings from public.workspace_activity_settings where id=1 for share;
  select * into v_existing from public.workspace_assignment_checkpoints where scope_type=p_scope_type
    and scope_key=p_scope_key and office_day=p_office_day and period=p_period;
  if found then return to_jsonb(v_existing); end if;
  if p_scope_type='order' and not exists(select 1 from public.orders o join public.ops_order_control oc on oc.order_id=o.id
    where o.id::text=p_scope_key and o.status is distinct from 'cancelled' and o.status is distinct from 'delivered'
      and o.operation_stage is distinct from 'delivered') then
    raise exception 'source no longer open' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope_type||':'||p_scope_key||':'||p_office_day::text,0));
  v_scope:=public._workspace_activity_scope(p_scope_type,p_scope_key,p_office_day);
  if nullif(v_scope->>'assignedUserId','')::uuid is distinct from p_from_user_id
    or nullif(v_scope->>'previousReceiptId','')::bigint is distinct from p_previous_receipt_id
    or v_settings.revision is distinct from p_settings_revision then
    raise exception 'source changed' using errcode='40001'; end if;
  -- The assigned person is judged on their OWN window (the Office lunch when
  -- nobody is assigned).
  select w.* into strict v_window from public._workspace_activity_window(p_from_user_id,p_office_day,p_period) w;
  v_clock:=public._workspace_activity_clock();
  select exists(select 1 from public.workspace_activity_events where user_id=p_from_user_id
      and observed_at between v_window.window_start and v_window.window_cutoff)
    and (v_scope->>'assignedPersonEligible')::boolean into v_active;
  -- A candidate counts only with an event inside their OWN window up to now,
  -- and never while at lunch now: work is not handed to someone at lunch.
  select candidate::uuid into v_candidate
    from jsonb_array_elements_text(v_scope->'candidateUserIds') with ordinality c(candidate,priority)
    cross join lateral public._workspace_activity_window(candidate::uuid,p_office_day,p_period) cw
   where candidate::uuid is distinct from p_from_user_id
     and not (v_clock >= cw.lunch_from and v_clock < cw.lunch_until)
     and exists(select 1 from public.workspace_activity_events e where e.user_id=candidate::uuid
       and e.observed_at >= cw.window_start and e.observed_at <= least(cw.window_cutoff,v_clock))
   order by priority limit 1;
  if (p_outcome='active' and not v_active)
    or (p_outcome='reassigned' and (v_active or v_candidate is distinct from p_to_user_id))
    or (p_outcome='no_candidate' and (v_active or v_candidate is not null)) then
    raise exception 'period evidence changed' using errcode='40001'; end if;
  return public.workspace_record_assignment_checkpoint(p_scope_type,p_scope_key,p_office_day,p_period,p_settings_revision,
    p_previous_receipt_id,p_from_user_id,p_to_user_id,p_outcome,p_reason);
end;
$$;
revoke all on function public.workspace_commit_activity_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text,date[]) from public,anon,authenticated;
grant execute on function public.workspace_commit_activity_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text,date[]) to service_role;

-- ── 8 · the receipt is due at, and keeps, the assigned person's cutoff ─────
create or replace function public.workspace_record_assignment_checkpoint(
  p_scope_type text, p_scope_key text, p_office_day date, p_period text,
  p_settings_revision bigint, p_previous_receipt_id bigint,
  p_from_user_id uuid, p_to_user_id uuid, p_outcome text, p_reason text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_settings public.workspace_activity_settings;
  v_previous public.workspace_assignment_checkpoints;
  v_receipt public.workspace_assignment_checkpoints;
  v_cutoff timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service only' using errcode = '42501';
  end if;
  if p_scope_type is null or p_scope_type not in ('duty','order') or nullif(btrim(p_scope_key),'') is null
     or p_period is null or p_period not in ('morning','afternoon')
     or p_office_day is distinct from timezone('Asia/Kuala_Lumpur',public._workspace_activity_clock())::date then
    raise exception 'invalid checkpoint scope' using errcode = '22023';
  end if;
  if p_scope_type = 'duty' and p_scope_key not in ('po_duty','grn_duty','delivery_duty') then
    raise exception 'ordinary duty required' using errcode = '22023';
  end if;
  if p_scope_type = 'order' and not exists (select 1 from public.orders where id::text = p_scope_key) then
    raise exception 'order not found' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope_type || ':' || p_scope_key || ':' || p_office_day::text, 0));
  select * into v_receipt from public.workspace_assignment_checkpoints
   where scope_type = p_scope_type and scope_key = p_scope_key and office_day = p_office_day and period = p_period;
  -- A retry returns the committed decision, never a freshly recalculated one.
  if found then return to_jsonb(v_receipt); end if;
  select * into strict v_settings from public.workspace_activity_settings where id = 1 for share;
  if v_settings.revision is distinct from p_settings_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;
  -- The assigned person's own cutoff (0677): nobody's check falls in their lunch.
  select w.window_cutoff into strict v_cutoff
    from public._workspace_activity_window(p_from_user_id, p_office_day, p_period) w;
  if public._workspace_activity_clock() < v_cutoff then
    raise exception 'checkpoint not due' using errcode = '22023';
  end if;
  select * into v_previous from public.workspace_assignment_checkpoints
   where scope_type = p_scope_type and scope_key = p_scope_key and office_day = p_office_day
   order by id desc limit 1;
  if v_previous.id is distinct from p_previous_receipt_id
     or (v_previous.period = 'afternoon' and p_period = 'morning') then
    raise exception 'assignment changed' using errcode = '40001', detail = 'assignment_changed';
  end if;
  if p_outcome is null or p_reason is null or not (
    (p_outcome = 'active' and p_reason = 'active' and p_from_user_id is not null)
    or (p_outcome = 'reassigned' and p_reason in ('missing_period_activity','no_longer_eligible'))
    or (p_outcome = 'not_assigned' and p_reason = 'not_assigned' and p_from_user_id is null)
    or (p_outcome = 'no_candidate' and p_reason = 'no_candidate' and p_from_user_id is not null)
  ) then raise exception 'invalid checkpoint result' using errcode = '22023'; end if;
  if p_outcome = 'reassigned' and not exists (
    select 1 from public.app_users u where u.id = p_to_user_id and u.is_person
      and u.status = 'active' and u.role in ('operation','principal')
  ) then raise exception 'active Operation person required' using errcode = '22023'; end if;
  insert into public.workspace_assignment_checkpoints(scope_type,scope_key,office_day,period,
    settings_revision,cutoff_at,from_user_id,to_user_id,outcome,reason)
  values (p_scope_type,p_scope_key,p_office_day,p_period,p_settings_revision,v_cutoff,
    p_from_user_id,p_to_user_id,p_outcome,p_reason) returning * into v_receipt;
  return to_jsonb(v_receipt);
end;
$$;
revoke all on function public.workspace_record_assignment_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text)
  from public, anon, authenticated, service_role;

-- ── 9 · the check times follow the Office calendar ─────────────────────────
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.workspace_activity_settings'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~ '\m(morning|afternoon)\M'
  loop
    execute format('alter table public.workspace_activity_settings drop constraint %I', v_name);
  end loop;
end $$;
alter table public.workspace_activity_settings
  add constraint workspace_activity_settings_check_times
  check (extract(second from morning) = 0 and extract(second from afternoon) = 0 and morning < afternoon);

create or replace function public.workspace_set_activity_times(p_morning time, p_afternoon time, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before public.workspace_activity_settings; v_after public.workspace_activity_settings;
  v_office public.office_calendar;
begin
  perform public.workspace_duty_settings_gate();
  select * into strict v_office from public.office_calendar where id = 1;
  -- Morning: from Office start, before the Office lunch. Afternoon: after the
  -- Office lunch, before Office end (Settings → Office, 0669).
  if p_morning is null or p_afternoon is null or p_revision is null
     or p_morning < v_office.start_time or p_morning >= v_office.lunch_start
     or p_afternoon <= v_office.lunch_end or p_afternoon >= v_office.end_time
     or extract(second from p_morning) <> 0 or extract(second from p_afternoon) <> 0 then
    raise exception 'invalid check times' using errcode = '22023', detail = 'invalid_check_times';
  end if;
  select * into strict v_before from public.workspace_activity_settings where id = 1 for update;
  if v_before.revision <> p_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;
  if v_before.morning = p_morning and v_before.afternoon = p_afternoon then
    return to_jsonb(v_before);
  end if;
  update public.workspace_activity_settings
     set morning = p_morning, afternoon = p_afternoon, revision = revision + 1,
         changed_at = clock_timestamp(), changed_by = auth.uid()
   where id = 1 returning * into v_after;
  insert into public.workspace_activity_setting_changes(previous_values,new_values,changed_by)
    values (to_jsonb(v_before),to_jsonb(v_after),auth.uid());
  return to_jsonb(v_after);
end;
$$;
revoke all on function public.workspace_set_activity_times(time,time,bigint) from public, anon;
grant execute on function public.workspace_set_activity_times(time,time,bigint) to authenticated;

-- ── 10 · the lunch doors ───────────────────────────────────────────────────
-- Who may set a person's lunch: the person themselves (an active internal
-- person), or a Staff & Duties editor who is a person, for any active
-- internal person.
create or replace function public._workspace_staff_lunch_can_set(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p_user is not null
     and exists (select 1 from public.app_users t
                  where t.id = p_user and t.status = 'active' and t.is_person
                    and t.role in ('principal', 'operation', 'finance', 'bd', 'hr'))
     and (p_user = auth.uid()
          or (coalesce(public.settings_can_edit('staff_duties'), false)
              and public.workspace_is_person(auth.uid())))
$fn$;
revoke all on function public._workspace_staff_lunch_can_set(uuid) from public, anon, authenticated, service_role;

create or replace function public.workspace_staff_lunch_view(p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user    uuid := coalesce(p_user, auth.uid());
  v_today   date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_office  public.office_calendar;
  v_lunch   record;
  v_morning record;
  v_after   record;
begin
  if not coalesce((select public.is_internal()), false) then
    raise exception 'internal staff only' using errcode = '42501';
  end if;
  if v_user is null or not exists (select 1 from public.app_users where id = v_user) then
    raise exception 'person not found' using errcode = '22023', detail = 'person_not_found';
  end if;
  select * into strict v_office from public.office_calendar where id = 1;
  select * into strict v_lunch from public._workspace_person_lunch(v_user);
  select * into strict v_morning from public._workspace_activity_window(v_user, v_today, 'morning');
  select * into strict v_after from public._workspace_activity_window(v_user, v_today, 'afternoon');
  return jsonb_build_object(
    'userId', v_user,
    'saved', to_char(v_lunch.saved_start, 'HH24:MI'),
    'savedFits', v_lunch.saved_start is null
      or public._workspace_clock_minutes(v_lunch.saved_start) between v_lunch.earliest_min and v_lunch.latest_min,
    'lunchStart', public._workspace_clock_text(v_lunch.lunch_start_min),
    'lunchEnd', public._workspace_clock_text(v_lunch.lunch_end_min),
    'earliest', public._workspace_clock_text(v_lunch.earliest_min),
    'latest', public._workspace_clock_text(v_lunch.latest_min),
    'officeLunchStart', to_char(v_office.lunch_start, 'HH24:MI'),
    'officeLunchEnd', to_char(v_office.lunch_end, 'HH24:MI'),
    'morningCheck', to_char(timezone('Asia/Kuala_Lumpur', v_morning.window_cutoff), 'HH24:MI'),
    'afternoonCheck', to_char(timezone('Asia/Kuala_Lumpur', v_after.window_cutoff), 'HH24:MI'),
    'canEdit', public._workspace_staff_lunch_can_set(v_user));
end;
$fn$;
revoke all on function public.workspace_staff_lunch_view(uuid) from public, anon;
grant execute on function public.workspace_staff_lunch_view(uuid) to authenticated;

create or replace function public.workspace_set_staff_lunch(p_user uuid, p_lunch_start time)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user   uuid := coalesce(p_user, auth.uid());
  v_lunch  record;
  v_old    time;
  v_had    boolean;
begin
  if not public._workspace_staff_lunch_can_set(v_user) then
    raise exception 'only the person or a Staff & Duties editor sets a lunch time'
      using errcode = '42501', detail = 'not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace_staff_lunch:' || v_user::text, 0));
  select * into strict v_lunch from public._workspace_person_lunch(v_user);
  if p_lunch_start is not null and (
       extract(second from p_lunch_start) <> 0
       or public._workspace_clock_minutes(p_lunch_start) not between v_lunch.earliest_min and v_lunch.latest_min) then
    raise exception 'choose a lunch start inside the Office range'
      using errcode = '22023', detail = 'lunch_outside_range';
  end if;
  select l.lunch_start into v_old from public.workspace_staff_lunch l where l.user_id = v_user for update;
  v_had := found;
  if (v_had and v_old is not distinct from p_lunch_start) or (not v_had and p_lunch_start is null) then
    return public.workspace_staff_lunch_view(v_user);
  end if;
  insert into public.workspace_staff_lunch (user_id, lunch_start, changed_by, changed_at)
  values (v_user, p_lunch_start, auth.uid(), clock_timestamp())
  on conflict (user_id) do update
    set lunch_start = excluded.lunch_start, changed_by = excluded.changed_by, changed_at = excluded.changed_at;
  insert into public.workspace_staff_lunch_changes (user_id, old_start, new_start, changed_by)
  values (v_user, v_old, p_lunch_start, auth.uid());
  return public.workspace_staff_lunch_view(v_user);
end;
$fn$;
revoke all on function public.workspace_set_staff_lunch(uuid, time) from public, anon;
grant execute on function public.workspace_set_staff_lunch(uuid, time) to authenticated;

-- ── 11 · sanity: schema and privileges only, never a row count ─────────────
do $$
begin
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public'
                and table_name in ('workspace_staff_lunch', 'workspace_staff_lunch_changes')
                and grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception '0677 sanity: lunch tables must be written through the door only';
  end if;
  if has_table_privilege('authenticated', 'public.workspace_staff_lunch_changes', 'select') then
    raise exception '0677 sanity: the lunch change record is not an authenticated read';
  end if;
  if has_function_privilege('authenticated', 'public._workspace_activity_window(uuid, date, text)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_person_lunch(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_staff_lunch_can_set(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_activity_window_json(uuid, date, text)', 'execute') then
    raise exception '0677 sanity: a private helper is executable by authenticated';
  end if;
  if exists (select 1 from public._workspace_activity_window(null, current_date, 'morning') w
              where w.window_cutoff < w.window_start)
     or exists (select 1 from public._workspace_activity_window(null, current_date, 'afternoon') w
              where w.window_cutoff < w.window_start or w.window_start < w.lunch_until) then
    raise exception '0677 sanity: an activity window runs backwards or starts inside lunch';
  end if;
end $$;

commit;

-- VERIFY AFTER the governed apply (no row-count assertion):
--   select morning, afternoon from public.workspace_activity_settings;   -- unchanged
--   select * from public._workspace_activity_window(null, current_date, 'afternoon');
--     at the owner defaults: lunch 13:00–14:00 local, window 14:00 → the stored
--     afternoon check time.
