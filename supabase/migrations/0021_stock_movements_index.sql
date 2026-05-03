-- =============================================================================
-- 0021_stock_movements_index.sql — Phase 4 M4 prep: composite index for
-- movements page filters
-- =============================================================================
-- Source: spec §17.7 P4 (originally deferred to TODOs; un-deferred per
-- 2026-05-04 plan-eng-review P2=A — "1 line SQL is a lake not an ocean").
--
-- Why: GET /api/logistics/movements applies `WHERE warehouse_id = ?
-- AND occurred_at >= ? AND occurred_at < ?` plus optional sku/kind filters,
-- and orders by occurred_at desc. Without this index, the query is a seq
-- scan on stock_movements; at 24K+ rows (~1 year of operations), filter +
-- sort latency degrades from <50ms to >500ms.
-- =============================================================================
create index if not exists mov_wh_time_idx
  on public.stock_movements (warehouse_id, occurred_at desc);
