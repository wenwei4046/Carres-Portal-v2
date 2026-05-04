-- =============================================================================
-- 0024_logistics_pipeline_v2_rpcs.sql — Phase 4 Pipeline v2 (C2)
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-pipeline-v2-spec.md §5
-- Depends on: 0023_logistics_stage_enum_extend.sql (adds 'placed' +
--             'proceed_request' enum values used by these RPCs)
--
-- Why:
--   Pipeline v2 introduces a pre-triage step. Previously `proceed_order`
--   auto-picked a warehouse and auto-staged the order to either
--   `awaiting_stock` or `ready_to_dispatch` based on shortages. Loo wants
--   logistics to triage the order explicitly — so `proceed_order` now flips
--   to a new `proceed_request` stage and the new RPC
--   `logistics_confirm_proceed_request` does the warehouse pick + stock
--   evaluation. Phase 2C blocker checks (signature, T&C, payment >= 50 %,
--   etc.) are preserved verbatim from 0008.
--
--   Pipeline v2 also activates the `stock_balances.reserved` column that
--   was added in 0018 but never written. Every transition into
--   `ready_to_dispatch` MUST `reserved += line.qty` (centralised in the
--   helper `_logistics_reserve_order`); every transition out of an
--   already-reserved stage (delivery, abandon) MUST release the reservation
--   via `_logistics_release_order_reserve`.
--
-- Summary of changes (6):
--   1. _logistics_reserve_order(p_order_id)           — NEW internal helper
--   2. _logistics_release_order_reserve(p_order_id)   — NEW internal helper
--   3. proceed_order(uuid)                            — modified
--                                                       sets stage='proceed_request',
--                                                       drops 0019's auto-pick logic
--   4. logistics_confirm_proceed_request(uuid, uuid)  — NEW public RPC
--   5. logistics_warehouse_pick(uuid, uuid)           — modified
--                                                       (source stage now
--                                                        IN (proceed_request,
--                                                            awaiting_stock);
--                                                        delegates reserve to
--                                                        helper)
--   6. logistics_receive_po_line(text, text, int)     — modified
--                                                       (auto-promote path
--                                                        delegates reserve to
--                                                        helper)
--   7. logistics_attach_do_and_deliver(...)           — modified
--                                                       (release reserve via
--                                                        helper before qty
--                                                        decrement)
--   8. logistics_abandon_order(uuid, text)            — modified
--                                                       (release reserve via
--                                                        helper when current
--                                                        stage in
--                                                        (ready_to_dispatch,
--                                                         dispatched))
--
-- Note: cancel_order (0011) is intentionally NOT modified. cancel_order is a
-- place-only RPC (status='place' guard); orders in 'place' have no reserve
-- held — the spec line "release on cancel_order" is therefore a no-op in
-- current behaviour. If a future migration relaxes cancel_order to operate
-- post-Proceed, that migration must add the helper call.
-- =============================================================================


-- =============================================================================
-- 1. INTERNAL HELPERS — _logistics_reserve_order / _logistics_release_order_reserve
-- =============================================================================
-- These are the single source of truth for reserve / release semantics. Every
-- RPC that flips an order into / out of a reserved stage delegates here so
-- the reserve invariant is enforced in exactly one place. Both helpers
-- assume an order row lock (`select ... for update`) has already been taken
-- by the calling RPC — they DO NOT lock the order again. They DO take a
-- per-(sku, warehouse_id) row lock on stock_balances via the UPDATE.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- _logistics_reserve_order(p_order_id uuid) -> void
-- For each order_line of the order, increment stock_balances.reserved by
-- line.qty at the order's warehouse_id.
-- Asserts orders.warehouse_id IS NOT NULL (caller must pre-assign).
-- Side effect: writes one stock_balances row UPDATE per distinct SKU.
-- Errors:
--   • SQLSTATE 22023, detail = 'warehouse_required'        — order has no warehouse
--   • SQLSTATE P0001, detail = 'insufficient_stock_for_reserve'
--                                                          — qty < reserved+delta
--                                                            on at least one SKU.
--                                                            DETAIL2 carries
--                                                            the offending sku +
--                                                            warehouse_id pair so
--                                                            the API route can
--                                                            surface it to the UI.
-- Does NOT write order_history / audit_log — caller decides the message.
-- ----------------------------------------------------------------------------
create function public._logistics_reserve_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_warehouse_id uuid;
  v_line         record;
begin
  select warehouse_id into v_warehouse_id from orders where id = p_order_id;
  if v_warehouse_id is null then
    raise exception 'order has no warehouse — assign one before reserving'
      using errcode = '22023', detail = 'warehouse_required';
  end if;

  for v_line in
    select sku, qty from order_lines where order_id = p_order_id
  loop
    -- The (qty >= reserved) CHECK from 0018 will trip if the SKU is short.
    -- Catch + rethrow as a domain-coded error carrying the offending
    -- (sku, warehouse_id) pair — caller relays this to the UI.
    begin
      update stock_balances
         set reserved   = reserved + v_line.qty,
             updated_at = now()
       where sku = v_line.sku
         and warehouse_id = v_warehouse_id;

      -- If no row exists at this (sku, warehouse_id), there's no stock to
      -- reserve against — treat as insufficient.
      if not found then
        raise exception 'no stock_balances row for sku=% warehouse_id=%',
                        v_line.sku, v_warehouse_id
          using errcode = 'P0001',
                detail  = 'insufficient_stock_for_reserve',
                hint    = format('sku=%s warehouse_id=%s',
                                 v_line.sku, v_warehouse_id);
      end if;
    exception
      when check_violation then
        raise exception 'cannot reserve sku=% at warehouse=% (qty < reserved + %)',
                        v_line.sku, v_warehouse_id, v_line.qty
          using errcode = 'P0001',
                detail  = 'insufficient_stock_for_reserve',
                hint    = format('sku=%s warehouse_id=%s',
                                 v_line.sku, v_warehouse_id);
    end;
  end loop;
end;
$$;

revoke all on function public._logistics_reserve_order(uuid) from public;
-- Internal helper: only the SECURITY DEFINER RPCs in this file should call
-- this. Do NOT expose to the authenticated role.


-- ----------------------------------------------------------------------------
-- _logistics_release_order_reserve(p_order_id uuid) -> void
-- For each order_line of the order, decrement stock_balances.reserved by
-- line.qty at the order's warehouse_id, clamped via GREATEST(0, ...) so a
-- legacy gap (reserved column was added in 0018 but never written before
-- 0024) cannot drive reserved negative.
-- No-op when order has no warehouse_id (defensive — abandon path can be
-- called on orders that never reached ready_to_dispatch).
-- ----------------------------------------------------------------------------
create function public._logistics_release_order_reserve(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_warehouse_id uuid;
  v_line         record;
begin
  select warehouse_id into v_warehouse_id from orders where id = p_order_id;
  if v_warehouse_id is null then
    return;  -- nothing to release; defensive for legacy callers
  end if;

  for v_line in
    select sku, qty from order_lines where order_id = p_order_id
  loop
    -- GREATEST clamp: defensive against legacy rows where reserve was never
    -- set on the way up. We never want this to push reserved negative
    -- (would violate the reserved >= 0 CHECK from 0018) and we never want
    -- it to fail loudly — release is best-effort cleanup.
    update stock_balances
       set reserved   = greatest(0, reserved - v_line.qty),
           updated_at = now()
     where sku = v_line.sku
       and warehouse_id = v_warehouse_id;
  end loop;
end;
$$;

revoke all on function public._logistics_release_order_reserve(uuid) from public;
-- Internal helper: see same note above.


-- =============================================================================
-- 2. proceed_order — STRIP 0019 auto-stage logic, set stage='proceed_request'
-- =============================================================================
-- Per spec §5 row 1: proceed_order should now ONLY flip status='proceed_order'
-- + logistics_stage='proceed_request'. The auto-pick warehouse + auto-reserve
-- + auto-decide awaiting_stock vs ready_to_dispatch logic that 0019 inserted
-- has been moved to the new logistics_confirm_proceed_request RPC, which
-- logistics triggers manually after triage.
--
-- Rest of body (cross-dealer guard, blocker checks, audit/history writes,
-- 50 % payment gate) is unchanged — those checks happen at the same trust
-- boundary as before. Body matches 0008 verbatim, plus the
-- logistics_stage='proceed_request' assignment in the same UPDATE.
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
  -- salesperson can only proceed their own. Mirrors create_order (0006).
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
  -- API route can relay the exact failure to the UI.
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

  -- 5. Compute order total (line + addon, excludes stair carry).
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

  -- 6. Atomic transition. Pipeline v2: set logistics_stage='proceed_request'
  -- in the same UPDATE so the order shows up in logistics' Proceed Request
  -- column. NO auto-pick warehouse / auto-reserve here — that's
  -- logistics_confirm_proceed_request's job once logistics has triaged.
  update orders
     set status          = 'proceed_order',
         logistics_stage = 'proceed_request',
         updated_at      = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    'Order proceeded · awaiting logistics triage',
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.proceeded',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  return jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'status',          'proceed_order',
    'logistics_stage', 'proceed_request'
  );
end;
$$;

revoke all on function public.proceed_order(uuid) from public;
grant execute on function public.proceed_order(uuid) to authenticated;


-- =============================================================================
-- 3. logistics_confirm_proceed_request — NEW
-- =============================================================================
-- Logistics manual triage entry point. Replaces the auto-stage logic that
-- 0019's proceed_order extension used to do. Caller MUST be in
-- (logistics, principal, bd) — finance is excluded since this is a
-- supply-side operation.
--
-- Behaviour:
--   • Locks the order row.
--   • Asserts current logistics_stage = 'proceed_request' (else 22023).
--   • Optional p_warehouse_id assigns warehouse. If null AND order has no
--     warehouse_id, raise 22023 detail='warehouse_required'.
--   • For each order line, compute available = (qty - reserved) at the
--     order's warehouse. If every line has available >= line.qty, transition
--     to 'ready_to_dispatch' AND call _logistics_reserve_order. Otherwise
--     transition to 'awaiting_stock' (no reserve held; logistics will
--     issue POs from there).
--   • Writes order_history + audit_log describing the decision.
--
-- Errors:
--   • 42501 — caller role not in (logistics, principal, bd)
--   • 42P01 — order not found
--   • 22023 — wrong_stage / warehouse_required
-- =============================================================================
create function public.logistics_confirm_proceed_request(
  p_order_id     uuid,
  p_warehouse_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_actor            text;
  v_warehouse_id     uuid;
  v_warehouse_name   text;
  v_short_count      int;
  v_short_skus       text;
  v_reserved_skus    text;
  v_new_stage        logistics_stage;
begin
  v_role := public.app_role();

  if v_role not in ('logistics','principal','bd') then
    raise exception 'forbidden: logistics/principal/bd only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 1. Lock the order row.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- 2. Stage guard — must be in proceed_request to confirm.
  if v_order.logistics_stage is distinct from 'proceed_request' then
    raise exception 'order is not in proceed_request stage'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  -- 3. Warehouse resolution.
  if p_warehouse_id is not null then
    if not exists (select 1 from warehouses where id = p_warehouse_id) then
      raise exception 'warehouse not found'
        using errcode = '42P01', detail = 'warehouse_not_found';
    end if;
    v_warehouse_id := p_warehouse_id;
    update orders
       set warehouse_id = p_warehouse_id,
           updated_at   = now()
     where id = p_order_id;
  else
    if v_order.warehouse_id is null then
      raise exception 'warehouse must be assigned before confirming'
        using errcode = '22023', detail = 'warehouse_required';
    end if;
    v_warehouse_id := v_order.warehouse_id;
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()),
                      initcap(v_role::text));

  -- 4. Compute shortage. A line is short when (qty - reserved) at the
  -- chosen warehouse is below the line.qty. Missing stock_balances row
  -- counts as shortage (treat available as 0). Single query: count short
  -- lines + comma-list of short SKUs (for awaiting-stock message) + comma-
  -- list of all order SKUs (for ready-to-dispatch message).
  select
    count(*) filter (where (coalesce(sb.qty, 0)
                              - coalesce(sb.reserved, 0)) < ol.qty),
    coalesce(string_agg(ol.sku, ', ')
               filter (where (coalesce(sb.qty, 0)
                                - coalesce(sb.reserved, 0)) < ol.qty),
             ''),
    coalesce(string_agg(ol.sku, ', '), '')
    into v_short_count, v_short_skus, v_reserved_skus
    from order_lines ol
    left join stock_balances sb
           on sb.sku = ol.sku
          and sb.warehouse_id = v_warehouse_id
   where ol.order_id = p_order_id;

  select name into v_warehouse_name from warehouses where id = v_warehouse_id;

  -- 5. Branch on shortage. All-clear → ready_to_dispatch + reserve. Any
  -- shortage → awaiting_stock (no reserve; logistics will issue POs).
  if v_short_count = 0 then
    -- Reserve first; if helper raises insufficient_stock_for_reserve a race
    -- happened between availability check and reserve. Let it bubble up so
    -- the API route can retry / inform user.
    perform public._logistics_reserve_order(p_order_id);

    update orders
       set logistics_stage = 'ready_to_dispatch',
           updated_at      = now()
     where id = p_order_id;

    v_new_stage := 'ready_to_dispatch';

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed at %s · ready to dispatch · reserved: %s',
             coalesce(v_warehouse_name, 'warehouse'),
             v_reserved_skus),
      v_role
    );
  else
    update orders
       set logistics_stage = 'awaiting_stock',
           updated_at      = now()
     where id = p_order_id;

    v_new_stage := 'awaiting_stock';

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed at %s · awaiting stock for %s SKU(s): %s',
             coalesce(v_warehouse_name, 'warehouse'),
             v_short_count,
             v_short_skus),
      v_role
    );
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (v_role, v_actor,
          format('Confirmed proceed-request DL-%s · %s',
                 v_order.dl, v_new_stage::text),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'status',          v_order.status,
    'logistics_stage', v_new_stage,
    'warehouse_id',    v_warehouse_id,
    'reserved',        (v_short_count = 0)
  );
end;
$$;

revoke all on function public.logistics_confirm_proceed_request(uuid, uuid) from public;
grant execute on function public.logistics_confirm_proceed_request(uuid, uuid) to authenticated;


-- =============================================================================
-- 4. logistics_warehouse_pick — extend stage guard + delegate reserve to helper
-- =============================================================================
-- Spec §5 row "logistics_transfer_to_ready_to_dispatch" maps to this RPC
-- (same semantics: flip a triaged order to ready_to_dispatch when stock is
-- there, possibly after switching warehouse). Pipeline v2 changes:
--   • Source-stage guard widens from `= 'awaiting_stock'` to
--     IN ('proceed_request', 'awaiting_stock') so logistics can transfer
--     directly without stopping at awaiting_stock when stock was already
--     adequate.
--   • Inline reserve loop → _logistics_reserve_order helper call, so the
--     helper's CHECK-violation rethrow surfaces the offending sku.
--   • Body otherwise unchanged.
-- =============================================================================
create or replace function public.logistics_warehouse_pick(
  p_order_id     uuid,
  p_warehouse_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order          orders;
  v_warehouse_name text;
  v_actor          text;
  v_shortage_count int;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- v2: allow proceed_request as a valid source stage too, so logistics can
  -- skip awaiting_stock when stock was already enough at confirm time but
  -- they want to override the warehouse anyway.
  if v_order.logistics_stage not in ('proceed_request', 'awaiting_stock')
     or v_order.status <> 'proceed_order' then
    raise exception 'order is not in proceed_request/awaiting_stock state'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  if exists (
    select 1 from purchase_orders
     where (dl = v_order.dl or v_order.dl = ANY(coalesce(dl_refs, array[]::int[])))
       and status = 'open'
  ) then
    raise exception 'cannot change warehouse while open POs exist'
      using errcode = 'P0001', detail = 'has_open_pos';
  end if;

  if p_warehouse_id is null then
    raise exception 'warehouse must be assigned'
      using errcode = '22023', detail = 'warehouse_required';
  end if;

  if not exists (select 1 from warehouses where id = p_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = '42P01', detail = 'warehouse_not_found';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update orders
     set warehouse_id = p_warehouse_id,
         updated_at   = now()
   where id = p_order_id;

  select count(*) into v_shortage_count
    from public.logistics_calc_shortages(p_order_id, p_warehouse_id);

  select name into v_warehouse_name from warehouses where id = p_warehouse_id;

  if v_shortage_count = 0 then
    -- Delegate to helper. Raises insufficient_stock_for_reserve if a race
    -- ate the available stock between calc_shortages and reserve.
    perform public._logistics_reserve_order(p_order_id);

    update orders
       set logistics_stage = 'ready_to_dispatch',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Warehouse changed to %s · ready to dispatch (auto)',
             coalesce(v_warehouse_name, 'warehouse')),
      'logistics'
    );
  else
    update orders
       set logistics_stage = 'awaiting_stock',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Warehouse changed to %s · awaiting stock for %s SKUs',
             coalesce(v_warehouse_name, 'warehouse'),
             v_shortage_count),
      'logistics'
    );
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Warehouse pick · DL-%s · %s', v_order.dl,
                 coalesce(v_warehouse_name, 'warehouse')),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'warehouse_id',    p_warehouse_id,
    'logistics_stage', (select logistics_stage from orders where id = p_order_id),
    'shortages',       v_shortage_count
  );
end;
$$;

revoke all on function public.logistics_warehouse_pick(uuid, uuid) from public;
grant execute on function public.logistics_warehouse_pick(uuid, uuid) to authenticated;


-- =============================================================================
-- 5. logistics_receive_po_line — auto-promote path delegates reserve to helper
-- =============================================================================
-- The auto-promote path inside this RPC (PO fully received → flip
-- awaiting_stock orders to ready_to_dispatch) used to inline the reserve
-- loop. Pipeline v2 swaps that loop for a _logistics_reserve_order helper
-- call so reserve semantics are centralised. Everything else (PO line
-- update, stock_balances qty UPDATE, stock_movements 'in' insert, PO status
-- flip, audit log) is unchanged.
-- =============================================================================
create or replace function public.logistics_receive_po_line(
  p_po_id          text,
  p_sku            text,
  p_received_qty   int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po                  purchase_orders;
  v_line                purchase_order_lines;
  v_delta               int;
  v_actor               text;
  v_outstanding         int;
  v_new_status          po_status;
  v_target_order        record;
  v_promote_shortages   int;
  v_warehouse_name      text;
  v_orders_promoted     jsonb := '[]'::jsonb;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status not in ('open','partial') then
    raise exception 'PO is closed (status=%)', v_po.status
      using errcode = '22023', detail = 'po_closed';
  end if;

  select * into v_line
    from purchase_order_lines
   where po_id = p_po_id and sku = p_sku
   for update;
  if not found then
    raise exception 'PO line not found'
      using errcode = '42P01', detail = 'po_line_not_found';
  end if;

  if p_received_qty < 0 then
    raise exception 'received_qty must be >= 0'
      using errcode = 'P0001', detail = 'invalid_received_qty';
  end if;

  if p_received_qty > v_line.qty then
    raise exception 'over received: % vs ordered %', p_received_qty, v_line.qty
      using errcode = 'P0001', detail = 'over_received';
  end if;

  v_delta := p_received_qty - v_line.received_qty;
  if v_delta < 0 then
    raise exception 'received_qty must be >= currently received (%)', v_line.received_qty
      using errcode = 'P0001', detail = 'over_received';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_order_lines
     set received_qty = p_received_qty
   where po_id = p_po_id and sku = p_sku;

  -- Lock the stock_balances row before update.
  perform 1 from stock_balances
   where sku = p_sku and warehouse_id = v_po.warehouse_id
   for update;

  if v_delta > 0 then
    insert into stock_balances (sku, warehouse_id, qty)
    values (p_sku, v_po.warehouse_id, v_delta)
    on conflict (sku, warehouse_id) do update
      set qty = stock_balances.qty + v_delta,
          updated_at = now();

    insert into stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    values
      (p_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, 'logistics', auth.uid());
  end if;

  -- All lines fully received? Flip PO status.
  select count(*) into v_outstanding
    from purchase_order_lines
   where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    update purchase_orders
       set status = 'received', updated_at = now()
     where id = p_po_id;
    v_new_status := 'received';
  else
    v_new_status := v_po.status;
  end if;

  -- Auto-promote any awaiting_stock orders that have this SKU and now have
  -- their shortages cleared. Lock each order row before evaluating. Pipeline
  -- v2: reserve via helper rather than inline loop.
  for v_target_order in
    select o.id, o.dl, o.dealer_id, o.warehouse_id
      from orders o
     where o.status = 'proceed_order'
       and o.logistics_stage = 'awaiting_stock'
       and o.warehouse_id = v_po.warehouse_id
       and exists (
         select 1 from order_lines ol
          where ol.order_id = o.id and ol.sku = p_sku
       )
     for update
  loop
    select count(*) into v_promote_shortages
      from public.logistics_calc_shortages(v_target_order.id, v_target_order.warehouse_id);

    if v_promote_shortages = 0 then
      -- Pipeline v2: helper enforces (qty >= reserved) check + raises
      -- insufficient_stock_for_reserve if a race depleted stock.
      perform public._logistics_reserve_order(v_target_order.id);

      update orders
         set logistics_stage = 'ready_to_dispatch',
             updated_at      = now()
       where id = v_target_order.id;

      select name into v_warehouse_name
        from warehouses where id = v_target_order.warehouse_id;

      insert into order_history (order_id, text, by_role)
      values (
        v_target_order.id,
        format('Stock confirmed at %s · ready to dispatch (auto)',
               coalesce(v_warehouse_name, 'warehouse')),
        'logistics'
      );

      insert into audit_log (role, actor_text, action, dealer_id, ref)
      values ('logistics', v_actor,
              format('Auto-promoted DL-%s · ready to dispatch', v_target_order.dl),
              v_target_order.dealer_id, 'DL-' || v_target_order.dl::text);

      v_orders_promoted := v_orders_promoted || jsonb_build_object(
        'id', v_target_order.id,
        'dl', v_target_order.dl
      );
    end if;
  end loop;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Received %s units of %s on %s', v_delta, p_sku, p_po_id),
          (select o.dealer_id from orders o where o.dl = v_po.dl limit 1),
          p_po_id);

  return jsonb_build_object(
    'po_id',           p_po_id,
    'sku',             p_sku,
    'received_qty',    p_received_qty,
    'delta',           v_delta,
    'po_status',       v_new_status,
    'orders_promoted', v_orders_promoted
  );
end;
$$;

revoke all on function public.logistics_receive_po_line(text, text, int) from public;
grant execute on function public.logistics_receive_po_line(text, text, int) to authenticated;


-- =============================================================================
-- 6. logistics_attach_do_and_deliver — release reserve before qty decrement
-- =============================================================================
-- The "DO upload + delivered" RPC currently decrements both qty AND reserved
-- in a single UPDATE per line. Pipeline v2 splits that: release reserve via
-- the helper FIRST (so the (qty >= reserved) CHECK always holds during the
-- subsequent qty-decrement step), then decrement qty. Movement log + history
-- + audit are unchanged.
--
-- Why split: keeping reserve release in the helper means the same logic
-- runs for delivered, abandon, and any future cancel-after-proceed path.
-- Single source of truth, single place to audit.
-- =============================================================================
create or replace function public.logistics_attach_do_and_deliver(
  p_order_id  uuid,
  p_do_number text,
  p_do_note   text,
  p_signed    boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   orders;
  v_actor   text;
  v_line    record;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_signed is null or p_signed = false then
    raise exception 'customer must sign DO'
      using errcode = 'P0001', detail = 'do_required';
  end if;

  if p_do_number is null or length(btrim(p_do_number)) < 3 then
    raise exception 'DO number must be at least 3 characters'
      using errcode = 'P0001', detail = 'do_required';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.logistics_stage is distinct from 'dispatched'
     or v_order.status <> 'proceed_order' then
    raise exception 'order is not in dispatched state'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update orders
     set status          = 'delivered',
         logistics_stage = 'delivered',
         do_number       = btrim(p_do_number),
         do_note         = nullif(btrim(coalesce(p_do_note, '')), ''),
         delivered_at    = now(),
         updated_at      = now()
   where id = p_order_id;

  -- Pipeline v2: release reserve FIRST, then decrement qty. The helper
  -- clamps via GREATEST(0, ...) so legacy reserve-zero rows don't fail.
  perform public._logistics_release_order_reserve(p_order_id);

  -- Now decrement qty. Reserved is already lowered, so the
  -- (qty >= reserved) CHECK can never trip during this step.
  for v_line in
    select sku, qty from order_lines where order_id = p_order_id
  loop
    update stock_balances
       set qty        = qty - v_line.qty,
           updated_at = now()
     where sku = v_line.sku
       and warehouse_id = v_order.warehouse_id;

    insert into stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    values
      (v_line.sku, v_order.warehouse_id, -v_line.qty, 'out',
       'DL-' || v_order.dl::text, 'logistics', auth.uid());
  end loop;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('Delivered · DO %s', btrim(p_do_number)),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Delivered DL-%s · DO %s', v_order.dl, btrim(p_do_number)),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'status',          'delivered',
    'logistics_stage', 'delivered',
    'do_number',       btrim(p_do_number),
    'delivered_at',    now()
  );
end;
$$;

revoke all on function public.logistics_attach_do_and_deliver(uuid, text, text, boolean) from public;
grant execute on function public.logistics_attach_do_and_deliver(uuid, text, text, boolean) to authenticated;


-- =============================================================================
-- 7. logistics_abandon_order — release reserve via helper
-- =============================================================================
-- Existing RPC released reserve inline only when current stage was in
-- (ready_to_dispatch, dispatched). Pipeline v2 keeps the same scope but
-- delegates to the helper so the GREATEST(0, ...) clamp protects against
-- any legacy reserve gaps. Body otherwise unchanged.
-- =============================================================================
create or replace function public.logistics_abandon_order(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders;
  v_actor text;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.status <> 'proceed_order' then
    raise exception 'order is not in proceed_order state'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- Release any reservation only when the order had stock reserved (i.e. it
  -- was past awaiting_stock). proceed_request / awaiting_stock orders never
  -- held a reserve, so no release is needed for them. Helper clamps with
  -- GREATEST(0, ...) so legacy zero-reserve rows are safe.
  if v_order.logistics_stage in ('ready_to_dispatch', 'dispatched') then
    perform public._logistics_release_order_reserve(p_order_id);
  end if;

  -- See 0019 top-of-file note: logistics_stage enum lacks 'cancelled', so
  -- we clear it to NULL. orders.status='cancelled' is the source of truth.
  update orders
     set status          = 'cancelled',
         logistics_stage = null,
         updated_at      = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('Order abandoned · %s', p_reason),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Abandoned DL-%s · %s', v_order.dl, p_reason),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'status',          'cancelled',
    'logistics_stage', null
  );
end;
$$;

revoke all on function public.logistics_abandon_order(uuid, text) from public;
grant execute on function public.logistics_abandon_order(uuid, text) to authenticated;
