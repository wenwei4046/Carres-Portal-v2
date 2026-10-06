-- 0496 · The first leg's arrival names its stop
-- 【DELIVERY】 CARD 14 · Journey legs — production-walk correction 2026-09-13
--
-- Found on the authenticated walk of SO-1362: recording leg 1's arrival
-- (`delivery_attempt_record(…, p_leg => 1)`) failed with `operator does not
-- exist: record ->> unknown`. The stop-index lookup used `jsonb_array_elements
-- (…) with ordinality s` and then `s->>'leg'` — with ordinality the alias is a
-- two-column record, not the element. 0496 re-creates the door with the
-- element named (`s.value`); nothing else changes.

set search_path = public;

create or replace function public.delivery_attempt_record(
  p_order_id  uuid,
  p_result    text,
  p_reason_key text default null,
  p_where_goods text default null,
  p_note      text default null,
  p_delivered_item_ids uuid[] default '{}',
  p_returned  jsonb default '[]',
  p_leg       int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_order orders;
  v_confirmed date;
  v_no   int;
  v_attempt delivery_attempts;
  v_item uuid;
  v_row  ops_stock_items;
  v_so_ref text;
  v_ret  jsonb;
  v_action text;
  v_released uuid;
  v_delivered int := 0;
  v_returned int := 0;
  -- 0491 · Journey legs and the returned-goods arrival
  v_last_leg int := 0;
  v_leg_doc ops_delivery_orders;
  v_leg_stop jsonb;
  v_stops jsonb;
  v_idx int;
  v_return_units uuid[] := '{}';
  v_party uuid;
  v_source_id uuid;
  v_source jsonb;
  v_arrival_error text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can record a delivery attempt'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;
  v_so_ref := 'SO-' || v_order.so::text;

  -- 0491 · A Journey leg is its own scope (Delivery MASTER §14.1): it must exist
  -- on the order's recorded chain, and an intermediate leg's `delivered` means
  -- the goods reached the NAMED warehouse — never that the customer received them.
  v_stops := coalesce(v_order.delivery_stops, '[]'::jsonb);
  if jsonb_typeof(v_stops) = 'array' then
    select coalesce(max((s->>'leg')::int), 0) into v_last_leg from jsonb_array_elements(v_stops) s;
  end if;
  if coalesce(p_leg, 0) < 0 or coalesce(p_leg, 0) > v_last_leg then
    raise exception 'leg % is not on this order''s Delivery Journey', p_leg
      using errcode = '22023', detail = 'leg_not_on_journey';
  end if;
  if coalesce(p_leg, 0) > 0 then
    select * into v_leg_doc from ops_delivery_orders
     where order_id = p_order_id and leg = p_leg and voided_at is null
     order by issued_at desc limit 1;
    select s into v_leg_stop from jsonb_array_elements(v_stops) s where (s->>'leg')::int = p_leg;
  end if;

  if p_result is null or p_result not in ('partial','failed','delivered') then
    raise exception '% is not an attempt this door records', coalesce(p_result, 'null')
      using errcode = '22023', detail = 'bad_result';
  end if;
  if p_result = 'delivered' and not (coalesce(p_leg, 0) > 0 and p_leg < v_last_leg) then
    raise exception 'a full success walks the delivery door — only an intermediate Journey leg records its arrival here'
      using errcode = '22023', detail = 'bad_result';
  end if;
  if p_result <> 'delivered' then
    if p_reason_key is null or btrim(p_reason_key) = '' then
      raise exception 'a non-completed attempt states its reason'
        using errcode = '22023', detail = 'reason_required';
    end if;
    if p_where_goods is null
       or p_where_goods not in ('returned_to_warehouse','still_with_logistics','with_customer') then
      raise exception 'a non-completed attempt states where the goods are'
        using errcode = '22023', detail = 'where_goods_required';
    end if;
  elsif coalesce(array_length(p_delivered_item_ids, 1), 0) > 0 or jsonb_array_length(coalesce(p_returned, '[]'::jsonb)) > 0 then
    raise exception 'an intermediate leg arrival moves no Unit — the goods are still Carres'' until the customer leg'
      using errcode = '22023', detail = 'leg_arrival_moves_nothing';
  end if;
  if p_result = 'partial' and coalesce(array_length(p_delivered_item_ids, 1), 0) = 0 then
    raise exception 'a partial attempt names at least one delivered unit'
      using errcode = '22023', detail = 'partial_needs_delivered_units';
  end if;
  if p_result = 'failed' and coalesce(array_length(p_delivered_item_ids, 1), 0) > 0 then
    raise exception 'a failed attempt delivered nothing — record partial instead'
      using errcode = '22023', detail = 'failed_delivers_nothing';
  end if;

  select confirmed_date into v_confirmed
    from ops_order_control where order_id = p_order_id;
  if coalesce(p_leg, 0) > 0 then
    -- The leg's own agreed day (0386, keyed (order_id, leg)).
    select a.confirmed_date into v_confirmed
      from ops_delivery_arrangements a where a.order_id = p_order_id and a.leg = p_leg;
  end if;

  select coalesce(max(attempt_no), 0) + 1 into v_no
    from delivery_attempts where order_id = p_order_id;

  insert into delivery_attempts
    (order_id, attempt_no, result, reason_key, where_goods, note, do_number,
     logistics_name, scheduled_date, recorded_by, leg)
  values
    (p_order_id, v_no, p_result,
     case when p_result = 'delivered' then null else btrim(p_reason_key) end,
     case when p_result = 'delivered' then null else p_where_goods end,
     nullif(btrim(coalesce(p_note,'')),''),
     -- 0491: a leg's attempt names the LEG's document, never the order's mirror.
     case when coalesce(p_leg, 0) > 0 then v_leg_doc.do_number else v_order.do_number end,
     case when coalesce(p_leg, 0) > 0
          then coalesce((select p.name from ops_delivery_arrangements a join delivery_partners p on p.id = a.partner_id
                           where a.order_id = p_order_id and a.leg = p_leg),
                        v_leg_stop->>'partner_name')
          else coalesce((select name from delivery_partners where id = v_order.delivery_partner_id),
                        (select name from delivery_partners where id = v_order.ops_assigned_logistic)) end,
     v_confirmed,
     v_uid,
     coalesce(p_leg, 0))
  returning * into v_attempt;

  -- 0491 · The chain's own leg record (0156) keeps its status words; the
  -- attempt is the record, the stop mirrors it for the legacy readers.
  if coalesce(p_leg, 0) > 0 then
    -- 0496: `with ordinality` makes the alias a two-column record, so the
    -- element must be named — `s.value`, never `s` (production 2026-09-13:
    -- `operator does not exist: record ->> unknown` on the first leg arrival).
    select s.ord - 1 into v_idx
      from jsonb_array_elements(v_stops) with ordinality as s(value, ord)
     where (s.value->>'leg')::int = p_leg;
    if v_idx is not null then
      update orders
         set delivery_stops = jsonb_set(v_stops, array[v_idx::text],
               (v_stops -> v_idx) || case when p_result = 'delivered'
                 then jsonb_build_object('status', 'handed_off', 'handed_off_at', now())
                 else jsonb_build_object('status', 'issue') end),
             updated_at = now()
       where id = p_order_id;
    end if;
  end if;

  -- Delivered units: only a unit RESERVED TO THIS SO can be delivered —
  -- anything else is the silent allocation Card 2 closed.
  foreach v_item in array coalesce(p_delivered_item_ids, '{}'::uuid[]) loop
    select * into v_row from ops_stock_items where id = v_item for update;
    if not found then
      raise exception 'unit % not found', v_item using errcode = '42P01', detail = 'unit_not_found';
    end if;
    if v_row.status <> 'reserved' or v_row.reserved_ref is distinct from v_so_ref then
      raise exception 'unit % is not reserved to % — reserve first, then deliver', v_item, v_so_ref
        using errcode = 'P0001', detail = 'unit_not_reserved_to_order';
    end if;
    update ops_stock_items
       set status = 'sold',
           sold_at = now(),
           sold_order_id = p_order_id,
           ref_history = array_append(coalesce(ref_history, '{}'::text[]), v_so_ref),
           updated_at = now()
     where id = v_item;
    insert into delivery_attempt_units (attempt_id, item_id, outcome)
    values (v_attempt.id, v_item, 'delivered');
    v_delivered := v_delivered + 1;
  end loop;

  -- Returned units move through Card 2's own doors — composed, never copied.
  for v_ret in select * from jsonb_array_elements(coalesce(p_returned, '[]'::jsonb)) loop
    v_item := (v_ret->>'item_id')::uuid;
    v_action := v_ret->>'action';
    if v_item is null or v_action is null
       or v_action not in ('back_to_pool','inspection_hold') then
      raise exception 'a returned unit names its door (back_to_pool · inspection_hold)'
        using errcode = '22023', detail = 'bad_return_action';
    end if;
    select * into v_row from ops_stock_items where id = v_item;
    if not found then
      raise exception 'unit % not found', v_item using errcode = '42P01', detail = 'unit_not_found';
    end if;
    if v_row.status <> 'reserved' or v_row.reserved_ref is distinct from v_so_ref then
      raise exception 'unit % is not reserved to % — nothing to return', v_item, v_so_ref
        using errcode = 'P0001', detail = 'unit_not_reserved_to_order';
    end if;
    if v_action = 'back_to_pool' then
      select public.ops_stock_release(v_item) into v_released;
      if v_released is null then
        raise exception 'unit % could not be released', v_item
          using errcode = 'P0001', detail = 'release_failed';
      end if;
      insert into delivery_attempt_units (attempt_id, item_id, outcome)
      values (v_attempt.id, v_item, 'returned_to_pool');
    else
      -- 0491 (Delivery MASTER §4, §7): a Logistics report never substitutes for
      -- the Warehouse's actual receipt. The Unit stays reserved and comes back
      -- through Inbound as `Check required`; the immediate hold is retired.
      insert into delivery_attempt_units (attempt_id, item_id, outcome)
      values (v_attempt.id, v_item, 'inspection_hold');
    end if;
    v_returned := v_returned + 1;
  end loop;

  -- 0491 · Returned goods enter Inbound as `Check required` (§7): every Unit the
  -- visit's own document required that did not reach the customer and is still
  -- reserved to this order rides ONE failed-delivery-return arrival, bound to
  -- this Delivery Visit, from the partner's operating party to the order's
  -- warehouse. The plan is what Warehouse receives against; nothing here
  -- moves a holder. A plan that cannot be made is SAID, never hidden.
  if p_result in ('partial','failed') and p_where_goods in ('returned_to_warehouse','still_with_logistics') then
    select coalesce(array_agg(du.item_id order by du.item_id), '{}'::uuid[]) into v_return_units
      from delivery_order_units du
      join ops_delivery_orders d on d.id = du.delivery_order_id
      join ops_stock_items i on i.id = du.item_id
     where d.order_id = p_order_id
       and d.do_number is not distinct from v_attempt.do_number
       and not (du.item_id = any(coalesce(p_delivered_item_ids, '{}'::uuid[])))
       and i.status = 'reserved' and i.reserved_ref = v_so_ref;
    if coalesce(array_length(v_return_units, 1), 0) > 0 then
      select p.operating_party_id into v_party
        from delivery_partners p
       where p.name = v_attempt.logistics_name
          or p.id in (v_order.delivery_partner_id, v_order.ops_assigned_logistic)
       order by (p.name = v_attempt.logistics_name) desc limit 1;
      v_source_id := md5(v_attempt.id::text || ':failed-delivery-return')::uuid;
      begin
        if v_party is null then
          raise exception 'the logistics partner has no operating party' using errcode = '22023';
        end if;
        if v_order.warehouse_id is null then
          raise exception 'the order names no warehouse to return to' using errcode = '22023';
        end if;
        v_source := public.arrival_source_create(jsonb_build_object(
          'id', v_source_id,
          'kind', 'failed-delivery-return',
          'attempt_id', v_attempt.id,
          'claim_id', null, 'case_id', null,
          'from_site_id', null,
          'to_site_id', v_order.warehouse_id,
          'party_id', v_party,
          'expected_date', (now() at time zone 'Asia/Kuala_Lumpur')::date,
          'collection_date', null,
          'reason', format('Failed Delivery · %s · goods %s', btrim(p_reason_key), replace(p_where_goods, '_', ' ')),
          'unit_ids', to_jsonb(v_return_units),
          'sales_order_ref', v_so_ref));
      exception when others then
        v_arrival_error := sqlerrm;
        insert into order_history (order_id, text, by_role)
        values (p_order_id, format('Returned goods could not be planned into Inbound — %s', sqlerrm), 'operation');
      end;
    end if;
  end if;

  -- The order's own timeline. The order STATUS is deliberately untouched:
  -- partial stays Scheduled (the 5-stage lock), failed stays where it was —
  -- the exception is the record, the Work engine derives what happens next.
  insert into order_history (order_id, text, by_role)
  values (p_order_id,
          case when p_result = 'delivered'
               then format('Delivery attempt %s · leg %s arrived · %s', v_no, p_leg, coalesce(v_leg_stop->>'to_loc', 'named warehouse'))
               else format('Delivery attempt %s · %s · %s · goods: %s%s%s',
                 v_no, p_result, btrim(p_reason_key), p_where_goods,
                 case when v_delivered > 0
                      then format(' · %s unit(s) delivered', v_delivered) else '' end,
                 case when coalesce(p_leg, 0) > 0 then format(' · leg %s', p_leg) else '' end) end,
          'operation');

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Delivery attempt %s recorded · %s · %s', v_no, p_result, coalesce(btrim(p_reason_key), 'leg ' || p_leg::text)),
          v_so_ref);

  return jsonb_build_object(
    'attempt', to_jsonb(v_attempt),
    'units_delivered', v_delivered,
    'units_returned', v_returned,
    'arrival_source', v_source,
    'arrival_error', v_arrival_error
  );
end;
$fn$;

revoke all on function public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb,int) from public;
revoke all on function public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb,int) from anon;
grant execute on function public.delivery_attempt_record(uuid,text,text,text,text,uuid[],jsonb,int) to authenticated;
