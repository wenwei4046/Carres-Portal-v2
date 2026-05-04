-- =============================================================================
-- 0036_orders_rollup_stage.sql -- Phase 4 v3-S5
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md
--   §4.4  -- "Implementation: orders.logistics_stage becomes a coarse rollup"
--           (orders_rollup_stage function, lines 567-581)
--   §13   -- backwards-compat note: orders.logistics_stage stays callable;
--           it just becomes a recomputed coarse value once threads exist
-- Sprint:      v3-S5 (rollup function + trigger)
-- Depends on:
--   0033_order_supplier_threads.sql -- the table this rolls up from
--   0028_logistics_stage_v3.sql     -- enum extension (awaiting_logistics_action,
--                                      waiting) referenced in the rollup CASE
--
-- =============================================================================
-- DORMANT STATE NOTE (READ FIRST):
--
-- This migration ships during v3-S5 BEFORE v3 thread-creation is wired into the
-- live confirm flow. As of v3-S5, two carry-forwards keep v3 dormant:
--   - phase-4-v3-batch-rpc-thread-claim
--   - phase-4-v3-confirm-rpc-swap
-- The Hono confirm route still calls v2 logistics_confirm_proceed_request (in
-- 0024) which writes orders.logistics_stage DIRECTLY and never inserts into
-- order_supplier_threads. Therefore:
--
--   1. No threads exist in production -> orders_rollup_stage() returns 'placed'
--      (the no-threads default branch). It is a pure read function and is
--      never invoked by anything until Phase 4.5 wires it in.
--
--   2. The trigger fires only on order_supplier_threads INSERT/UPDATE/DELETE.
--      With zero rows touching that table, the trigger never fires. The v2
--      confirm RPC is unaffected -- it still writes orders.logistics_stage
--      directly (and the trigger has no opinion because no thread row changes).
--
-- ONCE Phase 4.5 swaps the FE/API to call logistics_confirm_proceed_request_v3
-- (in 0034), threads start appearing, and from that moment on the trigger keeps
-- orders.logistics_stage in sync with the rollup automatically.
--
-- This is the "safe-to-land-now" sprint slice -- the SQL plumbing without the
-- behavioral switch. The rollup itself is small (~10 lines), STABLE, and free
-- of side-effects until something writes to order_supplier_threads.
-- =============================================================================
--
-- Idempotency:
--   - CREATE OR REPLACE FUNCTION for both functions
--   - DROP TRIGGER IF EXISTS + CREATE TRIGGER for the trigger
--   Re-running this migration is a no-op against already-applied state.
--
-- No DROP / TRUNCATE / DELETE in this file. Read-only against orders aside
-- from the trigger's conditional UPDATE (DISTINCT FROM guard prevents writes
-- when the rollup didn't change).
-- =============================================================================


-- =============================================================================
-- 1. orders_rollup_stage(p_order_id uuid) -> logistics_stage
-- =============================================================================
-- STABLE pure-SQL rollup matching spec §4.4 verbatim.
--
-- Semantics (top-down, first match wins):
--   - No threads exist for this order        -> 'placed'
--     (covers v2 orders pre-thread-split + new orders before
--     logistics_confirm_proceed_request_v3 is called)
--   - All threads delivered                  -> 'delivered'
--   - All threads in {dispatched, delivered, waiting}        -> 'dispatched'
--     (waiting is the sofa post-relocate stage; counts as forward progress)
--   - All threads in {ready_to_dispatch, dispatched, delivered, waiting}
--                                            -> 'ready_to_dispatch'
--   - Otherwise (mixed / earliest stage present) -> 'awaiting_logistics_action'
--
-- The cascade is intentional: an order is only "delivered" when ALL its threads
-- are delivered; "dispatched" when ALL its threads have at least dispatched
-- (waiting acts as dispatched for rollup purposes since stock has moved off the
-- partner WH); etc.
-- =============================================================================
create or replace function public.orders_rollup_stage(p_order_id uuid)
returns logistics_stage
language sql
stable
as $$
  with t as (
    select logistics_stage
      from order_supplier_threads
     where order_id = p_order_id
  )
  select case
    when not exists (select 1 from t)
      then 'placed'::logistics_stage
    when (select bool_and(logistics_stage = 'delivered') from t)
      then 'delivered'::logistics_stage
    when (select bool_and(logistics_stage in ('dispatched', 'delivered', 'waiting')) from t)
      then 'dispatched'::logistics_stage
    when (select bool_and(logistics_stage in ('ready_to_dispatch', 'dispatched', 'delivered', 'waiting')) from t)
      then 'ready_to_dispatch'::logistics_stage
    else 'awaiting_logistics_action'::logistics_stage
  end;
$$;

-- The function is read-only; safe to expose to all roles. RLS on
-- order_supplier_threads still applies inside the WITH -- a caller without
-- read access to the relevant threads sees an empty CTE and gets 'placed' back.
-- That is acceptable: the function never leaks thread state, only its rollup,
-- and 'placed' is a safe default.
revoke all on function public.orders_rollup_stage(uuid) from public;
grant execute on function public.orders_rollup_stage(uuid) to authenticated;


-- =============================================================================
-- 2. orders_rollup_stage_trigger() -- AFTER trigger function
-- =============================================================================
-- Fires AFTER any change to order_supplier_threads, recomputes the rollup, and
-- writes back to orders.logistics_stage IF AND ONLY IF the value actually
-- changed (DISTINCT FROM guard).
--
-- Why DISTINCT FROM:
--   - Avoids unnecessary writes (cheaper)
--   - Avoids UPDATE-without-change side effects (e.g. updated_at thrash on
--     orders, downstream listeners receiving phantom changes)
--   - Critically: avoids re-firing any future BEFORE/AFTER UPDATE trigger on
--     orders that might exist for audit purposes
--
-- The trigger uses COALESCE(NEW.order_id, OLD.order_id) so it works for all
-- three operations:
--   INSERT -> NEW only,        OLD is NULL
--   UPDATE -> both NEW and OLD (use NEW which is the post-update row)
--   DELETE -> OLD only,        NEW is NULL
--
-- Rationale for SECURITY DEFINER:
--   The function does an UPDATE on orders. RLS on orders is permissive for
--   logistics + principal but restrictive for dealer/partner. If a dealer
--   somehow triggered a thread insert via a SECURITY DEFINER RPC (e.g. future
--   path where dealer-side action lands a thread mutation), the trigger must
--   still update orders.logistics_stage on their behalf -- without SECURITY
--   DEFINER the trigger would inherit the caller's restricted role and the
--   UPDATE would silently no-op against RLS. SECURITY DEFINER bypasses that.
--
-- search_path is locked to public, pg_temp to neutralize search_path-injection
-- against SECURITY DEFINER functions (per Supabase advisor lint).
-- =============================================================================
create or replace function public.orders_rollup_stage_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id  uuid;
  v_new_stage logistics_stage;
begin
  -- Determine which order_id is affected. NEW is set on INSERT/UPDATE; OLD is
  -- set on DELETE/UPDATE. COALESCE picks whichever is non-null.
  v_order_id := coalesce(NEW.order_id, OLD.order_id);
  if v_order_id is null then
    return null;
  end if;

  -- Compute the new rollup stage from current thread state.
  v_new_stage := public.orders_rollup_stage(v_order_id);

  -- Update orders.logistics_stage iff the rollup actually changed (avoids
  -- trigger thrashing + spurious updated_at writes).
  update orders
     set logistics_stage = v_new_stage,
         updated_at      = now()
   where id = v_order_id
     and logistics_stage is distinct from v_new_stage;

  -- AFTER triggers ignore the return value, but we still return null
  -- explicitly to make intent clear.
  return null;
end;
$$;


-- =============================================================================
-- 3. Trigger registration on order_supplier_threads
-- =============================================================================
-- AFTER trigger so the rollup sees the post-mutation thread state. FOR EACH
-- ROW so we recompute per affected order (a single multi-row UPDATE on the
-- table fires the trigger once per row, but the DISTINCT FROM guard inside
-- the function makes that cheap -- only the first row where the rollup
-- changes will write to orders).
--
-- Idempotent registration: DROP IF EXISTS + CREATE.
-- =============================================================================
drop trigger if exists orders_rollup_stage_after_thread_change on order_supplier_threads;

create trigger orders_rollup_stage_after_thread_change
after insert or update or delete on order_supplier_threads
for each row execute function public.orders_rollup_stage_trigger();


-- =============================================================================
-- End of 0036_orders_rollup_stage.sql
-- =============================================================================
-- Self-review checklist:
--   [x] orders_rollup_stage matches spec §4.4 verbatim (STABLE, returns
--       logistics_stage, same CASE branches in same order)
--   [x] Trigger function uses COALESCE(NEW.order_id, OLD.order_id) for
--       INSERT/UPDATE/DELETE
--   [x] Trigger updates orders only IF DISTINCT FROM (avoids thrash)
--   [x] Both functions: CREATE OR REPLACE for idempotency
--   [x] Trigger: DROP IF EXISTS + CREATE for idempotency
--   [x] Header explains dormant state, sprint, spec ref, carry-forwards
--   [x] No DROP / TRUNCATE / DELETE on data
--   [x] SECURITY DEFINER + search_path lock on the trigger function
--   [x] Permissions: revoke all + grant execute to authenticated on the rollup
--       (trigger function is system-only -- no grants needed)
--
-- Carry-forwards related to this migration:
--   - phase-4-v3-batch-rpc-thread-claim
--   - phase-4-v3-confirm-rpc-swap
--   Once both close, threads start appearing in production and this trigger
--   activates. No code change needed in this file at that point.
-- =============================================================================
