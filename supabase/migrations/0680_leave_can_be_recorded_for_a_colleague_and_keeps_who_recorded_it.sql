-- 0680 — Leave can be recorded for a colleague, and keeps who recorded it.
--
-- Owner ruling 9 Oct 2026 (Jess, corrected the same day): EVERY signed-in
-- active staff member may record leave for a colleague — not only the owner or
-- Settings editors. Recording leave is NOT a Settings permission: nothing here
-- reads settings_can_edit. The record keeps WHO the leave is for, WHO recorded
-- it, WHEN, and its change history. Owner flow (9 Oct): Workspace → Leave →
-- Record leave — the person defaults to me, I may choose a colleague; MC /
-- Emergency leave / Planned leave; whole days; Submit takes effect at once with
-- no approval; MC proof optional; today's leave starts the existing cover,
-- future leave on its day. Half-day leave is not decided and not built.
--
--   §1 staff_leave.recorded_by — the person who recorded it (self or recorder).
--   §2 _staff_leave_record(...) — the ONE body (0679 staff_leave_submit's,
--      unchanged rules) for the person p_user, recorded by p_recorder.
--   §3 staff_leave_submit(...) — my own leave (same signature as 0670/0679).
--   §4 staff_leave_record_for(...) — a colleague's leave, by any active staff
--      person (the same test as recording my own: staff_leave_may_submit).
--      No proof file on this door: proof is optional and a file in the
--      recorder's folder could not be read by the colleague (0670 bucket
--      policy: own folder, principal, HR).
--   §5 staff_leave_cancel(...) — the person, or whoever recorded it for them,
--      may cancel future days (rules unchanged otherwise).
--   §6 staff_leave_recorder_view() — the active colleagues I may choose
--      (names only) and the leave I recorded for others.
--   §7 staff_leave_changes — the append-only change history of every leave:
--      recorded / cancelled, who, when, old → new. Written only by the doors.
-- RLS: staff_leave is unchanged (its owner, the principal and HR read it). The
-- NEW staff_leave_changes table is readable by the person on leave, the person
-- who acted, the principal and HR; there is no write grant (definer doors only).

-- §1 ─────────────────────────────────────────────────────────────────────────
alter table public.staff_leave
  add column if not exists recorded_by uuid references public.app_users(id);
comment on column public.staff_leave.recorded_by is
  '0680: who recorded this leave — the person themselves, or the owner / a Staff & Duties editor recording it for them (owner ruling 9 Oct 2026).';

-- §7 (created first; the doors below write it) ─────────────────────────────
create table if not exists public.staff_leave_changes (
  id         bigint generated always as identity primary key,
  leave_id   uuid not null references public.staff_leave(id),
  user_id    uuid not null references public.app_users(id),   -- whose leave
  event      text not null check (event in ('recorded', 'cancelled')),
  actor_id   uuid not null references public.app_users(id),   -- who did it
  at         timestamptz not null default clock_timestamp(),
  old_value  jsonb,
  new_value  jsonb
);
create index if not exists staff_leave_changes_leave on public.staff_leave_changes (leave_id, at);
alter table public.staff_leave_changes enable row level security;
revoke all on public.staff_leave_changes from public, anon, authenticated;
grant select on public.staff_leave_changes to authenticated;
grant all on public.staff_leave_changes to service_role;
drop policy if exists staff_leave_changes_read on public.staff_leave_changes;
create policy staff_leave_changes_read on public.staff_leave_changes
  for select to authenticated
  using (user_id = (select auth.uid()) or actor_id = (select auth.uid())
         or coalesce((select public.app_role())::text in ('principal', 'hr'), false));
comment on table public.staff_leave_changes is
  '0680: append-only change history of every leave (recorded / cancelled; whose, who acted, when, old → new). Written only by the leave doors; owner ruling 9 Oct 2026.';

-- §2 ─────────────────────────────────────────────────────────────────────────
create or replace function public._staff_leave_record(
  p_user uuid,
  p_recorder uuid,
  p_type text,
  p_starts_on date,
  p_ends_on date,
  p_reason text,
  p_note text,
  p_proof_paths text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today  date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_policy public.workspace_leave_policies;
  v_reason text := case when coalesce(p_reason, '') ~ '[^[:space:]]' then btrim(p_reason, E' \t\r\n') end;
  v_note   text := case when coalesce(p_note, '') ~ '[^[:space:]]' then btrim(p_note, E' \t\r\n') end;
  v_proofs text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_proof_paths) x
                                where coalesce(x, '') ~ '[^[:space:]]'), '{}'::text[]);
  v_row    public.staff_leave;
  v_moved  integer := 0;
begin
  -- The person whose leave it is: an active internal staff person.
  if p_user is null or not exists (
       select 1 from public.app_users u
        where u.id = p_user and u.status = 'active' and u.is_person
          and u.role in ('principal', 'operation', 'finance', 'bd', 'hr')) then
    raise exception 'only an active staff member has leave' using errcode = '42501', detail = 'not_staff';
  end if;
  select * into v_policy from public.workspace_leave_policies where leave_type = p_type;
  if not found then
    raise exception 'choose a leave type' using errcode = '22023', detail = 'invalid_type';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on
     or p_starts_on < v_today - 31 or p_ends_on > v_today + 366 then
    raise exception 'choose valid leave dates' using errcode = '22023', detail = 'invalid_dates';
  end if;
  if v_policy.reason_required and v_reason is null then
    raise exception 'write the reason' using errcode = '22023', detail = 'reason_required';
  end if;
  if length(coalesce(v_reason, '')) > 200 or length(coalesce(v_note, '')) > 500 then
    raise exception 'the text is too long' using errcode = '22023', detail = 'text_too_long';
  end if;
  if v_policy.proof_required and cardinality(v_proofs) = 0 then
    raise exception 'upload the proof' using errcode = '22023', detail = 'proof_required';
  end if;
  -- Every file is the recorder's own, already uploaded to the proof bucket.
  if cardinality(v_proofs) > 3 or exists (
       select 1 from unnest(v_proofs) f
        where split_part(f, '/', 1) <> p_recorder::text
           or not exists (select 1 from storage.objects o
                           where o.bucket_id = 'staff-leave-proof' and o.name = f)) then
    raise exception 'upload the proof again' using errcode = '22023', detail = 'invalid_proof';
  end if;

  -- Serialise with the movement writer BEFORE writing (no lock-order cycle),
  -- and with this person's other submissions for the overlap check.
  perform pg_advisory_xact_lock(hashtextextended('workspace_recorded_unavailability', 0));
  if exists (select 1 from public.staff_leave l
              where l.user_id = p_user
                and greatest(l.starts_on, p_starts_on)
                    <= least(coalesce(l.cancelled_from - 1, l.ends_on), p_ends_on)) then
    raise exception 'this person already has leave on these dates' using errcode = '22023', detail = 'leave_overlap';
  end if;

  insert into public.staff_leave (user_id, leave_type, starts_on, ends_on, reason, note, proof_paths,
                                  approval_required, recorded_by)
  values (p_user, p_type, p_starts_on, p_ends_on, v_reason, v_note, v_proofs,
          v_policy.approval_required, p_recorder)
  returning * into v_row;

  insert into public.staff_leave_changes (leave_id, user_id, event, actor_id, old_value, new_value)
  values (v_row.id, p_user, 'recorded', p_recorder, null,
          jsonb_build_object('leave_type', v_row.leave_type, 'starts_on', v_row.starts_on,
                             'ends_on', v_row.ends_on, 'reason', v_row.reason, 'note', v_row.note,
                             'proof_files', cardinality(v_row.proof_paths), 'recorded_by', p_recorder));

  -- Today's leave starts cover now, on a stored Office working day (0678
  -- _office_is_working_day); future leave waits for its own day. Only
  -- Operation people and the principal carry routine work.
  if v_today between p_starts_on and p_ends_on and public._office_is_working_day(v_today)
     and exists (select 1 from public.app_users u where u.id = p_user and u.role in ('operation', 'principal')) then
    v_moved := public._workspace_apply_recorded_unavailability(v_today);
  end if;

  return to_jsonb(v_row) || jsonb_build_object('cover_moved', v_moved);
end;
$fn$;
revoke all on function public._staff_leave_record(uuid, uuid, text, date, date, text, text, text[]) from public, anon, authenticated;

-- §3 ─────────────────────────────────────────────────────────────────────────
create or replace function public.staff_leave_submit(
  p_type text,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null,
  p_note text default null,
  p_proof_paths text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.staff_leave_may_submit() then
    raise exception 'only an active staff member records leave' using errcode = '42501', detail = 'not_staff';
  end if;
  return public._staff_leave_record(auth.uid(), auth.uid(), p_type, p_starts_on, p_ends_on,
                                    p_reason, p_note, p_proof_paths);
end;
$fn$;
revoke all on function public.staff_leave_submit(text, date, date, text, text, text[]) from public, anon;
grant execute on function public.staff_leave_submit(text, date, date, text, text, text[]) to authenticated;

-- §4 ─────────────────────────────────────────────────────────────────────────
create or replace function public.staff_leave_record_for(
  p_user uuid,
  p_type text,
  p_starts_on date,
  p_ends_on date,
  p_reason text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- Any active staff person may record a colleague's leave (owner ruling
  -- 9 Oct 2026); this is not a Settings permission.
  if not public.staff_leave_may_submit() then
    raise exception 'only an active staff member records leave' using errcode = '42501', detail = 'not_staff';
  end if;
  return public._staff_leave_record(p_user, auth.uid(), p_type, p_starts_on, p_ends_on,
                                    p_reason, p_note, '{}'::text[]);
end;
$fn$;
revoke all on function public.staff_leave_record_for(uuid, text, date, date, text, text) from public, anon;
grant execute on function public.staff_leave_record_for(uuid, text, date, date, text, text) to authenticated;

-- §5 ─────────────────────────────────────────────────────────────────────────
create or replace function public.staff_leave_cancel(p_leave_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_today date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_row   public.staff_leave;
begin
  select * into v_row from public.staff_leave where id = p_leave_id for update;
  -- The person themselves, or whoever recorded it for them.
  if not found or (v_row.user_id is distinct from v_uid and v_row.recorded_by is distinct from v_uid) then
    raise exception 'leave not found' using errcode = '42501', detail = 'not_your_leave';
  end if;
  if v_row.cancelled_from is not null then
    raise exception 'this leave is already cancelled' using errcode = '22023', detail = 'already_cancelled';
  end if;
  if v_row.ends_on <= v_today then
    raise exception 'no future days remain' using errcode = '22023', detail = 'leave_finished';
  end if;
  update public.staff_leave
     set cancelled_from = greatest(v_row.starts_on, v_today + 1),
         cancelled_by   = v_uid,
         cancelled_at   = clock_timestamp()
   where id = p_leave_id
  returning * into v_row;
  insert into public.staff_leave_changes (leave_id, user_id, event, actor_id, old_value, new_value)
  values (v_row.id, v_row.user_id, 'cancelled', v_uid,
          jsonb_build_object('cancelled_from', null),
          jsonb_build_object('cancelled_from', v_row.cancelled_from));
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.staff_leave_cancel(uuid) from public, anon;
grant execute on function public.staff_leave_cancel(uuid) to authenticated;

-- §6 ─────────────────────────────────────────────────────────────────────────
-- The colleagues a recorder may choose (names only), and the leave this
-- recorder recorded for others (so they can see and correct it).
create or replace function public.staff_leave_recorder_view()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.staff_leave_may_submit() then
    return jsonb_build_object('canRecordForOthers', false, 'people', '[]'::jsonb, 'recorded', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'canRecordForOthers', true,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name)
        from public.app_users u
       where u.status = 'active' and u.is_person and u.id <> auth.uid()
         and u.role in ('principal', 'operation', 'finance', 'bd', 'hr')
         and coalesce(btrim(u.name), '') <> ''), '[]'::jsonb),
    'recorded', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'userId', l.user_id, 'name', u.name, 'leave_type', l.leave_type,
               'starts_on', l.starts_on, 'ends_on', l.ends_on, 'cancelled_from', l.cancelled_from,
               'submitted_at', l.submitted_at) order by l.starts_on desc)
        from public.staff_leave l join public.app_users u on u.id = l.user_id
       where l.recorded_by = auth.uid() and l.user_id <> auth.uid()
         and l.ends_on >= timezone('Asia/Kuala_Lumpur', clock_timestamp())::date - 31), '[]'::jsonb));
end;
$fn$;
revoke all on function public.staff_leave_recorder_view() from public, anon;
grant execute on function public.staff_leave_recorder_view() to authenticated;
