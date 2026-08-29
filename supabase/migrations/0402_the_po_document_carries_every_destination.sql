-- ============================================================================
-- 0402 — the PO document carries every governed destination
--
-- Browser owner walk, 2026-08-28: every official PO document failed with
-- `42703: column "created_at" does not exist`. Migration 0383 correctly moved
-- the issuer onto the append-only `audit_log`, but ordered that ledger by a
-- column it has never owned. `audit_log` has called its timestamp
-- `occurred_at` since 0001.
--
-- This replaces only the read function. It repairs the audit clock and carries
-- each goods line's effective governed Deliver To (line override, otherwise PO
-- default), as decided by the Owner on 2026-08-28. The payload remains
-- money-free and no data is changed. Production apply remains a separately
-- approved governed act.
-- ============================================================================

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
  v_missing_destination_name text;
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

  -- One PO may carry several destinations. Every line must still resolve to a
  -- real printable address before the formal document can leave Carres.
  select coalesce(d.name, 'the recorded Deliver To')
    into v_missing_destination_name
    from purchase_order_lines l
    left join purchasing_destinations d
      on d.id = coalesce(l.destination_id, v_po.destination_id)
    left join warehouses w on w.id = d.warehouse_id
   where l.po_id = p_po_id
     and nullif(btrim(case when d.warehouse_id is not null then w.address else d.address end), '') is null
   limit 1;

  if found then
    raise exception 'no address on file for %', v_missing_destination_name
      using errcode = 'P0001', detail = 'destination_address_missing';
  end if;

  v_sup_addr := nullif(btrim(coalesce(v_sup.address, '')), '');

  -- audit_log's one timestamp is `occurred_at` (0001). This was incorrectly
  -- spelled `created_at` in 0383, making every document call fail before any
  -- payload could be returned.
  select actor_text into v_issuer
    from audit_log
   where ref = p_po_id and action like 'Created PO %'
   order by occurred_at asc
   limit 1;

  select coalesce(jsonb_agg(x order by x->>'sku'), '[]'::jsonb) into v_lines
    from (
      select jsonb_build_object(
               'sku',         l.sku,
               'description', coalesce(ps.variant, l.sku),
               'qty',         l.qty,
               'unit',        'pc',
               'destination', (
                 select jsonb_build_object(
                          'name', d.name,
                          'address', case when d.warehouse_id is not null then w.address else d.address end
                        )
                   from purchasing_destinations d
                   left join warehouses w on w.id = d.warehouse_id
                  where d.id = coalesce(l.destination_id, v_po.destination_id)
               ),
               'attrs',       (
                 select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
                   from jsonb_each(coalesce(l.attrs, '{}'::jsonb)) as e(k, v)
                  where k in ('color', 'gap', 'fabric_name')
               ),
               'unit_codes', (
                 select coalesce(jsonb_agg(si.unit_code order by si.unit_code), '[]'::jsonb)
                   from ops_stock_items si
                  where si.po_no = l.po_id and si.sku = l.sku
               ),
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
  '0402: money-free formal PO document authority; reads audit_log.occurred_at and returns every goods line effective governed Deliver To.';

revoke execute on function public.purchasing_po_document(text) from public, anon;
grant execute on function public.purchasing_po_document(text) to authenticated;
