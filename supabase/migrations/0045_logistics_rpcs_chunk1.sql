-- =============================================================================
-- 0045_logistics_rpcs_chunk1.sql — Phase 4.5 Chunk 1
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §7 (v3)
-- Sprint: 2 (RPCs)
--
-- v3 RPC delta (after Codex round):
--   - 5 NEW RPCs:
--       partner_accept_dispatch (RFD accept)
--       partner_reject_dispatch (RFD reject — F9: keeps delivery_partner_id)
--       lp_accept_inbound_delivery (Sofa pre-flight Accept — F1: NO thread advance)
--       logistics_resume_from_waiting (Resume from at_warehouse_waiting)
--       logistics_dispatch_customer_leg (Force vs RFD)
--   - 2 EXTENDED 0034 RPCs (CREATE OR REPLACE same name):
--       partner_reject_customer (relax p_reason; allow logistics 代按)
--       logistics_relocate_warehouse (pre-receive semantic; F9 invariant)
--   - 1 MODIFIED 0034 RPC (CREATE OR REPLACE same name):
--       logistics_receive_po_with_do (Sofa Reject branch — F3 valid enum values)
--
-- All RPCs: SECURITY DEFINER, search_path = public, pg_temp.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. partner_accept_dispatch(p_po_id text, p_confirm_delivery_date date)
-- -----------------------------------------------------------------------------
-- LP accepts the customer-leg Request for Delivery.
-- Validates: caller is partner role; partner_id matches; RFD pending.
-- Effect: stamp partner_accepted_at; advance thread to 'dispatched'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_accept_dispatch(
  p_po_id text,
  p_confirm_delivery_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po           purchase_orders;
  v_role         app_role;
  v_partner_id   uuid;
  v_actor        text;
  v_thread_count int;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Lock PO row.
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- Cross-tenant guard.
  IF v_po.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner accept'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- State guard: RFD must be pending.
  IF v_po.request_for_delivery_at IS NULL
     OR v_po.partner_accepted_at IS NOT NULL
     OR v_po.partner_rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'RFD not pending (state invalid)'
      USING ERRCODE = '22023', DETAIL = 'rfd_not_pending';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Partner');

  -- Mutate PO.
  UPDATE purchase_orders
     SET partner_accepted_at  = now(),
         confirm_delivery_date = COALESCE(p_confirm_delivery_date, confirm_delivery_date),
         updated_at           = now()
   WHERE id = p_po_id;

  -- Advance threads to dispatched.
  UPDATE order_supplier_threads
     SET logistics_stage = 'dispatched', updated_at = now()
   WHERE po_id = p_po_id;
  GET DIAGNOSTICS v_thread_count = ROW_COUNT;

  -- Audit.
  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id, 'LP accepted RFD; threads advanced to dispatched', 'partner');

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES ('partner', v_actor,
          format('LP accepted RFD on PO %s — %s thread(s)', p_po_id, v_thread_count),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'partner_accepted_at',  now(),
    'confirm_delivery_date', COALESCE(p_confirm_delivery_date, v_po.confirm_delivery_date),
    'threads_advanced',     v_thread_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_accept_dispatch(text, date) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_accept_dispatch(text, date) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. partner_reject_dispatch(p_po_id text, p_reason text DEFAULT '')
-- -----------------------------------------------------------------------------
-- LP rejects the customer-leg RFD.
-- Codex F9: keep delivery_partner_id (do NOT clear). Logistics may re-RFD or
-- DispatchPartnerDialog the same or different LP.
-- Effect: clear request_for_delivery_at, stamp partner_rejected_at.
-- p_reason → audit_log only (per C1.9, NOT a column).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_reject_dispatch(
  p_po_id text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po         purchase_orders;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_po.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner reject'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.request_for_delivery_at IS NULL
     OR v_po.partner_accepted_at IS NOT NULL
     OR v_po.partner_rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'RFD not pending'
      USING ERRCODE = '22023', DETAIL = 'rfd_not_pending';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Partner');

  -- Mutate PO: clear RFD, stamp rejected. Codex F9: keep delivery_partner_id.
  UPDATE purchase_orders
     SET request_for_delivery_at = NULL,
         partner_rejected_at     = now(),
         updated_at              = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('LP rejected RFD%s', CASE WHEN p_reason <> '' THEN ': ' || p_reason ELSE '' END),
          'partner');

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES ('partner', v_actor,
          format('LP rejected RFD on PO %s%s', p_po_id,
                 CASE WHEN p_reason <> '' THEN format(' (reason: %s)', p_reason) ELSE '' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',              p_po_id,
    'partner_rejected_at', now(),
    'rfd_cleared',        true,
    'lp_kept_assigned',   true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_reject_dispatch(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_reject_dispatch(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. lp_accept_inbound_delivery(p_po_id text)
-- -----------------------------------------------------------------------------
-- Codex F1: 0034:366 partner_confirm_receive advances threads to 'dispatched',
-- which is wrong for Sofa pre-flight (HoOKkA hasn't actually delivered yet).
-- This NEW RPC: stamps PO state but does NOT touch threads.
-- Caller: 'partner' (own LP) OR 'logistics' (代按 per C1.3 Q4).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lp_accept_inbound_delivery(p_po_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po         purchase_orders;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role NOT IN ('partner', 'logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- Cross-tenant guard for partner caller only.
  IF v_role = 'partner' AND v_po.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner accept'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- State guard: must be in pre-flight ready_confirm_sent.
  IF v_po.sup_status IS DISTINCT FROM 'ready_confirm_sent' THEN
    RAISE EXCEPTION 'PO not in ready_confirm_sent state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Mutate PO ONLY. Threads stay at awaiting_logistics_action until Receive.
  UPDATE purchase_orders
     SET sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id, 'LP accepted inbound pre-flight (no thread change yet)', v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP accepted inbound pre-flight for PO %s', p_po_id), p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lp_accept_inbound_delivery(text) FROM public;
GRANT EXECUTE ON FUNCTION public.lp_accept_inbound_delivery(text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. partner_reject_customer (EXTENDED from 0034:467)
-- -----------------------------------------------------------------------------
-- v3 changes vs 0034:
--   - p_reason DEFAULT '' (was strict ≥4 chars per 0034:498-499)
--   - Caller role: 'partner' OR 'logistics' (代按 per C1.3 Q4)
--   - Effect unchanged: sup_status='customer_rejected'; customer_rejection jsonb stamp
-- Note: CREATE OR REPLACE replaces the 0034 body. Old behavior available via
-- git history if a caller still depends on the strict reason check (none exist).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_reject_customer(
  p_po_id  text,
  p_reason text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po         purchase_orders;
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
  v_rejection  jsonb;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role NOT IN ('partner', 'logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: partner or logistics only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_role = 'partner' AND v_po.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: cross-partner reject'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status NOT IN ('ready_confirm_sent', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pre-flight state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  v_rejection := jsonb_build_object(
    'at',                  now(),
    'rejected_by',         'lp',
    'original_warehouse_id', v_po.warehouse_id
  );
  IF p_reason <> '' THEN
    v_rejection := v_rejection || jsonb_build_object('reason_audit_only', p_reason);
  END IF;

  UPDATE purchase_orders
     SET sup_status         = 'customer_rejected',
         customer_rejection = v_rejection,
         updated_at         = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('LP rejected inbound%s', CASE WHEN p_reason <> '' THEN ': ' || p_reason ELSE '' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('LP rejected inbound on PO %s%s', p_po_id,
                 CASE WHEN p_reason <> '' THEN format(' (reason: %s)', p_reason) ELSE '' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',      p_po_id,
    'sup_status', 'customer_rejected',
    'rejected_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_reject_customer(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_reject_customer(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. logistics_relocate_warehouse (EXTENDED from 0034:584)
-- -----------------------------------------------------------------------------
-- v3 changes vs 0034:
--   - Semantic clarified: pre-receive only (state guard sup_status='customer_rejected')
--   - F9 invariant: delivery_partner_id rewrites only when new wh has DIFFERENT
--     owning_partner_id. Avoids null-clearing on relocate to own_wh.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_relocate_warehouse(
  p_po_id            text,
  p_new_warehouse_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                  purchase_orders;
  v_role                app_role;
  v_actor               text;
  v_new_owning_partner  uuid;
  v_new_delivery_partner uuid;
BEGIN
  v_role := public.app_role();

  IF v_role NOT IN ('logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- State guard: pre-receive only.
  IF v_po.sup_status IS DISTINCT FROM 'customer_rejected' THEN
    RAISE EXCEPTION 'PO not in customer_rejected state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  -- Lookup new wh owning partner.
  SELECT owning_partner_id INTO v_new_owning_partner
    FROM warehouses WHERE id = p_new_warehouse_id;
  IF v_new_owning_partner IS NULL AND NOT EXISTS (SELECT 1 FROM warehouses WHERE id = p_new_warehouse_id) THEN
    RAISE EXCEPTION 'warehouse not found' USING ERRCODE = '42P01', DETAIL = 'warehouse_not_found';
  END IF;

  -- F9 invariant: keep current delivery_partner_id when new wh is own_wh (NULL owning_partner).
  v_new_delivery_partner := COALESCE(v_new_owning_partner, v_po.delivery_partner_id);

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  UPDATE purchase_orders
     SET warehouse_id        = p_new_warehouse_id,
         sup_status          = 'relocated',
         delivery_partner_id = v_new_delivery_partner,
         updated_at          = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('Logistics relocated PO to wh %s (delivery_partner_id %s)',
                 p_new_warehouse_id,
                 CASE WHEN v_new_delivery_partner IS DISTINCT FROM v_po.delivery_partner_id
                      THEN 'reassigned' ELSE 'kept' END),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Relocate PO %s -> wh %s', p_po_id, p_new_warehouse_id), p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'relocated',
    'new_warehouse_id',     p_new_warehouse_id,
    'new_delivery_partner_id', v_new_delivery_partner,
    'lp_reassigned',        v_new_delivery_partner IS DISTINCT FROM v_po.delivery_partner_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_relocate_warehouse(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_relocate_warehouse(text, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. logistics_resume_from_waiting(p_order_id uuid)
-- -----------------------------------------------------------------------------
-- After at_warehouse_waiting customer reschedule, Logistics resumes dispatch.
-- Effect: threads waiting → ready_to_dispatch; PO sup_status at_warehouse_waiting → delivered.
-- Trigger orders_rollup_stage fires via 0036+0047 amended rollup.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_resume_from_waiting(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_role            app_role;
  v_actor           text;
  v_threads_resumed int;
  v_pos_resumed     int;
BEGIN
  v_role := public.app_role();

  IF v_role NOT IN ('logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Resume threads.
  UPDATE order_supplier_threads
     SET logistics_stage = 'ready_to_dispatch', updated_at = now()
   WHERE order_id = p_order_id AND logistics_stage = 'waiting';
  GET DIAGNOSTICS v_threads_resumed = ROW_COUNT;

  IF v_threads_resumed = 0 THEN
    RAISE EXCEPTION 'no waiting threads found for order %', p_order_id
      USING ERRCODE = '22023', DETAIL = 'no_waiting_threads';
  END IF;

  -- Flip PO sup_status from at_warehouse_waiting back to delivered (supplier-side).
  UPDATE purchase_orders po
     SET sup_status = 'delivered', updated_at = now()
   WHERE po.dl IN (SELECT dl FROM orders WHERE id = p_order_id)
     AND po.sup_status = 'at_warehouse_waiting';
  GET DIAGNOSTICS v_pos_resumed = ROW_COUNT;

  -- Trigger orders_rollup_stage_after_thread_change fires automatically via thread UPDATE.

  INSERT INTO order_history (order_id, text, by_role)
  VALUES (p_order_id, format('Resume from at_warehouse_waiting — %s thread(s) advanced', v_threads_resumed), v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Resume order %s from waiting (%s threads, %s POs)', p_order_id, v_threads_resumed, v_pos_resumed),
          p_order_id::text);

  RETURN jsonb_build_object(
    'order_id',         p_order_id,
    'threads_resumed',  v_threads_resumed,
    'pos_resumed',      v_pos_resumed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_resume_from_waiting(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_resume_from_waiting(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. logistics_dispatch_customer_leg(...)
-- -----------------------------------------------------------------------------
-- Logistics dispatches the customer-delivery leg.
-- p_force_dispatch=true → skip RFD, go directly to dispatched (advances threads)
-- p_force_dispatch=false → set RFD timestamp, threads stay at ready_to_dispatch
-- Does NOT replace 0034 logistics_assign_partner_and_dispatch (which handles
-- Mattress factory-pickup leg).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_dispatch_customer_leg(
  p_po_id                text,
  p_partner_id           uuid,
  p_confirm_delivery_date date,
  p_force_dispatch       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po           purchase_orders;
  v_role         app_role;
  v_actor        text;
  v_thread_count int;
  v_threads_at_rtd boolean;
BEGIN
  v_role := public.app_role();

  IF v_role NOT IN ('logistics', 'principal') THEN
    RAISE EXCEPTION 'forbidden: logistics or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  -- Validate partner exists.
  IF NOT EXISTS (SELECT 1 FROM delivery_partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'delivery_partner not found' USING ERRCODE = '42P01', DETAIL = 'partner_not_found';
  END IF;

  -- State guard: at least one thread must be ready_to_dispatch.
  SELECT bool_or(logistics_stage = 'ready_to_dispatch') INTO v_threads_at_rtd
    FROM order_supplier_threads
   WHERE po_id = p_po_id;
  IF NOT COALESCE(v_threads_at_rtd, false) THEN
    RAISE EXCEPTION 'no ready_to_dispatch threads for PO'
      USING ERRCODE = '22023', DETAIL = 'no_ready_threads';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  IF p_force_dispatch THEN
    -- Force path: skip RFD, advance threads immediately.
    UPDATE purchase_orders
       SET delivery_partner_id   = p_partner_id,
           confirm_delivery_date = p_confirm_delivery_date,
           partner_accepted_at   = now(),  -- record dispatch time
           updated_at            = now()
     WHERE id = p_po_id;

    UPDATE order_supplier_threads
       SET logistics_stage = 'dispatched', updated_at = now()
     WHERE po_id = p_po_id AND logistics_stage = 'ready_to_dispatch';
    GET DIAGNOSTICS v_thread_count = ROW_COUNT;

    INSERT INTO po_history (po_id, text, by_role)
    VALUES (p_po_id,
            format('Force-dispatched to LP %s on %s — %s thread(s)', p_partner_id, p_confirm_delivery_date, v_thread_count),
            v_role);

    INSERT INTO audit_log (role, actor_text, action, ref)
    VALUES (v_role, v_actor, format('Force-dispatch PO %s to LP %s', p_po_id, p_partner_id), p_po_id);

    RETURN jsonb_build_object('po_id', p_po_id, 'mode', 'force', 'threads_advanced', v_thread_count,
                              'partner_id', p_partner_id, 'confirm_delivery_date', p_confirm_delivery_date);
  ELSE
    -- RFD path: set timestamp, threads stay at ready_to_dispatch.
    UPDATE purchase_orders
       SET delivery_partner_id    = p_partner_id,
           confirm_delivery_date  = p_confirm_delivery_date,
           request_for_delivery_at = now(),
           partner_accepted_at    = NULL,  -- reset if re-RFD
           partner_rejected_at    = NULL,
           updated_at             = now()
     WHERE id = p_po_id;

    INSERT INTO po_history (po_id, text, by_role)
    VALUES (p_po_id,
            format('RFD sent to LP %s for %s', p_partner_id, p_confirm_delivery_date),
            v_role);

    INSERT INTO audit_log (role, actor_text, action, ref)
    VALUES (v_role, v_actor, format('RFD PO %s -> LP %s', p_po_id, p_partner_id), p_po_id);

    RETURN jsonb_build_object('po_id', p_po_id, 'mode', 'rfd',
                              'partner_id', p_partner_id, 'confirm_delivery_date', p_confirm_delivery_date,
                              'rfd_sent_at', now());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_dispatch_customer_leg(text, uuid, date, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_dispatch_customer_leg(text, uuid, date, boolean) TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. logistics_receive_po_with_do (MODIFIED from 0034:730)
-- -----------------------------------------------------------------------------
-- Codex F3 fix: po_sup_status enum has no 'received' value; existing 0034:938
-- correctly sets sup_status='delivered' on full receive. v3 keeps that for the
-- normal path; Sofa Reject path (prev sup_status='relocated') sets
-- sup_status='at_warehouse_waiting' (new value from 0043).
--
-- Thread state branch matches PO state branch:
--   prev='relocated' → thread.logistics_stage='waiting'
--   else → thread.logistics_stage = (SOP_SOFA_SPECIAL ? 'dispatched' : 'ready_to_dispatch')
--          [matches existing 0034:881-885 SOP-aware logic]
--
-- This RPC is a CREATE OR REPLACE of 0034:730. Full ~250-line body inlined here
-- so the migration is self-contained.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.logistics_receive_po_with_do(
  p_po_id        text,
  p_do_file_path text,
  p_do_number    text,
  p_lines        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                 purchase_orders;
  v_role               app_role;
  v_partner_id         uuid;
  v_actor              text;
  v_line               jsonb;
  v_sku                text;
  v_received_qty       int;
  v_existing_line      purchase_order_lines;
  v_delta              int;
  v_outstanding        int;
  v_lines_updated      int := 0;
  v_threads_advanced   int := 0;
  v_thread             record;
  v_reserve            record;
  v_uid                uuid;
  v_was_relocated      boolean;
  v_target_thread_stage logistics_stage;
  v_target_sup_status  po_sup_status;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();
  v_uid := (SELECT auth.uid());

  -- Role gate: logistics OR partner.
  IF v_role NOT IN ('logistics', 'partner') THEN
    RAISE EXCEPTION 'forbidden: logistics or partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Validate inputs.
  IF p_do_file_path IS NULL OR length(btrim(p_do_file_path)) = 0 THEN
    RAISE EXCEPTION 'DO file path is required' USING ERRCODE = '22023', DETAIL = 'do_file_path_required';
  END IF;
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters' USING ERRCODE = '22023', DETAIL = 'do_number_too_short';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'lines must be a non-empty array' USING ERRCODE = '22023', DETAIL = 'lines_empty';
  END IF;

  -- Lock PO row.
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_role = 'partner' THEN
    IF v_partner_id IS NULL OR v_po.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
      RAISE EXCEPTION 'forbidden: cross-partner receive' USING ERRCODE = '42501', DETAIL = 'forbidden';
    END IF;
  END IF;

  IF v_po.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'PO is not open (status=%)', v_po.status USING ERRCODE = '22023', DETAIL = 'po_not_open';
  END IF;

  -- v3 BRANCH: detect Sofa Reject + Relocate path.
  v_was_relocated := (v_po.sup_status = 'relocated');

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = v_uid), INITCAP(v_role::text));

  -- Apply per-line received_qty + bump stock_balances (unchanged from 0034:806-927).
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_sku := v_line->>'sku';
    v_received_qty := nullif(v_line->>'received_qty', '')::int;

    IF v_sku IS NULL OR v_received_qty IS NULL OR v_received_qty < 0 THEN
      RAISE EXCEPTION 'invalid line: sku=%, received_qty=%', v_sku, v_received_qty
        USING ERRCODE = '22023', DETAIL = 'invalid_line';
    END IF;

    SELECT * INTO v_existing_line FROM purchase_order_lines
     WHERE po_id = p_po_id AND sku = v_sku FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO line not found for sku=%', v_sku USING ERRCODE = '42P01', DETAIL = 'po_line_not_found';
    END IF;

    IF v_received_qty > v_existing_line.qty THEN
      RAISE EXCEPTION 'over-received: % > ordered %', v_received_qty, v_existing_line.qty
        USING ERRCODE = 'P0001', DETAIL = 'over_received';
    END IF;

    v_delta := v_received_qty - v_existing_line.received_qty;
    IF v_delta < 0 THEN
      RAISE EXCEPTION 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        USING ERRCODE = 'P0001', DETAIL = 'received_qty_decrease';
    END IF;

    UPDATE purchase_order_lines SET received_qty = v_received_qty
     WHERE po_id = p_po_id AND sku = v_sku;

    IF v_delta > 0 THEN
      INSERT INTO stock_balances (sku, warehouse_id, qty)
        VALUES (v_sku, v_po.warehouse_id, v_delta)
        ON CONFLICT (sku, warehouse_id)
        DO UPDATE SET qty = stock_balances.qty + v_delta, updated_at = now();

      INSERT INTO stock_movements (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      VALUES (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);

      v_lines_updated := v_lines_updated + 1;
    END IF;
  END LOOP;

  -- Advance threads + reserve. v3 BRANCH on v_was_relocated:
  FOR v_thread IN
    SELECT * FROM order_supplier_threads
     WHERE po_id = p_po_id AND logistics_stage = 'awaiting_logistics_action'
  LOOP
    -- Determine target thread stage per branch.
    IF v_was_relocated THEN
      v_target_thread_stage := 'waiting';  -- Sofa Reject path
    ELSE
      v_target_thread_stage := CASE WHEN v_thread.sop_name = 'SOFA_SPECIAL'
                                    THEN 'dispatched'
                                    ELSE 'ready_to_dispatch'
                               END;
    END IF;

    UPDATE order_supplier_threads
       SET logistics_stage = v_target_thread_stage,
           warehouse_id    = v_po.warehouse_id,
           reserved_at     = now(),
           updated_at      = now()
     WHERE id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    -- Reserve stock for thread's slice (unchanged from 0034:893-927).
    FOR v_reserve IN
      SELECT ol.sku AS sku, ol.qty AS qty
        FROM order_lines ol
        JOIN product_skus ps ON ps.sku = ol.sku
        JOIN product_models pm ON pm.id = ps.model_id
       WHERE ol.order_id = v_thread.order_id
         AND ps.supplier_id = v_thread.supplier_id
         AND pm.category::text = v_thread.category
    LOOP
      BEGIN
        UPDATE stock_balances
           SET reserved   = reserved + v_reserve.qty, updated_at = now()
         WHERE sku = v_reserve.sku AND warehouse_id = v_po.warehouse_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'no stock_balances row for sku=% wh=%', v_reserve.sku, v_po.warehouse_id
            USING ERRCODE = 'P0001', DETAIL = 'insufficient_stock_for_reserve';
        END IF;
      EXCEPTION
        WHEN check_violation THEN
          RAISE EXCEPTION 'cannot reserve sku=% at wh=% (qty < reserved + %)',
                          v_reserve.sku, v_po.warehouse_id, v_reserve.qty
            USING ERRCODE = 'P0001', DETAIL = 'insufficient_stock_for_reserve';
      END;
    END LOOP;
  END LOOP;

  -- Determine target PO sup_status per branch.
  SELECT count(*) INTO v_outstanding
    FROM purchase_order_lines WHERE po_id = p_po_id AND received_qty < qty;

  IF v_outstanding = 0 THEN
    -- Full receive. Branch on relocated flag.
    IF v_was_relocated THEN
      v_target_sup_status := 'at_warehouse_waiting';  -- Codex F3: new value from 0043
    ELSE
      v_target_sup_status := 'delivered';  -- Codex F3: existing valid value (0034:938)
    END IF;

    UPDATE purchase_orders
       SET status         = 'received',
           sup_status     = v_target_sup_status,
           do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     WHERE id = p_po_id;
  ELSE
    -- Partial receive: persist DO + sup_status remains current.
    UPDATE purchase_orders
       SET do_file_path   = p_do_file_path,
           do_uploaded_at = now(),
           do_uploaded_by = v_uid,
           updated_at     = now()
     WHERE id = p_po_id;
  END IF;

  -- Audit + history.
  INSERT INTO po_history (po_id, text, by_role)
  VALUES (p_po_id,
          format('Received with DO %s (%s path) — %s line(s), %s thread(s)',
                 btrim(p_do_number),
                 CASE WHEN v_was_relocated THEN 'relocated→at_warehouse_waiting' ELSE 'normal→delivered' END,
                 v_lines_updated, v_threads_advanced),
          v_role);

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)), p_po_id);

  RETURN jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (SELECT status FROM purchase_orders WHERE id = p_po_id),
    'sup_status',        (SELECT sup_status FROM purchase_orders WHERE id = p_po_id),
    'was_relocated',     v_was_relocated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.logistics_receive_po_with_do(text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.logistics_receive_po_with_do(text, text, text, jsonb) TO authenticated;
