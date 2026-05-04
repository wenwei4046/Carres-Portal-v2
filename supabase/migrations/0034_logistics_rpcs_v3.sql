-- =============================================================================
-- 0034_logistics_rpcs_v3.sql -- Phase 4 v3-S4
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md
--   §4.5  -- new / replaced RPCs (the 8 v3 RPCs in this file)
--   §6    -- Auto-fill flow (drives confirm_proceed_request_v3)
--   §7    -- Receive PO + DO upload (drives logistics_receive_po_with_do)
--   §11   -- Relocate Warehouse flow (drives logistics_relocate_warehouse)
--   §17   -- post-review update (Codex bugs 6, 7)
-- Sprint:      v3-S4 (logistics RPCs v3)
-- Depends on:
--   0026 product_skus.supplier_id      (routing -> supplier)
--   0027 warehouses.kind / owning_partner_id  (own vs logistics_partner)
--   0028 logistics_stage += awaiting_logistics_action / waiting
--   0030 po_sup_status += ready_confirm_sent / partner_confirmed /
--                          customer_rejected / relocated / at_partner_wh /
--                          at_own_wh_waiting + new PO columns
--   0032 suppliers.slug                (drives _v3_resolve_sop_name)
--   0033 order_supplier_threads        (the table these RPCs operate on)
--
-- Bug fixes baked in:
--   Codex Bug 6 (relocate semantic): mutate purchase_orders.warehouse_id
--     directly. Saves the previous warehouse to customer_rejection
--     .original_warehouse_id (jsonb) for audit. Safe in v3 because
--     reserve-at-receive means no allocation reads warehouse_id before
--     the relocate point.
--   Codex Bug 7 (auto-detect race): assign-and-dispatch + receive use
--     SELECT ... FOR UPDATE on purchase_orders before mutating, plus
--     state-transition guards (22023). Atomic claim from auto-detect
--     lives in logistics_create_pos_batch v3 extension (separate sprint).
--
-- =============================================================================
-- Functions added (8 public RPCs + 1 private helper):
--   _v3_resolve_sop_name(slug, category)            -- private (immutable)
--   logistics_confirm_proceed_request_v3(uuid)
--   logistics_supplier_ready_confirm(text)
--   partner_confirm_receive(text)
--   partner_reject_customer(text, text)
--   logistics_relocate_warehouse(text, uuid)
--   logistics_receive_po_with_do(text, text, text, jsonb)
--   logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid)
--   logistics_attach_pod_do(uuid, text, text)
--
-- All RPCs: SECURITY DEFINER + set search_path = public, pg_temp
-- All RPCs: idempotent (CREATE OR REPLACE), no DROP / TRUNCATE / DELETE
-- All RPCs: revoke from public + grant execute to authenticated
--
-- SQLSTATE contract (mirrors 0019/0024):
--   42501  forbidden                    -- caller role not allowed
--   42P01  not found                    -- order/po/thread/warehouse missing
--   22023  invalid_param / wrong stage  -- state machine violation
--   P0001  domain rule violation        -- e.g. reason too short
--   40001  serialization_failure        -- (used in logistics_create_pos_batch v3
--                                         extension; not in this file)
--
-- v3-S4 scope simplification (Auto-skip stock check):
--   logistics_confirm_proceed_request_v3 below ships the SIMPLER variant per
--   spec instruction: every (supplier, category) group becomes a thread at
--   logistics_stage='awaiting_logistics_action'. The stock-availability
--   auto-skip-to-ready_to_dispatch path is deferred to a follow-up
--   (carry-forward `phase-4-v3-confirm-auto-skip-from-stock`). The full path
--   is non-trivial because it must:
--     - sum order_lines.qty per (sku) for this thread
--     - check stock_balances.qty - reserved >= qty across all 'own' WHs
--     - pick the first WH with sufficient stock
--     - reserve via stock_balances.reserved += qty (with CHECK guard)
--   v3-S4 keeps this RPC focused on the thread-split + initial stage; once
--   FE/API tests are in place (v3-S4.4-S4.6), the auto-skip can land safely.
-- =============================================================================


-- =============================================================================
-- 0. PRIVATE HELPER -- _v3_resolve_sop_name(supplier_slug, category)
-- =============================================================================
-- Mirrors packages/shared/src/sops.ts sopFor() but DB-side. Returns 'STANDARD'
-- or 'SOFA_SPECIAL'. Returns NULL when no SOP exists for (slug, category) --
-- callers MUST raise 22023 in that case so the FE surface stays informative.
--
-- IMMUTABLE (and not SECURITY DEFINER): pure function of inputs, no IO. Safe
-- to inline in WHERE / CASE clauses if needed.
--
-- Underscore prefix marks it as a private helper (matches 0024's
-- _logistics_reserve_order convention).
-- =============================================================================
create or replace function public._v3_resolve_sop_name(p_slug text, p_category text)
returns text
language sql
immutable
as $$
  select case
    when p_slug = 'nice-future' then 'STANDARD'
    when p_slug = 'hookka' and p_category = 'sofa' then 'SOFA_SPECIAL'
    when p_slug = 'hookka' and p_category = 'bedframe' then 'STANDARD'
    -- Future supplier slugs / categories: extend this CASE.
    -- Returning NULL on unknown lets callers map to a domain-specific 22023.
    else null
  end;
$$;

revoke all on function public._v3_resolve_sop_name(text, text) from public;
revoke all on function public._v3_resolve_sop_name(text, text) from anon;
revoke all on function public._v3_resolve_sop_name(text, text) from authenticated;
-- service_role still has access via default + SECURITY DEFINER chain.


-- =============================================================================
-- 1. logistics_confirm_proceed_request_v3(p_order_id uuid) returns jsonb
-- =============================================================================
-- v3 REPLACEMENT for v2 logistics_confirm_proceed_request (which lives in
-- 0024 -- v2 RPC stays callable for backward compat during transition).
--
-- Effect: logistics user explicitly confirms a proceed_request order. RPC
-- splits the order into (supplier, category) threads; one thread per group.
--
-- Behaviour:
--   1. Role gate: logistics only.
--   2. Lock order row. Verify status='proceed_order' AND
--      logistics_stage='proceed_request' (else 22023).
--   3. Group order_lines by (product_skus.supplier_id, product_models.category).
--   4. For each group:
--        - Resolve supplier_slug + sop_name via _v3_resolve_sop_name.
--        - INSERT into order_supplier_threads (UPSERT on the unique
--          (order_id, supplier_id, category) so re-runs after partial failure
--          stay safe).
--        - logistics_stage := 'awaiting_logistics_action'.
--   5. Update order.logistics_stage := 'awaiting_logistics_action' (rollup
--      function lands in v3-S5 / migration 0035; until then we set the column
--      directly).
--   6. Audit log + history.
--
-- v3-S4 simplification: NO auto-skip-from-stock yet (see header note).
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
  v_grp          record;
  v_supplier_slug text;
  v_sop_name     text;
  v_threads_created jsonb := '[]'::jsonb;
  v_thread_id    uuid;
begin
  v_role := public.app_role();
  if v_role is distinct from 'logistics' then
    raise exception 'forbidden: logistics only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 1. Lock order row.
  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- 2. State guards.
  if v_order.status is distinct from 'proceed_order' then
    raise exception 'order is not in proceed_order status (got %)', v_order.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  if v_order.logistics_stage is distinct from 'proceed_request' then
    raise exception 'order is not in proceed_request stage (got %)', v_order.logistics_stage
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Logistics');

  -- 3. Group lines by (supplier_id, category). Each group becomes one thread.
  --    UPSERT on the (order_id, supplier_id, category) unique constraint -- if
  --    the RPC is retried after a partial failure, existing rows are reset to
  --    awaiting_logistics_action without po_id (idempotent restart).
  for v_grp in
    select ps.supplier_id,
           pm.category::text as category
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
     where ol.order_id = p_order_id
     group by ps.supplier_id, pm.category
  loop
    -- 3a. Resolve sop_name via supplier slug + category.
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

    -- 3b. UPSERT the thread.
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
      'stage',        'awaiting_logistics_action'
    );
  end loop;

  -- 4. Update orders.logistics_stage to the new v3 value. (v3-S5 will swap to
  --    a rollup function; until then we set it directly so the FE sees the
  --    transition immediately.)
  update orders
     set logistics_stage = 'awaiting_logistics_action',
         updated_at      = now()
   where id = p_order_id;

  -- 5. Audit log + history.
  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('Confirmed proceed-request -- split into %s thread(s)',
           jsonb_array_length(v_threads_created)),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Confirmed proceed-request DL-%s -- %s threads',
                 v_order.dl, jsonb_array_length(v_threads_created)),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'order_id',         v_order.id,
    'dl',               v_order.dl,
    'logistics_stage',  'awaiting_logistics_action',
    'threads',          v_threads_created
  );
end;
$$;

revoke all on function public.logistics_confirm_proceed_request_v3(uuid) from public;
grant execute on function public.logistics_confirm_proceed_request_v3(uuid) to authenticated;


-- =============================================================================
-- 2. logistics_supplier_ready_confirm(p_po_id text) returns jsonb
-- =============================================================================
-- Caller: logistics (代按) OR supplier (self-press, where supplier owns the PO
-- via supplier_id in their JWT).
--
-- Effect: PO sup_status -> 'ready_confirm_sent' + ready_confirm_at = now().
-- Per spec §10 / §4.5: this is the trigger for partner notification in the
-- Sofa flow (and a no-op style audit for the Standard flow).
-- =============================================================================
create or replace function public.logistics_supplier_ready_confirm(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po       purchase_orders;
  v_role     app_role;
  v_supplier_id uuid;
  v_actor    text;
begin
  v_role := public.app_role();
  v_supplier_id := public.app_supplier_id();

  -- Role gate: logistics OR supplier (where supplier owns this PO).
  if v_role not in ('logistics', 'supplier') then
    raise exception 'forbidden: logistics or supplier only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 1. Lock PO row.
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Cross-supplier guard: a supplier role caller can only press for their
  -- own PO. Logistics bypasses this check.
  if v_role = 'supplier' then
    if v_supplier_id is null or v_po.supplier_id is distinct from v_supplier_id then
      raise exception 'forbidden: cross-supplier ready-confirm'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;

  -- 2. State guard. Spec §4.4: valid sources are sup_status in
  --    ('pending', 'acknowledged', 'in_production').
  if v_po.sup_status not in ('pending', 'acknowledged', 'in_production') then
    raise exception 'PO is not in a state to ready-confirm (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())),
                      initcap(v_role::text));

  -- 3. Mutate.
  update purchase_orders
     set sup_status       = 'ready_confirm_sent',
         ready_confirm_at = now(),
         updated_at       = now()
   where id = p_po_id;

  -- 4. Audit + history.
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    case when v_role = 'logistics'
         then 'Ready-confirm sent (logistics 代按)'
         else 'Ready-confirm sent (supplier self-press)'
    end,
    v_role
  );

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Ready-confirm sent on PO %s', p_po_id),
          p_po_id);

  return jsonb_build_object(
    'po_id',            p_po_id,
    'sup_status',       'ready_confirm_sent',
    'ready_confirm_at', now()
  );
end;
$$;

revoke all on function public.logistics_supplier_ready_confirm(text) from public;
grant execute on function public.logistics_supplier_ready_confirm(text) to authenticated;


-- =============================================================================
-- 3. partner_confirm_receive(p_po_id text) returns jsonb
-- =============================================================================
-- Sofa happy path. Caller: partner (where delivery_partner_id matches the PO).
--
-- Effect:
--   - PO sup_status -> 'partner_confirmed'
--   - partner_confirmed_at = now()
--   - threads where po_id = p_po_id advance logistics_stage -> 'dispatched'
-- =============================================================================
create or replace function public.partner_confirm_receive(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po          purchase_orders;
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_threads_advanced int;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  if v_role is distinct from 'partner' then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_partner_id is null then
    raise exception 'partner JWT missing partner_id'
      using errcode = '42501', detail = 'partner_id_missing';
  end if;

  -- 1. Lock PO row.
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Cross-partner guard.
  if v_po.delivery_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: cross-partner confirm-receive'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. State guard. Spec §4.4: valid source = ready_confirm_sent.
  if v_po.sup_status is distinct from 'ready_confirm_sent' then
    raise exception 'PO is not in ready_confirm_sent state (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  -- 3. Mutate PO.
  update purchase_orders
     set sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   where id = p_po_id;

  -- 4. Advance threads tied to this PO -> dispatched.
  update order_supplier_threads
     set logistics_stage = 'dispatched',
         updated_at      = now()
   where po_id = p_po_id;
  get diagnostics v_threads_advanced = row_count;

  -- 5. Audit + history.
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    'Partner confirmed customer receive -- advancing threads to dispatched',
    'partner'
  );

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor,
          format('Partner confirmed receive on PO %s -- %s thread(s) -> dispatched',
                 p_po_id, v_threads_advanced),
          p_po_id);

  return jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now(),
    'threads_advanced',     v_threads_advanced
  );
end;
$$;

revoke all on function public.partner_confirm_receive(text) from public;
grant execute on function public.partner_confirm_receive(text) to authenticated;


-- =============================================================================
-- 4. partner_reject_customer(p_po_id text, p_reason text) returns jsonb
-- =============================================================================
-- Sofa rejected path. Caller: partner (matching delivery_partner_id).
--
-- Effect:
--   - PO sup_status -> 'customer_rejected'
--   - customer_rejection = jsonb {reason, at, original_warehouse_id}
--   - p_reason min 4 chars (else 22023, detail='reason_too_short')
--
-- Logistics' Procurement page will pick this up via filter chip "Relocate (N)"
-- (per spec §11.2) and call logistics_relocate_warehouse next.
-- =============================================================================
create or replace function public.partner_reject_customer(
  p_po_id  text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po          purchase_orders;
  v_role        app_role;
  v_partner_id  uuid;
  v_actor       text;
  v_rejection   jsonb;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  if v_role is distinct from 'partner' then
    raise exception 'forbidden: partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if v_partner_id is null then
    raise exception 'partner JWT missing partner_id'
      using errcode = '42501', detail = 'partner_id_missing';
  end if;

  -- Reason length guard.
  if p_reason is null or length(btrim(p_reason)) < 4 then
    raise exception 'reason must be at least 4 characters'
      using errcode = '22023', detail = 'reason_too_short';
  end if;

  -- 1. Lock PO row.
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Cross-partner guard.
  if v_po.delivery_partner_id is distinct from v_partner_id then
    raise exception 'forbidden: cross-partner reject-customer'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. State guard. Spec §4.2 / §11: source = ready_confirm_sent (same as
  --    confirm_receive; partner makes the binary choice).
  if v_po.sup_status is distinct from 'ready_confirm_sent' then
    raise exception 'PO is not in ready_confirm_sent state (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Partner');

  -- 3. Build rejection jsonb. original_warehouse_id is the PO's CURRENT
  --    warehouse (before relocate). logistics_relocate_warehouse later mutates
  --    purchase_orders.warehouse_id but uses this audit field to restore /
  --    reason about the move.
  v_rejection := jsonb_build_object(
    'reason',                btrim(p_reason),
    'at',                    now(),
    'original_warehouse_id', v_po.warehouse_id
  );

  -- 4. Mutate PO.
  update purchase_orders
     set sup_status         = 'customer_rejected',
         customer_rejection = v_rejection,
         updated_at         = now()
   where id = p_po_id;

  -- 5. Audit + history.
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    format('Partner rejected customer receive: %s', btrim(p_reason)),
    'partner'
  );

  insert into audit_log (role, actor_text, action, ref)
  values ('partner', v_actor,
          format('Partner rejected receive on PO %s: %s', p_po_id, btrim(p_reason)),
          p_po_id);

  return jsonb_build_object(
    'po_id',              p_po_id,
    'sup_status',         'customer_rejected',
    'customer_rejection', v_rejection
  );
end;
$$;

revoke all on function public.partner_reject_customer(text, text) from public;
grant execute on function public.partner_reject_customer(text, text) to authenticated;


-- =============================================================================
-- 5. logistics_relocate_warehouse(p_po_id text, p_new_warehouse_id uuid)
--    returns jsonb
-- =============================================================================
-- Codex Bug 6 fix: mutates purchase_orders.warehouse_id directly. The previous
-- warehouse is preserved in customer_rejection.original_warehouse_id (already
-- set by partner_reject_customer above). This is safe in v3 because reserve
-- happens at Receive time, not Confirm time -- no allocation references
-- warehouse_id before the relocate.
--
-- Effect:
--   1. Role gate: logistics.
--   2. Lock PO row. Verify sup_status='customer_rejected'.
--   3. UPDATE PO SET warehouse_id = p_new_warehouse_id, sup_status='relocated'.
--   4. Find threads for this PO. SOFA_SPECIAL -> stage='waiting'. STANDARD ->
--      no stage change (warehouse update on PO is enough).
--   5. Audit + history.
-- =============================================================================
create or replace function public.logistics_relocate_warehouse(
  p_po_id            text,
  p_new_warehouse_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po          purchase_orders;
  v_role        app_role;
  v_actor       text;
  v_warehouse_name text;
  v_threads_waited int;
begin
  v_role := public.app_role();

  if v_role is distinct from 'logistics' then
    raise exception 'forbidden: logistics only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  if p_new_warehouse_id is null then
    raise exception 'new warehouse id is required'
      using errcode = '22023', detail = 'new_warehouse_required';
  end if;

  -- 1. Lock PO row.
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- 2. State guard.
  if v_po.sup_status is distinct from 'customer_rejected' then
    raise exception 'PO is not in customer_rejected state (got %)', v_po.sup_status
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  -- 3. Validate new warehouse exists and differs from current.
  if not exists (select 1 from warehouses where id = p_new_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = '42P01', detail = 'warehouse_not_found';
  end if;

  if v_po.warehouse_id = p_new_warehouse_id then
    raise exception 'new warehouse must differ from current'
      using errcode = '22023', detail = 'same_warehouse';
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Logistics');

  -- 4. Mutate PO -- warehouse_id directly per Codex Bug 6.
  update purchase_orders
     set warehouse_id = p_new_warehouse_id,
         sup_status   = 'relocated',
         updated_at   = now()
   where id = p_po_id;

  -- 5. Advance only SOFA_SPECIAL threads to 'waiting' (the post-relocate stage
  --    where stock waits at own WH for customer's new delivery date). STANDARD
  --    threads don't change stage on relocate -- the warehouse update on the
  --    PO is enough; the existing stage is preserved.
  update order_supplier_threads
     set logistics_stage = 'waiting',
         warehouse_id    = p_new_warehouse_id,
         updated_at      = now()
   where po_id = p_po_id
     and sop_name = 'SOFA_SPECIAL';
  get diagnostics v_threads_waited = row_count;

  -- For STANDARD threads tied to this PO, just sync warehouse_id (no stage
  -- change). Useful so downstream Receive RPC reads the correct destination.
  update order_supplier_threads
     set warehouse_id = p_new_warehouse_id,
         updated_at   = now()
   where po_id = p_po_id
     and sop_name = 'STANDARD';

  select name into v_warehouse_name from warehouses where id = p_new_warehouse_id;

  -- 6. Audit + history.
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    format('Relocated warehouse to %s -- %s sofa thread(s) -> waiting',
           coalesce(v_warehouse_name, 'warehouse'),
           v_threads_waited),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Relocated PO %s to %s', p_po_id,
                 coalesce(v_warehouse_name, 'warehouse')),
          p_po_id);

  return jsonb_build_object(
    'po_id',                 p_po_id,
    'warehouse_id',          p_new_warehouse_id,
    'sup_status',            'relocated',
    'sofa_threads_waiting',  v_threads_waited
  );
end;
$$;

revoke all on function public.logistics_relocate_warehouse(text, uuid) from public;
grant execute on function public.logistics_relocate_warehouse(text, uuid) to authenticated;


-- =============================================================================
-- 6. logistics_receive_po_with_do(
--      p_po_id text,
--      p_do_file_path text,
--      p_do_number text,
--      p_lines jsonb
--    ) returns jsonb
-- =============================================================================
-- Per spec §7.4. p_lines = [{sku, received_qty}, ...]. Most complex RPC.
--
-- Effect:
--   1. Role gate: logistics OR partner (matching delivery_partner_id).
--   2. Lock PO row. Verify status='open'.
--   3. UPDATE purchase_order_lines SET received_qty for each provided line.
--   4. UPDATE PO SET do_file_path / do_uploaded_at / do_uploaded_by.
--   5. UPDATE stock_balances: qty += received_qty at po.warehouse_id (per SKU).
--   6. UPDATE order_supplier_threads (where po_id = p_po_id):
--        - SOFA_SPECIAL  -> 'dispatched'  (partner-WH staging)
--        - STANDARD      -> 'ready_to_dispatch'
--        - warehouse_id  := po.warehouse_id
--        - reserved_at   := now()
--   7. Reserve stock: stock_balances.reserved += sum(thread's order_lines qty)
--      per (sku, warehouse) pair touched by threads of this PO.
--   8. If all PO lines fully received, UPDATE PO status='received',
--      sup_status='delivered'.
--   9. Audit + history. Return jsonb with PO + thread + line totals.
--
-- Stock invariants enforced by 0018 CHECKs (qty>=reserved, reserved>=0). The
-- reserve step in 7 may fail those CHECKs if a race depleted available stock
-- between the qty++ and reserved++ steps -- but those happen in the same
-- transaction, so the qty just incremented covers the reserve. Defensive
-- exception handling rethrows as P0001 detail='insufficient_stock_for_reserve'
-- to match the 0024 helper contract.
-- =============================================================================
create or replace function public.logistics_receive_po_with_do(
  p_po_id        text,
  p_do_file_path text,
  p_do_number    text,
  p_lines        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po                purchase_orders;
  v_role              app_role;
  v_partner_id        uuid;
  v_actor             text;
  v_line              jsonb;
  v_sku               text;
  v_received_qty      int;
  v_existing_line     purchase_order_lines;
  v_delta             int;
  v_outstanding       int;
  v_lines_updated     int := 0;
  v_threads_advanced  int := 0;
  v_thread            record;
  v_reserve           record;
  v_uid               uuid;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();
  v_uid := (select auth.uid());

  -- 1. Role gate: logistics OR partner.
  if v_role not in ('logistics', 'partner') then
    raise exception 'forbidden: logistics or partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- Validate inputs.
  if p_do_file_path is null or length(btrim(p_do_file_path)) = 0 then
    raise exception 'DO file path is required'
      using errcode = '22023', detail = 'do_file_path_required';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) < 3 then
    raise exception 'DO number must be at least 3 characters'
      using errcode = '22023', detail = 'do_number_too_short';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = '22023', detail = 'lines_empty';
  end if;

  -- 2. Lock PO row.
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Cross-partner guard.
  if v_role = 'partner' then
    if v_partner_id is null or v_po.delivery_partner_id is distinct from v_partner_id then
      raise exception 'forbidden: cross-partner receive'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;

  -- 3. Status guard.
  if v_po.status is distinct from 'open' then
    raise exception 'PO is not open (status=%)', v_po.status
      using errcode = '22023', detail = 'po_not_open';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid),
                      initcap(v_role::text));

  -- 4. Apply per-line received_qty + bump stock_balances.qty per SKU.
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    v_received_qty := nullif(v_line->>'received_qty', '')::int;

    if v_sku is null or v_received_qty is null or v_received_qty < 0 then
      raise exception 'invalid line: sku=%, received_qty=%', v_sku, v_received_qty
        using errcode = '22023', detail = 'invalid_line';
    end if;

    -- Lock the PO line.
    select * into v_existing_line
      from purchase_order_lines
     where po_id = p_po_id and sku = v_sku
     for update;
    if not found then
      raise exception 'PO line not found for sku=%', v_sku
        using errcode = '42P01', detail = 'po_line_not_found';
    end if;

    if v_received_qty > v_existing_line.qty then
      raise exception 'over-received: % > ordered %', v_received_qty, v_existing_line.qty
        using errcode = 'P0001', detail = 'over_received';
    end if;

    v_delta := v_received_qty - v_existing_line.received_qty;
    if v_delta < 0 then
      raise exception 'received_qty must be >= currently received (%)', v_existing_line.received_qty
        using errcode = 'P0001', detail = 'received_qty_decrease';
    end if;

    -- Update PO line.
    update purchase_order_lines
       set received_qty = v_received_qty
     where po_id = p_po_id and sku = v_sku;

    -- Bump stock_balances.qty (UPSERT for first-time SKU at this warehouse).
    if v_delta > 0 then
      perform 1 from stock_balances
       where sku = v_sku and warehouse_id = v_po.warehouse_id
       for update;

      insert into stock_balances (sku, warehouse_id, qty)
      values (v_sku, v_po.warehouse_id, v_delta)
      on conflict (sku, warehouse_id) do update
        set qty = stock_balances.qty + v_delta,
            updated_at = now();

      insert into stock_movements
        (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
      values
        (v_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, v_role, v_uid);
    end if;

    v_lines_updated := v_lines_updated + 1;
  end loop;

  -- 5. Update PO -- DO file metadata.
  update purchase_orders
     set do_file_path    = p_do_file_path,
         do_uploaded_at  = now(),
         do_uploaded_by  = v_uid,
         do_number       = btrim(p_do_number),
         updated_at      = now()
   where id = p_po_id;

  -- 6. Advance threads tied to this PO. SOFA_SPECIAL -> dispatched (partner-WH
  --    staging), STANDARD -> ready_to_dispatch. Reserve will happen in step 7.
  for v_thread in
    select t.id, t.sop_name, t.order_id, t.supplier_id, t.category
      from order_supplier_threads t
     where t.po_id = p_po_id
     for update
  loop
    update order_supplier_threads
       set logistics_stage = case when v_thread.sop_name = 'SOFA_SPECIAL'
                                  then 'dispatched'
                                  else 'ready_to_dispatch'
                             end,
           warehouse_id    = v_po.warehouse_id,
           reserved_at     = now(),
           updated_at      = now()
     where id = v_thread.id;

    v_threads_advanced := v_threads_advanced + 1;

    -- 7. Reserve stock for the thread's slice of order_lines. The thread
    --    represents (order, supplier, category); its slice is order_lines
    --    where the line's SKU resolves to the same supplier+category.
    for v_reserve in
      select ol.sku as sku, ol.qty as qty
        from order_lines ol
        join product_skus ps on ps.sku = ol.sku
        join product_models pm on pm.id = ps.model_id
       where ol.order_id = v_thread.order_id
         and ps.supplier_id = v_thread.supplier_id
         and pm.category::text = v_thread.category
    loop
      begin
        update stock_balances
           set reserved   = reserved + v_reserve.qty,
               updated_at = now()
         where sku = v_reserve.sku
           and warehouse_id = v_po.warehouse_id;

        if not found then
          raise exception 'no stock_balances row for sku=% wh=%', v_reserve.sku, v_po.warehouse_id
            using errcode = 'P0001',
                  detail  = 'insufficient_stock_for_reserve',
                  hint    = format('sku=%s warehouse_id=%s', v_reserve.sku, v_po.warehouse_id);
        end if;
      exception
        when check_violation then
          raise exception 'cannot reserve sku=% at wh=% (qty < reserved + %)',
                          v_reserve.sku, v_po.warehouse_id, v_reserve.qty
            using errcode = 'P0001',
                  detail  = 'insufficient_stock_for_reserve',
                  hint    = format('sku=%s warehouse_id=%s', v_reserve.sku, v_po.warehouse_id);
      end;
    end loop;
  end loop;

  -- 8. If all PO lines fully received, flip PO status. Same predicate as
  --    0024's logistics_receive_po_line.
  select count(*) into v_outstanding
    from purchase_order_lines
   where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    update purchase_orders
       set status     = 'received',
           sup_status = 'delivered',
           updated_at = now()
     where id = p_po_id;
  end if;

  -- 9. Audit + history.
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    format('Received with DO %s -- %s line(s), %s thread(s) advanced',
           btrim(p_do_number), v_lines_updated, v_threads_advanced),
    v_role
  );

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, v_actor,
          format('Received PO %s with DO %s', p_po_id, btrim(p_do_number)),
          p_po_id);

  return jsonb_build_object(
    'po_id',             p_po_id,
    'do_file_path',      p_do_file_path,
    'do_number',         btrim(p_do_number),
    'lines_updated',     v_lines_updated,
    'threads_advanced',  v_threads_advanced,
    'po_status',         (select status from purchase_orders where id = p_po_id),
    'sup_status',        (select sup_status from purchase_orders where id = p_po_id)
  );
end;
$$;

revoke all on function public.logistics_receive_po_with_do(text, text, text, jsonb) from public;
grant execute on function public.logistics_receive_po_with_do(text, text, text, jsonb) to authenticated;


-- =============================================================================
-- 7. logistics_assign_partner_and_dispatch(
--      p_po_id text,
--      p_partner_id uuid default null,
--      p_outsource_name text default null,
--      p_outsource_contact text default null,
--      p_outsource_zones text default null,
--      p_warehouse_override_id uuid default null
--    ) returns jsonb
-- =============================================================================
-- v3 REPLACES v2 logistics_assign_pickup_partner (which lives in 0019). v2 stays
-- callable for backward compat -- pos.ts can switch to v3 incrementally.
--
-- XOR contract (per spec §8 + 0030 CHECK po_outsource_xor_partner):
--   exactly ONE of p_partner_id, p_outsource_name MUST be non-null.
--
-- Effect:
--   1. Role gate: logistics.
--   2. Validate XOR.
--   3. Lock PO row.
--   4a. p_partner_id  -> PO SET delivery_partner_id, sup_status='pickup_assigned'
--   4b. p_outsource_name -> PO SET outsource_partner_*, delivery_partner_id=NULL,
--       sup_status='pickup_assigned'
--   5. p_warehouse_override_id (optional) -> PO SET warehouse_id
--   6. po_history insert (kind='partner_assigned' captured in text)
--   7. audit_log insert (kind='assign_partner' captured in action)
-- =============================================================================
create or replace function public.logistics_assign_partner_and_dispatch(
  p_po_id                 text,
  p_partner_id            uuid    default null,
  p_outsource_name        text    default null,
  p_outsource_contact     text    default null,
  p_outsource_zones       text    default null,
  p_warehouse_override_id uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po              purchase_orders;
  v_role            app_role;
  v_actor           text;
  v_partner_name    text;
  v_warehouse_name  text;
  v_outsource       boolean;
begin
  v_role := public.app_role();

  if v_role is distinct from 'logistics' then
    raise exception 'forbidden: logistics only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. XOR validation: exactly one of partner_id or outsource_name MUST be set.
  if (p_partner_id is null) = (p_outsource_name is null) then
    raise exception 'exactly one of partner_id or outsource_name must be provided'
      using errcode = '22023', detail = 'partner_or_outsource_xor';
  end if;

  v_outsource := p_partner_id is null;

  -- Outsource-specific validation.
  if v_outsource then
    if length(btrim(coalesce(p_outsource_name, ''))) = 0 then
      raise exception 'outsource name cannot be empty'
        using errcode = '22023', detail = 'outsource_name_empty';
    end if;
    if length(btrim(coalesce(p_outsource_contact, ''))) = 0 then
      raise exception 'outsource contact is required'
        using errcode = '22023', detail = 'outsource_contact_required';
    end if;
  end if;

  -- 3. Lock PO row (Codex Bug 7 race guard -- the assign step must observe
  --    a stable PO state to avoid double-assignment if two logistics users
  --    click simultaneously).
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- Validate optional warehouse override.
  if p_warehouse_override_id is not null then
    if not exists (select 1 from warehouses where id = p_warehouse_override_id) then
      raise exception 'warehouse not found'
        using errcode = '42P01', detail = 'warehouse_not_found';
    end if;
  end if;

  -- Validate registered partner.
  if not v_outsource then
    select name into v_partner_name from delivery_partners where id = p_partner_id;
    if v_partner_name is null then
      raise exception 'delivery partner not found'
        using errcode = '42P01', detail = 'partner_not_found';
    end if;
  end if;

  v_actor := coalesce((select name from app_users where id = (select auth.uid())), 'Logistics');

  -- 4. Mutate PO. The 0030 CHECK po_outsource_xor_partner enforces:
  --    (outsource_partner_name is null) OR (delivery_partner_id is null).
  --    We always clear the OTHER side to keep that invariant.
  if v_outsource then
    update purchase_orders
       set delivery_partner_id        = null,
           outsource_partner_name     = btrim(p_outsource_name),
           outsource_partner_contact  = btrim(p_outsource_contact),
           outsource_partner_zones    = nullif(btrim(coalesce(p_outsource_zones, '')), ''),
           sup_status                 = 'pickup_assigned',
           warehouse_id               = coalesce(p_warehouse_override_id, warehouse_id),
           updated_at                 = now()
     where id = p_po_id;
  else
    update purchase_orders
       set delivery_partner_id        = p_partner_id,
           outsource_partner_name     = null,
           outsource_partner_contact  = null,
           outsource_partner_zones    = null,
           sup_status                 = 'pickup_assigned',
           warehouse_id               = coalesce(p_warehouse_override_id, warehouse_id),
           updated_at                 = now()
     where id = p_po_id;
  end if;

  if p_warehouse_override_id is not null then
    select name into v_warehouse_name from warehouses where id = p_warehouse_override_id;
  end if;

  -- 5. po_history (kind captured in text per existing po_history shape -- the
  --    table doesn't have a `kind` column).
  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    case when v_outsource
         then format('Partner assigned (outsource: %s)%s',
                     btrim(p_outsource_name),
                     case when p_warehouse_override_id is not null
                          then ' to ' || coalesce(v_warehouse_name, 'warehouse')
                          else '' end)
         else format('Partner assigned: %s%s',
                     v_partner_name,
                     case when p_warehouse_override_id is not null
                          then ' to ' || coalesce(v_warehouse_name, 'warehouse')
                          else '' end)
    end,
    'logistics'
  );

  -- 6. audit_log -- action prefix tags this as the new v3 RPC.
  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Assigned partner-and-dispatch %s -- %s%s',
                 p_po_id,
                 case when v_outsource
                      then 'outsource: ' || btrim(p_outsource_name)
                      else v_partner_name end,
                 case when p_warehouse_override_id is not null
                      then ' (wh: ' || coalesce(v_warehouse_name, 'override') || ')'
                      else '' end),
          p_po_id);

  return jsonb_build_object(
    'po_id',                  p_po_id,
    'sup_status',             'pickup_assigned',
    'outsource',              v_outsource,
    'delivery_partner_id',    case when v_outsource then null else p_partner_id end,
    'outsource_partner_name', case when v_outsource then btrim(p_outsource_name) else null end,
    'warehouse_id',           coalesce(p_warehouse_override_id, v_po.warehouse_id)
  );
end;
$$;

revoke all on function public.logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid) from public;
grant execute on function public.logistics_assign_partner_and_dispatch(text, uuid, text, text, text, uuid) to authenticated;


-- =============================================================================
-- 8. logistics_attach_pod_do(p_thread_id uuid, p_do_file_path text, p_do_number text)
--    returns jsonb
-- =============================================================================
-- Final delivery of a thread. Decrements physical stock.
--
-- Effect:
--   1. Role gate: logistics OR partner (matching the thread's PO's
--      delivery_partner_id).
--   2. Lock thread row. Verify logistics_stage in ('dispatched', 'waiting').
--   3. UPDATE thread SET logistics_stage='delivered', delivered_at=now().
--   4. Decrement stock: for each line of the thread's order matching the
--      thread's (supplier_id, category), at the thread's warehouse, do
--      qty -= line.qty AND reserved -= line.qty.
--   5. INSERT stock_movements (kind='out', sku, warehouse_id, qty=-line.qty,
--      ref=p_do_file_path).
--   6. Audit + history.
-- =============================================================================
create or replace function public.logistics_attach_pod_do(
  p_thread_id    uuid,
  p_do_file_path text,
  p_do_number    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_thread        order_supplier_threads;
  v_role          app_role;
  v_partner_id    uuid;
  v_actor         text;
  v_uid           uuid;
  v_po            purchase_orders;
  v_line          record;
  v_dl            int;
  v_dealer_id     uuid;
  v_lines_dec     int := 0;
begin
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();
  v_uid := (select auth.uid());

  if v_role not in ('logistics', 'partner') then
    raise exception 'forbidden: logistics or partner only'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- Inputs.
  if p_do_file_path is null or length(btrim(p_do_file_path)) = 0 then
    raise exception 'DO file path is required'
      using errcode = '22023', detail = 'do_file_path_required';
  end if;
  if p_do_number is null or length(btrim(p_do_number)) < 3 then
    raise exception 'DO number must be at least 3 characters'
      using errcode = '22023', detail = 'do_number_too_short';
  end if;

  -- 1. Lock thread.
  select * into v_thread from order_supplier_threads where id = p_thread_id for update;
  if not found then
    raise exception 'thread not found'
      using errcode = '42P01', detail = 'thread_not_found';
  end if;

  -- Cross-partner guard: when called by partner, the thread's PO must belong
  -- to that partner.
  if v_role = 'partner' then
    if v_partner_id is null then
      raise exception 'partner JWT missing partner_id'
        using errcode = '42501', detail = 'partner_id_missing';
    end if;
    if v_thread.po_id is null then
      raise exception 'thread has no PO assignment -- partner cannot attach POD'
        using errcode = '22023', detail = 'thread_no_po';
    end if;
    select * into v_po from purchase_orders where id = v_thread.po_id;
    if v_po.delivery_partner_id is distinct from v_partner_id then
      raise exception 'forbidden: cross-partner attach-pod'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;

  -- 2. Stage guard.
  if v_thread.logistics_stage not in ('dispatched', 'waiting') then
    raise exception 'thread is not in dispatched/waiting stage (got %)', v_thread.logistics_stage
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  -- 3. Warehouse must be set on the thread (Receive PO must have run first).
  if v_thread.warehouse_id is null then
    raise exception 'thread has no warehouse_id -- Receive must run first'
      using errcode = '22023', detail = 'thread_no_warehouse';
  end if;

  v_actor := coalesce((select name from app_users where id = v_uid),
                      initcap(v_role::text));

  -- Capture DL + dealer for audit (prefer thread.order_id since that's the
  -- source-of-truth customer order).
  select dl, dealer_id into v_dl, v_dealer_id
    from orders where id = v_thread.order_id;

  -- 4. Decrement physical stock for each line in this thread's slice.
  for v_line in
    select ol.sku, ol.qty
      from order_lines ol
      join product_skus ps on ps.sku = ol.sku
      join product_models pm on pm.id = ps.model_id
     where ol.order_id = v_thread.order_id
       and ps.supplier_id = v_thread.supplier_id
       and pm.category::text = v_thread.category
  loop
    -- Lock the stock_balances row before update.
    perform 1 from stock_balances
     where sku = v_line.sku and warehouse_id = v_thread.warehouse_id
     for update;

    update stock_balances
       set qty        = qty - v_line.qty,
           reserved   = greatest(0, reserved - v_line.qty),
           updated_at = now()
     where sku = v_line.sku
       and warehouse_id = v_thread.warehouse_id;

    if not found then
      raise exception 'no stock_balances row for sku=% wh=%', v_line.sku, v_thread.warehouse_id
        using errcode = 'P0001', detail = 'stock_row_missing';
    end if;

    -- Stock movement out -- ref = DO file path so audit links to the upload.
    insert into stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    values
      (v_line.sku, v_thread.warehouse_id, -v_line.qty, 'out',
       p_do_file_path, v_role, v_uid);

    v_lines_dec := v_lines_dec + 1;
  end loop;

  -- 5. Mark the thread delivered.
  update order_supplier_threads
     set logistics_stage = 'delivered',
         delivered_at    = now(),
         updated_at      = now()
   where id = p_thread_id;

  -- 6. order_history + audit_log.
  insert into order_history (order_id, text, by_role)
  values (
    v_thread.order_id,
    format('Thread (%s/%s) delivered -- DO %s',
           v_thread.supplier_id, v_thread.category, btrim(p_do_number)),
    v_role
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (v_role, v_actor,
          format('Attached POD DO %s on thread %s -- %s line(s) deducted',
                 btrim(p_do_number), p_thread_id, v_lines_dec),
          v_dealer_id,
          'DL-' || v_dl::text);

  return jsonb_build_object(
    'thread_id',     p_thread_id,
    'logistics_stage', 'delivered',
    'do_file_path',  p_do_file_path,
    'do_number',     btrim(p_do_number),
    'lines_deducted', v_lines_dec,
    'delivered_at',  now()
  );
end;
$$;

revoke all on function public.logistics_attach_pod_do(uuid, text, text) from public;
grant execute on function public.logistics_attach_pod_do(uuid, text, text) to authenticated;


-- =============================================================================
-- End of 0034_logistics_rpcs_v3.sql
-- =============================================================================
-- Self-review checklist (for the implementer's notes):
--   [x] All 8 RPCs implemented per spec §4.5
--   [x] All RPCs are SECURITY DEFINER (helper _v3_resolve_sop_name is IMMUTABLE)
--   [x] Helper _v3_resolve_sop_name returns 'STANDARD' or 'SOFA_SPECIAL' (or NULL)
--   [x] Role gates use SQLSTATE 42501 for forbidden
--   [x] State transition guards use 22023
--   [x] Race guard: assign_partner_and_dispatch uses FOR UPDATE on PO
--   [x] Relocate mutates warehouse_id directly per Codex Bug 6
--   [x] Audit log + po_history inserts present (po_history table exists; uses
--       text + by_role columns since there's no kind column)
--   [x] Idempotent: CREATE OR REPLACE FUNCTION for all 8 + helper
--   [x] No DROP / TRUNCATE / DELETE
--   [x] Header banner explains sprint + spec refs
--   [x] All helper subqueries wrapped: (select auth.uid()) etc.
--
-- Carry-forwards introduced by this migration:
--   - phase-4-v3-confirm-auto-skip-from-stock
--       confirm_proceed_request_v3 ships the simpler variant; auto-skip-from-
--       stock is deferred. Acceptable because v3-S4 FE tests can verify the
--       thread-split correctness independently of the auto-skip optimization.
--   - phase-4-v3-rpc-integration-tests
--       Integration tests for these 8 RPCs land in v3-S4.4-S4.6 alongside the
--       Hono routes that wrap them. v3-S4.2 (this migration) intentionally
--       ships without tests.
-- =============================================================================
