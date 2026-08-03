import { z } from 'zod';

/**
 * Phase 4 — HQ operation inputs.
 *
 * Per spec §17.5 (CQ3) + §18.8 F1.A additions, 11 zod input schemas covering
 * the 9 operation RPCs + 2 factory-pickup RPCs added by F1. Each schema maps
 * 1:1 to a server RPC call body shape. Path params (e.g. `:po_id`) are NOT
 * part of these schemas — they live in the route, not the body.
 */

/**
 * `assignPartnerInput` — POST /api/operation/orders/:id/assign-partner.
 * Maps to `operation_assign_partner(order_id, partner_id)` RPC (D1.dispatch
 * step 1). Picks a delivery partner for a `ready_to_dispatch` order; the
 * partner is notified to collect from the source warehouse.
 */
export const assignPartnerInput = z.object({
  partnerId: z.string().uuid(),
}).strict();
export type AssignPartnerInput = z.infer<typeof assignPartnerInput>;

/**
 * `chasePoEventInput` — POST /api/operation/pos/:id/chase-event.
 * Records that operation chased a supplier over WhatsApp. Server writes
 * one `audit_log` row keyed to the PO ref; no RPC — direct insert. Kept as
 * a lightweight event log so the cockpit can show "last chased 2h ago"
 * next to the row without a full supplier-comms table. Free-text note
 * lets the operator capture whatever the supplier said back (optional,
 * ≤ 200 chars, longer strings are truncated on write).
 */
export const chasePoEventInput = z.object({
  note: z.string().max(200).optional(),
}).strict();
export type ChasePoEventInput = z.infer<typeof chasePoEventInput>;

/**
 * P3 · `recordTomorrowDeliveryInput` —
 * POST /api/operation/pos/:poId/tomorrow-delivery.
 * Maps to `purchasing_record_tomorrow_delivery(po_id, answer, new_date,
 * reason)` (0306).
 *
 * TWO answers and no third, because `docs/PURCHASING-WORKING-FLOW.md` §3 gives
 * the action exactly two completions — **shipping**, or **delayed with a new
 * date** — and the engine has no branch for a middle one. The DB CHECK says
 * the same thing; this schema is its mirror, so a client meets a readable 422
 * instead of a raw constraint string.
 *
 * `newDate` is REQUIRED on `delayed` and refused on `shipping`: a delay with no
 * date records nothing anybody can act on, and a "shipping" answer carrying a
 * date would be two different answers wearing one word.
 */
export const recordTomorrowDeliveryInput = z.discriminatedUnion('answer', [
  z.object({
    answer: z.literal('shipping'),
    // Supplier-date door (Jess, 2026-08-02): a PO with NO date yet takes its
    // FIRST confirmed date through the same door — `firstDate` is required by
    // the RPC exactly when `eta_date` is null, refused otherwise (draft
    // migration extends 0306's RPC; see docs/CHECKPOINT-purchase-orders.md).
    firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'firstDate must be YYYY-MM-DD').optional(),
    reason: z.string().max(300).optional(),
    // Reason = the countable CATEGORY (PO_DELAY_REASONS); Remarks = the real
    // story, free text. Two fields, never folded (Jess, 2026-08-02).
    remarks: z.string().max(500).optional(),
  }).strict(),
  z.object({
    answer: z.literal('delayed'),
    newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'newDate must be YYYY-MM-DD'),
    reason: z.string().max(300).optional(),
    remarks: z.string().max(500).optional(),
  }).strict(),
]);
export type RecordTomorrowDeliveryInput = z.infer<typeof recordTomorrowDeliveryInput>;

/**
 * What we SENT the supplier (0312, Jess 2026-08-02). The channel is the fact;
 * the revision is derived server-side (a send mints one only when the document
 * changed since the last).
 */
export const recordSendInput = z.object({
  channel: z.enum(["whatsapp", "email", "print"]),
  note: z.string().max(300).optional(),
}).strict();
export type RecordSendInput = z.infer<typeof recordSendInput>;

/** ONE company-wide supplier-message template. */
export const setMessageTemplateInput = z.object({
  text: z.string().max(2000),
}).strict();
export type SetMessageTemplateInput = z.infer<typeof setMessageTemplateInput>;

/**
 * Where each LINE goes (Jess, 2026-08-02) — the three per-line write doors
 * (0311). Purchasing's only per-line job is the destination; the ops remark
 * is its own internal note and never prints.
 */
export const setLineDestinationInput = z.object({
  destinationId: z.string().uuid(),
}).strict();
export type SetLineDestinationInput = z.infer<typeof setLineDestinationInput>;

export const splitLineDestinationInput = z.object({
  moveQty: z.number().int().min(1),
  destinationId: z.string().uuid(),
}).strict();
export type SplitLineDestinationInput = z.infer<typeof splitLineDestinationInput>;

export const setLineOpsRemarkInput = z.object({
  text: z.string().max(500),
}).strict();
export type SetLineOpsRemarkInput = z.infer<typeof setLineOpsRemarkInput>;

/**
 * P3 · `recordBalanceDateInput` —
 * POST /api/operation/pos/lines/:poLineId/balance-date.
 * Maps to `purchasing_record_balance_date(po_line_id, new_date, reason)` (0306).
 *
 * The date is the whole record — §3's completion is "a date for the balance is
 * recorded" — so it is not optional here either.
 */
export const recordBalanceDateInput = z.object({
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'newDate must be YYYY-MM-DD'),
  reason: z.string().max(300).optional(),
}).strict();
export type RecordBalanceDateInput = z.infer<typeof recordBalanceDateInput>;

/**
 * `attachDoInput` — POST /api/operation/orders/:id/attach-do.
 * Maps to `operation_attach_do_and_deliver(order_id, do_number, do_note,
 * signed, do_file_path)` RPC (D1.dispatch step 2 + Phase 9 Day 1 file-upload
 * extension, migration 0087). Records the Delivery Order number + signed
 * file path, deducts stock, and flips order status to `delivered`.
 *
 * `signed` must be literal `true` — the "Customer signed the DO on receipt"
 * checkbox is required by proto §18.3 DOAttachModal.
 *
 * `doFilePath` is the canonical Storage path returned by
 * `/api/storage/dos/sign-order-upload` after the browser streams the signed
 * DO file to the `delivery-orders` bucket under `order-<order_id>/...`.
 * Required by migration 0087 (Loo 2026-05-11) — Finance audit + customer
 * dispute resolution need the actual artefact, not just a typed-in number.
 */
export const attachDoInput = z.object({
  doNumber: z.string().min(3),
  doNote: z.string().optional(),
  signed: z.literal(true),
  doFilePath: z.string().min(3).max(300),
  // 0151 (Loo 2026-05-31) — REQUIRED customer e-signature on delivery.
  // `signaturePath` is the Storage path of the captured signature PNG
  // (uploaded to delivery-orders/order-<id>/<uuid>-signature.png);
  // `signerName` is the receiving customer's typed name.
  signaturePath: z.string().min(3).max(300),
  signerName: z.string().min(1).max(120),
}).strict();
export type AttachDoInput = z.infer<typeof attachDoInput>;

/**
 * `receivePoWithDoInput` — POST /api/operation/pos/:id/receive (Phase 4.5
 * Chunk 1 carry-forward `phase-4.5-chunk-1-receive-rpc-v3-swap`). Maps to
 * `operation_receive_po_with_do(p_po_id, p_do_file_path, p_do_number, p_lines)`
 * RPC defined in migration 0045. Replaces the v2 per-line shape (one call per
 * sku) with a single batched call carrying all ticked lines plus the DO file
 * path captured by `DOFileUploadField` and the supplier DO number.
 *
 * Semantic shift v2 → v3: `receivedQty` per line is now the NEW TOTAL
 * received_qty for that line (RPC computes delta internally and rejects
 * decreases with `received_qty_decrease`), NOT a delta added to the existing
 * value. The frontend ReceivePOModal builds this as
 * `existing.received_qty + recv[sku]` before sending.
 *
 * Atomic semantics: the RPC processes every line in one transaction — any
 * line failure rolls back the whole receive, including stock_balances bumps
 * and thread advancement. No more "did this PO partial-write half its lines?"
 *
 * R1 (0284, receiving & claim queue): receiving is an INSPECTION, so a line
 * may also report what was WRONG with this delivery. `damagedQty` and
 * `wrongItemQty` are what THIS DO found — the RPC adds them to the line's
 * running counters, unlike `receivedQty` which stays a new total. They are
 * NOT received: a damaged unit never enters stock and its qty stays Pending
 * delivery, because the supplier still owes a good one.
 *
 * R2 (0288): every reported issue BECOMES a supplier claim, so the line also
 * carries the claim's evidence — `damagedPhotos` / `wrongItemPhotos` (storage
 * object keys already uploaded to the `delivery-orders` bucket) and
 * `wrongItemClaimType` (WHICH kind of wrong, narrowed by the line's product
 * category). The RPC refuses a damaged/wrong report without them
 * (`claim_evidence_required` / `claim_type_required`), and a DB trigger refuses
 * ANY door that raises the counters without a covering claim. Photo paths are
 * capped so a malformed client cannot write an unbounded jsonb array.
 */
const CLAIM_PHOTO_PATHS = z.array(z.string().min(1).max(400)).max(12);

export const receivePoWithDoInput = z.object({
  doNumber: z.string().min(3),
  doFilePath: z.string().min(1),
  lines: z.array(z.object({
    // 0076 (Loo 2026-05-10): line lookup is now by UUID `id` because
    // (po_id, sku) is no longer unique once same-sku-different-attrs lines
    // coexist (multi-variant bedframe POs). The RPC keys WHERE/UPDATE on
    // this id; the frontend reads the line UUID from the existing
    // purchase_order_lines select. sku is kept for display/audit only.
    id: z.string().uuid(),
    receivedQty: z.number().int().nonnegative(),
    // R1: optional so a caller that only books good goods is unchanged.
    // The RPC refuses received + damaged + wrong > ordered on one DO.
    damagedQty: z.number().int().nonnegative().optional(),
    wrongItemQty: z.number().int().nonnegative().optional(),
    // R2: the claim's evidence. Optional for the same reason — a clean
    // delivery sends the payload it always did.
    damagedPhotos: CLAIM_PHOTO_PATHS.optional(),
    wrongItemClaimType: z.string().min(1).max(40).optional(),
    wrongItemPhotos: CLAIM_PHOTO_PATHS.optional(),
  })).min(1),
}).strict();
export type ReceivePoWithDoInput = z.infer<typeof receivePoWithDoInput>;

/**
 * `officeReceiveInput` — POST /api/operation/pos/:id/office-receive
 * (Slice B of the Receiving Workspace; migration 0315 `office_receive_post`).
 *
 * This is NOT a second spelling of `receivePoWithDoInput`. That body books a
 * receive and leaves no record of the delivery; this one opens a **Receiving
 * Session** — one physical delivery, one document, one `posted` event — and
 * the shape follows the frozen model rather than the old RPC:
 *
 *   · `receivedNow` is the DELTA counted on THIS delivery, never the running
 *     total (RECEIVING-INFORMATION-MODEL §7.1: "The form asks 'Receive this
 *     time', never 'total so far'"). The engine derives the cumulative figure;
 *     no client does arithmetic on a quantity it did not count.
 *   · `goodsReceivedAt` is the BUSINESS date — when the goods physically
 *     arrived, which is not when somebody keyed them in (§5). Optional: the
 *     server defaults to today in MYT, and refuses a future date or one before
 *     the PO date. The browser never decides what "today" is.
 *   · `doNumber` is the SUPPLIER's document number, so it has no default and
 *     no suggestion — a number we invent is a reference the supplier has never
 *     heard of, and it would defeat the duplicate guard it feeds.
 *   · `doFilePath` is the signed DO photo, required past Draft by the store
 *     itself (0314 `wr_do_required_past_draft`).
 *
 * Damage / wrong-item evidence rides the same keys as the older body because
 * both end up in the SAME validator (`warehouse_receipt_validate_lines`) —
 * one copy of the counting and evidence law, two doors.
 */
export const officeReceiveInput = z.object({
  doNumber: z.string().min(3).max(60),
  doFilePath: z.string().min(1).max(400),
  // ISO yyyy-mm-dd. Bounds are the server's — a browser clock is not evidence.
  goodsReceivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
  lines: z.array(z.object({
    id: z.string().uuid(),
    receivedNow: z.number().int().nonnegative(),
    damagedQty: z.number().int().nonnegative().optional(),
    wrongItemQty: z.number().int().nonnegative().optional(),
    damagedPhotos: CLAIM_PHOTO_PATHS.optional(),
    wrongItemClaimType: z.string().min(1).max(40).optional(),
    wrongItemPhotos: CLAIM_PHOTO_PATHS.optional(),
  })).min(1),
}).strict();
export type OfficeReceiveInput = z.infer<typeof officeReceiveInput>;

/**
 * `adjustStockInput` — POST /api/operation/warehouse/adjust.
 * Maps to `operation_adjust_stock(sku, warehouse_id, delta, reason)` RPC.
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
 * `abandonOrderInput` — POST /api/operation/orders/:id/abandon.
 * Maps to `operation_abandon_order(order_id, reason)` RPC (A6, post-Proceed
 * cancel). Sets `status='cancelled'` + `operation_stage='cancelled'` and
 * releases reserved stock. Does NOT issue refund (Phase 5 Finance).
 */
export const abandonOrderInput = z.object({
  reason: z.string().min(1),
}).strict();
export type AbandonOrderInput = z.infer<typeof abandonOrderInput>;

/**
 * `createPoInput` — POST /api/operation/pos.
 * Maps to `operation_create_po(supplier_id, warehouse_id, lines, so, so_refs)`
 * RPC. Used by NewPODialog for both single-order POs (`so` set) and combined
 * cross-order bundles (`soRefs` array, per A7). At least one line required;
 * each line's qty must be a positive integer.
 *
 * Phase 4.5 Chunk 2 Sprint E (T25) migration 0055 — each line carries
 * `cost` (per-unit numeric, non-negative) + `costSource` (enum) that get
 * persisted to `purchase_order_lines.cost` + `.cost_source`. Required on input
 * even though the DB columns are nullable, because:
 *   - Legacy rows pre-0055 are NULL (CQ3 backfill).
 *   - New PO creates MUST capture the cost — RPC validation (T26) raises
 *     ERRCODE 22023 DETAIL 'cost_required' if either is NULL on insert.
 *   - The frontend (T28 CogsLineEditor) drives a value into both fields
 *     before the user can submit, so the input edge contract enforces
 *     non-NULL too.
 */
export const createPoInput = z.object({
  supplierId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  // 0079 (Loo 2026-05-10) — procurement-leg LP assigned at PO creation so
  // the partner sees the upcoming pickup the moment operation issues the
  // PO (instead of after Mark Ready). Optional: own_logistics suppliers
  // omit it; factory_pickup suppliers must include it (modal enforces).
  procurementPartnerId: z.string().uuid().optional(),
  lines: z.array(z.object({
    sku: z.string().min(1),
    qty: z.number().int().positive(),
    // Migration 0055. Per-unit cost; CHECK on the column enforces >= 0 — we
    // mirror that here so 422 surfaces at the API edge rather than 500ing on
    // SQLSTATE 23514 from Postgres.
    cost: z.number().nonnegative(),
    // Migration 0055 + 0074. Enum labels mirror `cost_source_enum` minus the
    // server-only 'auto_issued'. Post-0074 (Loo 2026-05-09 Q5=a) Create-PO
    // always emits 'catalog' since cost auto-reads from product_skus.cost;
    // the legacy 3 values stay accepted for any backfill / migration path.
    costSource: z.enum(['hand_entered', 'prev_po', 'system_suggested', 'catalog']),
    // Migration 0073 cascade picker (Loo 2026-05-09). Optional jsonb payload
    // per-line: bedframe={color, gap}, sofa={fabric_id, fabric_name,
    // fabric_surcharge}, mattress=null. Server is a dumb persister; client
    // (CreatePOModal) refuses submit when bedframe lacks color/gap or sofa
    // lacks fabric, so the API edge accepts any record shape.
    attrs: z.record(z.unknown()).nullable().optional(),
  })).min(1),
  so: z.number().int().positive().optional(),
  soRefs: z.array(z.number().int().positive()).optional(),
  // 0083 (Loo 2026-05-10) — required ISO date string. Pre-0083 rows had this
  // field captured by the modal but never sent (input-shape carry-forward
  // closed). Supplier/Finance AP-aging both read `purchase_orders.eta_date`;
  // null was silently corrupting both surfaces.
  etaDate: z.string().date(),
}).strict();
export type CreatePoInput = z.infer<typeof createPoInput>;

/**
 * `createPosBatchInput` — POST /api/operation/pos/batch (C5.2).
 * Maps to `operation_create_pos_batch(p_pos jsonb)` RPC. `pos` is the array
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
 * `warehousePickInput` — POST /api/operation/orders/:id/warehouse.
 * Maps to `operation_warehouse_pick(order_id, warehouse_id)` RPC. Manual
 * override of the auto-picked source warehouse. Only allowed when
 * `operation_stage = in_production` AND no open POs (P0001 has_open_pos).
 */
export const warehousePickInput = z.object({
  warehouseId: z.string().uuid(),
}).strict();
export type WarehousePickInput = z.infer<typeof warehousePickInput>;

/**
 * `confirmProceedRequestInputSchema` — POST /api/operation/orders/:id/confirm-proceed.
 * Maps to RPC `operation_confirm_proceed_request_v3(p_order_id, p_delivery_partner_id)`
 * (migration 0147 — item h: LP picked at Accept Proceed).
 *
 * `deliveryPartnerId` REQUIRED — the operator commits to a customer-leg LP at
 * this moment. The RPC writes it to `orders.delivery_partner_id` +
 * `orders.request_for_delivery_at`, putting the order into the LP's "Incoming"
 * queue. The LP then accepts (lp_accept_order) or rejects (lp_reject_order)
 * with a reason.
 *
 * `warehouseId` is intentionally NOT on this schema. v3 RPC picks the source
 * warehouse internally (auto-skip from `own` buffer based on stock coverage).
 * Operation overrides via the separate `transferReadyInputSchema` route once
 * the order is in in_production.
 */
export const confirmProceedRequestInputSchema = z.object({
  deliveryPartnerId: z.string().uuid(),
}).strict();
export type ConfirmProceedRequestInput = z.infer<typeof confirmProceedRequestInputSchema>;

/**
 * `reselectPartnerInput` — POST /api/operation/orders/:id/reselect-partner.
 * Maps to RPC `operation_reselect_partner(p_order_id, p_partner_id)`
 * (migration 0147). Used when the previously picked LP rejected via
 * `lp_reject_order` — the order surfaces back to operation with a red badge
 * and the operator picks a different LP. Same-partner reselect is rejected
 * (RPC errcode 22023 detail 'same_partner').
 */
export const reselectPartnerInput = z.object({
  partnerId: z.string().uuid(),
}).strict();
export type ReselectPartnerInput = z.infer<typeof reselectPartnerInput>;

/**
 * `lpAcceptOrderInput` — POST /api/partner/orders/:id/accept (item h).
 * Maps to RPC `lp_accept_order(p_order_id)`. Body is empty; the order id is
 * the path param. Strict so callers can't sneak extra keys.
 */
export const lpAcceptOrderInput = z.object({}).strict();
export type LpAcceptOrderInput = z.infer<typeof lpAcceptOrderInput>;

/**
 * `lpRejectOrderInput` — POST /api/partner/orders/:id/reject (item h).
 * Maps to RPC `lp_reject_order(p_order_id, p_reason)`. Reason is REQUIRED
 * and free-text (max 500 chars). RPC rejects empty/whitespace reasons with
 * 22023 detail 'reason_required'. The reason is shown to Operation in the
 * reselect dialog so they know why this LP couldn't take the job.
 */
export const lpRejectOrderInput = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();
export type LpRejectOrderInput = z.infer<typeof lpRejectOrderInput>;

/**
 * `transferReadyInputSchema` — POST /api/operation/orders/:id/transfer-ready
 * (Pipeline v2, C2 / migration 0024). Maps to RPC
 * `operation_warehouse_pick(p_order_id, p_warehouse_id)` — the RPC's
 * source-stage guard widens to IN ('confirmed', 'in_production'),
 * so this same RPC powers both warehouse-override and the v2 transfer flow.
 * Naming kept distinct from `warehousePickInput` because the FE entry points
 * are conceptually different (one is "change warehouse", the other is
 * "mark ready"). `warehouseId` is required — the RPC `operation_warehouse_pick`
 * rejects NULL with `warehouse_required`. confirm-proceed accepts NULL via a
 * different RPC; do not conflate.
 */
export const transferReadyInputSchema = z.object({
  warehouseId: z.string().uuid(),
}).strict();
export type TransferReadyInput = z.infer<typeof transferReadyInputSchema>;

/**
 * `issuePosForOrderInput` — POST /api/operation/orders/:id/issue-pos.
 * Maps to `operation_issue_pos_for_order(order_id)` RPC. Body is empty (the
 * order id is the path param). `.strict()` rejects any extra body keys so
 * the action route stays a clean trigger.
 */
export const issuePosForOrderInput = z.object({}).strict();
export type IssuePosForOrderInput = z.infer<typeof issuePosForOrderInput>;

/**
 * `recheckStockInput` — POST /api/operation/orders/:id/recheck-stock.
 * Re-runs `operation_pick_warehouse` + `operation_calc_shortages` for an
 * `in_production` order in case stock landed via transfer between
 * visits (proto E1, §17.3). Body is empty; `.strict()` rejects extras.
 */
export const recheckStockInput = z.object({}).strict();
export type RecheckStockInput = z.infer<typeof recheckStockInput>;

/**
 * `assignPickupPartnerInput` — POST /api/operation/pos/:id/assign-pickup-partner.
 * Maps to `operation_assign_pickup_partner(po_id, partner_id)` RPC (F1.A,
 * factory_pickup flow). Picks a partner to dispatch to the supplier's factory
 * once `sup_status = ready_for_pickup`. Sets `sup_status → pickup_assigned`.
 *
 * v3-S2.4 — `warehouseId` is the v3 spec §8.1 destination override the FE
 * sends from AssignPickupDialog's warehouse picker. It is OPTIONAL so the
 * existing API contract is backward-compatible (Phase 4 callers without a
 * picker still send only `partnerId`). Captured by the Hono route but not
 * forwarded to the current 2-arg RPC; v3-S4 swaps to
 * `operation_assign_partner_and_dispatch(... p_warehouse_override_id ...)`,
 * at which point this field becomes load-bearing.
 *
 * v3-S3.4 — Outsource toggle (spec §8.2). The dialog's partner select adds a
 * synthetic last option "+ Outsource (one-time)" that hides the partner
 * preview and reveals 3 inputs (name *, contact *, zones). On submit the body
 * carries (outsourcePartnerName + outsourcePartnerContact + outsourcePartnerZones?)
 * INSTEAD of `partnerId`. XOR semantic — exactly one of the two paths must
 * win, never both, never neither. Mirrors the DB CHECK constraint
 * `po_outsource_xor_partner` on purchase_orders (migration 0030 §3.6) which
 * enforces this at the storage layer too (defense in depth).
 *
 * The route bridges the outsource path via a direct `purchase_orders` UPDATE
 * (RLS-bounded by the operation JWT). v3-S4 swaps both paths to the unified
 * `operation_assign_partner_and_dispatch` RPC.
 */
export const assignPickupPartnerInput = z
  .object({
    partnerId: z.string().uuid().optional(),
    warehouseId: z.string().uuid().optional(),
    outsourcePartnerName: z.string().min(1).optional(),
    outsourcePartnerContact: z.string().min(1).optional(),
    outsourcePartnerZones: z.string().optional(),
  })
  .strict()
  // XOR: exactly one of (partnerId) vs (outsourcePartnerName) must be set.
  .refine(
    (data) => {
      const hasPartner = !!data.partnerId;
      const hasOutsource = !!data.outsourcePartnerName;
      return hasPartner !== hasOutsource;
    },
    {
      message:
        'Either partnerId or outsourcePartnerName must be set, not both',
    },
  )
  // When outsource path is taken, contact is required (name + contact must
  // travel together — the proto §8.2 form marks both as `*`).
  .refine(
    (data) => !data.outsourcePartnerName || !!data.outsourcePartnerContact,
    {
      message:
        'outsourcePartnerContact is required when outsourcePartnerName is set',
    },
  );
export type AssignPickupPartnerInput = z.infer<typeof assignPickupPartnerInput>;

/**
 * `reassignPoWarehouseInput` — POST /api/operation/pos/:id/reassign-warehouse.
 * Maps to `operation_reassign_po_warehouse(po_id, new_warehouse_id)` RPC
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
 * `ListOperationOrdersQuery` — GET /api/operation/orders query string.
 * stage: 'all' (default) or one of the operation stages. Pipeline v2 (C3,
 *   migration 0023) added 'placed' (synthetic — derived from `status='place'`
 *   in the route since pre-push orders don't necessarily have stage written
 *   yet) and 'confirmed' (post-proceed_order, pre-triage).
 * channel: 'all' (default) | 'dealers' | 'showrooms'.
 * search: free-text matched against customer_name (ILIKE) AND parsed as int for so exact match.
 */
export const ListOperationOrdersQuery = z.object({
  stage: z.enum(['all', 'placed', 'confirmed', 'in_production', 'ready_to_dispatch', 'dispatched', 'delivered']).default('all'),
  channel: z.enum(['all', 'dealers', 'showrooms']).default('all'),
  search: z.string().trim().max(100).optional(),
}).strict();
export type ListOperationOrdersQuery = z.infer<typeof ListOperationOrdersQuery>;

/**
 * `listPurchaseOrdersQuery` — GET /api/operation/pos query string.
 * status: 'all' (default) or one of the 3 PO statuses (open / received / cancelled).
 * supplierId: optional uuid for per-supplier filtering.
 */
export const listPurchaseOrdersQuery = z.object({
  status: z.enum(['all', 'open', 'received', 'cancelled']).default('all'),
  supplierId: z.string().uuid().optional(),
}).strict();
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuery>;

/**
 * `partnerAcceptRfdInput` — POST /api/partner/pickups/:threadId/accept-rfd
 * (Phase 4.5 Chunk 2 Sprint B). Maps to RPC `operation_partner_accept_rfd(p_thread_id uuid)`
 * defined in migration 0051. The customer-leg RFD pivoted from PO-scoped to
 * thread-scoped: the LP accepts on a single `order_supplier_threads` row
 * (one supplier × one order). Body carries the thread uuid only — the RPC
 * stamps `partner_accepted_at` and advances `operation_stage = 'dispatched'`
 * with no further parameters (the confirm date was already set at dispatch
 * time via `dispatchCustomerLegInput`).
 *
 * Replaces the Chunk 1 PO-scoped `acceptRfd` body (`{ confirm_delivery_date? }`
 * + path :id = po_id) which referenced the now-dropped 0045
 * `partner_accept_dispatch(p_po_id, p_confirm_delivery_date)` RPC.
 */
export const partnerAcceptRfdInput = z.object({
  threadId: z.string().uuid(),
}).strict();
export type PartnerAcceptRfdInput = z.infer<typeof partnerAcceptRfdInput>;

/**
 * `partnerRejectRfdInput` — POST /api/partner/pickups/:threadId/reject-rfd
 * (Phase 4.5 Chunk 2 Sprint B). Maps to RPC
 * `operation_partner_reject_rfd(p_thread_id uuid, p_reason text DEFAULT '')`
 * defined in migration 0051. Reason is audit-only (free text up to 500 chars),
 * matching the F9 invariant from Chunk 1 — `delivery_partner_id` stays
 * assigned on the thread so operation can re-RFD or pick a different LP via
 * DispatchPartnerDialog without a re-assignment step.
 *
 * Replaces the Chunk 1 PO-scoped `rejectRfd` body (`{ reason? }` + path :id =
 * po_id) which referenced the now-dropped 0045
 * `partner_reject_dispatch(p_po_id, p_reason)` RPC.
 */
export const partnerRejectRfdInput = z.object({
  threadId: z.string().uuid(),
  reason: z.string().max(500).optional(),
}).strict();
export type PartnerRejectRfdInput = z.infer<typeof partnerRejectRfdInput>;

/**
 * `dispatchCustomerLegInput` — POST /api/operation/pos/:threadId/dispatch-customer-leg
 * (Phase 4.5 Chunk 2 Sprint B). Maps to RPC
 * `operation_dispatch_customer_leg(p_thread_id uuid, p_partner_id uuid,
 *  p_confirm_delivery_date date, p_force_dispatch boolean DEFAULT false)`
 * defined in migration 0051. The dispatch entry-point pivoted from PO-scoped
 * to thread-scoped: customer-leg state (delivery_partner_id, request_for_delivery_at,
 * confirm_delivery_date, partner_accepted_at, partner_rejected_at) now lives on
 * `order_supplier_threads`, not `purchase_orders`.
 *
 * Two paths (RFD vs Force) per migration 0051:
 *   - `forceDispatch=false` (default): standard request-for-delivery flow. LP
 *     must accept via `partnerAcceptRfdInput` to advance the thread to
 *     'dispatched'.
 *   - `forceDispatch=true`: operation overrides RFD and stamps
 *     `partner_accepted_at = now()` immediately, advancing thread.operation_stage
 *     to 'dispatched' without LP intervention.
 *
 * Replaces the Chunk 1 PO-scoped `dispatchCustomerLegInput` (path :id = po_id +
 * body `{ partner_id, confirm_delivery_date, force_dispatch }`) which
 * referenced the now-dropped 0045
 * `operation_dispatch_customer_leg(text, uuid, date, boolean)` RPC.
 */
export const dispatchCustomerLegInput = z.object({
  threadId: z.string().uuid(),
  partnerId: z.string().uuid(),
  confirmDeliveryDate: z.string().date(),
  forceDispatch: z.boolean().default(false),
}).strict();
export type DispatchCustomerLegInput = z.infer<typeof dispatchCustomerLegInput>;

/**
 * `resumeDispatchInput` — POST /api/operation/threads/:threadId/resume-dispatch
 * (Phase 4.5 Chunk 2 Sprint B). Maps to RPC
 * `operation_resume_dispatch_from_waiting(p_thread_id uuid)` defined in
 * migration 0051. Replaces the Chunk 1 order-scoped
 * `operation_resume_from_waiting(p_order_id uuid)` RPC — the resume entry
 * point pivoted from order-scoped to thread-scoped so multi-thread orders
 * (e.g. mattress + sofa in one order) can resume independently per supplier
 * thread.
 *
 * State guard at the RPC: thread.operation_stage must be 'waiting'. Effect:
 * thread → 'ready_to_dispatch'; if all sibling threads on the same PO are no
 * longer waiting AND the PO is still 'at_warehouse_waiting', the PO sup_status
 * flips to 'delivered' (preserves Chunk-1 single-thread Sofa behaviour).
 */
export const resumeDispatchInput = z.object({
  threadId: z.string().uuid(),
}).strict();
export type ResumeDispatchInput = z.infer<typeof resumeDispatchInput>;

/**
 * `cancelPoInput` — POST /api/operation/pos/:id/cancel.
 * Maps to `operation_cancel_po(po_id, reason)` RPC (0020 migration). Reason is
 * required for the audit trail (mirrors abandonOrderInput shape).
 */
export const cancelPoInput = z.object({
  reason: z.string().min(1),
}).strict();
export type CancelPoInput = z.infer<typeof cancelPoInput>;

/**
 * `reservedDrilldownQuery` — GET /api/operation/warehouse/reserved-drilldown
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
 * are the only stages where `_operation_reserve_order` keeps a reserve hold.
 */
export const reservedDrilldownResponse = z.object({
  warehouseId: z.string().uuid(),
  sku: z.string().min(1),
  total: z.number().int().nonnegative(),
  orders: z.array(z.object({
    id: z.string().uuid(),
    so: z.number().int().positive(),
    customerName: z.string(),
    operationStage: z.enum(['ready_to_dispatch', 'dispatched']),
    reservedQty: z.number().int().positive(),
  })),
});
export type ReservedDrilldownResponse = z.infer<typeof reservedDrilldownResponse>;

/**
 * `awaitingStockShortageResponse` — GET /api/operation/pos/awaiting-stock-shortage
 * (Pipeline v2, C5.3). Server-side aggregation of SKU-level shortages across
 * every order currently in `operation_stage='in_production'`.
 *
 * Shape per row:
 *   - `sku`: the product SKU.
 *   - `need`: sum of `order_lines.qty` across awaiting orders for this SKU.
 *   - `available`: cross-warehouse total (sum of `qty - reserved` across every
 *      `stock_balances` row for this SKU). Q2=A — we treat one big national
 *      pool because the modal will route to suppliers, not specific warehouses.
 *   - `shortage`: `need - available`. Always > 0; rows where avail >= need are
 *      filtered out server-side.
 *
 * The route returns `{shortage: []}` when no in_production orders
 * or every SKU is fully covered. Sorted by `sku` ascending for stable test
 * snapshots.
 *
 * Frontend consumes this from `CreatePOModal`'s "Auto-fill from awaiting stock"
 * button — Q3=A semantic: the returned `shortage` value is what becomes each
 * line's `qty`.
 */
export const awaitingStockShortageResponse = z.object({
  shortage: z.array(z.object({
    sku: z.string().min(1),
    // 0076 (Loo 2026-05-10): per-(sku, attrs) granularity. When dealer orders
    // capture color/gap (order_lines.attrs), aggregation now keys by
    // (sku, attrs) so CreatePOModal can pre-fill the cascade picker instead
    // of forcing manual re-selection. NULL maps to mattress lines (no extras)
    // and any pre-cascade legacy rows.
    attrs: z.record(z.unknown()).nullable(),
    need: z.number().int().nonnegative(),
    available: z.number().int(),
    shortage: z.number().int().positive(),
    // 2026-05-18 (Loo) — per-source-SO breakdown. Populated only when the
    // request carries `?dls=...`; empty array on global (no-dls) calls.
    // Used by CreatePOModal to fan out the auto-fill into one PO per source
    // SO (per-SO auto-split, Phase 3 of the per-SO PO refactor 2026-05-18).
    //
    // Invariant: sum-across-bySo of (need, available, shortage) equals the
    // row-level totals. Entries with shortage=0 are kept so the FE knows
    // which SOs contributed to a (sku, attrs) row even when fully covered.
    bySo: z.array(z.object({
      so: z.number().int(),
      need: z.number().int().nonnegative(),
      available: z.number().int().nonnegative(),
      shortage: z.number().int().nonnegative(),
    })).default([]),
  })),
  // 2026-05-16 (Loo) — bundle-scope companion: when the request carries
  // `?dls=...`, the route returns one row per selected so with its delivery
  // date so CreatePOModal can show `#1004 · 2026-06-15` per order instead of
  // a flat number list. Always [] in the global (no-dls) call to avoid
  // shipping the entire awaiting cohort.
  orders: z.array(z.object({
    so: z.number().int(),
    deliveryDate: z.string().nullable(),
  })).default([]),
});
export type AwaitingStockShortageResponse = z.infer<typeof awaitingStockShortageResponse>;

/**
 * `setThresholdInput` — POST /api/operation/warehouses/:warehouseId/skus/:sku/threshold
 * (Phase 4.5 Chunk 2 Sprint D Task 19). Body shape for the inline-edit Save
 * button on `OperationWarehouse` rows. UPDATEs (or UPSERTs if the row is
 * absent) the matching `stock_balances.low_threshold` + `high_threshold` pair.
 *
 * Per migration 0054:
 *   - `low_threshold` fires the alert pill when `(qty - reserved) < low_threshold`.
 *     NULL means "no alert configured".
 *   - `high_threshold` is the replenishment ceiling used by CreatePOModal's
 *     "Suggest from alerts" button. NULL means "fall back to low * 2".
 *   - Per-column CHECK enforces `>= 0 (or NULL)`.
 *   - Table-level CHECK `stock_balances_threshold_order` enforces
 *     `high_threshold >= low_threshold` whenever both are non-NULL.
 *
 * The zod refinement here mirrors the SQL CHECK so we 422 at the API edge
 * instead of bouncing off Postgres at 500/SQLSTATE 23514. Path params
 * (`:warehouseId` uuid + `:sku` text) are NOT part of the body schema —
 * they live on the route.
 */
export const setThresholdInput = z.object({
  low: z.number().int().nonnegative().nullable(),
  high: z.number().int().nonnegative().nullable(),
}).strict().refine(
  (data) => data.low === null || data.high === null || data.high >= data.low,
  { message: "high must be >= low when both are set", path: ["high"] },
);
export type SetThresholdInput = z.infer<typeof setThresholdInput>;

/**
 * `listMovementsQuery` — GET /api/operation/movements query string (M4 Task 3).
 *
 * Filters per spec §18.6 (OperationMovements page F3):
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

/**
 * `OperationBadgesResponse` — GET /api/operation/badges (Loo 2026-05-10).
 *
 * Sidebar action-count feed. Each numeric field maps 1:1 to a nav item that
 * carries a red-dot badge in `OperationSidebar`:
 *   - orders       → Pipeline → Orders         (in_production)
 *   - procurement  → Pipeline → Procurement    (Pickup-action POs)
 *
 * Other roles use the same `{ key: count }` shape under their own routes
 * (e.g. /api/supplier/badges, /api/partner/badges) so the sidebar wrapper
 * can be generic.
 */
export const OperationBadgesResponse = z.object({
  orders: z.number().int().nonnegative(),
  procurement: z.number().int().nonnegative(),
  serviceNotes: z.number().int().nonnegative().default(0),
  // 0152 (Loo 2026-05-31) — orders an LP rejected, unseen since last view.
  // Folded into the Orders sidebar tab badge (the reselect surface lives in
  // the Orders view).
  lpRejected: z.number().int().nonnegative().default(0),
});
export type OperationBadgesResponse = z.infer<typeof OperationBadgesResponse>;

/**
 * `OperationReceiveThreadsInput` — POST /api/operation/threads/receive-batch
 * (migration 0107, supplier per-thread pickup feature).
 *
 * Maps to RPC `operation_receive_threads(p_thread_ids, p_do_number,
 * p_do_file_path, p_do_note)`. The own_logistics counterpart to
 * `partnerPickupBatchInput`: when an own_logistics supplier delivers ready
 * threads to an HQ warehouse, operation batch-acks them via this route. Server
 * creates a `po_pickup_events` row with `ack_role='operation'`, stamps
 * `pickup_event_id` onto every thread, advances `operation_stage` to
 * `ready_to_dispatch` (or the appropriate next stage per SOP), and flips PO
 * `sup_status` to `delivered` once every thread is received.
 *
 * Unlike `partnerPickupBatchInput`, there is no `poId` here — threads can span
 * a single PO (typical) but the RPC infers the parent PO from the thread set
 * and rejects mixed-PO arrays.
 *
 * `signed` must be literal `true` — same "I have signed the DO on receipt"
 * gate as partner-side. `doFilePath` is the canonical Storage path from the
 * `/api/storage/dos/sign-upload` flow.
 */
export const OperationReceiveThreadsInput = z.object({
  threadIds: z.array(z.string().uuid()).min(1),
  doNumber: z.string().trim().min(3).max(50),
  doFilePath: z.string().trim().min(1).max(500),
  doNote: z.string().max(500).optional(),
  signed: z.literal(true),
}).strict();
export type OperationReceiveThreadsInput = z.infer<typeof OperationReceiveThreadsInput>;
