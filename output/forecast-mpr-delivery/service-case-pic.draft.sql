-- DRAFT ONLY: latest owner ruling, Case PIC handles this Case's remedy decision.
-- No old Case is assigned by inference. No historical approval is manufactured.
alter table public.service_cases add column if not exists owner_user_id uuid references public.app_users(id);
alter table public.service_cases add column if not exists owner_revision integer not null default 0;
alter table public.service_cases add column if not exists owner_events jsonb not null default '[]'::jsonb;

create or replace function public._service_case_owner_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $guard$
begin
 if tg_op='DELETE' then
  if old.owner_events<>'[]' then raise exception 'Retain Case PIC history' using errcode='22023'; end if;
  return old;
 end if;
 if jsonb_typeof(new.owner_events) is distinct from 'array' or new.owner_revision<0 then raise exception 'Invalid Case PIC history' using errcode='22023'; end if;
 if (tg_op='INSERT' and (new.owner_user_id is not null or new.owner_revision<>0 or new.owner_events<>'[]')) or
    (tg_op='UPDATE' and (new.owner_user_id is distinct from old.owner_user_id or new.owner_revision is distinct from old.owner_revision or new.owner_events is distinct from old.owner_events)) then
  if current_user<>pg_get_userbyid((select relowner from pg_class where oid='public.service_cases'::regclass)) then
   raise exception 'Use the Case PIC assignment door' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (jsonb_array_length(new.owner_events)<>jsonb_array_length(old.owner_events)+1 or new.owner_revision<>old.owner_revision+1
   or exists(select 1 from jsonb_array_elements(old.owner_events) with ordinality e(value,n) where new.owner_events->(n::integer-1) is distinct from value)) then
   raise exception 'Retain Case PIC history' using errcode='22023';
  end if;
 end if;
 return new;
end;
$guard$;
revoke all on function public._service_case_owner_guard() from public,anon,authenticated;
create trigger service_case_owner_guard before insert or update or delete on public.service_cases for each row execute function public._service_case_owner_guard();

-- Same owner shape used by Work. Existing Case assignment is the sole source;
-- existing shared People eligibility and recorded-leave check are reused.
-- No rota, automatic reassignment, new cover table or company duty assignment.
create or replace function public.workspace_resolve_service_case_owner(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $owner$
declare c public.service_cases%rowtype; actor uuid;
begin
 if public.app_role() is null or public.app_role() not in('operation','principal') then raise exception 'Not permitted' using errcode='42501'; end if;
 select * into c from public.service_cases where id=p_case_id;
 if not found then raise exception 'Case not found' using errcode='22023'; end if;
 select u.id into actor from public.app_users u where u.id=c.owner_user_id and u.role in('operation','principal')
  and public.workspace_is_person(u.id) and not public._workspace_on_leave(u.id,timezone('Asia/Kuala_Lumpur',now())::date);
 return jsonb_build_object('owner_rule','service_case_pic','normal_user_id',c.owner_user_id,'normal_user_name',(select name from public.app_users where id=c.owner_user_id),
  'actor_user_id',actor,'actorName',(select name from public.app_users where id=actor),'acting_user_id',null,'is_cover',false,'source','case_pic',
  'revision',c.owner_revision,'state',case when c.owner_user_id is null then 'not_assigned' when actor is null then 'unavailable' else 'primary' end);
end;
$owner$;
revoke all on function public.workspace_resolve_service_case_owner(uuid) from public,anon;
grant execute on function public.workspace_resolve_service_case_owner(uuid) to authenticated;

create or replace function public.service_case_set_pic(p_case_id uuid,p_owner_id uuid,p_expected_revision integer,p_reason text,p_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $assign$
declare c public.service_cases%rowtype; prior jsonb; receipt jsonb;
begin
 if public.app_role() is null or public.app_role() not in('operation','principal') or not public.workspace_is_person(auth.uid()) then raise exception 'Not permitted' using errcode='42501'; end if;
 if p_key is null or p_owner_id is null or p_expected_revision is null or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 then raise exception 'Choose the Case PIC and record why' using errcode='22023'; end if;
 select * into c from public.service_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found' using errcode='22023'; end if;
 select e into prior from jsonb_array_elements(c.owner_events) e where e->>'key'=p_key::text;
 if prior is not null then
  if prior->>'to' is distinct from p_owner_id::text or prior->>'by' is distinct from auth.uid()::text or prior->>'reason' is distinct from btrim(p_reason) or (prior->>'fromRevision')::integer is distinct from p_expected_revision then raise exception 'Assignment key already used' using errcode='22023'; end if;
  return public.workspace_resolve_service_case_owner(c.id);
 end if;
 if c.owner_revision<>p_expected_revision then raise exception 'Case PIC changed. Read it again.' using errcode='40001',detail='case_pic_changed'; end if;
 if not exists(select 1 from public.app_users u where u.id=p_owner_id and u.role in('operation','principal') and public.workspace_is_person(u.id)) then raise exception 'Choose an active Operation person' using errcode='22023'; end if;
 if c.owner_user_id=p_owner_id then return public.workspace_resolve_service_case_owner(c.id); end if;
 receipt:=jsonb_build_object('key',p_key,'from',c.owner_user_id,'to',p_owner_id,'fromRevision',c.owner_revision,'by',auth.uid(),'at',now(),'reason',btrim(p_reason));
 update public.service_cases set owner_user_id=p_owner_id,owner_revision=owner_revision+1,owner_events=owner_events||jsonb_build_array(receipt) where id=c.id;
 return public.workspace_resolve_service_case_owner(c.id);
end;
$assign$;
revoke all on function public.service_case_set_pic(uuid,uuid,integer,text,uuid) from public,anon;
grant execute on function public.service_case_set_pic(uuid,uuid,integer,text,uuid) to authenticated;

create or replace function public._service_case_pic_may_decide(p_case_id uuid)
returns boolean language sql stable set search_path=public,pg_temp as $actor$
 select coalesce(public.app_role() in('operation','principal') and public.workspace_is_person(auth.uid())
  and (public.workspace_resolve_service_case_owner(p_case_id)->>'actor_user_id')::uuid=auth.uid(),false);
$actor$;
revoke all on function public._service_case_pic_may_decide(uuid) from public,anon,authenticated;

create or replace function public.service_case_remedy_read(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $read$
declare c public.service_cases%rowtype;
begin
 if public.app_role() is null or public.app_role() not in('operation','principal') then raise exception 'Not permitted' using errcode='42501'; end if;
 select * into c from public.service_cases where id=p_case_id;
 if not found then raise exception 'Case not found' using errcode='22023'; end if;
 return jsonb_build_object('caseId',c.id,'caseNo',c.case_no,'canDecide',public._service_case_pic_may_decide(p_case_id),'canPropose',public.workspace_is_person(auth.uid()),'approver',public.workspace_resolve_service_case_owner(p_case_id),
  'canAssignPic',public.workspace_is_person(auth.uid()),'ownerHistory',c.owner_events,'ownerCandidates',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name,u.id) from public.app_users u where u.role in('operation','principal') and public.workspace_is_person(u.id)),'[]'::jsonb),
  'events',c.remedy_approval_events,'evidence',c.evidence,
  'units',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'code',i.unit_code,'sku',i.sku) order by i.unit_code)
   from public.ops_stock_items i where (c.order_line_id is not null and i.reserved_order_line_id=c.order_line_id)
    or (c.order_id is not null and i.sold_order_id=c.order_id and i.sku=coalesce(c.product_sku,(select sku from public.order_lines where id=c.order_line_id)))),'[]'),
  'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.req_no,'version',r.request_version,'context',r.request_context) order by r.created_at)
   from public.purchase_requests r where r.for_service_case_id=c.id and r.purpose='service_case' and r.request_version>0 and r.request_context is not null
    and r.withdrawn_at is null and r.refused_at is null),'[]'),
  'proposals',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'payload',a.payload,'decidedAt',a.decided_at,
   'decidedBy',a.decided_by,'decidedByName',(select name from public.app_users where id=a.decided_by),'decisionReason',a.decision_note,'scopeCurrent',case when exists(select 1 from public.purchase_requests r where r.id=(a.payload#>>'{proposal,requestId}')::uuid and r.for_service_case_id=c.id and r.purpose='service_case' and r.request_context is not null and r.withdrawn_at is null and r.refused_at is null)
    then ((a.payload->'scope')-'context'-'requestVersion')=(public._service_case_remedy_scope(c.id,(a.payload#>>'{proposal,requestId}')::uuid)-'context'-'requestVersion') else false end) order by a.created_at)
   from jsonb_array_elements(c.remedy_approval_events) e join public.approvals a on a.id=(e->>'approvalId')::uuid where e->>'kind'='proposed'),'[]'));
end;
$read$;
revoke all on function public.service_case_remedy_read(uuid) from public,anon;
grant execute on function public.service_case_remedy_read(uuid) to authenticated;

create or replace function public.service_case_remedy_decide(p_case_id uuid,p_decision jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $decide$
declare c public.service_cases%rowtype; a public.approvals%rowtype; prior jsonb; proposed jsonb; request_id uuid; stamp timestamptz:=now();
begin
 if public.app_role() is null or public.app_role() not in('operation','principal') or not public.workspace_is_person(auth.uid()) then raise exception 'Not permitted' using errcode='42501'; end if;
 perform public._purchasing_context_object(p_decision,'{"approvalId":"string","status":"string","reason":"string"}');
 if p_decision->>'status' not in('approved','rejected') or (p_decision->>'status'='rejected' and btrim(p_decision->>'reason')='') then raise exception 'Give the decision and refusal reason' using errcode='22023'; end if;
 select (payload#>>'{proposal,requestId}')::uuid into request_id from public.approvals where id=(p_decision->>'approvalId')::uuid;
 perform 1 from public.purchase_requests where id=request_id for update;
 select * into c from public.service_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found' using errcode='22023'; end if;
 if not public._service_case_pic_may_decide(c.id) then raise exception 'Only this Case PIC may decide' using errcode='42501',detail='not_service_case_pic'; end if;
 select * into a from public.approvals where id=(p_decision->>'approvalId')::uuid for update;
 select e into proposed from jsonb_array_elements(c.remedy_approval_events) e where e->>'kind'='proposed' and e->>'approvalId'=a.id::text;
 if a.id is null or proposed is null or a.payload is distinct from proposed->'scope' or a.payload->>'domain'<>'service_case_remedy' then raise exception 'Case proposal not found' using errcode='22023'; end if;
 select e into prior from jsonb_array_elements(c.remedy_approval_events) e where e->>'approvalId'=a.id::text and e->>'kind' in('approved','rejected');
 if prior is not null then
  if prior->>'kind' is distinct from p_decision->>'status' then raise exception 'This proposal was already decided' using errcode='22023'; end if;
  return jsonb_build_object('id',a.id,'status',prior->>'kind','replayed',true);
 end if;
 if a.status<>'pending' then raise exception 'Use the Case decision door' using errcode='22023'; end if;
 if not exists(select 1 from public.purchase_requests where id=request_id and withdrawn_at is null and refused_at is null) then raise exception 'The request is no longer active' using errcode='22023'; end if;
 if ((a.payload->'scope')-'context'-'requestVersion') is distinct from (public._service_case_remedy_scope(c.id,request_id)-'context'-'requestVersion') then raise exception 'Case or requested goods changed. Review it again.' using errcode='40001',detail='service_scope_changed'; end if;
 if exists(select 1 from jsonb_array_elements_text(a.payload#>'{proposal,evidence}') path where not exists(select 1 from jsonb_array_elements(c.evidence) e where e->>'path'=path)
  or not exists(select 1 from storage.objects where bucket_id='service-case-evidence' and name=path)) then raise exception 'Case evidence changed' using errcode='22023',detail='service_evidence_required'; end if;
 update public.service_cases set remedy_approval_events=remedy_approval_events||jsonb_build_array(jsonb_build_object('kind',p_decision->>'status','approvalId',a.id,'requestId',request_id,'at',stamp,'by',auth.uid(),'reason',p_decision->>'reason','ownerRevision',c.owner_revision,'ownerUserId',c.owner_user_id)) where id=c.id;
 update public.approvals set status=(p_decision->>'status')::approval_status,decided_at=stamp,decided_by=auth.uid(),decision_note=nullif(p_decision->>'reason','') where id=a.id;
 return jsonb_build_object('id',a.id,'status',p_decision->>'status','replayed',false);
end;
$decide$;
revoke all on function public.service_case_remedy_decide(uuid,jsonb) from public,anon;
grant execute on function public.service_case_remedy_decide(uuid,jsonb) to authenticated;

-- Stock and PO keep their existing permissions/quantity/coverage checks. Only
-- this previously closed source boundary is replaced for modern SC requests.
