-- =============================================================================
-- 0586_the_operation_dashboard_reads_the_stages_that_exist.sql
-- Workspace MASTER §8 · production defect 2026-09-25.
--
-- WHAT WAS WRONG, MEASURED on production 2026-09-25
--   `GET /api/operation/dashboard` answered 500:
--   `invalid input value for enum operation_stage: "awaiting_operation_action"`.
--   0167 removed that stage (mapping it to `in_production`), but 0519 later
--   redefined `operation_dashboard_summary` from the older body, and plpgsql
--   does not check enum literals at creation — so the Dashboard broke the
--   first time anybody opened it after 0519.
--
-- WHAT THIS DOES
--   The same 0519 body with the stage that exists: overdue counts
--   `in_production` / `ready_to_dispatch` / `dispatched`; the pipeline key is
--   `in_production`, which is the key the Dashboard page already reads.
--   No grants change. NO ROW COUNT IS ASSERTED (CLAUDE.md §5.8).
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
          and delivery_date = (timezone('Asia/Kuala_Lumpur', now()))::date),  -- 0519: KL today
    'open_pos',
      (select count(*) from purchase_orders where status = 'open'),
    'overdue_orders',
      (select count(*) from orders
        where status = 'proceed_order'
          and operation_stage in ('in_production','ready_to_dispatch','dispatched')
          and delivery_date < (timezone('Asia/Kuala_Lumpur', now()))::date),  -- 0519: KL today
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
    'in_production',
      (select count(*) from orders
        where status = 'proceed_order' and operation_stage = 'in_production'),
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
