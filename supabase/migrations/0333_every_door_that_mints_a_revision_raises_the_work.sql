-- 0333 · EVERY DOOR THAT MINTS A REVISION RAISES THE WORK
-- (STAGE 3 · card 3.4 — the wiring)
--
-- 0332 built the durable work. This wires it to the two doors that mint a
-- revision TODAY, and it is deliberately hung on the mint rather than on any
-- one verb: a consequence follows from the document CHANGING, not from which
-- button changed it. When 3.8's Class-A APPLY lands it mints a revision like
-- the others and inherits this for free.
--
--   sales_order_save_revision       Class B direct correction  → class 'B'
--   sales_order_apply_attribution   Class B + Test 3           → class 'B'
--
-- Both are Class B: Stage 3 has no Class A door yet, by the owner wall.
--
-- THE RAISE NEVER FAILS THE WRITE. The revision is the record of what the
-- business did; correction work is a consequence of it. If raising the work
-- errored and took the save down with it, a defect in the consequence engine
-- would stop the business from recording facts — so it is caught and logged
-- as a warning, and the change stands. A missed work row is visible (the PO
-- is still there to look at); a refused save is a portal that does not work.
--
-- Both function bodies are 0329's, unchanged apart from the added call.

create or replace function public.sales_order_save_revision(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := public.app_role();
  v_order     orders%rowtype;
  v_changed   text[] := '{}';
  v_next      int;
  v_line      jsonb;
  v_keep_ids  uuid[] := '{}';
  v_id        uuid;
  v_old       jsonb;
  v_new       jsonb;
  v_keys      text[] := array[
    'customer_name','customer_phone','customer_email','customer_address',
    'customer_address_line1','customer_address_line2','customer_address_city',
    'customer_address_state','customer_address_postcode','customer_emergency',
    'customer_billing','delivery_date','delivery_date_tbd','proceed_date',
    'delivery_floor','delivery_has_lift'
  ];
  v_key       text;
  v_work      int := 0;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_header ? 'salesperson_id' or p_header ? 'outlet_id'
     or p_header ? 'dealer_id' or p_header ? 'channel' then
    raise exception 'Attribution moves by request - submit an attribution change for approval'
      using errcode = '22023', detail = 'attribution_by_request';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if (p_header is null or p_header = '{}'::jsonb) and p_lines is null then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  v_old := public.sales_order_snapshot(p_order_id);
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, v_old, auth.uid());
  end if;

  foreach v_key in array v_keys loop
    if p_header ? v_key then
      case v_key
        when 'delivery_date' then
          update orders set delivery_date = nullif(p_header->>'delivery_date','')::date where id = p_order_id;
        when 'proceed_date' then
          update orders set proceed_date = nullif(p_header->>'proceed_date','')::date where id = p_order_id;
        when 'delivery_date_tbd' then
          update orders set delivery_date_tbd = coalesce((p_header->>'delivery_date_tbd')::boolean, false) where id = p_order_id;
        when 'delivery_floor' then
          update orders set delivery_floor = coalesce((p_header->>'delivery_floor')::int, 1) where id = p_order_id;
        when 'delivery_has_lift' then
          update orders set delivery_has_lift = coalesce((p_header->>'delivery_has_lift')::boolean, false) where id = p_order_id;
        when 'customer_name' then
          if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
            raise exception 'Customer name is required' using errcode = '22023';
          end if;
          update orders set customer_name = trim(p_header->>'customer_name') where id = p_order_id;
        else
          execute format('update orders set %I = $1 where id = $2', v_key)
            using nullif(p_header->>v_key, ''), p_order_id;
      end case;
    end if;
  end loop;

  if p_lines is not null then
    if jsonb_typeof(p_lines) <> 'array' then
      raise exception 'p_lines must be an array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_lines) = 0 then
      raise exception 'An order needs at least one item' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_lines) loop
      if length(trim(coalesce(v_line->>'sku',''))) = 0 then
        raise exception 'A line needs a SKU' using errcode = '22023';
      end if;
      if coalesce((v_line->>'qty')::int, 0) < 1 then
        raise exception 'Line % qty must be at least 1', v_line->>'sku' using errcode = '22023';
      end if;
      if coalesce((v_line->>'unit_price')::numeric, -1) < 0 then
        raise exception 'Line % needs a unit price of 0 or more', v_line->>'sku' using errcode = '22023';
      end if;
      if v_line ? 'id' and nullif(v_line->>'id','') is not null then
        v_id := (v_line->>'id')::uuid;
        update order_lines
           set sku = trim(v_line->>'sku'),
               qty = (v_line->>'qty')::int,
               unit_price = (v_line->>'unit_price')::numeric
         where id = v_id and order_id = p_order_id;
        if not found then
          raise exception 'Line % does not belong to this order', v_id using errcode = '22023';
        end if;
      else
        insert into order_lines(order_id, sku, qty, unit_price)
        values (p_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric)
        returning id into v_id;
      end if;
      v_keep_ids := array_append(v_keep_ids, v_id);
    end loop;
    delete from order_lines
     where order_id = p_order_id
       and not (id = any(v_keep_ids));
  end if;

  v_new := public.sales_order_snapshot(p_order_id);
  if v_new = v_old then
    raise exception 'Nothing changed' using errcode = '22023';
  end if;

  foreach v_key in array v_keys loop
    if (v_old->'header'->v_key) is distinct from (v_new->'header'->v_key) then
      v_changed := array_append(v_changed, v_key);
    end if;
  end loop;
  if (v_old->'lines') is distinct from (v_new->'lines') then
    v_changed := array_append(v_changed, 'items');
  end if;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = p_order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (p_order_id, v_next, v_new, auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Order edited - Rev ' || v_next || ' - ' || array_to_string(v_changed, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','edit','changed', to_jsonb(v_changed), 'revision', v_next));

  -- 3.4 · the consequence outlives the tab. `items` is the evaluator's
  -- `order_lines`; every other changed key already carries its own name.
  begin
    v_work := public._raise_correction_work(
      p_order_id,
      array(select case when k = 'items' then 'order_lines' else k end
              from unnest(v_changed) k),
      v_next, 'B');
  exception when others then
    raise warning 'correction work not raised for % rev %: %', p_order_id, v_next, sqlerrm;
  end;

  return jsonb_build_object('revision', v_next, 'changed', to_jsonb(v_changed),
                            'correction_work_raised', v_work);
end $$;

create or replace function public.sales_order_apply_attribution(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.app_role();
  v_req      order_change_requests%rowtype;
  v_order    orders%rowtype;
  v_changes  jsonb;
  v_fields   text[];
  v_floors   jsonb;
  v_block    jsonb;
  v_old      jsonb;
  v_next     int;
  v_work     int := 0;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  select * into v_req from order_change_requests where id = p_request_id for update;
  if not found or v_req.kind <> 'attribution' then
    raise exception 'Attribution request not found' using errcode = 'P0002';
  end if;
  if v_req.applied_at is not null then
    return jsonb_build_object('id', p_request_id, 'already_applied', true);
  end if;
  if v_req.status <> 'approved' then
    raise exception 'Only an approved request can be applied'
      using errcode = '22023', detail = 'not_approved';
  end if;

  select * into v_order from orders where id = v_req.order_id for update;
  v_changes := v_req.payload->'changes';
  v_fields  := array(select jsonb_object_keys(v_changes));

  v_floors := public.sales_order_floors(v_req.order_id, v_fields);
  select f into v_block from jsonb_array_elements(v_floors->'findings') f
   where f->>'severity' = 'BLOCK' limit 1;
  if v_block is not null then
    raise exception '%', v_block->>'evidence' using errcode = '22023', detail = 'floor_blocked';
  end if;

  v_old := public.sales_order_snapshot(v_req.order_id);
  if not exists (select 1 from sales_order_revisions where order_id = v_req.order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (v_req.order_id, 1, v_old, auth.uid());
  end if;

  update orders set
    salesperson_id = case when v_changes ? 'salesperson_id'
                          then nullif(v_changes->>'salesperson_id','')::uuid
                          else salesperson_id end,
    dealer_id      = case when v_changes ? 'dealer_id'
                          then (v_changes->>'dealer_id')::uuid
                          else dealer_id end,
    outlet_id      = case when v_changes ? 'outlet_id'
                          then nullif(v_changes->>'outlet_id','')::uuid
                          else outlet_id end,
    channel        = case when v_changes ? 'channel'
                          then v_changes->>'channel'
                          else channel end,
    updated_at     = now()
  where id = v_req.order_id;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = v_req.order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_req.order_id, v_next, public.sales_order_snapshot(v_req.order_id), auth.uid());

  update order_change_requests set applied_at = now() where id = p_request_id;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (v_req.order_id,
          'Attribution change applied - Rev ' || v_next || ' - ' || array_to_string(v_fields, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','attribution_applied','fields',to_jsonb(v_fields),'revision',v_next));

  -- 3.4 · the same call as SAVE's. Attribution raises NOTHING today, and that
  -- is the correct answer, not a gap: GATE 6 gives it one consequence (the
  -- commission month lock) and that consequence is a floor, never work.
  begin
    v_work := public._raise_correction_work(v_req.order_id, v_fields, v_next, 'B');
  exception when others then
    raise warning 'correction work not raised for % rev %: %', v_req.order_id, v_next, sqlerrm;
  end;

  return jsonb_build_object('id', p_request_id, 'revision', v_next,
                            'changed', to_jsonb(v_fields), 'findings', v_floors->'findings',
                            'correction_work_raised', v_work);
end $$;
