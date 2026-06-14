-- =============================================================================
-- 0165_add_proceed_date.sql — Phase 11.1 — salesperson-entered Proceed Date
-- 2026-06-14 (Loo authorised "go whole things" in conversation; §7 schema + §14).
--
-- Adds orders.proceed_date — the planned production-START date the salesperson
-- keys in at order creation, ALONGSIDE the existing delivery_date. Modeled on
-- 2990s `internal_expected_dd` ("Process date / factory start"). It pairs with
-- delivery_date via the existing delivery_date_tbd toggle (both-or-neither) and
-- must be on/before the delivery date. It is a PLANNED date only — it does NOT
-- drive any state transition and is NEVER auto-stamped (distinct from a system
-- "proceeded_at"). Phase 11.2 will redo operation_stage separately.
--
-- Three RPCs updated to read/write it: create_order, set_order_date (confirm a
-- TBD order's date — now sets BOTH), update_order (edit a Place order).
-- =============================================================================

alter table public.orders add column if not exists proceed_date date;

comment on column public.orders.proceed_date is
  'Phase 11.1 — salesperson-entered planned production-start date. Pairs with delivery_date via delivery_date_tbd (both-or-neither). NULL when TBD. Must be <= delivery_date. Planned date only; never auto-stamped.';

-- -----------------------------------------------------------------------------
-- create_order — persist proceed_date + enforce proceed <= delivery
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- set_order_date — confirm a TBD order; now sets BOTH dates (3-arg signature).
-- Drop the old 2-arg overload so PostgREST resolves unambiguously.
-- -----------------------------------------------------------------------------
drop function if exists public.set_order_date(uuid, date);

create or replace function public.set_order_date(p_order_id uuid, p_date date, p_proceed_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer date update' using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Delivery date can only be set on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_date is null then
    raise exception 'Date is required' using errcode = '22023', detail = 'invalid_date';
  end if;

  -- Phase 11.1 — proceed date pairs with delivery date and must be <= it.
  if p_proceed_date is null then
    raise exception 'Proceed date is required' using errcode = '22023', detail = 'invalid_proceed_date';
  end if;
  if p_proceed_date > p_date then
    raise exception 'proceed date must be on or before delivery date'
      using errcode = '22023', detail = 'proceed_after_delivery';
  end if;

  update orders
     set delivery_date = p_date,
         proceed_date = p_proceed_date,
         delivery_date_tbd = false,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('Delivery date confirmed: %s · proceed %s',
            to_char(p_date, 'YYYY-MM-DD'), to_char(p_proceed_date, 'YYYY-MM-DD')), v_role);

  return jsonb_build_object('id', p_order_id, 'date', p_date, 'proceedDate', p_proceed_date);
end;
$function$;

-- -----------------------------------------------------------------------------
-- update_order — allow editing proceed_date; re-validate ordering post-update.
-- -----------------------------------------------------------------------------
create or replace function public.update_order(p_order_id uuid, p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_changed          text[] := '{}';
  v_new_delivery     date;
  v_new_proceed      date;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Order is no longer editable'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Payload must be a JSON object'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  if p_payload ? 'customer_name' then
    if coalesce(trim(p_payload->>'customer_name'), '') = '' then
      raise exception 'Customer name cannot be empty'
        using errcode = '22023', detail = 'invalid_customer_name';
    end if;
    v_changed := array_append(v_changed, 'customer_name');
  end if;
  if p_payload ? 'customer_phone'           then v_changed := array_append(v_changed, 'customer_phone'); end if;
  if p_payload ? 'customer_address'         then v_changed := array_append(v_changed, 'customer_address'); end if;
  if p_payload ? 'customer_address_unknown' then v_changed := array_append(v_changed, 'customer_address_unknown'); end if;
  if p_payload ? 'customer_billing'         then v_changed := array_append(v_changed, 'customer_billing'); end if;
  if p_payload ? 'customer_billing_same'    then v_changed := array_append(v_changed, 'customer_billing_same'); end if;
  if p_payload ? 'customer_emergency'       then v_changed := array_append(v_changed, 'customer_emergency'); end if;
  if p_payload ? 'delivery_date'            then v_changed := array_append(v_changed, 'delivery_date'); end if;
  if p_payload ? 'proceed_date'             then v_changed := array_append(v_changed, 'proceed_date'); end if;
  if p_payload ? 'delivery_date_tbd'        then v_changed := array_append(v_changed, 'delivery_date_tbd'); end if;
  if p_payload ? 'delivery_floor'           then v_changed := array_append(v_changed, 'delivery_floor'); end if;
  if p_payload ? 'delivery_has_lift'        then v_changed := array_append(v_changed, 'delivery_has_lift'); end if;

  if cardinality(v_changed) = 0 then
    raise exception 'No editable fields in payload'
      using errcode = '22023', detail = 'no_changes';
  end if;

  update orders set
    customer_name            = case when p_payload ? 'customer_name'
                                    then trim(p_payload->>'customer_name') else customer_name end,
    customer_phone           = case when p_payload ? 'customer_phone'
                                    then nullif(trim(p_payload->>'customer_phone'), '') else customer_phone end,
    customer_address         = case when p_payload ? 'customer_address'
                                    then nullif(trim(p_payload->>'customer_address'), '') else customer_address end,
    customer_address_unknown = case when p_payload ? 'customer_address_unknown'
                                    then (p_payload->>'customer_address_unknown')::boolean else customer_address_unknown end,
    customer_billing         = case when p_payload ? 'customer_billing'
                                    then nullif(trim(p_payload->>'customer_billing'), '') else customer_billing end,
    customer_billing_same    = case when p_payload ? 'customer_billing_same'
                                    then (p_payload->>'customer_billing_same')::boolean else customer_billing_same end,
    customer_emergency       = case when p_payload ? 'customer_emergency'
                                    then nullif(trim(p_payload->>'customer_emergency'), '') else customer_emergency end,
    delivery_date            = case when p_payload ? 'delivery_date'
                                    then nullif(p_payload->>'delivery_date', '')::date else delivery_date end,
    proceed_date             = case when p_payload ? 'proceed_date'
                                    then nullif(p_payload->>'proceed_date', '')::date else proceed_date end,
    delivery_date_tbd        = case when p_payload ? 'delivery_date_tbd'
                                    then (p_payload->>'delivery_date_tbd')::boolean else delivery_date_tbd end,
    delivery_floor           = case when p_payload ? 'delivery_floor'
                                    then greatest(1, (p_payload->>'delivery_floor')::int) else delivery_floor end,
    delivery_has_lift        = case when p_payload ? 'delivery_has_lift'
                                    then (p_payload->>'delivery_has_lift')::boolean else delivery_has_lift end,
    updated_at               = now()
  where id = p_order_id
  returning delivery_date, proceed_date into v_new_delivery, v_new_proceed;

  -- Phase 11.1 — after applying the partial edit, the resulting pair must stay
  -- ordered (proceed <= delivery). Raising here rolls the whole edit back.
  if v_new_delivery is not null and v_new_proceed is not null
     and v_new_proceed > v_new_delivery then
    raise exception 'proceed date must be on or before delivery date'
      using errcode = '22023', detail = 'proceed_after_delivery';
  end if;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format('Order details updated · %s field(s)', cardinality(v_changed)),
    v_role,
    jsonb_build_object('kind', 'edit', 'changed', to_jsonb(v_changed), 'payload', p_payload)
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.edited', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'changed', v_changed);
end;
$function$;
