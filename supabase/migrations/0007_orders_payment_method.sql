-- =============================================================================
-- 0007 — Persist payment method + approval code + installment months on orders.
-- Phase 2B.3.c follow-up: closes the audit-trail gap surfaced by /review F3.
--
-- Why now (instead of Phase 2D's payments table):
--   - Wizard already collects these three fields in Step 3 and validates them,
--     but earlier slices dropped them on submit. Without DB columns, finance
--     reconciliation + chargeback dispute have no record of which payment
--     instrument was used; only the slip image survived.
--   - Phase 2D will add a separate `payments` table for full payment lifecycle
--     (multiple payments per order, refunds, etc). These three columns are
--     order-level metadata that always existed at order-creation time, so
--     they belong on `orders`, not on a child payments row.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add columns
-- -----------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_method      text,
  add column if not exists approval_code       text,
  add column if not exists installment_months  int;

-- -----------------------------------------------------------------------------
-- 2. Constraints
--   payment_method ∈ {online, credit, installment} or null (legacy rows + nullable
--   while we backfill nothing — no historical data has the field yet).
--   installment_months ∈ {6, 12} or null (only set when method = installment).
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_method_chk'
  ) then
    alter table public.orders
      add constraint orders_payment_method_chk
        check (
          payment_method is null
          or payment_method in ('online','credit','installment')
        );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_installment_months_chk'
  ) then
    alter table public.orders
      add constraint orders_installment_months_chk
        check (
          installment_months is null
          or installment_months in (6, 12)
        );
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Replace create_order RPC to read + persist the new fields.
--    Body is identical to 0006 except for the orders-insert column list and
--    the audit_log row text (now includes method label so internal viewers
--    can scan the audit trail without joining back to orders).
-- -----------------------------------------------------------------------------
create or replace function public.create_order(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
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
begin
  v_dealer_id := (payload->>'dealer_id')::uuid;
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  if v_role not in ('principal','logistics','finance','bd')
     and v_dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer insert' using errcode = '42501';
  end if;

  if v_dealer_id is null then
    raise exception 'dealer_id is required' using errcode = '22023';
  end if;

  -- Defensive validation — even though zod + check constraint catch these,
  -- raising 22023 from inside the RPC keeps the error code consistent.
  v_method := nullif(payload->>'payment_method', '');
  if v_method is not null and v_method not in ('online','credit','installment') then
    raise exception 'payment_method must be one of online/credit/installment' using errcode = '22023';
  end if;

  v_installment_months := nullif(payload->>'installment_months', '')::int;
  if v_installment_months is not null and v_installment_months not in (6, 12) then
    raise exception 'installment_months must be 6 or 12' using errcode = '22023';
  end if;
  if v_method = 'installment' and v_installment_months is null then
    raise exception 'installment_months is required when payment_method = installment' using errcode = '22023';
  end if;
  if v_method <> 'installment' and v_installment_months is not null then
    raise exception 'installment_months only valid when payment_method = installment' using errcode = '22023';
  end if;

  insert into orders (
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
  ) values (
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
  returning id, dl, placed_at into v_order_id, v_dl, v_placed_at;

  if jsonb_array_length(coalesce(payload->'lines', '[]'::jsonb)) = 0 then
    raise exception 'order must have at least one line' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(payload->'lines') loop
    insert into order_lines (order_id, sku, qty, attrs, unit_price)
    values (
      v_order_id,
      v_line->>'sku',
      (v_line->>'qty')::int,
      v_line->'attrs',
      (v_line->>'unit_price')::numeric
    );
  end loop;

  if payload ? 'addons' then
    for v_addon in select * from jsonb_array_elements(payload->'addons') loop
      insert into order_addons (order_id, addon_key, qty, unit_price)
      values (
        v_order_id,
        v_addon->>'addon_key',
        coalesce((v_addon->>'qty')::int, 1),
        (v_addon->>'unit_price')::numeric
      );
    end loop;
  end if;

  v_deposit_pct := coalesce((payload->>'deposit_pct')::int, 0);
  insert into order_history (order_id, text, by_role)
  values (
    v_order_id,
    case
      when v_method is null then format('Order created · %s%% deposit', v_deposit_pct)
      when v_method = 'installment' then
        format('Order created · %s%% deposit · installment %s mo', v_deposit_pct, v_installment_months)
      else format('Order created · %s%% deposit · %s', v_deposit_pct, v_method)
    end,
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.created',
    v_dealer_id,
    'DL-' || v_dl::text
  );

  return jsonb_build_object(
    'id', v_order_id,
    'dl', v_dl,
    'placed_at', v_placed_at
  );
end;
$$;

revoke all on function public.create_order(jsonb) from public;
grant execute on function public.create_order(jsonb) to authenticated;
