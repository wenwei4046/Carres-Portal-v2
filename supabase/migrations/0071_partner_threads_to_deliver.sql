-- =============================================================================
-- 0071_partner_threads_to_deliver.sql — Phase 7 Sprint 1
-- =============================================================================
-- SECURITY DEFINER RPC that lists customer-leg threads in transit for the
-- calling partner. Mirrors the logistics_partner_rfd_pending pattern (0059).
--
-- Why an RPC and not a raw select: the existing `ost_partner_read` policy
-- (0033:96) admits the partner only as procurement-leg owner (po row's
-- procurement_partner_id). A pure customer-leg LP — i.e., one whose
-- partner_id matches order_supplier_threads.delivery_partner_id but NOT
-- the PO's procurement_partner_id — cannot read their own thread via raw
-- select. This RPC is the one channel that surfaces them.
--
-- Returns rows where:
--   t.delivery_partner_id = app_partner_id()
--   AND t.logistics_stage = 'dispatched'
--
-- Authorized 2026-05-09 in conversation per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.partner_threads_to_deliver()
RETURNS TABLE (
  thread_id              uuid,
  order_id               uuid,
  po_id                  text,
  customer_name          text,
  customer_address       text,
  customer_phone         text,
  dispatched_at          timestamptz,
  confirm_delivery_date  date
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  v_partner_id := public.app_partner_id();

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  RETURN QUERY
  SELECT
    t.id                   AS thread_id,
    t.order_id             AS order_id,
    t.po_id                AS po_id,
    o.customer_name        AS customer_name,
    o.customer_address     AS customer_address,
    o.customer_phone       AS customer_phone,
    t.updated_at           AS dispatched_at,
    t.confirm_delivery_date AS confirm_delivery_date
  FROM order_supplier_threads t
  JOIN orders o ON o.id = t.order_id
  WHERE t.delivery_partner_id = v_partner_id
    AND t.logistics_stage = 'dispatched'
  ORDER BY t.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_threads_to_deliver() FROM public;
GRANT EXECUTE ON FUNCTION public.partner_threads_to_deliver() TO authenticated;
