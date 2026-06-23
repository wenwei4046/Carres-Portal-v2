-- 0170 — sell-side toggle + editable description on product_skus.
BEGIN;

ALTER TABLE public.product_skus
  ADD COLUMN IF NOT EXISTS pos_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN public.product_skus.pos_active IS
  'Sell-side visibility (Modular ON/OFF). DISTINCT from discontinued_at which is the cost/PO side. DEFAULT true keeps every existing SKU sellable on apply.';
COMMENT ON COLUMN public.product_skus.description IS
  'Editable sell-side description. variant stays the Size discriminator; product_models.name stays the model label.';

COMMIT;
