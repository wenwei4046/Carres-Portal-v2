-- A later movement supersedes an earlier no-candidate check. A later check
-- still reports its own outcome without undoing the durable assignment.
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
    'source','system_assignment','assignment_receipt_id',v_receipt.checkpoint_id,'assignment_movement_id',v_receipt.id,'assignment_outcome',case when v_check.id is not null and v_check.recorded_at > v_receipt.recorded_at
      then coalesce(v_result->>'assignment_outcome',v_receipt.outcome) else v_receipt.outcome end);
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
    'cover_reason','system_assignment','assignment_receipt_id',v_receipt.checkpoint_id,'assignment_movement_id',v_receipt.id,'assignment_outcome',case when v_check.id is not null and v_check.recorded_at > v_receipt.recorded_at
      then coalesce(v_result->>'assignment_outcome',v_receipt.outcome) else v_receipt.outcome end);
  return public._workspace_assignment_visibility(v_result);
end;
$$;

