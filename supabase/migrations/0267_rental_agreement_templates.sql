-- =============================================================================
-- 0267_rental_agreement_templates.sql (Loo 2026-07-26 — the paper the customer signs)
-- =============================================================================
-- Loo supplied the real document ("02. Rental Agreement T&C (Carress Sdn Bhd)
-- v5_260706"). Two rules he set, both honoured here:
--
--   1. The wording is printed VERBATIM. We add no clause of our own — not the
--      ownership transfer, not the buyout, not a service exception. He read the
--      gaps and decided: print it as written.
--   2. The free service package must NOT appear in the agreement — it is a
--      promotion, not a term of the rental. No `service.included` token exists.
--
-- The wording is stored as ORDERED BLOCKS (title / subtitle / h2 / p / li)
-- rather than a blob so the same rows render on screen, in the signing view and
-- in the PDF from one source. A version is immutable: replacing the wording
-- mints version+1 and an agreement keeps the version it was signed under.
--
-- Also: `rental_agreements` learns how it was signed (template + version + the
-- name/NRIC typed at signing + the signature image + the archived PDF), and a
-- PRIVATE storage bucket holds those two files.
--
-- Signing itself lands with the POS lane; this migration is the config + the
-- landing columns, and is DORMANT until then. The wording is NOT seeded by SQL:
-- the principal authors version 1 from the Rental → Agreements tab (which ships
-- Loo's v5 text pre-loaded), so what is in the table is always what a human
-- reviewed and saved.
-- =============================================================================

BEGIN;

CREATE TABLE public.rental_agreement_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- stable identity across versions ('rent_to_own', 'service_package', …)
  doc_key        text NOT NULL,
  name           text NOT NULL,
  -- which product families sign this paper (empty = none yet)
  binds_to       text[] NOT NULL DEFAULT '{}',
  version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  -- ordered blocks: [{"kind":"title|subtitle|h2|p|li","text":"…"}]
  body           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- the {{tokens}} this version uses, cached for the editor's field list
  fields         text[] NOT NULL DEFAULT '{}',
  effective_from date NOT NULL DEFAULT current_date,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid,
  UNIQUE (doc_key, version),
  CONSTRAINT rental_agreement_templates_body_array CHECK (jsonb_typeof(body) = 'array')
);

CREATE INDEX rental_agreement_templates_key_idx
  ON public.rental_agreement_templates (doc_key, version DESC);

COMMENT ON TABLE public.rental_agreement_templates IS
  'The agreement wording a rental signs (0267). Loo''s document, verbatim, as ordered blocks; a version is immutable and an agreement keeps the version it was signed under.';

-- ── how an agreement was signed ─────────────────────────────────────────────

ALTER TABLE public.rental_agreements
  ADD COLUMN template_id      uuid REFERENCES public.rental_agreement_templates(id),
  ADD COLUMN template_version integer,
  ADD COLUMN signed_at        timestamptz,
  ADD COLUMN signed_name      text,
  ADD COLUMN signed_nric      text,
  -- storage paths inside the private 'rental-agreements' bucket
  ADD COLUMN signature_path   text,
  ADD COLUMN signed_doc_path  text;

COMMENT ON COLUMN public.rental_agreements.signed_at IS
  'When the customer signed (0267). An order cannot be created without it — there is no draft agreement.';

-- ── RLS: read internal, write principal (0253 doctrine) ─────────────────────

ALTER TABLE public.rental_agreement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY rental_agreement_templates_read_internal
  ON public.rental_agreement_templates FOR SELECT
  USING ((SELECT public.is_internal()));

CREATE POLICY rental_agreement_templates_write_principal
  ON public.rental_agreement_templates FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- ── private bucket for the signature image + the archived signed PDF ────────
-- PRIVATE (unlike 0173 photos): a signed agreement carries a customer's name,
-- NRIC and signature. Reads go through signed URLs from the API.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('rental-agreements', 'rental-agreements', false, 5242880,
        ARRAY['image/png', 'image/jpeg', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS rental_agreements_internal_select ON storage.objects;
DROP POLICY IF EXISTS rental_agreements_internal_insert ON storage.objects;
DROP POLICY IF EXISTS rental_agreements_internal_update ON storage.objects;

CREATE POLICY rental_agreements_internal_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'rental-agreements' AND (select public.is_internal()));

CREATE POLICY rental_agreements_internal_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rental-agreements' AND (select public.is_internal()));

-- Deliberately NO delete policy: a signed agreement is evidence.
CREATE POLICY rental_agreements_internal_update ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'rental-agreements' AND (select public.is_internal()))
  WITH CHECK (bucket_id = 'rental-agreements' AND (select public.is_internal()));

COMMIT;
