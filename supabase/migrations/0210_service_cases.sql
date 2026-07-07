-- Migration 0210 — Service Cases (case / 病历 parent layer)
-- =============================================================================
-- Adds a Case parent layer above the existing Service Notes (SN, migration 0140).
--
--   service_cases (病历, parent) ── 1:N ──► service_notes (派工单, child; P2 adds case_id)
--
-- A Case is the medical-record: what happened / Carres action / what was
-- affected / incurred charges, classified by a config-driven Case Type + Status.
-- The Service Note (0140) stays the printable dispatch order generated under a
-- case (the FK service_notes.case_id is added in P2, not here).
--
-- Config tables (service_case_types / service_case_statuses) make Case Type and
-- Status data-driven: adding a type/status later = INSERT one row, no code change.
--
-- KEY DESIGN (Loo, 2026-07-07):
--   • Permanent link key = orders.id (order_id). Ref No is an alias only
--     (AutoCount is being retired → source_ref will disappear).
--   • Case No = SC{YYMM}-NN, monthly reset (mirrors next_sn_no / SN numbering).
--   • Existing service_notes real data is BACKFILLED into cases so the renamed
--     list keeps 6 months of history visible.
--
-- SAFETY (Loo decision #4):
--   • Purely ADDITIVE. service_notes is NOT altered in this migration (its
--     columns and rows are untouched here; case_id is a P2 change).
--   • Backfill is INSERT-only into the NEW service_cases table — reads
--     service_notes, never mutates it. Zero data-loss / re-order risk.
--   • Fully reversible: the ROLLBACK block at the bottom drops only the new
--     objects; no existing data is affected.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Config tables
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE service_case_types (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT    NOT NULL UNIQUE,
  label      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_case_statuses (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT    NOT NULL UNIQUE,
  label      TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true,
  is_closed  BOOLEAN NOT NULL DEFAULT false,   -- Ongoing vs Closed derives from this
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed — Case Types (Loo's v1 set)
INSERT INTO service_case_types (code, label, sort_order) VALUES
  ('trial_100day',   '100-Day Trial',    10),
  ('warranty_claim', 'Warranty Claim',   20),
  ('delivery_damage','Delivery Damage',  30),
  ('customer_request','Customer Request', 40);

-- Seed — Statuses (Resolved is the only terminal/closed state in v1)
INSERT INTO service_case_statuses (code, label, sort_order, is_closed) VALUES
  ('pending',     'Pending',      10, false),
  ('in_progress', 'In Progress',  20, false),
  ('follow_up',   'Follow-up',    30, false),
  ('resolved',    'Resolved',     40, true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Case No monthly sequence (mirrors service_note_seq / next_sn_no)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE service_case_seq (
  ym      TEXT    PRIMARY KEY,   -- 'YYMM' e.g. '2607'
  last_no INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. service_cases — the case (病历) parent
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE service_cases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no                TEXT NOT NULL UNIQUE,               -- SC{YYMM}-NN

  -- ★ Permanent link key. Ref No is alias only.
  order_id               UUID REFERENCES orders(id),
  ref_no                 TEXT,                               -- AutoCount Ref alias (CR0418 …)

  -- Customer snapshot (from order lookup, or manual entry)
  customer_name          TEXT NOT NULL DEFAULT '',
  customer_phone         TEXT,
  customer_address       TEXT,

  -- Classification (config-driven; nullable so a case can be opened un-tagged)
  case_type_id           UUID REFERENCES service_case_types(id),
  status_id              UUID REFERENCES service_case_statuses(id),

  -- Simple medical record (neutral naming, room to evolve)
  what_happened          TEXT,
  carres_action          TEXT,
  what_affected          TEXT,
  incurred_charges       TEXT,

  opened_at              DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Provenance: set when a case was backfilled from a legacy service_note.
  -- P2 uses this to link service_notes.case_id back to the originating case.
  source_service_note_id UUID REFERENCES service_notes(id),

  created_by             UUID REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- next_case_no() — atomically allocate the next SC number for the current month
CREATE OR REPLACE FUNCTION next_case_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yymm TEXT    := to_char(CURRENT_DATE, 'YYMM');
  seq  INTEGER;
BEGIN
  INSERT INTO service_case_seq (ym, last_no) VALUES (yymm, 1)
  ON CONFLICT (ym) DO UPDATE SET last_no = service_case_seq.last_no + 1
  RETURNING last_no INTO seq;
  RETURN 'SC' || yymm || '-' || LPAD(seq::TEXT, 2, '0');
END;
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_service_case_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER service_cases_updated_at
  BEFORE UPDATE ON service_cases
  FOR EACH ROW EXECUTE FUNCTION set_service_case_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill — one case per existing service_note (Loo decision #2)
--    INSERT-only; service_notes is read, never modified.
--    • case_no  : SC{YYMM}-NN, monthly-sequenced by the SN's request_date
--    • status   : ongoing → in_progress, closed → resolved
--    • case_type: left NULL (old free-text type stays on the SN row, not lost)
--    • source_service_note_id : the SN id (P2 link key)
-- ─────────────────────────────────────────────────────────────────────────────
WITH numbered AS (
  SELECT
    sn.id,
    sn.customer_name,
    sn.customer_phone,
    sn.customer_address,
    sn.ref_no,
    sn.order_id,
    sn.what_happened,
    sn.request_date,
    sn.status,
    sn.created_by,
    sn.created_at,
    to_char(sn.request_date, 'YYMM') AS ym,
    row_number() OVER (
      PARTITION BY to_char(sn.request_date, 'YYMM')
      ORDER BY sn.request_date, sn.sn_no, sn.id
    ) AS rn
  FROM service_notes sn
)
INSERT INTO service_cases (
  case_no, order_id, ref_no,
  customer_name, customer_phone, customer_address,
  status_id, what_happened, opened_at,
  source_service_note_id, created_by, created_at
)
SELECT
  'SC' || n.ym || '-' || LPAD(n.rn::TEXT, 2, '0'),
  n.order_id,
  n.ref_no,
  COALESCE(n.customer_name, ''),
  n.customer_phone,
  n.customer_address,
  (SELECT id FROM service_case_statuses
     WHERE code = CASE WHEN n.status = 'closed' THEN 'resolved' ELSE 'in_progress' END),
  n.what_happened,
  n.request_date,
  n.id,
  n.created_by,
  n.created_at
FROM numbered n;

-- Seed service_case_seq so future next_case_no() continues past the backfill.
INSERT INTO service_case_seq (ym, last_no)
SELECT to_char(request_date, 'YYMM'), COUNT(*)
FROM service_notes
GROUP BY to_char(request_date, 'YYMM')
ON CONFLICT (ym) DO UPDATE SET last_no = GREATEST(service_case_seq.last_no, EXCLUDED.last_no);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — operation + principal (mirrors 0140 service_notes policies)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE service_cases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_case_types    ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_case_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_case_seq      ENABLE ROW LEVEL SECURITY;

-- Cases: operation + principal full access
CREATE POLICY sc_op_principal_all ON service_cases
  FOR ALL TO authenticated
  USING     ((SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal'))
  WITH CHECK ((SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal'));

-- Config: operation + principal may READ (dropdowns); only principal may WRITE.
CREATE POLICY sct_read ON service_case_types
  FOR SELECT TO authenticated
  USING ((SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal'));
CREATE POLICY sct_principal_write ON service_case_types
  FOR ALL TO authenticated
  USING     ((SELECT auth.jwt()->'app_metadata'->>'role') = 'principal')
  WITH CHECK ((SELECT auth.jwt()->'app_metadata'->>'role') = 'principal');

CREATE POLICY scs_read ON service_case_statuses
  FOR SELECT TO authenticated
  USING ((SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal'));
CREATE POLICY scs_principal_write ON service_case_statuses
  FOR ALL TO authenticated
  USING     ((SELECT auth.jwt()->'app_metadata'->>'role') = 'principal')
  WITH CHECK ((SELECT auth.jwt()->'app_metadata'->>'role') = 'principal');

-- seq: deny direct row access (only reachable via SECURITY DEFINER next_case_no())
CREATE POLICY sc_seq_deny ON service_case_seq
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX service_cases_order_id   ON service_cases (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX service_cases_status     ON service_cases (status_id);
CREATE INDEX service_cases_opened_at  ON service_cases (opened_at DESC);
CREATE INDEX service_cases_source_sn  ON service_cases (source_service_note_id) WHERE source_service_note_id IS NOT NULL;

-- =============================================================================
-- ROLLBACK (run manually to fully revert — no existing data is affected)
-- =============================================================================
-- DROP TABLE IF EXISTS service_cases CASCADE;
-- DROP TABLE IF EXISTS service_case_types CASCADE;
-- DROP TABLE IF EXISTS service_case_statuses CASCADE;
-- DROP TABLE IF EXISTS service_case_seq CASCADE;
-- DROP FUNCTION IF EXISTS next_case_no();
-- DROP FUNCTION IF EXISTS set_service_case_updated_at();
