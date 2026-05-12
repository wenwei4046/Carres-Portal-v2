-- =============================================================================
-- 0101_partner_threads_deliveries_with_delivered.sql (Loo 2026-05-13)
-- =============================================================================
-- Extend partner_threads_to_deliver (0071/0099) to return BOTH the in-flight
-- (dispatched) work AND recently-completed (delivered) deliveries — so the
-- LP's Deliveries kanban can show a "Delivered" column alongside Scheduled
-- without a second round-trip.
--
-- Result delta vs 0099:
--   • Adds `logistics_stage` text (caller buckets the rows by this)
--   • Adds `delivered_at` timestamptz (NULL for dispatched rows)
--   • Filter widens to logistics_stage IN ('dispatched', 'delivered')
--   • Delivered rows clamped to last 30 days to keep the result bounded
--   • Order: dispatched first (by updated_at desc), then delivered
--     (by delivered_at desc)
--
-- DROP + CREATE because PG forbids changing a function's RETURNS TABLE shape
-- via OR REPLACE (same constraint that hit 0099).
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
  do_number              text,
  logistics_stage        text,
  delivered_at           timestamptz
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
    t.id                       AS thread_id,
    t.order_id                 AS order_id,
    t.po_id                    AS po_id,
    o.customer_name            AS customer_name,
    o.customer_address         AS customer_address,
    o.customer_phone           AS customer_phone,
    t.updated_at               AS dispatched_at,
    t.confirm_delivery_date    AS confirm_delivery_date,
    o.do_number                AS do_number,
    t.logistics_stage::text    AS logistics_stage,
    t.delivered_at             AS delivered_at
  FROM order_supplier_threads t
  JOIN orders o ON o.id = t.order_id
  WHERE t.delivery_partner_id = v_partner_id
    AND (
      t.logistics_stage = 'dispatched'
      OR (
        t.logistics_stage = 'delivered'
        AND t.delivered_at IS NOT NULL
        AND t.delivered_at >= now() - interval '30 days'
      )
    )
  ORDER BY
    -- Dispatched first, then delivered (most recent first within each bucket)
    CASE WHEN t.logistics_stage = 'dispatched' THEN 0 ELSE 1 END,
    COALESCE(t.delivered_at, t.updated_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_threads_to_deliver() FROM public;
GRANT EXECUTE ON FUNCTION public.partner_threads_to_deliver() TO authenticated;
