-- 0203_fix_fabrics_batch_save_delete_where.sql
-- Bug fix (Loo 2026-07-06): saving the Fabrics tab (any tier-pill click or
-- Edit-save) failed with "DELETE requires a WHERE clause" — the DB's
-- safeupdate guard rejects the bare `DELETE FROM catalog_fabrics` inside the
-- 0202 catalog_fabrics_batch_save RPC. (The 0201 pool RPC never hit this:
-- its DELETE carries `WHERE pool = p_pool`.)
--
-- Fix: CREATE OR REPLACE with `WHERE id IS NOT NULL` — id is the PK (never
-- null), so the replace-all semantics are unchanged while the guard is
-- satisfied. Signature verified on live DB before replace:
-- catalog_fabrics_batch_save(jsonb, text). Body otherwise identical to 0202.

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
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'entries must be a json array' USING ERRCODE = '22023';
  END IF;

  -- WHERE id IS NOT NULL == all rows (id is the PK); keeps safeupdate happy.
  DELETE FROM public.catalog_fabrics WHERE id IS NOT NULL;

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
