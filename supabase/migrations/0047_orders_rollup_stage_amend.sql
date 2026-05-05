-- =============================================================================
-- 0047_orders_rollup_stage_amend.sql — Phase 4.5 Chunk 1
-- =============================================================================
-- Source: Codex outside-voice review F2 (2026-05-05)
-- Sprint: 1 (schema)
--
-- Why: original 0036 rolls thread.logistics_stage='waiting' up to order
-- logistics_stage='dispatched'. That assumed waiting = post-relocate forward-
-- progress. Loo's NEW Sofa flow says waiting = at_warehouse_waiting = stock at
-- wh waiting for customer date = NOT yet dispatched.
--
-- Fix: drop 'waiting' from the dispatched-rollup set; keep it in the
-- ready_to_dispatch set so order surfaces correctly. PO-level
-- 'at_warehouse_waiting' filter (via 0043 enum value) is the queue surface.
--
-- Idempotent: CREATE OR REPLACE FUNCTION (matches 0036 pattern).
-- Trigger from 0036:188 references this function name; no trigger change needed
-- (CREATE OR REPLACE preserves trigger binding by function name).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.orders_rollup_stage(p_order_id uuid)
RETURNS logistics_stage
LANGUAGE sql STABLE AS $$
  WITH t AS (
    SELECT logistics_stage
      FROM order_supplier_threads
     WHERE order_id = p_order_id
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM t)
      THEN 'placed'::logistics_stage
    WHEN (SELECT bool_and(logistics_stage = 'delivered') FROM t)
      THEN 'delivered'::logistics_stage
    -- v3 amend (Codex F2): drop 'waiting' from the dispatched set.
    WHEN (SELECT bool_and(logistics_stage IN ('dispatched', 'delivered')) FROM t)
      THEN 'dispatched'::logistics_stage
    -- v3 amend: 'waiting' stays in this set — at_warehouse_waiting orders surface
    -- as ready_to_dispatch at order level, with PO-level filter for the queue.
    WHEN (SELECT bool_and(logistics_stage IN ('ready_to_dispatch', 'dispatched', 'delivered', 'waiting')) FROM t)
      THEN 'ready_to_dispatch'::logistics_stage
    ELSE 'awaiting_logistics_action'::logistics_stage
  END;
$$;

-- Permissions unchanged from 0036.
REVOKE ALL ON FUNCTION public.orders_rollup_stage(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.orders_rollup_stage(uuid) TO authenticated;
