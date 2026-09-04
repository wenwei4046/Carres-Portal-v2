import { z } from "zod";

/**
 * R6 — the warehouse login's two inputs, and ops's one.
 *
 * These schemas refuse obvious junk before a round-trip; they are NOT the rule.
 * Every rule that matters — the PO belongs to this warehouse, the line still
 * owes these units, a damaged unit carries a photo, a wrong item carries its
 * kind — lives inside `warehouse_submit_receipt` (0302), which is the only door
 * that can write a receipt (`warehouse_receipts` has no write policy at all).
 *
 * `receivedNow` is a DELTA — good units off THIS truck — and that is the whole
 * reason a stored receipt survives a wait: the running total the receive engine
 * wants is computed at check-in, against the line as it stands then. See
 * `warehouse-receipt.ts` for the full reasoning.
 */

/** Same cap as R2's receive payload — a malformed client must not be able to
 *  write an unbounded jsonb array of photo paths. */
const CLAIM_PHOTO_PATHS = z.array(z.string().min(1).max(400)).max(12);

export const warehouseSubmitReceiptInput = z
  .object({
    poId: z.string().min(1).max(100),
    doNumber: z.string().trim().min(3, "DO number is required").max(64),
    doFilePath: z.string().trim().min(1, "A photo of the signed DO is required").max(500),
    note: z.string().trim().max(500).optional(),
    /** 0426 — arrival photo/video evidence beside the signed DO. */
    arrivalEvidence: z
      .array(
        z.object({
          path: z.string().min(1).max(400),
          kind: z.enum(["photo", "video"]),
        }),
      )
      .max(30)
      .optional(),
    /** 0426 — extra goods, recorded separately; never Inventory, never
     *  pending arithmetic. */
    extraLines: z
      .array(
        z.object({
          sku: z.string().min(1).max(120),
          qty: z.number().int().positive(),
          note: z.string().max(300).optional(),
        }),
      )
      .max(50)
      .optional(),
    lines: z
      .array(
        z.object({
          id: z.string().uuid(),
          // All three optional so a line the warehouse did not touch can ride
          // along as zeroes; the RPC drops empty lines from what it stores.
          receivedNow: z.number().int().nonnegative().optional(),
          damagedQty: z.number().int().nonnegative().optional(),
          wrongItemQty: z.number().int().nonnegative().optional(),
          damagedPhotos: CLAIM_PHOTO_PATHS.optional(),
          wrongItemClaimType: z.string().min(1).max(40).optional(),
          wrongItemPhotos: CLAIM_PHOTO_PATHS.optional(),
          /** 0426 — one physical result per governed expected Unit
           *  (ERP-ARCHITECTURE §3.4). */
          units: z
            .array(
              z.object({
                unitCode: z.string().min(3).max(30),
                outcome: z.enum([
                  "received",
                  "received_with_issue",
                  "not_received",
                ]),
                issueKind: z.enum(["damaged", "wrong_item"]).optional(),
                note: z.string().max(300).optional(),
              }),
            )
            .max(500)
            .optional(),
        }),
      )
      .min(1),
  })
  .strict();
export type WarehouseSubmitReceiptInput = z.infer<
  typeof warehouseSubmitReceiptInput
>;

/**
 * Ops sends a count back. The reason is REQUIRED here, in the RPC and in a
 * CHECK constraint: a review that can only approve is not a review, and a
 * rejection with no reason cannot be acted on by the person who has to recount
 * the pallet.
 */
export const warehouseReceiptReturnInput = z
  .object({
    reason: z.string().trim().min(1, "Say what the warehouse must fix").max(500),
  })
  .strict();
export type WarehouseReceiptReturnInput = z.infer<
  typeof warehouseReceiptReturnInput
>;
