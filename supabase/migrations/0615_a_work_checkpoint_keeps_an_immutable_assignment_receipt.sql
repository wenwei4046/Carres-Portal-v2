-- Workspace §4.4: additive audit primitive for the approved two-period engine.
-- This does NOT activate a scheduler, change a resolver or grant work permissions.
create table public.workspace_assignment_checkpoints (
  id bigint generated always as identity primary key,
  scope_type text not null check (scope_type in ('duty', 'order')),
  scope_key text not null check (length(btrim(scope_key)) > 0),
  office_day date not null,
  period text not null check (period in ('morning', 'afternoon')),
  settings_revision bigint not null,
  cutoff_at timestamptz not null,
  from_user_id uuid references public.app_users(id),
  to_user_id uuid references public.app_users(id),
  outcome text not null check (outcome in ('active', 'reassigned', 'not_assigned', 'no_candidate')),
  reason text not null check (reason in ('active', 'missing_period_activity', 'no_longer_eligible', 'not_assigned', 'no_candidate')),
  recorded_at timestamptz not null default clock_timestamp(),
  unique(scope_type, scope_key, office_day, period),
  check ((outcome = 'reassigned' and from_user_id is not null and to_user_id is not null and from_user_id <> to_user_id)
      or (outcome <> 'reassigned' and from_user_id is not distinct from to_user_id))
);
create index workspace_assignment_checkpoints_scope
  on public.workspace_assignment_checkpoints(scope_type, scope_key, office_day, id desc);

-- New receipts are service-only. No browser can manufacture an assignment,
-- inspect the unscoped ledger, or modify historical evidence.
alter table public.workspace_assignment_checkpoints enable row level security;
revoke all on public.workspace_assignment_checkpoints from public, anon, authenticated, service_role;
grant select on public.workspace_assignment_checkpoints to service_role;
revoke all on sequence public.workspace_assignment_checkpoints_id_seq from public, anon, authenticated, service_role;

create function public.workspace_record_assignment_checkpoint(
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
     or p_office_day is distinct from timezone('Asia/Kuala_Lumpur',clock_timestamp())::date then
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
  v_cutoff := (p_office_day + case when p_period = 'morning' then v_settings.morning else v_settings.afternoon end)
    at time zone 'Asia/Kuala_Lumpur';
  if clock_timestamp() < v_cutoff then
    raise exception 'checkpoint not due' using errcode = '22023';
  end if;
  select * into v_previous from public.workspace_assignment_checkpoints
   where scope_type = p_scope_type and scope_key = p_scope_key and office_day = p_office_day
   order by id desc limit 1;
  if v_previous.id is distinct from p_previous_receipt_id
     or (v_previous.id is not null and v_previous.to_user_id is distinct from p_from_user_id)
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
  from public, anon, authenticated;
grant execute on function public.workspace_record_assignment_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text)
  to service_role;
comment on function public.workspace_record_assignment_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text) is
  'Service-only audit primitive, not an allocation authority. Caller must verify Office calendar, complete current-period evidence, source completion and Duty/object candidate eligibility in its transaction. No scheduler/resolver is activated by 0615.';
