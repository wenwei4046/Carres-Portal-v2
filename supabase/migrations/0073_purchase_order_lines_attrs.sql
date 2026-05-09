-- =============================================================================
-- 0073_purchase_order_lines_attrs.sql
-- =============================================================================
-- Cascade picker (Loo 2026-05-09): Create-PO modal switches from a single SKU
-- dropdown to category-aware cascading dropdowns.
--   • Mattress → Model + Size  (no attrs)
--   • Bedframe → Model + Size + Color + Gap  (attrs={color, gap})
--   • Sofa     → Model + Component + Fabric  (attrs={fabric_id, fabric_name, fabric_surcharge})
--
-- Per Loo Q1 2026-05-09: PO lines must carry these attrs so the supplier knows
-- which color/gap/fabric to make. Mirrors the existing order_lines.attrs jsonb
-- pattern (used by dealer ProductPicker for the same shape since Phase 2).
--
-- This migration:
--   1. ALTER TABLE purchase_order_lines ADD COLUMN attrs jsonb (NULLABLE).
--      Backfill is intentional NULL — pre-cascade rows have no attrs.
--   2. CREATE OR REPLACE _logistics_create_po_inner — extends the existing
--      0055b helper to extract v_attrs from each JSONB line element and INSERT
--      it. Signature + every other validation byte-for-byte preserved from
--      0055b lines 78-184.
--
-- NOT touched (intentional):
--   • logistics_issue_pos_for_order (0019) — auto-issue path bundles shortages
--     which don't yet carry per-order-line attrs; auto-issued PO lines remain
--     NULL on attrs. Cross-pipeline propagation (order_lines.attrs → shortage →
--     PO line) is a follow-up if Loo wants auto-issue to also carry attrs.
--   • logistics_create_po + logistics_create_pos_batch — pass-through wrappers
--     around the helper; their bodies don't see line shape, so no changes
--     needed here.
--   • Server-side attrs validation (e.g. reject color not in model.colors[]) —
--     enforced at the API edge via zod refinement (Layer C in cascade rework).
--     Server stays a dumb persister to match existing pattern.
--
-- CLAUDE.md §14 #6 satisfied — no edits to 0019/0025/0034/0037/0038/0055b.
-- All changes land here in 0073.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- 1. ADD COLUMN
-- ----------------------------------------------------------------------------
alter table public.purchase_order_lines
  add column if not exists attrs jsonb;

comment on column public.purchase_order_lines.attrs is
  'Cascade picker payload (Loo 2026-05-09): bedframe={color,gap}, sofa={fabric_id,fabric_name,fabric_surcharge}, mattress=NULL. Free-form jsonb mirrors order_lines.attrs.';


-- ----------------------------------------------------------------------------
-- 2. CREATE OR REPLACE _logistics_create_po_inner — adds attrs persistence.
--    Diff vs 0055b:78-184:
--      (a) DECLARE block adds v_attrs local.
--      (b) Per-line loop extracts v_attrs := v_line->'attrs' (returns jsonb,
--          NULL when absent or null).
--      (c) INSERT now writes attrs column (NULL passes through cleanly).
--    Everything else (signature, role check absent, sku/qty/cost validation,
--    audit_log write, return value) is byte-identical to 0055b.
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

    -- COGS validation + persistence (preserved from 0055b T26).
    v_cost        := (v_line->>'cost')::numeric(14,2);
    v_cost_source := (v_line->>'cost_source')::cost_source_enum;

    if v_cost is null or v_cost_source is null then
      raise exception 'cost and cost_source required for new PO line (sku=%)', v_sku
        using errcode = '22023', detail = 'cost_required';
    end if;

    -- 0073: Cascade picker attrs. `->` returns jsonb (NULL when absent or
    -- null). Mattress lines pass attrs=null; bedframe/sofa carry the picker
    -- payload. Server is a dumb persister — attrs shape is enforced at the
    -- API edge via zod.
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

revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from public;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from anon;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from authenticated;
revoke all on function public._logistics_create_po_inner(uuid, uuid, jsonb, date, int[], text) from service_role;
