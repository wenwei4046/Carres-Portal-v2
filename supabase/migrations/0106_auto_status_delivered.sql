-- =============================================================================
-- 0106_auto_status_delivered.sql (Loo 2026-05-15)
-- =============================================================================
-- Bug fix: dealer + salesperson + showroom "Delivered" tab was always empty
-- even after the partner uploaded POD and the order was fully delivered.
--
-- Root cause: orders.status (dealer lifecycle:
-- place/proceed_order/delivered/cancelled) and orders.logistics_stage (HQ
-- kanban: placed/awaiting_logistics_action/ready_to_dispatch/dispatched/
-- delivered) are two separate axes. The rollup trigger
-- orders_rollup_stage_after_thread_change (0036/0040/0047) correctly
-- propagates thread.logistics_stage='delivered' up to orders.logistics_stage=
-- 'delivered', but nothing was flipping the dealer-facing orders.status to
-- 'delivered'. Result: orders stuck at status='proceed_order' forever, never
-- surface in the dealer's "Delivered" tab.
--
-- Verified on staging 2026-05-15: DL-1003 + DL-1004 both have POD uploaded,
-- thread.logistics_stage='delivered', orders.logistics_stage='delivered',
-- but orders.status='proceed_order'.
--
-- Fix: BEFORE UPDATE trigger on orders, mirrors the 0098 pattern (auto-issue
-- on dispatched). Fires only on logistics_stage transition INTO 'delivered'
-- (OLD distinct from NEW). Only flips status if currently 'proceed_order' —
-- preserves 'cancelled' as terminal state.
--
-- Backfill: existing orders with logistics_stage='delivered' but status=
-- 'proceed_order' get their status flipped + history row written. Pulls
-- delivered_at from the latest thread.delivered_at where available.
--
-- Authorized in conversation 2026-05-15 per CLAUDE.md §7.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.orders_auto_status_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_uid uuid;
  v_actor_role app_role;
BEGIN
  -- Only fire on the transition INTO 'delivered'.
  IF NEW.logistics_stage IS NOT DISTINCT FROM OLD.logistics_stage THEN
    RETURN NEW;
  END IF;
  IF NEW.logistics_stage IS DISTINCT FROM 'delivered' THEN
    RETURN NEW;
  END IF;

  -- Only auto-flip from proceed_order. Preserves 'cancelled' as terminal
  -- and ignores already-'delivered' rows.
  IF NEW.status IS DISTINCT FROM 'proceed_order' THEN
    RETURN NEW;
  END IF;

  v_actor_uid := (SELECT auth.uid());
  BEGIN
    v_actor_role := public.app_role();
  EXCEPTION WHEN OTHERS THEN
    v_actor_role := NULL;
  END;

  NEW.status       := 'delivered';
  NEW.delivered_at := COALESCE(NEW.delivered_at, now());

  INSERT INTO order_history (order_id, text, by_role, by_user_id)
  VALUES (
    NEW.id,
    'Order auto-marked delivered (all threads delivered)',
    v_actor_role,
    v_actor_uid
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_auto_status_delivered_trg ON orders;
CREATE TRIGGER orders_auto_status_delivered_trg
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_auto_status_delivered();

-- ---------------------------------------------------------------------------
-- Backfill stuck rows.
--
-- The BEFORE trigger above only fires on a logistics_stage transition. The
-- backfill targets rows where the rollup already wrote
-- logistics_stage='delivered' (OLD = NEW), so the trigger won't fire. We
-- update status directly. Pulls delivered_at from the latest thread when
-- the orders row doesn't have one set.
-- ---------------------------------------------------------------------------
WITH backfilled AS (
  UPDATE orders o
     SET status       = 'delivered',
         delivered_at = COALESCE(o.delivered_at, (
           SELECT max(t.delivered_at)
             FROM order_supplier_threads t
            WHERE t.order_id = o.id
              AND t.delivered_at IS NOT NULL
         ), now()),
         updated_at   = now()
   WHERE o.logistics_stage = 'delivered'
     AND o.status          = 'proceed_order'
  RETURNING o.id
)
INSERT INTO order_history (order_id, text, by_role)
SELECT id,
       'Backfilled to status=delivered by migration 0106 (was stuck at proceed_order)',
       NULL
  FROM backfilled;
