-- =============================================================================
-- 0671 — PO and GRN Duty rotate every month by themselves, and Saturday
--        on-call keeps its own small rota
-- =============================================================================
-- OWNER RULES (Jess, confirmed 9 Oct 2026; `Carres Settings List.md` WS-05,
-- WS-07, WS-12, "PO Duty rota", "GRN Duty rota", "Separate PO and GRN
-- holders", "Saturday on-call boundary"; docs/workspace/MASTER.md §4 JOINER /
-- NEWCOMER / MONTHLY ROTATION ORDER and §4.4 "Saturday on-call coverage is
-- separate"):
--
-- A · MONTHLY PO / GRN ROTA
--   · PO Duty and GRN Duty rotate once per calendar month, one coordinating
--     holder each, normally different people. Stable cyclic order of active
--     routine Operation people (staff code order — the order the cover engine
--     already uses). Each month PO advances one position from last month's
--     PO holder; GRN is the next person after the PO holder:
--       PO A / GRN B → PO B / GRN C → PO C / GRN A.
--   · Newcomer: no PO Duty in the joining calendar month (0670's
--     _workspace_po_eligible — the same arithmetic cover uses). GRN has no
--     wait. A newcomer with a later staff code joins the end of the order.
--   · Departed / inactive people drop out at once; a planned future month
--     whose holder is no longer active is re-planned.
--   · One eligible person may hold both; nobody eligible → no row is written
--     and the month shows as not assigned. Nobody is invented.
--   · Output: rows in workspace_duty_assignments for the month (first day to
--     last day), origin 'monthly_rotation', assigned_by NULL (the system), note
--     `Monthly rotation`. Staff & Duties already shows a future row as `Next`.
--   · Never overwrites a month a manager set: a manual row starting inside
--     the month makes the planner leave that Duty's month alone. A later dated
--     exception still wins on its own days (newest effective_from), so no
--     manual choice is ever replaced.
--   · A planned month that has not begun follows the cycle as it stands
--     (newcomer admitted, exit date recorded): when the arithmetic no longer
--     agrees, a newer row is appended for the month. A month already running
--     is never flipped, except when its holder is no longer active (re-planned
--     from today).
--   · 0437 pre-wrote the two-person alternation (Oct 2026 to Sep 2027) as
--     manual rows noted 'Two-person Operation duty rotation'. They are this
--     rotation, so they are labelled origin 'monthly_rotation' (no other
--     change). Left as manual they would freeze the cycle for a year and keep
--     a newcomer out of PO until September 2027.
--   · Rotation does not override recorded cover or leave (0670 reads those at
--     resolution time on top of the month's holder).
--   · Run: the daily 09:00 MYT cron plans the current month only when the
--     rotation is already running and that month is missing (a missed run),
--     starting today so no past day is rewritten; from the 25th it plans next
--     month so `Next` is visible. A month whose rotation never ran (today's
--     manual baseline) is never planned mid-month.
--
-- B · SATURDAY ON-CALL — NOT a Duty
--   · Rotating contact coverage, default 9:00 AM to 6:00 PM, editable. The
--     person answers customer, driver and warehouse calls and WhatsApp and
--     records any follow-up. It is NOT Saturday Office attendance, NOT PO
--     Duty, NOT GRN Duty, NOT in the Duty catalogue, and it never moves a
--     routine Task. Office working days and every deadline stay independent.
--   · Rotation frequency is not decided → no automatic rotation. Stored: one
--     editable time window (with its change history) and a dated rota
--     (Saturday → on-call person, optional cover person), appended, never
--     edited. A person on leave that Saturday is flagged, never replaced.
--   · Edited by Staff & Duties editors only: _settings_require_editor
--     ('staff_duties') (0669; settings_can_edit, 0668 = Jess or a person she
--     names for that section).
--
-- RLS / POLICIES ADDED (Constitution §5 red line 2 — what and why):
--   workspace_saturday_on_call_window, workspace_saturday_on_call,
--   workspace_saturday_on_call_window_changes: SELECT for operation and
--     principal (the Staff & Duties readers). No INSERT/UPDATE/DELETE grant:
--     the definer doors below are the only writers.
--   workspace_duty_assignments: unchanged policy; one new column `origin`.
--
-- DATA: one default window row (9:00 AM to 6:00 PM). The 0437 rotation rows
-- gain origin 'monthly_rotation' (their only change). No rota row and no Duty
-- assignment is written by this file. No row count is asserted.
-- =============================================================================

begin;

set search_path = public, pg_temp;

-- ── A1 · an assignment says whether the monthly rotation made it ───────────
alter table public.workspace_duty_assignments
  add column if not exists origin text not null default 'manual'
    check (origin in ('manual', 'monthly_rotation'));
comment on column public.workspace_duty_assignments.origin is
  '0671: manual = a person''s Staff & Duties act (or a governed bootstrap); monthly_rotation = written by the PO/GRN monthly rota (assigned_by NULL).';

create index if not exists workspace_duty_assignments_origin_month
  on public.workspace_duty_assignments (duty_key, origin, effective_from);

-- 0437 (the 2026-09-07 offboarding) pre-wrote the two-person PO/GRN
-- alternation month by month from October 2026 to September 2027, noted
-- 'Two-person Operation duty rotation'. Those rows ARE the monthly rotation,
-- not a manager's month: labelled so, the planner keeps each one while the
-- cycle agrees and re-plans a month that has not begun when it no longer does
-- (a newcomer admitted, a person leaving). No row is changed otherwise and
-- none is removed.
update public.workspace_duty_assignments
   set origin = 'monthly_rotation'
 where duty_key in ('po_duty', 'grn_duty')
   and note = 'Two-person Operation duty rotation'
   and origin = 'manual';

-- ── A2 · who the rotation may choose for a month ───────────────────────────
-- Active routine Operation PEOPLE (role operation; the principal is not in the
-- routine cycle), still employed through the month, and — PO only — past the
-- newcomer month (0670 _workspace_po_eligible on the month's first day).
create or replace function public._workspace_rota_pool(p_duty text, p_start date, p_end date)
returns table (user_id uuid, staff_code text)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select u.id, u.staff_code
    from public.app_users u
    left join public.hr_employees h on h.app_user_id = u.id
   where u.is_person
     and u.status = 'active'
     and u.role = 'operation'
     and (h.exit_date is null or h.exit_date >= p_end)
     and (p_duty <> 'po_duty' or public._workspace_po_eligible(u.id, p_start))
$fn$;
revoke all on function public._workspace_rota_pool(text, date, date) from public, anon, authenticated, service_role;

-- The next person in the stable cycle after a staff code: the first code after
-- it, wrapping round to the start. NULL reference = the start of the order.
create or replace function public._workspace_rota_next(
  p_duty text, p_start date, p_end date, p_after_code text, p_skip uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p.user_id
    from public._workspace_rota_pool(p_duty, p_start, p_end) p
   where p.user_id is distinct from p_skip
   order by case when p_after_code is null then 0
                 when coalesce(p.staff_code, '') > p_after_code then 0 else 1 end,
            p.staff_code, p.user_id
   limit 1
$fn$;
revoke all on function public._workspace_rota_next(text, date, date, text, uuid) from public, anon, authenticated, service_role;

-- ── A3 · the planner ───────────────────────────────────────────────────────
create or replace function public._workspace_plan_duty_rota(p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today      date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_start      date := date_trunc('month', p_month)::date;
  v_end        date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_prev_start date := (date_trunc('month', p_month) - interval '1 month')::date;
  v_first      date;
  v_anchor     uuid;
  v_po         uuid;
  v_ref_code   text;
  v_duty       text;
  v_holder     uuid;
  v_kept       public.workspace_duty_assignments;
  v_out        jsonb := '[]'::jsonb;
  v_outcome    text;
begin
  if p_month is null then
    raise exception 'a month is required' using errcode = '22023', detail = 'invalid_month';
  end if;
  if v_end < v_today then
    raise exception 'a past month is never planned' using errcode = '22023', detail = 'past_month';
  end if;
  -- A month already running starts today: no past day's answer is rewritten.
  v_first := greatest(v_start, v_today);
  perform pg_advisory_xact_lock(hashtextextended('workspace_duty_rota:' || v_start::text, 0));

  -- Last month's PO position: its rotation row, else whoever held PO on its
  -- last day (any origin, active or not — only the position is read).
  select a.holder_id into v_anchor
    from public.workspace_duty_assignments a
   where a.duty_key = 'po_duty' and a.origin = 'monthly_rotation'
     and a.effective_from between v_prev_start and v_start - 1
   order by a.effective_from desc, a.created_at desc limit 1;
  if v_anchor is null then
    select a.holder_id into v_anchor
      from public.workspace_duty_assignments a
     where a.duty_key = 'po_duty'
       and a.effective_from <= v_start - 1
       and (a.effective_until is null or a.effective_until >= v_start - 1)
     order by a.effective_from desc, a.created_at desc limit 1;
  end if;

  foreach v_duty in array array['po_duty', 'grn_duty'] loop
    v_outcome := null;
    -- The month's live rotation row, if one exists.
    select * into v_kept
      from public.workspace_duty_assignments a
     where a.duty_key = v_duty and a.origin = 'monthly_rotation'
       and a.effective_from between v_start and v_end
     order by a.effective_from desc, a.created_at desc limit 1;

    if exists (select 1 from public.workspace_duty_assignments a
                where a.duty_key = v_duty and a.origin = 'manual'
                  and a.effective_from between v_start and v_end) then
      v_outcome := 'manager_set';
    elsif v_kept.id is null and v_start <= v_today
          and not exists (select 1 from public.workspace_duty_assignments a
                           where a.duty_key = v_duty and a.origin = 'monthly_rotation'
                             and a.effective_from between v_prev_start and v_start - 1) then
      -- The rotation has not started for this Duty: today's manual baseline
      -- stays until a future month is planned.
      v_outcome := 'not_rotating';
    end if;

    if v_outcome is not null then
      -- What the month actually holds is GRN's reference when PO is not planned.
      if v_duty = 'po_duty' then
        v_po := (select a.holder_id from public.workspace_duty_assignments a
                  where a.duty_key = 'po_duty' and a.effective_from <= v_first
                    and (a.effective_until is null or a.effective_until >= v_first)
                  order by a.effective_from desc, a.created_at desc limit 1);
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'duty_key', v_duty, 'outcome', v_outcome, 'holder_id', null));
      continue;
    end if;

    -- The arithmetic's answer for the month.
    if v_duty = 'po_duty' then
      v_holder := public._workspace_rota_next('po_duty', v_start, v_end,
                    (select staff_code from public.app_users where id = v_anchor), null);
    else
      v_ref_code := coalesce((select staff_code from public.app_users where id = v_po),
                             (select staff_code from public.app_users where id = v_anchor));
      -- The next person after the PO holder; the PO holder too only when they
      -- are the one eligible person left.
      v_holder := public._workspace_rota_next('grn_duty', v_start, v_end, v_ref_code, v_po);
      if v_holder is null and v_po is not null
         and exists (select 1 from public._workspace_rota_pool('grn_duty', v_start, v_end) p
                      where p.user_id = v_po) then
        v_holder := v_po;
      end if;
    end if;

    -- A planned month stands while its holder is active and either the month
    -- has begun (never flipped mid-month) or the arithmetic still agrees. A
    -- month not yet begun follows a changed cycle (a newcomer admitted, an
    -- exit date recorded) before it starts.
    if v_kept.id is not null
       and exists (select 1 from public.app_users u
                    where u.id = v_kept.holder_id and u.is_person
                      and u.status = 'active' and u.role = 'operation')
       and (v_start <= v_today or v_holder is null or v_holder = v_kept.holder_id) then
      if v_duty = 'po_duty' then v_po := v_kept.holder_id; end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'duty_key', v_duty, 'outcome', 'kept', 'holder_id', v_kept.holder_id));
      continue;
    end if;
    if v_duty = 'po_duty' then v_po := v_holder; end if;

    if v_holder is null then
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'duty_key', v_duty, 'outcome', 'no_eligible', 'holder_id', null));
      continue;
    end if;

    -- created_at from the statement clock: a re-plan in the same transaction
    -- as the row it replaces is still the newer row (newest wins).
    insert into public.workspace_duty_assignments
      (duty_key, holder_id, effective_from, effective_until, assigned_by, note, origin, created_at)
    values (v_duty, v_holder, v_first, v_end, null, 'Monthly rotation', 'monthly_rotation', clock_timestamp());
    insert into public.audit_log (role, actor_text, action, ref)
    values (null, 'System',
            format('Assigned %s to %s from %s until %s (monthly rotation)', v_duty,
                   coalesce((select name from public.app_users where id = v_holder), 'staff'),
                   to_char(v_first, 'DD Mon YYYY'), to_char(v_end, 'DD Mon YYYY')),
            v_duty);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'duty_key', v_duty,
      'outcome', case when v_kept.id is null then 'planned' else 'replanned' end,
      'holder_id', v_holder));
  end loop;

  return jsonb_build_object('month', v_start, 'from', v_first, 'duties', v_out);
end;
$fn$;
revoke all on function public._workspace_plan_duty_rota(date) from public, anon, authenticated, service_role;

-- The door: the scheduler (service role), or a Staff & Duties editor.
create or replace function public.workspace_plan_duty_rota(p_month date)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if auth.role() is distinct from 'service_role' then
    perform public._settings_require_editor('staff_duties');
  end if;
  return public._workspace_plan_duty_rota(p_month);
end;
$fn$;
revoke all on function public.workspace_plan_duty_rota(date) from public, anon;
grant execute on function public.workspace_plan_duty_rota(date) to authenticated, service_role;

-- ── B1 · the Saturday on-call time window (one row, editable, history) ─────
create table if not exists public.workspace_saturday_on_call_window (
  id         smallint primary key default 1 check (id = 1),
  starts_at  time not null default '09:00',
  ends_at    time not null default '18:00',
  revision   bigint not null default 1,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.app_users(id),
  constraint workspace_saturday_on_call_window_order check (
    starts_at < ends_at
    and extract(second from starts_at) = 0 and extract(second from ends_at) = 0)
);
insert into public.workspace_saturday_on_call_window (id) values (1) on conflict (id) do nothing;

create table if not exists public.workspace_saturday_on_call_window_changes (
  id              bigint generated always as identity primary key,
  previous_values jsonb not null,
  new_values      jsonb not null,
  changed_at      timestamptz not null default now(),
  changed_by      uuid not null references public.app_users(id)
);

-- ── B2 · the dated rota: newest row per Saturday is the answer ─────────────
create table if not exists public.workspace_saturday_on_call (
  id              uuid primary key default gen_random_uuid(),
  saturday        date not null check (extract(isodow from saturday) = 6),
  person_id       uuid references public.app_users(id),
  cover_person_id uuid references public.app_users(id),
  note            text check (note is null or length(note) between 1 and 200),
  assigned_by     uuid not null references public.app_users(id),
  created_at      timestamptz not null default clock_timestamp(),
  constraint workspace_saturday_on_call_cover_needs_person check (cover_person_id is null or person_id is not null),
  constraint workspace_saturday_on_call_two_people check (cover_person_id is null or cover_person_id <> person_id)
);
comment on table public.workspace_saturday_on_call is
  '0671: Saturday on-call contact coverage (owner 9 Oct 2026). Not a Duty, not Office attendance; never moves a routine Task. Appended only — the newest row for a Saturday is its answer; person NULL clears it.';
create index if not exists workspace_saturday_on_call_day on public.workspace_saturday_on_call (saturday, created_at desc);

alter table public.workspace_saturday_on_call_window enable row level security;
alter table public.workspace_saturday_on_call_window_changes enable row level security;
alter table public.workspace_saturday_on_call enable row level security;
revoke all on public.workspace_saturday_on_call_window, public.workspace_saturday_on_call_window_changes,
  public.workspace_saturday_on_call from public, anon, authenticated;
grant select on public.workspace_saturday_on_call_window, public.workspace_saturday_on_call_window_changes,
  public.workspace_saturday_on_call to authenticated;
grant all on public.workspace_saturday_on_call_window, public.workspace_saturday_on_call_window_changes,
  public.workspace_saturday_on_call to service_role;
drop policy if exists workspace_saturday_on_call_window_read on public.workspace_saturday_on_call_window;
create policy workspace_saturday_on_call_window_read on public.workspace_saturday_on_call_window
  for select to authenticated using (coalesce((select public.app_role())::text in ('operation', 'principal'), false));
drop policy if exists workspace_saturday_on_call_window_changes_read on public.workspace_saturday_on_call_window_changes;
create policy workspace_saturday_on_call_window_changes_read on public.workspace_saturday_on_call_window_changes
  for select to authenticated using (coalesce((select public.app_role())::text in ('operation', 'principal'), false));
drop policy if exists workspace_saturday_on_call_read on public.workspace_saturday_on_call;
create policy workspace_saturday_on_call_read on public.workspace_saturday_on_call
  for select to authenticated using (coalesce((select public.app_role())::text in ('operation', 'principal'), false));

-- Who may be on call: an active Operation person or the principal person.
create or replace function public._workspace_on_call_eligible(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (select 1 from public.app_users u
                  where u.id = p_user and u.is_person and u.status = 'active'
                    and u.role in ('operation', 'principal'))
$fn$;
revoke all on function public._workspace_on_call_eligible(uuid) from public, anon, authenticated, service_role;

-- ── B3 · the doors ─────────────────────────────────────────────────────────
create or replace function public.workspace_saturday_on_call_save_window(
  p_starts_at time, p_ends_at time, p_revision bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_before public.workspace_saturday_on_call_window; v_after public.workspace_saturday_on_call_window;
begin
  perform public._settings_require_editor('staff_duties');
  if p_starts_at is null or p_ends_at is null or p_revision is null
     or p_starts_at >= p_ends_at
     or extract(second from p_starts_at) <> 0 or extract(second from p_ends_at) <> 0 then
    raise exception 'the on-call time is not valid' using errcode = '22023', detail = 'invalid_window';
  end if;
  select * into strict v_before from public.workspace_saturday_on_call_window where id = 1 for update;
  if v_before.revision <> p_revision then
    raise exception 'settings changed' using errcode = '40001', detail = 'settings_changed';
  end if;
  if v_before.starts_at = p_starts_at and v_before.ends_at = p_ends_at then
    return to_jsonb(v_before);
  end if;
  update public.workspace_saturday_on_call_window
     set starts_at = p_starts_at, ends_at = p_ends_at, revision = revision + 1,
         changed_at = clock_timestamp(), changed_by = auth.uid()
   where id = 1 returning * into v_after;
  insert into public.workspace_saturday_on_call_window_changes (previous_values, new_values, changed_by)
  values (jsonb_build_object('starts_at', v_before.starts_at, 'ends_at', v_before.ends_at),
          jsonb_build_object('starts_at', v_after.starts_at, 'ends_at', v_after.ends_at), auth.uid());
  return to_jsonb(v_after);
end;
$fn$;
revoke all on function public.workspace_saturday_on_call_save_window(time, time, bigint) from public, anon;
grant execute on function public.workspace_saturday_on_call_save_window(time, time, bigint) to authenticated;

-- Name the on-call person (and an optional cover) for one Saturday. A NULL
-- person clears the Saturday. Appended; the previous answer stays in the table.
create or replace function public.workspace_saturday_on_call_set(
  p_saturday date, p_person_id uuid, p_cover_person_id uuid default null, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_note  text := case when coalesce(p_note, '') ~ '[^[:space:]]' then btrim(p_note, E' \t\r\n') end;
  v_row   public.workspace_saturday_on_call;
begin
  perform public._settings_require_editor('staff_duties');
  if p_saturday is null or extract(isodow from p_saturday) <> 6 then
    raise exception 'choose a Saturday' using errcode = '22023', detail = 'not_saturday';
  end if;
  if p_saturday < v_today or p_saturday > v_today + 400 then
    raise exception 'choose a coming Saturday' using errcode = '22023', detail = 'invalid_saturday';
  end if;
  if p_person_id is not null and not public._workspace_on_call_eligible(p_person_id) then
    raise exception 'the on-call person must be active Operation staff' using errcode = '22023', detail = 'invalid_person';
  end if;
  if p_cover_person_id is not null and p_person_id is null then
    raise exception 'choose the on-call person first' using errcode = '22023', detail = 'invalid_person';
  end if;
  if p_cover_person_id is not null and p_cover_person_id = p_person_id then
    raise exception 'the cover must be another person' using errcode = '22023', detail = 'cover_is_person';
  end if;
  if p_cover_person_id is not null and not public._workspace_on_call_eligible(p_cover_person_id) then
    raise exception 'the cover must be active Operation staff' using errcode = '22023', detail = 'invalid_cover';
  end if;
  if length(coalesce(v_note, '')) > 200 then
    raise exception 'the note is too long' using errcode = '22023', detail = 'text_too_long';
  end if;
  insert into public.workspace_saturday_on_call (saturday, person_id, cover_person_id, note, assigned_by)
  values (p_saturday, p_person_id, p_cover_person_id, v_note, auth.uid())
  returning * into v_row;
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.workspace_saturday_on_call_set(date, uuid, uuid, text) from public, anon;
grant execute on function public.workspace_saturday_on_call_set(date, uuid, uuid, text) to authenticated;

-- One read for the Staff & Duties section: the window, the next Saturdays
-- (this Saturday first), each one's newest answer, and whether the person or
-- cover has recorded leave that Saturday (flagged, never replaced). Editors
-- also receive the people they may choose.
create or replace function public.workspace_saturday_on_call_read(p_weeks integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today  date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_first  date;
  v_window public.workspace_saturday_on_call_window;
  v_can    boolean := coalesce(public.settings_can_edit('staff_duties'), false);
  v_days   jsonb;
  v_people jsonb := '[]'::jsonb;
begin
  if coalesce((select public.app_role())::text, '') not in ('operation', 'principal') then
    raise exception 'operation only' using errcode = '42501';
  end if;
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then
    raise exception 'invalid range' using errcode = '22023', detail = 'invalid_range';
  end if;
  v_first := v_today + ((6 - extract(isodow from v_today)::int + 7) % 7);
  select * into strict v_window from public.workspace_saturday_on_call_window where id = 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'saturday', d.saturday,
           'person_id', r.person_id,
           'person_name', p.name,
           'person_on_leave', case when r.person_id is null then false
             else public._staff_leave_covers(r.person_id, d.saturday)
                  or (d.saturday = v_today and exists (select 1 from public.ops_staff_settings s
                                                        where s.user_id = r.person_id and s.available = false)) end,
           'cover_person_id', r.cover_person_id,
           'cover_name', c.name,
           'cover_on_leave', case when r.cover_person_id is null then false
             else public._staff_leave_covers(r.cover_person_id, d.saturday)
                  or (d.saturday = v_today and exists (select 1 from public.ops_staff_settings s
                                                        where s.user_id = r.cover_person_id and s.available = false)) end,
           'note', r.note,
           'assigned_by_name', b.name,
           'recorded_at', r.created_at) order by d.saturday), '[]'::jsonb)
    into v_days
    from (select (v_first + 7 * g)::date as saturday from generate_series(0, p_weeks - 1) g) d
    left join lateral (select * from public.workspace_saturday_on_call w
                        where w.saturday = d.saturday
                        order by w.created_at desc, w.id desc limit 1) r on true
    left join public.app_users p on p.id = r.person_id
    left join public.app_users c on c.id = r.cover_person_id
    left join public.app_users b on b.id = r.assigned_by;

  if v_can then
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name, u.id), '[]'::jsonb)
      into v_people
      from public.app_users u
     where u.is_person and u.status = 'active' and u.role in ('operation', 'principal');
  end if;

  return jsonb_build_object(
    'window', jsonb_build_object('starts_at', to_char(v_window.starts_at, 'HH24:MI'),
                                 'ends_at', to_char(v_window.ends_at, 'HH24:MI'),
                                 'revision', v_window.revision),
    'can_edit', v_can,
    'saturdays', v_days,
    'people', v_people);
end;
$fn$;
revoke all on function public.workspace_saturday_on_call_read(integer) from public, anon;
grant execute on function public.workspace_saturday_on_call_read(integer) to authenticated;

-- ── sanity: schema and privileges only, never a row count ──────────────────
do $$
begin
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public'
                and table_name in ('workspace_saturday_on_call', 'workspace_saturday_on_call_window',
                                   'workspace_saturday_on_call_window_changes', 'workspace_duty_assignments')
                and grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception '0671 sanity: rota tables must be written through the doors only';
  end if;
  if has_function_privilege('authenticated', 'public._workspace_plan_duty_rota(date)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_rota_pool(text, date, date)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_rota_next(text, date, date, text, uuid)', 'execute') then
    raise exception '0671 sanity: a private rota helper is executable by authenticated';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'workspace_duty_assignments'
                and column_name = 'origin' and is_nullable = 'YES') then
    raise exception '0671 sanity: an assignment must say where it came from';
  end if;
end $$;

commit;

-- VERIFY AFTER the governed apply (no row-count assertion):
--   select public.workspace_saturday_on_call_read(4);   -- as an Operation person
--   select origin, count(*) from public.workspace_duty_assignments group by 1;  -- all 'manual' until the 25th
