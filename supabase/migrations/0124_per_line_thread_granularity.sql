-- 0124_per_line_thread_granularity.sql
-- 2026-05-18 (Loo) — Phase 2 of 3 in the per-SO PO-splitting refactor.
--
-- Problem: `order_supplier_threads` is keyed by (order_id, supplier_id,
-- category). A single SO with 2 sofa lines of different fabrics produces
-- ONE thread covering both lines. That blocks option B (1 PO per fabric
-- within a SO) because each PO can only point at one thread, and the
-- batch-claim function over-claims (PO1 grabs the thread, PO2 hits
-- concurrent_claim).
--
-- Fix: drop the (order_id, supplier_id, category) unique constraint and
-- key threads by `order_line_id` instead. Each order_line gets its own
-- thread row. Same line cardinality already — pre-flight survey
-- confirmed every existing thread maps 1:1 to an order_line, so this
-- migration is a clean column-add + backfill (no row multiplication).
--
-- Loo authorised in conversation 2026-05-18 per CLAUDE.md §7 + §14 #1.
-- Mirrors the same authorization model as 0121 (logistics→operation) and
-- 0123 (dl→so).
--
-- Functions touched:
--   operation_confirm_proceed_request_v3 — switch thread-creation loop
--     from `group by supplier_id, category` → per-order_line iteration.
--   _v3_claim_threads_for_po — claim only threads whose underlying
--     order_line matches a (sku, attrs) tuple on the PO. This is what
--     unblocks Phase 3's split-per-SO auto-issue.
--
-- Read-side functions untouched: rollup trigger still aggregates threads
-- per order_id (min stage wins), partner_pickup_threads + operation_
-- receive_threads still operate by thread.id (no schema dependency on
-- the unique key shape).


-- =============================================================================
-- 1. Column add + backfill + constraints
-- =============================================================================
ALTER TABLE order_supplier_threads
  ADD COLUMN order_line_id uuid;

UPDATE order_supplier_threads t
   SET order_line_id = ol.id
  FROM order_lines ol
  JOIN product_skus ps ON ps.sku = ol.sku
  JOIN product_models pm ON pm.id = ps.model_id
 WHERE ol.order_id    = t.order_id
   AND ps.supplier_id = t.supplier_id
   AND pm.category::text = t.category::text;

DO $$
DECLARE missing int;
BEGIN
  SELECT count(*) INTO missing
    FROM order_supplier_threads
   WHERE order_line_id IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION '0124 backfill failure: % thread(s) without order_line_id', missing;
  END IF;
END $$;

ALTER TABLE order_supplier_threads
  ALTER COLUMN order_line_id SET NOT NULL;

ALTER TABLE order_supplier_threads
  ADD CONSTRAINT order_supplier_threads_order_line_id_fk
    FOREIGN KEY (order_line_id) REFERENCES order_lines(id) ON DELETE CASCADE;

-- Swap the unique constraint
ALTER TABLE order_supplier_threads
  DROP CONSTRAINT order_supplier_threads_order_id_supplier_id_category_key;

ALTER TABLE order_supplier_threads
  ADD CONSTRAINT order_supplier_threads_order_line_id_key UNIQUE (order_line_id);

CREATE INDEX IF NOT EXISTS ost_order_line_idx
  ON order_supplier_threads (order_line_id);


-- =============================================================================
-- 2. operation_confirm_proceed_request_v3 — per-order_line iteration
--    Replaces the `group by supplier_id, category` loop with per-line.
--    Auto-skip-from-buffer logic + rollup + audit text all preserved.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.operation_confirm_proceed_request_v3(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_order        orders;
  v_actor        text;
  v_role         app_role;
  v_uid          uuid;
  v_line         record;
  v_supplier_slug text;
  v_sop_name     text;
  v_threads_created jsonb := '[]'::jsonb;
  v_thread_id    uuid;
  v_demand_total int;
  v_demand_skus  int;
  v_chosen_wh    uuid;
  v_chosen_wh_name text;
  v_demand       record;
  v_auto_skipped boolean := false;
  v_threads_promoted int;
begin
  v_role := public.app_role();
  v_uid  := (select auth.uid());

  if v_role is distinct from 'operation' then
    raise exception 'forbidden: logistics only'
      using errcode = '42501', detail = 'forbidden';
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

  v_actor := coalesce((select name from app_users where id = v_uid), 'Logistics');

  -- 0124 (Loo Phase 2) — one thread PER order_line, not per (supplier, category).
  -- This makes per-SO + per-fabric PO splitting possible: each fabric variant on
  -- a SO becomes its own thread that a PO can independently claim.
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

  -- 4a. Aggregate demand across all order_lines for this order, per SKU.
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
       set operation_stage = 'awaiting_operation_action',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed proceed-request -- %s thread(s), 0 lines (no auto-skip)',
             jsonb_array_length(v_threads_created)),
      'operation'
    );

    insert into audit_log (role, actor_text, action, dealer_id, ref)
    values ('operation', v_actor,
            format('Confirmed proceed-request SO-%s -- %s threads (no lines)',
                   v_order.so, jsonb_array_length(v_threads_created)),
            v_order.dealer_id, 'SO-' || v_order.so::text);

    return jsonb_build_object(
      'order_id',         v_order.id,
      'so',               v_order.so,
      'operation_stage',  'awaiting_operation_action',
      'threads',          v_threads_created,
      'auto_skipped',     false,
      'po_id',            null
    );
  end if;

  -- 4b. Find a candidate `own` warehouse with full coverage. Tiebreaker: prefer
  --     order's existing warehouse_id, then warehouse_name asc, then id asc.
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
       set operation_stage = 'awaiting_operation_action',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed proceed-request -- split into %s thread(s); no buffer auto-skip',
             jsonb_array_length(v_threads_created)),
      'operation'
    );

    insert into audit_log (role, actor_text, action, dealer_id, ref)
    values ('operation', v_actor,
            format('Confirmed proceed-request SO-%s -- %s threads (awaiting)',
                   v_order.so, jsonb_array_length(v_threads_created)),
            v_order.dealer_id, 'SO-' || v_order.so::text);

    return jsonb_build_object(
      'order_id',         v_order.id,
      'so',               v_order.so,
      'operation_stage',  'awaiting_operation_action',
      'threads',          v_threads_created,
      'auto_skipped',     false,
      'po_id',            null
    );
  end if;

  -- 4d. Lock + re-check + reserve.
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

  -- 4e. Single CTE-driven UPDATE on stock_balances.reserved + audit + promote.
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
     set operation_stage = case when v_auto_skipped
                                then 'ready_to_dispatch'::operation_stage
                                else 'awaiting_operation_action'::operation_stage
                           end,
         warehouse_id    = case when v_auto_skipped
                                then v_chosen_wh
                                else warehouse_id
                           end,
         updated_at      = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    case when v_auto_skipped
         then format('Auto-skipped from buffer at %s -- %s thread(s) -> ready_to_dispatch',
                     coalesce(v_chosen_wh_name, 'warehouse'),
                     v_threads_promoted)
         else format('Confirmed proceed-request -- split into %s thread(s)',
                     jsonb_array_length(v_threads_created))
    end,
    'operation'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor,
          case when v_auto_skipped
               then format('Auto-skipped SO-%s from buffer (%s) -- %s threads -> ready',
                           v_order.so,
                           coalesce(v_chosen_wh_name, v_chosen_wh::text),
                           v_threads_promoted)
               else format('Confirmed proceed-request SO-%s -- %s threads (awaiting)',
                           v_order.so, jsonb_array_length(v_threads_created))
          end,
          v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object(
    'order_id',         v_order.id,
    'so',               v_order.so,
    'operation_stage',  case when v_auto_skipped
                              then 'ready_to_dispatch'
                              else 'awaiting_operation_action'
                         end,
    'threads',          v_threads_created,
    'auto_skipped',     v_auto_skipped,
    'po_id',            null
  );
end;
$function$;


-- =============================================================================
-- 3. _v3_claim_threads_for_po — line-aware claim
--    The previous version claimed every thread for (supplier_id, so_refs)
--    which over-claimed when per-variant batches landed multiple POs for
--    the same SO bundle. New version claims only threads whose underlying
--    order_line has the same (sku, attrs) as a line on the PO.
-- =============================================================================
CREATE OR REPLACE FUNCTION public._v3_claim_threads_for_po(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po              purchase_orders;
  v_already_claimed int;
  v_threads_claimed int;
begin
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Lock candidate threads: those whose underlying order_line matches a
  -- (sku, attrs) tuple on the PO, in orders covered by the PO's so + so_refs.
  perform 1
    from order_supplier_threads t
    join order_lines ol on ol.id = t.order_line_id
    join purchase_order_lines pol on pol.po_id = p_po_id
                                  and pol.sku  = ol.sku
                                  and coalesce(pol.attrs::text, '') = coalesce(ol.attrs::text, '')
   where t.supplier_id = v_po.supplier_id
     and (
       ol.order_id in (select id from orders where so = v_po.so)
       or ol.order_id in (select id from orders where so = any(coalesce(v_po.so_refs, array[]::int[])))
     )
   for update;

  -- Race-guard: count already-claimed candidates AFTER the lock holds.
  select count(*) into v_already_claimed
    from order_supplier_threads t
    join order_lines ol on ol.id = t.order_line_id
    join purchase_order_lines pol on pol.po_id = p_po_id
                                  and pol.sku  = ol.sku
                                  and coalesce(pol.attrs::text, '') = coalesce(ol.attrs::text, '')
   where t.supplier_id = v_po.supplier_id
     and t.po_id is not null
     and (
       ol.order_id in (select id from orders where so = v_po.so)
       or ol.order_id in (select id from orders where so = any(coalesce(v_po.so_refs, array[]::int[])))
     );

  if v_already_claimed > 0 then
    raise exception 'concurrent_claim: % thread(s) already claimed', v_already_claimed
      using errcode = '40001',
            detail  = 'concurrent_claim',
            hint    = 'Another operation user has already issued a PO for these lines. Refresh and try again.';
  end if;

  -- Claim only the matching threads.
  update order_supplier_threads t
     set po_id = p_po_id
    from order_lines ol,
         purchase_order_lines pol
   where t.order_line_id = ol.id
     and pol.po_id = p_po_id
     and pol.sku   = ol.sku
     and coalesce(pol.attrs::text, '') = coalesce(ol.attrs::text, '')
     and t.supplier_id = v_po.supplier_id
     and t.po_id is null
     and (
       ol.order_id in (select id from orders where so = v_po.so)
       or ol.order_id in (select id from orders where so = any(coalesce(v_po.so_refs, array[]::int[])))
     );
  get diagnostics v_threads_claimed = row_count;

  return jsonb_build_object(
    'po_id',           p_po_id,
    'threads_claimed', v_threads_claimed
  );
end;
$function$;
