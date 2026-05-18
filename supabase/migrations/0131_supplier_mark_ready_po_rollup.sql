-- 0131_supplier_mark_ready_po_rollup.sql
-- 2026-05-18 (Loo "b") — Path B: PO sup_status auto-advances when supplier
-- marks all threads ready.
--
-- BUG
--   When supplier presses Mark Ready on each thread (via
--   `supplier_mark_thread_ready`), only `thread.supplier_ready_at` updates.
--   The PO-level `sup_status` stays at `in_production` indefinitely, so
--   neither the LP partner (for partner-owned WH) nor the Operation user
--   (for own-WH) gets a visual signal that supplier is ready.
--
--   Loo's 5 stuck HoOKkA POs (PO-2033/2034/2035/2036/2037) — all threads
--   marked ready, all going to Carres Klang (own WH), all sitting at
--   `in_production`.
--
-- FIX
--   `supplier_mark_thread_ready` + `supplier_unmark_thread_ready` now
--   include a PO-level rollup after the thread update. The target sup_status
--   depends on warehouse ownership:
--
--     warehouse.owning_partner_id IS NOT NULL   → 'ready_confirm_sent'
--       (LP-owned WH; LP needs to accept inbound via
--        lp_accept_inbound_delivery)
--
--     warehouse.owning_partner_id IS NULL       → 'ready_for_pickup'
--       (Carres own WH; Operation sees the signal, receives goods directly
--        via operation_receive_po_with_do — which accepts any pre-received
--        sup_status, so no further gate change needed)
--
--   Rollup runs only when current sup_status is 'acknowledged' or
--   'in_production' (won't overwrite partner_confirmed, partially_shipped,
--   delivered, etc.) and is fully symmetric (mark→advance, unmark→revert).
--
-- BACKFILL
--   5 HoOKkA POs already have all threads ready. Backfill to
--   `ready_for_pickup` since Carres Klang has no owning_partner.
--
-- Loo authorised in conversation 2026-05-18 ("b") per CLAUDE.md §14 #1.


-- =============================================================================
-- PART A — supplier_mark_thread_ready with PO rollup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.supplier_mark_thread_ready(p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread          order_supplier_threads;
  v_po              purchase_orders;
  v_supplier_id     uuid;
  v_actor_uid       uuid;
  v_all_ready       boolean;
  v_warehouse_owner uuid;
  v_target_status   po_sup_status;
  v_advanced        boolean := false;
BEGIN
  v_supplier_id := public.app_supplier_id();
  v_actor_uid   := (SELECT auth.uid());

  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: supplier_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_supplier_id';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;
  IF v_thread.po_id IS NULL THEN
    RAISE EXCEPTION 'thread has no PO' USING ERRCODE = '22023', DETAIL = 'no_po';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id FOR UPDATE;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: not this supplier''s PO'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_po.sup_status NOT IN ('acknowledged', 'in_production', 'ready_for_pickup', 'ready_confirm_sent', 'partially_shipped') THEN
    RAISE EXCEPTION 'PO not in a state that accepts ready ticks (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_po_state';
  END IF;

  IF v_thread.pickup_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'thread already picked up' USING ERRCODE = '22023', DETAIL = 'already_picked';
  END IF;

  IF v_thread.supplier_ready_at IS NOT NULL THEN
    RETURN jsonb_build_object('thread_id', p_thread_id, 'supplier_ready_at', v_thread.supplier_ready_at, 'noop', true);
  END IF;

  UPDATE order_supplier_threads
     SET supplier_ready_at = now(),
         supplier_ready_by = v_actor_uid,
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s marked ready by supplier', p_thread_id),
          'supplier', v_actor_uid);

  -- 0131: PO sup_status rollup. After marking this thread ready, check if
  -- all non-picked threads of this PO are now ready. If yes, advance PO
  -- sup_status to ready_confirm_sent (LP-owned WH) or ready_for_pickup
  -- (own WH). Only runs when current sup_status is acknowledged/in_production
  -- so we don't overwrite downstream states.
  SELECT bool_and(supplier_ready_at IS NOT NULL)
    INTO v_all_ready
    FROM order_supplier_threads
   WHERE po_id = v_po.id
     AND pickup_event_id IS NULL;

  IF v_all_ready IS TRUE
     AND v_po.sup_status IN ('acknowledged', 'in_production') THEN
    SELECT owning_partner_id INTO v_warehouse_owner
      FROM warehouses WHERE id = v_po.warehouse_id;

    v_target_status := CASE
      WHEN v_warehouse_owner IS NOT NULL THEN 'ready_confirm_sent'::po_sup_status
      ELSE 'ready_for_pickup'::po_sup_status
    END;

    UPDATE purchase_orders
       SET sup_status       = v_target_status,
           ready_confirm_at = now(),
           updated_at       = now()
     WHERE id = v_po.id;

    INSERT INTO po_history (po_id, text, by_role, by_user_id)
    VALUES (v_po.id,
            format('All threads ready · PO advanced to %s%s',
                   v_target_status,
                   CASE WHEN v_warehouse_owner IS NOT NULL
                        THEN ' (awaiting LP accept)'
                        ELSE ' (awaiting receive at own WH)'
                   END),
            'supplier', v_actor_uid);

    v_advanced := true;
  END IF;

  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'supplier_ready_at', now(),
    'po_sup_status', CASE WHEN v_advanced THEN v_target_status ELSE v_po.sup_status END,
    'po_advanced', v_advanced
  );
END;
$function$;


-- =============================================================================
-- PART B — supplier_unmark_thread_ready with reverse PO rollup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.supplier_unmark_thread_ready(p_thread_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_thread       order_supplier_threads;
  v_po           purchase_orders;
  v_supplier_id  uuid;
  v_actor_uid    uuid;
  v_all_ready    boolean;
  v_reverted     boolean := false;
BEGIN
  v_supplier_id := public.app_supplier_id();
  v_actor_uid   := (SELECT auth.uid());

  IF public.app_role() <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id FOR UPDATE;
  IF v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross_tenant'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  IF v_thread.pickup_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot unmark: thread already picked up'
      USING ERRCODE = '22023', DETAIL = 'already_picked';
  END IF;
  IF v_thread.supplier_ready_at IS NULL THEN
    RETURN jsonb_build_object('thread_id', p_thread_id, 'noop', true);
  END IF;

  UPDATE order_supplier_threads
     SET supplier_ready_at = NULL,
         supplier_ready_by = NULL,
         updated_at        = now()
   WHERE id = p_thread_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s ready-tick rolled back by supplier', p_thread_id),
          'supplier', v_actor_uid);

  -- 0131: reverse PO rollup. After unmarking this thread, check if at least
  -- one non-picked thread is now not-ready. If so AND PO was at our advanced
  -- state (ready_confirm_sent / ready_for_pickup), revert to in_production
  -- so the PO drops back from LP "Awaiting Accept" / Operation "Ready" UI.
  -- Don't touch if downstream actor has already advanced past us
  -- (partner_confirmed, partially_shipped, etc.).
  SELECT bool_and(supplier_ready_at IS NOT NULL)
    INTO v_all_ready
    FROM order_supplier_threads
   WHERE po_id = v_po.id
     AND pickup_event_id IS NULL;

  IF (v_all_ready IS NOT TRUE)
     AND v_po.sup_status IN ('ready_confirm_sent', 'ready_for_pickup') THEN
    UPDATE purchase_orders
       SET sup_status       = 'in_production',
           ready_confirm_at = NULL,
           updated_at       = now()
     WHERE id = v_po.id;

    INSERT INTO po_history (po_id, text, by_role, by_user_id)
    VALUES (v_po.id,
            'Thread unmarked · PO reverted to in_production',
            'supplier', v_actor_uid);

    v_reverted := true;
  END IF;

  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'po_sup_status', CASE WHEN v_reverted THEN 'in_production' ELSE v_po.sup_status::text END,
    'po_reverted', v_reverted
  );
END;
$function$;


-- =============================================================================
-- PART C — backfill stuck POs (all threads ready but PO stuck at in_production)
-- =============================================================================
WITH ready_pos AS (
  SELECT p.id, p.warehouse_id, w.owning_partner_id
    FROM purchase_orders p
    LEFT JOIN warehouses w ON w.id = p.warehouse_id
   WHERE p.sup_status IN ('acknowledged', 'in_production')
     AND p.status = 'open'
     AND EXISTS (SELECT 1 FROM order_supplier_threads t WHERE t.po_id = p.id)
     AND NOT EXISTS (
       SELECT 1 FROM order_supplier_threads t
        WHERE t.po_id = p.id
          AND t.pickup_event_id IS NULL
          AND t.supplier_ready_at IS NULL
     )
)
UPDATE purchase_orders po
   SET sup_status = CASE
         WHEN rp.owning_partner_id IS NOT NULL THEN 'ready_confirm_sent'::po_sup_status
         ELSE 'ready_for_pickup'::po_sup_status
       END,
       ready_confirm_at = now(),
       updated_at = now()
  FROM ready_pos rp
 WHERE po.id = rp.id;

INSERT INTO po_history (po_id, text, by_role)
SELECT p.id,
       format('0131 backfill · all threads ready → %s', p.sup_status),
       'operation'
  FROM purchase_orders p
 WHERE p.sup_status IN ('ready_confirm_sent', 'ready_for_pickup')
   AND p.ready_confirm_at >= now() - interval '1 minute';


-- =============================================================================
-- PART D — sanity check
-- =============================================================================
DO $sanity$
DECLARE
  stuck_count int;
BEGIN
  SELECT count(*)
    INTO stuck_count
    FROM purchase_orders p
   WHERE p.sup_status IN ('acknowledged', 'in_production')
     AND p.status = 'open'
     AND EXISTS (SELECT 1 FROM order_supplier_threads t WHERE t.po_id = p.id)
     AND NOT EXISTS (
       SELECT 1 FROM order_supplier_threads t
        WHERE t.po_id = p.id
          AND t.pickup_event_id IS NULL
          AND t.supplier_ready_at IS NULL
     );

  IF stuck_count > 0 THEN
    RAISE EXCEPTION '0131 sanity FAILED — % PO(s) have all threads ready but sup_status stuck at in_production',
      stuck_count;
  END IF;
  RAISE NOTICE '0131 sanity OK — all all-threads-ready POs have advanced sup_status';
END
$sanity$;
