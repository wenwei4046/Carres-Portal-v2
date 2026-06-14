-- 0171 — model photo + option pools; make product_skus.supplier_id nullable
-- so service/accessory SKUs (which have no supplier) can insert.
BEGIN;

ALTER TABLE public.product_models
  ADD COLUMN IF NOT EXISTS photo_url       text,
  ADD COLUMN IF NOT EXISTS allowed_options jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.product_models.allowed_options IS
  'Category option pool, e.g. {"sizes":["K","Q","S"]}. Consumed by generate-skus to materialize the cartesian product of variants. Shape: {sizes?,compartments?,colors?,gaps?}.';

-- Resolve product_skus.supplier_id NOT NULL (chosen over a sentinel supplier).
-- FK to suppliers stays; a nullable FK is fine. Service/accessory SKUs carry NULL.
ALTER TABLE public.product_skus ALTER COLUMN supplier_id DROP NOT NULL;

COMMIT;
