-- =============================================================================
-- 0670 — staff record their own leave, and cover starts on the day
-- =============================================================================
-- OWNER RULES (Jess, confirmed 9 Oct 2026; `Carres Settings List.md` WS-08,
-- WS-11, "Leave types", "Leave approval policy"; docs/workspace/MASTER.md §4.4
-- "One leave entry — Workspace → Leave"; docs/hr/MASTER.md §7 "Leave fact for
-- work assignment"):
--   · ONE entry, Workspace → Leave. Three types: MC, Emergency leave, Planned
--     leave. A person submits their OWN leave: type, start date, end date.
--     MC needs proof (up to three photos or PDFs). Emergency leave needs a
--     short reason.
--     Planned leave may carry a note. No standalone MC Report page.
--   · No type needs approval today. The policy is stored per type with
--     approval_required = false; a CHECK keeps it false until the treatment of
--     an approval change (effective date, existing submissions) is defined and
--     built. No approval flow exists in this file.
--   · Leave covering TODAY starts qualified available cover at once, at any
--     hour. Future leave starts cover on its absence date, never on the day it
--     was submitted. The receiving colleague is eligible and not on leave.
--   · Cover is work routing only: it decides no payroll, no MC review, no HR
--     finding. A cancelled day is kept, stamped, never deleted.
--
-- WHAT THIS CHANGES — the EXISTING engine is fed, no second resolver:
--   1 workspace_leave_policies    one row per type (no approval, proof/reason
--                                 needs) — read-only to every staff reader.
--   2 staff_leave                 the dated absence fact; one row per
--                                 submission; cancel stamps cancelled_from/by/at.
--   3 bucket `staff-leave-proof`  private MC proof files.
--   4 _staff_leave_covers / _workspace_on_leave
--                                 THE one leave question. On leave on a day =
--                                 a non-cancelled leave row covering that day
--                                 OR the existing undated away switch
--                                 (ops_staff_settings.available = false, 0232),
--                                 kept exactly as the engine read it before.
--   5 _workspace_po_eligible      the newcomer PO rule lifted out of
--                                 _workspace_activity_scope unchanged, so the
--                                 monthly rota (0671) uses the same arithmetic.
--   6 _workspace_activity_scope (0620) · _workspace_assignment_visibility (0620)
--     · workspace_team_today (0667) read _workspace_on_leave instead of the
--     away switch alone.
--   7 _workspace_recorded_leave_cover + workspace_resolve_duty (0625 body):
--     the approach of the open sibling PR #1966 (its unapplied 0653), reading
--     the new leave fact: when today's PO, GRN or Delivery Duty person is on
--     leave, the resolver answers the next eligible person in the SAME cycle
--     the movement writer uses, at READ time — before 09:00, after 19:00 and
--     at weekends too. Normal ownership is never changed. Orders stay on the
--     durable movement ledger only: their candidate order is by workload, so a
--     read-time answer could differ from the movement written a minute later.
--   8 _workspace_apply_recorded_unavailability(day) — the 0620 movement loop,
--     now private and shared: the minute cron calls it through
--     workspace_process_recorded_unavailability() (unchanged signature), and a
--     submission covering today calls it at once on an Office weekday, so the
--     durable movement (and History's `Assigned to {name} by system`) exists
--     immediately. One global advisory lock serialises both callers.
--   9 workspace_commit_activity_checkpoint (0621 body) and the movement loop
--     lock staff_leave too, so a leave submitted between a check's read and its
--     commit cannot be missed.
--  10 Activity check times (WS-02/WS-03): the owner default 10:00 AM could not
--     be stored (0613 CHECK `morning > 10:00`). The table CHECK and the door
--     now accept 10:00; every other bound is unchanged. The stored live values
--     are NOT touched.
--
-- NOT CHANGED, ON PURPOSE: _workspace_assignment_source_changed (0616). A leave
-- row is an ELIGIBILITY fact, already read by the scope's eligibility and
-- candidates. Treating it as a source change would make the scope fall back to
-- the base person and could hand work back to someone who missed a check
-- ("return does not silently bounce work back", Workspace §4.4).
--
-- RLS / POLICIES ADDED (Constitution §5 red line 2 — what and why):
--   workspace_leave_policies  SELECT for internal staff and HR (they read
--                             "No approval needed"); no write grant at all.
--   staff_leave               SELECT only your own rows; the principal and HR
--                             read every row (People owns absence facts). No
--                             INSERT/UPDATE/DELETE grant: the two definer doors
--                             below are the only writers. Colleagues see WHO
--                             is away and WHEN through workspace_leave_upcoming,
--                             never the type, reason, note or proof.
--   storage.objects, bucket `staff-leave-proof` (private, 10 MB, PDF/JPEG/PNG/
--                             WEBP): INSERT only into your own folder
--                             `<your user id>/…` and only while you may submit
--                             leave; SELECT your own files, or any file for the
--                             principal and HR. No UPDATE/DELETE policy: proof
--                             is never replaced or removed.
--
-- DATA: none moved, none deleted. Three policy rows are seeded. No row count is
-- asserted.
-- =============================================================================

begin;

set search_path = public, pg_temp;

-- ── 1 · the leave policy, one row per type ─────────────────────────────────
create table if not exists public.workspace_leave_policies (
  leave_type        text primary key check (leave_type in ('mc', 'emergency', 'planned')),
  approval_required boolean not null default false,
  proof_required    boolean not null default false,
  reason_required   boolean not null default false,
  revision          bigint not null default 1,
  changed_at        timestamptz not null default now(),
  changed_by        uuid references public.app_users(id),
  -- Owner 9 Oct 2026: no type needs approval. A future change must first
  -- define its effective date and what happens to existing submissions; until
  -- that is built, the database refuses to store `approval required`.
  constraint workspace_leave_policies_no_approval_until_defined check (not approval_required)
);

comment on table public.workspace_leave_policies is
  '0670: Staff & Duties leave policy per type (owner 9 Oct 2026). approval_required is stored and false for every type; the CHECK keeps it false until an approval change has a defined effective treatment.';

insert into public.workspace_leave_policies (leave_type, proof_required, reason_required)
values ('mc', true, false), ('emergency', false, true), ('planned', false, false)
on conflict (leave_type) do nothing;

alter table public.workspace_leave_policies enable row level security;
revoke all on public.workspace_leave_policies from public, anon, authenticated;
grant select on public.workspace_leave_policies to authenticated;
grant all on public.workspace_leave_policies to service_role;
drop policy if exists workspace_leave_policies_read on public.workspace_leave_policies;
create policy workspace_leave_policies_read on public.workspace_leave_policies
  for select to authenticated
  using ((select public.is_internal()) or coalesce((select public.app_role())::text = 'hr', false));

-- ── 2 · the dated absence fact ─────────────────────────────────────────────
create table if not exists public.staff_leave (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.app_users(id),
  leave_type        text not null references public.workspace_leave_policies(leave_type),
  starts_on         date not null,
  ends_on           date not null,
  reason            text check (reason is null or length(reason) between 1 and 200),
  note              text check (note is null or length(note) between 1 and 500),
  -- MC proof: up to three photos or PDFs in the submitter's own folder
  -- (`<user id>/<file id>.<ext>`), checked by the door against storage.
  proof_paths       text[] not null default '{}'::text[] check (cardinality(proof_paths) <= 3),
  -- The policy in force when this was submitted. Today always false; kept so a
  -- later policy change can name its treatment of existing submissions.
  approval_required boolean not null default false,
  submitted_at      timestamptz not null default clock_timestamp(),
  cancelled_from    date,
  cancelled_by      uuid references public.app_users(id),
  cancelled_at      timestamptz,
  constraint staff_leave_dates check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint staff_leave_cancel_stamped check (
    (cancelled_from is null) = (cancelled_by is null)
    and (cancelled_from is null) = (cancelled_at is null)),
  constraint staff_leave_cancel_window check (
    cancelled_from is null or cancelled_from between starts_on and ends_on)
);

comment on table public.staff_leave is
  '0670: People-owned dated absence (MC, Emergency leave, Planned leave), submitted by the person through Workspace → Leave. Cancelling stamps cancelled_from/by/at; days from cancelled_from are no longer leave. Rows are never deleted. Cover reads it through _workspace_on_leave only.';
comment on column public.staff_leave.cancelled_from is
  'First day that is no longer leave. starts_on = the whole leave was cancelled before it began; a later day = the remaining days were withdrawn.';

create index if not exists staff_leave_person_days on public.staff_leave (user_id, starts_on, ends_on);
create index if not exists staff_leave_days on public.staff_leave (starts_on, ends_on);

alter table public.staff_leave enable row level security;
revoke all on public.staff_leave from public, anon, authenticated;
grant select on public.staff_leave to authenticated;
grant all on public.staff_leave to service_role;
drop policy if exists staff_leave_read on public.staff_leave;
create policy staff_leave_read on public.staff_leave
  for select to authenticated
  using (user_id = (select auth.uid())
         or coalesce((select public.app_role())::text in ('principal', 'hr'), false));

-- ── 3 · who may submit leave, and the private proof bucket ─────────────────
-- An active PERSON on the internal team (0533's person marker). A shared login
-- or an outside account (dealer, supplier, partner, warehouse) records no leave.
create or replace function public.staff_leave_may_submit()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.app_users u
     where u.id = auth.uid()
       and u.status = 'active'
       and u.is_person
       and u.role in ('principal', 'operation', 'finance', 'bd', 'hr'))
$fn$;
revoke all on function public.staff_leave_may_submit() from public, anon;
grant execute on function public.staff_leave_may_submit() to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-leave-proof', 'staff-leave-proof', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists staff_leave_proof_select on storage.objects;
drop policy if exists staff_leave_proof_insert on storage.objects;
create policy staff_leave_proof_select on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-leave-proof'
         and (split_part(name, '/', 1) = (select auth.uid())::text
              or coalesce((select public.app_role())::text in ('principal', 'hr'), false)));
create policy staff_leave_proof_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'staff-leave-proof'
              and split_part(name, '/', 1) = (select auth.uid())::text
              and (select public.staff_leave_may_submit()));
-- Deliberately NO update and NO delete policy: a proof is never replaced.

-- ── 4 · THE one leave question ─────────────────────────────────────────────
create or replace function public._staff_leave_covers(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p_user is not null and p_day is not null and exists (
    select 1 from public.staff_leave l
     where l.user_id = p_user
       and p_day between l.starts_on and l.ends_on
       and (l.cancelled_from is null or p_day < l.cancelled_from))
$fn$;
revoke all on function public._staff_leave_covers(uuid, date) from public, anon, authenticated, service_role;

create or replace function public._workspace_on_leave(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select p_user is not null and (
    public._staff_leave_covers(p_user, p_day)
    -- The undated away switch (0232) keeps the meaning the engine gave it.
    or exists (select 1 from public.ops_staff_settings s
                where s.user_id = p_user and s.available = false))
$fn$;
revoke all on function public._workspace_on_leave(uuid, date) from public, anon, authenticated, service_role;
comment on function public._workspace_on_leave(uuid, date) is
  '0670: the ONE recorded-unavailability question the cover engine asks — a non-cancelled staff_leave row covering the day, or the undated away switch (ops_staff_settings.available = false).';

-- ── 5 · the PO newcomer rule, lifted out unchanged (Workspace §4.4 data boundary)
-- Joined in an earlier calendar month; or, with no People joining date, already
-- a recorded PO Duty holder (incumbent). GRN and ordinary work have no wait.
create or replace function public._workspace_po_eligible(p_user uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (select 1 from public.hr_employees h
                  where h.app_user_id = p_user and h.join_date is not null
                    and h.join_date < date_trunc('month', p_day)::date)
      or (not exists (select 1 from public.hr_employees h
                       where h.app_user_id = p_user and h.join_date is not null)
          and exists (select 1 from public.workspace_duty_assignments a
                       where a.duty_key = 'po_duty' and a.holder_id = p_user
                         and a.effective_from <= p_day))
$fn$;
revoke all on function public._workspace_po_eligible(uuid, date) from public, anon, authenticated, service_role;

-- ── 6a · the allocation scope (0620 body; leave read through §4) ───────────
create or replace function public._workspace_activity_scope(p_type text, p_key text, p_day date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_base jsonb; v_person uuid; v_previous public.workspace_assignment_checkpoints; v_candidates jsonb; v_eligible boolean; v_move public.workspace_assignment_movements;
begin
  if p_type = 'duty' and p_key in ('po_duty','grn_duty','delivery_duty') then
    v_base := public._workspace_base_duty(p_key,p_day);
    v_person := nullif(v_base->>'actor_user_id','')::uuid;
  elsif p_type = 'order' then
    v_base := public._workspace_base_order(p_key::uuid,p_day);
    v_person := nullif(v_base->>'acting_user_id','')::uuid;
  else raise exception 'invalid allocation scope' using errcode='22023'; end if;
  select * into v_previous from public.workspace_assignment_checkpoints
   where scope_type=p_type and scope_key=p_key and office_day=p_day order by id desc limit 1;
  if found and not public._workspace_assignment_source_changed(p_type,p_key,p_day,v_previous.recorded_at) then v_person := v_previous.to_user_id; end if;
  select * into v_move from public.workspace_assignment_movements where scope_type=p_type and scope_key=p_key and office_day=p_day order by id desc limit 1;
  if found and not public._workspace_assignment_source_changed(p_type,p_key,p_day,v_move.recorded_at) then v_person:=v_move.to_user_id; end if;
  -- Recover only an effective source identity removed by an active-person gate,
  -- so departure can be recorded rather than silently losing its previous person.
  if v_person is null then
    if p_type='duty' then
      select holder_id into v_person from public.workspace_duty_assignments where duty_key=p_key
        and effective_from<=p_day and (effective_until is null or effective_until>=p_day) order by effective_from desc,created_at desc limit 1;
    else
      select owner_user_id into v_person from public.payment_collection_owners where order_id=p_key::uuid and effective_from<=p_day order by effective_from desc,changed_at desc limit 1;
      if v_person is null then select assigned_staff into v_person from public.ops_order_control where order_id=p_key::uuid; end if;
    end if;
  end if;
  select exists(select 1 from public.app_users u
    where u.id=v_person and u.is_person and u.status='active'
      and u.role in ('operation','principal'))
    and not public._workspace_on_leave(v_person,p_day) into v_eligible;
  select coalesce(jsonb_agg(id order by priority,staff_code,id),'[]'::jsonb) into v_candidates from (
    select u.id,u.staff_code,
      case when p_type='order' then (select count(*) from public.ops_order_control oc join public.orders o on o.id=oc.order_id
         where oc.assigned_staff=u.id and o.status is distinct from 'cancelled'
           and o.status is distinct from 'delivered' and o.operation_stage is distinct from 'delivered')
      else case when coalesce(u.staff_code,'') > coalesce((select staff_code from public.app_users where id=v_person),'') then 0 else 1 end end as priority
    from public.app_users u left join public.ops_staff_settings s on s.user_id=u.id
    where u.is_person and u.status='active' and not public._workspace_on_leave(u.id,p_day)
      and ((p_type='duty' and u.role='operation') or (p_type='order' and u.role in ('operation','principal') and s.user_id is not null))
      and (p_key <> 'po_duty' or p_type <> 'duty' or public._workspace_po_eligible(u.id,p_day))
  ) eligible;
  return jsonb_build_object('type',p_type,'key',p_key,'assignedUserId',v_person,
    'assignedPersonEligible',v_eligible,'previousReceiptId',v_previous.id,
    'candidateUserIds',v_candidates,'checked',coalesce((select jsonb_agg(jsonb_build_object('day',office_day,'period',period))
      from public.workspace_assignment_checkpoints where scope_type=p_type and scope_key=p_key and office_day=p_day),'[]'::jsonb));
end;
$$;
revoke all on function public._workspace_activity_scope(text,text,date) from public,anon,authenticated,service_role;

-- ── 6b · the visibility rule (0620 body; the day comes from the answer) ────
create or replace function public._workspace_assignment_visibility(p_result jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_person uuid:=coalesce(nullif(p_result->>'actor_user_id',''),nullif(p_result->>'acting_user_id',''))::uuid;
 v_day date:=coalesce(nullif(p_result->>'on_date','')::date,timezone('Asia/Kuala_Lumpur',now())::date);
begin
 if p_result ? 'duty_key' and p_result->>'duty_key' not in ('po_duty','grn_duty','delivery_duty') then return p_result; end if;
 if v_person is not null and not exists(select 1 from public.app_users where id=v_person and is_person and status='active' and role in ('operation','principal')) then
  return p_result||jsonb_build_object('actor_user_id',null,'acting_user_id',null,'acting_user_name',null,'source','not_assigned','assignment_outcome','not_assigned');
 end if;
 if public._workspace_on_leave(v_person,v_day) then
  return p_result||jsonb_build_object('assignment_outcome','no_candidate');
 end if;
 return p_result;
end;
$$;
revoke all on function public._workspace_assignment_visibility(jsonb) from public,anon,authenticated,service_role;

-- ── 7a · leave hands today's PO, GRN or Delivery Duty to the next person ───
-- Adopted from PR #1966 (0653, unmerged), reading the dated leave fact. Same
-- candidate arithmetic as the movement writer; normal owner unchanged; no
-- candidate leaves the answer for the visible `no_candidate` exception.
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
  if p_duty_key not in ('po_duty', 'grn_duty', 'delivery_duty')
     or p_day is distinct from timezone('Asia/Kuala_Lumpur', now())::date
     or v_from is null then
    return p_result;
  end if;
  -- Leave, not departure: a departed person is the visibility rule's
  -- `not_assigned`, never a leave cover.
  if not public.workspace_is_internal_staff(v_from)
     or not public._workspace_on_leave(v_from, p_day) then
    return p_result;
  end if;
  v_scope := public._workspace_activity_scope('duty', p_duty_key, p_day);
  -- The movement writer's own view must agree on who is away; otherwise the
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

-- ── 7b · the Shared Duty Resolver (0625 body; ordinary Duties pass 7a) ─────
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

-- ── 8 · the movement loop, shared by the minute cron and a submission ──────
create or replace function public._workspace_apply_recorded_unavailability(p_day date)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_scope record; v_context jsonb; v_from uuid; v_to uuid; v_count integer:=0;
begin
 -- One writer at a time: the cron and a leave submission never interleave.
 perform pg_advisory_xact_lock(hashtextextended('workspace_recorded_unavailability',0));
 lock table public.workspace_duty_assignments,public.workspace_duty_covers,public.app_users,public.ops_staff_settings,
   public.hr_employees,public.orders,public.ops_order_control,public.payment_collection_owners,public.staff_leave in share mode;
 for v_scope in select 'duty'::text t,unnest(array['po_duty','grn_duty','delivery_duty']) k
  union all select 'order',oc.order_id::text from public.ops_order_control oc join public.orders o on o.id=oc.order_id
   where o.status is distinct from 'cancelled' and o.status is distinct from 'delivered' and o.operation_stage is distinct from 'delivered'
 order by t,k
 loop
  perform pg_advisory_xact_lock(hashtextextended(v_scope.t||':'||v_scope.k||':'||p_day::text,0));
  v_context:=public._workspace_activity_scope(v_scope.t,v_scope.k,p_day);
  v_from:=nullif(v_context->>'assignedUserId','')::uuid;
  if v_from is null or (v_context->>'assignedPersonEligible')::boolean then continue; end if;
  select candidate::uuid into v_to from jsonb_array_elements_text(v_context->'candidateUserIds') with ordinality c(candidate,priority)
   where candidate::uuid<>v_from order by priority limit 1;
  if v_to is null then continue; end if;
  insert into public.workspace_assignment_movements(scope_type,scope_key,office_day,cutoff_at,from_user_id,to_user_id,reason)
   values(v_scope.t,v_scope.k,p_day,clock_timestamp(),v_from,v_to,'recorded_unavailability');
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$$;
revoke all on function public._workspace_apply_recorded_unavailability(date) from public,anon,authenticated,service_role;

create or replace function public.workspace_process_recorded_unavailability()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service only' using errcode='42501'; end if;
 return public._workspace_apply_recorded_unavailability(timezone('Asia/Kuala_Lumpur',clock_timestamp())::date);
end;
$$;
revoke all on function public.workspace_process_recorded_unavailability() from public,anon,authenticated;
grant execute on function public.workspace_process_recorded_unavailability() to service_role;

-- ── 9 · a check commit also locks the leave fact (0621 body) ───────────────
create or replace function public.workspace_commit_activity_checkpoint(
  p_scope_type text,p_scope_key text,p_office_day date,p_period text,p_settings_revision bigint,
  p_previous_receipt_id bigint,p_from_user_id uuid,p_to_user_id uuid,p_outcome text,p_reason text,
  p_office_holidays date[]
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_scope jsonb; v_settings public.workspace_activity_settings; v_start timestamptz; v_cutoff timestamptz;
 v_active boolean; v_candidate uuid; v_existing public.workspace_assignment_checkpoints;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service only' using errcode='42501'; end if;
  if p_office_holidays is null or p_office_day=any(p_office_holidays) or extract(dow from p_office_day) in (0,6) then
    raise exception 'not an Office working day' using errcode='22023'; end if;
  -- Source changes take row-exclusive table locks. Hold these short share locks
  -- across validation and receipt insert so a concurrent leave/assignment/source
  -- completion cannot invalidate the decision between its check and commit.
  lock table public.workspace_duty_assignments,public.workspace_duty_covers,public.app_users,
    public.ops_staff_settings,public.hr_employees,public.orders,public.ops_order_control,public.payment_collection_owners,
    public.staff_leave in share mode;
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
  v_start:=(p_office_day+case when p_period='morning' then time '09:00' else time '14:00' end) at time zone 'Asia/Kuala_Lumpur';
  v_cutoff:=(p_office_day+case when p_period='morning' then v_settings.morning else v_settings.afternoon end) at time zone 'Asia/Kuala_Lumpur';
  select exists(select 1 from public.workspace_activity_events where user_id=p_from_user_id and observed_at between v_start and v_cutoff)
    and (v_scope->>'assignedPersonEligible')::boolean into v_active;
  select candidate::uuid into v_candidate from jsonb_array_elements_text(v_scope->'candidateUserIds') with ordinality c(candidate,priority)
    where candidate::uuid is distinct from p_from_user_id and exists(select 1 from public.workspace_activity_events e
      where e.user_id=candidate::uuid and e.observed_at between v_start and v_cutoff) order by priority limit 1;
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

-- ── 10 · the Team list: a person on leave today is `Off today` (0667 body) ─
create or replace function public.workspace_team_today()
returns table (
  user_id uuid,
  name text,
  role text,
  last_active_at timestamptz,
  available boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
  v_day_start timestamptz := v_today::timestamp at time zone 'Asia/Kuala_Lumpur';
begin
  if (select public.app_role()) is distinct from 'operation'
     and (select public.app_role()) is distinct from 'principal' then
    raise exception 'operation only' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.name,
           u.role::text,
           (select max(e.minute_at)
              from public.workspace_activity_events e
             where e.user_id = u.id
               and e.minute_at >= v_day_start),
           not public._workspace_on_leave(u.id, v_today)
      from public.app_users u
     where u.is_person
       and u.status = 'active'
       and u.role in ('operation', 'principal')
     order by u.name, u.id;
end;
$fn$;
revoke all on function public.workspace_team_today() from public, anon;
grant execute on function public.workspace_team_today() to authenticated;

-- ── 11 · the doors ─────────────────────────────────────────────────────────
-- Submit your OWN leave. Any active internal person; no approval (policy).
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

  -- Today's leave starts cover now, on an Office weekday (the days the minute
  -- engine runs). Future leave waits for its own day; a weekend answer comes
  -- from the resolver at read time. Only Operation people and the principal
  -- carry routine work, so only their leave can move an assignment.
  if v_today between p_starts_on and p_ends_on and extract(isodow from v_today) between 1 and 5
     and exists (select 1 from public.app_users u where u.id = v_uid and u.role in ('operation', 'principal')) then
    v_moved := public._workspace_apply_recorded_unavailability(v_today);
  end if;

  return to_jsonb(v_row) || jsonb_build_object('cover_moved', v_moved);
end;
$fn$;
revoke all on function public.staff_leave_submit(text, date, date, text, text, text[]) from public, anon;
grant execute on function public.staff_leave_submit(text, date, date, text, text, text[]) to authenticated;

-- Cancel your OWN leave before it starts, or withdraw the days after today.
-- Today stays leave (its cover already moved; work never bounces back).
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
  if not found or v_row.user_id is distinct from v_uid then
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

-- Who is away today and in the next days — names and dates only, never the
-- type, reason, note or proof. Staff & Duties readers and HR.
create or replace function public.workspace_leave_upcoming(p_days integer default 7)
returns table (user_id uuid, name text, starts_on date, ends_on date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := timezone('Asia/Kuala_Lumpur', clock_timestamp())::date;
begin
  if coalesce((select public.app_role())::text, '') not in ('operation', 'principal', 'hr') then
    raise exception 'operation only' using errcode = '42501';
  end if;
  if p_days is null or p_days < 0 or p_days > 62 then
    raise exception 'invalid range' using errcode = '22023', detail = 'invalid_range';
  end if;
  return query
    select l.user_id, u.name::text, l.starts_on,
           case when l.cancelled_from is null then l.ends_on else l.cancelled_from - 1 end
      from public.staff_leave l
      join public.app_users u on u.id = l.user_id
     where u.status = 'active'
       and (l.cancelled_from is null or l.cancelled_from > l.starts_on)
       and l.starts_on <= v_today + p_days
       and (case when l.cancelled_from is null then l.ends_on else l.cancelled_from - 1 end) >= v_today
     order by l.starts_on, u.name, l.user_id;
end;
$fn$;
revoke all on function public.workspace_leave_upcoming(integer) from public, anon;
grant execute on function public.workspace_leave_upcoming(integer) to authenticated;

-- ── 12 · the owner default 10:00 AM check time becomes storable ────────────
do $$
declare v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.workspace_activity_settings'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ~ '\mmorning\M'
  loop
    execute format('alter table public.workspace_activity_settings drop constraint %I', v_name);
  end loop;
end $$;
alter table public.workspace_activity_settings
  add constraint workspace_activity_settings_morning_window
  check (morning >= time '10:00' and morning < time '13:00' and extract(second from morning) = 0);

create or replace function public.workspace_set_activity_times(p_morning time, p_afternoon time, p_revision bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before public.workspace_activity_settings; v_after public.workspace_activity_settings;
begin
  perform public.workspace_duty_settings_gate();
  if p_morning is null or p_afternoon is null or p_revision is null
     or p_morning < time '10:00' or p_morning >= time '13:00'
     or p_afternoon <= time '14:00' or p_afternoon >= time '18:00'
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

-- ── 13 · sanity: schema and privileges only, never a row count ─────────────
do $$
begin
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name in ('staff_leave', 'workspace_leave_policies')
                and grantee in ('authenticated', 'anon') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception '0670 sanity: leave tables must be written through the doors only';
  end if;
  if has_function_privilege('authenticated', 'public._workspace_on_leave(uuid, date)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_apply_recorded_unavailability(date)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_recorded_leave_cover(text, date, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public._workspace_po_eligible(uuid, date)', 'execute') then
    raise exception '0670 sanity: a private helper is executable by authenticated';
  end if;
  if not exists (select 1 from storage.buckets where id = 'staff-leave-proof' and public = false) then
    raise exception '0670 sanity: the leave proof bucket is missing or public';
  end if;
  if public._workspace_recorded_leave_cover('finance_approver', current_date, '{"actor_user_id":null}'::jsonb)
     is distinct from '{"actor_user_id":null}'::jsonb then
    raise exception '0670 sanity: a non-routine Duty was changed by the leave-cover helper';
  end if;
  if public._workspace_on_leave(null, current_date) then
    raise exception '0670 sanity: nobody cannot be on leave';
  end if;
end $$;

commit;

-- VERIFY AFTER the governed apply (no row-count assertion):
--   select public.workspace_resolve_duty('po_duty'), public.workspace_resolve_duty('grn_duty');
--     with nobody on leave: identical to 0625's answer for the same moment.
--   select morning, afternoon from public.workspace_activity_settings;  -- unchanged
