-- =============================================================================
-- 0070_partner_attach_pod.sql — Phase 7 Sprint 1
-- =============================================================================
-- Recreates the dispatched → delivered transition that was DROPPED in 0060
-- (CF #3 stale-pre-0051-rpcs sweep dropped logistics_attach_pod_do as
-- dead-code). Phase 7 reintroduces it as a PARTNER-callable RPC named
-- partner_attach_pod since the partner is the actor uploading the POD.
--
-- New columns on order_supplier_threads (additive):
--   - pod_url           text         (path within proof-of-delivery bucket)
--   - pod_uploaded_at   timestamptz  (audit)
--   - pod_uploaded_by   uuid         (auth.uid() of partner)
--
-- RPC: partner_attach_pod(p_thread_id uuid, p_pod_path text)
--   Role gate:        partner
--   Cross-tenant:     thread.delivery_partner_id = app_partner_id()
--   State guard:      thread.logistics_stage = 'dispatched'
--   Effect:           sets pod_url + pod_uploaded_at + pod_uploaded_by;
--                     transitions thread.logistics_stage → 'delivered'
--   Audit:            order_history insert; orders rollup trigger handles
--                     order-level state transition automatically
--
-- Authorized 2026-05-09 in conversation per CLAUDE.md §7.
-- =============================================================================

ALTER TABLE order_supplier_threads
  ADD COLUMN IF NOT EXISTS pod_url         text,
  ADD COLUMN IF NOT EXISTS pod_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS pod_uploaded_by uuid REFERENCES app_users(id);

CREATE OR REPLACE FUNCTION public.partner_attach_pod(
  p_thread_id uuid,
  p_pod_path  text
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

  IF p_pod_path IS NULL OR btrim(p_pod_path) = '' THEN
    RAISE EXCEPTION 'pod_path required'
      USING ERRCODE = '22023', DETAIL = 'pod_path_required';
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
     SET pod_url         = p_pod_path,
         pod_uploaded_at = now(),
         pod_uploaded_by = v_user_id,
         logistics_stage = 'delivered',
         delivered_at    = now(),
         updated_at      = now()
   WHERE id = p_thread_id;

  -- Order history (best-effort; uses thread's order_id).
  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    v_thread.order_id,
    format('POD attached for thread %s · stage → delivered', p_thread_id),
    'partner',
    v_user_id
  );

  RETURN jsonb_build_object(
    'thread_id',       p_thread_id,
    'logistics_stage', 'delivered',
    'pod_url',         p_pod_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_attach_pod(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_attach_pod(uuid, text) TO authenticated;
