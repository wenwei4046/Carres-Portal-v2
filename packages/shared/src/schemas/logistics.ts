import { z } from 'zod';

/**
 * Phase 4 — HQ Logistics inputs.
 *
 * Per spec §17.5 (CQ3) + §18.8 F1.A additions, 11 zod input schemas covering
 * the 9 logistics RPCs + 2 factory-pickup RPCs added by F1. Each schema maps
 * 1:1 to a server RPC call body shape. Path params (e.g. `:po_id`) are NOT
 * part of these schemas — they live in the route, not the body.
 */

/**
 * `assignPartnerInput` — POST /api/logistics/orders/:id/assign-partner.
 * Maps to `logistics_assign_partner(order_id, partner_id)` RPC (D1.dispatch
 * step 1). Picks a delivery partner for a `ready_to_dispatch` order; the
 * partner is notified to collect from the source warehouse.
 */
export const assignPartnerInput = z.object({
  partnerId: z.string().uuid(),
}).strict();
export type AssignPartnerInput = z.infer<typeof assignPartnerInput>;

/**
 * `attachDoInput` — POST /api/logistics/orders/:id/attach-do.
 * Maps to `logistics_attach_do_and_deliver(order_id, do_number, do_note)` RPC
 * (D1.dispatch step 2). Records the Delivery Order number, deducts stock, and
 * flips order status to `delivered`. `signed` must be literal `true` — the
 * "Customer signed the DO on receipt" checkbox is required by proto §18.3
 * DOAttachModal.
 */
export const attachDoInput = z.object({
  doNumber: z.string().min(3),
  doNote: z.string().optional(),
  signed: z.literal(true),
}).strict();
export type AttachDoInput = z.infer<typeof attachDoInput>;

/**
 * `receivePoLineInput` — POST /api/logistics/pos/:id/receive (per-line body
 * inside the request payload). Maps to `logistics_receive_po_line(po_id, sku,
 * received_qty)` RPC. `po_id` is the path param; `sku` + `receivedQty` are the
 * body. The frontend ReceivePOModal (§18.4 F5) sends one of these per ticked
 * line in the modal.
 */
export const receivePoLineInput = z.object({
  sku: z.string().min(1),
  receivedQty: z.number().int().positive(),
}).strict();
export type ReceivePoLineInput = z.infer<typeof receivePoLineInput>;

/**
 * `adjustStockInput` — POST /api/logistics/warehouse/adjust.
 * Maps to `logistics_adjust_stock(sku, warehouse_id, delta, reason)` RPC.
 * `delta` is signed (positive for ad-hoc inbound, negative for damage/loss);
 * `reason` is required for the audit trail. Server enforces qty >= reserved
 * post-adjust via CHECK constraint (P0001 below_reserved otherwise).
 */
export const adjustStockInput = z.object({
  sku: z.string().min(1),
  warehouseId: z.string().uuid(),
  delta: z.number().int(),
  reason: z.string().min(1),
}).strict();
export type AdjustStockInput = z.infer<typeof adjustStockInput>;

/**
 * `abandonOrderInput` — POST /api/logistics/orders/:id/abandon.
 * Maps to `logistics_abandon_order(order_id, reason)` RPC (A6, post-Proceed
 * cancel). Sets `status='cancelled'` + `logistics_stage='cancelled'` and
 * releases reserved stock. Does NOT issue refund (Phase 5 Finance).
 */
export const abandonOrderInput = z.object({
  reason: z.string().min(1),
}).strict();
export type AbandonOrderInput = z.infer<typeof abandonOrderInput>;

/**
 * `createPoInput` — POST /api/logistics/pos.
 * Maps to `logistics_create_po(supplier_id, warehouse_id, lines, dl, dl_refs)`
 * RPC. Used by NewPODialog for both single-order POs (`dl` set) and combined
 * cross-order bundles (`dlRefs` array, per A7). At least one line required;
 * each line's qty must be a positive integer.
 */
export const createPoInput = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  lines: z.array(z.object({
    sku: z.string().min(1),
    qty: z.number().int().positive(),
  })).min(1),
  dl: z.number().int().positive().optional(),
  dlRefs: z.array(z.number().int().positive()).optional(),
}).strict();
export type CreatePoInput = z.infer<typeof createPoInput>;

/**
 * `warehousePickInput` — POST /api/logistics/orders/:id/warehouse.
 * Maps to `logistics_warehouse_pick(order_id, warehouse_id)` RPC. Manual
 * override of the auto-picked source warehouse. Only allowed when
 * `logistics_stage = awaiting_stock` AND no open POs (P0001 has_open_pos).
 */
export const warehousePickInput = z.object({
  warehouseId: z.string().uuid(),
}).strict();
export type WarehousePickInput = z.infer<typeof warehousePickInput>;

/**
 * `issuePosForOrderInput` — POST /api/logistics/orders/:id/issue-pos.
 * Maps to `logistics_issue_pos_for_order(order_id)` RPC. Body is empty (the
 * order id is the path param). `.strict()` rejects any extra body keys so
 * the action route stays a clean trigger.
 */
export const issuePosForOrderInput = z.object({}).strict();
export type IssuePosForOrderInput = z.infer<typeof issuePosForOrderInput>;

/**
 * `recheckStockInput` — POST /api/logistics/orders/:id/recheck-stock.
 * Re-runs `logistics_pick_warehouse` + `logistics_calc_shortages` for an
 * `awaiting_stock` order in case stock landed via transfer between visits
 * (proto E1, §17.3). Body is empty; `.strict()` rejects extras.
 */
export const recheckStockInput = z.object({}).strict();
export type RecheckStockInput = z.infer<typeof recheckStockInput>;

/**
 * `assignPickupPartnerInput` — POST /api/logistics/pos/:id/assign-pickup-partner.
 * Maps to `logistics_assign_pickup_partner(po_id, partner_id)` RPC (F1.A,
 * factory_pickup flow). Picks a partner to dispatch to the supplier's factory
 * once `sup_status = ready_for_pickup`. Sets `sup_status → pickup_assigned`.
 */
export const assignPickupPartnerInput = z.object({
  partnerId: z.string().uuid(),
}).strict();
export type AssignPickupPartnerInput = z.infer<typeof assignPickupPartnerInput>;

/**
 * `reassignPoWarehouseInput` — POST /api/logistics/pos/:id/reassign-warehouse.
 * Maps to `logistics_reassign_po_warehouse(po_id, new_warehouse_id)` RPC
 * (F1.A, customer-rejection flow). Resets the PO's destination warehouse and
 * sup_status returns to `ready_for_pickup`. Note: in Phase 4 MVP no PO can
 * reach the `reassign_needed` state because it requires partner reporting
 * (Phase 7); UI exists but is unreachable until then.
 */
export const reassignPoWarehouseInput = z.object({
  newWarehouseId: z.string().uuid(),
}).strict();
export type ReassignPoWarehouseInput = z.infer<typeof reassignPoWarehouseInput>;

/**
 * `listLogisticsOrdersQuery` — GET /api/logistics/orders query string.
 * stage: 'all' (default) or one of the 4 logistics stages.
 * channel: 'all' (default) | 'dealers' | 'showrooms'.
 * search: free-text matched against customer_name (ILIKE) AND parsed as int for dl exact match.
 */
export const listLogisticsOrdersQuery = z.object({
  stage: z.enum(['all', 'awaiting_stock', 'ready_to_dispatch', 'dispatched', 'delivered']).default('all'),
  channel: z.enum(['all', 'dealers', 'showrooms']).default('all'),
  search: z.string().trim().max(100).optional(),
}).strict();
export type ListLogisticsOrdersQuery = z.infer<typeof listLogisticsOrdersQuery>;

/**
 * `listPurchaseOrdersQuery` — GET /api/logistics/pos query string.
 * status: 'all' (default) or one of the 3 PO statuses (open / received / cancelled).
 * supplierId: optional uuid for per-supplier filtering.
 */
export const listPurchaseOrdersQuery = z.object({
  status: z.enum(['all', 'open', 'received', 'cancelled']).default('all'),
  supplierId: z.string().uuid().optional(),
}).strict();
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuery>;

/**
 * `cancelPoInput` — POST /api/logistics/pos/:id/cancel.
 * Maps to `logistics_cancel_po(po_id, reason)` RPC (0020 migration). Reason is
 * required for the audit trail (mirrors abandonOrderInput shape).
 */
export const cancelPoInput = z.object({
  reason: z.string().min(1),
}).strict();
export type CancelPoInput = z.infer<typeof cancelPoInput>;
