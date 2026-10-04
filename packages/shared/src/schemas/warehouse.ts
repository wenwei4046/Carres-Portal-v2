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
/** 0614 (§9.5): a plain storage key files a claim-level photo; `{path,
 *  unitCode}` also names the Unit the photo shows, so the per-Unit inspector
 *  can attribute it. `claimPhotoWire` reshapes it for the receive engine. */
const CLAIM_PHOTO_PATHS = z.array(z.union([
  z.string().min(1).max(400),
  z.object({ path: z.string().min(1).max(400), unitCode: z.string().min(1).max(64) }),
])).max(12);

export const warehouseSubmitReceiptInput = z
  .object({
    poId: z.string().min(1).max(100),
    doNumber: z.string().trim().min(3, "DO number is required").max(64),
    doFilePath: z.string().trim().min(1, "A photo of the signed DO is required").max(500),
    note: z.string().trim().max(500).optional(),
    /** 0601 — when the goods physically arrived (ISO with offset), captured
     *  at the count. Omitted = now. Never in the future. */
    goodsReceivedTime: z.string().datetime({ offset: true }).optional(),
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

/** Final physical report. Missing business facts must reach the receipt engine
 * unchanged so it can retain the report with blockers. Shape/size validation is
 * still enforced here; actor, Site, source and posting authority remain in SQL. */
export const warehouseConfirmationReportInput = warehouseSubmitReceiptInput.partial().extend({
  arrivalSourceId: z.string().uuid().nullish(),
  handoverPerson: z.string().max(200).optional(),
  arrivalUnits: z.array(z.object({
    stockItemId: z.string().uuid(),
    outcome: z.enum(["received", "received_with_issue", "not_received"]),
    issueKind: z.enum(["damaged", "wrong_item"]).optional(),
    note: z.string().max(300).optional(),
  }).strict()).max(200).optional(),
  poId: z.string().max(100).nullish(),
  actualSiteId: z.string().uuid().nullish(),
  doNumber: z.string().max(64).nullish(),
  doFilePath: z.string().max(500).nullish(),
  goodsReceivedTime: z.string().datetime({ offset: true }).nullish(),
  goodsReceivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  lines: z.array(warehouseSubmitReceiptInput.shape.lines.element.extend({
    id: z.string().max(100).nullish(),
    receivedNow: z.number().int().nonnegative().nullish(),
    damagedQty: z.number().int().nonnegative().nullish(),
    wrongItemQty: z.number().int().nonnegative().nullish(),
  }).strict()).max(500).optional(),
}).strict();

export const warehouseConfirmReceiptInput = z.object({
  saveKey: z.string().uuid(),
  receiptId: z.string().uuid().optional(),
  revision: z.number().int().nonnegative().optional(),
  report: warehouseConfirmationReportInput,
}).strict().refine((value) => (value.receiptId === undefined) === (value.revision === undefined), {
  message: "Receipt and revision must be supplied together",
});
export type WarehouseConfirmationReportInput = z.infer<typeof warehouseConfirmationReportInput>;
export type WarehouseConfirmReceiptInput = z.infer<typeof warehouseConfirmReceiptInput>;
