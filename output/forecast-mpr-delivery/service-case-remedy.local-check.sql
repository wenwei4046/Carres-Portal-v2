-- OWNED LOCAL TEST DATABASE ONLY; actual SQL roles/doors, all fixtures rolled back.
\set ON_ERROR_STOP on
begin;
\ir service-case-remedy-approval.draft.sql
update public.suppliers set address='TEST isolated address' where coalesce(btrim(address),'')='';
update public.warehouses set address='TEST isolated address' where coalesce(btrim(address),'')='';
update public.purchasing_destinations set address='TEST isolated address' where warehouse_id is null and coalesce(btrim(address),'')='';
set local session_replication_role=replica;
insert into auth.users(id,email) values ('fffffff1-0000-4000-8000-000000009698','TEST-sc-owner@carres.test'),('fffffff1-0000-4000-8000-000000009699','TEST-sc-approver@carres.test'),('fffffff1-0000-4000-8000-000000009700','TEST-sc-manager@carres.test');
insert into public.app_users(id,email,name,role,status,is_person) values
('fffffff1-0000-4000-8000-000000009698','TEST-sc-owner@carres.test','TEST requester','operation','active',true),
('fffffff1-0000-4000-8000-000000009699','TEST-sc-approver@carres.test','TEST approver','principal','active',true),
('fffffff1-0000-4000-8000-000000009700','TEST-sc-manager@carres.test','TEST manager','principal','active',true);
set local session_replication_role=origin;
select set_config('request.jwt.claims','{"sub":"fffffff1-0000-4000-8000-000000009700","role":"authenticated","app_metadata":{"role":"principal"}}',true);
select public.workspace_assign_duty('service_case_approver','fffffff1-0000-4000-8000-000000009699',current_date,null,'TEST local; rollback');
select public.workspace_assign_duty('purchasing_approver','fffffff1-0000-4000-8000-000000009699',current_date,null,'TEST local; rollback');
create temporary table sc_fixture(context jsonb);
insert into sc_fixture values ($json${"version": 1, "origin": "manual", "purpose": "service_case", "proceedDate": "2026-10-20", "stockDeliveryDate": null, "serviceCaseId": "fffffff2-0000-4000-8000-000000000001", "reason": null, "companyPersonName": "", "projectReference": "", "explanation": "", "forecastChangeReason": "", "recipients": [{"id": "00000000-0000-4000-8000-000000000001", "company": "TEST", "name": "TEST recipient", "phone": "TEST contact", "method": "delivery", "deliveryDate": "2026-11-20", "addressLine1": "TEST", "addressLine2": "TEST", "city": "TEST", "state": "TEST", "postcode": "TEST", "buildingType": "TEST", "floor": "100A", "lift": "has_lift", "pickupLocationId": null, "collectedBy": ""}], "lines": [{"id": "00000000-0000-4000-8000-000000000003", "sku": "TEST-SKU", "qty": 2, "attrs": null, "recipientNeeds": [{"recipientId": "00000000-0000-4000-8000-000000000001", "qty": 2}], "stockProposals": [], "allocations": [{"id": "00000000-0000-4000-8000-000000000004", "destinationId": "00000000-0000-4000-8000-000000000010", "supplierDeliveryDate": "2026-11-10", "qty": 1, "recipients": [{"recipientId": "00000000-0000-4000-8000-000000000001", "qty": 1}]}]}]}$json$);

\ir service-case-remedy.assertions.sql
rollback;
