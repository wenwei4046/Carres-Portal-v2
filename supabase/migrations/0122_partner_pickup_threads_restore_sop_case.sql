-- 0122_partner_pickup_threads_restore_sop_case.sql
-- 2026-05-18 (Loo screenshot — 4 STANDARD orders auto-flipped to DISPATCHED
-- on the operation kanban without delivery_partner_id set).
--
-- ROOT CAUSE: Migration 0117 (auto-DO#) and 0118 (FOR UPDATE lock fix) each
-- ran `CREATE OR REPLACE FUNCTION partner_pickup_threads` and silently
-- regressed the 0108 F2 SOP-aware fix. The live function flat-sets
-- operation_stage = 'dispatched' for every picked thread regardless of
-- SOP. STANDARD threads (factory → WH → customer) should go to
-- 'ready_to_dispatch' after partner pickup — goods are at WH awaiting
-- customer-leg LP assignment via `logistics_assign_partner`. Only
-- SOFA_SPECIAL (factory → customer direct) should jump straight to
-- 'dispatched'. Confirmed via pg_get_functiondef on live DB: the body
-- has no `CASE WHEN sop_name = 'SOFA_SPECIAL'` block.
--
-- This migration:
--   1. CREATE OR REPLACE `partner_pickup_threads` with the 0108 SOP-aware
--      CASE re-applied. Preserves 0117 (auto-DO#) + 0118 (CTE lock) +
--      0121 (operation_stage column name).
--   2. One-shot backfill of threads stuck in the wrong state. Signature:
--        sop_name              = 'STANDARD'
--        operation_stage       = 'dispatched'
--        delivery_partner_id   IS NULL
--        pickup_event_id       IS NOT NULL
--      → revert to 'ready_to_dispatch'. Rollup trigger
--      `orders_rollup_stage_after_thread_change` (0036/0040/0047)
--      propagates thread.operation_stage → orders.operation_stage
--      automatically.
--
-- SOFA_SPECIAL threads and any thread already assigned a customer-leg LP
-- are NOT touched — only the bug signature above.
--
-- Authorized in conversation 2026-05-18 per CLAUDE.md §7 (schema change)
-- + §14 #1 (data update).


CREATE OR REPLACE FUNCTION public.partner_pickup_threads(
  p_po_id        text,
  p_thread_ids   uuid[],
  p_do_number    text,
  p_do_file_path text,
  p_do_note      text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_po              purchase_orders;
  v_partner_id      uuid;
  v_actor_uid       uuid;
  v_event_id        uuid;
  v_thread_count    int;
  v_remaining       int;
  v_new_sup_status  po_sup_status;
  v_existing_events int;
  v_do_number       text;
BEGIN
  v_partner_id := public.app_partner_id();
  v_actor_uid  := (SELECT auth.uid());

  IF public.app_role() <> 'partner' THEN
    RAISE EXCEPTION 'forbidden: partner role only'
      USING ERRCODE = '42501', DETAIL = 'forbidden';
  END IF;
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: partner_id missing on JWT'
      USING ERRCODE = '42501', DETAIL = 'no_partner_id';
  END IF;
  IF array_length(p_thread_ids, 1) IS NULL OR array_length(p_thread_ids, 1) = 0 THEN
    RAISE EXCEPTION 'at least one thread required'
      USING ERRCODE = '22023', DETAIL = 'empty_threads';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PO not found' USING ERRCODE = '42P01', DETAIL = 'po_not_found';
  END IF;
  IF v_po.procurement_partner_id IS DISTINCT FROM v_partner_id THEN
    RAISE EXCEPTION 'forbidden: PO not assigned to this partner'
      USING ERRCODE = '42501', DETAIL = 'cross_tenant';
  END IF;

  -- 0118 CTE lock pattern: lock the eligible rows first, then count.
  -- Postgres rejects `SELECT count(*) ... FOR UPDATE` directly.
  WITH locked AS (
    SELECT id FROM order_supplier_threads
     WHERE id = ANY(p_thread_ids)
       AND po_id = p_po_id
       AND supplier_ready_at IS NOT NULL
       AND pickup_event_id IS NULL
     FOR UPDATE
  )
  SELECT count(*) INTO v_thread_count FROM locked;
  IF v_thread_count <> array_length(p_thread_ids, 1) THEN
    RAISE EXCEPTION 'one or more threads ineligible (not ready / wrong PO / already picked)'
      USING ERRCODE = '22023', DETAIL = 'ineligible_thread';
  END IF;

  -- 0117 auto-DO#: server generates DO-{po}-{seq3} when caller doesn't supply.
  IF p_do_number IS NULL OR length(btrim(p_do_number)) < 3 THEN
    SELECT count(*) INTO v_existing_events FROM po_pickup_events WHERE po_id = p_po_id;
    v_do_number := format('DO-%s-%s', p_po_id, lpad((v_existing_events + 1)::text, 3, '0'));
  ELSE
    v_do_number := btrim(p_do_number);
  END IF;

  INSERT INTO po_pickup_events (po_id, do_number, do_file_path, do_note, picked_up_at, picked_up_by, ack_role)
  VALUES (p_po_id,
          v_do_number,
          nullif(btrim(coalesce(p_do_file_path, '')), ''),
          nullif(btrim(coalesce(p_do_note, '')), ''),
          now(), v_actor_uid, 'partner')
  RETURNING id INTO v_event_id;

  -- 0108 F2 restored (lost in 0117 + 0118 regressions): SOP-aware target.
  --   STANDARD     — factory → WH → customer; lands at WH awaiting
  --                  customer-leg LP assignment via logistics_assign_partner.
  --   SOFA_SPECIAL — factory → customer direct; partner is already ferrying
  --                  to customer's address, so 'dispatched' is correct.
  UPDATE order_supplier_threads t
     SET pickup_event_id = v_event_id,
         operation_stage = CASE WHEN t.sop_name = 'SOFA_SPECIAL'
                                THEN 'dispatched'::operation_stage
                                ELSE 'ready_to_dispatch'::operation_stage
                           END,
         updated_at      = now()
   WHERE t.id = ANY(p_thread_ids);

  SELECT count(*) INTO v_remaining
    FROM order_supplier_threads
   WHERE po_id = p_po_id AND pickup_event_id IS NULL;

  IF v_remaining = 0 THEN
    v_new_sup_status := 'shipped';
  ELSE
    v_new_sup_status := 'partially_shipped';
  END IF;
  UPDATE purchase_orders SET sup_status = v_new_sup_status, updated_at = now()
    WHERE id = p_po_id;

  INSERT INTO po_history (po_id, text, by_role, by_user_id)
  VALUES (p_po_id,
          format('Partner picked up %s thread(s) · DO %s · sup_status -> %s',
                 v_thread_count, v_do_number, v_new_sup_status),
          'partner', v_actor_uid);

  RETURN jsonb_build_object(
    'pickup_event_id', v_event_id,
    'thread_count',    v_thread_count,
    'do_number',       v_do_number,
    'po_sup_status',   v_new_sup_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.partner_pickup_threads(text, uuid[], text, text, text) TO authenticated;


-- =============================================================================
-- One-shot backfill: revert STANDARD threads wrongly dispatched by the
-- 0117/0118-regressed RPC.
--
-- Bug signature (very narrow — won't touch anything legitimate):
--   sop_name              = 'STANDARD'           — SOFA_SPECIAL is correct as-is
--   operation_stage       = 'dispatched'         — the wrong terminal state
--   delivery_partner_id   IS NULL                — logistics_assign_partner never ran
--   pickup_event_id       IS NOT NULL            — partner pickup did happen
--
-- A legitimately-dispatched STANDARD thread (post-logistics_assign_partner)
-- always carries delivery_partner_id, so this WHERE never matches that case.
-- =============================================================================
DO $$
DECLARE
  v_thread_rows int;
  v_order_rows  int;
BEGIN
  UPDATE order_supplier_threads
     SET operation_stage = 'ready_to_dispatch'::operation_stage,
         updated_at      = now()
   WHERE sop_name            = 'STANDARD'
     AND operation_stage     = 'dispatched'
     AND delivery_partner_id IS NULL
     AND pickup_event_id     IS NOT NULL;
  GET DIAGNOSTICS v_thread_rows = ROW_COUNT;
  RAISE NOTICE '0122 backfill: % thread(s) reverted to ready_to_dispatch', v_thread_rows;

  -- Defensive: in case the rollup trigger doesn't catch every order
  -- (e.g. order had a single thread, trigger fires per-row but didn't
  -- recompute the parent), force orders whose threads now agree on
  -- ready_to_dispatch into ready_to_dispatch as well.
  UPDATE orders o
     SET operation_stage = 'ready_to_dispatch'::operation_stage,
         updated_at      = now()
   WHERE o.operation_stage = 'dispatched'
     AND o.delivery_partner_id IS NULL
     AND o.dispatched_at IS NULL
     AND EXISTS (
       SELECT 1 FROM order_supplier_threads t
        WHERE t.order_id = o.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM order_supplier_threads t
        WHERE t.order_id = o.id
          AND t.operation_stage = 'dispatched'
     );
  GET DIAGNOSTICS v_order_rows = ROW_COUNT;
  RAISE NOTICE '0122 backfill: % order(s) reverted to ready_to_dispatch', v_order_rows;
END $$;
