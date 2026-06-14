-- 0160_cleanup_q6_test_data.sql
-- Q6 of memory: project-orders-control-spec. Remove pre-alpha test junk Jess flagged.
--
-- Targets (verified 2026-06-09 on live DB, zero real-data linkage):
--   * SO-1117 "asadad"  (order c688c3d9-398a-4404-b25d-1df6c00a98f6, proceed_order)
--   * SO-1118 "sdccxw"  (order d4c67bac-57f4-4ecb-9aed-5a143e2dc4ea, proceed_order)
--   * PO-2031            (Nice Future, so_refs={1117,1118}; the only PO in the DB)
-- Confirmed 0 invoices / 0 payments / 0 refunds / 0 service_notes on these orders.
--
-- Red-line DELETE (CLAUDE.md §14 #1) — pre-approved by Jess and re-confirmed in the
-- session that applied this. Idempotent: matches 0 rows on a fresh DB.
--
-- ORDER MATTERS: delete the orders FIRST. That cascades their 2 order_lines, 2
-- order_supplier_threads (incl. the threads whose po_id -> PO-2031) and 6 order_history
-- rows, which clears PO-2031's only NO ACTION referrers. Then PO-2031 deletes cleanly
-- (cascading its 1 purchase_order_line; it has 0 payments/receipts/pickups/history).

-- 1. test orders -> CASCADE: order_lines, order_supplier_threads, order_history,
--    order_addons, order_annotations; ops_activity_log.order_id -> SET NULL (0 rows)
delete from public.orders where so in (1117, 1118);

-- 2. now-unblocked procurement PO -> CASCADE: purchase_order_lines (1)
delete from public.purchase_orders where id = 'PO-2031';

-- 3. orphan audit_log rows for these test SOs (no FK; pure test noise that would
--    otherwise dangle against deleted orders in the audit view)
delete from public.audit_log where ref in ('SO-1117', 'SO-1118');
