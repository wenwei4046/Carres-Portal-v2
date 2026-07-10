-- 0212_ops_stock_condition_refurbished.sql
-- Ready Stock Pool (Jess · NETS go-live).
-- WHY: add a 'refurbished' condition grade to ops_stock_items so repaired units
--   coming back into the pool are tracked as their own sellable grade, distinct
--   from new / exhibition (display) / old (fair, used) / damaged.
-- SCOPE: additive only — widens the CHECK constraint. Touches NO existing rows,
--   NO other table, NO RLS. "In repair" stays the separate `needs_repair` flag /
--   status axis; condition remains the physical-grade axis.
-- SAFE: existing values still valid; nothing else in the app breaks.

alter table ops_stock_items
  drop constraint if exists ops_stock_items_condition_check;

alter table ops_stock_items
  add constraint ops_stock_items_condition_check
  check (condition in ('new', 'exhibition', 'old', 'refurbished', 'damaged'));
