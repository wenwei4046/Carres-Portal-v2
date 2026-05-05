-- =============================================================================
-- 0054_stock_balances_thresholds.sql -- Phase 4.5 Chunk 2 Sprint D Task 17
-- =============================================================================
-- Source spec:  docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md §5
--               (CQ2 -- "extend stock_balances with low/high threshold cols")
-- Source plan:  docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2.md
--               §Sprint D Task 17 (lines 225-234)
-- Resume plan:  docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-resume.md
--               §Sprint D (lines 251-264) -- migration number bumped to 0054
--               (master plan said 0053 but 0053 is now Sprint C T13.5
--               procurement-leg RPC migration).
--
-- What this migration does:
--   1. Adds 2 nullable columns to stock_balances:
--        a. low_threshold  int  -- alert pill fires when (qty - reserved) <
--           low_threshold. NULL = "no alert configured".
--        b. high_threshold int  -- replenishment ceiling used by CreatePOModal
--           "Suggest from alerts" button. NULL = "fall back to low * 2".
--      Both have a per-column CHECK enforcing >= 0 (or NULL).
--   2. Adds a table-level CHECK constraint stock_balances_threshold_order
--      asserting high_threshold >= low_threshold whenever both are set.
--   3. Creates RPC logistics_stock_alerts() which returns rows where the
--      effective stock (qty - reserved) is BELOW low_threshold. Used by:
--        * LogisticsDashboard alert tile (count + top-3 SKUs)
--        * LogisticsWarehouse page red-dot indicator
--        * CreatePOModal "Suggest from alerts" button
--      Role gate: logistics or principal only (raise 42501 'forbidden'
--      otherwise -- mirrors the gate in 0034 / 0045 logistics RPCs).
--      LANGUAGE plpgsql, SECURITY DEFINER, SET search_path = public, pg_temp.
--      GRANT EXECUTE to authenticated; REVOKE ALL from public.
--
-- Migration is fully ADDITIVE -- no DROPs / RENAMEs. Safe to roll forward.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Add the two threshold columns + per-column CHECK constraints.
-- -----------------------------------------------------------------------------
alter table stock_balances
  add column if not exists low_threshold  int check (low_threshold  is null or low_threshold  >= 0),
  add column if not exists high_threshold int check (high_threshold is null or high_threshold >= 0);


-- -----------------------------------------------------------------------------
-- 2. Table-level CHECK -- threshold ordering invariant.
-- -----------------------------------------------------------------------------
alter table stock_balances
  add constraint stock_balances_threshold_order
    check (low_threshold is null
           or high_threshold is null
           or high_threshold >= low_threshold);


-- -----------------------------------------------------------------------------
-- 3. logistics_stock_alerts() RPC.
-- -----------------------------------------------------------------------------
-- Computes alert rows at query time (no trigger / materialized view). Returns
-- one row per (sku, warehouse_id) where:
--   * low_threshold is configured (non-NULL)
--   * effective stock (qty - reserved) is strictly less than low_threshold
--
-- Columns returned:
--   sku            -- text, the alerting SKU
--   warehouse_id   -- uuid of the warehouse this row reports for
--   qty            -- raw on-hand qty
--   reserved       -- units committed to in-flight dispatches
--   effective      -- qty - reserved (the dispatchable count)
--   low_threshold  -- the threshold that fired
--   shortage       -- low_threshold - effective (always > 0 by WHERE filter)
--
-- Role gate: logistics or principal only.
-- -----------------------------------------------------------------------------
create or replace function public.logistics_stock_alerts()
returns table (
  sku           text,
  warehouse_id  uuid,
  qty           int,
  reserved      int,
  effective     int,
  low_threshold int,
  shortage      int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role app_role;
begin
  v_role := public.app_role();

  if v_role not in ('logistics', 'principal') then
    raise exception 'forbidden: logistics or principal only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  return query
    select sb.sku,
           sb.warehouse_id,
           sb.qty,
           sb.reserved,
           (sb.qty - sb.reserved)::int                 as effective,
           sb.low_threshold,
           (sb.low_threshold - (sb.qty - sb.reserved))::int as shortage
      from stock_balances sb
     where sb.low_threshold is not null
       and (sb.qty - sb.reserved) < sb.low_threshold
     order by (sb.low_threshold - (sb.qty - sb.reserved)) desc,
              sb.sku asc;
end;
$$;

revoke all on function public.logistics_stock_alerts() from public;
grant execute on function public.logistics_stock_alerts() to authenticated;
