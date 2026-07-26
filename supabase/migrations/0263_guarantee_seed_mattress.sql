-- =============================================================================
-- 0263_guarantee_seed_mattress.sql  (Loo 2026-07-26)
-- =============================================================================
-- The first guarantee product: Mattress Guarantee, RM150, 15 years, one-for-one
-- replacement (Loo's pricing, in conversation 2026-07-26).
--
-- Unlike the sofa / PWP / delivery engines this does NOT ship dormant — Loo
-- asked for it sellable. It is one POS card in its own rail; zero effect on any
-- existing order total (nothing else reads guarantee SKUs).
--
-- The variant text IS the invoice line description (finance/invoices.ts reads
-- product_skus.variant), so it must read as a sentence on a tax invoice.
--
-- Idempotent — safe to re-run.
-- =============================================================================

DO $$
DECLARE
  v_model_id uuid;
BEGIN
  SELECT id INTO v_model_id FROM public.product_models WHERE model_key = 'GUARANTEE-MATTRESS';

  IF v_model_id IS NULL THEN
    INSERT INTO public.product_models (category, model_key, name, blurb, allowed_options)
    VALUES (
      'guarantee',
      'GUARANTEE-MATTRESS',
      'Mattress Guarantee',
      'Fifteen years, one-for-one. If the mattress fails inside the window we replace it with a new one — no repair, no pro-rata.',
      '{}'::jsonb
    )
    RETURNING id INTO v_model_id;
  END IF;

  INSERT INTO public.product_skus (model_id, sku, variant, variant_kind, price, pos_active, supplier_id, description)
  VALUES (
    v_model_id,
    'GRT-MATTRESS-15Y',
    'Mattress Guarantee 15 Years',
    'preset',
    150.00,
    true,
    NULL,                          -- no supplier: a guarantee is never purchased
    'Covers one mattress for 15 years from the delivery date. Remedy is one-for-one replacement with a new mattress, not repair. One guarantee covers one mattress; claiming it uses it up.'
  )
  ON CONFLICT (sku) DO NOTHING;
END $$;

INSERT INTO public.guarantee_terms (guarantee_sku, label, covers_category, coverage_years, remedy, terms_text)
VALUES (
  'GRT-MATTRESS-15Y',
  'Mattress Guarantee 15 Years',
  'mattress',
  15,
  'replace',
  'Covers the mattress named above for 15 years from the delivery date. Remedy is one-for-one replacement with a new mattress — not repair. One guarantee covers one mattress and is used up when claimed.'
)
ON CONFLICT (guarantee_sku) DO UPDATE
  SET label           = EXCLUDED.label,
      covers_category = EXCLUDED.covers_category,
      coverage_years  = EXCLUDED.coverage_years,
      remedy          = EXCLUDED.remedy,
      terms_text      = EXCLUDED.terms_text;
