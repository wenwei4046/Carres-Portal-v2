-- =============================================================================
-- 0022_purchase_order_lines_rls.sql — Close RLS-no-policy gap from 0017
-- =============================================================================
-- Source: docs/phase-4-reflection.md "CRITICAL BLOCKER" (2026-05-04 /review M6.2).
--
-- What this fixes: migration 0017 created `purchase_order_lines` without any
-- RLS policies. Supabase auto-enables RLS on public-schema tables, so the
-- effect was: every user-JWT SELECT/INSERT/UPDATE on po_lines is denied.
-- Tests didn't catch it (vitest mocks Supabase). Production has 0 PO rows so
-- the bug was dormant.
--
-- Affected paths (all silently render empty po_lines arrays in production):
--   - apps/api/src/routes/logistics/pos.ts list embed `lines:purchase_order_lines(...)`
--   - apps/api/src/routes/logistics/pos.ts /:id/print PDF rendering
--   - apps/api/src/routes/logistics/orders.ts drawer linked-PO lines lookup
--
-- RPCs (logistics_create_po, logistics_receive_po_line, etc.) keep working
-- because they are SECURITY DEFINER and bypass RLS.
--
-- Policy pattern mirrors `po_scoped_read` from 0002_rls.sql:241 — po_lines
-- inherit visibility from their parent purchase_order: internal users see all,
-- supplier sees their own, delivery partner sees POs they're delivering.
-- =============================================================================

-- Read: inherit from parent PO via EXISTS subquery (mirrors po_history_read /
-- po_receipts_read patterns at 0002_rls.sql:256-263).
create policy po_lines_scoped_read on purchase_order_lines for select using (
  exists (
    select 1 from purchase_orders p where p.id = purchase_order_lines.po_id
    and ((select public.is_internal())
         or p.supplier_id = (select public.app_supplier_id())
         or p.delivery_partner_id = (select public.app_partner_id()))
  )
);

-- Insert: logistics + principal can write directly (rare; RPCs handle most
-- inserts and bypass RLS via SECURITY DEFINER). Mirrors po_logistics_insert.
create policy po_lines_logistics_insert on purchase_order_lines for insert with check (
  (select public.app_role()) in ('logistics','principal')
);

-- Update: logistics + principal. Used by ReceivePO RPC's `update received_qty`
-- (already SECURITY DEFINER so this is defense in depth for any future direct
-- updates). Mirrors po_scoped_update's logistics piece.
create policy po_lines_logistics_update on purchase_order_lines for update using (
  (select public.app_role()) in ('logistics','principal')
);
