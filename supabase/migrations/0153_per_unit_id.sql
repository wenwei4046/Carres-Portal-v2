-- =============================================================================
-- 0153_per_unit_id.sql — per-unit SKU tracking ID (item D)
-- Phase 10 · Loo 2026-05-31 (authorised in conversation per CLAUDE.md §7 + §8).
--
-- The Chairman's ask: every physical unit gets a forced unique ID of the form
-- 'id-' + 3 lowercase letters + 6 digits (e.g. id-abc123456) AT PO-OPEN, so he
-- can later trace (1) where that unit went and (2) when it was sold.
--
-- DESIGN — additive per-unit TRACKING OVERLAY on the existing per-unit register
-- (ops_stock_items, migration 0137). Does NOT change the aggregate stock_balances
-- accounting (still driven by the existing receive RPCs); the two coexist exactly
-- as before, plus the per-unit register is now fed by the PO lifecycle.
--
-- Lifecycle of a unit_code row (Carres-owned warehouses only, kind='own'):
--   PO-open   (_operation_create_po_inner)        → mint qty rows · status 'incoming'
--   PO-cancel (operation_cancel_po)               → 'incoming' → 'voided'
--   WH receive(operation_receive_po_with_do)      → 'incoming' → 'free'  (buffer stock)
--   Delivery  (operation_attach_do_and_deliver)   → (incoming|free|reserved) → 'sold'
--                                                    + sold_at + sold_order_id + SO ref
--
-- Double-count safety (verified): ops_rollup_stock_balances counts only
-- status IN ('free','reserved'); 'incoming'/'voided'/'sold' are excluded, so
-- minted-but-not-received units never inflate stock_balances. Receive FLIPS the
-- same rows incoming→free (never creates new ones), so physical counts are exact.
--
-- The thread-based receive (operation_receive_threads) is intentionally NOT
-- touched: it doesn't bump stock_balances (its goods are pre-allocated to a
-- customer order, not buffer), so its units stay 'incoming' until delivery
-- flips them straight to 'sold' — a complete trace either way. Avoiding re-edit
-- of that hot RPC (0117/0118/0122/0152 regression history) is deliberate.
--
-- RLS impact: NONE. Schema: ops_stock_items gains unit_code/sold_at/sold_order_id
-- + 2 new status values. No other table changes.
-- =============================================================================


-- ─── 1. Schema additions on ops_stock_items ─────────────────────────────────
alter table public.ops_stock_items
  add column if not exists unit_code     text,
  add column if not exists sold_at       timestamptz,
  add column if not exists sold_order_id uuid;

comment on column public.ops_stock_items.unit_code IS
  'Forced per-unit serial: id- + 3 lowercase letters + 6 digits (e.g. id-abc123456). '
  'Minted at PO-open by _operation_create_po_inner; backfilled for pre-0153 seed units.';
comment on column public.ops_stock_items.sold_at IS
  'When this unit was sold (set by operation_attach_do_and_deliver). NULL = not sold.';
comment on column public.ops_stock_items.sold_order_id IS
  'The customer order this unit was sold to (orders.id). NULL = not sold.';

-- Extend the status CHECK with 'incoming' (PO opened, not yet at WH) + 'voided'
-- (PO cancelled before arrival).
alter table public.ops_stock_items
  drop constraint if exists ops_stock_items_status_check;
alter table public.ops_stock_items
  add constraint ops_stock_items_status_check
  check (status = any (array['incoming','free','reserved','sold','transferred','voided']));


-- ─── 2. gen_unit_code() — collision-safe id-abc123456 generator ──────────────
create or replace function public.gen_unit_code()
 returns text
 language plpgsql
 volatile
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code    text;
  v_letters text := 'abcdefghijklmnopqrstuvwxyz';
  v_try     int := 0;
begin
  loop
    v_try := v_try + 1;
    -- 3 random lowercase letters + 6 random digits.
    v_code := 'id-'
      || substr(v_letters, 1 + floor(random()*26)::int, 1)
      || substr(v_letters, 1 + floor(random()*26)::int, 1)
      || substr(v_letters, 1 + floor(random()*26)::int, 1)
      || lpad(floor(random()*1000000)::int::text, 6, '0');
    -- ~17.5M combos; retry on the rare collision, hard-stop after 100 tries.
    exit when not exists (select 1 from ops_stock_items where unit_code = v_code);
    if v_try >= 100 then
      raise exception 'gen_unit_code: could not find a free code after 100 tries'
        using errcode = 'P0001', detail = 'unit_code_exhausted';
    end if;
  end loop;
  return v_code;
end;
$function$;

revoke all on function public.gen_unit_code() from public;
revoke all on function public.gen_unit_code() from anon;


-- ─── 3. Backfill existing units (the 67 Klang seed rows) ─────────────────────
update public.ops_stock_items
   set unit_code = public.gen_unit_code()
 where unit_code is null;

-- Unique once every row has a code. Partial guard kept (defensive) in case a
-- future path inserts a null.
create unique index if not exists ops_stock_items_unit_code_key
  on public.ops_stock_items (unit_code)
  where unit_code is not null;


-- ─── 4. PO-open mint — _operation_create_po_inner (verbatim + mint block) ────
CREATE OR REPLACE FUNCTION public._operation_create_po_inner(p_supplier_id uuid, p_warehouse_id uuid, p_lines jsonb, p_so integer, p_so_refs integer[], p_procurement_partner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po_id          text;
  v_seq            bigint;
  v_line           jsonb;
  v_sku            text;
  v_qty            int;
  v_cost           numeric;
  v_cost_source    text;
  v_attrs          jsonb;
  v_actor          text;
  v_uid            uuid;
  v_supplier_name  text;
  v_total_qty      int := 0;
  v_line_count     int := 0;
  v_is_own         boolean := false;
begin
  v_uid := (select auth.uid());
  v_actor := coalesce((select name from app_users where id = v_uid), 'Operation');

  -- Resolve a new PO id from the sequence.
  v_seq := nextval('po_seq');
  v_po_id := 'PO-' || lpad(v_seq::text, 4, '0');

  -- supplier name for denormalised history.
  select name into v_supplier_name from suppliers where id = p_supplier_id;

  -- 0153 (Loo 2026-05-31): per-unit mint only into Carres-owned warehouses
  -- (the ones that carry the per-unit register). Resolve once.
  select (kind = 'own') into v_is_own from warehouses where id = p_warehouse_id;

  insert into purchase_orders (id, supplier_id, warehouse_id, status, sup_status, so, so_refs, procurement_partner_id, created_by)
  values (v_po_id, p_supplier_id, p_warehouse_id, 'open', 'pending_ack', p_so, p_so_refs, p_procurement_partner_id, v_uid);

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku  := v_line->>'sku';
    v_qty  := (v_line->>'qty')::int;
    v_cost := nullif(v_line->>'cost','')::numeric;
    v_cost_source := coalesce(v_line->>'cost_source','catalog');
    v_attrs := case when v_line ? 'attrs' then v_line->'attrs' else null end;

    insert into purchase_order_lines (po_id, sku, qty, cost, cost_source, attrs)
    values (v_po_id, v_sku, v_qty, v_cost, v_cost_source, v_attrs);

    -- 0153 (Loo 2026-05-31): mint one tracked unit per physical piece. Status
    -- 'incoming' (not yet at WH → excluded from stock_balances rollup). Each
    -- gets a forced id-abc123456 unit_code. coalesce(v_qty,0) guards a bad line.
    if v_is_own and coalesce(v_qty,0) > 0 then
      insert into ops_stock_items (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
      select public.gen_unit_code(), v_sku, p_warehouse_id, 'incoming',
             v_supplier_name, v_po_id, 'po_mint', current_date
        from generate_series(1, v_qty);
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_line_count := v_line_count + 1;
  end loop;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (v_po_id, format('PO created with %s line(s), %s unit(s) total', v_line_count, v_total_qty), 'operation', v_uid);

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor, format('Created %s for %s', v_po_id, coalesce(v_supplier_name,'supplier')), null, v_po_id);

  return jsonb_build_object(
    'po_id', v_po_id,
    'line_count', v_line_count,
    'total_qty', v_total_qty
  );
end;
$function$;


-- ─── 5. PO-cancel void — operation_cancel_po (verbatim + void block) ─────────
CREATE OR REPLACE FUNCTION public.operation_cancel_po(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po       purchase_orders;
  v_actor    text;
  v_uid      uuid;
  v_threads_released int := 0;
  v_units_voided int := 0;
begin
  v_uid := (select auth.uid());

  if public.app_role() <> 'operation' then
    raise exception 'forbidden: operation only' using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found' using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'PO already cancelled' using errcode = '22023', detail = 'already_cancelled';
  end if;

  if v_po.status = 'received' then
    raise exception 'cannot cancel a received PO' using errcode = '22023', detail = 'already_received';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), 'Operation');

  -- 0113: release any threads claimed by this PO back to awaiting_operation_action
  -- so they can be re-POed. Clears po_id + warehouse_id + reserved_at.
  update order_supplier_threads
     set po_id           = null,
         warehouse_id    = null,
         reserved_at     = null,
         operation_stage = 'awaiting_operation_action',
         updated_at      = now()
   where po_id = p_po_id
     and operation_stage <> 'delivered';
  get diagnostics v_threads_released = row_count;

  -- 0153 (Loo 2026-05-31): void the units minted for this PO that never
  -- arrived (still 'incoming') so phantom IDs don't linger.
  update ops_stock_items
     set status = 'voided', updated_at = now()
   where po_no = p_po_id and status = 'incoming';
  get diagnostics v_units_voided = row_count;

  update purchase_orders
     set status     = 'cancelled',
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, format('PO cancelled (%s thread(s) released, %s unit(s) voided)', v_threads_released, v_units_voided), 'operation', v_uid);

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor, format('Cancelled %s', p_po_id), null, p_po_id);

  return jsonb_build_object(
    'po_id', p_po_id,
    'status', 'cancelled',
    'threads_released', v_threads_released,
    'units_voided', v_units_voided
  );
end;
$function$;


-- ─── 6. WH receive free — operation_receive_po_with_do (verbatim + free block)
CREATE OR REPLACE FUNCTION public.operation_receive_po_with_do(p_po_id text, p_do_file_path text, p_do_number text, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po          purchase_orders;
  v_uid         uuid;
  v_actor       text;
  v_line        jsonb;
  v_sku         text;
  v_recv        int;
  v_existing    int;
  v_delta       int;
  v_total_recv  int := 0;
  v_all_done    boolean;
begin
  v_uid := (select auth.uid());

  if public.app_role() <> 'operation' then
    raise exception 'forbidden: operation only' using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found' using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'cannot receive a cancelled PO' using errcode = '22023', detail = 'po_cancelled';
  end if;

  if p_do_file_path is null or btrim(p_do_file_path) = '' then
    raise exception 'DO file path required' using errcode = '22023', detail = 'do_file_required';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) < 3 then
    raise exception 'DO number must be at least 3 characters' using errcode = 'P0001', detail = 'do_required';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku  := v_line->>'sku';
    v_recv := (v_line->>'received_qty')::int;

    select coalesce(received_qty, 0) into v_existing
      from purchase_order_lines
     where po_id = p_po_id and sku = v_sku;

    if v_recv < v_existing then
      raise exception 'received_qty cannot decrease (% < %)', v_recv, v_existing
        using errcode = '22023', detail = 'received_qty_decrease';
    end if;

    v_delta := v_recv - v_existing;

    update purchase_order_lines
       set received_qty = v_recv
     where po_id = p_po_id and sku = v_sku;

    if v_delta > 0 then
      insert into stock_balances (sku, warehouse_id, qty, reserved, updated_at)
      values (v_sku, v_po.warehouse_id, v_delta, 0, now())
      on conflict (sku, warehouse_id) do update
        set qty = stock_balances.qty + v_delta, updated_at = now();

      insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
      values (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, 'PO receive', 'operation', v_uid);

      -- 0153 (Loo 2026-05-31): flip v_delta of this PO's 'incoming' units of
      -- this sku → 'free' (they have physically arrived). Flips the SAME rows
      -- minted at PO-open, so the per-unit count never double-counts vs the
      -- stock_balances bump above.
      update ops_stock_items
         set status = 'free', updated_at = now()
       where id in (
         select id from ops_stock_items
          where po_no = p_po_id and sku = v_sku and status = 'incoming'
          order by created_at
          limit v_delta
       );

      v_total_recv := v_total_recv + v_delta;
    end if;
  end loop;

  select bool_and(coalesce(received_qty,0) >= qty) into v_all_done
    from purchase_order_lines where po_id = p_po_id;

  update purchase_orders
     set status = case when v_all_done then 'received' else status end,
         do_file_path = btrim(p_do_file_path),
         do_number = btrim(p_do_number),
         updated_at = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role, by_user_id)
  values (p_po_id, format('Received %s unit(s) · DO %s', v_total_recv, btrim(p_do_number)), 'operation', v_uid);

  return jsonb_build_object(
    'po_id', p_po_id,
    'received', v_total_recv,
    'all_done', v_all_done
  );
end;
$function$;


-- ─── 7. Delivery sold — operation_attach_do_and_deliver (verbatim + sold block)
-- Verbatim 0151 7-arg body PLUS a per-order_line sold-flip inside the existing
-- stock-out loop.
CREATE OR REPLACE FUNCTION public.operation_attach_do_and_deliver(
  p_order_id      uuid,
  p_do_number     text,
  p_do_note       text,
  p_signed        boolean,
  p_do_file_path  text,
  p_signature_url text default null,
  p_signed_by     text default null
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

  IF v_order.operation_stage IS DISTINCT FROM 'dispatched'
     OR v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not in dispatched state'
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
         delivered_at      = now(),
         updated_at        = now()
   WHERE id = p_order_id;

  PERFORM public._operation_release_order_reserve(p_order_id);

  FOR v_line IN
    SELECT sku, qty FROM order_lines WHERE order_id = p_order_id
  LOOP
    UPDATE stock_balances
       SET qty        = qty - v_line.qty,
           updated_at = now()
     WHERE sku = v_line.sku
       AND warehouse_id = v_order.warehouse_id;

    INSERT INTO stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    VALUES
      (v_line.sku, v_order.warehouse_id, -v_line.qty, 'out',
       'SO-' || v_order.so::text, 'operation', v_user_id);

    -- 0153 (Loo 2026-05-31): mark up to v_line.qty tracked units of this sku
    -- SOLD, recording the customer order + timestamp. Prefer units minted for
    -- a PO that fed THIS order (via its threads), then any on-hand unit, FIFO.
    -- Best-effort: never fails the delivery — the per-unit trail is an overlay.
    UPDATE ops_stock_items i
       SET status        = 'sold',
           sold_at       = now(),
           sold_order_id = p_order_id,
           reserved_ref  = 'SO-' || v_order.so::text,
           ref_history   = array_append(coalesce(i.ref_history, '{}'::text[]),
                                         'SO-' || v_order.so::text),
           updated_at    = now()
     WHERE i.id IN (
       SELECT s.id FROM ops_stock_items s
        WHERE s.sku = v_line.sku
          AND s.warehouse_id = v_order.warehouse_id
          AND s.status IN ('incoming','free','reserved')
        ORDER BY
          CASE WHEN s.po_no IN (
                 SELECT t.po_id FROM order_supplier_threads t
                  WHERE t.order_id = p_order_id AND t.po_id IS NOT NULL
               ) THEN 0 ELSE 1 END,
          s.date_in, s.created_at
        LIMIT v_line.qty
     );
    GET DIAGNOSTICS v_line_sold = ROW_COUNT;
    v_units_sold := v_units_sold + v_line_sold;
  END LOOP;

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
    format('Delivered · DO %s · file %s · signed by %s · %s unit(s) sold%s',
           btrim(p_do_number),
           btrim(p_do_file_path),
           coalesce(nullif(btrim(coalesce(p_signed_by, '')), ''), 'customer'),
           v_units_sold,
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
    'threads_advanced',  v_threads_advanced
  );
END;
$function$;


-- ─── 8. Sanity ──────────────────────────────────────────────────────────────
DO $sanity$
DECLARE
  v_def        text;
  v_no_code    int;
  v_bad_format int;
BEGIN
  -- Every existing unit now has a unit_code, and all match the format.
  SELECT count(*) INTO v_no_code FROM ops_stock_items WHERE unit_code IS NULL;
  IF v_no_code <> 0 THEN
    RAISE EXCEPTION '0153 sanity: % units still have no unit_code', v_no_code;
  END IF;
  SELECT count(*) INTO v_bad_format FROM ops_stock_items
   WHERE unit_code !~ '^id-[a-z]{3}[0-9]{6}$';
  IF v_bad_format <> 0 THEN
    RAISE EXCEPTION '0153 sanity: % unit_codes do not match id-abc123456 format', v_bad_format;
  END IF;

  -- Mint/void/free/sold blocks landed in their host functions.
  v_def := pg_get_functiondef('public._operation_create_po_inner(uuid,uuid,jsonb,integer,integer[],uuid)'::regprocedure);
  IF position('gen_unit_code' in v_def) = 0 THEN
    RAISE EXCEPTION '0153 sanity: _operation_create_po_inner missing the PO-open mint';
  END IF;
  v_def := pg_get_functiondef('public.operation_cancel_po(text)'::regprocedure);
  IF position('voided' in v_def) = 0 THEN
    RAISE EXCEPTION '0153 sanity: operation_cancel_po missing the void block';
  END IF;
  v_def := pg_get_functiondef('public.operation_receive_po_with_do(text,text,text,jsonb)'::regprocedure);
  IF position('ops_stock_items' in v_def) = 0 THEN
    RAISE EXCEPTION '0153 sanity: operation_receive_po_with_do missing the free block';
  END IF;
  v_def := pg_get_functiondef('public.operation_attach_do_and_deliver(uuid,text,text,boolean,text,text,text)'::regprocedure);
  IF position('sold_order_id' in v_def) = 0 THEN
    RAISE EXCEPTION '0153 sanity: operation_attach_do_and_deliver missing the sold block';
  END IF;

  RAISE NOTICE '0153 OK: unit_code minted/backfilled + lifecycle hooks in 4 RPCs';
END $sanity$;
