-- =============================================================================
-- perf_seed.sql — synthetic 10K orders for Phase 1 RLS perf baseline
-- =============================================================================
-- Per CLAUDE.md §8, Phase 1 must hit:
--   - dealer 50 active orders: < 100ms
--   - principal dashboard summary: < 500ms
--   - logistics 4-column kanban: < 200ms
-- on a realistic dataset. This script seeds 10K orders distributed across all
-- 7 demo dealers with a mix of statuses and logistics stages.
--
-- IDEMPOTENT: deletes any prior PerfTest rows before re-seeding.
-- SAFE: only matches orders whose customer_name starts with 'PerfTest '.
-- =============================================================================

begin;

-- Clear prior perf-test orders (and their cascading children, if any).
delete from orders where customer_name like 'PerfTest %';

-- Bulk insert 10K orders across all dealers.
with dealer_seq as (
  select id, (row_number() over (order by id) - 1) as idx, count(*) over () as total
  from dealers
)
insert into orders (
  dealer_id, status, channel,
  customer_name, customer_phone, customer_address,
  customer_address_unknown, customer_billing_same,
  delivery_date_tbd, delivery_floor, delivery_has_lift,
  paid, terms_accepted,
  logistics_stage,
  placed_at
)
select
  d.id,
  -- 70% delivered, 22.5% active (place + proceed_order), 7.5% cancelled
  case
    when g % 40 < 28 then 'delivered'::order_status
    when g % 40 < 37 then (case when g % 2 = 0 then 'place' else 'proceed_order' end)::order_status
    else 'cancelled'::order_status
  end,
  'dealer',
  'PerfTest Customer ' || g,
  '+60' || lpad((100000000 + (g % 800000000))::text, 9, '0'),
  'Lot ' || g || ', Jalan Test, KL',
  false,
  true,
  false,
  (g % 5) + 1,
  (g % 2 = 0),
  (1000 + (g % 8000))::numeric,
  true,
  -- 4-stage rotation for the logistics kanban perf test
  case g % 4
    when 0 then 'awaiting_stock'::logistics_stage
    when 1 then 'ready_to_dispatch'::logistics_stage
    when 2 then 'dispatched'::logistics_stage
    else 'delivered'::logistics_stage
  end,
  now() - ((g * 7) || ' minutes')::interval
from generate_series(1, 10000) g
join dealer_seq d on d.idx = g % d.total;

-- Refresh planner stats for honest baseline numbers.
analyze orders;

commit;
