-- 0218_ops_stock_qty.sql
-- Ready Stock Pool (Jess/Chai · Klg Warehouse import).
-- WHY: the "Klg Warehouse" ready-stock sheet is LINE-based, not one-row-per-
--   physical-unit. Most lines are qty 1 (serialized furniture), but a handful
--   are bulk accessory lines (e.g. Essential Memory Pillow qty 555, Mattress
--   Protector-Q qty 319) plus the odd 2-unit furniture line. Chai's DoD counts
--   LINES ("free total = 87"), so import stores one ops_stock_items record per
--   sheet line and carries the line quantity here instead of exploding a 555-row
--   pillow into 555 serialized units (nonsensical for a reserve register).
-- SCOPE: additive only — one new column, back-compatible. Every existing row is
--   genuinely a single unit, so the default is 1 (NOT NULL avoids null math in
--   all downstream count/rollup code). Distinct from the enum-model migration
--   that was intentionally NOT done — this is the single qty column Chai
--   approved.
-- SAFE: default 1 backfills the 71 existing rows correctly; no other table, no
--   RLS, no trigger touched. Reserve/sell semantics for a qty>1 bulk line are
--   deferred (they do not fit the reserve-one-unit flow yet); today qty is an
--   informational count so the register reconciles to source.

alter table ops_stock_items
  add column if not exists qty integer not null default 1
  check (qty >= 1);

comment on column ops_stock_items.qty is
  'Units represented by this stock record. 1 for serialized furniture (the norm); '
  '>1 only for bulk accessory lines imported from the Klg Warehouse sheet '
  '(migration 0218). Informational count — reserve/sell of qty>1 lines is deferred.';
