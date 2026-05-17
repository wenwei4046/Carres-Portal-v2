-- 0114_thread_ready_no_sup_status_flip.sql
-- 2026-05-16 (Loo screenshot) — per-thread ready ticks must NOT flip the PO's
-- sup_status. Mental model: a PO has 4 SOs; supplier finishing 1 SO means
-- "1 of 4 ready", not "the whole PO ready for pickup". Pre-0114 behavior
-- mass-flipped sup_status the moment the first thread was ticked, which
-- jumped the entire PO card from the supplier's "PO" column to the
-- "Ready to Pickup" column even though 3 of 4 SOs were still on the
-- production floor.
--
-- After 0114 the truth lives per-thread:
--   order_supplier_threads.supplier_ready_at  (set by mark-ready)
--   order_supplier_threads.pickup_event_id    (set by partner_pickup_threads)
--
-- Kanban column membership on BOTH supplier and partner UI is derived from
-- these per-thread booleans. Same PO appears in the "PO" column AND the
-- "Ready to Pickup" column when partial; partner sees the ready ones and
-- can batch-pickup them while the rest keep producing.
--
-- sup_status changes ONLY via:
--   * supplier_acknowledge        pending → acknowledged
--   * supplier_start_production   acknowledged | pending → in_production
--   * logistics_supplier_ready_confirm (legacy PO-level "mark whole PO ready")
--                                 in_production → ready_confirm_sent
--   * partner_pickup_threads      → partially_shipped (some left) | shipped (none left)
--   * logistics_receive_threads   → partially_shipped | picked_up
--   * supplier_mark_delivered     → delivered (terminal)
--
-- Idempotent: drop-in CREATE OR REPLACE of two RPCs only. No data migration
-- required; existing POs that had sup_status flipped under 0107 stay where
-- they are (UI bucket logic will reclassify on next reload).

CREATE OR REPLACE FUNCTION public.supplier_mark_thread_ready(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread       order_supplier_threads;
  v_po           purchase_orders;
  v_supplier_id  uuid;
  v_actor_uid    uuid;
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

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id;
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
    -- idempotent: already ready, return current state
    RETURN jsonb_build_object('thread_id', p_thread_id, 'supplier_ready_at', v_thread.supplier_ready_at, 'noop', true);
  END IF;

  UPDATE order_supplier_threads
     SET supplier_ready_at = now(),
         supplier_ready_by = v_actor_uid,
         updated_at        = now()
   WHERE id = p_thread_id;

  -- 0114: NO sup_status mutation here. Kanban column placement is derived
  -- from per-thread state by the supplier + partner read paths.

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s marked ready by supplier', p_thread_id),
          'supplier', v_actor_uid);

  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'supplier_ready_at', now(),
    'po_sup_status', v_po.sup_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_mark_thread_ready(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_mark_thread_ready(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.supplier_unmark_thread_ready(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread       order_supplier_threads;
  v_po           purchase_orders;
  v_supplier_id  uuid;
  v_actor_uid    uuid;
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

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_thread.po_id;
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

  -- 0114: NO sup_status mutation here. The PO stays where it is; the
  -- supplier-side bucket logic recomputes column membership from the
  -- per-thread state on next reload.

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (v_po.id,
          format('Thread %s ready-tick rolled back by supplier', p_thread_id),
          'supplier', v_actor_uid);

  RETURN jsonb_build_object('thread_id', p_thread_id, 'po_sup_status', v_po.sup_status);
END;
$$;
REVOKE ALL ON FUNCTION public.supplier_unmark_thread_ready(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_unmark_thread_ready(uuid) TO authenticated;
