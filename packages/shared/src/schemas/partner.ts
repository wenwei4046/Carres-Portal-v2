import { z } from 'zod';

/**
 * Phase 7 — Partner role inputs (per-thread pickup batch).
 *
 * Spec: docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md Task 2.
 *
 * Partner-side schemas were previously inlined inside individual route files
 * or co-located with logistics schemas (see `partnerAcceptRfdInput` /
 * `partnerRejectRfdInput` in `./logistics.ts`). This file collects the new
 * partner-driven batch endpoints from the supplier per-thread pickup feature.
 */

/**
 * `partnerPickupBatchInput` — POST /api/partner/pickups/batch (migration 0107).
 *
 * Maps to RPC `partner_pickup_batch(p_po_id, p_thread_ids, p_do_number,
 * p_do_file_path, p_do_note)`. Partner batch-acks 1+ ready threads off a single
 * factory_pickup PO in one trip: server creates a `po_pickup_events` row,
 * stamps `pickup_event_id` on every thread, and advances PO `sup_status` to
 * `picked_up` once every ready thread has been picked.
 *
 * `signed` must be literal `true` — the partner-side "I have collected and
 * signed the DO" checkbox is required by the per-thread pickup UI.
 *
 * `doFilePath` is the canonical Storage path returned by
 * `/api/storage/dos/sign-upload` after the partner streams the signed DO file
 * to the `delivery-orders` bucket.
 */
export const partnerPickupBatchInput = z.object({
  poId: z.string().min(1).max(50),
  threadIds: z.array(z.string().uuid()).min(1),
  doNumber: z.string().trim().min(3).max(50),
  doFilePath: z.string().trim().min(1).max(500),
  doNote: z.string().max(500).optional(),
  signed: z.literal(true),
}).strict();
export type PartnerPickupBatchInput = z.infer<typeof partnerPickupBatchInput>;
