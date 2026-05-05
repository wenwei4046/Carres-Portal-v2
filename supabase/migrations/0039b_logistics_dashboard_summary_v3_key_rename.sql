-- =============================================================================
-- 0039b_logistics_dashboard_summary_v3_key_rename.sql
-- =============================================================================
-- Phase:      Phase 4.5a (v3 wake)
-- Sprint:     Phase 4.5a Task 5 — FE rename + JSON-key lockstep
-- Source:     docs/superpowers/specs/2026-05-05-phase-4.5a-v3-wake-design.md
-- Source:     docs/superpowers/plans/2026-05-05-phase-4.5a-v3-wake.md (T5)
--
-- Why this migration (and why a NEW file rather than editing 0038b):
--   Migration 0038b deliberately KEPT the JSON KEY 'awaiting_stock' inside the
--   `logistics_dashboard_summary` `pipeline` payload to keep FE consumers
--   (which read `data.pipeline.awaiting_stock`) functional during the soak
--   window between the RPC body sweep (0038/0038b) and the FE rename (T5).
--
--   T5 renames the FE consumer to `data.pipeline.awaiting_logistics_action`;
--   the DB-side JSON KEY MUST move in lockstep or the FE reads `undefined`
--   and the dashboard tile breaks. This migration is the DB half of that
--   lockstep swap.
--
--   CLAUDE.md §14 red line #6 forbids altering committed migration history.
--   Migration 0038b has been committed and applied to staging
--   (kfprgpjpaffedghytstl), so we ADD a new migration `0039b` rather than
--   editing the existing file. CREATE OR REPLACE is idempotent and the only
--   net effect on a re-run is the same body re-emitted.
--
-- What this migration changes:
--   logistics_dashboard_summary -- single CREATE OR REPLACE. The function
--   body is byte-for-byte from 0038b with ONE change:
--     * Line 648 of 0038b emits jsonb_build_object('awaiting_stock', ...).
--       This migration emits jsonb_build_object('awaiting_logistics_action', ...).
--     * The matching enum-literal READ in the count subquery
--       (logistics_stage = 'awaiting_logistics_action') is unchanged — that
--       was already the v3 vocab from 0038b.
--   Everything else (signature, role guard, KPI tile, ready_to_dispatch /
--   dispatched count subqueries, open_pos / low_stock side cards, audit_recent,
--   alerts, jsonb_build_object aggregation) is byte-for-byte from 0038b.
--
-- FE consumer contract (must move in lockstep with this migration):
--   * `apps/web/src/lib/queries.ts` LogisticsPipelineCounts.awaiting_stock
--     becomes LogisticsPipelineCounts.awaiting_logistics_action.
--   * `apps/web/src/pages/logistics/LogisticsDashboard.tsx`
--     `pipeline.awaiting_stock` becomes `pipeline.awaiting_logistics_action`
--     (both the Hero strap line at HeroProps consumer and the PipelineColumn
--     prop binding).
--   * `apps/api/src/routes/logistics/dashboard.test.ts` SUMMARY_PAYLOAD
--     fixture rename in lockstep.
--
-- Idempotency: CREATE OR REPLACE FUNCTION; no DROP / TRUNCATE / DELETE.
-- Re-runnable: subsequent migrations (0040 enum recreate) will further evolve
-- this signature; 0039b is the JSON-key-rename gap-closer for 0038b.
-- =============================================================================

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
  -- Body byte-for-byte from 0038b (already v3-vocab swept in T2-followup).
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
          and logistics_stage in ('awaiting_logistics_action','ready_to_dispatch','dispatched')
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
  -- T5 RENAME (Phase 4.5a): JSON KEY moved from 'awaiting_stock' to
  -- 'awaiting_logistics_action' to match the v3 vocabulary the FE now reads.
  -- The matching enum-literal READ comparison (logistics_stage =
  -- 'awaiting_logistics_action') was already v3-swept by 0038b.
  select jsonb_build_object(
    'awaiting_logistics_action',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'awaiting_logistics_action'),
    'ready_to_dispatch',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'ready_to_dispatch'),
    'dispatched',
      (select count(*) from orders
        where status = 'proceed_order' and logistics_stage = 'dispatched')
  )
  into v_pipeline;

  -- Top 4 open POs for the side card. Body byte-for-byte from 0038b.
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

  -- Top 5 low-stock SKUs (qty - reserved <= 1). Byte-for-byte from 0038b.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_low_stock
    from (
      select sb.sku, sb.warehouse_id, sb.qty, sb.reserved,
             (sb.qty - sb.reserved) as available
        from stock_balances sb
       where (sb.qty - sb.reserved) <= 1
       order by (sb.qty - sb.reserved) asc, sb.sku
       limit 5
    ) t;

  -- Recent logistics-related audit entries. Byte-for-byte from 0038b.
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_audit_recent
    from (
      select id, role, actor_text, action, dealer_id, ref, occurred_at
        from audit_log
       where role = 'logistics'
       order by occurred_at desc
       limit 5
    ) t;

  -- Alerts surface: out-of-stock SKUs. Byte-for-byte from 0038b.
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


-- =============================================================================
-- End of 0039b_logistics_dashboard_summary_v3_key_rename.sql
-- =============================================================================
-- Self-review checklist (Phase 4.5a T5):
--   [x] Migration file numbered 0039b (slot AFTER committed 0039, BEFORE 0040)
--   [x] No edits to committed migrations 0038/0038b/0039 (CLAUDE.md §14 #6)
--   [x] Header banner explains lockstep with FE rename in T5
--   [x] Single function CREATE OR REPLACE (logistics_dashboard_summary)
--   [x] JSON key 'awaiting_stock' renamed to 'awaiting_logistics_action'
--   [x] Body byte-for-byte from 0038b otherwise (no other behaviour change)
--   [x] FE consumer contract documented in header so future readers can
--       trace the lockstep dependency
--   [x] Idempotent: CREATE OR REPLACE FUNCTION; no DROP / TRUNCATE / DELETE
--   [x] Re-runnable: subsequent migrations (0040 enum recreate) further evolve
--       this signature; 0039b is the JSON-key-rename gap-closer for 0038b
--   [x] No quoted-literal 'awaiting_stock' anywhere in the function body of
--       this migration. The only surviving 'awaiting_stock' string in the
--       supabase/migrations/ tree is inside historical migrations (which are
--       frozen by §14 #6) and the test-allowlist scaffold in
--       apps/api/src/routes/logistics/pos-vocab-v3-sweep.test.ts (which T5
--       removes alongside this migration since the JSON-key allowlist is now
--       obsolete).
-- =============================================================================
