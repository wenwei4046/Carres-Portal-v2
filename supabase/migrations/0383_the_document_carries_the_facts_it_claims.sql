-- ============================================================================
-- 0383 — the document carries the facts it claims
--        (CARD-2026-08-22-purchasing-02 closure §7; docs/pdf/PO-PDF-STANDARD.md)
--
-- The PO PDF template has columns for `SO NO` and `Item ID` and a footer that
-- names the issuer. Measured 2026-08-24, `purchasing_po_document` returned
-- none of them:
--
--   · no per-line source SO      → `SO NO` printed blank on every bulk PO
--   · no unit codes              → `Item ID` printed blank
--   · `issued_by` was hard-coded `null` in the route
--   · the supplier address was hard-coded `null`, while PO-PDF-STANDARD §2
--     requires the supplier's FULL address on a formal document
--
-- A walk fixture that injects Unit IDs proves the TEMPLATE can draw them. It
-- proves nothing about whether the Units minted by PO Issue ever reach the
-- paper. This closes the gap at the source: the document authority reads what
-- 0382 actually wrote.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · the supplier's own address
-- ---------------------------------------------------------------------------
--
-- PO-PDF-STANDARD §2: "The supplier prints its FULL address — a formal document
-- names both parties completely." Measured 2026-08-24: `suppliers` has `name`
-- and `contact` and NO address column at all, which is why the payload
-- hard-coded `'address', null` and the paper has never printed one.
--
-- The column is added nullable and stays empty until somebody fills it. A
-- supplier with no address prints nothing rather than blocking the document:
-- the gap is visible, and a purchase order still has to be able to leave.
alter table public.suppliers add column if not exists address text;
comment on column public.suppliers.address is
  '0383: the supplier''s full address for the formal PO document (PO-PDF-STANDARD §2). Nullable — an empty one prints nothing rather than blocking an issue.';

-- ---------------------------------------------------------------------------
-- 2 · the document payload
-- ---------------------------------------------------------------------------
create or replace function public.purchasing_po_document(p_po_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_role     app_role;
  v_po       purchase_orders;
  v_dest     purchasing_destinations;
  v_sup      suppliers;
  v_address  text;
  v_sup_addr text;
  v_lines    jsonb;
  v_issuer   text;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation', 'principal') then
    raise exception 'forbidden: only operation or principal can export a PO document'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO % not found', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status = 'cancelled' then
    raise exception 'PO % is cancelled and cannot be exported', p_po_id
      using errcode = 'P0001', detail = 'po_not_printable';
  end if;

  select * into v_dest from purchasing_destinations where id = v_po.destination_id;
  select * into v_sup from suppliers where id = v_po.supplier_id;

  if v_dest.warehouse_id is not null then
    select address into v_address from warehouses where id = v_dest.warehouse_id;
  else
    v_address := v_dest.address;
  end if;

  if v_address is null or length(btrim(v_address)) = 0 then
    raise exception 'no address on file for %', v_dest.name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  -- A FORMAL DOCUMENT NAMES BOTH PARTIES COMPLETELY (PO-PDF-STANDARD §2).
  -- Read, not hard-coded null. An empty one prints nothing; the gap is visible
  -- rather than fatal, because a purchase order still has to be able to leave.
  v_sup_addr := nullif(btrim(coalesce(v_sup.address, '')), '');

  -- WHO ISSUED IT. `placed_by` where the schema carries one, else the audit
  -- row the creation helper writes. Never the reader's own name.
  select actor_text into v_issuer
    from audit_log
   where ref = p_po_id and action like 'Created PO %'
   order by created_at asc
   limit 1;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'unit',        'pc',
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               ),
               -- 0382 · the Units this line actually minted, in a stable order.
               'unit_codes', (
                 select coalesce(jsonb_agg(si.unit_code order by si.unit_code), '[]'::jsonb)
                   from ops_stock_items si
                  where si.po_no = l.po_id and si.sku = l.sku
               ),
               -- 0382 · WHICH CUSTOMER EACH UNIT IS FOR. One aggregated SKU
               -- serving three Sales Orders returns three entries, so the paper
               -- prints the breakdown instead of a blank column.
               'sources', (
                 select coalesce(
                          jsonb_agg(jsonb_build_object('so', s.so, 'qty', s.qty)
                                    order by s.so nulls last),
                          '[]'::jsonb)
                   from po_line_sources s
                  where s.po_line_id = l.id
               )
             ) as x
        from purchase_order_lines l
        left join product_skus ps on ps.sku = l.sku
       where l.po_id = p_po_id
    ) s;

  return jsonb_build_object(
    'po_number',   v_po.id,
    'po_id',       v_po.id,
    'version',     coalesce(v_po.version, 1),
    'issue_date',  to_char(coalesce(v_po.placed_at, now()), 'YYYY-MM-DD'),
    'supplier', jsonb_build_object(
      'name',    coalesce(v_sup.name, 'Supplier'),
      'address', v_sup_addr,
      'contact', v_sup.contact
    ),
    'destination', jsonb_build_object(
      'name',    v_dest.name,
      'address', v_address
    ),
    'delivery_instructions', nullif(btrim(coalesce(v_po.delivery_instructions, '')), ''),
    'eta_date',    v_po.eta_date,
    'so_refs',     to_jsonb(coalesce(v_po.so_refs, array[]::int[])),
    'issued_by',   v_issuer,
    'lines',       v_lines,
    'terms',       null
  );
end;
$function$;

comment on function public.purchasing_po_document(text) is
  '0383: the money-free supplier-facing PO payload, carrying its version, per-line source SO allocation, the Unit IDs the issue actually minted, the real issuer and the supplier address. The route adds nothing.';
