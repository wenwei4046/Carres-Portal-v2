-- =============================================================================
-- 0009 — Phase 2C.1b: Blocker resolution RPCs.
--
-- Three targeted mutations a dealer can run on a Place order to clear
-- specific blockers without going through the full edit modal:
--   • top_up_order      — record an additional partial payment toward total
--   • set_order_address — fill in a customer address that was deferred
--   • set_order_date    — confirm a delivery date that was TBD
--
-- All three follow the same security/error contract as proceed_order (0008):
--   • SECURITY DEFINER  — bypasses RLS so we can also write to audit_log
--   • Manual cross-dealer guard inside the function body
--   • Status guard: only Place orders are mutable
--   • SQLSTATE codes:  42501 forbidden, 42P01 not_found, 22023 invalid_param
-- =============================================================================

-- Additive: metadata jsonb on order_history.
-- Used by top_up_order to persist receipt details (method, reference, photo
-- paths) so the dealer's activity timeline can show "what was attached" later.
-- Future top_up / cancel / edit flows can add their own kinds without further
-- schema migrations.
alter table order_history add column if not exists metadata jsonb;

-- -----------------------------------------------------------------------------
-- top_up_order(p_order_id, p_amount, p_method, p_method_label, p_reference,
--              p_note, p_date, p_photo_paths jsonb) → jsonb
-- -----------------------------------------------------------------------------
create or replace function public.top_up_order(
  p_order_id     uuid,
  p_amount       numeric,
  p_method       text,
  p_method_label text,
  p_reference    text,
  p_note         text,
  p_date         date,
  p_photo_paths  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_total            numeric(12,2);
  v_capped_amount    numeric(12,2);
  v_new_paid         numeric(12,2);
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01';
  end if;

  if v_role not in ('principal','logistics','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer top-up'
      using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Top-up only allowed on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero'
      using errcode = '22023', detail = 'invalid_amount';
  end if;

  -- Cap amount at outstanding balance — paid never exceeds total.
  select
    coalesce((select sum(unit_price * qty) from order_lines  where order_id = p_order_id), 0)
    + coalesce((select sum(unit_price * qty) from order_addons where order_id = p_order_id), 0)
  into v_total;

  if v_total <= 0 then
    raise exception 'Order has no priced items — cannot top up'
      using errcode = '22023', detail = 'total_amount_missing';
  end if;

  v_capped_amount := least(p_amount, v_total - v_order.paid);
  if v_capped_amount <= 0 then
    raise exception 'Order is already fully paid'
      using errcode = '22023', detail = 'already_paid';
  end if;
  v_new_paid := v_order.paid + v_capped_amount;

  update orders
     set paid = v_new_paid,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    format(
      'Top-up RM %s via %s%s',
      v_capped_amount::text,
      coalesce(nullif(p_method_label, ''), p_method),
      case
        when p_reference is not null and trim(p_reference) <> ''
        then ' · ref ' || p_reference
        else ''
      end
    ),
    v_role,
    jsonb_build_object(
      'kind', 'top_up',
      'amount', v_capped_amount,
      'method', p_method,
      'method_label', p_method_label,
      'reference', nullif(p_reference, ''),
      'note', nullif(p_note, ''),
      'date', p_date,
      'photo_paths', coalesce(p_photo_paths, '[]'::jsonb)
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.top_up',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  return jsonb_build_object(
    'id', p_order_id,
    'amount', v_capped_amount,
    'paid', v_new_paid
  );
end;
$$;

revoke all on function public.top_up_order(uuid, numeric, text, text, text, text, date, jsonb) from public;
grant execute on function public.top_up_order(uuid, numeric, text, text, text, text, date, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- set_order_address(p_order_id, p_address, p_billing, p_billing_same) → jsonb
-- Resolves the addressUnknown blocker on a Place order.
-- -----------------------------------------------------------------------------
create or replace function public.set_order_address(
  p_order_id     uuid,
  p_address      text,
  p_billing      text,
  p_billing_same boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01';
  end if;

  if v_role not in ('principal','logistics','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer address update'
      using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Address can only be set on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_address is null or trim(p_address) = '' then
    raise exception 'Address is required'
      using errcode = '22023', detail = 'invalid_address';
  end if;

  update orders
     set customer_address = trim(p_address),
         customer_address_unknown = false,
         customer_billing = case when coalesce(p_billing_same, true) then null else nullif(trim(p_billing), '') end,
         customer_billing_same = coalesce(p_billing_same, true),
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, 'Delivery address provided', v_role);

  return jsonb_build_object('id', p_order_id);
end;
$$;

revoke all on function public.set_order_address(uuid, text, text, boolean) from public;
grant execute on function public.set_order_address(uuid, text, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- set_order_date(p_order_id, p_date) → jsonb
-- Resolves the dateTbd blocker on a Place order. Slot / time-of-day metadata
-- is intentionally deferred — the schema doesn't carry it yet, and proto's
-- slot picker is largely informational. Add later via a separate migration
-- if Loo wants the dispatcher view to read it.
-- -----------------------------------------------------------------------------
create or replace function public.set_order_date(
  p_order_id uuid,
  p_date     date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01';
  end if;

  if v_role not in ('principal','logistics','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer date update'
      using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Delivery date can only be set on Place orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if p_date is null then
    raise exception 'Date is required'
      using errcode = '22023', detail = 'invalid_date';
  end if;

  update orders
     set delivery_date = p_date,
         delivery_date_tbd = false,
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('Delivery date confirmed: %s', to_char(p_date, 'YYYY-MM-DD')), v_role);

  return jsonb_build_object('id', p_order_id, 'date', p_date);
end;
$$;

revoke all on function public.set_order_date(uuid, date) from public;
grant execute on function public.set_order_date(uuid, date) to authenticated;
