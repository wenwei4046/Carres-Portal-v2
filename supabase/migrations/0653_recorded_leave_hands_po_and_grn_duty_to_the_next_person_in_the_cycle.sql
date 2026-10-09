-- =============================================================================
-- 0653_recorded_leave_hands_po_and_grn_duty_to_the_next_person_in_the_cycle.sql
-- =============================================================================
-- OWNER RULING (ERP-ARCHITECTURE "Owner-approved automatic PO/GRN cover",
-- 2026-09-29; Workspace MASTER §4.4; build instructed 2026-10-06):
-- automatic PO/GRN cover reads recorded leave and selects the next available
-- eligible person in that Duty's cycle, without changing normal ownership or the
-- monthly order. No eligible cover stays visible; nobody is invented. Recorded
-- leave "does not wait for a check" (§4.4).
--
-- WHAT WAS WRONG (measured on 0620/0625)
--   The recorded leave fact today is ops_staff_settings.available = false (the
--   Operation pool's away switch, 0232). Only the minute cron
--   (`* 1-10 * * 1-5`, 09:00-18:59 MYT weekdays) turns it into an assignment, by
--   writing a workspace_assignment_movements row through
--   workspace_process_recorded_unavailability(). Until that row exists - the
--   minute after leave is recorded, before 09:00, after 19:00, at weekends -
--   workspace_resolve_duty kept answering the person on leave, and
--   _workspace_assignment_visibility stamped `no_candidate` on it even when an
--   eligible colleague was free: Work told staff "No one else could be
--   assigned" while somebody could.
--
-- WHAT THIS CHANGES
--   a. _workspace_recorded_leave_cover(duty, day, result) - for PO Duty and GRN
--      Duty on TODAY (company date) only: when the resolved person is still an
--      active internal person but has recorded leave, take the first candidate
--      of _workspace_activity_scope - the SAME candidate arithmetic the
--      movement writer uses (stable staff-code cycle after the absent person,
--      active Operation people only, nobody on leave, newcomer PO exclusion in
--      the joining month). One arithmetic; the read answer and the movement the
--      cron later records name the same person.
--      The normal owner (normal_user_id) is never changed; the cover is
--      acting_user_id/actor_user_id with is_cover, source `system_assignment`,
--      assignment_reason `recorded_unavailability` and no movement id until the
--      ledger records it. No candidate -> unchanged result, so the existing
--      visibility rule keeps the holder and reports `no_candidate` (a visible
--      exception, never an invented person, never a PIC/manager/principal
--      fallback). No eligible primary or cover -> `not_assigned`, unchanged.
--      Other dates are untouched: the away switch carries no dates, so a
--      future day is never guessed.
--   b. workspace_resolve_duty - 0625's body, byte-for-byte, except that its two
--      ordinary-Duty answers pass through (a) before visibility.
--
--   History is unchanged: the movement ledger (0620) remains the one recorded
--   assignment change, and source writers keep recording the actual actor.
--   Permissions are unchanged: GRN amendment still reads _workspace_base_duty
--   (0619); PO issue stays open to every active Operation person (0627), whose
--   po_history continues to record normal owner, cover and actual issuer apart.
--
-- RLS: none. TABLES: none. DATA: none. GRANTS: the new helper is private.
-- =============================================================================

begin;

set search_path = public, pg_temp;

-- ── a · recorded leave hands today's PO/GRN Duty to the next person ─────────

create or replace function public._workspace_recorded_leave_cover(
  p_duty_key text,
  p_day date,
  p_result jsonb
)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from uuid := nullif(p_result->>'actor_user_id', '')::uuid;
  v_scope jsonb;
  v_to uuid;
begin
  if p_duty_key not in ('po_duty', 'grn_duty')
     or p_day is distinct from timezone('Asia/Kuala_Lumpur', now())::date
     or v_from is null then
    return p_result;
  end if;
  -- Leave, not departure: a departed or ineligible person is the visibility
  -- rule's `not_assigned`, never a leave cover.
  if not public.workspace_is_internal_staff(v_from)
     or not exists (select 1 from public.ops_staff_settings s
                     where s.user_id = v_from and s.available = false) then
    return p_result;
  end if;
  v_scope := public._workspace_activity_scope('duty', p_duty_key, p_day);
  -- The movement writer's own view must agree on who is absent; otherwise the
  -- answer is left for the visible exception instead of guessed.
  if nullif(v_scope->>'assignedUserId', '')::uuid is distinct from v_from
     or coalesce((v_scope->>'assignedPersonEligible')::boolean, true) then
    return p_result;
  end if;
  select c.candidate::uuid into v_to
    from jsonb_array_elements_text(v_scope->'candidateUserIds') with ordinality c(candidate, priority)
   where c.candidate::uuid <> v_from
   order by c.priority
   limit 1;
  if v_to is null then
    return p_result;
  end if;
  return p_result || jsonb_build_object(
    'acting_user_id', v_to,
    'actor_user_id', v_to,
    'acting_user_name', (select name from public.app_users where id = v_to),
    'is_cover', v_to is distinct from nullif(p_result->>'normal_user_id', '')::uuid,
    'source', 'system_assignment',
    'assignment_reason', 'recorded_unavailability',
    'assignment_outcome', 'reassigned',
    'assignment_receipt_id', null,
    'assignment_movement_id', null);
end;
$fn$;

revoke all on function public._workspace_recorded_leave_cover(text, date, jsonb)
  from public, anon, authenticated, service_role;

comment on function public._workspace_recorded_leave_cover(text, date, jsonb) is
  '0653: today''s PO/GRN Duty answer when the resolved person has recorded leave - '
  'the next candidate of _workspace_activity_scope (the movement writer''s arithmetic). '
  'Normal owner unchanged; no candidate leaves the result for the visible exception.';

-- ── b · the Shared Duty Resolver ────────────────────────────────────────────

-- Body from 0625; both ordinary-Duty answers pass through (a).
create or replace function public.workspace_resolve_duty(p_duty_key text,p_on date default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_day date:=coalesce(p_on,timezone('Asia/Kuala_Lumpur',now())::date); v_result jsonb;
 v_receipt public.workspace_assignment_movements; v_check public.workspace_assignment_checkpoints; v_person uuid;
begin
  v_result:=public._workspace_base_duty(p_duty_key,v_day);
  if p_duty_key not in ('po_duty','grn_duty','delivery_duty') then return public._workspace_assignment_visibility(v_result); end if;
  select * into v_check from public.workspace_assignment_checkpoints where scope_type='duty' and scope_key=p_duty_key
    and office_day=v_day order by id desc limit 1;
  if found and not public._workspace_assignment_source_changed('duty',p_duty_key,v_day,v_check.recorded_at) then
    v_result:=v_result||jsonb_build_object('assignment_outcome',v_check.outcome);
  end if;
  select * into v_receipt from public.workspace_assignment_movements where scope_type='duty' and scope_key=p_duty_key
    and office_day=v_day order by id desc limit 1;
  if not found or public._workspace_assignment_source_changed('duty',p_duty_key,v_day,v_receipt.recorded_at) then
    return public._workspace_assignment_visibility(public._workspace_recorded_leave_cover(p_duty_key,v_day,v_result));
  end if;
  v_person:=v_receipt.to_user_id;
  if v_person is not null and not public.workspace_is_internal_staff(v_person) then v_person:=null; end if;
  v_result := v_result || jsonb_build_object('acting_user_id',v_person,'actor_user_id',v_person,
    'acting_user_name',(select name from public.app_users where id=v_person),
    'is_cover',v_person is distinct from nullif(v_result->>'normal_user_id','')::uuid,
    'source','system_assignment','assignment_receipt_id',v_receipt.checkpoint_id,'assignment_movement_id',v_receipt.id,'assignment_outcome',case when v_check.id is not null and v_check.recorded_at > v_receipt.recorded_at
      then coalesce(v_result->>'assignment_outcome',v_receipt.outcome) else v_receipt.outcome end);
  return public._workspace_assignment_visibility(public._workspace_recorded_leave_cover(p_duty_key,v_day,v_result));
end;
$$;

-- ── sanity: schema and privileges only, never a row count ───────────────────
do $$
begin
  if has_function_privilege('authenticated', 'public._workspace_recorded_leave_cover(text, date, jsonb)', 'execute') then
    raise exception '0653: the leave-cover helper is executable by authenticated';
  end if;
  if public._workspace_recorded_leave_cover('finance_approver', current_date, '{"actor_user_id":null}'::jsonb)
     is distinct from '{"actor_user_id":null}'::jsonb then
    raise exception '0653: a non-PO/GRN Duty was changed by the leave-cover helper';
  end if;
end;
$$;

commit;

-- VERIFY AFTER governed apply (no row-count assertion):
-- select public.workspace_resolve_duty('po_duty'), public.workspace_resolve_duty('grn_duty');
--   with nobody's away switch on: identical to 0625's answer for the same moment.
-- select pg_get_functiondef('public.workspace_resolve_duty(text,date)'::regprocedure) ~ '_workspace_recorded_leave_cover';
