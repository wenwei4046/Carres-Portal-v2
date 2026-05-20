-- =============================================================================
-- 0136_orders_ops_assigned_logistic.sql — Inbox triage assignment
-- 2026-05-20 (Loo authorised in conversation per CLAUDE.md §7).
--
-- WHY: when an AutoCount order lands in portal (status='place'), operation
-- needs to decide which logistic partner will handle the customer-leg
-- delivery (NETS / TSDD / AL / HOUZS). That decision happens BEFORE the
-- formal `operation_assign_partner` RPC runs (which fires later when the
-- order moves ready_to_dispatch → dispatched). This column captures the
-- EARLY pre-assignment so the Inbox view can group + filter.
--
-- Semantics:
--   - NULL  → still in Inbox (not yet assigned)
--   - set   → drops out of Inbox, shows up under that partner's queue
--   - Separate from `orders.delivery_partner_id`: that one is the FORMAL
--     customer-leg LP set by the proceed/assign flow. ops_assigned_logistic
--     is the earlier triage hint. They CAN match (and usually will) but
--     this column may be set before the formal assignment exists.
--
-- Plus: seed TSDD / AL / HOUZS into delivery_partners (idempotent). After
-- Phase 9 cleanup only Nets exists; the Master Sheet relies on the other
-- three too. GAI intentionally NOT seeded — being retired per §17.
-- =============================================================================

-- 1. Column + index
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS ops_assigned_logistic uuid
    REFERENCES delivery_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_ops_assigned_logistic_idx
  ON orders (ops_assigned_logistic)
  WHERE ops_assigned_logistic IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_inbox_idx
  ON orders (source_system, status)
  WHERE source_system = 'autocount'
    AND status = 'place'
    AND ops_assigned_logistic IS NULL;

COMMENT ON COLUMN orders.ops_assigned_logistic IS
  'Early triage pre-assignment to a logistic partner, set from the Inbox '
  'view. NULL = still in Inbox. Separate from delivery_partner_id (the '
  'formal customer-leg LP set later by the proceed/assign flow).';

-- 2. Seed missing logistic partners
INSERT INTO delivery_partners (name, contact, zones)
SELECT 'TSDD', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM delivery_partners WHERE name = 'TSDD');

INSERT INTO delivery_partners (name, contact, zones)
SELECT 'AL', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM delivery_partners WHERE name = 'AL');

INSERT INTO delivery_partners (name, contact, zones)
SELECT 'HOUZS', NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM delivery_partners WHERE name = 'HOUZS');

-- 3. Sanity
DO $sanity$
DECLARE
  has_col int; idx_inbox int; partner_count int;
BEGIN
  SELECT count(*) INTO has_col
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='orders' AND column_name='ops_assigned_logistic';
  IF has_col <> 1 THEN
    RAISE EXCEPTION '0136 sanity: orders.ops_assigned_logistic missing';
  END IF;

  SELECT count(*) INTO idx_inbox
    FROM pg_indexes
   WHERE schemaname='public' AND indexname='orders_inbox_idx';
  IF idx_inbox <> 1 THEN
    RAISE EXCEPTION '0136 sanity: orders_inbox_idx missing';
  END IF;

  SELECT count(*) INTO partner_count
    FROM delivery_partners
   WHERE name IN ('NETS','TSDD','AL','HOUZS');
  IF partner_count < 4 THEN
    RAISE EXCEPTION '0136 sanity: expected 4 logistic partners (NETS/TSDD/AL/HOUZS) seeded, got %', partner_count;
  END IF;

  RAISE NOTICE '0136 OK: ops_assigned_logistic column + indexes added; % core logistic partners present (NETS/TSDD/AL/HOUZS)', partner_count;
END $sanity$;
