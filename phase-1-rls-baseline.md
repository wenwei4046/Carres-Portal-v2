# Phase 1 — RLS Performance Baseline

> Required by `CARRES_PORTAL_V2_PLAN.md` §Phase 1 acceptance and `CLAUDE.md` §8.
> **Verdict: PASS — all 3 targets met with 14–53× headroom.**

---

## Setup

- **Project:** `kfprgpjpaffedghytstl` (Carres-Portal-v2, Postgres 17.6.1.111, ap-southeast-1)
- **Date:** 2026-05-02
- **Dataset:** 10,002 orders (10,000 synthetic + 2 demo) across 7 dealers
- **Distribution:** 70% delivered, 22.5% active, 7.5% cancelled; logistics_stage rotates evenly across the 4-column kanban
- **Seed script:** `supabase/perf_seed.sql` — re-runnable, deletes prior `PerfTest %` rows before insert, runs `analyze orders` at the end

JWT context simulated via:
```sql
set local role authenticated;
select set_config('request.jwt.claim.sub', '<user_uuid>', true);
select set_config('request.jwt.claims', '{"sub":"...","role":"authenticated","app_metadata":{"role":"...","dealer_id":"..."}}', true);
```

---

## Results

| # | Query | Target | Cold (1st run) | Warm (avg of 5) | Verdict |
|---|---|---|---|---|---|
| Q1 | Dealer 50 active orders | < 100 ms | **3.7 ms** | **1.5 ms** | ✅ 27–66× headroom |
| Q2 | Principal dashboard summary | < 500 ms | **9.4 ms** | **< 1 ms** | ✅ 53× headroom |
| Q3 | Logistics 4-column kanban | < 200 ms | **14.1 ms** | **3.8 ms** | ✅ 14–52× headroom |

---

## Q1 — Dealer 50 active orders

**Role:** dealer (`dealer_id = 00000000-…-d01`, ~1430 of the 10K orders are theirs, ~323 are active)

```sql
select id, dl, status, customer_name, paid, placed_at, logistics_stage
from orders
where status in ('place', 'proceed_order')
order by placed_at desc
limit 50;
```

**Plan (cold):** Top-N heapsort over a Seq Scan with RLS filter inlined. **3.747 ms execution, 0.715 ms planning.** All 3 RLS helper calls (`is_internal`, `app_dealer_id`, `app_partner_id`) ran exactly once via InitPlan, not per row. The Sort emitted 50 rows after rejecting 9,679 (filter ratio is healthy).

The Seq Scan is fine at 10K rows. At 100K+ orders we should add a partial index `(dealer_id, placed_at DESC) WHERE status IN ('place','proceed_order')` to keep this O(log N).

---

## Q2 — Principal dashboard summary

**Role:** principal (sees everything via `is_internal()` short-circuit in the RLS filter)

```sql
select
  count(*) filter (where status = 'place')          as orders_placed,
  count(*) filter (where status = 'proceed_order')  as orders_in_progress,
  count(*) filter (where status = 'delivered')      as orders_delivered,
  count(*) filter (where status = 'cancelled')      as orders_cancelled,
  coalesce(sum(paid) filter (where status = 'delivered'), 0)::numeric(14,2) as revenue_realized,
  coalesce(sum(paid) filter (where status in ('place','proceed_order')), 0)::numeric(14,2) as revenue_pipeline,
  count(distinct dealer_id) as active_dealers,
  count(*) filter (where logistics_stage = 'awaiting_stock')   as kanban_awaiting,
  count(*) filter (where logistics_stage = 'ready_to_dispatch') as kanban_ready,
  count(*) filter (where logistics_stage = 'dispatched')        as kanban_dispatched,
  count(*) filter (where logistics_stage = 'delivered')         as kanban_delivered
from orders;
```

**Plan (cold):** Index Scan on `orders_dealer_idx`, single Aggregate node, 10,002 rows scanned. **9.434 ms execution, 0.737 ms planning.** Because principal hits the `is_internal()` short-circuit, `app_dealer_id` and `app_partner_id` InitPlans were created but not executed (`Actual Loops: 0`).

The exact "principal dashboard summary" RPC isn't built yet (Phase 5+), but this aggregate represents what one would compute. When the real RPC ships, re-baseline against it.

---

## Q3 — Logistics 4-column kanban

**Role:** logistics (also `is_internal()`)

```sql
select logistics_stage, count(*),
       array_agg(id order by placed_at desc) filter (where rn <= 100) as visible_top_100
from (
  select id, logistics_stage, placed_at,
         row_number() over (partition by logistics_stage order by placed_at desc) as rn
  from orders
  where status not in ('cancelled') and logistics_stage is not null
) sub
group by logistics_stage;
```

**Plan (cold):** Seq Scan filtered to 9,251 rows → quicksort by `(logistics_stage, placed_at DESC)` → WindowAgg for `row_number` → sorted Aggregate by stage. **14.093 ms execution, 0.622 ms planning.** Memory-only sort (818 KB).

Same indexing note as Q1 — at 100K+ orders, a partial index over `(logistics_stage, placed_at DESC) WHERE status <> 'cancelled'` would make this an Index Scan.

---

## Why this performs well

Three CLAUDE.md §8 fixes are doing their job:

1. **InitPlan wrap (`(SELECT helper())`)** — every helper call shows up as `Subplan Name: "InitPlan N"` in the plans, with `Actual Loops: 1`. Without the wrap, each helper would re-run per row → 9,251× more work for Q3 alone.
2. **`STABLE` marker on helpers** — lets Postgres cache results within a query.
3. **`security definer` + JWT-aware helpers** — reading `auth.uid()` from `request.jwt.claim.sub` is O(1) per InitPlan. The current helpers still do a single app_users lookup per InitPlan to get role/entity_id (not pure JWT-claims read yet — that optimization is held for Phase 5+ if numbers degrade).

---

## What to watch as we scale

- **Re-run this baseline at the start of Phase 5** (when reporting/dashboards land) and **at end of Phase 8** (full feature set, real seed). If any query crosses 50% of its target, add the partial indexes flagged above before Go-live.
- **If `dashboard_summary()` RPC** (Phase 5) lands as one big function call, baseline it explicitly — RPCs can hide N+1s that ad-hoc SQL exposes.
- **Add `pg_stat_statements`** before Phase 9 deploy for production observability.

---

## Re-run

```sql
-- 1. (Re-)seed:
\i supabase/perf_seed.sql

-- 2. Per-query timing (set JWT context, then run query). See execute_sql calls
--    in the session log (commit f4e... or whichever).
```

The seed is idempotent — re-running it just refreshes the 10K PerfTest rows without touching real demo orders.
