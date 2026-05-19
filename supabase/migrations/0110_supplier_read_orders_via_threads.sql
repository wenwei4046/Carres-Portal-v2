-- =============================================================================
-- 0110_supplier_read_orders_via_threads.sql (Loo 2026-05-15) — SUPERSEDED BY 0111
-- =============================================================================
-- Phase 2 smoke: 0109 unblocked supplier reads on threads but the nested
-- join `threads.orders(...)` in GET /api/supplier/pos/:poId/threads silently
-- came back NULL because supplier role had no `orders` read policy either.
--
-- This migration ATTEMPTED to add an RLS policy:
--   orders_supplier_read_via_threads — supplier sees orders that link to a
--                                      thread on one of their POs.
--   order_lines_supplier_read_via_threads — same shape for order_lines.
--
-- RESULT: infinite recursion. Postgres detected:
--   orders policy → joins order_supplier_threads → fires ost_supplier_read
--                                                 → joins purchase_orders → ...
-- Both policies were DROPPED in 0111 and replaced with a SECURITY DEFINER
-- RPC `supplier_threads_for_po` that bypasses RLS while enforcing the same
-- supplier scoping inside the function body.
--
-- This file is kept in the migration history for auditability.
-- =============================================================================

DROP POLICY IF EXISTS orders_supplier_read_via_threads ON orders;
CREATE POLICY orders_supplier_read_via_threads ON orders
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) = 'supplier'
    AND EXISTS (
      SELECT 1 FROM order_supplier_threads t
      JOIN purchase_orders po ON po.id = t.po_id
      WHERE t.order_id = orders.id
        AND po.supplier_id = (SELECT public.app_supplier_id())
    )
  );

DROP POLICY IF EXISTS order_lines_supplier_read_via_threads ON order_lines;
CREATE POLICY order_lines_supplier_read_via_threads ON order_lines
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) = 'supplier'
    AND EXISTS (
      SELECT 1 FROM order_supplier_threads t
      JOIN purchase_orders po ON po.id = t.po_id
      WHERE t.order_id = order_lines.order_id
        AND po.supplier_id = (SELECT public.app_supplier_id())
    )
  );
