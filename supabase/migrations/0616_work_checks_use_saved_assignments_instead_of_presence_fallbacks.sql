-- Workspace §4.4: connect the two-period evidence to durable current assignments.
-- No approval permission or stable Sales Order PIC is changed.
create or replace function public._workspace_base_duty(
  p_duty_key text,
  p_on date default null
)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_on date := coalesce(p_on, (timezone('Asia/Kuala_Lumpur', now()))::date);
  v_normal uuid;
  v_source text := 'assignment';
  v_cover_id uuid;
  v_acting uuid;
begin
  v_normal := public.workspace_duty_normal_on(p_duty_key, v_on);

  if v_normal is null then
    return jsonb_build_object(
      'duty_key', p_duty_key, 'on_date', v_on,
      'normal_user_id', null, 'acting_user_id', null, 'actor_user_id', null,
      'is_cover', false, 'cover_id', null, 'source', 'not_assigned');
  end if;

  select c.id, c.acting_user_id into v_cover_id, v_acting
    from workspace_duty_covers c
   where c.duty_key = p_duty_key
     and v_on between c.starts_on and c.ends_on
     and c.normal_user_id = v_normal
     and public.workspace_is_internal_staff(c.acting_user_id)
     and (public.workspace_duty_holder_roles(p_duty_key) is null
          or exists (select 1 from app_users u
                      where u.id = c.acting_user_id
                        and u.role::text = any(public.workspace_duty_holder_roles(p_duty_key))))
   order by c.created_at desc
   limit 1;

  return jsonb_build_object(
    'duty_key', p_duty_key, 'on_date', v_on,
    'normal_user_id', v_normal,
    'acting_user_id', v_acting,
    'actor_user_id', coalesce(v_acting, v_normal),
    'is_cover', v_acting is not null,
    'cover_id', v_cover_id,
    'source', v_source);
end;
$fn$;
create or replace function public._workspace_base_order(
  p_order_id uuid,
  p_on date default null
) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_on date := coalesce(p_on, v_today);
  v_normal uuid;
  v_source text := 'not_assigned';
  v_effective date;
  v_acting uuid;
  v_cover_ends date;
begin
  if not (coalesce(auth.role() = 'service_role', false) or coalesce((select public.is_internal()), false)) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_internal';
  end if;

  -- a · the order's own responsibility ledger — an establishment or a formal
  --     handover. Newest row effective on or before the day, unconditionally:
  --     an older row never becomes the answer just because the newest person
  --     has since left.
  select c.owner_user_id, c.source, c.effective_from
    into v_normal, v_source, v_effective
    from public.payment_collection_owners c
   where c.order_id = p_order_id and c.effective_from <= v_on
   order by c.effective_from desc, c.changed_at desc
   limit 1;

  if v_normal is not null and not exists (
    select 1 from public.app_users u
     where u.id = v_normal and u.status = 'active'
       and u.role in ('operation', 'principal') and u.is_person
  ) then
    v_normal := null; v_source := 'not_assigned'; v_effective := null;
  end if;

  -- b · the person this Sales Order was DEALT to when it entered Operations.
  --     Only an INDIVIDUAL owns: a shared login or a robot account (no
  --     staff_code) may record evidence, never carry responsibility.
  if v_normal is null then
    select oc.assigned_staff, (timezone('Asia/Kuala_Lumpur', oc.assigned_at))::date
      into v_normal, v_effective
      from public.ops_order_control oc
      join public.app_users u on u.id = oc.assigned_staff
     where oc.order_id = p_order_id
       and u.status = 'active' and u.role in ('operation', 'principal')
       and u.is_person;
    if v_normal is not null then v_source := 'assigned'; end if;
  end if;

  if v_normal is null then
    return jsonb_build_object(
      'order_id', p_order_id, 'on_date', v_on, 'source', 'not_assigned',
      'normal_user_id', null, 'normal_user_name', null, 'effective_from', null,
      'acting_user_id', null, 'acting_user_name', null,
      'is_cover', false, 'cover_ends_on', null, 'cover_reason', null);
  end if;

  -- c · today's acting person — a FORMAL buddy cover first (the shared law).
  select w.acting_user_id, w.ends_on into v_acting, v_cover_ends
    from public.workspace_duty_covers w
   where w.duty_key = 'delivery_duty' and w.normal_user_id = v_normal
     and v_on between w.starts_on and w.ends_on
   order by w.created_at desc
   limit 1;

  return jsonb_build_object(
    'order_id', p_order_id, 'on_date', v_on, 'source', v_source,
    'normal_user_id', v_normal,
    'normal_user_name', (select name from public.app_users where id = v_normal),
    'effective_from', v_effective,
    'acting_user_id', coalesce(v_acting, v_normal),
    'acting_user_name', (select name from public.app_users where id = coalesce(v_acting, v_normal)),
    'is_cover', v_acting is not null,
    'cover_ends_on', v_cover_ends,
    'cover_reason', case when v_acting is null then null
                         when v_cover_ends = v_today and not exists (
                           select 1 from public.workspace_duty_covers w
                            where w.duty_key = 'delivery_duty' and w.normal_user_id = v_normal
                              and v_on between w.starts_on and w.ends_on)
                         then 'away_today' else 'buddy_cover' end);
end;
$fn$;
revoke all on function public._workspace_base_duty(text,date), public._workspace_base_order(uuid,date) from public, anon, authenticated, service_role;

create function public._workspace_assignment_source_changed(p_type text,p_key text,p_day date,p_since timestamptz)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_normal uuid;
begin
  if p_type='duty' then
    if exists(select 1 from public.workspace_duty_assignments where duty_key=p_key and effective_from<=p_day
      and (effective_until is null or effective_until>=p_day) and created_at>p_since) then return true; end if;
    v_normal:=nullif(public._workspace_base_duty(p_key,p_day)->>'normal_user_id','')::uuid;
  else
    if exists(select 1 from public.payment_collection_owners where order_id=p_key::uuid and effective_from<=p_day and changed_at>p_since)
      or exists(select 1 from public.ops_order_control where order_id=p_key::uuid and assigned_at>p_since) then return true; end if;
    v_normal:=nullif(public._workspace_base_order(p_key::uuid,p_day)->>'normal_user_id','')::uuid;
  end if;
  return exists(select 1 from public.workspace_duty_covers where duty_key=case when p_type='duty' then p_key else 'delivery_duty' end
    and normal_user_id=v_normal and p_day between starts_on and ends_on and created_at>p_since);
end;
$$;
revoke all on function public._workspace_assignment_source_changed(text,text,date,timestamptz) from public,anon,authenticated,service_role;

create function public._workspace_activity_scope(p_type text, p_key text, p_day date)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_base jsonb; v_person uuid; v_previous public.workspace_assignment_checkpoints; v_candidates jsonb; v_eligible boolean;
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
  select exists(select 1 from public.app_users u
    left join public.ops_staff_settings s on s.user_id=u.id
    where u.id=v_person and u.is_person and u.status='active'
      and u.role in ('operation','principal') and s.available is distinct from false) into v_eligible;
  select coalesce(jsonb_agg(id order by priority,staff_code,id),'[]'::jsonb) into v_candidates from (
    select u.id,u.staff_code,
      case when p_type='order' then (select count(*) from public.ops_order_control oc join public.orders o on o.id=oc.order_id
         where oc.assigned_staff=u.id and o.status is distinct from 'cancelled'
           and o.status is distinct from 'delivered' and o.operation_stage is distinct from 'delivered')
      else case when coalesce(u.staff_code,'') > coalesce((select staff_code from public.app_users where id=v_person),'') then 0 else 1 end end as priority
    from public.app_users u left join public.ops_staff_settings s on s.user_id=u.id
    left join public.hr_employees h on h.app_user_id=u.id
    where u.is_person and u.status='active' and s.available is distinct from false
      and ((p_type='duty' and u.role='operation') or (p_type='order' and u.role in ('operation','principal') and s.user_id is not null))
      and (p_key <> 'po_duty' or p_type <> 'duty' or
        (h.join_date is not null and h.join_date < date_trunc('month',p_day)::date)
        or (h.join_date is null and exists(select 1 from public.workspace_duty_assignments a where a.duty_key='po_duty' and a.holder_id=u.id and a.effective_from<=p_day)))
  ) eligible;
  return jsonb_build_object('type',p_type,'key',p_key,'assignedUserId',v_person,
    'assignedPersonEligible',v_eligible,'previousReceiptId',v_previous.id,
    'candidateUserIds',v_candidates,'checked',coalesce((select jsonb_agg(jsonb_build_object('day',office_day,'period',period))
      from public.workspace_assignment_checkpoints where scope_type=p_type and scope_key=p_key and office_day=p_day),'[]'::jsonb));
end;
$$;
revoke all on function public._workspace_activity_scope(text,text,date) from public,anon,authenticated,service_role;

create function public.workspace_activity_checkpoint_snapshot(p_period text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_now timestamptz:=clock_timestamp(); v_day date:=timezone('Asia/Kuala_Lumpur',v_now)::date;
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
revoke all on function public.workspace_activity_checkpoint_snapshot(text) from public,anon,authenticated;
grant execute on function public.workspace_activity_checkpoint_snapshot(text) to service_role;

create function public.workspace_commit_activity_checkpoint(
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
revoke all on function public.workspace_commit_activity_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text,date[]) from public,anon,authenticated;
grant execute on function public.workspace_commit_activity_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text,date[]) to service_role;
-- Only the source-aware writer may use the low-level receipt primitive.
revoke execute on function public.workspace_record_assignment_checkpoint(text,text,date,text,bigint,bigint,uuid,uuid,text,text) from service_role;

create or replace function public.workspace_resolve_duty(p_duty_key text,p_on date default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_day date:=coalesce(p_on,timezone('Asia/Kuala_Lumpur',now())::date); v_result jsonb;
 v_receipt public.workspace_assignment_checkpoints; v_person uuid;
begin
  v_result:=public._workspace_base_duty(p_duty_key,v_day);
  if p_duty_key not in ('po_duty','grn_duty','delivery_duty') then return v_result; end if;
  select * into v_receipt from public.workspace_assignment_checkpoints where scope_type='duty' and scope_key=p_duty_key
    and office_day=v_day order by id desc limit 1;
  if not found or public._workspace_assignment_source_changed('duty',p_duty_key,v_day,v_receipt.recorded_at) then return v_result; end if;
  v_person:=v_receipt.to_user_id;
  if v_person is not null and not public.workspace_is_internal_staff(v_person) then v_person:=null; end if;
  return v_result || jsonb_build_object('acting_user_id',v_person,'actor_user_id',v_person,
    'acting_user_name',(select name from public.app_users where id=v_person),
    'is_cover',v_person is distinct from nullif(v_result->>'normal_user_id','')::uuid,
    'source','system_assignment','assignment_receipt_id',v_receipt.id,'assignment_outcome',v_receipt.outcome);
end;
$$;

create or replace function public.delivery_responsible_operation(p_order_id uuid,p_on date default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_day date:=coalesce(p_on,timezone('Asia/Kuala_Lumpur',now())::date); v_result jsonb;
 v_receipt public.workspace_assignment_checkpoints; v_person uuid;
begin
  v_result:=public._workspace_base_order(p_order_id,v_day);
  select * into v_receipt from public.workspace_assignment_checkpoints where scope_type='order' and scope_key=p_order_id::text
    and office_day=v_day order by id desc limit 1;
  if not found or public._workspace_assignment_source_changed('order',p_order_id::text,v_day,v_receipt.recorded_at) then return v_result; end if;
  v_person:=v_receipt.to_user_id;
  if v_person is not null and not exists(select 1 from public.app_users where id=v_person and is_person and status='active' and role in ('operation','principal')) then v_person:=null; end if;
  return v_result || jsonb_build_object('acting_user_id',v_person,'acting_user_name',(select name from public.app_users where id=v_person),
    'is_cover',v_person is distinct from nullif(v_result->>'normal_user_id','')::uuid,
    'cover_reason','system_assignment','assignment_receipt_id',v_receipt.id,'assignment_outcome',v_receipt.outcome);
end;
$$;

-- Current person is checked under source locks by the only public writer.
create or replace function public.workspace_record_assignment_checkpoint(
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
