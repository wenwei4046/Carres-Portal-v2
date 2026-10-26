-- =============================================================================
-- 0716_office_staff_record_delivery_returns_and_mark_delivered_by_load_scan.sql
--
-- WEISIANG'S DECISION (Mr Lim, Houzs owner side, WhatsApp 2026-10-22, relayed by
-- YH 2026-10-23): "I think just clear Carress rules and Implement Houzs inside".
-- Jess was not part of this decision. Two Houzs behaviours land here:
--
--   1 · Delivery Returns (Houzs DeliveryReturnsListV2). Office staff pick the
--       Units that came back from a DELIVERED Delivery Order; they go straight
--       back into stock (`free`) at the chosen Site, and the return carries a
--       Refund status (Pending · Refunded · Not refunded) as a STATUS ONLY.
--       Finance still owns the money: no payment and no credit note is written.
--       Overturns Jess's Delivery MASTER §7 "REJECT refund/restock assumptions"
--       and "no new return register", the §8 "no Delivery Returns destination"
--       and Stock MASTER §12 "every returned Unit is Check required".
--
--   2 · Load scan (Houzs DoLoadScan). Scanning a DO No or a Unit ID marks the DO
--       Delivered with NO signed DO and NO photo. Overturns Jess's Delivery
--       MASTER §6.1 "a successful customer delivery requires the signed DO and
--       delivery photo". The one delivery door's body moves into
--       `_delivery_mark_delivered`; `operation_attach_do_and_deliver` keeps its
--       signed-DO checks and calls it, the load scan calls it without them.
--       Stock timing is UNCHANGED: Units still become sold at Delivered, not when
--       the DO opens. Carres has two sold points (this door and the partial
--       attempt door, 0496), so moving it was not safe.
-- =============================================================================

set search_path = public;

-- ── 1 · the Delivery Return document ─────────────────────────────────────────

create table if not exists public.delivery_returns (
  id                uuid primary key default gen_random_uuid(),
  return_no         text not null unique,
  order_id          uuid not null references public.orders(id),
  delivery_order_id uuid not null references public.ops_delivery_orders(id),
  warehouse_id      uuid not null references public.warehouses(id),
  reason            text not null check (length(btrim(reason)) > 0),
  refund_status     text not null default 'pending'
                    check (refund_status in ('pending','refunded','not_refunded')),
  refund_status_by  uuid,
  refund_status_at  timestamptz,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

create table if not exists public.delivery_return_units (
  return_id uuid not null references public.delivery_returns(id),
  unit_id   uuid not null references public.ops_stock_items(id),
  primary key (return_id, unit_id)
);

-- Follows Houzs backend/src/scm/routes/delivery-returns.ts:78-79 (a return line
-- points at a DO line with qty_returned) per Weisiang's ruling (2026-10-22):
-- clear Carres rules, implement Houzs. YH chose this (2026-10-26) for DOs with
-- no Unit list. A pre-0424 DO has no line table of its own: it delivered the
-- whole order, so its lines are the order's `order_lines`.
create table if not exists public.delivery_return_lines (
  return_id     uuid not null references public.delivery_returns(id),
  order_line_id uuid not null references public.order_lines(id),
  qty_returned  int  not null check (qty_returned > 0),
  primary key (return_id, order_line_id)
);

-- The Units a DO took out exactly: its 0424 snapshot, or (older DOs) the Units
-- its delivered attempt recorded (0344).
create or replace function public._delivery_order_exact_units(p_doc public.ops_delivery_orders)
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select du.item_id from public.delivery_order_units du where du.delivery_order_id = p_doc.id
  union
  select au.item_id
    from public.delivery_attempts a
    join public.delivery_attempt_units au on au.attempt_id = a.id
   where a.order_id = p_doc.order_id and a.do_number = p_doc.do_number
     and au.outcome = 'delivered'
$$;
revoke execute on function public._delivery_order_exact_units(public.ops_delivery_orders) from public, anon, authenticated;

-- Read for internal staff; writes only through the doors below.
do $$
declare t text;
begin
  foreach t in array array['delivery_returns','delivery_return_units','delivery_return_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_internal', t);
    execute format('create policy %I on public.%I for select using ((select public.is_internal()))',
                   t || '_read_internal', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated, anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 2 · New Delivery Return: picked Units back into stock at a Site ──────────

create or replace function public.delivery_return_record(
  p_delivery_order_id uuid, p_unit_ids uuid[], p_warehouse_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc  public.ops_delivery_orders;
  v_id   uuid := gen_random_uuid();
  v_no   text;
  v_site text;
  u      public.ops_stock_items;
  v_n    int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Write the reason' using errcode = 'P0001', detail = 'reason_required';
  end if;
  if coalesce(cardinality(p_unit_ids), 0) = 0 then
    raise exception 'Pick at least one Unit' using errcode = 'P0001', detail = 'nothing_to_return';
  end if;
  select name into v_site from public.warehouses where id = p_warehouse_id;
  if not found then
    raise exception 'That Site does not exist' using errcode = 'P0001', detail = 'site_not_found';
  end if;
  select * into v_doc from public.ops_delivery_orders
   where id = p_delivery_order_id and voided_at is null;
  if not found then
    raise exception 'That Delivery Order does not exist or is void'
      using errcode = 'P0001', detail = 'do_not_found';
  end if;

  v_no := public.allocate_formal_document_code('DR', v_id::text);
  insert into public.delivery_returns (id, return_no, order_id, delivery_order_id, warehouse_id, reason)
  values (v_id, v_no, v_doc.order_id, v_doc.id, p_warehouse_id, btrim(p_reason));

  for u in select * from public.ops_stock_items
            where id = any(p_unit_ids) order by unit_code for update loop
    if u.id not in (select public._delivery_order_exact_units(v_doc)) then
      raise exception '% is not on %', u.unit_code, v_doc.do_number
        using errcode = 'P0001', detail = 'unit_not_on_do';
    end if;
    if u.status <> 'sold' or u.sold_order_id is distinct from v_doc.order_id then
      raise exception '% was not delivered on %, or is already back in stock', u.unit_code, v_doc.do_number
        using errcode = 'P0001', detail = 'unit_not_delivered';
    end if;
    update public.ops_stock_items
       set status        = 'free',
           warehouse_id  = p_warehouse_id,
           -- Back at the Site, no longer with the carrier: a delivery-operator
           -- holder would refuse the Unit's next DO handover (0440/0560).
           holder_party_id = null,
           reserved_ref  = null,
           reserved_order_line_id = null,
           sold_at       = null,
           sold_order_id = null,
           ref_history   = array_append(coalesce(ref_history, '{}'::text[]), v_no),
           updated_at    = now()
     where id = u.id;
    insert into public.delivery_return_units values (v_id, u.id);
    v_n := v_n + 1;
  end loop;
  if v_n <> cardinality(p_unit_ids) then
    raise exception 'A picked Unit was not found' using errcode = 'P0001', detail = 'unit_not_found';
  end if;

  insert into public.order_history (order_id, text, by_role)
  values (v_doc.order_id,
          format('Delivery Return %s · DO %s · %s unit(s) back in stock at %s · %s',
                 v_no, v_doc.do_number, v_n, v_site, btrim(p_reason)),
          'operation');

  return jsonb_build_object('id', v_id, 'returnNo', v_no, 'units', v_n);
end;
$$;

-- ── 2b · New Delivery Return by DO line and qty (no Unit list) ─────────────
-- Follows Houzs frontend/src/pages/scm-v2/DeliveryReturnFromDo.tsx:8-17 (a
-- line's return qty is 1..remaining, remaining = delivered - already returned)
-- per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
-- Stock: Carres stock is the Unit register, so the qty moves that many Units of
-- the line's SKU that were sold to this order back to `free`. If fewer such
-- Units exist the return is refused: no stock is invented.

create or replace function public.delivery_return_record_lines(
  p_delivery_order_id uuid, p_lines jsonb, p_warehouse_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc   public.ops_delivery_orders;
  v_id    uuid := gen_random_uuid();
  v_no    text;
  v_site  text;
  v_line  record;
  v_ol    public.order_lines;
  v_done  int;
  v_moved int;
  v_total int := 0;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Write the reason' using errcode = 'P0001', detail = 'reason_required';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Pick at least one line' using errcode = 'P0001', detail = 'nothing_to_return';
  end if;
  select name into v_site from public.warehouses where id = p_warehouse_id;
  if not found then
    raise exception 'That Site does not exist' using errcode = 'P0001', detail = 'site_not_found';
  end if;
  select * into v_doc from public.ops_delivery_orders
   where id = p_delivery_order_id and voided_at is null;
  if not found then
    raise exception 'That Delivery Order does not exist or is void'
      using errcode = 'P0001', detail = 'do_not_found';
  end if;
  if exists (select public._delivery_order_exact_units(v_doc)) then
    raise exception '% lists its exact Units: return the Units', v_doc.do_number
      using errcode = 'P0001', detail = 'do_has_units';
  end if;
  -- A pre-0424 DO's goods are the order's lines scoped by trip_groups (NULL =
  -- the whole order, 0356:31-32,72); a split trip or a second Unit-less DO on
  -- the order (0356's materialiser mints one per orders.do_number, 0356:105-140)
  -- means the order's lines are NOT this DO's lines. Refused, not guessed (YH 2026-10-26).
  if v_doc.trip_groups is not null
     or (select count(*) from public.ops_delivery_orders d
          where d.order_id = v_doc.order_id and d.voided_at is null
            and not exists (select public._delivery_order_exact_units(d))) > 1 then
    raise exception '% covers only part of its order, so its lines cannot be told apart. Return by Unit instead.', v_doc.do_number
      using errcode = 'P0001', detail = 'do_not_whole_order';
  end if;
  if not exists (select 1 from public.orders o where o.id = v_doc.order_id and o.status = 'delivered') then
    raise exception '% is not delivered', v_doc.do_number using errcode = 'P0001', detail = 'do_not_delivered';
  end if;

  v_no := public.allocate_formal_document_code('DR', v_id::text);
  insert into public.delivery_returns (id, return_no, order_id, delivery_order_id, warehouse_id, reason)
  values (v_id, v_no, v_doc.order_id, v_doc.id, p_warehouse_id, btrim(p_reason));

  for v_line in
    select (e->>'orderLineId')::uuid as line_id, sum((e->>'qty')::int)::int as qty
      from jsonb_array_elements(p_lines) e group by 1 order by 1
  loop
    select * into v_ol from public.order_lines
     where id = v_line.line_id and order_id = v_doc.order_id for update;
    if not found then
      raise exception 'That line is not on %', v_doc.do_number using errcode = 'P0001', detail = 'line_not_on_do';
    end if;
    select coalesce(sum(rl.qty_returned), 0) into v_done
      from public.delivery_return_lines rl where rl.order_line_id = v_ol.id;
    if v_line.qty is null or v_line.qty < 1 or v_line.qty > v_ol.qty - v_done then
      raise exception '% can return 1 to % more', v_ol.sku, v_ol.qty - v_done
        using errcode = 'P0001', detail = 'qty_over_remaining';
    end if;
    with back as (
      update public.ops_stock_items i
         set status = 'free', warehouse_id = p_warehouse_id, holder_party_id = null,
             reserved_ref = null, reserved_order_line_id = null, sold_at = null, sold_order_id = null,
             ref_history = array_append(coalesce(i.ref_history, '{}'::text[]), v_no), updated_at = now()
       where i.id in (select s.id from public.ops_stock_items s
                       where s.status = 'sold' and s.sold_order_id = v_doc.order_id and s.sku = v_ol.sku
                       order by s.sold_at desc nulls last, s.unit_code
                       limit v_line.qty for update)
      returning i.id)
    select count(*) into v_moved from back;
    if v_moved < v_line.qty then
      raise exception 'only % Unit(s) of % sold to this order are on the register', v_moved, v_ol.sku
        using errcode = 'P0001', detail = 'units_not_on_register';
    end if;
    insert into public.delivery_return_lines values (v_id, v_ol.id, v_line.qty);
    v_total := v_total + v_line.qty;
  end loop;

  insert into public.order_history (order_id, text, by_role)
  values (v_doc.order_id,
          format('Delivery Return %s · DO %s · %s unit(s) back in stock at %s by line and qty · %s',
                 v_no, v_doc.do_number, v_total, v_site, btrim(p_reason)),
          'operation');
  return jsonb_build_object('id', v_id, 'returnNo', v_no, 'units', v_total);
end;
$$;

-- ── 3 · Refund status: a status only, Finance owns the money ─────────────────

create or replace function public.delivery_return_set_refund_status(p_return_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.delivery_returns;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if p_status is null or p_status not in ('pending','refunded','not_refunded') then
    raise exception 'Refund status is Pending, Refunded or Not refunded'
      using errcode = '22023', detail = 'bad_refund_status';
  end if;
  update public.delivery_returns
     set refund_status = p_status, refund_status_by = auth.uid(), refund_status_at = now()
   where id = p_return_id
  returning * into v;
  if not found then
    raise exception 'That Delivery Return does not exist' using errcode = 'P0002', detail = 'not_found';
  end if;
  return jsonb_build_object('id', v.id, 'returnNo', v.return_no, 'refundStatus', v.refund_status);
end;
$$;

-- ── 4 · a returned Unit no longer holds its old DO's claim ───────────────────
-- 0491's body plus one exemption: a Unit a Delivery Return took back from that
-- DO may be required again by another order's DO.

create or replace function public.delivery_order_units_one_live_claim()
returns trigger
language plpgsql
as $fn$
declare
  v_other text;
  v_order uuid;
begin
  select order_id into v_order from public.ops_delivery_orders where id = new.delivery_order_id;
  select d.do_number into v_other
    from public.delivery_order_units u
    join public.ops_delivery_orders d on d.id = u.delivery_order_id
   where u.item_id = new.item_id
     and u.delivery_order_id <> new.delivery_order_id
     and d.voided_at is null
     and d.order_id is distinct from v_order
     and not exists (
       select 1 from public.delivery_handover_event_units eu
        where eu.delivery_order_id = u.delivery_order_id
          and eu.item_id = u.item_id
          and eu.recorded_side = 'warehouse')
     and not exists (
       select 1 from public.delivery_return_units ru
         join public.delivery_returns r on r.id = ru.return_id
        where r.delivery_order_id = u.delivery_order_id
          and ru.unit_id = u.item_id)
   limit 1;
  if v_other is not null then
    raise exception 'this Unit is already required by % — one Unit, one live delivery claim', v_other
      using errcode = 'P0001', detail = 'unit_already_claimed';
  end if;
  return new;
end;
$fn$;

-- ── 5 · the one delivery door, split so the load scan can share it ──────────
-- 0560's operation_attach_do_and_deliver body, unchanged except: the signed-DO
-- and file checks stay in the wrapper (§6); p_via = 'load_scan' writes no file,
-- no signature time, and says so in the order history.

create or replace function public._delivery_mark_delivered(
  p_order_id uuid, p_do_number text, p_do_note text, p_do_file_path text,
  p_signature_url text, p_signed_by text, p_via text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order   orders;
  v_actor   text;
  v_line    record;
  v_user_id uuid;
  v_threads_advanced int;
  v_units_sold int := 0;
  v_line_sold  int;
  v_sold_ids uuid[] := '{}';
  v_line_ids uuid[];
  v_attempt_id uuid;
  v_attempt_no int;
  v_confirmed date;
  -- 0497
  v_doc      ops_delivery_orders;
  v_stops    jsonb;
  v_last_leg int := 0;
  v_missing  int := 0;
  v_goods_out boolean := false;
BEGIN
  v_user_id := (select auth.uid());

  IF NOT public.is_operation() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;
  IF v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not proceeded'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  -- 0497 · The document this delivery is recorded against: the order's LIVE
  -- document carrying this number (0356 register; 0491 legs).
  SELECT * INTO v_doc FROM ops_delivery_orders
   WHERE order_id = p_order_id AND voided_at IS NULL
     AND do_number = upper(btrim(p_do_number))
   ORDER BY issued_at DESC LIMIT 1;

  -- 0497 · A Journey delivers on its LAST leg's own document, and only once
  -- every earlier leg has arrived (Delivery MASTER §14.1).
  v_stops := coalesce(v_order.delivery_stops, '[]'::jsonb);
  IF jsonb_typeof(v_stops) = 'array' THEN
    SELECT coalesce(max((s->>'leg')::int), 0) INTO v_last_leg FROM jsonb_array_elements(v_stops) s;
  END IF;
  IF v_last_leg > 0 THEN
    IF v_doc.id IS NULL OR coalesce(v_doc.leg, 0) <> v_last_leg THEN
      RAISE EXCEPTION 'the customer leg is delivered on the last leg''s own Delivery Order'
        USING ERRCODE = 'P0001', DETAIL = 'journey_document_required';
    END IF;
    SELECT count(*) INTO v_missing
      FROM jsonb_array_elements(v_stops) s
     WHERE (s->>'leg')::int < v_last_leg
       AND NOT EXISTS (
         SELECT 1 FROM delivery_attempts a
          WHERE a.order_id = p_order_id AND a.leg = (s->>'leg')::int AND a.result = 'delivered');
    IF v_missing > 0 THEN
      RAISE EXCEPTION 'an earlier leg has not arrived yet — the Journey completes leg by leg'
        USING ERRCODE = 'P0001', DETAIL = 'journey_incomplete';
    END IF;
  END IF;

  -- 0497 · The goods are OUT WITH LOGISTICS: the live document's logistics
  -- receipt (0363/0494), or the legacy dispatched stage the supplier-thread
  -- machine still sets.
  v_goods_out := v_order.operation_stage IS NOT DISTINCT FROM 'dispatched'
    OR (v_doc.id IS NOT NULL AND EXISTS (
          SELECT 1 FROM delivery_handover_events e
           WHERE e.delivery_order_id = v_doc.id AND e.kind = 'received_by_logistics'));
  IF NOT v_goods_out THEN
    RAISE EXCEPTION 'the goods are not out with logistics yet — record the handover and the logistics receipt first'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = v_user_id), 'Logistics');

  UPDATE orders
     SET status            = 'delivered',
         operation_stage   = 'delivered',
         do_number         = btrim(p_do_number),
         do_note           = nullif(btrim(coalesce(p_do_note, '')), ''),
         do_file_path      = nullif(btrim(coalesce(p_do_file_path, '')), ''),
         do_uploaded_at    = CASE WHEN p_via = 'load_scan' THEN do_uploaded_at ELSE now() END,
         do_uploaded_by    = CASE WHEN p_via = 'load_scan' THEN do_uploaded_by ELSE v_user_id END,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = CASE WHEN p_via = 'load_scan' THEN NULL ELSE now() END,
         dispatched_at     = coalesce(dispatched_at, now()),
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_order_id;

  -- 0497 · The Journey's last stop completes with the customer's receipt.
  IF v_last_leg > 0 THEN
    UPDATE orders
       SET delivery_stops = (
         SELECT jsonb_agg(
                  CASE WHEN (s->>'leg')::int = v_last_leg
                       THEN s || jsonb_build_object('status', 'delivered', 'delivered_at', now())
                       ELSE s END
                  ORDER BY (s->>'leg')::int)
           FROM jsonb_array_elements(v_stops) s)
     WHERE id = p_order_id;
  END IF;

  -- 0497 · The delivered document's EXACT Units become sold (0424 snapshot).
  -- No stock total is written: totals derive from the Unit register (0366).
  IF v_doc.id IS NOT NULL AND EXISTS (SELECT 1 FROM delivery_order_units WHERE delivery_order_id = v_doc.id) THEN
    WITH sold AS (
      UPDATE ops_stock_items i
         SET status        = 'sold',
             sold_at       = now(),
             sold_order_id = p_order_id,
             reserved_ref  = 'SO-' || v_order.so::text,
             ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), 'SO-' || v_order.so::text),
             updated_at    = now()
       WHERE i.id IN (SELECT du.item_id FROM delivery_order_units du WHERE du.delivery_order_id = v_doc.id)
         AND i.status = 'reserved'
      RETURNING i.id
    )
    SELECT count(*), coalesce(array_agg(id), '{}'::uuid[]) INTO v_units_sold, v_sold_ids FROM sold;
  ELSE
    -- A document with no Unit snapshot (pre-0424): the legacy pick, by SKU at
    -- the order's warehouse, reserved first.
    FOR v_line IN SELECT sku, qty FROM order_lines WHERE order_id = p_order_id LOOP
      WITH sold AS (
        UPDATE ops_stock_items i
           SET status        = 'sold',
               sold_at       = now(),
               sold_order_id = p_order_id,
               reserved_ref  = 'SO-' || v_order.so::text,
               ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), 'SO-' || v_order.so::text),
               updated_at    = now()
         WHERE i.id IN (
           SELECT s.id FROM ops_stock_items s
            WHERE s.sku = v_line.sku
              AND s.warehouse_id IS NOT DISTINCT FROM v_order.warehouse_id
              AND ( (s.status = 'reserved' AND s.reserved_ref = 'SO-' || v_order.so::text)
                 OR s.status IN ('incoming','free') )
            ORDER BY CASE WHEN s.status = 'reserved' THEN 0 ELSE 1 END, s.date_in, s.created_at
            LIMIT v_line.qty)
        RETURNING i.id
      )
      SELECT count(*), coalesce(array_agg(id), '{}'::uuid[]) INTO v_line_sold, v_line_ids FROM sold;
      v_sold_ids := v_sold_ids || v_line_ids;
      v_units_sold := v_units_sold + v_line_sold;
    END LOOP;
  END IF;

  SELECT confirmed_date INTO v_confirmed FROM ops_order_control WHERE order_id = p_order_id;
  IF v_last_leg > 0 THEN
    SELECT a.confirmed_date INTO v_confirmed
      FROM ops_delivery_arrangements a WHERE a.order_id = p_order_id AND a.leg = v_last_leg;
  END IF;
  SELECT coalesce(max(attempt_no), 0) + 1 INTO v_attempt_no
    FROM delivery_attempts WHERE order_id = p_order_id;
  INSERT INTO delivery_attempts
    (order_id, attempt_no, result, do_number, logistics_name, scheduled_date, recorded_by, leg)
  VALUES
    (p_order_id, v_attempt_no, 'delivered', btrim(p_do_number),
     coalesce(v_doc.logistics_partner,
              (SELECT name FROM delivery_partners WHERE id = v_order.delivery_partner_id),
              (SELECT name FROM delivery_partners WHERE id = v_order.ops_assigned_logistic)),
     v_confirmed, v_user_id, v_last_leg)
  RETURNING id INTO v_attempt_id;
  INSERT INTO delivery_attempt_units (attempt_id, item_id, outcome)
  SELECT v_attempt_id, unnest(v_sold_ids), 'delivered';

  UPDATE order_supplier_threads
     SET operation_stage = 'delivered',
         delivered_at    = COALESCE(delivered_at, now()),
         updated_at      = now()
   WHERE order_id = p_order_id
     AND operation_stage <> 'delivered';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Delivered%s · DO %s · %s · %s unit(s) sold%s%s',
           CASE WHEN p_via = 'load_scan' THEN ' by load scan' ELSE '' END,
           btrim(p_do_number),
           CASE WHEN p_via = 'load_scan' THEN 'no signature or photo (Weisiang''s decision 2026-10-22)'
                ELSE format('file %s · signed by %s', btrim(p_do_file_path),
                            coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer')) END,
           v_units_sold,
           CASE WHEN v_last_leg > 0 THEN format(' · Journey complete on leg %s', v_last_leg) ELSE '' END,
           CASE WHEN v_threads_advanced > 0
                THEN format(' · %s thread(s) advanced', v_threads_advanced)
                ELSE '' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Delivered%s SO-%s · DO %s', CASE WHEN p_via = 'load_scan' THEN ' by load scan' ELSE '' END, v_order.so, btrim(p_do_number)),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  RETURN jsonb_build_object(
    'id',                v_order.id,
    'so',                v_order.so,
    'status',            'delivered',
    'operation_stage',   'delivered',
    'do_number',         btrim(p_do_number),
    'do_file_path',      nullif(btrim(coalesce(p_do_file_path, '')), ''),
    'pod_signature_url', nullif(btrim(coalesce(p_signature_url, '')), ''),
    'pod_signed_by',     nullif(btrim(coalesce(p_signed_by, '')), ''),
    'delivered_at',      now(),
    'units_sold',        v_units_sold,
    'threads_advanced',  v_threads_advanced,
    'attempt_id',        v_attempt_id,
    'journey_last_leg',  v_last_leg
  );
END;
$function$;

-- Only the two doors below call it.
revoke execute on function public._delivery_mark_delivered(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ── 6 · the signed-DO door keeps its checks and calls the shared body ────────

CREATE OR REPLACE FUNCTION public.operation_attach_do_and_deliver(p_order_id uuid, p_do_number text, p_do_note text, p_signed boolean, p_do_file_path text, p_signature_url text DEFAULT NULL::text, p_signed_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_operation() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_number IS NULL OR (length(btrim(p_do_number)) < 3 or coalesce(p_do_number, '') !~ '[^[:space:]]') THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_file_path IS NULL OR coalesce(p_do_file_path, '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'DO file required'
      USING ERRCODE = 'P0001', DETAIL = 'do_file_required';
  END IF;

  RETURN public._delivery_mark_delivered(p_order_id, p_do_number, p_do_note, p_do_file_path,
                                         p_signature_url, p_signed_by, 'signed_do');
END;
$function$;

-- ── 7 · Load scan: a DO No or a Unit ID marks its DO Delivered ───────────────
-- Weisiang's decision (2026-10-22): no signed DO, no photo. A Unit ID finds the
-- newest live DO that carries it. The check is per DO, not per order (YH,
-- 2026-10-26): once the order reads Delivered, a scan of ANOTHER live DO still
-- sells that DO's reserved Units; a DO with nothing left reserved answers
-- `already`, so a repeat scan never writes twice.

create or replace function public.delivery_load_scan(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_doc   public.ops_delivery_orders;
  v_order public.orders;
  v_res   jsonb;
  v_sold  uuid[];
  v_attempt_id uuid;
begin
  if not public.is_operation() then
    raise exception 'forbidden' using errcode = '42501', detail = 'forbidden';
  end if;
  if v_code = '' then
    raise exception 'Scan a DO No or a Unit ID' using errcode = 'P0001', detail = 'code_required';
  end if;

  select * into v_doc from public.ops_delivery_orders
   where do_number = v_code and voided_at is null
   order by issued_at desc limit 1;
  if not found then
    select d.* into v_doc
      from public.ops_stock_items i
      join public.delivery_order_units du on du.item_id = i.id
      join public.ops_delivery_orders d on d.id = du.delivery_order_id
     where upper(i.unit_code) = v_code and d.voided_at is null
     order by d.issued_at desc limit 1;
  end if;
  if v_doc.id is null then
    raise exception '% is not a DO No or a Unit ID on a Delivery Order', btrim(p_code)
      using errcode = 'P0001', detail = 'scan_not_found';
  end if;

  select * into v_order from public.orders where id = v_doc.order_id for update;
  if v_order.status = 'delivered' then
    -- Follows Houzs frontend/src/pages/scm-v2/DoLoadScan.tsx:54,68 (the scan writes
    -- the status of the DO itself) per Weisiang's ruling (2026-10-22): clear
    -- Carres rules, implement Houzs.
    -- The order is Delivered by an earlier DO. THIS DO still owes its own
    -- reserved Units; with none left it is already delivered.
    if not exists (select 1 from public.delivery_order_units du
                     join public.ops_stock_items i on i.id = du.item_id
                    where du.delivery_order_id = v_doc.id and i.status = 'reserved') then
      return jsonb_build_object('already', true, 'do_number', v_doc.do_number, 'so', v_order.so);
    end if;
    if not exists (select 1 from public.delivery_handover_events e
                    where e.delivery_order_id = v_doc.id and e.kind = 'received_by_logistics') then
      raise exception 'the goods are not out with logistics yet — record the handover and the logistics receipt first'
        using errcode = '22023', detail = 'wrong_stage';
    end if;
    with sold as (
      update public.ops_stock_items i
         set status        = 'sold',
             sold_at       = now(),
             sold_order_id = v_order.id,
             reserved_ref  = 'SO-' || v_order.so::text,
             ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]), 'SO-' || v_order.so::text),
             updated_at    = now()
       where i.id in (select du.item_id from public.delivery_order_units du where du.delivery_order_id = v_doc.id)
         and i.status = 'reserved'
      returning i.id)
    select coalesce(array_agg(id), '{}'::uuid[]) into v_sold from sold;
    insert into public.delivery_attempts (order_id, attempt_no, result, do_number, logistics_name, recorded_by, leg)
    values (v_order.id,
            (select coalesce(max(attempt_no), 0) + 1 from public.delivery_attempts where order_id = v_order.id),
            'delivered', v_doc.do_number, v_doc.logistics_partner, auth.uid(), coalesce(v_doc.leg, 0))
    returning id into v_attempt_id;
    insert into public.delivery_attempt_units (attempt_id, item_id, outcome)
    select v_attempt_id, unnest(v_sold), 'delivered';
    insert into public.order_history (order_id, text, by_role)
    values (v_order.id,
            format('Delivered by load scan · DO %s · no signature or photo (Weisiang''s decision 2026-10-22) · %s unit(s) sold',
                   v_doc.do_number, cardinality(v_sold)),
            'operation');
    return jsonb_build_object('already', false, 'status', 'delivered', 'do_number', v_doc.do_number,
                              'so', v_order.so, 'units_sold', cardinality(v_sold), 'attempt_id', v_attempt_id);
  end if;

  v_res := public._delivery_mark_delivered(v_doc.order_id, v_doc.do_number, null, null, null, null, 'load_scan');
  return v_res || jsonb_build_object('already', false);
end;
$$;

revoke execute on function public.delivery_load_scan(text) from public, anon;
grant execute on function public.delivery_load_scan(text) to authenticated;
revoke execute on function public.delivery_return_record(uuid, uuid[], uuid, text) from public, anon;
grant execute on function public.delivery_return_record(uuid, uuid[], uuid, text) to authenticated;
revoke execute on function public.delivery_return_record_lines(uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.delivery_return_record_lines(uuid, jsonb, uuid, text) to authenticated;
revoke execute on function public.delivery_return_set_refund_status(uuid, text) from public, anon;
grant execute on function public.delivery_return_set_refund_status(uuid, text) to authenticated;
