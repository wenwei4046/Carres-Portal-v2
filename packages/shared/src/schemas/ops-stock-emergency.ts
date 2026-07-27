import { z } from "zod";
import {
  EMERGENCY_REASONS,
  EMERGENCY_STATUSES,
  EMERGENCY_MAX_QTY,
  EMERGENCY_NOTE_MAX,
  reasonNeedsNote,
  type EmergencyReason,
} from "../emergency-stock-request";

/**
 * Urgent restock — card K3 (migration 0290).
 *
 * The lane: raise → the COO decides → somebody raises the PO. No consolidation
 * step, no month. One schema, two consumers (§9.5): the Hono routes validate
 * with these and the browser sends exactly the same shapes.
 *
 * The reason list and the `Other needs words` rule are NOT restated here — they
 * are imported from the engine, so the enum on the wire, the disabled button
 * and the database CHECK cannot drift apart.
 */

export const emergencyReasonSchema = z.enum(EMERGENCY_REASONS);
export const emergencyStatusSchema = z.enum(EMERGENCY_STATUSES);

/** POST /api/ops/stock-emergency — raise one urgent ask for one item. */
export const opsStockEmergencyRaiseInputSchema = z
  .object({
    sku: z.string().trim().min(1).max(200),
    qty: z.coerce.number().int().min(1).max(EMERGENCY_MAX_QTY),
    reason: emergencyReasonSchema,
    note: z.string().trim().max(EMERGENCY_NOTE_MAX).nullish(),
  })
  .refine((v) => !reasonNeedsNote(v.reason as EmergencyReason) || !!v.note?.trim(), {
    message: "say what the reason is when you pick Other",
    path: ["note"],
  });
export type OpsStockEmergencyRaiseInput = z.infer<
  typeof opsStockEmergencyRaiseInputSchema
>;

/**
 * POST /:id/decide — the COO answers. There is no separate "edit the quantity"
 * step: the card says this lane skips consolidation, so cutting the number and
 * approving it are ONE act, answerable in one click.
 */
export const opsStockEmergencyDecideInputSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    /** Defaults to the requested quantity when the COO approves as asked. */
    qty: z.coerce.number().int().min(0).max(EMERGENCY_MAX_QTY).nullish(),
    /** Required on reject: turning an urgent ask down without a word is not an
     *  answer — the person raised it because they believe a sale is at risk. */
    remark: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.decision !== "reject" || !!v.remark?.trim(), {
    message: "say why before turning it down",
    path: ["remark"],
  });
export type OpsStockEmergencyDecideInput = z.infer<
  typeof opsStockEmergencyDecideInputSchema
>;

/** POST /:id/ordered — the purchase order has been raised. No body. */
export const opsStockEmergencyOrderedInputSchema = z.object({});

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const opsStockEmergencyRowSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  qty: z.number().int(),
  reason: emergencyReasonSchema,
  reasonLabel: z.string(),
  note: z.string().nullable(),
  requestedBy: z.string(),
  requestedByName: z.string().nullable(),
  requestedAt: z.string(),
  status: emergencyStatusSchema,
  approvedQty: z.number().int().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionRemark: z.string().nullable(),
  orderedByName: z.string().nullable(),
  orderedAt: z.string().nullable(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  incoming: z.number().int(),
  coveredByFreeStock: z.boolean(),
  waitingDays: z.number().int().nullable(),
});
export type OpsStockEmergencyRow = z.infer<typeof opsStockEmergencyRowSchema>;

export const opsStockEmergencyResponseSchema = z.object({
  rows: z.array(opsStockEmergencyRowSchema),
  pendingCount: z.number().int(),
  /** Approved and not yet ordered — the urgent handover to Operations. */
  poList: z.array(
    z.object({
      sku: z.string(),
      qty: z.number().int(),
      requestCount: z.number().int(),
    }),
  ),
  /** Every SKU the warehouse register knows, for the item picker (0286's
   *  finding: free-text Klg-sheet names, so a catalog lookup would match
   *  nothing — and the field stays free text so a new item can be asked for). */
  skus: z.array(z.string()),
  /** Any operation login may raise an urgent ask — it is the person on the
   *  floor who sees the shelf empty. */
  canRaise: z.boolean(),
  /** `stock_planner` — the COO's call, exactly as in the monthly lane. */
  canDecide: z.boolean(),
  /** `po_duty_editor` — the person who actually raises purchase orders. */
  canMarkOrdered: z.boolean(),
  meId: z.string().nullable(),
});
export type OpsStockEmergencyResponse = z.infer<
  typeof opsStockEmergencyResponseSchema
>;
