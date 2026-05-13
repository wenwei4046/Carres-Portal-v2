-- =============================================================================
-- 0103_partner_confirm_receive_propagate_to_orders_header.sql (Loo 2026-05-13)
-- =============================================================================
-- Bug: HoOKkA sofa (SOFA_SPECIAL + own_logistics path) — Logistics pressing
-- "Attach DO & Mark Delivered" on dispatched orders crashed with
--   null value in column "warehouse_id" of relation "stock_movements"
--   violates not-null constraint
-- Reproduced on order #1005 (alvin) 2026-05-13.
--
-- Root cause: partner_confirm_receive (0096) wrote full thread state in the
-- wh-owner branch (warehouse_id, delivery_partner_id, partner_accepted_at,
-- confirm_delivery_date) but never propagated those values up to the orders
-- header. orders.warehouse_id + orders.delivery_partner_id stayed NULL all the
-- way through dispatch. logistics_attach_do_and_deliver (0087) reads
-- v_order.warehouse_id from the header and writes it into stock_movements +
-- stock_balances — when null, the stock_movements not-null constraint blows.
--
-- This is the same family of bug as #1004 (2026-05-11, fixed in 0086 for the
-- logistics_assign_partner / procurement-partner path). 0086 propagated
-- thread.warehouse_id → orders.warehouse_id for that path. Sofa direct-ship
-- never goes through logistics_assign_partner — partner_confirm_receive is the
-- step where the customer-leg LP + warehouse get decided, so propagation has
-- to happen there.
--
-- Fix:
--   1. partner_confirm_receive — in the wh-owner branch, after updating thread
--      state, also UPDATE orders header. Set warehouse_id + delivery_partner_id
--      from the v_po row, but only when the header value is currently NULL
--      (coalesce-style — don't clobber anything an earlier path may have set).
--      Procurement-partner branch keeps current behavior (logistics_assign_
--      partner / 0086 owns that path).
--
--   2. Backfill #1005 + #1006 — both already in
--      dispatched/delivered with header NULLs. #1005 hits the crash on every
--      Mark Delivered attempt; #1006 reached 'delivered' via a different code
--      path that didn't touch stock_movements (likely the legacy partner-side
--      delivery flow before stock deduction was added). Both need their header
--      populated for any downstream report / audit consistency.
--
-- Safety:
--   - No new columns. No new tables. No DROP / TRUNCATE. No RLS change.
--   - RPC signature unchanged (still partner_confirm_receive(text)).
--   - Reversible: re-apply 0096 to roll back the RPC.
--   - Backfill scoped to (header is null AND threads have it) so re-running is
--     idempotent.
-- Authorized in conversation 2026-05-13 per CLAUDE.md §7.
-- =============================================================================


-- 1. partner_confirm_receive — wh-owner branch now also propagates the
-- warehouse + delivery partner up to the orders header. Diff vs 0096 is the
-- single UPDATE on orders inside the IF v_owns_via_wh THEN block.
CREATE OR REPLACE FUNCTION public.partner_confirm_receive(p_po_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                purchase_orders;
  v_role              app_role;
  v_partner_id        uuid;
  v_actor             text;
  v_threads_advanced  int;
  v_owns_via_wh       boolean;
BEGIN
  v_role := public.app_role();
  v_partner_id := public.app_partner_id();

  IF v_role IS DISTINCT FROM 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'partner JWT missing partner_id'
      USING ERRCODE = '42501', DETAIL = 'partner_id_missing';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found'
      USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM warehouses w
    WHERE w.id = v_po.warehouse_id
      AND w.owning_partner_id = v_partner_id
  ) INTO v_owns_via_wh;

  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id AND NOT v_owns_via_wh THEN
    RAISE EXCEPTION 'forbidden: cross-partner confirm-receive'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;

  IF v_po.sup_status IS DISTINCT FROM 'ready_confirm_sent' THEN
    RAISE EXCEPTION 'PO is not in ready_confirm_sent state (got %)', v_po.sup_status
      USING ERRCODE = '22023', DETAIL = 'wrong_sup_status';
  END IF;

  v_actor := COALESCE((SELECT name FROM app_users WHERE id = (SELECT auth.uid())), 'Partner');

  UPDATE purchase_orders
     SET sup_status            = 'partner_confirmed',
         partner_confirmed_at  = now(),
         updated_at            = now()
   WHERE id = p_po_id;

  IF v_owns_via_wh THEN
    UPDATE order_supplier_threads ost
       SET logistics_stage       = 'dispatched',
           warehouse_id          = v_po.warehouse_id,
           delivery_partner_id   = v_partner_id,
           partner_accepted_at   = now(),
           confirm_delivery_date = (SELECT o.delivery_date FROM orders o WHERE o.id = ost.order_id),
           updated_at            = now()
     WHERE po_id = p_po_id;

    -- Propagate to orders header (the fix). Coalesce so we never clobber a
    -- value an earlier path (logistics_assign_partner / manual edit) set.
    UPDATE orders o
       SET warehouse_id        = coalesce(o.warehouse_id, v_po.warehouse_id),
           delivery_partner_id = coalesce(o.delivery_partner_id, v_partner_id),
           updated_at          = now()
     WHERE o.id IN (SELECT order_id FROM order_supplier_threads WHERE po_id = p_po_id)
       AND (o.warehouse_id IS NULL OR o.delivery_partner_id IS NULL);
  ELSE
    UPDATE order_supplier_threads
       SET logistics_stage = 'dispatched',
           updated_at      = now()
     WHERE po_id = p_po_id;
  END IF;
  GET DIAGNOSTICS v_threads_advanced = ROW_COUNT;

  INSERT INTO po_history (po_id, text, by_role)
  VALUES (
    p_po_id,
    'Partner confirmed receive · supplier may dispatch',
    'partner'
  );

  INSERT INTO audit_log (role, actor_text, action, ref)
  VALUES ('partner', v_actor,
          format('Partner confirmed receive on PO %s (%s thread(s) advanced, %s path)',
                 p_po_id, v_threads_advanced,
                 CASE WHEN v_owns_via_wh THEN 'wh-owner' ELSE 'procurement' END),
          p_po_id);

  RETURN jsonb_build_object(
    'po_id',                p_po_id,
    'sup_status',           'partner_confirmed',
    'partner_confirmed_at', now(),
    'threads_advanced',     v_threads_advanced,
    'wh_owner_path',        v_owns_via_wh
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_confirm_receive(text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_confirm_receive(text) TO authenticated;


-- 2. Backfill — for every order where the header warehouse_id / delivery_
-- partner_id is null but a thread on that order has them, copy the values up.
-- Idempotent: the WHERE clause guards on header IS NULL, so re-running is a
-- no-op once both headers are populated.
WITH thread_source AS (
  SELECT
    ost.order_id,
    -- Pick the oldest reserved thread's warehouse + partner as the canonical
    -- source. Matches 0086's "first ready_to_dispatch thread wins" pattern.
    (array_agg(ost.warehouse_id ORDER BY ost.reserved_at NULLS LAST, ost.id)
       FILTER (WHERE ost.warehouse_id IS NOT NULL))[1] AS wh,
    (array_agg(ost.delivery_partner_id ORDER BY ost.reserved_at NULLS LAST, ost.id)
       FILTER (WHERE ost.delivery_partner_id IS NOT NULL))[1] AS dp
  FROM order_supplier_threads ost
  GROUP BY ost.order_id
)
UPDATE orders o
   SET warehouse_id        = COALESCE(o.warehouse_id, ts.wh),
       delivery_partner_id = COALESCE(o.delivery_partner_id, ts.dp),
       updated_at          = now()
  FROM thread_source ts
 WHERE ts.order_id = o.id
   AND (
     (o.warehouse_id IS NULL AND ts.wh IS NOT NULL)
     OR (o.delivery_partner_id IS NULL AND ts.dp IS NOT NULL)
   );
