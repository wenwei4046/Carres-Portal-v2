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
 raise notice 'Approval guard: missing snapshot refused, exact snapshot admitted, changed version/distribution refused PASS';
 raise notice 'Context state: exact material facts, unknown approval and quantity/configuration/header-date drift refusal PASS';
end; $state_test$;
rollback;
