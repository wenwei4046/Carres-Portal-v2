\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;
insert into auth.users(id,email) values ('fffffff1-0000-4000-8000-000000009696','TEST-principal-0696@carres.test'),('fffffff1-0000-4000-8000-000000009697','TEST-operation-0696@carres.test');
insert into public.app_users(id,email,name,role,status,is_person) values
('fffffff1-0000-4000-8000-000000009696','TEST-principal-0696@carres.test','TEST Principal','principal','active',true),
('fffffff1-0000-4000-8000-000000009697','TEST-operation-0696@carres.test','TEST Operation','operation','active',true);
set local session_replication_role=origin;
select set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009696","role":"authenticated","app_metadata":{"role":"principal"}}',true);
set local role authenticated;
select public.purchasing_set_request_settings(31,15,false);
select public.purchasing_set_request_settings(31,15,false);
do $audit$ begin
  if (select count(*) from public.purchasing_setting_changes where changed_by=auth.uid() and setting_key in ('purchase_request_normal_days','purchase_request_service_days','po_manual_whatsapp_screenshot_required'))<>3 then raise exception 'settings audit or no-op idempotency failed'; end if;
end; $audit$;
do $test$ begin
  if not exists(select 1 from public.purchasing_settings where id=1 and purchase_request_normal_days=31 and purchase_request_service_days=15 and not po_manual_whatsapp_screenshot_required) then raise exception 'atomic settings save failed'; end if;
  begin
    perform public.purchasing_set_request_settings(-1,14,true);
    raise exception 'negative day control failed';
  exception when invalid_parameter_value then null; end;
  if not exists(select 1 from public.purchasing_settings where id=1 and purchase_request_normal_days=31 and purchase_request_service_days=15 and not po_manual_whatsapp_screenshot_required) then raise exception 'refusal changed settings'; end if;
end; $test$;
reset role;
select set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009697","role":"authenticated","app_metadata":{"role":"operation"}}',true);
set local role authenticated;
do $test$ begin
  begin
    perform public.purchasing_set_request_settings(30,14,true);
    raise exception 'non-editor permission control failed';
  exception when insufficient_privilege then null; end;
  raise notice 'Owner save, negative-day atomicity and non-editor SQL gate PASS';
end; $test$;
reset role;
rollback;
