-- =============================================================================
-- 0102_fix_orders_rls_recursion.sql (Loo 2026-05-13)
-- =============================================================================
-- Hotfix: migration 0100 extended `orders_scoped_read` to admit partners via
-- `EXISTS (... order_supplier_threads ...)`. The pre-existing
-- `ost_dealer_read` policy on order_supplier_threads already does the
-- reverse — `EXISTS (... orders ...)`. The two together form a cyclic
-- policy reference that Postgres rejects on every query with:
--
--   "infinite recursion detected in policy for relation order_supplier_threads"
--
-- Symptom: every logistics-role read (`GET /api/logistics/orders`,
-- `/badges`, `/dashboard`) 500'd post-0100 with that exact errcode.
--
-- Fix: revert `orders_scoped_read` and `order_lines_scoped` to their
-- pre-0100 shape. The customer-leg partner-reads-orders case is already
-- handled by adminClient routes (partner print-do-data in pickups.ts,
-- POD sign-upload in pod.ts) which do explicit ownership checks before
-- bypassing RLS. Keep `ost_partner_read` extended (the core fix that
-- unlocks Storage RLS for POD upload + partner_threads_to_deliver) since
-- that one didn't recurse — it only references purchase_orders + its own
-- delivery_partner_id column.
--
-- Net behavior: logistics + finance + principal reads work again; partner
-- customer-leg reads continue to go through adminClient routes;
-- ost_partner_read still admits both procurement-leg + customer-leg paths.
--
-- Authorized in conversation 2026-05-13 per CLAUDE.md §14 #4.
-- =============================================================================

-- 1. Revert orders_scoped_read to 0002 shape (no thread-level EXISTS).
DROP POLICY IF EXISTS orders_scoped_read ON orders;
CREATE POLICY orders_scoped_read ON orders FOR SELECT TO authenticated
USING (
  (select public.is_internal())
  OR dealer_id = (select public.app_dealer_id())
  OR delivery_partner_id = (select public.app_partner_id())
);

-- 2. Revert order_lines_scoped to 0002 shape.
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
    )
  )
);

-- ost_partner_read stays as 0100 set it — non-recursive, still gives
-- partner reads of their own customer-leg threads (needed for Storage
-- pod_write/pod_read EXISTS subqueries to admit the sofa direct-ship LP).
