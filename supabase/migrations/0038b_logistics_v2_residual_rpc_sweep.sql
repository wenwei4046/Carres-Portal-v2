-- =============================================================================
-- 0038b_logistics_v2_residual_rpc_sweep.sql -- Phase 4.5a T2 follow-up
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5a-v3-wake-design.md
--              §4.1 (migration plan), §4.5 (enum cleanup is T6 not T2).
-- Sprint:      Phase 4.5a Task 2 - residual v2 RPC vocabulary sweep
-- Depends on:
--   0019 logistics_rpcs              (originals for logistics_warehouse_pick,
--                                     logistics_receive_po_line and
--                                     logistics_dashboard_summary; 0019 is the
--                                     CURRENT effective body for
--                                     logistics_dashboard_summary -- never
--                                     superseded)
--   0024 logistics_pipeline_v2_rpcs  (most recent body for
--                                     logistics_confirm_proceed_request,
--                                     logistics_warehouse_pick and
--                                     logistics_receive_po_line -- supersedes
--                                     0019 for these three)
--   0028 logistics_stage_v3          (adds 'awaiting_logistics_action' enum
--                                     value; both values still legal until T6)
--   0038 logistics_v2_rpc_v3_vocab_sweep
--                                    (commit 5a81461 -- swept 5 v2 RPCs that
--                                     were originally listed in the T2 plan;
--                                     this migration is the gap-closer for the
--                                     4 RPCs missed by that pass)
--
-- Why this migration (and why a NEW file rather than editing 0038):
--   Spec review of T2 found 4 additional v2 RPCs whose function bodies still
--   read or write the legacy 'awaiting_stock' enum literal:
--
--     RPC                                 source  Lines     What changes
--     ----------------------------------  ------  --------  ----------------------------------
--     logistics_confirm_proceed_request   0024    466, 470  2 WRITE literals -> awaiting_logistics_action
--     logistics_warehouse_pick            0024    544, 600  1 READ guard + 1 WRITE -> awaiting_logistics_action
--     logistics_receive_po_line           0024    751       1 READ in FROM/WHERE -> awaiting_logistics_action
--     logistics_dashboard_summary         0019    391, 420  2 READs (IN-list + WHERE) -> awaiting_logistics_action
--
--   After T6's `DROP TYPE logistics_stage CASCADE`, those compiled-in literal
--   dependencies would silently disappear from production: the function bodies
--   reference an enum value that no longer exists. Sweeping them now -- before
--   T6 -- guarantees the new enum (without 'awaiting_stock') keeps every RPC
--   compileable.
--
--   CLAUDE.md §14 red line #6 forbids altering committed migration history.
--   Migration 0038 has been committed (5a81461) and applied to staging
--   (kfprgpjpaffedghytstl), so we ADD a new migration `0038b` rather than
--   editing the existing file. CREATE OR REPLACE is idempotent and the only
--   net effect on a re-run is the same body re-emitted.
--
-- JSON key decision (logistics_dashboard_summary):
--   Line 418 of 0019 emits the literal STRING 'awaiting_stock' as a JSON KEY
--   in the `pipeline` payload (NOT an enum literal). Removing or renaming this
--   key would break every FE consumer that reads
--   `data.pipeline.awaiting_stock` to render the dashboard tile.
--
--   Decision (per task default + spec):
--     KEEP the JSON key as 'awaiting_stock'. FE rename will happen in T5
--     alongside the matching DB rename so DB+FE move in lockstep. The actual
--     enum-literal reads at lines 391 (IN-list) and 420 (= comparison) ARE
--     swept here -- those are ::logistics_stage values, not JSON-payload keys.
--
--   When T5 lands, this function will be re-emitted again with the renamed
--   JSON key (and the FE updated in the same commit). Until then, the JSON
--   key 'awaiting_stock' co-exists with the enum value
--   'awaiting_logistics_action' -- this is intentional and documented.
--
-- Idempotency:
--   * Every function uses CREATE OR REPLACE; no DROP / TRUNCATE / DELETE.
--   * Re-runnable safely. Subsequent migrations (0039, 0040) will further
--     evolve these signatures; this migration is the seam where v2 vocab is
--     retired but signatures stay unchanged.
--
-- Postgres caveats:
--   * CREATE OR REPLACE FUNCTION cannot change the function's return type or
--     argument list. We preserve every signature exactly. Tests in
--     orders.test.ts + logistics.test.ts assert RPC call shape and would fail
--     loudly if any param renamed or dropped.
--   * The 'awaiting_logistics_action'::logistics_stage literal is legal on
--     pre-0040 enums because 0028 added that value. Post-0040 the enum is
--     recreated without 'awaiting_stock', so any future migration that wants
--     to revert this one (theoretically) would also need to recreate the
--     enum first -- but the design is that 0040 is the high-water mark.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 1. logistics_confirm_proceed_request -- VOCABULARY SWEEP. Body lifted from
--    0024 §3 with two WRITE literals swapped:
--      * Line 466 (UPDATE orders SET logistics_stage = 'awaiting_stock')
--        becomes 'awaiting_logistics_action'
--      * Line 470 (v_new_stage := 'awaiting_stock')
--        becomes 'awaiting_logistics_action'
--    Everything else (role guard, lock, stage guard, warehouse resolution,
--    shortage compute, ready_to_dispatch branch, audit_log, return shape) is
--    byte-for-byte from 0024.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_confirm_proceed_request(
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

  -- 2. Stage guard - must be in proceed_request to confirm.
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

  -- 5. Branch on shortage. All-clear -> ready_to_dispatch + reserve. Any
  -- shortage -> awaiting_logistics_action (no reserve; logistics will issue POs).
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
    -- VOCAB SWEEP (T2-followup): write 'awaiting_logistics_action' instead
    -- of legacy 'awaiting_stock'.
    update orders
       set logistics_stage = 'awaiting_logistics_action',
           updated_at      = now()
     where id = p_order_id;

    v_new_stage := 'awaiting_logistics_action';

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


-- ----------------------------------------------------------------------------
-- 2. logistics_warehouse_pick -- VOCABULARY SWEEP. Body lifted from 0024 §4
--    with one READ-guard literal and one WRITE literal swapped:
--      * Line 544 (in IN-list guard:
--          v_order.logistics_stage not in ('proceed_request', 'awaiting_stock'))
--        becomes ('proceed_request', 'awaiting_logistics_action')
--      * Line 600 (UPDATE orders SET logistics_stage = 'awaiting_stock')
--        becomes 'awaiting_logistics_action'
--    Error message at the matching guard is also updated to read
--    'proceed_request/awaiting_logistics_action state' so the API/FE see
--    consistent vocab end-to-end.
--    Everything else (role guard, lock, open-PO check, warehouse picks,
--    shortage compute, ready_to_dispatch branch, audit) is byte-for-byte
--    from 0024.
-- ----------------------------------------------------------------------------
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

  -- VOCAB SWEEP (T2-followup): READ-guard now accepts
  -- 'awaiting_logistics_action' instead of legacy 'awaiting_stock'. v2
  -- "skip awaiting_stock" allowance is preserved by mapping it onto the new
  -- vocab one-for-one.
  if v_order.logistics_stage not in ('proceed_request', 'awaiting_logistics_action')
     or v_order.status <> 'proceed_order' then
    raise exception 'order is not in proceed_request/awaiting_logistics_action state'
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
    -- VOCAB SWEEP (T2-followup): write 'awaiting_logistics_action' instead
    -- of legacy 'awaiting_stock'.
    update orders
       set logistics_stage = 'awaiting_logistics_action',
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


-- ----------------------------------------------------------------------------
-- 3. logistics_receive_po_line -- VOCABULARY SWEEP. Body lifted from 0024 §5
--    with one READ literal swapped:
--      * Line 751 (auto-promote loop:
--          and o.logistics_stage = 'awaiting_stock')
--        becomes 'awaiting_logistics_action'
--    Everything else (role guard, PO lock, line lock, qty validation, stock
--    increment, movement insert, PO close-out, auto-promote helper call,
--    audit_log) is byte-for-byte from 0024.
-- ----------------------------------------------------------------------------
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

  -- Auto-promote any awaiting_logistics_action orders that have this SKU and
  -- now have their shortages cleared. Lock each order row before evaluating.
  -- Pipeline v2: reserve via helper rather than inline loop.
  -- VOCAB SWEEP (T2-followup): READ filter now matches
  -- 'awaiting_logistics_action' instead of legacy 'awaiting_stock'.
  for v_target_order in
    select o.id, o.dl, o.dealer_id, o.warehouse_id
      from orders o
     where o.status = 'proceed_order'
       and o.logistics_stage = 'awaiting_logistics_action'
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


-- ----------------------------------------------------------------------------
-- 4. logistics_dashboard_summary -- VOCABULARY SWEEP. Body lifted from 0019
--    §logistics_dashboard_summary with two enum-literal READ swaps:
--      * Line 391 (IN-list:
--          logistics_stage in ('awaiting_stock','ready_to_dispatch','dispatched'))
--        becomes ('awaiting_logistics_action','ready_to_dispatch','dispatched')
--      * Line 420 (= comparison:
--          logistics_stage = 'awaiting_stock')
--        becomes 'awaiting_logistics_action'
--
--    DELIBERATELY UNCHANGED: the JSON KEY 'awaiting_stock' at the matching
--    select jsonb_build_object key (same line as the comparison's count(*)
--    target). FE consumers (dashboard tile labels) still read
--    `data.pipeline.awaiting_stock`. T5 will rename DB+FE in lockstep.
--
--    Everything else (role guard, KPI tile, open POs side card, low-stock
--    side card, recent audit, alerts) is byte-for-byte from 0019.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_kpis         jsonb;
  v_pipeline     jsonb;
  v_open_pos     jsonb;
  v_low_stock    jsonb;
  v_audit_recent jsonb;
  v_alerts       jsonb;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  -- KPI tile: today's deliveries + open POs + overdue orders + active GMV.
  -- VOCAB SWEEP (T2-followup): 'overdue_orders' IN-list now reads
  -- 'awaiting_logistics_action' instead of legacy 'awaiting_stock'.
  select jsonb_build_object(
    'today_deliveries',
      (select count(*) from orders
        where status = 'proceed_order'
          and logistics_stage in ('ready_to_dispatch','dispatched')
          and delivery_date = current_date),
    'open_pos',
      (select count(*) from purchase_orders where status = 'open'),
    'overdue_orders',
      (select count(*) from orders
        where status = 'proceed_order'
          and logistics_stage in ('awaiting_logistics_action','ready_to_dispatch','dispatched')
          and delivery_date < current_date),
    'active_orders',
      (select count(*) from orders
        where status = 'proceed_order'
          and logistics_stage <> 'delivered'),
    'active_gmv',
      coalesce((
        select sum(line_total)
          from (
            select coalesce((select sum(unit_price * qty)
                               from order_lines
                              where order_id = o.id), 0)
                 + coalesce((select sum(unit_price * qty)
                               from order_addons
                              where order_id = o.id), 0)
                 as line_total
              from orders o
             where o.status = 'proceed_order'
               and o.logistics_stage <> 'delivered'
          ) t
      ), 0)
  )
  into v_kpis;

  -- Pipeline buckets: counts only (UI fetches the lists separately for filter).
  -- DELIBERATELY UNCHANGED: 'awaiting_stock' as a JSON KEY (FE consumers read
  -- data.pipeline.awaiting_stock). T5 will rename DB+FE in lockstep.
  -- VOCAB SWEEP (T2-followup): the matching enum READ comparison now reads
  -- 'awaiting_logistics_action' so the count is sourced from the v3-vocab
  -- rows (post-0028 every legacy 'awaiting_stock' row was rebranded to
  -- 'awaiting_logistics_action').
  select jsonb_build_object(
    'awaiting_stock',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'awaiting_logistics_action'),
    'ready_to_dispatch',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'ready_to_dispatch'),
    'dispatched',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'dispatched')
  )
  into v_pipeline;

  -- Top 4 open POs for the side card.
  select coalesce(jsonb_agg(row_to_json(t) order by t.placed_at desc), '[]'::jsonb)
    into v_open_pos
    from (
      select p.id, p.supplier_id, p.warehouse_id, p.status, p.sup_status,
             p.eta_date, p.placed_at, p.dl, p.dl_refs
        from purchase_orders p
       where p.status = 'open'
       order by p.placed_at desc
       limit 4
    ) t;

  -- Top 5 low-stock SKUs (qty - reserved <= 1).
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_low_stock
    from (
      select sb.sku, sb.warehouse_id, sb.qty, sb.reserved,
             (sb.qty - sb.reserved) as available
        from stock_balances sb
       where (sb.qty - sb.reserved) <= 1
       order by (sb.qty - sb.reserved) asc, sb.sku
       limit 5
    ) t;

  -- Recent logistics-related audit entries.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_audit_recent
    from (
      select id, role, actor_text, action, dealer_id, ref, occurred_at
        from audit_log
       where role = 'logistics'
       order by occurred_at desc
       limit 5
    ) t;

  -- Alerts surface: out-of-stock SKUs.
  select jsonb_build_object(
    'out_of_stock_skus',
      (select count(*) from stock_balances where qty = 0)
  )
  into v_alerts;

  return jsonb_build_object(
    'kpis',          v_kpis,
    'pipeline',      v_pipeline,
    'open_pos',      v_open_pos,
    'low_stock',     v_low_stock,
    'audit_recent',  v_audit_recent,
    'alerts',        v_alerts
  );
end;
$$;

revoke all on function public.logistics_dashboard_summary() from public;
grant execute on function public.logistics_dashboard_summary() to authenticated;


-- =============================================================================
-- End of 0038b_logistics_v2_residual_rpc_sweep.sql
-- =============================================================================
-- Self-review checklist (Phase 4.5a T2 follow-up):
--   [x] Migration file numbered 0038b (slot AFTER committed 0038, BEFORE 0039)
--   [x] No edits to committed migration 0038 (CLAUDE.md §14 #6)
--   [x] Header banner explains sprint + spec refs + JSON-key decision
--   [x] All 4 RPCs CREATE OR REPLACE in single migration file
--   [x] logistics_confirm_proceed_request: signature unchanged, body verbatim
--       from 0024 with 2 WRITE literals swept
--   [x] logistics_warehouse_pick: signature unchanged, body verbatim from 0024
--       with 1 READ guard + 1 WRITE swept (+ matching error message text)
--   [x] logistics_receive_po_line: signature unchanged, body verbatim from
--       0024 with 1 READ in FROM/WHERE swept
--   [x] logistics_dashboard_summary: signature unchanged, body verbatim from
--       0019 with 2 enum READs swept (IN-list + comparison). JSON KEY
--       'awaiting_stock' DELIBERATELY UNCHANGED (FE depends on it; T5 will
--       rename DB+FE in lockstep)
--   [x] No quoted-literal 'awaiting_stock' enum value remains anywhere in the
--       function bodies of this file. The only surviving 'awaiting_stock'
--       quoted string is the JSON key in logistics_dashboard_summary (a
--       string KEY, not an enum literal)
--   [x] Idempotent: CREATE OR REPLACE FUNCTION; no DROP / TRUNCATE / DELETE
--   [x] Re-runnable: subsequent migrations (0039, 0040) further evolve these
--       signatures; 0038b is the gap-closer for 0038's missed RPCs
--
-- Closes carry-forward: phase-4.5a-T2-residual-rpc-sweep (opened by spec
-- review of T2 after 0038 landed at commit 5a81461)
-- Pairs with: 0038 (the 5 originally-listed v2 RPCs) and 0040 (enum cleanup)
-- =============================================================================
