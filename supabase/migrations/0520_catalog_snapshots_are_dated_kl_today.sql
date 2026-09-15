-- 0520 — catalog snapshots are dated with today in Kuala Lumpur.
--
-- catalog_pool_batch_save (0201) and catalog_fabrics_batch_save (0202,
-- 0203, 0226) append a row to catalog_config_history dated current_date —
-- the database clock's day, which is UTC on Supabase. A save between 00:00
-- and 08:00 KL was dated yesterday. 0519 changes the column's default; these
-- two pass the date explicitly, so the default never applied to them.
--
-- Both bodies replayed as they are on main with only that one value changed
-- to (timezone('Asia/Kuala_Lumpur', now()))::date. Same signatures, same SECURITY INVOKER, same search_path; no
-- grants to carry (neither function ever had a revoke or grant). Existing
-- history rows are not touched.

-- 1. Option pools (0201:103-166)
CREATE OR REPLACE FUNCTION public.catalog_pool_batch_save(
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
  VALUES (p_pool, v_snapshot, (timezone('Asia/Kuala_Lumpur', now()))::date,  -- 0520: KL today
          NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid()));

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'snapshot', v_snapshot);
END;
$$;

-- 2. Fabrics (0226:153-218)
CREATE OR REPLACE FUNCTION public.catalog_fabrics_batch_save(
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
  v_costs    jsonb;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'entries must be a json array' USING ERRCODE = '22023';
  END IF;

  -- 0226 — capture operation's recorded costs before the replace-all delete.
  SELECT COALESCE(jsonb_object_agg(fabric_code, cost), '{}'::jsonb)
    INTO v_costs
    FROM public.catalog_fabrics
   WHERE cost IS NOT NULL;

  -- WHERE id IS NOT NULL == all rows (id is the PK); keeps safeupdate happy.
  DELETE FROM public.catalog_fabrics WHERE id IS NOT NULL;

  INSERT INTO public.catalog_fabrics
    (fabric_code, series, description, supplier_code,
     sofa_tier, bedframe_tier, active, sort_order, cost, updated_at, updated_by)
  SELECT
    btrim(e.elem->>'fabricCode'),
    NULLIF(btrim(COALESCE(e.elem->>'series', '')), ''),
    NULLIF(btrim(COALESCE(e.elem->>'description', '')), ''),
    NULLIF(btrim(COALESCE(e.elem->>'supplierCode', '')), ''),
    COALESCE(NULLIF(btrim(COALESCE(e.elem->>'sofaTier', '')), ''), 'PRICE_2'),
    COALESCE(NULLIF(btrim(COALESCE(e.elem->>'bedframeTier', '')), ''), 'PRICE_2'),
    COALESCE((e.elem->>'active')::boolean, true),
    e.ord,
    (v_costs->>btrim(e.elem->>'fabricCode'))::numeric,
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
  VALUES ('fabrics', v_snapshot, (timezone('Asia/Kuala_Lumpur', now()))::date,  -- 0520: KL today
          NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid()));

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'snapshot', v_snapshot);
END;
$$;
