-- =============================================================================
-- 0091_supplier_read_partners.sql (Loo 2026-05-11)
-- =============================================================================
-- Suppliers self-deliver and need to see the destination warehouse's owning
-- partner — name + contact for the dispatch driver. Pre-0091 `partners_read`
-- only admitted is_internal() (principal/logistics/finance/bd) and the
-- partner themselves; supplier got null on the nested join in
-- /api/supplier/pos for warehouses.owning_partner_id → delivery_partners.
--
-- Partner master data (name / contact / zones) is operational, not
-- sensitive — alpha-scope opens it to all suppliers wholesale rather than
-- attempting per-PO subquery scoping (which would also need to walk through
-- warehouse.owning_partner_id, dragging complexity into a hot path).
-- =============================================================================

DROP POLICY IF EXISTS partners_read ON delivery_partners;
CREATE POLICY partners_read ON delivery_partners FOR SELECT TO authenticated
USING (
  (select public.is_internal())
  OR id = (select public.app_partner_id())
  OR (select public.app_role()) = 'supplier'
);
