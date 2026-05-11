-- =============================================================================
-- 0092_partner_read_suppliers.sql (Loo 2026-05-11)
-- =============================================================================
-- Partner role needs to read suppliers.kind to branch the Awaiting-accept
-- card button: own_logistics → "Confirm receive / Reject relocate"
-- (migration 0090 sofa flow); factory_pickup → "Accept pickup" (the
-- standard factory pickup flow).
--
-- Pre-0092 the partner saw "✓ Accept pickup" on every Awaiting card because
-- the nested join on `suppliers(kind)` returned NULL — RLS denied partner
-- read. Clicking it called partner_accept_pickup on PO-2032 whose
-- procurement_partner_id is NULL (own_logistics), failing the
-- cross-partner check with "forbidden: cross-partner accept".
--
-- Supplier master data (name / contact / kind / cat_covered / lead_time)
-- is operational not sensitive — same rationale as 0091 for partner master
-- data exposed to suppliers.
-- =============================================================================

DROP POLICY IF EXISTS suppliers_read ON suppliers;
CREATE POLICY suppliers_read ON suppliers FOR SELECT TO authenticated
USING (
  (select public.is_internal())
  OR id = (select public.app_supplier_id())
  OR (select public.app_role()) = 'partner'
);
