-- 0440 — Issue Tracker owns accountability; Workspace only projects its open action.
-- A mutable sentence and a duplicate ops_task cannot be the same obligation.

begin;
set search_path = public, pg_temp;

create table public.issue_actions (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id),
  sequence integer not null check (sequence > 0),
  trigger text not null check (length(btrim(trigger)) >= 3),
  owner_rule text not null check (owner_rule in ('issue_triage_duty','issue_review_approver')),
  action text not null check (length(btrim(action)) >= 4 and action !~ '^[^·]+\s·\s'),
  recipient text not null check (length(btrim(recipient)) > 0),
  required_result text not null check (length(btrim(required_result)) >= 3),
  due_on date not null,
  status text not null default 'open' check (status in ('open','completed','replaced')),
  result_code text check (result_code ~ '^[a-z][a-z0-9_]*$'),
  result text,
  opened_by uuid references public.app_users(id),
  opened_at timestamptz not null default now(),
  completed_by uuid references public.app_users(id),
  completed_at timestamptz,
  normal_owner_id uuid references public.app_users(id),
  cover_owner_id uuid references public.app_users(id),
  assignment_id uuid references public.workspace_duty_assignments(id),
  replaced_by uuid references public.issue_actions(id),
  unique (issue_id, sequence),
  constraint issue_action_result_complete check (
    (status = 'open' and result_code is null and result is null and completed_by is null and completed_at is null)
    or
    (status <> 'open' and result_code is not null and length(btrim(result)) >= 3 and completed_by is not null and completed_at is not null)
  )
);

create unique index issue_actions_one_open_per_issue
  on public.issue_actions(issue_id) where status = 'open';
create index issue_actions_work_idx on public.issue_actions(status, due_on, owner_rule);

alter table public.issue_actions enable row level security;
create policy issue_actions_internal_read on public.issue_actions for select
  using ((select public.app_role()) in ('operation','finance','principal'));
create policy issue_actions_ops_insert on public.issue_actions for insert
  with check ((select public.app_role()) in ('operation','principal') and opened_by = auth.uid());
revoke update, delete on public.issue_actions from authenticated, anon;
grant select, insert on public.issue_actions to authenticated;

-- Preserve every legacy Current Action as occurrence 1. The old owner name is
-- deliberately not promoted into ownership truth; the rule resolves today.
insert into public.issue_actions
  (issue_id, sequence, trigger, owner_rule, action, recipient, required_result,
   due_on, opened_by, opened_at)
select i.id, 1,
       coalesce(nullif(btrim(i.business_impact), ''), i.official_english),
       case when i.status in ('waiting_review','ready_to_close')
            then 'issue_review_approver' else 'issue_triage_duty' end,
       i.current_action_do, i.current_action_recipient, i.current_action_result,
       i.current_action_due_on, i.recorded_by, i.created_at
  from public.issues i
 where i.current_action_do is not null;

-- Retire only the generated duplicate connected by the explicit legacy link.
-- Cancellation preserves its history and prevents a second open obligation.
update public.ops_tasks t
   set status = 'cancelled', updated_at = now()
  from public.issues i
 where i.work_task_id = t.id
   and t.status in ('open','claimed');

create or replace function public.issue_record_action_result(
  p_issue_id uuid,
  p_action_id uuid,
  p_result_code text,
  p_result text,
  p_next_action jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_current public.issue_actions;
  v_duty jsonb;
  v_next public.issue_actions;
begin
  if v_uid is null or public.app_role() not in ('operation','principal') then
    raise exception 'operation access required' using errcode = '42501';
  end if;
  if p_result_code is null or p_result_code not in ('accepted','rejected','proof_added','correction_confirmed','repair_confirmed','replacement_confirmed','answer_recorded') or length(btrim(p_result)) < 3 then
    raise exception 'a governed result is required' using errcode = '22023';
  end if;

  select * into v_current from public.issue_actions
   where id = p_action_id and issue_id = p_issue_id and status = 'open'
   for update;
  if not found then raise exception 'current action not found' using errcode = 'P0002'; end if;

  v_duty := public.workspace_resolve_duty(v_current.owner_rule, null);
  if nullif(v_duty->>'actor_user_id','')::uuid is distinct from v_uid
     and not public.is_operations_superuser(v_uid) then
    raise exception 'current Duty or cover must record this result' using errcode = '42501';
  end if;

  update public.issue_actions
     set status = case when p_next_action is null then 'completed' else 'replaced' end,
         result_code = p_result_code, result = btrim(p_result), completed_by = v_uid,
         completed_at = now(),
         normal_owner_id = nullif(v_duty->>'normal_user_id','')::uuid,
         cover_owner_id = nullif(v_duty->>'acting_user_id','')::uuid,
         assignment_id = null
   where id = v_current.id;

  if p_next_action is not null then
    insert into public.issue_actions
      (issue_id, sequence, trigger, owner_rule, action, recipient, required_result, due_on, opened_by)
    values (
      p_issue_id, v_current.sequence + 1,
      btrim(p_next_action->>'trigger'), p_next_action->>'ownerRule',
      btrim(p_next_action->>'action'), btrim(p_next_action->>'recipient'),
      btrim(p_next_action->>'requiredResult'), (p_next_action->>'dueOn')::date, v_uid
    ) returning * into v_next;
    update public.issue_actions set replaced_by = v_next.id where id = v_current.id;
  end if;

  insert into public.issue_timeline(issue_id, event_kind, summary, actor_id, payload)
  values (p_issue_id, 'action_result_recorded', btrim(p_result), v_uid,
    jsonb_build_object('action_id', v_current.id, 'result_code', p_result_code,
      'owner_rule', v_current.owner_rule,
      'normal_owner_id', v_duty->>'normal_user_id',
      'cover_owner_id', v_duty->>'acting_user_id',
      'next_action_id', v_next.id));

  update public.issues
     set status = case when p_next_action is null then 'waiting_review' else 'open' end,
         updated_at = now()
   where id = p_issue_id;
  return jsonb_build_object('action_id', v_current.id, 'next_action_id', v_next.id);
end
$fn$;

revoke all on function public.issue_record_action_result(uuid,uuid,text,text,jsonb) from public, anon;
grant execute on function public.issue_record_action_result(uuid,uuid,text,text,jsonb) to authenticated;

comment on table public.issue_actions is
  '0440: versioned authoritative Issue actions. One open occurrence per Issue; Workspace projects it and never duplicates it as ops_tasks.';

commit;
