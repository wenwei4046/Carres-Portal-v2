-- =============================================================================
-- 0044_po_dispatch_fields.sql — Phase 4.5 Chunk 1
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5-chunk-1-design.md §6.4 (v3)
-- Sprint: 1 (schema)
--
-- Adds 4 NEW columns to purchase_orders for the customer-leg RFD/dispatch flow:
--   - confirm_delivery_date: date filled by Logistics or LP
--   - request_for_delivery_at: timestamp set when Logistics presses Send RFD
--   - partner_accepted_at: timestamp set when LP accepts RFD
--   - partner_rejected_at: timestamp set when LP rejects RFD
--
-- partner_rejection_reason intentionally NOT added (per C1.9 — reason not stored;
-- audit_log entry text is the persistence). Codex F10 fix.
--
-- Plus a partial INDEX for the "RFD pending" LP queue.
--
-- Idempotent via IF NOT EXISTS.
-- =============================================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS confirm_delivery_date    date,
  ADD COLUMN IF NOT EXISTS request_for_delivery_at  timestamptz,
  ADD COLUMN IF NOT EXISTS partner_accepted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS partner_rejected_at      timestamptz;

CREATE INDEX IF NOT EXISTS po_partner_rfd_pending_idx
  ON purchase_orders (delivery_partner_id, request_for_delivery_at)
  WHERE request_for_delivery_at IS NOT NULL
    AND partner_accepted_at IS NULL
    AND partner_rejected_at IS NULL;
