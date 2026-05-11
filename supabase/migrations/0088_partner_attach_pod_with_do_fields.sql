-- =============================================================================
-- 0088_partner_attach_pod_with_do_fields.sql (Loo 2026-05-11)
-- =============================================================================
-- Partner POD upload now mirrors logistics's DOAttach modal field set: in
-- addition to the POD photo, the partner records the DO number on the
-- delivery paper + an optional note + ticks the "customer signed the DO on
-- receipt" checkbox. Same 3-field UI layout as DOAttachModal so operators
-- switching roles don't re-learn anything.
--
-- New columns on order_supplier_threads (additive, nullable for backfill
-- compatibility):
--   - pod_do_number  text   (DO number written on the signed paper)
--   - pod_note       text   (free-form remarks: lobby drop, damage, etc.)
--
-- RPC signature change: partner_attach_pod now takes 5 args (was 2). Drop
-- the old 2-arg signature and recreate. All prior behaviour preserved
-- (pod_url, pod_uploaded_at, pod_uploaded_by, logistics_stage='delivered',
-- delivered_at, order_history) plus the new do_number / do_note columns and
-- a hard validation that p_signed = true.
--
-- Authorized in conversation 2026-05-11 per CLAUDE.md §7.
-- =============================================================================

ALTER TABLE order_supplier_threads
  ADD COLUMN IF NOT EXISTS pod_do_number text,
  ADD COLUMN IF NOT EXISTS pod_note      text;

DROP FUNCTION IF EXISTS public.partner_attach_pod(uuid, text);

CREATE OR REPLACE FUNCTION public.partner_attach_pod(
  p_thread_id  uuid,
  p_pod_path   text,
  p_do_number  text,
  p_do_note    text,
  p_signed     boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_thread     order_supplier_threads;
  v_partner_id uuid;
  v_user_id    uuid;
BEGIN
  v_partner_id := public.app_partner_id();
  v_user_id    := (select auth.uid());

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  IF p_signed IS NULL OR p_signed = false THEN
    RAISE EXCEPTION 'customer must sign DO'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  IF p_pod_path IS NULL OR btrim(p_pod_path) = '' THEN
    RAISE EXCEPTION 'pod_path required'
      USING ERRCODE = '22023', DETAIL = 'pod_path_required';
  END IF;

  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    RAISE EXCEPTION 'DO number must be at least 3 characters'
      USING ERRCODE = 'P0001', DETAIL = 'do_required';
  END IF;

  SELECT * INTO v_thread FROM order_supplier_threads WHERE id = p_thread_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'thread not found' USING ERRCODE = '42P01', DETAIL = 'thread_not_found';
  END IF;

  -- Cross-tenant guard: only this partner's thread.
  IF v_thread.delivery_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: not this partner''s thread'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  -- State guard: must be dispatched (the only state from which delivery
  -- completes in both SOP_STANDARD and SOP_SOFA_SPECIAL).
  IF v_thread.logistics_stage IS DISTINCT FROM 'dispatched' THEN
    RAISE EXCEPTION 'thread is not in dispatched state (got %)', v_thread.logistics_stage
      USING ERRCODE = '22023', DETAIL = 'wrong_stage';
  END IF;

  UPDATE order_supplier_threads
     SET pod_url         = btrim(p_pod_path),
         pod_do_number   = btrim(p_do_number),
         pod_note        = nullif(btrim(coalesce(p_do_note, '')), ''),
         pod_uploaded_at = now(),
         pod_uploaded_by = v_user_id,
         logistics_stage = 'delivered',
         delivered_at    = now(),
         updated_at      = now()
   WHERE id = p_thread_id;

  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    v_thread.order_id,
    format('POD attached for thread %s · DO %s · stage → delivered',
           p_thread_id, btrim(p_do_number)),
    'partner',
    v_user_id
  );

  RETURN jsonb_build_object(
    'thread_id',       p_thread_id,
    'logistics_stage', 'delivered',
    'pod_url',         btrim(p_pod_path),
    'pod_do_number',   btrim(p_do_number)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_attach_pod(uuid, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_attach_pod(uuid, text, text, text, boolean) TO authenticated;
