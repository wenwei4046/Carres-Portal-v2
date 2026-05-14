-- =============================================================================
-- 0109_supplier_read_own_threads.sql (Loo 2026-05-15)
-- =============================================================================
-- Phase 2 smoke discovery: the GET /api/supplier/pos/:poId/threads endpoint
-- (added in Task 10) returned [] under supplier JWT because 0033's RLS only
-- granted reads on `order_supplier_threads` to logistics/principal/partner/
-- dealer. Supplier role had no read policy → all rows hidden.
--
-- Fix: add a supplier read scope tied to po.supplier_id = app_supplier_id().
-- Mirrors the pickup_events_supplier_read pattern from 0107.
--
-- Authorized in conversation per CLAUDE.md §7.
-- =============================================================================

DROP POLICY IF EXISTS ost_supplier_read ON order_supplier_threads;
CREATE POLICY ost_supplier_read ON order_supplier_threads
  FOR SELECT TO authenticated USING (
    (SELECT public.app_role()) = 'supplier'
    AND EXISTS (
      SELECT 1 FROM purchase_orders po
       WHERE po.id = order_supplier_threads.po_id
         AND po.supplier_id = (SELECT public.app_supplier_id())
    )
  );
