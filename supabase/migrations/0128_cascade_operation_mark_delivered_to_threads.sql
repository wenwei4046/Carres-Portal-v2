-- 0128_cascade_operation_mark_delivered_to_threads.sql
-- 2026-05-18 (Loo screenshot — partner Scheduled column still showed
-- #1003 after Operation pressed "ATTACH DO & MARK DELIVERED")
--
-- BUG
--   `operation_attach_do_and_deliver` updates `orders` directly to
--   `status='delivered', operation_stage='delivered'` but **never
--   propagates to `order_supplier_threads`**. Threads stay at
--   `operation_stage='dispatched'` with `delivered_at IS NULL`.
--
--   The Logistics Partner portal's kanban reads from
--   `partner_threads_to_deliver()` which surfaces threads where
--   `operation_stage = 'dispatched'` in the SCHEDULED column. So the
--   partner sees orders the Operation has already delivered as still
--   pending pickup-delivery.
--
-- ROOT CAUSE
--   Asymmetric write: when partner uses `partner_attach_pod`, it writes
--   to thread (operation_stage='delivered' + pod_*) and the rollup
--   trigger propagates UP to orders. But the reverse path
--   (operation_attach_do_and_deliver → orders directly) has no DOWN
--   propagation to threads. Order-level override was added before the
--   per-thread architecture and never updated for it.
--
-- FIX (2 parts in one migration)
--   PART A — backfill order_supplier_threads for any order where
--            `orders.operation_stage = 'delivered'` but threads are
--            still at any non-delivered stage. Unblocks #1003 + any
--            sibling orders in the same broken state.
--   PART B — CREATE OR REPLACE `operation_attach_do_and_deliver` so
--            the cascade happens in the same transaction as the order
--            update. Adds one UPDATE statement on
--            `order_supplier_threads` near the end of the function.
--            COALESCE preserves `delivered_at` if a thread was already
--            partner-marked delivered (idempotent on mixed states).
--
-- POST-FIX BEHAVIOR
--   * Operation marks delivered → all threads of that order transition
--     to `operation_stage='delivered'` + `delivered_at=now()` (or
--     existing value if any thread was partner-marked first).
--   * Partner kanban no longer surfaces the order under SCHEDULED.
--   * pod_url / pod_do_number on thread stay NULL (Operation-marked
--     orders don't have partner POD; the order's DO file is at
--     `orders.do_file_path` instead).
--
-- Loo authorised in conversation 2026-05-18 (screenshot bug report)
-- per CLAUDE.md §14 #1 single-instance approval.


-- =============================================================================
-- PART A — backfill orphan threads
-- =============================================================================
UPDATE order_supplier_threads t
   SET operation_stage = 'delivered',
       delivered_at    = COALESCE(t.delivered_at, o.delivered_at, now()),
       updated_at      = now()
  FROM orders o
 WHERE t.order_id        = o.id
   AND o.status          = 'delivered'
   AND o.operation_stage = 'delivered'
   AND t.operation_stage <> 'delivered';


-- =============================================================================
-- PART B — CREATE OR REPLACE operation_attach_do_and_deliver
--          (body identical to live state except for new thread cascade
--          block at the end before INSERT order_history)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.operation_attach_do_and_deliver(p_order_id uuid, p_do_number text, p_do_note text, p_signed boolean, p_do_file_path text)
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
     SET status          = 'delivered',
         operation_stage = 'delivered',
         do_number       = btrim(p_do_number),
         do_note         = nullif(btrim(coalesce(p_do_note, '')), ''),
         do_file_path    = btrim(p_do_file_path),
         do_uploaded_at  = now(),
         do_uploaded_by  = v_user_id,
         delivered_at    = now(),
         updated_at      = now()
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
  END LOOP;

  -- 0128: cascade order-level delivered state down to threads so the
  -- Logistics Partner kanban (partner_threads_to_deliver) reflects the
  -- Operation-side override. COALESCE preserves any thread that was
  -- already partner-marked delivered.
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
    format('Delivered · DO %s · file %s%s',
           btrim(p_do_number),
           btrim(p_do_file_path),
           CASE WHEN v_threads_advanced > 0
                THEN format(' · %s thread(s) advanced', v_threads_advanced)
                ELSE '' END),
    'operation'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('operation', v_actor,
          format('Delivered DL-%s · DO %s', v_order.so, btrim(p_do_number)),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  RETURN jsonb_build_object(
    'id',               v_order.id,
    'so',               v_order.so,
    'status',           'delivered',
    'operation_stage',  'delivered',
    'do_number',        btrim(p_do_number),
    'do_file_path',     btrim(p_do_file_path),
    'delivered_at',     now(),
    'threads_advanced', v_threads_advanced
  );
END;
$function$;


-- =============================================================================
-- PART C — sanity check
-- =============================================================================
DO $sanity$
DECLARE leftover int;
BEGIN
  SELECT count(*) INTO leftover
    FROM order_supplier_threads t
    JOIN orders o ON o.id = t.order_id
   WHERE o.status          = 'delivered'
     AND o.operation_stage = 'delivered'
     AND t.operation_stage <> 'delivered';

  IF leftover > 0 THEN
    RAISE EXCEPTION '0128 sanity FAILED — % thread(s) still not delivered while order is delivered',
      leftover;
  END IF;
  RAISE NOTICE '0128 sanity OK — all delivered orders have delivered threads';
END
$sanity$;
