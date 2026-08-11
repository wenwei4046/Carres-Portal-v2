-- 0340 · A CHANGE NAMES WHO ASKED FOR IT
-- (SALES ORDER V2 · CARD 1 — CUSTOMER OBLIGATION TRUTH)
--
-- The card's question: for any Sales Order, what is the customer's CURRENT
-- committed order, and how did it become this? The repository already holds
-- both halves of the answer — `orders` + `order_lines` are the current
-- commitment, `sales_order_revisions` (0327) is the immutable lineage — but
-- the ONE edit door could not say WHO a change was for. A staff typo fix and
-- a customer asking for a different model minted indistinguishable revisions.
--
-- THREE THINGS, ALL ADDITIVE:
--
--   1 · `sales_order_revisions.change_type / note` — a revision that moves
--       the CONTRACTUAL fields (items · promised date) must now state its
--       cause: 'staff_correction' (the record was wrong; the customer's
--       agreement never changed) or 'customer_change' (the customer asked
--       for something different). A revision that only fixes contact/address
--       data defaults to 'staff_correction' — a contact fix is by definition
--       a correction, never a customer acceptance event (GATE 1 Class B).
--       Existing rows stay NULL: history is never guessed (Card 1 §13 — no
--       backfill that guesses intent).
--
--   2 · THE FLOORS NOW BITE AT THE DOOR. `sales_order_floors` (0328) was
--       built to be called pre-mutation, and 3.3's attribution APPLY does —
--       but Stage 2's SAVE predates it and enforced nothing: a delivered
--       order's items could be rewritten, a qty could fall below what was
--       already received, an invoiced amount could drift. The save now
--       applies, diffs, evaluates the floors on what ACTUALLY changed, and
--       REFUSES WHOLE on any BLOCK finding (the exception rolls the write
--       back). GATE 7, the received floor and the invoice floor stop being
--       read-only advice. One evaluator, one arithmetic (Law D).
--
--   3 · `line_in_production` PARITY. 0257 gated the POS replace door:
--       deleting/replacing a line that carries an order_supplier_threads row
--       would CASCADE-delete a live procurement thread (0124), so it refuses.
--       The workspace SAVE had the same cascade and no gate. Now: removing a
--       threaded line, or changing its SKU, refuses with the same error the
--       POS door raises. This is also Card 1 §7's protection: a thread is
--       born at the ops confirm — the moment a custom sofa/bedframe gains an
--       irreversible production commitment — and from then on the item
--       cannot be silently rewritten. (There is no per-line "production
--       commitment" fact beyond the thread; none is invented here.)
--
--   4 · `sales_order_commitment_bundle` — ONE authoritative read for the
--       resolver: current snapshot (via `sales_order_snapshot`, the ONE
--       arithmetic 0327 built — Law D), the revision ledger with its new
--       cause labels, and the order's change requests. It reads NOTHING from
--       purchase orders, units, receiving, booking, operation_stage or the
--       drawer pipeline — customer commitment flows DOWN to purchasing,
--       never backwards (Card 1 §1).
--
-- Signature discipline (0153/0154 ghost-overload lesson): the save gains a
-- 4th argument, so the 3-arg form is DROPPED and the 4-arg form CREATED with
-- grants restated. No second overload survives.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · the cause, on the immutable ledger
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.sales_order_revisions
  add column if not exists change_type text
    check (change_type in ('staff_correction','customer_change')),
  add column if not exists note text
    check (note is null or length(note) <= 2000);

comment on column public.sales_order_revisions.change_type is
  'CARD 1 — who asked: staff_correction (the record was wrong) or customer_change (the customer asked for something different). NULL on Rev 1 (the original) and on pre-0340 rows — history is never guessed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · the edit door — same body as 0333, plus the cause, the thread gate and
--     the floors. DROP + CREATE (ghost-overload discipline).
-- ─────────────────────────────────────────────────────────────────────────────
drop function public.sales_order_save_revision(uuid, jsonb, jsonb);

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
    'delivery_floor','delivery_has_lift'
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
-- 3 · the one authoritative read — current commitment + lineage, and NOTHING
--     from purchasing / units / receiving / booking / stages.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sales_order_commitment_bundle(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := public.app_role();
begin
  if v_role not in ('operation','principal','finance','hr','bd') then
    raise exception 'Internal roles only' using errcode = '42501';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'order_id', p_order_id,
    'current', public.sales_order_snapshot(p_order_id),
    'revisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'revision', r.revision,
        'created_at', r.created_at,
        'created_by', r.created_by,
        'change_type', r.change_type,
        'note', r.note,
        'snapshot', r.snapshot
      ) order by r.revision)
      from sales_order_revisions r
      where r.order_id = p_order_id
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'kind', q.kind,
        'status', q.status,
        'requested_at', q.requested_at,
        'requested_by', q.requested_by,
        'decided_at', q.decided_at,
        'decided_by', q.decided_by,
        'applied_at', q.applied_at,
        'payload', q.payload
      ) order by q.requested_at)
      from order_change_requests q
      where q.order_id = p_order_id
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.sales_order_commitment_bundle(uuid) from public;
grant execute on function public.sales_order_commitment_bundle(uuid) to authenticated;

commit;
