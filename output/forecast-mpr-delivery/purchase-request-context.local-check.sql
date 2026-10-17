-- LOCAL TEST DATABASE ONLY. TEST context; all fixtures rolled back.
-- Requires the WIP validator/create draft and at least one seeded active destination.
\set ON_ERROR_STOP on
begin;
create temporary table context_fixture(value jsonb);
insert into context_fixture values ($json${"version": 1, "origin": "manual", "purpose": "general_purchase", "proceedDate": "2026-10-20", "stockDeliveryDate": null, "serviceCaseId": null, "reason": "other", "companyPersonName": "", "projectReference": "", "explanation": "TEST justification", "forecastChangeReason": "", "recipients": [{"id": "00000000-0000-4000-8000-000000000001", "company": "TEST", "name": "TEST recipient", "phone": "TEST contact", "method": "delivery", "deliveryDate": "2026-11-20", "addressLine1": "TEST", "addressLine2": "TEST", "city": "TEST", "state": "TEST", "postcode": "TEST", "buildingType": "TEST", "floor": "100A", "lift": "has_lift", "pickupLocationId": null, "collectedBy": ""}], "lines": [{"id": "00000000-0000-4000-8000-000000000003", "sku": "TEST-SKU", "qty": 5, "attrs": null, "recipientNeeds": [{"recipientId": "00000000-0000-4000-8000-000000000001", "qty": 5}], "stockProposals": [], "allocations": [{"id": "00000000-0000-4000-8000-000000000004", "destinationId": "00000000-0000-4000-8000-000000000010", "supplierDeliveryDate": "2026-11-10", "qty": 5, "recipients": [{"recipientId": "00000000-0000-4000-8000-000000000001", "qty": 5}]}]}]}$json$);
update context_fixture set value=jsonb_set(value,'{lines,0,allocations,0,destinationId}',to_jsonb((select id::text from public.purchasing_destinations where active order by id limit 1)));
select public._purchasing_validate_request_context(value) from context_fixture;
do $test$ declare c jsonb; refused boolean:=false; begin select value #- '{recipients,0,id}' into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 1 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{lines,0,qty}','5.5') into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 2 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{recipients,0,deliveryDate}','"2026-02-31"') into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 3 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{lines,0,allocations,0,unexpected}','true') into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 4 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{lines,0,allocations,0,recipients}', '[{"recipientId":"00000000-0000-4000-8000-000000000001","qty":2},{"recipientId":"00000000-0000-4000-8000-000000000001","qty":3}]') into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 5 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{lines,0,recipientNeeds,0,qty}','4') into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 6 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{lines,0,allocations,0,supplierDeliveryDate}','null') into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 7 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{lines,0,attrs}','[]') into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 8 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select value || '{"purpose":"ready_stock","origin":"stock_request","reason":null}' into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 9 accepted'; end if; end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin select jsonb_set(value,'{lines}',(value->'lines') || (value->'lines')) into c from context_fixture; begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end; if not refused then raise exception 'negative control 10 accepted'; end if; end; $test$;
create temporary table stock_context_fixture as
select jsonb_set(jsonb_set(jsonb_set(value || '{"purpose":"ready_stock","origin":"stock_request","reason":null,"explanation":"","recipients":[],"stockDeliveryDate":"2026-11-20"}'::jsonb,
 '{lines,0,recipientNeeds}','[]'),'{lines,0,allocations,0,recipients}','[]'),'{lines,0,qty}','500') as value
from context_fixture;
update stock_context_fixture set value=jsonb_set(value,'{lines,0,allocations,0,qty}','500');
select public._purchasing_validate_request_context(value) from stock_context_fixture;
do $test$ declare c jsonb; refused boolean:=false; begin
  select jsonb_set(value,'{stockDeliveryDate}','null') into c from stock_context_fixture;
  begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end;
  if not refused then raise exception 'missing stock date accepted'; end if;
end; $test$;
do $test$ declare c jsonb; refused boolean:=false; begin
  select jsonb_set(value,'{stockDeliveryDate}','"2026-10-21"') into c from stock_context_fixture;
  begin perform public._purchasing_validate_request_context(c); exception when data_exception then refused:=true; end;
  if not refused then raise exception 'stock date below Settings floor accepted'; end if;
end; $test$;
-- Owning-create slice only. LOCAL fixtures, not production transactions.
update context_fixture set value=jsonb_set(value,'{lines,0,sku}',to_jsonb((select sku from public.product_skus where supplier_id is not null order by sku limit 1)));
update stock_context_fixture set value=jsonb_set(value,'{lines,0,sku}',(select value#>'{lines,0,sku}' from context_fixture));
set local session_replication_role=replica;
insert into auth.users(id,email) values ('fffffff1-0000-4000-8000-000000009698','TEST-context-owner@carres.test'),('fffffff1-0000-4000-8000-000000009699','TEST-context-manager@carres.test'),('fffffff1-0000-4000-8000-000000009700','TEST-context-assigner@carres.test');
insert into public.app_users(id,email,name,role,status,is_person) values
 ('fffffff1-0000-4000-8000-000000009698','TEST-context-owner@carres.test','TEST Requester','operation','active',true),
 ('fffffff1-0000-4000-8000-000000009699','TEST-context-manager@carres.test','TEST Manager','principal','active',true),
 ('fffffff1-0000-4000-8000-000000009700','TEST-context-assigner@carres.test','TEST Assigner','principal','active',true);
set local session_replication_role=origin;
grant select on context_fixture,stock_context_fixture to authenticated;
select set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009700","role":"authenticated","app_metadata":{"role":"principal"}}',true);
set local role authenticated;
select public.workspace_assign_duty('purchasing_approver','fffffff1-0000-4000-8000-000000009699',current_date,null,'TEST local fixture; rolled back');
reset role;
select set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
set local role authenticated;
do $owner$
declare c jsonb; rs jsonb; made jsonb; replay jsonb; k uuid:=gen_random_uuid(); badkey uuid:=gen_random_uuid(); d uuid; badline jsonb; detail text; refused boolean:=false; before_n integer; legacy jsonb; mixed jsonb; mixed_line jsonb; recipient2 uuid:=gen_random_uuid(); stock_site record; second_site record; mixed_result jsonb;
begin
 select value into c from context_fixture; select value into rs from stock_context_fixture;
 d:=(c#>>'{lines,0,allocations,0,destinationId}')::uuid;
 made:=public.purchasing_create_request_with_lines(p_purpose=>'general_purchase',p_destination_id=>d,
   p_lines=>jsonb_build_array(jsonb_build_object('request_context',c,'submission_key',k)),p_fulfilment_intent=>'concrete_need');
 replay:=public.purchasing_create_request_with_lines(p_purpose=>'general_purchase',p_destination_id=>d,
   p_lines=>jsonb_build_array(jsonb_build_object('request_context',c,'submission_key',k)),p_fulfilment_intent=>'concrete_need');
 if made->>'id' is distinct from replay->>'id' or made->>'req_no' !~ '^GP[0-9]{6}-[0-9]{4}$' then raise exception 'idempotency or governed GP identity failed'; end if;
 if not exists(select 1 from public.purchase_requests where id=(made->>'id')::uuid and request_context=c and request_version=1 and approval_scope is null and approval_version is null and approval_required and approved_at is null) then raise exception 'exact saved context/approval boundary failed'; end if;
 if not exists(select 1 from public.purchase_demands where request_id=(made->>'id')::uuid and request_line_id=(c#>>'{lines,0,id}')::uuid and supplier_allocation_id=(c#>>'{lines,0,allocations,0,id}')::uuid and qty=5 and fulfilment_kind='purchase') then raise exception 'stable demand lineage failed'; end if;
 begin
   perform public.purchasing_create_request_with_lines(p_purpose=>'general_purchase',p_destination_id=>d,
     p_lines=>jsonb_build_array(jsonb_build_object('request_context',c||'{"explanation":"TEST changed scope"}'::jsonb,'submission_key',k)),p_fulfilment_intent=>'concrete_need');
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='submission_scope_changed'; end;
 if not refused then raise exception 'changed-scope submission key accepted'; end if;
 select id,warehouse_id into strict stock_site from public.purchasing_destinations where active and warehouse_id is not null order by id limit 1;
 select id,warehouse_id into strict second_site from public.purchasing_destinations where active and warehouse_id is not null and warehouse_id<>stock_site.warehouse_id order by id limit 1;
 mixed_line:=(c#>'{lines,0}')||jsonb_build_object('id',gen_random_uuid(),
   'recipientNeeds',jsonb_build_array(jsonb_build_object('recipientId',c#>>'{recipients,0,id}','qty',3),jsonb_build_object('recipientId',recipient2,'qty',2)),
   'stockProposals',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'locationId',stock_site.warehouse_id,'destinationId',stock_site.id,'qty',1,
     'recipients',jsonb_build_array(jsonb_build_object('recipientId',c#>>'{recipients,0,id}','qty',1)))),
   'allocations',jsonb_build_array(
     (c#>'{lines,0,allocations,0}')||jsonb_build_object('id',gen_random_uuid(),'destinationId',stock_site.id,'qty',2,'recipients',jsonb_build_array(jsonb_build_object('recipientId',c#>>'{recipients,0,id}','qty',2))),
     (c#>'{lines,0,allocations,0}')||jsonb_build_object('id',gen_random_uuid(),'destinationId',second_site.id,'qty',2,'recipients',jsonb_build_array(jsonb_build_object('recipientId',recipient2,'qty',2)))));
 mixed:=jsonb_set(jsonb_set(c,'{lines}',jsonb_build_array(mixed_line)),'{recipients}',
   jsonb_build_array(c#>'{recipients,0}',(c#>'{recipients,0}')||jsonb_build_object('id',recipient2,'name','TEST second recipient')));
 mixed_result:=public.purchasing_create_request_with_lines(p_purpose=>'general_purchase',p_destination_id=>d,
   p_lines=>jsonb_build_array(jsonb_build_object('request_context',mixed,'submission_key',gen_random_uuid())),p_fulfilment_intent=>'concrete_need');
 if (select sum(qty) from public.purchase_demands where request_id=(mixed_result->>'id')::uuid)<>5
   or (select sum(qty) from public.purchase_demands where request_id=(mixed_result->>'id')::uuid and fulfilment_kind='purchase')<>4
   or (select sum(qty) from public.purchase_demands where request_id=(mixed_result->>'id')::uuid and fulfilment_kind='purchase' and destination_id=stock_site.id)<>2
   or (select sum(qty) from public.purchase_demands where request_id=(mixed_result->>'id')::uuid and fulfilment_kind='purchase' and destination_id=second_site.id)<>2
   or (select count(*) from public.purchase_demands where request_id=(mixed_result->>'id')::uuid)<>3 then raise exception 'full5 need, stock1 and split buy2/2 were not retained'; end if;
 refused:=false;
 select jsonb_set(mixed,'{lines,0,stockProposals,0,locationId}',to_jsonb(warehouse_id)) into strict badline
 from public.purchasing_destinations where active and warehouse_id is not null and warehouse_id<>stock_site.warehouse_id order by id limit 1;
 begin
   perform public.purchasing_create_request_with_lines(p_purpose=>'general_purchase',p_destination_id=>d,
     p_lines=>jsonb_build_array(jsonb_build_object('request_context',badline,'submission_key',badkey)),p_fulfilment_intent=>'concrete_need');
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='invalid_param'; end;
 if not refused then raise exception 'stock location and destination site mismatch accepted'; end if;
 select count(*) into before_n from public.purchase_demands where created_by=auth.uid();
 badline:=jsonb_set(jsonb_set(jsonb_set(c#>'{lines,0}','{id}',to_jsonb(gen_random_uuid())), '{allocations,0,id}',to_jsonb(gen_random_uuid())),'{sku}','"TEST-UNKNOWN-CATALOG-SKU"');
 refused:=false;
 begin
   perform public.purchasing_create_request_with_lines(p_purpose=>'general_purchase',p_destination_id=>d,
     p_lines=>jsonb_build_array(jsonb_build_object('request_context',jsonb_set(c,'{lines}',(c->'lines')||jsonb_build_array(badline)),'submission_key',badkey)),p_fulfilment_intent=>'concrete_need');
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='unknown_sku'; end;
 if not refused or exists(select 1 from public.purchase_requests where created_by=auth.uid() and submission_key=badkey)
   or (select count(*) from public.purchase_demands where created_by=auth.uid())<>before_n then raise exception 'later line failure was not atomic'; end if;
 made:=public.purchasing_create_request_with_lines(p_purpose=>'ready_stock',p_destination_id=>d,
   p_lines=>jsonb_build_array(jsonb_build_object('request_context',rs,'submission_key',gen_random_uuid())),p_fulfilment_intent=>'additional_stock');
 if made->>'req_no' !~ '^RS[0-9]{6}-[0-9]{4}$' or not exists(select 1 from public.purchase_demands where request_id=(made->>'id')::uuid and qty=500) then raise exception 'manual RS500 admission/identity failed'; end if;
 legacy:=public.purchasing_create_request_with_lines(p_purpose=>'ready_stock',p_destination_id=>d,p_required_by=>'2026-11-10',
   p_lines=>jsonb_build_array(jsonb_build_object('sku',c#>>'{lines,0,sku}','qty',1,'attrs','{"TEST":"configuration"}'::jsonb,'required_by','2026-11-10')),
   p_fulfilment_intent=>'additional_stock');
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009699","role":"authenticated","app_metadata":{"role":"principal"}}',true);
 refused:=false;
 begin
   perform public.purchasing_decide_request((made->>'id')::uuid,'approve');
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='context_approval_not_ready'; end;
 if not refused or exists(select 1 from public.purchase_requests where id=(made->>'id')::uuid and approved_at is not null) then raise exception 'legacy decision certified an unstamped context'; end if;
 perform public.purchasing_decide_request((legacy->>'id')::uuid,'approve');
 if not exists(select 1 from public.purchase_requests where id=(legacy->>'id')::uuid and approved_at is not null and request_version=0)
   or not exists(select 1 from public.purchase_demands where request_id=(legacy->>'id')::uuid and attrs='{"TEST":"configuration"}'::jsonb and qty=1) then raise exception 'legacy create/configuration/approval regressed'; end if;
 raise notice 'Context create: exact scope/lineage, idempotency, changed-key refusal, atomic later-line failure and RS500 PASS';
end; $owner$;
reset role;
-- Private state reader stays private. Run these fixture assertions as the
-- isolated database owner after restoring role, never grant its use to callers.
do $state_test$
declare rid uuid; baseline jsonb; after_state jsonb; refused boolean; detail text;
begin
 select id into strict rid from public.purchase_requests where created_by='fffffff1-0000-4000-8000-000000009698' and purpose='general_purchase' and request_version=1 and jsonb_array_length(request_context#>'{lines,0,stockProposals}')=0;
 baseline:=public._purchasing_request_context_state(rid);
 if baseline->'context' is distinct from (select request_context from public.purchase_requests where id=rid)
   or baseline#>'{demands,0,approved_qty}' is distinct from 'null'::jsonb then raise exception 'state reader invented approved scope'; end if;
 refused:=false;
 begin
   update public.purchase_demands set qty=qty+1 where request_id=rid;
   perform public._purchasing_request_context_state(rid);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_scope_changed'; end;
 if not refused then raise exception 'changed demand qty passed contextual state guard'; end if;
 refused:=false;
 begin
   update public.purchase_demands set attrs='{"TEST":"changed configuration"}'::jsonb where request_id=rid;
   perform public._purchasing_request_context_state(rid);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_scope_changed'; end;
 if not refused then raise exception 'changed configuration passed contextual state guard'; end if;
 refused:=false;
 begin
   update public.purchase_requests set required_by=required_by+1 where id=rid;
   perform public._purchasing_request_context_state(rid);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_scope_changed'; end;
 if not refused then raise exception 'changed header date passed contextual state guard'; end if;
 after_state:=public._purchasing_request_context_state(rid);
 if after_state is distinct from baseline then raise exception 'refused state reads left fixture changes'; end if;
 select id into strict rid from public.purchase_requests where created_by='fffffff1-0000-4000-8000-000000009698' and purpose='general_purchase' and request_version=1 and jsonb_array_length(request_context#>'{lines,0,stockProposals}')=1;
 baseline:=public._purchasing_request_context_state(rid);
 if jsonb_array_length(baseline->'demands')<>3 or exists(select 1 from public.ops_stock_items where reserved_purchase_demand_id in (select id from public.purchase_demands where request_id=rid)) then raise exception 'mixed-scope proposal lost lineage or reserved Units'; end if;
 -- Synthetic LOCAL-only saved approval fixtures; the whole script rolls back.
 refused:=false;
 begin
   perform public._purchasing_assert_request_approval(rid);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_approval_unavailable'; end;
 if not refused then raise exception 'missing snapshot passed approval guard'; end if;
 update public.purchase_demands set approved_qty=qty where request_id=rid;
 baseline:=public._purchasing_request_context_state(rid);
 update public.purchase_requests set approved_at=now(),approved_by='fffffff1-0000-4000-8000-000000009699',
   approval_version=request_version,approval_scope=baseline where id=rid;
 if public._purchasing_assert_request_approval(rid) is distinct from baseline then raise exception 'exact approval scope refused'; end if;
 refused:=false;
 begin
   update public.purchase_requests set request_version=request_version+1 where id=rid;
   perform public._purchasing_assert_request_approval(rid);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_approval_changed'; end;
 if not refused then raise exception 'stale approval version passed'; end if;
 refused:=false;
 begin
   update public.purchase_demands set approved_qty=approved_qty-1 where request_id=rid;
   perform public._purchasing_assert_request_approval(rid);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_approval_changed'; end;
 if not refused then raise exception 'changed approved distribution passed'; end if;
 if public._purchasing_assert_request_approval(rid) is distinct from baseline then raise exception 'approval refusals left changes'; end if;
 -- Same-number revision admission as the actual synthetic requester.
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
 if public._purchasing_request_revision_scope(rid,'TEST correction') is distinct from baseline then raise exception 'approved unissued revision admission failed'; end if;
 refused:=false;
 begin
   perform public._purchasing_request_revision_scope(rid,'   ');
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='revision_reason_required'; end;
 if not refused then raise exception 'reasonless revision passed'; end if;
 refused:=false;
 begin
   update public.purchase_demands set issued_qty=1 where request_id=rid;
   perform public._purchasing_request_revision_scope(rid,'TEST correction');
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_already_issued'; end;
 if not refused then raise exception 'partially issued request passed no-PO revision admission'; end if;
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009699","role":"authenticated","app_metadata":{"role":"principal"}}',true);
 refused:=false;
 begin
   perform public._purchasing_request_revision_scope(rid,'TEST correction');
 exception when insufficient_privilege then get stacked diagnostics detail=pg_exception_detail; refused:=detail='not_requester'; end;
 if not refused then raise exception 'different actor passed requester revision admission'; end if;
 raise notice 'Revision admission: same saved scope retained, missing reason/non-requester/partially issued request refused PASS';
 raise notice 'Approval guard: missing snapshot refused, exact snapshot admitted, changed version/distribution refused PASS';
 raise notice 'Context state: exact material facts, unknown approval and quantity/configuration/header-date drift refusal PASS';
end; $state_test$;
-- LOCAL synthetic approval only: exercise the real resubmit RPC, never production.
do $revision_writer_test$
declare r public.purchase_requests%rowtype; c jsonb; envelope jsonb; key uuid:=gen_random_uuid(); result jsonb; retry jsonb; before_state jsonb; detail text; refused boolean; event_count integer; demand_count integer;
begin
 select * into strict r from public.purchase_requests where created_by='fffffff1-0000-4000-8000-000000009698' and request_version=1 and approved_at is not null;
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
 c:=jsonb_set(r.request_context,'{recipients,0,name}','"TEST revised recipient"');
 envelope:=jsonb_build_array(jsonb_build_object('request_context',c,'revision_key',key,'expected_version',1,'reason','TEST actual recipient correction'));
 result:=public.purchasing_resubmit_request(r.id,r.destination_id,r.required_by,p_lines=>envelope);
 retry:=public.purchasing_resubmit_request(r.id,r.destination_id,r.required_by,p_lines=>envelope);
 if result is distinct from retry or result->>'req_no' is distinct from r.req_no or result->>'request_version'<>'2' then raise exception 'same-number revision/retry failed'; end if;
 if not exists(select 1 from public.purchase_requests where id=r.id and request_version=2 and request_context=c and approved_at is null and approved_by is null and approval_scope is null and approval_version is null and round=r.round+1) then raise exception 'revision did not invalidate preceding approval'; end if;
 if (select count(*) from public.purchase_request_events where request_id=r.id and changes->>'revision_key'=key::text)<>1 then raise exception 'retry duplicated history'; end if;
 if not exists(select 1 from public.purchase_request_events where request_id=r.id and actor_id=auth.uid() and reason='TEST actual recipient correction' and changes#>'{previous_approval,approval_scope}'=r.approval_scope and changes#>'{before,context}'=r.request_context and changes->'after_context'=c) then raise exception 'revision lost prior approval or before/after evidence'; end if;
 if (select count(*) from public.purchase_demands where request_id=r.id and cancelled_at is not null)<>3 or (select count(*) from public.purchase_demands where request_id=r.id and cancelled_at is null)<>3 then raise exception 'revision lost demand history'; end if;
 before_state:=public._purchasing_request_context_state(r.id);
 refused:=false;
 begin
  perform public.purchasing_resubmit_request(r.id,r.destination_id,r.required_by,p_lines=>jsonb_set(envelope,'{0,request_context,recipients,0,name}','"TEST another recipient"'));
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='revision_scope_changed'; end;
 if not refused then raise exception 'changed retry scope accepted'; end if;
 refused:=false;
 begin
  perform public.purchasing_resubmit_request(r.id,r.destination_id,r.required_by,p_lines=>jsonb_set(envelope,'{0,revision_key}',to_jsonb(gen_random_uuid())));
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_version_changed'; end;
 if not refused then raise exception 'stale revision version accepted'; end if;
 -- A different pending revision cannot silently mutate this awaiting request.
 refused:=false;
 begin
  perform public.purchasing_resubmit_request(r.id,r.destination_id,r.required_by,p_lines=>jsonb_set(jsonb_set(envelope,'{0,revision_key}',to_jsonb(gen_random_uuid())),'{0,expected_version}','2'));
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_revision_unavailable'; end;
 if not refused then raise exception 'awaiting request silently editable'; end if;
 -- Returned request revision: a later unknown SKU must undo header, old-line
 -- cancellations, new demands and version together.
 update public.purchase_requests set sent_back_at=now(),sent_back_by='fffffff1-0000-4000-8000-000000009699',sent_back_reason='TEST correction' where id=r.id;
 select count(*) into demand_count from public.purchase_demands where request_id=r.id;
 c:=jsonb_set(c,'{lines,0,sku}','"TEST-UNKNOWN-REVISION-SKU"');
 refused:=false;
 begin
  perform public.purchasing_resubmit_request(r.id,r.destination_id,r.required_by,p_lines=>jsonb_build_array(jsonb_build_object('request_context',c,'revision_key',gen_random_uuid(),'expected_version',2,'reason','TEST unknown SKU')));
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='unknown_sku'; end;
 if not refused or public._purchasing_request_context_state(r.id) is distinct from before_state or (select count(*) from public.purchase_demands where request_id=r.id)<>demand_count then raise exception 'later-line revision refusal was not atomic'; end if;
 -- Complete the returned correction under the same number, then stamp it
 -- using the actual existing Purchasing Approver fixture and private writer.
 c:=jsonb_set(r.request_context,'{recipients,0,name}','"TEST final corrected recipient"');
 result:=public.purchasing_resubmit_request(r.id,r.destination_id,r.required_by,p_lines=>jsonb_build_array(jsonb_build_object('request_context',c,'revision_key',gen_random_uuid(),'expected_version',2,'reason','TEST returned correction')));
 if result->>'req_no' is distinct from r.req_no or result->>'request_version'<>'3' then raise exception 'returned correction changed permanent identity'; end if;
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009699","role":"authenticated","app_metadata":{"role":"principal"}}',true);
 before_state:=public._purchasing_stamp_context_approval(r.id);
 if before_state->>'request_version'<>'3' or not exists(select 1 from public.purchase_requests where id=r.id and approval_version=3 and approved_by=auth.uid() and approval_scope=before_state)
   or (select count(*) from public.purchase_request_events where request_id=r.id and kind='resubmitted')<>2 then raise exception 'same-number reapproval snapshot/history failed'; end if;
 refused:=false;
 begin
  perform public._purchasing_stamp_context_approval(r.id);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_not_awaiting_approval'; end;
 if not refused then raise exception 'already-approved request stamped twice'; end if;
 raise notice 'Private approval writer: actual qualified actor, same-number version3 reapproval, exact snapshot/history and duplicate decision refusal PASS';
 raise notice 'Revision writer: same number/version, one-event retry, approval invalidation/history, stale/pending refusal and later-SKU atomic rollback PASS';
end; $revision_writer_test$;
-- SC material source is read from its actual Case, never the first SO item.
do $case_source_test$
declare case_id uuid:=gen_random_uuid(); c jsonb; made jsonb; scope jsonb; refused boolean:=false; detail text;
begin
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009698","role":"authenticated","app_metadata":{"role":"operation"}}',true);
 insert into public.service_cases(id,case_no,customer_name,carres_action,what_affected,customer_wants,created_by)
 values(case_id,'TEST-CONTEXT-CASE','TEST customer','TEST approved procurement scope','TEST specific goods',array['replace'],auth.uid());
 select value||jsonb_build_object('purpose','service_case','serviceCaseId',case_id,'reason',null,'explanation','') into c from context_fixture;
 made:=public.purchasing_create_request_with_lines(p_purpose=>'service_case',p_destination_id=>(c#>>'{lines,0,allocations,0,destinationId}')::uuid,
  p_for_service_case_id=>case_id,p_lines=>jsonb_build_array(jsonb_build_object('request_context',c,'submission_key',gen_random_uuid())),p_fulfilment_intent=>'concrete_need');
 if made->>'req_no' !~ '^SC[0-9]{6}-[0-9]{4}$' then raise exception 'SC request identity invalid'; end if;
 perform set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009699","role":"authenticated","app_metadata":{"role":"principal"}}',true);
 scope:=public._purchasing_stamp_context_approval((made->>'id')::uuid);
 if scope#>>'{service_case_source,id}' is distinct from case_id::text or scope#>>'{service_case_source,carres_action}'<>'TEST approved procurement scope' then raise exception 'actual Case source not captured'; end if;
 begin
  update public.service_cases set carres_action='TEST changed remedy scope' where id=case_id;
  perform public._purchasing_assert_request_approval((made->>'id')::uuid);
 exception when invalid_parameter_value then get stacked diagnostics detail=pg_exception_detail; refused:=detail='request_approval_changed'; end;
 if not refused or public._purchasing_assert_request_approval((made->>'id')::uuid) is distinct from scope then raise exception 'Case source drift guard/rollback failed'; end if;
 raise notice 'SC source: actual Case procurement facts captured; changed remedy invalidates saved approval PASS (formal Case admission still open)';
end; $case_source_test$;
rollback;
