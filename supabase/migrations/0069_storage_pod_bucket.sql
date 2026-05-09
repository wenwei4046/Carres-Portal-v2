-- =============================================================================
-- 0069_storage_pod_bucket.sql — Phase 7 Sprint 1
-- =============================================================================
-- Bucket: 'proof-of-delivery' (private)
-- Path: {thread_id}/{uuid}-{filename}.{ext}
-- Security model (USER JWT signing, mirroring 0042 DO bucket pattern):
--   - Hono validates caller role at API entry
--   - Hono calls supabase.storage.createSignedUploadUrl using USER JWT
--   - Storage RLS is the effective boundary (no service_role for upload)
--
-- RLS:
--   - logistics + principal + finance: read all PODs (audit / dispute)
--   - partner: read + write PODs where thread.delivery_partner_id = own
--   - dealer / supplier: no access (PII protection — POD photos may include
--     customer faces / addresses)
--
-- POD = customer-side delivery proof, uploaded by partner after handing the
-- order over. Distinct from DO (supplier→logistics handoff, bucket
-- 'delivery-orders' from 0042). Same shape, different actors + bucket.
--
-- Authorized 2026-05-09 in conversation per CLAUDE.md §7 + RED LINE #4.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('proof-of-delivery', 'proof-of-delivery', false)
ON CONFLICT (id) DO NOTHING;

-- Read policy: HQ roles see all (audit); partner sees only their own.
DROP POLICY IF EXISTS "pod_read" ON storage.objects;
CREATE POLICY "pod_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proof-of-delivery' AND (
    (select public.app_role()) IN ('logistics', 'principal', 'finance')
    OR (
      (select public.app_role()) = 'partner'
      AND EXISTS (
        SELECT 1 FROM order_supplier_threads t
        WHERE t.id::text = split_part(name, '/', 1)
          AND t.delivery_partner_id = (select public.app_partner_id())
      )
    )
  )
);

-- Write policy: partner can INSERT POD for their own threads.
DROP POLICY IF EXISTS "pod_write" ON storage.objects;
CREATE POLICY "pod_write" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proof-of-delivery'
  AND (select public.app_role()) = 'partner'
  AND EXISTS (
    SELECT 1 FROM order_supplier_threads t
    WHERE t.id::text = split_part(name, '/', 1)
      AND t.delivery_partner_id = (select public.app_partner_id())
  )
);

-- No UPDATE / DELETE: PODs are immutable post-upload.
