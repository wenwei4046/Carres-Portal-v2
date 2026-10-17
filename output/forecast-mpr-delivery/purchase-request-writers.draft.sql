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
      join public.product_models m on m.id=s.model_id where s.sku=l->>'sku' for share of s,m;
    if not found then raise exception 'unknown sku' using errcode='22023',detail='unknown_sku'; end if;
    if source.supplier_id is null or source.category is null then raise exception 'supplier production plan unavailable' using errcode='22023',detail='supplier_plan_unavailable'; end if;
    select working_days into days from public.purchasing_production_days where supplier_id=source.supplier_id and category=source.category for share;
    if not found or days is null then raise exception 'supplier production days unavailable' using errcode='22023',detail='supplier_plan_unavailable'; end if;
    select ss.off_days into off_days from public.purchasing_supplier_settings ss where ss.supplier_id=source.supplier_id for share;
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
end;
$supplier_dates$;
revoke all on function public._purchasing_check_context_supplier_dates(jsonb,date) from public,anon,authenticated;

create or replace function public._purchasing_request_context_state(p_id uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $state$
declare r public.purchase_requests%rowtype; expected jsonb; actual jsonb; facts jsonb; case_source jsonb; supplier_plan jsonb;
begin
  select * into r from public.purchase_requests where id=p_id for update;
  if not found then raise exception 'unknown request' using errcode='22023',detail='unknown_request'; end if;
  if r.request_version<1 or r.request_context is null then raise exception 'no contextual scope' using errcode='22023',detail='context_unavailable'; end if;
  perform public._purchasing_validate_request_context(r.request_context);
  supplier_plan:=public._purchasing_check_context_supplier_dates(r.request_context);
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
    'requester_id',r.created_by,'created_at',r.created_at,'purpose',r.purpose,'proceed_date',r.proceed_date,'context',r.request_context,'service_case_source',case_source,'supplier_plan',supplier_plan,'demands',facts);
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
-- by that public door remains CLOSED until calendar/source/coverage is complete.
-- Partial approval needs explicit preserved recipient distribution; no qty cut is
-- guessed here. No role/grant is added, no stock is reserved and no PO is issued.
create or replace function public._purchasing_stamp_context_approval(p_id uuid,p_distribution jsonb)
returns jsonb language plpgsql set search_path=public,pg_temp as $stamp$
declare actor_role text:=public.purchasing_approver_gate(); r public.purchase_requests%rowtype; scope jsonb; distribution jsonb;
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
  if u.po_line_id is not null then select nullif(attrs,'{}'::jsonb) into strict unit_attrs from public.purchase_order_lines where id=u.po_line_id; end if;
  if unit_attrs is distinct from nullif(d.attrs,'{}'::jsonb) then
   raise exception 'Unit configuration not proven for this proposal' using errcode='22023',detail='stock_proposal_configuration_unavailable'; end if;
 end loop;
end;
$stock_admission$;
revoke all on function public._purchasing_context_stock_admission(uuid,uuid[],boolean) from public,anon,authenticated;

-- Current exact coverage for the approved request. Shelf totals never net an
-- intentional RS/GP buy; only owning Unit bindings and exact PO demand lineage count.
create or replace function public._purchasing_context_coverage(p_id uuid,p_for_issue boolean default false)
returns jsonb language plpgsql set search_path=public,pg_temp as $coverage$
declare scope jsonb; d public.purchase_demands%rowtype; held integer; issued integer; units uuid[]; rows jsonb:='[]';
begin
 scope:=public._purchasing_assert_request_approval(p_id);
 begin
 perform 1 from public.purchase_orders where id in(select pl.po_id from public.purchase_order_lines pl join public.purchase_demands pd on pd.id=pl.demand_id where pd.request_id=p_id) order by id for share nowait;
 perform 1 from public.purchase_order_lines where demand_id in(select id from public.purchase_demands where request_id=p_id) order by id for share nowait;
 exception when lock_not_available then raise exception 'request coverage changed' using errcode='40001',detail='request_coverage_changed'; end;
 for d in select * from public.purchase_demands where request_id=p_id and cancelled_at is null order by id loop
  select coalesce(array_agg(id order by id),'{}'),coalesce(sum(qty),0) into units,held from public.ops_stock_items where reserved_purchase_demand_id=d.id and status in ('reserved','sold');
  if d.fulfilment_kind='stock_proposal' then
   perform public._purchasing_context_stock_admission(d.id,units,true);
   if p_for_issue and held<>d.approved_qty then raise exception 'approved stock proposal is not fully bound' using errcode='22023',detail='stock_proposal_not_fulfilled'; end if;
   if exists(select 1 from public.purchase_order_lines where demand_id=d.id) or d.issued_qty<>0 then raise exception 'stock proposal has purchase coverage' using errcode='22023',detail='request_po_coverage_changed'; end if;
   issued:=0;
  else
   if held<>0 then raise exception 'purchase allocation gained stock coverage' using errcode='22023',detail='request_stock_coverage_changed'; end if;
   if exists(select 1 from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id where pl.demand_id=d.id and po.status<>'cancelled'
    and (pl.sku is distinct from d.sku or nullif(pl.attrs,'{}'::jsonb) is distinct from nullif(d.attrs,'{}'::jsonb) or po.supplier_id is distinct from d.supplier_id
      or coalesce(pl.destination_id,po.destination_id) is distinct from d.destination_id or po.destination_id is distinct from d.destination_id or po.purpose is distinct from d.purpose)) then raise exception 'PO no longer matches its approved demand' using errcode='22023',detail='request_po_coverage_changed'; end if;
   select coalesce(sum(pl.qty),0) into issued from public.purchase_order_lines pl join public.purchase_orders po on po.id=pl.po_id where pl.demand_id=d.id and po.status<>'cancelled';
   if issued<>d.issued_qty or issued>d.approved_qty then raise exception 'PO quantity differs from request coverage' using errcode='22023',detail='request_po_coverage_changed'; end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('demand_id',d.id,'kind',d.fulfilment_kind,'approved_qty',d.approved_qty,'stock_qty',held,'issued_qty',issued,
   'to_buy',case when d.fulfilment_kind='purchase' then d.approved_qty-issued else 0 end));
 end loop;
 return rows;
end;
$coverage$;
revoke all on function public._purchasing_context_coverage(uuid,boolean) from public,anon,authenticated;

-- Read-only preflight of one purchase allocation; actual PO issuance continues
-- to belong to purchasing_issue_pos_batch/its existing recorder. Public contextual
-- issue remains closed until origin/date/payload integration is complete.
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
  perform public._purchasing_check_context_supplier_dates(p_context);
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
       ('customer_sales', 'ready_stock', 'display', 'office', 'warranty', 'spare_parts',
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
      v_po_id := public._operation_create_po_inner(
        p_supplier_id := v_supplier_id,
        p_warehouse_id := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines := v_po->'lines',
        p_eta_date := v_eta,
        p_so_refs := v_so_refs,
        p_note := v_po->>'note',
        p_procurement_partner_id := v_partner_id,
        p_destination_id := v_destination_id
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
  return jsonb_build_object('po_ids', v_po_ids);
end;
$function$;

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
    raise exception 'context issuance is not ready' using errcode='22023',detail='context_issue_not_ready';
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
