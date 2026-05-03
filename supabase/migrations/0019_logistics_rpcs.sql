-- =============================================================================
-- 0019_logistics_rpcs.sql — Phase 4 M1 logistics RPCs
-- =============================================================================
-- Source of truth: docs/superpowers/specs/2026-05-03-phase-4-logistics-design.md
-- Reads:
--   §6     — RPC signatures (the brainstorm draft)
--   §17    — review-driven decisions that supersede §6 where they overlap
--   §18    — proto fidelity reference (logistics-actions.jsx etc.)
--
-- All RPCs are SECURITY DEFINER + manual `is_logistics()` guard (Phase 3
-- pattern, no RLS changes). SQLSTATE codes follow the §17.5 CQ2 contract:
--   42501 — forbidden                    (caller is not logistics)
--   42P01 — not found                    (order/po/etc. id missing)
--   22023 — invalid_param / wrong stage  (state machine violation)
--   P0001 — domain rule violation        (over-receipt, do_required, etc.)
--
-- Function set (per §17.8 + §18.10):
--   helper:
--     is_logistics()                          — boolean role check
--     logistics_pick_warehouse(p_order_id)    — used by proceed_order + UI
--     logistics_calc_shortages(p_order_id, p_warehouse_id) — likewise
--   extension:
--     proceed_order(p_order_id) — preserves Phase 2C blockers, then auto-stages
--                                  awaiting_stock vs ready_to_dispatch.
--   new RPCs (11 total):
--     logistics_dashboard_summary
--     logistics_issue_pos_for_order
--     logistics_receive_po_line
--     logistics_assign_partner
--     logistics_attach_do_and_deliver
--     logistics_adjust_stock
--     logistics_warehouse_pick
--     logistics_create_po
--     logistics_abandon_order
--     logistics_assign_pickup_partner
--     logistics_reassign_po_warehouse
--
-- Schema add-ons (per §17.1):
--   - is_logistics()        helper (mirrors is_principal)
--   - orders.dispatched_at  timestamptz
--   - orders.delivered_at   timestamptz
-- =============================================================================


-- -----------------------------------------------------------------------------
-- §17.1: is_logistics() helper. Mirrors is_principal() in 0002_rls.sql.
-- Used by every new RPC below + can be referenced from any future policy if we
-- ever decide to switch from RPC-only to RLS for logistics writes.
-- -----------------------------------------------------------------------------
create or replace function public.is_logistics()
returns boolean
language sql stable security definer as $$
  select coalesce((select role from public.app_users where id = auth.uid()) = 'logistics', false)
$$;


-- -----------------------------------------------------------------------------
-- §17.1: add dispatched_at / delivered_at columns. The do_number / do_note
-- columns already exist (0001_init.sql line 274-275) so we reuse them.
-- -----------------------------------------------------------------------------
alter table orders add column dispatched_at timestamptz;
alter table orders add column delivered_at  timestamptz;

-- Resolved spec ambiguity: §17.4 A6 says "Set status='cancelled',
-- logistics_stage='cancelled'", but the logistics_stage enum (0001 line 27)
-- does not include 'cancelled'. Adding a new enum value in the same
-- migration that uses it isn't allowed by Postgres (see 0012's note that
-- "enum value addition must be in its own migration"). Since this prompt
-- forbids new files outside 0017/0018/0019, logistics_abandon_order sets
-- logistics_stage = NULL on the cancelled order and relies on
-- orders.status='cancelled' to communicate finality. logistics_stage is
-- already nullable per the schema. If a future migration adds a 'cancelled'
-- enum value, swap NULL -> 'cancelled' inside that RPC.


-- =============================================================================
-- HELPER RPCs (used by both proceed_order extension AND logistics RPCs)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- logistics_pick_warehouse(p_order_id) -> uuid
-- Returns the best warehouse for fulfilling an order:
--   1. First warehouse that has full stock for every line, else
--   2. First warehouse (any) — falling back keeps state machine flowing even
--      when nothing in stock; shortages will be tracked separately.
-- Mirrors proto's pickWarehouseFor() in logistics-actions.jsx:42-58.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_pick_warehouse(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_full uuid;
  v_any  uuid;
begin
  -- Warehouse with full stock for every order line. NOT EXISTS clause finds
  -- a warehouse where no line is short.
  select w.id into v_full
    from warehouses w
   where not exists (
     select 1
       from order_lines ol
       left join stock_balances sb
         on sb.sku = ol.sku and sb.warehouse_id = w.id
      where ol.order_id = p_order_id
        and (coalesce(sb.qty, 0) < ol.qty)
   )
   order by w.created_at asc
   limit 1;

  if v_full is not null then
    return v_full;
  end if;

  -- Fallback: oldest warehouse. Always exists in seeded environments.
  select id into v_any from warehouses order by created_at asc limit 1;
  return v_any;
end;
$$;

revoke all on function public.logistics_pick_warehouse(uuid) from public;
grant execute on function public.logistics_pick_warehouse(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_calc_shortages(p_order_id, p_warehouse_id) -> table(sku, short)
-- For each order_line, returns shortfall vs stock_balances.qty (NOT subtracting
-- reserved — shortages are a question of "do we need to ORDER more from
-- suppliers", not of "is everything allocated yet"). Allocation correctness
-- is the reservation system's job (§4 D1.reserved).
-- ----------------------------------------------------------------------------
create or replace function public.logistics_calc_shortages(
  p_order_id     uuid,
  p_warehouse_id uuid
)
returns table(sku text, short int)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select ol.sku,
         (ol.qty - coalesce(sb.qty, 0))::int as short
    from order_lines ol
    left join stock_balances sb
      on sb.sku = ol.sku and sb.warehouse_id = p_warehouse_id
   where ol.order_id = p_order_id
     and ol.qty > coalesce(sb.qty, 0);
$$;

revoke all on function public.logistics_calc_shortages(uuid, uuid) from public;
grant execute on function public.logistics_calc_shortages(uuid, uuid) to authenticated;


-- =============================================================================
-- proceed_order — EXTEND existing (preserves Phase 2C blocker logic verbatim,
-- then APPENDS auto-stage logic per §6 + §17.2 D1.auto-PO=spec=manual).
-- D1.auto-PO decision: this RPC sets logistics_stage to either
-- ready_to_dispatch (with reservation) or awaiting_stock — but does NOT
-- create POs. PO creation is manual: logistics user clicks "Auto-issue POs"
-- from the awaiting_stock drawer. That triggers logistics_issue_pos_for_order.
-- =============================================================================
create or replace function public.proceed_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_total            numeric(12,2);
  v_paid_pct         numeric;
  v_warehouse_id     uuid;
  v_warehouse_name   text;
  v_shortage_count   int;
  v_line             record;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  -- 1. Fetch order
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- 2. Cross-dealer guard. Internal roles can proceed any order; dealer /
  -- salesperson can only proceed their own. Mirrors create_order (0006).
  if v_role not in ('principal','logistics','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer proceed'
      using errcode = '42501', detail = 'forbidden';
  end if;

  -- 3. Status guard
  if v_order.status <> 'place' then
    raise exception 'Order is not in Place status'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- 4. Blocker checks — each raises P0001 with a specific DETAIL code so the
  -- API route can relay the exact failure to the UI.
  if v_order.customer_name is null or trim(v_order.customer_name) = '' then
    raise exception 'Customer name is required'
      using errcode = 'P0001', detail = 'customer_name_required';
  end if;

  if v_order.customer_phone is null or trim(v_order.customer_phone) = '' then
    raise exception 'Customer phone is required'
      using errcode = 'P0001', detail = 'customer_phone_required';
  end if;

  if v_order.customer_address_unknown
     or v_order.customer_address is null
     or trim(v_order.customer_address) = '' then
    raise exception 'Delivery address is required'
      using errcode = 'P0001', detail = 'delivery_address_required';
  end if;

  if v_order.delivery_date_tbd or v_order.delivery_date is null then
    raise exception 'Delivery date is required'
      using errcode = 'P0001', detail = 'delivery_date_required';
  end if;

  if v_order.signature_url is null then
    raise exception 'Customer signature is required'
      using errcode = 'P0001', detail = 'signature_required';
  end if;

  if not v_order.terms_accepted then
    raise exception 'Terms must be accepted'
      using errcode = 'P0001', detail = 'terms_not_accepted';
  end if;

  -- 5. Compute order total. Matches GET /api/orders aggregate: line + addon,
  -- excludes stair carry per proto's `monthValue` definition.
  select
    coalesce((select sum(unit_price * qty) from order_lines  where order_id = p_order_id), 0)
    + coalesce((select sum(unit_price * qty) from order_addons where order_id = p_order_id), 0)
  into v_total;

  if v_total <= 0 then
    raise exception 'Order total is zero — nothing to proceed'
      using errcode = 'P0001', detail = 'total_amount_missing';
  end if;

  v_paid_pct := (v_order.paid / v_total) * 100;
  if v_paid_pct < 50 then
    raise exception 'Payment must be at least 50 percent of total'
      using errcode = 'P0001', detail = 'payment_below_50';
  end if;

  -- 6. Atomic transition: update status + record history + audit.
  update orders
     set status = 'proceed_order',
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    'Order proceeded · sent to logistics',
    v_role
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.proceeded',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  -- 7. Phase 4 auto-stage logic (§6 + §17.2 D1.auto-PO=manual).
  -- Pick a warehouse, then check shortages. If everything in stock → reserve
  -- + ready_to_dispatch. Otherwise → awaiting_stock (PO creation is a
  -- separate manual action from the logistics drawer).
  v_warehouse_id := public.logistics_pick_warehouse(p_order_id);

  if v_warehouse_id is not null then
    select count(*) into v_shortage_count
      from public.logistics_calc_shortages(p_order_id, v_warehouse_id);

    select name into v_warehouse_name from warehouses where id = v_warehouse_id;

    if v_shortage_count = 0 then
      -- Reserve stock for every order_line (idempotent within tx).
      for v_line in
        select sku, qty from order_lines where order_id = p_order_id
      loop
        update stock_balances
           set reserved = reserved + v_line.qty,
               updated_at = now()
         where sku = v_line.sku
           and warehouse_id = v_warehouse_id;
      end loop;

      update orders
         set logistics_stage = 'ready_to_dispatch',
             warehouse_id    = v_warehouse_id,
             updated_at      = now()
       where id = p_order_id;

      insert into order_history (order_id, text, by_role)
      values (
        p_order_id,
        format('Stock confirmed at %s · ready to dispatch',
               coalesce(v_warehouse_name, 'warehouse')),
        v_role
      );
    else
      update orders
         set logistics_stage = 'awaiting_stock',
             warehouse_id    = v_warehouse_id,
             updated_at      = now()
       where id = p_order_id;

      insert into order_history (order_id, text, by_role)
      values (
        p_order_id,
        format('Awaiting stock for %s SKUs at %s',
               v_shortage_count,
               coalesce(v_warehouse_name, 'warehouse')),
        v_role
      );
    end if;
  end if;

  -- 8. Slim payload — caller re-fetches the full row.
  return jsonb_build_object(
    'id', v_order.id,
    'dl', v_order.dl,
    'status', 'proceed_order',
    'logistics_stage', (select logistics_stage from orders where id = p_order_id),
    'warehouse_id', v_warehouse_id
  );
end;
$$;

revoke all on function public.proceed_order(uuid) from public;
grant execute on function public.proceed_order(uuid) to authenticated;


-- =============================================================================
-- LOGISTICS RPCs — all SECURITY DEFINER + is_logistics() guard.
-- =============================================================================


-- ----------------------------------------------------------------------------
-- logistics_dashboard_summary() -> jsonb
-- Single round-trip for KPI strip + 3 pipeline buckets + open POs + low stock
-- side cards + audit recent. Mirrors principal_dashboard_summary in 0013.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  v_kpis         jsonb;
  v_pipeline     jsonb;
  v_open_pos     jsonb;
  v_low_stock    jsonb;
  v_audit_recent jsonb;
  v_alerts       jsonb;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  -- KPI tile: today's deliveries + open POs + overdue orders + active GMV.
  select jsonb_build_object(
    'today_deliveries',
      (select count(*) from orders
        where status = 'proceed_order'
          and logistics_stage in ('ready_to_dispatch','dispatched')
          and delivery_date = current_date),
    'open_pos',
      (select count(*) from purchase_orders where status = 'open'),
    'overdue_orders',
      (select count(*) from orders
        where status = 'proceed_order'
          and logistics_stage in ('awaiting_stock','ready_to_dispatch','dispatched')
          and delivery_date < current_date),
    'active_orders',
      (select count(*) from orders
        where status = 'proceed_order'
          and logistics_stage <> 'delivered'),
    'active_gmv',
      coalesce((
        select sum(line_total)
          from (
            select coalesce((select sum(unit_price * qty)
                               from order_lines
                              where order_id = o.id), 0)
                 + coalesce((select sum(unit_price * qty)
                               from order_addons
                              where order_id = o.id), 0)
                 as line_total
              from orders o
             where o.status = 'proceed_order'
               and o.logistics_stage <> 'delivered'
          ) t
      ), 0)
  )
  into v_kpis;

  -- Pipeline buckets: counts only (UI fetches the lists separately for filter).
  select jsonb_build_object(
    'awaiting_stock',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'awaiting_stock'),
    'ready_to_dispatch',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'ready_to_dispatch'),
    'dispatched',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'dispatched')
  )
  into v_pipeline;

  -- Top 4 open POs for the side card.
  select coalesce(jsonb_agg(row_to_json(t) order by t.placed_at desc), '[]'::jsonb)
    into v_open_pos
    from (
      select p.id, p.supplier_id, p.warehouse_id, p.status, p.sup_status,
             p.eta_date, p.placed_at, p.dl, p.dl_refs
        from purchase_orders p
       where p.status = 'open'
       order by p.placed_at desc
       limit 4
    ) t;

  -- Top 5 low-stock SKUs (qty - reserved <= 1).
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_low_stock
    from (
      select sb.sku, sb.warehouse_id, sb.qty, sb.reserved,
             (sb.qty - sb.reserved) as available
        from stock_balances sb
       where (sb.qty - sb.reserved) <= 1
       order by (sb.qty - sb.reserved) asc, sb.sku
       limit 5
    ) t;

  -- Recent logistics-related audit entries.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_audit_recent
    from (
      select id, role, actor_text, action, dealer_id, ref, occurred_at
        from audit_log
       where role = 'logistics'
       order by occurred_at desc
       limit 5
    ) t;

  -- Alerts surface: out-of-stock SKUs.
  select jsonb_build_object(
    'out_of_stock_skus',
      (select count(*) from stock_balances where qty = 0)
  )
  into v_alerts;

  return jsonb_build_object(
    'kpis',          v_kpis,
    'pipeline',      v_pipeline,
    'open_pos',      v_open_pos,
    'low_stock',     v_low_stock,
    'audit_recent',  v_audit_recent,
    'alerts',        v_alerts
  );
end;
$$;

revoke all on function public.logistics_dashboard_summary() from public;
grant execute on function public.logistics_dashboard_summary() to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_issue_pos_for_order(p_order_id uuid) -> jsonb
-- Manual auto-issue per §17.2 D1.auto-PO. Groups shortages by supplier
-- (sku_category derived from sku format `cat:model` per proto's
-- `s.sku.split(":")[0]` convention; suppliers.cat_covered text[] match).
-- Splits sofa lines into individual qty=1 POs (highly customized fabric/color/
-- size); combines mattress/bedframe lines into multi-line POs.
-- ----------------------------------------------------------------------------
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
  v_category     text;
  v_unit         int;
  v_combined_lines jsonb;
  v_combined_count int;
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
     or v_order.logistics_stage <> 'awaiting_stock' then
    raise exception 'order is not in awaiting_stock state'
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
    -- Sofa lines in this supplier's group → split into 1 PO per qty=1.
    for v_short in
      select sh.sku, sh.short
        from public.logistics_calc_shortages(p_order_id, v_order.warehouse_id) sh
       where split_part(sh.sku, ':', 1) = 'sofa'
         and 'sofa' = ANY(v_supplier.cat_covered)
    loop
      for v_unit in 1..v_short.short
      loop
        v_max_seq := v_max_seq + 1;
        v_po_id := 'PO-' || v_max_seq::text;

        insert into purchase_orders
          (id, dl, supplier_id, warehouse_id, status, sup_status, placed_at)
        values
          (v_po_id, v_order.dl, v_supplier.id, v_order.warehouse_id,
           'open', 'pending', now());

        insert into purchase_order_lines (po_id, sku, qty, received_qty)
        values (v_po_id, v_short.sku, 1, 0);

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

    -- Mattress + bedframe lines in this supplier's group → 1 multi-line PO.
    select coalesce(jsonb_agg(jsonb_build_object('sku', sh.sku, 'qty', sh.short)), '[]'::jsonb),
           count(*)
      into v_combined_lines, v_combined_count
      from public.logistics_calc_shortages(p_order_id, v_order.warehouse_id) sh
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

      insert into purchase_order_lines (po_id, sku, qty, received_qty)
      select v_po_id, (line->>'sku')::text, (line->>'qty')::int, 0
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


-- ----------------------------------------------------------------------------
-- logistics_receive_po_line(p_po_id text, p_sku text, p_received_qty int) -> jsonb
-- Critical RPC. Per §17.4 A5: SELECT FOR UPDATE on order rows + stock_balances
-- rows so concurrent receipts can't double-promote an order.
-- Workflow:
--   1. Lock + validate the PO line.
--   2. Update po_lines.received_qty (delta).
--   3. If every line in the PO is fully received → status='received'.
--   4. Bump stock_balances.qty by delta; record stock_movements (kind='in').
--   5. For every awaiting_stock order touching this SKU, recompute shortages.
--      If cleared → auto-promote to ready_to_dispatch (with reservation).
-- ----------------------------------------------------------------------------
create or replace function public.logistics_receive_po_line(
  p_po_id        text,
  p_sku          text,
  p_received_qty int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po                 purchase_orders;
  v_line               purchase_order_lines;
  v_delta              int;
  v_actor              text;
  v_outstanding        int;
  v_orders_promoted    jsonb := '[]'::jsonb;
  v_target_order       record;
  v_promote_shortages  int;
  v_new_status         po_status;
  v_warehouse_name     text;
  v_promo_line         record;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_received_qty is null or p_received_qty < 0 then
    raise exception 'received_qty must be >= 0'
      using errcode = '22023', detail = 'invalid_received_qty';
  end if;

  -- Lock the PO row (and downstream PO line) for the duration of this tx.
  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;
  if v_po.status <> 'open' then
    raise exception 'PO is not open'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  select * into v_line
    from purchase_order_lines
   where po_id = p_po_id and sku = p_sku
   for update;
  if not found then
    raise exception 'PO line not found'
      using errcode = '42P01', detail = 'po_line_not_found';
  end if;

  -- Over-receipt guard.
  if p_received_qty > v_line.qty then
    raise exception 'over received: % vs ordered %', p_received_qty, v_line.qty
      using errcode = 'P0001', detail = 'over_received';
  end if;

  v_delta := p_received_qty - v_line.received_qty;
  if v_delta < 0 then
    raise exception 'received_qty must be >= currently received (%)', v_line.received_qty
      using errcode = 'P0001', detail = 'over_received';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_order_lines
     set received_qty = p_received_qty
   where po_id = p_po_id and sku = p_sku;

  -- Lock the stock_balances row before update.
  perform 1 from stock_balances
   where sku = p_sku and warehouse_id = v_po.warehouse_id
   for update;

  if v_delta > 0 then
    -- Upsert: stock balance row may not exist yet for a brand-new SKU.
    insert into stock_balances (sku, warehouse_id, qty)
    values (p_sku, v_po.warehouse_id, v_delta)
    on conflict (sku, warehouse_id) do update
      set qty = stock_balances.qty + v_delta,
          updated_at = now();

    insert into stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    values
      (p_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, 'logistics', auth.uid());
  end if;

  -- All lines fully received? Flip PO status.
  select count(*) into v_outstanding
    from purchase_order_lines
   where po_id = p_po_id and received_qty < qty;

  if v_outstanding = 0 then
    update purchase_orders
       set status = 'received', updated_at = now()
     where id = p_po_id;
    v_new_status := 'received';
  else
    v_new_status := v_po.status;
  end if;

  -- Auto-promote any awaiting_stock orders that have this SKU and now have
  -- their shortages cleared. Lock each order row before evaluating.
  for v_target_order in
    select o.id, o.dl, o.dealer_id, o.warehouse_id
      from orders o
     where o.status = 'proceed_order'
       and o.logistics_stage = 'awaiting_stock'
       and o.warehouse_id = v_po.warehouse_id
       and exists (
         select 1 from order_lines ol
          where ol.order_id = o.id and ol.sku = p_sku
       )
     for update
  loop
    select count(*) into v_promote_shortages
      from public.logistics_calc_shortages(v_target_order.id, v_target_order.warehouse_id);

    if v_promote_shortages = 0 then
      -- Reserve all lines.
      for v_promo_line in
        select sku, qty from order_lines where order_id = v_target_order.id
      loop
        update stock_balances
           set reserved = reserved + v_promo_line.qty,
               updated_at = now()
         where sku = v_promo_line.sku
           and warehouse_id = v_target_order.warehouse_id;
      end loop;

      update orders
         set logistics_stage = 'ready_to_dispatch',
             updated_at      = now()
       where id = v_target_order.id;

      select name into v_warehouse_name
        from warehouses where id = v_target_order.warehouse_id;

      insert into order_history (order_id, text, by_role)
      values (
        v_target_order.id,
        format('Stock confirmed at %s · ready to dispatch (auto)',
               coalesce(v_warehouse_name, 'warehouse')),
        'logistics'
      );

      insert into audit_log (role, actor_text, action, dealer_id, ref)
      values ('logistics', v_actor,
              format('Auto-promoted DL-%s · ready to dispatch', v_target_order.dl),
              v_target_order.dealer_id, 'DL-' || v_target_order.dl::text);

      v_orders_promoted := v_orders_promoted || jsonb_build_object(
        'id', v_target_order.id,
        'dl', v_target_order.dl
      );
    end if;
  end loop;

  -- Resolve dealer_id via the linked order (if any). May be null for stock
  -- replenishment POs that aren't tied to a specific dealer order.
  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Received %s units of %s on %s', v_delta, p_sku, p_po_id),
          (select o.dealer_id from orders o where o.dl = v_po.dl limit 1),
          p_po_id);

  -- Note: dealer_id may be null for stock-replenishment POs; we store the
  -- PO id in `ref` either way.
  return jsonb_build_object(
    'po_id',           p_po_id,
    'sku',             p_sku,
    'received_qty',    p_received_qty,
    'delta',           v_delta,
    'po_status',       v_new_status,
    'orders_promoted', v_orders_promoted
  );
end;
$$;

revoke all on function public.logistics_receive_po_line(text, text, int) from public;
grant execute on function public.logistics_receive_po_line(text, text, int) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_assign_partner(p_order_id uuid, p_partner_id uuid) -> jsonb
-- §17.2 D1.dispatch step 1: assign delivery partner. Order moves
-- ready_to_dispatch -> dispatched. No stock change (already reserved).
-- ----------------------------------------------------------------------------
create or replace function public.logistics_assign_partner(
  p_order_id   uuid,
  p_partner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order       orders;
  v_partner     delivery_partners;
  v_actor       text;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.logistics_stage is distinct from 'ready_to_dispatch'
     or v_order.status <> 'proceed_order' then
    raise exception 'order is not ready to dispatch'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  select * into v_partner from delivery_partners where id = p_partner_id;
  if not found then
    raise exception 'delivery partner not found'
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update orders
     set delivery_partner_id = p_partner_id,
         logistics_stage     = 'dispatched',
         dispatched_at       = now(),
         updated_at          = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('Dispatched via %s', v_partner.name),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Assigned partner · DL-%s · %s', v_order.dl, v_partner.name),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'id',                  v_order.id,
    'dl',                  v_order.dl,
    'logistics_stage',     'dispatched',
    'delivery_partner_id', p_partner_id,
    'dispatched_at',       now()
  );
end;
$$;

revoke all on function public.logistics_assign_partner(uuid, uuid) from public;
grant execute on function public.logistics_assign_partner(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_attach_do_and_deliver(p_order_id, p_do_number, p_do_note, p_signed)
--   -> jsonb
-- §17.2 D1.dispatch step 2: attach Delivery Order + mark delivered. Verifies
-- DO is signed by customer (P0001 do_required if not). For each order_line:
-- decrement stock_balances.qty AND reserved by qty (in same UPDATE, §4
-- delivered transition). Insert stock_movements (kind='out', ref='DL-XXX').
-- ----------------------------------------------------------------------------
create or replace function public.logistics_attach_do_and_deliver(
  p_order_id  uuid,
  p_do_number text,
  p_do_note   text,
  p_signed    boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order   orders;
  v_actor   text;
  v_line    record;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_signed is null or p_signed = false then
    raise exception 'customer must sign DO'
      using errcode = 'P0001', detail = 'do_required';
  end if;

  if p_do_number is null or length(btrim(p_do_number)) < 3 then
    raise exception 'DO number must be at least 3 characters'
      using errcode = 'P0001', detail = 'do_required';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.logistics_stage is distinct from 'dispatched'
     or v_order.status <> 'proceed_order' then
    raise exception 'order is not in dispatched state'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update orders
     set status          = 'delivered',
         logistics_stage = 'delivered',
         do_number       = btrim(p_do_number),
         do_note         = nullif(btrim(coalesce(p_do_note, '')), ''),
         delivered_at    = now(),
         updated_at      = now()
   where id = p_order_id;

  -- Deduct stock + release reservation in same UPDATE per §4 delivered rule.
  for v_line in
    select sku, qty from order_lines where order_id = p_order_id
  loop
    update stock_balances
       set qty        = qty - v_line.qty,
           reserved   = reserved - v_line.qty,
           updated_at = now()
     where sku = v_line.sku
       and warehouse_id = v_order.warehouse_id;

    insert into stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    values
      (v_line.sku, v_order.warehouse_id, -v_line.qty, 'out',
       'DL-' || v_order.dl::text, 'logistics', auth.uid());
  end loop;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('Delivered · DO %s', btrim(p_do_number)),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Delivered DL-%s · DO %s', v_order.dl, btrim(p_do_number)),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'status',          'delivered',
    'logistics_stage', 'delivered',
    'do_number',       btrim(p_do_number),
    'delivered_at',    now()
  );
end;
$$;

revoke all on function public.logistics_attach_do_and_deliver(uuid, text, text, boolean) from public;
grant execute on function public.logistics_attach_do_and_deliver(uuid, text, text, boolean) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_adjust_stock(p_sku, p_warehouse_id, p_delta, p_reason) -> jsonb
-- Manual stock adjust. p_delta is signed: positive for inbound corrections,
-- negative for shrinkage. CHECK constraints from 0018 catch negative qty
-- (qty >= 0 implicit via reserved invariant) and qty < reserved; we rethrow
-- those as friendlier P0001 codes.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_adjust_stock(
  p_sku          text,
  p_warehouse_id uuid,
  p_delta        int,
  p_reason       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   text;
  v_qty_after int;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'delta must be non-zero'
      using errcode = '22023', detail = 'invalid_delta';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- Two-step so we can detect "would go negative" separately from
  -- "would go below reserved". 0018 only adds the qty >= reserved check;
  -- there is no qty >= 0 constraint, so a true negative would still pass
  -- DB-side. Guard explicitly here for the friendlier P0001 code.
  if p_delta < 0 then
    if (coalesce((select qty from stock_balances
                   where sku = p_sku and warehouse_id = p_warehouse_id), 0) + p_delta) < 0 then
      raise exception 'stock would go negative'
        using errcode = 'P0001', detail = 'negative_stock';
    end if;
  end if;

  begin
    insert into stock_balances (sku, warehouse_id, qty)
    values (p_sku, p_warehouse_id, greatest(p_delta, 0))
    on conflict (sku, warehouse_id) do update
      set qty = stock_balances.qty + p_delta,
          updated_at = now()
    returning qty into v_qty_after;
  exception
    when check_violation then
      -- Only the qty>=reserved CHECK from 0018 can trip here (we don't touch
      -- reserved). Rethrow as the friendlier domain code.
      raise exception 'stock would fall below reserved units'
        using errcode = 'P0001', detail = 'below_reserved';
  end;

  insert into stock_movements
    (sku, warehouse_id, qty, kind, note, by_role, by_user_id)
  values
    (p_sku, p_warehouse_id, p_delta, 'adjust', p_reason, 'logistics', auth.uid());

  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Adjusted stock · %s %s%s · %s',
                 p_sku,
                 case when p_delta > 0 then '+' else '' end,
                 p_delta,
                 p_reason),
          p_sku);

  return jsonb_build_object(
    'sku',          p_sku,
    'warehouse_id', p_warehouse_id,
    'delta',        p_delta,
    'qty_after',    v_qty_after,
    'reason',       p_reason
  );
end;
$$;

revoke all on function public.logistics_adjust_stock(text, uuid, int, text) from public;
grant execute on function public.logistics_adjust_stock(text, uuid, int, text) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_warehouse_pick(p_order_id uuid, p_warehouse_id uuid) -> jsonb
-- Manual override of auto-picked warehouse. Only allowed when stage =
-- awaiting_stock AND no open POs touching this DL. Recalcs shortages on the
-- new warehouse — if zero, auto-promote to ready_to_dispatch + reserve.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_warehouse_pick(
  p_order_id     uuid,
  p_warehouse_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order          orders;
  v_warehouse_name text;
  v_actor          text;
  v_shortage_count int;
  v_line           record;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.logistics_stage is distinct from 'awaiting_stock'
     or v_order.status <> 'proceed_order' then
    raise exception 'order is not in awaiting_stock state'
      using errcode = '22023', detail = 'wrong_stage';
  end if;

  if exists (
    select 1 from purchase_orders
     where (dl = v_order.dl or v_order.dl = ANY(coalesce(dl_refs, array[]::int[])))
       and status = 'open'
  ) then
    raise exception 'cannot change warehouse while open POs exist'
      using errcode = 'P0001', detail = 'has_open_pos';
  end if;

  if not exists (select 1 from warehouses where id = p_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = '42P01', detail = 'warehouse_not_found';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update orders
     set warehouse_id = p_warehouse_id,
         updated_at   = now()
   where id = p_order_id;

  select count(*) into v_shortage_count
    from public.logistics_calc_shortages(p_order_id, p_warehouse_id);

  select name into v_warehouse_name from warehouses where id = p_warehouse_id;

  if v_shortage_count = 0 then
    for v_line in
      select sku, qty from order_lines where order_id = p_order_id
    loop
      update stock_balances
         set reserved = reserved + v_line.qty,
             updated_at = now()
       where sku = v_line.sku
         and warehouse_id = p_warehouse_id;
    end loop;

    update orders
       set logistics_stage = 'ready_to_dispatch',
           updated_at      = now()
     where id = p_order_id;

    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Warehouse changed to %s · ready to dispatch (auto)',
             coalesce(v_warehouse_name, 'warehouse')),
      'logistics'
    );
  else
    insert into order_history (order_id, text, by_role)
    values (
      p_order_id,
      format('Warehouse changed to %s · awaiting stock for %s SKUs',
             coalesce(v_warehouse_name, 'warehouse'),
             v_shortage_count),
      'logistics'
    );
  end if;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Warehouse pick · DL-%s · %s', v_order.dl,
                 coalesce(v_warehouse_name, 'warehouse')),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'warehouse_id',    p_warehouse_id,
    'logistics_stage', (select logistics_stage from orders where id = p_order_id),
    'shortages',       v_shortage_count
  );
end;
$$;

revoke all on function public.logistics_warehouse_pick(uuid, uuid) from public;
grant execute on function public.logistics_warehouse_pick(uuid, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_create_po(p_supplier_id, p_warehouse_id, p_lines jsonb,
--                     p_dl int default null, p_dl_refs int[] default null)
--   -> jsonb
-- Manual PO create. Either p_dl is set (single-order PO, e.g. sofa) or
-- p_dl_refs is set (combined PO across multiple source orders). Per A7.
-- p_lines: jsonb array of {sku, qty}.
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
  v_actor       text;
  v_max_seq     int;
  v_po_id       text;
  v_line_count  int;
  v_line        jsonb;
  v_sku         text;
  v_qty         int;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
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
    (id, dl, dl_refs, supplier_id, warehouse_id, status, sup_status, placed_at)
  values
    (v_po_id, p_dl, p_dl_refs, p_supplier_id, p_warehouse_id,
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
          format('Created PO %s · %s lines', v_po_id, v_line_count),
          v_po_id);

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
-- logistics_abandon_order(p_order_id, p_reason) -> jsonb
-- §17.4 A6: post-Proceed cancellation. Releases reserved stock (if any) and
-- flips status='cancelled', logistics_stage='cancelled'. Does NOT issue a
-- refund (Phase 5 Finance scope).
-- Requires p_reason. Only valid while order is in 'proceed_order' status.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_abandon_order(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders;
  v_actor text;
  v_line  record;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason required'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found'
      using errcode = '42P01', detail = 'order_not_found';
  end if;

  if v_order.status <> 'proceed_order' then
    raise exception 'order is not in proceed_order state'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  -- Release any reservation only when the order had stock reserved (i.e. it
  -- was past awaiting_stock). Sub-cases:
  --   ready_to_dispatch / dispatched: stock reserved -> release.
  --   awaiting_stock / null:           no reservation existed.
  if v_order.logistics_stage in ('ready_to_dispatch', 'dispatched')
     and v_order.warehouse_id is not null then
    for v_line in
      select sku, qty from order_lines where order_id = p_order_id
    loop
      update stock_balances
         set reserved = reserved - v_line.qty,
             updated_at = now()
       where sku = v_line.sku
         and warehouse_id = v_order.warehouse_id;
    end loop;
  end if;

  -- See top-of-file note: logistics_stage enum lacks 'cancelled', so we
  -- clear it to NULL. orders.status='cancelled' is the source of truth.
  update orders
     set status          = 'cancelled',
         logistics_stage = null,
         updated_at      = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role)
  values (
    p_order_id,
    format('Order abandoned · %s', p_reason),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('logistics', v_actor,
          format('Abandoned DL-%s · %s', v_order.dl, p_reason),
          v_order.dealer_id, 'DL-' || v_order.dl::text);

  return jsonb_build_object(
    'id',              v_order.id,
    'dl',              v_order.dl,
    'status',          'cancelled',
    'logistics_stage', null,
    'reason',          p_reason
  );
end;
$$;

revoke all on function public.logistics_abandon_order(uuid, text) from public;
grant execute on function public.logistics_abandon_order(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_assign_pickup_partner(p_po_id, p_partner_id) -> jsonb
-- §18 F1.A: factory_pickup supplier flow. PO must be in
-- sup_status=ready_for_pickup. Sets delivery_partner_id + sup_status='pickup_assigned'.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_assign_pickup_partner(
  p_po_id      text,
  p_partner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po      purchase_orders;
  v_partner delivery_partners;
  v_actor   text;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.sup_status <> 'ready_for_pickup' then
    raise exception 'PO is not ready for pickup'
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  select * into v_partner from delivery_partners where id = p_partner_id;
  if not found then
    raise exception 'delivery partner not found'
      using errcode = 'P0001', detail = 'partner_not_found';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_orders
     set delivery_partner_id = p_partner_id,
         sup_status          = 'pickup_assigned',
         updated_at          = now()
   where id = p_po_id;

  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    format('Pickup partner assigned · %s', v_partner.name),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Assigned pickup partner · %s · %s', p_po_id, v_partner.name),
          p_po_id);

  return jsonb_build_object(
    'id',                  p_po_id,
    'delivery_partner_id', p_partner_id,
    'sup_status',          'pickup_assigned'
  );
end;
$$;

revoke all on function public.logistics_assign_pickup_partner(text, uuid) from public;
grant execute on function public.logistics_assign_pickup_partner(text, uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- logistics_reassign_po_warehouse(p_po_id, p_new_warehouse_id) -> jsonb
-- §18 F1.A: post-customer-rejection reassign. PO must be in
-- sup_status=reassign_needed. Sets warehouse_id + sup_status='ready_for_pickup'.
-- New warehouse must differ from current.
--
-- Note (per spec §18.4 + §18.11): in Phase 4 MVP no PO can actually reach the
-- reassign_needed state because that requires partner customer-rejection
-- reporting (Phase 7). The RPC + UI are still implemented to lock the state
-- machine in place. Dead-path until Phase 7.
-- ----------------------------------------------------------------------------
create or replace function public.logistics_reassign_po_warehouse(
  p_po_id            text,
  p_new_warehouse_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_po              purchase_orders;
  v_actor           text;
  v_warehouse_name  text;
begin
  if not public.is_logistics() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.sup_status <> 'reassign_needed' then
    raise exception 'PO is not awaiting reassignment'
      using errcode = '22023', detail = 'wrong_sup_status';
  end if;

  if not exists (select 1 from warehouses where id = p_new_warehouse_id) then
    raise exception 'warehouse not found'
      using errcode = 'P0001', detail = 'warehouse_not_found';
  end if;

  if v_po.warehouse_id = p_new_warehouse_id then
    raise exception 'new warehouse must differ from current'
      using errcode = 'P0001', detail = 'same_warehouse';
  end if;

  v_actor := coalesce((select name from app_users where id = auth.uid()), 'Logistics');

  update purchase_orders
     set warehouse_id = p_new_warehouse_id,
         sup_status   = 'ready_for_pickup',
         updated_at   = now()
   where id = p_po_id;

  select name into v_warehouse_name from warehouses where id = p_new_warehouse_id;

  insert into po_history (po_id, text, by_role)
  values (
    p_po_id,
    format('Warehouse reassigned to %s · ready for pickup',
           coalesce(v_warehouse_name, 'warehouse')),
    'logistics'
  );

  insert into audit_log (role, actor_text, action, ref)
  values ('logistics', v_actor,
          format('Reassigned PO %s warehouse · %s', p_po_id,
                 coalesce(v_warehouse_name, 'warehouse')),
          p_po_id);

  return jsonb_build_object(
    'id',           p_po_id,
    'warehouse_id', p_new_warehouse_id,
    'sup_status',   'ready_for_pickup'
  );
end;
$$;

revoke all on function public.logistics_reassign_po_warehouse(text, uuid) from public;
grant execute on function public.logistics_reassign_po_warehouse(text, uuid) to authenticated;
