-- 0173 — public-read / internal-write Storage bucket for product model photos.
-- Pattern mirrors 0042_storage_dos_bucket.sql but PUBLIC (photos render on
-- quotes/printouts without signing — Loo approved 2026-06-14). Write gate uses
-- (select public.is_internal()) (InitPlan-wrapped per CLAUDE.md Fix 2); 0121 already
-- rewrote is_internal() logistics->operation, so do NOT use a raw 'logistics' literal.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-model-photos', 'product-model-photos', true, 2097152,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS product_model_photos_public_select   ON storage.objects;
DROP POLICY IF EXISTS product_model_photos_internal_insert ON storage.objects;
DROP POLICY IF EXISTS product_model_photos_internal_update ON storage.objects;
DROP POLICY IF EXISTS product_model_photos_internal_delete ON storage.objects;

CREATE POLICY product_model_photos_public_select ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'product-model-photos');

CREATE POLICY product_model_photos_internal_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-model-photos' AND (select public.is_internal()));

CREATE POLICY product_model_photos_internal_update ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'product-model-photos' AND (select public.is_internal()))
  WITH CHECK (bucket_id = 'product-model-photos' AND (select public.is_internal()));

CREATE POLICY product_model_photos_internal_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'product-model-photos' AND (select public.is_internal()));

COMMIT;
