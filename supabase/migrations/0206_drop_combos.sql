-- =============================================================================
-- 0206_drop_combos.sql — remove the "Overall Combo" feature (drop 0177/0183)
-- =============================================================================
-- WHY:
--   The fixed-set "Overall Combo" (a named bundle of product SKUs sold at one
--   combo_price, migration 0177 + the 0183 cost benchmark) was written in error
--   and never used (0 combos, 0 components, 0 orders ever referenced it). Loo
--   asked to remove the feature outright (2026-07-06). The Sofa Combo system
--   (sofa_combo_pricing, migration 0179) is a SEPARATE feature and is KEPT.
--
-- SAFE TO DROP (verified on prod 2026-07-06):
--   select count(*) from combos            -> 0
--   select count(*) from combo_components  -> 0
--   select count(*) from order_lines where attrs ? 'combo_key' -> 0
--   Nothing in the DB depends on these tables (combo_components FKs combos;
--   no views, no functions, no triggers reference them).
--
-- DEPLOY ORDER (IMPORTANT):
--   Apply this ONLY AFTER the new API (which no longer SELECTs combos /
--   combo_components in the /api/catalog bundle) is deployed. The previously
--   deployed API reads these tables in its Promise.all — dropping them before
--   that deploy would 500 the whole catalog endpoint.
--
--   Drop combo_components first (it FKs combos), then combos. CASCADE + IF
--   EXISTS make this idempotent and clean up the attached RLS policies.
-- =============================================================================

DROP TABLE IF EXISTS public.combo_components CASCADE;
DROP TABLE IF EXISTS public.combos CASCADE;
