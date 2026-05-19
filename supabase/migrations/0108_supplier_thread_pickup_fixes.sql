-- =============================================================================
-- 0108_supplier_thread_pickup_fixes.sql (Loo 2026-05-15)
-- =============================================================================
-- Code-review fixes for migration 0107 (per CLAUDE.md §7+§14 #6 — never edit
-- committed migrations; write a new one). Authorized in conversation 2026-05-15.
--
-- F1 [BUG]: 0107's logistics_receive_threads set logistics_stage='received',
--           which is NOT a value of the logistics_stage enum
--           (placed | proceed_request | awaiting_logistics_action |
--            ready_to_dispatch | dispatched | waiting | delivered).
--           Result: runtime SQL error any time logistics tried to receive a PO
--           via the new RPC. Fixed to 'ready_to_dispatch' — own_logistics
--           receive always lands at the warehouse, awaiting customer-leg
--           dispatch, mirroring the SOP-aware pattern already in
--           logistics_receive_po_with_do (migrations 0034/0076 lines ~212-215).
--
-- F2 [BUG]: 0107's partner_pickup_threads set logistics_stage='dispatched' for
--           ALL threads regardless of SOP. Wrong for STANDARD threads: those
--           goods are at the supplier's factory awaiting hand-off, not yet
--           dispatched to customer. Setting flat 'dispatched' would
--           (a) mis-roll into orders.logistics_stage='dispatched' and
--           (b) prematurely trigger 0098 auto-issue-invoice. Fixed with
--           SOP-aware CASE: SOFA_SPECIAL (direct-ship factory→customer) →
--           'dispatched'; STANDARD (factory → WH → customer) → 'ready_to_dispatch'.
--
-- F3 [CONVENTION]: 0107 used terminal sup_status 'shipped' (partner branch) and
--           'picked_up' (logistics branch). Legacy logistics_receive_po_with_do
--           (0034/0076) uses 'delivered' as the terminal "supplier-side done"
--           state. Downstream consumers (Forecast page's OPEN_SUP_STATUSES
--           filter, dashboard counts) treat 'delivered' as the canonical
--           closed-on-supplier-side terminal. Both branches converge to
--           'delivered'; intermediate stays 'partially_shipped'.
--
-- This migration DROPs + recreates the 2 affected functions. The CREATE OR
-- REPLACE in 0107 already established them; redeclaring with the same
-- signature replaces the body cleanly without dropping dependent GRANTs.
-- =============================================================================

-- F1 + F3 fix: logistics_receive_threads now uses 'ready_to_dispatch' for the
-- thread stage and 'delivered' for the terminal sup_status.
CREATE OR REPLACE FUNCTION public.logistics_receive_threads(
  p_po_id        text,
  p_thread_ids   uuid[],
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po           purchase_orders;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
BEGIN
  v_actor_uid  := (SELECT auth.uid());

  IF public.app_role() <> 'logistics' THEN
    RAISE EXCEPTION 'forbidden: logistics role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;
  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file path required'
      USING ERRCODE = '22023', DETAIL = 'do_file_required';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT count(*) INTO v_thread_count
    FROM order_supplier_threads
   WHERE id = ANY(p_thread_ids)
     AND po_id = p_po_id
     AND supplier_ready_at IS NOT NULL
     AND pickup_event_id IS NULL
   FOR UPDATE;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id, btrim(p_do_number), btrim(p_do_file_path), nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'logistics')
  RETURNING id INTO v_event_id;

  -- F1 fix: own_logistics receive lands goods at WH awaiting customer-leg dispatch.
  -- Always 'ready_to_dispatch' (no SOFA_SPECIAL branch because own_logistics
  -- by definition routes goods through the warehouse, not direct-to-customer).
  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         logistics_stage = 'ready_to_dispatch'::logistics_stage,
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  -- F3 fix: terminal converges to 'delivered' (consistency with
  -- logistics_receive_po_with_do); intermediate stays 'partially_shipped'.
  IF v_remaining = 0 THEN
    v_new_sup_status := 'delivered';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Logistics received %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'logistics', v_actor_uid);

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.logistics_receive_threads(text, uuid[], text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_receive_threads(text, uuid[], text, text, text) TO authenticated;

-- F2 + F3 fix: partner_pickup_threads now SOP-aware on thread stage; terminal
-- sup_status converges to 'delivered'.
CREATE OR REPLACE FUNCTION public.partner_pickup_threads(
  p_po_id        text,
  p_thread_ids   uuid[],
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po           purchase_orders;
  v_partner_id   uuid;
  v_actor_uid    uuid;
  v_event_id     uuid;
  v_thread_count int;
  v_remaining    int;
  v_new_sup_status po_sup_status;
BEGIN
  v_partner_id := public.app_partner_id();
  v_actor_uid  := (SELECT auth.uid());

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;
  IF p_do_file_path IS NULL OR btrim(p_do_file_path) = '' THEN
    RAISE EXCEPTION 'DO file path required'
      USING ERRCODE = '22023', DETAIL = 'do_file_required';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: PO not assigned to this partner'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  -- Validate each thread: belongs to PO, supplier-ready, not yet picked
  SELECT count(*) INTO v_thread_count
    FROM order_supplier_threads
   WHERE id = ANY(p_thread_ids)
     AND po_id = p_po_id
     AND supplier_ready_at IS NOT NULL
     AND pickup_event_id IS NULL
   FOR UPDATE;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible (not ready / wrong PO / already picked)'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  -- Create pickup event
  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id, btrim(p_do_number), btrim(p_do_file_path), nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'partner')
  RETURNING id INTO v_event_id;

  -- F2 fix: SOP-aware thread stage. SOFA_SPECIAL (direct-ship factory→customer)
  -- → 'dispatched'; STANDARD (factory → WH → customer) → 'ready_to_dispatch'.
  -- Mirrors logistics_receive_po_with_do convention (0034/0076 lines ~212-215).
  UPDATE order_supplier_threads
     SET pickup_event_id = v_event_id,
         logistics_stage = CASE WHEN sop_name = 'SOFA_SPECIAL'
                                THEN 'dispatched'::logistics_stage
                                ELSE 'ready_to_dispatch'::logistics_stage
                           END,
         updated_at      = now()
   WHERE id = ANY(p_thread_ids);

  -- Recompute PO sup_status
  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  -- F3 fix: terminal converges to 'delivered' (consistency with
  -- logistics_receive_po_with_do); intermediate stays 'partially_shipped'.
  IF v_remaining = 0 THEN
    v_new_sup_status := 'delivered';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Partner picked up %s thread(s) · DO %s · sup_status → %s',
                 v_thread_count, btrim(p_do_number), v_new_sup_status),
          'partner', v_actor_uid);

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count', v_thread_count,
    'po_sup_status', v_new_sup_status
  );
END;
$$;
REVOKE ALL ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) TO authenticated;
