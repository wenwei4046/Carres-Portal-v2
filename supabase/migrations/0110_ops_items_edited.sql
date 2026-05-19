-- =============================================================================
-- 0110_ops_items_edited.sql
-- =============================================================================
-- Tracks whether ops staff has manually edited the items array on an order.
-- When true, re-import skips overwriting items + total_qty (portal wins).
-- =============================================================================

alter table ops_imported_orders
  add column if not exists items_edited boolean not null default false;

comment on column ops_imported_orders.items_edited is
  'Set to true when ops staff manually edits items; re-import skips items update when true (portal wins AutoCount).';
