-- =============================================================================
-- 0086_assign_partner_propagate_to_threads.sql (Loo 2026-05-11)
-- =============================================================================
-- The legacy `logistics_assign_partner(p_order_id, p_partner_id)` RPC (from
-- migration 0019) only mutates `orders` — predates the multi-supplier
-- thread architecture (Phase 4.5 Chunk 2). Result: when Logistics dispatches
-- via the legacy DispatchModal, the partner can't see the delivery from
-- their `Deliveries` page (sourced from `order_supplier_threads` via
-- `partner_threads_to_deliver` RPC) AND the order detail's
-- "Source warehouse" stays blank because `orders.warehouse_id` was never
-- propagated from the thread that holds the goods.
--
-- This migration recreates `logistics_assign_partner` so it ALSO:
--   1. Sets `orders.warehouse_id` from the FIRST ready-to-dispatch thread on
--      the order. Single-supplier orders (the common case) have one thread
--      and the choice is unambiguous; multi-supplier orders need the new
--      DispatchPartnerDialog/dispatch-customer-leg flow which already routes
--      per-thread, so this single-thread-pick is acceptable.
--   2. For every ready_to_dispatch thread on the order, force-dispatches
--      it (logistics_stage='dispatched', delivery_partner_id, partner_
--      accepted_at, request_for_delivery_at=NULL). confirm_delivery_date
--      is sourced from orders.delivery_date so the thread carries the
--      same date the customer agreed to.
--
-- Backfill block at the end fixes order #1004 which was dispatched before
-- this RPC was repaired.
-- =============================================================================


CREATE OR REPLACE FUNCTION public.logistics_assign_partner(
  p_order_id  uuid,
  p_partner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_order   orders;
  v_partner delivery_partners;
  v_actor   text;
  v_first_thread_wh uuid;
  v_threads_advanced int := 0;
BEGIN
  IF NOT public.is_logistics() THEN
    RAISE EXCEPTION 'forbidden: logistics only' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found'
      USING ERRCODE = '42P01', DETAIL = 'order_not_found';
  END IF;

  IF v_order.logistics_stage IS DISTINCT FROM 'ready_to_dispatch'
     OR v_order.status <> 'proceed_order' THEN
    RAISE EXCEPTION 'order is not ready to dispatch'
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  SELECT * INTO v_partner FROM delivery_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery partner not found'
      USING ERRCODE = 'P0001', DETAIL = 'partner_not_found';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Logistics');

  -- 0086: pick the first ready_to_dispatch thread's warehouse_id as the
  -- order-level source warehouse. Multi-supplier orders should use the
  -- per-thread DispatchPartnerDialog flow instead.
  SELECT warehouse_id INTO v_first_thread_wh
    FROM order_supplier_threads
   WHERE order_id = p_order_id
     AND logistics_stage = 'ready_to_dispatch'
     AND warehouse_id IS NOT NULL
   ORDER BY id
   LIMIT 1;

  UPDATE orders
     SET delivery_partner_id = p_partner_id,
         logistics_stage     = 'dispatched',
         dispatched_at       = now(),
         warehouse_id        = COALESCE(v_first_thread_wh, warehouse_id),
         updated_at          = now()
   WHERE id = p_order_id;

  -- 0086: propagate the assignment to every ready_to_dispatch thread on
  -- this order. Force-dispatch path (no RFD round-trip) — confirm date is
  -- the order's delivery_date (the customer-agreed slot).
  UPDATE order_supplier_threads
     SET delivery_partner_id    = p_partner_id,
         confirm_delivery_date  = v_order.delivery_date,
         partner_accepted_at    = now(),
         partner_rejected_at    = NULL,
         request_for_delivery_at = NULL,
         logistics_stage        = 'dispatched',
         updated_at             = now()
   WHERE order_id = p_order_id
     AND logistics_stage = 'ready_to_dispatch';
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    p_order_id,
    format('Dispatched via %s (%s thread%s advanced)',
           v_partner.name,
           v_threads_advanced,
           CASE WHEN v_threads_advanced = 1 THEN '' ELSE 's' END),
    'logistics'
  );

  INSERT INTO audit_log (role, actor_text, action, dealer_id, ref)
  VALUES ('logistics', v_actor,
          format('Assigned partner · DL-%s · %s', v_order.dl, v_partner.name),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  RETURN jsonb_build_object(
    'id',                  v_order.id,
    'dl',                  v_order.dl,
    'logistics_stage',     'dispatched',
    'delivery_partner_id', p_partner_id,
    'dispatched_at',       now(),
    'warehouse_id',        COALESCE(v_first_thread_wh, v_order.warehouse_id),
    'threads_advanced',    v_threads_advanced
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_assign_partner(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_assign_partner(uuid, uuid) TO authenticated;


-- =============================================================================
-- One-shot backfill: order #1004 (and any other order that hit the legacy
-- buggy path before this fix). Selects orders where:
--   - logistics_stage = 'dispatched' AND delivery_partner_id IS NOT NULL
--     (the buggy RPC ran)
--   - At least one thread is still at 'ready_to_dispatch' OR
--     thread.delivery_partner_id IS NULL (orphaned threads)
-- =============================================================================
DO $$
DECLARE
  r record;
  v_first_wh uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT o.id, o.dl, o.delivery_partner_id, o.delivery_date, o.warehouse_id
      FROM orders o
      JOIN order_supplier_threads t ON t.order_id = o.id
     WHERE o.logistics_stage = 'dispatched'
       AND o.delivery_partner_id IS NOT NULL
       AND (t.logistics_stage = 'ready_to_dispatch' OR t.delivery_partner_id IS NULL)
  LOOP
    SELECT warehouse_id INTO v_first_wh
      FROM order_supplier_threads
     WHERE order_id = r.id
       AND warehouse_id IS NOT NULL
     ORDER BY id LIMIT 1;

    -- Patch missing orders.warehouse_id
    IF r.warehouse_id IS NULL AND v_first_wh IS NOT NULL THEN
      UPDATE orders SET warehouse_id = v_first_wh WHERE id = r.id;
    END IF;

    -- Force-advance any ready_to_dispatch threads with the order's LP
    UPDATE order_supplier_threads
       SET delivery_partner_id    = r.delivery_partner_id,
           confirm_delivery_date  = COALESCE(confirm_delivery_date, r.delivery_date),
           partner_accepted_at    = COALESCE(partner_accepted_at, now()),
           partner_rejected_at    = NULL,
           request_for_delivery_at = NULL,
           logistics_stage        = 'dispatched',
           updated_at             = now()
     WHERE order_id = r.id
       AND logistics_stage = 'ready_to_dispatch';

    -- Patch orphaned threads (delivery_partner_id IS NULL but stage already
    -- past ready_to_dispatch — defensive)
    UPDATE order_supplier_threads
       SET delivery_partner_id    = r.delivery_partner_id,
           updated_at             = now()
     WHERE order_id = r.id
       AND delivery_partner_id IS NULL;

    RAISE NOTICE '0086 backfill: order DL-% patched', r.dl;
  END LOOP;
END $$;
