-- Phase 5 Chunk B — 4 RPCs powering FinanceRecon + FinanceReports.
-- Spec: docs/superpowers/specs/2026-05-08-phase-5-finance-spec.md §5.4 / §5.5 / §6.2
--
-- Locked decisions reflected here:
--   Q4=B — finance_recon_suggest_matches returns top-6 candidates by
--          abs(outstanding - amount) so the proto's MatchModal sorting is
--          server-side, not re-derived on every drawer open.
--   Q6=A pattern — single-RPC payloads where it makes the page simpler.
--                  cashflow / monthly_pl / top_skus all return jsonb shapes
--                  the page renders directly without further reshaping.
--
-- All 4 are STABLE security definer with the finance/principal app_role
-- gate matching 0062 + 0063. STABLE so the planner can cache per snapshot
-- (these are pure read-only over orders / payments / purchase_order_lines).
--
-- COGS derivation (V1 placeholder):
--   The strict approach is sum(purchase_order_lines.cost * received_qty)
--   matched to delivered orders via po.dl. But many POs in staging have
--   NULL cost (legacy pre-0055 rows), and the dl-to-po join is not yet
--   wired for batch revenue accrual. For V1 finance_monthly_pl approximates
--   COGS as 55% of revenue (mirrors proto's mock data and finance-data.jsx
--   line 79 formula `unitCost = price * 0.55`). Phase 6 supplier role
--   completes the cost capture; finance_monthly_pl will switch to real
--   PO joins then. Documented as carry-forward `phase-5-cogs-real-source`.
--
-- Opex (V1 placeholder):
--   No opex table exists yet (rent / payroll / ops). V1 returns a constant
--   RM 42,000/month from the RPC. Carry-forward `phase-5-opex-real-source`.

-- =============================================================================
-- 1. finance_recon_suggest_matches — top-6 candidates for a bank line
-- =============================================================================
-- Picks the closest open AR matches by absolute distance between the bank
-- amount and each order's outstanding. Proto's MatchModal is the consumer:
-- finance person picks one + clicks Confirm match → POST /reconciliations.
--
-- Returns:
--   {
--     "bank_statement": { id, statement_date, description, amount, reference },
--     "candidates": [
--       { dl, customer_name, dealer_name, total, paid, outstanding,
--         invoice_no, distance },  -- sorted by distance asc, top 6
--       ...
--     ]
--   }
--
-- distance = abs(outstanding - bank_statement.amount). When bank line is
-- outflow (amount < 0), the proto switches to PO matching but for V1 we
-- only suggest AR — outflow lines need the manual_ref escape hatch.
create or replace function public.finance_recon_suggest_matches(
  p_bank_statement_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bs       bank_statements;
  v_result   jsonb;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_bs from bank_statements where id = p_bank_statement_id;
  if not found then
    raise exception 'bank statement not found' using errcode = 'P0002';
  end if;

  with order_outstanding as (
    select
      o.id,
      o.dl,
      o.customer_name,
      o.dealer_id,
      o.invoice_no,
      o.paid,
      coalesce((select sum(ol.unit_price * ol.qty)
                from order_lines ol where ol.order_id = o.id), 0) +
      coalesce((select sum(oa.unit_price * oa.qty)
                from order_addons oa where oa.order_id = o.id), 0)
        as total
    from orders o
    where o.status <> 'cancelled'
  ),
  scored as (
    select
      oo.dl,
      oo.customer_name,
      d.name                                          as dealer_name,
      oo.total,
      oo.paid,
      greatest(0, oo.total - oo.paid)::numeric(14,2)  as outstanding,
      coalesce(oo.invoice_no,
               'INV-' || to_char(current_date, 'YYYY') || '-' ||
                 lpad(oo.dl::text, 4, '0'))           as invoice_no,
      abs(greatest(0, oo.total - oo.paid) - v_bs.amount) as distance
    from order_outstanding oo
    left join dealers d on d.id = oo.dealer_id
    where oo.total > oo.paid
  )
  select jsonb_build_object(
    'bank_statement', jsonb_build_object(
      'id',             v_bs.id,
      'statement_date', v_bs.statement_date,
      'description',    v_bs.description,
      'amount',         v_bs.amount,
      'reference',      v_bs.reference
    ),
    'candidates', coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.distance asc)
         from (select * from scored order by distance asc limit 6) s),
      '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.finance_recon_suggest_matches(uuid) from public;
grant execute on function public.finance_recon_suggest_matches(uuid) to authenticated;

-- =============================================================================
-- 2. finance_cashflow_series — per-week inflow/outflow over last N weeks
-- =============================================================================
-- Aggregates payments by paid_at into weekly buckets. The cashflow card on
-- FinanceDashboard already uses the 12-week roll-up from finance_dashboard_summary
-- (one number); this RPC returns the per-week series for the chart.
--
-- Returns:
--   {
--     "labels":  ["W18", "W19", ...],   -- ISO week labels, oldest first
--     "inflow":  [42000, 51200, ...],   -- positive numbers
--     "outflow": [-31200, -28100, ...]  -- negative numbers (proto convention)
--   }
--
-- p_weeks defaults to 12; clamped to [1, 52].
create or replace function public.finance_cashflow_series(
  p_weeks int default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_weeks  int;
  v_result jsonb;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_weeks := greatest(1, least(coalesce(p_weeks, 12), 52));

  with weeks_axis as (
    select
      generate_series(0, v_weeks - 1) as week_offset,
      date_trunc('week',
        current_date - (v_weeks - 1 - generate_series(0, v_weeks - 1)) * interval '7 days'
      )::date as week_start
  ),
  weeks_axis_labelled as (
    select
      week_offset,
      week_start,
      'W' || lpad(extract(week from week_start)::text, 2, '0') as label
    from weeks_axis
  ),
  bucketed as (
    select
      date_trunc('week', p.paid_at)::date as week_start,
      sum(case when p.direction = 'in'  then p.amount else 0 end) as inflow,
      sum(case when p.direction = 'out' then p.amount else 0 end) as outflow
    from payments p
    where p.paid_at >= (current_date - (v_weeks * 7) * interval '1 day')::date
    group by 1
  )
  select jsonb_build_object(
    'labels',  coalesce((select jsonb_agg(w.label    order by w.week_offset) from weeks_axis_labelled w), '[]'::jsonb),
    'inflow',  coalesce((select jsonb_agg(coalesce(b.inflow, 0)  order by w.week_offset)
                          from weeks_axis_labelled w
                          left join bucketed b on b.week_start = w.week_start), '[]'::jsonb),
    'outflow', coalesce((select jsonb_agg(coalesce(-b.outflow, 0) order by w.week_offset)
                          from weeks_axis_labelled w
                          left join bucketed b on b.week_start = w.week_start), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.finance_cashflow_series(int) from public;
grant execute on function public.finance_cashflow_series(int) to authenticated;

-- =============================================================================
-- 3. finance_monthly_pl — per-month revenue / cogs / opex / net
-- =============================================================================
-- Returns last N months of P&L. Revenue = sum of order totals for orders
-- with placed_at in the month, status <> 'cancelled'. COGS = 55% of revenue
-- (V1 placeholder; carry-forward `phase-5-cogs-real-source`). Opex = constant
-- RM 42,000/month (V1 placeholder; `phase-5-opex-real-source`). Net = revenue
-- - cogs - opex.
--
-- Returns:
--   {
--     "rows": [
--       { m: "Nov 25", revenue: 184500, cogs: 101475, opex: 42000, net: 41025 },
--       ...
--     ]
--   }
--
-- p_months defaults to 6; clamped to [1, 24].
create or replace function public.finance_monthly_pl(
  p_months int default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_months int;
  v_opex   numeric := 42000;  -- V1 placeholder; per spec §6.2 + carry-forward note
  v_cogs_pct numeric := 0.55; -- V1 placeholder mirroring proto finance-data.jsx:79
  v_result jsonb;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_months := greatest(1, least(coalesce(p_months, 6), 24));

  with months_axis as (
    select
      generate_series(0, v_months - 1) as month_offset,
      date_trunc('month',
        current_date - (v_months - 1 - generate_series(0, v_months - 1)) * interval '1 month'
      )::date as month_start
  ),
  order_totals as (
    select
      date_trunc('month', o.placed_at)::date as month_start,
      coalesce(sum(
        coalesce((select sum(ol.unit_price * ol.qty)
                  from order_lines ol where ol.order_id = o.id), 0) +
        coalesce((select sum(oa.unit_price * oa.qty)
                  from order_addons oa where oa.order_id = o.id), 0)
      ), 0)::numeric(14,2) as revenue
    from orders o
    where o.status <> 'cancelled'
      and o.placed_at >= date_trunc('month', current_date - (v_months - 1) * interval '1 month')
    group by 1
  ),
  rows_cte as (
    select
      m.month_start,
      to_char(m.month_start, 'Mon YY') as m,
      coalesce(ot.revenue, 0)::numeric(14,2) as revenue,
      (coalesce(ot.revenue, 0) * v_cogs_pct)::numeric(14,2) as cogs,
      v_opex                                  as opex,
      (coalesce(ot.revenue, 0)
         - (coalesce(ot.revenue, 0) * v_cogs_pct)
         - v_opex)::numeric(14,2) as net
    from months_axis m
    left join order_totals ot on ot.month_start = m.month_start
  )
  select jsonb_build_object(
    'rows',
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'm',       r.m,
         'revenue', r.revenue,
         'cogs',    r.cogs,
         'opex',    r.opex,
         'net',     r.net
       ) order by r.month_start asc)
       from rows_cte r),
      '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.finance_monthly_pl(int) from public;
grant execute on function public.finance_monthly_pl(int) to authenticated;

-- =============================================================================
-- 4. finance_top_skus — top N SKUs by revenue
-- =============================================================================
-- Aggregates order_lines by sku, joining product_skus + product_models for
-- display name. Sorted by revenue desc, limited to p_limit (default 8).
--
-- Returns:
--   {
--     "rows": [
--       { sku: "SKU-A", name: "Hoo OK Mattress · Queen", qty: 24, revenue: 35880 },
--       ...
--     ]
--   }
--
-- p_limit defaults to 8; clamped to [1, 50]. Excludes cancelled orders.
create or replace function public.finance_top_skus(
  p_limit int default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit  int;
  v_result jsonb;
begin
  if public.app_role() not in ('finance','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 8), 50));

  with sku_agg as (
    select
      ol.sku,
      coalesce(pm.name || ' · ' || ps.variant, ol.sku) as name,
      sum(ol.qty)::int                                  as qty,
      sum(ol.unit_price * ol.qty)::numeric(14,2)        as revenue
    from order_lines ol
    join orders o on o.id = ol.order_id
    left join product_skus    ps on ps.sku = ol.sku
    left join product_models  pm on pm.id  = ps.model_id
    where o.status <> 'cancelled'
    group by ol.sku, pm.name, ps.variant
    order by revenue desc
    limit v_limit
  )
  select jsonb_build_object(
    'rows',
    coalesce(
      (select jsonb_agg(to_jsonb(s) order by s.revenue desc) from sku_agg s),
      '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.finance_top_skus(int) from public;
grant execute on function public.finance_top_skus(int) to authenticated;
