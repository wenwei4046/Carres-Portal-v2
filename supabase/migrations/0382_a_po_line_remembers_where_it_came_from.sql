-- ============================================================================
-- 0382 — a PO line remembers where it came from
--        (CARD-2026-08-22-purchasing-02 closure §5 · §6; MASTER §§6.1, 6.2, 9.1)
--
-- THE CARD PROMISED IT AND THE SCHEMA NEVER DID. "Every line retains source
-- SO/line attribution" (§4.2) was true of the REQUEST and of nothing after it:
-- `purchase_order_lines` carries `sku, qty, cost … demand_id` and no source
-- order, SO number or line. A bulk PO covering three customers aggregates one
-- SKU into one line, and `so_refs` sits on the DOCUMENT — so the PDF's `SO NO`
-- column had nothing to print and printed blank.
--
-- A supplier delivering ten mattresses cannot tell Carres which customer each
-- belongs to, and neither can Carres.
--
-- ── AND THE SAME FUNCTION MINTS BOTH IDENTITIES ─────────────────────────────
--
-- `_operation_create_po_inner` is where a PO number and its Units are born, so
-- 0381's allocators land here — one replacement rather than three.
--
--   · the PO number becomes `PO-YYYYMMDD-RRRR` (§6.1)
--   · Units become `U1-000-001` (§6.2)
--   · Units are minted for EVERY governed destination, not only Carres-owned
--     warehouses — §6.2 requires the supplier to write the Unit ID on the
--     package of a showroom/external delivery too, which it cannot do if
--     Carres never allocated one.
--
-- Existing rows are untouched: no PO is renumbered, no Unit recoded.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the lineage
-- ---------------------------------------------------------------------------
create table if not exists public.po_line_sources (
  id uuid primary key default gen_random_uuid(),
  po_id text not null references public.purchase_orders(id) on delete cascade,
  po_line_id uuid not null references public.purchase_order_lines(id) on delete cascade,
  sku text not null,
  order_id uuid not null references public.orders(id),
  /** The customer-facing number, denormalised so the PDF never joins to print. */
  so int,
  order_line_id uuid references public.order_lines(id),
  qty int not null check (qty > 0),
  created_at timestamptz not null default now()
);

comment on table public.po_line_sources is
  '0382: which customer order each unit on a PO line is for. One aggregated SKU serving three SOs has three rows here, so the supplier-facing document can print the breakdown instead of a blank SO NO.';

create index if not exists po_line_sources_po_idx on public.po_line_sources (po_id);
create index if not exists po_line_sources_order_idx on public.po_line_sources (order_id);

alter table public.po_line_sources enable row level security;
drop policy if exists po_line_sources_read on public.po_line_sources;
create policy po_line_sources_read on public.po_line_sources
  for select to authenticated
  using (public.app_role() in ('operation', 'principal', 'finance'));
revoke all on public.po_line_sources from authenticated;
grant select on public.po_line_sources to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · the creation helper, in its final form
-- ---------------------------------------------------------------------------
create or replace function public._operation_create_po_inner(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_lines jsonb,
  p_eta_date date,
  p_so_refs integer[],
  p_note text,
  p_procurement_partner_id uuid default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor        text;
  v_po_id        text;
  v_line_count   int;
  v_line         jsonb;
  v_sku          text;
  v_qty          int;
  v_cost         numeric(14,2);
  v_cost_source  cost_source_enum;
  v_attrs        jsonb;
  v_supplier_name text;
  v_line_id      uuid;
  v_src          jsonb;
  v_src_total    int;
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
  if p_procurement_partner_id is not null
     and not exists (select 1 from delivery_partners where id = p_procurement_partner_id) then
    raise exception 'procurement partner not found'
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');
  select name into v_supplier_name from suppliers where id = p_supplier_id;

  -- ⭐ 0381/0382 · THE LOCKED DOCUMENT NUMBER (MASTER §6.1). This replaced
  -- `max(seq) + 1`, which leaked how much Carres buys to anyone holding two of
  -- our purchase orders.
  v_po_id := public.allocate_formal_document_code('PO');

  insert into purchase_orders
    (id, so_refs, supplier_id, warehouse_id, eta_date, status, sup_status, placed_at,
     procurement_partner_id)
  values
    (v_po_id, p_so_refs, p_supplier_id, p_warehouse_id, p_eta_date,
     'open', 'pending', now(),
     p_procurement_partner_id);

  update public.formal_document_codes
     set document_id = v_po_id
   where code_date = (timezone('Asia/Kuala_Lumpur', now()))::date
     and code = split_part(v_po_id, '-', 3);

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
    values (v_po_id, v_sku, v_qty, 0, v_cost, v_cost_source, v_attrs)
    returning id into v_line_id;

    -- ⭐ 0382 · THE LINEAGE. The caller passes the SERVER's own recomputed
    -- allocation; it is validated here rather than trusted, because a browser
    -- that could name a source could put one customer's goods on another
    -- customer's order.
    if jsonb_typeof(v_line->'sources') = 'array' then
      v_src_total := 0;
      for v_src in select * from jsonb_array_elements(v_line->'sources')
      loop
        if not exists (select 1 from orders where id = (v_src->>'order_id')::uuid) then
          raise exception 'source order not found (sku=%)', v_sku
            using errcode = 'P0001', detail = 'unknown_source_order';
        end if;
        if nullif(v_src->>'order_line_id', '') is not null
           and not exists (
             select 1 from order_lines
              where id = (v_src->>'order_line_id')::uuid
                and order_id = (v_src->>'order_id')::uuid
           ) then
          raise exception 'source line does not belong to its order (sku=%)', v_sku
            using errcode = 'P0001', detail = 'source_line_mismatch';
        end if;
        insert into po_line_sources (po_id, po_line_id, sku, order_id, so, order_line_id, qty)
        values (
          v_po_id, v_line_id, v_sku,
          (v_src->>'order_id')::uuid,
          nullif(v_src->>'so', '')::int,
          nullif(v_src->>'order_line_id', '')::uuid,
          (v_src->>'qty')::int
        );
        v_src_total := v_src_total + (v_src->>'qty')::int;
      end loop;
      -- The parts must add up to the line. A lineage that does not is worse
      -- than none: it would look authoritative while hiding units.
      if v_src_total <> v_qty then
        raise exception 'source allocation does not add up (sku=%, sources=%, line=%)',
            v_sku, v_src_total, v_qty
          using errcode = 'P0001', detail = 'source_allocation_mismatch';
      end if;
    end if;

    -- ⭐ 0381/0382 · THE LOCKED UNIT ID (MASTER §6.2), minted for EVERY
    -- destination. It used to mint only into Carres-owned warehouses, so a
    -- showroom or external delivery had no Unit ID for the supplier to write
    -- on the package — which §6.2 requires it to do.
    if v_qty > 0 then
      insert into ops_stock_items (unit_code, sku, warehouse_id, status, supplier, po_no, source_ref, date_in)
      select public.allocate_unit_id(), v_sku, p_warehouse_id, 'incoming',
             v_supplier_name, v_po_id, 'po_mint', current_date
        from generate_series(1, v_qty);
    end if;

    v_line_count := v_line_count + 1;
  end loop;

  insert into audit_log (role, actor_text, action, ref)
  values ('operation', v_actor,
          format('Created PO %s · %s lines%s',
                 v_po_id, v_line_count,
                 case when p_note is not null and btrim(p_note) <> ''
                      then ' · ' || btrim(p_note)
                      else '' end),
          v_po_id);

  return v_po_id;
end;
$function$;

comment on function public._operation_create_po_inner(uuid, uuid, jsonb, date, integer[], text, uuid) is
  '0382: mints a PO under the locked identities (MASTER §6.1/§6.2), records per-line source SO/line allocation, and allocates a Unit ID for every governed destination. Reached only through purchasing_issue_pos_batch.';
