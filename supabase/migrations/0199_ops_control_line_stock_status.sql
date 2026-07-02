-- =============================================================================
-- 0199_ops_control_line_stock_status.sql (Jess approved in-conversation 2026-07-02)
-- =============================================================================
-- Per-line stock STATUS for the order detail (Jess 2026-07-02). Ready/Waiting/
-- No PO is otherwise DERIVED from portal free stock, but AutoCount orders' real
-- received status lives only in the Master "Ops" sheet (col Z Received/Pending/
-- No Stock) and was never booked into the portal — so nothing ever showed Ready.
--
--   line_stock_status — jsonb { "<sku>": "ready" | "waiting" | "nopo" }, keyed by
--                       line SKU (mirrors line_etas / line_locations). Set by the
--                       Master-sheet import OR keyed per line in the Stock column;
--                       the readiness badge PREFERS it over the derived value.
--                       Absent key => fall back to the derived readiness.
-- Additive + nullable → zero-downtime. RLS unchanged (row-level, from 0159).
-- =============================================================================
alter table public.ops_order_control
  add column if not exists line_stock_status jsonb;
