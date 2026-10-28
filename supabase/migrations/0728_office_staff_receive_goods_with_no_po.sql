-- 0728 · Office staff receive goods that came with no Purchase Order (Houzs way)
--
-- YH 2026-10-27 (chat via hub): "A delivery with no PO records a Goods Receipt
-- with no PO, and stock goes up when it is posted." Source: PR #2100's
-- unidentified-delivery idea, rebuilt the Houzs way.
-- Follows Houzs backend/src/scm/routes/grns.ts:1408 (a GRN may be created
-- WITHOUT a parent PO; only the supplier is required) and :92 (POST writes the
-- stock IN) per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
-- Supersedes the "No separate blank-receipt screen" line (YH 2026-10-27, Houzs way).
--
-- ponytail: hidden PO keeps one stock engine. Carres births Units only from a
-- PO line (0444) and a receipt must name a PO (0302). So this door issues a
-- no-source PO through the one authority `purchasing_issue_pos_batch` (#2114),
-- marks it `receipt_only` so screens show no PO, and posts it at once through
-- `office_receive_post`. Every rule of both stays in force.
--
-- Who may call: the Receiving post authority (0601: active Operation staff),
-- the Carres home of Houzs's GRN post capability (grn-post-capability.ts:21).
-- Rows written: one receipt_only purchase_orders row + its lines and Units
-- (by the batch), one posted warehouse_receipts row + its events (by the post).
--
-- Idempotent. Read-only check:
--   select to_regproc('public.office_receive_without_po') is not null;

alter table public.purchase_orders
  add column if not exists receipt_only boolean not null default false;

comment on column public.purchase_orders.receipt_only is
  '0728: true = issued only to carry a Goods Receipt that had no PO (Houzs grns.ts:1408). Screens show no PO.';

create or replace function public.office_receive_without_po(
  p_supplier_id uuid, p_destination_id uuid, p_lines jsonb,
  p_do_number text, p_do_file_path text, p_note text default null,
  p_goods_received_at date default null, p_actual_site_id uuid default null,
  p_save_key uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_prior warehouse_receipts; v_wh uuid; v_po_id text; v_lines jsonb := '[]'::jsonb;
  v_pol purchase_order_lines; v_date date;
begin
  perform public.receiving_require_post_authority();

  -- Lost-response retry: the same key returns the same receipt, no second PO.
  if p_save_key is not null then
    select * into v_prior from warehouse_receipts where save_key = p_save_key;
    if found then
      return jsonb_build_object('receipt_id', v_prior.id, 'status', v_prior.status,
        'grn_no', v_prior.grn_no, 'already_saved', true);
    end if;
  end if;

  -- Follows Houzs grns.ts:1412 per Weisiang's ruling (2026-10-22): clear Carres
  -- rules, implement Houzs. Supplier and at least one line are required.
  if p_supplier_id is null then
    raise exception 'Choose the supplier' using errcode = '22023', detail = 'supplier_required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one item' using errcode = '22023', detail = 'items_required';
  end if;

  select warehouse_id into v_wh from purchasing_destinations where id = p_destination_id;
  v_wh := coalesce(p_actual_site_id, v_wh);

  v_po_id := (public.purchasing_issue_pos_batch(jsonb_build_array(jsonb_build_object(
    'supplier_id', p_supplier_id, 'warehouse_id', v_wh, 'destination_id', p_destination_id,
    'eta_date', null, 'procurement_partner_id', null, 'so_refs', null, 'purpose', null,
    'note', p_note,
    -- Price as #2114's New PO prices it: typed, else the Catalog cost, else none.
    'lines', (select jsonb_agg(jsonb_build_object(
        'sku', x.sku, 'qty', x.qty, 'cost', coalesce(x.typed, x.cat),
        'cost_source', case when coalesce(x.typed, x.cat) is null then null
                            when x.typed is null or x.typed = x.cat then 'catalog' else 'hand_entered' end,
        'commercial_treatment', case when coalesce(x.typed, x.cat) is null then null else 'normal' end,
        'commercial_reason', null, 'expected_catalog_cost', x.cat))
      from (select l->>'sku' sku, (l->>'qty')::int qty, nullif(l->>'cost', '')::numeric typed,
                   (select nullif(s.cost, 0) from product_skus s where s.sku = l->>'sku') cat
              from jsonb_array_elements(p_lines) l) x))))->'po_ids'->>0);

  -- A backdated delivery: the hidden PO is dated the day the goods came, so the
  -- engine's "not before the PO date" rule holds (Houzs has no PO date here).
  v_date := coalesce(p_goods_received_at, (now() at time zone 'Asia/Kuala_Lumpur')::date);
  update purchase_orders set receipt_only = true,
         placed_at = least(placed_at, (v_date::timestamp at time zone 'Asia/Kuala_Lumpur'))
   where id = v_po_id;

  -- Everything that came is received: every incoming Unit, every counted piece.
  for v_pol in select * from purchase_order_lines where po_id = v_po_id loop
    v_lines := v_lines || case when v_pol.identity_mode = 'quantity'
      then jsonb_build_object('id', v_pol.id, 'received_now', v_pol.qty, 'units', '[]'::jsonb)
      else jsonb_build_object('id', v_pol.id, 'received_now', 0, 'units',
        (select coalesce(jsonb_agg(jsonb_build_object('unit_code', u.unit_code, 'outcome', 'received')), '[]'::jsonb)
           from ops_stock_items u where u.po_line_id = v_pol.id and u.status = 'incoming'))
    end;
  end loop;

  return public.office_receive_post(v_po_id, p_do_number, p_do_file_path, p_note, v_lines,
    p_goods_received_at, p_actual_site_id, '[]'::jsonb, '[]'::jsonb, p_save_key, null) - 'po_id'
    || jsonb_build_object('po_hidden', true);
end;
$function$;

revoke execute on function public.office_receive_without_po(uuid, uuid, jsonb, text, text, text, date, uuid, uuid) from public, anon;
grant execute on function public.office_receive_without_po(uuid, uuid, jsonb, text, text, text, date, uuid, uuid) to authenticated, service_role;
