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
  "refurbished",
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
export const opsStockReserveReasonSchema = z.enum(["urgent", "exchange"]);
export type OpsStockReserveReason = z.infer<typeof opsStockReserveReasonSchema>;

export const opsStockReserveInputSchema = z.object({
  sku: z.string().trim().min(1),
  ref: z.string().trim().min(1),
  condition: opsStockConditionSchema.optional(),
  warehouseId: z.string().uuid().optional(),
  // Ready-pool usage reason (0212): urgent sale vs damage exchange.
  reason: opsStockReserveReasonSchema.optional(),
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

/** POST /api/ops/stock/reserve-item — reserve ONE specific free unit to a
 *  customer ref (the order-drawer Ready picker, Jess 2026-06-30). The operator
 *  picked the exact unit (matched to the order line via normalizeSkuKey), so we
 *  target by id rather than ops_stock_reserve's pick-oldest-by-sku. */
export const opsStockReserveItemInputSchema = z.object({
  itemId: z.string().uuid(),
  ref: z.string().trim().min(1),
});
export type OpsStockReserveItemInput = z.infer<typeof opsStockReserveItemInputSchema>;

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

/** POST /api/ops/stock — book in a new unit (or N identical units) at the
 *  warehouse (GRN-in / "+ Add stock"). Jess 2026-06-29: operation needs to add
 *  newly-arrived stock without a SQL run. status limited to free|reserved (you
 *  receive physical, available stock; sold/voided are lifecycle states). */
export const opsStockCreateInputSchema = z.object({
  sku: z.string().trim().min(1),
  condition: opsStockConditionSchema.default("new"),
  status: z.enum(["free", "reserved"]).default("free"),
  reservedRef: z.string().trim().optional(),
  supplier: z.string().trim().optional(),
  poNo: z.string().trim().optional(),
  sourceRef: z.string().trim().optional(),
  qty: z.coerce.number().int().min(1).max(200).default(1),
  warehouseId: z.string().uuid().optional(),
});
export type OpsStockCreateInput = z.infer<typeof opsStockCreateInputSchema>;

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
