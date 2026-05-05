-- =============================================================================
-- 0040_logistics_stage_drop_awaiting_stock.sql -- Phase 4.5a T6
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5a-v3-wake-design.md
--              §4.1 (migration plan), §4.5 (5-step enum recreate), §4.6
--              (pre-flight verification gates), §6 (rollback plan).
-- Sprint:      Phase 4.5a Task 6 -- enum cleanup, drop awaiting_stock
-- Depends on:
--   0001 init                                    (original logistics_stage enum)
--   0023 logistics_stage_enum_extend             (added 'waiting')
--   0028 logistics_stage_v3                      (added 'awaiting_logistics_action';
--                                                 also data-migrated every legacy
--                                                 awaiting_stock row to the new
--                                                 value)
--   0036 orders_rollup_stage                     (recreated below verbatim --
--                                                 CASCADE casualty)
--   0038 logistics_v2_rpc_v3_vocab_sweep         (RPC bodies clean of
--                                                 'awaiting_stock' literal)
--   0038b logistics_v2_residual_rpc_sweep        (residual RPC bodies clean)
--   0039 logistics_confirm_v3_auto_skip          (v3 confirm clean)
--   0039b logistics_dashboard_summary_v3_key_rename  (JSON key renamed)
--
-- =============================================================================
-- IRREVERSIBILITY WARNING (READ BEFORE APPLYING):
--
-- This migration is the **HIGH-WATER MARK** of the Phase 4.5a v3 wake. It
-- recreates the public.logistics_stage enum WITHOUT the legacy 'awaiting_stock'
-- value. Once applied, restoring the value requires another recreate-type
-- migration (lossy: any inserts targeting the old value between drop and
-- restore would fail and never recover).
--
-- Pre-flight gates (verified by Phase 4.5a T1 + T6 pre-flight; results in
-- docs/superpowers/plans/2026-05-05-phase-4.5a-preflight-notes.md and the
-- T6 task report):
--   1. SELECT count(*) FROM orders WHERE logistics_stage = 'awaiting_stock'
--      -> 0  (verified 2026-05-05 T1 + T6)
--   2. SELECT count(*) FROM order_supplier_threads WHERE logistics_stage = 'awaiting_stock'
--      -> 0  (verified 2026-05-05 T1 + T6)
--   3. pg_depend casualties (refobjid = logistics_stage::regtype, deptype IN ('n','a')):
--        - column logistics_stage of table orders                  (re-bound below)
--        - column logistics_stage of table order_supplier_threads  (re-bound below)
--        - function orders_rollup_stage(uuid)                      (recreated below)
--      All three reproduced inside this migration.
--   4. pg_proc bodies still containing the literal 'awaiting_stock' (text):
--        - logistics_confirm_proceed_request   -- 0 enum literals (comments only)
--        - logistics_warehouse_pick            -- 0 enum literals (comments only)
--        - order_proceed                       -- 1 enum literal write at the
--                                                 status-flip update (latent
--                                                 runtime breakage post-drop --
--                                                 recreated below to write
--                                                 'awaiting_logistics_action')
--   5. grep "'awaiting_stock'::logistics_stage" supabase/migrations/0038*.sql
--      0039*.sql 0040*.sql -> ZERO (verified 2026-05-05 T6).
--
-- The trigger orders_rollup_stage_after_thread_change on
-- order_supplier_threads is auto-detached when its function is dropped via
-- CASCADE (Postgres drops dependent triggers along with their functions). It
-- is reattached at the bottom of this migration after the function is
-- recreated.
-- =============================================================================
--
-- Migration sequence (single transaction; CREATE TYPE / DROP TYPE / ALTER
-- TABLE are all transactional in Postgres -- the ALTER TYPE ADD VALUE caveat
-- from 0028 does NOT apply here because we never add a value to an existing
-- type; we recreate the type wholesale):
--
--   1. CREATE TYPE logistics_stage_v3_clean AS ENUM (...) -- 7 v3 values
--   2. ALTER TABLE orders.logistics_stage      TYPE -> v3_clean (USING cast)
--   3. ALTER TABLE order_supplier_threads.logistics_stage TYPE -> v3_clean
--   4. DROP TYPE logistics_stage CASCADE       -- nukes orders_rollup_stage
--                                                 and the AFTER trigger
--   5. ALTER TYPE logistics_stage_v3_clean RENAME TO logistics_stage
--   6a. Recreate orders_rollup_stage(uuid)     -- body verbatim from 0036
--   6b. Recreate orders_rollup_stage_trigger() -- body verbatim from 0036
--   6c. Reattach AFTER trigger orders_rollup_stage_after_thread_change
--       on order_supplier_threads
--   6d. Recreate order_proceed(uuid)           -- swap 'awaiting_stock' literal
--                                                 to 'awaiting_logistics_action'
--                                                 (the only pg_proc body with
--                                                 a live legacy enum literal)
--
-- Idempotency: this migration is NOT idempotent (DROP TYPE CASCADE is
-- destructive). Re-running on a database where the old type no longer exists
-- would fail at step 2 (USING cast against a column whose type is already
-- v3-clean would also fail because the new type doesn't have 'awaiting_stock'
-- to map). The migration runner protects us by recording 0040 as applied
-- after first success.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- Step 1: create the new enum without 'awaiting_stock'.
--
-- Value order matches the v3 spec §3.5 + 0028 final ordering:
--   placed -> proceed_request -> awaiting_logistics_action ->
--   ready_to_dispatch -> dispatched -> waiting -> delivered.
-- ----------------------------------------------------------------------------
create type public.logistics_stage_v3_clean as enum (
  'placed',
  'proceed_request',
  'awaiting_logistics_action',
  'ready_to_dispatch',
  'dispatched',
  'waiting',
  'delivered'
);


-- ----------------------------------------------------------------------------
-- Step 2: switch orders.logistics_stage column to the new type.
--
-- USING cast: any legacy 'awaiting_stock' (should be 0 rows per pre-flight
-- gate 1) is mapped to 'awaiting_logistics_action'; every other value passes
-- through. The CASE-on-text form is the canonical Postgres pattern for type
-- swap with rebranding.
-- ----------------------------------------------------------------------------
alter table public.orders
  alter column logistics_stage type public.logistics_stage_v3_clean
  using (
    case logistics_stage::text
      when 'awaiting_stock' then 'awaiting_logistics_action'
      else logistics_stage::text
    end
  )::public.logistics_stage_v3_clean;


-- ----------------------------------------------------------------------------
-- Step 3: switch order_supplier_threads.logistics_stage column to the new
-- type. Same USING cast as orders. Pre-flight gate 2 confirms 0 rows with
-- the legacy value, so the cast is a structural no-op data-wise.
-- ----------------------------------------------------------------------------
alter table public.order_supplier_threads
  alter column logistics_stage type public.logistics_stage_v3_clean
  using (
    case logistics_stage::text
      when 'awaiting_stock' then 'awaiting_logistics_action'
      else logistics_stage::text
    end
  )::public.logistics_stage_v3_clean;


-- ----------------------------------------------------------------------------
-- Step 4: drop the old type CASCADE.
--
-- CASCADE casualties (verified by pg_depend pre-flight gate 3):
--   - function orders_rollup_stage(uuid)
--   - trigger orders_rollup_stage_after_thread_change on order_supplier_threads
--     (auto-detached when its execute function is dropped)
--
-- The two table columns that USED to depend on this type were re-bound to
-- the new type in steps 2-3 above, so they no longer appear in pg_depend at
-- this point.
-- ----------------------------------------------------------------------------
drop type public.logistics_stage cascade;


-- ----------------------------------------------------------------------------
-- Step 5: rename the new type into the old slot. After this point,
-- public.logistics_stage refers to the 7-value enum.
-- ----------------------------------------------------------------------------
alter type public.logistics_stage_v3_clean rename to logistics_stage;


-- ----------------------------------------------------------------------------
-- Step 6a: recreate orders_rollup_stage(uuid).
--
-- Body verbatim from 0036_orders_rollup_stage.sql §1. STABLE pure-SQL rollup
-- matching v3 spec §4.4 verbatim. The only relationship to this migration
-- is that the function references logistics_stage by name; the type lookup
-- happens at function-creation time (we are AFTER the rename in step 5).
-- ----------------------------------------------------------------------------
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

-- Permissions: same as 0036 (revoke from public, grant execute to authenticated).
revoke all on function public.orders_rollup_stage(uuid) from public;
grant execute on function public.orders_rollup_stage(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- Step 6b: recreate orders_rollup_stage_trigger().
--
-- Body verbatim from 0036_orders_rollup_stage.sql §2. AFTER trigger function
-- with SECURITY DEFINER + locked search_path. Recomputes the rollup and
-- writes back to orders.logistics_stage IFF the value changed (DISTINCT FROM
-- guard).
-- ----------------------------------------------------------------------------
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
  v_order_id := coalesce(NEW.order_id, OLD.order_id);
  if v_order_id is null then
    return null;
  end if;

  v_new_stage := public.orders_rollup_stage(v_order_id);

  update orders
     set logistics_stage = v_new_stage,
         updated_at      = now()
   where id = v_order_id
     and logistics_stage is distinct from v_new_stage;

  return null;
end;
$$;


-- ----------------------------------------------------------------------------
-- Step 6c: reattach the AFTER trigger on order_supplier_threads.
--
-- Definition matches 0036_orders_rollup_stage.sql §3 exactly:
--   AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW.
-- DROP IF EXISTS is defensive -- the CASCADE in step 4 already removed it,
-- but if a future re-run path ever hits this in a different sequence, the
-- guard prevents a duplicate-trigger error.
-- ----------------------------------------------------------------------------
drop trigger if exists orders_rollup_stage_after_thread_change on order_supplier_threads;

create trigger orders_rollup_stage_after_thread_change
after insert or update or delete on order_supplier_threads
for each row execute function public.orders_rollup_stage_trigger();


-- ----------------------------------------------------------------------------
-- Step 6d: recreate order_proceed(uuid) without the legacy 'awaiting_stock'
-- literal write.
--
-- order_proceed is defined in 0003_rpcs.sql §1 -- the dealer/salesperson
-- "proceed to next step" RPC. Its body writes
--   set logistics_stage = 'awaiting_stock'
-- which would silently succeed at function-definition time (Postgres does
-- not validate enum literals inside function bodies until execution) but
-- would fail at runtime with invalid_text_representation if anyone ever
-- called it after the enum recreate.
--
-- The current api codebase does NOT call order_proceed (Phase 4.5a T6 grep
-- of apps/ returned zero hits), but the function still lives in pg_proc,
-- so we patch it here in lockstep with the enum recreate to remove the
-- latent runtime hazard. New body writes 'awaiting_logistics_action' --
-- the v3 vocabulary -- matching the same rebranding 0028 applied to data.
--
-- Body otherwise verbatim from 0003_rpcs.sql §1: same signature, same
-- security mode (SECURITY DEFINER), same return type, same
-- order_history insert.
-- ----------------------------------------------------------------------------
create or replace function public.order_proceed(p_order_id uuid)
returns orders
language plpgsql security definer as $$
declare
  v_order orders;
begin
  update orders
    set status          = 'proceed_order',
        logistics_stage = 'awaiting_logistics_action'
    where id = p_order_id and status = 'place'
    returning * into v_order;

  if v_order.id is null then
    raise exception 'Order not found or not in place state' using errcode = 'P0002';
  end if;

  insert into order_history (order_id, text, by_role, by_user_id)
  values (p_order_id,
          'Proceeded · routed to Logistics',
          public.app_role(),
          auth.uid());

  return v_order;
end;
$$;

-- Permissions match 0003 line 447.
grant execute on function public.order_proceed(uuid) to authenticated;


-- =============================================================================
-- End of 0040_logistics_stage_drop_awaiting_stock.sql
-- =============================================================================
-- Self-review checklist (Phase 4.5a T6):
--   [x] Migration file numbered 0040 (slot AFTER 0039b)
--   [x] No edits to committed migrations 0001..0039b (CLAUDE.md §14 #6)
--   [x] Header banner explains irreversibility + pre-flight gates
--   [x] Step 1: new enum has exactly 7 values, no awaiting_stock, ordered to
--       match v3 spec §3.5 / 0028 final ordering
--   [x] Step 2-3: ALTER TABLE USING CASE preserves data semantics for both
--       columns; pre-flight confirmed 0 rows with legacy value so the CASE
--       awaiting_stock branch is dead in practice
--   [x] Step 4: DROP TYPE CASCADE drops the function + trigger; both
--       reproduced below
--   [x] Step 5: rename new type into old slot
--   [x] Step 6a: orders_rollup_stage(uuid) body byte-for-byte from 0036 §1
--   [x] Step 6b: orders_rollup_stage_trigger() body byte-for-byte from 0036 §2
--   [x] Step 6c: AFTER trigger reattached with same definition as 0036 §3
--   [x] Step 6d: order_proceed(uuid) recreated with 'awaiting_stock' ->
--       'awaiting_logistics_action' literal swap; rest of body verbatim from
--       0003 §1
--   [x] Permissions reproduced for orders_rollup_stage + order_proceed
--   [x] No DROP / TRUNCATE / DELETE on data tables
--   [x] No data UPDATE step needed (pre-flight confirmed 0 legacy rows)
--
-- Carry-forwards CLOSED by this migration (CLAUDE.md §17):
--   - The implicit "drop awaiting_stock enum" carry-forward (final step of
--     v3 vocabulary sweep)
-- Carry-forwards STILL OPEN (deferred to later phases):
--   - phase-4-v3-confirm-rpc-swap         (T4 -- already closed in commit
--                                           preceding T6)
--   - phase-4-v3-batch-rpc-thread-claim   (already closed in 0037)
--   - All other Phase 4.5b-4.5f open items remain open
-- =============================================================================
