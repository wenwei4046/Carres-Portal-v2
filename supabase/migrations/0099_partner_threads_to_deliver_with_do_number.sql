-- =============================================================================
-- 0099_partner_threads_to_deliver_with_do_number.sql (Loo 2026-05-13)
-- =============================================================================
-- Extend partner_threads_to_deliver (0071) to also return orders.do_number so
-- the POD upload dialog can auto-fill the DO# field instead of asking the
-- driver to type it. 0098's trigger guarantees do_number is set at the
-- moment the order enters dispatched, which is the same moment the row
-- becomes visible to this RPC (filter: thread.logistics_stage='dispatched').
--
-- Result columns: append `do_number text` to the existing 8-column shape.
-- All other fields, gates, RLS posture preserved verbatim from 0071.
--
-- PG forbids changing a function's RETURNS TABLE shape via OR REPLACE
-- (errcode 42P13), so this migration DROPS first then CREATEs. Safe — no
-- callers reference column count by position, only by name (web TS hooks
-- key by field name on the returned JSON).
--
-- Authorized in conversation 2026-05-13 per CLAUDE.md §7.
-- =============================================================================

DROP FUNCTION IF EXISTS public.partner_threads_to_deliver();

CREATE OR REPLACE FUNCTION public.partner_threads_to_deliver()
RETURNS TABLE (
  thread_id              uuid,
  order_id               uuid,
  po_id                  text,
  customer_name          text,
  customer_address       text,
  customer_phone         text,
  dispatched_at          timestamptz,
  confirm_delivery_date  date,
  do_number              text
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
    t.id                    AS thread_id,
    t.order_id              AS order_id,
    t.po_id                 AS po_id,
    o.customer_name         AS customer_name,
    o.customer_address      AS customer_address,
    o.customer_phone        AS customer_phone,
    t.updated_at            AS dispatched_at,
    t.confirm_delivery_date AS confirm_delivery_date,
    o.do_number             AS do_number
  FROM order_supplier_threads t
  JOIN orders o ON o.id = t.order_id
  WHERE t.delivery_partner_id = v_partner_id
    AND t.logistics_stage = 'dispatched'
  ORDER BY t.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_threads_to_deliver() FROM public;
GRANT EXECUTE ON FUNCTION public.partner_threads_to_deliver() TO authenticated;
