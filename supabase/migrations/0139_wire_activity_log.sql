-- =============================================================================
-- 0139_wire_activity_log.sql — Phase C: auto-log system events to ops_activity_log
-- 2026-05-20 (Jess · Phase C, authorised in conversation per CLAUDE.md §7).
--
-- Instruments 7 existing RPCs to emit ops_activity_log rows so the
-- AnnotationTimeline in the order drawer shows system events alongside
-- human annotations.
--
-- Functions instrumented:
--   1. operation_assign_partner  → 'inbox_assign'      (delivery partner set)
--   2. import_autocount_order    → 'autocount_import'  (AC order imported)
--   3. ops_stock_reserve         → 'stock_reserve'     (unit reserved)
--   4. ops_stock_release         → 'stock_release'     (unit released)
--   5. ops_stock_reassign        → 'stock_reassign'    (unit re-linked)
--   6. ops_stock_takeout         → 'stock_takeout'     (unit sold/shipped)
--   7. ops_stock_flag_repair     → 'stock_flag_repair' (unit flagged/unflagged)
--
-- ops_stock_* actions carry order_id resolved via reserved_ref ('SO-NNNN').
-- If the ref cannot be parsed (e.g. stockpile items with no SO), order_id = NULL
-- (the column is nullable per 0138).
--
-- All 7 functions are recreated with CREATE OR REPLACE — no DROP needed since
-- signatures are unchanged. Idempotent: re-applying 0139 after a prior apply
-- is safe (ops_activity_log rows are appended, not overwritten).
-- =============================================================================


-- ─── 0. Helper: resolve order_id from a stock ref like 'SO-1001' ─────────────
-- ops_stock_* RPCs don't receive order_id directly; the reserved_ref is the
-- link. Returns NULL for stockpile refs that don't match an order so pattern.
CREATE OR REPLACE FUNCTION public._activity_log_order_id_from_ref(p_ref text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
    FROM orders
   WHERE so = (regexp_match(p_ref, '(?i)(?:SO|DL)-(\d+)'))[1]::int
   LIMIT 1;
$$;


-- ─── 1. operation_assign_partner → 'inbox_assign' ───────────────────────────
-- Based on 0086 body, updated by 0121 (logistics→operation renames) and
-- 0126 (dl→so JSON key fix).
CREATE OR REPLACE FUNCTION public.operation_assign_partner(
  p_order_id   uuid,
  p_partner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order             orders;
  v_partner           delivery_partners;
  v_actor             text;
  v_first_thread_wh   uuid;
  v_threads_advanced  int := 0;
BEGIN
  IF NOT public.is_operation() THEN
    RAISE EXCEPTION 'forbidden: operation only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;

  IF v_order.operation_stage IS DISTINCT FROM 'ready_to_dispatch'
     OR v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not ready to dispatch'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  SELECT * INTO v_partner FROM delivery_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery partner not found'
      USING ERRCODE = 'P0001', DETAIL = 'partner_not_found';
  END IF;

  v_actor := COALESCE(
    (SELECT name FROM app_users WHERE id = (SELECT auth.uid())),
    'Logistics'
  );

  -- Pick warehouse from first ready_to_dispatch thread (0086 logic)
  SELECT warehouse_id INTO v_first_thread_wh
    FROM order_supplier_threads
   WHERE order_id     = p_order_id
     AND operation_stage = 'ready_to_dispatch'
     AND warehouse_id IS NOT NULL
   ORDER BY id
   LIMIT 1;

  UPDATE orders
     SET delivery_partner_id = p_partner_id,
         operation_stage     = 'dispatched',
         dispatched_at       = now(),
         warehouse_id        = COALESCE(v_first_thread_wh, warehouse_id),
         updated_at          = now()
   WHERE id = p_order_id;

  UPDATE order_supplier_threads
     SET delivery_partner_id     = p_partner_id,
         confirm_delivery_date   = v_order.delivery_date,
         partner_accepted_at     = now(),
         partner_rejected_at     = NULL,
         request_for_delivery_at = NULL,
         operation_stage         = 'dispatched',
         updated_at              = now()
   WHERE order_id       = p_order_id
     AND operation_stage = 'ready_to_dispatch';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Dispatched via %s (%s thread%s advanced)',
           v_partner.name,
           v_threads_advanced,
           CASE WHEN v_threads_advanced = 1 THEN '' ELSE 's' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Assigned partner · DL-%s · %s', v_order.so, v_partner.name),
          v_order.dealer_id, 'DL-' || v_order.so::text);

  -- Phase C: activity log
  INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
  VALUES (p_order_id, 'inbox_assign', auth.uid(),
    jsonb_build_object(
      'partner_name',     v_partner.name,
      'threads_advanced', v_threads_advanced
    ));

  RETURN jsonb_build_object(
    'id',                  v_order.id,
    'so',                  v_order.so,
    'operation_stage',     'dispatched',
    'delivery_partner_id', p_partner_id,
    'dispatched_at',       now(),
    'warehouse_id',        COALESCE(v_first_thread_wh, v_order.warehouse_id),
    'threads_advanced',    v_threads_advanced
  );
END;
$$;

REVOKE ALL ON FUNCTION public.operation_assign_partner(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.operation_assign_partner(uuid, uuid) TO authenticated;


-- ─── 2. import_autocount_order → 'autocount_import' ─────────────────────────
-- Full body from 0135, activity_log INSERT added after the final audit_log INSERT.
-- The early-exit path (status <> 'place') is NOT logged — nothing changed.
CREATE OR REPLACE FUNCTION public.import_autocount_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role         app_role;
  v_dealer_id    uuid;
  v_src_system   text;
  v_src_ref      text[];
  v_existing     record;
  v_order_id     uuid;
  v_so           int;
  v_items_edited boolean := false;
  v_skip_lines   boolean := false;
  v_line         jsonb;
  v_result       text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden: import is operation/principal only'
      USING ERRCODE = '42501';
  END IF;

  v_dealer_id  := nullif(payload->>'dealer_id','')::uuid;
  v_src_system := coalesce(nullif(payload->>'source_system',''), 'autocount');
  SELECT array_agg(value::text)
    INTO v_src_ref
    FROM jsonb_array_elements_text(coalesce(payload->'source_ref','[]'::jsonb));

  IF v_dealer_id IS NULL THEN
    RAISE EXCEPTION 'dealer_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_src_ref IS NULL OR array_length(v_src_ref,1) IS NULL THEN
    RAISE EXCEPTION 'source_ref must be a non-empty array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(coalesce(payload->'lines','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'order must have at least one line' USING ERRCODE = '22023';
  END IF;

  SELECT id, so, status, items_edited
    INTO v_existing
    FROM orders
   WHERE source_system = v_src_system
     AND source_ref    = v_src_ref;

  IF FOUND THEN
    IF v_existing.status <> 'place' THEN
      RETURN jsonb_build_object(
        'id', v_existing.id, 'so', v_existing.so,
        'source_ref', to_jsonb(v_src_ref), 'result', 'skipped_locked');
    END IF;

    v_items_edited := coalesce(v_existing.items_edited, false);
    v_skip_lines   := v_items_edited;

    UPDATE orders SET
      dealer_id                = v_dealer_id,
      channel                  = coalesce(nullif(payload->>'channel',''), 'dealer'),
      customer_name            = payload->>'customer_name',
      customer_phone           = nullif(payload->>'customer_phone',''),
      customer_address         = nullif(payload->>'customer_address',''),
      customer_address_unknown = coalesce((payload->>'customer_address_unknown')::boolean, false),
      delivery_date            = nullif(payload->>'delivery_date','')::date,
      delivery_date_tbd        = coalesce((payload->>'delivery_date_tbd')::boolean, false),
      paid                     = coalesce((payload->>'paid')::numeric, 0),
      updated_at               = now()
    WHERE id = v_existing.id
    RETURNING id, so INTO v_order_id, v_so;

    IF NOT v_skip_lines THEN
      DELETE FROM order_lines WHERE order_id = v_order_id;
    END IF;
    v_result := CASE WHEN v_skip_lines THEN 'updated_items_locked' ELSE 'updated' END;
  ELSE
    INSERT INTO orders (
      dealer_id, channel,
      customer_name, customer_phone, customer_address, customer_address_unknown,
      delivery_date, delivery_date_tbd,
      paid, terms_accepted,
      source_system, source_ref
    ) VALUES (
      v_dealer_id,
      coalesce(nullif(payload->>'channel',''), 'dealer'),
      payload->>'customer_name',
      nullif(payload->>'customer_phone',''),
      nullif(payload->>'customer_address',''),
      coalesce((payload->>'customer_address_unknown')::boolean, false),
      nullif(payload->>'delivery_date','')::date,
      coalesce((payload->>'delivery_date_tbd')::boolean, false),
      coalesce((payload->>'paid')::numeric, 0),
      false,
      v_src_system,
      v_src_ref
    )
    RETURNING id, so INTO v_order_id, v_so;
    v_result := 'created';
  END IF;

  IF NOT v_skip_lines THEN
    FOR v_line IN SELECT * FROM jsonb_array_elements(payload->'lines') LOOP
      INSERT INTO order_lines (order_id, sku, qty, attrs, unit_price, source_po)
      VALUES (
        v_order_id,
        v_line->>'sku',
        coalesce((v_line->>'qty')::int, 1),
        v_line->'attrs',
        coalesce((v_line->>'unit_price')::numeric, 0),
        nullif(v_line->>'source_po','')
      );
    END LOOP;
  END IF;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    v_order_id,
    CASE
      WHEN v_skip_lines THEN format(
        'AutoCount re-import · %s · items preserved (portal-edited)',
        array_to_string(v_src_ref,' + '))
      ELSE format(
        'AutoCount import (%s) · %s', v_result,
        array_to_string(v_src_ref,' + '))
    END,
    v_role
  );

  INSERT INTO audit_log (role, action, dealer_id, ref)
  VALUES (
    v_role,
    CASE WHEN v_skip_lines THEN 'order.imported.items_locked' ELSE 'order.imported' END,
    v_dealer_id,
    array_to_string(v_src_ref, ' + ')
  );

  -- Phase C: activity log
  INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
  VALUES (v_order_id, 'autocount_import', auth.uid(),
    jsonb_build_object(
      'result',     v_result,
      'source_ref', to_jsonb(v_src_ref)
    ));

  RETURN jsonb_build_object(
    'id', v_order_id,
    'so', v_so,
    'source_ref', to_jsonb(v_src_ref),
    'result', v_result
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_autocount_order(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.import_autocount_order(jsonb) TO authenticated;


-- ─── 3. ops_stock_reserve → 'stock_reserve' ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_stock_reserve(
  p_sku       text,
  p_ref       text,
  p_condition text DEFAULT NULL,
  p_wh        uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_wh   uuid := p_wh;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden: ops stock action requires operation/principal'
      USING ERRCODE = '42501';
  END IF;

  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM warehouses WHERE name ILIKE '%klang%' LIMIT 1;
  END IF;
  IF v_wh IS NULL THEN
    RAISE EXCEPTION 'warehouse not found' USING ERRCODE = '22023';
  END IF;

  UPDATE ops_stock_items
     SET status       = 'reserved',
         reserved_ref = p_ref,
         updated_at   = now()
   WHERE id = (
     SELECT id FROM ops_stock_items
      WHERE sku          = p_sku
        AND warehouse_id = v_wh
        AND status       = 'free'
        AND needs_repair = false
        AND (p_condition IS NULL OR condition = p_condition)
      ORDER BY date_in ASC NULLS LAST, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.reserve', p_ref);

    -- Phase C: activity log
    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(p_ref),
      'stock_reserve',
      auth.uid(),
      jsonb_build_object('sku', p_sku, 'ref', p_ref, 'item_id', v_id)
    );
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_reserve(text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_reserve(text, text, text, uuid) TO authenticated;


-- ─── 4. ops_stock_release → 'stock_release' ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_stock_release(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_ref  text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET status       = 'free',
         reserved_ref = NULL,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id     = p_item_id
     AND status = 'reserved'
   RETURNING id, reserved_ref INTO v_id, v_ref;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.release', v_ref);

    -- Phase C: activity log
    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_release',
      auth.uid(),
      jsonb_build_object('item_id', v_id, 'ref', v_ref)
    );
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_release(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_release(uuid) TO authenticated;


-- ─── 5. ops_stock_reassign → 'stock_reassign' ────────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_stock_reassign(p_item_id uuid, p_new_ref text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET reserved_ref = p_new_ref,
         ref_history  = CASE
                          WHEN reserved_ref IS NOT NULL AND reserved_ref <> p_new_ref
                            THEN array_append(ref_history, reserved_ref)
                          ELSE ref_history
                        END,
         updated_at   = now()
   WHERE id     = p_item_id
     AND status = 'reserved'
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.reassign', p_new_ref);

    -- Phase C: activity log
    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(p_new_ref),
      'stock_reassign',
      auth.uid(),
      jsonb_build_object('item_id', v_id, 'new_ref', p_new_ref)
    );
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_reassign(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_reassign(uuid, text) TO authenticated;


-- ─── 6. ops_stock_takeout → 'stock_takeout' ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ops_stock_takeout(p_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role app_role;
  v_id   uuid;
  v_sku  text;
  v_wh   uuid;
  v_ref  text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE ops_stock_items
     SET status     = 'sold',
         updated_at = now()
   WHERE id     = p_item_id
     AND status IN ('free','reserved')
   RETURNING id, sku, warehouse_id, reserved_ref
        INTO v_id, v_sku, v_wh, v_ref;

  IF v_id IS NOT NULL THEN
    INSERT INTO stock_movements (sku, warehouse_id, kind, qty, ref)
    VALUES (v_sku, v_wh, 'out', 1, COALESCE(v_ref, 'ops_stock.takeout'));

    PERFORM public.ops_rollup_stock_balances(v_wh);

    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role, 'ops_stock.takeout', v_ref);

    -- Phase C: activity log
    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_ref),
      'stock_takeout',
      auth.uid(),
      jsonb_build_object('sku', v_sku, 'item_id', v_id, 'ref', v_ref)
    );
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_takeout(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_takeout(uuid) TO authenticated;


-- ─── 7. ops_stock_flag_repair → 'stock_flag_repair' ──────────────────────────
-- Adds v_item_ref variable to look up reserved_ref for order linking.
CREATE OR REPLACE FUNCTION public.ops_stock_flag_repair(p_item_id uuid, p_flag boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role     app_role;
  v_id       uuid;
  v_item_ref text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('operation','principal') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Look up reserved_ref before update for order linking in activity log
  SELECT reserved_ref INTO v_item_ref
    FROM ops_stock_items WHERE id = p_item_id;

  UPDATE ops_stock_items
     SET needs_repair = p_flag,
         updated_at   = now()
   WHERE id = p_item_id
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    INSERT INTO audit_log (role, action, ref)
    VALUES (v_role,
            CASE WHEN p_flag THEN 'ops_stock.flag_repair' ELSE 'ops_stock.unflag_repair' END,
            p_item_id::text);

    -- Phase C: activity log
    INSERT INTO ops_activity_log (order_id, action, actor_id, detail)
    VALUES (
      public._activity_log_order_id_from_ref(v_item_ref),
      'stock_flag_repair',
      auth.uid(),
      jsonb_build_object(
        'item_id', p_item_id,
        'flag',    p_flag,
        'ref',     v_item_ref
      )
    );
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ops_stock_flag_repair(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.ops_stock_flag_repair(uuid, boolean) TO authenticated;


-- ─── 8. Sanity check ─────────────────────────────────────────────────────────
DO $$
DECLARE
  fn_count int;
BEGIN
  SELECT COUNT(*) INTO fn_count
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN (
       '_activity_log_order_id_from_ref',
       'operation_assign_partner',
       'import_autocount_order',
       'ops_stock_reserve', 'ops_stock_release', 'ops_stock_reassign',
       'ops_stock_takeout', 'ops_stock_flag_repair'
     );

  ASSERT fn_count = 8,
    format('0139 sanity: expected 8 functions, found %s', fn_count);

  -- Verify each instrumented function now references ops_activity_log
  ASSERT (
    SELECT COUNT(*) FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname IN (
         'operation_assign_partner', 'import_autocount_order',
         'ops_stock_reserve', 'ops_stock_release', 'ops_stock_reassign',
         'ops_stock_takeout', 'ops_stock_flag_repair'
       )
       AND pg_get_functiondef(oid) LIKE '%ops_activity_log%'
  ) = 7,
  '0139 sanity: not all 7 functions reference ops_activity_log';

  RAISE NOTICE '0139 sanity OK — 7 functions instrumented with ops_activity_log';
END;
$$;
