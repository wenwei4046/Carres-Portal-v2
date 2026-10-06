-- 0526 — An Issue is recorded whole or not at all (HF-2, owner ruling 2026-09-17).
--
-- The create route wrote five statements one at a time: issues → issue_links →
-- issue_evidence → issue_actions → the status update (whose error was never
-- read). Any failure after the first left an Issue with nothing attached, and
-- the operator's retry recorded a second one.
--
-- One door now does all of it inside the one transaction a function call is.
-- A client request id makes the door idempotent: the same request answers
-- with the Issue it already recorded instead of recording another.
--
-- SECURITY INVOKER on purpose: every row is still written under the caller's
-- own RLS policies (0352 / 0454). No policy changes here.

begin;
set search_path = public, pg_temp;

alter table public.issues add column request_id uuid;
alter table public.issues add constraint issues_request_id_key unique (request_id);
comment on column public.issues.request_id is
  '0526: the client request that recorded this Issue. The same request never records a second Issue.';

create or replace function public.issue_record_issue(
  p_request_id uuid,
  p_issue jsonb,
  p_links jsonb,
  p_evidence jsonb,
  p_action jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_issue public.issues;
begin
  if v_uid is null or coalesce(public.app_role()::text, '') not in ('operation','principal') then
    raise exception 'operation access required' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'a request id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_links) is distinct from 'array' or jsonb_array_length(p_links) = 0 then
    raise exception 'a linked record is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_evidence) is distinct from 'array' or jsonb_array_length(p_evidence) = 0 then
    raise exception 'proof is required' using errcode = '22023';
  end if;

  insert into public.issues
    (request_id, status, problem_object, observed_problem, source_module, business_impact,
     materiality, observed_on, affected_object, official_english, optional_detail,
     recorded_by, found_by_kind, found_by_name, review_requirement)
  values
    (p_request_id, 'open', p_issue->>'problem_object', p_issue->>'observed_problem',
     p_issue->>'source_module', p_issue->>'business_impact',
     coalesce(p_issue->>'materiality', 'routine'), (p_issue->>'observed_on')::date,
     p_issue->>'affected_object', p_issue->>'official_english', p_issue->>'optional_detail',
     v_uid, p_issue->>'found_by_kind', p_issue->>'found_by_name',
     case when coalesce(p_issue->>'materiality', 'routine') = 'routine' then 'standard' else 'full' end)
  on conflict (request_id) do nothing
  returning * into v_issue;

  if v_issue.id is null then
    -- The same request already recorded its Issue: answer with that one.
    select * into v_issue from public.issues where request_id = p_request_id;
    if v_issue.recorded_by is distinct from v_uid then
      raise exception 'request id already used' using errcode = '23505';
    end if;
    return jsonb_build_object('id', v_issue.id, 'issue_no', v_issue.issue_no,
      'official_english', v_issue.official_english, 'replayed', true);
  end if;

  insert into public.issue_links (issue_id, object_kind, object_id, object_label, created_by)
  select v_issue.id, l->>'kind', l->>'id', l->>'label', v_uid
    from jsonb_array_elements(p_links) l;

  insert into public.issue_evidence (issue_id, kind, label, added_by)
  select v_issue.id, e->>'kind', e->>'label', v_uid
    from jsonb_array_elements(p_evidence) e;

  insert into public.issue_actions
    (issue_id, sequence, trigger, owner_rule, action, recipient, required_result, due_on, opened_by)
  values
    (v_issue.id, 1, btrim(p_action->>'trigger'), p_action->>'ownerRule', btrim(p_action->>'action'),
     btrim(p_action->>'recipient'), btrim(p_action->>'requiredResult'),
     (p_action->>'dueOn')::date, v_uid);

  return jsonb_build_object('id', v_issue.id, 'issue_no', v_issue.issue_no,
    'official_english', v_issue.official_english, 'replayed', false);
end
$fn$;

revoke all on function public.issue_record_issue(uuid,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.issue_record_issue(uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;

comment on function public.issue_record_issue(uuid,jsonb,jsonb,jsonb,jsonb) is
  '0526: records an Issue, its links, proof and first action in one transaction. The same request id returns the first Issue.';

commit;
