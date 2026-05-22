-- =============================================================================
-- 0147_lp_request_accept_reject.sql — Portal-native LP request/accept/reject
-- 2026-05-23 (Loo authorised in conversation per CLAUDE.md §7 + §14 #2).
--
-- Item h in the 2026-05-22 checkpoint, reframed against the portal-only flow
-- (Inbox/AutoCount path is being retired — every new order starts in portal).
--
-- The "customer-leg LP" used to be picked LATE: only when Operation flipped a
-- ready_to_dispatch order to dispatched via operation_assign_partner. That made
-- LPs blind to upcoming work until the very last moment.
--
-- New flow (Item h):
--   1. Dealer opens order in portal (4-step wizard).
--   2. Dealer pushes — order enters proceed_request.
--   3. Operation opens ConfirmProceedDialog and picks BOTH warehouse + LP.
--      operation_confirm_proceed_request_v3 now requires p_delivery_partner_id
--      and writes it + request_for_delivery_at on the order.
--   4. LP sees the order in their portal "Incoming" list.
--   5. LP either accepts (lp_accept_order) or rejects with reason
--      (lp_reject_order). Reject bounces the order back to Operation's queue
--      with a red badge.
--   6. Operation reselects (operation_reselect_partner) — clears reject
--      timestamps, writes a new LP + new request_for_delivery_at. Loops to 4.
--   7. When LP accepts + goods are at warehouse + Operation triggers dispatch
--      (existing operation_assign_partner path), order → dispatched.
--
-- Schema additions on `orders`:
--   request_for_delivery_at  — when Operation requested this LP take the job.
--   partner_accepted_at      — when the chosen LP accepted.
--   partner_rejected_at      — when the chosen LP rejected (cleared on reselect).
--   partner_rejected_reason  — free-text LP reason (cleared on reselect).
--
-- All four columns mirror the per-thread fields that already exist on
-- order_supplier_threads (added by 0049 for the procurement leg). We use
-- order-level columns here because the customer-leg LP is per-order, not
-- per-supplier-thread.
--
-- RPCs:
--   operation_confirm_proceed_request_v3  -- MODIFIED: now takes (p_order_id,
--                                            p_delivery_partner_id). Drop+create
--                                            because signature changed.
--   lp_accept_order(p_order_id)           -- NEW
--   lp_reject_order(p_order_id, p_reason) -- NEW
--   operation_reselect_partner(p_order_id, p_partner_id)  -- NEW
--
-- RLS impact: NONE. Partner reads its incoming queue via a SECURITY DEFINER
-- RPC (lp_incoming_orders, added in a follow-up if needed) or via the existing
-- partner orders read policy. No policy changes here.
-- =============================================================================


-- ─── 1. Columns on orders ───────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS request_for_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS partner_accepted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS partner_rejected_at     timestamptz,
  ADD COLUMN IF NOT EXISTS partner_rejected_reason text;

COMMENT ON COLUMN orders.request_for_delivery_at IS
  'When Operation picked the customer-leg LP at Accept Proceed (or last reselect). '
  'NULL = LP not yet requested. Mirrors order_supplier_threads.request_for_delivery_at.';
COMMENT ON COLUMN orders.partner_accepted_at IS
  'When the assigned LP accepted via lp_accept_order. NULL = pending.';
COMMENT ON COLUMN orders.partner_rejected_at IS
  'When the assigned LP rejected via lp_reject_order. Cleared by '
  'operation_reselect_partner. NULL = no active reject.';
COMMENT ON COLUMN orders.partner_rejected_reason IS
  'Free-text reason supplied by the LP on reject (e.g. "out of capacity"). '
  'Cleared by operation_reselect_partner.';

-- Index for the LP "Incoming" list: orders the LP hasn't accepted or rejected yet.
CREATE INDEX IF NOT EXISTS orders_partner_incoming_idx
  ON orders (delivery_partner_id, request_for_delivery_at DESC)
  WHERE request_for_delivery_at IS NOT NULL
    AND partner_accepted_at IS NULL
    AND partner_rejected_at IS NULL;

-- Index for the Operation "LP rejected, reselect" surface.
CREATE INDEX IF NOT EXISTS orders_partner_rejected_idx
  ON orders (partner_rejected_at DESC)
  WHERE partner_rejected_at IS NOT NULL;


-- ─── 2. operation_confirm_proceed_request_v3 — MODIFIED (drop + create) ─────
-- Signature gains p_delivery_partner_id (REQUIRED). Body is the 0124
-- per-order_line iteration version verbatim PLUS:
--   - LP existence check up front (raises P0001/partner_not_found if missing).
--   - The three UPDATE orders statements (0-lines, no-coverage, final)
--     additionally set delivery_partner_id + request_for_delivery_at.
DROP FUNCTION IF EXISTS public.operation_confirm_proceed_request_v3(uuid);

CREATE OR REPLACE FUNCTION public.operation_confirm_proceed_request_v3(
  p_order_id            uuid,
  p_delivery_partner_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order            orders;
  v_actor            text;
  v_role             app_role;
  v_uid              uuid;
  v_line             record;
  v_supplier_slug    text;
  v_sop_name         text;
  v_threads_created  jsonb := '[]'::jsonb;
  v_thread_id        uuid;
  v_demand_total     int;
  v_demand_skus      int;
  v_chosen_wh        uuid;
  v_chosen_wh_name   text;
  v_demand           record;
  v_auto_skipped     boolean := false;
  v_threads_promoted int;
  v_partner_name     text;
begin
  v_role := public.app_role();
  v_uid  := (select auth.uid());

  if v_role is distinct from 'operation' then
    raise exception 'forbidden: operation only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- Item h: LP is required at Accept Proceed.
  if p_delivery_partner_id is null then
    raise exception 'delivery_partner_id is required (item h: LP picked at Accept Proceed)'
      using errcode = '22023', detail = 'partner_required';
  end if;
  select name into v_partner_name
    from delivery_partners where id = p_delivery_partner_id;
  if v_partner_name is null then
    raise exception 'delivery partner not found: %', p_delivery_partner_id
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.status is distinct from 'proceed_order' then
    raise exception 'order is not in proceed_order status (got %)', v_order.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if v_order.operation_stage is distinct from 'proceed_request' then
    raise exception 'order is not in proceed_request stage (got %)', v_order.operation_stage
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), 'Operation');

  -- Per-order_line thread creation (0124 logic, preserved verbatim).
  for v_line in
    select ol.id as order_line_id,
           ps.supplier_id,
           pm.category::text as category
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
     where ol.order_id = p_order_id
  loop
    select slug into v_supplier_slug
      from suppliers
     where id = v_line.supplier_id;

    if v_supplier_slug is null then
      raise exception 'supplier % has no slug -- 0032 backfill incomplete', v_line.supplier_id
        using errcode = 'P0001', detail = 'supplier_slug_missing';
    end if;

    v_sop_name := public._v3_resolve_sop_name(v_supplier_slug, v_line.category);
    if v_sop_name is null then
      raise exception 'no SOP for supplier=% category=%', v_supplier_slug, v_line.category
        using errcode = '22023', detail = 'sop_not_found';
    end if;

    insert into order_supplier_threads
      (order_id, order_line_id, supplier_id, category, sop_name, operation_stage)
    values
      (p_order_id, v_line.order_line_id, v_line.supplier_id, v_line.category,
       v_sop_name, 'awaiting_operation_action')
    on conflict (order_line_id) do update
      set sop_name        = excluded.sop_name,
          operation_stage = 'awaiting_operation_action',
          po_id           = null,
          warehouse_id    = null,
          reserved_at     = null,
          delivered_at    = null,
          updated_at      = now()
    returning id into v_thread_id;

    v_threads_created := v_threads_created || jsonb_build_object(
      'thread_id',    v_thread_id,
      'supplier_id',  v_line.supplier_id,
      'category',     v_line.category,
      'sop_name',     v_sop_name,
      'stage',        'awaiting_operation_action',
      'po_id',        null
    );
  end loop;

  -- Aggregate demand across order_lines.
  with thread_demand as (
    select ol.sku as sku, sum(ol.qty)::int as demand
      from order_lines ol
     where ol.order_id = p_order_id
     group by ol.sku
  )
  select count(*)::int, coalesce(sum(demand), 0)::int
    into v_demand_skus, v_demand_total
    from thread_demand;

  if v_demand_skus = 0 or v_demand_total = 0 then
    update orders
       set operation_stage         = 'awaiting_operation_action',
           delivery_partner_id     = p_delivery_partner_id,
           request_for_delivery_at = now(),
           partner_accepted_at     = null,
           partner_rejected_at     = null,
           partner_rejected_reason = null,
           updated_at              = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed proceed-request · %s thread(s), 0 lines · LP %s requested',
             jsonb_array_length(v_threads_created), v_partner_name),
      'operation'
    );

    insert into audit_log (role, actor_text, action, dealer_id, ref)
    values ('operation', v_actor,
            format('Confirmed proceed-request SO-%s · %s threads (no lines) · LP %s',
                   v_order.so, jsonb_array_length(v_threads_created), v_partner_name),
            v_order.dealer_id, 'SO-' || v_order.so::text);

    return jsonb_build_object(
      'order_id',             v_order.id,
      'so',                   v_order.so,
      'operation_stage',      'awaiting_operation_action',
      'threads',              v_threads_created,
      'auto_skipped',         false,
      'po_id',                null,
      'delivery_partner_id',  p_delivery_partner_id
    );
  end if;

  -- Find a candidate own warehouse with full coverage.
  with thread_demand as (
    select ol.sku as sku, sum(ol.qty)::int as demand
      from order_lines ol
     where ol.order_id = p_order_id
     group by ol.sku
  ),
  wh_coverage as (
    select w.id as warehouse_id, w.name as warehouse_name,
           count(distinct case
                   when (sb.qty - coalesce(sb.reserved, 0)) >= td.demand then td.sku
                   else null
                 end)::int as covered_skus
      from warehouses w
      cross join thread_demand td
      left join stock_balances sb
             on sb.sku = td.sku and sb.warehouse_id = w.id
     where w.kind = 'own'
     group by w.id, w.name
  )
  select warehouse_id, warehouse_name
    into v_chosen_wh, v_chosen_wh_name
    from wh_coverage
   where covered_skus = v_demand_skus
   order by case when warehouse_id = v_order.warehouse_id then 0 else 1 end,
            warehouse_name asc,
            warehouse_id asc
   limit 1;

  if v_chosen_wh is null then
    update orders
       set operation_stage         = 'awaiting_operation_action',
           delivery_partner_id     = p_delivery_partner_id,
           request_for_delivery_at = now(),
           partner_accepted_at     = null,
           partner_rejected_at     = null,
           partner_rejected_reason = null,
           updated_at              = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed proceed-request · split into %s thread(s); no buffer auto-skip · LP %s requested',
             jsonb_array_length(v_threads_created), v_partner_name),
      'operation'
    );

    insert into audit_log (role, actor_text, action, dealer_id, ref)
    values ('operation', v_actor,
            format('Confirmed proceed-request SO-%s · %s threads (awaiting) · LP %s',
                   v_order.so, jsonb_array_length(v_threads_created), v_partner_name),
            v_order.dealer_id, 'SO-' || v_order.so::text);

    return jsonb_build_object(
      'order_id',             v_order.id,
      'so',                   v_order.so,
      'operation_stage',      'awaiting_operation_action',
      'threads',              v_threads_created,
      'auto_skipped',         false,
      'po_id',                null,
      'delivery_partner_id',  p_delivery_partner_id
    );
  end if;

  -- Lock + re-check + reserve.
  for v_demand in
    select ol.sku as sku, sum(ol.qty)::int as demand
      from order_lines ol
     where ol.order_id = p_order_id
     group by ol.sku
  loop
    perform 1 from stock_balances
      where sku = v_demand.sku
        and warehouse_id = v_chosen_wh
      for update;

    if not exists (
      select 1 from stock_balances
       where sku = v_demand.sku
         and warehouse_id = v_chosen_wh
         and (qty - coalesce(reserved, 0)) >= v_demand.demand
    ) then
      v_chosen_wh := null;
      exit;
    end if;
  end loop;

  if v_chosen_wh is not null then
    begin
      with thread_demand as (
        select ol.sku as sku, sum(ol.qty)::int as demand
          from order_lines ol
         where ol.order_id = p_order_id
         group by ol.sku
      )
      update stock_balances sb
         set reserved   = sb.reserved + td.demand,
             updated_at = now()
        from thread_demand td
       where sb.sku = td.sku
         and sb.warehouse_id = v_chosen_wh;
    exception
      when check_violation then
        raise exception 'cannot reserve buffer at wh=% (qty < reserved + demand)', v_chosen_wh
          using errcode = 'P0001',
                detail  = 'insufficient_stock_for_reserve',
                hint    = format('warehouse_id=%s', v_chosen_wh);
    end;

    insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
    select td.sku, v_chosen_wh, -td.demand, 'out',
           p_order_id::text, 'reserve_from_buffer', 'operation', v_uid
      from (
        select ol.sku as sku, sum(ol.qty)::int as demand
          from order_lines ol
         where ol.order_id = p_order_id
         group by ol.sku
      ) td;

    update order_supplier_threads
       set operation_stage = 'ready_to_dispatch',
           warehouse_id    = v_chosen_wh,
           reserved_at     = now(),
           updated_at      = now()
     where order_id = p_order_id;
    get diagnostics v_threads_promoted = row_count;

    select coalesce(jsonb_agg(jsonb_build_object(
             'thread_id',   t.id,
             'supplier_id', t.supplier_id,
             'category',    t.category,
             'sop_name',    t.sop_name,
             'stage',       t.operation_stage,
             'po_id',       t.po_id
           )), '[]'::jsonb)
      into v_threads_created
      from order_supplier_threads t
     where t.order_id = p_order_id;

    v_auto_skipped := true;
  end if;

  update orders
     set operation_stage         = case when v_auto_skipped
                                        then 'ready_to_dispatch'::operation_stage
                                        else 'awaiting_operation_action'::operation_stage
                                   end,
         warehouse_id            = case when v_auto_skipped
                                        then v_chosen_wh
                                        else warehouse_id
                                   end,
         delivery_partner_id     = p_delivery_partner_id,
         request_for_delivery_at = now(),
         partner_accepted_at     = null,
         partner_rejected_at     = null,
         partner_rejected_reason = null,
         updated_at              = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    case when v_auto_skipped
         then format('Auto-skipped from buffer at %s · %s thread(s) → ready_to_dispatch · LP %s requested',
                     coalesce(v_chosen_wh_name, 'warehouse'),
                     v_threads_promoted, v_partner_name)
         else format('Confirmed proceed-request · split into %s thread(s) · LP %s requested',
                     jsonb_array_length(v_threads_created), v_partner_name)
    end,
    'operation'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor,
          case when v_auto_skipped
               then format('Auto-skipped SO-%s from buffer (%s) · %s threads → ready · LP %s',
                           v_order.so,
                           coalesce(v_chosen_wh_name, v_chosen_wh::text),
                           v_threads_promoted, v_partner_name)
               else format('Confirmed proceed-request SO-%s · %s threads (awaiting) · LP %s',
                           v_order.so, jsonb_array_length(v_threads_created), v_partner_name)
          end,
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',             v_order.id,
    'so',                   v_order.so,
    'operation_stage',      case when v_auto_skipped
                                  then 'ready_to_dispatch'
                                  else 'awaiting_operation_action'
                             end,
    'threads',              v_threads_created,
    'auto_skipped',         v_auto_skipped,
    'po_id',                null,
    'delivery_partner_id',  p_delivery_partner_id
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.operation_confirm_proceed_request_v3(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.operation_confirm_proceed_request_v3(uuid, uuid) TO authenticated;


-- ─── 3. lp_accept_order ─────────────────────────────────────────────────────
-- LP confirms it will take the customer-leg job. Mirrors partner_accept_pickup
-- (0080) in shape: role gate, cross-partner guard, state guard, audit trail.
CREATE OR REPLACE FUNCTION public.lp_accept_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
  v_order      orders;
begin
  v_role       := public.app_role();
  v_partner_id := public.app_partner_id();

  if v_role <> 'partner' then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.delivery_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: order is not assigned to this partner'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_order.request_for_delivery_at is null then
    raise exception 'order has no pending LP request'
      using errcode = '22023', detail = 'no_pending_request';
  end if;
  if v_order.partner_accepted_at is not null then
    raise exception 'order already accepted'
      using errcode = '22023', detail = 'already_accepted';
  end if;
  if v_order.partner_rejected_at is not null then
    raise exception 'order is in rejected state — Operation must reselect'
      using errcode = '22023', detail = 'order_rejected';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update orders
     set partner_accepted_at = now(),
         updated_at          = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('LP accepted delivery · %s', v_actor), 'partner');

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('partner', v_actor,
          format('Accepted delivery for SO-%s', v_order.so),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',            v_order.id,
    'so',                  v_order.so,
    'partner_accepted_at', now()
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.lp_accept_order(uuid) FROM public;
REVOKE ALL ON FUNCTION public.lp_accept_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.lp_accept_order(uuid) TO authenticated;


-- ─── 4. lp_reject_order ─────────────────────────────────────────────────────
-- LP declines with a free-text reason. Reason becomes visible to Operation in
-- the "LP rejected" red-badge surface and in the reselect dialog.
CREATE OR REPLACE FUNCTION public.lp_reject_order(
  p_order_id uuid,
  p_reason   text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role       app_role;
  v_partner_id uuid;
  v_actor      text;
  v_order      orders;
  v_reason     text;
begin
  v_role       := public.app_role();
  v_partner_id := public.app_partner_id();

  if v_role <> 'partner' then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if v_partner_id is null then
    raise exception 'no partner_id on JWT'
      using errcode = '42501', detail = 'no_partner_id';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    raise exception 'reject reason is required'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if length(v_reason) > 500 then
    raise exception 'reject reason too long (% chars, max 500)', length(v_reason)
      using errcode = '22023', detail = 'reason_too_long';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.delivery_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: order is not assigned to this partner'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_order.request_for_delivery_at is null then
    raise exception 'order has no pending LP request'
      using errcode = '22023', detail = 'no_pending_request';
  end if;
  if v_order.partner_accepted_at is not null then
    raise exception 'order already accepted — cannot reject'
      using errcode = '22023', detail = 'already_accepted';
  end if;
  if v_order.partner_rejected_at is not null then
    raise exception 'order already rejected'
      using errcode = '22023', detail = 'already_rejected';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  update orders
     set partner_rejected_at     = now(),
         partner_rejected_reason = v_reason,
         updated_at              = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('LP rejected delivery · %s · reason: %s', v_actor, v_reason),
    'partner'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('partner', v_actor,
          format('Rejected delivery for SO-%s · reason: %s', v_order.so, v_reason),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',                v_order.id,
    'so',                      v_order.so,
    'partner_rejected_at',     now(),
    'partner_rejected_reason', v_reason
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.lp_reject_order(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.lp_reject_order(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.lp_reject_order(uuid, text) TO authenticated;


-- ─── 5. operation_reselect_partner ──────────────────────────────────────────
-- Operation picks a new LP after the previous one rejected. Clears the reject
-- timestamps + reason, writes the new partner + fresh request_for_delivery_at.
-- Same partner cannot be re-picked (would be a no-op user error).
CREATE OR REPLACE FUNCTION public.operation_reselect_partner(
  p_order_id   uuid,
  p_partner_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role         app_role;
  v_uid          uuid;
  v_actor        text;
  v_order        orders;
  v_partner_name text;
begin
  v_role := public.app_role();
  v_uid  := (select auth.uid());

  if v_role is distinct from 'operation' then
    raise exception 'forbidden: operation only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_partner_id is null then
    raise exception 'partner_id is required'
      using errcode = '22023', detail = 'partner_required';
  end if;
  select name into v_partner_name
    from delivery_partners where id = p_partner_id;
  if v_partner_name is null then
    raise exception 'delivery partner not found: %', p_partner_id
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.partner_rejected_at is null then
    raise exception 'order is not in rejected state — nothing to reselect'
      using errcode = '22023', detail = 'not_rejected';
  end if;

  if v_order.delivery_partner_id is not distinct from p_partner_id then
    raise exception 'cannot reselect the same partner that just rejected'
      using errcode = '22023', detail = 'same_partner';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), 'Operation');

  update orders
     set delivery_partner_id     = p_partner_id,
         request_for_delivery_at = now(),
         partner_accepted_at     = null,
         partner_rejected_at     = null,
         partner_rejected_reason = null,
         updated_at              = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (p_order_id, format('Operation reselected LP → %s', v_partner_name), 'operation');

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor,
          format('Reselected LP for SO-%s → %s', v_order.so, v_partner_name),
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',              v_order.id,
    'so',                    v_order.so,
    'delivery_partner_id',   p_partner_id,
    'request_for_delivery_at', now()
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.operation_reselect_partner(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.operation_reselect_partner(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.operation_reselect_partner(uuid, uuid) TO authenticated;


-- ─── 6. Sanity ──────────────────────────────────────────────────────────────
DO $sanity$
DECLARE
  col_count int;
  fn_count  int;
  idx_count int;
BEGIN
  SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'orders'
     AND column_name IN ('request_for_delivery_at', 'partner_accepted_at',
                         'partner_rejected_at', 'partner_rejected_reason');
  IF col_count <> 4 THEN
    RAISE EXCEPTION '0147 sanity: expected 4 new orders columns, got %', col_count;
  END IF;

  SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN ('orders_partner_incoming_idx', 'orders_partner_rejected_idx');
  IF idx_count <> 2 THEN
    RAISE EXCEPTION '0147 sanity: expected 2 new indexes, got %', idx_count;
  END IF;

  SELECT COUNT(*) INTO fn_count
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname IN (
       'operation_confirm_proceed_request_v3',
       'lp_accept_order',
       'lp_reject_order',
       'operation_reselect_partner'
     );
  IF fn_count <> 4 THEN
    RAISE EXCEPTION '0147 sanity: expected 4 functions, got %', fn_count;
  END IF;

  -- Verify v3 now has 2 args (signature change).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'operation_confirm_proceed_request_v3'
       AND pronargs = 2
  ) THEN
    RAISE EXCEPTION '0147 sanity: operation_confirm_proceed_request_v3 did not pick up the new p_delivery_partner_id arg';
  END IF;

  RAISE NOTICE '0147 OK: 4 columns + 2 indexes + 4 RPCs (v3 re-created with LP arg)';
END $sanity$;
