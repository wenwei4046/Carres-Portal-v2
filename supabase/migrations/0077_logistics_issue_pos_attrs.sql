-- =============================================================================
-- 0077_logistics_issue_pos_attrs.sql
-- =============================================================================
-- Multi-variant attrs propagation in auto-issue (Loo 2026-05-10) — closes the
-- second leaf of the same bug 0076 fixed for the manual modal flow. The
-- "auto-issue POs from order shortage" RPC (`logistics_issue_pos_for_order`,
-- last touched in 0058) was still inserting `attrs = NULL` on every PO line
-- it created, so a dealer order with bedframe color + gap would generate a
-- PO that the supplier saw as just "BF-001 ×2" — same surfaced bug Loo
-- caught in the manual + auto-fill flow.
--
-- Why this also unblocks 0076: post-0076, purchase_order_lines.attrs is part
-- of the unique index `(po_id, sku, coalesce(attrs::text, ''))`. If one
-- dealer order somehow has two BF-001 lines in different colors, the old
-- combine path's INSERT would build (po, BF-001, NULL) twice and crash on
-- 23505 unique_violation. Threading attrs through means each variant gets
-- its own line tuple — same SKU, different attrs, different rows.
--
-- This migration:
--   CREATE OR REPLACE on `logistics_issue_pos_for_order` to swap the three
--   `logistics_calc_shortages(p_order_id, ...)` calls for inline subqueries
--   that also select `order_lines.attrs`. Side effects of the swap:
--     (a) Sofa split path now iterates per (sku, attrs) — each fabric variant
--         spawns its own qty=1 PO (was already true per-row, just attrs was
--         dropped at the boundary). PO line carries the fabric attrs.
--     (b) Combined mattress + bedframe path aggregates by (sku, attrs) so
--         multi-variant bedframe lines (e.g. BF-001 in Natural Oak + Walnut)
--         become two rows in the jsonb_agg array, each with its own
--         per-variant cost lookup. INSERT uses the same SELECT shape, just
--         carries an extra `attrs` column.
--     (c) Supplier-discovery exists() probe stays on the legacy
--         `logistics_calc_shortages` — that filter only needs (sku, short),
--         attrs irrelevant.
--
-- Stock-vs-variant note: stock_balances is keyed by sku alone (no variant
-- tracking); the shortage subtraction `qty - coalesce(sb.qty, 0)` runs per
-- order_line, same as the legacy RPC. Cross-variant stock allocation
-- precision is a pre-existing edge case unchanged by this migration —
-- whichever order_line wins in evaluation order wins the stock pool. For
-- typical orders (one variant per line) this is exactly the legacy behavior.
--
-- COGS lookup contract preserved byte-for-byte from 0058 (per-SKU recent
-- received-PO cost via LATERAL subquery, 'prev_po' on hit, 'auto_issued'
-- otherwise).
--
-- CLAUDE.md §14 #6: 0058 stays byte-identical; 0077 supersedes via CREATE OR
-- REPLACE on the same function name. Loo authorized in conversation
-- 2026-05-10 (continuation of the 0076 GO).
-- =============================================================================


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
  v_recent_cost  numeric(14,2);
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.status <> 'proceed_order'
     or v_order.logistics_stage <> 'awaiting_logistics_action' then
    raise exception 'order is not in awaiting_logistics_action state'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  if exists (
    select 1 from purchase_orders
     where (dl = v_order.dl or v_order.dl = ANY(coalesce(dl_refs, array[]::int[])))
       and status = 'open'
  ) then
    raise exception 'POs already issued for this order'
      using errcode = 'P0001', detail = 'already_issued';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  select coalesce(max((substring(id from 'PO-(\d+)$'))::int), 2030)
    into v_max_seq
    from purchase_orders
   where id ~ '^PO-\d+$';

  for v_supplier in
    select distinct s.*
      from suppliers s
     where exists (
       select 1
         from public.logistics_calc_shortages(p_order_id, v_order.warehouse_id) sh
        where split_part(sh.sku, ':', 1) = ANY(s.cat_covered)
     )
  loop
    -- 0077: Sofa per-line iteration carries attrs. Inline shortage query
    -- mirrors logistics_calc_shortages's row-per-order_line shape, but
    -- selects ol.attrs alongside (sku, short) so the PO line INSERT below
    -- preserves the fabric variant.
    for v_short in
      select ol.sku as sku,
             ol.attrs as attrs,
             (ol.qty - coalesce(sb.qty, 0))::int as short
        from order_lines ol
        left join stock_balances sb
               on sb.sku = ol.sku
              and sb.warehouse_id = v_order.warehouse_id
       where ol.order_id = p_order_id
         and ol.qty > coalesce(sb.qty, 0)
         and split_part(ol.sku, ':', 1) = 'sofa'
         and 'sofa' = ANY(v_supplier.cat_covered)
    loop
      v_recent_cost := null;
      select pol.cost
        into v_recent_cost
        from purchase_order_lines pol
        join purchase_orders po on po.id = pol.po_id
       where pol.sku = v_short.sku
         and po.status = 'received'
         and pol.cost is not null
       order by po.updated_at desc
       limit 1;

      for v_unit in 1..v_short.short
      loop
        v_max_seq := v_max_seq + 1;
        v_po_id := 'PO-' || v_max_seq::text;

        insert into purchase_orders
          (id, dl, supplier_id, warehouse_id, status, sup_status, placed_at)
        values
          (v_po_id, v_order.dl, v_supplier.id, v_order.warehouse_id,
           'open', 'pending', now());

        insert into purchase_order_lines (po_id, sku, qty, received_qty, cost, cost_source, attrs)
        values (
          v_po_id,
          v_short.sku,
          1,
          0,
          v_recent_cost,
          (case when v_recent_cost is not null then 'prev_po' else 'auto_issued' end)::cost_source_enum,
          v_short.attrs
        );

        insert into audit_log (role, actor_text, action, dealer_id, ref)
        values ('logistics', v_actor,
                format('Issued PO %s · sofa split (qty=1)', v_po_id),
                v_order.dealer_id, v_po_id);

        v_pos_created := v_pos_created || jsonb_build_object(
          'id', v_po_id,
          'supplier_id', v_supplier.id,
          'line_count', 1
        );
      end loop;
    end loop;

    -- 0077: Combined mattress + bedframe path aggregates by (sku, attrs).
    -- Multi-variant bedframe (e.g. BF-001 Natural Oak + BF-001 Walnut in
    -- one order) now produces two distinct lines in the jsonb_agg array,
    -- each with its own canonical attrs object — the post-0076
    -- (po_id, sku, coalesce(attrs::text, '')) unique index accepts both.
    -- Per-SKU LATERAL cost lookup unchanged (cost is per-sku, not
    -- per-variant — bedframe color doesn't affect supplier price).
    select coalesce(jsonb_agg(jsonb_build_object(
             'sku',   sh.sku,
             'qty',   sh.short,
             'cost',  cl.cost,
             'attrs', sh.attrs
           )), '[]'::jsonb),
           count(*)
      into v_combined_lines, v_combined_count
      from (
        select ol.sku as sku,
               ol.attrs as attrs,
               (ol.qty - coalesce(sb.qty, 0))::int as short
          from order_lines ol
          left join stock_balances sb
                 on sb.sku = ol.sku
                and sb.warehouse_id = v_order.warehouse_id
         where ol.order_id = p_order_id
           and ol.qty > coalesce(sb.qty, 0)
           and split_part(ol.sku, ':', 1) <> 'sofa'
           and split_part(ol.sku, ':', 1) = ANY(v_supplier.cat_covered)
      ) sh
      left join lateral (
        select pol.cost
          from purchase_order_lines pol
          join purchase_orders po on po.id = pol.po_id
         where pol.sku = sh.sku
           and po.status = 'received'
           and pol.cost is not null
         order by po.updated_at desc
         limit 1
      ) cl on true;

    if v_combined_count > 0 then
      v_max_seq := v_max_seq + 1;
      v_po_id := 'PO-' || v_max_seq::text;

      insert into purchase_orders
        (id, dl, supplier_id, warehouse_id, status, sup_status, placed_at)
      values
        (v_po_id, v_order.dl, v_supplier.id, v_order.warehouse_id,
         'open', 'pending', now());

      -- 0077: extra `attrs` column on the INSERT. `line->'attrs'` returns
      -- jsonb (NULL for mattress, the picker payload for bedframe).
      insert into purchase_order_lines (po_id, sku, qty, received_qty, cost, cost_source, attrs)
      select
        v_po_id,
        (line->>'sku')::text,
        (line->>'qty')::int,
        0,
        nullif(line->>'cost', '')::numeric(14,2),
        (case when (line->>'cost') is not null then 'prev_po' else 'auto_issued' end)::cost_source_enum,
        line->'attrs'
        from jsonb_array_elements(v_combined_lines) as line;

      insert into audit_log (role, actor_text, action, dealer_id, ref)
      values ('logistics', v_actor,
              format('Issued PO %s · combined (%s lines)', v_po_id, v_combined_count),
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
