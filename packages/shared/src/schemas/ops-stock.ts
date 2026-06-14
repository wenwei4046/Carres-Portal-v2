import { z } from "zod";

/**
 * Per-unit stock register actions — Phase A step 5 (migration 0137).
 * Operation-facing only. Carres Klang scope for V1 (other WHs continue
 * aggregate-only).
 */

export const opsStockConditionSchema = z.enum([
  "new",
  "exhibition",
  "old",
  "damaged",
]);
export type OpsStockCondition = z.infer<typeof opsStockConditionSchema>;

export const opsStockStatusSchema = z.enum([
  // 0153 added 'incoming' (unit minted at PO-open, not yet arrived) +
  // 'voided' (PO cancelled). The /inventory grid returns these alongside the
  // physical-stock states, so the contract must allow them.
  "incoming",
  "free",
  "reserved",
  "sold",
  "transferred",
  "voided",
]);
export type OpsStockStatus = z.infer<typeof opsStockStatusSchema>;

/** POST /api/ops/stock/reserve */
export const opsStockReserveInputSchema = z.object({
  sku: z.string().trim().min(1),
  ref: z.string().trim().min(1),
  condition: opsStockConditionSchema.optional(),
  warehouseId: z.string().uuid().optional(),
});
export type OpsStockReserveInput = z.infer<typeof opsStockReserveInputSchema>;

/** POST /api/ops/stock/release */
export const opsStockReleaseInputSchema = z.object({
  itemId: z.string().uuid(),
});
export type OpsStockReleaseInput = z.infer<typeof opsStockReleaseInputSchema>;

/** POST /api/ops/stock/reassign */
export const opsStockReassignInputSchema = z.object({
  itemId: z.string().uuid(),
  newRef: z.string().trim().min(1),
});
export type OpsStockReassignInput = z.infer<typeof opsStockReassignInputSchema>;

/** POST /api/ops/stock/takeout */
export const opsStockTakeoutInputSchema = z.object({
  itemId: z.string().uuid(),
});
export type OpsStockTakeoutInput = z.infer<typeof opsStockTakeoutInputSchema>;

/** POST /api/ops/stock/flag-repair */
export const opsStockFlagRepairInputSchema = z.object({
  itemId: z.string().uuid(),
  flag: z.boolean(),
});
export type OpsStockFlagRepairInput = z.infer<typeof opsStockFlagRepairInputSchema>;

/** PATCH /api/ops/stock/:itemId/condition */
export const opsStockUpdateConditionInputSchema = z.object({
  condition: opsStockConditionSchema,
});
export type OpsStockUpdateConditionInput = z.infer<typeof opsStockUpdateConditionInputSchema>;

/** Row returned by /api/ops/stock GET endpoints (filtered subsets). */
export const opsStockItemSchema = z.object({
  id: z.string().uuid(),
  // 0153 — forced per-unit serial (id-abc123456), minted at PO-open. Nullable
  // for legacy/seed rows that pre-date the mint. The API shape() already
  // returns this; the field was just missing from the contract.
  unitCode: z.string().nullable(),
  sku: z.string(),
  warehouseId: z.string().uuid(),
  condition: opsStockConditionSchema,
  status: opsStockStatusSchema,
  reservedRef: z.string().nullable(),
  refHistory: z.array(z.string()),
  needsRepair: z.boolean(),
  supplier: z.string().nullable(),
  poNo: z.string().nullable(),
  sourceRef: z.string().nullable(),
  dateIn: z.string().nullable(),
  // 0153 — sale linkage stamped on delivery (FIFO). Optional so older
  // fixtures/constructors don't break.
  soldAt: z.string().nullable().optional(),
  soldOrderId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OpsStockItem = z.infer<typeof opsStockItemSchema>;

export const opsStockListResponseSchema = z.object({
  items: z.array(opsStockItemSchema),
  total: z.number().int(),
});
export type OpsStockListResponse = z.infer<typeof opsStockListResponseSchema>;
