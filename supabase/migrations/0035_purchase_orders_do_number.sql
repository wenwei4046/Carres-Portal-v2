-- =============================================================================
-- 0035_purchase_orders_do_number.sql -- Phase 4 v3-S4 hotfix
-- =============================================================================
-- Adds the missing `do_number` text column to purchase_orders.
--
-- Background: 0034_logistics_rpcs_v3.sql RPC `logistics_receive_po_with_do`
-- writes to `purchase_orders.do_number` (line 869), but the column was never
-- created. Postgres doesn't validate column references in plpgsql bodies at
-- CREATE FUNCTION time, so 0034 applied cleanly — the bug only surfaces when
-- the RPC is actually called. Caught by v3-S4 db-types regen subagent
-- (commit 31aca03 review). Fixed here so v3-S4.4-S4.6 API/web can call the
-- receive RPC without crashing.
--
-- Why a separate file vs editing 0034:
--   CLAUDE.md §14 #6 — "Never alter committed migration history" — write a
--   new migration instead. 0034 already applied to staging; we add the column
--   here as the canonical fix.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- =============================================================================

alter table purchase_orders
  add column if not exists do_number text;

-- No backfill needed — column is nullable; existing rows had no DO number, and
-- new rows get one set by `logistics_receive_po_with_do` going forward.
