-- =============================================================================
-- 0042_storage_dos_bucket.sql — Phase 4.5 Chunk 1
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §6.2
-- Sprint: 1 (schema)
--
-- Bucket: 'delivery-orders' (private)
-- Path: {po_id}/{uuid}-{do_number}.{ext}
-- Security model (USER JWT signing — Codex F11):
--   - Hono validates caller role at API entry
--   - Hono calls supabase.storage.createSignedUploadUrl using USER JWT
--   - Storage RLS is the effective boundary (no service_role for upload signing)
--
-- RLS:
--   - logistics + principal: read + write all DOs
--   - partner: read DOs where po.delivery_partner_id = own (visibility only)
--   - dealer / supplier: no access
--
-- DO uploads = supplier-DO uploaded by Logistics on Receive. Customer-side POD
-- (uploaded by partner after delivery) is separate work — not Chunk 1.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('delivery-orders', 'delivery-orders', false)
ON CONFLICT (id) DO NOTHING;

-- Read policy
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
          AND po.delivery_partner_id = (select public.app_partner_id())
      )
    )
  )
);

-- Write policy (logistics + principal only)
DROP POLICY IF EXISTS "delivery_orders_write" ON storage.objects;
CREATE POLICY "delivery_orders_write" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'delivery-orders'
  AND (select public.app_role()) IN ('logistics', 'principal')
);

-- No UPDATE / DELETE policies (DO files are immutable post-upload).
