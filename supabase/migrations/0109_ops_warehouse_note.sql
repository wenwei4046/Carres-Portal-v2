-- =============================================================================
-- 0109_ops_warehouse_note.sql
-- =============================================================================
-- Adds warehouse_note annotation to ops_imported_orders (Jess COO 2026-05-19).
-- Warehouse staff instruction field: packing location, fragile notes, etc.
-- =============================================================================

alter table ops_imported_orders
  add column if not exists ops_warehouse_note text;

comment on column ops_imported_orders.ops_warehouse_note is
  'Instructions for warehouse when preparing the order (split locations, check packaging, etc).';
