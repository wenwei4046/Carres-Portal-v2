-- =============================================================================
-- 0052_purchase_orders_drop_customer_leg.sql -- Phase 4.5 Chunk 2 Sprint C
-- =============================================================================
-- IRREVERSIBLE per CLAUDE.md §14 #1.
-- Pre-approval: 2026-05-06 autonomous-run agenda §1 (Loo's in-conversation OK
-- this session -- see docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-autonomous-run.md §1).
--
-- Drops customer-leg PO columns (moved to order_supplier_threads in 0049+0050+0051):
--   - confirm_delivery_date
--   - request_for_delivery_at
--   - partner_accepted_at
--   - partner_rejected_at
--
-- Renames delivery_partner_id -> procurement_partner_id to clarify semantics:
--   PO is now procurement-leg only (LP picks up from supplier, brings to warehouse).
--   Customer-leg LP assignment lives on order_supplier_threads.delivery_partner_id.
--
-- Sequence: 0052 applies FIRST (this file), then 0053 applies (which references
-- the renamed column from inside RPC bodies + the trigger function).
--
-- Index drop note: 0044 created `po_partner_rfd_pending_idx` ON
-- (delivery_partner_id, request_for_delivery_at) WHERE request_for_delivery_at
-- IS NOT NULL AND partner_accepted_at IS NULL AND partner_rejected_at IS NULL.
-- Three of the four columns it indexes are dropped here; PG would error on the
-- partial-index predicate after 0052 ATTEMPTs to drop the underlying columns,
-- so we DROP the index BEFORE the column drops to keep the migration safe.
--
-- Constraint swap: 0030 created `po_outsource_xor_partner` checking
-- ((outsource_partner_name IS NULL) OR (delivery_partner_id IS NULL)). PG
-- would auto-rename the column reference inside the constraint expression
-- (constraints are stored column-OID-tracked), but we DROP and re-CREATE
-- under a name that reflects the renamed column
-- (`po_outsource_xor_procurement_partner`). Predicate semantics stay
-- "at most one of the two is set" -- staging holds 4 of 6 rows with BOTH
-- NULL (legitimate pre-assign state), so we cannot tighten to strict XOR
-- without rejecting valid rows. Runtime XOR enforcement lives in
-- logistics_assign_partner_and_dispatch (entry #1 in 0053, lines 129-133).
-- =============================================================================

-- 1. DROP partial index that references columns we're about to drop. Must come
--    BEFORE the column drops because PG would otherwise refuse to drop columns
--    referenced in a partial-index predicate.
DROP INDEX IF EXISTS po_partner_rfd_pending_idx;

-- 2. RENAME the procurement-leg LP column. PG auto-updates RLS policy
--    expressions, function argument types, and other column-OID-tracked
--    references (verified across 0001/0002/0019/0022/0030/0031/0033/0042/0046).
--    The 0034/0045 RPC bodies that reference the OLD name as plpgsql TEXT will
--    fail at CALL time after this rename -- 0053 (applied next) recreates them
--    with the new name. RLS policies stay valid.
ALTER TABLE purchase_orders
  RENAME COLUMN delivery_partner_id TO procurement_partner_id;

-- 3. Swap the constraint to use the new column name. PRESERVE original 0030:75
--    "at most one" semantics: existing pre-assign rows have BOTH columns NULL,
--    which is valid (the assign RPC sets exactly one at runtime). Tightening
--    to strict XOR here would reject those pre-assign rows. Runtime XOR is
--    enforced inside `logistics_assign_partner_and_dispatch`; the table-level
--    CHECK is the looser "at most one" guard.
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS po_outsource_xor_partner;

ALTER TABLE purchase_orders
  ADD CONSTRAINT po_outsource_xor_procurement_partner
    CHECK ((outsource_partner_name IS NULL) OR (procurement_partner_id IS NULL));

-- 4. DROP the four customer-leg timestamp columns. Data migrated to
--    order_supplier_threads in 0050 backfill (idempotent; future writes go
--    direct to threads via 0051 RPCs). Once dropped, 0046 trigger function
--    `enforce_partner_po_column_whitelist` would fail at fire time on every
--    UPDATE because its body references NEW.request_for_delivery_at -- 0053
--    rewrites the trigger function body to remove that column reference.
ALTER TABLE purchase_orders
  DROP COLUMN IF EXISTS confirm_delivery_date,
  DROP COLUMN IF EXISTS request_for_delivery_at,
  DROP COLUMN IF EXISTS partner_accepted_at,
  DROP COLUMN IF EXISTS partner_rejected_at;
