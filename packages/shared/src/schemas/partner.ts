import { z } from 'zod';

/**
 * Phase 7 — Partner role inputs (per-thread pickup batch).
 *
 * Spec: docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md Task 2.
 *
 * Partner-side schemas were previously inlined inside individual route files
 * or co-located with operation schemas (see `partnerAcceptRfdInput` /
 * `partnerRejectRfdInput` in `./operation.ts`). This file collects the new
 * partner-driven batch endpoints from the supplier per-thread pickup feature.
 */

/**
 * `partnerPickupBatchInput` — POST /api/partner/pickups/batch (migration 0107
 * + 0117 auto-DO).
 *
 * Maps to RPC `partner_pickup_threads(p_po_id, p_thread_ids, p_do_number,
 * p_do_file_path, p_do_note)`. Partner batch-acks 1+ ready threads off a single
 * factory_pickup PO in one trip: server creates a `po_pickup_events` row,
 * stamps `pickup_event_id` on every thread, and advances PO `sup_status` to
 * `partially_shipped` or `shipped` depending on remaining ready threads.
 *
 * 2026-05-16 (migration 0117) — `doNumber` is now OPTIONAL. If omitted the
 * server auto-generates one in format `DO-{poId}-{seq}`. The partner is the
 * receiving party at pickup; making them type a supplier-issued DO# was
 * backwards. `doFilePath` is also optional (paper-receipt photo is a future
 * polish). `signed` checkbox dropped — the act of clicking Pickup is the
 * acknowledgement.
 */
export const partnerPickupBatchInput = z.object({
  poId: z.string().min(1).max(50),
  threadIds: z.array(z.string().uuid()).min(1),
  doNumber: z.string().trim().min(3).max(50).optional(),
  doFilePath: z.string().trim().min(1).max(500).optional(),
  doNote: z.string().max(500).optional(),
}).strict();
export type PartnerPickupBatchInput = z.infer<typeof partnerPickupBatchInput>;
