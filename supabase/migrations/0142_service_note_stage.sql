-- Migration 0142 — Service Note stage progression
-- Adds a current_stage column to service_notes for fine-grained progress tracking
-- within an ongoing case. Status (ongoing/closed) stays as the coarse filter.
--
-- Stage flow:
--   collected → with_supplier → supplier_done → scheduled
--   (closing = set status='closed'; current_stage stays at last active stage)

ALTER TABLE service_notes
  ADD COLUMN current_stage TEXT NOT NULL DEFAULT 'collected'
    CHECK (current_stage IN ('collected', 'with_supplier', 'supplier_done', 'scheduled'));

-- Index for dashboard badge query: count overdue ongoing SNs
CREATE INDEX service_notes_stage_deadline
  ON service_notes (status, current_stage, deadline)
  WHERE status = 'ongoing';
