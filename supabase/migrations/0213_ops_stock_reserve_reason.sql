-- 0213_ops_stock_reserve_reason.sql
-- Ready Stock Pool (Jess · NETS go-live) — Option 1 scope.
-- WHY: capture WHY a ready-pool unit was pulled when reserved from the On Hand
--   "Reserve oldest free unit" box: 'urgent' (急单, salesperson urgent sale) vs
--   'exchange' (换货, damage swap). Feeds stage-2 reporting on ready-stock usage.
-- SCOPE: additive — one nullable column on ops_stock_items. NO RPC change: the
--   /reserve route stamps this under the existing write_internal RLS (same path
--   as /reserve-item). The order-drawer reserve (batch 3 · OrderDetailDrawer)
--   is intentionally NOT wired here — deferred to when batch 3 resumes.
-- SAFE: nullable + CHECK allows NULL; existing rows/flows unaffected.

alter table ops_stock_items
  add column if not exists reserve_reason text
  check (reserve_reason in ('urgent', 'exchange'));
