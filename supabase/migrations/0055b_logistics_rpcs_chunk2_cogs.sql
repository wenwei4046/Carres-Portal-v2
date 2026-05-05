-- =============================================================================
-- 0055b_logistics_rpcs_chunk2_cogs.sql -- Phase 4.5 Chunk 2 Sprint E Task 26
-- =============================================================================
-- Source spec:  docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md
--               §6 M4.6 / CQ3 (NULL legacy, non-NULL new)
-- Source plan:  docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2.md
--               §Sprint E Task 26 (line 278-279)
-- Resume plan:  docs/superpowers/plans/2026-05-06-phase-4.5-chunk-2-resume.md
--               §Sprint E (line 275)
--
-- Predecessor: 0055_purchase_order_lines_cogs.sql (T24) — added the
--   cost_source_enum type + 2 NULLABLE columns (cost, cost_source) on
--   purchase_order_lines. Predecessor (T25) extended the shared
--   `createPoInput.lines[]` zod schema with cost + costSource on every line.
--
-- What this migration does:
--   Extends the PO-create RPC chain to validate + persist cost + cost_source
--   on every newly-inserted purchase_order_lines row. CREATE OR REPLACE on:
--     1. _logistics_create_po_inner — the helper that owns the per-line loop
--        and INSERT (lifted from 0038:84-175). Validation + persistence land
--        here.
--     2. logistics_create_po — public RPC. Body lifted from 0038:188-239.
--        Pass-through to the helper; recreated verbatim so the file's
--        narrative explicitly covers the public RPC name in the task title.
--     3. logistics_create_pos_batch — public RPC. Body lifted from 0038:252-342.
--        Pass-through to the helper inside its per-PO loop; recreated
--        verbatim for the same auditability reason.
--
-- Validation rule (per Sprint E Task 26 + spec §6.1):
--   When iterating p_lines, if either `cost` or `cost_source` is NULL on a
--   line element, RAISE EXCEPTION USING ERRCODE = '22023', DETAIL =
--   'cost_required'. The 22023 SQLSTATE is "invalid_parameter_value" —
--   matches the conventions used by sibling validators (`warehouse_required`,
--   `lines_empty`, etc. — see 0038:111-128 for prior art).
--
-- Persistence:
--   The per-line INSERT now includes `cost` + `cost_source` extracted from
--   each JSONB line element. Casts:
--     v_cost        := (v_line->>'cost')::numeric(14,2)
--     v_cost_source := (v_line->>'cost_source')::cost_source_enum
--   `->>` returns NULL when the key is missing OR the JSON value is null,
--   which is exactly what the validation guard upstream needs to detect.
--
-- Wire contract note (out of scope for this migration — handled by T29):
--   The api boundary (apps/api/src/routes/logistics/pos.ts POST / and
--   POST /batch) currently passes parsed.data.lines through verbatim. After
--   T25 each line carries camelCase `costSource` from the zod schema, but
--   this RPC reads snake_case `cost_source` from the JSONB. T29 will reshape
--   lines at the api edge so the JSONB the RPC sees uses `cost_source`,
--   matching every other field in this RPC. Until T29 lands, the validation
--   guard below will fire (which is the correct fail-shut behavior — and
--   exactly what the new T26 unit/integration tests assert).
--
-- Legacy rows (CQ3): untouched. 0019/0025-era PO lines remain NULL on both
-- columns. No backfill — we are honest about "no historical cost recorded"
-- (per design spec §6 + §0 Q&A row CQ3). Phase 5 (Finance) sees NULL as the
-- explicit signal.
--
-- All function signatures + LANGUAGE + SECURITY DEFINER + search_path +
-- REVOKE/GRANT shape are PRESERVED VERBATIM from 0038 — callers (Hono, tests,
-- other RPCs) do NOT need to change call shapes. CLAUDE.md §14 #6 (no edits
-- to committed migration history): satisfied — 0019, 0025, 0037, 0038 left
-- untouched, all changes land here in 0055b.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 1. _logistics_create_po_inner — internal helper. Lifted from 0038:84-175.
--    Diff vs 0038 source body:
--      (a) DECLARE block adds v_cost + v_cost_source locals.
--      (b) Per-line loop extracts both new fields after sku/qty.
--      (c) New validation guard: cost OR cost_source NULL -> 22023
--          DETAIL='cost_required'.
--      (d) INSERT now writes cost + cost_source columns.
--    Everything else (signature, role check absent, validation chain,
--    audit_log write, return shape) is byte-identical to 0038:84-175.
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
  v_actor        text;
  v_max_seq      int;
  v_po_id        text;
  v_line_count   int;
  v_line         jsonb;
  v_sku          text;
  v_qty          int;
  v_cost         numeric(14,2);
  v_cost_source  cost_source_enum;
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

    -- Phase 4.5 Chunk 2 Sprint E (T26 / 0055b): COGS validation + persistence.
    -- Both fields required on every new PO line. NULL on either is a 22023
    -- 'cost_required' rejection — caught at the api edge as 422 with
    -- detail='cost_required'. Legacy rows pre-0055 are NULL by design (CQ3)
    -- but cannot reach this loop (this code path is only INSERT, never UPDATE).
    v_cost        := (v_line->>'cost')::numeric(14,2);
    v_cost_source := (v_line->>'cost_source')::cost_source_enum;

    if v_cost is null or v_cost_source is null then
      raise exception 'cost and cost_source required for new PO line (sku=%)', v_sku
        using errcode = '22023', detail = 'cost_required';
    end if;

    insert into purchase_order_lines (po_id, sku, qty, received_qty, cost, cost_source)
    values (v_po_id, v_sku, v_qty, 0, v_cost, v_cost_source);

    v_line_count := v_line_count + 1;
  end loop;

  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Created PO %s · %s lines%s',
                 v_po_id, v_line_count,
                 case when p_note is not null and btrim(p_note) <> ''
                      then ' · ' || btrim(p_note)
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
-- 2. logistics_create_po — UNCHANGED signature + body. Lifted verbatim from
--    0038:188-239. Recreated here so the file's narrative explicitly covers
--    the public RPC named in the task headline (the helper above carries the
--    actual COGS validation + persistence change).
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
-- 3. logistics_create_pos_batch — UNCHANGED signature + body. Lifted verbatim
--    from 0038:252-345. Recreated here for the same auditability reason as
--    logistics_create_po above. The 0037 thread-claim extension inside the
--    loop + the existing exception handler annotating pos_index in HINT MUST
--    be preserved (and are, byte-for-byte).
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
