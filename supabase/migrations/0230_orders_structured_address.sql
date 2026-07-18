-- 0230 — Structured delivery address (Loo 2026-07-18).
--
-- The POS wizard captures the MY cascading address (line1 / line2 / state /
-- city / postcode) but composed it into the single `customer_address` string
-- at submit, throwing the structure away — so the POS order-detail drawer
-- could only offer a flat textarea (no dropdown repopulation), and the two
-- address forms looked different. This migration makes the structured parts
-- first-class columns:
--
--   * orders gains customer_address_line1/2/_state/_city/_postcode (nullable).
--   * `customer_address` (the composed string) REMAINS the canonical display
--     address — every downstream consumer (ops drawer, SO PDF, WA templates,
--     delivery legs) keeps reading it unchanged. Zero behavior change there.
--   * INVARIANT: when the structured columns are present they always match
--     the composed string. Writers that send the structured parts must send
--     the composed string with them; a flat-only write (legacy EditOrderModal,
--     ops customer card) CLEARS the structured columns (stale-guard) so the
--     structure is never trusted after the string drifted from it.
--   * No backfill — pre-0230 orders surface null parts; the POS drawer seeds
--     Line 1 from the composed string as a transitional fallback.
--
-- Touches create_order + update_order + set_order_address. All three live
-- defs were fetched via pg_get_functiondef on 2026-07-18 and matched the repo
-- 0219/0222 versions (no drift) before this rewrite.

-- ---------------------------------------------------------------------------
-- 1) Columns
-- ---------------------------------------------------------------------------

alter table orders
  add column if not exists customer_address_line1    text,
  add column if not exists customer_address_line2    text,
  add column if not exists customer_address_state    text,
  add column if not exists customer_address_city     text,
  add column if not exists customer_address_postcode text;

-- ---------------------------------------------------------------------------
-- 2) create_order — store the structured parts sent alongside the composed
--    string. Only the INSERT column list changes; every gate is 0219-verbatim.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_entry_data         jsonb; -- 0219 --
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
  -- 0219 -- config-driven methods: the 0007 whitelist RAISE is replaced by a
  -- sanity bound; Hono validates the method against order_entry_config.
  IF v_method IS NOT NULL AND length(v_method) > 40 THEN
    RAISE EXCEPTION 'payment_method too long' USING ERRCODE = '22023';
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

  -- 0219 -- POS entry extras: must be a (bounded) jsonb object when present.
  v_entry_data := payload->'entry_data';
  IF v_entry_data IS NOT NULL AND jsonb_typeof(v_entry_data) <> 'object' THEN
    RAISE EXCEPTION 'entry_data must be a json object' USING ERRCODE = '22023';
  END IF;
  IF v_entry_data IS NOT NULL AND pg_column_size(v_entry_data) > 16384 THEN
    RAISE EXCEPTION 'entry_data too large' USING ERRCODE = '22023';
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
    customer_address_line1, customer_address_line2, -- 0230 --
    customer_address_state, customer_address_city, customer_address_postcode, -- 0230 --
    customer_billing, customer_billing_same, customer_emergency,
    customer_email, customer_race, customer_gender, customer_birthday,
    delivery_date, proceed_date, delivery_date_tbd, delivery_floor, delivery_has_lift,
    paid, signature_url, payment_slip_url, terms_accepted,
    payment_method, approval_code, installment_months,
    entry_data -- 0219 --
  ) VALUES (
    v_dealer_id,
    nullif(payload->>'outlet_id', '')::uuid,
    nullif(payload->>'salesperson_id', '')::uuid,
    payload->>'customer_name',
    nullif(payload->>'customer_phone', ''),
    nullif(payload->>'customer_address', ''),
    coalesce((payload->>'customer_address_unknown')::boolean, false),
    nullif(payload->>'customer_address_line1', ''),    -- 0230 --
    nullif(payload->>'customer_address_line2', ''),    -- 0230 --
    nullif(payload->>'customer_address_state', ''),    -- 0230 --
    nullif(payload->>'customer_address_city', ''),     -- 0230 --
    nullif(payload->>'customer_address_postcode', ''), -- 0230 --
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
    v_installment_months,
    v_entry_data -- 0219 --
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

-- ---------------------------------------------------------------------------
-- 3) update_order — accept the 5 structured keys (customer-class: editable in
--    BOTH the place and proceed lanes, like the composed address) with two
--    guards protecting the composed↔structured invariant:
--      a) structured keys without `customer_address` in the same payload →
--         reject (the composed string is what everything downstream reads;
--         letting it drift from the parts would corrupt the invariant).
--      b) `customer_address` WITHOUT the structured keys (a legacy flat write,
--         e.g. EditOrderModal / the ops customer card) → the structured
--         columns are CLEARED (stale-guard), never left mismatched.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_order(p_order_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_changed          text[] := '{}';
  v_new_delivery     date;
  v_new_proceed      date;
  v_has_parts        boolean; -- 0230 --
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 0222: NULL role (anon key / orphaned JWT) must not slip past the
  -- cross-dealer guard's NULL-boolean semantics — reject outright.
  if v_role is null then
    raise exception 'forbidden: no app role' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer edit' using errcode = '42501';
  end if;

  -- 0222: field-scoped status gate replaces the wholesale `<> 'place'` reject.
  -- Place orders stay fully editable; Proceed orders accept CUSTOMER fields
  -- only (the POS proceed lane keeps customer details/payment editable while
  -- products + dates lock); delivered/cancelled stay uneditable.
  if v_order.status not in ('place','proceed_order') then
    raise exception 'Order is no longer editable'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Payload must be a JSON object'
      using errcode = '22023', detail = 'invalid_payload';
  end if;

  -- 0222: in the Proceed lane the delivery/date fields are locked — the
  -- caller must un-proceed first ("move back to edit"). Whole edit rejects
  -- (not silently filtered) so the client never half-applies a patch.
  if v_order.status = 'proceed_order'
     and (p_payload ? 'delivery_date'
          or p_payload ? 'proceed_date'
          or p_payload ? 'delivery_date_tbd'
          or p_payload ? 'delivery_floor'
          or p_payload ? 'delivery_has_lift'
          -- not an accepted key today, but the Hono route forwards it; keep it
          -- locked so a future schema addition can't slip past this gate
          or p_payload ? 'delivery_stair_items') then
    raise exception 'Delivery fields are locked after Proceed'
      using errcode = '22023', detail = 'proceed_locked_fields';
  end if;

  -- 0230: structured parts ride WITH the composed string, never alone — the
  -- composed `customer_address` is what every downstream consumer reads, so a
  -- parts-only write would silently desync the two representations.
  v_has_parts := p_payload ? 'customer_address_line1'
              or p_payload ? 'customer_address_line2'
              or p_payload ? 'customer_address_state'
              or p_payload ? 'customer_address_city'
              or p_payload ? 'customer_address_postcode';
  if v_has_parts and not p_payload ? 'customer_address' then
    raise exception 'structured address parts require the composed customer_address in the same payload'
      using errcode = '22023', detail = 'address_parts_without_composed';
  end if;

  if p_payload ? 'customer_name' then
    if coalesce(trim(p_payload->>'customer_name'), '') = '' then
      raise exception 'Customer name cannot be empty'
        using errcode = '22023', detail = 'invalid_customer_name';
    end if;
    v_changed := array_append(v_changed, 'customer_name');
  end if;
  if p_payload ? 'customer_phone'           then v_changed := array_append(v_changed, 'customer_phone'); end if;
  -- 0222: customer_email accepted (0200 column), nullable trim like phone.
  if p_payload ? 'customer_email'           then v_changed := array_append(v_changed, 'customer_email'); end if;
  if p_payload ? 'customer_address'         then v_changed := array_append(v_changed, 'customer_address'); end if;
  if p_payload ? 'customer_address_unknown' then v_changed := array_append(v_changed, 'customer_address_unknown'); end if;
  -- 0230: structured address parts (customer-class, proceed-lane editable).
  if p_payload ? 'customer_address_line1'    then v_changed := array_append(v_changed, 'customer_address_line1'); end if;
  if p_payload ? 'customer_address_line2'    then v_changed := array_append(v_changed, 'customer_address_line2'); end if;
  if p_payload ? 'customer_address_state'    then v_changed := array_append(v_changed, 'customer_address_state'); end if;
  if p_payload ? 'customer_address_city'     then v_changed := array_append(v_changed, 'customer_address_city'); end if;
  if p_payload ? 'customer_address_postcode' then v_changed := array_append(v_changed, 'customer_address_postcode'); end if;
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
    -- 0222: email mirrors the phone treatment (trim, empty → null).
    customer_email           = case when p_payload ? 'customer_email'
                                    then nullif(trim(p_payload->>'customer_email'), '') else customer_email end,
    customer_address         = case when p_payload ? 'customer_address'
                                    then nullif(trim(p_payload->>'customer_address'), '') else customer_address end,
    customer_address_unknown = case when p_payload ? 'customer_address_unknown'
                                    then (p_payload->>'customer_address_unknown')::boolean else customer_address_unknown end,
    -- 0230: each structured column takes its sent value; a flat-only
    -- customer_address write (no parts in the payload) CLEARS it instead
    -- (stale-guard — the string is no longer known to match the parts).
    customer_address_line1    = case when p_payload ? 'customer_address_line1'
                                     then nullif(trim(p_payload->>'customer_address_line1'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_line1 end,
    customer_address_line2    = case when p_payload ? 'customer_address_line2'
                                     then nullif(trim(p_payload->>'customer_address_line2'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_line2 end,
    customer_address_state    = case when p_payload ? 'customer_address_state'
                                     then nullif(trim(p_payload->>'customer_address_state'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_state end,
    customer_address_city     = case when p_payload ? 'customer_address_city'
                                     then nullif(trim(p_payload->>'customer_address_city'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_city end,
    customer_address_postcode = case when p_payload ? 'customer_address_postcode'
                                     then nullif(trim(p_payload->>'customer_address_postcode'), '')
                                     when p_payload ? 'customer_address' then null
                                     else customer_address_postcode end,
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

-- ---------------------------------------------------------------------------
-- 4) set_order_address — the deferred-address modal already collects the
--    structured parts via MYAddressFields; a new optional p_parts jsonb
--    ({line1,line2,state,city,postcode}) persists them alongside the composed
--    string. Signature changes → DROP + CREATE (no ghost overload; the old
--    4-arg version is gone) + explicit re-grants.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.set_order_address(uuid, text, text, boolean);

CREATE FUNCTION public.set_order_address(
  p_order_id uuid,
  p_address text,
  p_billing text,
  p_billing_same boolean,
  p_parts jsonb DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    raise exception 'forbidden: cross-dealer address update' using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Address can only be set on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_address is null or trim(p_address) = '' then
    raise exception 'Address is required'
      using errcode = '22023', detail = 'invalid_address';
  end if;

  -- 0230: parts must be an object when present (lenient absent = flat write).
  if p_parts is not null and jsonb_typeof(p_parts) <> 'object' then
    raise exception 'p_parts must be a json object'
      using errcode = '22023', detail = 'invalid_address_parts';
  end if;

  update orders
     set customer_address = trim(p_address),
         customer_address_unknown = false,
         -- 0230: structured parts stored when sent, CLEARED on a flat-only
         -- write (same stale-guard as update_order — parts never outlive the
         -- string they were composed into).
         customer_address_line1    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'line1', '')), '') else null end,
         customer_address_line2    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'line2', '')), '') else null end,
         customer_address_state    = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'state', '')), '') else null end,
         customer_address_city     = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'city', '')), '') else null end,
         customer_address_postcode = case when p_parts is not null then nullif(trim(coalesce(p_parts->>'postcode', '')), '') else null end,
         customer_billing = case when coalesce(p_billing_same, true) then null else nullif(trim(p_billing), '') end,
         customer_billing_same = coalesce(p_billing_same, true),
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, 'Delivery address provided', v_role);

  return jsonb_build_object('id', p_order_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.set_order_address(uuid, text, text, boolean, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_order_address(uuid, text, text, boolean, jsonb) TO authenticated, service_role;
