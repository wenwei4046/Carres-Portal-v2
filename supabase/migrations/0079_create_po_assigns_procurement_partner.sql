-- =============================================================================
-- 0079_create_po_assigns_procurement_partner.sql (Loo 2026-05-10)
-- =============================================================================
-- Workflow shift: assign the procurement-leg LP at PO-creation time, not
-- after the supplier presses "Mark Ready". Loo's instinct on 2026-05-10 —
-- partner should already see the upcoming pickup the moment logistics issues
-- the PO so they can plan capacity, instead of needing logistics to assign
-- them after the fact.
--
-- Schema column `purchase_orders.procurement_partner_id` already exists
-- (renamed from delivery_partner_id by migration 0052 per project memory).
-- This migration extends the create-PO RPC chain to populate it on INSERT.
--
-- Signature additions (default null preserves backward compat for any
-- legacy caller, though all in-tree callers now pass the new param):
--   _logistics_create_po_inner   gets `p_procurement_partner_id uuid`
--   logistics_create_po          gets `p_procurement_partner_id uuid`
--   logistics_create_pos_batch   reads `procurement_partner_id` from each
--                                jsonb PO entry, forwards to inner
--
-- Existing function signatures must be DROPped first — postgres treats
-- each (name, arg-type-list) tuple as a distinct function and CREATE OR
-- REPLACE refuses signature changes. CASCADE drops the helper's wrappers,
-- which we recreate immediately below in the same migration.
--
-- CLAUDE.md §14 #6 satisfied — 0073/0055b stay byte-identical; 0079 is the
-- only new migration. Loo authorized in conversation 2026-05-10.
-- =============================================================================


drop function if exists public.logistics_create_pos_batch(jsonb);
drop function if exists public.logistics_create_po(uuid, uuid, jsonb, int, int[]);
drop function if exists public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text);


-- ----------------------------------------------------------------------------
-- 1. _logistics_create_po_inner — extends 0073's body. Diff:
--    (a) +param `p_procurement_partner_id uuid default null`.
--    (b) INSERT on purchase_orders now sets procurement_partner_id.
--    Everything else (validation, attrs, COGS, audit_log) byte-identical.
-- ----------------------------------------------------------------------------
create or replace function public._logistics_create_po_inner(
  p_supplier_id            uuid,
  p_warehouse_id           uuid,
  p_lines                  jsonb,
  p_eta_date               date,
  p_dl_refs                int[],
  p_note                   text,
  p_procurement_partner_id uuid default null
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
  v_attrs        jsonb;
begin
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

  -- 0079 — when caller provided a partner id, validate it exists. Caller may
  -- still pass null (own_logistics suppliers don't need a procurement LP).
  if p_procurement_partner_id is not null
     and not exists (select 1 from delivery_partners where id = p_procurement_partner_id) then
    raise exception 'procurement partner not found'
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  select coalesce(max((substring(id from 'PO-(\d+)$'))::int), 2030)
    into v_max_seq
    from purchase_orders
   where id ~ '^PO-\d+$';

  v_max_seq := v_max_seq + 1;
  v_po_id := 'PO-' || v_max_seq::text;

  insert into purchase_orders
    (id, dl_refs, supplier_id, warehouse_id, eta_date, status, sup_status, placed_at,
     procurement_partner_id)
  values
    (v_po_id, p_dl_refs, p_supplier_id, p_warehouse_id, p_eta_date,
     'open', 'pending', now(),
     p_procurement_partner_id);

  v_line_count := 0;
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_sku := v_line->>'sku';
    v_qty := (v_line->>'qty')::int;

    if v_sku is null or v_qty is null or v_qty <= 0 then
      raise exception 'invalid line: sku=%, qty=%', v_sku, v_qty
        using errcode = 'P0001', detail = 'invalid_qty';
    end if;

    v_cost        := (v_line->>'cost')::numeric(14,2);
    v_cost_source := (v_line->>'cost_source')::cost_source_enum;

    if v_cost is null or v_cost_source is null then
      raise exception 'cost and cost_source required for new PO line (sku=%)', v_sku
        using errcode = '22023', detail = 'cost_required';
    end if;

    v_attrs := v_line->'attrs';

    insert into purchase_order_lines (po_id, sku, qty, received_qty, cost, cost_source, attrs)
    values (v_po_id, v_sku, v_qty, 0, v_cost, v_cost_source, v_attrs);

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

revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text, uuid) from public;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text, uuid) from anon;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text, uuid) from authenticated;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text, uuid) from service_role;


-- ----------------------------------------------------------------------------
-- 2. logistics_create_po — extends 0055b's wrapper to accept + forward
--    p_procurement_partner_id into the helper.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_create_po(
  p_supplier_id            uuid,
  p_warehouse_id           uuid,
  p_lines                  jsonb,
  p_dl                     int default null,
  p_dl_refs                int[] default null,
  p_procurement_partner_id uuid default null
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
    p_supplier_id            := p_supplier_id,
    p_warehouse_id           := p_warehouse_id,
    p_lines                  := p_lines,
    p_eta_date               := null,
    p_dl_refs                := p_dl_refs,
    p_note                   := null,
    p_procurement_partner_id := p_procurement_partner_id
  );

  if p_dl is not null then
    update purchase_orders set dl = p_dl where id = v_po_id;
  end if;

  perform public._v3_claim_threads_for_po(v_po_id);

  select count(*)::int into v_line_count
    from purchase_order_lines where po_id = v_po_id;

  return jsonb_build_object(
    'id',                     v_po_id,
    'supplier_id',            p_supplier_id,
    'warehouse_id',           p_warehouse_id,
    'dl',                     p_dl,
    'dl_refs',                p_dl_refs,
    'procurement_partner_id', p_procurement_partner_id,
    'line_count',             v_line_count
  );
end;
$$;

revoke all on function public.logistics_create_po(uuid, uuid, jsonb, int, int[], uuid) from public;
grant execute on function public.logistics_create_po(uuid, uuid, jsonb, int, int[], uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 3. logistics_create_pos_batch — body extends 0055b's. Diff: extract
--    `procurement_partner_id` from each jsonb PO entry, forward to inner.
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
  v_partner_id  uuid;
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

    -- 0079 — extract procurement_partner_id from this PO entry. Empty string
    -- treated as null (own_logistics suppliers omit the field).
    v_partner_id := nullif(v_po->>'procurement_partner_id', '')::uuid;

    begin
      v_po_id := public._logistics_create_po_inner(
        p_supplier_id            := nullif(v_po->>'supplier_id', '')::uuid,
        p_warehouse_id           := nullif(v_po->>'warehouse_id', '')::uuid,
        p_lines                  := v_po->'lines',
        p_eta_date               := v_eta,
        p_dl_refs                := v_dl_refs,
        p_note                   := v_po->>'note',
        p_procurement_partner_id := v_partner_id
      );

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
