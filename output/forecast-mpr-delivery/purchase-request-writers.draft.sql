-- WORK IN PROGRESS, NOT APPROVED, NOT A MIGRATION. Never apply to production.
-- Pure validator compiles locally; full direct-RPC invariants, Settings/source checks,
-- writer integration and negative controls are not yet complete.
-- Draft contextual request validation: one owning SQL transaction rechecks conservation.
create or replace function public._purchasing_validate_request_context(p_context jsonb)
returns void language plpgsql set search_path = public, pg_temp as $fn$
declare
  v_line jsonb; v_recipient jsonb; v_allocation jsonb; v_stock jsonb;
  v_purpose text := p_context->>'purpose'; v_qty integer; v_stock_qty integer;
  v_requested integer; v_allocated integer; v_recipient_id text;
begin
  if jsonb_typeof(p_context) <> 'object' or jsonb_typeof(p_context->'version') is distinct from 'number' or p_context->>'version' is distinct from '1'
     or v_purpose is null or v_purpose not in ('general_purchase','service_case','ready_stock')
     or jsonb_typeof(p_context->'lines') is distinct from 'array'
     or jsonb_array_length(p_context->'lines') = 0
     or jsonb_typeof(p_context->'recipients') is distinct from 'array' then
    raise exception 'invalid purchase context' using errcode='22023', detail='invalid_param';
  end if;
  perform (p_context->>'proceedDate')::date;
  if p_context->>'proceedDate' is null then
    raise exception 'proceed date is required' using errcode='22023', detail='invalid_param';
  end if;
  if exists (select 1 from jsonb_object_keys(p_context) k where k not in
    ('version','origin','purpose','proceedDate','serviceCaseId','reason',
     'companyPersonName','projectReference','explanation','forecastChangeReason','recipients','lines')) then
    raise exception 'unknown purchase field' using errcode='22023', detail='invalid_param';
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
  elsif nullif(p_context->>'reason','') is not null then
    raise exception 'this purpose has no GP reason' using errcode='22023', detail='invalid_param';
  end if;
  if v_purpose<>'service_case' and nullif(p_context->>'serviceCaseId','') is not null then
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
    perform (v_recipient->>'id')::uuid, (v_recipient->>'deliveryDate')::date;
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
  for v_line in select * from jsonb_array_elements(p_context->'lines') loop
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
        (select 1 from public.purchasing_destinations where id=(v_stock->>'destinationId')::uuid and active) then
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
