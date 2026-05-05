-- =============================================================================
-- 0038_logistics_v2_rpc_v3_vocab_sweep.sql -- Phase 4.5a T2
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-05-phase-4.5a-v3-wake-design.md
--              §4.1 (migration plan), §4.2 (callsite swaps note), §4.5 (enum
--              cleanup is T6 not T2).
-- Sprint:      Phase 4.5a Task 2 — v2 RPC vocabulary sweep
-- Depends on:
--   0019 logistics_rpcs (original logistics_create_po + logistics_issue_pos_for_order)
--   0020 logistics_cancel_po (original cancel RPC)
--   0024 logistics_pipeline_v2_rpcs (Pipeline v2 confirm + reserve helpers — NOT
--        in this migration's scope; left intact)
--   0025 logistics_create_pos_batch (the _logistics_create_po_inner helper +
--        thin wrapper pattern lifted into 0037)
--   0028 logistics_stage_v3 (adds 'awaiting_logistics_action' enum value
--        BEFORE 'awaiting_stock'; both values still legal post-this-migration)
--   0037 logistics_create_po_thread_claim (extends create_po + create_pos_batch
--        with _v3_claim_threads_for_po — MUST be preserved verbatim here)
--
-- Why this migration:
--   v3 ships dormant after `phase-4-v3-complete` (commit 2e6fdae) and 0037
--   wired the thread-claim race guard. The next step in the v3 wake plan is
--   to retire the old `awaiting_stock` vocabulary from every RPC body so the
--   FE/API stage strings can be renamed in T5 and the enum value itself can
--   be dropped in T6 (migration 0040).
--
--   This migration CREATE OR REPLACEs five v2-era RPCs to swap every
--   `'awaiting_stock'` literal write/guard for `'awaiting_logistics_action'`:
--     1. _logistics_create_po_inner   (helper, no stage literals — recreate
--                                      verbatim from 0025 to lock the file's
--                                      idempotent re-run guarantee)
--     2. logistics_create_po          (no stage literals; preserve the 0037
--                                      thread-claim extension verbatim)
--     3. logistics_create_pos_batch   (no stage literals; preserve the 0037
--                                      thread-claim extension verbatim)
--     4. logistics_issue_pos_for_order (the only RPC of the five with an
--                                       actual `'awaiting_stock'` literal in
--                                       its body — the stage guard at line
--                                       522-526 of 0019. Swap to
--                                       `'awaiting_logistics_action'`. Also
--                                       update the matching error message
--                                       text so the API can tell the FE the
--                                       v3-vocab stage name.)
--     5. logistics_cancel_po          (no stage literals — recreate verbatim
--                                      from 0020 to keep all five v2 RPCs in
--                                      one auditable place at file 0038.)
--
--   Net behaviour change:
--     • logistics_issue_pos_for_order now requires v_order.logistics_stage =
--       'awaiting_logistics_action' (was 'awaiting_stock'). Backed by the
--       0028 data migration which rebranded every existing awaiting_stock row
--       to awaiting_logistics_action; the row-count audit in
--       docs/superpowers/plans/2026-05-05-phase-4.5a-preflight-notes.md
--       confirms zero awaiting_stock rows on staging.
--     • All other RPC bodies are byte-for-byte equivalent to their pre-T2
--       state (0025 for the helper + create wrappers; 0037 for the
--       thread-claim extensions; 0020 for cancel).
--
-- Idempotency:
--   • Every function uses CREATE OR REPLACE; no DROP / TRUNCATE / DELETE.
--   • Re-runnable safely. Subsequent migrations (0039, 0040) will further
--     evolve these signatures; this migration is the seam where v2 vocab is
--     retired but signatures are unchanged.
--
-- Postgres caveats:
--   • CREATE OR REPLACE FUNCTION cannot change the function's return type or
--     argument list. We preserve every signature exactly. Tests in
--     pos.test.ts + orders.test.ts assert RPC call shape (assertRpcCallShape)
--     and would fail loudly if any param renamed or dropped.
--   • The `'awaiting_logistics_action'::logistics_stage` literal is legal on
--     pre-0040 enums because 0028 added that value. Post-0040 the enum is
--     recreated without `awaiting_stock`, so any future migration that wants
--     to revert this one (theoretically) would also need to recreate the
--     enum first — but the design is that 0040 is the high-water mark and we
--     never revert past 0040.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 1. _logistics_create_po_inner — internal helper. Body verbatim from 0025
--    §1 (no stage literals to sweep). Recreated here so the "five v2 RPCs"
--    sit in one auditable migration file going forward.
-- ----------------------------------------------------------------------------
create or replace function public._logistics_create_po_inner(
  p_supplier_id  uuid,
  p_warehouse_id uuid,
  p_lines        jsonb,
  p_eta_date     date,
  p_dl_refs      int[],
  p_note         text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       text;
  v_max_seq     int;
  v_po_id       text;
  v_line_count  int;
  v_line        jsonb;
  v_sku         text;
  v_qty         int;
begin
  -- Helper does NOT re-check is_logistics() — every public RPC that delegates
  -- here gates that itself before the call. Keeping the role check at the
  -- outer RPC means all auth failures land at one boundary.

  if p_warehouse_id is null then
    raise exception 'warehouse is required'
      using errcode = '22023', detail = 'warehouse_required';
  end if;

  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'supplier not found'
      using errcode = 'P0001', detail = 'supplier_not_found';
  end if;

  if not exists (select 1 from warehouses where id = p_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = 'P0001', detail = 'warehouse_not_found';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'lines must be a non-empty array'
      using errcode = 'P0001', detail = 'lines_empty';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  select coalesce(max((substring(id from 'PO-(\d+)$'))::int), 2030)
    into v_max_seq
    from purchase_orders
   where id ~ '^PO-\d+$';

  v_max_seq := v_max_seq + 1;
  v_po_id := 'PO-' || v_max_seq::text;

  insert into purchase_orders
    (id, dl_refs, supplier_id, warehouse_id, eta_date, status, sup_status, placed_at)
  values
    (v_po_id, p_dl_refs, p_supplier_id, p_warehouse_id, p_eta_date,
     'open', 'pending', now());

  v_line_count := 0;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'qty')::int;

    if v_sku is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid line: sku=%, qty=%', v_sku, v_qty
        using errcode = 'P0001', detail = 'invalid_qty';
    end if;

    insert into purchase_order_lines (po_id, sku, qty, received_qty)
    values (v_po_id, v_sku, v_qty, 0);

    v_line_count := v_line_count + 1;
  end loop;

  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Created PO %s -- %s lines%s',
                 v_po_id, v_line_count,
                 case when p_note is not null and btrim(p_note) <> ''
                      then ' -- ' || btrim(p_note)
                      else '' end),
          v_po_id);

  return v_po_id;
end;
$$;

revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from public;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from anon;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from authenticated;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from service_role;


-- ----------------------------------------------------------------------------
-- 2. logistics_create_po — UNCHANGED signature. Body lifted verbatim from
--    0037 §2 (which itself lifted from 0025 §2). No stage literals to sweep.
--    The 0037 thread-claim extension MUST be preserved.
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

  -- v3-active.1 (migration 0037): claim matching threads atomically. Empty-
  -- thread case is a no-op (v3 dormant). 40001 propagates to the API layer
  -- as 409 Conflict. MUST be preserved verbatim across 0038 vocab sweep.
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
-- 3. logistics_create_pos_batch — UNCHANGED signature. Body lifted verbatim
--    from 0037 §3 (which itself lifted from 0025 §3). No stage literals to
--    sweep. The 0037 thread-claim extension inside the loop MUST be
--    preserved, including the existing exception handler that annotates
--    pos_index in HINT.
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

      -- v3-active.1 (migration 0037): claim matching threads atomically per
      -- PO. Helper raises 40001 on concurrent_claim or 42P01 if the PO row
      -- is missing post-insert. Both propagate through the catch below with
      -- pos_index annotation in HINT. MUST be preserved verbatim across
      -- 0038 vocab sweep.
      perform public._v3_claim_threads_for_po(v_po_id);
    exception
      when others then
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


-- ----------------------------------------------------------------------------
-- 4. logistics_issue_pos_for_order — VOCABULARY SWEEP. Body lifted from 0019
--    §logistics_issue_pos_for_order with one literal swap:
--      • Stage guard at the top:
--          v_order.logistics_stage <> 'awaiting_stock'
--        becomes
--          v_order.logistics_stage <> 'awaiting_logistics_action'
--      • Matching error message text:
--          'order is not in awaiting_stock state'
--        becomes
--          'order is not in awaiting_logistics_action state'
--    Everything else (sofa-split + multi-line combine, supplier loop, sequence
--    allocation, audit_log writes, soft idempotency P0001 already_issued) is
--    byte-for-byte from 0019.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_issue_pos_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order        orders;
  v_actor        text;
  v_pos_created  jsonb := '[]'::jsonb;
  v_supplier     suppliers;
  v_po_id        text;
  v_max_seq      int;
  v_short        record;
  v_unit         int;
  v_combined_lines jsonb;
  v_combined_count int;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- VOCAB SWEEP (T2): stage guard now reads 'awaiting_logistics_action'
  -- instead of 'awaiting_stock'. The error message mirrors the new vocab so
  -- the API layer + FE see consistent strings end-to-end.
  if v_order.status <> 'proceed_order'
     or v_order.logistics_stage <> 'awaiting_logistics_action' then
    raise exception 'order is not in awaiting_logistics_action state'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  -- Soft idempotency guard (CQ2): if any open POs already linked to this dl,
  -- the user has already auto-issued. Bail with already_issued.
  if exists (
    select 1 from purchase_orders
     where (dl = v_order.dl or v_order.dl = ANY(coalesce(dl_refs, array[]::int[])))
       and status = 'open'
  ) then
    raise exception 'POs already issued for this order'
      using errcode = 'P0001', detail = 'already_issued';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- Find the next PO numeric sequence for the PO-NNNN id format.
  select coalesce(max((substring(id from 'PO-(\d+)$'))::int), 2030)
    into v_max_seq
    from purchase_orders
   where id ~ '^PO-\d+$';

  -- Loop suppliers that cover at least one shortage category for this order.
  for v_supplier in
    select distinct s.*
      from suppliers s
     where exists (
       select 1
         from public.logistics_calc_shortages(p_order_id, v_order.warehouse_id) sh
        where split_part(sh.sku, ':', 1) = ANY(s.cat_covered)
     )
  loop
    -- Sofa lines in this supplier's group -> split into 1 PO per qty=1.
    for v_short in
      select sh.sku, sh.short
        from public.logistics_calc_shortages(p_order_id, v_order.warehouse_id) sh
       where split_part(sh.sku, ':', 1) = 'sofa'
         and 'sofa' = ANY(v_supplier.cat_covered)
    loop
      for v_unit in 1..v_short.short
      loop
        v_max_seq := v_max_seq + 1;
        v_po_id := 'PO-' || v_max_seq::text;

        insert into purchase_orders
          (id, dl, supplier_id, warehouse_id, status, sup_status, placed_at)
        values
          (v_po_id, v_order.dl, v_supplier.id, v_order.warehouse_id,
           'open', 'pending', now());

        insert into purchase_order_lines (po_id, sku, qty, received_qty)
        values (v_po_id, v_short.sku, 1, 0);

        insert into audit_log (role, actor_text, action, dealer_id, ref)
        values ('logistics', v_actor,
                format('Issued PO %s -- sofa split (qty=1)', v_po_id),
                v_order.dealer_id, v_po_id);

        v_pos_created := v_pos_created || jsonb_build_object(
          'id', v_po_id,
          'supplier_id', v_supplier.id,
          'line_count', 1
        );
      end loop;
    end loop;

    -- Mattress + bedframe lines in this supplier's group -> 1 multi-line PO.
    select coalesce(jsonb_agg(jsonb_build_object('sku', sh.sku, 'qty', sh.short)), '[]'::jsonb),
           count(*)
      into v_combined_lines, v_combined_count
      from public.logistics_calc_shortages(p_order_id, v_order.warehouse_id) sh
     where split_part(sh.sku, ':', 1) <> 'sofa'
       and split_part(sh.sku, ':', 1) = ANY(v_supplier.cat_covered);

    if v_combined_count > 0 then
      v_max_seq := v_max_seq + 1;
      v_po_id := 'PO-' || v_max_seq::text;

      insert into purchase_orders
        (id, dl, supplier_id, warehouse_id, status, sup_status, placed_at)
      values
        (v_po_id, v_order.dl, v_supplier.id, v_order.warehouse_id,
         'open', 'pending', now());

      insert into purchase_order_lines (po_id, sku, qty, received_qty)
      select v_po_id, (line->>'sku')::text, (line->>'qty')::int, 0
        from jsonb_array_elements(v_combined_lines) as line;

      insert into audit_log (role, actor_text, action, dealer_id, ref)
      values ('logistics', v_actor,
              format('Issued PO %s -- combined (%s lines)', v_po_id, v_combined_count),
              v_order.dealer_id, v_po_id);

      v_pos_created := v_pos_created || jsonb_build_object(
        'id', v_po_id,
        'supplier_id', v_supplier.id,
        'line_count', v_combined_count
      );
    end if;
  end loop;

  return jsonb_build_object('pos_created', v_pos_created);
end;
$$;

revoke all on function public.logistics_issue_pos_for_order(uuid) from public;
grant execute on function public.logistics_issue_pos_for_order(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. logistics_cancel_po — UNCHANGED signature. Body verbatim from 0020. No
--    stage literals to sweep. Recreated here so all five v2 RPCs sit in one
--    auditable migration file going forward.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_cancel_po(
  p_po_id text,
  p_reason text
)
returns purchase_orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po        purchase_orders;
  v_dealer_id uuid;
  v_actor     text;
begin
  -- 1. Role guard
  if not public.is_logistics() then
    raise exception 'forbidden: logistics role required'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 2. Reason required (mirrors abandon_order pattern in 0019 line 1351-1354)
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  -- 3. Fetch PO
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  -- 4. State machine: only open POs can be cancelled (spec 7 line 258)
  if v_po.status <> 'open' then
    raise exception 'PO is not open (current status: %)', v_po.status
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- 5. Derive dealer_id for audit_log (matches 0019 receive-line pattern at
  --    line 811: pull from orders by dl, LIMIT 1; null when PO is stock-only
  --    with no dl).
  if v_po.dl is not null then
    select dealer_id into v_dealer_id
      from orders where dl = v_po.dl
      limit 1;
  end if;

  -- 6. Resolve actor name for audit_log (mirrors 0019 line 539 / 710 / etc.)
  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- 7. Cancel
  update purchase_orders
    set status = 'cancelled',
        updated_at = now()
    where id = p_po_id
    returning * into v_po;

  -- 8. Audit (column shape matches 0019 logistics RPC inserts:
  --    role, actor_text, action, dealer_id, ref)
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values (
    'logistics',
    v_actor,
    format('Cancelled PO %s -- %s', p_po_id, p_reason),
    v_dealer_id,
    p_po_id
  );

  return v_po;
end;
$$;

revoke all on function public.logistics_cancel_po(text, text) from public;
grant execute on function public.logistics_cancel_po(text, text) to authenticated;


-- =============================================================================
-- End of 0038_logistics_v2_rpc_v3_vocab_sweep.sql
-- =============================================================================
-- Self-review checklist (Phase 4.5a T2):
--   [x] Migration file numbered 0038 (next slot after 0037_logistics_create_po_thread_claim)
--   [x] Header banner explains sprint + spec refs (4.1, 4.2, 4.5)
--   [x] All 5 RPCs CREATE OR REPLACE in single migration file
--   [x] _logistics_create_po_inner: signature unchanged, body verbatim from 0025
--   [x] logistics_create_po: signature unchanged, body verbatim from 0037 (preserves
--       _v3_claim_threads_for_po PERFORM)
--   [x] logistics_create_pos_batch: signature unchanged, body verbatim from 0037
--       (preserves _v3_claim_threads_for_po PERFORM inside loop + exception handler)
--   [x] logistics_issue_pos_for_order: stage guard literal swept
--       'awaiting_stock' -> 'awaiting_logistics_action' AND matching error
--       message text. Everything else verbatim from 0019.
--   [x] logistics_cancel_po: signature unchanged, body verbatim from 0020
--   [x] No stage literal 'awaiting_stock' remains anywhere in the function
--       bodies (verified by grep on the migration file -- only header + comment
--       banners reference the old vocab to explain the sweep)
--   [x] Idempotent: CREATE OR REPLACE FUNCTION; no DROP / TRUNCATE / DELETE
--   [x] Re-runnable: subsequent migrations (0039, 0040) further evolve these
--       signatures; 0038 is the seam where v2 vocab is retired but signatures
--       stay unchanged.
--
-- Closes carry-forward: phase-4-v3-vocab-sweep (de-facto opened by 0028 alias)
-- Pairs with: 0039 (v3 confirm auto-skip-from-stock) and 0040 (enum cleanup)
-- =============================================================================
