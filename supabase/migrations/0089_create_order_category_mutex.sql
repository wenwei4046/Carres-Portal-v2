-- =============================================================================
-- 0089_create_order_category_mutex.sql (Loo 2026-05-11)
-- =============================================================================
-- Business rule: a Sales Order cannot mix sofa with mattress / bedframe
-- lines. Sofa stays on its own; mattress + bedframe can co-exist with each
-- other but not with sofa. Reason: dispatch + delivery logistics for sofa
-- (custom fabric, longer lead time, fragile freight) are different enough
-- that splitting at the order level is cleaner than per-line workarounds.
--
-- Enforced at the RPC layer so direct API hits / scripts / postman can't
-- bypass the wizard UI gate. Defense-in-depth (CLAUDE.md §9 + §14): the
-- web ProductPicker disables conflicting category tabs based on draft
-- contents; this RPC is the second wall.
--
-- Legacy orders that already mix categories stay untouched (Loo signed off
-- on grandfathering in-conversation 2026-05-11). The rule only fires at
-- create time.
--
-- Function recreated with CREATE OR REPLACE — same signature (jsonb).
-- Body is verbatim from migration 0007 EXCEPT for the new mutex check
-- inserted between the "lines must exist" guard and the line loop.
--
-- Authorized in conversation 2026-05-11 per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dealer_id          uuid;
  v_role               app_role;
  v_caller_dealer_id   uuid;
  v_order_id           uuid;
  v_dl                 int;
  v_placed_at          timestamptz;
  v_deposit_pct        int;
  v_line               jsonb;
  v_addon              jsonb;
  v_method             text;
  v_installment_months int;
  v_has_sofa           boolean;
  v_has_other          boolean;
BEGIN
  v_dealer_id := (payload->>'dealer_id')::uuid;
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  IF v_role NOT IN ('principal','logistics','finance','bd')
     AND v_dealer_id IS DISTINCT FROM v_caller_dealer_id THEN
    RAISE EXCEPTION 'forbidden: cross-dealer insert' USING ERRCODE = '42501';
  END IF;

  IF v_dealer_id IS NULL THEN
    RAISE EXCEPTION 'dealer_id is required' USING ERRCODE = '22023';
  END IF;

  v_method := nullif(payload->>'payment_method', '');
  IF v_method IS NOT NULL AND v_method NOT IN ('online','credit','installment') THEN
    RAISE EXCEPTION 'payment_method must be one of online/credit/installment' USING ERRCODE = '22023';
  END IF;

  v_installment_months := nullif(payload->>'installment_months', '')::int;
  IF v_installment_months IS NOT NULL AND v_installment_months NOT IN (6, 12) THEN
    RAISE EXCEPTION 'installment_months must be 6 or 12' USING ERRCODE = '22023';
  END IF;
  IF v_method = 'installment' AND v_installment_months IS NULL THEN
    RAISE EXCEPTION 'installment_months is required when payment_method = installment' USING ERRCODE = '22023';
  END IF;
  IF v_method <> 'installment' AND v_installment_months IS NOT NULL THEN
    RAISE EXCEPTION 'installment_months only valid when payment_method = installment' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(coalesce(payload->'lines', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'order must have at least one line' USING ERRCODE = '22023';
  END IF;

  -- ------------------------------------------------------------------------
  -- Category mutex (0089 — Loo 2026-05-11): sofa cannot mix with
  -- mattress / bedframe. Each side runs a single EXISTS subquery joining
  -- payload.lines.sku → product_skus.sku → product_models.category. Unknown
  -- SKUs (not in catalog) drop out of the join silently — order_lines
  -- accepts free-form text SKUs so we don't double-validate here; the rule
  -- is "if you reference cataloged SKUs, they can't span both buckets."
  -- ------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(payload->'lines') AS line
      JOIN product_skus s  ON s.sku = line->>'sku'
      JOIN product_models pm ON pm.id = s.model_id
     WHERE pm.category = 'sofa'
  ) INTO v_has_sofa;

  SELECT EXISTS (
    SELECT 1
      FROM jsonb_array_elements(payload->'lines') AS line
      JOIN product_skus s  ON s.sku = line->>'sku'
      JOIN product_models pm ON pm.id = s.model_id
     WHERE pm.category IN ('mattress','bedframe')
  ) INTO v_has_other;

  IF v_has_sofa AND v_has_other THEN
    RAISE EXCEPTION 'sofa cannot mix with mattress or bedframe in the same order'
      USING ERRCODE = '22023', DETAIL = 'mixed_category_lines';
  END IF;

  INSERT INTO orders (
    dealer_id,
    outlet_id,
    salesperson_id,
    customer_name,
    customer_phone,
    customer_address,
    customer_address_unknown,
    customer_billing,
    customer_billing_same,
    customer_emergency,
    delivery_date,
    delivery_date_tbd,
    delivery_floor,
    delivery_has_lift,
    paid,
    signature_url,
    payment_slip_url,
    terms_accepted,
    payment_method,
    approval_code,
    installment_months
  ) VALUES (
    v_dealer_id,
    nullif(payload->>'outlet_id', '')::uuid,
    nullif(payload->>'salesperson_id', '')::uuid,
    payload->>'customer_name',
    nullif(payload->>'customer_phone', ''),
    nullif(payload->>'customer_address', ''),
    coalesce((payload->>'customer_address_unknown')::boolean, false),
    nullif(payload->>'customer_billing', ''),
    coalesce((payload->>'customer_billing_same')::boolean, true),
    nullif(payload->>'customer_emergency', ''),
    nullif(payload->>'delivery_date', '')::date,
    coalesce((payload->>'delivery_date_tbd')::boolean, false),
    coalesce((payload->>'delivery_floor')::int, 1),
    coalesce((payload->>'delivery_has_lift')::boolean, false),
    coalesce((payload->>'paid')::numeric, 0),
    payload->>'signature_url',
    nullif(payload->>'payment_slip_url', ''),
    coalesce((payload->>'terms_accepted')::boolean, false),
    v_method,
    nullif(payload->>'approval_code', ''),
    v_installment_months
  )
  RETURNING id, dl, placed_at INTO v_order_id, v_dl, v_placed_at;

  FOR v_line IN SELECT * FROM jsonb_array_elements(payload->'lines') LOOP
    INSERT INTO order_lines (order_id, sku, qty, attrs, unit_price)
    VALUES (
      v_order_id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
  END LOOP;

  IF payload ? 'addons' THEN
    FOR v_addon IN SELECT * FROM jsonb_array_elements(payload->'addons') LOOP
      INSERT INTO order_addons (order_id, addon_key, qty, unit_price)
      VALUES (
        v_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric
      );
    END LOOP;
  END IF;

  v_deposit_pct := coalesce((payload->>'deposit_pct')::int, 0);
  INSERT INTO order_history (order_id, text, by_role)
  VALUES (
    v_order_id,
    CASE
      WHEN v_method IS NULL THEN format('Order created · %s%% deposit', v_deposit_pct)
      WHEN v_method = 'installment' THEN
        format('Order created · %s%% deposit · installment %s mo', v_deposit_pct, v_installment_months)
      ELSE format('Order created · %s%% deposit · %s', v_deposit_pct, v_method)
    END,
    v_role
  );

  INSERT INTO audit_log (role, action, dealer_id, ref)
  VALUES (
    v_role,
    'order.created',
    v_dealer_id,
    'DL-' || v_dl::text
  );

  RETURN jsonb_build_object(
    'id', v_order_id,
    'dl', v_dl,
    'placed_at', v_placed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order(jsonb) TO authenticated;
