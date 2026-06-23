-- 0169 — widen product_category enum to 5 values (Phase: Product & Maintenance rebuild).
-- STANDALONE, NO BEGIN/COMMIT. A value added via ALTER TYPE ... ADD VALUE cannot be
-- USED in the same transaction that added it, so this file carries NO other DDL and
-- MUST be applied + committed as its own apply_migration call BEFORE 0172 (which
-- INSERTs category='service' rows). Verified 2026-06-14: enum was exactly
-- {mattress,bedframe,sofa} (0001_init.sql).
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'accessory';
ALTER TYPE product_category ADD VALUE IF NOT EXISTS 'service';
