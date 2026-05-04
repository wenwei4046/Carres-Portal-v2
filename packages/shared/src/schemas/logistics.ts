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
 * `createPosBatchInput` — POST /api/logistics/pos/batch (C5.2).
 * Maps to `logistics_create_pos_batch(p_pos jsonb)` RPC. `pos` is the array
 * of per-PO objects, each shaped exactly like `createPoInput`. The batch RPC
 * is atomic: any helper failure rolls back the whole batch (default plpgsql
 * function-as-tx semantics). Cap of 20 mirrors the RPC's sanity guard
 * (22023 invalid_batch_size). Min of 1 enforces the same cap on the empty
 * end. Frontend submits this from CreatePOModal when supplier groups > 1
 * (per-supplier-group warehouse picker, blank required).
 */
export const createPosBatchInput = z.object({
  pos: z.array(createPoInput).min(1).max(20),
}).strict();
export type CreatePosBatchInput = z.infer<typeof createPosBatchInput>;

/**
 * `createPosBatchResponse` — RPC returns `{po_ids: [text, ...]}` where each
 * id is a generated 'PO-NNNN' text id (NOT a uuid — the project's PO PK is
 * text, see 0001_init.sql line 323). Surfaced to the UI for the success
 * toast ("Issued N POs").
 */
export const createPosBatchResponse = z.object({
  poIds: z.array(z.string().min(1)),
});
export type CreatePosBatchResponse = z.infer<typeof createPosBatchResponse>;

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
 * `confirmProceedRequestInputSchema` — POST /api/logistics/orders/:id/confirm-proceed
 * (Pipeline v2, C2 / migration 0024). Maps to RPC
 * `logistics_confirm_proceed_request(p_order_id, p_warehouse_id)`. Logistics'
 * manual triage entry point: confirms a `proceed_request` order and decides
 * `awaiting_stock` vs `ready_to_dispatch` based on shortage at the chosen
 * warehouse. `warehouseId` is optional — RPC accepts NULL when the order
 * already has `warehouse_id`. `nullable()` is included so callers can be
 * explicit with `{ warehouseId: null }`.
 */
export const confirmProceedRequestInputSchema = z.object({
  warehouseId: z.string().uuid().nullable().optional(),
}).strict();
export type ConfirmProceedRequestInput = z.infer<typeof confirmProceedRequestInputSchema>;

/**
 * `transferReadyInputSchema` — POST /api/logistics/orders/:id/transfer-ready
 * (Pipeline v2, C2 / migration 0024). Maps to RPC
 * `logistics_warehouse_pick(p_order_id, p_warehouse_id)` — the RPC's
 * source-stage guard widens to IN ('proceed_request', 'awaiting_stock'), so
 * this same RPC powers both warehouse-override and the v2 transfer flow.
 * Naming kept distinct from `warehousePickInput` because the FE entry points
 * are conceptually different (one is "change warehouse", the other is
 * "mark ready"). `warehouseId` is required — the RPC `logistics_warehouse_pick`
 * rejects NULL with `warehouse_required`. confirm-proceed accepts NULL via a
 * different RPC; do not conflate.
 */
export const transferReadyInputSchema = z.object({
  warehouseId: z.string().uuid(),
}).strict();
export type TransferReadyInput = z.infer<typeof transferReadyInputSchema>;

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
 * stage: 'all' (default) or one of the logistics stages. Pipeline v2 (C3,
 *   migration 0023) added 'placed' (synthetic — derived from `status='place'`
 *   in the route since pre-push orders don't necessarily have stage written
 *   yet) and 'proceed_request' (post-proceed_order, pre-triage).
 * channel: 'all' (default) | 'dealers' | 'showrooms'.
 * search: free-text matched against customer_name (ILIKE) AND parsed as int for dl exact match.
 */
export const listLogisticsOrdersQuery = z.object({
  stage: z.enum(['all', 'placed', 'proceed_request', 'awaiting_stock', 'ready_to_dispatch', 'dispatched', 'delivered']).default('all'),
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

/**
 * `reservedDrilldownQuery` — GET /api/logistics/warehouse/reserved-drilldown
 * (Pipeline v2, C4). Drill-down on a single (warehouse, sku) pair to surface
 * which orders are currently holding the reserve count shown in the warehouse
 * page. Both fields required — the route 422s on missing/invalid input.
 */
export const reservedDrilldownQuery = z.object({
  warehouseId: z.string().uuid(),
  sku: z.string().min(1),
}).strict();
export type ReservedDrilldownQuery = z.infer<typeof reservedDrilldownQuery>;

/**
 * `reservedDrilldownResponse` — response shape for the reserved drill-down
 * endpoint. `total` is the sum of reservedQty across orders, expected to match
 * the per-(sku, warehouse) `stock_balances.reserved` value (sanity invariant —
 * if it ever drifts, that's a reconciliation bug elsewhere). The orders array
 * lists only orders in `ready_to_dispatch` or `dispatched` stages, since those
 * are the only stages where `_logistics_reserve_order` keeps a reserve hold.
 */
export const reservedDrilldownResponse = z.object({
  warehouseId: z.string().uuid(),
  sku: z.string().min(1),
  total: z.number().int().nonnegative(),
  orders: z.array(z.object({
    id: z.string().uuid(),
    dl: z.number().int().positive(),
    customerName: z.string(),
    logisticsStage: z.enum(['ready_to_dispatch', 'dispatched']),
    reservedQty: z.number().int().positive(),
  })),
});
export type ReservedDrilldownResponse = z.infer<typeof reservedDrilldownResponse>;

/**
 * `listMovementsQuery` — GET /api/logistics/movements query string (M4 Task 3).
 *
 * Filters per spec §18.6 (LogisticsMovements page F3):
 *   - warehouseId: optional uuid → `.eq("warehouse_id", id)`.
 *   - category: 'all' (default) | 'mattress' | 'bedframe' | 'sofa'. Mapped to
 *     SKU prefix `category:%` (project SKU convention is `cat:model:variant`,
 *     e.g. `mattress:carres-cloud:King`; see seed.sql + migration 0019 comment
 *     §17.2 D1 "sku_category derived from sku format `cat:model`").
 *   - sku: optional substring (case-insensitive) → `.ilike("sku", '%' || sku || '%')`.
 *   - kind: 'all' (default) | 'in' | 'out'. (stock_movements.kind also has
 *     'adjust'; the spec page only exposes in/out toggles per §18.6 F3, so
 *     this query schema mirrors that — adjust rows are still returned when
 *     kind='all').
 *   - search: optional free-text against `ref` + `note`. Regex whitelists
 *     Unicode letters, numbers, space, underscore, dash (1-100 chars) — gates
 *     PostgREST .or() interpolation per /review carry-forward
 *     `phase-4-or-filter-harden`.
 *   - period: '7d' | '30d' (default) | '90d' | 'all' | 'custom'. Translated
 *     server-side into `.gte("occurred_at", ...)` (and `.lt(..., to)` for
 *     custom). For period='custom', both `from` and `to` must be present.
 */
export const listMovementsQuery = z.object({
  warehouseId: z.string().uuid().optional(),
  category: z.enum(['all', 'mattress', 'bedframe', 'sofa']).default('all'),
  sku: z.string().min(1).optional(),
  kind: z.enum(['all', 'in', 'out']).default('all'),
  search: z.string().trim().regex(/^[\p{L}\p{N} _-]{1,100}$/u).optional(),
  period: z.enum(['7d', '30d', '90d', 'all', 'custom']).default('30d'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
}).strict();
export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;
