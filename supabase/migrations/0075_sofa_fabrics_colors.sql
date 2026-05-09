-- =============================================================================
-- 0075_sofa_fabrics_colors.sql
-- =============================================================================
-- Catalog admin (Loo 2026-05-09): sofa fabrics need a list of available colors
-- so the dealer order picker can offer Linen → Slate / Cream / Sand / Charcoal
-- etc. without making each color its own SKU. Mirrors product_models.colors[]
-- on bedframe rows.
--
-- This migration:
--   1. ADD COLUMN sofa_fabrics.colors text[] — nullable; catalog admin sets
--      values via the inline-editable comma-separated input. Pre-existing
--      rows stay NULL until logistics fills them in.
--
-- NOT touched (intentional):
--   • RLS — fabrics_write_internal already gates writes via is_internal()
--     (principal/logistics/finance/bd).
--   • CHECK constraint — colors[] is free-form text; no whitelist enforced
--     server-side. The API zod regex is the only validator.
-- =============================================================================

alter table public.sofa_fabrics
  add column if not exists colors text[];

comment on column public.sofa_fabrics.colors is
  'Available colors for this fabric (Loo 2026-05-09). Catalog admin edits via comma-separated list, dealer order picker filters by fabric → color. NULL = no colors configured yet.';
