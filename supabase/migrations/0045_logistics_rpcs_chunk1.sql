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
