-- =============================================================================
-- 0037_logistics_create_po_thread_claim.sql -- Phase 4 v3-active.1
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §6.4
--              (race guard rationale, Codex Bug 7)
-- Sprint:      v3-active.1 (the "wake-up" step that closes carry-forward
--              `phase-4-v3-batch-rpc-thread-claim`)
-- Depends on:
--   0025 logistics_create_pos_batch + _logistics_create_po_inner helper
--   0033 order_supplier_threads (po_id text FK, unique (order_id, supplier_id, category))
--   0034 logistics_rpcs_v3 (the v3 RPCs that operate on threads -- this
--        migration completes the pairing by claiming threads at PO insert time)
--
-- Why this migration:
--   v3 ships dormant after `phase-4-v3-complete` (commit 2e6fdae). Schema and
--   thread-aware RPCs landed in 0026-0036 but the v2 PO creation path
--   (logistics_create_po + logistics_create_pos_batch from 0019/0025) does
--   NOT yet write order_supplier_threads.po_id. Once Phase 4.5's confirm-RPC
--   swap (next task v3-active.2) wires the FE to call
--   logistics_confirm_proceed_request_v3, threads start existing in
--   production -- but PO creation will leave them with po_id IS NULL forever
--   unless we close the loop here.
--
--   This migration extends both PO-creation entry points (single + batch) to:
--     1. After PO insert, locate matching threads via the PO's
--        (supplier_id, dl + dl_refs).
--     2. SELECT FOR UPDATE on those threads (race guard per spec §6.4).
--     3. If ANY candidate thread has po_id NOT NULL -> raise SQLSTATE 40001
--        (serialization_failure). The Hono layer maps 40001 to 409 Conflict
--        so the FE can show "Another logistics user has already issued a PO
--        for these threads. Refresh and try again."
--     4. UPDATE all matching unclaimed threads SET po_id = new_po.id.
--
--   Backward-compat / dormant-safe: the claim is empty-thread-tolerant. If no
--   threads exist for the PO's covered orders (because v3 confirm RPC hasn't
--   been called for them yet), the UPDATE affects 0 rows and the function
--   returns successfully. v2 PO creation continues to work unchanged.
--
-- Strategy:
--   Add a new internal helper `_v3_claim_threads_for_po(p_po_id text)` and
--   CREATE OR REPLACE the existing logistics_create_po + logistics_create_pos_batch
--   to call it. Signatures unchanged -- existing API routes and tests keep
--   passing without modification.
--
-- Idempotency: CREATE OR REPLACE for all three functions. No DROP, no schema-
-- altering statements. Re-runnable.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 1. _v3_claim_threads_for_po — internal helper, the canonical claim block.
-- ----------------------------------------------------------------------------
-- Called immediately after a PO is inserted (single-PO wrapper OR each iter
-- of the batch loop). Does the SELECT FOR UPDATE + claim per spec §6.4.
--
-- Lookup contract:
--   A PO covers orders via purchase_orders.dl (single int) + dl_refs (int[]).
--   Threads attach to orders by orders.id (uuid). Map via:
--     SELECT id FROM orders WHERE dl = po.dl
--     UNION
--     SELECT id FROM orders WHERE dl = ANY(coalesce(po.dl_refs, '{}'))
--   Match threads by (order_id IN above) AND supplier_id = po.supplier_id.
--
-- Race guard (Codex Bug 7):
--   1. SELECT ... FOR UPDATE locks every candidate thread (claimed or not).
--   2. The follow-up count of po_id NOT NULL is computed AFTER the lock holds.
--   3. If a concurrent transaction beat us, we see po_id NOT NULL and raise
--      SQLSTATE 40001 (serialization_failure). Postgres's READ COMMITTED is
--      sufficient under this lock pattern (per spec §6.4).
--
-- Empty-thread safety:
--   The lock + count + UPDATE all operate on the SAME predicate. If no
--   threads exist for these (order, supplier) pairs, all three are no-ops and
--   the function returns {threads_claimed: 0}. This is the v3-dormant case.
--
-- Internal-only: revoked from public/anon/authenticated/service_role. The
-- only callers are logistics_create_po + logistics_create_pos_batch, which
-- already gate on is_logistics() and run as SECURITY DEFINER -- so reaching
-- this helper means the caller has already passed role checks at the outer
-- RPC boundary.
-- ----------------------------------------------------------------------------
create or replace function public._v3_claim_threads_for_po(p_po_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po                purchase_orders;
  v_already_claimed   int;
  v_threads_claimed   int;
begin
  -- 1. Fetch PO row to get dl + dl_refs + supplier_id. The PO MUST exist
  --    because the caller just INSERTed it earlier in this transaction.
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- 2. Lock candidate threads (claimed AND unclaimed). The lock + the
  --    follow-up count form the race-guard atomicity per spec §6.4.
  perform 1 from order_supplier_threads
   where supplier_id = v_po.supplier_id
     and order_id in (
       select id from orders where dl = v_po.dl
        union
       select id from orders where dl = any(coalesce(v_po.dl_refs, array[]::int[]))
     )
   for update;

  -- 3. Count already-claimed candidates AFTER the lock holds. If any are
  --    non-null, a concurrent transaction beat us -- raise 40001 so the
  --    Hono layer can map it to 409 Conflict.
  select count(*) into v_already_claimed
    from order_supplier_threads
   where supplier_id = v_po.supplier_id
     and po_id is not null
     and order_id in (
       select id from orders where dl = v_po.dl
        union
       select id from orders where dl = any(coalesce(v_po.dl_refs, array[]::int[]))
     );

  if v_already_claimed > 0 then
    raise exception 'concurrent_claim: % thread(s) already claimed', v_already_claimed
      using errcode = '40001',
            detail  = 'concurrent_claim',
            hint    = 'Another logistics user has already issued a PO for these threads. Refresh and try again.';
  end if;

  -- 4. Claim every matching unclaimed thread. The UPDATE WHERE po_id IS NULL
  --    is redundant after the count guard above (we just verified all
  --    candidates have po_id NULL) but keeps the operation idempotent under
  --    re-run scenarios (e.g. helper called twice in the same tx for the
  --    same PO -- second call sees its own first-call writes and updates 0
  --    rows). updated_at is bumped by the trigger from 0033.
  update order_supplier_threads
     set po_id = p_po_id
   where supplier_id = v_po.supplier_id
     and po_id is null
     and order_id in (
       select id from orders where dl = v_po.dl
        union
       select id from orders where dl = any(coalesce(v_po.dl_refs, array[]::int[]))
     );
  get diagnostics v_threads_claimed = row_count;

  return jsonb_build_object(
    'po_id',           p_po_id,
    'threads_claimed', v_threads_claimed
  );
end;
$$;

-- Internal-only: revoke from every default grantee. The only callers are the
-- two RPC wrappers below, which already SECURITY DEFINER + role-gated.
revoke all on function public._v3_claim_threads_for_po(text) from public;
revoke all on function public._v3_claim_threads_for_po(text) from anon;
revoke all on function public._v3_claim_threads_for_po(text) from authenticated;
revoke all on function public._v3_claim_threads_for_po(text) from service_role;


-- ----------------------------------------------------------------------------
-- 2. logistics_create_po — UNCHANGED signature; body adds claim after dl set.
-- ----------------------------------------------------------------------------
-- Lifted verbatim from 0025_logistics_create_pos_batch.sql §2 with ONE
-- addition: `perform public._v3_claim_threads_for_po(v_po_id);` after the
-- legacy single-DL UPDATE. Placement matters: the claim helper reads
-- purchase_orders.dl, so it MUST run AFTER the dl write. Helper handles
-- empty-thread case as a no-op (v3-dormant safety).
-- ----------------------------------------------------------------------------
create or replace function public.logistics_create_po(
  p_supplier_id  uuid,
  p_warehouse_id uuid,
  p_lines        jsonb,
  p_dl           int default null,
  p_dl_refs      int[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po_id      text;
  v_line_count int;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  v_po_id := public._logistics_create_po_inner(
    p_supplier_id  := p_supplier_id,
    p_warehouse_id := p_warehouse_id,
    p_lines        := p_lines,
    p_eta_date     := null,
    p_dl_refs      := p_dl_refs,
    p_note         := null
  );

  -- Preserve the legacy single-DL link.
  if p_dl is not null then
    update purchase_orders set dl = p_dl where id = v_po_id;
  end if;

  -- v3-active.1: claim matching threads atomically. Empty-thread case is a
  -- no-op (v3 dormant). 40001 propagates to the API layer as 409 Conflict.
  perform public._v3_claim_threads_for_po(v_po_id);

  select count(*)::int into v_line_count
    from purchase_order_lines where po_id = v_po_id;

  return jsonb_build_object(
    'id',           v_po_id,
    'supplier_id',  p_supplier_id,
    'warehouse_id', p_warehouse_id,
    'dl',           p_dl,
    'dl_refs',      p_dl_refs,
    'line_count',   v_line_count
  );
end;
$$;

revoke all on function public.logistics_create_po(uuid, uuid, jsonb, int, int[]) from public;
grant execute on function public.logistics_create_po(uuid, uuid, jsonb, int, int[]) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. logistics_create_pos_batch — UNCHANGED signature; claim per loop iter.
-- ----------------------------------------------------------------------------
-- Lifted verbatim from 0025_logistics_create_pos_batch.sql §3 with ONE
-- addition: `perform public._v3_claim_threads_for_po(v_po_id);` inside the
-- loop, AFTER each helper call and BEFORE appending to v_po_ids. Atomicity
-- per loop iter:
--   - helper inserts the PO row (with dl_refs but no dl since batch is bundle-
--     only)
--   - claim helper takes FOR UPDATE on candidate threads, raises 40001 on
--     conflict, otherwise UPDATEs po_id
--   - on any failure inside this block, the surrounding plpgsql tx rolls
--     back the entire batch (the existing exception handler re-raises with
--     pos_index annotation so the API can map back to which entry failed)
--
-- The exception handler's `coalesce(nullif(v_err_detail, ''), 'helper_failed')`
-- naturally surfaces the claim helper's `concurrent_claim` detail unchanged,
-- and the SQLSTATE re-raise preserves 40001 so mapPgError sees the right
-- code at the API layer.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_create_pos_batch(p_pos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count       int;
  v_idx         int;
  v_po          jsonb;
  v_po_id       text;
  v_po_ids      jsonb := '[]'::jsonb;
  v_dl_refs     int[];
  v_eta         date;
  v_err_state   text;
  v_err_msg     text;
  v_err_detail  text;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_pos is null or jsonb_typeof(p_pos) <> 'array' then
    raise exception 'p_pos must be a JSON array'
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;

  v_count := jsonb_array_length(p_pos);
  if v_count < 1 or v_count > 20 then
    raise exception 'batch size must be between 1 and 20 (got %)', v_count
      using errcode = '22023', detail = 'invalid_batch_size';
  end if;

  v_idx := 0;
  for v_po in select * from jsonb_array_elements(p_pos)
  loop
    -- Decode optional fields with defensive casts. JSON null vs missing key
    -- both produce SQL null on ->> extraction.
    if v_po->>'eta_date' is not null and v_po->>'eta_date' <> '' then
      v_eta := (v_po->>'eta_date')::date;
    else
      v_eta := null;
    end if;

    if v_po ? 'dl_refs' and jsonb_typeof(v_po->'dl_refs') = 'array' then
      select coalesce(array_agg((elem)::int), array[]::int[])
        into v_dl_refs
        from jsonb_array_elements_text(v_po->'dl_refs') as elem;
      if array_length(v_dl_refs, 1) is null then
        v_dl_refs := null;
      end if;
    else
      v_dl_refs := null;
    end if;

    begin
      v_po_id := public._logistics_create_po_inner(
        p_supplier_id  := nullif(v_po->>'supplier_id', '')::uuid,
        p_warehouse_id := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines        := v_po->'lines',
        p_eta_date     := v_eta,
        p_dl_refs      := v_dl_refs,
        p_note         := v_po->>'note'
      );

      -- v3-active.1: claim matching threads atomically per PO. Helper raises
      -- 40001 on concurrent_claim or 42P01 if (impossibly) the PO row is
      -- missing post-insert. Both propagate through the catch below with
      -- pos_index annotation in HINT.
      perform public._v3_claim_threads_for_po(v_po_id);
    exception
      when others then
        -- Re-raise with the index annotated in HINT so the API route knows
        -- which p_pos entry failed. Preserves SQLSTATE + DETAIL for the
        -- existing mapPgError contract (incl. the new 40001 path).
        get stacked diagnostics
          v_err_state  = returned_sqlstate,
          v_err_msg    = message_text,
          v_err_detail = pg_exception_detail;
        raise exception using
          errcode = v_err_state,
          message = v_err_msg,
          detail  = coalesce(nullif(v_err_detail, ''), 'helper_failed'),
          hint    = format('pos_index=%s', v_idx);
    end;

    v_po_ids := v_po_ids || to_jsonb(v_po_id);
    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object('po_ids', v_po_ids);
end;
$$;

revoke all on function public.logistics_create_pos_batch(jsonb) from public;
grant execute on function public.logistics_create_pos_batch(jsonb) to authenticated;


-- =============================================================================
-- End of 0037_logistics_create_po_thread_claim.sql
-- =============================================================================
-- Self-review checklist (matches v3-active.1 spec):
--   [x] Migration file numbered 0037 (next slot after 0036_orders_rollup_stage)
--   [x] Header banner explains sprint + spec refs (§6.4)
--   [x] _v3_claim_threads_for_po: SECURITY DEFINER, search_path locked
--   [x] _v3_claim_threads_for_po: REVOKE from public/anon/authenticated/service_role
--       (truly internal -- only the two RPC wrappers below call it)
--   [x] logistics_create_po: signature unchanged, body adds claim after dl set
--   [x] logistics_create_pos_batch: signature unchanged, claim inside loop
--       AFTER helper call, BEFORE v_po_ids append, INSIDE existing exception
--       handler so 40001 gets the pos_index annotation
--   [x] FOR UPDATE lock on candidate threads (race guard per spec §6.4)
--   [x] 40001 SQLSTATE raised when concurrent_claim detected
--   [x] Empty-thread case is a no-op (v3-dormant safety)
--   [x] Idempotent: CREATE OR REPLACE FUNCTION; no DROP / TRUNCATE / DELETE
--
-- Closes carry-forward: phase-4-v3-batch-rpc-thread-claim
-- Pairs with: phase-4-v3-confirm-rpc-swap (v3-active.2 -- next task)
-- =============================================================================
