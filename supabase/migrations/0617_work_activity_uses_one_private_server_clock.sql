-- A private time dependency permits rolled-back boundary probes without
-- exposing a client timestamp or altering the production system clock.
create function public._workspace_activity_clock() returns timestamptz
language sql volatile security definer set search_path=public,pg_temp as $$ select clock_timestamp(); $$;
revoke all on function public._workspace_activity_clock() from public,anon,authenticated,service_role;

create or replace function public.workspace_activity_checkpoint_snapshot(p_period text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_now timestamptz:=public._workspace_activity_clock(); v_day date:=timezone('Asia/Kuala_Lumpur',v_now)::date;
  v_settings public.workspace_activity_settings; v_scopes jsonb; v_events jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service only' using errcode='42501'; end if;
  if p_period is null or p_period not in ('morning','afternoon') then raise exception 'invalid period' using errcode='22023'; end if;
  select * into strict v_settings from public.workspace_activity_settings where id=1;
  select coalesce(jsonb_agg(public._workspace_activity_scope(t,k,v_day)),'[]'::jsonb) into v_scopes from (
    select 'duty'::text t, unnest(array['po_duty','grn_duty','delivery_duty']) k
    union all select 'order',oc.order_id::text from public.ops_order_control oc join public.orders o on o.id=oc.order_id
      where o.status is distinct from 'cancelled' and o.status is distinct from 'delivered' and o.operation_stage is distinct from 'delivered'
  ) scopes where not exists(select 1 from public.workspace_assignment_checkpoints r
    where r.scope_type=t and r.scope_key=k and r.office_day=v_day and r.period=p_period);
  select coalesce(jsonb_agg(jsonb_build_object('userId',user_id,'observedAt',observed_at)),'[]'::jsonb) into v_events
    from public.workspace_activity_events where observed_at >= (v_day+time '09:00') at time zone 'Asia/Kuala_Lumpur'
      and observed_at <= v_now;
  return jsonb_build_object('day',v_day,'now',v_now,
    'settings',jsonb_build_object('morning',to_char(v_settings.morning,'HH24:MI'),'afternoon',to_char(v_settings.afternoon,'HH24:MI'),'revision',v_settings.revision),
    'evidence',jsonb_build_object('status','healthy','events',v_events),'scopes',v_scopes);
end;
$$;

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
    public.ops_staff_settings,public.hr_employees,public.orders,public.ops_order_control in share mode;
  select * into strict v_settings from public.workspace_activity_settings where id=1 for share;
  select * into v_existing from public.workspace_assignment_checkpoints where scope_type=p_scope_type
    and scope_key=p_scope_key and office_day=p_office_day and period=p_period;
  if found then return to_jsonb(v_existing); end if;
  if p_scope_type='order' and not exists(select 1 from public.orders o join public.ops_order_control oc on oc.order_id=o.id
    where o.id::text=p_scope_key and o.status is distinct from 'cancelled' and o.status is distinct from 'delivered'
      and o.operation_stage is distinct from 'delivered') then
    raise exception 'source no longer open' using errcode='40001'; end if;
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
