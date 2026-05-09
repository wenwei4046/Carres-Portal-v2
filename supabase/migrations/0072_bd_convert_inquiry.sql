-- =============================================================================
-- 0072_bd_convert_inquiry.sql — Phase 8 Sprint 2
-- =============================================================================
-- Phase 8 acceptance: "Inquiry converted 后能触发 new_dealer approval".
-- Atomic conversion: BD presses Convert on a qualified inquiry → inquiry
-- stage moves to 'converted', and an approvals row of kind='new_dealer' is
-- inserted in 'pending' state for principal review.
--
-- Authorized 2026-05-09 in conversation per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.bd_convert_inquiry(p_inquiry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_inq      inquiries;
  v_role     app_role;
  v_app_id   uuid;
  v_actor    text;
BEGIN
  v_role := public.app_role();
  IF v_role NOT IN ('bd', 'principal') THEN
    RAISE EXCEPTION 'forbidden: BD or principal only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  SELECT * INTO v_inq FROM inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inquiry not found' USING ERRCODE = '42P01', DETAIL = 'inquiry_not_found';
  END IF;

  -- State guard: must be qualified (the only stage from which we convert).
  IF v_inq.stage <> 'qualified' THEN
    RAISE EXCEPTION 'inquiry must be qualified (got %)', v_inq.stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), INITCAP(v_role::text));

  -- Insert approvals row for principal review.
  INSERT INTO approvals (kind, title, actor, refers_to, dealer_id, payload, status)
  VALUES (
    'new_dealer',
    format('New dealer · %s', v_inq.company),
    v_actor,
    p_inquiry_id::text,
    NULL,  -- no dealer yet; principal creates on approval
    jsonb_build_object(
      'inquiry_id', p_inquiry_id,
      'company',    v_inq.company,
      'region',     v_inq.region,
      'contact',    v_inq.contact,
      'note',       v_inq.note
    ),
    'pending'
  )
  RETURNING id INTO v_app_id;

  -- Move inquiry to converted, link the approval row via linked_dealer_id
  -- (overloaded — actually the approval id; the principal flow assigns the
  -- real dealer_id when it creates the dealer).
  UPDATE inquiries
     SET stage      = 'converted',
         updated_at = now()
   WHERE id = p_inquiry_id;

  RETURN jsonb_build_object(
    'inquiry_id', p_inquiry_id,
    'stage',      'converted',
    'approval_id', v_app_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bd_convert_inquiry(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.bd_convert_inquiry(uuid) TO authenticated;
