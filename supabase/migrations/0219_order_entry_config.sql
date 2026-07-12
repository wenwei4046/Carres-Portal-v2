-- 0219_order_entry_config.sql
-- ===========================================================================
-- Order Entry configurability (Loo 2026-07-12) — SO Maintenance becomes the
-- config center for the POS "Open Sales Order" format:
--   (a) payment methods become CONFIG-DRIVEN (adds Cash today; the operator
--       can add/edit methods + per-method follow-up dropdowns e.g. the bank
--       list for Credit/Debit) — the 0007 hardcoded whitelist goes away;
--   (b) a new singleton `order_entry_config` (0174 sales_order_grid_config
--       pattern) stores the payment-method list + per-tab form-field config
--       (builtin toggles + operator-defined custom fields);
--   (c) orders gains `entry_data` jsonb — the POS entry extras (payment
--       follow-up answers e.g. { payment: { bank: "Maybank" } } + custom
--       form-field values under { fields: {...} });
--   (d) create_order(jsonb) is REPLACED (same single-jsonb signature — no
--       overload risk; live def fetched 2026-07-12 and edited surgically):
--       the method whitelist RAISE becomes a length sanity check (the
--       config list is validated in Hono against order_entry_config), and
--       the orders INSERT persists entry_data. Everything else byte-equal.
--
-- The column/field UNIVERSE lives in code (packages/shared) like the 0174
-- grid columns — this table only stores the operator's configured lists, so
-- an EMPTY config ('[]'/'{}') means "code defaults apply" and existing
-- behavior is unchanged (dormant-safe).
--
-- Safety: additive besides the CHECK swap + create_order body edit. RLS:
-- read = ALL authenticated (the POS renders from it — dealers/showroom too);
-- write = internal roles via the SECURITY DEFINER RPC only (0174 pattern).
-- CLAUDE.md §8 honored: (select app_role()) InitPlan wrap.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. orders.payment_method — drop the 0007 hardcoded whitelist; keep sanity.
-- ---------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_payment_method_chk;
alter table public.orders add constraint orders_payment_method_chk
  check (payment_method is null or length(payment_method) between 1 and 40);

-- ---------------------------------------------------------------------------
-- 2. orders.entry_data — POS entry extras (payment follow-ups + custom fields).
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists entry_data jsonb;

-- ---------------------------------------------------------------------------
-- 3. order_entry_config singleton + write RPC.
-- ---------------------------------------------------------------------------
create table if not exists public.order_entry_config (
  id              boolean primary key default true check (id),
  payment_methods jsonb not null default '[]'::jsonb,
  form_fields     jsonb not null default '{}'::jsonb,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

insert into public.order_entry_config (id) values (true)
on conflict (id) do nothing;

alter table public.order_entry_config enable row level security;

drop policy if exists order_entry_config_read_authenticated on public.order_entry_config;
create policy order_entry_config_read_authenticated on public.order_entry_config
  for select to authenticated using (true);

-- No direct writes — all mutation via the role-gated RPC below.
revoke insert, update, delete on public.order_entry_config from authenticated, anon;

create or replace function public.set_order_entry_config(
  p_payment_methods jsonb,
  p_form_fields     jsonb
) returns public.order_entry_config
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := (select public.app_role())::text;
  v_row  public.order_entry_config;
begin
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: internal roles only' using errcode = '42501';
  end if;
  if p_payment_methods is not null and jsonb_typeof(p_payment_methods) <> 'array' then
    raise exception 'payment_methods must be a jsonb array' using errcode = '22023';
  end if;
  if p_form_fields is not null and jsonb_typeof(p_form_fields) <> 'object' then
    raise exception 'form_fields must be a jsonb object' using errcode = '22023';
  end if;

  update public.order_entry_config
     set payment_methods = coalesce(p_payment_methods, payment_methods),
         form_fields     = coalesce(p_form_fields, form_fields),
         updated_at      = now(),
         updated_by      = auth.uid()
   where id = true
   returning * into v_row;
  return v_row;
end;
$$;

-- P8c lesson: Supabase default-grants EXECUTE to authenticated/anon — the
-- role gate lives inside, so authenticated keeps EXECUTE; anon is cut.
revoke all on function public.set_order_entry_config(jsonb, jsonb) from public, anon;
grant execute on function public.set_order_entry_config(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_order(jsonb) — same signature, body edits marked with -- 0219 --.
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

COMMIT;
