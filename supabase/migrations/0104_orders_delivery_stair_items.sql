-- =============================================================================
-- 0104_orders_delivery_stair_items.sql (Loo 2026-05-13)
-- =============================================================================
-- Feature: Dealer-pickable count of items that incur stair-carry fee.
--
-- Before: stair fee = (floor - free_floors) × per_floor × ALL_ITEM_QTY.
-- All items got charged when going above the free floor. Real cases (Loo
-- example): customer buys 3 mattresses; 1 goes to 3F (charge), 2 stay on 1F
-- (no charge). Old math overcharged.
--
-- After: orders.delivery_stair_items is the count of items the dealer says
-- actually need stair carry. NULL = legacy / dealer didn't override → caller
-- falls back to total line qty (current behavior preserved for historic rows).
--
-- Safety:
--   - Nullable column, no default → no rewrite of existing rows.
--   - No RLS change. No new constraint. No trigger.
--   - Reversible: drop the column to roll back (no data loss for current data
--     since all existing rows would have NULL anyway).
-- Authorized in conversation 2026-05-13 per CLAUDE.md §7.
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN delivery_stair_items integer;

COMMENT ON COLUMN public.orders.delivery_stair_items IS
  'Count of items needing stair carry. NULL = dealer left it auto = sum(line.qty). Used by floor surcharge math at order detail.';
