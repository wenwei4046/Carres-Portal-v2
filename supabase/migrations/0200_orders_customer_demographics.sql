-- =============================================================================
-- 0200 — POS-parity (2990s customer step): customer demographics on orders.
--
-- The 02 CUSTOMER step gains EMAIL / RACE / GENDER / BIRTHDAY (2990s Image-#4
-- parity); race/gender/birthday feed the upcoming Sales-analysis Customer Data
-- tab. All four are NULLABLE — the POS front-end gates requiredness, the
-- server stays lenient (2990s precedent: POS-required, server-lenient), so
-- the raw-create path and historical rows are untouched.
--
-- create_order() is re-issued as a copy of the 0165 version + the four new
-- customer columns threaded through (never edit committed migrations).
-- =============================================================================

alter table orders
  add column if not exists customer_email    text,
  add column if not exists customer_race     text,
  add column if not exists customer_gender   text,
  add column if not exists customer_birthday date;

create or replace function public.create_order(payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_dealer_id          uuid;
  v_role               app_role;
  v_caller_dealer_id   uuid;
  v_order_id           uuid;
  v_so                 int;
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

  IF v_role NOT IN ('principal','operation','finance','bd')
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

  -- Phase 11.1 — proceed date must be on/before delivery date (when both set).
  IF nullif(payload->>'delivery_date','') IS NOT NULL
     AND nullif(payload->>'proceed_date','') IS NOT NULL
     AND (payload->>'proceed_date')::date > (payload->>'delivery_date')::date THEN
    RAISE EXCEPTION 'proceed date must be on or before delivery date'
      USING ERRCODE = '22023', DETAIL = 'proceed_after_delivery';
  END IF;

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
    dealer_id, outlet_id, salesperson_id,
    customer_name, customer_phone, customer_address, customer_address_unknown,
    customer_billing, customer_billing_same, customer_emergency,
    customer_email, customer_race, customer_gender, customer_birthday,
    delivery_date, proceed_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
    paid, signature_url, payment_slip_url, terms_accepted,
    payment_method, approval_code, installment_months
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
    nullif(payload->>'customer_email', ''),
    nullif(payload->>'customer_race', ''),
    nullif(payload->>'customer_gender', ''),
    nullif(payload->>'customer_birthday', '')::date,
    nullif(payload->>'delivery_date', '')::date,
    nullif(payload->>'proceed_date', '')::date,
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
  RETURNING id, so, placed_at INTO v_order_id, v_so, v_placed_at;

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
      -- 0133 - attrs jsonb passed through (e.g. disposal size tag).
      INSERT INTO order_addons (order_id, addon_key, qty, unit_price, attrs)
      VALUES (
        v_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric,
        v_addon->'attrs'
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
  VALUES (v_role, 'order.created', v_dealer_id, 'SO-' || v_so::text);

  RETURN jsonb_build_object('id', v_order_id, 'so', v_so, 'placed_at', v_placed_at);
END;
$function$;
