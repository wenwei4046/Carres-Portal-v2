-- Checkpoint receipts prove each scheduled check. Movements are the shared
-- append-only current-assignment ledger, also admitting recorded unavailability
-- between checkpoints without rewriting any completed business fact.
create table public.workspace_assignment_movements (
 id bigint generated always as identity primary key,
 scope_type text not null check(scope_type in ('duty','order')), scope_key text not null,
 office_day date not null, period text check(period in ('morning','afternoon')),
 checkpoint_id bigint unique references public.workspace_assignment_checkpoints(id),
 cutoff_at timestamptz not null, recorded_at timestamptz not null default clock_timestamp(),
 from_user_id uuid not null references public.app_users(id), to_user_id uuid not null references public.app_users(id),
 outcome text not null default 'reassigned' check(outcome='reassigned'),
 reason text not null check(reason in ('missing_period_activity','no_longer_eligible','recorded_unavailability')),
 check(from_user_id<>to_user_id)
);
create index workspace_assignment_movements_scope on public.workspace_assignment_movements(scope_type,scope_key,office_day,id desc);
alter table public.workspace_assignment_movements enable row level security;
revoke all on public.workspace_assignment_movements from public,anon,authenticated,service_role;
grant select on public.workspace_assignment_movements to service_role;
revoke all on sequence public.workspace_assignment_movements_id_seq from public,anon,authenticated,service_role;

create function public._workspace_checkpoint_movement() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.outcome='reassigned' then
  insert into public.workspace_assignment_movements(scope_type,scope_key,office_day,period,checkpoint_id,cutoff_at,recorded_at,from_user_id,to_user_id,reason)
   values(new.scope_type,new.scope_key,new.office_day,new.period,new.id,new.cutoff_at,new.recorded_at,new.from_user_id,new.to_user_id,new.reason);
 end if;
 return new;
end;
$$;
revoke all on function public._workspace_checkpoint_movement() from public,anon,authenticated,service_role;
create trigger workspace_checkpoint_movement after insert on public.workspace_assignment_checkpoints
 for each row execute function public._workspace_checkpoint_movement();

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

create function public._workspace_assignment_visibility(p_result jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_person uuid:=coalesce(nullif(p_result->>'actor_user_id',''),nullif(p_result->>'acting_user_id',''))::uuid;
begin
 if p_result ? 'duty_key' and p_result->>'duty_key' not in ('po_duty','grn_duty','delivery_duty') then return p_result; end if;
 if v_person is not null and not exists(select 1 from public.app_users where id=v_person and is_person and status='active' and role in ('operation','principal')) then
  return p_result||jsonb_build_object('actor_user_id',null,'acting_user_id',null,'acting_user_name',null,'source','not_assigned','assignment_outcome','not_assigned');
 end if;
 if exists(select 1 from public.ops_staff_settings where user_id=v_person and available=false) then
  return p_result||jsonb_build_object('assignment_outcome','no_candidate');
 end if;
 return p_result;
end;
$$;
revoke all on function public._workspace_assignment_visibility(jsonb) from public,anon,authenticated,service_role;

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
  if not found or public._workspace_assignment_source_changed('duty',p_duty_key,v_day,v_receipt.recorded_at) then return public._workspace_assignment_visibility(v_result); end if;
  v_person:=v_receipt.to_user_id;
  if v_person is not null and not public.workspace_is_internal_staff(v_person) then v_person:=null; end if;
  v_result := v_result || jsonb_build_object('acting_user_id',v_person,'actor_user_id',v_person,
    'acting_user_name',(select name from public.app_users where id=v_person),
    'is_cover',v_person is distinct from nullif(v_result->>'normal_user_id','')::uuid,
    'source','system_assignment','assignment_receipt_id',v_receipt.checkpoint_id,'assignment_movement_id',v_receipt.id,'assignment_outcome',coalesce(v_result->>'assignment_outcome',v_receipt.outcome));
  return public._workspace_assignment_visibility(v_result);
end;
$$;

create or replace function public.delivery_responsible_operation(p_order_id uuid,p_on date default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_day date:=coalesce(p_on,timezone('Asia/Kuala_Lumpur',now())::date); v_result jsonb;
 v_receipt public.workspace_assignment_movements; v_check public.workspace_assignment_checkpoints; v_person uuid;
begin
  v_result:=public._workspace_base_order(p_order_id,v_day);
  select * into v_check from public.workspace_assignment_checkpoints where scope_type='order' and scope_key=p_order_id::text
    and office_day=v_day order by id desc limit 1;
  if found and not public._workspace_assignment_source_changed('order',p_order_id::text,v_day,v_check.recorded_at) then
    v_result:=v_result||jsonb_build_object('assignment_outcome',v_check.outcome);
  end if;
  select * into v_receipt from public.workspace_assignment_movements where scope_type='order' and scope_key=p_order_id::text
    and office_day=v_day order by id desc limit 1;
  if not found or public._workspace_assignment_source_changed('order',p_order_id::text,v_day,v_receipt.recorded_at) then return public._workspace_assignment_visibility(v_result); end if;
  v_person:=v_receipt.to_user_id;
  if v_person is not null and not exists(select 1 from public.app_users where id=v_person and is_person and status='active' and role in ('operation','principal')) then v_person:=null; end if;
  v_result := v_result || jsonb_build_object('acting_user_id',v_person,'acting_user_name',(select name from public.app_users where id=v_person),
    'is_cover',v_person is distinct from nullif(v_result->>'normal_user_id','')::uuid,
    'cover_reason','system_assignment','assignment_receipt_id',v_receipt.checkpoint_id,'assignment_movement_id',v_receipt.id,'assignment_outcome',coalesce(v_result->>'assignment_outcome',v_receipt.outcome));
  return public._workspace_assignment_visibility(v_result);
end;
$$;

create function public.workspace_process_recorded_unavailability()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_day date:=timezone('Asia/Kuala_Lumpur',clock_timestamp())::date; v_scope record; v_context jsonb; v_from uuid; v_to uuid; v_count integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service only' using errcode='42501'; end if;
 lock table public.workspace_duty_assignments,public.workspace_duty_covers,public.app_users,public.ops_staff_settings,
   public.hr_employees,public.orders,public.ops_order_control,public.payment_collection_owners in share mode;
 for v_scope in select 'duty'::text t,unnest(array['po_duty','grn_duty','delivery_duty']) k
  union all select 'order',oc.order_id::text from public.ops_order_control oc join public.orders o on o.id=oc.order_id
   where o.status is distinct from 'cancelled' and o.status is distinct from 'delivered' and o.operation_stage is distinct from 'delivered'
 order by t,k
 loop
  perform pg_advisory_xact_lock(hashtextextended(v_scope.t||':'||v_scope.k||':'||v_day::text,0));
  v_context:=public._workspace_activity_scope(v_scope.t,v_scope.k,v_day);
  v_from:=nullif(v_context->>'assignedUserId','')::uuid;
  if v_from is null or (v_context->>'assignedPersonEligible')::boolean then continue; end if;
  select candidate::uuid into v_to from jsonb_array_elements_text(v_context->'candidateUserIds') with ordinality c(candidate,priority)
   where candidate::uuid<>v_from order by priority limit 1;
  if v_to is null then continue; end if;
  insert into public.workspace_assignment_movements(scope_type,scope_key,office_day,cutoff_at,from_user_id,to_user_id,reason)
   values(v_scope.t,v_scope.k,v_day,clock_timestamp(),v_from,v_to,'recorded_unavailability');
  v_count:=v_count+1;
 end loop;
 return v_count;
end;
$$;
revoke all on function public.workspace_process_recorded_unavailability() from public,anon,authenticated;
grant execute on function public.workspace_process_recorded_unavailability() to service_role;

create or replace function public.workspace_assignment_history(p_duty_key text,p_before bigint default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
  if not exists(select 1 from public.app_users where id=auth.uid() and status='active' and role in ('operation','principal')) then
    raise exception 'Operation access required' using errcode='42501'; end if;
  if p_duty_key not in ('po_duty','grn_duty','delivery_duty') then return '[]'::jsonb; end if;
  if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'invalid history page size' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(rows) order by id desc),'[]'::jsonb) into v_rows from (
    select c.id,c.office_day,c.period,c.cutoff_at,c.recorded_at,c.from_user_id,c.to_user_id,c.outcome,c.reason,
      f.name as from_name,t.name as to_name
    from public.workspace_assignment_movements c
    left join public.app_users f on f.id=c.from_user_id left join public.app_users t on t.id=c.to_user_id
    where c.scope_type='duty' and c.scope_key=p_duty_key and c.outcome<>'active' and (p_before is null or c.id<p_before)
    order by c.id desc limit p_limit
  ) rows;
  return v_rows;
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
    public.ops_staff_settings,public.hr_employees,public.orders,public.ops_order_control,public.payment_collection_owners in share mode;
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
