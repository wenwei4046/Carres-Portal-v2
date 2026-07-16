-- 0226_operation_costing.sql
-- Operation Catalog (Loo 2026-07-16) — a separate operation-facing costing
-- surface (SKU Master / Modular / Fabric) where the recorded price IS the
-- buying cost, fully isolated from POS selling prices. Two DB changes:
--
--   A. product_skus.cost write access widens from principal-only to
--      operation + principal. Loo: "这个是 for operation 本身去记录买货的价钱"
--      — operation records what we PAY, so the 0175/0186/0204 lock keeps
--      price / pwp_price / prices_by_size principal-only but admits operation
--      for cost. (Live function body verified 2026-07-16 before replace —
--      it already covers prices_by_size, added by 0204.)
--
--   B. catalog_fabrics gains a nullable `cost` (RM add-on per fabric —
--      operation's per-fabric buying surcharge, the cost-side mirror of the
--      selling sofa_fabrics.surcharge). Written ONLY via a new SECURITY
--      DEFINER RPC catalog_fabrics_set_cost gated is_internal(), because the
--      table's RLS write policy stays principal-only (the principal's Fabrics
--      tab structure editor is untouched). catalog_fabrics_batch_save (the
--      principal's replace-all save) is replaced to CARRY COST FORWARD by
--      fabric_code — without this, any principal Fabrics-tab save would wipe
--      operation's recorded costs.
--
-- Additive + backward-compatible: no existing behaviour changes for
-- non-operation roles; cost stays out of the fabrics history snapshot (it is
-- operation's ledger, not part of the principal's fabric-master history).
-- Tail after this = 0226.

-- -----------------------------------------------------------------------------
-- A. Widen the SKU pricing lock: cost → operation + principal.
--    Signature + live body verified on prod 2026-07-16 (0204 variant with
--    prices_by_size). price / pwp_price / prices_by_size unchanged.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_sku_price_cost_principal_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := (select public.app_role())::text;
BEGIN
  -- Bypass for the principal (Master Admin) and for the service / admin
  -- context (NULL role = no end-user JWT: service_role, migrations, cron).
  IF v_role IS NULL OR v_role = 'principal' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Selling-side knobs stay principal-only for every other role.
    IF (NEW.price IS DISTINCT FROM OLD.price)
       OR (NEW.pwp_price IS DISTINCT FROM OLD.pwp_price)
       OR (NEW.prices_by_size IS DISTINCT FROM OLD.prices_by_size) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, pwp_price, or prices_by_size'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
    -- 0226 — cost (the buying price) is recorded by operation OR principal.
    IF (NEW.cost IS DISTINCT FROM OLD.cost) AND v_role <> 'operation' THEN
      RAISE EXCEPTION
        'Only operation or the principal can set SKU cost'
        USING ERRCODE = '42501', DETAIL = 'sku_cost_internal_only';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- Non-principal may create an UNPRICED sku; operation may seed its cost.
    IF (NEW.price IS DISTINCT FROM 0)
       OR (NEW.pwp_price IS NOT NULL)
       OR (NEW.prices_by_size IS NOT NULL) THEN
      RAISE EXCEPTION
        'Only the principal (Master Admin) can set SKU price, pwp_price, or prices_by_size'
        USING ERRCODE = '42501', DETAIL = 'sku_price_cost_principal_only';
    END IF;
    IF (NEW.cost IS NOT NULL) AND v_role <> 'operation' THEN
      RAISE EXCEPTION
        'Only operation or the principal can set SKU cost'
        USING ERRCODE = '42501', DETAIL = 'sku_cost_internal_only';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_sku_price_cost_principal_only() IS
  'Master-Admin pricing lock (0175, extended 0186/0204, relaxed 0226): price/pwp_price/prices_by_size stay principal-only; cost (buying price) is writable by operation + principal. NULL role (service_role/migrations/cron) bypasses. Touches only product_skus.';

-- -----------------------------------------------------------------------------
-- B1. catalog_fabrics.cost — operation's per-fabric buying add-on (RM).
-- -----------------------------------------------------------------------------

ALTER TABLE public.catalog_fabrics
  ADD COLUMN cost numeric(12,2);

COMMENT ON COLUMN public.catalog_fabrics.cost IS
  '0226 — operation''s recorded buying add-on (RM) for this fabric. Written only via catalog_fabrics_set_cost (internal); NOT part of the fabrics history snapshot; carried forward by fabric_code across batch saves.';

-- -----------------------------------------------------------------------------
-- B2. catalog_fabrics_set_cost — the ONLY write path for the cost column that
--     operation can reach (table RLS write stays principal-only). SECURITY
--     DEFINER + explicit is_internal() gate inside; Supabase default-grants
--     EXECUTE to authenticated/anon, so revoke the surplus grants explicitly
--     (P8c lesson: REVOKE FROM public alone does NOT make it uncallable).
-- -----------------------------------------------------------------------------

CREATE FUNCTION public.catalog_fabrics_set_cost(
  p_id   uuid,
  p_cost numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.catalog_fabrics;
BEGIN
  IF NOT (SELECT public.is_internal()) THEN
    RAISE EXCEPTION 'operation/principal only'
      USING ERRCODE = '42501', DETAIL = 'catalog_fabrics_cost_internal_only';
  END IF;
  IF p_cost IS NOT NULL AND p_cost < 0 THEN
    RAISE EXCEPTION 'cost must be a non-negative amount'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.catalog_fabrics
     SET cost       = p_cost,
         updated_at = now(),
         updated_by = (SELECT auth.uid())
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fabric not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'cost', v_row.cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.catalog_fabrics_set_cost(uuid, numeric) FROM public, anon;

COMMENT ON FUNCTION public.catalog_fabrics_set_cost(uuid, numeric) IS
  '0226 — set a fabric''s buying cost add-on. Internal (operation/principal) only; the table''s principal-only write RLS is bypassed via DEFINER for this one column.';

-- -----------------------------------------------------------------------------
-- B3. catalog_fabrics_batch_save — replace to PRESERVE cost across the
--     replace-all save (0202/0203 semantics otherwise identical; signature
--     verified on prod 2026-07-16: (p_entries jsonb, p_notes text)). Costs are
--     re-attached by fabric_code; a renamed code intentionally drops its cost
--     (same identity rule the history snapshot uses).
-- -----------------------------------------------------------------------------

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
  VALUES ('fabrics', v_snapshot, current_date,
          NULLIF(btrim(COALESCE(p_notes, '')), ''), (SELECT auth.uid()));

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'snapshot', v_snapshot);
END;
$$;
