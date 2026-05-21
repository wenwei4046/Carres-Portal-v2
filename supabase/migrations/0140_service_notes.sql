-- Migration 0140 — Service Notes (SN module)
-- Per-case document tracker: every SN is a case in the Issue Tracker and
-- optionally a printable document that travels with the product (NETS / supplier).
-- Numbering: SN{YYMM}-{NN} (e.g. SN2605-01), resets monthly.

-- ─────────────────────────────────────────────────────────────────────────────
-- Monthly sequence table (atomic increment via INSERT...ON CONFLICT DO UPDATE)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE service_note_seq (
  ym      TEXT    PRIMARY KEY,     -- e.g. '2605'
  last_no INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Core SN document
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE service_notes (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sn_no            TEXT        NOT NULL UNIQUE,

  -- Customer context
  customer_name    TEXT        NOT NULL DEFAULT '',
  customer_phone   TEXT,
  ref_no           TEXT,              -- SO-1001 or custom ref
  customer_address TEXT,
  order_id         UUID        REFERENCES orders(id),

  -- Classification
  category         TEXT,              -- Sofa / Mattress / Bedframe etc.
  type             TEXT,              -- Manufacturing Defect / 100-Day Exchange / ...

  -- Dates
  request_date     DATE        NOT NULL DEFAULT CURRENT_DATE,
  deadline         DATE,
  delivered_date   DATE,

  -- Core description
  what_happened    TEXT,

  -- Sections (NULL = section not used for this case)
  -- section_a: { task, deliver_date, logistic_company, note }
  -- section_b: { task, deliver_date, supplier_name, note }
  -- section_c: { note_1, note_2 }
  section_a        JSONB,
  section_b        JSONB,
  section_c        JSONB,

  -- Photo storage paths (uploaded to service-notes bucket)
  photos           TEXT[]      NOT NULL DEFAULT '{}',

  -- Status
  status           TEXT        NOT NULL DEFAULT 'ongoing'
                               CHECK (status IN ('ongoing', 'closed')),

  -- Audit
  created_by       UUID        REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items table (one SN can have multiple product lines)
CREATE TABLE service_note_items (
  id      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  sn_id   UUID    NOT NULL REFERENCES service_notes(id) ON DELETE CASCADE,
  no      INTEGER NOT NULL,
  item    TEXT    NOT NULL DEFAULT '',
  po_no   TEXT,
  qty     INTEGER NOT NULL DEFAULT 1,
  remark  TEXT,
  UNIQUE (sn_id, no)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- next_sn_no() — atomically allocates the next SN number for current month
-- SECURITY DEFINER so it can write service_note_seq bypassing user RLS.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_sn_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yymm TEXT    := to_char(CURRENT_DATE, 'YYMM');
  seq  INTEGER;
BEGIN
  INSERT INTO service_note_seq (ym, last_no) VALUES (yymm, 1)
  ON CONFLICT (ym) DO UPDATE SET last_no = service_note_seq.last_no + 1
  RETURNING last_no INTO seq;
  RETURN 'SN' || yymm || '-' || LPAD(seq::TEXT, 2, '0');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_service_note_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER service_notes_updated_at
  BEFORE UPDATE ON service_notes
  FOR EACH ROW EXECUTE FUNCTION set_service_note_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE service_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_note_seq   ENABLE ROW LEVEL SECURITY;

-- operation + principal: full access to SN documents
CREATE POLICY sn_op_principal_all ON service_notes
  FOR ALL TO authenticated
  USING (
    (SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal')
  )
  WITH CHECK (
    (SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal')
  );

CREATE POLICY sni_op_principal_all ON service_note_items
  FOR ALL TO authenticated
  USING (
    (SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal')
  )
  WITH CHECK (
    (SELECT auth.jwt()->'app_metadata'->>'role') IN ('operation','principal')
  );

-- seq table: deny direct row access to all JWT users (only accessible via SECURITY DEFINER fn)
CREATE POLICY sn_seq_deny ON service_note_seq
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX service_notes_status_idx    ON service_notes (status);
CREATE INDEX service_notes_request_date  ON service_notes (request_date DESC);
CREATE INDEX service_notes_order_id      ON service_notes (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX service_note_items_sn_id    ON service_note_items (sn_id);
