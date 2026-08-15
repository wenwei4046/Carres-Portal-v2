-- 0354_the_object_page_edits_every_field_the_portal_asked.sql
--
-- ⭐ SALES ORDER OBJECT PAGE V2 — owner ruling 2026-08-15.
--
-- THE DEFECT THIS CLOSES. The Sales Portal asks the customer a set of
-- questions at order entry. The Sales Order object page was built to correct
-- "contact and operational facts", and `sales_order_save_revision` was given a
-- SIXTEEN-key allowlist to do it. Seven of the questions the portal actually
-- asks are outside that list, so the operator could READ them and never fix
-- them:
--
--   customer_race · customer_gender · customer_birthday   (0200 demographics)
--   customer_address_unknown · customer_billing_same      (0230 address gates)
--   delivery_stair_items                                  (0104 access)
--   entry_data.fields                                     (0219 building type
--                                                          + operator customs)
--
-- A wrong birthday typed at the showroom had no door in the portal at all.
--
-- WHAT DOES NOT CHANGE, and this is the boundary, not an omission:
--   · GOODS, PRICE and `Customer Delivery` stay OUT of this writer. They are
--     what the customer agreed to; they move through the amendment machinery,
--     which mints its own revision (`sales_order_submit_amendment`).
--   · ATTRIBUTION (salesperson · showroom · dealer · channel) stays refused by
--     this function — 0329's request lane still owns who gets paid.
--   · Nothing is normalised, repaired or back-filled. `customer_emergency`
--     remains ONE text column; the object page parses it into three fields and
--     recomposes it with the same codec the POS submits with
--     (`packages/shared/src/sales-order-form.ts`), so an untouched legacy
--     string round-trips character for character.
--
-- 2 · THE AMENDMENT NAMES THE DAY THE CUSTOMER ASKED. `AMEND DELIVERY DATE`
--     is three fields (owner ruling 2026-08-15): the date the customer asked,
--     the new delivery date, and the mandatory reason. The middle one already
--     had a home in `proposed_snapshot` and the last one in `reason`; the
--     first had none, and folding it into the reason sentence would make a
--     date a substring. It becomes a column.
--
-- Every row in this database is test data (CLAUDE.md §6): this migration owns
-- SCHEMA and FUNCTIONS only, asserts no row count and rewrites no value.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · the snapshot sees what the form can now change
--
-- A revision is only as complete as the snapshot behind it: a field the
-- snapshot cannot see produces `Nothing changed` on save and leaves no
-- Before/After for the ledger. Old revisions keep their old shape — every
-- reader takes these keys as optional, which is what a snapshot IS.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sales_order_snapshot(p_order_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'header', (
      select jsonb_build_object(
        'so',o.so,'status',o.status,'channel',o.channel,'dealer_id',o.dealer_id,
        'outlet_id',o.outlet_id,'salesperson_id',o.salesperson_id,
        'customer_name',o.customer_name,'customer_phone',o.customer_phone,
        'customer_email',o.customer_email,'customer_address',o.customer_address,
        'customer_address_line1',o.customer_address_line1,'customer_address_line2',o.customer_address_line2,
        'customer_address_city',o.customer_address_city,'customer_address_state',o.customer_address_state,
        'customer_address_postcode',o.customer_address_postcode,'customer_emergency',o.customer_emergency,
        'customer_billing',o.customer_billing,'delivery_date',o.delivery_date,
        'delivery_date_tbd',o.delivery_date_tbd,'proceed_date',o.proceed_date,
        'delivery_floor',o.delivery_floor,'delivery_has_lift',o.delivery_has_lift,
        'installment_months',o.installment_months,'placed_at',o.placed_at,
        -- 0354 — the portal's remaining questions.
        'customer_race',o.customer_race,'customer_gender',o.customer_gender,
        'customer_birthday',o.customer_birthday,
        'customer_address_unknown',o.customer_address_unknown,
        'customer_billing_same',o.customer_billing_same,
        'delivery_stair_items',o.delivery_stair_items,
        'entry_fields',coalesce(o.entry_data->'fields','{}'::jsonb),
        'salesperson_name',sp.name,'outlet_name',ol.name,'dealer_name',d.name)
      from orders o left join salespersons sp on sp.id=o.salesperson_id
      left join outlets ol on ol.id=o.outlet_id left join dealers d on d.id=o.dealer_id
      where o.id=p_order_id),
    'lines',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'sku',l.sku,'qty',l.qty,'unit_price',l.unit_price,'attrs',l.attrs,
      'source_po',l.source_po,'description',case
        when pm.name is not null and nullif(trim(ps.variant),'') is not null then pm.name||' ('||ps.variant||')'
        when pm.name is not null then pm.name else null end) order by l.created_at,l.id)
      from order_lines l left join product_skus ps on ps.sku=l.sku
      left join product_models pm on pm.id=ps.model_id where l.order_id=p_order_id),'[]'::jsonb),
    'addons',coalesce((select jsonb_agg(jsonb_build_object(
      'addon_key',a.addon_key,'qty',a.qty,'unit_price',a.unit_price,'attrs',a.attrs) order by a.id)
      from order_addons a where a.order_id=p_order_id),'[]'::jsonb)
  )
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · the edit door — 0340's body, seven keys wider
--
-- DROP + CREATE (the repo's ghost-overload discipline): the signature is
-- unchanged, so every existing caller is unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb);

create function public.sales_order_save_revision(
  p_order_id uuid,
  p_header   jsonb default '{}'::jsonb,
  p_lines    jsonb default null,
  p_change   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        text := public.app_role();
  v_order       orders%rowtype;
  v_changed     text[] := '{}';
  v_next        int;
  v_line        jsonb;
  v_keep_ids    uuid[] := '{}';
  v_id          uuid;
  v_old         jsonb;
  v_new         jsonb;
  v_keys        text[] := array[
    'customer_name','customer_phone','customer_email','customer_address',
    'customer_address_line1','customer_address_line2','customer_address_city',
    'customer_address_state','customer_address_postcode','customer_emergency',
    'customer_billing','delivery_date','delivery_date_tbd','proceed_date',
    'delivery_floor','delivery_has_lift',
    -- 0354 · every remaining question the Sales Portal asks
    'customer_race','customer_gender','customer_birthday',
    'customer_address_unknown','customer_billing_same','delivery_stair_items',
    'entry_fields'
  ];
  v_key         text;
  v_work        int := 0;
  v_change_type text;
  v_note        text;
  v_contractual boolean;
  v_thread      record;
  v_floor       jsonb;
  v_floor_names text[];
  v_proposed    jsonb := null;
  v_fields      jsonb;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_header ? 'salesperson_id' or p_header ? 'outlet_id'
     or p_header ? 'dealer_id' or p_header ? 'channel' then
    raise exception 'Attribution moves by request - submit an attribution change for approval'
      using errcode = '22023', detail = 'attribution_by_request';
  end if;

  -- The cause, validated up front. Whether it is REQUIRED is decided after
  -- the diff — only a change that moves the contractual fields demands it.
  if p_change is not null then
    if jsonb_typeof(p_change) <> 'object' then
      raise exception 'p_change must be an object' using errcode = '22023';
    end if;
    v_change_type := nullif(trim(coalesce(p_change->>'change_type','')), '');
    v_note        := nullif(trim(coalesce(p_change->>'note','')), '');
    if v_change_type is not null
       and v_change_type not in ('staff_correction','customer_change') then
      raise exception 'change_type must be staff_correction or customer_change'
        using errcode = '22023', detail = 'invalid_change_type';
    end if;
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if (p_header is null or p_header = '{}'::jsonb) and p_lines is null then
    raise exception 'Nothing to save' using errcode = '22023';
  end if;

  -- 0257 parity + Card 1 §7: a line with a live procurement thread is a
  -- production commitment. Removing it (the delete would CASCADE the thread,
  -- 0124) or changing its SKU refuses BEFORE anything is written. Qty and
  -- price edits pass through — the received floor and the operation gate
  -- speak to those below.
  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
    for v_thread in
      select ol.id, ol.sku
        from order_lines ol
       where ol.order_id = p_order_id
         and exists (select 1 from order_supplier_threads t where t.order_line_id = ol.id)
    loop
      select l into v_line
        from jsonb_array_elements(p_lines) l
       where nullif(l->>'id','') is not null
         and (l->>'id')::uuid = v_thread.id;
      if v_line is null then
        raise exception 'Line % is in production - it cannot be removed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
      if trim(coalesce(v_line->>'sku','')) is distinct from v_thread.sku then
        raise exception 'Line % is in production - its item cannot be changed here', v_thread.sku
          using errcode = '22023', detail = 'line_in_production';
      end if;
    end loop;
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
        -- 0354 · the typed columns cannot ride the generic text path.
        when 'customer_birthday' then
          update orders set customer_birthday = nullif(p_header->>'customer_birthday','')::date where id = p_order_id;
        when 'customer_address_unknown' then
          update orders set customer_address_unknown = coalesce((p_header->>'customer_address_unknown')::boolean, false) where id = p_order_id;
        when 'customer_billing_same' then
          update orders set customer_billing_same = coalesce((p_header->>'customer_billing_same')::boolean, true) where id = p_order_id;
        when 'delivery_stair_items' then
          update orders set delivery_stair_items = nullif(p_header->>'delivery_stair_items','')::int where id = p_order_id;
        -- 0219's bag: the building type and the operator's own fields. MERGED,
        -- never replaced — the form sends the keys it renders, and a config
        -- field retired last month must not be erased by an unrelated save.
        -- An explicit JSON null CLEARS one key, which is how the form empties
        -- a field the operator blanked.
        when 'entry_fields' then
          if jsonb_typeof(p_header->'entry_fields') <> 'object' then
            raise exception 'entry_fields must be an object' using errcode = '22023';
          end if;
          v_fields := coalesce(v_order.entry_data->'fields','{}'::jsonb) || (p_header->'entry_fields');
          v_fields := coalesce((
            select jsonb_object_agg(k, val)
              from jsonb_each(v_fields) e(k, val)
             where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
          ), '{}'::jsonb);
          update orders
             set entry_data = jsonb_set(
                   coalesce(entry_data, '{}'::jsonb), '{fields}', v_fields, true)
           where id = p_order_id;
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

  -- CARD 1 §3 · a contractual change states its cause; a pure Class-B
  -- correction (contact / address / floor / proceed_date) IS a correction.
  v_contractual := ('items' = any(v_changed))
                or ('delivery_date' = any(v_changed))
                or ('delivery_date_tbd' = any(v_changed));
  if v_contractual and v_change_type is null then
    raise exception 'Say who asked: staff correction or customer change'
      using errcode = '22023', detail = 'change_type_required';
  end if;
  if not v_contractual then
    v_change_type := coalesce(v_change_type, 'staff_correction');
  end if;

  -- THE FLOORS BITE (0328, GATE 6/7) — evaluated on what ACTUALLY changed,
  -- inside the same transaction; any BLOCK rolls the whole save back.
  v_floor_names := array(select case when k = 'items' then 'order_lines' else k end
                           from unnest(v_changed) k);
  if 'order_lines' = any(v_floor_names) then
    select jsonb_agg(jsonb_build_object('sku', sku, 'qty', qty))
      into v_proposed
      from order_lines where order_id = p_order_id;
  end if;
  for v_floor in
    select f from jsonb_array_elements(
      public.sales_order_floors(p_order_id, v_floor_names, v_proposed)->'findings') f
    where f->>'severity' = 'BLOCK'
  loop
    raise exception '%', coalesce(v_floor->>'evidence', 'Blocked by a downstream floor')
      using errcode = '22023', detail = 'blocked_by_floor';
  end loop;

  select coalesce(max(revision), 1) + 1 into v_next
    from sales_order_revisions where order_id = p_order_id;
  insert into sales_order_revisions(order_id, revision, snapshot, created_by, change_type, note)
  values (p_order_id, v_next, v_new, auth.uid(), v_change_type, v_note);

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          case v_change_type
            when 'customer_change' then 'Customer change - Rev '
            else 'Staff correction - Rev '
          end || v_next || ' - ' || array_to_string(v_changed, ', '),
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','edit','changed', to_jsonb(v_changed), 'revision', v_next,
                             'change_type', v_change_type, 'note', v_note));

  -- 3.4 · the consequence outlives the tab (0332/0333, unchanged).
  begin
    v_work := public._raise_correction_work(p_order_id, v_floor_names, v_next, 'B');
  exception when others then
    raise warning 'correction work not raised for % rev %: %', p_order_id, v_next, sqlerrm;
  end;

  return jsonb_build_object('revision', v_next, 'changed', to_jsonb(v_changed),
                            'change_type', v_change_type,
                            'correction_work_raised', v_work);
end $$;

revoke all on function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.sales_order_save_revision(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · AMEND DELIVERY DATE names the day the customer asked
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.sales_order_amendments
  add column if not exists customer_asked_on date;

comment on column public.sales_order_amendments.customer_asked_on is
  '0354 - the day the CUSTOMER asked for the change, as the operator was told it. Not submitted_at: a request phoned in on Monday and typed on Thursday is a Monday request, and six months later the difference is the whole answer to "why did the promise move".';

drop function public.sales_order_submit_amendment(uuid, jsonb, text);

create function public.sales_order_submit_amendment(
  p_order_id         uuid,
  p_proposed         jsonb,
  p_reason           text default null,
  p_customer_asked_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_rev  int;
  v_hash text;
  v_id   uuid;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if p_proposed is null or jsonb_typeof(p_proposed) <> 'object' then
    raise exception 'A proposal is required' using errcode = '22023';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  -- A day the customer has not reached yet is a typo, not a request.
  if p_customer_asked_on is not null and p_customer_asked_on > current_date then
    raise exception 'The customer cannot have asked on a future day'
      using errcode = '22023', detail = 'asked_on_in_future';
  end if;

  -- The document is computed FROM the current revision. Mint Rev 1 first if
  -- the order has never been touched, so `base_revision` always points at a
  -- snapshot that exists (0327's pattern).
  if not exists (select 1 from sales_order_revisions where order_id = p_order_id) then
    insert into sales_order_revisions(order_id, revision, snapshot, created_by)
    values (p_order_id, 1, public.sales_order_snapshot(p_order_id), auth.uid());
  end if;
  select max(revision) into v_rev from sales_order_revisions where order_id = p_order_id;
  v_hash := public.sales_order_contractual_hash(p_order_id);

  begin
    insert into sales_order_amendments(
      order_id, base_revision, base_contractual_hash, proposed_snapshot, reason,
      status, submitted_by, customer_asked_on)
    values (p_order_id, v_rev, v_hash, p_proposed, nullif(trim(coalesce(p_reason,'')),''),
            'submitted', auth.uid(), p_customer_asked_on)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'An amendment is already open on this sales order'
      using errcode = '22023', detail = 'amendment_exists';
  end;

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (p_order_id,
          'Amendment submitted - from Rev ' || v_rev,
          v_role::app_role, auth.uid(),
          jsonb_build_object('kind','amendment_submitted','amendment_id',v_id,
                             'base_revision',v_rev,
                             'customer_asked_on',p_customer_asked_on));
  return jsonb_build_object('id', v_id, 'base_revision', v_rev,
                            'base_contractual_hash', v_hash, 'status', 'submitted');
end $$;

revoke all on function public.sales_order_submit_amendment(uuid, jsonb, text, date) from public;
grant execute on function public.sales_order_submit_amendment(uuid, jsonb, text, date) to authenticated;

-- The live read carries the new fact, so the object page's pending banner can
-- state what the customer asked and when.
create or replace function public.sales_order_amendment_live(p_order_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_role text := public.app_role();
  v_a    sales_order_amendments%rowtype;
  v_now  text;
begin
  if v_role not in ('operation','principal','finance','hr','bd') then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  select * into v_a from sales_order_amendments
   where order_id = p_order_id
     and status in ('draft','submitted','issued','accepted')
   order by submitted_at desc limit 1;
  if not found then
    return jsonb_build_object('amendment', null);
  end if;
  v_now := public.sales_order_contractual_hash(p_order_id);
  return jsonb_build_object('amendment', jsonb_build_object(
    'id', v_a.id,
    'status', v_a.status,
    'reason', v_a.reason,
    'customer_asked_on', v_a.customer_asked_on,
    'base_revision', v_a.base_revision,
    'base_contractual_hash', v_a.base_contractual_hash,
    'current_contractual_hash', v_now,
    'stale', v_now is distinct from v_a.base_contractual_hash,
    'proposed_snapshot', v_a.proposed_snapshot,
    'submitted_at', v_a.submitted_at));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · the office birth door writes the same questions it asks
--
-- `sales_order_create` reads its header key by key and IGNORES anything it does
-- not name — so without this the office [+ New Sales Order] form would collect
-- the demographics and the building type and drop them on the floor. Same
-- columns as §2, same allowlist discipline, and Rev 1 is still minted from the
-- created state.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sales_order_create(
  p_header jsonb,
  p_lines  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.app_role();
  v_order_id uuid;
  v_so       int;
  v_line     jsonb;
  v_fields   jsonb := '{}'::jsonb;
begin
  if v_role not in ('operation','principal') then
    raise exception 'Operation/Principal only' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_header->>'customer_name',''))) = 0 then
    raise exception 'Customer name is required' using errcode = '22023';
  end if;
  if nullif(p_header->>'dealer_id','') is null then
    raise exception 'A dealer is required' using errcode = '22023';
  end if;
  -- orders_salesperson_required (0296): every order the portal writes names
  -- who sold it. Refused here with a sentence, before the constraint speaks.
  if nullif(p_header->>'salesperson_id','') is null then
    raise exception 'A salesperson is required' using errcode = '22023';
  end if;

  if p_header ? 'entry_fields' then
    if jsonb_typeof(p_header->'entry_fields') <> 'object' then
      raise exception 'entry_fields must be an object' using errcode = '22023';
    end if;
    v_fields := coalesce((
      select jsonb_object_agg(k, val)
        from jsonb_each(p_header->'entry_fields') e(k, val)
       where jsonb_typeof(val) <> 'null' and nullif(trim(val #>> '{}'),'') is not null
    ), '{}'::jsonb);
  end if;

  insert into orders (
    status, channel, dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_email, customer_address,
    customer_address_line1, customer_address_line2, customer_address_city,
    customer_address_state, customer_address_postcode,
    customer_emergency, customer_billing,
    delivery_date, delivery_date_tbd, proceed_date,
    delivery_floor, delivery_has_lift,
    customer_race, customer_gender, customer_birthday,
    customer_address_unknown, customer_billing_same, delivery_stair_items,
    entry_data
  ) values (
    'place',
    case when nullif(p_header->>'outlet_id','') is not null then 'showroom' else 'dealer' end,
    (p_header->>'dealer_id')::uuid,
    nullif(p_header->>'outlet_id','')::uuid,
    nullif(p_header->>'salesperson_id','')::uuid,
    trim(p_header->>'customer_name'),
    nullif(p_header->>'customer_phone',''),
    nullif(p_header->>'customer_email',''),
    nullif(p_header->>'customer_address',''),
    nullif(p_header->>'customer_address_line1',''),
    nullif(p_header->>'customer_address_line2',''),
    nullif(p_header->>'customer_address_city',''),
    nullif(p_header->>'customer_address_state',''),
    nullif(p_header->>'customer_address_postcode',''),
    nullif(p_header->>'customer_emergency',''),
    nullif(p_header->>'customer_billing',''),
    nullif(p_header->>'delivery_date','')::date,
    coalesce((p_header->>'delivery_date_tbd')::boolean, false),
    nullif(p_header->>'proceed_date','')::date,
    coalesce((p_header->>'delivery_floor')::int, 1),
    coalesce((p_header->>'delivery_has_lift')::boolean, false),
    nullif(p_header->>'customer_race',''),
    nullif(p_header->>'customer_gender',''),
    nullif(p_header->>'customer_birthday','')::date,
    coalesce((p_header->>'customer_address_unknown')::boolean, false),
    coalesce((p_header->>'customer_billing_same')::boolean, true),
    nullif(p_header->>'delivery_stair_items','')::int,
    case when v_fields = '{}'::jsonb then null
         else jsonb_build_object('fields', v_fields) end
  )
  returning id, so into v_order_id, v_so;

  if p_lines is not null and jsonb_typeof(p_lines) = 'array' then
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
      insert into order_lines(order_id, sku, qty, unit_price)
      values (v_order_id, trim(v_line->>'sku'), (v_line->>'qty')::int, (v_line->>'unit_price')::numeric);
    end loop;
  end if;

  -- Rev 1 = the created state. The order is BORN with its original on file.
  insert into sales_order_revisions(order_id, revision, snapshot, created_by)
  values (v_order_id, 1, public.sales_order_snapshot(v_order_id), auth.uid());

  insert into order_history(order_id, text, by_role, by_user_id, metadata)
  values (
    v_order_id,
    'Order created (office) · Rev 1',
    v_role::app_role,
    auth.uid(),
    jsonb_build_object('kind','created_office','revision',1)
  );

  return jsonb_build_object('id', v_order_id, 'so', v_so, 'revision', 1);
end $$;

commit;
