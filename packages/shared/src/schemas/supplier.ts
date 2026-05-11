import { z } from 'zod';

/**
 * Phase 6 — Supplier role inputs.
 *
 * Spec: docs/superpowers/specs/2026-05-09-phase-6-supplier-spec.md §5.
 *
 * Three POST routes accept body payloads; ack / start-production /
 * ready-for-pickup carry only the path :id and need no body schema.
 */

/**
 * `supplierMarkDeliveredInput` — POST /api/supplier/pos/:id/mark-delivered.
 *
 * Maps to RPC `supplier_mark_delivered(p_po_id, p_do_number, p_do_file_path,
 * p_do_note)` (migration 0094 widened the 0066 V1 signature to require the
 * signed DO file path). The frontend uploads to the `delivery-orders` Storage
 * bucket via `/api/storage/dos/sign-upload` first, captures the canonical
 * path, then sends it here. `doNote` stays optional.
 *
 * phase-6-storage-do-upload carry-forward closes here.
 */
export const supplierMarkDeliveredInput = z.object({
  doNumber: z.string().trim().min(1, 'DO number is required').max(64),
  doFilePath: z.string().trim().min(1, 'DO file is required').max(500),
  doNote: z.string().trim().max(500).optional(),
});
export type SupplierMarkDeliveredInput = z.infer<
  typeof supplierMarkDeliveredInput
>;

/**
 * `supplierPosListQuery` — GET /api/supplier/pos query string.
 *
 * `bucket` filters to one of three pipeline stages the supplier sees:
 *   po        → pending | acknowledged | in_production
 *   ready     → ready_for_pickup | pickup_assigned | pickup_accepted
 *               | shipped | reassign_needed
 *   delivered → picked_up | delivered
 *
 * Defaults to no filter (returns all rows). Mirrors proto `bucketForPO`
 * (supplier-actions.jsx:46-51) and `poStageForSupplier` (supplier-pages.jsx:8-15).
 */
export const supplierPosListQuery = z.object({
  bucket: z.enum(['po', 'ready', 'delivered']).optional(),
});
export type SupplierPosListQuery = z.infer<typeof supplierPosListQuery>;
