-- 0680 — Leave can be recorded for a colleague, and keeps who recorded it.
--
-- Owner ruling 9 Oct 2026 (Jess): when a staff member cannot log in, the owner
-- or a person she names as a Staff & Duties editor (`settings_can_edit
-- ('staff_duties')`, 0668) may record that person's leave. The record keeps
-- WHO the leave is for and WHO recorded it. Owner flow (9 Oct): Workspace →
-- Leave → Record leave — the person defaults to me, an authorised recorder may
-- choose a colleague; MC / Emergency leave / Planned leave; dates; Submit takes
-- effect at once with no approval; MC proof optional; today's leave starts the
-- existing cover, future leave on its day.
--
--   §1 staff_leave.recorded_by — the person who recorded it (self or recorder).
--   §2 _staff_leave_record(...) — the ONE body (0679 staff_leave_submit's,
--      unchanged rules) for the person p_user, recorded by p_recorder.
--   §3 staff_leave_submit(...) — my own leave (same signature as 0670/0679).
--   §4 staff_leave_record_for(...) — a colleague's leave, by the owner or a
--      named Staff & Duties editor who is a person. No proof file on this
--      door: proof is optional and a file in the recorder's folder could not be
--      read by the colleague (0670 bucket policy: own folder, principal, HR).
--   §5 staff_leave_cancel(...) — the person, or whoever recorded it for them,
--      may cancel future days (rules unchanged otherwise).
--   §6 staff_leave_recorders() — the active people a recorder may choose,
--      names only, for the Record leave form.
-- No RLS policy changes: staff_leave stays readable by its owner, the
-- principal and HR (0670); every write is through these definer doors.

-- §1 ─────────────────────────────────────────────────────────────────────────
alter table public.staff_leave
  add column if not exists recorded_by uuid references public.app_users(id);
comment on column public.staff_leave.recorded_by is
  '0680: who recorded this leave — the person themselves, or the owner / a Staff & Duties editor recording it for them (owner ruling 9 Oct 2026).';

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
  if not public.staff_leave_may_submit()
     or not coalesce(public.workspace_is_person(auth.uid()), false)
     or not coalesce(public.settings_can_edit('staff_duties'), false) then
    raise exception 'only the owner or a named Staff & Duties editor records leave for a colleague'
      using errcode = '42501', detail = 'not_leave_recorder';
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
  if not public.staff_leave_may_submit()
     or not coalesce(public.workspace_is_person(auth.uid()), false)
     or not coalesce(public.settings_can_edit('staff_duties'), false) then
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
