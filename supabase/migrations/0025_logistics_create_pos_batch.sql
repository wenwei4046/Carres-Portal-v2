-- =============================================================================
-- 0025_logistics_create_pos_batch.sql — Phase 4 C5.2
-- =============================================================================
-- Source spec: Loo's C5.2 brief (2026-05-04) — per-PO warehouse picker +
-- batch create-PO RPC.
-- Depends on: 0019_logistics_rpcs.sql (existing logistics_create_po body
-- whose validation + INSERT block is lifted into the new internal helper).
--
-- Why:
--   The CreatePOModal (NewPODialog) currently has a single warehouse picker
--   at the modal bottom. When SKUs span multiple suppliers the modal calls
--   logistics_create_po N times sequentially, all sharing one warehouse.
--   That collapses two distinct decisions ("which warehouse for THIS supplier
--   group") into one global pick, which is wrong: a sofa supplier may ship
--   to Klang while a mattress supplier ships to PJ. Loo confirmed Q4=A
--   (per-PO warehouse, blank required) + Q5=B (new batch RPC alongside the
--   single-PO RPC, with a shared internal helper).
--
-- Summary of changes (3):
--   1. _logistics_create_po_inner(p_supplier_id, p_warehouse_id, p_lines,
--                                 p_eta_date, p_dl_refs, p_note)
--      → new internal helper. Holds the canonical validation + INSERT block.
--      Lifted verbatim from logistics_create_po body. SECURITY DEFINER,
--      revoked from PUBLIC, no grant to authenticated. Internal use only.
--      Note: purchase_orders has no `note` column so p_note is recorded in
--      audit_log only; eta_date IS persisted into purchase_orders.eta_date.
--      p_dl is intentionally absent — single-PO callers route through the
--      thin wrapper (#2) which preserves p_dl. Batch callers are bundle-only.
--   2. logistics_create_po(uuid, uuid, jsonb, int, int[])
--      → SAME signature; body is now a thin wrapper that delegates to the
--      helper and returns the same jsonb shape. Existing callers (POST
--      /api/logistics/pos route + tests) MUST NOT regress.
--   3. logistics_create_pos_batch(p_pos jsonb)
--      → new public RPC. p_pos is a JSONB array of objects of shape
--      {supplier_id, warehouse_id, lines, eta_date?, dl_refs?, note?}.
--      Iterates and calls the helper for each. Atomic: a single PG function
--      runs in one tx; any failure rolls back the whole batch. Length must
--      be 1..20 (sanity cap, surfaced as 22023 invalid_batch_size). Returns
--      jsonb_build_object('po_ids', jsonb_array_of_uuids).
--
-- Idempotency: every function uses CREATE OR REPLACE; no DROP or schema-
-- altering statements. Migration is safe to re-run.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 1. _logistics_create_po_inner — internal helper, the canonical INSERT block.
-- ----------------------------------------------------------------------------
-- Mirrors 0019's logistics_create_po body verbatim, with two small extensions:
--   • accepts p_eta_date date  → persisted into purchase_orders.eta_date
--   • accepts p_note text      → recorded in audit_log (no PO column for it)
-- and one shape change:
--   • drops p_dl int (single-PO callers pass p_dl through the wrapper RPC;
--     batch RPC is intended for bundles only and uses p_dl_refs).
--
-- Returns the new PO id (text, e.g. 'PO-2031').
-- Uses 'PO-NNNN' sequence allocation matching 0019's scheme (next id = max
-- existing seq + 1, fall back to 2030 baseline). Concurrent batch calls are
-- safe: every call inside one tx sees its own prior INSERTs, and the
-- coalesce(max(...), 2030) ladder advances per call within the loop.
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
-- Supabase grants EXECUTE on every public function to anon + authenticated +
-- service_role by default. Revoke from each so the helper is truly internal —
-- only callable by SECURITY DEFINER chain (logistics_create_po and
-- logistics_create_pos_batch are the only callers).
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from anon;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from authenticated;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from service_role;


-- ----------------------------------------------------------------------------
-- 2. logistics_create_po — UNCHANGED signature, thin wrapper over the helper.
-- ----------------------------------------------------------------------------
-- Existing callers (apps/api/src/routes/logistics/pos.ts POST /, plus tests in
-- pos.test.ts) call this with (supplier_id, warehouse_id, lines, dl, dl_refs).
-- We must preserve that exact signature + return shape.
--
-- p_dl handling: dl was always written into purchase_orders.dl. The helper
-- doesn't accept p_dl, so we set it on the row AFTER the helper INSERT via
-- a follow-up UPDATE. This keeps the helper bundle-shaped (dl_refs only) and
-- the wrapper preserves the single-DL path.
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
-- 3. logistics_create_pos_batch — new public RPC for per-PO warehouse pick.
-- ----------------------------------------------------------------------------
-- Body iterates p_pos and delegates each to _logistics_create_po_inner.
-- Atomic: any helper exception inside the loop unwinds the entire batch
-- (default plpgsql function-as-tx semantics). Returns the array of new PO ids
-- so the frontend can show "Issued N POs" toast and link them.
--
-- p_pos object shape:
--   {
--     "supplier_id":  uuid (required),
--     "warehouse_id": uuid (required),
--     "lines":        [{sku, qty}, ...] (required, non-empty),
--     "eta_date":     date (optional, ISO string),
--     "dl_refs":      [int, ...] (optional),
--     "note":         text (optional)
--   }
--
-- Errors:
--   • SQLSTATE 22023, detail='invalid_batch_size'
--       p_pos is null / not an array / empty / over 20 entries.
--   • Helper-raised errors propagate verbatim. The HINT carries the offending
--     p_pos index (0-based) so the API route can map back to which PO failed.
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
    exception
      when others then
        -- Re-raise with the index annotated in HINT so the API route knows
        -- which p_pos entry failed. Preserves SQLSTATE + DETAIL for the
        -- existing mapPgError contract.
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
