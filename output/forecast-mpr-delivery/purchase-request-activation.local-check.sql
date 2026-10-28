-- OWNED LOCAL TEST ONLY; all activation/fixtures roll back. Never production.
\set ON_ERROR_STOP on
begin;
-- REVIEW DRAFT ONLY: no approval, migration, application or activation inferred.
-- Exact companion to writer475a87f...58e8f1 and Settingsb4eb234d...8053774.
-- Enables contextual GP/RS execution and all three request/review flows.
-- Contextual cancellation remains closed pending its mandatory Finance handoff.
-- NEW contextual SC draft/submission/procurement review stays available; stock/PO
-- execution is unavailable until a REAL qualified Service-source binding exists.
-- No synthetic generic-approval payload is declared a business contract. Existing
-- authorised unchanged legacy SC procurement/Stock/PO doors remain unchanged.
-- Therefore FULL SC delivery remains explicitly INCOMPLETE, not redefined as GP/RS.
-- No RLS/Storage change, role grant, business write, supplier send or Task completion.
-- Recovery: close the private request admission through a reviewed reverse patch;
-- retain records and helpers. Never rerun the closed installation after activation.
do $activation_preimages$
declare item jsonb; actual text;
begin
 for item in select * from jsonb_array_elements('[{"signature":"_purchasing_context_issue_admission(uuid, integer)","md5":"09ca8df4e75fd2a6c6155f321b149887"},{"signature":"_purchasing_context_issue_preflight(jsonb)","md5":"f380e1ae96bb0488b3c5ffa2f66c3dfd"},{"signature":"_purchasing_context_writer_admission()","md5":"799b52f12579bdf2fd9a7b95285b6508"},{"signature":"operation_cancel_po(text, text, jsonb)","md5":"0656f26250b23327f20c2a3f123ce60b"},{"signature":"ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid, uuid)","md5":"0c61156c1df3028b776da794b8db4a3d"},{"signature":"purchasing_allocate_ready_units(uuid, uuid[], uuid[])","md5":"088f5eb7630cc9f7889b9b480c90f0d4"}]'::jsonb) loop
  select md5(replace(prosrc,chr(13),'')) into actual from pg_proc where oid=to_regprocedure('public.'||(item->>'signature'));
  if actual is distinct from item->>'md5' then raise exception 'Activation source changed: %',item->>'signature' using errcode='55000'; end if;
 end loop;
end;
$activation_preimages$;

create or replace function public._purchasing_context_cancellation_admission()
returns void language plpgsql set search_path=public,pg_temp as $cancellation_closed$
begin raise exception 'Not available' using errcode='55000',detail='cancellation_not_released'; end;
$cancellation_closed$;
revoke all on function public._purchasing_context_cancellation_admission() from public,anon,authenticated;

-- An availability boundary, not a new approval or permanent business ban. No
-- supported historical producer/consumer tuple has yet proved a new SC execution.
-- Do not accept arbitrary Case text, attachment presence or TEST payload as proof.
create or replace function public._purchasing_context_execution_admission(p_request uuid)
returns void language plpgsql set search_path=public,pg_temp as $execution_admission$
declare r public.purchase_requests%rowtype;
begin
 select * into strict r from public.purchase_requests where id=p_request for share;
 if (r.request_version>0 or r.request_context is not null) and r.purpose='service_case' then
  raise exception 'Not available' using errcode='55000',detail='service_case_execution_source_unverified';
 end if;
end;
$execution_admission$;
revoke all on function public._purchasing_context_execution_admission(uuid) from public,anon,authenticated;

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
  if not ordinary and not (exceptional and prior.kind='exception_approved' and prior.scope=scope and prior.supplier_facts=facts and prior.reason=p_reason and prior.expected_po_version=po.version
    and facts->>'fee'<>'not_confirmed' and facts->>'supplierStatement'<>'awaiting' and jsonb_array_length(facts->'evidence')>0) then
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

CREATE OR REPLACE FUNCTION public.purchasing_allocate_ready_units(p_demand_id uuid, p_item_ids uuid[], p_expected_item_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role    text := (select public.app_role());
  v_demand  record;
  v_req     record;
  v_want    uuid[] := coalesce(p_item_ids, '{}'::uuid[]);
  v_count   int    := coalesce(array_length(coalesce(p_item_ids, '{}'::uuid[]), 1), 0);
  v_have    uuid[];
  v_add     uuid[];
  v_drop    uuid[];
  v_item    uuid;
  v_drawn   uuid;
  v_state   text;
  v_word    text;
  v_detail  text;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the stock register is an operation surface';
  end if;
  -- 0547: the COALESCED count, so an empty set is 0 rather than NULL here too.
  if v_count > 50 then
    raise exception 'too_many_units' using errcode = '22023',
      detail = 'choose at most 50 Units in one act';
  end if;
  -- A repeated Unit in one save would draw it twice and count it twice.
  -- 0547: compared as 0 against 0 when the set is empty. Removing every Unit
  -- is the act that frees a line and it is never a duplicate of anything.
  if v_count is distinct from
     (select count(distinct u)::int from unnest(v_want) u) then
    raise exception 'duplicate_unit_chosen' using errcode = '22023';
  end if;

  if exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id
    where d.id=p_demand_id and (r.request_version>0 or r.request_context is not null)) then
    if cardinality(v_want)>0 then perform public._purchasing_context_execution_admission((select request_id from public.purchase_demands where id=p_demand_id)); end if;
    perform public._purchasing_context_stock_admission(p_demand_id,v_want,true);
  end if;

  -- ── LOCK ORDER: request → demand → unit (the issue door's own order) ────
  select d.id, d.request_id, d.sku, d.qty, d.approved_qty, d.issued_qty, d.cancelled_at
    into v_demand
    from purchase_demands d
   where d.id = p_demand_id;
  if not found then
    raise exception 'mpr_line_not_found' using errcode = '22023';
  end if;
  if v_demand.request_id is null then
    raise exception 'mpr_line_has_no_request' using errcode = '22023';
  end if;

  select r.id, r.req_no, r.approved_at, r.refused_at, r.withdrawn_at,
         r.sent_back_at, r.fulfilment_intent, r.round
    into v_req
    from purchase_requests r
   where r.id = v_demand.request_id
     for share;
  if not found then
    raise exception 'mpr_line_has_no_request' using errcode = '22023';
  end if;
  if v_req.approved_at is null
     or v_req.refused_at is not null
     or v_req.withdrawn_at is not null
     or v_req.sent_back_at is not null then
    raise exception 'request_not_approved' using errcode = '22023';
  end if;
  if v_req.fulfilment_intent is distinct from 'concrete_need' then
    raise exception 'request_not_a_concrete_need' using errcode = '22023';
  end if;
  if v_req.req_no is null then
    -- Every Unit taken from the pool is committed to a named reference
    -- (`ref_required`). A request minted before 0546 has no number, so it has
    -- nothing honest to commit to — and inventing one here would put a
    -- fabricated document number in the stock ledger for ever.
    raise exception 'request_has_no_number' using errcode = '22023';
  end if;

  -- Re-read the line under its own lock, AFTER the request lock.
  select d.id, d.request_id, d.sku, d.qty, d.approved_qty, d.issued_qty, d.cancelled_at
    into v_demand
    from purchase_demands d
   where d.id = p_demand_id
     for update;
  if v_demand.cancelled_at is not null then
    raise exception 'mpr_line_not_going_ahead' using errcode = '22023';
  end if;

  select coalesce(array_agg(i.id order by i.id), '{}'::uuid[])
    into v_have
    from ops_stock_items i
   where i.reserved_purchase_demand_id = p_demand_id
     and i.status in ('reserved', 'sold');

  -- ⭐ THE CONCURRENCY CHECK. The browser says which saved set it was editing.
  -- If somebody else moved the line since, the save is refused whole and the
  -- operator's own choices survive on screen to be re-judged.
  if p_expected_item_ids is not null then
    if (select coalesce(array_agg(x order by x), '{}'::uuid[])
          from unnest(p_expected_item_ids) x)
       is distinct from v_have then
      raise exception 'stock_selection_changed' using errcode = '40001';
    end if;
  end if;

  select coalesce(array_agg(w), '{}'::uuid[]) into v_add
    from unnest(v_want) w where not (w = any(v_have));
  select coalesce(array_agg(h), '{}'::uuid[]) into v_drop
    from unnest(v_have) h where not (h = any(v_want));

  -- RELEASE FIRST. A replacement that frees one Unit to take another must not
  -- be refused by its own outgoing choice still holding the requirement.
  foreach v_item in array v_drop loop
    if public.ops_stock_release(v_item) is null then
      -- Sold, delivered or already released by somebody else: the whole save
      -- is refused rather than leaving half a replacement standing.
      raise exception 'unit_cannot_be_released' using errcode = '22023',
        detail = 'that Unit is no longer held for this purchase · unit_id=' || v_item::text;
    end if;
  end loop;

  foreach v_item in array v_add loop
    begin
      v_drawn := public.ops_stock_pool_draw(
        p_ref                => v_req.req_no,
        -- The ledger's own word for stock taken INSTEAD of raising a purchase
        -- order — exactly what this act means (P13, 0322).
        p_reason             => 'used_instead_of_ordering',
        p_note               => 'Manual Purchase · ' || v_req.req_no,
        p_item_id            => v_item,
        p_sku                => null,
        p_condition          => null,
        p_wh                 => null,
        p_order_line_id      => null,
        p_purchase_demand_id => p_demand_id
      );
    exception when others then
      get stacked diagnostics
        v_state  = returned_sqlstate,
        v_word   = message_text,
        v_detail = pg_exception_detail;
      raise exception using
        errcode = v_state,
        message = v_word,
        detail  = coalesce(nullif(v_detail, '') || ' · ', '') || 'unit_id=' || v_item::text;
    end;
    if v_drawn is null then
      raise exception 'unit_no_longer_free' using errcode = '40001',
        detail = 'someone else took that Unit · unit_id=' || v_item::text;
    end if;
  end loop;

  if array_length(v_add, 1) > 0 or array_length(v_drop, 1) > 0 then
    insert into purchase_request_events (request_id, round, kind, actor_id, changes)
    values (v_req.id, v_req.round, 'stock_allocated', auth.uid(),
            jsonb_build_object(
              'demand_id', p_demand_id,
              'sku', v_demand.sku,
              'added', to_jsonb(v_add),
              'removed', to_jsonb(v_drop),
              'reserved', to_jsonb(v_want)));
  end if;

  return jsonb_build_object(
    'demandId', p_demand_id,
    'reference', v_req.req_no,
    'reserved', v_count,
    'added', coalesce(array_length(v_add, 1), 0),
    'removed', coalesce(array_length(v_drop, 1), 0),
    'unitIds', to_jsonb(v_want),
    'remainingQty', public.purchasing_mpr_line_remaining_requirement(p_demand_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.ops_stock_pool_draw(p_ref text, p_reason text, p_note text DEFAULT NULL::text, p_item_id uuid DEFAULT NULL::uuid, p_sku text DEFAULT NULL::text, p_condition text DEFAULT NULL::text, p_wh uuid DEFAULT NULL::uuid, p_order_line_id uuid DEFAULT NULL::uuid, p_purchase_demand_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := (select public.app_role());
  v_ref  text := nullif(btrim(coalesce(p_ref, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_sku  text := nullif(btrim(coalesce(p_sku, '')), '');
  v_wh   uuid := p_wh;
  v_id   uuid;
  v_qty  int;
  v_item_sku text;
  v_so       int;
  v_line_id  uuid;
  v_line     record;
  v_unit     record;
  v_demand   record;
  v_req      record;
  v_peek     record;
  v_incoming boolean := false;
  v_po_no    text;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501',
      detail = 'the stock register is an operation surface';
  end if;
  if v_ref is null then
    raise exception 'ref_required' using errcode = '22023',
      detail = 'a drawn unit is committed to something — say what';
  end if;
  if p_reason is null or p_reason not in (
       'sales_urgent','supplier_delay','warranty_exchange','vip','other',
       'used_instead_of_ordering') then
    raise exception 'bad_reason' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'reason_needs_words' using errcode = '22023',
      detail = 'say what the reason is when you pick Other';
  end if;
  if p_item_id is null and v_sku is null then
    raise exception 'item_or_sku_required' using errcode = '22023';
  end if;

  if p_purchase_demand_id is not null and exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id
    where d.id=p_purchase_demand_id and (r.request_version>0 or r.request_context is not null)) then
    if p_item_id is null then raise exception 'exact Unit required' using errcode='22023',detail='line_needs_exact_unit'; end if;
    perform public._purchasing_context_execution_admission((select request_id from public.purchase_demands where id=p_purchase_demand_id));
    perform public._purchasing_context_stock_admission(p_purchase_demand_id,array[p_item_id],false);
  end if;

  -- ── 0546 · A UNIT ANSWERS ONE LINE, AND TWO KINDS OF LINE EXIST ──────────
  if p_order_line_id is not null and p_purchase_demand_id is not null then
    raise exception 'one_binding_only' using errcode = '22023',
      detail = 'a Unit answers a Sales Order line or a Manual Purchase line, never both';
  end if;

  v_so := nullif(substring(v_ref from '^SO-([0-9]+)$'), '')::int;
  v_line_id := p_order_line_id;

  if v_so is not null and v_line_id is null and p_purchase_demand_id is null then
    select l.id into v_line_id
      from order_lines l
      join orders o on o.id = l.order_id
     where o.so = v_so
       and public.stock_match_key(l.sku) = public.stock_match_key(
             coalesce((select i.sku from ops_stock_items i where i.id = p_item_id), v_sku))
       and public.so_line_remaining_requirement(l.id, p_item_id) > 0
     limit 2;
    if v_line_id is null then
      raise exception 'order_line_required' using errcode = '22023',
        detail = 'no item line on that Sales Order still needs these goods';
    end if;
    if (select count(*) from order_lines l join orders o on o.id = l.order_id
         where o.so = v_so
           and public.stock_match_key(l.sku) = public.stock_match_key(
                 coalesce((select i.sku from ops_stock_items i where i.id = p_item_id), v_sku))
           and public.so_line_remaining_requirement(l.id, p_item_id) > 0) > 1 then
      raise exception 'order_line_required' using errcode = '22023',
        detail = 'that Sales Order has more than one item line for these goods — say which';
    end if;
  end if;

  if v_line_id is not null then
    perform public.so_lock_source_lines(array[v_line_id]);
    if v_so is null then
      raise exception 'line_needs_sales_order_ref' using errcode = '22023',
        detail = 'an item line belongs to a Sales Order; this reference names none';
    end if;
    if p_item_id is null and p_order_line_id is not null then
      raise exception 'line_needs_exact_unit' using errcode = '22023',
        detail = 'a line binding names the exact Unit, never a pick-by-SKU';
    end if;

    select l.id, l.sku, l.qty, o.so
      into v_line
      from order_lines l
      join orders o on o.id = l.order_id
     where l.id = v_line_id;
    if not found then
      raise exception 'order_line_not_found' using errcode = '22023';
    end if;
    if v_line.so is distinct from v_so then
      raise exception 'line_not_in_order' using errcode = '22023',
        detail = 'that item line belongs to a different Sales Order';
    end if;

    if p_item_id is not null then
      -- 0600 · an incoming Unit's PO line is locked BEFORE the Unit, so its
      -- free balance cannot be spent twice by two binds at once.
      select i.status, i.po_line_id into v_peek
        from ops_stock_items i where i.id = p_item_id;
      if v_peek.status = 'incoming' and v_peek.po_line_id is not null then
        perform 1 from purchase_order_lines pl where pl.id = v_peek.po_line_id for update;
      end if;

      select i.id, i.sku, i.status, i.needs_repair, i.condition, i.identity_scope,
             i.po_line_id, i.po_no, i.reserved_order_line_id, i.reserved_purchase_demand_id
        into v_unit
        from ops_stock_items i
       where i.id = p_item_id
         for update;
      if not found then
        raise exception 'unit_not_found' using errcode = '22023';
      end if;
      if coalesce(v_unit.identity_scope, 'unit') <> 'unit' then
        raise exception 'quantity_row_not_bindable' using errcode = '22023',
          detail = 'counted stock has no Unit identity to commit to one item line';
      end if;
      if public.stock_match_key(v_unit.sku) is distinct from public.stock_match_key(v_line.sku) then
        raise exception 'unit_does_not_match_line' using errcode = '22023',
          detail = 'that Unit is not the goods this item line ordered';
      end if;
      if v_unit.status = 'incoming' then
        -- ── 0600 · GOODS ALREADY ON A PO (owner ruling 2026-09-28) ──────────
        v_incoming := true;
        v_po_no := v_unit.po_no;
        if v_unit.po_line_id is null then
          raise exception 'unit_not_on_a_po' using errcode = '22023',
            detail = 'that incoming Unit belongs to no purchase order line';
        end if;
        if v_unit.reserved_order_line_id is not null
           or v_unit.reserved_purchase_demand_id is not null then
          raise exception 'unit_no_longer_free' using errcode = '40001',
            detail = 'someone else took that Unit';
        end if;
        if coalesce(v_unit.needs_repair, false) then
          raise exception 'unit_not_available' using errcode = '22023',
            detail = 'that Unit is not sound';
        end if;
        if public.purchasing_po_line_free_units(v_unit.po_line_id) <= 0 then
          raise exception 'po_goods_held' using errcode = '22023',
            detail = 'that purchase order''s goods are held for another order';
        end if;
      else
        if v_unit.status <> 'free' then
          raise exception 'unit_no_longer_free' using errcode = '40001',
            detail = 'someone else took that Unit';
        end if;
        if public.unit_availability(v_unit.status, v_unit.needs_repair,
                                    null, v_unit.condition) <> 'available' then
          raise exception 'unit_not_available' using errcode = '22023',
            detail = 'that Unit is not free and sound ready stock';
        end if;
      end if;
    else
      if public.stock_match_key(v_sku) is distinct from public.stock_match_key(v_line.sku) then
        raise exception 'unit_does_not_match_line' using errcode = '22023',
          detail = 'that stock is not the goods this item line ordered';
      end if;
    end if;
    if public.so_line_remaining_requirement(v_line_id, p_item_id) <= 0 then
      raise exception 'line_already_covered' using errcode = '22023',
        detail = 'that item line is already covered by Ready Stock or a purchase order';
    end if;
  end if;

  -- ── 0546 · THE MANUAL PURCHASE BRANCH ───────────────────────────────────
  if p_purchase_demand_id is not null then
    if p_item_id is null then
      raise exception 'line_needs_exact_unit' using errcode = '22023',
        detail = 'a Manual Purchase line binding names the exact Unit, never a pick-by-SKU';
    end if;
    if v_so is not null then
      raise exception 'mpr_line_needs_request_ref' using errcode = '22023',
        detail = 'a Manual Purchase line is not answered against a Sales Order reference';
    end if;

    select d.id, d.sku, d.qty, d.approved_qty, d.issued_qty, d.cancelled_at, d.request_id
      into v_demand
      from purchase_demands d
     where d.id = p_purchase_demand_id
       for update;
    if not found then
      raise exception 'mpr_line_not_found' using errcode = '22023';
    end if;
    if v_demand.cancelled_at is not null then
      raise exception 'mpr_line_not_going_ahead' using errcode = '22023',
        detail = 'that Manual Purchase line is marked not going ahead';
    end if;
    if v_demand.request_id is null then
      raise exception 'mpr_line_has_no_request' using errcode = '22023',
        detail = 'that purchase line belongs to no Manual Purchase request';
    end if;

    select r.id, r.req_no, r.approved_at, r.refused_at, r.withdrawn_at,
           r.sent_back_at, r.fulfilment_intent
      into v_req
      from purchase_requests r
     where r.id = v_demand.request_id;
    if not found then
      raise exception 'mpr_line_has_no_request' using errcode = '22023';
    end if;
    if v_req.approved_at is null
       or v_req.refused_at is not null
       or v_req.withdrawn_at is not null
       or v_req.sent_back_at is not null then
      raise exception 'request_not_approved' using errcode = '22023',
        detail = 'stock is saved against an approved Manual Purchase only';
    end if;
    if v_req.fulfilment_intent is distinct from 'concrete_need' then
      raise exception 'request_not_a_concrete_need' using errcode = '22023',
        detail = 'existing stock answers a concrete need; it never reduces an additional replenishment';
    end if;
    if v_req.req_no is not null and v_ref is distinct from v_req.req_no then
      raise exception 'mpr_line_needs_request_ref' using errcode = '22023',
        detail = 'the reference must be this Manual Purchase''s own number';
    end if;

    select i.id, i.sku, i.status, i.needs_repair, i.condition, i.identity_scope
      into v_unit
      from ops_stock_items i
     where i.id = p_item_id
       for update;
    if not found then
      raise exception 'unit_not_found' using errcode = '22023';
    end if;
    if coalesce(v_unit.identity_scope, 'unit') <> 'unit' then
      raise exception 'quantity_row_not_bindable' using errcode = '22023',
        detail = 'counted stock has no Unit identity to commit to one purchase line';
    end if;
    if public.stock_match_key(v_unit.sku) is distinct from public.stock_match_key(v_demand.sku) then
      raise exception 'unit_does_not_match_line' using errcode = '22023',
        detail = 'that Unit is not the goods this purchase line asked for';
    end if;
    if v_unit.status <> 'free' then
      raise exception 'unit_no_longer_free' using errcode = '40001',
        detail = 'someone else took that Unit';
    end if;
    if public.unit_availability(v_unit.status, v_unit.needs_repair,
                                null, v_unit.condition) <> 'available' then
      raise exception 'unit_not_available' using errcode = '22023',
        detail = 'that Unit is not free and sound ready stock';
    end if;
    if public.purchasing_mpr_line_remaining_requirement(p_purchase_demand_id, p_item_id) <= 0 then
      raise exception 'mpr_line_already_covered' using errcode = '22023',
        detail = 'that purchase line is already covered by Ready Stock or a purchase order';
    end if;
  end if;

  if v_incoming then
    -- 0600 · ONLY the binding. Status stays `incoming` until Receiving posts;
    -- the arrival trigger below turns it into `reserved` for this line.
    update ops_stock_items
       set reserved_ref           = v_ref,
           reserved_order_line_id = v_line_id,
           updated_at             = now()
     where id                          = p_item_id
       and status                      = 'incoming'
       and reserved_order_line_id      is null
       and reserved_purchase_demand_id is null
    returning id, sku, coalesce(qty, 1) into v_id, v_item_sku, v_qty;

    if v_id is null then
      return null;
    end if;

    -- No `ops_stock_pool_usage` row: nothing left the free pool. The audit and
    -- activity rows say what happened, in their own words.
    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('PO goods reserved · %s x%s · %s', v_item_sku, v_qty, coalesce(v_po_no, '')),
            v_ref);

    insert into ops_activity_log (order_id, action, actor_id, detail)
    values (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_reserve',
      auth.uid(),
      jsonb_build_object('sku', v_item_sku, 'ref', v_ref, 'item_id', v_id,
                         'qty', v_qty, 'reason', p_reason,
                         'order_line_id', v_line_id,
                         'purchase_demand_id', null,
                         'source', 'incoming', 'po_no', v_po_no)
    );

    return v_id;
  end if;

  if p_item_id is not null then
    update ops_stock_items
       set status                      = 'reserved',
           reserved_ref                = v_ref,
           reserved_order_line_id      = coalesce(v_line_id, reserved_order_line_id),
           reserved_purchase_demand_id = coalesce(p_purchase_demand_id,
                                                  reserved_purchase_demand_id),
           updated_at                  = now()
     where id           = p_item_id
       and status       = 'free'
       and needs_repair = false
    returning id, sku, coalesce(qty, 1) into v_id, v_item_sku, v_qty;
  else
    if v_wh is null then
      select id into v_wh from warehouses where name ilike '%klang%' limit 1;
    end if;
    if v_wh is null then
      raise exception 'warehouse_not_found' using errcode = '22023';
    end if;

    update ops_stock_items
       set status                 = 'reserved',
           reserved_ref           = v_ref,
           reserved_order_line_id = coalesce(v_line_id, reserved_order_line_id),
           updated_at             = now()
     where id = (
       select id from ops_stock_items
        where sku          = v_sku
          and warehouse_id = v_wh
          and status       = 'free'
          and needs_repair = false
          and (p_condition is null or condition = p_condition)
          and (v_line_id is null or coalesce(identity_scope, 'unit') = 'unit')
        order by date_in asc nulls last, created_at asc
        limit 1
        for update skip locked
     )
    returning id, sku, coalesce(qty, 1) into v_id, v_item_sku, v_qty;
  end if;

  if v_id is null then
    return null;
  end if;

  insert into ops_stock_pool_usage (item_id, sku, qty, reason, note, ref, taken_by)
  values (v_id, v_item_sku, v_qty, p_reason, v_note, v_ref, auth.uid());

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          format('Ready stock taken · %s x%s · %s', v_item_sku, v_qty, p_reason),
          v_ref);

  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (
    public._activity_log_order_id_from_ref(v_ref),
    'stock_reserve',
    auth.uid(),
    jsonb_build_object('sku', v_item_sku, 'ref', v_ref, 'item_id', v_id,
                       'qty', v_qty, 'reason', p_reason,
                       'order_line_id', v_line_id,
                       'purchase_demand_id', p_purchase_demand_id)
  );

  return v_id;
end;
$function$;

create or replace function public._purchasing_context_issue_preflight(p_pos jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $issue_preflight$
#variable_conflict use_column
declare keys text[]; req uuid; r public.purchase_requests%rowtype; d public.purchase_demands%rowtype;
 po jsonb; ln jsonb; src jsonb; scope jsonb; coverage jsonb; approved jsonb; recipients jsonb; x jsonb; prior integer; cap integer; quantity integer; held integer; modern boolean; have_group boolean;
 requests jsonb:='[]'; sources jsonb:='[]'; pi integer:=0; li integer; si integer; category text; need_date date; first_date date; first_category text; expected_warehouse uuid; destination_address text; collection_partner uuid; collection_destination uuid; supplier_kind text; supplier_address text;
 today date:=(now() at time zone 'Asia/Kuala_Lumpur')::date; check_context jsonb; plan jsonb; previous_refused boolean; detail text; grouped record;
begin
 perform public._purchasing_context_writer_admission();
 if not public.purchasing_actor_may_issue(auth.uid()) then raise exception 'only Current PO Duty may issue' using errcode='42501',detail='not_po_duty'; end if;
 select array_agg(distinct ln->>'sku' order by ln->>'sku') into keys from jsonb_array_elements(p_pos) po cross join lateral jsonb_array_elements(po->'lines') ln;
 perform public._purchasing_context_source_locks(keys);
 begin
  perform 1 from public.purchase_requests where id in(select d.request_id from jsonb_array_elements(p_pos) po cross join lateral jsonb_array_elements(po->'lines') ln
    cross join lateral jsonb_array_elements(coalesce(ln->'request_sources','[]')) src join public.purchase_demands d on d.id=(src->>'demand_id')::uuid) order by id for update nowait;
 exception when lock_not_available then raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='request_source_busy'; end;
 for req in select distinct d.request_id from jsonb_array_elements(p_pos) po cross join lateral jsonb_array_elements(po->'lines') ln
  cross join lateral jsonb_array_elements(coalesce(ln->'request_sources','[]')) src join public.purchase_demands d on d.id=(src->>'demand_id')::uuid order by 1 loop
  select * into strict r from public.purchase_requests where id=req;
  if r.request_version>0 or r.request_context is not null then
   perform public._purchasing_context_execution_admission(req);
   scope:=public._purchasing_assert_request_approval(req);
   coverage:=public._purchasing_context_coverage(req,true);
   requests:=requests||jsonb_build_array(jsonb_build_object('id',req,'scope',scope,'coverage',coverage,'legacy',false));
  else
   scope:=public._purchasing_context_legacy_issue_scope(req);
   requests:=requests||jsonb_build_array(jsonb_build_object('id',req,'scope',scope,'coverage',null,'legacy',true));
  end if;
 end loop;
 for po in select * from jsonb_array_elements(p_pos) loop
  li:=0; first_date:=null; first_category:=null; have_group:=false;
  for ln in select * from jsonb_array_elements(po->'lines') loop
   if not (ln ? 'request_sources') then
    if exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id where d.id=nullif(ln->>'demand_id','')::uuid and r.request_version>0) then
     raise exception 'current request sources required' using errcode='22023',detail='context_review_required'; end if;
    li:=li+1; continue;
   end if;
   if jsonb_typeof(ln->'request_sources') is distinct from 'array' or jsonb_array_length(ln->'request_sources')=0
    or ln->>'demand_id' is not null or (ln ? 'sources' and ln->'sources'<>'[]'::jsonb) then
    raise exception 'one exact source owner required' using errcode='22023',detail='invalid_request_sources'; end if;
   if exists(select 1 from jsonb_array_elements(ln->'request_sources') x group by x->>'demand_id' having count(*)>1) then raise exception 'duplicate request source' using errcode='22023',detail='invalid_request_sources'; end if;
   if (select count(distinct coalesce(r.fulfilment_intent,'unknown')) from jsonb_array_elements(ln->'request_sources') src
     join public.purchase_demands d on d.id=(src->>'demand_id')::uuid join public.purchase_requests r on r.id=d.request_id)>1 then
    raise exception 'request supply intent cannot be merged without exact source ownership' using errcode='22023',detail='request_source_intent_unavailable'; end if;
   if (select stock_identity_mode from public.product_skus where sku=ln->>'sku')='quantity' and
     (select count(distinct d.request_id) from jsonb_array_elements(ln->'request_sources') src join public.purchase_demands d on d.id=(src->>'demand_id')::uuid)>1
     and exists(select 1 from jsonb_array_elements(ln->'request_sources') src join public.purchase_demands d on d.id=(src->>'demand_id')::uuid join public.purchase_requests r on r.id=d.request_id where r.request_context->>'origin'='forecast_suggestion') then
    raise exception 'counted merged supply attribution unavailable' using errcode='22023',detail='forecast_quantity_source_unavailable'; end if;
   if (select sum((x->>'qty')::numeric) from jsonb_array_elements(ln->'request_sources') x) is distinct from (ln->>'qty')::numeric then
    raise exception 'request source quantities differ from PO line' using errcode='22023',detail='invalid_request_sources'; end if;
   si:=0;
   for src in select * from jsonb_array_elements(ln->'request_sources') loop
    perform public._purchasing_context_object(src,'{"demand_id":"string","qty":"number","request_version":"number","approval_version":"number|null","approval_token":"string|null","recipients":"array|null"}');
    select * into d from public.purchase_demands where id=(src->>'demand_id')::uuid;
    if not found then raise exception 'request allocation unavailable' using errcode='22023',detail='unknown_demand'; end if;
    select * into strict r from public.purchase_requests where id=d.request_id;
    select x->'scope' into strict scope from jsonb_array_elements(requests) x where (x->>'id')::uuid=r.id;
    modern:=r.request_version>0;
    if modern then
     if (src->>'request_version')::numeric<>r.request_version or (src->>'approval_version')::numeric is distinct from r.approval_version or src->>'approval_token' is distinct from md5(scope::text) then
      raise exception 'request approval review changed' using errcode='22023',detail='request_approval_changed'; end if;
    elsif (src->>'request_version')::numeric<>0 or src->'approval_version'<>'null'::jsonb or src->'approval_token'<>'null'::jsonb or src->'recipients'<>'null'::jsonb then
     raise exception 'legacy approval or recipient proof cannot be invented' using errcode='22023',detail='invalid_request_sources';
    end if;
    if (src->>'qty')::numeric<1 or mod((src->>'qty')::numeric,1)<>0 or (src->>'qty')::numeric>2147483647 then raise exception 'invalid issue quantity' using errcode='22023',detail='invalid_qty'; end if;
    quantity:=(src->>'qty')::integer;
    if modern then perform public._purchasing_context_issue_admission(d.id,quantity);
    else
     select coalesce(sum(qty),0) into held from public.ops_stock_items where reserved_purchase_demand_id=d.id and status in ('reserved','sold');
     if d.cancelled_at is not null or quantity>coalesce(d.approved_qty,d.qty)-d.issued_qty-held then raise exception 'legacy approved remainder changed' using errcode='22023',detail='request_over_issue'; end if;
    end if;
    select m.category::text into strict category from public.product_skus s join public.product_models m on m.id=s.model_id where s.sku=d.sku;
    if d.sku is distinct from ln->>'sku' or nullif(nullif(d.attrs,'{}'::jsonb),'null'::jsonb) is distinct from nullif(nullif(ln->'attrs','null'::jsonb),'{}'::jsonb)
     or d.supplier_id is distinct from (po->>'supplier_id')::uuid or d.destination_id is distinct from (po->>'destination_id')::uuid
     or (ln->>'destination_id' is not null and (ln->>'destination_id')::uuid<>d.destination_id) or d.purpose is distinct from po->>'purpose' then
     raise exception 'PO line differs from approved allocation' using errcode='22023',detail='request_po_coverage_changed'; end if;
    select sp.kind::text,sp.address into strict supplier_kind,supplier_address from public.suppliers sp where sp.id=d.supplier_id for share nowait;
    if coalesce(supplier_address,'') !~ '[^[:space:]]' then raise exception 'supplier document address required' using errcode='22023',detail='supplier_address_missing'; end if;
    select ss.collected_by_partner_id,ss.fixed_destination_id into collection_partner,collection_destination from public.purchasing_supplier_settings ss where ss.supplier_id=d.supplier_id for share nowait;
    if supplier_kind='factory_pickup' and ((collection_partner is not null and collection_partner is distinct from (po->>'procurement_partner_id')::uuid)
      or (collection_destination is not null and collection_destination<>d.destination_id)) then raise exception 'supplier collection settings changed' using errcode='22023',detail='supplier_collection_destination_mismatch'; end if;
    select dest.warehouse_id,dest.address into expected_warehouse,destination_address from public.purchasing_destinations dest where dest.id=d.destination_id and dest.active for share nowait;
    if not found then raise exception 'active purchasing destination required' using errcode='22023',detail='unknown_destination'; end if;
    if expected_warehouse is not null then select address into strict destination_address from public.warehouses where id=expected_warehouse for share nowait; end if;
    if coalesce(destination_address,'') !~ '[^[:space:]]' then raise exception 'destination address required' using errcode='22023',detail='destination_address_missing'; end if;
    if expected_warehouse is not null and expected_warehouse is distinct from (po->>'warehouse_id')::uuid then raise exception 'PO warehouse differs from approved destination' using errcode='22023',detail='request_po_coverage_changed'; end if;
    need_date:=coalesce(d.required_by,r.required_by);
    if have_group and (first_date is distinct from need_date or first_category is distinct from category) then raise exception 'PO mixes approved need dates or categories' using errcode='22023',detail='request_po_group_changed'; end if;
    first_date:=need_date; first_category:=category; have_group:=true;
    check_context:=jsonb_build_object('proceedDate',today,'lines',jsonb_build_array(jsonb_build_object('id',d.request_line_id,'sku',d.sku,'allocations',jsonb_build_array(jsonb_build_object('supplierDeliveryDate',po->>'eta_date')))));
    if po->>'eta_date' is null then raise exception 'current Settings PO date required' using errcode='22023',detail='supplier_plan_unavailable'; end if;
    plan:=public._purchasing_check_context_supplier_dates(check_context,today);
    if (plan#>>'{0,working_days}')::integer=0 then
     if (po->>'eta_date')::date<>today then raise exception 'PO date differs from Settings' using errcode='22023',detail='request_po_date_changed'; end if;
    else
     previous_refused:=false;
     begin
      perform public._purchasing_check_context_supplier_dates(jsonb_set(check_context,'{lines,0,allocations,0,supplierDeliveryDate}',to_jsonb(((po->>'eta_date')::date-1)::text)),today);
     exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; if detail<>'supplier_date_before_earliest' then raise; end if; previous_refused:=true; end;
     if not previous_refused then raise exception 'PO date differs from Settings' using errcode='22023',detail='request_po_date_changed'; end if;
    end if;
    if modern then
    select x into strict approved from jsonb_array_elements(scope->'approved_distribution') x where (x->>'demandId')::uuid=d.id;
    recipients:=public._purchasing_context_remaining_recipients(r.id,d.id,scope);
    if src->'recipients'='null'::jsonb then
     if r.purpose<>'ready_stock' and quantity<>d.approved_qty-d.issued_qty then raise exception 'partial issue requires exact recipient allocation' using errcode='22023',detail='issue_recipient_distribution_required'; end if;
    else
     if exists(select 1 from jsonb_array_elements(src->'recipients') x group by x->>'recipientId' having count(*)>1) then raise exception 'duplicate issue recipient' using errcode='22023',detail='invalid_issue_distribution'; end if;
     for x in select * from jsonb_array_elements(src->'recipients') loop
      perform public._purchasing_context_object(x,'{"recipientId":"string","qty":"number"}');
      select (rc->>'qty')::integer into cap from jsonb_array_elements(recipients) rc where (rc->>'recipientId')::uuid=(x->>'recipientId')::uuid;
      if cap is null or (x->>'qty')::numeric<1 or mod((x->>'qty')::numeric,1)<>0 or (x->>'qty')::numeric>cap then raise exception 'issue recipient exceeds approved remainder' using errcode='22023',detail='invalid_issue_distribution'; end if;
     end loop;
     recipients:=src->'recipients';
    end if;
    if (r.purpose='ready_stock' and recipients<>'[]'::jsonb) or (r.purpose<>'ready_stock' and (select coalesce(sum((x->>'qty')::integer),0) from jsonb_array_elements(recipients) x)<>quantity) then
     raise exception 'issue quantity needs exact recipient distribution' using errcode='22023',detail='invalid_issue_distribution'; end if;
    else recipients:='[]'::jsonb; end if;
    sources:=sources||jsonb_build_array(jsonb_build_object('po_index',pi,'line_index',li,'source_index',si,'request_id',r.id,'demand_id',d.id,'qty',quantity,'recipients',recipients,'recipient_scope_known',modern,
     'prior_issued',d.issued_qty+(select coalesce(sum((x->>'qty')::integer),0) from jsonb_array_elements(sources) x where x->>'demand_id'=d.id::text),
     'approval_version',r.approval_version,'approval_token',case when modern then md5(scope::text) else null end));
    si:=si+1;
   end loop;
   li:=li+1;
  end loop;
  pi:=pi+1;
 end loop;
 for grouped in select (x->>'demand_id')::uuid id,sum((x->>'qty')::integer) qty from jsonb_array_elements(sources) x group by 1 loop
  select * into strict d from public.purchase_demands where id=grouped.id;
  select * into strict r from public.purchase_requests where id=d.request_id;
  select coalesce(sum(qty),0) into held from public.ops_stock_items where reserved_purchase_demand_id=d.id and status in ('reserved','sold');
  if grouped.qty>coalesce(d.approved_qty,d.qty)-d.issued_qty-(case when r.request_version=0 then held else 0 end) then raise exception 'batch exceeds approved remainder' using errcode='22023',detail='request_over_issue'; end if;
  if r.request_version=0 then continue; end if;
  for x in select jsonb_build_object('recipientId',rc->>'recipientId','qty',sum((rc->>'qty')::integer)) from jsonb_array_elements(sources) a cross join lateral jsonb_array_elements(a->'recipients') rc where a->>'demand_id'=d.id::text group by rc->>'recipientId' loop
   select x1->'scope' into strict scope from jsonb_array_elements(requests) x1 where (x1->>'id')::uuid=d.request_id;
   select (rc->>'qty')::integer into cap from jsonb_array_elements(scope->'approved_distribution') a cross join lateral jsonb_array_elements(a->'recipients') rc where a->>'demandId'=d.id::text and rc->>'recipientId'=x->>'recipientId';
   select coalesce(sum((rc->>'qty')::integer),0) into prior from public.purchase_request_events e cross join lateral jsonb_array_elements(coalesce(e.changes->'allocations','[]')) a cross join lateral jsonb_array_elements(a->'recipients') rc where e.request_id=d.request_id and e.kind='po_issued' and e.changes->>'record_type'='po_issue' and exists(select 1 from public.purchase_orders prior_po where prior_po.id=e.changes->>'po_id' and prior_po.status<>'cancelled') and a->>'demand_id'=d.id::text and rc->>'recipientId'=x->>'recipientId';
   if (x->>'qty')::integer>cap-prior then raise exception 'batch exceeds recipient remainder' using errcode='22023',detail='invalid_issue_distribution'; end if;
  end loop;
 end loop;
 return jsonb_build_object('requests',requests,'sources',sources);
exception when lock_not_available then raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='request_source_busy';
end;
$issue_preflight$;

create or replace function public._purchasing_context_issue_admission(p_demand_id uuid,p_qty integer)
returns jsonb language plpgsql set search_path=public,pg_temp as $issue_admission$
declare d public.purchase_demands%rowtype; coverage jsonb; line jsonb; r public.purchase_requests%rowtype; pending jsonb;
begin
 select * into strict d from public.purchase_demands where id=p_demand_id;
 perform public._purchasing_context_execution_admission(d.request_id);
 coverage:=public._purchasing_context_coverage(d.request_id,true);
 select * into strict r from public.purchase_requests where id=d.request_id;
 select x into strict line from jsonb_array_elements(coverage) x where (x->>'demand_id')::uuid=d.id;
 if d.cancelled_at is not null or d.fulfilment_kind is distinct from 'purchase' or p_qty is null or p_qty<1 or p_qty>(line->>'to_buy')::integer then
  raise exception 'purchase allocation has insufficient approved remainder' using errcode='22023',detail='request_over_issue'; end if;
 -- Already-issued allocations do not acquire a fresh production clock.
 select jsonb_set(r.request_context,'{lines}',jsonb_agg(jsonb_set(l,'{allocations}',coalesce((
  select jsonb_agg(a) from jsonb_array_elements(l->'allocations') a where exists(select 1 from public.purchase_demands pd
   where pd.request_id=r.id and pd.cancelled_at is null and pd.supplier_allocation_id=(a->>'id')::uuid and pd.approved_qty>pd.issued_qty)
 ),'[]'::jsonb)))) into pending from jsonb_array_elements(r.request_context->'lines') l;
 perform public._purchasing_check_context_supplier_dates(pending,greatest((now() at time zone 'Asia/Kuala_Lumpur')::date,r.proceed_date));
 return line;
end;
$issue_admission$;

-- OPEN only the ordinary request gate, after the exceptional execution guards.
create or replace function public._purchasing_context_writer_admission()
returns void language plpgsql set search_path=public,pg_temp as $context_open$
begin return; end;
$context_open$;
revoke all on function public._purchasing_context_writer_admission() from public,anon,authenticated;

-- Shared root/PO reader discovers this release through the signed user client.
-- New callable is READ ONLY and keeps existing Operation/Principal qualification.
create or replace function public.purchasing_request_context_release()
returns jsonb language plpgsql security definer stable set search_path=public,pg_temp as $release_state$
begin
 if auth.uid() is null or public.app_role() is null or public.app_role() not in ('operation','principal') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return jsonb_build_object('version',1,'requestFlow',
  (select md5(replace(prosrc,chr(13),''))='7b1ef2badb1935730e9f2c31d5f186de' from pg_proc where oid='public._purchasing_context_writer_admission()'::regprocedure),
  'cancellation',false,'serviceExecution',false);
end;
$release_state$;
revoke all on function public.purchasing_request_context_release() from public,anon;
grant execute on function public.purchasing_request_context_release() to authenticated;

insert into auth.users(id,email) values('fffffff1-0000-4000-8000-000000009781','TEST-release@carres.test');
insert into public.app_users(id,email,name,role,status,is_person) values('fffffff1-0000-4000-8000-000000009781','TEST-release@carres.test','TEST release','operation','active',true);
select set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009781","role":"authenticated","app_metadata":{"role":"operation"}}',true);
set local role authenticated;
do $release_contract$
declare state jsonb; blocked boolean:=false; detail text;
begin
 state:=public.purchasing_request_context_release();
 if state<>'{"version":1,"requestFlow":true,"cancellation":false,"serviceExecution":false}'::jsonb then raise exception 'wrong released scope %',state; end if;
 if has_function_privilege('authenticated','public._purchasing_context_writer_admission()','execute')
  or has_function_privilege('anon','public.purchasing_request_context_release()','execute') then raise exception 'private/anonymous grant opened'; end if;
 begin perform public.operation_cancel_po('TEST-not-an-existing-PO','TEST', '{}'::jsonb);
 exception when object_not_in_prerequisite_state then get stacked diagnostics detail=pg_exception_detail;blocked:=detail='cancellation_not_released'; end;
 if not blocked then raise exception 'cancellation execution opened with ordinary buying'; end if;
 raise notice 'Release: authenticated scope discovery, private ACL, cancellation refusal before any PO/business write PASS';
end;
$release_contract$;
reset role;
do $execution_contract$
declare dest uuid; supplier uuid; sku text; r uuid; demand uuid; p text; blocked boolean; detail text;
begin
 select id into dest from public.purchasing_destinations where active order by id limit 1;
 select s.sku,s.supplier_id into sku,supplier from public.product_skus s where s.supplier_id is not null order by s.sku limit 1;
 foreach p in array array['general_purchase','ready_stock','service_case'] loop
  insert into public.purchase_requests(purpose,destination_id,approval_required,request_version,request_context,created_by)
  values(p,dest,true,1,'{}','fffffff1-0000-4000-8000-000000009781') returning id into r;
  blocked:=false;
  begin perform public._purchasing_context_execution_admission(r);
  exception when object_not_in_prerequisite_state then get stacked diagnostics detail=pg_exception_detail;blocked:=detail='service_case_execution_source_unverified'; end;
  if blocked is distinct from (p='service_case') then raise exception 'wrong execution availability for %',p; end if;
  if p='service_case' then
   insert into public.purchase_demands(request_id,purpose,sku,supplier_id,destination_id,qty)
    values(r,p,sku,supplier,dest,1) returning id into demand;
   blocked:=false;
   begin perform public._purchasing_context_issue_preflight(jsonb_build_array(jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('sku',sku,'request_sources',jsonb_build_array(jsonb_build_object('demand_id',demand)))))));
   exception when object_not_in_prerequisite_state then get stacked diagnostics detail=pg_exception_detail;blocked:=detail='service_case_execution_source_unverified'; end;
   if not blocked then raise exception 'canonical PO preflight bypassed SC execution hold'; end if;
   blocked:=false;
   begin perform public.purchasing_allocate_ready_units(demand,array[gen_random_uuid()]);
   exception when object_not_in_prerequisite_state then get stacked diagnostics detail=pg_exception_detail;blocked:=detail='service_case_execution_source_unverified'; end;
   if not blocked then raise exception 'canonical Stock writer bypassed SC execution hold'; end if;
  end if;
 end loop;
 insert into public.purchase_requests(purpose,destination_id,approval_required,request_version,created_by)
 values('service_case',dest,true,0,'fffffff1-0000-4000-8000-000000009781') returning id into r;
 perform public._purchasing_context_execution_admission(r);
 raise notice 'Execution boundary: GP/RS admit, new contextual SC actual PO/Stock refuse, legacy SC admission preserved PASS';
end;
$execution_contract$;
select set_config('request.jwt.claims','{}',true);
do $signed_out_control$
declare blocked boolean:=false;
begin
 begin perform public.purchasing_request_context_release(); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'signed-out release read admitted'; end if;
end;
$signed_out_control$;
rollback;
