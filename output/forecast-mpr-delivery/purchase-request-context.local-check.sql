-- LOCAL TEST DATABASE ONLY. TEST context; all fixtures rolled back.
-- Requires the WIP validator draft and at least one seeded active destination.
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
rollback;
