-- 0125_fix_alias_dl_after_0123_rename.sql
-- 2026-05-18 (Loo "fix this" — operation dashboard 500 "column p.dl does not exist")
--
-- ROOT CAUSE
--   Migration 0123 (dl → so) snapshot+recreate pipeline only replaced these
--   alias-style column references in function bodies:
--     v_order.dl, orders.dl, ord.dl, o.dl
--   It did NOT replace bare `<other-alias>.dl`, so 3 live functions kept
--   leftover references to a column that no longer exists:
--     1. operation_dashboard_summary   — `p.dl`                (×1)
--     2. finance_ar_aging              — `ot.dl`               (×2)
--     3. operation_receive_po_line     — `v_target_order.dl`   (×3)
--
--   Calling any of these raises:
--     ERROR: column <alias>.dl does not exist
--
--   User-visible: /operation dashboard 500s with "Couldn't load dashboard".
--   Finance AR aging + the receive-PO auto-promote path are also broken but
--   had not been exercised yet on prod.
--
-- FIX
--   Each of the 3 functions is recreated verbatim with bare `<alias>.dl`
--   rewritten to `<alias>.so`. No behavioral change — the underlying column
--   was already renamed by 0123. This is purely closing a missed text
--   substitution.
--
--   Output JSON contracts preserved exactly as 0123 left them:
--     * operation_dashboard_summary.open_pos[] — SELECT-derived key
--       `dl` was already broken (function raised), so the post-fix key `so`
--       matches the frontend type `operationOpenPoRow { so: number | null }`
--       (apps/web/src/lib/queries.ts:1214) and OpenPOsCard.tsx:67 reads
--       `po.so`. No frontend changes needed.
--     * finance_ar_aging rows_cte[] — same logic; broken before, key `so`
--       after, matches the rest of the FE.
--     * operation_receive_po_line.orders_promoted[] — JSON key was a hardcoded
--       'dl' string literal inside jsonb_build_object. Preserved as-is
--       (key 'dl' with value pulled from v_target_order.so); no live frontend
--       reads this field.
--
--   Audit_log / order_history text literals containing "DL-" are preserved
--   exactly as 0123 left them (mirrors the `phase-10-frozen-migration-vocab-
--   drift` carry-forward — historical record stance).
--
-- NOTE on why 0123 isn't amended: CLAUDE.md §14 #6 forbids editing committed
-- migration history. A future replay against a fresh DB would re-apply 0123
-- (still buggy on text replacement) and immediately apply 0125 on top
-- (closing the gap). End state identical.


-- =============================================================================
-- 1) operation_dashboard_summary — `p.dl` → `p.so`
-- =============================================================================
CREATE OR REPLACE FUNCTION public.operation_dashboard_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_kpis         jsonb;
  v_pipeline     jsonb;
  v_open_pos     jsonb;
  v_low_stock    jsonb;
  v_audit_recent jsonb;
  v_alerts       jsonb;
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'today_deliveries',
      (select count(*) from orders
        where status = 'proceed_order'
          and operation_stage in ('ready_to_dispatch','dispatched')
          and delivery_date = current_date),
    'open_pos',
      (select count(*) from purchase_orders where status = 'open'),
    'overdue_orders',
      (select count(*) from orders
        where status = 'proceed_order'
          and operation_stage in ('awaiting_operation_action','ready_to_dispatch','dispatched')
          and delivery_date < current_date),
    'active_orders',
      (select count(*) from orders
        where status = 'proceed_order'
          and operation_stage <> 'delivered'),
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
               and o.operation_stage <> 'delivered'
          ) t
      ), 0)
  )
  into v_kpis;

  select jsonb_build_object(
    'awaiting_operation_action',
      (select count(*) from orders
        where status = 'proceed_order' and operation_stage = 'awaiting_operation_action'),
    'ready_to_dispatch',
      (select count(*) from orders
        where status = 'proceed_order' and operation_stage = 'ready_to_dispatch'),
    'dispatched',
      (select count(*) from orders
        where status = 'proceed_order' and operation_stage = 'dispatched')
  )
  into v_pipeline;

  select coalesce(jsonb_agg(row_to_json(t) order by t.placed_at desc), '[]'::jsonb)
    into v_open_pos
    from (
      select p.id, p.supplier_id, p.warehouse_id, p.status, p.sup_status,
             p.eta_date, p.placed_at, p.so, p.so_refs
        from purchase_orders p
       where p.status = 'open'
       order by p.placed_at desc
       limit 4
    ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_low_stock
    from (
      select sb.sku, sb.warehouse_id, sb.qty, sb.reserved,
             (sb.qty - sb.reserved) as available
        from stock_balances sb
       where (sb.qty - sb.reserved) <= 1
       order by (sb.qty - sb.reserved) asc, sb.sku
       limit 5
    ) t;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_audit_recent
    from (
      select id, role, actor_text, action, dealer_id, ref, occurred_at
        from audit_log
       where role = 'operation'
       order by occurred_at desc
       limit 5
    ) t;

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
$function$;


-- =============================================================================
-- 2) finance_ar_aging — `ot.dl` → `ot.so` (×2)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.finance_ar_aging()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result jsonb;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with order_totals as (
    select
      o.id,
      o.so,
      o.dealer_id,
      o.customer_name,
      o.status,
      o.placed_at,
      o.paid,
      o.invoice_no,
      coalesce((select sum(ol.unit_price * ol.qty)
                from order_lines ol where ol.order_id = o.id), 0) +
      coalesce((select sum(oa.unit_price * oa.qty)
                from order_addons oa where oa.order_id = o.id), 0)
        as total
    from orders o
    where o.status <> 'cancelled'
  ),
  rows_cte as (
    select
      ot.id   as order_id,
      ot.so,
      ot.customer_name,
      ot.dealer_id,
      d.name  as dealer_name,
      ot.placed_at,
      greatest(0, (current_date - ot.placed_at::date))::int as days,
      case
        when (current_date - ot.placed_at::date) <= 30 then '0-30'
        when (current_date - ot.placed_at::date) <= 60 then '31-60'
        when (current_date - ot.placed_at::date) <= 90 then '61-90'
        else '90+'
      end as aging,
      ot.total,
      ot.paid,
      greatest(0, ot.total - ot.paid)::numeric(14,2) as outstanding,
      coalesce(ot.invoice_no,
               'INV-' || to_char(current_date, 'YYYY') || '-' ||
                 lpad(ot.so::text, 4, '0')) as invoice_no,
      ot.status
    from order_totals ot
    left join dealers d on d.id = ot.dealer_id
    where ot.total > 0
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.outstanding desc)
                      from rows_cte r), '[]'::jsonb),
    'buckets', jsonb_build_object(
      '0-30',  (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '0-30'  and outstanding > 0),
      '31-60', (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '31-60' and outstanding > 0),
      '61-90', (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '61-90' and outstanding > 0),
      '90+',   (select jsonb_build_object('amount', coalesce(sum(outstanding), 0),
                                           'count',  count(*))
                 from rows_cte where aging = '90+'   and outstanding > 0)
    )
  )
  into v_result;

  return v_result;
end;
$function$;


-- =============================================================================
-- 3) operation_receive_po_line — `v_target_order.dl` → `v_target_order.so` (×3)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.operation_receive_po_line(p_po_id text, p_sku text, p_received_qty integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po                  purchase_orders;
  v_line                purchase_order_lines;
  v_delta               int;
  v_actor               text;
  v_outstanding         int;
  v_new_status          po_status;
  v_target_order        record;
  v_promote_shortages   int;
  v_warehouse_name      text;
  v_orders_promoted     jsonb := '[]'::jsonb;
begin
  if not public.is_operation() then
    raise exception 'forbidden: logistics only' using errcode = '42501';
  end if;

  select * into v_po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'PO not found'
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  if v_po.status not in ('open','partial') then
    raise exception 'PO is closed (status=%)', v_po.status
      using errcode = '22023', detail = 'po_closed';
  end if;

  select * into v_line
    from purchase_order_lines
   where po_id = p_po_id and sku = p_sku
   for update;
  if not found then
    raise exception 'PO line not found'
      using errcode = '42P01', detail = 'po_line_not_found';
  end if;

  if p_received_qty < 0 then
    raise exception 'received_qty must be >= 0'
      using errcode = 'P0001', detail = 'invalid_received_qty';
  end if;

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

  perform 1 from stock_balances
   where sku = p_sku and warehouse_id = v_po.warehouse_id
   for update;

  if v_delta > 0 then
    insert into stock_balances (sku, warehouse_id, qty)
    values (p_sku, v_po.warehouse_id, v_delta)
    on conflict (sku, warehouse_id) do update
      set qty = stock_balances.qty + v_delta,
          updated_at = now();

    insert into stock_movements
      (sku, warehouse_id, qty, kind, ref, by_role, by_user_id)
    values
      (p_sku, v_po.warehouse_id, v_delta, 'in', p_po_id, 'operation', auth.uid());
  end if;

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

  for v_target_order in
    select o.id, o.so, o.dealer_id, o.warehouse_id
      from orders o
     where o.status = 'proceed_order'
       and o.operation_stage = 'awaiting_operation_action'
       and o.warehouse_id = v_po.warehouse_id
       and exists (
         select 1 from order_lines ol
          where ol.order_id = o.id and ol.sku = p_sku
       )
     for update
  loop
    select count(*) into v_promote_shortages
      from public.operation_calc_shortages(v_target_order.id, v_target_order.warehouse_id);

    if v_promote_shortages = 0 then
      perform public._operation_reserve_order(v_target_order.id);

      update orders
         set operation_stage = 'ready_to_dispatch',
             updated_at      = now()
       where id = v_target_order.id;

      select name into v_warehouse_name
        from warehouses where id = v_target_order.warehouse_id;

      insert into order_history (order_id, text, by_role)
      values (
        v_target_order.id,
        format('Stock confirmed at %s · ready to dispatch (auto)',
               coalesce(v_warehouse_name, 'warehouse')),
        'operation'
      );

      insert into audit_log (role, actor_text, action, dealer_id, ref)
      values ('operation', v_actor,
              format('Auto-promoted DL-%s · ready to dispatch', v_target_order.so),
              v_target_order.dealer_id, 'SO-' || v_target_order.so::text);

      v_orders_promoted := v_orders_promoted || jsonb_build_object(
        'id', v_target_order.id,
        'dl', v_target_order.so
      );
    end if;
  end loop;

  insert into audit_log (role, actor_text, action, dealer_id, ref)
  values ('operation', v_actor,
          format('Received %s units of %s on %s', v_delta, p_sku, p_po_id),
          (select o.dealer_id from orders o where o.so = v_po.so limit 1),
          p_po_id);

  return jsonb_build_object(
    'po_id',           p_po_id,
    'sku',             p_sku,
    'received_qty',    p_received_qty,
    'delta',           v_delta,
    'po_status',       v_new_status,
    'orders_promoted', v_orders_promoted
  );
end;
$function$;


-- =============================================================================
-- SANITY CHECK — assert zero live functions still reference `<alias>.dl`
-- =============================================================================
DO $sanity$
DECLARE leftover_count int;
BEGIN
  SELECT count(*) INTO leftover_count
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname NOT LIKE 'pg_%'
     AND pg_get_functiondef(oid) ~ '(?<![a-z_])[a-z_][a-z0-9_]{0,15}\.dl(?![a-z_])';

  IF leftover_count > 0 THEN
    RAISE EXCEPTION '0125 sanity check FAILED — % function(s) still contain <alias>.dl', leftover_count;
  END IF;
  RAISE NOTICE '0125 sanity check OK — no live function references <alias>.dl';
END
$sanity$;
