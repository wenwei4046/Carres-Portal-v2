-- 0129_deep_audit_cascade_fixes.sql
-- 2026-05-18 (Loo "deep audit one time" + "go")
--
-- BACKGROUND
--   After 0128 fixed `operation_attach_do_and_deliver` to cascade to threads,
--   a deep audit across all operation/partner/supplier RPCs found 3 more
--   asymmetric-write gaps + 1 dead-code function. This migration closes them
--   in a single pass.
--
-- DB-state audit checked 6 dimensions across the prod DB:
--   * order/thread stage rollup consistency
--   * thread/PO state coherence
--   * stock anomalies (negative qty, over-reserve, null warehouse_id)
--   * thread.delivered_at vs operation_stage consistency
--   * orphan threads
--   * warehouse_id chain drift + pickup event linkage
--   All 6 returned ZERO inconsistencies after 0127 + 0128 backfills.
--
-- FIXES (in priority order)
--
-- 1) HIGH — `partner_threads_to_deliver` now filters out cancelled orders.
--    Operation can `operation_abandon_order` an order → orders.status =
--    'cancelled', operation_stage = NULL. But threads' operation_stage stays
--    at whatever ('dispatched'/'ready_to_dispatch'/...). Without this fix
--    the Logistics Partner kanban would surface the abandoned order as still
--    scheduled. Same pattern as 0128's operation→thread cascade gap, but the
--    cleanest fix is to filter at read time (no enum extension needed; the
--    operation_stage enum has no 'cancelled' value).
--
-- 2) MEDIUM — `operation_warehouse_pick` now cascades warehouse_id to
--    threads. The function changes orders.warehouse_id but didn't update
--    threads. If threads had warehouse_id set previously (e.g., from a
--    cancelled PO whose warehouse hint was never cleared — see fix #3),
--    the thread/order pair would drift. After this fix, threads are
--    aligned with the new warehouse_id.
--
-- 3) LOW — `operation_cancel_po` now also nullifies thread.warehouse_id
--    when detaching the thread from the cancelled PO. Without this, threads
--    keep the cancelled PO's warehouse hint indefinitely. With #2 in place,
--    the next warehouse_pick / claim will refresh it, but a clean NULL
--    here makes the data state obviously transient.
--
-- 4) LOW — DROP legacy `operation_confirm_proceed_request(uuid, uuid)`.
--    The v1 function predates the per-thread architecture. The API route
--    (apps/api/src/routes/operation/orders.ts:493) calls
--    `operation_confirm_proceed_request_v3` exclusively. The legacy v1 is
--    not called by any other DB function or any frontend / API code path.
--    It would do the wrong thing if accidentally invoked (sets order stage
--    without creating threads). Drop = safer than leaving as latent bug.
--
-- CARRY-FORWARD (NOT IN THIS MIGRATION)
--   * Other functions joining `orders` without `status <> 'cancelled'`
--     filter: supplier_pending_demand, dealer_with_stats,
--     dealers_with_stats_list, partner_orders_for_threads,
--     supplier_threads_for_po, supplier_orders_for_threads,
--     partner_confirm_receive. Most are caller-driven (filtered upstream).
--     Audit + decide per-function in follow-up if any kanban-equivalent
--     surface surfaces cancelled orders.
--
-- Loo authorised in conversation 2026-05-18 ("go") per CLAUDE.md §14 #1
-- single-instance approval.


-- =============================================================================
-- FIX 1 — partner_threads_to_deliver filters cancelled orders
-- =============================================================================
CREATE OR REPLACE FUNCTION public.partner_threads_to_deliver()
 RETURNS TABLE(thread_id uuid, order_id uuid, po_id text, customer_name text, customer_address text, customer_phone text, dispatched_at timestamp with time zone, confirm_delivery_date date, do_number text, operation_stage text, delivered_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  v_partner_id := public.app_partner_id();

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;

  RETURN QUERY
  SELECT
    t.id                       AS thread_id,
    t.order_id                 AS order_id,
    t.po_id                    AS po_id,
    o.customer_name            AS customer_name,
    o.customer_address         AS customer_address,
    o.customer_phone           AS customer_phone,
    t.updated_at               AS dispatched_at,
    t.confirm_delivery_date    AS confirm_delivery_date,
    o.do_number                AS do_number,
    t.operation_stage::text    AS operation_stage,
    t.delivered_at             AS delivered_at
  FROM order_supplier_threads t
  JOIN orders o ON o.id = t.order_id
  WHERE t.delivery_partner_id = v_partner_id
    -- 0129: filter cancelled orders so abandon doesn't leave ghost rows
    -- in the partner kanban. operation_stage enum has no 'cancelled' value
    -- so we filter at the order.status layer instead.
    AND o.status <> 'cancelled'
    AND (
      t.operation_stage = 'dispatched'
      OR (
        t.operation_stage = 'delivered'
        AND t.delivered_at IS NOT NULL
        AND t.delivered_at >= now() - interval '30 days'
      )
    )
  ORDER BY
    CASE WHEN t.operation_stage = 'dispatched' THEN 0 ELSE 1 END,
    COALESCE(t.delivered_at, t.updated_at) DESC;
END;
$function$;


-- =============================================================================
-- FIX 2 — operation_warehouse_pick cascades warehouse_id to threads
-- =============================================================================
CREATE OR REPLACE FUNCTION public.operation_warehouse_pick(p_order_id uuid, p_warehouse_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order          orders;
  v_warehouse_name text;
  v_actor          text;
  v_shortage_count int;
  v_threads_synced int;
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.operation_stage not in ('proceed_request', 'awaiting_operation_action')
     or v_order.status <> 'proceed_order' then
    raise exception 'order is not in proceed_request/awaiting_logistics_action state'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  if exists (
    select 1 from purchase_orders
     where (so = v_order.so or v_order.so = ANY(coalesce(so_refs, array[]::int[])))
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

  -- 0129: cascade warehouse_id to all threads of this order so the chain
  -- (order → thread → reserved stock) stays aligned. Threads may have an
  -- inherited warehouse_id from a previously cancelled PO; this UPDATE
  -- normalises them to the just-picked warehouse.
  update order_supplier_threads
     set warehouse_id = p_warehouse_id,
         updated_at   = now()
   where order_id = p_order_id
     and warehouse_id is distinct from p_warehouse_id;
  get diagnostics v_threads_synced = row_count;

  select count(*) into v_shortage_count
    from public.operation_calc_shortages(p_order_id, p_warehouse_id);

  select name into v_warehouse_name from warehouses where id = p_warehouse_id;

  if v_shortage_count = 0 then
    perform public._operation_reserve_order(p_order_id);

    update orders
       set operation_stage = 'ready_to_dispatch',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Warehouse changed to %s · ready to dispatch (auto)%s',
             coalesce(v_warehouse_name, 'warehouse'),
             CASE WHEN v_threads_synced > 0
                  THEN format(' · %s thread(s) synced', v_threads_synced)
                  ELSE '' END),
      'operation'
    );
  else
    update orders
       set operation_stage = 'awaiting_operation_action',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Warehouse changed to %s · awaiting stock for %s SKUs%s',
             coalesce(v_warehouse_name, 'warehouse'),
             v_shortage_count,
             CASE WHEN v_threads_synced > 0
                  THEN format(' · %s thread(s) synced', v_threads_synced)
                  ELSE '' END),
      'operation'
    );
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor,
          format('Warehouse pick · DL-%s · %s', v_order.so,
                 coalesce(v_warehouse_name, 'warehouse')),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'so',              v_order.so,
    'warehouse_id',    p_warehouse_id,
    'operation_stage', (select operation_stage from orders where id = p_order_id),
    'shortages',       v_shortage_count,
    'threads_synced',  v_threads_synced
  );
end;
$function$;


-- =============================================================================
-- FIX 3 — operation_cancel_po also nullifies thread.warehouse_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.operation_cancel_po(p_po_id text, p_reason text)
 RETURNS purchase_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po               purchase_orders;
  v_dealer_id        uuid;
  v_actor            text;
  v_threads_released int;
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if v_po.so is not null then
    select dealer_id into v_dealer_id
      from orders where so = v_po.so
      limit 1;
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  -- 0129: also null thread.warehouse_id when detaching from a cancelled PO.
  -- Without this, the thread keeps the cancelled PO's warehouse hint
  -- indefinitely. Next claim or warehouse_pick will refresh it.
  update order_supplier_threads
     set po_id        = null,
         warehouse_id = null,
         updated_at   = now()
   where po_id = p_po_id;
  get diagnostics v_threads_released = row_count;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'operation',
    v_actor,
    format('Cancelled PO %s · %s threads released · %s',
           p_po_id, v_threads_released, p_reason),
    v_dealer_id,
    p_po_id
  );

  return v_po;
end;
$function$;


-- =============================================================================
-- FIX 4 — DROP legacy operation_confirm_proceed_request(uuid, uuid)
-- =============================================================================
-- Verified callers:
--   * pg_proc: ZERO functions reference the v1 form (only v3 is called)
--   * apps/api: only operation_confirm_proceed_request_v3 is invoked
--   * apps/web: 2 comment references in queries.ts + ConfirmProceedDialog.tsx
--     (documentation only, not runtime calls)
-- Safe to drop.
DROP FUNCTION IF EXISTS public.operation_confirm_proceed_request(uuid, uuid);


-- =============================================================================
-- SANITY CHECK
-- =============================================================================
DO $sanity$
DECLARE
  legacy_still_exists int;
  partner_filter_present boolean;
  warehouse_cascade_present boolean;
  cancel_po_cascade_present boolean;
BEGIN
  -- 4a: legacy v1 is gone
  SELECT count(*) INTO legacy_still_exists
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'operation_confirm_proceed_request';
  IF legacy_still_exists > 0 THEN
    RAISE EXCEPTION '0129 sanity FAILED — legacy operation_confirm_proceed_request still exists';
  END IF;

  -- 1a: partner_threads_to_deliver contains the cancelled filter
  SELECT pg_get_functiondef(oid) ~ 'o\.status\s*<>\s*''cancelled'''
    INTO partner_filter_present
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'partner_threads_to_deliver';
  IF NOT partner_filter_present THEN
    RAISE EXCEPTION '0129 sanity FAILED — partner_threads_to_deliver missing cancelled filter';
  END IF;

  -- 2a: operation_warehouse_pick contains thread UPDATE
  SELECT pg_get_functiondef(oid) ~ 'update\s+order_supplier_threads'
    INTO warehouse_cascade_present
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'operation_warehouse_pick';
  IF NOT warehouse_cascade_present THEN
    RAISE EXCEPTION '0129 sanity FAILED — operation_warehouse_pick missing thread cascade';
  END IF;

  -- 3a: operation_cancel_po nulls thread.warehouse_id
  SELECT pg_get_functiondef(oid) ~ 'warehouse_id\s*=\s*null'
    INTO cancel_po_cascade_present
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname = 'operation_cancel_po';
  IF NOT cancel_po_cascade_present THEN
    RAISE EXCEPTION '0129 sanity FAILED — operation_cancel_po missing warehouse_id null cascade';
  END IF;

  RAISE NOTICE '0129 sanity OK — all 4 audit fixes applied';
END
$sanity$;
