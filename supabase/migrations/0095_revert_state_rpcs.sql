-- 0095_revert_state_rpcs.sql
-- =============================================================================
-- Two narrow "back arrow" RPCs for the Logistics Orders kanban:
--   1) proceed_request → placed   (no side effects — pure state flip)
--   2) dispatched      → ready_to_dispatch   (clear per-thread LP fields)
--
-- Loo 2026-05-12: dealer accidentally pressed Proceed, or logistics dispatched
-- to the wrong partner — without these two reverts the only escape was wiping
-- the whole order. Other reverts (awaiting→proceed, ready→awaiting,
-- delivered→dispatched) are NOT covered here because each carries real side
-- effects (PO creation, stock booking, POD captured) that need bespoke
-- reversal logic. Add per-state when a real need shows up.
--
-- Gated to `logistics` and `principal` roles. Every revert writes an audit_log
-- row so the timeline shows the manual rewind.
-- =============================================================================

create or replace function public.logistics_revert_order_proceed_to_placed(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role  app_role;
  v_uid   uuid;
  v_actor text;
  v_order orders;
begin
  v_role := public.app_role();
  v_uid := (select auth.uid());

  if v_role not in ('logistics', 'principal') then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- Only allow revert from the proceed step. We check logistics_stage because
  -- LogisticsOrders.tsx stageOf() shows the kanban column by that column when
  -- status is not 'place'. status will also be 'proceed_order' in this state
  -- (set together by 0024 proceed_order RPC).
  if v_order.logistics_stage is distinct from 'proceed_request' then
    raise exception 'Order is not in proceed_request stage (got logistics_stage=%, status=%)',
                    v_order.logistics_stage, v_order.status
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  update orders
     set status          = 'place',
         logistics_stage = 'placed',
         updated_at      = now()
   where id = p_order_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Reverted order #%s · Proceed Request → Placed', v_order.dl),
          p_order_id::text);

  return jsonb_build_object(
    'order_id',        p_order_id,
    'dl',              v_order.dl,
    'status',          'place',
    'logistics_stage', 'placed'
  );
end;
$$;

grant execute on function public.logistics_revert_order_proceed_to_placed(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.logistics_revert_order_dispatched_to_ready(
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role             app_role;
  v_uid              uuid;
  v_actor            text;
  v_dl               int;
  v_threads_reverted int;
begin
  v_role := public.app_role();
  v_uid := (select auth.uid());

  if v_role not in ('logistics', 'principal') then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select dl into v_dl from orders where id = p_order_id for update;
  if v_dl is null then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- Revert every dispatched thread on this order. Clears the partner
  -- assignment that logistics_assign_partner (0086) wrote — partner_id,
  -- confirm_delivery_date, partner_accepted_at, request_for_delivery_at.
  -- Leaves orders.warehouse_id alone (informational; the goods are still at
  -- the same WH and another LP assignment will rewrite delivery date anyway).
  update order_supplier_threads
     set logistics_stage         = 'ready_to_dispatch',
         delivery_partner_id     = null,
         confirm_delivery_date   = null,
         partner_accepted_at     = null,
         partner_rejected_at     = null,
         request_for_delivery_at = null,
         updated_at              = now()
   where order_id        = p_order_id
     and logistics_stage = 'dispatched';
  get diagnostics v_threads_reverted = row_count;

  if v_threads_reverted = 0 then
    raise exception 'No dispatched threads on this order'
      using errcode = '22023', detail = 'no_dispatched_threads';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), initcap(v_role::text));

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Reverted order #%s · Dispatched → Ready to Dispatch (%s thread(s))',
                 v_dl, v_threads_reverted),
          p_order_id::text);

  return jsonb_build_object(
    'order_id',         p_order_id,
    'dl',               v_dl,
    'threads_reverted', v_threads_reverted
  );
end;
$$;

grant execute on function public.logistics_revert_order_dispatched_to_ready(uuid)
  to authenticated;
