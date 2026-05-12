-- =============================================================================
-- 0100_partner_customer_leg_rls.sql (Loo 2026-05-13)
-- =============================================================================
-- Sofa direct-ship flow gap: ost_partner_read (0033) + orders_scoped_read
-- (0002) both admit a partner ONLY via the procurement-leg column
-- (purchase_orders.procurement_partner_id = me, orders.delivery_partner_id
-- = me). For sofa direct-ship the customer-leg LP lives on
-- order_supplier_threads.delivery_partner_id, set by partner_confirm_receive
-- (0096). procurement_partner_id stays NULL because HoOKkA factory pickup
-- doesn't go through a procurement LP.
--
-- Net effect of the gap:
--   • Partner can't SELECT their own customer-leg threads via raw select
--     (forces SECURITY DEFINER RPC workarounds like partner_threads_to_deliver)
--   • Storage RLS on `proof-of-delivery` bucket (0069) does
--     `EXISTS (SELECT 1 FROM order_supplier_threads ...)` — that inner
--     SELECT inherits the caller's RLS, returns 0 rows for sofa flow → POD
--     upload denied with "new row violates row-level security policy"
--   • Partner-side print-do-data route had to fall back to adminClient
--     (0096 partner pickups.ts)
--
-- Fix: add an OR branch to both policies. Strictly more permissive (only
-- adds an admit path, never removes a gate). Existing procurement-leg
-- partner reads continue to work unchanged.
--
-- Net rule after this migration:
--   Partner sees a thread / order if EITHER
--     a) `purchase_orders.procurement_partner_id = me` (legacy procurement leg)
--     b) `order_supplier_threads.delivery_partner_id = me` (customer leg)
--
-- Authorized in conversation 2026-05-13 per CLAUDE.md §14 #4.
-- =============================================================================


-- 1. ost_partner_read — admit customer-leg LP.
DROP POLICY IF EXISTS ost_partner_read ON order_supplier_threads;
CREATE POLICY ost_partner_read ON order_supplier_threads
FOR SELECT TO authenticated
USING (
  (select public.app_role()) = 'partner'
  AND (
    -- Procurement-leg LP (existing 0033 path)
    EXISTS (
      SELECT 1 FROM purchase_orders p
      WHERE p.id = order_supplier_threads.po_id
        AND p.procurement_partner_id = (select public.app_partner_id())
    )
    -- Customer-leg LP (new 0100 path — sofa direct-ship)
    OR order_supplier_threads.delivery_partner_id = (select public.app_partner_id())
  )
);


-- 2. orders_scoped_read — admit partner who owns the customer-leg thread.
DROP POLICY IF EXISTS orders_scoped_read ON orders;
CREATE POLICY orders_scoped_read ON orders FOR SELECT TO authenticated
USING (
  (select public.is_internal())
  OR dealer_id = (select public.app_dealer_id())
  -- Order-level LP (legacy direct-assignment path)
  OR delivery_partner_id = (select public.app_partner_id())
  -- Thread-level customer-leg LP (new 0100 path)
  OR EXISTS (
    SELECT 1 FROM order_supplier_threads ost
    WHERE ost.order_id = orders.id
      AND ost.delivery_partner_id = (select public.app_partner_id())
  )
);


-- 3. order_lines_scoped — mirror the orders_scoped_read extension via
-- the parent-order EXISTS clause it already uses. Existing policy admits
-- partner via o.delivery_partner_id; add the thread-level path so partner
-- can read the same lines they can read on the order.
DROP POLICY IF EXISTS order_lines_scoped ON order_lines;
CREATE POLICY order_lines_scoped ON order_lines
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_lines.order_id
    AND (
      (select public.is_internal())
      OR o.dealer_id = (select public.app_dealer_id())
      OR o.delivery_partner_id = (select public.app_partner_id())
      OR EXISTS (
        SELECT 1 FROM order_supplier_threads ost
        WHERE ost.order_id = o.id
          AND ost.delivery_partner_id = (select public.app_partner_id())
      )
    )
  )
);
