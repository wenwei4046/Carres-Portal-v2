-- 0127_propagate_warehouse_id_thread_chain.sql
-- 2026-05-18 (Loo screenshot "ATTACH DO & MARK DELIVERED" crash on #1003)
--
-- BUG
--   Order #1003 (Carres KL Showroom, post-Phase-9 wipe, channel=dealer)
--   reached operation_stage='dispatched' with BOTH `orders.warehouse_id`
--   AND `order_supplier_threads.warehouse_id` as NULL — even though
--   PO-2031 (warehouse_id = c03 Carres Klang) had received stock and
--   reserved 3 units there.
--
--   Pressing "ATTACH DO & MARK DELIVERED" crashed with:
--     ERROR: null value in column "warehouse_id" of relation
--            "stock_movements" violates not-null constraint
--
--   This is because `operation_attach_do_and_deliver` reads
--   `v_order.warehouse_id` (NULL for this order) and tries to INSERT a
--   stock_movement with that null.
--
-- ROOT CAUSE (chain)
--   1. `_v3_claim_threads_for_po` claims a thread (sets thread.po_id) but
--      NEVER sets thread.warehouse_id from po.warehouse_id. Threads end up
--      with po_id set but warehouse_id null forever.
--   2. `operation_assign_partner` (per migration 0086) reads the first
--      ready_to_dispatch thread with warehouse_id IS NOT NULL to derive
--      orders.warehouse_id. If threads.warehouse_id is null → can't find
--      any → orders.warehouse_id stays null.
--   3. Downstream `operation_attach_do_and_deliver` reads
--      orders.warehouse_id → null → stock_movements INSERT crashes.
--
-- FIX (3 parts in one migration)
--   PART A — backfill threads.warehouse_id from po.warehouse_id for any
--            thread that has po_id set but warehouse_id null. This unblocks
--            every stuck order/thread in current prod state.
--   PART B — backfill orders.warehouse_id from the first (lowest id) thread
--            on that order with warehouse_id NOT NULL. Runs after PART A so
--            it benefits from the just-backfilled threads.
--   PART C — patch `_v3_claim_threads_for_po` (CREATE OR REPLACE) so future
--            PO claims propagate warehouse_id from PO → thread atomically.
--
-- SCOPE LIMITS
--   * PART A only touches threads where po_id IS NOT NULL — stockpile
--     threads (po_id null until issued) are left alone.
--   * PART B only touches orders where warehouse_id IS NULL — non-null
--     existing values are preserved.
--   * If a PO itself has warehouse_id NULL (extremely rare edge case),
--     PART A leaves that thread null and sanity check tolerates it.
--
-- Loo authorised in conversation 2026-05-18 (screenshot "fix") per
-- CLAUDE.md §14 #1 single-instance approval.


-- =============================================================================
-- PART A — backfill threads.warehouse_id from po.warehouse_id
-- =============================================================================
WITH targets AS (
  SELECT t.id AS thread_id, p.warehouse_id AS po_warehouse
    FROM order_supplier_threads t
    JOIN purchase_orders p ON p.id = t.po_id
   WHERE t.warehouse_id IS NULL
     AND p.warehouse_id IS NOT NULL
)
UPDATE order_supplier_threads t
   SET warehouse_id = targets.po_warehouse,
       updated_at   = now()
  FROM targets
 WHERE t.id = targets.thread_id;


-- =============================================================================
-- PART B — backfill orders.warehouse_id from first thread with warehouse_id
-- =============================================================================
WITH first_thread_wh AS (
  SELECT DISTINCT ON (order_id)
         order_id,
         warehouse_id AS thread_warehouse
    FROM order_supplier_threads
   WHERE warehouse_id IS NOT NULL
   ORDER BY order_id, id  -- deterministic: lowest thread id wins
)
UPDATE orders o
   SET warehouse_id = first_thread_wh.thread_warehouse,
       updated_at   = now()
  FROM first_thread_wh
 WHERE o.id           = first_thread_wh.order_id
   AND o.warehouse_id IS NULL;


-- =============================================================================
-- PART C — patch `_v3_claim_threads_for_po` to propagate warehouse_id
--          atomically when claiming a thread to a PO. Body identical to
--          live state except the UPDATE now also sets t.warehouse_id.
-- =============================================================================
CREATE OR REPLACE FUNCTION public._v3_claim_threads_for_po(p_po_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_po              purchase_orders;
  v_already_claimed int;
  v_threads_claimed int;
begin
  select * into v_po from purchase_orders where id = p_po_id;
  if not found then
    raise exception 'PO not found: %', p_po_id
      using errcode = '42P01', detail = 'po_not_found';
  end if;

  perform 1
    from order_supplier_threads t
    join order_lines ol on ol.id = t.order_line_id
    join purchase_order_lines pol on pol.po_id = p_po_id
                                  and pol.sku  = ol.sku
                                  and coalesce(pol.attrs::text, '') = coalesce(ol.attrs::text, '')
   where t.supplier_id = v_po.supplier_id
     and (
       ol.order_id in (select id from orders where so = v_po.so)
       or ol.order_id in (select id from orders where so = any(coalesce(v_po.so_refs, array[]::int[])))
     )
   for update;

  select count(*) into v_already_claimed
    from order_supplier_threads t
    join order_lines ol on ol.id = t.order_line_id
    join purchase_order_lines pol on pol.po_id = p_po_id
                                  and pol.sku  = ol.sku
                                  and coalesce(pol.attrs::text, '') = coalesce(ol.attrs::text, '')
   where t.supplier_id = v_po.supplier_id
     and t.po_id is not null
     and (
       ol.order_id in (select id from orders where so = v_po.so)
       or ol.order_id in (select id from orders where so = any(coalesce(v_po.so_refs, array[]::int[])))
     );

  if v_already_claimed > 0 then
    raise exception 'concurrent_claim: % thread(s) already claimed', v_already_claimed
      using errcode = '40001',
            detail  = 'concurrent_claim',
            hint    = 'Another operation user has already issued a PO for these lines. Refresh and try again.';
  end if;

  -- 0127: propagate po.warehouse_id → thread.warehouse_id at claim time
  -- so downstream (auto-promote / assign_partner / mark-delivered) can read
  -- orders.warehouse_id consistently.
  update order_supplier_threads t
     set po_id        = p_po_id,
         warehouse_id = v_po.warehouse_id
    from order_lines ol,
         purchase_order_lines pol
   where t.order_line_id = ol.id
     and pol.po_id = p_po_id
     and pol.sku   = ol.sku
     and coalesce(pol.attrs::text, '') = coalesce(ol.attrs::text, '')
     and t.supplier_id = v_po.supplier_id
     and t.po_id is null
     and (
       ol.order_id in (select id from orders where so = v_po.so)
       or ol.order_id in (select id from orders where so = any(coalesce(v_po.so_refs, array[]::int[])))
     );
  get diagnostics v_threads_claimed = row_count;

  return jsonb_build_object(
    'po_id',           p_po_id,
    'threads_claimed', v_threads_claimed
  );
end;
$function$;


-- =============================================================================
-- PART D — sanity check
-- =============================================================================
DO $sanity$
DECLARE
  leftover_threads int;
  leftover_orders  int;
BEGIN
  -- Any thread with claimed PO but still null warehouse_id, where the PO
  -- has a non-null warehouse_id (the case we just backfilled).
  SELECT count(*)
    INTO leftover_threads
    FROM order_supplier_threads t
    JOIN purchase_orders p ON p.id = t.po_id
   WHERE t.warehouse_id IS NULL
     AND p.warehouse_id IS NOT NULL;

  IF leftover_threads > 0 THEN
    RAISE EXCEPTION '0127 sanity FAILED — % thread(s) still have null warehouse_id despite linked PO having warehouse_id',
      leftover_threads;
  END IF;

  -- Any non-place order with null warehouse_id where at least one of its
  -- threads has a non-null warehouse_id (PART B should have backfilled).
  SELECT count(*)
    INTO leftover_orders
    FROM orders o
   WHERE o.warehouse_id IS NULL
     AND o.status IN ('proceed_order', 'delivered')
     AND EXISTS (
       SELECT 1 FROM order_supplier_threads t
        WHERE t.order_id = o.id
          AND t.warehouse_id IS NOT NULL
     );

  IF leftover_orders > 0 THEN
    RAISE EXCEPTION '0127 sanity FAILED — % order(s) still have null warehouse_id despite threads with warehouse_id',
      leftover_orders;
  END IF;

  RAISE NOTICE '0127 sanity OK — thread/order warehouse_id chain consistent';
END
$sanity$;
