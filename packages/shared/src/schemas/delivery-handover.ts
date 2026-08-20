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
    /** Object key under handover/{delivery_order_id}/ — required for Handed Over. */
    proofPath: z.string().min(1).max(500).optional(),
  })
  .strict();
export type RecordHandoverInput = z.infer<typeof recordHandoverInput>;

/** POST /api/operation/delivery-orders/:id/handover-proof/sign-upload —
 *  same photo family as the delivery photo (0280): photos only, 10 MiB. */
export const signHandoverProofUploadInput = z
  .object({
    mimeType: z.enum(DELIVERY_PHOTO_MIMES),
    sizeBytes: z.number().int().positive().max(DELIVERY_PHOTO_MAX_BYTES),
  })
  .strict();
export type SignHandoverProofUploadInput = z.infer<
  typeof signHandoverProofUploadInput
>;
