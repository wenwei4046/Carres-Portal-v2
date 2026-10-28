-- Owner-approved Workspace §3 / Purchasing §9.4: assignment routes ordinary
-- work, never restricts an active authorised colleague from recording a receipt.
create or replace function public.receiving_actor_context()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_duty jsonb:=public.workspace_resolve_duty('grn_duty',null);
 v_authority jsonb:=public._workspace_base_duty('grn_duty',null);
 v_super boolean:=public.is_operations_superuser(v_uid); v_staff boolean;
begin
  select exists(select 1 from public.app_users where id=v_uid and is_person and status='active' and role in ('operation','principal')) into v_staff;
  -- 0601 amendment/void authority follows the recorded holder/dated manual
  -- assignment, never the automated ordinary-work checkpoint recipient.
  return v_duty || jsonb_build_object('uid',v_uid,'is_superuser',v_super,'is_operation_staff',v_staff,
    'allowed',v_uid is not null and v_staff,
    'may_amend',v_uid is not null and (v_super or nullif(v_authority->>'actor_user_id','')::uuid=v_uid));
end;
$$;

-- Names here are immutable business-evidence identities, not access to former
-- employee profiles. Browser clients cannot read the underlying ledger directly.
create function public.workspace_assignment_history(p_duty_key text,p_before bigint default null,p_limit integer default 50)
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
    from public.workspace_assignment_checkpoints c
    left join public.app_users f on f.id=c.from_user_id left join public.app_users t on t.id=c.to_user_id
    where c.scope_type='duty' and c.scope_key=p_duty_key and c.outcome<>'active' and (p_before is null or c.id<p_before)
    order by c.id desc limit p_limit
  ) rows;
  return v_rows;
end;
$$;
revoke all on function public.workspace_assignment_history(text,bigint,integer) from public,anon;
grant execute on function public.workspace_assignment_history(text,bigint,integer) to authenticated;
