-- =============================================================================
-- 0018_stock_balances_reserved.sql — Phase 4 M1 schema (Logistics)
-- =============================================================================
-- Source of truth: docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md
-- Decisions:
--   §4   — reservation logic on ready_to_dispatch / delivered transitions
--   §5   — schema sketch
--   §17.2 D1.reserved — follow spec (not proto). Add `reserved` for concurrency
--          safety across multi-order dispatch window.
--
-- What this migration does:
--   1. Adds `stock_balances.reserved int` (default 0) — the count of units that
--      are committed to ready_to_dispatch / dispatched orders but not yet
--      physically removed from the warehouse. Stays incremented through
--      dispatch and is decremented in the same UPDATE that removes qty on the
--      delivered transition.
--   2. CHECK constraints to enforce two invariants:
--        a. reserved >= 0          — no negative reservations
--        b. qty >= reserved        — never reserve what isn't on hand
--      Both check failures surface as SQLSTATE 23514 from PG; the
--      logistics_adjust_stock RPC catches and rethrows as P0001 with a
--      friendlier code per CQ2.
--
-- `available = qty - reserved` is computed on the fly in queries; we don't
-- materialize it as a column to avoid keeping it in sync.
-- =============================================================================

alter table stock_balances add column reserved int not null default 0;

alter table stock_balances
  add constraint stock_balances_reserved_nonneg check (reserved >= 0);

alter table stock_balances
  add constraint stock_balances_qty_ge_reserved check (qty >= reserved);
