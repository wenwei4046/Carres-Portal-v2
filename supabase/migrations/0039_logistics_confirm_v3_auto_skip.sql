-- =============================================================================
-- 0039_logistics_confirm_v3_auto_skip.sql -- Phase 4.5a T3
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5a-v3-wake-design.md
--              §4.3 (auto-skip-from-stock branch design)
--              §3   (constraints + Loo decisions: NO ghost PO; reserve from
--                    real buffer because past PO receives already wrote the
--                    matching stock_movements `kind='in'` row)
--              §5.1 (4 unit-test cases enumerated)
--              §6   (rollback plan -- pre-0040 reversible)
-- Sprint:      Phase 4.5a Task 3 -- v3 confirm auto-skip-from-stock
-- Depends on:
--   0018 stock_balances.reserved + CHECK (qty >= reserved) -- enforces atomic
--        no-over-reserve. We catch SQLSTATE 23514 from this CHECK and rethrow
--        as P0001 detail='insufficient_stock_for_reserve' to mirror the
--        contract that v2 _logistics_reserve_order pioneered.
--   0027 warehouses.kind ('own' | 'logistics_partner') -- auto-skip ONLY
--        considers warehouses where kind='own' (Loo: "buffer stock at
--        logistics own warehouses, not partner staging").
--   0028 logistics_stage += awaiting_logistics_action / waiting -- the value
--        we read AFTER 0034 inserts the threads.
--   0033 order_supplier_threads (the rows we promote to ready_to_dispatch).
--   0034 logistics_confirm_proceed_request_v3 base body -- this migration
--        REPLACES that function with the auto-skip-extended version.
--   0036 orders_rollup_stage trigger -- once threads land at ready_to_dispatch
--        the AFTER trigger writes orders.logistics_stage='ready_to_dispatch'.
--        v3 confirm no longer needs the explicit `update orders set
--        logistics_stage = ...` at the end (the trigger covers it). We keep
--        the explicit UPDATE for the awaiting case as a defensive
--        belt-and-braces for environments where the trigger somehow misfires
--        (e.g. a future RLS policy that breaks the SECURITY DEFINER chain on
--        order_supplier_threads writes).
--
-- =============================================================================
-- Why this migration:
--   Migration 0034 shipped logistics_confirm_proceed_request_v3 in the
--   simpler "no auto-skip" variant per the v3-S4 sprint scope simplification
--   (see 0034 header note + carry-forward `phase-4-v3-confirm-auto-skip-
--   from-stock`). Phase 4.5a T3 closes that carry-forward by extending the
--   RPC with the spec §4.3 auto-skip-from-stock branch.
--
--   Behaviour change relative to 0034:
--     • Existing flow (lines 132-256 of 0034): role gate, lock order, state
--       guards, group lines into (supplier, category) threads, UPSERT
--       order_supplier_threads -- ALL preserved verbatim.
--     • NEW after the thread-INSERT loop (lines 226+): aggregate demand per
--       SKU, pick a candidate `own` warehouse, FOR UPDATE on the matching
--       stock_balances rows, re-check sufficiency under the lock (TOCTOU),
--       and:
--         - IF all SKUs covered: increment stock_balances.reserved by demand,
--           insert stock_movements rows tagged for buffer-reserve audit,
--           UPDATE all threads SET logistics_stage='ready_to_dispatch',
--           warehouse_id=<chosen own wh>, reserved_at=now().
--         - ELSE: leave threads at 'awaiting_logistics_action' (status quo
--           from 0034).
--     • Return jsonb gains TWO fields: `auto_skipped` (bool) and `po_id`
--       (always null at confirm time -- audit trail is via stock_movements).
--
-- Loo design decision (NO ghost PO):
--   The spec §3 fixes B "no ghost PO; reserve directly from stock_balances"
--   based on Loo's clarification: "ready stock is bc logistics team some
--   time will order po with buffer stock first". The buffer arrived via a
--   real past PO whose stock_movements row (kind='in', ref=that_po_id) is
--   already written. Auto-skip's stock_movements row (kind='out', ref=
--   order_id, note='reserve_from_buffer') closes the audit loop without
--   creating a synthetic purchase_orders row.
--
-- stock_movements column adaptation (schema fit):
--   stock_movements (0001_init.sql:221-232) does NOT have a `reason` column.
--   It has `kind` (enum 'in'/'out'/'adjust'), `ref` (text), `note` (text),
--   `by_role`, `by_user_id`, `occurred_at`. We use:
--     • kind='out'                  -- buffer is leaving the warehouse for
--                                      this customer order (paired with the
--                                      receive-time decrement at delivery)
--     • qty = -demand               -- NEGATIVE qty for kind='out' (matching
--                                      codebase convention from 0019/0024/0034
--                                      where SUM(qty) GROUP BY (sku, wh) gives
--                                      net flow: + for in, - for out)
--     • ref = order_id::text        -- audit trail back to consuming order
--     • note='reserve_from_buffer'  -- distinguishes from PO-receive 'in's
--                                      (which have ref=po_id, no note marker)
--   This matches the spec's intent: the audit row exists, is queryable by
--   ref or note, and needs no schema changes.
--
-- stock_balances reserve semantics (schema fit):
--   The spec §4.3 sketches "UPDATE stock_balances SET available_qty -=
--   demand". The schema (0001 + 0018) does NOT materialize available_qty;
--   instead `available = qty - reserved` is computed on the fly. The
--   functionally equivalent operation is `reserved += demand`, which is
--   exactly what v2 _logistics_reserve_order does (0024:107-141). We adopt
--   that same pattern here for two reasons:
--     1. The 0018 CHECK (qty >= reserved) enforces "never over-reserve";
--        any race condition trips SQLSTATE 23514 (check_violation) which we
--        catch + rethrow as P0001 detail='insufficient_stock_for_reserve'.
--     2. The receive-time decrement contract (logistics_attach_pod_do or
--        logistics_attach_do_and_deliver) already does
--        `qty -= line.qty AND reserved -= line.qty` -- so reserving via the
--        `reserved` column keeps that downstream invariant intact (delivery
--        zeroes both sides).
--
-- Atomicity (ALL-or-NONE per spec §3):
--   The auto-skip branch sits inside the same plpgsql function transaction
--   that already created the threads. If any step in the auto-skip block
--   raises (under-stock, check_violation, FOR UPDATE wait timeout), Postgres
--   rolls back ALL of this RPC's writes -- threads, reserves, audit rows.
--   The caller sees a single error response and zero state mutation. The
--   pre-flight count guard (`v_all_sufficient`) plus the FOR UPDATE re-check
--   ensure no thread is half-promoted under any race timeline.
--
-- Concurrency model:
--   Two simultaneous confirm-proceed calls on different orders that both
--   demand the same buffer SKU race for the FOR UPDATE lock. The first
--   acquires, the second waits, and when the second's turn comes:
--     - The pre-lock count says sufficient (read MVCC snapshot).
--     - Post-lock re-count sees the first transaction's reserved column
--       update (now visible because lock release also makes the writes
--       visible at READ COMMITTED).
--     - Re-count fails sufficiency -> ELSE branch -> threads stay awaiting.
--   This is the natural-good-outcome path (no error, no ghost PO).
--   If a TRUE serialization conflict arises (e.g. SERIALIZABLE isolation
--   sometimes set by Supabase RPC wrappers), Postgres raises 40001 which
--   propagates to the API as 409 Conflict via mapPgError (lib/route-helpers
--   already maps 40001 from migration 0037).
--
-- Idempotency:
--   • CREATE OR REPLACE FUNCTION (no DROP, no schema changes).
--   • Re-runnable. Subsequent migrations (0040 enum cleanup) will recreate
--     this function once more after the type swap; 0039's body is the
--     canonical post-T3 version.
--
-- Postgres caveats:
--   • CREATE OR REPLACE FUNCTION cannot change return type or signature.
--     The 0034 signature is `(p_order_id uuid) -> jsonb` and we preserve it
--     exactly. The return jsonb shape is a superset of 0034's (adds
--     auto_skipped + po_id keys), so existing tests that asserted the 0034
--     keys continue to pass; new T3 tests assert the additions.
-- =============================================================================


create or replace function public.logistics_confirm_proceed_request_v3(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order        orders;
  v_actor        text;
  v_role         app_role;
  v_uid          uuid;
  v_grp          record;
  v_supplier_slug text;
  v_sop_name     text;
  v_threads_created jsonb := '[]'::jsonb;
  v_thread_id    uuid;
  -- Auto-skip branch locals.
  v_demand_total int;
  v_demand_skus  int;
  v_match_skus   int;
  v_chosen_wh    uuid;
  v_chosen_wh_name text;
  v_demand       record;
  v_auto_skipped boolean := false;
  v_threads_promoted int;
begin
  v_role := public.app_role();
  v_uid  := (select auth.uid());

  if v_role is distinct from 'logistics' then
    raise exception 'forbidden: logistics only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 1. Lock order row (verbatim from 0034).
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- 2. State guards (verbatim from 0034).
  if v_order.status is distinct from 'proceed_order' then
    raise exception 'order is not in proceed_order status (got %)', v_order.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if v_order.logistics_stage is distinct from 'proceed_request' then
    raise exception 'order is not in proceed_request stage (got %)', v_order.logistics_stage
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid), 'Logistics');

  -- 3. Group lines by (supplier_id, category). Each group becomes one thread.
  --    Verbatim from 0034 -- UPSERT semantics preserved (idempotent restart).
  for v_grp in
    select ps.supplier_id,
           pm.category::text as category
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
     where ol.order_id = p_order_id
     group by ps.supplier_id, pm.category
  loop
    select slug into v_supplier_slug
      from suppliers
     where id = v_grp.supplier_id;

    if v_supplier_slug is null then
      raise exception 'supplier % has no slug -- 0032 backfill incomplete', v_grp.supplier_id
        using errcode = 'P0001', detail = 'supplier_slug_missing';
    end if;

    v_sop_name := public._v3_resolve_sop_name(v_supplier_slug, v_grp.category);
    if v_sop_name is null then
      raise exception 'no SOP for supplier=% category=%', v_supplier_slug, v_grp.category
        using errcode = '22023', detail = 'sop_not_found';
    end if;

    insert into order_supplier_threads
      (order_id, supplier_id, category, sop_name, logistics_stage)
    values
      (p_order_id, v_grp.supplier_id, v_grp.category, v_sop_name, 'awaiting_logistics_action')
    on conflict (order_id, supplier_id, category) do update
      set sop_name        = excluded.sop_name,
          logistics_stage = 'awaiting_logistics_action',
          po_id           = null,
          warehouse_id    = null,
          reserved_at     = null,
          delivered_at    = null,
          updated_at      = now()
    returning id into v_thread_id;

    v_threads_created := v_threads_created || jsonb_build_object(
      'thread_id',    v_thread_id,
      'supplier_id',  v_grp.supplier_id,
      'category',     v_grp.category,
      'sop_name',     v_sop_name,
      'stage',        'awaiting_logistics_action',
      'po_id',        null
    );
  end loop;

  -- ============================================================================
  -- 4. NEW (Phase 4.5a T3): auto-skip-from-stock branch.
  -- ============================================================================
  -- Compute per-SKU demand for this order; pick a candidate `own` warehouse
  -- that can satisfy ALL skus; if found, FOR UPDATE the rows + re-check
  -- under the lock + reserve + promote threads. ALL-or-NONE atomicity.
  -- ============================================================================

  -- 4a. Aggregate demand across all order_lines for this order, per SKU.
  --     A single SKU could appear on multiple lines via different addons but
  --     in practice order_lines is one row per (order_id, sku) -- the SUM
  --     guards against future multi-line-per-sku schema relaxations.
  with thread_demand as (
    select ol.sku as sku, sum(ol.qty)::int as demand
      from order_lines ol
     where ol.order_id = p_order_id
     group by ol.sku
  )
  select count(*)::int, coalesce(sum(demand), 0)::int
    into v_demand_skus, v_demand_total
    from thread_demand;

  -- Edge case: zero-line orders (shouldn't reach here under v_order.status =
  -- 'proceed_order' guard, but defensive). Treat as no-auto-skip and exit.
  if v_demand_skus = 0 or v_demand_total = 0 then
    update orders
       set logistics_stage = 'awaiting_logistics_action',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed proceed-request -- %s thread(s), 0 lines (no auto-skip)',
             jsonb_array_length(v_threads_created)),
      'logistics'
    );

    insert into audit_log (role, actor_text, action, dealer_id, ref)
    values ('logistics', v_actor,
            format('Confirmed proceed-request DL-%s -- %s threads (no lines)',
                   v_order.dl, jsonb_array_length(v_threads_created)),
            v_order.dealer_id, 'DL-' || v_order.dl::text);

    return jsonb_build_object(
      'order_id',         v_order.id,
      'dl',               v_order.dl,
      'logistics_stage',  'awaiting_logistics_action',
      'threads',          v_threads_created,
      'auto_skipped',     false,
      'po_id',            null
    );
  end if;

  -- 4b. Find a candidate `own` warehouse that can satisfy ALL demanded SKUs
  --     from buffer (qty - reserved >= demand for every SKU). Prefer the
  --     order's existing warehouse_id when set + qualifying; else pick the
  --     first `own` warehouse with full coverage by warehouse name (stable
  --     ordering for deterministic behaviour across staging vs prod).
  --
  --     Coverage test predicate per warehouse:
  --       count(distinct demand SKU where stock_balances row exists with
  --              qty - reserved >= demand) = total demand SKU count
  --     Wrapped in a subquery that returns warehouses meeting the coverage,
  --     ordered name ASC, LIMIT 1.
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

  -- 4c. If no warehouse covers all SKUs -> stay at awaiting_logistics_action.
  if v_chosen_wh is null then
    update orders
       set logistics_stage = 'awaiting_logistics_action',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Confirmed proceed-request -- split into %s thread(s); no buffer auto-skip',
             jsonb_array_length(v_threads_created)),
      'logistics'
    );

    insert into audit_log (role, actor_text, action, dealer_id, ref)
    values ('logistics', v_actor,
            format('Confirmed proceed-request DL-%s -- %s threads (awaiting)',
                   v_order.dl, jsonb_array_length(v_threads_created)),
            v_order.dealer_id, 'DL-' || v_order.dl::text);

    return jsonb_build_object(
      'order_id',         v_order.id,
      'dl',               v_order.dl,
      'logistics_stage',  'awaiting_logistics_action',
      'threads',          v_threads_created,
      'auto_skipped',     false,
      'po_id',            null
    );
  end if;

  -- 4d. Lock + re-check + reserve. SELECT ... FOR UPDATE on every demanded
  --     SKU's row at the chosen warehouse. The 0018 CHECK (qty >= reserved)
  --     gates over-reservation; we catch SQLSTATE 23514 (check_violation)
  --     and rethrow as P0001 detail='insufficient_stock_for_reserve' to
  --     match the v2 _logistics_reserve_order contract for FE consistency.
  --
  --     SQLSTATE 40001 (serialization_failure) propagates unchanged from
  --     Postgres if SERIALIZABLE isolation kicks in. mapPgError -> 409.
  for v_demand in
    select ol.sku as sku, sum(ol.qty)::int as demand
      from order_lines ol
     where ol.order_id = p_order_id
     group by ol.sku
  loop
    -- Lock the candidate stock row (TOCTOU defense).
    perform 1 from stock_balances
      where sku = v_demand.sku
        and warehouse_id = v_chosen_wh
      for update;

    -- Re-check sufficiency under the lock (a concurrent reserver may have
    -- depleted the buffer between our coverage scan and the lock acquire).
    if not exists (
      select 1 from stock_balances
       where sku = v_demand.sku
         and warehouse_id = v_chosen_wh
         and (qty - coalesce(reserved, 0)) >= v_demand.demand
    ) then
      -- Re-check failed -> retreat to awaiting (atomic: any reserves we
      -- already wrote in this loop iteration are rolled back by the surrounding
      -- savepoint). We achieve "all-or-nothing" by RAISING out of the auto-
      -- skip branch with a sentinel and catching it below; simpler: we use
      -- a single CTE-driven UPDATE so partial writes can't happen. To keep
      -- the loop straightforward, we compensate by doing the whole reserve
      -- in ONE statement after this re-check passes for ALL skus -- see
      -- step 4e below.
      v_chosen_wh := null;
      exit;
    end if;
  end loop;

  -- 4e. If re-check survived for every SKU, do the reserve in a SINGLE UPDATE
  --     against stock_balances (no per-row loop -> can't half-write). The
  --     UPDATE covers every (sku, warehouse_id) pair the demand CTE
  --     enumerates.
  if v_chosen_wh is not null then
    -- Reserve: increment `reserved` per demanded SKU. The 0018 CHECK trips
    -- SQLSTATE 23514 if any row would exceed qty -- caught + rethrown as
    -- P0001 insufficient_stock_for_reserve so FE sees the standard error.
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

    -- Stock-movements audit row per demanded SKU. kind='out', ref=order_id,
    -- note='reserve_from_buffer' so a future query like:
    --   SELECT * FROM stock_movements
    --   WHERE note = 'reserve_from_buffer' AND ref = order_id::text
    -- isolates auto-skip rows from PO-receive 'in' rows.
    --
    -- Note: kind='out' here is symmetric to logistics_attach_pod_do which
    -- writes another kind='out' at delivery time with note=null. The pair
    -- represents "reserved at confirm" + "physically left at delivery".
    -- The receive PO step that originally brought the buffer into the WH
    -- has its own 'in' row tagged ref=po_id. Cumulative balance stays
    -- consistent because we BUMP reserved here (qty stays) and only
    -- DECREMENT qty at delivery.
    --
    -- Sign convention: qty is NEGATIVE for kind='out' (matches 0019/0024/0034
    -- across the codebase). SUM(qty) GROUP BY (sku, warehouse_id) gives net
    -- flow: + for kind='in', - for kind='out'. The (kind, note) pair still
    -- distinguishes auto-skip rows from delivery rows for audit queries.
    insert into stock_movements (sku, warehouse_id, qty, kind, ref, note, by_role, by_user_id)
    select td.sku, v_chosen_wh, -td.demand, 'out',
           p_order_id::text, 'reserve_from_buffer', 'logistics', v_uid
      from (
        select ol.sku as sku, sum(ol.qty)::int as demand
          from order_lines ol
         where ol.order_id = p_order_id
         group by ol.sku
      ) td;

    -- Promote every thread of this order to ready_to_dispatch + bind to the
    -- chosen warehouse. The 0036 trigger sees these UPDATEs and rolls
    -- orders.logistics_stage to 'ready_to_dispatch' on its own.
    update order_supplier_threads
       set logistics_stage = 'ready_to_dispatch',
           warehouse_id    = v_chosen_wh,
           reserved_at     = now(),
           updated_at      = now()
     where order_id = p_order_id;
    get diagnostics v_threads_promoted = row_count;

    -- Reflect the promoted state in v_threads_created so the return jsonb
    -- mirrors what the trigger just wrote. Rebuild the array under the new
    -- stage label (the FE relies on the response shape rather than re-
    -- fetching after the call).
    select coalesce(jsonb_agg(jsonb_build_object(
             'thread_id',   t.id,
             'supplier_id', t.supplier_id,
             'category',    t.category,
             'sop_name',    t.sop_name,
             'stage',       t.logistics_stage,
             'po_id',       t.po_id
           )), '[]'::jsonb)
      into v_threads_created
      from order_supplier_threads t
     where t.order_id = p_order_id;

    v_auto_skipped := true;
  end if;

  -- 5. Update orders.logistics_stage. The 0036 trigger covers the auto-skip
  --    promote case via the order_supplier_threads UPDATE above; we still
  --    write it explicitly here so the awaiting branch (and any environment
  --    where the trigger is disabled) sees the right stage immediately.
  update orders
     set logistics_stage = case when v_auto_skipped
                                then 'ready_to_dispatch'::logistics_stage
                                else 'awaiting_logistics_action'::logistics_stage
                           end,
         warehouse_id    = case when v_auto_skipped
                                then v_chosen_wh
                                else warehouse_id
                           end,
         updated_at      = now()
   where id = p_order_id;

  -- 6. Audit + history.
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
    'logistics'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          case when v_auto_skipped
               then format('Auto-skipped DL-%s from buffer (%s) -- %s threads -> ready',
                           v_order.dl,
                           coalesce(v_chosen_wh_name, v_chosen_wh::text),
                           v_threads_promoted)
               else format('Confirmed proceed-request DL-%s -- %s threads (awaiting)',
                           v_order.dl, jsonb_array_length(v_threads_created))
          end,
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'order_id',         v_order.id,
    'dl',               v_order.dl,
    'logistics_stage',  case when v_auto_skipped
                              then 'ready_to_dispatch'
                              else 'awaiting_logistics_action'
                         end,
    'threads',          v_threads_created,
    'auto_skipped',     v_auto_skipped,
    -- po_id is ALWAYS null at confirm time. Auto-skip path does NOT create
    -- a ghost PO -- the buffer's ref-of-record is the stock_movements row
    -- written above. The thread's `po_id` only fills in later when
    -- logistics issues a real PO (Auto-fill flow) for the awaiting branch.
    'po_id',            null
  );
end;
$$;

revoke all on function public.logistics_confirm_proceed_request_v3(uuid) from public;
grant execute on function public.logistics_confirm_proceed_request_v3(uuid) to authenticated;


-- =============================================================================
-- End of 0039_logistics_confirm_v3_auto_skip.sql
-- =============================================================================
-- Self-review checklist (Phase 4.5a T3):
--   [x] Migration file numbered 0039 (next slot after 0038/0038b)
--   [x] Header banner explains sprint + spec refs (§4.3, §3, §5.1, §6) +
--       schema-fit notes for stock_movements + stock_balances columns
--   [x] CREATE OR REPLACE preserves 0034 signature (p_order_id uuid -> jsonb)
--   [x] All 0034 logic preserved verbatim through step 3 (thread INSERT)
--   [x] NEW step 4 implements auto-skip-from-stock per spec §4.3 skeleton:
--         4a aggregate per-SKU demand (CTE)
--         4b pick `own` warehouse with full coverage (CTE + LIMIT 1, prefer
--             order's existing warehouse_id, then alphabetical for stability)
--         4c no-coverage early-return (status quo from 0034 -- threads stay
--             awaiting_logistics_action)
--         4d FOR UPDATE per demanded SKU + TOCTOU re-check
--         4e single CTE-driven UPDATE on stock_balances.reserved (atomic;
--             can't half-write) + stock_movements audit insert + threads
--             promote to ready_to_dispatch + warehouse_id binding
--   [x] NO ghost PO: po_id always null in return jsonb (Loo decision)
--   [x] stock_movements.note = 'reserve_from_buffer' marker (schema fits;
--       no `reason` column exists, `note` is the closest equivalent)
--   [x] Atomicity: ALL or NONE -- single transaction; FOR UPDATE re-check
--       on every SKU; reserve is one CTE-driven UPDATE so partial writes
--       are impossible
--   [x] check_violation (23514) -> P0001 'insufficient_stock_for_reserve'
--       (matches v2 _logistics_reserve_order contract)
--   [x] 40001 propagates unchanged -> mapPgError 409 (lib/route-helpers
--       already maps from migration 0037 era)
--   [x] Idempotent: CREATE OR REPLACE; no DROP / TRUNCATE / DELETE
--   [x] No 'awaiting_stock' literal anywhere (v3 vocab clean per 0038/0038b)
--
-- Closes carry-forward: phase-4-v3-confirm-auto-skip-from-stock
-- Pairs with: 0040 enum cleanup (T6 -- after 0038/0038b/0039 RPC bodies are
--   all clean of 'awaiting_stock' literals)
-- Verified by: 4 new vitest tests in apps/api/src/routes/logistics/orders.test.ts
--   describe("Phase 4.5a confirm auto-skip-from-stock")
-- =============================================================================
