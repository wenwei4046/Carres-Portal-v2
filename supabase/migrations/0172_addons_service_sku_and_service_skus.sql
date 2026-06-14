-- 0172 — addons.service_sku + mint Service-category SKUs + backfill links.
-- DEPENDS ON 0169 (the 'service' enum value) applied + committed first, and on
-- 0170 (pos_active/description cols) + 0171 (supplier_id nullable).
-- Loo 2026-06-14: service SKUs use the BARE SVC- code AS the sku (no colon
-- namespacing), so addons.service_sku joins product_skus.sku directly.
BEGIN;

-- 1. addons.service_sku + DB-level format guard (mirrors the FE/zod regex).
ALTER TABLE public.addons ADD COLUMN IF NOT EXISTS service_sku text;
ALTER TABLE public.addons DROP CONSTRAINT IF EXISTS addons_service_sku_format;
ALTER TABLE public.addons ADD CONSTRAINT addons_service_sku_format
  CHECK (service_sku IS NULL OR service_sku ~ '^SVC-[A-Z0-9-]+$');

-- 2. Parent 'service' model so minted SKUs satisfy product_skus.model_id NOT NULL.
INSERT INTO public.product_models (category, model_key, name, blurb)
VALUES ('service', 'service-addons', 'Service & Add-ons', 'Internal service / delivery / disposal SKUs')
ON CONFLICT (category, model_key) DO NOTHING;

-- 3. Mint Service-category SKUs under the seeded carres-internal supplier (0134).
--    sku = bare SVC- code; price 0 (Loo fills later via Edit Prices).
DO $$
DECLARE
  v_model_id    uuid;
  v_supplier_id uuid;
BEGIN
  SELECT id INTO v_model_id    FROM public.product_models WHERE category = 'service' AND model_key = 'service-addons';
  SELECT id INTO v_supplier_id FROM public.suppliers      WHERE slug = 'carres-internal' LIMIT 1;
  -- v_supplier_id may be NULL on a stripped env; supplier_id is nullable post-0171.

  INSERT INTO public.product_skus (model_id, sku, variant, variant_kind, price, supplier_id, pos_active, description)
  VALUES
    (v_model_id, 'SVC-DELIVERY',         'SVC-DELIVERY',         'preset', 0, v_supplier_id, true, 'Delivery service'),
    (v_model_id, 'SVC-DISPOSE-MATTRESS', 'SVC-DISPOSE-MATTRESS', 'preset', 0, v_supplier_id, true, 'Dispose old mattress'),
    (v_model_id, 'SVC-DISPOSE-SOFA',     'SVC-DISPOSE-SOFA',     'preset', 0, v_supplier_id, true, 'Dispose old sofa'),
    (v_model_id, 'SVC-DISPOSE-BEDFRAME', 'SVC-DISPOSE-BEDFRAME', 'preset', 0, v_supplier_id, true, 'Dispose old bed frame')
  ON CONFLICT (sku) DO NOTHING;
END $$;

-- 4. Backfill addons.service_sku. addons PK = key; verified keys are
--    dispose-mattress / dispose-sofa / dispose-bedframe (no 'lift').
UPDATE public.addons SET service_sku = 'SVC-DISPOSE-MATTRESS' WHERE key = 'dispose-mattress';
UPDATE public.addons SET service_sku = 'SVC-DISPOSE-SOFA'     WHERE key = 'dispose-sofa';
UPDATE public.addons SET service_sku = 'SVC-DISPOSE-BEDFRAME' WHERE key = 'dispose-bedframe';

COMMIT;
