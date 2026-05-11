-- =============================================================================
-- 0093_supplier_mark_delivered_accept_partner_confirmed.sql (Loo 2026-05-11)
-- =============================================================================
-- The 0090 sofa flow sends own_logistics PO from `ready_confirm_sent` to
-- `partner_confirmed` after the partner (warehouse owner) accepts. Supplier
-- then self-delivers + marks delivered with DO. But `supplier_mark_delivered`
-- (0066) only admitted `pickup_accepted` and `shipped` as valid sources —
-- `partner_confirmed` would 422 with wrong_sup_status, leaving the PO
-- stuck on Nets's "confirmed" state with no way for HoOKkA to close it.
--
-- This migration adds `partner_confirmed` to the allowed source list.
-- Same effect: sup_status → 'delivered', DO number persisted, history +
-- audit entries. Backward-compatible for the existing pickup flow.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.supplier_mark_delivered(
  p_po_id     text,
  p_do_number text,
  p_do_note   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po          purchase_orders;
  v_role        app_role;
  v_supplier_id uuid;
  v_actor       text;
BEGIN
  v_role        := public.app_role();
  v_supplier_id := public.app_supplier_id();

  IF v_role <> 'supplier' THEN
    RAISE EXCEPTION 'forbidden: supplier role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF p_do_number IS NULL OR btrim(p_do_number) = '' THEN
    RAISE EXCEPTION 'DO number is required'
      USING ERRCODE = '22023', DETAIL = 'missing_do_number';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  IF v_supplier_id IS NULL OR v_po.supplier_id IS DISTINCT FROM v_supplier_id THEN
    RAISE EXCEPTION 'forbidden: cross-supplier mark-delivered'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  -- Valid sources: pickup_accepted (own_logistics + factory_pickup pickup
  -- flow), shipped (own_logistics direct ship variant), partner_confirmed
  -- (sofa flow — partner_owned WH accepted the supplier-delivered goods).
  IF v_po.sup_status NOT IN ('pickup_accepted', 'shipped', 'partner_confirmed') THEN
    RAISE EXCEPTION 'PO not in pickup_accepted/shipped/partner_confirmed state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := coalesce((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Supplier');

  UPDATE purchase_orders
     SET sup_status = 'delivered',
         do_number  = btrim(p_do_number),
         updated_at = now()
   WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (
    p_po_id,
    format('DO uploaded · %s%s',
           btrim(p_do_number),
           CASE WHEN p_do_note IS NOT NULL AND btrim(p_do_note) <> ''
                THEN ' · ' || btrim(p_do_note)
                ELSE '' END),
    'supplier',
    (SELECT auth.uid())
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES (
    'supplier',
    v_actor,
    format('Marked PO %s delivered (DO %s)', p_po_id, btrim(p_do_number)),
    p_po_id
  );

  RETURN jsonb_build_object(
    'po_id',      p_po_id,
    'sup_status', 'delivered',
    'do_number',  btrim(p_do_number)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.supplier_mark_delivered(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.supplier_mark_delivered(text, text, text) TO authenticated;
