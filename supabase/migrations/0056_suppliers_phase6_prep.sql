-- =============================================================================
-- 0056_suppliers_phase6_prep.sql — Phase 4.5 Chunk 2 Sprint F
-- =============================================================================
-- Pre-stage Phase 6 supplier portal columns. Per spec CQ5: pre-adding here
-- avoids ALTER TABLE suppliers when Phase 6 (supplier portal) ships, which
-- would otherwise touch a then-active table.
--
-- Columns:
--   - portal_enabled boolean NOT NULL DEFAULT false — gates supplier login
--   - contact_email  text — supplier portal contact (Phase 6 will use)
-- =============================================================================

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contact_email  text;
