-- =============================================================================
-- 0084_storage_dos_partner_write.sql (Loo 2026-05-11)
-- =============================================================================
-- Two fixes on the `delivery-orders` Storage bucket policies (originally from
-- migration 0042):
--
--   1. Partner-write access. The new partner-side receive flow (collapse of
--      "Arrived at WH" → "Logistics Receive" into a single step) needs the
--      partner driver to upload the signed DO directly. Previously WRITE was
--      gated on logistics/principal only — now scoped partner write is
--      allowed when the PO's procurement_partner_id matches the caller's
--      app_partner_id JWT claim.
--
--   2. READ policy column rename. Migration 0052 renamed
--      purchase_orders.delivery_partner_id → procurement_partner_id, but the
--      0042 read policy still referenced the old name. Logistics/principal
--      short-circuited the OR so partner reads silently 500'd from a missing
--      column. Recreating with the correct name restores partner DO viewing.
--
-- Both policies use the same EXISTS pattern as Storage 0069 (POD bucket) —
-- explicit subquery on purchase_orders, scoped by app_partner_id().
-- InitPlan-wrapped per CLAUDE.md §8 RLS performance fix #2.
-- =============================================================================

DROP POLICY IF EXISTS "delivery_orders_read" ON storage.objects;
CREATE POLICY "delivery_orders_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'delivery-orders' AND (
    (select public.app_role()) IN ('logistics', 'principal')
    OR (
      (select public.app_role()) = 'partner'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.procurement_partner_id = (select public.app_partner_id())
      )
    )
  )
);

DROP POLICY IF EXISTS "delivery_orders_write" ON storage.objects;
CREATE POLICY "delivery_orders_write" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-orders' AND (
    (select public.app_role()) IN ('logistics', 'principal')
    OR (
      (select public.app_role()) = 'partner'
      AND EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = split_part(name, '/', 1)
          AND po.procurement_partner_id = (select public.app_partner_id())
      )
    )
  )
);
