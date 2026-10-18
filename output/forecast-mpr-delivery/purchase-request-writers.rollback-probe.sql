-- REVIEW / LOCAL REHEARSAL ONLY. NOT APPROVED. Never execute on production before approval.
-- Exact draft SHA256 475a87f26feacfa2080aa337ae13a275a6054da2b71e8bd3de019f6ba958e8f1. Deliberate final exception rolls ALL DDL back.
-- Relative before/after checks only; no fixed production transaction-count assumptions.
do $request_writer_probe$
declare before_cancellations bigint:=0; after_cancellations bigint; before_counts jsonb; before_rls text; before_policies text; before_settings text; item jsonb; function_oid regprocedure; invalid_refused boolean:=false; no_account_refused boolean:=false; closed_refused boolean:=false; closed_tag text; trigger_count integer;
begin
 if to_regclass('public.po_goods_cancellation_events') is not null then execute 'select count(*) from public.po_goods_cancellation_events' into before_cancellations; end if;
 before_counts:=jsonb_build_object('requests',(select count(*) from public.purchase_requests),'demands',(select count(*) from public.purchase_demands),'events',(select count(*) from public.purchase_request_events),'pos',(select count(*) from public.purchase_orders),'po_lines',(select count(*) from public.purchase_order_lines),'po_sources',(select count(*) from public.po_line_sources),'units',(select count(*) from public.ops_stock_items),'audit',(select count(*) from public.audit_log),'receipts',(select count(*) from public.warehouse_receipts),'receiving_events',(select count(*) from public.receiving_events),'claims',(select count(*) from public.supplier_claims),'approvals',(select count(*) from public.approvals)); before_rls:=(select md5(string_agg(c.relname||':'||c.relrowsecurity::text,',' order by c.relname)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relname<>'po_goods_cancellation_events'); before_policies:=(select md5(coalesce(string_agg(tablename||':'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''),',' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename<>'po_goods_cancellation_events'); before_settings:=(select md5(to_jsonb(s)::text) from public.purchasing_settings s where id=1);
 execute $carres_exact_context_writer_ddl$-- WORK IN PROGRESS, NOT APPROVED, NOT A MIGRATION. Never apply to production.
-- Core canonical create/revision/approval/Stock/partial-issue/readback is implemented
-- and rehearsed locally. Explicit rollout gaps remain in the adjacent review JSON.
-- Draft contextual request validation: one owning SQL transaction rechecks conservation.
-- Direct RPC callers must satisfy the same required fields and JSON types as
-- the shared schema; SQL NULL is never accepted as an omitted required field.
-- Disabled installation requires no already-active contextual records. Do not
-- silently freeze a separately activated deployment; reconcile it before install.
do $context_install_precondition$
begin
 if exists(select 1 from public.purchase_requests where request_version>0 or request_context is not null) then
  raise exception 'Existing contextual records require deployment review' using errcode='55000',detail='request_context_install_conflict';
 end if;
end;
$context_install_precondition$;
-- WIP reviewed-kind expansion, preserves every existing history kind.
alter table public.purchase_request_events drop constraint if exists purchase_request_events_kind_check;
alter table public.purchase_request_events add constraint purchase_request_events_kind_check
 check(kind in ('sent_back','resubmitted','withdrawn','stock_allocated','approved','po_issued'));

-- Installation is not activation. This private admission stays closed until a
-- separately reviewed activation changes these exact bytes. No user setting,
-- GUC, applicant flag or browser state can open it; no new permission exists.
create or replace function public._purchasing_context_writer_admission()
returns void language plpgsql set search_path=public,pg_temp as $context_closed$
begin
 raise exception 'Not available' using errcode='55000',detail='request_context_not_enabled';
end;
$context_closed$;
revoke all on function public._purchasing_context_writer_admission() from public,anon,authenticated;

-- Per-SKU source consistency only: no business row, status, stock or permission
-- is written. Same-SKU contention fails atomically with the existing409 refresh
-- contract; unrelated SKUs remain independent. No global Stock/Orders freeze.
create or replace function public._purchasing_context_source_locks(p_skus text[])
returns void language plpgsql set search_path=public,pg_temp as $source_locks$
declare sku text;
begin
 for sku in select distinct s collate "C" from unnest(coalesce(p_skus,'{}')) s where s is not null order by 1 loop
  if not pg_try_advisory_xact_lock(hashtextextended('purchasing.context.forecast-source:'||sku,0)) then
   raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='request_source_busy';
  end if;
 end loop;
end;
$source_locks$;
revoke all on function public._purchasing_context_source_locks(text[]) from public,anon,authenticated;

-- Owner-table writes join the same mutex, including inserts (phantoms). The
-- trigger never changes NEW/OLD and never becomes another source-data writer.
create or replace function public._purchasing_context_source_write_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $source_write_guard$
declare keys text[]:='{}';
begin
 if tg_table_name='po_line_sources' then
  select array_agg(distinct l.sku order by l.sku) into keys from public.purchase_order_lines l
   where l.id=case when tg_op='INSERT' then new.po_line_id else old.po_line_id end
      or (tg_op='UPDATE' and l.id=new.po_line_id);
 elsif tg_table_name='suppliers' then
  select array_agg(distinct s.sku order by s.sku) into keys from public.product_skus s where s.supplier_id=old.id;
 elsif tg_table_name in ('purchasing_supplier_settings','purchasing_production_days') then
  select array_agg(distinct s.sku order by s.sku) into keys from public.product_skus s
   where s.supplier_id=case when tg_op='INSERT' then new.supplier_id else old.supplier_id end or (tg_op='UPDATE' and s.supplier_id=new.supplier_id);
 elsif tg_table_name='orders' then
  select array_agg(distinct l.sku order by l.sku) into keys from public.order_lines l where l.order_id=old.id;
 elsif tg_table_name='purchase_orders' then
  select array_agg(distinct l.sku order by l.sku) into keys from public.purchase_order_lines l where l.po_id=old.id;
 elsif tg_table_name='product_models' then
  select array_agg(distinct s.sku order by s.sku) into keys from public.product_skus s where s.model_id=old.id;
 elsif tg_table_name='purchase_requests' then
  if old.purpose='ready_stock' or (tg_op='UPDATE' and new.purpose='ready_stock') then
   select array_agg(distinct d.sku order by d.sku) into keys from public.purchase_demands d where d.request_id=old.id;
  end if;
 elsif tg_table_name='purchase_demands' then
  if tg_op<>'INSERT' and old.purpose='ready_stock' then keys:=keys||old.sku; end if;
  if tg_op<>'DELETE' and new.purpose='ready_stock' then keys:=keys||new.sku; end if;
 else
  if tg_op<>'INSERT' then keys:=keys||old.sku; end if;
  if tg_op<>'DELETE' then keys:=keys||new.sku; end if;
 end if;
 perform public._purchasing_context_source_locks(keys);
 if tg_op='DELETE' then return old; else return new; end if;
end;
$source_write_guard$;
revoke all on function public._purchasing_context_source_write_guard() from public,anon,authenticated;

-- New technical guards; existing owner triggers, business gates and RLS remain.
drop trigger if exists purchasing_context_source_guard on public.ops_stock_items;
create trigger purchasing_context_source_guard before insert or update or delete on public.ops_stock_items for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.purchase_order_lines;
create trigger purchasing_context_source_guard before insert or update or delete on public.purchase_order_lines for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.order_lines;
create trigger purchasing_context_source_guard before insert or update or delete on public.order_lines for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.product_skus;
create trigger purchasing_context_source_guard before insert or update or delete on public.product_skus for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.purchase_demands;
create trigger purchasing_context_source_guard before insert or update or delete on public.purchase_demands for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.orders;
create trigger purchasing_context_source_guard before update of status,placed_at,source_system or delete on public.orders for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.purchase_orders;
create trigger purchasing_context_source_guard before update or delete on public.purchase_orders for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.product_models;
create trigger purchasing_context_source_guard before update of category,model_key or delete on public.product_models for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.purchase_requests;
create trigger purchasing_context_source_guard before update or delete on public.purchase_requests for each row execute function public._purchasing_context_source_write_guard();

-- Supplier settings inserts must join the same mutex too: a missing row's
-- published default cannot change via a phantom insert during source admission.
drop trigger if exists purchasing_context_source_guard on public.purchasing_supplier_settings;
create trigger purchasing_context_source_guard before insert or update or delete on public.purchasing_supplier_settings for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.purchasing_production_days;
create trigger purchasing_context_source_guard before insert or update or delete on public.purchasing_production_days for each row execute function public._purchasing_context_source_write_guard();
drop trigger if exists purchasing_context_source_guard on public.suppliers;
create trigger purchasing_context_source_guard before update of kind or delete on public.suppliers for each row execute function public._purchasing_context_source_write_guard();

-- Before taking a request root lock, its RS writers take the same SKU keys.
-- New/proposed SKUs are included by the resubmit/create caller as appropriate.
create or replace function public._purchasing_context_request_source_locks(p_id uuid)
returns void language plpgsql set search_path=public,pg_temp as $request_source_locks$
declare keys text[];
begin
 if exists(select 1 from public.purchase_requests where id=p_id and request_version>0) then perform public._purchasing_context_writer_admission(); end if;
 select array_agg(distinct d.sku order by d.sku) into keys from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id
  where r.id=p_id and r.request_version>0 and r.purpose='ready_stock';
 perform public._purchasing_context_source_locks(keys);
end;
$request_source_locks$;
revoke all on function public._purchasing_context_request_source_locks(uuid) from public,anon,authenticated;

-- The EXISTING PO source owner gains request-demand attribution; no fake SO,
-- second source ledger, role/RLS policy, historical backfill or duplicate PO line.
alter table public.po_line_sources add column if not exists purchase_demand_id uuid references public.purchase_demands(id);
alter table public.po_line_sources alter column order_id drop not null;
alter table public.po_line_sources drop constraint if exists po_line_sources_exact_source_owner;
alter table public.po_line_sources add constraint po_line_sources_exact_source_owner check(
 (order_id is not null and purchase_demand_id is null) or
 (order_id is null and order_line_id is null and so is null and purchase_demand_id is not null));
create index if not exists po_line_sources_purchase_demand_idx on public.po_line_sources(purchase_demand_id,po_line_id) where purchase_demand_id is not null;
drop trigger if exists purchasing_context_source_guard on public.po_line_sources;
create trigger purchasing_context_source_guard before insert or update or delete on public.po_line_sources for each row execute function public._purchasing_context_source_write_guard();

-- One source projection, including the real historical single-demand pointer.
-- A generic source row takes precedence; its quantity is never counted twice.
create or replace function public._purchasing_po_request_sources(p_line_id uuid)
returns table(source_id uuid,demand_id uuid,qty integer) language sql stable set search_path=public,pg_temp as $request_sources$
 select s.id,s.purchase_demand_id,s.qty from public.po_line_sources s where s.po_line_id=p_line_id and s.purchase_demand_id is not null
 union all
 select null::uuid,l.demand_id,l.qty from public.purchase_order_lines l where l.id=p_line_id and l.demand_id is not null
  and not exists(select 1 from public.po_line_sources s where s.po_line_id=l.id and s.purchase_demand_id is not null);
$request_sources$;
revoke all on function public._purchasing_po_request_sources(uuid) from public,anon,authenticated;

create or replace function public._purchasing_context_object(p_value jsonb, p_shape jsonb)
returns void language plpgsql set search_path=public,pg_temp as $shape$
declare k text; expected text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' then
    raise exception 'context object required' using errcode='22023',detail='invalid_param';
  end if;
  if exists(select 1 from jsonb_object_keys(p_value) x where not p_shape ? x) then
    raise exception 'unknown context field' using errcode='22023',detail='invalid_param';
  end if;
  for k,expected in select key,value from jsonb_each_text(p_shape) loop
    if not p_value ? k or not (jsonb_typeof(p_value->k)=any(string_to_array(expected,'|'))) then
      raise exception 'missing or invalid context field: %',k using errcode='22023',detail='invalid_param';
    end if;
    if expected='number' and (p_value->>k)!~'^[0-9]+$' then
      raise exception 'whole quantity required' using errcode='22023',detail='invalid_param';
    end if;
  end loop;
end;
$shape$;
revoke all on function public._purchasing_context_object(jsonb,jsonb) from public,anon,authenticated;

create or replace function public._purchasing_validate_request_context(p_context jsonb)
returns void language plpgsql set search_path = public, pg_temp as $fn$
declare
  v_line jsonb; v_recipient jsonb; v_allocation jsonb; v_stock jsonb;
  v_purpose text := p_context->>'purpose'; v_qty integer; v_stock_qty integer;
  v_fact jsonb; v_floor_days integer; v_settings public.purchasing_settings%rowtype; v_requested integer; v_allocated integer; v_recipient_id text;
begin
  perform public._purchasing_context_object(p_context,'{"version":"number","origin":"string","purpose":"string","proceedDate":"string","stockDeliveryDate":"string|null","serviceCaseId":"string|null","reason":"string|null","companyPersonName":"string","projectReference":"string","explanation":"string","forecastChangeReason":"string","recipients":"array","lines":"array"}'::jsonb);
  if jsonb_typeof(p_context) <> 'object' or jsonb_typeof(p_context->'version') is distinct from 'number' or p_context->>'version' is distinct from '1'
     or v_purpose is null or v_purpose not in ('general_purchase','service_case','ready_stock')
     or jsonb_typeof(p_context->'lines') is distinct from 'array'
     or jsonb_array_length(p_context->'lines') = 0
     or jsonb_typeof(p_context->'recipients') is distinct from 'array' then
    raise exception 'invalid purchase context' using errcode='22023', detail='invalid_param';
  end if;
  if (p_context->>'proceedDate')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'ISO date required' using errcode='22023'; end if;
  perform (p_context->>'proceedDate')::date;
  if p_context->>'proceedDate' is null then
    raise exception 'proceed date is required' using errcode='22023', detail='invalid_param';
  end if;
  if exists (select 1 from jsonb_object_keys(p_context) k where k not in
    ('version','origin','purpose','proceedDate','stockDeliveryDate','serviceCaseId','reason',
     'companyPersonName','projectReference','explanation','forecastChangeReason','recipients','lines')) then
    raise exception 'unknown purchase field' using errcode='22023', detail='invalid_param';
  end if;
  select * into v_settings from public.purchasing_settings where id=1;
  if not found or v_settings.purchase_request_normal_days is null or v_settings.purchase_request_normal_days<0
    or v_settings.purchase_request_service_days is null or v_settings.purchase_request_service_days<0 then
    raise exception 'purchase request date settings unavailable' using errcode='22023',detail='request_settings_unavailable';
  end if;
  v_floor_days:=case when v_purpose='service_case' then v_settings.purchase_request_service_days else v_settings.purchase_request_normal_days end;
  if v_purpose='ready_stock' then
    if p_context->'stockDeliveryDate'='null'::jsonb or (p_context->>'stockDeliveryDate')!~'^\d{4}-\d{2}-\d{2}$'
      or (p_context->>'stockDeliveryDate')::date < (p_context->>'proceedDate')::date+v_floor_days then
      raise exception 'stock request Delivery Date is missing or too early' using errcode='22023',detail='recipient_date_too_early';
    end if;
  elsif p_context->'stockDeliveryDate'<>'null'::jsonb then
    raise exception 'recipient dates belong to their recipients' using errcode='22023',detail='invalid_param';
  end if;
  if p_context->>'origin' is null or (v_purpose='ready_stock' and p_context->>'origin' not in ('stock_request','forecast_suggestion'))
    or (v_purpose<>'ready_stock' and p_context->>'origin' is distinct from 'manual') then
    raise exception 'entry does not match purpose' using errcode='22023', detail='invalid_param';
  end if;
  if v_purpose='ready_stock' and jsonb_array_length(p_context->'recipients') <> 0 then
    raise exception 'stock has no final recipient' using errcode='22023', detail='invalid_param';
  elsif v_purpose<>'ready_stock' and jsonb_array_length(p_context->'recipients') = 0 then
    raise exception 'recipient is required' using errcode='22023', detail='invalid_param';
  end if;
  if v_purpose='general_purchase' then
    if p_context->>'reason' is null or p_context->>'reason' not in ('company_use','staff_purchase','purchase_for_others','other')
      or (p_context->>'reason'='purchase_for_others' and nullif(btrim(p_context->>'companyPersonName'),'') is null)
      or (p_context->>'reason'='other' and nullif(btrim(p_context->>'explanation'),'') is null) then
      raise exception 'purchase reason is required' using errcode='22023', detail='invalid_param';
    end if;
  elsif p_context->'reason' <> 'null'::jsonb or btrim(p_context->>'companyPersonName')<>'' or btrim(p_context->>'projectReference')<>'' or btrim(p_context->>'explanation')<>'' then
    raise exception 'this purpose has no GP reason' using errcode='22023', detail='invalid_param';
  end if;
  if p_context->'serviceCaseId' <> 'null'::jsonb then perform (p_context->>'serviceCaseId')::uuid; end if;
  if v_purpose<>'service_case' and p_context->'serviceCaseId' <> 'null'::jsonb then
    raise exception 'this purpose has no service case' using errcode='22023', detail='invalid_param';
  end if;
  if v_purpose='service_case' and not exists
    (select 1 from public.service_cases where id=(p_context->>'serviceCaseId')::uuid) then
    raise exception 'unknown service case' using errcode='22023', detail='unknown_service_case';
  end if;
  if (select count(*) <> count(distinct r->>'id') from jsonb_array_elements(p_context->'recipients') r) then
    raise exception 'duplicate recipient' using errcode='22023', detail='invalid_param';
  end if;
  for v_recipient in select * from jsonb_array_elements(p_context->'recipients') loop
    perform public._purchasing_context_object(v_recipient,'{"id":"string","company":"string","name":"string","phone":"string","method":"string","deliveryDate":"string","addressLine1":"string","addressLine2":"string","city":"string","state":"string","postcode":"string","buildingType":"string","floor":"string","lift":"string|null","pickupLocationId":"string|null","collectedBy":"string"}'::jsonb);
    if (v_recipient->>'deliveryDate')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'ISO date required' using errcode='22023'; end if;
    perform (v_recipient->>'id')::uuid, (v_recipient->>'deliveryDate')::date;
    if (v_recipient->>'deliveryDate')::date < (p_context->>'proceedDate')::date+v_floor_days then raise exception 'recipient date too early' using errcode='22023',detail='recipient_date_too_early'; end if;
    if v_recipient->'lift' <> 'null'::jsonb and v_recipient->>'lift' not in ('has_lift','no_lift') then raise exception 'invalid lift' using errcode='22023'; end if;
    if v_recipient->'pickupLocationId' <> 'null'::jsonb then perform (v_recipient->>'pickupLocationId')::uuid; end if;
    if nullif(btrim(v_recipient->>'name'),'') is null or nullif(btrim(v_recipient->>'phone'),'') is null then
      raise exception 'recipient name and phone required' using errcode='22023', detail='invalid_param';
    end if;
    if v_recipient->>'method'='delivery' then
      if exists (select 1 from unnest(array['addressLine1','addressLine2','city','state','postcode','buildingType','floor']) k
        where nullif(btrim(v_recipient->>k),'') is null)
        or v_recipient->>'lift' is null or v_recipient->>'lift' not in ('has_lift','no_lift') then
        raise exception 'delivery facts required' using errcode='22023', detail='invalid_param';
      end if;
    elsif v_recipient->>'method'='self_pickup' then
      if nullif(btrim(v_recipient->>'collectedBy'),'') is null or not exists
        (select 1 from public.purchasing_destinations where id=(v_recipient->>'pickupLocationId')::uuid and active) then
        raise exception 'pickup site and collector required' using errcode='22023', detail='invalid_param';
      end if;
    else raise exception 'recipient method required' using errcode='22023', detail='invalid_param';
    end if;
  end loop;
  if (select count(*) <> count(distinct l->>'id') from jsonb_array_elements(p_context->'lines') l) then
    raise exception 'duplicate line' using errcode='22023', detail='invalid_param';
  end if;
  if (select count(*)<>count(distinct a->>'id') from jsonb_array_elements(p_context->'lines') l cross join lateral (select x a from jsonb_array_elements(l->'allocations') x union all select x a from jsonb_array_elements(l->'stockProposals') x) scopes) then raise exception 'duplicate allocation identity' using errcode='22023'; end if;
  for v_line in select * from jsonb_array_elements(p_context->'lines') loop
    perform public._purchasing_context_object(v_line,'{"id":"string","sku":"string","qty":"number","attrs":"object|null","recipientNeeds":"array","stockProposals":"array","allocations":"array"}'::jsonb);
    if nullif(btrim(v_line->>'sku'),'') is null then raise exception 'item required' using errcode='22023'; end if;
    for v_fact in select * from jsonb_array_elements(v_line->'recipientNeeds') loop
      perform public._purchasing_context_object(v_fact,'{"recipientId":"string","qty":"number"}'::jsonb);
    end loop;
    perform (v_line->>'id')::uuid;
    v_qty := (v_line->>'qty')::integer;
    if jsonb_typeof(v_line->'attrs') not in ('object','null') then
      raise exception 'invalid item configuration' using errcode='22023', detail='invalid_param';
    end if;
    if v_qty is null or v_qty<1 or jsonb_typeof(v_line->'allocations') is distinct from 'array'
      or jsonb_typeof(v_line->'stockProposals') is distinct from 'array'
      or jsonb_typeof(v_line->'recipientNeeds') is distinct from 'array' then
      raise exception 'invalid item scope' using errcode='22023', detail='invalid_param';
    end if;
    for v_allocation in select * from jsonb_array_elements(v_line->'allocations') loop
      perform public._purchasing_context_object(v_allocation,'{"id":"string","destinationId":"string","supplierDeliveryDate":"string","qty":"number","recipients":"array"}'::jsonb);
      if (v_allocation->>'supplierDeliveryDate')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'ISO date required' using errcode='22023'; end if;
      for v_fact in select * from jsonb_array_elements(v_allocation->'recipients') loop
        perform public._purchasing_context_object(v_fact,'{"recipientId":"string","qty":"number"}'::jsonb);
      end loop;
      if (select count(*)<>count(distinct r->>'recipientId') from jsonb_array_elements(v_allocation->'recipients') r) then raise exception 'duplicate recipient allocation' using errcode='22023'; end if;
    end loop;
    for v_stock in select * from jsonb_array_elements(v_line->'stockProposals') loop
      perform public._purchasing_context_object(v_stock,'{"id":"string","locationId":"string","destinationId":"string","qty":"number","recipients":"array"}'::jsonb);
      for v_fact in select * from jsonb_array_elements(v_stock->'recipients') loop
        perform public._purchasing_context_object(v_fact,'{"recipientId":"string","qty":"number"}'::jsonb);
      end loop;
      if (select count(*)<>count(distinct r->>'recipientId') from jsonb_array_elements(v_stock->'recipients') r) then raise exception 'duplicate stock recipient' using errcode='22023'; end if;
    end loop;
    if (select count(*)<>count(distinct (x->>'locationId',x->>'destinationId')) from jsonb_array_elements(v_line->'stockProposals') x) then raise exception 'duplicate stock site' using errcode='22023'; end if;
    select coalesce(sum((s->>'qty')::integer),0) into v_stock_qty from jsonb_array_elements(v_line->'stockProposals') s;
    select coalesce(sum((a->>'qty')::integer),0) into v_allocated from jsonb_array_elements(v_line->'allocations') a;
    if v_stock_qty<0 or v_stock_qty>v_qty or v_stock_qty+v_allocated<>v_qty
      or (v_purpose='ready_stock' and v_stock_qty<>0) then
      raise exception 'stock and purchase do not equal request' using errcode='22023', detail='invalid_param';
    end if;
    if exists (
      select 1 from (
        select r from jsonb_array_elements(v_line->'recipientNeeds') r
        union all
        select r from jsonb_array_elements(v_line->'allocations') a cross join lateral jsonb_array_elements(a->'recipients') r
        union all
        select r from jsonb_array_elements(v_line->'stockProposals') a cross join lateral jsonb_array_elements(a->'recipients') r
      ) facts where (r->>'qty') is null or (r->>'qty')::integer<1 or not exists
        (select 1 from jsonb_array_elements(p_context->'recipients') recipient where recipient->>'id'=r->>'recipientId')
    ) then
      raise exception 'invalid recipient quantity or source' using errcode='22023', detail='invalid_param';
    end if;
    if (select count(*)<>count(distinct r->>'recipientId') from jsonb_array_elements(v_line->'recipientNeeds') r) then
      raise exception 'duplicate recipient need' using errcode='22023', detail='invalid_param';
    end if;
    if v_purpose<>'ready_stock' then
      select coalesce(sum((r->>'qty')::integer),0) into v_requested from jsonb_array_elements(v_line->'recipientNeeds') r;
      if v_requested<>v_qty then raise exception 'recipient needs differ' using errcode='22023', detail='invalid_param'; end if;
      for v_recipient in select * from jsonb_array_elements(v_line->'recipientNeeds') loop
        v_recipient_id := v_recipient->>'recipientId';
        if not exists(select 1 from jsonb_array_elements(p_context->'recipients') r where r->>'id'=v_recipient_id) then
          raise exception 'unknown recipient' using errcode='22023', detail='invalid_param';
        end if;
        select coalesce(sum((r->>'qty')::integer),0) into v_allocated from (
          select r from jsonb_array_elements(v_line->'allocations') a cross join lateral jsonb_array_elements(a->'recipients') r
          union all
          select r from jsonb_array_elements(v_line->'stockProposals') a cross join lateral jsonb_array_elements(a->'recipients') r
        ) facts where r->>'recipientId'=v_recipient_id;
        if v_allocated<>(v_recipient->>'qty')::integer then
          raise exception 'recipient quantity changed' using errcode='22023', detail='invalid_param';
        end if;
      end loop;
    elsif jsonb_array_length(v_line->'recipientNeeds')<>0 then
      raise exception 'stock has no recipient need' using errcode='22023', detail='invalid_param';
    end if;
    for v_allocation in select * from jsonb_array_elements(v_line->'allocations') loop
      perform (v_allocation->>'id')::uuid, (v_allocation->>'supplierDeliveryDate')::date;
      if v_allocation->>'qty' is null or (v_allocation->>'qty')::integer<1 or not exists
        (select 1 from public.purchasing_destinations where id=(v_allocation->>'destinationId')::uuid and active) then
        raise exception 'invalid supplier allocation' using errcode='22023', detail='invalid_param';
      end if;
      select coalesce(sum((r->>'qty')::integer),0) into v_allocated from jsonb_array_elements(v_allocation->'recipients') r;
      if (v_purpose='ready_stock' and v_allocated<>0) or (v_purpose<>'ready_stock' and v_allocated<>(v_allocation->>'qty')::integer) then
        raise exception 'invalid recipient allocation' using errcode='22023', detail='invalid_param';
      end if;
    end loop;
    for v_stock in select * from jsonb_array_elements(v_line->'stockProposals') loop
      perform (v_stock->>'id')::uuid;
      if v_stock->>'qty' is null or (v_stock->>'qty')::integer<1 or not exists
        (select 1 from public.warehouses where id=(v_stock->>'locationId')::uuid) or not exists
        (select 1 from public.purchasing_destinations where id=(v_stock->>'destinationId')::uuid and active and warehouse_id=(v_stock->>'locationId')::uuid) then
        raise exception 'invalid stock proposal' using errcode='22023', detail='invalid_param';
      end if;
      select coalesce(sum((r->>'qty')::integer),0) into v_allocated from jsonb_array_elements(v_stock->'recipients') r;
      if v_allocated<>(v_stock->>'qty')::integer then
        raise exception 'stock recipient quantity differs' using errcode='22023', detail='invalid_param';
      end if;
    end loop;
  end loop;
end;
$fn$;
revoke all on function public._purchasing_validate_request_context(jsonb) from public, anon, authenticated;

-- The independent, reviewable Settings writer is in
-- purchase-request-settings-writer.draft.sql; there is one definition only.

-- WIP material-state reader for the future approval/issue owners. This records
-- facts only; calling it does not approve, issue, reserve or complete a task.
-- New-context callers must enter here BEFORE any legacy shared request lock:
-- request FOR UPDATE -> all request demands FOR UPDATE (stable order) -> Units.
-- BEGIN GENERATED EXISTING SUPPLIER HOLIDAY PROJECTION
-- Source: packages/shared/src/my-holidays.ts myHolidaySet(), SHA256 0a7afb25af26c9a26b9e39f836dabcc17dcb928cfdbc86454ca189aec1bb2856
-- Inherits that source's provisional/limited-year data; no Office calendar substitution.
create or replace function public._purchasing_context_holiday_dates()
returns date[] language sql immutable set search_path=public,pg_temp as $holidays$
  select array['2026-01-01'::date,'2026-02-01'::date,'2026-02-17'::date,'2026-02-18'::date,'2026-03-06'::date,'2026-03-21'::date,'2026-03-22'::date,'2026-05-01'::date,'2026-05-27'::date,'2026-05-31'::date,'2026-06-01'::date,'2026-06-17'::date,'2026-08-25'::date,'2026-08-31'::date,'2026-09-16'::date,'2026-11-08'::date,'2026-12-11'::date,'2026-12-25'::date,'2027-01-01'::date,'2027-02-06'::date,'2027-02-07'::date];
$holidays$;
revoke all on function public._purchasing_context_holiday_dates() from public,anon,authenticated;
-- END GENERATED EXISTING SUPPLIER HOLIDAY PROJECTION

-- Direct-RPC verification of the EXISTING production-working-day promise.
-- The API planner remains expectedArrivalOf; this validator verifies that its
-- required number of working days fits the submitted date, not a second planner.
create or replace function public._purchasing_check_context_supplier_dates(p_context jsonb,p_from_date date default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $supplier_dates$
declare l jsonb; a jsonb; source record; days integer; off_days integer[]; holidays date[]:=public._purchasing_context_holiday_dates();
  from_date date:=coalesce(p_from_date,(p_context->>'proceedDate')::date); delivery date; available integer; facts jsonb:='[]'::jsonb;
begin
  for l in select * from jsonb_array_elements(p_context->'lines') loop
    if jsonb_array_length(l->'allocations')=0 then continue; end if;
    select s.supplier_id,m.category::text as category into source from public.product_skus s
      join public.product_models m on m.id=s.model_id where s.sku=l->>'sku' for share of s,m nowait;
    if not found then raise exception 'unknown sku' using errcode='22023',detail='unknown_sku'; end if;
    if source.supplier_id is null or source.category is null then raise exception 'supplier production plan unavailable' using errcode='22023',detail='supplier_plan_unavailable'; end if;
    select working_days into days from public.purchasing_production_days where supplier_id=source.supplier_id and category=source.category for share nowait;
    if not found or days is null then raise exception 'supplier production days unavailable' using errcode='22023',detail='supplier_plan_unavailable'; end if;
    select ss.off_days into off_days from public.purchasing_supplier_settings ss where ss.supplier_id=source.supplier_id for share nowait;
    -- Same published fallback as workWeekOffDaysFor, not guessed production days.
    if coalesce(cardinality(off_days),0)=0 then off_days:=array[0]; end if;
    for a in select * from jsonb_array_elements(l->'allocations') loop
      delivery:=(a->>'supplierDeliveryDate')::date;
      -- At most six off-days: this computation bound covers the required weeks
      -- plus every holiday's worst-case lost week. It does NOT cap chosen dates.
      select count(*) into available from (
        select from_date+n as day from generate_series(1,least(delivery-from_date,(days+cardinality(holidays)+1)*7)) n
        where not (extract(dow from (from_date+n))::integer=any(off_days))
          and not ((from_date+n)=any(holidays)) limit days
      ) working;
      if available<days then raise exception 'supplier date precedes production minimum' using errcode='22023',detail='supplier_date_before_earliest'; end if;
    end loop;
    facts:=facts||jsonb_build_array(jsonb_build_object('line_id',(l->>'id')::uuid,'sku',l->>'sku',
      'supplier_id',source.supplier_id,'category',source.category,'working_days',days,'off_days',off_days,'holiday_dates',holidays));
  end loop;
  return facts;
exception when lock_not_available then raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='request_source_busy';
end;
$supplier_dates$;
revoke all on function public._purchasing_check_context_supplier_dates(jsonb,date) from public,anon,authenticated;

-- BEGIN GENERATED EXISTING FORECAST DISPLAY SOURCE
-- Source: packages/shared/src/forecast-purchase.ts, SHA256 6759e06dd45199f3e237d23f97a01fb9e6942e1db5d030989a213873ad1e3eba
-- Display baseline only. Changed quantities require reason + actual approval, no automatic cap/permission.
create or replace function public._purchasing_context_forecast_display_source()
returns jsonb language sql immutable set search_path=public,pg_temp as $forecast_display$
 select '{"authority":"existing_forecast_display_proposal_not_purchase_authority","rate_days":14,"level_days":14,"week_days":7,"scope":{"categories":["mattress"],"models":[{"category":"bedframe","modelKey":"jager"}]}}'::jsonb;
$forecast_display$;
revoke all on function public._purchasing_context_forecast_display_source() from public,anon,authenticated;
-- END GENERATED EXISTING FORECAST DISPLAY SOURCE

-- Owning-source facts for the EXISTING forecast display, not a second automatic
-- buying rule. The suggestion is a baseline for change reason; approval is always
-- separate and a changed suggestion is not capped by this display formula.
-- Own request supply is excluded by actual source/Unit attribution, never by
-- excluding the entire merged line and accidentally hiding another request.
create or replace function public._purchasing_context_own_po_free(p_request uuid,p_line uuid)
returns integer language plpgsql stable set search_path=public,pg_temp as $own_po_free$
declare line public.purchase_order_lines%rowtype; own_qty integer; total_free integer;
begin
 if p_request is null then return 0; end if;
 select * into strict line from public.purchase_order_lines where id=p_line;
 if not exists(select 1 from public._purchasing_po_request_sources(p_line) src join public.purchase_demands d on d.id=src.demand_id where d.request_id=p_request) then return 0; end if;
 total_free:=public.purchasing_po_line_free_units(p_line);
 if line.identity_mode='quantity' then
  if exists(select 1 from public._purchasing_po_request_sources(p_line) src join public.purchase_demands d on d.id=src.demand_id where d.request_id<>p_request) then
   raise exception 'counted merged supply attribution unavailable' using errcode='22023',detail='forecast_quantity_source_unavailable'; end if;
  return total_free;
 end if;
 select count(*) into own_qty from public.ops_stock_items i where i.po_line_id=p_line and i.status='incoming' and coalesce(i.identity_scope,'unit')='unit'
  and i.reserved_order_line_id is null and i.reserved_purchase_demand_id is null and (
   exists(select 1 from public.purchase_demands d where d.id=line.demand_id and d.request_id=p_request)
   or exists(select 1 from public.purchase_request_events e cross join lateral jsonb_array_elements(coalesce(e.changes->'allocations','[]')) a
    where e.request_id=p_request and e.kind='po_issued' and (e.changes->>'record_type'='po_issue' or (e.changes->>'record_type'='po_source_change' and e.changes->>'operation'='revise_po')) and a->'unit_ids' @> jsonb_build_array(i.id)));
 return least(total_free,own_qty);
end;
$own_po_free$;
revoke all on function public._purchasing_context_own_po_free(uuid,uuid) from public,anon,authenticated;

create or replace function public._purchasing_context_forecast_facts(p_sku text,p_exclude_request uuid default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $forecast_facts$
declare policy jsonb:=public._purchasing_context_forecast_display_source(); source record; today date:=(now() at time zone 'Asia/Kuala_Lumpur')::date;
 sales jsonb; stock jsonb; pos jsonb; requests jsonb; sold bigint; free bigint; on_po bigint; in_progress bigint;
 level bigint; cap bigint; suggested bigint;
begin
 select s.id,s.sku,s.supplier_id,s.variant_kind,s.discontinued_at,m.id as model_id,m.category::text category,lower(m.model_key) model_key,sup.kind::text supplier_kind
  into source from public.product_skus s join public.product_models m on m.id=s.model_id left join public.suppliers sup on sup.id=s.supplier_id
  where s.sku=p_sku for share of s,m nowait;
 if not found or source.supplier_id is null or source.supplier_kind='other_creditor' or source.variant_kind<>'size' or source.discontinued_at is not null
  or not (exists(select 1 from jsonb_array_elements_text(policy#>'{scope,categories}') c where c=lower(source.category))
    or exists(select 1 from jsonb_array_elements(policy#>'{scope,models}') m where m->>'category'=lower(source.category) and m->>'modelKey'=source.model_key)) then
  raise exception 'item is outside the current forecast source' using errcode='22023',detail='forecast_not_stock_item'; end if;
 -- Exactly the Register population used by readForecastPurchase: no placed/
 -- cancelled orders or rentals; Malaysia placed date after today-14 through today.
 select coalesce(jsonb_agg(jsonb_build_object('order_id',o.id,'line_id',l.id,'placed_at',o.placed_at,'qty',l.qty) order by o.id,l.id),'[]'),coalesce(sum(greatest(l.qty,0)),0)
  into sales,sold from public.orders o join public.order_lines l on l.order_id=o.id where l.sku=p_sku and o.status::text not in ('place','cancelled')
   and (o.source_system is null or o.source_system<>'rental') and (o.placed_at at time zone 'Asia/Kuala_Lumpur')::date>today-(policy->>'rate_days')::integer
   and (o.placed_at at time zone 'Asia/Kuala_Lumpur')::date<=today and l.qty>0;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'qty',v.qty,'warehouse_id',i.warehouse_id) order by v.id),'[]'),coalesce(sum(greatest(v.qty,1)),0)
  into stock,free from public.stock_unit_register_v v join public.ops_stock_items i on i.id=v.id
  where v.sku=p_sku and v.availability='available' and v.condition='new' and not exists(
   select 1 from public.purchase_order_lines pl join public.purchase_demands d on d.id=pl.demand_id where pl.id=i.po_line_id and d.request_id=p_exclude_request)
   and not exists(select 1 from public.purchase_request_events e cross join lateral jsonb_array_elements(coalesce(e.changes->'allocations','[]')) a
    where e.request_id=p_exclude_request and e.kind='po_issued' and (e.changes->>'record_type'='po_issue' or (e.changes->>'record_type'='po_source_change' and e.changes->>'operation'='revise_po')) and a->'unit_ids' @> jsonb_build_array(i.id));
 select coalesce(jsonb_agg(jsonb_build_object('po_id',v.po_id,'line_id',v.po_line_id,'version',po.version,'qty',v.remaining_free) order by v.po_id,v.po_line_id),'[]'),coalesce(sum(v.remaining_free),0)
  into pos,on_po from (select f.*,greatest(0,f.free_units-public._purchasing_context_own_po_free(p_exclude_request,f.po_line_id)) remaining_free from public.purchasing_po_free_units() f where f.sku=p_sku) v
   join public.purchase_orders po on po.id=v.po_id where v.remaining_free>0;
 select coalesce(jsonb_agg(jsonb_build_object('request_id',p.request_id,'version',r.request_version,'qty',p.qty) order by p.request_id,p.qty),'[]'),coalesce(sum(p.qty),0)
  into requests,in_progress from public._purchasing_forecast_in_progress_rows() p join public.purchase_requests r on r.id=p.request_id where p.sku=p_sku and (p_exclude_request is null or p.request_id<>p_exclude_request);
 level:=ceil(sold::numeric/(policy->>'rate_days')::integer*(policy->>'level_days')::integer);
 cap:=greatest(1,ceil(sold::numeric/(policy->>'rate_days')::integer*(policy->>'week_days')::integer));
 suggested:=least(greatest(0,level-free-on_po),cap);
 return jsonb_build_object('source_version',1,'week',date_trunc('week',today)::date,'sku',p_sku,
  'catalog',jsonb_build_object('sku_id',source.id,'model_id',source.model_id,'supplier_id',source.supplier_id,'category',source.category,'model_key',source.model_key),
  'sold14',sold,'free',free,'on_po',on_po,'in_progress',in_progress,'sales',sales,'stock',stock,'pos',pos,'requests',requests,
  'suggested',suggested,'to_ask',greatest(0,suggested-in_progress),'display_source',policy);
exception when lock_not_available then raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='request_source_busy';
end;
$forecast_facts$;
revoke all on function public._purchasing_context_forecast_facts(text,uuid) from public,anon,authenticated;

-- Read the actual current source for selected forecast rows. This is only a
-- review read; it creates no request, approval, coverage, task or buying authority.
create or replace function public.purchasing_request_forecast_sources(p_skus text[],p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $forecast_sources$
declare actor_role text:=public.app_role(); sku text; result jsonb:='[]';
begin
 if actor_role is null or actor_role not in ('operation','principal') then raise exception 'not permitted' using errcode='42501'; end if;
 if p_skus is null or cardinality(p_skus)=0 or exists(select 1 from unnest(p_skus) s where s is null or btrim(s)='')
  or cardinality(p_skus)<>(select count(distinct s) from unnest(p_skus) s) then raise exception 'exact selected SKUs required' using errcode='22023',detail='invalid_param'; end if;
 foreach sku in array p_skus loop result:=result||jsonb_build_array(public._purchasing_context_forecast_facts(sku,p_request_id)); end loop;
 return result;
end;
$forecast_sources$;
revoke all on function public.purchasing_request_forecast_sources(text[],uuid) from public,anon;
grant execute on function public.purchasing_request_forecast_sources(text[],uuid) to authenticated;

create or replace function public._purchasing_check_context_forecast_source(p_context jsonb,p_sources jsonb,p_exclude_request uuid default null)
returns jsonb language plpgsql set search_path=public,pg_temp as $check_forecast$
declare item record; current_source jsonb; seen jsonb; result jsonb:='[]';
begin
 if p_context->>'origin'<>'forecast_suggestion' or jsonb_typeof(p_sources) is distinct from 'array'
  or jsonb_array_length(p_sources)<>(select count(distinct l->>'sku') from jsonb_array_elements(p_context->'lines') l) then
  raise exception 'exact forecast source required' using errcode='22023',detail='forecast_source_required'; end if;
 for item in select l->>'sku' as sku,sum((l->>'qty')::integer) as qty from jsonb_array_elements(p_context->'lines') l group by 1 order by 1 loop
  if (select count(*) from jsonb_array_elements(p_sources) s where s->>'sku'=item.sku)<>1 then raise exception 'exact forecast source required' using errcode='22023',detail='forecast_source_required'; end if;
  select s into strict seen from jsonb_array_elements(p_sources) s where s->>'sku'=item.sku;
  current_source:=public._purchasing_context_forecast_facts(item.sku,p_exclude_request);
  if seen is distinct from current_source then raise exception 'forecast source changed' using errcode='22023',detail='forecast_source_changed'; end if;
  if item.qty<>(current_source->>'to_ask')::bigint and coalesce(p_context->>'forecastChangeReason','') !~ '[^[:space:]]' then
   raise exception 'changed forecast quantity requires a reason' using errcode='22023',detail='forecast_change_reason_required'; end if;
  result:=result||jsonb_build_array(current_source);
 end loop;
 return result;
end;
$check_forecast$;
revoke all on function public._purchasing_check_context_forecast_source(jsonb,jsonb,uuid) from public,anon,authenticated;

-- ONE private mark writer, shared by the existing 0695 wrapper and canonical
-- contextual create/revision. Prior marks remain in the resubmitted event.
create or replace function public._purchasing_write_forecast_request_mark(p_id uuid,p_week date,p_key uuid,p_lines jsonb,p_revision boolean default false)
returns void language plpgsql set search_path=public,pg_temp as $write_forecast_mark$
declare r public.purchase_requests%rowtype; previous public.forecast_purchase_requests%rowtype;
begin
 select * into strict r from public.purchase_requests where id=p_id;
 if r.created_by is distinct from auth.uid() or r.purpose<>'ready_stock' or r.fulfilment_intent<>'additional_stock' then raise exception 'forecast origin disagrees with request' using errcode='22023',detail='forecast_source_changed'; end if;
 if p_revision then
  select * into strict previous from public.forecast_purchase_requests where request_id=p_id for update;
  if previous.created_by is distinct from auth.uid() or previous.submission_key is distinct from p_key then raise exception 'forecast mark identity changed' using errcode='22023',detail='forecast_source_changed'; end if;
  update public.forecast_purchase_requests set forecast_week=p_week,lines=p_lines where request_id=p_id;
 else
  insert into public.forecast_purchase_requests(request_id,forecast_week,submission_key,lines,created_by) values(p_id,p_week,p_key,p_lines,auth.uid());
 end if;
end;
$write_forecast_mark$;
revoke all on function public._purchasing_write_forecast_request_mark(uuid,date,uuid,jsonb,boolean) from public,anon,authenticated;

create or replace function public._purchasing_context_forecast_mark_lines(p_context jsonb,p_sources jsonb)
returns jsonb language sql set search_path=public,pg_temp as $mark_lines$
 select jsonb_agg(jsonb_build_object('sku',l->>'sku','qty',(l->>'qty')::integer,'in_progress',(s->>'in_progress')::integer,
  'basis',jsonb_build_object('request_line_id',(l->>'id')::uuid,'source_snapshot',s)) order by l->>'id')
 from jsonb_array_elements(p_context->'lines') l join jsonb_array_elements(p_sources) s on s->>'sku'=l->>'sku';
$mark_lines$;
revoke all on function public._purchasing_context_forecast_mark_lines(jsonb,jsonb) from public,anon,authenticated;

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
      'carres_action',sc.carres_action,'what_affected',sc.what_affected,'customer_wants',sc.customer_wants,'evidence',sc.evidence)
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

-- Exact approved recipient distribution, separate from the full requested need.
-- Partial approval never shrinks request_context.qty or silently reassigns recipients.
create or replace function public._purchasing_context_approval_distribution(p_id uuid,p_distribution jsonb,p_saved boolean)
returns jsonb language plpgsql set search_path=public,pg_temp as $distribution$
declare r public.purchase_requests%rowtype; d public.purchase_demands%rowtype; line jsonb; source jsonb;
  asked jsonb; x jsonb; recipients jsonb; normalized jsonb:='[]'::jsonb; input jsonb:=p_distribution; q integer; allocated integer; cap integer; count_rows integer;
begin
 select * into strict r from public.purchase_requests where id=p_id;
 if input is not null and jsonb_typeof(input) is distinct from 'array' then raise exception 'approval distribution must be an array' using errcode='22023',detail='invalid_approval_distribution'; end if;
 if p_saved and input is null then raise exception 'approved recipient distribution unavailable' using errcode='22023',detail='request_approval_unavailable'; end if;
 for d in select * from public.purchase_demands where request_id=p_id and cancelled_at is null order by id loop
  select l into strict line from jsonb_array_elements(r.request_context->'lines') l where (l->>'id')::uuid=d.request_line_id;
  select a into strict source from jsonb_array_elements(case when d.fulfilment_kind='purchase' then line->'allocations' else line->'stockProposals' end) a
    where (a->>'id')::uuid=coalesce(d.supplier_allocation_id,d.stock_proposal_id);
  if input is null then
   asked:=jsonb_build_object('demandId',d.id,'qty',d.qty,'recipients',source->'recipients');
  else
   select count(*) into count_rows from jsonb_array_elements(input) a where (a->>'demandId')::uuid=d.id;
   if count_rows<>1 then raise exception 'every demand needs one approved distribution' using errcode='22023',detail='invalid_approval_distribution'; end if;
   select a into strict asked from jsonb_array_elements(input) a where (a->>'demandId')::uuid=d.id;
  end if;
  perform public._purchasing_context_object(asked,'{"demandId":"string","qty":"number","recipients":"array"}');
  if (asked->>'qty')::numeric<0 or (asked->>'qty')::numeric>d.qty or mod((asked->>'qty')::numeric,1)<>0 then raise exception 'approved quantity outside requested allocation' using errcode='22023',detail='invalid_approval_distribution'; end if;
  q:=(asked->>'qty')::integer;
  if p_saved and q is distinct from d.approved_qty then raise exception 'saved approved distribution changed' using errcode='22023',detail='request_approval_changed'; end if;
  recipients:='[]'::jsonb; allocated:=0;
  if r.purpose='ready_stock' and jsonb_array_length(asked->'recipients')<>0 then raise exception 'stock requests have no final recipient' using errcode='22023',detail='invalid_approval_distribution'; end if;
  for x in select * from jsonb_array_elements(asked->'recipients') loop
   perform public._purchasing_context_object(x,'{"recipientId":"string","qty":"number"}');
   if (x->>'qty')::numeric<=0 or (x->>'qty')::numeric>d.qty or mod((x->>'qty')::numeric,1)<>0 then raise exception 'invalid approved recipient quantity' using errcode='22023',detail='invalid_approval_distribution'; end if;
   if exists(select 1 from jsonb_array_elements(recipients) v where (v->>'recipientId')::uuid=(x->>'recipientId')::uuid) then raise exception 'duplicate approved recipient' using errcode='22023',detail='invalid_approval_distribution'; end if;
   select (v->>'qty')::integer into cap from jsonb_array_elements(source->'recipients') v where (v->>'recipientId')::uuid=(x->>'recipientId')::uuid;
   if cap is null or (x->>'qty')::integer>cap then raise exception 'approved recipient exceeds its requested allocation' using errcode='22023',detail='invalid_approval_distribution'; end if;
   allocated:=allocated+(x->>'qty')::integer;
   recipients:=recipients||jsonb_build_array(jsonb_build_object('recipientId',(x->>'recipientId')::uuid,'qty',(x->>'qty')::integer));
  end loop;
  if r.purpose<>'ready_stock' and allocated<>q then raise exception 'approved quantity needs exact recipient distribution' using errcode='22023',detail='invalid_approval_distribution'; end if;
  select coalesce(jsonb_agg(v order by v->>'recipientId'),'[]') into recipients from jsonb_array_elements(recipients) v;
  normalized:=normalized||jsonb_build_array(jsonb_build_object('demandId',d.id,'qty',q,'recipients',recipients));
 end loop;
 if input is not null and jsonb_array_length(input)<>jsonb_array_length(normalized) then raise exception 'unknown or duplicate demand in approval distribution' using errcode='22023',detail='invalid_approval_distribution'; end if;
 return normalized;
end;
$distribution$;
revoke all on function public._purchasing_context_approval_distribution(uuid,jsonb,boolean) from public,anon,authenticated;

-- Private saved-scope admission used by canonical contextual writers. It only
-- compares persisted facts; it never invents a baseline, approves or reserves stock.
create or replace function public._purchasing_assert_request_approval(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $approval$
declare r public.purchase_requests%rowtype; current_scope jsonb;
begin
  current_scope:=public._purchasing_request_context_state(p_id);
  select * into strict r from public.purchase_requests where id=p_id;
  if r.approved_at is null or r.approved_by is null or r.refused_at is not null
    or r.withdrawn_at is not null or r.sent_back_at is not null
    or r.approval_version is null or r.approval_scope is null or jsonb_typeof(r.approval_scope->'approved_distribution') is distinct from 'array' then
    raise exception 'current request approval is unavailable' using errcode='22023',detail='request_approval_unavailable';
  end if;
  if r.approval_version is distinct from r.request_version or (r.approval_scope-'approved_distribution') is distinct from current_scope then
    raise exception 'request changed after approval' using errcode='22023',detail='request_approval_changed';
  end if;
  if exists(select 1 from public.purchase_demands where request_id=p_id and cancelled_at is null
    and (approved_qty is null or approved_qty<0 or approved_qty>qty)) then
    raise exception 'approved allocation is unavailable' using errcode='22023',detail='request_approval_unavailable';
  end if;
  perform public._purchasing_context_approval_distribution(p_id,r.approval_scope->'approved_distribution',true);
  return r.approval_scope;
end;
$approval$;
revoke all on function public._purchasing_assert_request_approval(uuid) from public,anon,authenticated;

-- Private full-scope approval writer for the canonical decision door. Admission
-- by the public decision door requires the exact current review envelope.
-- Partial approval needs explicit preserved recipient distribution; no qty cut is
-- guessed here. No role/grant is added, no stock is reserved and no PO is issued.
create or replace function public._purchasing_stamp_context_approval(p_id uuid,p_distribution jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $stamp$
declare actor_role text:=public.purchasing_approver_gate(); r public.purchase_requests%rowtype; scope jsonb; distribution jsonb;
begin
 perform public._purchasing_context_request_source_locks(p_id);
  select * into r from public.purchase_requests where id=p_id for update;
  if not found then raise exception 'unknown request' using errcode='22023',detail='unknown_request'; end if;
  if r.created_by is not distinct from auth.uid() then raise exception 'you cannot decide a purchase you raised' using errcode='42501',detail='own_request'; end if;
  if r.withdrawn_at is not null or r.refused_at is not null or r.sent_back_at is not null or r.approved_at is not null then
    raise exception 'request is not awaiting approval' using errcode='22023',detail='request_not_awaiting_approval';
  end if;
  scope:=public._purchasing_request_context_state(p_id);
  if exists(select 1 from public.purchase_demands where request_id=p_id and
    (po_id is not null or ordered_at is not null or coalesce(issued_qty,0)>0))
    or exists(select 1 from public.purchase_order_lines pl cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands d on d.id=src.demand_id where d.request_id=p_id) then
    raise exception 'request already issued' using errcode='22023',detail='request_already_issued';
  end if;
  distribution:=public._purchasing_context_approval_distribution(p_id,p_distribution,false);
  update public.purchase_demands d set approved_qty=(a->>'qty')::integer from jsonb_array_elements(distribution) a where d.id=(a->>'demandId')::uuid and d.request_id=p_id;
  scope:=public._purchasing_request_context_state(p_id)||jsonb_build_object('approved_distribution',distribution);
  update public.purchase_requests set approved_at=now(),approved_by=auth.uid(),approval_version=request_version,approval_scope=scope where id=p_id;
  insert into public.audit_log(role,actor_text,action,ref) values(actor_role::public.app_role,
    (select name from public.app_users where id=auth.uid()),'Purchase approved',p_id::text);
  return public._purchasing_assert_request_approval(p_id);
end;
$stamp$;
revoke all on function public._purchasing_stamp_context_approval(uuid,jsonb) from public,anon,authenticated;

-- Existing Stock writers retain their role gate and perform every actual draw/release.
-- This private admission adds exact approved proposal/site/configuration checks.
create or replace function public._purchasing_context_stock_admission(p_demand_id uuid,p_items uuid[],p_replace boolean)
returns void language plpgsql set search_path=public,pg_temp as $stock_admission$
declare d public.purchase_demands%rowtype; r public.purchase_requests%rowtype; scope jsonb; location uuid; wanted uuid[]:=coalesce(p_items,'{}'); u public.ops_stock_items%rowtype; unit_attrs jsonb;
begin
 perform public._purchasing_context_writer_admission();
 select request_id into d.request_id from public.purchase_demands where id=p_demand_id;
 scope:=public._purchasing_assert_request_approval(d.request_id);
 select * into strict d from public.purchase_demands where id=p_demand_id;
 select * into strict r from public.purchase_requests where id=d.request_id;
 if d.cancelled_at is not null or d.fulfilment_kind is distinct from 'stock_proposal' or r.fulfilment_intent is distinct from 'concrete_need' then
  raise exception 'stock requires its approved proposal allocation' using errcode='22023',detail='stock_proposal_required'; end if;
 select (a->>'locationId')::uuid into strict location from jsonb_array_elements(r.request_context->'lines') l
  cross join lateral jsonb_array_elements(l->'stockProposals') a where (l->>'id')::uuid=d.request_line_id and (a->>'id')::uuid=d.stock_proposal_id;
 if not p_replace then
  select coalesce(array_agg(distinct id order by id),'{}') into wanted from (
   select unnest(wanted) as id union select id from public.ops_stock_items where reserved_purchase_demand_id=d.id and status in ('reserved','sold')
  ) ids;
 end if;
 if cardinality(wanted) is distinct from (select count(distinct id) from unnest(wanted) id) or exists(select 1 from unnest(wanted) id where id is null)
  or cardinality(wanted)>d.approved_qty then raise exception 'stock selection exceeds approved proposal' using errcode='22023',detail='stock_proposal_quantity_changed'; end if;
 -- Lock both saved and proposed identities; a direct release cannot race the check.
 begin
  perform 1 from public.ops_stock_items where id=any(wanted) or reserved_purchase_demand_id=d.id order by id for update nowait;
 exception when lock_not_available then raise exception 'stock selection changed' using errcode='40001',detail='stock_selection_changed'; end;
 foreach u.id in array wanted loop
  select * into u from public.ops_stock_items where id=u.id;
  if not found then raise exception 'Unit not found' using errcode='22023',detail='unit_not_found'; end if;
  if u.warehouse_id is distinct from location or public.stock_match_key(u.sku) is distinct from public.stock_match_key(d.sku)
   or u.identity_scope<>'unit' or u.qty<>1 or u.reserved_order_line_id is not null
   or (u.reserved_purchase_demand_id is not null and u.reserved_purchase_demand_id<>d.id)
   or not (u.status='free' or (u.status in ('reserved','sold') and u.reserved_purchase_demand_id=d.id and u.reserved_ref=r.req_no))
   or public.unit_availability('free',u.needs_repair,u.hold_reason,u.condition)<>'available' then
   raise exception 'Unit no longer matches approved stock proposal' using errcode='22023',detail='stock_proposal_unit_changed'; end if;
  unit_attrs:=null;
  if u.po_line_id is not null then select nullif(nullif(attrs,'{}'::jsonb),'null'::jsonb) into strict unit_attrs from public.purchase_order_lines where id=u.po_line_id; end if;
  if unit_attrs is distinct from nullif(d.attrs,'{}'::jsonb) then
   raise exception 'Unit configuration not proven for this proposal' using errcode='22023',detail='stock_proposal_configuration_unavailable'; end if;
 end loop;
end;
$stock_admission$;
revoke all on function public._purchasing_context_stock_admission(uuid,uuid[],boolean) from public,anon,authenticated;


-- Source provenance for the existing PO-owner Change Deliver To door. Neither
-- requested goods nor prior MPR approval/issue events are rewritten.
create or replace function public._purchasing_context_unit_demand(p_unit uuid)
returns uuid language plpgsql stable set search_path=public,pg_temp as $unit_demand$
declare owner uuid; n integer;
begin
 select count(distinct (a->>'demand_id')::uuid),min((a->>'demand_id')::text)::uuid into n,owner
 from public.purchase_request_events e cross join lateral jsonb_array_elements(coalesce(e.changes->'allocations','[]')) a
 where e.kind='po_issued' and (e.changes->>'record_type'='po_issue' or (e.changes->>'record_type'='po_source_change' and e.changes->>'operation'='revise_po')) and a->'unit_ids' @> jsonb_build_array(p_unit);
 if n>1 then raise exception 'Unit has conflicting request sources' using errcode='22023',detail='request_po_coverage_changed'; end if;
 return owner;
end;
$unit_demand$;
revoke all on function public._purchasing_context_unit_demand(uuid) from public,anon,authenticated;

create or replace function public._purchasing_context_po_source_scope(p_po text)
returns jsonb language sql stable set search_path=public,pg_temp as $po_source_scope$
 select coalesce(jsonb_agg(jsonb_build_object('request_id',d.request_id,'line_id',pl.id,'demand_id',d.id,'qty',src.qty,
  'sku',pl.sku,'attrs',pl.attrs,'supplier_id',po.supplier_id,'purpose',po.purpose,'po_status',po.status,
  'destination_id',coalesce(pl.destination_id,po.destination_id),'unit_ids',coalesce((select jsonb_agg(i.id order by i.id)
   from public.ops_stock_items i where i.po_line_id=pl.id and i.status<>'voided' and public._purchasing_context_unit_demand(i.id)=d.id),'[]'::jsonb))
  order by pl.id,d.id),'[]'::jsonb)
 from public.purchase_orders po join public.purchase_order_lines pl on pl.po_id=po.id
 cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands d on d.id=src.demand_id
 where po.id=p_po and exists(select 1 from public.po_line_sources context_source join public.purchase_demands context_demand on context_demand.id=context_source.purchase_demand_id
  join public.purchase_requests context_request on context_request.id=context_demand.request_id where context_source.po_id=p_po and context_request.request_version>0);
$po_source_scope$;
revoke all on function public._purchasing_context_po_source_scope(text) from public,anon,authenticated;

create or replace function public._purchasing_context_po_destination_matches(p_demand uuid,p_line uuid,p_destination uuid)
returns boolean language sql stable set search_path=public,pg_temp as $po_destination$
 select exists(select 1 from public.purchase_demands d where d.id=p_demand and (d.destination_id=p_destination or
  exists(select 1 from public.purchase_request_events e join public.purchase_order_lines pl on pl.po_id=e.changes->>'po_id'
   cross join lateral public._purchasing_po_request_sources(pl.id) src
   where e.request_id=d.request_id and e.kind='po_issued' and e.changes->>'record_type'='po_source_change'
    and e.actor_id is not null and pl.id=p_line and src.demand_id=d.id
    and e.changes->'after_scope' @> jsonb_build_array(jsonb_build_object('line_id',p_line,'demand_id',d.id,'qty',src.qty,'destination_id',p_destination)))));
$po_destination$;
revoke all on function public._purchasing_context_po_destination_matches(uuid,uuid,uuid) from public,anon,authenticated;

-- The exact remaining recipient pool shared by Review and issue preflight.
-- Existing immutable issue events are read; no independent recipient ledger.
create or replace function public._purchasing_context_remaining_recipients(p_request uuid,p_demand uuid,p_scope jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $remaining_recipients$
declare approved jsonb; x jsonb; prior integer; cap integer; recipients jsonb:='[]';
begin
 if p_scope->>'purpose'='ready_stock' then return recipients; end if;
 select v into strict approved from jsonb_array_elements(p_scope->'approved_distribution') v where (v->>'demandId')::uuid=p_demand;
 for x in select * from jsonb_array_elements(approved->'recipients') loop
  select coalesce(sum((rc->>'qty')::integer),0) into prior
   from public.purchase_orders po cross join lateral jsonb_array_elements(public._purchasing_po_issued_recipients(po.id,p_demand)) rc
   where po.status<>'cancelled' and rc->>'recipientId'=x->>'recipientId';
  cap:=(x->>'qty')::integer-prior;
  if cap<0 then raise exception 'issued recipient coverage changed' using errcode='22023',detail='request_po_coverage_changed'; end if;
  if cap>0 then recipients:=recipients||jsonb_build_array(jsonb_build_object('recipientId',x->>'recipientId','qty',cap)); end if;
 end loop;
 return recipients;
end;
$remaining_recipients$;
revoke all on function public._purchasing_context_remaining_recipients(uuid,uuid,jsonb) from public,anon,authenticated;

-- Current exact coverage for the approved request. Shelf totals never net an
-- intentional RS/GP buy; only owning Unit bindings and exact PO demand lineage count.
create or replace function public._purchasing_context_coverage_admitted(p_id uuid,p_for_issue boolean,p_admitted_scope jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $coverage$
declare scope jsonb; d public.purchase_demands%rowtype; held integer; issued integer; units uuid[]; rows jsonb:='[]';
begin
 if p_admitted_scope is null then scope:=public._purchasing_assert_request_approval(p_id);
 else
  select approval_scope into scope from public.purchase_requests where id=p_id and approval_version=request_version and approved_at is not null and withdrawn_at is null and refused_at is null and sent_back_at is null;
  if scope is distinct from p_admitted_scope then raise exception 'admitted approval changed' using errcode='22023',detail='request_approval_changed'; end if;
 end if;
 begin
 perform 1 from public.purchase_orders where id in(select pl.po_id from public.purchase_order_lines pl cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands pd on pd.id=src.demand_id where pd.request_id=p_id) order by id for share nowait;
 perform 1 from public.purchase_order_lines pl where exists(select 1 from public._purchasing_po_request_sources(pl.id) src join public.purchase_demands pd on pd.id=src.demand_id where pd.request_id=p_id) order by pl.id for share nowait;
 perform 1 from public.po_line_sources ps where ps.purchase_demand_id in(select id from public.purchase_demands where request_id=p_id) order by ps.id for share nowait;
 exception when lock_not_available then raise exception 'request coverage changed' using errcode='40001',detail='request_coverage_changed'; end;
 for d in select * from public.purchase_demands where request_id=p_id and cancelled_at is null order by id loop
  select coalesce(array_agg(id order by id),'{}'),coalesce(sum(qty),0) into units,held from public.ops_stock_items where reserved_purchase_demand_id=d.id and status in ('reserved','sold');
  if d.fulfilment_kind='stock_proposal' then
   perform public._purchasing_context_stock_admission(d.id,units,true);
   if p_for_issue and held<>d.approved_qty then raise exception 'approved stock proposal is not fully bound' using errcode='22023',detail='stock_proposal_not_fulfilled'; end if;
   if exists(select 1 from public.purchase_order_lines pl cross join lateral public._purchasing_po_request_sources(pl.id) src where src.demand_id=d.id) or d.issued_qty<>0 then raise exception 'stock proposal has purchase coverage' using errcode='22023',detail='request_po_coverage_changed'; end if;
   issued:=0;
  else
   if exists(select 1 from public.ops_stock_items u where u.reserved_purchase_demand_id=d.id and
     (u.reserved_ref is distinct from (select req_no from public.purchase_requests where id=p_id)
      or not exists(select 1 from public._purchasing_po_request_sources(u.po_line_id) src where src.demand_id=d.id))) then
    raise exception 'purchase allocation gained unrelated stock coverage' using errcode='22023',detail='request_stock_coverage_changed'; end if;
   held:=0; -- Purchased Units are counted once by their PO sources, never as From Stock.

   if exists(select 1 from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id
    where po.status<>'cancelled' and exists(select 1 from public._purchasing_po_request_sources(pl.id) src where src.demand_id=d.id)
     and (exists(select 1 from public.po_line_sources ps where ps.po_line_id=pl.id and ps.order_id is not null)
       or (select sum(src.qty) from public._purchasing_po_request_sources(pl.id) src) is distinct from pl.qty
       or exists(select 1 from public.po_line_sources ps where ps.po_line_id=pl.id
         and (ps.po_id is distinct from pl.po_id or ps.sku is distinct from pl.sku))
       or exists(select 1 from public._purchasing_po_request_sources(pl.id) src join public.purchase_demands other_d on other_d.id=src.demand_id
         where other_d.sku is distinct from pl.sku or nullif(other_d.attrs,'{}'::jsonb) is distinct from nullif(pl.attrs,'{}'::jsonb)
          or other_d.supplier_id is distinct from po.supplier_id or other_d.purpose is distinct from po.purpose
          or not public._purchasing_context_po_destination_matches(other_d.id,pl.id,coalesce(pl.destination_id,po.destination_id)))
       or (pl.demand_id is not null and not exists(select 1 from public._purchasing_po_request_sources(pl.id) src where src.demand_id=pl.demand_id)))) then
    raise exception 'merged PO source quantities do not reconcile' using errcode='22023',detail='request_po_coverage_changed'; end if;

   if exists(select 1 from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id cross join lateral public._purchasing_po_request_sources(pl.id) src where src.demand_id=d.id and po.status<>'cancelled'
    and (pl.sku is distinct from d.sku or nullif(pl.attrs,'{}'::jsonb) is distinct from nullif(d.attrs,'{}'::jsonb) or po.supplier_id is distinct from d.supplier_id
      or not public._purchasing_context_po_destination_matches(d.id,pl.id,coalesce(pl.destination_id,po.destination_id)) or po.purpose is distinct from d.purpose)) then raise exception 'PO no longer matches its approved demand' using errcode='22023',detail='request_po_coverage_changed'; end if;
   select coalesce(sum(src.qty),0) into issued from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id cross join lateral public._purchasing_po_request_active_sources(pl.id) src where src.demand_id=d.id and po.status<>'cancelled';
   if issued<>d.issued_qty or issued>d.approved_qty then raise exception 'PO quantity differs from request coverage' using errcode='22023',detail='request_po_coverage_changed'; end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('demand_id',d.id,'kind',d.fulfilment_kind,'approved_qty',d.approved_qty,'stock_qty',held,'issued_qty',issued,
   'to_buy',case when d.fulfilment_kind='purchase' then d.approved_qty-issued else 0 end,
   'recipients',case when d.fulfilment_kind='purchase' then public._purchasing_context_remaining_recipients(p_id,d.id,scope) else '[]'::jsonb end));
 end loop;
 return rows;
end;
$coverage$;
revoke all on function public._purchasing_context_coverage_admitted(uuid,boolean,jsonb) from public,anon,authenticated;
create or replace function public._purchasing_context_coverage(p_id uuid,p_for_issue boolean default false)
returns jsonb language sql set search_path=public,pg_temp as $coverage_read$
 select public._purchasing_context_coverage_admitted(p_id,p_for_issue,null);
$coverage_read$;
revoke all on function public._purchasing_context_coverage(uuid,boolean) from public,anon,authenticated;


-- Read-only preflight of one purchase allocation; actual PO issuance continues
-- to belong to purchasing_issue_pos_batch/its existing recorder. Public contextual
-- issue is admitted only through the canonical whole-batch preflight below.
create or replace function public._purchasing_context_issue_admission(p_demand_id uuid,p_qty integer)
returns jsonb language plpgsql set search_path=public,pg_temp as $issue_admission$
declare d public.purchase_demands%rowtype; coverage jsonb; line jsonb; r public.purchase_requests%rowtype; pending jsonb;
begin
 select * into strict d from public.purchase_demands where id=p_demand_id;
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
revoke all on function public._purchasing_context_issue_admission(uuid,integer) from public,anon,authenticated;

-- Raw before-state for an authorised revision. A stale source is precisely what
-- a revision may repair; this read claims NO current approval. The preceding
-- immutable approval remains separately preserved in the existing event.
create or replace function public._purchasing_context_revision_before(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $revision_before$
declare r public.purchase_requests%rowtype; demands jsonb;
begin
 select * into strict r from public.purchase_requests where id=p_id for update;
 perform 1 from public.purchase_demands where request_id=p_id order by id for update;
 select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') into demands from public.purchase_demands d where request_id=p_id and cancelled_at is null;
 return jsonb_build_object('version',1,'request_id',r.id,'request_version',r.request_version,'context',r.request_context,
  'purpose',r.purpose,'proceed_date',r.proceed_date,'destination_id',r.destination_id,'required_by',r.required_by,'demands',demands,'saved_approval',r.approval_scope,'forecast_mark',(select to_jsonb(f) from public.forecast_purchase_requests f where f.request_id=p_id));
end;
$revision_before$;
revoke all on function public._purchasing_context_revision_before(uuid) from public,anon,authenticated;

-- Private admission for the SAME request's approved/unissued revision. The
-- future resubmit writer must record before/after/actor/reason, invalidate the
-- old approval and increment version atomically after this gate; no public door
-- is exposed here. Read request -> demands before inspecting physical bindings.
create or replace function public._purchasing_request_revision_scope(p_id uuid,p_reason text)
returns jsonb language plpgsql set search_path=public,pg_temp as $revision$
declare r public.purchase_requests%rowtype; scope jsonb; actor_role text:=public.app_role();
begin
  if actor_role is null or actor_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode='42501';
  end if;
  select * into r from public.purchase_requests where id=p_id for update;
  if not found then raise exception 'unknown request' using errcode='22023',detail='unknown_request'; end if;
  if r.created_by is distinct from auth.uid() then
    raise exception 'only the requester may revise this request' using errcode='42501',detail='not_requester';
  end if;
  if coalesce(p_reason,'') !~ '[^[:space:]]' then
    raise exception 'a change reason is required' using errcode='22023',detail='revision_reason_required';
  end if;
  if r.approved_at is null or r.approved_by is null or r.refused_at is not null or r.withdrawn_at is not null or r.sent_back_at is not null
    or r.approval_scope is null or r.approval_version is distinct from r.request_version
    or r.approval_scope->'context' is distinct from r.request_context or (r.approval_scope->>'request_id')::uuid is distinct from r.id then
    raise exception 'saved preceding approval unavailable' using errcode='22023',detail='request_approval_unavailable'; end if;
  scope:=public._purchasing_context_revision_before(p_id);
  -- Include cancelled lines: an issued historical line is still an issued PO.
  if exists(select 1 from public.purchase_demands where request_id=p_id
    and (po_id is not null or ordered_at is not null or coalesce(issued_qty,0)>0))
    or exists(select 1 from public.purchase_order_lines pl cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands d on d.id=src.demand_id where d.request_id=p_id) then
    raise exception 'issued requests use their PO change process' using errcode='22023',detail='request_already_issued';
  end if;
  if exists(select 1 from public.ops_stock_items u join public.purchase_demands d on d.id=u.reserved_purchase_demand_id
    where d.request_id=p_id) then
    raise exception 'stock binding requires its owning change process' using errcode='22023',detail='request_stock_bound';
  end if;
  return scope;
end;
$revision$;
revoke all on function public._purchasing_request_revision_scope(uuid,text) from public,anon,authenticated;

-- ONE private demand projection shared by create and same-number revision.
-- No public grant and no physical stock allocation. Historical demands stay.
create or replace function public._purchasing_write_context_demands(p_id uuid,p_context jsonb)
returns void language plpgsql set search_path=public,pg_temp as $demands$
declare v_line jsonb; v_supplier uuid; a jsonb; kind text; required date; header_date date; target uuid; kept uuid[]:='{}';
begin
 select required_by into strict header_date from public.purchase_requests where id=p_id for update;
 perform public._purchasing_validate_request_context(p_context);
 perform public._purchasing_check_context_supplier_dates(p_context);
 for v_line in select * from jsonb_array_elements(p_context->'lines') loop
  select supplier_id into v_supplier from public.product_skus where sku=v_line->>'sku';
  if not found then raise exception 'unknown sku' using errcode='22023',detail='unknown_sku'; end if;
  if v_supplier is null then raise exception 'sku has no supplier' using errcode='22023',detail='sku_has_no_supplier'; end if;
  for a,kind in select x,'purchase'::text from jsonb_array_elements(v_line->'allocations') x union all select x,'stock_proposal'::text from jsonb_array_elements(v_line->'stockProposals') x loop
   required:=case when kind='purchase' then (a->>'supplierDeliveryDate')::date else header_date end;
   target:=null;
   select id into target from public.purchase_demands where request_id=p_id and cancelled_at is null and request_line_id=(v_line->>'id')::uuid
    and fulfilment_kind=kind and coalesce(supplier_allocation_id,stock_proposal_id)=(a->>'id')::uuid for update;
   if found then
    if (select count(*) from public.purchase_demands where request_id=p_id and cancelled_at is null and request_line_id=(v_line->>'id')::uuid and fulfilment_kind=kind and coalesce(supplier_allocation_id,stock_proposal_id)=(a->>'id')::uuid)<>1 then raise exception 'duplicate persisted allocation' using errcode='22023',detail='request_scope_changed'; end if;
    update public.purchase_demands set supplier_id=v_supplier,destination_id=(a->>'destinationId')::uuid,qty=(a->>'qty')::integer,required_by=required,attrs=nullif(nullif(v_line->'attrs','null'::jsonb),'{}'::jsonb),approved_qty=null where id=target;
   else
    insert into public.purchase_demands(purpose,sku,supplier_id,destination_id,qty,required_by,request_id,created_by,attrs,request_line_id,supplier_allocation_id,stock_proposal_id,fulfilment_kind)
     values(p_context->>'purpose',v_line->>'sku',v_supplier,(a->>'destinationId')::uuid,(a->>'qty')::integer,required,p_id,auth.uid(),nullif(nullif(v_line->'attrs','null'::jsonb),'{}'::jsonb),
      (v_line->>'id')::uuid,case when kind='purchase' then (a->>'id')::uuid end,case when kind='stock_proposal' then (a->>'id')::uuid end,kind) returning id into target;
   end if;
   kept:=kept||target;
  end loop;
 end loop;
 update public.purchase_demands set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason='Replaced by reviewed request scope'
  where request_id=p_id and cancelled_at is null and not(id=any(kept));
end;
$demands$;
revoke all on function public._purchasing_write_context_demands(uuid,jsonb) from public,anon,authenticated;

-- One qualified proposal reader for pre-create and saved-request Review.
-- It never reserves Units. Counted goods have no Unit offers.
create or replace function public._purchasing_context_stock_offers(p_lines jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $stock_offers$
declare l jsonb; offers jsonb:='[]'; entry jsonb;
begin
 if jsonb_typeof(p_lines) is distinct from 'array' then
  raise exception 'invalid stock read scope' using errcode='22023',detail='invalid_param'; end if;
 if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_lines) x) then
  raise exception 'duplicate stock line identity' using errcode='22023',detail='invalid_param'; end if;
 for l in select * from jsonb_array_elements(p_lines) loop
  if jsonb_typeof(l->'id') is distinct from 'string' or jsonb_typeof(l->'sku') is distinct from 'string'
    or length(l->>'sku') not between 1 and 120 or jsonb_typeof(l->'attrs') not in ('object','null') or not(l ? 'attrs') then
   raise exception 'invalid stock line' using errcode='22023',detail='invalid_param'; end if;
  perform (l->>'id')::uuid;
  for entry in
   select jsonb_build_object('lineId',(l->>'id')::uuid,'locationId',w.id,'destinationId',dest.id,
    'name',dest.name,'available',count(*)::integer,
    'units',jsonb_agg(jsonb_build_object('id',u.id,'qty',u.qty,'warehouse_id',u.warehouse_id,'condition',u.condition) order by u.id))
   from public.ops_stock_items u
   join public.warehouses w on w.id=u.warehouse_id
   join public.purchasing_destinations dest on dest.warehouse_id=w.id and dest.active
   left join public.purchase_order_lines pl on pl.id=u.po_line_id
   where public.stock_match_key(u.sku)=public.stock_match_key(l->>'sku')
    and u.identity_scope='unit' and u.qty=1 and u.reserved_purchase_demand_id is null and u.reserved_order_line_id is null
    and public.unit_availability(u.status,u.needs_repair,u.hold_reason,u.condition)='available'
    and nullif(pl.attrs,'{}'::jsonb) is not distinct from nullif(nullif(l->'attrs','null'::jsonb),'{}'::jsonb)
   group by w.id,dest.id,dest.name order by w.id,dest.id
  loop offers:=offers||jsonb_build_array(entry); end loop;
 end loop;
 return offers;
end;
$stock_offers$;
revoke all on function public._purchasing_context_stock_offers(jsonb) from public,anon,authenticated;

create or replace function public.purchasing_request_stock_offers(p_lines jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $stock_offers_read$
begin
 if public.app_role() is null or public.app_role() not in ('operation','principal') then
  raise exception 'not permitted' using errcode='42501'; end if;
 return public._purchasing_context_stock_offers(p_lines);
end;
$stock_offers_read$;
revoke all on function public.purchasing_request_stock_offers(jsonb) from public,anon;
grant execute on function public.purchasing_request_stock_offers(jsonb) to authenticated;

-- Live review read only; proposal availability is not a Unit reservation.
create or replace function public._purchasing_context_review(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $review$
declare scope jsonb; r public.purchase_requests%rowtype; l jsonb; a jsonb; candidates jsonb; stocks jsonb:='[]'; offers jsonb;
begin
 scope:=public._purchasing_request_context_state(p_id);
 select * into strict r from public.purchase_requests where id=p_id;
 offers:=public._purchasing_context_stock_offers(r.request_context->'lines');
 for l in select * from jsonb_array_elements(r.request_context->'lines') loop
  for a in select * from jsonb_array_elements(l->'stockProposals') loop
   select x->'units' into candidates from jsonb_array_elements(offers) x
    where x->>'lineId'=l->>'id' and x->>'locationId'=a->>'locationId' and x->>'destinationId'=a->>'destinationId';
   candidates:=coalesce(candidates,'[]'::jsonb);
   stocks:=stocks||jsonb_build_array(jsonb_build_object('lineId',(l->>'id')::uuid,'allocationId',(a->>'id')::uuid,'units',candidates,'availableQty',jsonb_array_length(candidates)));
  end loop;
 end loop;
 return jsonb_build_object('request_version',r.request_version,'state',scope,'stock_source',stocks,'stock_offers',offers);
end;
$review$;
revoke all on function public._purchasing_context_review(uuid) from public,anon,authenticated;

-- Historical approval may cease admitting NEW MPR issue while an already-issued
-- RS commitment remains truthful. This read grants no approval/issue authority.
-- Existing PO owner may finish the unchanged fixed need; no MPR recall/reapproval.
create or replace function public._purchasing_context_committed_rs_coverage(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $committed_rs$
declare r public.purchase_requests%rowtype; facts jsonb;
begin
 select * into strict r from public.purchase_requests where id=p_id;
 if r.purpose<>'ready_stock' or r.request_version is null or r.request_version<1 or r.approval_version is distinct from r.request_version
  or r.approved_at is null or r.approved_by is null or r.refused_at is not null or r.withdrawn_at is not null or r.sent_back_at is not null
  or r.approval_scope is null or r.approval_scope->'context' is distinct from r.request_context
  or (r.approval_scope->>'request_id')::uuid is distinct from r.id
  or (r.approval_scope->>'request_version')::integer is distinct from r.request_version
  or r.approval_scope->>'purpose' is distinct from r.purpose
  or (r.approval_scope->>'proceed_date')::date is distinct from r.proceed_date
  or (r.approval_scope->>'requester_id')::uuid is distinct from r.created_by
  or (r.approval_scope->>'created_at')::timestamptz is distinct from r.created_at
  or r.fulfilment_intent is distinct from 'additional_stock' or r.approval_required is distinct from true
  or r.required_by is distinct from (r.request_context->>'stockDeliveryDate')::date
  or r.destination_id is distinct from (select (a->>'destinationId')::uuid from jsonb_array_elements(r.request_context->'lines') l cross join lateral jsonb_array_elements(l->'allocations') a limit 1)
  or not exists(select 1 from public.purchase_demands where request_id=p_id and issued_qty>0) then return null; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'request_line_id',request_line_id,
  'supplier_allocation_id',supplier_allocation_id,'stock_proposal_id',stock_proposal_id,'fulfilment_kind',fulfilment_kind,
  'sku',sku,'attrs',attrs,'supplier_id',supplier_id,'destination_id',destination_id,'required_by',required_by,
  'qty',qty,'approved_qty',approved_qty) order by id),'[]') into facts
 from public.purchase_demands where request_id=p_id and cancelled_at is null;
 if facts is distinct from r.approval_scope->'demands' then return null; end if;
 return public._purchasing_context_coverage_admitted(p_id,false,r.approval_scope);
end;
$committed_rs$;
revoke all on function public._purchasing_context_committed_rs_coverage(uuid) from public,anon,authenticated;

-- Public read retains the existing Operation/Principal request-reader permission.
-- An unavailable source is NOT empty scope and cannot be approved.
create or replace function public.purchasing_request_context_review(p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $review_read$
declare actor_role text:=public.app_role(); r public.purchase_requests%rowtype; detail text; events jsonb; approval_scope_valid boolean:=false; committed_coverage jsonb;
begin
 if actor_role is null or actor_role not in ('operation','principal') then raise exception 'not permitted' using errcode='42501'; end if;
 select * into strict r from public.purchase_requests where id=p_id;
 if r.request_version<1 or r.request_context is null then raise exception 'context unavailable' using errcode='22023',detail='context_unavailable'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('round',e.round,'kind',e.kind,'actor_id',e.actor_id,
  'occurred_at',e.occurred_at,'reason',e.reason,'changes',e.changes) order by e.occurred_at,e.id),'[]') into events
  from public.purchase_request_events e where e.request_id=p_id;
 begin
  if r.approved_at is not null then
   perform public._purchasing_assert_request_approval(p_id); approval_scope_valid:=true;
  end if;
  return jsonb_build_object('available',true,'review',public._purchasing_context_review(p_id),'events',events,'coverage',case when r.approved_at is null then null else public._purchasing_context_coverage(p_id,false) end,'approval',case when r.approved_at is null then null else jsonb_build_object('request_version',r.request_version,'approval_version',r.approval_version,'token',md5(r.approval_scope::text)) end);
 exception when invalid_parameter_value then
  get stacked diagnostics detail=pg_exception_detail;
  begin committed_coverage:=public._purchasing_context_committed_rs_coverage(p_id);
  exception when invalid_parameter_value then committed_coverage:=null; end;
  return jsonb_build_object('available',false,'reason',detail,'request_version',r.request_version,'request_context',r.request_context,'events',events,'approval_scope_valid',approval_scope_valid,'committed_coverage',committed_coverage);
 end;
end;
$review_read$;
revoke all on function public.purchasing_request_context_review(uuid) from public,anon;
grant execute on function public.purchasing_request_context_review(uuid) to authenticated;

-- One private approval orchestrator used by the canonical public decision door.
-- Existing approver gate only; canonical issue performs its separate admission.
create or replace function public._purchasing_approve_context_review(p_id uuid,p_review jsonb,p_reason text)
returns jsonb language plpgsql set search_path=public,pg_temp as $approve_review$
declare actor_role text:=public.purchasing_approver_gate(); r public.purchase_requests%rowtype; current_review jsonb; c jsonb; l jsonb; old_line jsonb; before_state jsonb; scope jsonb; x jsonb; distribution jsonb; target uuid; quantity bigint; location uuid; available integer; stock_group record;
begin
 perform public._purchasing_context_request_source_locks(p_id);
 select * into strict r from public.purchase_requests where id=p_id for update;
 if r.created_by is not distinct from auth.uid() then raise exception 'cannot approve own request' using errcode='42501',detail='own_request'; end if;
 if r.approved_at is not null or r.refused_at is not null or r.withdrawn_at is not null or r.sent_back_at is not null then raise exception 'request is not awaiting approval' using errcode='22023',detail='request_not_awaiting_approval'; end if;
 perform public._purchasing_context_object(p_review,'{"expected_version":"number","review_scope":"object","request_context":"object","approved_distribution":"array|null"}');
 if (p_review->>'expected_version')::numeric<>r.request_version then raise exception 'request version changed' using errcode='22023',detail='request_version_changed'; end if;
 current_review:=public._purchasing_context_review(p_id);
 if current_review is distinct from p_review->'review_scope' then raise exception 'request review changed' using errcode='22023',detail='request_review_changed'; end if;
 c:=p_review->'request_context';
 perform public._purchasing_validate_request_context(c);
 perform public._purchasing_check_context_supplier_dates(c,greatest((now() at time zone 'Asia/Kuala_Lumpur')::date,(c->>'proceedDate')::date));
 before_state:=public._purchasing_context_revision_before(p_id);
 if c is distinct from r.request_context then
  if r.purpose='ready_stock' or (c-'lines') is distinct from (r.request_context-'lines') or jsonb_array_length(c->'lines')<>jsonb_array_length(r.request_context->'lines') then
   raise exception 'approval may adjust stock choice, not rewrite requested need' using errcode='22023',detail='approval_need_changed'; end if;
  if coalesce(p_reason,'') !~ '[^[:space:]]' then raise exception 'stock adjustment reason required' using errcode='22023',detail='approval_change_reason_required'; end if;
  for l in select * from jsonb_array_elements(c->'lines') loop
   select v into old_line from jsonb_array_elements(r.request_context->'lines') v where (v->>'id')::uuid=(l->>'id')::uuid;
   if not found then raise exception 'requested line identity changed' using errcode='22023',detail='approval_need_changed'; end if;
   if (l-'stockProposals'-'allocations') is distinct from (old_line-'stockProposals'-'allocations') or (l->'stockProposals' is not distinct from old_line->'stockProposals' and l->'allocations' is distinct from old_line->'allocations') then
    raise exception 'approval must retain requested goods/quantity/recipients' using errcode='22023',detail='approval_need_changed'; end if;
  end loop;
  if exists(select 1 from public.purchase_demands where request_id=p_id and (po_id is not null or ordered_at is not null or issued_qty>0))
   or exists(select 1 from public.purchase_order_lines pl cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands d on d.id=src.demand_id where d.request_id=p_id)
   or exists(select 1 from public.ops_stock_items u join public.purchase_demands d on d.id=u.reserved_purchase_demand_id where d.request_id=p_id) then
   raise exception 'committed scope cannot be adjusted here' using errcode='22023',detail='request_already_committed'; end if;
  update public.purchase_requests set request_context=c,request_version=request_version+1,destination_id=coalesce(
   (select (a->>'destinationId')::uuid from jsonb_array_elements(c->'lines') proposed_line cross join lateral jsonb_array_elements(proposed_line->'allocations') a limit 1),
   (select (a->>'destinationId')::uuid from jsonb_array_elements(c->'lines') proposed_line cross join lateral jsonb_array_elements(proposed_line->'stockProposals') a limit 1)) where id=p_id;
  perform public._purchasing_write_context_demands(p_id,c);
 end if;
 -- Translate stable form allocation IDs only after the common projector, so a
 -- newly reviewed stock split never borrows an old demand's recipient mapping.
 distribution:=null;
 if p_review->'approved_distribution'<>'null'::jsonb then
  distribution:='[]';
  for x in select * from jsonb_array_elements(p_review->'approved_distribution') loop
   perform public._purchasing_context_object(x,'{"lineId":"string","allocationId":"string","kind":"string","qty":"number","recipients":"array"}');
   select id into target from public.purchase_demands where request_id=p_id and cancelled_at is null and request_line_id=(x->>'lineId')::uuid
    and coalesce(supplier_allocation_id,stock_proposal_id)=(x->>'allocationId')::uuid and fulfilment_kind=x->>'kind';
   if not found then raise exception 'approved allocation unavailable' using errcode='22023',detail='invalid_approval_distribution'; end if;
   distribution:=distribution||jsonb_build_array(jsonb_build_object('demandId',target,'qty',x->'qty','recipients',x->'recipients'));
  end loop;
 end if;
 distribution:=public._purchasing_context_approval_distribution(p_id,distribution,false);
 -- Check the actual currently available pool without reserving it. Saved approval
 -- excludes the whole shelf: a later shelf increase does not auto-net a GP buy.
 current_review:=public._purchasing_context_review(p_id);
 for stock_group in
  select ss->'units' as pool,sum((v->>'qty')::integer) as qty from jsonb_array_elements(current_review->'stock_source') ss
   join public.purchase_demands d on d.request_id=p_id and d.cancelled_at is null and d.stock_proposal_id=(ss->>'allocationId')::uuid and d.request_line_id=(ss->>'lineId')::uuid
   join jsonb_array_elements(distribution) v on (v->>'demandId')::uuid=d.id group by ss->'units'
 loop
  if stock_group.qty>jsonb_array_length(stock_group.pool) then raise exception 'stock proposals exceed their shared available pool' using errcode='22023',detail='stock_proposal_unavailable'; end if;
 end loop;
 scope:=public._purchasing_stamp_context_approval(p_id,distribution);
 insert into public.purchase_request_events(request_id,round,kind,actor_id,reason,changes)
  values(p_id,r.round,'approved',auth.uid(),nullif(btrim(p_reason),''),jsonb_build_object('before',before_state,'after',scope,'review_scope',p_review->'review_scope'));
 return scope;
end;
$approve_review$;
revoke all on function public._purchasing_approve_context_review(uuid,jsonb,text) from public,anon,authenticated;

-- Existing canonical create signature and legacy branch are retained. Context
-- branch rechecks supplier production calendar, source and destinations atomically;
-- private closed admission prevents activation by direct RPC. Remaining delivery
-- boundaries are recorded in the adjacent exact review manifest, not inferred here.
CREATE OR REPLACE FUNCTION public.purchasing_create_request_with_lines(p_purpose text, p_destination_id uuid, p_why text DEFAULT NULL::text, p_required_by date DEFAULT NULL::date, p_for_service_case_id uuid DEFAULT NULL::uuid, p_for_staff_user_id uuid DEFAULT NULL::uuid, p_for_subsidiary_name text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_fulfilment_intent text DEFAULT NULL::text, p_purchase_requirement text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_context jsonb; v_forecast_sources jsonb; v_submission_key uuid; v_existing public.purchase_requests%rowtype;
  v_destination uuid; v_required date; v_supplier uuid; v_allocation jsonb; v_stock jsonb;
  v_role public.app_role; v_no text; v_prefix text;
  v_header   jsonb;
  v_id       uuid;
  v_line     jsonb;
  v_one      jsonb;
  v_line_ids jsonb := '[]'::jsonb;
begin
  if p_purpose='ready_stock' then perform pg_advisory_xact_lock(hashtextextended('purchasing.forecast_purchase.submit',0)); end if;
  -- The existing public owner gains one strict context envelope; its legacy
  -- body below is retained byte-for-byte. No overload or alternative request RPC.
  if jsonb_typeof(p_lines)='array' and jsonb_array_length(p_lines)>0
     and (p_lines->0) ? 'request_context' then
    perform public._purchasing_context_writer_admission();
    if jsonb_array_length(p_lines)<>1 then raise exception 'one context envelope required' using errcode='22023',detail='invalid_param'; end if;
    if p_lines->0->'request_context'->>'origin'='forecast_suggestion' then
      perform public._purchasing_context_object(p_lines->0,'{"request_context":"object","submission_key":"string","forecast_source":"array"}');
    else
      perform public._purchasing_context_object(p_lines->0,'{"request_context":"object","submission_key":"string"}');
    end if;
    v_context:=p_lines->0->'request_context';
    v_submission_key:=(p_lines->0->>'submission_key')::uuid;
    if v_submission_key is null then raise exception 'submission key required' using errcode='22023',detail='invalid_param'; end if;
    v_role:=public.app_role();
    if v_role is null or v_role not in ('operation') or not exists
      (select 1 from public.app_users where id=auth.uid() and is_person and status='active') then
      raise exception 'an actual requester is required' using errcode='42501',detail='requester_required';
    end if;
    if p_purpose is distinct from v_context->>'purpose' or p_for_service_case_id is distinct from (v_context->>'serviceCaseId')::uuid
      or p_for_staff_user_id is not null or p_for_subsidiary_name is not null or p_why is not null or p_purchase_requirement is not null
      or p_fulfilment_intent is distinct from (case when v_context->>'purpose'='ready_stock' then 'additional_stock' else 'concrete_need' end) then
      raise exception 'header facts disagree with context' using errcode='22023',detail='invalid_param';
    end if;
    -- A key is scoped to its actual requester. Concurrent retries queue before
    -- number allocation, and a reused key never silently accepts changed goods.
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||v_submission_key::text,0));
    select * into v_existing from public.purchase_requests where created_by=auth.uid() and submission_key=v_submission_key for update;
    if found then
      if v_existing.request_context is distinct from v_context or (v_context->>'origin'='forecast_suggestion' and
        (select jsonb_agg(x order by x->>'sku') from jsonb_array_elements(p_lines->0->'forecast_source') x) is distinct from
        (select jsonb_agg(source order by source->>'sku') from (select distinct l#>'{basis,source_snapshot}' source from public.forecast_purchase_requests f cross join lateral jsonb_array_elements(f.lines) l where f.request_id=v_existing.id) q)) then
        raise exception 'submission scope changed' using errcode='22023',detail='submission_scope_changed'; end if;
      select coalesce(jsonb_agg(id order by created_at,id),'[]') into v_line_ids from public.purchase_demands where request_id=v_existing.id;
      return jsonb_build_object('id',v_existing.id,'req_no',v_existing.req_no,'approval_required',true,'line_ids',v_line_ids,'request_version',v_existing.request_version);
    end if;
    perform 1 from public.purchasing_settings where id=1 for share;
    perform public._purchasing_validate_request_context(v_context);
    -- Forecast suggestion admission still needs its existing source/fingerprint
    -- transaction. Never admit an untraceable suggestion as a manual top-up.
    if v_context->>'origin'='forecast_suggestion' then
      perform public._purchasing_context_source_locks(array(select l->>'sku' from jsonb_array_elements(v_context->'lines') l));
      v_forecast_sources:=public._purchasing_check_context_forecast_source(v_context,p_lines->0->'forecast_source');
    end if;
    select coalesce(
      (select (a->>'destinationId')::uuid from jsonb_array_elements(v_context->'lines') l cross join lateral jsonb_array_elements(l->'allocations') a limit 1),
      (select (a->>'destinationId')::uuid from jsonb_array_elements(v_context->'lines') l cross join lateral jsonb_array_elements(l->'stockProposals') a limit 1)
    ) into v_destination;
    v_required:=case when p_purpose='ready_stock' then (v_context->>'stockDeliveryDate')::date else
      (select min((r->>'deliveryDate')::date) from jsonb_array_elements(v_context->'recipients') r) end;
    v_id:=gen_random_uuid();
    v_prefix:=case p_purpose when 'service_case' then 'SC' when 'general_purchase' then 'GP' when 'ready_stock' then 'RS' end;
    -- One existing random-code allocator, same per-prefix pool and document ID.
    -- Only this new request uses the already-approved compact identity; history stays.
    v_no:=public.allocate_formal_document_code(v_prefix,v_id::text);
    v_no:=regexp_replace(v_no,'^([A-Z]+)-[0-9]{2}([0-9]{6})-',E'\\1\\2-');
    insert into public.purchase_requests(id,req_no,purpose,destination_id,required_by,for_service_case_id,
      fulfilment_intent,approval_required,created_by,request_context,proceed_date,request_version,submission_key)
    values(v_id,v_no,p_purpose,v_destination,v_required,p_for_service_case_id,p_fulfilment_intent,true,auth.uid(),v_context,
      (v_context->>'proceedDate')::date,1,v_submission_key);
    perform public._purchasing_write_context_demands(v_id,v_context);
    if v_forecast_sources is not null then perform public._purchasing_write_forecast_request_mark(v_id,(v_forecast_sources->0->>'week')::date,v_submission_key,public._purchasing_context_forecast_mark_lines(v_context,v_forecast_sources)); end if;
    insert into public.audit_log(role,actor_text,action,ref)
      values(v_role,(select name from public.app_users where id=auth.uid()),'Purchase requested: '||v_no,v_id::text);
    select coalesce(jsonb_agg(id order by created_at,id),'[]') into v_line_ids from public.purchase_demands where request_id=v_id;
    return jsonb_build_object('id',v_id,'req_no',v_no,'approval_required',true,'line_ids',v_line_ids,'request_version',1);
  end if;
  -- 0591 · 0562's body plus the per-line configuration (`attrs`); the
  -- signature is unchanged, so the API keeps calling the one door by name.
  -- A request with no lines is the half-record this door exists to prevent.
  if p_lines is null
     or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'a manual purchase needs at least one line'
      using errcode = '22023', detail = 'lines_required';
  end if;

  -- THE HEADER, through its own door. Every purpose rule, the `why` rule and
  -- the three structured-For rules run inside `purchasing_create_request`.
  -- 0549: the arguments are NAMED, so this binds to the eight-argument form
  -- 0546 created and the intent actually reaches the row. Called positionally
  -- it would bind to 0522's seven-argument twin and silently store NULL —
  -- which is the defect this file exists to close.
  v_header := public.purchasing_create_request(
    p_purpose             => p_purpose,
    p_destination_id      => p_destination_id,
    p_why                 => p_why,
    p_required_by         => p_required_by,
    p_for_service_case_id => p_for_service_case_id,
    p_for_staff_user_id   => p_for_staff_user_id,
    p_for_subsidiary_name => p_for_subsidiary_name,
    p_fulfilment_intent   => p_fulfilment_intent,
    p_purchase_requirement => p_purchase_requirement
  );
  v_id := (v_header ->> 'id')::uuid;

  -- THE LINES, through their own door, in the order they were typed. Any
  -- refusal raised in here aborts this function, and the header inserted above
  -- goes with it — that is the whole point of this file.
  --
  -- The destination and the purpose come from the HEADER, never from the line
  -- payload. `purchasing_create_demand` refuses a line that contradicts its
  -- request (`destination_mismatch` / `purpose_mismatch`), so passing the
  -- header's own values removes a way to be refused for a fact nobody was
  -- asked about twice.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_one := public.purchasing_create_demand(
      v_line ->> 'sku',
      (v_line ->> 'qty')::int,
      p_destination_id,
      nullif(v_line ->> 'required_by', '')::date,
      v_line ->> 'remark',
      p_purpose,
      v_id
    );
    -- 0591 · the line's CONFIGURATION, chosen like a Sales portal line
    -- (colour · fabric · size · options), kept on the demand so the PO it
    -- becomes prints it. An object or nothing; a non-object is ignored.
    if jsonb_typeof(v_line -> 'attrs') = 'object' and v_line -> 'attrs' <> '{}'::jsonb then
      update public.purchase_demands
         set attrs = v_line -> 'attrs'
       where id = (v_one ->> 'id')::uuid;
    end if;
    v_line_ids := v_line_ids || jsonb_build_array(v_one ->> 'id');
  end loop;

  -- The header door's own answer, plus what was written under it. The browser
  -- reads `id` and `req_no` exactly as it did from the header-only call.
  return v_header || jsonb_build_object('line_ids', v_line_ids);
end;
$function$;

CREATE OR REPLACE FUNCTION public.purchasing_decide_request(p_id uuid, p_decision text, p_reason text DEFAULT NULL::text, p_cuts jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role text := (select public.purchasing_approver_gate());
  v_req  purchase_requests%rowtype;
  v_cut  jsonb;
  v_line purchase_demands%rowtype;
  v_qty  int;
begin
  if p_decision is null or p_decision not in ('approve', 'refuse', 'send_back') then
    raise exception 'decision must be approve, refuse or send_back'
      using errcode = '22023', detail = 'invalid_decision';
  end if;

  perform public._purchasing_context_request_source_locks(p_id);
  -- THE ONE ROW EVERY DECISION QUEUES ON (see 0522 header: lock order).
  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  if v_req.sent_back_at is not null then
    raise exception 'request is back with the requester'
      using errcode = '22023', detail = 'request_sent_back';
  end if;
  -- Owner ruling 2026-09-18: nobody approves a Manual Purchase they raised.
  -- The requester withdraws instead; a decision is somebody else's.
  if v_req.created_by is not distinct from auth.uid() then
    raise exception 'you cannot decide a purchase you raised'
      using errcode = '42501', detail = 'own_request';
  end if;

  if v_req.request_version>0 or v_req.request_context is not null then
    perform public._purchasing_context_writer_admission();
    if jsonb_typeof(p_cuts) is distinct from 'object' then raise exception 'a current context review is required' using errcode='22023',detail='context_review_required'; end if;
    if p_decision='approve' then
      perform public._purchasing_approve_context_review(p_id,p_cuts,p_reason);
      return jsonb_build_object('id',p_id,'req_no',v_req.req_no,'decision','approved',
        'request_version',(select request_version from public.purchase_requests where id=p_id));
    end if;
    -- Refusal/send-back grants no buying authority. They remain possible when
    -- the source is unreadable/stale, so the requester can repair it safely.
    perform public._purchasing_context_object(p_cuts,'{"expected_version":"number","review_scope":"object","request_context":"object","approved_distribution":"array|null"}');
    if (p_cuts->>'expected_version')::numeric<>v_req.request_version or p_cuts->'request_context' is distinct from v_req.request_context
      or p_cuts->'approved_distribution'<>'null'::jsonb then raise exception 'request changed before decision' using errcode='22023',detail='request_version_changed'; end if;
    p_cuts:=null;
  end if;

  if p_decision in ('refuse', 'send_back') then
    if coalesce(p_reason, '') !~ '[^[:space:]]' then
      raise exception 'a decision reason is required'
        using errcode = '22023', detail = 'reason_required';
    end if;
    if p_cuts is not null then
      raise exception 'only an approval carries cuts'
        using errcode = '22023', detail = 'cuts_on_refusal';
    end if;
  end if;

  if p_decision = 'refuse' then
    update purchase_requests
       set refused_at = now(), refused_by = auth.uid(),
           refuse_reason = btrim(p_reason)
     where id = p_id;

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase refused: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'refused');
  end if;

  if p_decision = 'send_back' then
    update purchase_requests
       set sent_back_at = now(), sent_back_by = auth.uid(),
           sent_back_reason = btrim(p_reason)
     where id = p_id;

    insert into purchase_request_events (request_id, round, kind, actor_id, reason)
    values (p_id, v_req.round, 'sent_back', auth.uid(), btrim(p_reason));

    insert into audit_log (role, actor_text, action, ref)
    values (v_role::public.app_role,
            (select name from app_users where id = auth.uid()),
            format('Purchase sent back for changes: %s', btrim(p_reason)),
            p_id::text);

    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'sent_back');
  end if;

  -- APPROVE. Cuts first, so a bad cut refuses the whole act atomically.
  if p_cuts is not null then
    if jsonb_typeof(p_cuts) <> 'array' then
      raise exception 'cuts must be an array'
        using errcode = '22023', detail = 'invalid_cuts';
    end if;
    for v_cut in select * from jsonb_array_elements(p_cuts) loop
      select * into v_line from purchase_demands
       where id = (v_cut ->> 'id')::uuid and request_id = p_id
       for update;
      if not found then
        raise exception 'cut names a line this request does not have'
          using errcode = '22023', detail = 'unknown_line';
      end if;
      v_qty := (v_cut ->> 'qty')::int;
      if v_qty is null or v_qty < 0 or v_qty > v_line.qty then
        raise exception 'cut for % must be between 0 and %', v_line.sku, v_line.qty
          using errcode = '22023', detail = 'invalid_cut_qty';
      end if;
      update purchase_demands set approved_qty = v_qty where id = v_line.id;
    end loop;
  end if;

  update purchase_requests
     set approved_at = now(), approved_by = auth.uid()
   where id = p_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role::public.app_role,
          (select name from app_users where id = auth.uid()),
          'Purchase approved',
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no, 'decision', 'approved');
end;
$function$;

-- SAME public resubmit signature; legacy behavior retained, contextual revisions
-- use exact whole scope/version/retry/history. Deployment acceptance remains owed.
CREATE OR REPLACE FUNCTION public.purchasing_resubmit_request(p_id uuid, p_destination_id uuid, p_required_by date, p_why text DEFAULT NULL::text, p_for_service_case_id uuid DEFAULT NULL::uuid, p_for_staff_user_id uuid DEFAULT NULL::uuid, p_for_subsidiary_name text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_purchase_requirement text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_context jsonb; v_forecast_sources jsonb; v_forecast_key uuid; v_revision_key uuid; v_expected integer; v_before jsonb; v_after jsonb; v_event public.purchase_request_events%rowtype;
  v_destination uuid; v_required date; v_retry_key text; v_source_changed boolean:=false; v_source_detail text;
  v_role    app_role;
  v_req     purchase_requests%rowtype;
  v_line    jsonb;
  v_old     purchase_demands%rowtype;
  v_keep    uuid[] := '{}';
  v_changes jsonb := '[]'::jsonb;
  v_qty     int;
  v_remark  text;
  v_attrs   jsonb;
  v_id      uuid;
  -- 0562 · trimmed to a real absence, so CLEARING it is a real edit.
  v_need    text := nullif(btrim(coalesce(p_purchase_requirement, '')), '');
begin
  -- 0591 · 0562's body plus the per-line configuration (`attrs`), compared
  -- and recorded like every other line change; the signature is unchanged.
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  perform public._purchasing_context_request_source_locks(p_id);
  if jsonb_typeof(p_lines)='array' and (p_lines->0)?'request_context' and p_lines->0->'request_context'->>'purpose'='ready_stock' then
    perform public._purchasing_context_source_locks(array(select l->>'sku' from jsonb_array_elements(p_lines->0->'request_context'->'lines') l));
  end if;
  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.request_version>0 or v_req.request_context is not null then
    perform public._purchasing_context_writer_admission();
    if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<>1 or not ((p_lines->0)?'request_context') then
      raise exception 'context revision envelope required' using errcode='22023',detail='context_revision_required';
    end if;
    if p_lines->0->'request_context'->>'origin'='forecast_suggestion' then
      perform public._purchasing_context_object(p_lines->0,'{"request_context":"object","revision_key":"string","expected_version":"number","reason":"string","forecast_source":"array"}');
    else
      perform public._purchasing_context_object(p_lines->0,'{"request_context":"object","revision_key":"string","expected_version":"number","reason":"string"}');
    end if;
    v_context:=p_lines->0->'request_context'; v_revision_key:=(p_lines->0->>'revision_key')::uuid;
    if (p_lines->0->>'expected_version') !~ '^[1-9][0-9]*$' then raise exception 'expected request version required' using errcode='22023',detail='invalid_param'; end if;
    v_expected:=(p_lines->0->>'expected_version')::integer;
    if v_req.created_by is distinct from auth.uid() then raise exception 'only the requester may revise' using errcode='42501',detail='not_requester'; end if;
    if coalesce(p_lines->0->>'reason','') !~ '[^[:space:]]' then raise exception 'a change reason is required' using errcode='22023',detail='revision_reason_required'; end if;
    if p_why is not null or p_for_staff_user_id is not null or p_for_subsidiary_name is not null or p_purchase_requirement is not null
      or p_for_service_case_id is distinct from (v_context->>'serviceCaseId')::uuid
      or v_context->>'purpose' is distinct from v_req.purpose or v_context->>'origin' is distinct from v_req.request_context->>'origin' then
      raise exception 'revision header disagrees' using errcode='22023',detail='invalid_param';
    end if;
    -- One request lock serialises simultaneous revisions. A retry reads its
    -- saved event before version admission and never increments the round twice.
    select * into v_event from public.purchase_request_events where request_id=p_id and kind='resubmitted'
      and changes->>'revision_key'=v_revision_key::text order by occurred_at desc limit 1;
    if found then
      if v_event.actor_id is distinct from auth.uid() or v_event.changes->'after_context' is distinct from v_context
        or v_event.changes->>'reason' is distinct from btrim(p_lines->0->>'reason')
        or (v_event.changes->>'previous_version')::integer is distinct from v_expected
        or (v_context->>'origin'='forecast_suggestion' and (select jsonb_agg(x order by x->>'sku') from jsonb_array_elements(p_lines->0->'forecast_source') x) is distinct from v_event.changes#>'{after,forecast_source,sources}') then
        raise exception 'revision key scope changed' using errcode='22023',detail='revision_scope_changed';
      end if;
      return jsonb_build_object('id',p_id,'req_no',v_req.req_no,'round',v_event.round,'request_version',(v_event.changes->>'request_version')::integer,'approval_required',true);
    end if;
    if v_req.request_version<>v_expected then raise exception 'request changed before revision' using errcode='22023',detail='request_version_changed'; end if;
    if v_req.approved_at is not null then
      begin
        perform public._purchasing_assert_request_approval(p_id);
      exception when invalid_parameter_value then
        get stacked diagnostics v_source_detail=pg_exception_detail;
        if v_source_detail not in ('request_source_changed','request_approval_changed','supplier_date_before_earliest','supplier_plan_unavailable','request_scope_changed','forecast_source_changed','forecast_source_required') then raise; end if;
        v_source_changed:=true;
      end;
      v_before:=public._purchasing_request_revision_scope(p_id,p_lines->0->>'reason');
    elsif v_req.sent_back_at is not null and v_req.withdrawn_at is null and v_req.refused_at is null then
      v_before:=public._purchasing_context_revision_before(p_id);
      if exists(select 1 from public.purchase_demands where request_id=p_id and (po_id is not null or ordered_at is not null or coalesce(issued_qty,0)>0))
        or exists(select 1 from public.purchase_order_lines pl cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands d on d.id=src.demand_id where d.request_id=p_id)
        or exists(select 1 from public.ops_stock_items u join public.purchase_demands d on d.id=u.reserved_purchase_demand_id where d.request_id=p_id) then
        raise exception 'committed scope cannot be revised here' using errcode='22023',detail='request_already_committed';
      end if;
    else
      raise exception 'request is not available for revision' using errcode='22023',detail='request_revision_unavailable';
    end if;
    perform 1 from public.purchasing_settings where id=1 for share;
    perform public._purchasing_validate_request_context(v_context);
    if v_context->>'origin'='forecast_suggestion' then v_forecast_sources:=public._purchasing_check_context_forecast_source(v_context,p_lines->0->'forecast_source',p_id); end if;
    if v_req.approved_at is not null and not v_source_changed and v_context is not distinct from v_req.request_context then raise exception 'revision has no changes' using errcode='22023',detail='request_unchanged'; end if;
    select coalesce(
      (select (a->>'destinationId')::uuid from jsonb_array_elements(v_context->'lines') l cross join lateral jsonb_array_elements(l->'allocations') a limit 1),
      (select (a->>'destinationId')::uuid from jsonb_array_elements(v_context->'lines') l cross join lateral jsonb_array_elements(l->'stockProposals') a limit 1)) into v_destination;
    v_required:=case when v_req.purpose='ready_stock' then (v_context->>'stockDeliveryDate')::date else
      (select min((r->>'deliveryDate')::date) from jsonb_array_elements(v_context->'recipients') r) end;
    update public.purchase_demands set cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason='Replaced by request revision'
      where request_id=p_id and cancelled_at is null;
    update public.purchase_requests set request_context=v_context,request_version=v_expected+1,proceed_date=(v_context->>'proceedDate')::date,
      destination_id=v_destination,required_by=v_required,for_service_case_id=(v_context->>'serviceCaseId')::uuid,
      approved_at=null,approved_by=null,approval_scope=null,approval_version=null,
      sent_back_at=null,sent_back_by=null,sent_back_reason=null,submitted_at=now(),round=v_req.round+1
      where id=p_id;
    perform public._purchasing_write_context_demands(p_id,v_context);
    if v_forecast_sources is not null then
      select submission_key into strict v_forecast_key from public.forecast_purchase_requests where request_id=p_id;
      perform public._purchasing_write_forecast_request_mark(p_id,(v_forecast_sources->0->>'week')::date,v_forecast_key,public._purchasing_context_forecast_mark_lines(v_context,v_forecast_sources),true);
    end if;
    v_after:=public._purchasing_request_context_state(p_id);
    insert into public.purchase_request_events(request_id,round,kind,actor_id,reason,changes)
      values(p_id,v_req.round+1,'resubmitted',auth.uid(),btrim(p_lines->0->>'reason'),jsonb_build_object(
        'revision_key',v_revision_key,'previous_version',v_expected,'request_version',v_expected+1,'reason',btrim(p_lines->0->>'reason'),
        'before',v_before,'after',v_after,'after_context',v_context,
        'previous_approval',jsonb_build_object('approved_at',v_req.approved_at,'approved_by',v_req.approved_by,'approval_version',v_req.approval_version,'approval_scope',v_req.approval_scope)));
    insert into public.audit_log(role,actor_text,action,ref) values(v_role,(select name from public.app_users where id=auth.uid()),'Purchase sent again for approval',p_id::text);
    return jsonb_build_object('id',p_id,'req_no',v_req.req_no,'round',v_req.round+1,'request_version',v_expected+1,'approval_required',true);
  end if;
  if v_req.created_by is null or v_req.created_by <> auth.uid() then
    raise exception 'only the requester may send this request again'
      using errcode = '42501', detail = 'not_requester';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  if v_req.sent_back_at is null then
    raise exception 'request was not sent back'
      using errcode = '22023', detail = 'not_sent_back';
  end if;
  if p_required_by is null then
    raise exception 'a delivery date is required'
      using errcode = '22023', detail = 'delivery_date_required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a manual purchase needs at least one line'
      using errcode = '22023', detail = 'lines_required';
  end if;

  -- The purpose is the request's identity and stays; its facts are re-checked.
  perform public._purchasing_check_request_facts(
    v_req.purpose, p_destination_id, p_why,
    p_for_service_case_id, p_for_staff_user_id, p_for_subsidiary_name);

  perform 1 from purchase_demands where request_id = p_id for update;

  -- Header changes, recorded before they are written.
  if v_req.destination_id is distinct from p_destination_id then
    v_changes := v_changes || jsonb_build_object('field', 'destination_id',
      'from', v_req.destination_id, 'to', p_destination_id);
  end if;
  if v_req.required_by is distinct from p_required_by then
    v_changes := v_changes || jsonb_build_object('field', 'required_by',
      'from', v_req.required_by, 'to', p_required_by);
  end if;
  if coalesce(v_req.why, '') is distinct from coalesce(nullif(btrim(coalesce(p_why, '')), ''), '') then
    v_changes := v_changes || jsonb_build_object('field', 'why',
      'from', v_req.why, 'to', nullif(btrim(coalesce(p_why, '')), ''));
  end if;
  if coalesce(v_req.purchase_requirement, '') is distinct from coalesce(v_need, '') then
    v_changes := v_changes || jsonb_build_object('field', 'purchase_requirement',
      'from', v_req.purchase_requirement, 'to', v_need);
  end if;
  if v_req.for_service_case_id is distinct from p_for_service_case_id
     or v_req.for_staff_user_id is distinct from p_for_staff_user_id
     or coalesce(v_req.for_subsidiary_name, '') is distinct from
        coalesce(nullif(btrim(coalesce(p_for_subsidiary_name, '')), ''), '') then
    v_changes := v_changes || jsonb_build_object('field', 'for');
  end if;

  update purchase_requests
     set destination_id      = p_destination_id,
         required_by         = p_required_by,
         why                 = nullif(btrim(coalesce(p_why, '')), ''),
         for_service_case_id = p_for_service_case_id,
         for_staff_user_id   = p_for_staff_user_id,
         for_subsidiary_name = nullif(btrim(coalesce(p_for_subsidiary_name, '')), ''),
         purchase_requirement = v_need
   where id = p_id;

  -- Kept lines move with the header before any new line is written, so
  -- `purchasing_create_demand` sees one destination on the request.
  update purchase_demands
     set destination_id = p_destination_id,
         required_by    = p_required_by,
         approved_qty   = null
   where request_id = p_id and cancelled_at is null;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_line ->> 'qty')::int;
    v_remark := nullif(btrim(coalesce(v_line ->> 'remark', '')), '');
    -- 0591 · the configuration travels with the line on every round; an
    -- absent or empty object means "no configuration", never "keep the old".
    v_attrs := case when jsonb_typeof(v_line -> 'attrs') = 'object' and v_line -> 'attrs' <> '{}'::jsonb
                    then v_line -> 'attrs' end;
    if v_qty is null or v_qty < 1 then
      raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
    end if;

    v_old := null;
    if nullif(v_line ->> 'id', '') is not null then
      select * into v_old from purchase_demands
       where id = (v_line ->> 'id')::uuid and request_id = p_id and cancelled_at is null;
      if not found then
        raise exception 'line is not on this request'
          using errcode = '22023', detail = 'unknown_line';
      end if;
    end if;

    if v_old.id is not null and v_old.sku = v_line ->> 'sku' then
      v_keep := v_keep || v_old.id;
      if v_old.qty <> v_qty or coalesce(v_old.remark, '') <> coalesce(v_remark, '') then
        v_changes := v_changes || jsonb_build_object('field', 'line', 'sku', v_old.sku,
          'from', v_old.qty, 'to', v_qty);
        update purchase_demands set qty = v_qty, remark = v_remark where id = v_old.id;
      end if;
      if v_old.attrs is distinct from v_attrs then
        v_changes := v_changes || jsonb_build_object('field', 'line_configured', 'sku', v_old.sku,
          'from', v_old.attrs, 'to', v_attrs);
        update purchase_demands set attrs = v_attrs where id = v_old.id;
      end if;
    else
      v_id := (public.purchasing_create_demand(
        v_line ->> 'sku', v_qty, p_destination_id, p_required_by, v_remark,
        v_req.purpose, p_id) ->> 'id')::uuid;
      if v_attrs is not null then
        update purchase_demands set attrs = v_attrs where id = v_id;
      end if;
      v_keep := v_keep || v_id;
      v_changes := v_changes || jsonb_build_object('field', 'line_added',
        'sku', v_line ->> 'sku', 'to', v_qty);
    end if;
  end loop;

  -- Lines the requester removed: marked not going ahead, with the actor.
  for v_old in
    select * from purchase_demands
     where request_id = p_id and cancelled_at is null and not (id = any(v_keep))
  loop
    update purchase_demands
       set cancelled_at = now(), cancelled_by = auth.uid(),
           cancel_reason = 'Removed before sending again'
     where id = v_old.id;
    v_changes := v_changes || jsonb_build_object('field', 'line_removed',
      'sku', v_old.sku, 'from', v_old.qty);
  end loop;

  update purchase_requests
     set sent_back_at = null, sent_back_by = null, sent_back_reason = null,
         submitted_at = now(), round = v_req.round + 1
   where id = p_id;

  insert into purchase_request_events (request_id, round, kind, actor_id, changes)
  values (p_id, v_req.round + 1, 'resubmitted', auth.uid(), v_changes);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          'Purchase sent again for approval',
          p_id::text);

  return jsonb_build_object('id', p_id, 'round', v_req.round + 1, 'changes', v_changes);
end;
$function$;

-- Existing Stock writers, same signatures/permissions; legacy bodies retained.
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

-- Existing PO issue owners: new contexts cannot escape through a legacy door.
-- Private batch admission. All source and approval reads precede the first PO
-- write; only the canonical SECDEF batch caller can pass the resulting object
-- to the private common birth implementation (neither has an authenticated grant).
-- Compatibility only: current legacy facts locked for THIS transaction. This
-- is NOT an invented historical approval_scope/version or recipient decision.
create or replace function public._purchasing_context_legacy_issue_scope(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $legacy_issue_scope$
declare r public.purchase_requests%rowtype; facts jsonb;
begin
 select * into strict r from public.purchase_requests where id=p_id for update nowait;
 if r.request_version<>0 or r.request_context is not null or r.approved_at is null or r.refused_at is not null or r.withdrawn_at is not null or r.sent_back_at is not null then
  raise exception 'legacy request is not approved' using errcode='22023',detail='not_ready_to_order'; end if;
 perform 1 from public.purchase_demands where request_id=p_id order by id for update nowait;
 select coalesce(jsonb_agg(to_jsonb(d)-'issued_qty'-'remaining_qty'-'po_id'-'ordered_at' order by d.id),'[]') into facts
  from public.purchase_demands d where d.request_id=p_id and d.cancelled_at is null;
 return jsonb_build_object('legacy_transaction_facts',true,'request',to_jsonb(r),'demands',facts);
exception when lock_not_available then raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='request_source_busy';
end;
$legacy_issue_scope$;
revoke all on function public._purchasing_context_legacy_issue_scope(uuid) from public,anon,authenticated;

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
revoke all on function public._purchasing_context_issue_preflight(jsonb) from public,anon,authenticated;

-- Read-only recovery of the actual committed result after a lost response.
-- Same actor + stable key + EXACT original client scope; never another issuance.
create or replace function public.purchasing_request_issue_retry(p_key uuid,p_client_input jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $issue_retry$
declare saved jsonb; actor_role text:=public.app_role();
begin
 if actor_role is null or actor_role not in ('operation','principal') or auth.uid() is null then raise exception 'not permitted' using errcode='42501'; end if;
 select e.changes into saved from public.purchase_request_events e where e.kind='po_issued' and e.actor_id=auth.uid()
  and e.changes->>'record_type'='issue_batch' and e.changes->>'issue_key'=p_key::text order by e.occurred_at,e.id limit 1;
 if not found then return null; end if;
 if saved->'client_input' is distinct from p_client_input then raise exception 'issue retry key already names another scope' using errcode='22023',detail='issue_retry_key_reused'; end if;
 return jsonb_build_object('po_ids',saved->'po_ids');
end;
$issue_retry$;
revoke all on function public.purchasing_request_issue_retry(uuid,jsonb) from public,anon;
grant execute on function public.purchasing_request_issue_retry(uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.purchasing_issue_pos_batch(p_pos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count          int;
  v_idx            int := 0;
  v_po             jsonb;
  v_line           jsonb;
  v_po_id          text;
  v_po_ids         jsonb := '[]'::jsonb;
  v_so_refs        int[];
  v_eta             date;
  v_supplier_id     uuid;
  v_supplier_kind   supplier_kind;
  v_partner_id      uuid;
  v_destination_id  uuid;
  v_purpose         text;
  v_demand          purchase_demands%rowtype;
  v_demand_id       uuid;
  v_treatment       text;
  v_reason          text;
  v_cost            numeric(14,2);
  v_cost_source     text;
  v_catalog_supplier uuid;
  v_catalog_cost    numeric(14,2);
  v_err_state       text;
  v_err_msg         text;
  v_err_detail      text;
  v_approval        uuid;
  v_used_approvals  jsonb := '[]'::jsonb;
  v_price_not_recorded boolean;
  v_has_context boolean; v_admission jsonb; v_slice jsonb; v_key uuid; v_batch_hash text; v_retry jsonb; v_req_context jsonb;
begin
  if not public.is_operation() then
    raise exception 'forbidden: operation only' using errcode = '42501';
  end if;

  -- ⭐ 0379 · THE ACTOR GATE. This function previously trusted any Operations
  -- login, so a direct RPC call bypassed the duty check that lived in one API
  -- route — and Manual Purchase called it with no duty check at all. Now every
  -- caller meets the same authority.
  if not public.purchasing_actor_may_issue(auth.uid()) then
    raise exception 'only Current PO Duty or its authorised cover may issue purchase orders'
      using errcode = '42501', detail = 'not_po_duty';
  end if;

  if p_pos is null or jsonb_typeof(p_pos) <> 'array' then
    raise exception 'p_pos must be a JSON array'
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;
  v_count := jsonb_array_length(p_pos);
  if v_count < 1 or v_count > 20 then
    raise exception 'batch size must be between 1 and 20 (got %)', v_count
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;

  select exists(select 1 from jsonb_array_elements(p_pos) po cross join lateral jsonb_array_elements(po->'lines') ln where ln ? 'request_sources') into v_has_context;
  if v_has_context then
   v_key:=(p_pos#>>'{0,context_issue_key}')::uuid;
   if v_key is null or exists(select 1 from jsonb_array_elements(p_pos) po where (po->>'context_issue_key')::uuid is distinct from v_key) then
    raise exception 'one stable issue retry key required' using errcode='22023',detail='issue_retry_key_required'; end if;
   if exists(select 1 from jsonb_array_elements(p_pos) po where po->'context_client_input' is distinct from p_pos#>'{0,context_client_input}') then raise exception 'one exact client scope required' using errcode='22023',detail='issue_retry_key_reused'; end if;
   perform pg_advisory_xact_lock(hashtextextended('purchasing.context.issue:'||auth.uid()::text||':'||v_key::text,0));
   v_batch_hash:=md5(p_pos::text);
   select e.changes into v_retry from public.purchase_request_events e where e.kind='po_issued' and e.actor_id=auth.uid()
    and e.changes->>'record_type'='issue_batch' and e.changes->>'issue_key'=v_key::text order by e.occurred_at,e.id limit 1;
   if found then
    if v_retry->>'payload_hash' is distinct from v_batch_hash then raise exception 'issue retry key already names another scope' using errcode='22023',detail='issue_retry_key_reused'; end if;
    return jsonb_build_object('po_ids',v_retry->'po_ids');
   end if;
   v_admission:=public._purchasing_context_issue_preflight(p_pos);
  end if;

  if exists(select 1 from jsonb_array_elements(p_pos) po cross join lateral jsonb_array_elements(po->'lines') ln
    join public.purchase_demands d on d.id=nullif(ln->>'demand_id','')::uuid join public.purchase_requests r on r.id=d.request_id
    where r.request_version>0 or r.request_context is not null) then
    raise exception 'context issuance is not ready' using errcode='22023',detail='context_issue_not_ready';
  end if;

  perform pg_advisory_xact_lock(hashtext('purchasing_issue_pos_batch'));

  -- The owning Order cannot be withdrawn/amended between this read and issue.
  perform 1 from public.orders o where o.id in (
    select (src->>'order_id')::uuid from jsonb_array_elements(p_pos) po
    cross join lateral jsonb_array_elements(po->'lines') ln
    cross join lateral jsonb_array_elements(coalesce(ln->'sources','[]'::jsonb)) src
  ) order by o.id for update;
  -- Lock exact source lines in stable order. The complete batch is checked,
  -- so repeating one source across documents cannot evade its aggregate cap.
  perform 1 from public.order_lines l
   where l.id in (
     select nullif(src->>'order_line_id','')::uuid
       from jsonb_array_elements(p_pos) po
       cross join lateral jsonb_array_elements(po->'lines') ln
       cross join lateral jsonb_array_elements(coalesce(ln->'sources','[]'::jsonb)) src
   ) order by l.id for update;
  if exists (
    select 1
      from (
        select (src->>'order_line_id')::uuid as line_id,
               (src->>'order_id')::uuid as order_id,
               sum((src->>'qty')::int) as qty
          from jsonb_array_elements(p_pos) po
          cross join lateral jsonb_array_elements(po->'lines') ln
          cross join lateral jsonb_array_elements(coalesce(ln->'sources','[]'::jsonb)) src
         group by 1,2
      ) asked
      left join public.order_lines l on l.id=asked.line_id and l.order_id=asked.order_id
      left join public.orders o on o.id=l.order_id
     where l.id is null or o.status <> 'proceed_order'
        or asked.qty <= 0
        or asked.qty > public.so_line_remaining_requirement(l.id)
  ) then
    raise exception 'Source requirement changed; refresh before issuing'
      using errcode='P0001', detail='unknown_demand';
  end if;


  for v_po in select * from jsonb_array_elements(p_pos)
  loop
    v_supplier_id := nullif(v_po->>'supplier_id', '')::uuid;
    select kind into v_supplier_kind from suppliers where id = v_supplier_id;
    if v_supplier_kind is null then
      raise exception 'supplier not found'
        using errcode = 'P0001', detail = 'unresolved_supplier';
    end if;

    v_partner_id := nullif(v_po->>'procurement_partner_id', '')::uuid;
    if v_supplier_kind = 'factory_pickup' then
      if v_partner_id is null
         or not exists (select 1 from delivery_partners where id = v_partner_id) then
        raise exception 'valid procurement partner required for factory pickup'
          using errcode = 'P0001', detail = 'pickup_partner_required';
      end if;
    elsif v_partner_id is not null then
      raise exception 'procurement partner is not allowed for own logistics'
        using errcode = 'P0001', detail = 'pickup_partner_not_allowed';
    end if;

    v_destination_id := nullif(v_po->>'destination_id', '')::uuid;
    if v_destination_id is null or not exists (
      select 1 from purchasing_destinations
       where id = v_destination_id and active
    ) then
      raise exception 'active purchasing destination required'
        using errcode = 'P0001', detail = 'unknown_destination';
    end if;

    v_purpose := nullif(v_po->>'purpose', '');
    if v_purpose is not null and v_purpose not in
       ('customer_sales', 'general_purchase', 'ready_stock', 'display', 'office', 'warranty', 'spare_parts',
        'showroom_display', 'service_case', 'internal_staff_purchase',
        'subsidiary_purchase', 'other_purchase') then
      raise exception 'purpose % is not a purpose', v_purpose
        using errcode = 'P0001', detail = 'unknown_purpose';
    end if;

    if jsonb_typeof(v_po->'lines') <> 'array'
       or jsonb_array_length(v_po->'lines') = 0 then
      raise exception 'lines must be a non-empty array'
        using errcode = 'P0001', detail = 'lines_empty';
    end if;
    for v_line in select * from jsonb_array_elements(v_po->'lines')
    loop
      v_treatment := v_line->>'commercial_treatment';
      v_reason := nullif(btrim(coalesce(v_line->>'commercial_reason', '')), '');
      v_cost := (v_line->>'cost')::numeric(14,2);
      -- ⭐ 0573 · PRICE NOT RECORDED. No treatment, no cost and no cost source
      -- is an ABSENCE: the order may be placed, the line makes no commercial
      -- claim, and no approval is required or spent. A treatment without a
      -- cost, or a cost without a treatment, still refuses below by its own
      -- name — that is half a commercial fact, which is a mistake.
      v_price_not_recorded :=
        v_treatment is null
        and v_cost is null
        and v_line->>'cost_source' is null;
      if v_price_not_recorded then
        null;
      elsif v_treatment = 'normal' then
        if v_cost is null or v_cost <= 0 or v_reason is not null then
          raise exception 'known positive transaction cost required (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'cost_required';
        end if;
      elsif v_treatment = 'free_of_charge' then
        if v_cost is distinct from 0::numeric or v_reason is null
           or length(v_reason) > 500
           or v_line->>'cost_source' is distinct from 'hand_entered' then
          raise exception 'Free of Charge requires cost 0 and a reason (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'free_of_charge_reason_required';
        end if;
      else
        raise exception 'commercial treatment required (sku=%)', v_line->>'sku'
          using errcode = 'P0001', detail = 'commercial_treatment_required';
      end if;

      v_demand_id := nullif(v_line->>'demand_id', '')::uuid;
      if v_demand_id is not null then
        select * into v_demand from purchase_demands where id = v_demand_id;
        if not found then
          raise exception 'demand not found (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'unknown_demand';
        end if;
        if v_demand.sku is distinct from v_line->>'sku' then
          raise exception 'demand names a different sku (line=%, demand=%)',
              v_line->>'sku', v_demand.sku
            using errcode = 'P0001', detail = 'demand_sku_mismatch';
        end if;
      end if;
    end loop;

    if nullif(v_po->>'eta_date', '') is not null then
      v_eta := (v_po->>'eta_date')::date;
    else
      v_eta := null;
    end if;
    if v_po ? 'so_refs' and jsonb_typeof(v_po->'so_refs') = 'array' then
      select coalesce(array_agg(elem::int), array[]::int[])
        into v_so_refs
        from jsonb_array_elements_text(v_po->'so_refs') elem;
      if array_length(v_so_refs, 1) is null then v_so_refs := null; end if;
    else
      v_so_refs := null;
    end if;

    if v_purpose is null and v_so_refs is not null then
      v_purpose := 'customer_sales';
    end if;

    if v_so_refs is not null and exists (
      select 1
        from unnest(v_so_refs) ref(so)
        left join orders o on o.so = ref.so
       where o.id is null
          or o.delivery_date is null
          or coalesce(o.delivery_date_tbd, false)
    ) then
      raise exception 'Customer delivery date must be confirmed before Issue PO'
        using errcode = 'P0001', detail = 'blocked_delivery_date';
    end if;

    for v_line in select * from jsonb_array_elements(v_po->'lines')
    loop
      select supplier_id, cost
        into v_catalog_supplier, v_catalog_cost
        from product_skus
       where sku = v_line->>'sku';
      if not found or v_catalog_supplier is null
         or v_catalog_supplier is distinct from v_supplier_id then
        raise exception 'SKU supplier truth does not match Issue supplier (sku=%)', v_line->>'sku'
          using errcode = 'P0001', detail = 'unresolved_supplier';
      end if;

      v_cost_source := v_line->>'cost_source';
      -- ⭐ 0573 · THE SAME ABSENCE, JUDGED THE SAME WAY IN BOTH PASSES. A line
      -- whose price is not recorded names no cost source and makes no
      -- commercial claim, so the governed-source gate and the commercial gate
      -- have nothing to judge and do not run: no approval is required, and
      -- none is spent. The supplier-truth check ABOVE is deliberately not
      -- skipped — who Carres buys from is not a price question.
      v_price_not_recorded :=
        v_line->>'commercial_treatment' is null
        and v_line->>'cost' is null
        and v_cost_source is null;
      if not v_price_not_recorded then
        if v_cost_source not in ('catalog', 'hand_entered') then
          raise exception 'governed transaction cost source required (sku=%)', v_line->>'sku'
            using errcode = 'P0001', detail = 'cost_source_required';
        end if;

        -- ⭐ 0380 · THE COMMERCIAL GATE.
        --
        -- This replaces a check that compared the live catalog cost against a
        -- number the API had just read from the same column — it agreed with
        -- itself and could never fire. The line now declares the cost the
        -- OPERATOR REVIEWED, and anything that is not the approved catalog price
        -- needs somebody else's approval.
        v_approval := public.purchasing_check_line_commercials(
          v_line->>'sku',
          v_supplier_id,
          v_line->>'commercial_treatment',
          (v_line->>'cost')::numeric(14,2),
          v_cost_source,
          nullif(v_line->>'expected_catalog_cost', '')::numeric(14,2)
        );
        if v_approval is not null then
          v_used_approvals := v_used_approvals || to_jsonb(v_approval);
        end if;
      end if;
    end loop;

    begin
      -- ⭐ 0443 · ONE ATOMIC BIRTH. The helper draws the number, writes every
      -- line with its commercial facts, its Deliver To and its SNAPSHOTTED
      -- Catalog identity mode, and mints every exact-unit line's permanent
      -- line-bound Unit IDs — or raises, in which case this whole batch
      -- transaction (number, lines, demand movement, Units) rolls back.
      -- Nothing here is keyed by `(po_id, sku)` any more: two lines of one
      -- SKU are two lines.
      v_slice:=null;
      if v_has_context then
       select jsonb_build_object('requests',v_admission->'requests','sources',jsonb_agg(a order by (a->>'line_index')::integer,(a->>'source_index')::integer)) into v_slice
        from jsonb_array_elements(v_admission->'sources') a where (a->>'po_index')::integer=v_idx;
       if v_slice->'sources'='null'::jsonb then v_slice:=null; end if;
      end if;
      v_po_id := public._operation_create_po_inner_admitted(
        p_supplier_id := v_supplier_id,
        p_warehouse_id := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines := v_po->'lines',
        p_eta_date := v_eta,
        p_so_refs := v_so_refs,
        p_note := v_po->>'note',
        p_procurement_partner_id := v_partner_id,
        p_destination_id := v_destination_id,
        p_admission := v_slice
      );

      update purchase_orders
         set eta_date = v_eta,
             purpose = v_purpose
       where id = v_po_id;
      if not found then
        raise exception 'created purchase order not found'
          using errcode = 'P0001', detail = 'po_not_created';
      end if;

      -- The ledger must agree with the lines it was born with: every
      -- exact-unit line owns exactly `qty` incoming Units bound to it, every
      -- quantity line owns none. A mismatch is an integrity failure and
      -- rolls the issue back.
      if exists (
        select 1 from purchase_order_lines l
         where l.po_id = v_po_id
           and (select count(*) from ops_stock_items u
                 where u.po_line_id = l.id and u.status = 'incoming')
               <> case when l.identity_mode = 'exact_unit' then l.qty else 0 end
      ) then
        raise exception 'Unit ID ledger does not match the issued lines on %', v_po_id
          using errcode = 'P0001', detail = 'unit_ledger_mismatch';
      end if;

      for v_line in select * from jsonb_array_elements(v_po->'lines')
      loop
        v_demand_id := nullif(v_line->>'demand_id', '')::uuid;
        if v_line->>'commercial_treatment' = 'free_of_charge' then
          insert into po_history (po_id, text, by_role, by_user_id)
          values (
            v_po_id,
            format('Free of Charge · %s · %s', v_line->>'sku', v_line->>'commercial_reason'),
            public.app_role(),
            auth.uid()
          );
        elsif v_line->>'cost_source' = 'hand_entered' then
          insert into po_history (po_id, text, by_role, by_user_id)
          values (
            v_po_id,
            format('Transaction cost entered · %s · RM%s', v_line->>'sku', v_line->>'cost'),
            public.app_role(),
            auth.uid()
          );
        end if;

        if v_demand_id is not null then
          perform public.purchasing_demand_record_issue(
            v_demand_id, (v_line->>'qty')::int, v_po_id);
        end if;
      end loop;

      -- AN APPROVAL IS SPENT WHEN IT IS USED. Leaving it open would let one
      -- manager decision price every future order of that SKU.
      update po_cost_approvals
         set used_by_po = v_po_id
       where id in (
         select (elem #>> '{}')::uuid from jsonb_array_elements(v_used_approvals) elem
       )
         and used_by_po is null;
      v_used_approvals := '[]'::jsonb;

      perform public._v3_claim_threads_for_po(v_po_id);
    exception when others then
      get stacked diagnostics
        v_err_state = returned_sqlstate,
        v_err_msg = message_text,
        v_err_detail = pg_exception_detail;
      raise exception using
        errcode = v_err_state,
        message = v_err_msg,
        detail = coalesce(nullif(v_err_detail, ''), 'helper_failed'),
        hint = format('pos_index=%s', v_idx);
    end;

    v_po_ids := v_po_ids || to_jsonb(v_po_id);
    v_idx := v_idx + 1;
  end loop;
  if v_has_context then
   for v_req_context in select * from jsonb_array_elements(v_admission->'requests') loop
    if v_req_context->'legacy'='true'::jsonb then
     if public._purchasing_context_legacy_issue_scope((v_req_context->>'id')::uuid) is distinct from v_req_context->'scope' then raise exception 'legacy issue facts changed' using errcode='22023',detail='request_approval_changed'; end if;
     if exists(select 1 from jsonb_array_elements(v_admission->'sources') a join public.purchase_demands d on d.id=(a->>'demand_id')::uuid
       where a->>'request_id'=v_req_context->>'id' and d.issued_qty<>(a->>'prior_issued')::integer+(a->>'qty')::integer
       and not exists(select 1 from jsonb_array_elements(v_admission->'sources') later where later->>'demand_id'=a->>'demand_id' and (later->>'prior_issued')::integer>(a->>'prior_issued')::integer)) then
      raise exception 'legacy issued counter differs from actual sources' using errcode='22023',detail='request_po_coverage_changed'; end if;
    else
     perform public._purchasing_context_coverage_admitted((v_req_context->>'id')::uuid,true,v_req_context->'scope');
    end if;
    insert into public.purchase_request_events(request_id,round,kind,actor_id,changes)
     select id,round,'po_issued',auth.uid(),jsonb_build_object('record_type','issue_batch','issue_key',v_key,'payload_hash',v_batch_hash,'client_input',p_pos#>'{0,context_client_input}','po_ids',v_po_ids,
      'request_version',request_version,'approval_version',approval_version,'approval_token',md5(approval_scope::text)) from public.purchase_requests where id=(v_req_context->>'id')::uuid;
   end loop;
  end if;
  return jsonb_build_object('po_ids', v_po_ids);
end;
$function$;

-- Recorder verifies an actual canonical PO/source/event; it cannot manufacture
-- supply from a quantity or stale approval header. No second procurement ledger.
create or replace function public._purchasing_context_record_issued_source(p_id uuid,p_qty integer,p_po_id text)
returns jsonb language plpgsql set search_path=public,pg_temp as $record_source$
declare d public.purchase_demands%rowtype; r public.purchase_requests%rowtype; allocation jsonb; e public.purchase_request_events%rowtype; actual integer;
begin
 perform public._purchasing_context_writer_admission();
 if not public.purchasing_actor_may_issue(auth.uid()) then raise exception 'only Current PO Duty may issue' using errcode='42501',detail='not_po_duty'; end if;
 select request_id into strict d.request_id from public.purchase_demands where id=p_id;
 perform public._purchasing_context_request_source_locks(d.request_id);
 select * into strict r from public.purchase_requests where id=d.request_id for update nowait;
 select * into strict d from public.purchase_demands where id=p_id for update nowait;
 select ev.* into e from public.purchase_request_events ev where ev.request_id=r.id and ev.kind='po_issued' and ev.actor_id=auth.uid()
  and ev.changes->>'record_type'='po_issue' and ev.changes->>'po_id'=p_po_id
  and exists(select 1 from jsonb_array_elements(ev.changes->'allocations') a where a->>'demand_id'=p_id::text and (a->>'prior_issued')::integer=d.issued_qty and (a->>'qty')::integer=p_qty);
 if not found then raise exception 'actual issued source proof required' using errcode='22023',detail='request_issue_proof_required'; end if;
 if r.approved_at is null or r.withdrawn_at is not null or r.refused_at is not null or r.sent_back_at is not null
  or r.approval_version is distinct from r.request_version or r.approval_scope is null
  or (e.changes->>'approval_version')::integer is distinct from r.approval_version or e.changes->>'approval_token' is distinct from md5(r.approval_scope::text)
  or d.cancelled_at is not null or d.fulfilment_kind is distinct from 'purchase' or p_qty<1 or d.issued_qty+p_qty>d.approved_qty then
  raise exception 'approval or issued source changed' using errcode='22023',detail='request_approval_changed'; end if;
 select a into strict allocation from jsonb_array_elements(e.changes->'allocations') a where a->>'demand_id'=p_id::text;
 select coalesce(sum(src.qty),0) into actual from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id
  cross join lateral public._purchasing_po_request_sources(pl.id) src where src.demand_id=p_id and po.status<>'cancelled';
 if actual<>d.issued_qty+p_qty or not exists(select 1 from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id
  cross join lateral public._purchasing_po_request_sources(pl.id) src where src.demand_id=p_id and src.qty=p_qty and pl.id=(allocation->>'po_line_id')::uuid and po.id=p_po_id
   and pl.sku=d.sku and nullif(pl.attrs,'{}'::jsonb) is not distinct from nullif(d.attrs,'{}'::jsonb) and po.supplier_id=d.supplier_id and po.purpose=d.purpose
   and coalesce(pl.destination_id,po.destination_id)=d.destination_id) then
  raise exception 'actual PO source quantity differs' using errcode='22023',detail='request_po_coverage_changed'; end if;
 update public.purchase_demands set issued_qty=issued_qty+p_qty,po_id=coalesce(po_id,p_po_id),ordered_at=coalesce(ordered_at,now()) where id=p_id returning * into d;
 return jsonb_build_object('id',d.id,'issued',d.issued_qty,'remaining',d.remaining_qty);
exception when lock_not_available then raise exception 'This work changed. Refresh and try again.' using errcode='40001',detail='request_source_busy';
end;
$record_source$;
revoke all on function public._purchasing_context_record_issued_source(uuid,integer,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.purchasing_demand_record_issue(p_id uuid, p_qty integer, p_po_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role    app_role;
  v_d       purchase_demands;
  v_ceiling int;
  v_held    int;
  v_request uuid;
  v_req     purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  if exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id
    where d.id=p_id and (r.request_version>0 or r.request_context is not null)) then
    return public._purchasing_context_record_issued_source(p_id,p_qty,p_po_id);
  end if;

  -- 0522 · A MANUAL PURCHASE IS BOUGHT ONLY WHILE ITS APPROVAL STANDS.
  select request_id into v_request from purchase_demands where id = p_id;
  if v_request is not null then
    select * into v_req from purchase_requests where id = v_request for share;
    if v_req.approved_at is null
       or v_req.refused_at is not null
       or v_req.withdrawn_at is not null
       or v_req.sent_back_at is not null then
      raise exception 'manual purchase % is not approved', v_request
        using errcode = 'P0001', detail = 'not_ready_to_order';
    end if;
  end if;

  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'demand is cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;

  -- 0546 · what Ready Stock already answers for this exact line.
  select coalesce(sum(coalesce(i.qty, 1)), 0) into v_held
    from ops_stock_items i
   where i.reserved_purchase_demand_id = p_id
     and i.status in ('reserved', 'sold');

  v_ceiling := coalesce(v_d.approved_qty, v_d.qty) - v_held;

  if v_d.issued_qty + p_qty > v_ceiling then
    raise exception 'demand % has only % left, cannot take %',
      p_id, greatest(0, v_ceiling - v_d.issued_qty), p_qty
      using errcode = 'P0001', detail = 'over_issue';
  end if;

  update purchase_demands
     set issued_qty = issued_qty + p_qty,
         po_id      = coalesce(po_id, p_po_id),
         ordered_at = case
                        when po_id is null and p_po_id is not null then now()
                        else ordered_at
                      end
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'issued',    v_d.issued_qty,
    'remaining', v_d.remaining_qty
  );
end;
$function$;

-- Existing 0695 wrapper, same request owner/behavior, one shared mark writer.
CREATE OR REPLACE FUNCTION public.purchasing_submit_forecast_requests(p_submission_key uuid, p_forecast_week date, p_destination_id uuid, p_groups jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role   app_role := public.app_role();
  v_group  jsonb;
  v_line   jsonb;
  v_sku    text;
  v_qty    integer;
  v_seen   integer;
  v_now    integer;
  v_made   jsonb;
  v_id     uuid;
  v_out    jsonb := '[]'::jsonb;
  v_owner  uuid;
begin
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_submission_key is null or p_forecast_week is null or p_destination_id is null
     or p_groups is null or jsonb_typeof(p_groups) <> 'array' or jsonb_array_length(p_groups) = 0 then
    raise exception 'a forecast submission needs its key, week, destination and lines'
      using errcode = '22023', detail = 'invalid_forecast_submission';
  end if;

  -- ONE SUBMISSION AT A TIME. Two people pressing in the same moment run one
  -- after the other, so the second reads what the first has just asked for.
  perform pg_advisory_xact_lock(hashtextextended('purchasing.forecast_purchase.submit', 0));

  -- A RETRY ANSWERS WITH WHAT WAS MADE. The first press went through and its
  -- answer was lost on the way back: the same key returns the same requests
  -- and nothing is written. A key somebody else used is refused.
  select f.created_by into v_owner
    from forecast_purchase_requests f
   where f.submission_key = p_submission_key
   limit 1;
  if found then
    if v_owner is distinct from auth.uid() then
      raise exception 'this submission key belongs to another person'
        using errcode = '22023', detail = 'invalid_forecast_submission';
    end if;
    return jsonb_build_object(
      'replayed', true,
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object('id', f.request_id, 'req_no', r.req_no) order by r.created_at, r.req_no)
          from forecast_purchase_requests f
          join purchase_requests r on r.id = f.request_id
         where f.submission_key = p_submission_key), '[]'::jsonb));
  end if;

  -- NOTHING MOVED UNDER THE CALLER. The caller worked out each quantity from
  -- what it read as in progress. If that is no longer true for any SKU, the
  -- whole submission is refused and nothing is written.
  for v_group in select * from jsonb_array_elements(p_groups)
  loop
    if jsonb_typeof(v_group -> 'lines') is distinct from 'array' or jsonb_array_length(v_group -> 'lines') = 0
       or nullif(v_group ->> 'required_by', '') is null then
      raise exception 'a forecast request needs its delivery date and lines'
        using errcode = '22023', detail = 'invalid_forecast_submission';
    end if;
    for v_line in select * from jsonb_array_elements(v_group -> 'lines')
    loop
      v_sku  := nullif(btrim(coalesce(v_line ->> 'sku', '')), '');
      v_qty  := (v_line ->> 'qty')::integer;
      v_seen := coalesce((v_line ->> 'in_progress')::integer, 0);
      if v_sku is null or v_qty is null or v_qty < 1 or v_seen < 0 then
        raise exception 'a forecast line needs its SKU and a quantity of at least 1'
          using errcode = '22023', detail = 'invalid_forecast_submission';
      end if;
      select coalesce(sum(p.qty), 0)::integer into v_now
        from public._purchasing_forecast_in_progress_rows() p
       where p.sku = v_sku;
      if v_now <> v_seen then
        raise exception 'what is in progress for % changed: read %, now %', v_sku, v_seen, v_now
          using errcode = 'P0001', detail = 'forecast_in_progress_changed', hint = v_sku;
      end if;
    end loop;
  end loop;

  -- EACH REQUEST, THROUGH THE EXISTING DOOR. Every purpose rule, the supplier
  -- rule of every line and the approval rule run inside it; a refusal there
  -- takes the whole submission with it.
  for v_group in select * from jsonb_array_elements(p_groups)
  loop
    v_made := public.purchasing_create_request_with_lines(
      p_purpose              => 'ready_stock',
      p_destination_id       => p_destination_id,
      p_required_by          => (v_group ->> 'required_by')::date,
      p_lines                => (
        select jsonb_agg(jsonb_build_object(
                 'sku', l ->> 'sku',
                 'qty', (l ->> 'qty')::integer,
                 'required_by', v_group ->> 'required_by'))
          from jsonb_array_elements(v_group -> 'lines') l),
      p_fulfilment_intent    => 'additional_stock',
      p_purchase_requirement => nullif(btrim(coalesce(v_group ->> 'requirement', '')), '')
    );
    v_id := (v_made ->> 'id')::uuid;
    perform public._purchasing_write_forecast_request_mark(v_id,p_forecast_week,p_submission_key,v_group->'lines');
    v_out := v_out || jsonb_build_object('id', v_id, 'req_no', v_made ->> 'req_no');
  end loop;

  return jsonb_build_object('replayed', false, 'requests', v_out);
end;
$function$;

-- Legacy per-line/header edits cannot silently mutate a contextual whole scope.

CREATE OR REPLACE FUNCTION public.purchasing_create_demand(p_sku text, p_qty integer, p_destination_id uuid, p_required_by date DEFAULT NULL::date, p_remark text DEFAULT NULL::text, p_purpose text DEFAULT 'ready_stock'::text, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     app_role;
  v_supplier uuid;
  v_id       uuid;
  v_req      purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if exists(select 1 from public.purchase_requests r where r.id=p_request_id and (r.request_version>0 or r.request_context is not null)) then
    raise exception 'context request changes use the whole request revision' using errcode='22023',detail='context_whole_scope_required';
  end if;

  if p_purpose is null or p_purpose not in
     ('ready_stock', 'showroom_display', 'service_case',
      'internal_staff_purchase', 'subsidiary_purchase', 'other_purchase') then
    raise exception 'purpose % is not a purpose', p_purpose
      using errcode = '22023', detail = 'unknown_purpose';
  end if;
  if p_qty is null or p_qty < 1 then
    raise exception 'qty must be at least 1' using errcode = '22023', detail = 'invalid_qty';
  end if;

  if p_request_id is not null then
    select * into v_req from purchase_requests where id = p_request_id;
    if not found then
      raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
    end if;
    -- A line inherits its header's meaning; a line that contradicts it is a
    -- second truth (Law D).
    if v_req.purpose <> p_purpose then
      raise exception 'line purpose % does not match request %', p_purpose, v_req.purpose
        using errcode = '22023', detail = 'purpose_mismatch';
    end if;
    if v_req.destination_id <> p_destination_id then
      raise exception 'line destination does not match request'
        using errcode = '22023', detail = 'destination_mismatch';
    end if;
    if v_req.refused_at is not null then
      raise exception 'request is refused' using errcode = '22023', detail = 'request_refused';
    end if;
  end if;

  -- THE SUPPLIER IS DERIVED, NEVER CHOSEN (Jess, 2026-08-03; kept verbatim
  -- from 0323). A product has exactly one factory; asking a human to pick one
  -- is asking them to get it wrong.
  select supplier_id into v_supplier from product_skus where sku = p_sku;
  if not found then
    raise exception 'unknown sku %', p_sku using errcode = '22023', detail = 'unknown_sku';
  end if;
  if v_supplier is null then
    raise exception 'sku % has no supplier', p_sku
      using errcode = '22023', detail = 'sku_has_no_supplier';
  end if;

  if not exists (
    select 1 from purchasing_destinations where id = p_destination_id and active
  ) then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  insert into purchase_demands
    (purpose, sku, supplier_id, destination_id, qty, required_by, remark,
     request_id, created_by)
  values
    (p_purpose, p_sku, v_supplier, p_destination_id, p_qty, p_required_by,
     nullif(btrim(coalesce(p_remark, '')), ''), p_request_id, auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'supplier_id', v_supplier);
end;
$function$;

CREATE OR REPLACE FUNCTION public.purchasing_cancel_demand(p_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_d    purchase_demands;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(p_reason,'') !~ '[^[:space:]]' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'reason_required';
  end if;

  if exists(select 1 from public.purchase_requests r where r.id=(select request_id from public.purchase_demands where id=p_id) and (r.request_version>0 or r.request_context is not null)) then
    raise exception 'context request changes use the whole request revision' using errcode='22023',detail='context_whole_scope_required';
  end if;

  select * into v_d from purchase_demands where id = p_id for update;
  if not found then
    raise exception 'demand not found' using errcode = '42P01', detail = 'not_found';
  end if;
  if v_d.cancelled_at is not null then
    raise exception 'already cancelled' using errcode = 'P0001', detail = 'already_cancelled';
  end if;
  if v_d.remaining_qty <= 0 then
    raise exception 'demand % has nothing left to cancel', p_id
      using errcode = 'P0001', detail = 'nothing_to_cancel';
  end if;

  update purchase_demands
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_id;

  select * into v_d from purchase_demands where id = p_id;
  return jsonb_build_object(
    'id',        p_id,
    'cancelled', v_d.remaining_qty,
    'issued',    v_d.issued_qty
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.purchasing_move_request_destination(p_id uuid, p_destination_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     app_role;
  v_req      purchase_requests%rowtype;
  v_old_name text;
  v_new_name text;
  v_live     int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  if p_destination_id is null then
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  if exists(select 1 from public.purchase_requests r where r.id=p_id and (r.request_version>0 or r.request_context is not null)) then
    raise exception 'context request changes use the whole request revision' using errcode='22023',detail='context_whole_scope_required';
  end if;

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.refused_at is not null then
    raise exception 'request is refused' using errcode = '22023', detail = 'request_refused';
  end if;

  -- Lock the lines too: an issue running at the same moment must see either
  -- the old destination on every row or the new one on every row.
  perform 1 from purchase_demands where request_id = p_id for update;

  if exists (
    select 1 from purchase_demands where request_id = p_id and po_id is not null
  ) then
    raise exception 'request is already ordered' using errcode = '22023', detail = 'request_ordered';
  end if;

  select count(*) into v_live
    from purchase_demands where request_id = p_id and cancelled_at is null;
  if v_live = 0 and exists (select 1 from purchase_demands where request_id = p_id) then
    raise exception 'request is not going ahead' using errcode = '22023', detail = 'request_closed';
  end if;

  select name into v_new_name
    from purchasing_destinations where id = p_destination_id and active;
  if not found then
    if exists (select 1 from purchasing_destinations where id = p_destination_id) then
      raise exception 'destination is closed' using errcode = '22023', detail = 'inactive_destination';
    end if;
    raise exception 'unknown destination' using errcode = '22023', detail = 'unknown_destination';
  end if;

  if v_req.destination_id = p_destination_id then
    -- Nothing moves; nothing is written. Not a refusal.
    return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                              'destination_id', p_destination_id, 'moved', false);
  end if;

  select name into v_old_name from purchasing_destinations where id = v_req.destination_id;

  update purchase_requests set destination_id = p_destination_id where id = p_id;
  update purchase_demands
     set destination_id = p_destination_id
   where request_id = p_id and cancelled_at is null;

  -- Card 08 §3.7 — the act in plain words, the UUID as the internal ref.
  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          format('Deliver To changed from %s to %s',
                 coalesce(v_old_name, v_req.destination_id::text), v_new_name),
          p_id::text);

  return jsonb_build_object('id', p_id, 'req_no', v_req.req_no,
                            'destination_id', p_destination_id, 'moved', true,
                            'previous_destination_id', v_req.destination_id);
end;
$function$;

-- Same existing withdrawal permission/state rule; source keys precede root.
CREATE OR REPLACE FUNCTION public.purchasing_withdraw_request(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_req  purchase_requests%rowtype;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  perform public._purchasing_context_request_source_locks(p_id);
  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.created_by is null or v_req.created_by <> auth.uid() then
    raise exception 'only the requester may withdraw this request'
      using errcode = '42501', detail = 'not_requester';
  end if;
  if v_req.withdrawn_at is not null then
    raise exception 'request was withdrawn'
      using errcode = '22023', detail = 'request_withdrawn';
  end if;
  if v_req.approved_at is not null or v_req.refused_at is not null then
    raise exception 'request is already decided'
      using errcode = '22023', detail = 'already_decided';
  end if;
  -- Lines in the same lock order the issue door uses (request → demand).
  perform 1 from purchase_demands where request_id = p_id for update;
  if exists (
    select 1 from purchase_demands
     where request_id = p_id and (po_id is not null or issued_qty > 0)
  ) then
    raise exception 'request is already ordered'
      using errcode = '22023', detail = 'request_ordered';
  end if;

  update purchase_requests
     set withdrawn_at = now(), withdrawn_by = auth.uid()
   where id = p_id;

  insert into purchase_request_events (request_id, round, kind, actor_id)
  values (p_id, v_req.round, 'withdrawn', auth.uid());

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = auth.uid()),
          'Purchase request withdrawn',
          p_id::text);

  return jsonb_build_object('id', p_id, 'withdrawn', true);
end;
$function$;

-- SAME owning free-supply arithmetic; request intent and quantity goods remain distinct.
CREATE OR REPLACE FUNCTION public.purchasing_po_line_free_units(p_po_line_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when pl.id is null or po.status is distinct from 'open' then 0
    -- A Manual Purchase line buys for that request; only a recorded
    -- `additional_stock` request leaves its goods for anyone.
    when pl.purchase_request_id is not null
         and (select r.fulfilment_intent from purchase_requests r
               where r.id = pl.purchase_request_id) is distinct from 'additional_stock'
      then 0
    when exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id
      where d.id=pl.demand_id and r.fulfilment_intent is distinct from 'additional_stock')
      or exists(select 1 from public.po_line_sources s join public.purchase_demands d on d.id=s.purchase_demand_id join public.purchase_requests r on r.id=d.request_id
        where s.po_line_id=pl.id and r.fulfilment_intent is distinct from 'additional_stock') then 0
    when pl.identity_mode='quantity' then greatest(0,pl.qty-coalesce(pl.received_qty,0)-greatest(0,
      coalesce((select sum(s.qty)::integer from public.po_line_sources s where s.po_line_id=pl.id and s.order_id is not null),0)-coalesce(pl.received_qty,0)))
    else greatest(0,
      (select count(*)::int
         from ops_stock_items i
        where i.po_line_id = pl.id
          and i.status = 'incoming'
          and coalesce(i.identity_scope, 'unit') = 'unit'
          and i.reserved_order_line_id is null
          and i.reserved_purchase_demand_id is null)
      -- Customer lineage still waiting: what the line was raised for, less
      -- what has already arrived (a receipt answers its customers first).
      - greatest(0,
          coalesce((select sum(greatest(0, s.qty))::int
                      from po_line_sources s
                     where s.po_line_id = pl.id and s.order_id is not null), 0)
          - coalesce(pl.received_qty, 0)))
  end
  from (select p_po_line_id as id) k
  left join purchase_order_lines pl on pl.id = k.id
  left join purchase_orders po on po.id = pl.po_id;
$function$;

CREATE OR REPLACE FUNCTION public.purchasing_po_free_units()
 RETURNS TABLE(po_id text, po_line_id uuid, sku text, free_units integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select pl.po_id, pl.id, pl.sku, public.purchasing_po_line_free_units(pl.id)
    from purchase_order_lines pl
    join purchase_orders po on po.id = pl.po_id
   where po.status = 'open'
     and (pl.identity_mode='quantity' or exists (select 1 from ops_stock_items i
                  where i.po_line_id = pl.id and i.status = 'incoming'
                    and i.reserved_order_line_id is null
                    and i.reserved_purchase_demand_id is null))
     and public.purchasing_po_line_free_units(pl.id) > 0
   order by pl.po_id, pl.id;
$function$;

-- One shared PO birth implementation. Contexts enter the canonical admitted batch;
-- the original private signature remains the unchanged legacy-facing wrapper.
CREATE OR REPLACE FUNCTION public._operation_create_po_inner_admitted(p_supplier_id uuid, p_warehouse_id uuid, p_lines jsonb, p_eta_date date, p_so_refs integer[], p_note text, p_procurement_partner_id uuid, p_destination_id uuid, p_admission jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_actor        text;
  v_po_id        text;
  v_line_count   int;
  v_line         jsonb;
  v_sku          text;
  v_qty          int;
  v_cost         numeric(14,2);
  v_cost_source  cost_source_enum;
  v_attrs        jsonb;
  v_supplier_name text;
  v_line_id      uuid;
  v_src          jsonb;
  v_src_total    int;
  v_mode         text;
  v_line_dest    uuid;
  v_minted       int;
  v_context_purpose text; v_allocation jsonb; v_context_sources jsonb:='[]'; v_saved_sources jsonb:='[]';
  v_request public.purchase_requests%rowtype; v_scope jsonb; v_ids uuid[]; v_taken uuid[]:='{}'; v_line_index integer:=0; v_req_id uuid;
begin
  if p_admission is not null then
   if not public.purchasing_actor_may_issue(auth.uid()) then raise exception 'only Current PO Duty may issue' using errcode='42501',detail='not_po_duty'; end if;
   v_context_sources:=p_admission->'sources';
   for v_allocation in select * from jsonb_array_elements(p_admission->'requests') loop
    select * into strict v_request from public.purchase_requests where id=(v_allocation->>'id')::uuid;
    if v_allocation->'legacy'='true'::jsonb then
     if public._purchasing_context_legacy_issue_scope(v_request.id) is distinct from v_allocation->'scope' then raise exception 'legacy issue facts changed' using errcode='22023',detail='request_approval_changed'; end if;
    elsif v_request.approval_scope is distinct from v_allocation->'scope' or v_request.approval_version is distinct from v_request.request_version
     or v_request.approved_at is null or v_request.withdrawn_at is not null or v_request.refused_at is not null or v_request.sent_back_at is not null then
     raise exception 'admitted approval changed' using errcode='22023',detail='request_approval_changed'; end if;
   end loop;
   select d.purpose into strict v_context_purpose from public.purchase_demands d where d.id=(v_context_sources#>>'{0,demand_id}')::uuid;
  elsif exists(select 1 from jsonb_array_elements(p_lines) ln where ln ? 'request_sources') then
   raise exception 'context requests use the canonical issue door' using errcode='22023',detail='context_issue_not_ready';
  end if;
  if p_warehouse_id is null then
    raise exception 'warehouse is required'
      using errcode = '22023', detail = 'warehouse_required';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'supplier not found'
      using errcode = 'P0001', detail = 'supplier_not_found';
  end if;
  if not exists (select 1 from warehouses where id = p_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = 'P0001', detail = 'warehouse_not_found';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = 'P0001', detail = 'lines_empty';
  end if;
  if p_procurement_partner_id is not null
     and not exists (select 1 from delivery_partners where id = p_procurement_partner_id) then
    raise exception 'procurement partner not found'
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;
  -- The PO writes its Deliver To in the SAME insert as its number now (0443),
  -- so a missing destination is refused by name here instead of surfacing as a
  -- raw NOT NULL violation from `purchase_orders.destination_id`.
  if p_destination_id is null or not exists (
    select 1 from purchasing_destinations d where d.id = p_destination_id and d.active
  ) then
    raise exception 'active purchasing destination required'
      using errcode = 'P0001', detail = 'unknown_destination';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');
  select name into v_supplier_name from suppliers where id = p_supplier_id;

  -- ⭐ 0443 · CLASSIFY BEFORE ANY WRITE. A SKU Catalog has not answered for
  -- refuses the WHOLE issue here — no PO number is drawn, no line, no demand
  -- movement, no Unit. The error names the SKU and the concrete Catalog act.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    select s.stock_identity_mode into v_mode
      from product_skus s where s.sku = v_sku;
    if not found then
      raise exception 'SKU % is not in the Catalog', v_sku
        using errcode = 'P0001', detail = 'sku_not_in_catalog';
    end if;
    if v_mode is null then
      raise exception 'Set the stock identity (Unit ID or Quantity) for % in Catalog before issuing a PO', v_sku
        using errcode = 'P0001', detail = 'catalog_identity_mode_missing';
    end if;
  end loop;

  -- ⭐ 0381/0382 · THE LOCKED DOCUMENT NUMBER (MASTER §6.1). This replaced
  -- `max(seq) + 1`, which leaked how much Carres buys to anyone holding two of
  -- our purchase orders.
  v_po_id := public.allocate_formal_document_code('PO');

  insert into purchase_orders
    (id, so_refs, supplier_id, warehouse_id, eta_date, status, sup_status, placed_at,
     procurement_partner_id, destination_id, purpose)
  values
    (v_po_id, p_so_refs, p_supplier_id, p_warehouse_id, p_eta_date,
     'open', 'pending', now(),
     p_procurement_partner_id, p_destination_id, v_context_purpose);

  -- ⭐ 0574 · THE CLAIM IS READ FROM THE NUMBER'S TAIL, NOT ITS THIRD PIECE.
  -- `split_part(id, '-', 3)` was the code while every number wore
  -- `PO-YYYYMMDD-RRRR`; on the new `PO260924-4827` there IS no third piece, so
  -- it returned '' and this row silently kept no document_id. The last four
  -- characters are the code in BOTH shapes. `prefix` now belongs in the key
  -- too: each prefix draws from its own daily pool, so (date, code) alone can
  -- name a GRN's row as easily as this PO's.
  update public.formal_document_codes
     set document_id = v_po_id
   where code_date = (timezone('Asia/Kuala_Lumpur', now()))::date
     and prefix = 'PO'
     and code = right(v_po_id, 4);

  v_line_count := 0;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'qty')::int;
    if v_sku is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid line: sku=%, qty=%', v_sku, v_qty
        using errcode = 'P0001', detail = 'invalid_qty';
    end if;
    v_cost        := (v_line->>'cost')::numeric(14,2);
    v_cost_source := (v_line->>'cost_source')::cost_source_enum;
    -- ⭐ 0573 · A PRICE THAT IS NOT RECORDED DOES NOT STOP THE ORDER (owner
    -- instruction, Jess 2026-09-23). BOTH null is an ABSENCE and is legal —
    -- Catalog simply has no price for this line yet. EXACTLY ONE null is
    -- still refused under the same name: half a commercial fact is a
    -- mistake, not an absence.
    if (v_cost is null) <> (v_cost_source is null) then
      raise exception 'cost and cost_source are recorded together or not at all (sku=%)', v_sku
        using errcode = '22023', detail = 'cost_required';
    end if;
    v_attrs := case when v_line ? 'request_sources' then nullif(nullif(v_line->'attrs','null'::jsonb),'{}'::jsonb) else v_line->'attrs' end;
    select s.stock_identity_mode into v_mode from product_skus s where s.sku = v_sku;
    v_line_dest := nullif(v_line->>'destination_id', '')::uuid;
    if v_line_dest is not null and not exists (
      select 1 from purchasing_destinations d where d.id = v_line_dest and d.active
    ) then
      raise exception 'line destination is not an active purchasing destination (sku=%)', v_sku
        using errcode = 'P0001', detail = 'unknown_destination';
    end if;

    -- ⭐ 0443 · EVERY LINE FACT IS WRITTEN ON THE LINE ROW IT BELONGS TO — by
    -- the line's own id, never by `(po_id, sku)`. Two lines of one SKU are
    -- two lines.
    insert into purchase_order_lines
      (po_id, sku, qty, received_qty, cost, cost_source, attrs,
       identity_mode, destination_id,
       commercial_treatment, commercial_reason, demand_id)
    values
      (v_po_id, v_sku, v_qty, 0, v_cost, v_cost_source, v_attrs,
       v_mode, v_line_dest,
       nullif(v_line->>'commercial_treatment', ''),
       nullif(btrim(coalesce(v_line->>'commercial_reason', '')), ''),
       nullif(v_line->>'demand_id', '')::uuid)
    returning id into v_line_id;

    -- Actual request source rows share the existing PO source owner.
    if v_line ? 'request_sources' then
     if p_admission is null or (select coalesce(sum((a->>'qty')::integer),0) from jsonb_array_elements(v_context_sources) a where (a->>'line_index')::integer=v_line_index)<>v_qty then
      raise exception 'admitted source line differs' using errcode='22023',detail='invalid_request_sources'; end if;
     for v_allocation in select * from jsonb_array_elements(v_context_sources) a where (a->>'line_index')::integer=v_line_index order by (a->>'source_index')::integer loop
      insert into public.po_line_sources(po_id,po_line_id,sku,purchase_demand_id,qty)
       values(v_po_id,v_line_id,v_sku,(v_allocation->>'demand_id')::uuid,(v_allocation->>'qty')::integer);
      v_saved_sources:=v_saved_sources||jsonb_build_array(v_allocation||jsonb_build_object('po_line_id',v_line_id,'unit_ids','[]'::jsonb));
     end loop;
    end if;

    -- ⭐ 0382 · THE LINEAGE. The caller passes the SERVER's own recomputed
    -- allocation; it is validated here rather than trusted, because a browser
    -- that could name a source could put one customer's goods on another
    -- customer's order.
    if jsonb_typeof(v_line->'sources') = 'array' then
      v_src_total := 0;
      for v_src in select * from jsonb_array_elements(v_line->'sources')
      loop
        if not exists (select 1 from orders where id = (v_src->>'order_id')::uuid) then
          raise exception 'source order not found (sku=%)', v_sku
            using errcode = 'P0001', detail = 'unknown_source_order';
        end if;
        if nullif(v_src->>'order_line_id', '') is not null
           and not exists (
             select 1 from order_lines
              where id = (v_src->>'order_line_id')::uuid
                and order_id = (v_src->>'order_id')::uuid
           ) then
          raise exception 'source line does not belong to its order (sku=%)', v_sku
            using errcode = 'P0001', detail = 'source_line_mismatch';
        end if;
        insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty)
        values (
          v_po_id, v_line_id, v_sku,
          (v_src->>'order_id')::uuid,
          nullif(v_src->>'so', '')::int,
          nullif(v_src->>'order_line_id', '')::uuid,
          (v_src->>'qty')::int
        );
        v_src_total := v_src_total + (v_src->>'qty')::int;
      end loop;
      -- The parts must add up to the line. A lineage that does not is worse
      -- than none: it would look authoritative while hiding units.
      if v_src_total <> v_qty then
        raise exception 'source allocation does not add up (sku=%, sources=%, line=%)',
            v_sku, v_src_total, v_qty
          using errcode = 'P0001', detail = 'source_allocation_mismatch';
      end if;
    end if;

    -- ⭐ 0443 · THE BIRTH. An exact-unit line is born with exactly one
    -- permanent Carres Unit ID per ordered piece, bound to THIS line, for
    -- EVERY governed destination (§6.2: the supplier writes it on the package
    -- wherever the goods go). A quantity line is born with none — it is
    -- reconciled by count, and a fake Unit ID would be a lie on the paper.
    if v_mode = 'exact_unit' then
      insert into ops_stock_items
        (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
         identity_scope, source_ref, date_in)
      select public.allocate_unit_id(), v_sku, p_warehouse_id, 'incoming',
             v_supplier_name, v_po_id, v_line_id, 'unit', 'po_mint', current_date
        from generate_series(1, v_qty);
      get diagnostics v_minted = row_count;
      if v_minted <> v_qty then
        raise exception 'Unit ID allocation failed for % (wanted %, got %)', v_sku, v_qty, v_minted
          using errcode = 'P0001', detail = 'unit_allocation_failed';
      end if;
    elsif v_mode <> 'quantity' then
      raise exception 'unknown stock identity mode % on %', v_mode, v_sku
        using errcode = 'P0001', detail = 'catalog_identity_mode_missing';
    end if;

    if v_line ? 'request_sources' then
     for v_allocation in select * from jsonb_array_elements(v_saved_sources) a where a->>'po_line_id'=v_line_id::text order by (a->>'source_index')::integer loop
      v_ids:='{}';
      if v_mode='exact_unit' then
       select array_agg(id order by id) into v_ids from (select id from public.ops_stock_items where po_line_id=v_line_id and not(id=any(v_taken)) order by id limit (v_allocation->>'qty')::integer) chosen;
       if coalesce(cardinality(v_ids),0)<>(v_allocation->>'qty')::integer then raise exception 'source Unit attribution mismatch' using errcode='22023',detail='unit_ledger_mismatch'; end if;
       v_taken:=v_taken||v_ids;
       select * into strict v_request from public.purchase_requests where id=(v_allocation->>'request_id')::uuid;
       if v_request.request_version>0 and v_request.fulfilment_intent='concrete_need' then
        update public.ops_stock_items set reserved_purchase_demand_id=(v_allocation->>'demand_id')::uuid,reserved_ref=v_request.req_no where id=any(v_ids);
       end if;
      end if;
      select jsonb_agg(case when a=v_allocation then a||jsonb_build_object('unit_ids',to_jsonb(v_ids)) else a end order by (a->>'line_index')::integer,(a->>'source_index')::integer) into v_saved_sources from jsonb_array_elements(v_saved_sources) a;
     end loop;
    end if;
    v_line_index:=v_line_index+1;
    v_line_count := v_line_count + 1;
  end loop;

  insert into audit_log (role, actor_text, action, ref)
  values ('operation', v_actor,
          format('Created PO %s · %s lines%s',
                 v_po_id, v_line_count,
                 case when p_note is not null and btrim(p_note) <> ''
                      then ' · ' || btrim(p_note)
                      else '' end),
          v_po_id);

  for v_req_id in select distinct (a->>'request_id')::uuid from jsonb_array_elements(v_saved_sources) a order by 1 loop
   select * into strict v_request from public.purchase_requests where id=v_req_id;
   insert into public.purchase_request_events(request_id,round,kind,actor_id,changes)
    select v_req_id,v_request.round,'po_issued',auth.uid(),jsonb_build_object('record_type','po_issue','po_id',v_po_id,
      'po_version',(select version from public.purchase_orders where id=v_po_id),'request_version',v_request.request_version,
      'approval_version',v_request.approval_version,'approval_token',md5(v_request.approval_scope::text),'approval_scope_known',v_request.request_version>0,'allocations',jsonb_agg(a order by (a->>'line_index')::integer,(a->>'source_index')::integer))
     from jsonb_array_elements(v_saved_sources) a where a->>'request_id'=v_req_id::text;
  end loop;
  for v_allocation in select * from jsonb_array_elements(v_saved_sources) order by (value->>'line_index')::integer,(value->>'source_index')::integer loop
   perform public.purchasing_demand_record_issue((v_allocation->>'demand_id')::uuid,(v_allocation->>'qty')::integer,v_po_id);
  end loop;
  return v_po_id;
end;
$function$;
revoke all on function public._operation_create_po_inner_admitted(uuid,uuid,jsonb,date,integer[],text,uuid,uuid,jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public._operation_create_po_inner(p_supplier_id uuid,p_warehouse_id uuid,p_lines jsonb,p_eta_date date,p_so_refs integer[],p_note text,p_procurement_partner_id uuid DEFAULT NULL,p_destination_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $legacy_inner$
begin
 if exists(select 1 from jsonb_array_elements(p_lines) ln where ln ? 'request_sources') or exists(select 1 from jsonb_array_elements(p_lines) ln
  join public.purchase_demands d on d.id=nullif(ln->>'demand_id','')::uuid join public.purchase_requests r on r.id=d.request_id where r.request_version>0 or r.request_context is not null) then
  raise exception 'context requests use the canonical issue door' using errcode='22023',detail='context_issue_not_ready'; end if;
 return public._operation_create_po_inner_admitted(p_supplier_id,p_warehouse_id,p_lines,p_eta_date,p_so_refs,p_note,p_procurement_partner_id,p_destination_id,null);
end;
$legacy_inner$;


-- Existing owner move keeps MPR source attribution when a source row splits.
create or replace function public._po_line_source_move(
  p_source_id uuid,
  p_to_line   uuid,
  p_qty       integer
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_src po_line_sources;
begin
  select * into v_src from po_line_sources where id = p_source_id for update;
  if p_qty >= v_src.qty then
    update po_line_sources set po_line_id = p_to_line where id = p_source_id;
  else
    update po_line_sources set qty = qty - p_qty where id = p_source_id;
    insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, purchase_demand_id, qty, created_at)
    values (v_src.po_id, p_to_line, v_src.sku, v_src.order_id, v_src.so, v_src.order_line_id, v_src.purchase_demand_id,
            p_qty, v_src.created_at);
  end if;
end;
$function$;

revoke all on function public._po_line_source_move(uuid, uuid, integer) from public, anon, authenticated;

-- Existing Stock arrival transition also retains concrete MPR bindings.
CREATE OR REPLACE FUNCTION public.ops_stock_bound_incoming_arrives()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if old.status = 'incoming'
     and new.status is distinct from old.status
     and (old.reserved_order_line_id is not null or old.reserved_purchase_demand_id is not null) then
    if new.status = 'free' then
      -- The goods arrived for the customer who reserved them on the PO.
      new.status := 'reserved';
    elsif new.status <> 'reserved' then
      -- Damaged/wrong on arrival, voided by a revision or cancel: the Unit no
      -- longer answers the line, and the requirement returns to SO Batch.
      new.ref_history := case when old.reserved_ref is not null
                              then array_append(old.ref_history, old.reserved_ref)
                              else old.ref_history end;
      new.reserved_ref := null;
      new.reserved_order_line_id := null;
      new.reserved_purchase_demand_id := null;
    end if;
  end if;
  return new;
end;
$function$;

-- SAME qualified PO-owner door. Legacy-only source movement retained verbatim.
CREATE OR REPLACE FUNCTION public.purchasing_change_po_deliver_to(p_po_id text, p_line_id uuid, p_qty integer, p_destination_id uuid, p_reason text, p_unit_codes text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role       app_role;
  v_uid        uuid;
  v_actor      text;
  v_reason     text;
  v_po         purchase_orders;
  v_line       purchase_order_lines;
  v_target     purchase_order_lines;
  v_target_id  uuid;
  v_from_dest  uuid;
  v_from_name  text;
  v_to_name    text;
  v_item       text;
  v_open       integer;
  v_by_unit    boolean;
  v_units      uuid[];
  v_unit_codes text[];
  v_n          integer;
  v_snap       jsonb;
  v_last_rev   integer;
  v_rev_no     integer;
  v_version    integer;
  v_line_dest  uuid;
  v_src        record;
  v_take       integer;
  v_left       integer;
  v_moved_so   jsonb := '[]'::jsonb;
  v_whole      boolean;
  v_context_before jsonb;
  v_context_after jsonb;
  v_context_modern boolean:=false;
  v_context_request uuid;
  v_context_move jsonb;
  v_context_moves jsonb:='[]';
begin
  v_role := public.purchasing_supplier_call_gate();
  if exists(select 1 from public.purchase_order_lines cl where cl.po_id=p_po_id and public._purchasing_po_line_cancelled_qty(cl.id)>0) then
   raise exception 'Post-cancellation movement requires exact active sources' using errcode='22023',detail='request_source_allocation_required'; end if;
  v_uid  := auth.uid();
  -- Same source-key/root order as context issue; NOWAIT never deadlocks with it.
  perform public._purchasing_context_source_locks(array(select distinct sku from public.purchase_order_lines where po_id=p_po_id));
  for v_context_request in select distinct d.request_id from public.purchase_order_lines pl
   cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands d on d.id=src.demand_id
   join public.purchase_requests r on r.id=d.request_id where pl.po_id=p_po_id and r.request_version>0 order by d.request_id loop
   perform public._purchasing_context_writer_admission();
   begin perform 1 from public.purchase_requests where id=v_context_request for update nowait;
   exception when lock_not_available then raise exception 'request coverage changed' using errcode='40001',detail='request_coverage_changed'; end;
  end loop;
  v_context_before:=public._purchasing_context_po_source_scope(p_po_id);

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A Deliver To change must say why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %, not open', p_po_id, v_po.status
      using errcode = '22023', detail = 'po_not_open';
  end if;

  select * into v_line from purchase_order_lines
   where id = p_line_id and po_id = p_po_id
   for update;
  if not found then
    raise exception 'PO line % is not on %', p_line_id, p_po_id
      using errcode = '22023', detail = 'po_line_not_found';
  end if;

  if p_destination_id is null or not exists (
    select 1 from purchasing_destinations d where d.id = p_destination_id and d.active
  ) then
    raise exception 'The new Deliver To is not an open destination'
      using errcode = 'P0001', detail = 'deliver_to_closed';
  end if;

  v_from_dest := coalesce(v_line.destination_id, v_po.destination_id);
  if v_from_dest is not distinct from p_destination_id then
    raise exception 'These goods already go to that Deliver To'
      using errcode = '22023', detail = 'same_destination';
  end if;

  -- Only what the supplier has not delivered yet can move (§5.4). A fully
  -- received line reads `All received · use a transfer instead`.
  v_open := v_line.qty - v_line.received_qty;
  if v_open <= 0 then
    raise exception 'All % on this line is received', v_line.sku
      using errcode = 'P0001', detail = 'all_received';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > v_open then
    raise exception 'Qty to move must be 1 to % (asked for %)', v_open, p_qty
      using errcode = '22023', detail = 'qty_out_of_range';
  end if;

  select coalesce(pm.name || ' · ' || ps.variant, pm.name, v_line.sku)
    into v_item
    from (select 1) k
    left join product_skus ps on ps.sku = v_line.sku
    left join product_models pm on pm.id = ps.model_id;
  v_item := coalesce(v_item, v_line.sku);
  select name into v_from_name from purchasing_destinations where id = v_from_dest;
  select name into v_to_name   from purchasing_destinations where id = p_destination_id;

  -- ── Units: exact-unit goods move by Unit (§5.4, §6.2 — never voided, never
  --    minted). A line with incoming Units moves them even if its mode is an
  --    older unset one, so the line and its Units never disagree.
  v_by_unit := v_line.identity_mode = 'exact_unit'
    or exists (select 1 from ops_stock_items i
                where i.po_line_id = v_line.id and i.status = 'incoming');

  if v_by_unit then
    if p_unit_codes is null or cardinality(p_unit_codes) = 0 then
      -- The planner's rule (2026-09-25): the system pre-selects the line's
      -- last n IDs; the screen may send another choice.
      select array_agg(id order by created_at desc, unit_code desc)
        into v_units
        from (select i.id, i.created_at, i.unit_code
                from ops_stock_items i
               where i.po_line_id = v_line.id and i.status = 'incoming'
               order by i.created_at desc, i.unit_code desc
               limit p_qty) t;
    else
      if (select count(distinct c) from unnest(p_unit_codes) c) <> cardinality(p_unit_codes) then
        raise exception 'A Unit ID is chosen twice'
          using errcode = '22023', detail = 'unit_chosen_twice';
      end if;
      select array_agg(i.id) into v_units
        from ops_stock_items i
       where i.unit_code = any(p_unit_codes)
         and i.po_line_id = v_line.id
         and i.status = 'incoming';
    end if;

    v_n := coalesce(cardinality(v_units), 0);
    if p_unit_codes is not null and cardinality(p_unit_codes) > 0 and v_n <> cardinality(p_unit_codes) then
      raise exception 'A chosen Unit ID is not waiting on this line'
        using errcode = '22023', detail = 'unit_not_on_line';
    end if;
    if v_n <> p_qty then
      raise exception 'Choose % Unit IDs (% chosen)', p_qty, v_n
        using errcode = '22023', detail = 'unit_count_mismatch';
    end if;

    select array_agg(unit_code order by unit_code) into v_unit_codes
      from ops_stock_items where id = any(v_units);
  end if;

  -- ── Where the moved goods land: the whole line just changes its Deliver To;
  --    part of it joins the line of the same item already going there, or a
  --    new line copied from this one.
  v_line_dest := case when p_destination_id = v_po.destination_id then null
                      else p_destination_id end;

  select * into v_target from purchase_order_lines l
   where l.po_id = p_po_id
     and l.id <> v_line.id
     and l.sku = v_line.sku
     and coalesce(l.attrs::text, '') = coalesce(v_line.attrs::text, '')
     and coalesce(l.destination_id, v_po.destination_id) = p_destination_id
   for update;

  v_whole := (p_qty = v_line.qty);

  if v_whole and v_target.id is not null then
    -- A line cannot be emptied (qty > 0) and is never deleted, so the whole
    -- line cannot fold into a sibling. Move one less, or change the sibling.
    raise exception '% already has a line going to %', v_item, v_to_name
      using errcode = 'P0001', detail = 'deliver_to_line_exists';
  end if;

  select exists(select 1 from public.po_line_sources ps join public.purchase_demands d on d.id=ps.purchase_demand_id
   join public.purchase_requests r on r.id=d.request_id where ps.po_line_id=v_line.id and r.request_version>0) into v_context_modern;
  if v_context_modern and not v_whole then
   if exists(select 1 from public.po_line_sources where po_line_id=v_line.id and order_id is not null) then
    raise exception 'mixed source move requires exact owning lineage' using errcode='22023',detail='request_po_coverage_changed'; end if;
   v_left:=p_qty;
   for v_src in select * from public.po_line_sources where po_line_id=v_line.id order by id for update loop
    if v_by_unit then
     select count(*) into v_take from public.ops_stock_items i where i.id=any(v_units)
      and public._purchasing_context_unit_demand(i.id)=v_src.purchase_demand_id;
    elsif (select count(*) from public.po_line_sources where po_line_id=v_line.id)=1 then v_take:=p_qty;
    else raise exception 'counted source move requires an explicit source' using errcode='22023',detail='request_source_allocation_required'; end if;
    if v_take>v_src.qty then raise exception 'moved source exceeds its quantity' using errcode='22023',detail='request_po_coverage_changed'; end if;
    if v_take>0 then v_context_moves:=v_context_moves||jsonb_build_array(jsonb_build_object('source_id',v_src.id,'qty',v_take)); end if;
    v_left:=v_left-v_take;
   end loop;
   if v_left<>0 then raise exception 'moved Unit source unavailable' using errcode='22023',detail='request_po_coverage_changed'; end if;
  end if;

  -- ── Snapshot the PRIOR version before any write (0312 shape).
  select jsonb_build_object(
           'eta_date',       v_po.eta_date,
           'destination_id', v_po.destination_id,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sku', l.sku, 'qty', l.qty, 'destination_id', l.destination_id
                    ) order by l.sku, l.id)
               from purchase_order_lines l where l.po_id = p_po_id), '[]'::jsonb)
         ) into v_snap;

  select coalesce(max(rev_no), 0) into v_last_rev
    from po_revisions where po_id = p_po_id;
  insert into po_revisions (po_id, rev_no, snapshot, reason, created_by)
  values (p_po_id, v_last_rev + 1, v_snap, v_reason, v_uid)
  returning rev_no into v_rev_no;

  -- Both flags are transaction-local. `carres.po_revise` lets the line writes
  -- through the sent-PO guard; `carres.po_line_move` lets the Units follow.
  perform set_config('carres.po_revise', 'true', true);
  perform set_config('carres.po_line_move', 'true', true);

  if v_whole then
    update purchase_order_lines
       set destination_id = v_line_dest
     where id = v_line.id;
    v_target_id := v_line.id;
  else
    update purchase_order_lines
       set qty = qty - p_qty
     where id = v_line.id;

    if v_target.id is not null then
      update purchase_order_lines
         set qty = qty + p_qty
       where id = v_target.id;
      v_target_id := v_target.id;
    else
      insert into purchase_order_lines
        (po_id, sku, qty, received_qty, cost, cost_source, attrs,
         damaged_qty, wrong_item_qty, purchase_request_id, destination_id,
         ops_remark, commercial_treatment, commercial_reason, demand_id,
         identity_mode)
      values
        (p_po_id, v_line.sku, p_qty, 0, v_line.cost, v_line.cost_source, v_line.attrs,
         0, 0, null, v_line_dest,
         v_line.ops_remark, v_line.commercial_treatment, v_line.commercial_reason,
         v_line.demand_id, v_line.identity_mode)
      returning id into v_target_id;
    end if;

    -- ── Units follow the goods.
    if v_by_unit then
      update ops_stock_items
         set po_line_id = v_target_id, updated_at = now()
       where id = any(v_units);

      insert into stock_unit_events
        (unit_id, unit_code, event, from_value, to_value, note, actor_id)
      select i.id, i.unit_code, 'line_moved', v_line.id::text, v_target_id::text,
             format('Deliver To %s to %s. %s', coalesce(v_from_name, 'Not recorded'), v_to_name, v_reason),
             v_uid
        from ops_stock_items i where i.id = any(v_units);
    end if;

    -- ── Customer lineage follows, covered once. A Unit already reserved for a
    --    Sales Order line (0600) carries its own allocation with it; the rest
    --    of the moved qty takes the line's lineage newest first, never more
    --    than it. Coverage across the PO is unchanged by construction.
    if v_context_modern then
     for v_context_move in select * from jsonb_array_elements(v_context_moves) loop
      perform public._po_line_source_move((v_context_move->>'source_id')::uuid,v_target_id,(v_context_move->>'qty')::integer);
     end loop;
    else
    v_left := p_qty;
    if v_by_unit then
      v_left := p_qty - (select count(*)::int from ops_stock_items i
                          where i.id = any(v_units)
                            and i.reserved_order_line_id is not null);
    end if;

    for v_src in
      select * from po_line_sources s
       where s.po_line_id = v_line.id
       order by s.created_at desc, s.id desc
       for update
    loop
      exit when v_left <= 0;
      v_take := least(v_left, v_src.qty);
      perform public._po_line_source_move(v_src.id, v_target_id, v_take);
      v_moved_so := v_moved_so || jsonb_build_array(jsonb_build_object('so', v_src.so, 'qty', v_take));
      v_left := v_left - v_take;
    end loop;
    end if;
  end if;

  if v_whole and v_by_unit then
    insert into stock_unit_events
      (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    select i.id, i.unit_code, 'deliver_to_changed', v_from_dest::text, p_destination_id::text,
           format('Deliver To %s to %s. %s', coalesce(v_from_name, 'Not recorded'), v_to_name, v_reason),
           v_uid
      from ops_stock_items i where i.id = any(v_units);
  end if;

  v_version := coalesce(v_po.version, 1) + 1;
  update purchase_orders
     set version = v_version,
         revised_at = now(),
         updated_at = now()
   where id = p_po_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Version %s: %s %s moved from %s to %s. Total unchanged. Reason: %s',
                 v_version, p_qty, v_item, coalesce(v_from_name, 'Not recorded'),
                 v_to_name, v_reason),
          v_role, v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s Change Deliver To, Version %s', p_po_id, v_version),
          p_po_id);

  v_context_after:=public._purchasing_context_po_source_scope(p_po_id);
  for v_context_request in select distinct (x->>'request_id')::uuid from jsonb_array_elements(v_context_before) x
   join public.purchase_requests r on r.id=(x->>'request_id')::uuid where r.request_version>0 loop
   insert into public.purchase_request_events(request_id,round,kind,actor_id,reason,changes)
    select r.id,r.round,'po_issued',v_uid,v_reason,jsonb_build_object('record_type','po_source_change','po_id',p_po_id,
     'po_version',v_version,'operation','change_deliver_to','before_scope',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_context_before) x where x->>'request_id'=r.id::text),'[]'::jsonb),
     'after_scope',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_context_after) x where x->>'request_id'=r.id::text),'[]'::jsonb))
    from public.purchase_requests r where r.id=v_context_request;
  end loop;

  return jsonb_build_object(
    'po_id',      p_po_id,
    'version',    v_version,
    'rev_no',     v_rev_no,
    'from_line',  v_line.id,
    'to_line',    v_target_id,
    'qty',        p_qty,
    'unit_codes', to_jsonb(coalesce(v_unit_codes, '{}'::text[])),
    'sales_orders', v_moved_so
  );
end;
$function$;

revoke all on function public.purchasing_change_po_deliver_to(text,uuid,integer,uuid,text,text[]) from public,anon;
grant execute on function public.purchasing_change_po_deliver_to(text,uuid,integer,uuid,text,text[]) to authenticated;

-- SAME legacy cancellation door; contextual reason-only bypass is refused.
CREATE OR REPLACE FUNCTION public.operation_cancel_po(p_po_id text, p_reason text)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po               purchase_orders;
  v_dealer_id        uuid;
  v_actor            text;
  v_threads_released int;
  v_units_voided     int := 0;   -- 0154
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- §5.8.1 supersedes a reason-only cancellation. The qualified supplier/
  -- fee/effective-version producer is outside this MPR delivery; never restore
  -- buying coverage from this legacy bypass. Existing legacy behavior retained.
  if exists(select 1 from public.purchase_order_lines pl cross join lateral public._purchasing_po_request_sources(pl.id) src
    join public.purchase_demands d on d.id=src.demand_id join public.purchase_requests r on r.id=d.request_id
    where pl.po_id=p_po_id and r.request_version>0) then
   perform public._purchasing_context_writer_admission();
   raise exception 'Effective source cancellation authority is required' using errcode='22023',detail='request_po_cancel_authority_required';
  end if;

  if v_po.so is not null then
    select dealer_id into v_dealer_id
      from orders where so = v_po.so
      limit 1;
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  update order_supplier_threads
     set po_id        = null,
         warehouse_id = null,
         updated_at   = now()
   where po_id = p_po_id;
  get diagnostics v_threads_released = row_count;

  -- 0154: void this PO's never-arrived (incoming) tracked units so phantom IDs
  -- don't linger in the per-unit register.
  update ops_stock_items
     set status = 'voided', updated_at = now()
   where po_no = p_po_id and status = 'incoming';
  get diagnostics v_units_voided = row_count;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'operation',
    v_actor,
    format('Cancelled PO %s · %s threads released · %s unit(s) voided · %s',
           p_po_id, v_threads_released, v_units_voided, p_reason),
    v_dealer_id,
    p_po_id
  );

  return v_po;
end;
$function$;
revoke all on function public.operation_cancel_po(text,text) from public,anon;
grant execute on function public.operation_cancel_po(text,text) to authenticated;

-- SAME PO revision writer/permission. No new MPR revision or approval is implied.
CREATE OR REPLACE FUNCTION public.purchasing_revise_po(p_po_id text, p_reason text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role      app_role;
  v_uid       uuid;
  v_actor     text;
  v_reason    text;
  v_po        purchase_orders;
  v_el        jsonb;
  v_line_id   uuid;
  v_qty       integer;
  v_dest      uuid;
  v_has_dest  boolean;
  v_line      purchase_order_lines;
  v_changes   text[] := '{}';
  v_updates   jsonb  := '[]'::jsonb;
  v_snap      jsonb;
  v_last_rev  integer;
  v_rev       po_revisions;
  v_version   integer;
  v_dest_name text;
  v_delta     integer;
  v_supplier_name text;
  v_retired   integer;
  v_context_before jsonb;
  v_context_after jsonb;
  v_context_updates jsonb:='[]';
  v_context_allocations jsonb:='[]';
  v_context_request uuid;
  v_context_source record;
  v_context_row record;
  v_context_item jsonb;
  v_context_units uuid[];
  v_context_new_units uuid[];
  v_context_demand uuid;
  v_context_qty integer;
  v_context_input jsonb;
  v_context_explicit boolean;
  v_context_sources jsonb;
  v_context_src jsonb;
  v_context_total bigint;
  v_context_recipients jsonb;
  v_context_remaining jsonb;
  v_context_recipient jsonb;
begin
  v_role := public.purchasing_supplier_call_gate();
  v_uid  := auth.uid();
  perform public._purchasing_context_source_locks(array(select distinct sku from public.purchase_order_lines where po_id=p_po_id));
  for v_context_request in select distinct d.request_id from public.purchase_order_lines pl
   cross join lateral public._purchasing_po_request_sources(pl.id) src join public.purchase_demands d on d.id=src.demand_id
   join public.purchase_requests r on r.id=d.request_id where pl.po_id=p_po_id and r.request_version>0 order by d.request_id loop
   perform public._purchasing_context_writer_admission();
   begin perform 1 from public.purchase_requests where id=v_context_request for update nowait;
   exception when lock_not_available then raise exception 'request coverage changed' using errcode='40001',detail='request_coverage_changed'; end;
  end loop;
  v_context_before:=public._purchasing_context_po_source_scope(p_po_id);
  select coalesce(array_agg(id),'{}') into v_context_units from public.ops_stock_items where po_no=p_po_id;


  -- Reason is required IN SQL — a version without a why is a version nobody
  -- can answer for (the ruling stores the reason and the author).
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'A revision must say why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO % is %, not open', p_po_id, v_po.status
      using errcode = '22023', detail = 'po_not_open';
  end if;

  if exists(select 1 from public.purchase_order_lines l where l.po_id=p_po_id and public._purchasing_po_line_cancelled_qty(l.id)>0) then
   raise exception 'Post-cancellation quantity revision needs its exact active source scope' using errcode='22023',detail='request_source_allocation_required'; end if;

  -- ── PASS 1 · validate everything and collect the intended updates.
  --    THE FLOOR SPEAKS BEFORE ANY WRITE (2990s' discipline): a violation on
  --    line 3 must leave lines 1 and 2 untouched.
  for v_el in select * from jsonb_array_elements(p_lines) loop
    begin
      v_line_id := (v_el ->> 'line_id')::uuid;
    exception when others then
      raise exception 'line_id must be a uuid'
        using errcode = '22023', detail = 'invalid_input';
    end;

    if v_el -> 'qty' is null or jsonb_typeof(v_el -> 'qty') <> 'number' then
      raise exception 'qty is required per line'
        using errcode = '22023', detail = 'invalid_input';
    end if;
    if exists(select 1 from jsonb_array_elements(v_context_before)) and (mod((v_el->>'qty')::numeric,1)<>0 or (v_el->>'qty')::numeric>2147483647) then
      raise exception 'whole quantity required' using errcode='22023',detail='invalid_qty'; end if;
    v_qty := (v_el ->> 'qty')::integer;

    v_has_dest := v_el ? 'destination_id';
    v_dest := null;
    if v_has_dest and jsonb_typeof(v_el -> 'destination_id') <> 'null' then
      begin
        v_dest := (v_el ->> 'destination_id')::uuid;
      exception when others then
        raise exception 'destination_id must be a uuid or null'
          using errcode = '22023', detail = 'invalid_input';
      end;
      if not exists (select 1 from purchasing_destinations d where d.id = v_dest) then
        raise exception 'destination % is not in the registry', v_dest
          using errcode = '22023', detail = 'invalid_input';
      end if;
    end if;

    select * into v_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id
     for update;
    if not found then
      -- Existing lines ONLY: adding items is a NEW PO (the ruling), so an
      -- unknown line id is refused, never inserted.
      raise exception 'PO line % is not on %', v_line_id, p_po_id
        using errcode = '22023', detail = 'po_line_not_found';
    end if;

    if v_qty is null or v_qty < 1 then
      -- Stopping is still the whole PO (Cancel) — a zero is a line silently
      -- stopped, and the ruling closed that door.
      raise exception 'qty must be at least 1'
        using errcode = '22023', detail = 'invalid_input';
    end if;

    -- THE FLOOR. Goods already received cannot be un-ordered by editing a
    -- document; the excess goes back through a Purchase Return first.
    if v_qty < v_line.received_qty then
      raise exception '% cannot go below the % already received (asked for %)',
          v_line.sku, v_line.received_qty, v_qty
        using errcode = 'P0001', detail = 'received_floor';
    end if;

    if v_qty is distinct from v_line.qty then
      v_changes := v_changes
        || format('%s qty %s → %s', v_line.sku, v_line.qty, v_qty);
    end if;
    if v_has_dest and (v_dest is distinct from v_line.destination_id) then
      v_dest_name := coalesce(
        (select d.name from purchasing_destinations d where d.id = v_dest),
        'PO default');
      v_changes := v_changes
        || format('%s → %s', v_line.sku, v_dest_name);
    end if;

    v_updates := v_updates || jsonb_build_array(jsonb_build_object(
      'line_id', v_line_id,
      'qty', v_qty,
      'has_dest', v_has_dest,
      'destination_id', v_dest
    ));
  end loop;

  if coalesce(array_length(v_changes, 1), 0) = 0 then
    -- An identical document is not a new version: minting one would hand the
    -- factory a Version 2 that asks them to change nothing.
    raise exception 'Nothing changed'
      using errcode = '22023', detail = 'nothing_changed';
  end if;

  -- Existing PO revision, additive source changes only. A merged source is
  -- never guessed: every current source, exact version/approval and the added
  -- recipient distribution must be supplied. Reductions use effective cancellation.
  if (select count(*) from jsonb_array_elements(v_updates))<>(select count(distinct x->>'line_id') from jsonb_array_elements(v_updates) x) then
   raise exception 'duplicate PO line' using errcode='22023',detail='invalid_input'; end if;
  for v_context_item in select * from jsonb_array_elements(v_updates) loop
   select * into strict v_line from public.purchase_order_lines where id=(v_context_item->>'line_id')::uuid;
   v_delta:=(v_context_item->>'qty')::integer-v_line.qty;
   if v_delta<>0 and exists(select 1 from public._purchasing_po_request_sources(v_line.id) src join public.purchase_demands d on d.id=src.demand_id
     join public.purchase_requests r on r.id=d.request_id where r.request_version>0) then
    if v_delta<0 then raise exception 'Effective source cancellation authority is required' using errcode='22023',detail='request_po_cancel_authority_required'; end if;
    if exists(select 1 from public.po_line_sources where po_line_id=v_line.id and order_id is not null)
     or (select sum(src.qty) from public._purchasing_po_request_sources(v_line.id) src) is distinct from v_line.qty then
     raise exception 'PO source coverage changed' using errcode='22023',detail='request_po_coverage_changed'; end if;
    select x into strict v_context_input from jsonb_array_elements(p_lines) x where x->>'line_id'=v_line.id::text;
    v_context_explicit:=v_context_input ? 'request_sources';
    if v_context_explicit then
     if jsonb_typeof(v_context_input->'expected_po_version') is distinct from 'number'
      or (v_context_input->>'expected_po_version')::numeric is distinct from v_po.version::numeric then
      raise exception 'PO version changed' using errcode='40001',detail='request_po_coverage_changed'; end if;
     v_context_sources:=v_context_input->'request_sources';
     if jsonb_typeof(v_context_sources) is distinct from 'array'
      or jsonb_array_length(v_context_sources)<>(select count(*) from public._purchasing_po_request_sources(v_line.id))
      or jsonb_array_length(v_context_sources)<>(select count(distinct x->>'demand_id') from jsonb_array_elements(v_context_sources) x) then
      raise exception 'exact request sources required' using errcode='22023',detail='request_source_allocation_required'; end if;
    else
     if (select count(*) from public._purchasing_po_request_sources(v_line.id))<>1 then
      raise exception 'revision requires explicit request source allocation' using errcode='22023',detail='request_source_allocation_required'; end if;
     select jsonb_build_array(jsonb_build_object('demand_id',src.demand_id,'qty',(v_context_item->>'qty')::integer,'recipients','[]'::jsonb)) into v_context_sources from public._purchasing_po_request_sources(v_line.id) src;
    end if;
    v_context_total:=0;
    for v_context_src in select * from jsonb_array_elements(v_context_sources) loop
     if v_context_explicit then perform public._purchasing_context_object(v_context_src,'{"demand_id":"string","qty":"number","request_version":"number","approval_version":"number","approval_token":"string","recipients":"array"}'); end if;
     select d.id,d.request_id,d.qty,d.approved_qty,d.issued_qty,d.purpose,d.supplier_id,d.sku,d.attrs,r.request_version,r.approval_version,r.approval_scope,r.request_context,r.fulfilment_intent,
      r.approved_at,r.refused_at,r.withdrawn_at,r.sent_back_at,src.qty source_qty
      into v_context_source from public._purchasing_po_request_sources(v_line.id) src join public.purchase_demands d on d.id=src.demand_id join public.purchase_requests r on r.id=d.request_id where d.id=(v_context_src->>'demand_id')::uuid;
     if not found or v_context_source.request_version<1 then raise exception 'unknown contextual source' using errcode='22023',detail='request_source_allocation_required'; end if;
     if not v_context_explicit and v_context_source.purpose<>'ready_stock' then
      raise exception 'revision requires explicit request recipient allocation' using errcode='22023',detail='request_source_allocation_required'; end if;
     if jsonb_typeof(v_context_src->'qty') is distinct from 'number' or (v_context_src->>'qty')::numeric<1
      or mod((v_context_src->>'qty')::numeric,1)<>0 or (v_context_src->>'qty')::numeric>2147483647 then
      raise exception 'invalid source quantity' using errcode='22023',detail='invalid_qty'; end if;
     v_context_qty:=(v_context_src->>'qty')::integer;
     v_context_total:=v_context_total+v_context_qty;
     if v_context_qty<v_context_source.source_qty then raise exception 'Effective source cancellation authority is required' using errcode='22023',detail='request_po_cancel_authority_required'; end if;
     if v_context_source.approved_at is null or v_context_source.refused_at is not null or v_context_source.withdrawn_at is not null
      or v_context_source.sent_back_at is not null or v_context_source.approval_version is distinct from v_context_source.request_version
      or v_context_source.request_context is distinct from v_context_source.approval_scope->'context'
      or not exists(select 1 from jsonb_array_elements(v_context_source.approval_scope->'approved_distribution') x where x->>'demandId'=v_context_source.id::text and (x->>'qty')::integer=v_context_source.approved_qty)
      or v_context_source.sku is distinct from v_line.sku or nullif(v_context_source.attrs,'{}'::jsonb) is distinct from nullif(v_line.attrs,'{}'::jsonb)
      or v_context_source.supplier_id is distinct from v_po.supplier_id or v_context_source.purpose is distinct from v_po.purpose
      or not public._purchasing_context_po_destination_matches(v_context_source.id,v_line.id,coalesce(v_line.destination_id,v_po.destination_id))
      or not exists(select 1 from public.product_skus where sku=v_line.sku and supplier_id=v_po.supplier_id) then
      raise exception 'approved source differs from proposed PO revision' using errcode='22023',detail='request_approval_changed'; end if;
     if v_context_explicit and ((v_context_src->>'request_version')::numeric is distinct from v_context_source.request_version::numeric
      or (v_context_src->>'approval_version')::numeric is distinct from v_context_source.approval_version::numeric
      or v_context_src->>'approval_token' is distinct from md5(v_context_source.approval_scope::text)) then
      raise exception 'request approval changed' using errcode='22023',detail='request_approval_changed'; end if;
     -- Fresh normal approval, or ONLY unchanged committed RS scope after its
     -- Forecast cohort changed. This cannot create a new request/source/approval.
     if v_context_source.purpose='ready_stock' then
      if public._purchasing_context_committed_rs_coverage(v_context_source.request_id) is null then raise exception 'committed source changed' using errcode='22023',detail='request_approval_changed'; end if;
     else perform public._purchasing_context_coverage(v_context_source.request_id,true); end if;
     v_context_recipients:=v_context_src->'recipients';
     if v_context_source.purpose='ready_stock' then
      if v_context_recipients is distinct from '[]'::jsonb then raise exception 'RS has no final recipient' using errcode='22023',detail='invalid_issue_distribution'; end if;
     else
      v_context_remaining:=public._purchasing_context_remaining_recipients(v_context_source.request_id,v_context_source.id,v_context_source.approval_scope);
      if jsonb_typeof(v_context_recipients) is distinct from 'array'
       or (select count(*) from jsonb_array_elements(v_context_recipients))<>(select count(distinct x->>'recipientId') from jsonb_array_elements(v_context_recipients) x) then
       raise exception 'exact added recipient allocation required' using errcode='22023',detail='invalid_issue_distribution'; end if;
      for v_context_recipient in select * from jsonb_array_elements(v_context_recipients) loop
       perform public._purchasing_context_object(v_context_recipient,'{"recipientId":"string","qty":"number"}');
       if (v_context_recipient->>'qty')::numeric<1 or mod((v_context_recipient->>'qty')::numeric,1)<>0
        or not exists(select 1 from jsonb_array_elements(v_context_remaining) x where (x->>'recipientId')::uuid=(v_context_recipient->>'recipientId')::uuid and (x->>'qty')::numeric>=(v_context_recipient->>'qty')::numeric) then
        raise exception 'recipient exceeds approved remainder' using errcode='22023',detail='invalid_issue_distribution'; end if;
      end loop;
      if (select coalesce(sum((x->>'qty')::numeric),0) from jsonb_array_elements(v_context_recipients) x)<>v_context_qty-v_context_source.source_qty then
       raise exception 'added recipients differ from source quantity' using errcode='22023',detail='invalid_issue_distribution'; end if;
     end if;
     if v_context_qty>v_context_source.source_qty then
      v_context_updates:=v_context_updates||jsonb_build_array(jsonb_build_object('line_id',v_line.id,'demand_id',v_context_source.id,'qty',v_context_qty,'delta',v_context_qty-v_context_source.source_qty,'recipients',v_context_recipients));
     end if;
    end loop;
    if v_context_total<>(v_context_item->>'qty')::integer then raise exception 'source totals differ from PO quantity' using errcode='22023',detail='request_source_allocation_required'; end if;
   end if;
  end loop;
  for v_context_row in select (x->>'demand_id')::uuid demand_id,sum((x->>'delta')::integer)::integer delta from jsonb_array_elements(v_context_updates) x group by 1 loop
   select d.id,d.issued_qty,d.approved_qty into strict v_context_source from public.purchase_demands d where d.id=v_context_row.demand_id;
   if v_context_source.issued_qty+v_context_row.delta<0 or v_context_source.issued_qty+v_context_row.delta>v_context_source.approved_qty
    or v_context_source.issued_qty<>(select coalesce(sum(src.qty),0) from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id
      cross join lateral public._purchasing_po_request_sources(pl.id) src where src.demand_id=v_context_source.id and po.status<>'cancelled') then
    raise exception 'revision exceeds approved source remainder' using errcode='22023',detail='request_over_issue'; end if;
  end loop;

  -- The same demand may span several PO lines. Recipient conservation is
  -- checked across the entire revision, not independently per visible line.
  for v_context_row in select (x->>'demand_id')::uuid demand_id,rc->>'recipientId' recipient_id,sum((rc->>'qty')::numeric) qty
   from jsonb_array_elements(v_context_updates) x cross join lateral jsonb_array_elements(x->'recipients') rc group by 1,2 loop
   select d.request_id,r.approval_scope into strict v_context_source from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id where d.id=v_context_row.demand_id;
   if not exists(select 1 from jsonb_array_elements(public._purchasing_context_remaining_recipients(v_context_source.request_id,v_context_row.demand_id,v_context_source.approval_scope)) rc where rc->>'recipientId'=v_context_row.recipient_id and (rc->>'qty')::numeric>=v_context_row.qty) then
    raise exception 'combined recipients exceed approved remainder' using errcode='22023',detail='invalid_issue_distribution'; end if;
  end loop;

  -- ── PASS 2 · snapshot the PRIOR version, before any write.
  --    0312's EXACT shape — eta_date · destination_id · every line — so
  --    purchasing_record_send's "changed since the last snapshot" comparison
  --    keeps working with no second spelling of the document (Law D).
  select jsonb_build_object(
           'eta_date',       v_po.eta_date,
           'destination_id', v_po.destination_id,
           'lines', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'sku', l.sku, 'qty', l.qty, 'destination_id', l.destination_id
                    ) order by l.sku, l.id)
               from purchase_order_lines l where l.po_id = p_po_id), '[]'::jsonb)
         ) into v_snap;

  select coalesce(max(rev_no), 0) into v_last_rev
    from po_revisions where po_id = p_po_id;

  insert into po_revisions (po_id, rev_no, snapshot, reason, created_by)
  values (p_po_id, v_last_rev + 1, v_snap, v_reason, v_uid)
  returning * into v_rev;

  -- ── PASS 3 · apply. The transaction-local flag lets these writes through
  --    the shared-PO guard below; nothing else ever sets it.
  perform set_config('carres.po_revise', 'true', true);

  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  for v_el in select * from jsonb_array_elements(v_updates) loop
    select * into v_line from purchase_order_lines
     where id = (v_el ->> 'line_id')::uuid;
    v_delta := (v_el ->> 'qty')::integer - v_line.qty;

    if (v_el ->> 'has_dest')::boolean then
      update purchase_order_lines
         set qty = (v_el ->> 'qty')::integer,
             destination_id = (v_el ->> 'destination_id')::uuid
       where id = (v_el ->> 'line_id')::uuid;
    else
      update purchase_order_lines
         set qty = (v_el ->> 'qty')::integer
       where id = (v_el ->> 'line_id')::uuid;
    end if;

    -- ⭐ 0443 · THE UNIT CONSEQUENCE OF A REVISION. An exact-unit line that
    -- grows is born its ADDITIONAL Unit IDs only — the pieces the supplier
    -- already has IDs for keep them. A line that shrinks retires the surplus
    -- not-yet-received Units (newest first): retired, never deleted, never
    -- reused, so every version of the paper still names a real permanent
    -- identity. A quantity line has no Units to move.
    if v_line.identity_mode = 'exact_unit' then
      if v_delta > 0 then
        insert into ops_stock_items
          (unit_code, sku, warehouse_id, status, supplier, po_no, po_line_id,
           identity_scope, source_ref, date_in)
        select public.allocate_unit_id(), v_line.sku, v_po.warehouse_id, 'incoming',
               v_supplier_name, p_po_id, v_line.id, 'unit', 'po_revision', current_date
          from generate_series(1, v_delta);
      elsif v_delta < 0 then
        with retired as (
          update ops_stock_items
             set status = 'voided', updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line.id and status = 'incoming'
              order by created_at desc, unit_code desc
              limit (-v_delta)
           )
          returning 1
        )
        select count(*) into v_retired from retired;
        if v_retired <> -v_delta then
          raise exception '% has fewer open Units than the revision retires', v_line.sku
            using errcode = 'P0001', detail = 'unit_ledger_mismatch';
        end if;
      end if;
    end if;
  end loop;

  for v_context_item in select * from jsonb_array_elements(v_context_updates) loop
   v_context_demand:=(v_context_item->>'demand_id')::uuid;
   select * into strict v_line from public.purchase_order_lines where id=(v_context_item->>'line_id')::uuid;
   update public.po_line_sources set qty=(v_context_item->>'qty')::integer where po_line_id=(v_context_item->>'line_id')::uuid and purchase_demand_id=v_context_demand;
   update public.purchase_demands set issued_qty=issued_qty+(v_context_item->>'delta')::integer where id=v_context_demand;
   select coalesce(array_agg(id order by id),'{}') into v_context_new_units from (select id from public.ops_stock_items where po_line_id=(v_context_item->>'line_id')::uuid and not(id=any(v_context_units)) and status<>'voided' order by id limit (v_context_item->>'delta')::integer) chosen;
   if v_line.identity_mode='exact_unit' and cardinality(v_context_new_units)<>(v_context_item->>'delta')::integer then raise exception 'source Unit attribution mismatch' using errcode='22023',detail='unit_ledger_mismatch'; end if;
   v_context_units:=v_context_units||v_context_new_units;
   if exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id where d.id=v_context_demand and r.fulfilment_intent='concrete_need') then
    update public.ops_stock_items set reserved_purchase_demand_id=v_context_demand,reserved_ref=(select r.req_no from public.purchase_requests r join public.purchase_demands d on d.request_id=r.id where d.id=v_context_demand) where id=any(v_context_new_units);
   end if;
   v_context_allocations:=v_context_allocations||jsonb_build_array(jsonb_build_object('line_id',v_context_item->'line_id','demand_id',v_context_demand,'qty_delta',(v_context_item->>'delta')::integer,'recipients',v_context_item->'recipients','unit_ids',to_jsonb(v_context_new_units)));
  end loop;

  v_version := coalesce(v_po.version, 1) + 1;
  update purchase_orders
     set version = v_version,
         revised_at = now(),
         updated_at = now()
   where id = p_po_id;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- Old → new, in the record (0325's discipline). The ruling's word is
  -- `Revised`; `Version` here is the DOCUMENT changing, which is exactly what
  -- 0317 reserved the word for.
  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id,
          format('Revised to Version %s — %s — %s',
                 v_version, array_to_string(v_changes, ' · '), v_reason),
          v_role, v_uid);
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('PO %s — revised to Version %s', p_po_id, v_version),
          p_po_id);

  v_context_after:=public._purchasing_context_po_source_scope(p_po_id);
  -- The new exact Units belong to the one proven source on this revised line.
  -- Record all actual identities without reserving intentional RS stock.
  for v_context_item in select * from jsonb_array_elements(v_context_updates) loop
   select a->'unit_ids' into strict v_snap from jsonb_array_elements(v_context_allocations) a where a->>'demand_id'=v_context_item->>'demand_id' and a->>'line_id'=v_context_item->>'line_id';
   select jsonb_agg(case when x->>'line_id'=v_context_item->>'line_id' and x->>'demand_id'=v_context_item->>'demand_id' then jsonb_set(x,'{unit_ids}',(select coalesce(jsonb_agg(id order by id),'[]') from (select distinct id from jsonb_array_elements(coalesce(x->'unit_ids','[]')||v_snap) id) ids)) else x end) into v_context_after from jsonb_array_elements(v_context_after) x;
  end loop;
  for v_context_request in select distinct (x->>'request_id')::uuid from jsonb_array_elements(v_context_before) x
   join public.purchase_requests r on r.id=(x->>'request_id')::uuid where r.request_version>0 loop
   insert into public.purchase_request_events(request_id,round,kind,actor_id,reason,changes)
    select r.id,r.round,'po_issued',v_uid,v_reason,jsonb_build_object('record_type','po_source_change','operation','revise_po','po_id',p_po_id,'po_version',v_version,
      'before_scope',(select jsonb_agg(x) from jsonb_array_elements(v_context_before) x where x->>'request_id'=r.id::text),
      'after_scope',(select jsonb_agg(x) from jsonb_array_elements(v_context_after) x where x->>'request_id'=r.id::text),
      'allocations',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_context_allocations) x join public.purchase_demands d on d.id=(x->>'demand_id')::uuid where d.request_id=r.id),'[]'::jsonb))
    from public.purchase_requests r where r.id=v_context_request;
  end loop;

  return jsonb_build_object(
    'po_id', p_po_id,
    'version', v_version,
    'rev_no', v_rev.rev_no,
    'changes', to_jsonb(v_changes)
  );
end;
$function$;
revoke all on function public.purchasing_revise_po(text,text,jsonb) from public,anon;
grant execute on function public.purchasing_revise_po(text,text,jsonb) to authenticated;
-- §5.8.1: one append-only occurrence ledger on the existing PO cancellation door.
-- No legacy transaction backfill, no money/settlement, no new Receiving/Service form.
create table if not exists public.po_goods_cancellation_events (
 id uuid primary key, request_id uuid not null, request_version integer not null check(request_version>0),
 po_id text not null references public.purchase_orders(id), expected_po_version integer not null,
 kind text not null check(kind in('pending','exception_approved','exception_refused','effective')),
 reason text not null, decision_reason text, scope jsonb not null, supplier_facts jsonb not null,
 actor_id uuid not null references public.app_users(id), at timestamptz not null default clock_timestamp(),
 command jsonb not null, applied_po_version integer,
 unique(request_id,request_version),
 check((kind='effective')=(applied_po_version is not null))
);
create index if not exists po_goods_cancellation_events_po_idx on public.po_goods_cancellation_events(po_id,kind);
alter table public.po_goods_cancellation_events enable row level security;
revoke all on public.po_goods_cancellation_events from public,anon,authenticated;
grant select on public.po_goods_cancellation_events to authenticated;
drop policy if exists po_goods_cancellation_events_read on public.po_goods_cancellation_events;
create policy po_goods_cancellation_events_read on public.po_goods_cancellation_events for select to authenticated
 using((select public.app_role()) in ('operation','principal','finance'));
create or replace function public._purchasing_cancellation_immutable()
returns trigger language plpgsql set search_path=public,pg_temp as $immutable$
begin raise exception 'Cancellation history is immutable' using errcode='55000'; end;
$immutable$;
revoke all on function public._purchasing_cancellation_immutable() from public,anon,authenticated;
drop trigger if exists po_goods_cancellation_events_immutable on public.po_goods_cancellation_events;
create trigger po_goods_cancellation_events_immutable before update or delete or truncate on public.po_goods_cancellation_events
 for each statement execute function public._purchasing_cancellation_immutable();

-- ONE cancelled/outstanding arithmetic. Original line/source quantities never change.
create or replace function public._purchasing_po_line_cancelled_qty(p_line uuid)
returns integer language sql stable set search_path=public,pg_temp as $cancelled_qty$
 select coalesce(sum((l->>'qty')::integer),0)::integer from public.po_goods_cancellation_events e
 cross join lateral jsonb_array_elements(e.scope) l where e.kind='effective' and l->>'lineId'=p_line::text;
$cancelled_qty$;
revoke all on function public._purchasing_po_line_cancelled_qty(uuid) from public,anon,authenticated;
create or replace function public._purchasing_po_demand_cancelled_qty(p_line uuid,p_demand uuid)
returns integer language sql stable set search_path=public,pg_temp as $cancelled_source$
 select coalesce(sum((s->>'qty')::integer),0)::integer from public.po_goods_cancellation_events e
 cross join lateral jsonb_array_elements(e.scope) l cross join lateral jsonb_array_elements(l->'sources') s
 where e.kind='effective' and l->>'lineId'=p_line::text and s->>'demandId'=p_demand::text;
$cancelled_source$;
revoke all on function public._purchasing_po_demand_cancelled_qty(uuid,uuid) from public,anon,authenticated;
create or replace function public._purchasing_po_request_active_sources(p_line uuid)
returns table(source_id uuid,demand_id uuid,qty integer) language sql stable set search_path=public,pg_temp as $active_sources$
 select s.source_id,s.demand_id,s.qty-public._purchasing_po_demand_cancelled_qty(p_line,s.demand_id) from public._purchasing_po_request_sources(p_line) s;
$active_sources$;
revoke all on function public._purchasing_po_request_active_sources(uuid) from public,anon,authenticated;

create or replace function public._purchasing_po_issued_recipients(p_po text,p_demand uuid)
returns jsonb language sql stable set search_path=public,pg_temp as $po_recipients$
 with quantities as (
 select rc->>'recipientId' id,(rc->>'qty')::integer qty from public.purchase_request_events e
 cross join lateral jsonb_array_elements(coalesce(e.changes->'allocations','[]')) a
 cross join lateral jsonb_array_elements(a->'recipients') rc
 where e.kind='po_issued' and e.changes->>'po_id'=p_po and a->>'demand_id'=p_demand::text
 and (e.changes->>'record_type'='po_issue' or (e.changes->>'record_type'='po_source_change' and e.changes->>'operation'='revise_po'))
 union all
 select rc->>'recipientId',-(rc->>'qty')::integer from public.po_goods_cancellation_events e
 cross join lateral jsonb_array_elements(e.scope) l cross join lateral jsonb_array_elements(l->'sources') s
 cross join lateral jsonb_array_elements(s->'recipients') rc where e.po_id=p_po and e.kind='effective' and s->>'demandId'=p_demand::text
 ), totals as(select id,sum(qty)::integer qty from quantities group by id)
 select coalesce(jsonb_agg(jsonb_build_object('recipientId',id,'qty',qty) order by id) filter(where qty>0),'[]'::jsonb) from totals;
$po_recipients$;
revoke all on function public._purchasing_po_issued_recipients(text,uuid) from public,anon,authenticated;

create or replace function public.purchasing_po_cancellation_facts(p_po_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $read_cancel$
begin
 if public.app_role() is null or public.app_role() not in('operation','principal','finance') then raise exception 'not permitted' using errcode='42501'; end if;
 if not exists(select 1 from public.purchase_orders where id=p_po_id) then raise exception 'PO not found' using errcode='22023',detail='po_not_found'; end if;
 return jsonb_build_object('poVersion',(select version from public.purchase_orders where id=p_po_id),'actorId',auth.uid(),'canDecideException',coalesce(public.app_role()='principal' and public.workspace_is_person(auth.uid()) and (public.workspace_resolve_duty('purchasing_approver')->>'actor_user_id')::uuid=auth.uid(),false),'lines',coalesce((select jsonb_agg(jsonb_build_object('lineId',l.id,'identityMode',l.identity_mode,'sku',l.sku,'orderedQty',l.qty,'receivedQty',l.received_qty,
  'cancelledQty',public._purchasing_po_line_cancelled_qty(l.id),'pendingQty',public._purchasing_po_line_pending_qty(l.id),
  'sources',(select coalesce(jsonb_agg(jsonb_build_object('demandId',s.demand_id,'requestId',(select request_id from public.purchase_demands where id=s.demand_id),'requestNo',(select r.req_no from public.purchase_requests r join public.purchase_demands d on d.request_id=r.id where d.id=s.demand_id),'contextual',(select r.request_version>0 from public.purchase_requests r join public.purchase_demands d on d.request_id=r.id where d.id=s.demand_id),'purpose',(select purpose from public.purchase_demands where id=s.demand_id),'unitChoices',case when public.app_role()='finance' then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'unitCode',i.unit_code,'status',i.status) order by i.unit_code),'[]') from public.ops_stock_items i where i.po_line_id=l.id and public._purchasing_context_unit_demand(i.id)=s.demand_id) end,'recipients',case when public.app_role()='finance' then '[]'::jsonb else (select coalesce(jsonb_agg(rc||jsonb_build_object('name',(select c->>'name' from public.purchase_requests r cross join lateral jsonb_array_elements(r.request_context->'recipients') c where r.id=d.request_id and c->>'id'=rc->>'recipientId'))),'[]') from public.purchase_demands d cross join lateral jsonb_array_elements(public._purchasing_po_issued_recipients(p_po_id,s.demand_id)) rc where d.id=s.demand_id) end,'orderedQty',s.qty,'cancelledQty',public._purchasing_po_demand_cancelled_qty(l.id,s.demand_id),'activeQty',s.qty-public._purchasing_po_demand_cancelled_qty(l.id,s.demand_id))),'[]') from public._purchasing_po_request_sources(l.id) s)) order by l.id) from public.purchase_order_lines l where l.po_id=p_po_id),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(e)-'command' order by e.at,e.id) from public.po_goods_cancellation_events e where e.po_id=p_po_id),'[]'),
  'financeHandoffs',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'poId',e.po_id,'poVersion',e.applied_po_version,'supplierId',(select supplier_id from public.purchase_orders where id=e.po_id),'sourceType','po_cancellation','ownerModule','finance','state','needs_finance_review','at',e.at,'actorId',e.actor_id,'lines',e.scope,'reason',e.reason,'evidence',e.supplier_facts->'evidence','result','effective_cancellation_requires_finance_follow_up') order by e.at) from public.po_goods_cancellation_events e where e.po_id=p_po_id and e.kind='effective'),'[]'));
end;
$read_cancel$;
revoke all on function public.purchasing_po_cancellation_facts(text) from public,anon;
grant execute on function public.purchasing_po_cancellation_facts(text) to authenticated;

-- Qualified form of the SAME cancellation action. Existing reason-only signature
-- is not evidence. Pending requests never change procurement/receipt/Unit coverage.
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
revoke all on function public.operation_cancel_po(text,text,jsonb) from public,anon;
grant execute on function public.operation_cancel_po(text,text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.purchasing_po_line_free_units(p_po_line_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when pl.id is null or po.status is distinct from 'open' then 0
    -- A Manual Purchase line buys for that request; only a recorded
    -- `additional_stock` request leaves its goods for anyone.
    when pl.purchase_request_id is not null
         and (select r.fulfilment_intent from purchase_requests r
               where r.id = pl.purchase_request_id) is distinct from 'additional_stock'
      then 0
    when exists(select 1 from public.purchase_demands d join public.purchase_requests r on r.id=d.request_id
      where d.id=pl.demand_id and r.fulfilment_intent is distinct from 'additional_stock')
      or exists(select 1 from public.po_line_sources s join public.purchase_demands d on d.id=s.purchase_demand_id join public.purchase_requests r on r.id=d.request_id
        where s.po_line_id=pl.id and r.fulfilment_intent is distinct from 'additional_stock') then 0
    when pl.identity_mode='quantity' then greatest(0,pl.qty-public._purchasing_po_line_cancelled_qty(pl.id)-coalesce(pl.received_qty,0)-greatest(0,
      coalesce((select sum(s.qty)::integer from public.po_line_sources s where s.po_line_id=pl.id and s.order_id is not null),0)-coalesce(pl.received_qty,0)))
    else greatest(0,
      (select count(*)::int
         from ops_stock_items i
        where i.po_line_id = pl.id
          and i.status = 'incoming'
          and coalesce(i.identity_scope, 'unit') = 'unit'
          and i.reserved_order_line_id is null
          and i.reserved_purchase_demand_id is null)
      -- Customer lineage still waiting: what the line was raised for, less
      -- what has already arrived (a receipt answers its customers first).
      - greatest(0,
          coalesce((select sum(greatest(0, s.qty))::int
                      from po_line_sources s
                     where s.po_line_id = pl.id and s.order_id is not null), 0)
          - coalesce(pl.received_qty, 0)))
  end
  from (select p_po_line_id as id) k
  left join purchase_order_lines pl on pl.id = k.id
  left join purchase_orders po on po.id = pl.po_id;
$function$
;

CREATE OR REPLACE FUNCTION public.purchasing_po_document(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     app_role;
  v_po       purchase_orders;
  v_dest     purchasing_destinations;
  v_sup      suppliers;
  v_address  text;
  v_sup_addr text;
  v_lines    jsonb;
  v_issuer   text;
  v_missing_destination_name text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' and not exists(select 1 from public.po_goods_cancellation_events where po_id=p_po_id and kind='effective' and applied_po_version=v_po.version) then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from purchasing_destinations where id = v_po.destination_id;
  select * into v_sup from suppliers where id = v_po.supplier_id;

  if v_dest.warehouse_id is not null then
    select address into v_address from warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;

  if v_address is null or coalesce(v_address, '') !~ '[^[:space:]]' then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  -- One PO may carry several destinations. Every line must still resolve to a
  -- real printable address before the formal document can leave Carres.
  select coalesce(d.name, 'the recorded Deliver To')
    into v_missing_destination_name
    from purchase_order_lines l
    left join purchasing_destinations d
      on d.id = coalesce(l.destination_id, v_po.destination_id)
    left join warehouses w on w.id = d.warehouse_id
   where l.po_id = p_po_id
     and nullif(btrim(case when d.warehouse_id is not null then w.address else d.address end), '') is null
   limit 1;

  if found then
    raise exception 'no address on file for %', v_missing_destination_name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  v_sup_addr := nullif(btrim(coalesce(v_sup.address, '')), '');

  -- audit_log's one timestamp is `occurred_at` (0001). This was incorrectly
  -- spelled `created_at` in 0383, making every document call fail before any
  -- payload could be returned.
  select actor_text into v_issuer
    from audit_log
   where ref = p_po_id and action like 'Created PO %'
   order by occurred_at asc
   limit 1;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'cancelled_qty',public._purchasing_po_line_cancelled_qty(l.id),
               'cancelled_unit_codes',(select coalesce(jsonb_agg(i.unit_code order by i.unit_code),'[]') from public.ops_stock_items i where i.po_line_id=l.id and exists(select 1 from public.po_goods_cancellation_events ce cross join lateral jsonb_array_elements(ce.scope) cl where ce.kind='effective' and cl->>'lineId'=l.id::text and cl->'unitIds' @> jsonb_build_array(i.id))),
               'received_qty',l.received_qty,
               'pending_qty',greatest(0,l.qty-l.received_qty-public._purchasing_po_line_cancelled_qty(l.id)),
               'unit',        'pc',
               'destination', (
                 select jsonb_build_object(
                          'name', d.name,
                          'address', case when d.warehouse_id is not null then w.address else d.address end
                        )
                   from purchasing_destinations d
                   left join warehouses w on w.id = d.warehouse_id
                  where d.id = coalesce(l.destination_id, v_po.destination_id)
               ),
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               ),
               -- 0443 · the Units THIS LINE was born with, by immutable line
               -- binding — never `(po_no, sku)`. Retired (voided) Units of a
               -- reduced revision stay off the current paper; a quantity
               -- line prints none because it has none.
               'identity_mode', l.identity_mode,
               'unit_codes', (
                 select coalesce(jsonb_agg(si.unit_code order by si.unit_code), '[]'::jsonb)
                   from ops_stock_items si
                  where si.po_line_id = l.id
                    and si.identity_scope = 'unit'
                    and si.status <> 'voided'
               ),
               'sources', (
                 select coalesce(
                          jsonb_agg(jsonb_build_object('so', s.so, 'qty', s.qty)
                                    order by s.so nulls last),
                          '[]'::jsonb)
                   from po_line_sources s
                  where s.po_line_id = l.id
               )
             ) as x
        from purchase_order_lines l
        left join product_skus ps on ps.sku = l.sku
       where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number',   v_po.id,
    'po_id',       v_po.id,
    'version',     coalesce(v_po.version, 1),
    'issue_date',  to_char(coalesce(v_po.placed_at, now()), 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name',    coalesce(v_sup.name, 'Supplier'),
      'address', v_sup_addr,
      'contact', v_sup.contact
    ),
    'destination', jsonb_build_object(
      'name',    v_dest.name,
      'address', v_address
    ),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.official_delivery_date,
    'so_refs',     to_jsonb(coalesce(v_po.so_refs, array[]::int[])),
    'issued_by',   v_issuer,
    'lines',       v_lines,
    'terms',       null
  );
end;
$function$
;
revoke all on function public.purchasing_po_document(text) from public,anon;
grant execute on function public.purchasing_po_document(text) to authenticated;

CREATE OR REPLACE FUNCTION public.purchasing_confirm_po_sent(p_po_id text, p_expected_version integer, p_channel text, p_recipient text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_version integer;
  v_status text;
  v_recipient text := btrim(coalesce(p_recipient, ''));
  v_send_id uuid;
  v_who jsonb;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not public.purchasing_actor_may_issue(v_actor) then
    raise exception 'not_po_duty' using errcode = 'P0001', detail = 'not_po_duty';
  end if;
  v_who := public.purchasing_po_actor();

  if p_channel not in ('whatsapp', 'email', 'print') then
    raise exception 'invalid_channel' using errcode = '22023';
  end if;
  if v_recipient = '' then
    raise exception 'recipient_required' using errcode = '22023';
  end if;
  if p_expected_version is null then
    raise exception 'expected_version_required' using errcode = '22023';
  end if;

  select version, status::text into v_version, v_status
  from public.purchase_orders
  where id = p_po_id
  for update;

  if not found then
    raise exception 'po_not_found' using errcode = 'P0002';
  end if;
  if v_status = 'cancelled' and not exists(select 1 from public.po_goods_cancellation_events where po_id=p_po_id and kind='effective' and applied_po_version=v_version) then
    raise exception 'po_not_issuable' using errcode = 'P0001';
  end if;

  if coalesce(v_version, 1) <> p_expected_version then
    raise exception 'stale_po_version: saw %, current is %', p_expected_version, coalesce(v_version, 1)
      using errcode = 'P0001', detail = 'stale_po_version';
  end if;

  -- 0430 · WHAT the supplier received, not only THAT something left. The first
  -- confirmed send of a version keeps the document authority's own payload; a
  -- resend of the same version changes nothing, so the recorded facts of a
  -- version can never drift between two sends of it.
  insert into public.po_version_documents (po_id, po_version, document, created_by)
  values (p_po_id, coalesce(v_version, 1), public.purchasing_po_document(p_po_id), v_actor)
  on conflict (po_id, po_version) do nothing;

  insert into public.po_sends (
    po_id, channel, note, sent_by, kind, recipient, po_version,
    duty_user_id, acting_user_id
  )
  values (
    p_po_id, p_channel, nullif(btrim(coalesce(p_note, '')), ''), v_actor,
    'confirmed_sent', v_recipient, coalesce(v_version, 1),
    nullif(v_who->>'normal_user_id', '')::uuid,
    nullif(v_who->>'acting_user_id', '')::uuid
  )
  returning id into v_send_id;

  insert into public.po_history (po_id, text, by_user_id)
  values (
    p_po_id,
    format('Version %s sent to %s by %s', coalesce(v_version, 1), v_recipient, p_channel),
    v_actor
  );

  return jsonb_build_object(
    'send_id', v_send_id,
    'po_id', p_po_id,
    'po_version', coalesce(v_version, 1),
    'channel', p_channel,
    'recipient', v_recipient
  );
end;
$function$
;
revoke all on function public.purchasing_confirm_po_sent(text,integer,text,text,text) from public,anon;
grant execute on function public.purchasing_confirm_po_sent(text,integer,text,text,text) to authenticated;

create or replace function public._purchasing_cancelled_scope_receipt_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $receipt_guard$
begin
 if tg_table_name='purchase_order_lines' then
  if new.received_qty>old.received_qty and new.received_qty>new.qty-public._purchasing_po_line_cancelled_qty(new.id) then
   raise exception 'Cancelled goods require the existing receipt discrepancy path' using errcode='22023',detail='cancelled_scope_arrival_requires_discrepancy'; end if;
 else
  if old.status='voided' and new.status in('free','reserved','sold','incoming') and exists(
   select 1 from public.po_goods_cancellation_events e cross join lateral jsonb_array_elements(e.scope) l where e.kind='effective' and l->'unitIds' @> jsonb_build_array(old.id)) then
   raise exception 'Retired cancelled Unit cannot become available' using errcode='22023',detail='cancelled_scope_arrival_requires_discrepancy'; end if;
 end if;
 return new;
end;
$receipt_guard$;
revoke all on function public._purchasing_cancelled_scope_receipt_guard() from public,anon,authenticated;
drop trigger if exists purchasing_cancelled_line_receipt_guard on public.purchase_order_lines;
create trigger purchasing_cancelled_line_receipt_guard before update of received_qty on public.purchase_order_lines for each row execute function public._purchasing_cancelled_scope_receipt_guard();
drop trigger if exists purchasing_cancelled_unit_receipt_guard on public.ops_stock_items;
create trigger purchasing_cancelled_unit_receipt_guard before update of status on public.ops_stock_items for each row execute function public._purchasing_cancelled_scope_receipt_guard();

create or replace function public.purchasing_po_cancellations(p_po_ids text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $batch_cancel_read$
begin
 if public.app_role() is null or public.app_role() not in('operation','principal','finance') then raise exception 'not permitted' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('poId',p.id,'facts',public.purchasing_po_cancellation_facts(p.id)) order by p.id) from public.purchase_orders p where p.id=any(p_po_ids) and exists(select 1 from public.po_goods_cancellation_events e where e.po_id=p.id)),'[]'::jsonb);
end;
$batch_cancel_read$;
revoke all on function public.purchasing_po_cancellations(text[]) from public,anon;
grant execute on function public.purchasing_po_cancellations(text[]) to authenticated;

create or replace function public._purchasing_po_line_pending_qty(p_line uuid)
returns integer language sql stable set search_path=public,pg_temp as $pending_qty$
 select greatest(0,l.qty-l.received_qty-public._purchasing_po_line_cancelled_qty(l.id)) from public.purchase_order_lines l where l.id=p_line;
$pending_qty$;
revoke all on function public._purchasing_po_line_pending_qty(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.purchasing_record_supplier_answers(p_po_id text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po public.purchase_orders; v_role public.app_role; v_who jsonb; v_version integer;
  v_group uuid := gen_random_uuid(); v_files text[]; v_file text; v_evidence text;
  v_line jsonb; v_pol public.purchase_order_lines; v_still integer; v_kind text;
  v_batch jsonb; v_batches jsonb; v_total integer; v_date date; v_answer text; v_reason text;
  v_remarks text; v_previous date; v_id uuid; v_rows integer := 0; v_confirmations integer := 0;
  v_do_no text; v_do_file text; v_touched integer; v_line_out jsonb := '[]'::jsonb;
  v_last_delay record; v_arrival record; v_summary text := '';
begin
  v_role := public.purchasing_supplier_call_gate();
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true or auth.uid() is null then
    raise exception 'Only Operation staff may record the supplier answer.' using errcode='42501', detail='forbidden';
  end if;
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase Order not found.' using errcode='22023', detail='po_not_found'; end if;

  v_version := nullif(p->>'poVersion','')::integer;
  if v_version is distinct from coalesce(v_po.version, 1) then
    raise exception 'Open the current PO and record the supplier answer.' using errcode='22023', detail='stale_po_version';
  end if;
  if v_po.status <> 'open' or not exists (select 1 from public.purchase_order_lines where po_id = v_po.id and public._purchasing_po_line_pending_qty(id)>0) then
    raise exception 'This PO has no goods left to deliver.' using errcode='22023', detail='po_not_open';
  end if;
  if not exists (select 1 from public.po_sends where po_id = v_po.id and kind = 'confirmed_sent' and po_version = v_version) then
    raise exception 'Record the current PO PDF sent before the supplier answer.' using errcode='22023', detail='po_not_sent';
  end if;

  -- Evidence: every file must be this PO's own upload. The Supplier DO file
  -- counts as evidence when it is the only file.
  v_do_no := case when coalesce(p#>>'{supplierDo,number}', '') ~ '[^[:space:]]' then btrim(p#>>'{supplierDo,number}') end;
  v_do_file := case when coalesce(p#>>'{supplierDo,file}', '') ~ '[^[:space:]]' then btrim(p#>>'{supplierDo,file}') end;
  if (v_do_no is null) <> (v_do_file is null) then
    raise exception 'Record the Supplier DO number and upload the Supplier DO.' using errcode='22023', detail='supplier_do_incomplete';
  end if;
  if v_do_no is not null and length(v_do_no) not between 3 and 50 then
    raise exception 'The Supplier DO number is 3 to 50 characters.' using errcode='22023', detail='supplier_do_invalid';
  end if;
  select coalesce(array_agg(x order by ord), '{}') into v_files
    from (select distinct on (x) x, ord
            from (select v_do_file as x, 0 as ord
                  union all
                  select btrim(e.value), e.ordinality
                    from jsonb_array_elements_text(coalesce(p->'evidence','[]'::jsonb)) with ordinality e(value, ordinality)) all_files
           where coalesce(x, '') ~ '[^[:space:]]'
           order by x, ord) distinct_files;
  if cardinality(v_files) = 0 then
    raise exception 'Add the WhatsApp screenshot of the supplier''s answer.' using errcode='22023', detail='screenshot_required';
  end if;
  foreach v_file in array v_files loop
    if left(v_file, length(p_po_id)+1) is distinct from p_po_id || '/'
       or not exists (select 1 from storage.objects where bucket_id='delivery-orders' and name=v_file) then
      raise exception 'A file was not uploaded for this PO.' using errcode='22023', detail='screenshot_not_found';
    end if;
  end loop;
  v_evidence := v_files[1];

  if jsonb_typeof(p->'lines') is distinct from 'array' then
    raise exception 'Record the answer per goods line.' using errcode='22023', detail='invalid_input';
  end if;
  if v_do_no is null and not exists (select 1 from jsonb_array_elements(p->'lines') l where coalesce(l->>'answer','no_change') <> 'no_change') then
    raise exception 'Answer at least one goods line or record the Supplier DO.' using errcode='22023', detail='nothing_to_record';
  end if;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    select * into v_pol from public.purchase_order_lines
      where id = nullif(v_line->>'poLineId','')::uuid and po_id = v_po.id;
    if not found then
      raise exception 'That goods line is not on this PO.' using errcode='22023', detail='po_line_not_found';
    end if;
    v_still := public._purchasing_po_line_pending_qty(v_pol.id);
    if v_still <= 0 then
      raise exception 'All of this line was received.' using errcode='22023', detail='line_all_received';
    end if;
    v_kind := v_line->>'answer';
    if v_kind = 'no_change' then continue; end if;
    if v_kind not in ('confirmed','new_date','split') then
      raise exception 'Choose the supplier''s answer for each line.' using errcode='22023', detail='invalid_input';
    end if;

    -- The batches: one for `confirmed` / `new_date`, several for `split`.
    if v_kind = 'split' then
      v_batches := coalesce(v_line->'batches', '[]'::jsonb);
      if jsonb_typeof(v_batches) <> 'array' or jsonb_array_length(v_batches) = 0 then
        raise exception 'Add at least one delivery date to the split.' using errcode='22023', detail='batches_required';
      end if;
      select coalesce(sum(nullif(b->>'qty','')::integer), 0) into v_total from jsonb_array_elements(v_batches) b;
      if v_total <> v_still then
        raise exception 'The batches must total what is still to deliver.' using errcode='22023', detail='batch_total_mismatch';
      end if;
    elsif v_kind = 'confirmed' then
      -- Confirmed = the line's CURRENT expected date (its newest answer, else the
      -- original PO Delivery Date) stands. The stored row carries the ladder's
      -- own classification; a re-confirmed delay keeps its reason.
      select a.arrival, a.answer, a.reason into v_arrival
        from public.purchasing_po_expected_arrivals(p_po_id) a where a.po_line_id = v_pol.id
        order by a.arrival desc limit 1;
      if v_arrival.arrival is null then
        raise exception 'This line has no date to confirm yet.' using errcode='22023', detail='new_date_required';
      end if;
      v_batches := jsonb_build_array(jsonb_build_object('qty', v_still, 'date', v_arrival.arrival::text,
        'reason', v_arrival.reason, 'remarks', v_line->>'remarks'));
    else
      if coalesce(v_line->>'date','') = '' then
        raise exception 'Record the supplier delivery date.' using errcode='22023', detail='new_date_required';
      end if;
      v_batches := jsonb_build_array(jsonb_build_object('qty', v_still, 'date', v_line->>'date',
        'reason', v_line->>'reason', 'remarks', v_line->>'remarks'));
    end if;

    select coalesce(new_date, about_date) into v_previous
      from public.po_supplier_promises
     where po_id = p_po_id and kind = 'tomorrow_delivery' and po_version = v_version
       and (po_line_id = v_pol.id or po_line_id is null)
     order by (po_line_id is not null) desc, recorded_at desc, id desc limit 1;

    for v_batch in select * from jsonb_array_elements(v_batches) loop
      v_date := nullif(v_batch->>'date','')::date;
      if v_date is null then
        raise exception 'Record the supplier delivery date.' using errcode='22023', detail='new_date_required';
      end if;
      if nullif(v_batch->>'qty','')::integer is null or (v_batch->>'qty')::integer <= 0 then
        raise exception 'A batch needs a quantity.' using errcode='22023', detail='batch_qty_invalid';
      end if;
      v_answer := case
        when v_po.official_delivery_date is null then 'reported'
        when v_date = v_po.official_delivery_date then 'confirmed'
        when v_date < v_po.official_delivery_date then 'earlier'
        else 'delayed' end;
      v_reason := case when coalesce(v_batch->>'reason', '') ~ '[^[:space:]]' then btrim(v_batch->>'reason') end;
      v_remarks := nullif(btrim(coalesce(v_batch->>'remarks', '')), '');
      if v_answer = 'delayed' then
        if v_reason is null then
          -- A re-confirmed delay keeps the reason it was recorded with.
          select p2.reason, p2.remarks into v_last_delay from public.po_supplier_promises p2
           where p2.po_id = p_po_id and p2.kind = 'tomorrow_delivery' and p2.answer = 'delayed'
             and p2.po_version = v_version and (p2.po_line_id = v_pol.id or p2.po_line_id is null)
           order by (p2.po_line_id is not null) desc, p2.recorded_at desc, p2.id desc limit 1;
          v_reason := v_last_delay.reason; v_remarks := coalesce(v_remarks, v_last_delay.remarks);
        end if;
        if not (coalesce(v_reason,'') = any (public.purchasing_supplier_delay_reasons())) then
          raise exception 'Choose why the supplier moved the date.' using errcode='22023', detail='reason_required';
        end if;
        if v_reason = 'Other' and coalesce(v_remarks, '') !~ '[^[:space:]]' then
          raise exception 'Write why the supplier moved the date.' using errcode='22023', detail='other_note_required';
        end if;
      else
        v_reason := null;
      end if;

      insert into public.po_supplier_promises(po_id, po_line_id, kind, answer, about_date, about_qty, previous_date, new_date,
        reason, remarks, recorded_by, po_version, channel, recipient, evidence, reported_by, reported_at, answer_group)
      values (p_po_id, v_pol.id, 'tomorrow_delivery', v_answer, v_po.official_delivery_date, (v_batch->>'qty')::integer,
        v_previous, v_date, v_reason, v_remarks, auth.uid(), v_version, p->>'channel', btrim(p->>'recipient'),
        v_evidence, btrim(p->>'reportedBy'), (p->>'reportedAt')::timestamptz, v_group)
      returning id into v_id;
      v_rows := v_rows + 1;
      foreach v_file in array v_files loop
        insert into public.po_supplier_answer_screenshots(answer_id, path, recorded_by)
          values (v_id, v_file, auth.uid()) on conflict (answer_id, path) do nothing;
      end loop;

      -- A `confirmed` line IS the day-before confirmation for that exact date
      -- and the PO's own Warehouse (§5.7 completion).
      if v_kind = 'confirmed' and v_po.destination_id is not null then
        insert into public.po_arrival_confirmations (po_id, po_version, for_date, destination_id, kind, evidence,
          channel, recipient, reported_by, reported_at, recorded_by, duty_user_id, acting_user_id)
        values (p_po_id, v_version, v_date, v_po.destination_id, 'supplier_confirmation', v_files,
          p->>'channel', btrim(p->>'recipient'), btrim(p->>'reportedBy'), (p->>'reportedAt')::timestamptz, auth.uid(),
          nullif(v_who->>'normal_user_id','')::uuid, nullif(v_who->>'acting_user_id','')::uuid);
        v_confirmations := v_confirmations + 1;
      end if;
      v_summary := v_summary || format('%s%s ×%s · %s%s', case when v_summary = '' then '' else ' · ' end,
        v_pol.sku, (v_batch->>'qty')::integer, v_date,
        case v_answer when 'delayed' then format(' · Delayed · %s', v_reason) when 'earlier' then ' · Earlier' else '' end);
    end loop;
    v_line_out := v_line_out || jsonb_build_object('poLineId', v_pol.id, 'batches', v_batches);
  end loop;

  -- `Supplier DO received`: the PO's own DO fields, written once, and the
  -- day-before evidence for EVERY expected arrival still open.
  if v_do_no is not null then
    update public.purchase_orders
       set do_number = v_do_no, do_file_path = v_do_file, do_uploaded_at = now(), do_uploaded_by = auth.uid()
     where id = p_po_id;
    if v_po.destination_id is not null then
      for v_arrival in select distinct a.arrival from public.purchasing_po_expected_arrivals(p_po_id) a where a.arrival is not null loop
        insert into public.po_arrival_confirmations (po_id, po_version, for_date, destination_id, kind, supplier_do_no, evidence,
          channel, recipient, reported_by, reported_at, recorded_by, duty_user_id, acting_user_id)
        values (p_po_id, v_version, v_arrival.arrival, v_po.destination_id, 'supplier_do', v_do_no, v_files,
          p->>'channel', btrim(p->>'recipient'), btrim(p->>'reportedBy'), (p->>'reportedAt')::timestamptz, auth.uid(),
          nullif(v_who->>'normal_user_id','')::uuid, nullif(v_who->>'acting_user_id','')::uuid);
        v_confirmations := v_confirmations + 1;
      end loop;
    end if;
    insert into public.po_history(po_id, text, by_role, by_user_id)
      values (p_po_id, format('Supplier DO %s recorded · PO V%s', v_do_no, v_version), v_role, auth.uid());
  end if;

  if v_rows > 0 then
    v_touched := public.purchasing_project_line_etas(p_po_id);
    insert into public.po_history(po_id, text, by_role, by_user_id)
      values (p_po_id, format('Supplier answer recorded · PO V%s · %s', v_version, v_summary), v_role, auth.uid());
  end if;
  insert into public.audit_log(role, actor_text, action, ref)
    values (v_role, (select name from public.app_users where id = auth.uid()), 'Supplier answer recorded', p_po_id);

  return jsonb_build_object('po_id', p_po_id, 'answer_group', v_group, 'answers', v_rows,
    'confirmations', v_confirmations, 'supplier_do', v_do_no, 'orders_touched', coalesce(v_touched, 0),
    'lines', v_line_out, 'evidence', cardinality(v_files));
end;
$function$
;
revoke all on function public.purchasing_record_supplier_answers(text,jsonb) from public,anon,authenticated;
grant execute on function public.purchasing_record_supplier_answers(text,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.purchasing_require_reply_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_po public.purchase_orders; v_who jsonb; v_line public.purchase_order_lines;
begin
  if new.kind <> 'tomorrow_delivery' then return new; end if;
  v_who := public.purchasing_supplier_reply_actor();
  if (v_who->>'allowed')::boolean is not true then
    raise exception 'Only Operation staff may record the supplier answer.' using errcode='42501';
  end if;
  select * into v_po from public.purchase_orders where id=new.po_id for update;
  if new.po_version is distinct from coalesce(v_po.version,1) then
    raise exception 'Open the current PO and record the supplier answer.' using errcode='22023',detail='stale_po_version';
  end if;
  if v_po.status <> 'open' or not exists(select 1 from public.purchase_order_lines
    where po_id=v_po.id and public._purchasing_po_line_pending_qty(id)>0) then
    raise exception 'This PO has no goods left to deliver.' using errcode='22023',detail='po_not_open';
  end if;
  if not exists(select 1 from public.po_sends where po_id=v_po.id
    and kind='confirmed_sent' and po_version=new.po_version) then
    raise exception 'Record the current PO PDF sent before the supplier answer.' using errcode='22023',detail='po_not_sent';
  end if;
  if new.po_line_id is not null then
    select * into v_line from public.purchase_order_lines where id = new.po_line_id and po_id = v_po.id;
    if not found then
      raise exception 'That goods line is not on this PO.' using errcode='22023',detail='po_line_not_found';
    end if;
    if public._purchasing_po_line_pending_qty(v_line.id) <= 0 then
      raise exception 'All of this line was received.' using errcode='22023',detail='line_all_received';
    end if;
    if new.about_qty is null or new.about_qty <= 0 or new.about_qty > public._purchasing_po_line_pending_qty(v_line.id) then
      raise exception 'A batch cannot exceed what is still to deliver.' using errcode='22023',detail='batch_qty_invalid';
    end if;
  end if;
  if new.answer is null or new.new_date is null
    or new.answer not in ('confirmed','earlier','delayed','reported')
    or (new.answer='reported' and v_po.official_delivery_date is not null)
    or (new.answer<>'reported' and (
          v_po.official_delivery_date is null
          or new.about_date is distinct from v_po.official_delivery_date
          or (new.answer='confirmed' and new.new_date <> v_po.official_delivery_date)
          or (new.answer='earlier'   and new.new_date >= v_po.official_delivery_date)
          or (new.answer='delayed'   and new.new_date <= v_po.official_delivery_date)))
    or (new.answer='delayed' and not (coalesce(new.reason,'') = any (public.purchasing_supplier_delay_reasons())))
    or (new.answer='delayed' and new.reason='Other' and coalesce(new.remarks, '') !~ '[^[:space:]]')
    or (new.answer<>'delayed' and new.reason is not null) then
    raise exception 'Record the supplier delivery date and reason.' using errcode='22023',detail='invalid_input';
  end if;
  if new.channel is null or new.channel not in ('whatsapp','email','phone','in_person')
    or coalesce(new.recipient, '') !~ '[^[:space:]]' or coalesce(new.evidence, '') !~ '[^[:space:]]'
    or coalesce(new.reported_by, '') !~ '[^[:space:]]' or new.reported_at is null
    or left(new.evidence,length(new.po_id)+1) is distinct from new.po_id || '/'
    or not exists(select 1 from storage.objects where bucket_id='delivery-orders' and name=new.evidence)
    or length(new.recipient)>200 or length(new.reported_by)>200 or length(new.evidence)>2000
    or length(new.remarks)>500
    or new.reported_at < (select min(sent_at) from public.po_sends where po_id=v_po.id and kind='confirmed_sent' and po_version=new.po_version)
    or new.reported_at > now() or new.recorded_by is distinct from auth.uid()
    or auth.uid() is null then
    raise exception 'Record the reply channel, recipient, evidence, reporter and time.' using errcode='22023',detail='reply_evidence_required';
  end if;
  new.duty_user_id := nullif(v_who->>'normal_user_id','')::uuid;
  new.acting_user_id := nullif(v_who->>'acting_user_id','')::uuid;
  new.recorded_at:=clock_timestamp();
  return new;
end;
$function$
;
revoke all on function public.purchasing_require_reply_evidence() from public,anon,authenticated;
grant execute on function public.purchasing_require_reply_evidence() to authenticated;

-- Existing Receiving writer/validator consume the same effective pending scope.
-- Source customer need/thread satisfaction still follows actual receipts; no
-- cancellation is mistaken for goods received. Existing signatures/ACL retained.
CREATE OR REPLACE FUNCTION public.warehouse_receipt_validate_lines(p_po_id text, p_lines jsonb, p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_line jsonb; v_line_id uuid; v_recv int; v_damaged int; v_wrong int;
  v_type text; v_pol purchase_order_lines; v_reportable int;
  v_counted int := 0; v_clean jsonb := '[]'::jsonb;
  v_units jsonb; v_unit jsonb; v_ucode text; v_uitem ops_stock_items;
  v_outcome text; v_u_recv int; v_u_dmg int; v_u_wrong int; v_u_notrecv int;
  v_seen text[]; v_clean_units jsonb; v_has_units boolean;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_recv    := coalesce(nullif(v_line->>'received_now', '')::int, 0);
    v_damaged := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    if v_line_id is null then
      raise exception 'invalid line: missing id' using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_recv < 0 or v_damaged < 0 or v_wrong < 0 then
      raise exception 'invalid line: negative quantity' using errcode = '22023', detail = 'invalid_line';
    end if;
    select * into v_pol from purchase_order_lines where id = v_line_id and po_id = p_po_id;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;
    if v_pol.identity_mode is null then
      raise exception 'line % has no stock identity mode — set it for the SKU in Catalog', v_pol.sku
        using errcode = 'P0001', detail = 'line_identity_mode_missing';
    end if;
    v_reportable := public._purchasing_po_line_pending_qty(v_pol.id);

    v_units := v_line->'units';
    v_has_units := v_units is not null and jsonb_typeof(v_units) = 'array'
                   and jsonb_array_length(v_units) > 0;
    v_clean_units := '[]'::jsonb;

    -- ⭐ 0444 · THE MODE DECIDES THE SHAPE. Neither path can be forced by the
    -- shape of the submission.
    if v_pol.identity_mode = 'quantity' then
      if v_has_units then
        raise exception 'line % is counted by quantity — it has no Unit IDs to scan', v_pol.sku
          using errcode = 'P0001', detail = 'quantity_line_takes_no_units';
      end if;
      if v_recv + v_damaged + v_wrong > v_reportable then
        raise exception 'line % counts % units but the PO still owes %',
                        v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
          using errcode = 'P0001', detail = 'line_over_reported';
      end if;
    else
      if not v_has_units then
        raise exception 'line % is traced by Unit ID — record one result for each expected Unit', v_pol.sku
          using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
      end if;
      -- Per-Unit outcomes. The unit list and the quantities are ONE fact: the
      -- quantities are re-derived from the outcomes so the two can never
      -- disagree.
      v_seen := '{}'::text[];
      v_u_recv := 0; v_u_dmg := 0; v_u_wrong := 0; v_u_notrecv := 0;
      for v_unit in select * from jsonb_array_elements(v_units) loop
        v_ucode := public.normalise_unit_id(coalesce(v_unit->>'unit_code', ''));
        v_outcome := coalesce(v_unit->>'outcome', '');
        if v_outcome not in ('received','received_with_issue','not_received') then
          raise exception 'unit % has no valid outcome', coalesce(v_unit->>'unit_code','?')
            using errcode = '22023', detail = 'unit_outcome_invalid';
        end if;
        select * into v_uitem from ops_stock_items
         where public.normalise_unit_id(unit_code) = v_ucode
           and identity_scope = 'unit';
        if not found then
          raise exception 'Unit % is not a Carres Unit ID', coalesce(v_unit->>'unit_code','?')
            using errcode = 'P0001', detail = 'unit_unknown';
        end if;
        if v_uitem.po_no is distinct from p_po_id then
          -- A Unit on another PO/CO or unknown to this source.
          raise exception 'Unit % does not belong to %', v_uitem.unit_code, p_po_id
            using errcode = 'P0001', detail = 'unit_not_on_this_po';
        end if;
        if v_uitem.po_line_id is distinct from v_line_id then
          raise exception 'Unit % belongs to another line of %, not %', v_uitem.unit_code, p_po_id, v_pol.sku
            using errcode = 'P0001', detail = 'unit_not_on_this_line';
        end if;
        if v_uitem.unit_code = any(v_seen) then
          raise exception 'Unit % was scanned twice', v_uitem.unit_code
            using errcode = 'P0001', detail = 'unit_scanned_twice';
        end if;
        v_seen := v_seen || v_uitem.unit_code;
        if v_uitem.status <> 'incoming' then
          raise exception 'Unit % was already received (session for %)', v_uitem.unit_code, p_po_id
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
        if v_outcome = 'received' then v_u_recv := v_u_recv + 1;
        elsif v_outcome = 'not_received' then v_u_notrecv := v_u_notrecv + 1;
        else
          if coalesce(v_unit->>'issue_kind', '') = 'wrong_item' then v_u_wrong := v_u_wrong + 1;
          else v_u_dmg := v_u_dmg + 1;
          end if;
        end if;
        v_clean_units := v_clean_units || jsonb_build_array(jsonb_build_object(
          'stock_item_id', v_uitem.id,
          'unit_code', v_uitem.unit_code,
          'outcome', v_outcome,
          'issue_kind', case when v_outcome = 'received_with_issue'
                             then coalesce(nullif(v_unit->>'issue_kind',''), 'damaged')
                             else null end,
          'note', nullif(btrim(coalesce(v_unit->>'note','')), '')));
      end loop;
      -- The scanned outcomes ARE the quantities (Expected = Received + Not
      -- received; Received with issue is a subset of Received, split by kind).
      v_recv := v_u_recv; v_damaged := v_u_dmg; v_wrong := v_u_wrong;
      if v_recv + v_damaged + v_wrong > v_reportable then
        raise exception 'line % scans % received units but the PO still owes %',
                        v_pol.sku, v_recv + v_damaged + v_wrong, v_reportable
          using errcode = 'P0001', detail = 'line_over_reported';
      end if;
    end if;

    if v_damaged > 0 then
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'damaged_photos', p_uid)) = 0 then
        raise exception 'damaged units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'damaged_photo_required';
      end if;
    end if;
    if v_wrong > 0 then
      v_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_type is null then
        raise exception 'wrong-item units on % need a claim type', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_required';
      end if;
      if not public.supplier_claim_type_allowed(public.claim_product_category(v_pol.sku), v_type) then
        raise exception 'claim type % is not offered for %', v_type, v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_type_invalid';
      end if;
      if jsonb_array_length(public.supplier_claim_photo_entries(v_line->'wrong_item_photos', p_uid)) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_pol.sku
          using errcode = 'P0001', detail = 'wrong_item_photo_required';
      end if;
    end if;
    v_counted := v_counted + v_recv + v_damaged + v_wrong;
    if v_recv + v_damaged + v_wrong > 0
       or jsonb_array_length(v_clean_units) > 0 then
      v_clean := v_clean || jsonb_build_array(jsonb_build_object(
        'id', v_line_id, 'sku', v_pol.sku, 'received_now', v_recv,
        'damaged_qty', v_damaged, 'wrong_item_qty', v_wrong,
        'wrong_item_claim_type', case when v_wrong > 0 then v_type else null end,
        'damaged_photos', coalesce(v_line->'damaged_photos', '[]'::jsonb),
        'wrong_item_photos', coalesce(v_line->'wrong_item_photos', '[]'::jsonb),
        'units', v_clean_units));
    end if;
  end loop;
  if v_counted = 0 then
    raise exception 'count at least one unit before sending this'
      using errcode = 'P0001', detail = 'nothing_counted';
  end if;
  return jsonb_build_object('lines', v_clean, 'counted', v_counted);
end;
$function$;

CREATE OR REPLACE FUNCTION public.operation_receive_po_with_do(p_po_id text, p_do_file_path text, p_do_number text, p_lines jsonb, p_actual_site_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po                 purchase_orders;
  v_role               app_role;
  v_uid                uuid;
  v_actor              text;
  v_was_relocated      boolean;
  v_is_own             boolean := false;
  v_posts_stock        boolean := false;
  v_supplier_name      text;
  v_line               jsonb;
  v_line_id            uuid;
  v_received_qty       int;
  v_damaged_add        int;
  v_wrong_add          int;
  v_damaged_total      int := 0;
  v_wrong_total        int := 0;
  v_claims_created     int := 0;
  v_damaged_claim      uuid;
  v_wrong_claim        uuid;
  v_category           text;
  v_wrong_type         text;
  v_photos             jsonb;
  v_existing_line      purchase_order_lines;
  v_sku                text;
  v_delta              int;
  v_freed              int;
  v_minted             int;
  v_held               int;
  v_units_held         int := 0;
  v_lines_updated      int := 0;
  v_thread             record;
  v_target_thread_stage operation_stage;
  v_target_sup_status  po_sup_status;
  v_threads_advanced   int := 0;
  v_reserve            record;
  v_thread_satisfied   boolean;
  v_outstanding        int;
  -- 0426 anchors
  v_site               uuid;
  v_recv_ids           uuid[];
  v_dmg_ids            uuid[];
  v_wrong_ids          uuid[];
  v_ownership          text;
  -- 0444
  v_mode               text;
  v_named              int;
  v_rest               int;
begin
  if p_po_id is null or length(btrim(p_po_id)) = 0 then
    raise exception 'p_po_id required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_file_path is null or coalesce(p_do_file_path, '') !~ '[^[:space:]]' then
    raise exception 'p_do_file_path required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_do_number is null or coalesce(p_do_number, '') !~ '[^[:space:]]' then
    raise exception 'p_do_number required' using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'p_lines required (at least one line)' using errcode = '22023', detail = 'invalid_input';
  end if;

  v_uid  := auth.uid();
  v_role := public.app_role();

  if (v_role is null or v_role not in ('operation', 'principal', 'partner')) then
    raise exception 'forbidden: only logistics/principal/partner can receive POs'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_role = 'partner' then
    select * into v_po from purchase_orders
     where id = p_po_id and procurement_partner_id = public.app_partner_id()
     for update;
  else
    select * into v_po from purchase_orders where id = p_po_id for update;
  end if;
  if not found then
    raise exception 'PO not found or not assigned to caller'
      using errcode = '42501', detail = 'po_not_found_or_cross_tenant';
  end if;

  if v_po.status = 'received' then
    raise exception 'PO already fully received'
      using errcode = '22023', detail = 'already_received';
  end if;

  -- 0426 · the Actual Site: where the goods PHYSICALLY landed. It never
  -- rewrites the PO's Deliver To; it decides where the stock consequence
  -- posts. Null = the PO's own booked warehouse, exactly as before.
  if p_actual_site_id is not null and not exists (
    select 1 from warehouses where id = p_actual_site_id
  ) then
    raise exception 'actual site not found' using errcode = '22023', detail = 'actual_site_invalid';
  end if;
  v_site := coalesce(p_actual_site_id, v_po.warehouse_id);

  -- 0426 · consignment: a consignment source's received Units remain
  -- SUPPLIER-OWNED (0366's ownership contract) and receipt creates no
  -- payable — the engine touches no Finance/AP record either way.
  v_ownership := case when v_po.is_consignment then 'supplier_consignment'
                      else 'carres_owned' end;

  v_was_relocated := v_po.sup_status = 'relocated';
  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  -- R4: the per-unit register is Carres-owned scope — read at the PHYSICAL
  -- site (0426), because that is where the units land.
  select (kind = 'own') into v_is_own from warehouses where id = v_site;
  -- P4: goods become Carres stock when they physically land at a Carres
  -- warehouse. Without an Actual Site override that is still the original
  -- rule (destination books into the PO's warehouse); with one, the recorded
  -- physical arrival wins (owner instruction 2026-09-04: valid received
  -- Units enter Inventory at the Actual Site).
  select (pd.warehouse_id is not null and pd.warehouse_id = v_po.warehouse_id)
    into v_posts_stock
    from purchasing_destinations pd
   where pd.id = v_po.destination_id;
  v_posts_stock := coalesce(v_posts_stock, false) or p_actual_site_id is not null;
  v_is_own := coalesce(v_is_own, false);
  select name into v_supplier_name from suppliers where id = v_po.supplier_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := nullif(v_line->>'id', '')::uuid;
    v_received_qty := nullif(v_line->>'received_qty', '')::int;
    v_damaged_add := coalesce(nullif(v_line->>'damaged_qty', '')::int, 0);
    v_wrong_add   := coalesce(nullif(v_line->>'wrong_item_qty', '')::int, 0);
    v_damaged_claim := null;
    v_wrong_claim   := null;

    -- 0426 · the exact Units this line named, split by outcome. Empty arrays
    -- mean a quantity line (governed interchangeable goods) and the original
    -- oldest-first behaviour holds.
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_recv_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received';
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_dmg_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received_with_issue' and u->>'issue_kind' = 'damaged';
    select coalesce(array_agg((u->>'stock_item_id')::uuid), '{}'::uuid[])
      into v_wrong_ids
      from jsonb_array_elements(coalesce(v_line->'units', '[]'::jsonb)) u
     where u->>'outcome' = 'received_with_issue' and u->>'issue_kind' = 'wrong_item';

    if v_line_id is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: id=%, received_qty=%', v_line_id, v_received_qty
        using errcode = '22023', detail = 'invalid_line';
    end if;
    if v_damaged_add < 0 or v_wrong_add < 0 then
      raise exception 'invalid line: damaged_qty=%, wrong_item_qty=%', v_damaged_add, v_wrong_add
        using errcode = '22023', detail = 'invalid_line';
    end if;

    select * into v_existing_line from purchase_order_lines
     where id = v_line_id and po_id = p_po_id for update;
    if not found then
      raise exception 'PO line not found for id=%', v_line_id using errcode = '42P01', detail = 'po_line_not_found';
    end if;

    v_sku := v_existing_line.sku;

    if v_received_qty > v_existing_line.received_qty + public._purchasing_po_line_pending_qty(v_line_id) then
      raise exception 'over-received: % > uncancelled commitment %', v_received_qty, v_existing_line.received_qty + public._purchasing_po_line_pending_qty(v_line_id)
        using errcode = 'P0001', detail = 'over_received';
    end if;

    if v_received_qty + v_damaged_add + v_wrong_add > v_existing_line.received_qty + public._purchasing_po_line_pending_qty(v_line_id) then
      raise exception 'reported % units on a line of % (received % + damaged % + wrong %)',
                      v_received_qty + v_damaged_add + v_wrong_add, v_existing_line.received_qty + public._purchasing_po_line_pending_qty(v_line_id),
                      v_received_qty, v_damaged_add, v_wrong_add
        using errcode = 'P0001', detail = 'report_exceeds_ordered';
    end if;

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    -- ⭐ 0444 · THE MODE DECIDES, AT THE ENGINE TOO. A direct caller cannot
    -- take the quantity path for a traceable line by leaving `units` out,
    -- nor name Units against a quantity line. For an exact-unit line the
    -- named outcomes ARE the quantities — the counts must agree exactly.
    v_mode  := v_existing_line.identity_mode;
    v_named := cardinality(v_recv_ids) + cardinality(v_dmg_ids) + cardinality(v_wrong_ids);
    if v_mode is null then
      raise exception 'line % has no stock identity mode — set it for the SKU in Catalog', v_sku
        using errcode = 'P0001', detail = 'line_identity_mode_missing';
    end if;
    if v_mode = 'quantity' and v_named > 0 then
      raise exception 'line % is counted by quantity — it has no Unit IDs to scan', v_sku
        using errcode = 'P0001', detail = 'quantity_line_takes_no_units';
    end if;
    if v_mode = 'exact_unit' then
      if v_named = 0 and (v_delta > 0 or v_damaged_add > 0 or v_wrong_add > 0) then
        raise exception 'line % is traced by Unit ID — record one result for each expected Unit', v_sku
          using errcode = 'P0001', detail = 'exact_unit_line_needs_units';
      end if;
      if cardinality(v_recv_ids) <> v_delta
         or cardinality(v_dmg_ids) <> v_damaged_add
         or cardinality(v_wrong_ids) <> v_wrong_add then
        raise exception 'line % names % received, % damaged and % wrong Units but reports %, % and %',
                        v_sku, cardinality(v_recv_ids), cardinality(v_dmg_ids), cardinality(v_wrong_ids),
                        v_delta, v_damaged_add, v_wrong_add
          using errcode = 'P0001', detail = 'unit_outcomes_mismatch';
      end if;
      -- Every named Unit must be THIS line's, still incoming.
      if exists (
        select 1 from unnest(v_recv_ids || v_dmg_ids || v_wrong_ids) as x(id)
          left join ops_stock_items u on u.id = x.id
         where u.id is null or u.po_line_id is distinct from v_line_id
            or u.identity_scope <> 'unit' or u.status <> 'incoming'
      ) then
        raise exception 'a named Unit on % is not an incoming Unit of this line', v_sku
          using errcode = 'P0001', detail = 'unit_not_on_this_line';
      end if;
    end if;

    if v_damaged_add > 0 or v_wrong_add > 0 then
      v_category := public.claim_product_category(v_sku);
    end if;

    if v_damaged_add > 0 then
      v_photos := public.supplier_claim_photo_entries(v_line->'damaged_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'damaged units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        'damaged', v_damaged_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_damaged_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    if v_wrong_add > 0 then
      v_wrong_type := nullif(btrim(coalesce(v_line->>'wrong_item_claim_type', '')), '');
      if v_wrong_type is null then
        raise exception 'wrong-item units on % need a claim type', v_sku
          using errcode = 'P0001', detail = 'claim_type_required';
      end if;
      if not public.supplier_claim_type_allowed(v_category, v_wrong_type) then
        raise exception 'claim type % is not offered for a % item', v_wrong_type, v_category
          using errcode = 'P0001', detail = 'claim_type_invalid';
      end if;
      v_photos := public.supplier_claim_photo_entries(v_line->'wrong_item_photos', v_uid);
      if jsonb_array_length(v_photos) = 0 then
        raise exception 'wrong-item units on % need at least one photo', v_sku
          using errcode = 'P0001', detail = 'claim_evidence_required';
      end if;
      insert into supplier_claims (
        po_id, po_line_id, supplier_id, sku, product_category,
        claim_type, qty, do_number, photos, reported_by
      ) values (
        p_po_id, v_line_id, v_po.supplier_id, v_sku, v_category,
        v_wrong_type, v_wrong_add, btrim(p_do_number), v_photos, v_uid
      )
      returning id into v_wrong_claim;
      v_claims_created := v_claims_created + 1;
    end if;

    update purchase_order_lines
       set received_qty   = v_received_qty,
           damaged_qty    = damaged_qty + v_damaged_add,
           wrong_item_qty = wrong_item_qty + v_wrong_add
     where id = v_line_id;

    v_damaged_total := v_damaged_total + v_damaged_add;
    v_wrong_total   := v_wrong_total + v_wrong_add;

    if v_delta > 0 and v_posts_stock then
      -- 0366 · the unit register is the ONE inventory authority: stock posts by
      -- flipping/minting Units only. `stock_balances` is derived by the rollup
      -- triggers on `ops_stock_items` — a direct write here is refused by
      -- `trg_stock_balances_derived_only` (this replaces the pre-0366 balance
      -- write the previous engine definition still carried).

      -- 0426 · EXACT-UNIT flips first (ERP-ARCHITECTURE §3.4): the scanned
      -- `Received` Units become free at the Actual Site. A quantity line
      -- keeps the oldest-first flip.
      if cardinality(v_recv_ids) > 0 then
        with freed as (
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id = any(v_recv_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_freed from freed;
        if v_freed <> cardinality(v_recv_ids) then
          raise exception 'a scanned unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        -- 0444 · QUANTITY LINE. Units minted for this line before 0442 (fake
        -- IDs the old issue path gave interchangeable goods) are permanent:
        -- they flip oldest-first, by LINE, until none are left. The rest of
        -- the received count becomes ONE bulk register row — counted goods,
        -- no Unit ID. Nothing is minted as a Unit.
        with freed as (
          update ops_stock_items
             set status = 'free', warehouse_id = v_site, updated_at = now(),
                 ownership = case when v_po.is_consignment
                                  then 'supplier_consignment' else ownership end,
                 supplier = coalesce(nullif(btrim(coalesce(supplier, '')), ''), v_supplier_name)
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_delta
           )
          returning 1
        )
        select count(*) into v_freed from freed;
        v_rest := v_delta - v_freed;
        if v_rest > 0 then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'free', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, btrim(p_do_number), current_date);
        end if;
      end if;

      -- 0444 · no shortfall mint: Receiving never creates an identity.
      v_minted := 0;

      v_lines_updated := v_lines_updated + 1;
    end if;

    -- Quarantine the claimed units — the EXACT scanned ones when named,
    -- otherwise oldest-first, after the free-flip as before.
    if v_damaged_claim is not null then
      if cardinality(v_dmg_ids) > 0 then
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'damaged',
                 hold_claim_id = v_damaged_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id = any(v_dmg_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_held from held;
        if v_held <> cardinality(v_dmg_ids) then
          raise exception 'a damaged unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        -- 0444 · quantity line: legacy line-bound Units first, then one bulk
        -- controlled row for the rest. Received-with-issue goods are present
        -- but unavailable; they never become a Unit.
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'damaged',
                 hold_claim_id = v_damaged_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_damaged_add
           )
          returning 1
        )
        select count(*) into v_held from held;
        v_rest := v_damaged_add - v_held;
        if v_rest > 0 and v_posts_stock then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, hold_reason, hold_claim_id, held_at, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'on_hold', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, 'damaged', v_damaged_claim, now(), btrim(p_do_number), current_date);
          v_held := v_held + v_rest;
        end if;
      end if;
      v_units_held := v_units_held + v_held;
    end if;

    if v_wrong_claim is not null then
      if cardinality(v_wrong_ids) > 0 then
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'wrong_item',
                 hold_claim_id = v_wrong_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id = any(v_wrong_ids) and status = 'incoming'
          returning 1
        )
        select count(*) into v_held from held;
        if v_held <> cardinality(v_wrong_ids) then
          raise exception 'a wrong-item unit on % was already received — reload and count again', v_sku
            using errcode = 'P0001', detail = 'unit_already_received';
        end if;
      else
        with held as (
          update ops_stock_items
             set status = 'on_hold', hold_reason = 'wrong_item',
                 hold_claim_id = v_wrong_claim, held_at = now(),
                 warehouse_id = v_site, updated_at = now()
           where id in (
             select id from ops_stock_items
              where po_line_id = v_line_id and identity_scope = 'unit' and status = 'incoming'
              order by created_at
              limit v_wrong_add
           )
          returning 1
        )
        select count(*) into v_held from held;
        v_rest := v_wrong_add - v_held;
        if v_rest > 0 and v_posts_stock then
          insert into ops_stock_items
            (unit_code, sku, warehouse_id, status, ownership, supplier, po_no, po_line_id,
             identity_scope, qty, hold_reason, hold_claim_id, held_at, source_ref, date_in)
          values
            (public.gen_quantity_key(), v_sku, v_site, 'on_hold', v_ownership,
             v_supplier_name, p_po_id, v_line_id,
             'quantity', v_rest, 'wrong_item', v_wrong_claim, now(), btrim(p_do_number), current_date);
          v_held := v_held + v_rest;
        end if;
      end if;
      v_units_held := v_units_held + v_held;
    end if;
  end loop;

  for v_thread in
    select * from order_supplier_threads
     where po_id = p_po_id and operation_stage = 'in_production'
  loop
    select coalesce(bool_and(pol.received_qty >= pol.qty), true)
      into v_thread_satisfied
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
      left join purchase_order_lines pol
        on pol.po_id = p_po_id and pol.sku = ol.sku
     where ol.order_id = v_thread.order_id
       and ps.supplier_id = v_thread.supplier_id
       and pm.category::text = v_thread.category;

    if not v_thread_satisfied then
      continue;
    end if;

    if v_was_relocated then
      v_target_thread_stage := 'waiting';
    else
      v_target_thread_stage := case when v_thread.sop_name = 'SOFA_SPECIAL'
                                    then 'dispatched'
                                    else 'ready_to_dispatch'
                               end;
    end if;

    update order_supplier_threads
       set operation_stage = v_target_thread_stage,
           warehouse_id    = v_site,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    -- 0366 · `reserved` is the Sales Order's exact-Unit binding, owned by the
    -- Stock reserve door (`status = 'reserved'` + `reserved_ref`), never an
    -- aggregate counter. The pre-0366 `stock_balances.reserved` increment the
    -- previous engine definition carried is removed — a receiving advances the
    -- thread; the dispatch flow binds its exact Units.
  end loop;

  select count(*) into v_outstanding
    from purchase_order_lines where po_id = p_po_id and public._purchasing_po_line_pending_qty(id)>0;

  if v_outstanding = 0 then
    if v_was_relocated then
      v_target_sup_status := 'at_warehouse_waiting';
    else
      v_target_sup_status := 'delivered';
    end if;

    update purchase_orders
       set status         = 'received',
           sup_status     = v_target_sup_status,
           do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  else
    update purchase_orders
       set do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     where id = p_po_id;
  end if;

  insert into po_history (po_id, text, by_role)
  values (p_po_id,
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)%s',
                 btrim(p_do_number),
                 case when v_was_relocated then 'relocated→at_warehouse_waiting' else 'normal→delivered' end,
                 v_lines_updated, v_threads_advanced,
                 case when v_damaged_total + v_wrong_total > 0
                      then format(' · issue: %s damaged, %s wrong item · %s supplier claim(s) opened · %s unit(s) on hold',
                                  v_damaged_total, v_wrong_total, v_claims_created, v_units_held)
                      else '' end),
          v_role);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)), p_po_id);

  return jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (select status from purchase_orders where id = p_po_id),
    'sup_status',        (select sup_status from purchase_orders where id = p_po_id),
    'was_relocated',     v_was_relocated,
    'damaged_qty',       v_damaged_total,
    'wrong_item_qty',    v_wrong_total,
    'claims_created',    v_claims_created,
    'units_held',        v_units_held,
    'actual_site_id',    v_site
  );
end;
$function$;
$carres_exact_context_writer_ddl$;
 if not (select relrowsecurity from pg_class where oid='public.po_goods_cancellation_events'::regclass)
  or not has_table_privilege('authenticated','public.po_goods_cancellation_events','SELECT')
  or has_table_privilege('anon','public.po_goods_cancellation_events','SELECT')
  or has_table_privilege('authenticated','public.po_goods_cancellation_events','INSERT,UPDATE,DELETE,TRUNCATE')
  or has_table_privilege('anon','public.po_goods_cancellation_events','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'new cancellation ledger RLS/grants mismatch'; end if;
 if (select count(*) from pg_policies where schemaname='public' and tablename='po_goods_cancellation_events')<>1
  or not exists(select 1 from pg_policies where schemaname='public' and tablename='po_goods_cancellation_events' and policyname='po_goods_cancellation_events_read' and cmd='SELECT' and roles=array['authenticated']::name[] and qual='(( SELECT app_role() AS app_role) = ANY (ARRAY[''operation''::app_role, ''principal''::app_role, ''finance''::app_role]))') then raise exception 'new cancellation ledger policy mismatch'; end if;
 if not exists(select 1 from pg_trigger t where t.tgrelid='public.po_goods_cancellation_events'::regclass and t.tgname='po_goods_cancellation_events_immutable' and t.tgenabled='O' and t.tgtype=58 and t.tgfoid='public._purchasing_cancellation_immutable()'::regprocedure) then raise exception 'immutable cancellation ledger guard missing'; end if;
 select count(*) into after_cancellations from public.po_goods_cancellation_events;
 if before_cancellations<>after_cancellations then raise exception 'installation wrote cancellation business facts'; end if;
 for item in select * from jsonb_array_elements('[{"signature":"_operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid, uuid)","body_md5":"5bf1d8ad6d7b6382f2b398780c85e2a9","security_definer":true,"authenticated_execute":false,"anon_execute":false},{"signature":"_operation_create_po_inner_admitted(uuid, uuid, jsonb, date, integer[], text, uuid, uuid, jsonb)","body_md5":"c54e9e184ed0e165f073e5a446cbb50a","security_definer":true,"authenticated_execute":false,"anon_execute":false},{"signature":"_po_line_source_move(uuid, uuid, integer)","body_md5":"c8ea1128f0a1f94b5c023398ed9e05aa","security_definer":true,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_approve_context_review(uuid, jsonb, text)","body_md5":"f8751a2ec8712acfcd21ff9b608f40f5","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_assert_request_approval(uuid)","body_md5":"389ee4d926d0e20a2e87156eb8867cd8","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_cancellation_immutable()","body_md5":"480cd802ade74ced23f3b912c8638500","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_cancelled_scope_receipt_guard()","body_md5":"128a3ad9fc50cd8ed0162e36d0f38b25","security_definer":true,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_check_context_forecast_source(jsonb, jsonb, uuid)","body_md5":"e256082d8ece6e698c339641be748bac","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_check_context_supplier_dates(jsonb, date)","body_md5":"db96f0d29a0d19aa3f7b42a0f5640d3d","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_approval_distribution(uuid, jsonb, boolean)","body_md5":"15067025d697826dc9e4594e60bc96a1","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_committed_rs_coverage(uuid)","body_md5":"ea181c7c3ccf4ac59cc0032c18443ea1","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_coverage(uuid, boolean)","body_md5":"61872e7bc123ab179eaaba7c3bfe87f4","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_coverage_admitted(uuid, boolean, jsonb)","body_md5":"6533f6cb3efa4f50e1234532dad15852","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_forecast_display_source()","body_md5":"1b8984a3b5a6a0806c154c7037dfce2b","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_forecast_facts(text, uuid)","body_md5":"36c5538c49523289aeec96f5a37f8d84","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_forecast_mark_lines(jsonb, jsonb)","body_md5":"c4eea86f800104ab665f1c18fb60db61","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_holiday_dates()","body_md5":"d083206a1ba3745e7345af7f1f749490","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_issue_admission(uuid, integer)","body_md5":"09ca8df4e75fd2a6c6155f321b149887","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_issue_preflight(jsonb)","body_md5":"f380e1ae96bb0488b3c5ffa2f66c3dfd","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_legacy_issue_scope(uuid)","body_md5":"ba2f5f4cd9bec14c2ff58340e0b8670d","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_object(jsonb, jsonb)","body_md5":"6f74dc6a503365536009a172ab8f3510","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_own_po_free(uuid, uuid)","body_md5":"eb470c61da4c4a4ebc91ea54f7e6940e","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_po_destination_matches(uuid, uuid, uuid)","body_md5":"34fd8803c83272818638304146fa7338","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_po_source_scope(text)","body_md5":"0f1ebff6d959eb165ff52352fd7cabf9","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_record_issued_source(uuid, integer, text)","body_md5":"1d79c2c85ca7f6cdd0694205aef114f7","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_remaining_recipients(uuid, uuid, jsonb)","body_md5":"976861914fa189d0439bcd99d1ecca37","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_request_source_locks(uuid)","body_md5":"01ed5d83e4e5b1aa9a72a60eae80864b","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_review(uuid)","body_md5":"c8c23dee9cd655d7b98c9564348ace0a","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_revision_before(uuid)","body_md5":"16953ceb0b2cfbe708eb4de4c6789ac6","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_source_locks(text[])","body_md5":"3f68cfa43c615400763552bef5b260e4","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_source_write_guard()","body_md5":"858cb3fef1abaeb8d5d4d9072365a992","security_definer":true,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_stock_admission(uuid, uuid[], boolean)","body_md5":"7afe47537a404876f88977eeb225f5fe","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_stock_offers(jsonb)","body_md5":"cb54c72108391e97062acf902cbc80c4","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_unit_demand(uuid)","body_md5":"17a749c4b9b7986a9771e37b1c3f4994","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_context_writer_admission()","body_md5":"799b52f12579bdf2fd9a7b95285b6508","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_po_demand_cancelled_qty(uuid, uuid)","body_md5":"6947c458a7d70820312465906adf9862","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_po_issued_recipients(text, uuid)","body_md5":"e7aa3f91fc8369d0ef1433ebad066a25","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_po_line_cancelled_qty(uuid)","body_md5":"3b9098732577ba76c4b5381bd728d601","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_po_line_pending_qty(uuid)","body_md5":"5f7ecef6d40cd931589c1749217c7349","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_po_request_active_sources(uuid)","body_md5":"8ca3f0ce5c358d00e3ded55070285686","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_po_request_sources(uuid)","body_md5":"6a08039e063699407a37e2dd19dccdd6","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_request_context_state(uuid)","body_md5":"85a7228cdced6b259af4e76acf918eaf","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_request_revision_scope(uuid, text)","body_md5":"4dc15b1a0c4644edc6693c0b0e3f62f7","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_stamp_context_approval(uuid, jsonb)","body_md5":"ea667f3b5c8e685ab0d3219648e08e04","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_validate_request_context(jsonb)","body_md5":"034f65a27d66e53de70405e24e3ad9e2","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_write_context_demands(uuid, jsonb)","body_md5":"d9f3ef5331d81b535f62750632f221ef","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"_purchasing_write_forecast_request_mark(uuid, date, uuid, jsonb, boolean)","body_md5":"1584e591b390427330f7b7705776dbdb","security_definer":false,"authenticated_execute":false,"anon_execute":false},{"signature":"operation_cancel_po(text, text)","body_md5":"b87a096a846f821ea9b54df82776737f","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"operation_cancel_po(text, text, jsonb)","body_md5":"0656f26250b23327f20c2a3f123ce60b","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"operation_receive_po_with_do(text, text, text, jsonb, uuid)","body_md5":"bfd7b8fdfd8588a43ff372e839f304d6","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"ops_stock_bound_incoming_arrives()","body_md5":"f5c86179ab15b232c996e21dea3456d2","security_definer":false,"authenticated_execute":true,"anon_execute":true},{"signature":"ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid, uuid)","body_md5":"0c61156c1df3028b776da794b8db4a3d","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_allocate_ready_units(uuid, uuid[], uuid[])","body_md5":"088f5eb7630cc9f7889b9b480c90f0d4","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_cancel_demand(uuid, text)","body_md5":"2dd965f910515b21fabc0b45db761eaf","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_change_po_deliver_to(text, uuid, integer, uuid, text, text[])","body_md5":"018e548a0079e098cf7b159fb88fb5db","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_confirm_po_sent(text, integer, text, text, text)","body_md5":"b1e35c6b998a77e070a1c0809ae9b5f8","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_create_demand(text, integer, uuid, date, text, text, uuid)","body_md5":"596e927e0d6a49a76a9686eb4ab005af","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_create_request_with_lines(text, uuid, text, date, uuid, uuid, text, jsonb, text, text)","body_md5":"aebf7a327b5526e47c5d4558a6a24306","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_decide_request(uuid, text, text, jsonb)","body_md5":"3cce60d8c6c4bf013da39752e8addaa7","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_demand_record_issue(uuid, integer, text)","body_md5":"a0a8cf0e6abf205acef3287ec4f123e4","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_issue_pos_batch(jsonb)","body_md5":"e0460c396fdc85821675b27c223ed542","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_move_request_destination(uuid, uuid)","body_md5":"c8ba7c10b7f62373842a50785010dd4b","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_po_cancellation_facts(text)","body_md5":"bfa80a455d6f0cfb4b347b7bb29ad334","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_po_cancellations(text[])","body_md5":"b18b67efe69b1eddea6bc09f5288db6c","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_po_document(text)","body_md5":"cbbf66cc6cd4cf296eb863b1ced4fd35","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_po_free_units()","body_md5":"bf4d0c8d7e62ed6e4932f86db7739181","security_definer":false,"authenticated_execute":true,"anon_execute":true},{"signature":"purchasing_po_line_free_units(uuid)","body_md5":"516f4c9fde8a6f37574e5d5a22a1296b","security_definer":false,"authenticated_execute":true,"anon_execute":true},{"signature":"purchasing_record_supplier_answers(text, jsonb)","body_md5":"ceeb303c3788f9e379d91e880b2f16e6","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_request_context_review(uuid)","body_md5":"829241a3a53c1633ba75727ce9379078","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_request_forecast_sources(text[], uuid)","body_md5":"7ba9722f24efa6e24d0a86be0e913b81","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_request_issue_retry(uuid, jsonb)","body_md5":"e389ad2bed8958c427bdc36d2f98bc26","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_request_stock_offers(jsonb)","body_md5":"b84285c414014f19f2795ad592bb002a","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_require_reply_evidence()","body_md5":"86158e48562d0e04b7de239770cde22f","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_resubmit_request(uuid, uuid, date, text, uuid, uuid, text, jsonb, text)","body_md5":"34ace934d87852a1194d42384461fb12","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_revise_po(text, text, jsonb)","body_md5":"0f762cd03d22c774e83c1fdeff58590e","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_submit_forecast_requests(uuid, date, uuid, jsonb)","body_md5":"ed6b4cb29abf9ed6c3a78100f0de6c22","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"purchasing_withdraw_request(uuid)","body_md5":"6adf9046fd793e403e49912c680b7574","security_definer":true,"authenticated_execute":true,"anon_execute":false},{"signature":"warehouse_receipt_validate_lines(text, jsonb, uuid)","body_md5":"8176ddcb39829dd2899c3c9c531f0287","security_definer":true,"authenticated_execute":false,"anon_execute":false}]'::jsonb) loop
  function_oid:=to_regprocedure('public.'||(item->>'signature'));
  if function_oid is null or (select md5(replace(prosrc,chr(13),'')) from pg_proc where pg_proc.oid=function_oid) is distinct from item->>'body_md5'
    or (select prosecdef from pg_proc where pg_proc.oid=function_oid) is distinct from (item->>'security_definer')::boolean
    or has_function_privilege('authenticated',function_oid,'EXECUTE') is distinct from (item->>'authenticated_execute')::boolean
    or has_function_privilege('anon',function_oid,'EXECUTE') is distinct from (item->>'anon_execute')::boolean then raise exception 'writer function fingerprint/grant mismatch: %',item->>'signature'; end if;
 end loop;
 select count(*) into trigger_count from pg_trigger t join pg_proc p on p.oid=t.tgfoid where not t.tgisinternal and t.tgenabled='O' and p.proname='_purchasing_context_source_write_guard';
 if trigger_count<>13 then raise exception 'expected all13 owning source guards'; end if;
 if not exists(select 1 from pg_attribute where attrelid='public.po_line_sources'::regclass and attname='purchase_demand_id' and not attisdropped)
   or exists(select 1 from pg_attribute where attrelid='public.po_line_sources'::regclass and attname='order_id' and attnotnull)
   or not exists(select 1 from pg_constraint where conrelid='public.po_line_sources'::regclass and conname='po_line_sources_exact_source_owner') then raise exception 'PO source ownership schema differs'; end if;
 begin perform public._purchasing_context_writer_admission(); exception when object_not_in_prerequisite_state then get stacked diagnostics closed_tag=pg_exception_detail; closed_refused:=closed_tag='request_context_not_enabled'; end;
 if not closed_refused then raise exception 'installation activated new context writers'; end if;
 begin perform public._purchasing_validate_request_context('{}'::jsonb); exception when invalid_parameter_value then invalid_refused:=true; end;
 if not invalid_refused then raise exception 'invalid-scope negative control did not fire'; end if;
 perform set_config('request.jwt.claims','{}',true); perform set_config('request.jwt.claim.sub','',true);
 begin perform public.purchasing_issue_pos_batch('[]'::jsonb); exception when insufficient_privilege then no_account_refused:=true; end;
 if not no_account_refused then raise exception 'no-account issue negative control did not fire'; end if;
 if before_counts is distinct from jsonb_build_object('requests',(select count(*) from public.purchase_requests),'demands',(select count(*) from public.purchase_demands),'events',(select count(*) from public.purchase_request_events),'pos',(select count(*) from public.purchase_orders),'po_lines',(select count(*) from public.purchase_order_lines),'po_sources',(select count(*) from public.po_line_sources),'units',(select count(*) from public.ops_stock_items),'audit',(select count(*) from public.audit_log),'receipts',(select count(*) from public.warehouse_receipts),'receiving_events',(select count(*) from public.receiving_events),'claims',(select count(*) from public.supplier_claims),'approvals',(select count(*) from public.approvals)) or before_rls is distinct from (select md5(string_agg(c.relname||':'||c.relrowsecurity::text,',' order by c.relname)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relname<>'po_goods_cancellation_events') or before_policies is distinct from (select md5(coalesce(string_agg(tablename||':'||policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''),',' order by tablename,policyname),'')) from pg_policies where schemaname='public' and tablename<>'po_goods_cancellation_events') or before_settings is distinct from (select md5(to_jsonb(s)::text) from public.purchasing_settings s where id=1) then raise exception 'writer installation changed business rows, settings or RLS'; end if;
 raise exception 'PROBE_ROLLBACK context writer: exact DDL/functions/grants/13 source guards; default-closed/invalid-scope/no-account controls PASS; business rows/settings/existing RLS unchanged; new readonly immutable cancellation ledger checked';
end;
$request_writer_probe$;
