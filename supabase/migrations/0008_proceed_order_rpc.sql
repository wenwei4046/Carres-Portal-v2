-- =============================================================================
-- 0008 — Place→Proceed kanban transition (Phase 2C.1).
--
-- Defines `public.proceed_order(p_order_id uuid)` which atomically:
--   1. Verifies the caller owns the order (dealer scope or internal role).
--   2. Verifies the order is currently in `place` status.
--   3. Checks each precondition that the proto's `proceedBlockers()` enforces:
--        signature + T&C + customer name/phone/address + delivery date +
--        paid ≥ 50% of (line + addon) total.
--   4. UPDATEs orders.status → 'proceed_order'.
--   5. INSERTs order_history + audit_log entries.
--
-- Why SECURITY DEFINER: matches the create_order RPC pattern in 0006. It
-- bypasses RLS so we can write to audit_log (no INSERT policy for dealer
-- there) and centralizes the blocker checks at the database boundary —
-- a malicious client that bypasses the wizard UI still can't push a
-- half-filled order to logistics.
--
-- Error contract (consumed by apps/api/src/routes/orders.ts):
--   • SQLSTATE 42501 — caller is not the order's dealer (forbidden)
--   • SQLSTATE 42P01 — order id not found
--   • SQLSTATE 22023 — order not in 'place' status (wrong_status)
--   • SQLSTATE P0001 — blocker validation failed; DETAIL field carries the
--                       specific code (signature_required, payment_below_50, etc.)
-- =============================================================================

create or replace function public.proceed_order(p_order_id uuid)
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
  v_paid_pct         numeric;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 1. Fetch order
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- 2. Cross-dealer guard. Internal roles can proceed any order; dealer /
  -- salesperson can only proceed their own. Mirrors the same check inside
  -- create_order (0006) so the trust boundary is consistent.
  if v_role not in ('principal','logistics','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer proceed'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 3. Status guard
  if v_order.status <> 'place' then
    raise exception 'Order is not in Place status'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- 4. Blocker checks — each raises P0001 with a specific DETAIL code so the
  -- API route can relay the exact failure to the UI. Order matters: this is
  -- the same order proto's `proceedBlockers()` walks the user through, so
  -- the UI's inline hints stay consistent with what the server complains
  -- about if the client validation drifts.
  if v_order.customer_name is null or trim(v_order.customer_name) = '' then
    raise exception 'Customer name is required'
      using errcode = 'P0001', detail = 'customer_name_required';
  end if;

  if v_order.customer_phone is null or trim(v_order.customer_phone) = '' then
    raise exception 'Customer phone is required'
      using errcode = 'P0001', detail = 'customer_phone_required';
  end if;

  if v_order.customer_address_unknown
     or v_order.customer_address is null
     or trim(v_order.customer_address) = '' then
    raise exception 'Delivery address is required'
      using errcode = 'P0001', detail = 'delivery_address_required';
  end if;

  if v_order.delivery_date_tbd or v_order.delivery_date is null then
    raise exception 'Delivery date is required'
      using errcode = 'P0001', detail = 'delivery_date_required';
  end if;

  if v_order.signature_url is null then
    raise exception 'Customer signature is required'
      using errcode = 'P0001', detail = 'signature_required';
  end if;

  if not v_order.terms_accepted then
    raise exception 'Terms must be accepted'
      using errcode = 'P0001', detail = 'terms_not_accepted';
  end if;

  -- 5. Compute order total. Matches GET /api/orders aggregate: line + addon,
  -- excludes stair carry per proto's `monthValue` definition. If there are
  -- no priced items, the order has no price and can't be ≥ 50% paid.
  select
    coalesce((select sum(unit_price * qty) from order_lines  where order_id = p_order_id), 0)
    + coalesce((select sum(unit_price * qty) from order_addons where order_id = p_order_id), 0)
  into v_total;

  if v_total <= 0 then
    raise exception 'Order total is zero — nothing to proceed'
      using errcode = 'P0001', detail = 'total_amount_missing';
  end if;

  v_paid_pct := (v_order.paid / v_total) * 100;
  if v_paid_pct < 50 then
    raise exception 'Payment must be at least 50 percent of total'
      using errcode = 'P0001', detail = 'payment_below_50';
  end if;

  -- 6. Atomic transition: update status + record history + audit. All three
  -- writes happen in the same TX since RPC bodies are implicitly transactional.
  update orders
     set status = 'proceed_order',
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    'Order proceeded · sent to logistics',
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.proceeded',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  -- 7. Return a slim payload — the API route re-fetches the full row with
  -- relations to keep response shape identical to GET /:id. Stick to JSON
  -- to keep the caller language-agnostic.
  return jsonb_build_object(
    'id', v_order.id,
    'dl', v_order.dl,
    'status', 'proceed_order'
  );
end;
$$;

-- Lock down — only authenticated callers can execute, same as create_order.
revoke all on function public.proceed_order(uuid) from public;
grant execute on function public.proceed_order(uuid) to authenticated;
