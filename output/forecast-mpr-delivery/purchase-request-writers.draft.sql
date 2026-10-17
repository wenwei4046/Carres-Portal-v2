-- WORK IN PROGRESS, NOT APPROVED, NOT A MIGRATION. Never apply to production.
-- Pure validator compiles locally; full direct-RPC invariants, Settings/source checks,
-- writer integration and negative controls are not yet complete.
-- Draft contextual request validation: one owning SQL transaction rechecks conservation.
-- Direct RPC callers must satisfy the same required fields and JSON types as
-- the shared schema; SQL NULL is never accepted as an omitted required field.
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
create or replace function public._purchasing_request_context_state(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $state$
declare r public.purchase_requests%rowtype; expected jsonb; actual jsonb; facts jsonb; case_source jsonb;
begin
  select * into r from public.purchase_requests where id=p_id for update;
  if not found then raise exception 'unknown request' using errcode='22023',detail='unknown_request'; end if;
  if r.request_version<1 or r.request_context is null then raise exception 'no contextual scope' using errcode='22023',detail='context_unavailable'; end if;
  perform public._purchasing_validate_request_context(r.request_context);
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
    'attrs',nullif(l->'attrs','null'::jsonb),'destination',(a->>'destinationId')::uuid,
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
    'requester_id',r.created_by,'created_at',r.created_at,'purpose',r.purpose,'proceed_date',r.proceed_date,'context',r.request_context,'service_case_source',case_source,'demands',facts);
end;
$state$;
revoke all on function public._purchasing_request_context_state(uuid) from public,anon,authenticated;

-- Private downstream admission for a future canonical approval writer. It only
-- compares saved facts; it never invents a baseline, approves or reserves stock.
-- NOT wired into legacy issue/stock paths until the complete contextual flow is ready.
create or replace function public._purchasing_assert_request_approval(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $approval$
declare r public.purchase_requests%rowtype; current_scope jsonb;
begin
  current_scope:=public._purchasing_request_context_state(p_id);
  select * into strict r from public.purchase_requests where id=p_id;
  if r.approved_at is null or r.approved_by is null or r.refused_at is not null
    or r.withdrawn_at is not null or r.sent_back_at is not null
    or r.approval_version is null or r.approval_scope is null then
    raise exception 'current request approval is unavailable' using errcode='22023',detail='request_approval_unavailable';
  end if;
  if r.approval_version is distinct from r.request_version or r.approval_scope is distinct from current_scope then
    raise exception 'request changed after approval' using errcode='22023',detail='request_approval_changed';
  end if;
  if exists(select 1 from public.purchase_demands where request_id=p_id and cancelled_at is null
    and (approved_qty is null or approved_qty<0 or approved_qty>qty)) then
    raise exception 'approved allocation is unavailable' using errcode='22023',detail='request_approval_unavailable';
  end if;
  return current_scope;
end;
$approval$;
revoke all on function public._purchasing_assert_request_approval(uuid) from public,anon,authenticated;

-- Private full-scope approval writer for the canonical decision door. Admission
-- by that public door remains CLOSED until calendar/source/coverage is complete.
-- Partial approval needs explicit preserved recipient distribution; no qty cut is
-- guessed here. No role/grant is added, no stock is reserved and no PO is issued.
create or replace function public._purchasing_stamp_context_approval(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $stamp$
declare actor_role text:=public.purchasing_approver_gate(); r public.purchase_requests%rowtype; scope jsonb;
begin
  select * into r from public.purchase_requests where id=p_id for update;
  if not found then raise exception 'unknown request' using errcode='22023',detail='unknown_request'; end if;
  if r.created_by is not distinct from auth.uid() then raise exception 'you cannot decide a purchase you raised' using errcode='42501',detail='own_request'; end if;
  if r.withdrawn_at is not null or r.refused_at is not null or r.sent_back_at is not null or r.approved_at is not null then
    raise exception 'request is not awaiting approval' using errcode='22023',detail='request_not_awaiting_approval';
  end if;
  scope:=public._purchasing_request_context_state(p_id);
  if exists(select 1 from public.purchase_demands where request_id=p_id and
    (po_id is not null or ordered_at is not null or coalesce(issued_qty,0)>0))
    or exists(select 1 from public.purchase_order_lines pl join public.purchase_demands d on d.id=pl.demand_id where d.request_id=p_id) then
    raise exception 'request already issued' using errcode='22023',detail='request_already_issued';
  end if;
  update public.purchase_demands set approved_qty=qty where request_id=p_id and cancelled_at is null;
  scope:=public._purchasing_request_context_state(p_id);
  update public.purchase_requests set approved_at=now(),approved_by=auth.uid(),approval_version=request_version,approval_scope=scope where id=p_id;
  insert into public.audit_log(role,actor_text,action,ref) values(actor_role::public.app_role,
    (select name from public.app_users where id=auth.uid()),'Purchase approved',p_id::text);
  return public._purchasing_assert_request_approval(p_id);
end;
$stamp$;
revoke all on function public._purchasing_stamp_context_approval(uuid) from public,anon,authenticated;

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
  scope:=public._purchasing_assert_request_approval(p_id);
  -- Include cancelled lines: an issued historical line is still an issued PO.
  if exists(select 1 from public.purchase_demands where request_id=p_id
    and (po_id is not null or ordered_at is not null or coalesce(issued_qty,0)>0))
    or exists(select 1 from public.purchase_order_lines pl join public.purchase_demands d on d.id=pl.demand_id where d.request_id=p_id) then
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
declare v_line jsonb; v_supplier uuid; v_allocation jsonb; v_stock jsonb; v_required date;
begin
  select required_by into strict v_required from public.purchase_requests where id=p_id for update;
  perform public._purchasing_validate_request_context(p_context);
    for v_line in select * from jsonb_array_elements(p_context->'lines') loop
      select supplier_id into v_supplier from public.product_skus where sku=v_line->>'sku';
      if not found then raise exception 'unknown sku' using errcode='22023',detail='unknown_sku'; end if;
      if v_supplier is null then raise exception 'sku has no supplier' using errcode='22023',detail='sku_has_no_supplier'; end if;
      for v_allocation in select * from jsonb_array_elements(v_line->'allocations') loop
        if (v_allocation->>'supplierDeliveryDate')::date < (p_context->>'proceedDate')::date then raise exception 'supplier date precedes Proceed Date' using errcode='22023',detail='invalid_param'; end if;
        insert into public.purchase_demands(purpose,sku,supplier_id,destination_id,qty,required_by,request_id,created_by,attrs,
          request_line_id,supplier_allocation_id,fulfilment_kind)
        values((p_context->>'purpose'),v_line->>'sku',v_supplier,(v_allocation->>'destinationId')::uuid,(v_allocation->>'qty')::int,
          (v_allocation->>'supplierDeliveryDate')::date,p_id,auth.uid(),nullif(v_line->'attrs','null'::jsonb),
          (v_line->>'id')::uuid,(v_allocation->>'id')::uuid,'purchase');
      end loop;
      for v_stock in select * from jsonb_array_elements(v_line->'stockProposals') loop
        -- Proposal only. No Unit, reservation, stock ledger or physical movement.
        insert into public.purchase_demands(purpose,sku,supplier_id,destination_id,qty,required_by,request_id,created_by,attrs,
          request_line_id,stock_proposal_id,fulfilment_kind)
        values((p_context->>'purpose'),v_line->>'sku',v_supplier,(v_stock->>'destinationId')::uuid,(v_stock->>'qty')::int,v_required,
          p_id,auth.uid(),nullif(v_line->'attrs','null'::jsonb),(v_line->>'id')::uuid,(v_stock->>'id')::uuid,'stock_proposal');
      end loop;
    end loop;
end;
$demands$;
revoke all on function public._purchasing_write_context_demands(uuid,jsonb) from public,anon,authenticated;

-- WIP canonical create slice. DO NOT REVIEW/APPLY as a finished migration:
-- Supplier-date minimum must follow productionWorkingDaysFor/expectedArrivalOf
-- and the SAME myHolidaySet source. Office calendar is for windows/buffer,
-- not a substitute for the supplier production week (Purchasing MASTER5.6).
-- Supplier-calendar/source/destination checks, contextual approval/reapproval,
-- downstream coverage/stock/send admission and complete integration are unfinished.
-- Preimages were read locally only after all7 owning function fingerprints matched
-- production (read-only17Oct); existing signatures and legacy bodies are preserved.
CREATE OR REPLACE FUNCTION public.purchasing_create_request_with_lines(p_purpose text, p_destination_id uuid, p_why text DEFAULT NULL::text, p_required_by date DEFAULT NULL::date, p_for_service_case_id uuid DEFAULT NULL::uuid, p_for_staff_user_id uuid DEFAULT NULL::uuid, p_for_subsidiary_name text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_fulfilment_intent text DEFAULT NULL::text, p_purchase_requirement text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_context jsonb; v_submission_key uuid; v_existing public.purchase_requests%rowtype;
  v_destination uuid; v_required date; v_supplier uuid; v_allocation jsonb; v_stock jsonb;
  v_role public.app_role; v_no text; v_prefix text;
  v_header   jsonb;
  v_id       uuid;
  v_line     jsonb;
  v_one      jsonb;
  v_line_ids jsonb := '[]'::jsonb;
begin
  -- The existing public owner gains one strict context envelope; its legacy
  -- body below is retained byte-for-byte. No overload or alternative request RPC.
  if jsonb_typeof(p_lines)='array' and jsonb_array_length(p_lines)>0
     and (p_lines->0) ? 'request_context' then
    if jsonb_array_length(p_lines)<>1 then raise exception 'one context envelope required' using errcode='22023',detail='invalid_param'; end if;
    perform public._purchasing_context_object(p_lines->0,'{"request_context":"object","submission_key":"string"}');
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
      if v_existing.request_context is distinct from v_context then raise exception 'submission scope changed' using errcode='22023',detail='submission_scope_changed'; end if;
      select coalesce(jsonb_agg(id order by created_at,id),'[]') into v_line_ids from public.purchase_demands where request_id=v_existing.id;
      return jsonb_build_object('id',v_existing.id,'req_no',v_existing.req_no,'approval_required',true,'line_ids',v_line_ids,'request_version',v_existing.request_version);
    end if;
    perform 1 from public.purchasing_settings where id=1 for share;
    perform public._purchasing_validate_request_context(v_context);
    -- Forecast suggestion admission still needs its existing source/fingerprint
    -- transaction. Never admit an untraceable suggestion as a manual top-up.
    if v_context->>'origin'='forecast_suggestion' then raise exception 'forecast context admission is not ready' using errcode='22023',detail='forecast_context_not_ready'; end if;
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

  -- THE ONE ROW EVERY DECISION QUEUES ON (see 0522 header: lock order).
  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  -- TEMPORARY FAIL-CLOSED WIP ADMISSION: the matching snapshot/reapproval
  -- owner is not finished. Legacy approval must never certify a new context.
  if v_req.request_version<>0 or v_req.request_context is not null then
    raise exception 'context approval is not ready' using errcode='22023',detail='context_approval_not_ready';
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

-- SAME public resubmit signature and legacy body; contextual revisions above
-- remain WIP until source/calendar/approval/coverage integration is complete.
CREATE OR REPLACE FUNCTION public.purchasing_resubmit_request(p_id uuid, p_destination_id uuid, p_required_by date, p_why text DEFAULT NULL::text, p_for_service_case_id uuid DEFAULT NULL::uuid, p_for_staff_user_id uuid DEFAULT NULL::uuid, p_for_subsidiary_name text DEFAULT NULL::text, p_lines jsonb DEFAULT '[]'::jsonb, p_purchase_requirement text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_context jsonb; v_revision_key uuid; v_expected integer; v_before jsonb; v_after jsonb; v_event public.purchase_request_events%rowtype;
  v_destination uuid; v_required date; v_retry_key text;
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

  select * into v_req from purchase_requests where id = p_id for update;
  if not found then
    raise exception 'unknown request' using errcode = '22023', detail = 'unknown_request';
  end if;
  if v_req.request_version>0 or v_req.request_context is not null then
    if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<>1 or not ((p_lines->0)?'request_context') then
      raise exception 'context revision envelope required' using errcode='22023',detail='context_revision_required';
    end if;
    perform public._purchasing_context_object(p_lines->0,'{"request_context":"object","revision_key":"string","expected_version":"number","reason":"string"}');
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
        or (v_event.changes->>'previous_version')::integer is distinct from v_expected then
        raise exception 'revision key scope changed' using errcode='22023',detail='revision_scope_changed';
      end if;
      return jsonb_build_object('id',p_id,'req_no',v_req.req_no,'round',v_event.round,'request_version',(v_event.changes->>'request_version')::integer,'approval_required',true);
    end if;
    if v_req.request_version<>v_expected then raise exception 'request changed before revision' using errcode='22023',detail='request_version_changed'; end if;
    if v_req.approved_at is not null then
      v_before:=public._purchasing_request_revision_scope(p_id,p_lines->0->>'reason');
    elsif v_req.sent_back_at is not null and v_req.withdrawn_at is null and v_req.refused_at is null then
      v_before:=public._purchasing_request_context_state(p_id);
      if exists(select 1 from public.purchase_demands where request_id=p_id and (po_id is not null or ordered_at is not null or coalesce(issued_qty,0)>0))
        or exists(select 1 from public.purchase_order_lines pl join public.purchase_demands d on d.id=pl.demand_id where d.request_id=p_id)
        or exists(select 1 from public.ops_stock_items u join public.purchase_demands d on d.id=u.reserved_purchase_demand_id where d.request_id=p_id) then
        raise exception 'committed scope cannot be revised here' using errcode='22023',detail='request_already_committed';
      end if;
    else
      raise exception 'request is not available for revision' using errcode='22023',detail='request_revision_unavailable';
    end if;
    perform 1 from public.purchasing_settings where id=1 for share;
    perform public._purchasing_validate_request_context(v_context);
    if v_context->>'origin'='forecast_suggestion' then raise exception 'forecast context admission is not ready' using errcode='22023',detail='forecast_context_not_ready'; end if;
    if v_context is not distinct from v_req.request_context then raise exception 'revision has no changes' using errcode='22023',detail='request_unchanged'; end if;
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
