-- 0678 — Issue Tracker Settings keep a change record, and today's leave
-- starts cover on a STORED Office working day.
--
-- §1 Issue Tracker Settings keep a change record (Carres Settings List
-- SET-01 "Old/new · actor/time" for every authorised Settings change; ISS-04
-- History "Who · when · old → new"; owner 9 Oct 2026).
--
-- Scope: the existing Settings → Issue Tracker → Related Party master only.
-- Every insert, edit or removal of a Related Party writes one row to the
-- Settings change record (0669 `settings_changes`, section 'issue_tracker'):
-- who (the signed-in person; null only for a system write), when, the old and
-- the new values. A reason is not compulsory (not confirmed). No other Issue
-- Tracker behaviour changes; Issue Tracker itself stays not authorised beyond
-- this Settings record. No RLS policy changes.

create or replace function public._issue_related_party_record_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'id' - 'created_at' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'id' - 'created_at' end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into public.settings_changes (section, what, old_value, new_value, actor_id)
  values ('issue_tracker',
          'related_party:' || coalesce(case when tg_op = 'DELETE' then old.name else new.name end, ''),
          v_old, v_new,
          (select u.id from public.app_users u where u.id = auth.uid()));
  return null;
end;
$fn$;
revoke all on function public._issue_related_party_record_change() from public, anon, authenticated;

drop trigger if exists issue_related_parties_record_change on public.issue_related_parties;
create trigger issue_related_parties_record_change
  after insert or update or delete on public.issue_related_parties
  for each row execute function public._issue_related_party_record_change();

-- §2 Today's leave starts cover on a stored Office working day (owner 9 Oct
-- 2026: database working-day calculations connect to their own calendar).
-- staff_leave_submit is 0670's body with one line changed: the immediate-cover
-- test reads _office_is_working_day (0677) instead of isodow 1–5.
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
declare
  v_uid    uuid := auth.uid();
  v_today  date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_policy public.workspace_leave_policies;
  v_reason text := case when coalesce(p_reason, '') ~ '[^[:space:]]' then btrim(p_reason, E' \t\r\n') end;
  v_note   text := case when coalesce(p_note, '') ~ '[^[:space:]]' then btrim(p_note, E' \t\r\n') end;
  v_proofs text[] := coalesce((select array_agg(distinct btrim(x)) from unnest(p_proof_paths) x
                                where coalesce(x, '') ~ '[^[:space:]]'), '{}'::text[]);
  v_row    public.staff_leave;
  v_moved  integer := 0;
begin
  if not public.staff_leave_may_submit() then
    raise exception 'only an active staff member records leave' using errcode = '42501', detail = 'not_staff';
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
  -- Every file is the submitter's own, already uploaded to the proof bucket.
  if cardinality(v_proofs) > 3 or exists (
       select 1 from unnest(v_proofs) f
        where split_part(f, '/', 1) <> v_uid::text
           or not exists (select 1 from storage.objects o
                           where o.bucket_id = 'staff-leave-proof' and o.name = f)) then
    raise exception 'upload the proof again' using errcode = '22023', detail = 'invalid_proof';
  end if;

  -- Serialise with the movement writer BEFORE writing (no lock-order cycle),
  -- and with this person's other submissions for the overlap check.
  perform pg_advisory_xact_lock(hashtextextended('workspace_recorded_unavailability', 0));
  -- A leave's own days end the day before cancelled_from; a wholly cancelled
  -- leave has none and never blocks a new one.
  if exists (select 1 from public.staff_leave l
              where l.user_id = v_uid
                and greatest(l.starts_on, p_starts_on)
                    <= least(coalesce(l.cancelled_from - 1, l.ends_on), p_ends_on)) then
    raise exception 'you already have leave on these dates' using errcode = '22023', detail = 'leave_overlap';
  end if;

  insert into public.staff_leave (user_id, leave_type, starts_on, ends_on, reason, note, proof_paths, approval_required)
  values (v_uid, p_type, p_starts_on, p_ends_on, v_reason, v_note, v_proofs, v_policy.approval_required)
  returning * into v_row;

  -- Today's leave starts cover now, on an Office working day — the STORED
  -- Office calendar (0669 work_days + recorded holidays, 0677
  -- _office_is_working_day), never a fixed Monday to Friday (0678). Future
  -- leave waits for its own day; a day off is answered by the resolver at read
  -- time. Only Operation people and the principal carry routine work, so only
  -- their leave can move an assignment.
  if v_today between p_starts_on and p_ends_on and public._office_is_working_day(v_today)
     and exists (select 1 from public.app_users u where u.id = v_uid and u.role in ('operation', 'principal')) then
    v_moved := public._workspace_apply_recorded_unavailability(v_today);
  end if;

  return to_jsonb(v_row) || jsonb_build_object('cover_moved', v_moved);
end;
$fn$;
revoke all on function public.staff_leave_submit(text, date, date, text, text, text[]) from public, anon;
grant execute on function public.staff_leave_submit(text, date, date, text, text, text[]) to authenticated;
