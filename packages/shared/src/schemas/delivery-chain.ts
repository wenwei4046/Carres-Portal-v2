import { z } from "zod";

/**
 * Multi-leg delivery chain contract — γ architecture (migration 0156).
 *
 * Each `orders.delivery_stops` jsonb element is a "stop" along the delivery
 * route. NULL/empty delivery_stops = single-leg (use orders.delivery_partner_id
 * as today). Otherwise the array describes the sequence of partners + handoff
 * points from Carres warehouse all the way to the customer.
 *
 * One schema, two consumers — apps/api validates writes, apps/web validates
 * the data it renders. Mirrors the jsonb shape documented in the column
 * COMMENT on `orders.delivery_stops` in migration 0156.
 *
 * Backend RPCs:
 *   - set_delivery_chain(p_order_id uuid, p_stops jsonb)     — replace chain
 *   - patch_delivery_stop(p_order_id uuid, p_leg int, p_patch jsonb) — patch one leg
 *
 * API endpoints (this file is the request contract):
 *   - PUT   /api/operation/orders/:id/delivery-chain
 *   - PATCH /api/operation/orders/:id/delivery-stops/:leg
 */

/** Lifecycle status for a single leg. Mirrors values handled by the SQL
 *  patch_delivery_stop RPC (auto-stamps timestamps on transition). */
export const deliveryStopStatusSchema = z.enum([
  "pending",
  "picked_up",
  "handed_off",
  "delivered",
  "issue",
]);
export type DeliveryStopStatus = z.infer<typeof deliveryStopStatusSchema>;

/** One stop along the delivery chain. Field semantics:
 *  - leg          : 1-based index, must be contiguous within the array.
 *  - partner_id   : FK delivery_partners.id (validated server-side via RPC).
 *  - partner_name : denormalised display name (read from delivery_partners at
 *                   set-time; saved on the stop so renders don't need a join).
 *  - from_loc     : free-text origin (e.g. "Klang WH", "JB transit").
 *  - to_loc       : free-text destination (next handoff or final customer addr).
 *  - scheduled_at : planned ISO timestamp (null until operation pencils it in).
 *  - picked_up_at : when partner collected from `from_loc` (auto-stamped on
 *                   status='picked_up').
 *  - handed_off_at: when partner handed to next leg (auto-stamped on
 *                   status='handed_off'). Final leg leaves this null.
 *  - delivered_at : when final customer received (only meaningful for last
 *                   leg; auto-stamped on status='delivered').
 *  - pod_url      : Storage path to handoff/delivery photo. Frontend uploads
 *                   directly to the `delivery-orders` bucket via supabase-js,
 *                   then sets pod_url here via PATCH.
 *  - pod_signed_by: name of person who acknowledged at handoff/delivery.
 *  - notes        : free remark (operation, partner, warehouse).
 *  - status       : pending|picked_up|handed_off|delivered|issue. */
export const deliveryStopSchema = z.object({
  leg: z.number().int().positive(),
  partner_id: z.string().uuid(),
  partner_name: z.string().trim().min(1),
  from_loc: z.string().trim().min(1),
  to_loc: z.string().trim().min(1),
  scheduled_at: z.string().datetime({ offset: true }).nullish(),
  picked_up_at: z.string().datetime({ offset: true }).nullish(),
  handed_off_at: z.string().datetime({ offset: true }).nullish(),
  delivered_at: z.string().datetime({ offset: true }).nullish(),
  pod_url: z.string().nullish(),
  pod_signed_by: z.string().nullish(),
  notes: z.string().nullish(),
  status: deliveryStopStatusSchema.default("pending"),
});
export type DeliveryStop = z.infer<typeof deliveryStopSchema>;

/** Request body for PUT /api/operation/orders/:id/delivery-chain — replaces
 *  the entire chain. Empty array clears the chain (order becomes single-leg
 *  again, controlled by orders.delivery_partner_id). 20-stop sanity cap. */
export const setDeliveryChainInputSchema = z.object({
  stops: z.array(deliveryStopSchema).max(20),
});
export type SetDeliveryChainInput = z.infer<typeof setDeliveryChainInputSchema>;

/** Request body for PATCH /api/operation/orders/:id/delivery-stops/:leg —
 *  sparse patch. Frontend sends only the fields it wants to change. The
 *  server RPC auto-stamps picked_up_at / handed_off_at / delivered_at when
 *  the corresponding status transition is included in the patch — frontend
 *  doesn't need to send timestamps for the status-driven cases. `.strict()`
 *  rejects unknown keys so typos don't silently get into the jsonb blob. */
export const patchDeliveryStopInputSchema = z
  .object({
    scheduled_at: z.string().datetime({ offset: true }).nullish(),
    picked_up_at: z.string().datetime({ offset: true }).nullish(),
    handed_off_at: z.string().datetime({ offset: true }).nullish(),
    delivered_at: z.string().datetime({ offset: true }).nullish(),
    pod_url: z.string().nullish(),
    pod_signed_by: z.string().nullish(),
    notes: z.string().nullish(),
    status: deliveryStopStatusSchema.optional(),
    partner_id: z.string().uuid().optional(),
    partner_name: z.string().trim().min(1).optional(),
    from_loc: z.string().trim().min(1).optional(),
    to_loc: z.string().trim().min(1).optional(),
  })
  .strict();
export type PatchDeliveryStopInput = z.infer<typeof patchDeliveryStopInputSchema>;

/** Response shape for both endpoints — full updated chain so the frontend
 *  can mutate cached state without a follow-up GET. */
export const deliveryChainResponseSchema = z.object({
  stops: z.array(deliveryStopSchema),
});
export type DeliveryChainResponse = z.infer<typeof deliveryChainResponseSchema>;
