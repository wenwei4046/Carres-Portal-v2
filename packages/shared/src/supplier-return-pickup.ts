import { z } from "zod";

/**
 * THE SUPPLIER COLLECTS A PURCHASE RETURN — Stock MASTER §12.8, Purchasing
 * MASTER §9.6 (owner approval 2026-09-29). Migration 0612.
 *
 * Stock's Outbound `Return to supplier` handover records the exact Units the
 * supplier's person took, who that person is, when, and the proof. Purchasing
 * only READS the result (`Not picked up` · `Partly picked up` ·
 * `Fully picked up`); nothing here decides a commercial outcome.
 */

export const supplierReturnPickupProofSchema = z.object({
  /** Object key inside the private `issue-evidence` bucket, named by the server. */
  path: z.string().trim().min(1).max(500),
  kind: z.enum(["photo", "video", "pdf"]),
});

export const supplierReturnPickupInputSchema = z.object({
  /** One request records one handover; a retry answers with the first. */
  requestId: z.string().uuid(),
  /** The exact Units the supplier's person took. Units left out stay open. */
  unitIds: z.array(z.string().uuid()).min(1).max(200),
  /** The supplier's actual collector, as they gave their name. */
  collectorName: z.string().trim().min(2).max(120),
  /** When the goods actually left. Not in the future. */
  pickedUpAt: z.string().datetime({ offset: true }),
  proof: z.array(supplierReturnPickupProofSchema).min(1).max(12),
  note: z.string().trim().max(300).optional(),
}).strict();

export type SupplierReturnPickupInput = z.infer<typeof supplierReturnPickupInputSchema>;

// The pickup words (`Not picked up` · `Partly picked up` · `Fully picked up`) are
// Purchasing's one arithmetic: `purchaseReturnPickupState` in purchase-return-record.ts.
