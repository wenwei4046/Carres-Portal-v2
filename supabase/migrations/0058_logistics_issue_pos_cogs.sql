-- =============================================================================
-- 0058_logistics_issue_pos_cogs.sql -- Phase 4.5 Chunk 2 T42 codex review fix C1
-- =============================================================================
-- Pre-approval: 2026-05-06 autonomous-run agenda §1 (CLAUDE.md §14 #7).
--
-- Source spec:  docs/superpowers/specs/2026-05-05-phase-4.5-chunk-2-design.md
--               §6 M4.6 (CQ3 -- "PO COGS source")
-- Source review: T42 codex review cluster C1 (P1 finding).
-- Predecessor:  0057_cost_source_auto_issued_enum.sql -- adds the
--               'auto_issued' label to cost_source_enum.
--
-- What this migration does:
--   CREATE OR REPLACE on `logistics_issue_pos_for_order` to close the CQ3
--   COGS gap that the codex T42 review surfaced. After 0055b landed, manual
--   PO creation enforces non-NULL `cost` + `cost_source` via
--   `_logistics_create_po_inner` -- but the auto-issue path from
--   awaiting-stock orders (this RPC) silently inserted NULL/NULL because
--   auto-issue is a server-side system action with no UI gate.
--
--   The rewrite preserves every other behaviour byte-for-byte (role guard,
--   stage guard with the 0038 vocab sweep, soft-idempotency already_issued
--   guard, sofa-split + multi-line combine logic, audit_log writes, return
--   shape) and only adds COGS lookup + persistence around the two
--   purchase_order_lines INSERT statements.
--
-- COGS lookup contract (mirrors apps/api/src/routes/logistics/recent-cost.ts):
--   For each SKU we attempt to find the most-recent received-PO cost:
--     SELECT pol.cost FROM purchase_order_lines pol
--       INNER JOIN purchase_orders po ON po.id = pol.po_id
--      WHERE pol.sku = $sku
--        AND po.status = 'received'
--        AND pol.cost IS NOT NULL
--      ORDER BY po.updated_at DESC
--      LIMIT 1
--   - If found:    cost = recent value, cost_source = 'prev_po'.
--   - If missing:  cost = NULL,         cost_source = 'auto_issued'.
--   The 'auto_issued' sentinel (added by 0057) lets Finance distinguish
--   auto-issue lines from legacy NULL/NULL rows (pre-0055), surfacing them
--   for later cost reconciliation.
--
-- Two INSERT sites in the body:
--   1. Sofa split (qty=1 per PO inside the v_unit loop) -- single SKU, single
--      cost lookup per iteration. We compute v_recent_cost once at the top of
--      the v_short loop (sofa SKU is constant across the v_unit inner loop).
--   2. Combined mattress + bedframe lines -- previously
--        INSERT ... SELECT FROM jsonb_array_elements(v_combined_lines)
--      We now expand v_combined_lines with a per-SKU cost LATERAL lookup so
--      every aggregated line carries its own cost + cost_source resolution.
--      The SELECT-INSERT shape is preserved; only the SELECT now joins the
--      cost lookup subquery.
--
-- Idempotency: CREATE OR REPLACE is safe to re-run.
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
  -- T42 C1 (0058): per-SKU recent cost lookup for sofa split path. The combined
  -- multi-line path computes cost inline via LATERAL in the jsonb_agg select.
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
      -- T42 C1 (0058): resolve per-sofa-SKU cost ONCE per shortage row. The
      -- inner v_unit loop creates qty=1 split POs but they all share the same
      -- SKU, so the lookup result is constant across the inner iterations.
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

        -- T42 C1 (0058): persist cost + cost_source. v_recent_cost is the
        -- numeric(14,2) lookup result (may be NULL when no prior received PO
        -- exists for this SKU). 'prev_po' when found, 'auto_issued' sentinel
        -- otherwise.
        insert into purchase_order_lines (po_id, sku, qty, received_qty, cost, cost_source)
        values (
          v_po_id,
          v_short.sku,
          1,
          0,
          v_recent_cost,
          (case when v_recent_cost is not null then 'prev_po' else 'auto_issued' end)::cost_source_enum
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

    -- Mattress + bedframe lines in this supplier's group -> 1 multi-line PO.
    -- T42 C1 (0058): aggregate per-SKU recent-cost lookup into the jsonb so
    -- the downstream INSERT...SELECT can persist cost + cost_source per line.
    -- LATERAL subquery resolves the same query as the sofa path, scoped to
    -- each shortage row's SKU.
    select coalesce(jsonb_agg(jsonb_build_object(
             'sku',  sh.sku,
             'qty',  sh.short,
             'cost', cl.cost
           )), '[]'::jsonb),
           count(*)
      into v_combined_lines, v_combined_count
      from public.logistics_calc_shortages(p_order_id, v_order.warehouse_id) sh
      left join lateral (
        select pol.cost
          from purchase_order_lines pol
          join purchase_orders po on po.id = pol.po_id
         where pol.sku = sh.sku
           and po.status = 'received'
           and pol.cost is not null
         order by po.updated_at desc
         limit 1
      ) cl on true
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

      -- T42 C1 (0058): persist cost + cost_source per line. The 'cost' jsonb
      -- field is NULL when no prior received PO exists for that SKU. Cast
      -- chain: jsonb -> text -> numeric(14,2). `->>` returns SQL NULL when
      -- the key is JSON null, which feeds the CASE for cost_source.
      insert into purchase_order_lines (po_id, sku, qty, received_qty, cost, cost_source)
      select
        v_po_id,
        (line->>'sku')::text,
        (line->>'qty')::int,
        0,
        nullif(line->>'cost', '')::numeric(14,2),
        (case when (line->>'cost') is not null then 'prev_po' else 'auto_issued' end)::cost_source_enum
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
