-- 0202_catalog_fabrics.sql
-- Fabrics tab (2990s Products parity — Loo 2026-07-06, screenshot of the 2990s
-- "Products › Fabrics" tab is the target). The 2990s source of truth is its
-- `fabric_trackings` table (cost/procurement fabric catalog); this ports the
-- DISPLAYED columns only — the 2990s SOH / usage / shortage `*_centi` metric
-- columns are static seed snapshots with no live aggregation there, so they are
-- deliberately NOT ported. The 2990s legacy single `price_tier` fallback column
-- is also dropped (Carres starts clean on the split sofa/bedframe tiers).
--
-- Two 2990s concepts, one tab:
--   • "Fabrics"        → THIS table (catalog_fabrics) — procurement fabric
--     master: code · series (collection name) · description · supplier code ·
--     sofa tier · bedframe tier · active. Read-only reference; NO order-side
--     consumer (the SELLING fabric path stays per-model sofa_fabrics + the 0176
--     tier deltas — deliberately independent, mirroring 2990s migration 0124).
--   • "Fabric Pricing" → already exists in Carres (0176 fabric_tier_addon_config
--     + model overrides); the web tab just surfaces that editor alongside.
--
-- History: rides the 0201 catalog_config_history log (section widened with
-- 'fabrics') via an 0201-style atomic batch-save RPC. Lightweight — effective
-- from = save date, no future-dating (same cut as 0201).
--
-- Seed = the LIVE 2990s DB fabric_trackings content read 2026-07-06 (56 rows:
-- BF-01..18 · CG-001..016 · D-001..008 · EZ-001..012 · 2 Velvet Interlace).
-- All series are NULL in the live source (the "+ Add series" chip fills them).
-- Tail after this = 0202.

-- -----------------------------------------------------------------------------
-- A. catalog_fabrics — the global procurement fabric master.
-- -----------------------------------------------------------------------------

CREATE TABLE public.catalog_fabrics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fabric_code   text NOT NULL UNIQUE,
  -- free-text collection name (2990s migration 0063), e.g. "KOONA VELVET H2O"
  series        text,
  description   text,
  supplier_code text,
  -- split per-context tiers (2990s migration 0040): sofa covers SOFA+ACCESSORY,
  -- bedframe covers BEDFRAME. PRICE_2 default mirrors the 2990s New-Fabric form.
  sofa_tier     text NOT NULL DEFAULT 'PRICE_2'
                CHECK (sofa_tier IN ('PRICE_1', 'PRICE_2', 'PRICE_3')),
  bedframe_tier text NOT NULL DEFAULT 'PRICE_2'
                CHECK (bedframe_tier IN ('PRICE_1', 'PRICE_2', 'PRICE_3')),
  active        boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- plain nullable uuid, no FK — mirrors 0176/0182/0201 updated_by style
  updated_by    uuid
);

CREATE INDEX catalog_fabrics_sort_idx
  ON public.catalog_fabrics (sort_order, fabric_code);

ALTER TABLE public.catalog_fabrics ENABLE ROW LEVEL SECURITY;

-- read by any authenticated user (internal reference list)
CREATE POLICY catalog_fabrics_read_all
  ON public.catalog_fabrics
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- write by principal only — InitPlan-wrapped is_principal() (§8 compliant)
CREATE POLICY catalog_fabrics_write_principal
  ON public.catalog_fabrics
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- -----------------------------------------------------------------------------
-- B. Widen the 0201 history section CHECK with 'fabrics' (constraint name
--    verified on live DB 2026-07-06: catalog_config_history_section_check).
-- -----------------------------------------------------------------------------

ALTER TABLE public.catalog_config_history
  DROP CONSTRAINT catalog_config_history_section_check;

ALTER TABLE public.catalog_config_history
  ADD CONSTRAINT catalog_config_history_section_check
  CHECK (section IN (
    'supplier_category', 'bedframe_size', 'mattress_size',
    'divan_height', 'total_height', 'gap',
    'bedframe_leg_height', 'sofa_size', 'sofa_leg_height',
    'fabrics'
  ));

-- -----------------------------------------------------------------------------
-- C. catalog_fabrics_batch_save — atomic "replace the fabric master + append a
--    history snapshot" (0201 catalog_pool_batch_save pattern). SECURITY INVOKER
--    so the caller's RLS applies: only the principal passes
--    catalog_fabrics_write_principal + catalog_config_history_write_principal.
--    Array order = display order (sort_order re-minted from ordinality).
--    Snapshot entries are camelCase, matching the shared zod schema.
-- -----------------------------------------------------------------------------

CREATE FUNCTION public.catalog_fabrics_batch_save(
  p_entries jsonb,
  p_notes   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_count    integer;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'entries must be a json array' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.catalog_fabrics;

  INSERT INTO public.catalog_fabrics
    (fabric_code, series, description, supplier_code,
     sofa_tier, bedframe_tier, active, sort_order, updated_at, updated_by)
  SELECT
    btrim(e.elem->>'fabricCode'),
    NULLIF(btrim(COALESCE(e.elem->>'series', '')), ''),
    NULLIF(btrim(COALESCE(e.elem->>'description', '')), ''),
    NULLIF(btrim(COALESCE(e.elem->>'supplierCode', '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(e.elem->>'sofaTier', '')), ''), 'PRICE_2'),
    COALESCE(NULLIF(btrim(COALESCE(e.elem->>'bedframeTier', '')), ''), 'PRICE_2'),
    COALESCE((e.elem->>'active')::boolean, true),
    e.ord,
    now(),
    (SELECT auth.uid())
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS e(elem, ord)
  WHERE COALESCE(btrim(e.elem->>'fabricCode'), '') <> '';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'fabricCode', fabric_code, 'series', series,
               'description', description, 'supplierCode', supplier_code,
               'sofaTier', sofa_tier, 'bedframeTier', bedframe_tier,
               'active', active, 'sortOrder', sort_order
             ) ORDER BY sort_order
           ),
           '[]'::jsonb)
    INTO v_snapshot
    FROM public.catalog_fabrics;

  INSERT INTO public.catalog_config_history (section, snapshot, effective_from, notes, created_by)
  VALUES ('fabrics', v_snapshot, current_date,
          NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid()));

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'snapshot', v_snapshot);
END;
$$;

-- -----------------------------------------------------------------------------
-- D. Seed — the 56 live 2990s rows (read 2026-07-06 from fabric_trackings on
--    dolvxrchzbnqvahocwsu). sort_order = the live display order (code asc).
--    BF-15 is the one inactive row (sofa PRICE_1 / bedframe PRICE_2 / OFF).
-- -----------------------------------------------------------------------------

INSERT INTO public.catalog_fabrics
  (fabric_code, description, supplier_code, sofa_tier, bedframe_tier, active, sort_order) VALUES
  ('BF-01', 'BF-01', 'PC151-01', 'PRICE_2', 'PRICE_2', true,  1),
  ('BF-02', 'BF-02', 'PC151-02', 'PRICE_2', 'PRICE_2', true,  2),
  ('BF-03', 'BF-03', 'PC151-03', 'PRICE_2', 'PRICE_2', true,  3),
  ('BF-04', 'BF-04', 'PC151-04', 'PRICE_2', 'PRICE_2', true,  4),
  ('BF-05', 'BF-05', 'PC151-05', 'PRICE_2', 'PRICE_2', true,  5),
  ('BF-06', 'BF-06', 'PC151-06', 'PRICE_2', 'PRICE_2', true,  6),
  ('BF-07', 'BF-07', 'PC151-07', 'PRICE_2', 'PRICE_2', true,  7),
  ('BF-08', 'BF-08', 'PC151-08', 'PRICE_2', 'PRICE_2', true,  8),
  ('BF-09', 'BF-09', 'PC151-09', 'PRICE_2', 'PRICE_2', true,  9),
  ('BF-10', 'BF-10', 'PC151-10', 'PRICE_2', 'PRICE_2', true, 10),
  ('BF-11', 'BF-11', 'PC151-11', 'PRICE_2', 'PRICE_2', true, 11),
  ('BF-12', 'BF-12', 'PC151-12', 'PRICE_2', 'PRICE_2', true, 12),
  ('BF-13', 'BF-13', 'PC151-13', 'PRICE_2', 'PRICE_2', true, 13),
  ('BF-14', 'BF-14', 'PC151-14', 'PRICE_2', 'PRICE_2', true, 14),
  ('BF-15', 'BF-15', 'PC151-15', 'PRICE_1', 'PRICE_2', false, 15),
  ('BF-16', 'BF-16', 'PC151-16', 'PRICE_2', 'PRICE_2', true, 16),
  ('BF-17', 'BF-17', 'PC151-17', 'PRICE_2', 'PRICE_2', true, 17),
  ('BF-18', 'BF-18', 'PC151-18', 'PRICE_2', 'PRICE_2', true, 18),
  ('CG-001', 'CG-001 Pearl',      'KN390-1',  'PRICE_2', 'PRICE_2', true, 19),
  ('CG-002', 'CG-002 Sand',       'KN390-2',  'PRICE_2', 'PRICE_2', true, 20),
  ('CG-003', 'CG-003 Fossil',     'KN390-3',  'PRICE_2', 'PRICE_2', true, 21),
  ('CG-004', 'CG-004 Wood',       'KN390-4',  'PRICE_2', 'PRICE_2', true, 22),
  ('CG-005', 'CG-005 Silver',     'KN390-13', 'PRICE_2', 'PRICE_2', true, 23),
  ('CG-006', 'CG-006 Metal',      'KN390-14', 'PRICE_2', 'PRICE_2', true, 24),
  ('CG-007', 'CG-007 Deep Grey',  'KN390-15', 'PRICE_2', 'PRICE_2', true, 25),
  ('CG-008', 'CG-008 Charcoal',   'KN390-16', 'PRICE_2', 'PRICE_2', true, 26),
  ('CG-009', 'CG-009 Tan',        'KN390-5',  'PRICE_2', 'PRICE_2', true, 27),
  ('CG-010', 'CG-010 Gold',       'KN390-6',  'PRICE_2', 'PRICE_2', true, 28),
  ('CG-011', 'CG-011 Peach',      'KN390-7',  'PRICE_2', 'PRICE_2', true, 29),
  ('CG-012', 'CG-012 Maroon',     'KN390-8',  'PRICE_2', 'PRICE_2', true, 30),
  ('CG-013', 'CG-013 Sky',        'KN390-9',  'PRICE_2', 'PRICE_2', true, 31),
  ('CG-014', 'CG-014 Sea',        'KN390-10', 'PRICE_2', 'PRICE_2', true, 32),
  ('CG-015', 'CG-015 Mint',       'KN390-11', 'PRICE_2', 'PRICE_2', true, 33),
  ('CG-016', 'CG-016 Forest',     'KN390-12', 'PRICE_2', 'PRICE_2', true, 34),
  ('D-001', 'D-001 Pearl',        'GD2502-13', 'PRICE_2', 'PRICE_2', true, 35),
  ('D-002', 'D-002 Wheat',        'GD2502-11', 'PRICE_2', 'PRICE_2', true, 36),
  ('D-003', 'D-003 Sandy',        'GD2502-09', 'PRICE_2', 'PRICE_2', true, 37),
  ('D-004', 'D-004 Oak',          'GD2502-04', 'PRICE_2', 'PRICE_2', true, 38),
  ('D-005', 'D-005 Silver',       'GD2502-14', 'PRICE_2', 'PRICE_2', true, 39),
  ('D-006', 'D-006 Grey',         'GD2502-18', 'PRICE_2', 'PRICE_2', true, 40),
  ('D-007', 'D-007 Dark Grey',    'GD2502-20', 'PRICE_2', 'PRICE_2', true, 41),
  ('D-008', 'D-008 Ink',          'GD2502-22', 'PRICE_2', 'PRICE_2', true, 42),
  ('EZ-001', 'EZ-001 Pearl',      'M2402-1',  'PRICE_2', 'PRICE_2', true, 43),
  ('EZ-002', 'EZ-002 Sand',       'M2402-4',  'PRICE_2', 'PRICE_2', true, 44),
  ('EZ-003', 'EZ-003 Light Brown', 'M2402-5', 'PRICE_2', 'PRICE_2', true, 45),
  ('EZ-004', 'EZ-004 Fossil',     'M2402-6',  'PRICE_2', 'PRICE_2', true, 46),
  ('EZ-005', 'EZ-005 Dark Brown', 'M2402-7',  'PRICE_2', 'PRICE_2', true, 47),
  ('EZ-006', 'EZ-006 Yellow',     'M2402-8',  'PRICE_2', 'PRICE_2', true, 48),
  ('EZ-007', 'EZ-007 Tan',        'M2402-9',  'PRICE_2', 'PRICE_2', true, 49),
  ('EZ-008', 'EZ-008 Forest',     'M2402-13', 'PRICE_2', 'PRICE_2', true, 50),
  ('EZ-009', 'EZ-009 Aqua',       'M2402-15', 'PRICE_2', 'PRICE_2', true, 51),
  ('EZ-010', 'EZ-010 Silver',     'M2402-17', 'PRICE_2', 'PRICE_2', true, 52),
  ('EZ-011', 'EZ-011 Light Grey', 'M2402-18', 'PRICE_2', 'PRICE_2', true, 53),
  ('EZ-012', 'EZ-012 Dark Grey',  'M2402-19', 'PRICE_2', 'PRICE_2', true, 54),
  ('Velvet Interlace - Bronze', 'Velvet Interlace - Bronze', 'Velvet Interlace - Bronze', 'PRICE_1', 'PRICE_1', true, 55),
  ('Velvet Interlace - Olive',  'Velvet Interlace - Olive',  'Velvet Interlace - Olive',  'PRICE_1', 'PRICE_1', true, 56)
ON CONFLICT (fabric_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- E. Baseline history snapshot so "Effective from" + History are live from
--    day 1 (0201 pattern). Guarded: skipped if 'fabrics' history already exists.
-- -----------------------------------------------------------------------------

INSERT INTO public.catalog_config_history (section, snapshot, effective_from, notes)
SELECT 'fabrics',
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'fabricCode', f.fabric_code, 'series', f.series,
             'description', f.description, 'supplierCode', f.supplier_code,
             'sofaTier', f.sofa_tier, 'bedframeTier', f.bedframe_tier,
             'active', f.active, 'sortOrder', f.sort_order
           ) ORDER BY f.sort_order
         ),
         '[]'::jsonb),
       current_date,
       'Baseline — ported from the live 2990s fabric_trackings (0202)'
FROM public.catalog_fabrics f
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_config_history h WHERE h.section = 'fabrics'
);
