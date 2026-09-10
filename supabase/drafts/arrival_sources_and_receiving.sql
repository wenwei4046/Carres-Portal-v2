-- UNNUMBERED LOCAL DRAFT. Check production tracker and all refs before assigning
-- a migration number. Not applied. Owner-authorised Inbound source completion.
begin;
set search_path = public, pg_temp;

create table arrival_sources (
 id uuid primary key,
 source_no text not null,
 kind text not null check(kind in ('transfer','customer-return','failed-delivery-return','repair-return','supplier-replacement')),
 claim_id uuid references supplier_claims(id), case_id uuid references service_cases(id),
 case_approval jsonb,
 from_site_id uuid references warehouses(id), to_site_id uuid not null references warehouses(id),
 party_id uuid not null references stock_operating_parties(id),
 sales_order_ref text,
 expected_date date not null, collection_date date,
 reason text not null check(length(btrim(reason))>0),
 created_by uuid not null references app_users(id), created_at timestamptz not null default now(),
 cancelled_at timestamptz, cancel_reason text,
 check(kind <> 'transfer' or (from_site_id is not null and from_site_id <> to_site_id)),
 check(kind <> 'supplier-replacement' or claim_id is not null),
 check(kind <> 'repair-return' or claim_id is not null or case_id is not null),
 check(kind not in ('customer-return','failed-delivery-return') or case_id is not null),
 check(collection_date is null or collection_date <= expected_date),
 check(cancelled_at is null or length(btrim(cancel_reason))>0)
);
create table arrival_source_units (
 source_id uuid not null references arrival_sources(id),
 stock_item_id uuid not null references ops_stock_items(id),
 replaces_item_id uuid references ops_stock_items(id),
 status_before text not null, holder_before uuid references stock_operating_parties(id),
 primary key(source_id,stock_item_id),
 check(replaces_item_id is null or replaces_item_id <> stock_item_id)
);
create table arrival_source_events (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references arrival_sources(id),
 save_key uuid unique,
 kind text not null check(kind in ('planned','dates_changed','cancelled','collected','carrier_received','collection_refused')),
 unit_ids uuid[] not null default '{}',
 party_id uuid references stock_operating_parties(id), person text, evidence text,
 occurred_at timestamptz not null, recorded_at timestamptz not null default now(),
 actor_id uuid not null references app_users(id), payload jsonb not null default '{}'
);
create index arrival_source_units_item on arrival_source_units(stock_item_id);
create index arrival_source_events_source on arrival_source_events(source_id,recorded_at,id);
-- Same internal read boundary as Receiving. No client write policies.
alter table arrival_sources enable row level security;
alter table arrival_source_units enable row level security;
alter table arrival_source_events enable row level security;
create policy arrival_sources_read on arrival_sources for select to authenticated using ((select is_internal()) or (select is_operation()));
create policy arrival_source_units_read on arrival_source_units for select to authenticated using ((select is_internal()) or (select is_operation()));
create policy arrival_source_events_read on arrival_source_events for select to authenticated using ((select is_internal()) or (select is_operation()));
grant select on arrival_sources,arrival_source_units,arrival_source_events to authenticated;
revoke insert,update,delete on arrival_sources,arrival_source_units,arrival_source_events from authenticated,anon;

-- Evidence is private and scoped to the source and uploading actor.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('arrival-proofs','arrival-proofs',false,10485760,array['application/pdf','image/jpeg','image/png']) on conflict(id) do nothing;
create policy arrival_proofs_read on storage.objects for select to authenticated using(bucket_id='arrival-proofs' and ((select is_internal()) or (select is_operation())));
create policy arrival_proofs_upload on storage.objects for insert to authenticated with check(bucket_id='arrival-proofs' and (storage.foldername(name))[2]=(select auth.uid())::text and ((select is_internal()) or (select is_operation())) and exists(select 1 from arrival_sources where id::text=(storage.foldername(name))[1]));

-- Extend the existing GRN and result ledger; never a Warehouse receipt ledger.
alter table warehouse_receipts alter column po_id drop not null;
alter table warehouse_receipts add column arrival_source_id uuid references arrival_sources(id);
alter table warehouse_receipts add constraint receipt_has_one_source check ((po_id is null) <> (arrival_source_id is null));
create index warehouse_receipts_arrival_source on warehouse_receipts(arrival_source_id);

create function arrival_source_gate() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or app_role() is null or app_role() not in ('operation','principal') then
  raise exception 'operation or principal only' using errcode='42501';
 end if;
end $$;
revoke all on function arrival_source_gate() from public,anon,authenticated;

create function arrival_source_create(p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 s arrival_sources; u ops_stock_items; cl supplier_claims; ca service_cases;
 v_id uuid := (p_input->>'id')::uuid; v_kind text := p_input->>'kind';
 v_units uuid[]; v_unit_id uuid; v_new_id uuid; v_no text;
 v_claim uuid := nullif(p_input->>'claim_id','')::uuid;
 v_case uuid := nullif(p_input->>'case_id','')::uuid;
 v_from uuid := nullif(p_input->>'from_site_id','')::uuid;
 v_to uuid := (p_input->>'to_site_id')::uuid;
begin
 perform arrival_source_gate();
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 select * into s from arrival_sources where id=v_id;
 if found then
  if s.created_by <> auth.uid() or not exists(select 1 from arrival_source_events where source_id=v_id and kind='planned' and payload=p_input) then raise exception 'source key already used' using errcode='40001'; end if;
  return to_jsonb(s);
 end if;
 if v_kind not in ('transfer','customer-return','failed-delivery-return','repair-return','supplier-replacement') or nullif(btrim(p_input->>'reason'),'') is null then raise exception 'source type and reason required' using errcode='22023'; end if;
 select array_agg(value::uuid order by value) into v_units from jsonb_array_elements_text(p_input->'unit_ids');
 if coalesce(cardinality(v_units),0)=0 or cardinality(v_units)>200 or cardinality(v_units) <> (select count(distinct x) from unnest(v_units) x) then raise exception 'name each exact Unit once' using errcode='22023'; end if;
 if not exists(select 1 from stock_operating_parties where id=(p_input->>'party_id')::uuid and active) then raise exception 'choose an active operating party' using errcode='22023'; end if;
 if v_claim is not null then select * into cl from supplier_claims where id=v_claim for update; if not found then raise exception 'Claim not found' using errcode='P0002'; end if; end if;
 if v_case is not null then select * into ca from service_cases where id=v_case for update; if not found then raise exception 'Case not found' using errcode='P0002'; end if; end if;
 if v_case is not null then
  if coalesce((p_input->'case_approval'->>'approved')::boolean,false) is not true or nullif(btrim(p_input->'case_approval'->>'note'),'') is null or jsonb_typeof(p_input->'case_approval'->'condition_required') is distinct from 'boolean' or nullif(p_input->'case_approval'->>'photo_date','') is null then raise exception 'record the Case remedy approval and evidence first' using errcode='22023'; end if;
  if (p_input->'case_approval'->>'photo_date')::date>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'evidence date cannot be in the future' using errcode='22023'; end if;
  if jsonb_typeof(p_input->'case_approval'->'evidence_paths') is distinct from 'array' or jsonb_array_length(p_input->'case_approval'->'evidence_paths')=0 then raise exception 'Case evidence required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'case_approval'->'evidence_paths') path where not exists(select 1 from jsonb_array_elements(ca.evidence) file where file->>'path'=path and (not (p_input->'case_approval'->>'condition_required')::boolean or file->>'kind'='photo'))) then raise exception 'approval evidence must belong to the Case; condition review needs photos' using errcode='22023'; end if;
  if (p_input->'case_approval'->>'condition_required')::boolean and not coalesce(p_input->'case_approval'->'passed_conditions' @> '["no_stain","no_liquid_odour","no_pests","sanitary","no_tear_burn_cut","no_customer_damage","correct_item","safe_wrapped"]'::jsonb,false) then raise exception 'condition check failed or missing; do not book collection' using errcode='22023'; end if;
 end if;
 -- The owning outcome is read, never inferred from the independent execution layer.
 if v_kind='repair-return' and ((v_claim is not null and cl.customer_resolution is distinct from 'repair') or (v_claim is null and ca.order_id is null)) then raise exception 'record the authorised repair outcome in the Claim first' using errcode='22023'; end if;
 if v_kind='supplier-replacement' and (cl.id is null or cl.customer_resolution is distinct from 'replace') then raise exception 'record the authorised replacement outcome in the Claim first' using errcode='22023'; end if;
 if v_kind in ('customer-return','failed-delivery-return') and ca.order_id is null then raise exception 'the Case must name its Sales Order' using errcode='22023'; end if;
 v_no := case when v_kind='transfer' then allocate_formal_document_code('TR',v_id::text)
              when v_kind='repair-return' then allocate_formal_document_code('RO',v_id::text)
              when v_claim is not null then cl.claim_no else ca.case_no end;
 insert into arrival_sources(id,source_no,kind,claim_id,case_id,from_site_id,to_site_id,party_id,expected_date,collection_date,reason,created_by,sales_order_ref,case_approval)
 values(v_id,v_no,v_kind,v_claim,v_case,v_from,v_to,(p_input->>'party_id')::uuid,(p_input->>'expected_date')::date,nullif(p_input->>'collection_date','')::date,btrim(p_input->>'reason'),auth.uid(),nullif(btrim(p_input->>'sales_order_ref'),''),case when v_case is not null then (p_input->'case_approval')||jsonb_build_object('approved_by',auth.uid(),'approved_at',now()) else null end) returning * into s;
 foreach v_unit_id in array v_units loop
  select * into u from ops_stock_items where id=v_unit_id for update;
  if not found or u.qty<>1 then raise exception 'an exact Unit is required' using errcode='22023'; end if;
  if exists(select 1 from arrival_source_units au join arrival_sources a on a.id=au.source_id where (au.stock_item_id=u.id or au.replaces_item_id=u.id) and a.cancelled_at is null and not exists(select 1 from receiving_unit_results ur join warehouse_receipts r on r.id=ur.receipt_id where r.arrival_source_id=a.id and r.status='posted' and ur.stock_item_id=au.stock_item_id and ur.outcome in ('received','received_with_issue'))) then raise exception 'Unit already has open arrival work' using errcode='40001'; end if;
  if v_kind='transfer' and (u.warehouse_id is distinct from v_from or u.status not in ('free','reserved')) then raise exception 'Unit must be at origin and movable' using errcode='22023'; end if;
  if v_kind='repair-return' and (v_from is null or u.warehouse_id is distinct from v_from or u.status not in ('free','reserved','on_hold')) then raise exception 'repair needs the exact Units at the recorded origin Site' using errcode='22023'; end if;
  if v_kind='transfer' and u.reserved_ref is not null and u.reserved_ref is distinct from nullif(btrim(p_input->>'sales_order_ref'),'') then raise exception 'a reserved Unit requires its owning Sales Order transfer instruction' using errcode='22023'; end if;
  if v_kind in ('repair-return','supplier-replacement') and v_claim is not null and u.hold_claim_id is distinct from v_claim then raise exception 'Unit does not belong to this Claim' using errcode='22023'; end if;
  if v_kind in ('customer-return','failed-delivery-return') and u.sold_order_id is distinct from ca.order_id then raise exception 'Unit does not belong to the Case Sales Order' using errcode='22023'; end if;
  if v_kind='repair-return' and v_claim is null and u.sold_order_id is distinct from ca.order_id then raise exception 'Unit does not belong to the Case Sales Order' using errcode='22023'; end if;
  if v_kind in ('customer-return','failed-delivery-return') and u.status not in ('sold','transferred') then raise exception 'Unit is already at Carres; use its inspection work' using errcode='22023'; end if;
  if v_kind <> 'supplier-replacement' and u.status in ('voided','written_off','returned_to_supplier') then raise exception 'ended Unit cannot return on this source' using errcode='22023'; end if;
  if v_kind='supplier-replacement' then
   -- New physical object: allocate identity from the existing single authority.
   -- No po_no: the original PO Receiving door must never consume this separately
   -- authorised replacement. Original PO lineage remains through Claim/replaces_item_id.
   insert into ops_stock_items(unit_code,sku,warehouse_id,status,supplier,po_no,ownership,qty)
   values(allocate_unit_id(),u.sku,v_to,'incoming',u.supplier,null,u.ownership,1) returning id into v_new_id;
   insert into arrival_source_units values(v_id,v_new_id,u.id,'incoming',null);
  else insert into arrival_source_units values(v_id,u.id,null,u.status,u.holder_party_id); end if;
 end loop;
 insert into arrival_source_events(source_id,kind,occurred_at,actor_id,payload)
 values(v_id,'planned',now(),auth.uid(),p_input);
 return to_jsonb(s);
end $$;
revoke all on function arrival_source_create(jsonb) from public,anon;
grant execute on function arrival_source_create(jsonb) to authenticated;

create function arrival_source_handover(p_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s arrival_sources; u ops_stock_items; v_units uuid[]; v_id uuid; e arrival_source_events;
 v_kind text:=p_input->>'kind'; v_party uuid:=(p_input->>'party_id')::uuid;
begin
 perform arrival_source_gate();
 select * into s from arrival_sources where id=p_id for update;
 if not found then raise exception 'source not found' using errcode='P0002'; end if;
 select * into e from arrival_source_events where save_key=(p_input->>'key')::uuid;
 if found then
  if e.source_id<>p_id or e.actor_id<>auth.uid() or e.payload<>p_input then raise exception 'handover key already used' using errcode='40001'; end if;
  return to_jsonb(e);
 end if;
 if s.cancelled_at is not null then raise exception 'source is cancelled' using errcode='22023'; end if;
 if v_kind not in ('collected','carrier_received','collection_refused') or nullif(btrim(p_input->>'person'),'') is null or nullif(btrim(p_input->>'evidence'),'') is null then raise exception 'record actual handover, person and evidence' using errcode='22023'; end if;
 if (p_input->>'occurred_at')::timestamptz > now() then raise exception 'actual handover cannot be in the future' using errcode='22023'; end if;
 if coalesce((s.case_approval->>'condition_required')::boolean,false) and v_kind='carrier_received' and exists(select 1 from jsonb_array_elements_text(p_input->'unit_ids') uid where not exists(select 1 from arrival_source_events where source_id=p_id and kind='collected' and uid::uuid=any(unit_ids))) then raise exception 'record the accepted doorstep check before carrier receipt' using errcode='22023'; end if;
 if not exists(select 1 from stock_operating_parties where id=v_party and active) then raise exception 'party not found' using errcode='22023'; end if;
 if coalesce((s.case_approval->>'condition_required')::boolean,false) and v_kind in ('collected','collection_refused') then
  if jsonb_typeof(p_input->'collection_review'->'evidence_paths') is distinct from 'array' or jsonb_array_length(p_input->'collection_review'->'evidence_paths')=0 then raise exception 'doorstep condition photos required before loading' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements_text(p_input->'collection_review'->'evidence_paths') path where split_part(path,'/',1)<>p_id::text or not exists(select 1 from storage.objects where bucket_id='arrival-proofs' and name=path and lower(path) ~ '\.(jpg|jpeg|png)$')) then raise exception 'upload this source doorstep photos first' using errcode='22023'; end if;
  if v_kind='collected' and not coalesce(p_input->'collection_review'->'passed_conditions' @> '["no_stain","no_liquid_odour","no_pests","sanitary","no_tear_burn_cut","no_customer_damage","correct_item","safe_wrapped"]'::jsonb,false) then raise exception 'condition failed or missing; do not collect' using errcode='22023'; end if;
 end if;
 select array_agg(value::uuid order by value) into v_units from jsonb_array_elements_text(p_input->'unit_ids');
 if coalesce(cardinality(v_units),0)=0 or cardinality(v_units)>200 or cardinality(v_units)<>(select count(distinct x) from unnest(v_units) x) then raise exception 'name each Unit once' using errcode='22023'; end if;
 foreach v_id in array v_units loop
  select * into u from ops_stock_items where id=v_id for update;
  if not found or not exists(select 1 from arrival_source_units where source_id=p_id and stock_item_id=v_id) then raise exception 'Unit does not belong to source' using errcode='22023'; end if;

  -- A delayed fact may complete history, but a new custody write must still
  -- refer to the same physical journey that was authorised when planned.
  if v_kind<>'collection_refused'
   and not exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_id and wr.status='posted' and ur.stock_item_id=v_id and ur.outcome<>'not_received')
   and not exists(select 1 from arrival_source_events later where later.source_id=p_id and v_id=any(later.unit_ids) and later.kind in ('collected','carrier_received') and later.occurred_at>(p_input->>'occurred_at')::timestamptz) then
    if u.status in ('voided','written_off','returned_to_supplier') then raise exception 'Unit journey has ended' using errcode='40001'; end if;
    if not exists(select 1 from arrival_source_events where source_id=p_id and v_id=any(unit_ids) and kind in ('collected','carrier_received')) then
     if (s.kind='transfer' and (u.warehouse_id is distinct from s.from_site_id or u.status not in ('free','reserved') or (u.reserved_ref is not null and u.reserved_ref is distinct from s.sales_order_ref)))
       or (s.kind='repair-return' and (u.warehouse_id is distinct from s.from_site_id or u.status not in ('free','reserved','on_hold')))
       or (s.kind='supplier-replacement' and u.status<>'incoming')
       or (s.kind in ('customer-return','failed-delivery-return') and (u.status not in ('sold','transferred') or u.sold_order_id is distinct from (select order_id from service_cases where id=s.case_id)))
     then raise exception 'Unit has changed since planning; inspect its current journey' using errcode='40001'; end if;
    elsif u.status<>'transferred' or u.holder_party_id is distinct from (select party_id from arrival_source_events where source_id=p_id and v_id=any(unit_ids) and kind in ('collected','carrier_received') order by occurred_at desc,recorded_at desc,id desc limit 1) then
     raise exception 'Unit custody has changed outside this journey' using errcode='40001';
    end if;
  end if;
  if v_kind<>'collection_refused' and exists(select 1 from arrival_source_events where source_id=p_id and kind=v_kind and v_id=any(unit_ids)) then raise exception 'this Unit handover is already recorded' using errcode='40001'; end if;
  if v_kind='collected' and s.kind='transfer' and not exists(select 1 from arrival_source_events where source_id=p_id and kind='carrier_received' and v_id=any(unit_ids)) and not exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_id and wr.status='posted' and ur.stock_item_id=v_id and ur.outcome<>'not_received') and (u.warehouse_id is distinct from s.from_site_id or u.status not in ('free','reserved')) then raise exception 'Unit is no longer movable at origin' using errcode='40001'; end if;
 end loop;
 insert into arrival_source_events(source_id,save_key,kind,unit_ids,party_id,person,evidence,occurred_at,actor_id,payload)
 values(p_id,(p_input->>'key')::uuid,v_kind,v_units,v_party,btrim(p_input->>'person'),btrim(p_input->>'evidence'),(p_input->>'occurred_at')::timestamptz,auth.uid(),p_input) returning * into e;
 -- The individual handover changes only the named Units; origin Site remains
 -- their last confirmed Site until Receiving proves destination arrival.
 update ops_stock_items i set holder_party_id=v_party,status='transferred',updated_at=now() where i.id=any(v_units) and v_kind<>'collection_refused'
 and not exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_id and wr.status='posted' and ur.stock_item_id=i.id and ur.outcome<>'not_received')
 and not exists(select 1 from arrival_source_events later where later.source_id=p_id and i.id=any(later.unit_ids) and later.kind in ('collected','carrier_received') and later.occurred_at>e.occurred_at);
 return to_jsonb(e);
end $$;
revoke all on function arrival_source_handover(uuid,jsonb) from public,anon;
grant execute on function arrival_source_handover(uuid,jsonb) to authenticated;

create function arrival_source_plan(p_id uuid,p_input jsonb,p_cancel boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s arrival_sources;
begin
 perform arrival_source_gate();
 select * into s from arrival_sources where id=p_id for update;
 if not found then raise exception 'source not found' using errcode='P0002'; end if;
 if nullif(btrim(p_input->>'reason'),'') is null then raise exception 'reason required' using errcode='22023'; end if;
 if s.cancelled_at is not null then raise exception 'source already cancelled' using errcode='22023'; end if;
 if p_cancel then
  if exists(select 1 from arrival_source_events where source_id=p_id and kind in ('collected','carrier_received')) or exists(select 1 from warehouse_receipts where arrival_source_id=p_id and status='posted') then raise exception 'goods have moved; record the next physical journey' using errcode='22023'; end if;
  perform 1 from ops_stock_items i join arrival_source_units u on u.stock_item_id=i.id where u.source_id=p_id order by i.id for update of i;
  if exists(select 1 from arrival_source_units u join ops_stock_items i on i.id=u.stock_item_id where u.source_id=p_id and u.replaces_item_id is not null and i.status<>'incoming') then raise exception 'replacement Unit has changed; inspect its current journey before cancellation' using errcode='22023'; end if;
  update arrival_sources set cancelled_at=now(),cancel_reason=btrim(p_input->>'reason') where id=p_id;
  -- A cancelled replacement instruction ends only its unreceived new identities.
  update ops_stock_items i set status='voided',updated_at=now() from arrival_source_units u where u.source_id=p_id and u.stock_item_id=i.id and u.replaces_item_id is not null and i.status='incoming';
 else
  update arrival_sources set expected_date=(p_input->>'expected_date')::date,collection_date=nullif(p_input->>'collection_date','')::date where id=p_id;
 end if;
 insert into arrival_source_events(source_id,kind,occurred_at,actor_id,payload)
 values(p_id,case when p_cancel then 'cancelled' else 'dates_changed' end,now(),auth.uid(),jsonb_build_object('before',to_jsonb(s),'change',p_input));
 return (select to_jsonb(a) from arrival_sources a where id=p_id);
end $$;
revoke all on function arrival_source_plan(uuid,jsonb,boolean) from public,anon;
grant execute on function arrival_source_plan(uuid,jsonb,boolean) to authenticated;

create function receiving_arrival_post(p_source_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s arrival_sources; r warehouse_receipts; u ops_stock_items; v jsonb; v_units jsonb; v_lines jsonb;
 ctx jsonb; v_grn text; v_receipt uuid:=gen_random_uuid(); v_before jsonb:='{}'; v_after jsonb:='{}'; v_expected int; v_seen uuid[]:='{}'; v_id uuid;
 v_site uuid:=(p_input->>'actual_site_id')::uuid; v_holder uuid:=(p_input->>'holder_party_id')::uuid;
begin
 perform arrival_source_gate();
 ctx:=receiving_require_post_authority();
 select * into s from arrival_sources where id=p_source_id for update;
 if not found then raise exception 'source not found' using errcode='P0002'; end if;
 select * into r from warehouse_receipts where save_key=(p_input->>'key')::uuid;
 if found then
  if r.arrival_source_id is distinct from p_source_id or r.posted_by<>auth.uid() or not exists(select 1 from receiving_events where receipt_id=r.id and event='posted' and payload->'input'=p_input) then raise exception 'receiving key already used' using errcode='40001'; end if;
  return to_jsonb(r);
 end if;
 if s.cancelled_at is not null then raise exception 'source cancelled' using errcode='22023'; end if;
 if (p_input->>'goods_received_at')::date > (now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'actual receipt cannot be in the future' using errcode='22023'; end if;
 if not exists(select 1 from warehouses where id=v_site) or not exists(select 1 from stock_operating_parties where id=v_holder and active and kind in ('warehouse_operator','showroom','partner')) then raise exception 'record the actual Site and receiving party' using errcode='22023'; end if;
 if nullif(btrim(p_input->>'handover_person'),'') is null or nullif(btrim(p_input->>'do_number'),'') is null or nullif(btrim(p_input->>'do_file_path'),'') is null then raise exception 'handover person, document and proof required' using errcode='22023'; end if;
 if exists(select 1 from warehouse_receipts where arrival_source_id=p_source_id and status<>'voided' and lower(btrim(do_number))=lower(btrim(p_input->>'do_number'))) then raise exception 'this handover document already has a Receiving' using errcode='40001'; end if;
 if split_part(p_input->>'do_file_path','/',1)<>p_source_id::text or not exists(select 1 from storage.objects where bucket_id='arrival-proofs' and name=p_input->>'do_file_path') then raise exception 'upload this source handover proof first' using errcode='22023'; end if;
 v_units:=p_input->'units';
 if jsonb_typeof(v_units)<>'array' or jsonb_array_length(v_units)=0 or jsonb_array_length(v_units)>200 then raise exception 'record exact Unit outcomes' using errcode='22023'; end if;
 if not exists(select 1 from jsonb_array_elements(v_units) x where x->>'outcome' in ('received','received_with_issue')) then raise exception 'record at least one received Unit' using errcode='22023'; end if;
 -- Lock all named Units in deterministic order. Omitted Units retain their
 -- last confirmed holder; no quantity-based or whole-source transition.
 for v in select value from jsonb_array_elements(v_units) order by value->>'stock_item_id' loop
  v_id:=(v->>'stock_item_id')::uuid;
  if v_id=any(v_seen) then raise exception 'Unit scanned twice' using errcode='22023'; end if;
  v_seen:=array_append(v_seen,v_id);
  select * into u from ops_stock_items where id=v_id for update;
  if not found or u.qty<>1 or not exists(select 1 from arrival_source_units where source_id=p_source_id and stock_item_id=v_id) then raise exception 'Unit not expected on this source' using errcode='22023'; end if;
  if coalesce(v->>'outcome','') not in ('received','received_with_issue','not_received') or ((v->>'outcome'='received_with_issue') <> (nullif(v->>'issue_kind','') is not null)) or (nullif(v->>'issue_kind','') is not null and v->>'issue_kind' not in ('damaged','wrong_item')) then raise exception 'record a valid per-Unit result' using errcode='22023'; end if;
  if v->>'outcome'<>'not_received' and exists(select 1 from receiving_unit_results ur join warehouse_receipts wr on wr.id=ur.receipt_id where wr.arrival_source_id=p_source_id and wr.status='posted' and ur.stock_item_id=v_id and ur.outcome<>'not_received') then raise exception 'Unit already received on this source' using errcode='40001'; end if;
  v_before:=v_before||jsonb_build_object(u.id::text,to_jsonb(u));
  if v->>'outcome'<>'not_received' and u.status in ('voided','written_off','returned_to_supplier') then raise exception 'ended Unit cannot be received' using errcode='22023'; end if;
 end loop;
 -- Keep the existing line-based GRN readers usable. Commercial PO quantities
 -- are not touched: these lines describe only the exact named physical results.
 select jsonb_agg(jsonb_build_object('id',i.id,'sku',i.sku,'received_now',case when x->>'outcome'='received' then 1 else 0 end,'damaged_qty',case when x->>'issue_kind'='damaged' then 1 else 0 end,'wrong_item_qty',case when x->>'issue_kind'='wrong_item' then 1 else 0 end,'units',jsonb_build_array(x||jsonb_build_object('unit_code',i.unit_code)))) into v_lines
 from jsonb_array_elements(v_units) x join ops_stock_items i on i.id=(x->>'stock_item_id')::uuid;
 v_grn:=allocate_formal_document_code('GRN',v_receipt::text);
 insert into warehouse_receipts(id,arrival_source_id,warehouse_id,actual_site_id,do_number,do_file_path,note,lines,status,submitted_from,goods_received_at,submitted_by,posted_by,posted_at,grn_no,save_key,posted_duty_holder,posted_duty_cover,posted_authority)
 values(v_receipt,p_source_id,v_site,v_site,btrim(p_input->>'do_number'),btrim(p_input->>'do_file_path'),nullif(btrim(p_input->>'note'),''),v_lines,'posted','office',(p_input->>'goods_received_at')::date,auth.uid(),auth.uid(),now(),v_grn,(p_input->>'key')::uuid,nullif(ctx->>'normal_user_id','')::uuid,nullif(ctx->>'acting_user_id','')::uuid,case when coalesce((ctx->>'is_superuser')::boolean,false) and auth.uid() is distinct from nullif(ctx->>'actor_user_id','')::uuid then 'superuser' when coalesce((ctx->>'is_cover')::boolean,false) and auth.uid()=nullif(ctx->>'acting_user_id','')::uuid then 'cover' else 'grn_duty' end) returning * into r;
 perform receiving_record_unit_results(v_receipt,v_lines);
 for v in select value from jsonb_array_elements(v_units) loop
  if v->>'outcome'='not_received' then continue; end if;
  v_id:=(v->>'stock_item_id')::uuid;
  select * into u from ops_stock_items where id=v_id;
  update ops_stock_items set warehouse_id=v_site,holder_party_id=v_holder,last_verified_at=now(),
   status=case when reserved_ref is not null then 'reserved' when s.kind in ('customer-return','failed-delivery-return','repair-return') or v->>'outcome'='received_with_issue' then 'on_hold' else 'free' end,
   needs_repair=case when reserved_ref is not null and (s.kind in ('customer-return','failed-delivery-return','repair-return') or v->>'outcome'='received_with_issue') then true else needs_repair end,
   hold_reason=case when s.kind in ('customer-return','failed-delivery-return') then 'customer_return' when s.kind='repair-return' or v->>'outcome'='received_with_issue' then 'inspection' else hold_reason end,
   held_at=case when s.kind in ('customer-return','failed-delivery-return','repair-return') or v->>'outcome'='received_with_issue' then now() else held_at end,
   updated_at=now() where id=v_id;
 end loop;
 select jsonb_object_agg(i.id::text,to_jsonb(i)) into v_after from ops_stock_items i where i.id=any(v_seen);
 insert into receiving_events(receipt_id,event,actor_id,payload) values(v_receipt,'posted',auth.uid(),jsonb_build_object('source_id',p_source_id,'input',p_input,'lines',v_lines,'duty',ctx,'before_units',v_before,'after_units',v_after));
 return to_jsonb(r);
end $$;
revoke all on function receiving_arrival_post(uuid,jsonb) from public,anon;
grant execute on function receiving_arrival_post(uuid,jsonb) to authenticated;

create or replace function public.ops_stock_hold_transition_guard()
returns trigger
language plpgsql
as $fn$
begin
  -- Only the exact Unit named by today's authenticated, RPC-only physical
  -- evidence may enter transit/inspection from an otherwise blocked state.
  if tg_op='UPDATE' and exists(
    select 1 from receiving_events e join warehouse_receipts r on r.id=e.receipt_id
    where r.arrival_source_id is not null and e.event='voided' and e.actor_id=auth.uid()
      and (e.payload->>'voided_at')::timestamptz=now()
      and e.payload->'before_units'->old.id::text->>'status'=new.status
  ) then return new; end if;
  if tg_op='UPDATE' and old.status not in ('voided','returned_to_supplier','written_off') then
    if new.status='transferred' and old.status='on_hold' and exists(
      select 1 from arrival_source_events e join arrival_sources s on s.id=e.source_id
      where s.kind='repair-return' and old.id=any(e.unit_ids)
        and e.kind in ('collected','carrier_received') and e.recorded_at=now() and e.actor_id=auth.uid()
    ) then return new; end if;
    if new.status='on_hold' and new.hold_reason in ('inspection','customer_return') and exists(
      select 1 from receiving_unit_results ur join warehouse_receipts r on r.id=ur.receipt_id
      where r.arrival_source_id is not null and r.status='posted' and r.posted_at=now()
        and r.posted_by=auth.uid() and ur.stock_item_id=old.id and ur.outcome<>'not_received'
    ) then return new; end if;
  end if;
  if tg_op = 'DELETE' then
    if old.status = 'on_hold' then
      raise exception
        'unit % is on hold under an open supplier claim and cannot be deleted', old.id
        using errcode = 'P0001', detail = 'held_unit_not_deletable';
    end if;
    -- 0341 (Card 2): identity permanence. A unit that is reserved, sold,
    -- transferred or terminally resolved is a business record; it can be
    -- released, resolved or written off, never deleted. Hard delete stays
    -- ONLY for mis-keyed rows that never carried a commitment.
    if old.status not in ('incoming','free','voided') then
      raise exception
        'unit % is % — a committed unit is resolved, never deleted', old.id, old.status
        using errcode = 'P0001', detail = 'unit_committed_not_deletable';
    end if;
    return old;
  end if;

  if new.status is distinct from old.status then
    -- Leaving quarantine: three ways out, and none of them sells the unit.
    if old.status = 'on_hold'
       and new.status not in ('free','returned_to_supplier','written_off') then
      raise exception
        'unit % is on hold: it cannot become %, only free, returned_to_supplier or written_off',
        old.id, new.status
        using errcode = 'P0001', detail = 'held_unit_not_available';
    end if;

    -- 0341: a claimless inspection hold can never leave as returned_to_supplier
    -- — a supplier return without a claim would bypass the claims engine.
    if old.status = 'on_hold'
       and new.status = 'returned_to_supplier'
       and old.hold_claim_id is null then
      raise exception
        'unit % is held without a supplier claim — it cannot be returned to a supplier', old.id
        using errcode = 'P0001', detail = 'return_needs_claim';
    end if;

    -- Goods that physically left do not come back.
    if old.status in ('returned_to_supplier','written_off') then
      raise exception
        'unit % already left as % — a replacement is a new unit, not this one',
        old.id, old.status
        using errcode = 'P0001', detail = 'terminal_unit_status';
    end if;

    -- Entering quarantine — two doors, decided by the REASON (0341):
    --   damaged/wrong_item        = receiving's claim quarantine, from 'incoming'
    --                               only (0299's law, unchanged).
    --   customer_return/inspection = the Card 2 inspection door, from the pool
    --                               ('free') or a reservation ('reserved') only.
    if new.status = 'on_hold' then
      if coalesce(new.hold_reason, '') in ('customer_return','inspection') then
        if old.status not in ('free','reserved') then
          raise exception
            'an inspection hold takes a pool or reserved unit (unit % is %)', old.id, old.status
            using errcode = 'P0001', detail = 'inspection_hold_needs_pool_unit';
        end if;
      elsif old.status <> 'incoming' then
        raise exception
          'only an arriving unit can be put on hold (unit % is %)', old.id, old.status
          using errcode = 'P0001', detail = 'hold_only_from_incoming';
      end if;
    end if;
  end if;

  return new;
end;
$fn$;

create function receiving_arrival_void(p_receipt_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r warehouse_receipts; p jsonb; old_u ops_stock_items; now_u ops_stock_items; ur receiving_unit_results;
begin
 perform arrival_source_gate(); perform receiving_require_post_authority();
 select * into r from warehouse_receipts where id=p_receipt_id for update;
 if not found or r.arrival_source_id is null then raise exception 'arrival Receiving not found' using errcode='P0002'; end if;
 perform 1 from arrival_sources where id=r.arrival_source_id for update;
 if r.status='voided' then return to_jsonb(r); end if;
 if r.status<>'posted' or nullif(btrim(p_reason),'') is null then raise exception 'valid Receiving and reason required' using errcode='22023'; end if;
 select payload into p from receiving_events where receipt_id=r.id and event='posted';
 for ur in select * from receiving_unit_results where receipt_id=r.id and outcome<>'not_received' order by stock_item_id loop
  select * into now_u from ops_stock_items where id=ur.stock_item_id for update;
  if p->'after_units'->ur.stock_item_id::text is distinct from to_jsonb(now_u) then raise exception 'Unit % changed after Receiving; correct its later record first',ur.unit_code using errcode='40001'; end if;
 end loop;
 insert into receiving_events(receipt_id,event,actor_id,payload) values(r.id,'voided',auth.uid(),jsonb_build_object('reason',btrim(p_reason),'before_units',p->'before_units','voided_at',now()));
 for ur in select * from receiving_unit_results where receipt_id=r.id and outcome<>'not_received' order by stock_item_id loop
  select * into old_u from jsonb_populate_record(null::ops_stock_items,p->'before_units'->ur.stock_item_id::text);
  update ops_stock_items set warehouse_id=old_u.warehouse_id,holder_party_id=old_u.holder_party_id,status=old_u.status,needs_repair=old_u.needs_repair,hold_reason=old_u.hold_reason,held_at=old_u.held_at,last_verified_at=old_u.last_verified_at,updated_at=now() where id=ur.stock_item_id;
 end loop;
 update warehouse_receipts set status='voided',void_at=now(),void_by=auth.uid(),void_reason=btrim(p_reason) where id=r.id returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function receiving_arrival_void(uuid,text) from public,anon;
grant execute on function receiving_arrival_void(uuid,text) to authenticated;

commit;
