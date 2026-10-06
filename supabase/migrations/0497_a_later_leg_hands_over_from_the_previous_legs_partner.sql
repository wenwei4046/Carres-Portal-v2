-- 0497 · A later leg hands over from the previous leg's partner, and the customer leg delivers its exact Units
-- 【DELIVERY】 CARD 14 · Journey legs — production-walk correction 2026-09-13
--
-- Found on the authenticated walk of SO-1362 (leg 1 NETS → JB, leg 2 AL →
-- customer): after leg 1's handover and arrival the Unit is held by NETS
-- Delivery, and leg 2's `handed_over` refused with `unit_not_with_warehouse`
-- — the door assumed every handover leaves the Warehouse. A later leg leaves
-- the PREVIOUS leg's partner at its named warehouse (Delivery MASTER §4, §14.1):
-- 0497 requires every Unit of a leg 2..n document to be held by the previous
-- leg's partner (refusing `unit_not_with_previous_leg` otherwise) and names
-- that partner as the handing-over company. Leg 0 and leg 1 are unchanged.
--
-- The same walk reached the customer leg and found the deliver door
-- (`operation_attach_do_and_deliver`, 0087/0151) unreachable for every order
-- since Stock's derived-total law: it wrote `stock_balances` (refused by
-- `stock_balances_derived_only`), demanded the legacy `dispatched` stage that
-- only the supplier-thread machine sets, re-picked Units by SKU at the order's
-- warehouse instead of selling the document's exact Units (0424), and knew
-- nothing of a Journey. 0497 re-creates it: the goods must be OUT WITH
-- LOGISTICS (the live document's `received_by_logistics`, or the legacy
-- `dispatched` stage); the delivered document's exact Units become `sold`
-- (the legacy SKU pick stays only for a document with no Unit snapshot); no
-- stock total is written; a Journey delivers on its LAST leg's own document
-- only after every earlier leg has arrived, and completes that last stop.

set search_path = public;

create or replace function public.delivery_handover_record(
  p_do_id         uuid,
  p_kind          text,
  p_receiver_name text   default null,
  p_vehicle       text   default null,
  p_goods         jsonb  default null,
  p_note          text   default null,
  p_proof_path    text   default null,
  p_unit_codes    text[] default null,
  p_evidence      jsonb  default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role      app_role;
  v_uid       uuid;
  v_warehouse_id uuid;
  v_do        ops_delivery_orders;
  v_duty      text;
  v_company   text;
  v_counter   text;
  v_row       delivery_handover_events;
  v_line      text;
  v_items     uuid[];
  v_bad       text;
  v_party     uuid;
  v_prev_party uuid;
  v_required  int;
  v_accepted  int;
  v_n         int;
  v_evd        jsonb;
  v_first_path text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal','warehouse') then
    raise exception 'forbidden: only operation, principal or a warehouse login records a handover fact'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_kind is null or p_kind not in
     ('ready_for_handover','handed_over','received_by_logistics') then
    raise exception '% is not a handover fact this door records', coalesce(p_kind,'null')
      using errcode = '22023', detail = 'bad_kind';
  end if;
  -- Warehouse records physical Warehouse acts only — never the counterparty's
  -- receipt, never a Delivery Result (card §9).
  if v_role = 'warehouse' then
    if p_kind = 'received_by_logistics' then
      raise exception 'forbidden: logistics receipt is the receiving party''s own fact'
        using errcode = '42501', detail = 'forbidden';
    end if;
    v_warehouse_id := public.app_warehouse_id();
    if v_warehouse_id is null then
      raise exception 'forbidden: this warehouse login is not bound to a warehouse'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;
  if p_goods is not null and jsonb_typeof(p_goods) <> 'array' then
    raise exception 'goods must be a list of {sku, qty}'
      using errcode = '22023', detail = 'bad_goods';
  end if;

  -- 0440 — MANY evidence files per act, each named {path, kind}. New files
  -- append; nothing here can overwrite or drop an earlier file.
  if p_evidence is not null then
    if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) > 20 then
      raise exception 'evidence must be a list of at most 20 files'
        using errcode = '22023', detail = 'bad_evidence';
    end if;
    for v_evd in select value from jsonb_array_elements(p_evidence) loop
      if coalesce(btrim(v_evd->>'path'),'') = ''
         or coalesce(v_evd->>'kind','') not in ('photo','video') then
        raise exception 'each evidence file names its path and its kind (photo or video)'
          using errcode = '22023', detail = 'bad_evidence';
      end if;
    end loop;
    if (select count(distinct value->>'path') from jsonb_array_elements(p_evidence))
       <> jsonb_array_length(p_evidence) then
      raise exception 'each evidence file is attached once'
        using errcode = '22023', detail = 'duplicate_evidence';
    end if;
    if jsonb_array_length(p_evidence) > 0 then
      v_first_path := btrim(p_evidence->0->>'path');
    end if;
  end if;

  select * into v_do from ops_delivery_orders where id = p_do_id for update;
  if v_do.id is null then
    raise exception 'delivery order not found'
      using errcode = '42P01', detail = 'delivery_order_not_found';
  end if;
  if v_do.voided_at is not null then
    raise exception 'this delivery order was cancelled — a cancelled document has no handover'
      using errcode = 'P0001', detail = 'delivery_order_voided';
  end if;

  -- `ready_for_handover` and `received_by_logistics` stay once-per-document.
  if p_kind <> 'handed_over' and exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = p_kind) then
    raise exception 'this fact is already recorded on % — history is never rewritten', v_do.do_number
      using errcode = 'P0001', detail = 'handover_fact_already_recorded';
  end if;
  if p_kind = 'received_by_logistics' and not exists (
       select 1 from delivery_handover_events
        where delivery_order_id = p_do_id and kind = 'handed_over') then
    raise exception 'logistics receipt is confirmed only after a handover is recorded'
      using errcode = 'P0001', detail = 'handover_out_of_order';
  end if;

  if p_kind = 'handed_over' then
    if p_receiver_name is null or btrim(p_receiver_name) = '' then
      raise exception 'a handover names the person who actually received the goods'
        using errcode = '22023', detail = 'receiver_required';
    end if;
    if (p_proof_path is null or btrim(p_proof_path) = '') and v_first_path is null then
      raise exception 'a handover carries its proof — photos or videos of the loaded goods'
        using errcode = '22023', detail = 'proof_required';
    end if;

    -- The batch names its exact Units, and the document must carry a scope.
    select count(*) into v_required
      from delivery_order_units where delivery_order_id = p_do_id;
    if v_required = 0 then
      raise exception '% has no recorded exact-Unit scope — its scope must exist before goods leave', v_do.do_number
        using errcode = 'P0001', detail = 'exact_units_not_recorded';
    end if;
    if p_unit_codes is null or array_length(p_unit_codes, 1) is null then
      raise exception 'a handover names the exact Unit IDs it moves'
        using errcode = '22023', detail = 'units_required';
    end if;
    select count(distinct c.code) into v_n from unnest(p_unit_codes) c(code);
    if v_n <> array_length(p_unit_codes, 1) then
      raise exception 'a Unit appears twice in this batch — each Unit is accepted once'
        using errcode = 'P0001', detail = 'duplicate_unit_in_batch';
    end if;

    -- Every code is a Unit of THIS scope, at the caller's Site for a
    -- warehouse login, still with a warehouse-side holder, and not yet
    -- accepted. The Units are locked first (FOR UPDATE cannot ride an
    -- aggregate) so a concurrent batch cannot double-move them.
    perform 1
      from ops_stock_items i
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where i.unit_code = any(p_unit_codes)
     for update of i;
    select array_agg(i.id) into v_items
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
      join delivery_order_units u
        on u.delivery_order_id = p_do_id and u.item_id = i.id
     where v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id;
    if coalesce(array_length(v_items, 1), 0) <> array_length(p_unit_codes, 1) then
      select c.code into v_bad
        from unnest(p_unit_codes) c(code)
       where not exists (
         select 1 from ops_stock_items i
           join delivery_order_units u
             on u.delivery_order_id = p_do_id and u.item_id = i.id
          where i.unit_code = c.code
            and (v_role <> 'warehouse' or i.warehouse_id = v_warehouse_id))
       limit 1;
      raise exception '% is not a Unit this delivery order requires at your Site', coalesce(v_bad, 'a Unit')
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;

    -- Already accepted for this scope? Refused, not silently reconciled —
    -- goods cannot physically leave twice.
    select i.unit_code into v_bad
      from delivery_handover_event_units eu
      join ops_stock_items i on i.id = eu.item_id
     where eu.delivery_order_id = p_do_id
       and eu.recorded_side = 'warehouse'
       and eu.item_id = any(v_items)
     limit 1;
    if v_bad is not null then
      raise exception '% was already handed over on % — a Unit is accepted once', v_bad, v_do.do_number
        using errcode = 'P0001', detail = 'unit_already_handed_over';
    end if;

    -- 0497: WHO HANDS IT OVER. A whole-order document (leg 0) and a Journey's
    -- first leg hand over FROM THE WAREHOUSE: a Unit already with a carrier is
    -- not there to hand over. A later leg (leg 2..n) hands over from the
    -- PREVIOUS leg's partner at its named warehouse (Delivery MASTER §4, §14.1):
    -- every Unit must be held by that partner's operating party — never by the
    -- Warehouse, never by another carrier.
    if coalesce(v_do.leg, 0) > 1 then
      select dp.operating_party_id into v_prev_party
        from ops_delivery_arrangements a
        join delivery_partners dp on dp.id = a.partner_id
       where a.order_id = v_do.order_id and a.leg = v_do.leg - 1;
      if v_prev_party is null then
        raise exception 'the previous leg has no Logistics Partner recorded — assign it first'
          using errcode = 'P0001', detail = 'previous_leg_partner_not_recorded';
      end if;
      select i.unit_code into v_bad
        from ops_stock_items i
       where i.id = any(v_items) and i.holder_party_id is distinct from v_prev_party
       limit 1;
      if v_bad is not null then
        raise exception '% is not with the previous leg''s partner — it cannot be handed over from there', v_bad
          using errcode = 'P0001', detail = 'unit_not_with_previous_leg';
      end if;
    else
      select i.unit_code into v_bad
        from ops_stock_items i
        join stock_operating_parties sop on sop.id = i.holder_party_id
       where i.id = any(v_items) and sop.kind = 'delivery_operator'
       limit 1;
      if v_bad is not null then
        raise exception '% is already with a delivery party — it is not at the Warehouse', v_bad
          using errcode = 'P0001', detail = 'unit_not_with_warehouse';
      end if;
    end if;

    -- The physical checkpoint: every Unit scanned, checked and packed.
    select i.unit_code into v_bad
      from unnest(v_items) t(item_id)
      join ops_stock_items i on i.id = t.item_id
     where (select count(distinct p.fact) from delivery_unit_prep p
             where p.delivery_order_id = p_do_id and p.item_id = t.item_id
               and p.fact in ('scanned','checked','packed')) < 3
     limit 1;
    if v_bad is not null then
      raise exception '% is not ready — scan, check and pack every Unit before the handover', v_bad
        using errcode = 'P0001', detail = 'prep_incomplete';
    end if;

    -- WHO HAS IT next: the governed Delivery operating party, resolved from
    -- the document's own partner assignment — never from client text.
    -- 0494: the DOCUMENT's own scope. A Journey leg's document (0491, `leg`
    -- 1..n) hands over to the LEG's partner — the arrangement keyed
    -- (order, leg) — never to the whole-order arrangement at leg 0. A
    -- whole-order document still reads leg 0 (its `leg` is 0).
    select dp.operating_party_id into v_party
      from ops_delivery_arrangements a
      join delivery_partners dp on dp.id = a.partner_id
     where a.order_id = v_do.order_id and a.leg = coalesce(v_do.leg, 0);
    if v_party is null then
      raise exception 'no goods-holder identity is recorded for this delivery''s partner — assign the Logistics Partner first'
        using errcode = 'P0001', detail = 'partner_holder_not_recorded';
    end if;
  end if;

  if p_kind = 'received_by_logistics' then
    v_duty    := 'logistics';
    v_company := v_do.logistics_partner;
    v_counter := null;
  else
    v_duty    := 'warehouse';
    if coalesce(v_do.leg, 0) > 1 then
      -- 0497: a later leg's handover is made by the PREVIOUS leg's partner.
      select dp.name into v_company
        from ops_delivery_arrangements a
        join delivery_partners dp on dp.id = a.partner_id
       where a.order_id = v_do.order_id and a.leg = v_do.leg - 1;
    else
      select w.name into v_company
        from orders o left join warehouses w on w.id = o.warehouse_id
       where o.id = v_do.order_id;
    end if;
    v_counter := case when p_kind = 'handed_over' then v_do.logistics_partner end;
  end if;

  insert into delivery_handover_events
    (delivery_order_id, kind, duty, company, counterparty, receiver_name,
     vehicle, goods, note, proof_path, recorded_by)
  values
    (p_do_id, p_kind, v_duty, v_company, v_counter,
     nullif(btrim(coalesce(p_receiver_name,'')),''),
     nullif(btrim(coalesce(p_vehicle,'')),''),
     p_goods,
     nullif(btrim(coalesce(p_note,'')),''),
     nullif(btrim(coalesce(p_proof_path, v_first_path, '')),''),
     v_uid)
  returning * into v_row;

  if p_evidence is not null and jsonb_array_length(p_evidence) > 0 then
    insert into delivery_handover_evidence
      (event_id, delivery_order_id, path, kind, recorded_by)
    select v_row.id, p_do_id, btrim(e.value->>'path'), e.value->>'kind', v_uid
      from jsonb_array_elements(p_evidence) e;
  end if;

  if p_kind = 'handed_over' then
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, t.item_id, 'warehouse' from unnest(v_items) t(item_id);

    -- Only the accepted Units change WHO HAS IT — in this same transaction.
    -- 0366's lineage trigger records each holder change append-only.
    update ops_stock_items
       set holder_party_id = v_party, updated_at = now()
     where id = any(v_items);

    select count(*) into v_accepted
      from delivery_handover_event_units
     where delivery_order_id = p_do_id and recorded_side = 'warehouse';
  end if;

  -- The Logistics receipt may name ITS OWN exact Units — the counterparty's
  -- statement, preserved beside the Warehouse's, changing no holder and
  -- overwriting nothing. The unmatched IDs are the two sides' difference.
  if p_kind = 'received_by_logistics'
     and p_unit_codes is not null and array_length(p_unit_codes, 1) is not null then
    select c.code into v_bad
      from unnest(p_unit_codes) c(code)
     where not exists (
       select 1 from ops_stock_items i
         join delivery_order_units u
           on u.delivery_order_id = p_do_id and u.item_id = i.id
        where i.unit_code = c.code)
     limit 1;
    if v_bad is not null then
      raise exception '% is not a Unit this delivery order requires', v_bad
        using errcode = 'P0001', detail = 'unit_not_in_scope';
    end if;
    insert into delivery_handover_event_units
      (event_id, delivery_order_id, item_id, recorded_side)
    select v_row.id, p_do_id, i.id, 'logistics'
      from unnest(p_unit_codes) c(code)
      join ops_stock_items i on i.unit_code = c.code
    on conflict (delivery_order_id, item_id, recorded_side) do nothing;
  end if;

  v_line := case p_kind
    when 'ready_for_handover' then
      'Goods ready for handover — ' || v_do.do_number
    when 'handed_over' then
      'Handed over ' || array_length(v_items, 1) || ' of ' || v_required
        || ' Units to ' || coalesce(v_do.logistics_partner, 'logistics')
        || ' — received by ' || btrim(p_receiver_name) || ' (' || v_do.do_number || ')'
    else
      'Logistics confirmed receipt — ' || v_do.do_number || ' is out for delivery'
  end;
  insert into order_history (order_id, text, by_role)
  values (v_do.order_id, v_line, v_role);

  return to_jsonb(v_row) || jsonb_build_object(
    'acceptedUnits', coalesce(v_accepted, 0),
    'requiredUnits', coalesce(v_required, 0));
end;
$fn$;


-- ── The deliver door — the customer leg's result and proof ──────────────────
create or replace function public.operation_attach_do_and_deliver(
  p_order_id uuid, p_do_number text, p_do_note text, p_signed boolean, p_do_file_path text,
  p_signature_url text default null, p_signed_by text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_do_file_path IS NULL OR length(btrim(p_do_file_path)) = 0 THEN
    RAISE EXCEPTION 'DO file required'
      USING ERRCODE = 'P0001', DETAIL = 'do_file_required';
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
         do_file_path      = btrim(p_do_file_path),
         do_uploaded_at    = now(),
         do_uploaded_by    = v_user_id,
         pod_signature_url = nullif(btrim(coalesce(p_signature_url, '')), ''),
         pod_signed_by     = nullif(btrim(coalesce(p_signed_by, '')), ''),
         pod_signed_at     = now(),
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
    format('Delivered · DO %s · file %s · signed by %s · %s unit(s) sold%s%s',
           btrim(p_do_number),
           btrim(p_do_file_path),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer'),
           v_units_sold,
           CASE WHEN v_last_leg > 0 THEN format(' · Journey complete on leg %s', v_last_leg) ELSE '' END,
           CASE WHEN v_threads_advanced > 0
                THEN format(' · %s thread(s) advanced', v_threads_advanced)
                ELSE '' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Delivered SO-%s · DO %s', v_order.so, btrim(p_do_number)),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  RETURN jsonb_build_object(
    'id',                v_order.id,
    'so',                v_order.so,
    'status',            'delivered',
    'operation_stage',   'delivered',
    'do_number',         btrim(p_do_number),
    'do_file_path',      btrim(p_do_file_path),
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
