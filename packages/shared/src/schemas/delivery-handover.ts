import { z } from "zod";
import { DELIVERY_PHOTO_MIMES, DELIVERY_PHOTO_MAX_BYTES } from "./ops-order-control";

/**
 * The §4 warehouse→logistics handover chain — slice 1 (0363).
 *
 *   Ready for Handover → Handed Over → Received by Logistics
 *
 * The door input carries only what the RECORDER supplies: the receiver and
 * proof for a handover, an optional differing goods count for the receipt
 * (a discrepancy keeps both facts), a vehicle when known, a note. The duty
 * word and both companies are stamped SERVER-side from the act and the
 * document — they are deliberately absent here.
 */

/** Evidence files per act (0440): several photos and videos, never one.
 *  Images stay the 0280 photo family; videos match the Service-Case family.
 *  The limits are DISPLAYED before the operator picks files. */
export const HANDOVER_EVIDENCE_VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;
export const HANDOVER_EVIDENCE_MIMES = [
  ...DELIVERY_PHOTO_MIMES,
  ...HANDOVER_EVIDENCE_VIDEO_MIMES,
] as const;
export const HANDOVER_EVIDENCE_VIDEO_MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
export const HANDOVER_EVIDENCE_MAX_FILES = 20;

/** One stored evidence file of one handover act. */
export const handoverEvidenceFileSchema = z
  .object({
    path: z.string().min(1).max(500),
    kind: z.enum(["photo", "video"]),
  })
  .strict();
export type HandoverEvidenceFile = z.infer<typeof handoverEvidenceFileSchema>;

export const DELIVERY_HANDOVER_KINDS = [
  "ready_for_handover",
  "handed_over",
  "received_by_logistics",
] as const;

/** One goods line as one party states it: what physically moved. */
export const handoverGoodsLineSchema = z.object({
  sku: z.string().min(1).max(120),
  qty: z.number().int().min(0).max(9999),
});
export type HandoverGoodsLine = z.infer<typeof handoverGoodsLineSchema>;

/** POST /api/operation/delivery-orders/:id/handover */
export const recordHandoverInput = z
  .object({
    kind: z.enum(DELIVERY_HANDOVER_KINDS),
    /** Handed Over only — the person who actually received the goods. */
    receiverName: z.string().trim().min(1).max(120).optional(),
    /** Handed Over — the vehicle when known (§4: never invented). */
    vehicle: z.string().trim().min(1).max(80).optional(),
    /** The recorder's own goods count. Omitted = the document's derived lines. */
    goods: z.array(handoverGoodsLineSchema).max(200).optional(),
    note: z.string().trim().max(500).optional(),
    /** Object key under handover/{delivery_order_id}/ — legacy single proof.
     *  A Handed Over needs this OR at least one `evidence` file. */
    proofPath: z.string().min(1).max(500).optional(),
    /** 0440 — every evidence file of this act, photos and videos mixed.
     *  New files append; the server refuses duplicates inside one act. */
    evidence: z
      .array(handoverEvidenceFileSchema)
      .max(HANDOVER_EVIDENCE_MAX_FILES)
      .optional(),
    /** Warehouse Card 03 — the exact Unit IDs this batch physically hands
     *  over. Required for `handed_over` on a DO with a recorded exact-Unit
     *  scope; the server refuses codes outside that scope and Units already
     *  accepted (a partial batch changes only its own Units). */
    unitCodes: z.array(z.string().trim().min(1).max(40)).min(1).max(200).optional(),
  })
  .strict();
export type RecordHandoverInput = z.infer<typeof recordHandoverInput>;

/** The three per-Unit preparation facts, in their governed order. */
export const WAREHOUSE_PREP_FACTS = ["scanned", "checked", "packed"] as const;
export type WarehousePrepFact = (typeof WAREHOUSE_PREP_FACTS)[number];

/** POST /api/operation/delivery-orders/:id/outbound-prep —
 *  record scan / check / pack for exact Units of one DO scope. Duplicate
 *  facts are reconciled idempotently by the governed door. */
export const recordOutboundPrepInput = z
  .object({
    fact: z.enum(WAREHOUSE_PREP_FACTS),
    unitCodes: z.array(z.string().trim().min(1).max(40)).min(1).max(200),
  })
  .strict();
export type RecordOutboundPrepInput = z.infer<typeof recordOutboundPrepInput>;

/** POST /api/operation/delivery-orders/:id/handover-proof/sign-upload —
 *  photos (0280 family, 10 MiB) and videos (25 MiB) since 0440. */
export const signHandoverProofUploadInput = z
  .object({
    mimeType: z.enum(HANDOVER_EVIDENCE_MIMES),
    sizeBytes: z.number().int().positive().max(HANDOVER_EVIDENCE_VIDEO_MAX_BYTES),
  })
  .strict()
  .superRefine((v, c) => {
    const isVideo = (HANDOVER_EVIDENCE_VIDEO_MIMES as readonly string[]).includes(
      v.mimeType,
    );
    if (!isVideo && v.sizeBytes > DELIVERY_PHOTO_MAX_BYTES)
      c.addIssue({
        code: "custom",
        path: ["sizeBytes"],
        message: "A photo is at most 10 MB",
      });
  });
export type SignHandoverProofUploadInput = z.infer<
  typeof signHandoverProofUploadInput
>;
