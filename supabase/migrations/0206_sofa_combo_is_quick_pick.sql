-- =============================================================================
-- 0206_sofa_combo_is_quick_pick.sql — split Quick Pick presets from pricing combos
-- =============================================================================
-- WHY (Loo 2026-07-07):
--   A `sofa_combo_pricing` row currently serves BOTH purposes at once:
--     · a matched-combo PRICING rule (the engine rewards a build that matches it)
--     · a Quick Pick preset (the POS "Quick pick" tab lists EVERY active combo)
--   So "Create combo" on the sofa canvas auto-appears in the Quick pick tab —
--   which Loo does not want. Combos and Quick Picks must be separate:
--     · Create Combo      → a pricing rule, HIDDEN from the Quick pick tab.
--     · Create Quick Pick → a layout preset SHOWN in the Quick pick tab.
--
-- WHAT:
--   Add `is_quick_pick`. The POS Quick pick list filters `is_quick_pick = true`.
--   A Quick Pick preset is authored with NO price (empty `prices_by_height`) so
--   it NEVER competes in matched-combo pricing — picking it just loads the layout
--   onto the canvas, which prices live (à-la-carte, or a matching pricing combo).
--
-- ENGINE UNCHANGED:
--   `pickSofaCombo` keys off a numeric `prices_by_height[height]`, NOT this flag.
--   A price-less Quick Pick row is already skipped by the engine; a priced combo
--   (is_quick_pick = false) still prices exactly as before.
--
-- DEFAULT false + DORMANT:
--   A `sofa_combo_pricing` row is a pricing combo by default. Existing rows (the
--   2 test combos) get false → they leave the Quick pick tab, matching intent.
--   Additive only; principal-only writes already gated by 0179 RLS (no change).
--   create_order / order_lines / DraftLine UNTOUCHED. (Never edit 0001–0205.)
-- =============================================================================

ALTER TABLE public.sofa_combo_pricing
  ADD COLUMN is_quick_pick boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sofa_combo_pricing.is_quick_pick IS
  'true = a Quick Pick layout preset (shown in the POS Quick pick tab; authored '
  'with no price → prices live when loaded). false = a pricing-only matched combo '
  '(hidden from Quick pick). The pricing engine ignores this flag (0206).';
