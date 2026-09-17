-- 0519 — overdue scans and effective_from defaults use today in Kuala Lumpur.
--
-- current_date is the database clock's day, and Supabase's clock is UTC.
-- Kuala Lumpur is eight hours ahead, so between 00:00 and 08:00 KL the
-- database still thinks it is yesterday. Three live functions and five
-- column defaults compared with that clock; every dated door since 0379
-- uses (timezone('Asia/Kuala_Lumpur', now()))::date. 0524 fixes the two Settings → Payment doors; this is the rest
-- that migration's review found.
--
-- 1. operation_dashboard_summary (0125): "today's deliveries" and "overdue
--    orders" on the Operation dashboard, opened at any hour. Before 08:00 KL
--    the dashboard showed yesterday's deliveries as today's and did not
--    count an order due yesterday as overdue.
-- 2. ops_tasks_rollover_overdue (0198): the follow-up rollover, cron 01:00
--    UTC = 09:00 KL, so correct as scheduled; a manual run after 00:00 KL
--    was not. Its weekend test read the weekday in UTC too.
-- 3. supplier_claim_sweep_overdue (0291): the ETA sweep, same cron, same
--    story.
-- 4. effective_from defaults on sofa_combo_pricing (0179),
--    catalog_config_history (0201), staff_commission_rates (0245),
--    bd_commission_rates (0250) and rental_agreement_templates (0267):
--    a row inserted before 08:00 KL without a date was dated yesterday.
--    Same day 0314 already defaults to (spelled at time zone there). Existing rows are not touched.
--
-- Each function is its latest body replayed with only the date comparisons
-- changed; create or replace keeps the grants 0482 set. Nothing else
-- changes: same sentences, columns, order and attributes.

-- 1. Operation dashboard (0125:53-165)
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
          and operation_stage in ('awaiting_operation_action','ready_to_dispatch','dispatched')
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

-- 2. Follow-up rollover (0198:55-80, 114-115)
create or replace function public.ops_tasks_rollover_overdue()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with rolled as (
    update ops_tasks t
      set due_at = (
            case extract(dow from timezone('Asia/Kuala_Lumpur', t.due_at + interval '1 day'))  -- 0519: KL weekday
              when 6 then t.due_at + interval '3 day'   -- Sat -> Mon
              when 0 then t.due_at + interval '2 day'   -- Sun -> Mon
              else t.due_at + interval '1 day'
            end
          ),
          rollover_count = t.rollover_count + 1,
          rolled_over_at = now(),
          priority = case when t.rollover_count + 1 >= 2 then 'urgent' else t.priority end,
          updated_at = now()
    where t.status = 'claimed'
      and t.due_at is not null
      and now() > t.due_at
      and (t.rolled_over_at is null
           or (timezone('Asia/Kuala_Lumpur', t.rolled_over_at))::date < (timezone('Asia/Kuala_Lumpur', now()))::date)  -- 0519: KL days
    returning 1
  )
  select count(*) into v_count from rolled;
  return v_count;
end; $$;
revoke all on function public.ops_tasks_rollover_overdue() from public;
revoke all on function public.ops_tasks_rollover_overdue() from authenticated, anon;

-- 3. Supplier claim ETA sweep (0291:474-526)
create or replace function public.supplier_claim_sweep_overdue()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row     record;
  v_created int := 0;
begin
  for v_row in
    select pol.id as line_id,
           pol.sku as sku,
           pol.qty - pol.received_qty as pending,
           po.id as po_id,
           po.supplier_id as supplier_id,
           po.eta_date as eta_date
      from purchase_order_lines pol
      join purchase_orders po on po.id = pol.po_id
     where po.status = 'open'
       and po.eta_date is not null
       and po.eta_date < (timezone('Asia/Kuala_Lumpur', now()))::date  -- 0519: KL today
       and pol.qty > pol.received_qty
       and not exists (
         select 1 from supplier_claims sc
          where sc.po_line_id = pol.id
            and sc.claim_type = 'late_delivery'
            and sc.status = 'open'
       )
     order by po.eta_date
  loop
    insert into supplier_claims (
      po_id, po_line_id, supplier_id, sku, product_category,
      claim_type, qty, note, requested_action, requested_at
    ) values (
      v_row.po_id, v_row.line_id, v_row.supplier_id, v_row.sku,
      public.claim_product_category(v_row.sku),
      'late_delivery', v_row.pending,
      format('Promised %s — still pending delivery.', to_char(v_row.eta_date, 'DD Mon YY')),
      -- The only thing there is to ask a late supplier. Nobody picks it.
      'deliver_remaining', now()
    );
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('claims_created', v_created);
end;
$fn$;

revoke execute on function public.supplier_claim_sweep_overdue() from public;
revoke execute on function public.supplier_claim_sweep_overdue() from anon;
revoke execute on function public.supplier_claim_sweep_overdue() from authenticated;
grant execute on function public.supplier_claim_sweep_overdue() to service_role;

-- 4. Column defaults
alter table public.sofa_combo_pricing        alter column effective_from set default (timezone('Asia/Kuala_Lumpur', now()))::date;
alter table public.catalog_config_history    alter column effective_from set default (timezone('Asia/Kuala_Lumpur', now()))::date;
alter table public.staff_commission_rates    alter column effective_from set default (timezone('Asia/Kuala_Lumpur', now()))::date;
alter table public.bd_commission_rates       alter column effective_from set default (timezone('Asia/Kuala_Lumpur', now()))::date;
alter table public.rental_agreement_templates alter column effective_from set default (timezone('Asia/Kuala_Lumpur', now()))::date;
