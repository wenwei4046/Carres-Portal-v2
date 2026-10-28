-- REVIEW DRAFT ONLY. Exact cancellation portion extracted from the unchanged original owner-lane combined draft.
-- No Case PIC columns, trigger, resolver, assignment or remedy decision changes. Modern contextual MPR scope only; Finance remains not_connected.
-- DRAFT: proposed contextual cancellation activation, NOT APPROVED / NOT APPLIED.
-- Readiness API deployed at682ed94a; Finance consumer remains not_connected.
-- Exact approval must expressly cover opening cancellation while that connection is pending.
-- Existing supplier evidence/fee/receipt/quantity/source/exception guards stay intact.
do $cancel_activation_preimage$
begin
 if (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public._purchasing_context_cancellation_admission()'::regprocedure)<>'632be3171a4784b0edd1ee9dd578028f'
 or (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.purchasing_request_context_release()'::regprocedure)<>'4252ef9a59d535251dae92978e642d98'
 or (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.operation_cancel_po(text,text,jsonb)'::regprocedure)<>'b0ea623fa704c0c1443a975666cb4e33'
 or (select md5(replace(prosrc,chr(13),'')) from pg_proc where oid='public.purchasing_po_cancellation_facts(text)'::regprocedure)<>'bfa80a455d6f0cfb4b347b7bb29ad334' then raise exception 'Cancellation activation source changed; reconcile before applying'; end if;
end;
$cancel_activation_preimage$;
-- Missing prior approval is FALSE, never SQL NULL; this keeps fee/disagreement/shipping exceptions closed.
create or replace function public.operation_cancel_po(p_po_id text,p_reason text,p_cancellation jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $effective_cancel$
#variable_conflict use_column
declare who jsonb; po public.purchase_orders%rowtype; prior public.po_goods_cancellation_events%rowtype; replay public.po_goods_cancellation_events%rowtype;
 command jsonb:=jsonb_build_object('poId',p_po_id,'reason',p_reason,'cancellation',p_cancellation);
 action text; facts jsonb; scope jsonb; line jsonb; src jsonb; rc jsonb; rec record; pl public.purchase_order_lines%rowtype;
 d public.purchase_demands%rowtype; request public.purchase_requests%rowtype; key uuid; v_request_id uuid; version integer;
 quantity integer; total integer; n integer; existing integer; units uuid[]:='{}'; selected_units uuid[]:='{}'; item uuid;
 ordinary boolean; exceptional boolean; kind text; actor uuid:=auth.uid(); role public.app_role; request_actor uuid;
 v_snapshot jsonb; next_po_version integer; request_uuid uuid; decision text; existing_kind text;
begin
 perform public._purchasing_context_cancellation_admission();
 perform public._purchasing_context_writer_admission();
 who:=public.purchasing_supplier_reply_actor();
 if (who->>'allowed')::boolean is not true or not public.workspace_is_person(auth.uid()) then raise exception 'active authorised staff required' using errcode='42501'; end if;
 role:=public.app_role();
 if coalesce(p_reason,'') !~ '[^[:space:]]' then raise exception 'reason required' using errcode='22023',detail='reason_required'; end if;
 perform public._purchasing_context_object(p_cancellation,'{"action":"string","key":"string","requestId":"string","expectedRequestVersion":"number","expectedPoVersion":"number","lines":"array","supplierFacts":"object","decisionReason":"string"}');
 key:=(p_cancellation->>'key')::uuid;v_request_id:=(p_cancellation->>'requestId')::uuid;action:=p_cancellation->>'action';
 if action not in('record','complete','approve_exception','refuse_exception') then raise exception 'unknown cancellation action' using errcode='22023',detail='invalid_param'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('purchasing.cancellation:'||v_request_id::text,0)) then raise exception 'cancellation changed' using errcode='40001',detail='request_coverage_changed'; end if;
 select * into replay from public.po_goods_cancellation_events where id=key;
 if found then
  if replay.command is distinct from command then raise exception 'cancellation key reused' using errcode='22023',detail='request_key_changed'; end if;
  return jsonb_build_object('id',replay.id,'requestVersion',replay.request_version,'state',replay.kind,'poVersion',replay.applied_po_version,'replayed',true);
 end if;
 perform public._purchasing_context_source_locks(array(select distinct sku from public.purchase_order_lines where po_id=p_po_id));
 for request_uuid in select distinct d.request_id from public.purchase_order_lines l cross join lateral public._purchasing_po_request_sources(l.id) s join public.purchase_demands d on d.id=s.demand_id where l.po_id=p_po_id order by 1 loop
  perform 1 from public.purchase_requests where id=request_uuid for update nowait;
 end loop;
 select * into po from public.purchase_orders where id=p_po_id for update;
 if not found then raise exception 'PO not found' using errcode='22023',detail='po_not_found'; end if;
 if po.status<>'open' or po.version is distinct from (p_cancellation->>'expectedPoVersion')::integer then raise exception 'current open PO version required' using errcode='40001',detail='stale_po_version'; end if;
 select * into prior from public.po_goods_cancellation_events e where e.request_id=v_request_id order by request_version desc limit 1;
 if prior.id is not null and (prior.po_id<>p_po_id or prior.kind='effective') then raise exception 'cancellation already effective or foreign' using errcode='22023',detail='cancellation_scope_changed'; end if;
 if coalesce(prior.request_version,0)<>(p_cancellation->>'expectedRequestVersion')::integer then raise exception 'cancellation changed' using errcode='40001',detail='cancellation_scope_changed'; end if;
 version:=coalesce(prior.request_version,0)+1;scope:=p_cancellation->'lines';facts:=p_cancellation->'supplierFacts';
 perform public._purchasing_context_object(facts,'{"supplierStatement":"string","fee":"string","shipped":"boolean|null","evidence":"array"}');
 if facts->>'supplierStatement' not in('awaiting','agreed','unable_to_supply','disagreed') or facts->>'fee' not in('yes','no','not_confirmed')
  or exists(select 1 from jsonb_array_elements(facts->'evidence') x where jsonb_typeof(x)<>'string' or btrim(x#>>'{}')='') then raise exception 'invalid supplier facts' using errcode='22023',detail='invalid_param'; end if;
 if jsonb_array_length(facts->'evidence')>20 or exists(select 1 from jsonb_array_elements_text(facts->'evidence') path where length(path)>2000 or left(path,length(p_po_id)+1) is distinct from p_po_id||'/' or not exists(select 1 from storage.objects where bucket_id='delivery-orders' and name=path)) then
  raise exception 'Use uploaded supplier evidence belonging to this PO' using errcode='22023',detail='reply_evidence_required'; end if;
 if jsonb_array_length(scope)=0 or jsonb_array_length(scope)<>(select count(distinct x->>'lineId') from jsonb_array_elements(scope) x) then raise exception 'exact cancellation lines required' using errcode='22023',detail='invalid_param'; end if;
 -- Validate ALL affected facts before recording an event or changing a Unit.
 for line in select * from jsonb_array_elements(scope) loop
  perform public._purchasing_context_object(line,'{"lineId":"string","qty":"number","receivedQty":"number","unitIds":"array","sources":"array"}');
  select * into pl from public.purchase_order_lines where id=(line->>'lineId')::uuid and po_id=p_po_id for update;
  quantity:=(line->>'qty')::integer;
  if not found or quantity<1 or pl.received_qty is distinct from (line->>'receivedQty')::integer
   or quantity>public._purchasing_po_line_pending_qty(pl.id) then raise exception 'outstanding receipt scope changed' using errcode='40001',detail='cancellation_receipt_changed'; end if;
  if jsonb_array_length(line->'sources')=0 or jsonb_array_length(line->'sources')<>(select count(distinct x->>'demandId') from jsonb_array_elements(line->'sources') x)
   or exists(select 1 from public.po_line_sources where po_line_id=pl.id and order_id is not null) then raise exception 'exact MPR source scope required' using errcode='22023',detail='request_source_allocation_required'; end if;
  total:=0;selected_units:='{}';
  for src in select * from jsonb_array_elements(line->'sources') loop
   perform public._purchasing_context_object(src,'{"demandId":"string","qty":"number","recipients":"array"}');
   select pd.* into d from public.purchase_demands pd where pd.id=(src->>'demandId')::uuid for update;
   if not found or not exists(select 1 from public._purchasing_po_request_active_sources(pl.id) s where s.demand_id=d.id and s.qty>=(src->>'qty')::integer)
    or (src->>'qty')::integer<1 then raise exception 'source commitment changed' using errcode='40001',detail='request_po_coverage_changed'; end if;
   select * into strict request from public.purchase_requests where id=d.request_id;
   if request.request_version<1 then raise exception 'qualified contextual source required' using errcode='22023',detail='request_source_allocation_required'; end if;
   total:=total+(src->>'qty')::integer;
   if request.purpose='ready_stock' then
    if src->'recipients'<>'[]'::jsonb then raise exception 'RS has no final recipient' using errcode='22023',detail='invalid_issue_distribution'; end if;
   elsif (select coalesce(sum((rc->>'qty')::integer),0) from jsonb_array_elements(src->'recipients') rc)<>(src->>'qty')::integer
    or jsonb_array_length(src->'recipients')<>(select count(distinct rc->>'recipientId') from jsonb_array_elements(src->'recipients') rc) then raise exception 'exact cancelled recipients required' using errcode='22023',detail='invalid_issue_distribution'; end if;
   for rc in select * from jsonb_array_elements(src->'recipients') loop
    perform public._purchasing_context_object(rc,'{"recipientId":"string","qty":"number"}');
    if (rc->>'qty')::integer<1 then raise exception 'invalid cancelled recipient' using errcode='22023',detail='invalid_issue_distribution'; end if;
   end loop;
   if pl.identity_mode='exact_unit' then
    select coalesce(array_agg(i.id order by i.id),'{}') into selected_units from public.ops_stock_items i where i.id in(select x::uuid from jsonb_array_elements_text(line->'unitIds') x)
     and i.po_line_id=pl.id and i.status='incoming' and public._purchasing_context_unit_demand(i.id)=d.id;
    if cardinality(selected_units)<>(src->>'qty')::integer then raise exception 'selected Units are not unreceived source Units' using errcode='40001',detail='cancellation_unit_changed'; end if;
   elsif pl.identity_mode='quantity' then
    if line->'unitIds'<>'[]'::jsonb then raise exception 'counted goods have no Unit IDs' using errcode='22023',detail='invalid_param'; end if;
    if pl.received_qty>0 and (select count(*) from public._purchasing_po_request_sources(pl.id))<>1 then raise exception 'received counted source attribution required' using errcode='22023',detail='request_source_receipt_scope_required'; end if;
   else raise exception 'identity mode unavailable' using errcode='22023',detail='catalog_identity_mode_missing'; end if;
  end loop;
  if total<>quantity then raise exception 'source total differs from cancellation' using errcode='22023',detail='request_source_allocation_required'; end if;
  if pl.identity_mode='exact_unit' then
   if jsonb_array_length(line->'unitIds')<>quantity or jsonb_array_length(line->'unitIds')<>(select count(distinct x) from jsonb_array_elements_text(line->'unitIds') x) then raise exception 'exact selected Units required' using errcode='22023',detail='cancellation_unit_changed'; end if;
   for item in select x::uuid from jsonb_array_elements_text(line->'unitIds') x order by 1 loop
    perform 1 from public.ops_stock_items where id=item and status='incoming' for update nowait;
    if not found then raise exception 'selected Unit receipt changed' using errcode='40001',detail='cancellation_unit_changed'; end if;
    units:=array_append(units,item);
   end loop;
  end if;
 end loop;
 for rec in select s->>'demandId' demand_id,rc->>'recipientId' recipient_id,sum((rc->>'qty')::integer) qty from jsonb_array_elements(scope) l cross join lateral jsonb_array_elements(l->'sources') s cross join lateral jsonb_array_elements(s->'recipients') rc group by 1,2 loop
  if not exists(select 1 from jsonb_array_elements(public._purchasing_po_issued_recipients(p_po_id,rec.demand_id::uuid)) rc where rc->>'recipientId'=rec.recipient_id and (rc->>'qty')::integer>=rec.qty) then raise exception 'recipient cancellation exceeds this PO coverage' using errcode='22023',detail='invalid_issue_distribution'; end if;
 end loop;
 -- Canonical sets keep equivalent reviewed source order from becoming a
 -- different commercial scope; object key order is already canonical JSONB.
 select jsonb_agg(jsonb_set(jsonb_set(l,'{unitIds}',(select coalesce(jsonb_agg(u order by u),'[]') from jsonb_array_elements(l->'unitIds') u)),'{sources}',(select jsonb_agg(jsonb_set(src,'{recipients}',(select coalesce(jsonb_agg(rc order by rc->>'recipientId'),'[]') from jsonb_array_elements(src->'recipients') rc)) order by src->>'demandId') from jsonb_array_elements(l->'sources') src)) order by l->>'lineId') into scope from jsonb_array_elements(scope) l;
 ordinary:=facts->>'supplierStatement' in('agreed','unable_to_supply') and facts->>'fee'='no' and facts->'shipped'='false'::jsonb and jsonb_array_length(facts->'evidence')>0;
 exceptional:=facts->>'supplierStatement'='disagreed' or facts->>'fee'='yes' or facts->'shipped'='true'::jsonb;
 kind:='pending';
 if action in('approve_exception','refuse_exception') then
  perform public.purchasing_approver_gate();
  select actor_id into request_actor from public.po_goods_cancellation_events e where e.request_id=v_request_id order by request_version limit 1;
  if prior.id is null or prior.kind<>'pending' or not exceptional or prior.scope is distinct from scope or prior.supplier_facts is distinct from facts or prior.reason is distinct from p_reason then raise exception 'exact pending exception required' using errcode='22023',detail='cancellation_scope_changed'; end if;
  if actor=request_actor or actor=prior.actor_id then raise exception 'requester cannot approve own exception' using errcode='42501',detail='own_request'; end if;
  if btrim(p_cancellation->>'decisionReason')='' then raise exception 'decision reason required' using errcode='22023',detail='reason_required'; end if;
  if action='approve_exception' and (jsonb_array_length(facts->'evidence')=0 or facts->>'fee'='not_confirmed' or facts->>'supplierStatement'='awaiting') then raise exception 'exception evidence is incomplete' using errcode='22023',detail='cancellation_not_effective'; end if;
  kind:=case when action='approve_exception' then 'exception_approved' else 'exception_refused' end;
 elsif action='complete' then
  if not ordinary and not coalesce((exceptional and prior.kind='exception_approved' and prior.scope=scope and prior.supplier_facts=facts and prior.reason=p_reason and prior.expected_po_version=po.version
    and facts->>'fee'<>'not_confirmed' and facts->>'supplierStatement'<>'awaiting' and jsonb_array_length(facts->'evidence')>0),false) then
   raise exception 'Supplier facts or qualified commercial decision are incomplete' using errcode='22023',detail='cancellation_not_effective'; end if;
  kind:='effective';next_po_version:=po.version+1;
 end if;
 insert into public.po_goods_cancellation_events(id,request_id,request_version,po_id,expected_po_version,kind,reason,decision_reason,scope,supplier_facts,actor_id,command,applied_po_version)
 values(key,v_request_id,version,p_po_id,po.version,kind,p_reason,nullif(btrim(p_cancellation->>'decisionReason'),''),scope,facts,actor,command,next_po_version);
 if kind='effective' then
  select jsonb_build_object('eta_date',po.eta_date,'destination_id',po.destination_id,'lines',(select jsonb_agg(jsonb_build_object('sku',l.sku,'qty',l.qty,'destination_id',l.destination_id,'cancelled_qty',public._purchasing_po_line_cancelled_qty(l.id)-coalesce((select (x->>'qty')::integer from jsonb_array_elements(scope) x where x->>'lineId'=l.id::text),0)) order by l.sku,l.id) from public.purchase_order_lines l where po_id=p_po_id)) into v_snapshot;
  insert into public.po_revisions(po_id,rev_no,snapshot,reason,created_by) select p_po_id,coalesce(max(rev_no),0)+1,v_snapshot,p_reason,actor from public.po_revisions where po_id=p_po_id;
  update public.ops_stock_items set status='voided',updated_at=now() where id=any(units);
  for rec in select distinct (s->>'demandId')::uuid id from jsonb_array_elements(scope) l cross join lateral jsonb_array_elements(l->'sources') s loop
   update public.purchase_demands pd set issued_qty=(select coalesce(sum(s.qty),0) from public.purchase_order_lines l join public.purchase_orders p on p.id=l.po_id cross join lateral public._purchasing_po_request_active_sources(l.id) s where s.demand_id=pd.id and p.status<>'cancelled') where pd.id=rec.id;
  end loop;
  update public.purchase_orders set version=next_po_version,revised_at=now(),updated_at=now(),status=case
   when not exists(select 1 from public.purchase_order_lines l where l.po_id=p_po_id and public._purchasing_po_line_pending_qty(l.id)>0)
     and not exists(select 1 from public.purchase_order_lines l where l.po_id=p_po_id and l.received_qty>0) then 'cancelled' else status end where id=p_po_id;
 end if;
 insert into public.po_history(po_id,text,by_role,by_user_id) values(p_po_id,format('Cancellation %s · %s · %s',kind,v_request_id,p_reason),role,actor);
 insert into public.audit_log(role,actor_text,action,ref) values(role,(select name from public.app_users where id=actor),format('PO cancellation %s · %s',v_request_id,kind),p_po_id);
 return jsonb_build_object('id',key,'requestVersion',version,'state',kind,'poVersion',next_po_version,'replayed',false);
exception when lock_not_available then raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='cancellation_receipt_changed';
end;
$effective_cancel$;

create or replace function public._purchasing_context_cancellation_admission()
returns void language plpgsql set search_path=public,pg_temp as $cancellation_open$
begin return; end;
$cancellation_open$;
revoke all on function public._purchasing_context_cancellation_admission() from public,anon,authenticated;

create or replace function public.purchasing_request_context_release()
returns jsonb language plpgsql security definer stable set search_path=public,pg_temp as $release_state$
begin
 if auth.uid() is null or public.app_role() is null or public.app_role() not in ('operation','principal') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return jsonb_build_object('version',1,'requestFlow',
  (select md5(replace(prosrc,chr(13),''))='7b1ef2badb1935730e9f2c31d5f186de' from pg_proc where oid='public._purchasing_context_writer_admission()'::regprocedure),
  'cancellation',(select md5(replace(prosrc,chr(13),''))='7b1ef2badb1935730e9f2c31d5f186de' from pg_proc where oid='public._purchasing_context_cancellation_admission()'::regprocedure) and (select md5(replace(prosrc,chr(13),''))='8160bed0631b86994db6cbba3549a259' from pg_proc where oid='public.operation_cancel_po(text,text,jsonb)'::regprocedure),'serviceExecution',(select md5(replace(prosrc,chr(13),''))='de8e074d7720f1e2e6a93eef7117bc73' from pg_proc where oid='public._purchasing_context_execution_admission(uuid)'::regprocedure));
end;
$release_state$;
revoke all on function public.purchasing_request_context_release() from public,anon;
grant execute on function public.purchasing_request_context_release() to authenticated;
