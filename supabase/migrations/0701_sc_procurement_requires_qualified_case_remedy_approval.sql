-- REVIEW DRAFT: narrow Case approval -> existing SC Purchasing execution.
-- Existing approvals store decisions; the Case retains trusted append-only binding/history.
-- No role, duty, money-settlement or cancellation permission is added.
-- One restrictive approvals SELECT policy keeps Case facts scoped to Operation/Principal.
do $preimage$
begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public._purchasing_request_context_state(uuid)'::regprocedure)<>'85a7228cdced6b259af4e76acf918eaf'
 or (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public._purchasing_context_execution_admission(uuid)'::regprocedure)<>'159f568d9ecbca6cf0330fcd38cc6ef0'
 or (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.purchasing_request_context_release()'::regprocedure)<>'b1878eee09922947f7b90e0c5b58b5cc' then
  raise exception 'SC remedy preimage changed; reconcile before applying';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='service_cases' and column_name='remedy_approval_events')
 or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname like '%service_case_remedy%') then raise exception 'SC remedy objects already exist; do not replay'; end if;
end;
$preimage$;

alter table public.service_cases add column if not exists remedy_approval_events jsonb not null default '[]'::jsonb;

create or replace function public._service_case_remedy_history_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $history$
begin
 if tg_op='DELETE' then
  if old.remedy_approval_events<>'[]' then raise exception 'Retain Case decision history' using errcode='22023'; end if;
  return old;
 end if;
 if jsonb_typeof(new.remedy_approval_events) is distinct from 'array' then raise exception 'Invalid Case decision history' using errcode='22023'; end if;
 if (tg_op='INSERT' and new.remedy_approval_events<>'[]') or
    (tg_op='UPDATE' and new.remedy_approval_events is distinct from old.remedy_approval_events) then
  if current_user<>pg_get_userbyid((select relowner from pg_class where oid='public.service_cases'::regclass)) then
   raise exception 'Use the Case decision door' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (jsonb_array_length(new.remedy_approval_events)<jsonb_array_length(old.remedy_approval_events)
    or exists(select 1 from jsonb_array_elements(old.remedy_approval_events) with ordinality e(value,n)
      where new.remedy_approval_events->(n::integer-1) is distinct from value)) then
   raise exception 'Case decision history is immutable' using errcode='22023';
  end if;
 end if;
 return new;
end;
$history$;
revoke all on function public._service_case_remedy_history_guard() from public,anon,authenticated;
create trigger service_case_remedy_history_guard before insert or update or delete on public.service_cases
for each row execute function public._service_case_remedy_history_guard();

-- Existing generic approval readers must not expose Case-only facts to other
-- internal modules. This restriction grants no new read or write permission.
create policy service_case_remedy_approval_visibility on public.approvals as restrictive
for select to authenticated using (payload->>'domain' is distinct from 'service_case_remedy'
 or public.app_role() in('operation','principal'));

create or replace function public._service_case_remedy_approval_guard()
returns trigger language plpgsql set search_path=public,pg_temp as $approval_guard$
declare decision jsonb; events jsonb;
begin
 if old.payload->>'domain' is distinct from 'service_case_remedy' then
  if tg_op='UPDATE' and new.payload->>'domain'='service_case_remedy' then raise exception 'Use the Case decision door' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
 end if;
 if tg_op='DELETE' then raise exception 'Retain Case approval history' using errcode='22023'; end if;
 if new.payload is distinct from old.payload or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
  or new.kind is distinct from old.kind or new.refers_to is distinct from old.refers_to or new.title is distinct from old.title
  or new.actor is distinct from old.actor or new.amount is distinct from old.amount or new.dealer_id is distinct from old.dealer_id
  or new.reason is distinct from old.reason then raise exception 'Case approval scope is immutable' using errcode='22023'; end if;
 select remedy_approval_events into events from public.service_cases where id=(old.payload->>'caseId')::uuid;
 select value into decision from jsonb_array_elements(events) with ordinality e(value,n)
  where value->>'approvalId'=old.id::text and value->>'kind' in('approved','rejected') order by n desc limit 1;
 if decision is null or new.status::text is distinct from decision->>'kind' or new.decided_by is distinct from (decision->>'by')::uuid
  or new.decided_at is distinct from (decision->>'at')::timestamptz or new.decided_by is distinct from auth.uid()
  or coalesce(new.decision_note,'') is distinct from coalesce(decision->>'reason','') then raise exception 'Use the Case decision door' using errcode='42501'; end if;
 return new;
end;
$approval_guard$;
revoke all on function public._service_case_remedy_approval_guard() from public,anon,authenticated;
create trigger service_case_remedy_approval_guard before update or delete on public.approvals
for each row execute function public._service_case_remedy_approval_guard();

-- Routine progress, new files and the Case updated_at clock do not change the remedy.
create or replace function public._service_case_remedy_scope(p_case uuid,p_request uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $scope$
declare c public.service_cases%rowtype; r public.purchase_requests%rowtype;
begin
 select * into r from public.purchase_requests where id=p_request for share;
 if not found or r.purpose<>'service_case' or r.for_service_case_id is distinct from p_case or r.request_version<1 or r.request_context is null
  then raise exception 'Choose a contextual request for this Case' using errcode='22023',detail='service_request_required'; end if;
 select * into strict c from public.service_cases where id=p_case for share;
 return jsonb_build_object('caseId',p_case,'requestId',r.id,'requestVersion',r.request_version,'context',r.request_context,
  'recipients',(select jsonb_agg(value-'id' order by (value-'id')::text) from jsonb_array_elements(r.request_context->'recipients')),
  'goods',(select jsonb_agg(item order by item::text) from (select jsonb_build_object('sku',line->>'sku','qty',line->'qty','attrs',line->'attrs',
   'recipients',(select jsonb_agg(jsonb_build_object('recipient',recipient-'id','qty',need->'qty') order by (recipient-'id')::text,need->>'qty')
    from jsonb_array_elements(line->'recipientNeeds') need join jsonb_array_elements(r.request_context->'recipients') recipient on recipient->>'id'=need->>'recipientId')) item
   from jsonb_array_elements(r.request_context->'lines') line) goods),
  'caseFacts',jsonb_build_object('orderId',c.order_id,'orderLineId',c.order_line_id,'sku',c.product_sku,'category',c.product_category,
   'supplierId',c.supplier_id,'action',c.carres_action,'affected',c.what_affected,'wants',c.customer_wants,'charges',c.incurred_charges));
end;
$scope$;
revoke all on function public._service_case_remedy_scope(uuid,uuid) from public,anon,authenticated;

create or replace function public._service_case_remedy_actor()
returns boolean language sql stable set search_path=public,pg_temp as $actor$
 select coalesce(public.app_role() in('operation','principal') and public.workspace_is_person(auth.uid())
  and (public.workspace_resolve_duty('service_case_approver')->>'actor_user_id')::uuid=auth.uid(),false);
$actor$;
revoke all on function public._service_case_remedy_actor() from public,anon,authenticated;

create or replace function public.service_case_remedy_read(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $read$
declare c public.service_cases%rowtype;
begin
 if public.app_role() is null or public.app_role() not in('operation','principal') then raise exception 'Not permitted' using errcode='42501'; end if;
 select * into c from public.service_cases where id=p_case_id;
 if not found then raise exception 'Case not found' using errcode='22023'; end if;
 return jsonb_build_object('caseId',c.id,'caseNo',c.case_no,'canDecide',public._service_case_remedy_actor(),'canPropose',public.workspace_is_person(auth.uid()),'approver',public.workspace_resolve_duty('service_case_approver')||jsonb_build_object('actorName',(select name from public.app_users where id=(public.workspace_resolve_duty('service_case_approver')->>'actor_user_id')::uuid),'normal_user_name',(select name from public.app_users where id=(public.workspace_resolve_duty('service_case_approver')->>'normal_user_id')::uuid),'acting_user_name',(select name from public.app_users where id=(public.workspace_resolve_duty('service_case_approver')->>'acting_user_id')::uuid)),
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

create or replace function public.service_case_remedy_propose(p_case_id uuid,p_proposal jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $propose$
declare c public.service_cases%rowtype; r public.purchase_requests%rowtype; a public.approvals%rowtype;
 scope jsonb; payload jsonb; key uuid; charge numeric; stamp timestamptz:=now();
begin
 if public.app_role() is null or public.app_role() not in('operation','principal') or not public.workspace_is_person(auth.uid()) then raise exception 'Active staff required' using errcode='42501'; end if;
 perform public._purchasing_context_object(p_proposal,'{"key":"string","requestId":"string","expectedRequestVersion":"number","affectedUnits":"array","policy":"string","policyVersion":"string","policyResult":"string","remedy":"string","movement":"string","charge":"string","amount":"number|null","payer":"string","payerAcceptance":"object|null","reason":"string","evidence":"array"}');
 key:=(p_proposal->>'key')::uuid;
 select * into r from public.purchase_requests where id=(p_proposal->>'requestId')::uuid for update;
 if not found then raise exception 'Request not found' using errcode='22023'; end if;
 select * into c from public.service_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found' using errcode='22023'; end if;
 select * into a from public.approvals where id=key;
 if found then
  if a.payload->'proposal' is distinct from p_proposal or not exists(select 1 from jsonb_array_elements(c.remedy_approval_events) e where e->>'approvalId'=key::text and e->>'kind'='proposed')
   then raise exception 'Submission key already used' using errcode='22023',detail='service_decision_key_changed'; end if;
  return jsonb_build_object('id',a.id,'status',a.status,'replayed',true);
 end if;
 scope:=public._service_case_remedy_scope(p_case_id,r.id);
 if exists(select 1 from jsonb_array_elements_text(p_proposal->'affectedUnits') unit_id where not exists(select 1 from public.ops_stock_items i where i.id=unit_id::uuid
  and ((c.order_line_id is not null and i.reserved_order_line_id=c.order_line_id) or (c.order_id is not null and i.sold_order_id=c.order_id and i.sku=coalesce(c.product_sku,(select sku from public.order_lines where id=c.order_line_id))))))
  or jsonb_array_length(p_proposal->'affectedUnits')<>(select count(distinct value) from jsonb_array_elements_text(p_proposal->'affectedUnits'))
  then raise exception 'Choose the exact Case Units' using errcode='22023',detail='service_units_changed'; end if;
 if jsonb_array_length(p_proposal->'affectedUnits')=0 and exists(select 1 from public.ops_stock_items i where (c.order_line_id is not null and i.reserved_order_line_id=c.order_line_id)
   or (c.order_id is not null and i.sold_order_id=c.order_id and i.sku=coalesce(c.product_sku,(select sku from public.order_lines where id=c.order_line_id)))) then
   raise exception 'Choose the affected Units' using errcode='22023',detail='service_units_required'; end if;
 if r.request_version is distinct from (p_proposal->>'expectedRequestVersion')::integer or r.withdrawn_at is not null or r.refused_at is not null
  then raise exception 'Request changed. Reload it.' using errcode='40001',detail='service_scope_changed'; end if;
 if btrim(p_proposal->>'policy')='' or btrim(p_proposal->>'policyVersion')='' or btrim(p_proposal->>'reason')=''
  or p_proposal->>'policyResult' not in('eligible','not_eligible')
  or p_proposal->>'remedy' not in('repair','replace','exchange','missing_parts','clean','paid_service','goodwill_exception')
  or p_proposal->>'movement' not in('replace_first','collect_first','exchange_on_collection','collect_defective_item')
  or p_proposal->>'charge' not in('free','charged') then raise exception 'Complete the remedy proposal' using errcode='22023'; end if;
 if p_proposal->>'policyResult'='not_eligible' and p_proposal->>'remedy' not in('paid_service','goodwill_exception') then raise exception 'Use the policy permitted remedy' using errcode='22023'; end if;
 charge:=(p_proposal->>'amount')::numeric;
 if p_proposal->>'charge'='charged' then
  perform public._purchasing_context_object(p_proposal->'payerAcceptance','{"by":"string","on":"string","evidence":"string"}');
  if btrim(p_proposal#>>'{payerAcceptance,by}')='' or (p_proposal#>>'{payerAcceptance,on}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or (p_proposal#>>'{payerAcceptance,on}')::date>(now() at time zone 'Asia/Kuala_Lumpur')::date
   or not (p_proposal->'evidence' @> jsonb_build_array(p_proposal#>>'{payerAcceptance,evidence}')) then
   raise exception 'Record evidenced payer acceptance, not an assumed agreement' using errcode='22023',detail='payer_acceptance_required'; end if;
 elsif p_proposal->'payerAcceptance'<>'null'::jsonb then raise exception 'Free remedy has no charged proposal acceptance' using errcode='22023'; end if;
 if (p_proposal->>'charge'='free' and (charge is not null or btrim(p_proposal->>'payer')<>''))
  or (p_proposal->>'charge'='charged' and (charge is null or charge<=0 or charge<>round(charge,2) or btrim(p_proposal->>'payer')='')) then raise exception 'Record the charge and payer' using errcode='22023'; end if;
 if jsonb_array_length(p_proposal->'evidence') not between 1 and 20 or exists(select 1 from jsonb_array_elements_text(p_proposal->'evidence') path
  where not exists(select 1 from jsonb_array_elements(c.evidence) e where e->>'path'=path)
   or not exists(select 1 from storage.objects where bucket_id='service-case-evidence' and name=path))
  then raise exception 'Choose existing Case evidence' using errcode='22023',detail='service_evidence_required'; end if;
 payload:=jsonb_build_object('domain','service_case_remedy','caseId',c.id,'proposal',p_proposal,'scope',scope);
 insert into public.approvals(id,kind,title,actor,refers_to,reason,payload,created_by)
 values(key,'other','Service Case remedy approval',public.app_role()::text,c.id::text,p_proposal->>'reason',payload,auth.uid());
 update public.service_cases set remedy_approval_events=remedy_approval_events||jsonb_build_array(jsonb_build_object('kind','proposed','approvalId',key,'requestId',r.id,'at',stamp,'by',auth.uid(),'scope',payload)) where id=c.id;
 return jsonb_build_object('id',key,'status','pending','replayed',false);
end;
$propose$;
revoke all on function public.service_case_remedy_propose(uuid,jsonb) from public,anon;
grant execute on function public.service_case_remedy_propose(uuid,jsonb) to authenticated;

create or replace function public.service_case_remedy_decide(p_case_id uuid,p_decision jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $decide$
declare c public.service_cases%rowtype; a public.approvals%rowtype; prior jsonb; proposed jsonb; request_id uuid; stamp timestamptz:=now();
begin
 if not public._service_case_remedy_actor() then raise exception 'Only the Service Case Approver may decide' using errcode='42501',detail='not_service_case_approver'; end if;
 perform public._purchasing_context_object(p_decision,'{"approvalId":"string","status":"string","reason":"string"}');
 if p_decision->>'status' not in('approved','rejected') or (p_decision->>'status'='rejected' and btrim(p_decision->>'reason')='') then raise exception 'Give the decision and refusal reason' using errcode='22023'; end if;
 select (payload#>>'{proposal,requestId}')::uuid into request_id from public.approvals where id=(p_decision->>'approvalId')::uuid;
 perform 1 from public.purchase_requests where id=request_id for update;
 select * into c from public.service_cases where id=p_case_id for update;
 if not found then raise exception 'Case not found' using errcode='22023'; end if;
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
 update public.service_cases set remedy_approval_events=remedy_approval_events||jsonb_build_array(jsonb_build_object('kind',p_decision->>'status','approvalId',a.id,'requestId',request_id,'at',stamp,'by',auth.uid(),'reason',p_decision->>'reason')) where id=c.id;
 update public.approvals set status=(p_decision->>'status')::approval_status,decided_at=stamp,decided_by=auth.uid(),decision_note=nullif(p_decision->>'reason','') where id=a.id;
 return jsonb_build_object('id',a.id,'status',p_decision->>'status','replayed',false);
end;
$decide$;
revoke all on function public.service_case_remedy_decide(uuid,jsonb) from public,anon;
grant execute on function public.service_case_remedy_decide(uuid,jsonb) to authenticated;

-- Stock and PO keep their existing permissions/quantity/coverage checks. Only
-- this previously closed source boundary is replaced for modern SC requests.
create or replace function public._purchasing_context_execution_admission(p_request uuid)
returns void language plpgsql set search_path=public,pg_temp as $execution$
declare r public.purchase_requests%rowtype; c public.service_cases%rowtype; a public.approvals%rowtype; proposed jsonb; decided jsonb;
begin
 select * into strict r from public.purchase_requests where id=p_request for share;
 if r.purpose<>'service_case' or (r.request_version<1 and r.request_context is null) then return; end if;
 select * into strict c from public.service_cases where id=r.for_service_case_id for share;
 select e.value into proposed from jsonb_array_elements(c.remedy_approval_events) with ordinality e(value,n)
  where value->>'kind'='proposed' and value->>'requestId'=r.id::text order by n desc limit 1;
 select * into a from public.approvals where id=(proposed->>'approvalId')::uuid;
 select e into decided from jsonb_array_elements(c.remedy_approval_events) e where e->>'approvalId'=a.id::text and e->>'kind'='approved';
 if proposed is null or decided is null or a.status<>'approved' or a.payload is distinct from proposed->'scope'
  or a.decided_by is distinct from (decided->>'by')::uuid or a.decided_at is distinct from (decided->>'at')::timestamptz
  or ((a.payload->'scope')-'context'-'requestVersion') is distinct from (public._service_case_remedy_scope(c.id,r.id)-'context'-'requestVersion') then
  raise exception 'The Service Case remedy needs approval for these goods' using errcode='22023',detail='service_remedy_approval_required';
 end if;
 if exists(select 1 from jsonb_array_elements_text(a.payload#>'{proposal,evidence}') path where not exists(select 1 from jsonb_array_elements(c.evidence) e where e->>'path'=path)
  or not exists(select 1 from storage.objects where bucket_id='service-case-evidence' and name=path)) then raise exception 'Case evidence changed' using errcode='22023',detail='service_evidence_required'; end if;
end;
$execution$;
revoke all on function public._purchasing_context_execution_admission(uuid) from public,anon,authenticated;

-- Preserve the already-approved evidence snapshot when routine Case files are added.
-- Execution separately requires every actually-approved remedy evidence object to remain present.
create or replace function public._purchasing_request_context_state(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $state$
declare r public.purchase_requests%rowtype; expected jsonb; actual jsonb; facts jsonb; case_source jsonb; supplier_plan jsonb; forecast_sources jsonb; forecast_mark public.forecast_purchase_requests%rowtype;
begin
  select * into r from public.purchase_requests where id=p_id for update;
  if not found then raise exception 'unknown request' using errcode='22023',detail='unknown_request'; end if;
  if r.request_version<1 or r.request_context is null then raise exception 'no contextual scope' using errcode='22023',detail='context_unavailable'; end if;
  perform public._purchasing_validate_request_context(r.request_context);
  supplier_plan:=public._purchasing_check_context_supplier_dates(r.request_context);
  if r.request_context->>'origin'='forecast_suggestion' then
    select * into forecast_mark from public.forecast_purchase_requests where request_id=r.id for share;
    if not found or forecast_mark.created_by is distinct from r.created_by then raise exception 'forecast source mark unavailable' using errcode='22023',detail='forecast_source_required'; end if;
    select jsonb_agg(source order by source->>'sku') into forecast_sources from (select distinct l#>'{basis,source_snapshot}' source from jsonb_array_elements(forecast_mark.lines) l) q;
    forecast_sources:=public._purchasing_check_context_forecast_source(r.request_context,forecast_sources,r.id);
  elsif exists(select 1 from public.forecast_purchase_requests where request_id=r.id) then
    raise exception 'request origin disagrees with forecast mark' using errcode='22023',detail='forecast_source_changed';
  end if;
  if r.purpose is distinct from r.request_context->>'purpose' or r.proceed_date is distinct from (r.request_context->>'proceedDate')::date
    or r.for_service_case_id is distinct from (r.request_context->>'serviceCaseId')::uuid then
    raise exception 'request header changed' using errcode='22023',detail='request_scope_changed';
  end if;
  if r.approval_required is distinct from true or r.fulfilment_intent is distinct from
    (case when r.purpose='ready_stock' then 'additional_stock' else 'concrete_need' end)
    or r.required_by is distinct from (case when r.purpose='ready_stock' then (r.request_context->>'stockDeliveryDate')::date else
      (select min((x->>'deliveryDate')::date) from jsonb_array_elements(r.request_context->'recipients') x) end)
    or r.destination_id is distinct from coalesce(
      (select (a->>'destinationId')::uuid from jsonb_array_elements(r.request_context->'lines') l cross join lateral jsonb_array_elements(l->'allocations') a limit 1),
      (select (a->>'destinationId')::uuid from jsonb_array_elements(r.request_context->'lines') l cross join lateral jsonb_array_elements(l->'stockProposals') a limit 1)) then
    raise exception 'request material header changed' using errcode='22023',detail='request_scope_changed';
  end if;
  perform 1 from public.purchase_demands where request_id=p_id order by id for update;
  -- Exact owning Case facts, not a guessed first Sales Order item. This
  -- snapshots source drift only; formal Case procurement admission remains open.
  if r.purpose='service_case' then
    select jsonb_build_object('id',sc.id,'case_no',sc.case_no,'order_id',sc.order_id,'order_line_id',sc.order_line_id,
      'product_sku',sc.product_sku,'product_category',sc.product_category,'supplier_id',sc.supplier_id,
      'carres_action',sc.carres_action,'what_affected',sc.what_affected,'customer_wants',sc.customer_wants,'evidence',case when r.approval_version=r.request_version then coalesce(r.approval_scope#>'{service_case_source,evidence}',sc.evidence) else sc.evidence end)
      into strict case_source from public.service_cases sc where sc.id=r.for_service_case_id for share;
  end if;

  with projected as (
    select l, a, 'purchase'::text as kind from jsonb_array_elements(r.request_context->'lines') l cross join lateral jsonb_array_elements(l->'allocations') a
    union all
    select l, a, 'stock_proposal'::text from jsonb_array_elements(r.request_context->'lines') l cross join lateral jsonb_array_elements(l->'stockProposals') a
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'line',(l->>'id')::uuid,'allocation',(a->>'id')::uuid,'kind',kind,'sku',l->>'sku','qty',(a->>'qty')::int,
    'attrs',nullif(nullif(l->'attrs','null'::jsonb),'{}'::jsonb),'destination',(a->>'destinationId')::uuid,
    'date',case when kind='purchase' then a->>'supplierDeliveryDate' else
      case when r.purpose='ready_stock' then r.request_context->>'stockDeliveryDate' else
        (select min(x->>'deliveryDate') from jsonb_array_elements(r.request_context->'recipients') x) end end
  ) order by (l->>'id')::uuid,(a->>'id')::uuid),'[]') into expected from projected;
  select coalesce(jsonb_agg(jsonb_build_object(
    'line',d.request_line_id,'allocation',coalesce(d.supplier_allocation_id,d.stock_proposal_id),'kind',d.fulfilment_kind,
    'sku',d.sku,'qty',d.qty,'attrs',d.attrs,'destination',d.destination_id,'date',d.required_by
  ) order by d.request_line_id,coalesce(d.supplier_allocation_id,d.stock_proposal_id)),'[]') into actual
  from public.purchase_demands d where d.request_id=p_id and d.cancelled_at is null;
  if expected<>actual then raise exception 'demand allocation changed' using errcode='22023',detail='request_scope_changed'; end if;
  if exists(select 1 from public.purchase_demands d left join public.product_skus s on s.sku=d.sku
    where d.request_id=p_id and d.cancelled_at is null and (s.sku is null or s.supplier_id is distinct from d.supplier_id)) then
    raise exception 'catalog supplier changed' using errcode='22023',detail='request_source_changed';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'request_line_id',request_line_id,
    'supplier_allocation_id',supplier_allocation_id,'stock_proposal_id',stock_proposal_id,'fulfilment_kind',fulfilment_kind,
    'sku',sku,'attrs',attrs,'supplier_id',supplier_id,'destination_id',destination_id,'required_by',required_by,
    'qty',qty,'approved_qty',approved_qty) order by id),'[]') into facts
  from public.purchase_demands where request_id=p_id and cancelled_at is null;
  return jsonb_build_object('version',1,'request_id',r.id,'request_version',r.request_version,
    'requester_id',r.created_by,'created_at',r.created_at,'purpose',r.purpose,'proceed_date',r.proceed_date,'context',r.request_context,'service_case_source',case_source,'supplier_plan',supplier_plan,'forecast_source',case when forecast_sources is null then null else jsonb_build_object('week',forecast_mark.forecast_week,'submission_key',forecast_mark.submission_key,'sources',forecast_sources) end,'demands',facts);
end;
$state$;
revoke all on function public._purchasing_request_context_state(uuid) from public,anon,authenticated;

-- Report only this exact qualified-source execution implementation as available.
create or replace function public.purchasing_request_context_release()
returns jsonb language plpgsql security definer stable set search_path=public,pg_temp as $release_state$
begin
 if auth.uid() is null or public.app_role() is null or public.app_role() not in ('operation','principal') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return jsonb_build_object('version',1,'requestFlow',
  (select md5(replace(prosrc,chr(13),''))='7b1ef2badb1935730e9f2c31d5f186de' from pg_proc where oid='public._purchasing_context_writer_admission()'::regprocedure),
  'cancellation',false,'serviceExecution',(select md5(replace(prosrc,chr(13),''))='de8e074d7720f1e2e6a93eef7117bc73' from pg_proc where oid='public._purchasing_context_execution_admission(uuid)'::regprocedure));
end;
$release_state$;
revoke all on function public.purchasing_request_context_release() from public,anon;
grant execute on function public.purchasing_request_context_release() to authenticated;
