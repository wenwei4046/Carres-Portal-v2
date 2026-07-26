-- =============================================================================
-- 0270_guarantee_scope.sql  (Loo 2026-07-26)
-- =============================================================================
-- A guarantee could only say "covers the mattress category". Loo wants it
-- authored precisely, from the + New SKU form:
--
--   Mattress / Bed frame → a specific MODEL (or any model in the category),
--                          and specific VARIANTS (King / Queen / …) or any
--   Sofa                 → a specific COMBO, a specific COMPARTMENT, a
--                          specific model, or any model
--   Accessory            → a model (or any) — no variant axis
--
-- Then the coverage YEARS, the description and the price.
--
-- NULL means ANY at that level, which is what makes this additive: the live
-- `GRT-MATTRESS-15Y` term keeps every column NULL and therefore keeps covering
-- every mattress, exactly as it did before this migration.
--
-- Deliberately NOT one wide "scope jsonb": these are real foreign keys, so a
-- model/combo/compartment that gets deleted takes its narrowed guarantee terms
-- with it rather than leaving a term pointing at a ghost that silently matches
-- nothing (or worse, matches a re-used id).
--
-- Authorized in conversation 2026-07-26 per CLAUDE.md §7.
-- =============================================================================

ALTER TABLE public.guarantee_terms
  ADD COLUMN IF NOT EXISTS covers_model_id       uuid REFERENCES public.product_models(id)     ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS covers_variants       text[],
  ADD COLUMN IF NOT EXISTS covers_combo_id       uuid REFERENCES public.sofa_combo_pricing(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS covers_compartment_id uuid REFERENCES public.sofa_compartments(id)  ON DELETE CASCADE;

COMMENT ON COLUMN public.guarantee_terms.covers_model_id IS
  'NULL = any model in covers_category';
COMMENT ON COLUMN public.guarantee_terms.covers_variants IS
  'NULL / empty = any variant. Only meaningful for mattress + bedframe.';
COMMENT ON COLUMN public.guarantee_terms.covers_combo_id IS
  'Sofa only. NULL = not combo-scoped. Matched against a build line''s cells.';
COMMENT ON COLUMN public.guarantee_terms.covers_compartment_id IS
  'Sofa only. NULL = not compartment-scoped.';

-- A combo / compartment scope is meaningless outside sofa, and pinning BOTH at
-- once is contradictory (a compartment is a piece, a combo is a whole shape).
ALTER TABLE public.guarantee_terms
  DROP CONSTRAINT IF EXISTS guarantee_terms_sofa_scope_ck;
ALTER TABLE public.guarantee_terms
  ADD CONSTRAINT guarantee_terms_sofa_scope_ck CHECK (
    (covers_combo_id IS NULL AND covers_compartment_id IS NULL)
    OR (covers_category = 'sofa' AND NOT (covers_combo_id IS NOT NULL AND covers_compartment_id IS NOT NULL))
  );

-- Variants only make sense where a variant axis exists (Loo: accessories carry
-- none, and a sofa is scoped by combo/compartment rather than by size).
ALTER TABLE public.guarantee_terms
  DROP CONSTRAINT IF EXISTS guarantee_terms_variants_scope_ck;
ALTER TABLE public.guarantee_terms
  ADD CONSTRAINT guarantee_terms_variants_scope_ck CHECK (
    covers_variants IS NULL
    OR cardinality(covers_variants) = 0
    OR covers_category IN ('mattress', 'bedframe')
  );

CREATE INDEX IF NOT EXISTS guarantee_terms_covers_model_idx
  ON public.guarantee_terms (covers_model_id)
  WHERE covers_model_id IS NOT NULL;
