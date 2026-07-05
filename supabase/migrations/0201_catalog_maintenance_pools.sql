-- 0201_catalog_maintenance_pools.sql
-- Catalog Maintenance + Special Add-ons parity with the 2990s Portal reference
-- (Loo, 2026-07-05 — screenshots of 2990s "Products › Maintenance" and
-- "Products › Special Add-ons" are the target layout; the DATA is ported from
-- the live 2990s DB `dolvxrchzbnqvahocwsu`, maintenance_config_history newest
-- scope='master' blob + special_addons table).
--
-- Loo's decisions (this conversation):
--   • Brandings NOT ported (Carres stays single-brand — reaffirms 0182).
--   • Sofa compartment pool topped up 15 → 27 (the 12 recliner/variant codes).
--   • History = LIGHTWEIGHT: every pool Edit-save appends a snapshot row
--     (effective_from = save date). NO future-dating / pending-change engine —
--     that 2990s feature is deliberately cut. This wakes the "versioned
--     config-history layer DEFERRED" note in 0182.
--   • Prices ported = the SELLING surcharge the 2990s POS shows (sellingPriceSen
--     ÷ 100). The 2990s internal cost benchmarks (priceSen) are NOT ported for
--     pools. (special_addons carries both selling + cost since 0181 has both.)
--
-- Contents:
--   A. catalog_option_pools: pool CHECK widened +6 pools · new `surcharge` col.
--   B. catalog_config_history — the lightweight per-section snapshot log.
--   C. catalog_pool_batch_save(p_pool, p_entries, p_notes) RPC — atomic
--      replace-pool-contents + append-snapshot (SECURITY INVOKER: RLS stays the
--      write boundary — principal only).
--   D. Seed the 8 data-carrying pools from 2990s (smart quotes normalised to ").
--   E. Baseline history snapshot per pool (History is never empty).
--   F. Seed the 13 special_addons (2990s sen → RM).
--   G. Top up sofa_compartments with the 12 missing 2990s codes (16..27).
--
-- Zero behaviour change outside the catalog admin UI: pools stay curated
-- reference lists (no order-side consumer), special_addons/compartments remain
-- dormant until models opt in. Tail after this = 0201.

-- -----------------------------------------------------------------------------
-- A. Widen the pool CHECK (constraint name verified on live DB 2026-07-05:
--    catalog_option_pools_pool_check) + add the RM surcharge column.
-- -----------------------------------------------------------------------------

ALTER TABLE public.catalog_option_pools
  DROP CONSTRAINT catalog_option_pools_pool_check;

ALTER TABLE public.catalog_option_pools
  ADD CONSTRAINT catalog_option_pools_pool_check
  CHECK (pool IN (
    'supplier_category', 'bedframe_size', 'mattress_size',
    'divan_height', 'total_height', 'gap',
    'bedframe_leg_height', 'sofa_size', 'sofa_leg_height'
  ));

-- RM selling surcharge for priced pools (divan/total/leg heights). NULL = no
-- surcharge (renders as "—"); negatives allowed (mirrors special_addons).
ALTER TABLE public.catalog_option_pools
  ADD COLUMN surcharge numeric(12,2);

-- -----------------------------------------------------------------------------
-- B. catalog_config_history — one row per pool Edit-save (append-only).
--    `snapshot` = the FULL pool content at save time, camelCase entries:
--    [{ value, label, dimensions, surcharge, active, sortOrder }].
--    Effective-from = the save date (lightweight: no future-dating).
-- -----------------------------------------------------------------------------

CREATE TABLE public.catalog_config_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section        text NOT NULL CHECK (section IN (
    'supplier_category', 'bedframe_size', 'mattress_size',
    'divan_height', 'total_height', 'gap',
    'bedframe_leg_height', 'sofa_size', 'sofa_leg_height'
  )),
  snapshot       jsonb NOT NULL,
  effective_from date NOT NULL DEFAULT current_date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- plain nullable uuid, no FK — mirrors 0176/0177/0178/0182 updated_by style
  created_by     uuid
);

CREATE INDEX catalog_config_history_section_idx
  ON public.catalog_config_history (section, effective_from DESC, created_at DESC);

ALTER TABLE public.catalog_config_history ENABLE ROW LEVEL SECURITY;

-- read by any authenticated user (the History dialog is internal-facing)
CREATE POLICY catalog_config_history_read_all
  ON public.catalog_config_history
  FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- write by principal only — InitPlan-wrapped is_principal() (§8 compliant)
CREATE POLICY catalog_config_history_write_principal
  ON public.catalog_config_history
  FOR ALL
  USING      ((SELECT public.is_principal()))
  WITH CHECK ((SELECT public.is_principal()));

-- -----------------------------------------------------------------------------
-- C. catalog_pool_batch_save — atomic "replace this pool's contents + append a
--    history snapshot". SECURITY INVOKER so the caller's RLS applies: only the
--    principal passes catalog_option_pools_write_principal +
--    catalog_config_history_write_principal. Array order = display order
--    (sort_order is re-minted from ordinality; client sortOrder is ignored).
-- -----------------------------------------------------------------------------

CREATE FUNCTION public.catalog_pool_batch_save(
  p_pool    text,
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
  IF p_pool NOT IN (
    'supplier_category', 'bedframe_size', 'mattress_size',
    'divan_height', 'total_height', 'gap',
    'bedframe_leg_height', 'sofa_size', 'sofa_leg_height'
  ) THEN
    RAISE EXCEPTION 'unknown pool %', p_pool USING ERRCODE = '22023';
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'entries must be a json array' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.catalog_option_pools WHERE pool = p_pool;

  INSERT INTO public.catalog_option_pools
    (pool, value, label, dimensions, surcharge, active, sort_order, updated_at, updated_by)
  SELECT
    p_pool,
    btrim(e.elem->>'value'),
    NULLIF(btrim(COALESCE(e.elem->>'label', '')), ''),
    NULLIF(btrim(COALESCE(e.elem->>'dimensions', '')), ''),
    CASE WHEN jsonb_typeof(e.elem->'surcharge') = 'number'
         THEN (e.elem->>'surcharge')::numeric
         ELSE NULL END,
    COALESCE((e.elem->>'active')::boolean, true),
    e.ord,
    now(),
    (SELECT auth.uid())
  FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS e(elem, ord)
  WHERE COALESCE(btrim(e.elem->>'value'), '') <> '';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'value', value, 'label', label, 'dimensions', dimensions,
               'surcharge', surcharge, 'active', active, 'sortOrder', sort_order
             ) ORDER BY sort_order
           ),
           '[]'::jsonb)
    INTO v_snapshot
    FROM public.catalog_option_pools
   WHERE pool = p_pool;

  INSERT INTO public.catalog_config_history (section, snapshot, effective_from, notes, created_by)
  VALUES (p_pool, v_snapshot, current_date,
          NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid()));

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'snapshot', v_snapshot);
END;
$$;

-- -----------------------------------------------------------------------------
-- D. Seed the pools from the live 2990s master config (2026-07-05 read).
--    Smart quotes in the 2990s data (11”, 12“, 17“ …) normalised to straight ".
--    supplier_category stays EMPTY — 2990s has none either (sidebar shows (0)).
-- -----------------------------------------------------------------------------

-- Bedframe + mattress sizes — value · label · dimensions (identical lists).
INSERT INTO public.catalog_option_pools (pool, value, label, dimensions, sort_order) VALUES
  ('bedframe_size', 'K',  '6FT',       '183X190CM', 1),
  ('bedframe_size', 'Q',  '5FT',       '152X190CM', 2),
  ('bedframe_size', 'S',  '3FT',       '90X190CM',  3),
  ('bedframe_size', 'SS', '3.5FT',     '107X190CM', 4),
  ('bedframe_size', 'SK', '200X200CM', '200X200CM', 5),
  ('mattress_size', 'K',  '6FT',       '183X190CM', 1),
  ('mattress_size', 'Q',  '5FT',       '152X190CM', 2),
  ('mattress_size', 'S',  '3FT',       '90X190CM',  3),
  ('mattress_size', 'SS', '3.5FT',     '107X190CM', 4),
  ('mattress_size', 'SK', '200X200CM', '200X200CM', 5)
ON CONFLICT (pool, value) DO NOTHING;

-- Divan heights — the 2990s POS selling surcharges (12500/25000/37500/50000 sen).
INSERT INTO public.catalog_option_pools (pool, value, surcharge, sort_order) VALUES
  ('divan_height', '4"',  NULL,   1),
  ('divan_height', '5"',  NULL,   2),
  ('divan_height', '6"',  NULL,   3),
  ('divan_height', '8"',  NULL,   4),
  ('divan_height', '10"', 125.00, 5),
  ('divan_height', '11"', NULL,   6),
  ('divan_height', '12"', 250.00, 7),
  ('divan_height', '13"', NULL,   8),
  ('divan_height', '14"', 375.00, 9),
  ('divan_height', '16"', 500.00, 10)
ON CONFLICT (pool, value) DO NOTHING;

-- Total heights — 16 options; 2990s carries no selling surcharge on any.
INSERT INTO public.catalog_option_pools (pool, value, sort_order) VALUES
  ('total_height', '10"', 1),  ('total_height', '12"', 2),
  ('total_height', '14"', 3),  ('total_height', '16"', 4),
  ('total_height', '17"', 5),  ('total_height', '18"', 6),
  ('total_height', '19"', 7),  ('total_height', '20"', 8),
  ('total_height', '21"', 9),  ('total_height', '22"', 10),
  ('total_height', '23"', 11), ('total_height', '24"', 12),
  ('total_height', '25"', 13), ('total_height', '26"', 14),
  ('total_height', '27"', 15), ('total_height', '28"', 16)
ON CONFLICT (pool, value) DO NOTHING;

-- Gaps — 18 plain options (no pricing on gaps).
INSERT INTO public.catalog_option_pools (pool, value, sort_order) VALUES
  ('gap', '4"',  1),  ('gap', '5"',  2),  ('gap', '6"',  3),
  ('gap', '7"',  4),  ('gap', '8"',  5),  ('gap', '9"',  6),
  ('gap', '10"', 7),  ('gap', '11"', 8),  ('gap', '12"', 9),
  ('gap', '13"', 10), ('gap', '14"', 11), ('gap', '15"', 12),
  ('gap', '16"', 13), ('gap', '17"', 14), ('gap', '18"', 15),
  ('gap', '19"', 16), ('gap', '20"', 17), ('gap', '21"', 18)
ON CONFLICT (pool, value) DO NOTHING;

-- Bedframe leg heights — 6 options; 2990s shows no selling surcharge (its 7"
-- RM160 figure is a cost benchmark, deliberately not ported).
INSERT INTO public.catalog_option_pools (pool, value, sort_order) VALUES
  ('bedframe_leg_height', 'No Leg', 1),
  ('bedframe_leg_height', '1"',     2),
  ('bedframe_leg_height', '2"',     3),
  ('bedframe_leg_height', '4"',     4),
  ('bedframe_leg_height', '6"',     5),
  ('bedframe_leg_height', '7"',     6)
ON CONFLICT (pool, value) DO NOTHING;

-- Sofa sizes — 8 options (2990s order).
INSERT INTO public.catalog_option_pools (pool, value, sort_order) VALUES
  ('sofa_size', '24',   1), ('sofa_size', '26',   2),
  ('sofa_size', '28',   3), ('sofa_size', '30',   4),
  ('sofa_size', '32',   5), ('sofa_size', '35',   6),
  ('sofa_size', '37',   7), ('sofa_size', 'Flat', 8)
ON CONFLICT (pool, value) DO NOTHING;

-- Sofa leg heights — 6 options (2990s display order preserved).
INSERT INTO public.catalog_option_pools (pool, value, sort_order) VALUES
  ('sofa_leg_height', 'No Leg',         1),
  ('sofa_leg_height', '4"',             2),
  ('sofa_leg_height', '6"',             3),
  ('sofa_leg_height', '1"',             4),
  ('sofa_leg_height', 'Iron Metal Leg', 5),
  ('sofa_leg_height', '2"',             6)
ON CONFLICT (pool, value) DO NOTHING;

-- -----------------------------------------------------------------------------
-- E. Baseline history snapshot per pool so "Effective from" + History are live
--    from day 1. Guarded: skipped for any section that already has history.
-- -----------------------------------------------------------------------------

INSERT INTO public.catalog_config_history (section, snapshot, effective_from, notes)
SELECT p.pool,
       COALESCE(
         jsonb_agg(
           jsonb_build_object(
             'value', cop.value, 'label', cop.label, 'dimensions', cop.dimensions,
             'surcharge', cop.surcharge, 'active', cop.active, 'sortOrder', cop.sort_order
           ) ORDER BY cop.sort_order
         ) FILTER (WHERE cop.id IS NOT NULL),
         '[]'::jsonb),
       current_date,
       'Baseline — ported from 2990s Portal (0201)'
FROM unnest(ARRAY[
       'supplier_category', 'bedframe_size', 'mattress_size',
       'divan_height', 'total_height', 'gap',
       'bedframe_leg_height', 'sofa_size', 'sofa_leg_height'
     ]) AS p(pool)
LEFT JOIN public.catalog_option_pools cop ON cop.pool = p.pool
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_config_history h WHERE h.section = p.pool
)
GROUP BY p.pool;

-- -----------------------------------------------------------------------------
-- F. Seed the 13 special_addons from the live 2990s table (sen ÷ 100 → RM;
--    categories mapped to Carres lowercase product_category values).
-- -----------------------------------------------------------------------------

INSERT INTO public.special_addons
  (code, label, so_description, categories, selling_price, cost, sort_order) VALUES
  ('Hydraulic',          'Hydraulic',          'Hydraulic',                        '{bedframe}', 0,      0,    0),
  ('Divan Fully Cover',  'Divan Fully Cover',  'Divan Fully Cover (top and bottom)', '{bedframe}', 125.00, 0,    0),
  ('Sofa Full Fabric',   'Sofa Full Fabric',   'Sofa Full Fabric',                 '{sofa}',     0,      0,    0),
  ('HB Fully Cover',     'HB Fully Cover',     'HB Fully Cover',                   '{bedframe}', 125.00, 50.00, 1),
  ('Divan Full Cover',   'Divan Full Cover',   '',                                 '{bedframe}', 125.00, 80.00, 3),
  ('Left Drawer',        'Left Drawer',        'Left Drawer ( 2 Drawers )',        '{bedframe}', 250.00, 160.00, 4),
  ('Right Drawer',       'Right Drawer',       'Right Drawer (2 Drawers)',         '{bedframe}', 250.00, 160.00, 5),
  ('Front Drawer',       'Front Drawer',       'Front Drawer ( 2 Drawers )',       '{bedframe}', 250.00, 130.00, 6),
  ('HB Straight',        'HB Straight',        '',                                 '{bedframe}', 0,      0,    7),
  ('Divan Curve',        'Divan Curve',        '',                                 '{bedframe}', 0,      50.00, 9),
  ('No Side Panel',      'No Side Panel',      'Bedframe no side panel',           '{bedframe}', 0,      -40.00, 10),
  ('Headboard Only',     'Headboard Only',     '',                                 '{bedframe}', 0,      0,    11),
  ('Separate Backrest Packing', 'Separate Backrest Packing', '',                   '{sofa}',     0,      0,    1001)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- G. Top up sofa_compartments 15 → 27 (Loo 2026-07-05: match the 2990s pool).
--    Descriptions use the 2990s canonical wording (COMPARTMENT_DESCRIPTION_
--    OVERRIDE + sofaCompartmentMeta). default_price 0 — 2990s carries no pool
--    price for these; per-model overrides price them when offered. No SKUs are
--    minted here: syncCompartmentSku runs only when a compartment is OFFERED on
--    a model (PUT /models/:id/compartments/:compartmentId), not at pool-create.
-- -----------------------------------------------------------------------------

INSERT INTO public.sofa_compartments
  (code, description, seat_count, arm_config, default_price, sort_order) VALUES
  ('1S',         '1 seat, arms on BOTH sides',                          1, 'both',      0, 16),
  ('1S(P)',      '1 seat, arms on BOTH sides — Power Recliner (electric)', 1, 'both',   0, 17),
  ('1S(R)',      '1 seat, arms on BOTH sides — Manual Recliner',        1, 'both',      0, 18),
  ('1NA(P)',     '1 seat, NO arms — Power Recliner (electric)',         1, 'none',      0, 19),
  ('1NA(R)',     '1 seat, NO arms — Manual Recliner',                   1, 'none',      0, 20),
  ('1A(P)(LHF)', '1 seat + ONE arm (left) — Power Recliner (electric)', 1, 'left',      0, 21),
  ('1A(P)(RHF)', '1 seat + ONE arm (right) — Power Recliner (electric)', 1, 'right',    0, 22),
  ('1A(R)(LHF)', '1 seat + ONE arm (left) — Manual Recliner',           1, 'left',      0, 23),
  ('1A(R)(RHF)', '1 seat + ONE arm (right) — Manual Recliner',          1, 'right',     0, 24),
  ('2S',         '2 seats, arms on BOTH sides',                         2, 'both',      0, 25),
  ('3S',         '3 seats, arms on BOTH sides',                         3, 'both',      0, 26),
  ('HEADREST',   'Sofa headrest',                                       0, 'accessory', 0, 27)
ON CONFLICT (code) DO NOTHING;
