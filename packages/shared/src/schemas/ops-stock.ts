import { z } from "zod";

import { POOL_USE_REASONS, POOL_USE_NOTE_MAX } from "../pool-usage";
import { STOCK_HEALTH_STATES } from "../stock-health";

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

/**
 * POST /api/ops/stock/reserve
 *
 * K4 (0292): the reason is the card's locked five and is REQUIRED — taking a
 * ready-stock unit records why, and an optional reason is a reason nobody
 * fills in. It supersedes 0213's two-value `reserve_reason` column, which
 * held 0 rows on live prod and could not carry a date.
 */
export const opsStockReserveReasonSchema = z.enum(POOL_USE_REASONS);
export type OpsStockReserveReason = z.infer<typeof opsStockReserveReasonSchema>;

export const opsStockReserveInputSchema = z.object({
  sku: z.string().trim().min(1),
  ref: z.string().trim().min(1),
  condition: opsStockConditionSchema.optional(),
  warehouseId: z.string().uuid().optional(),
  reason: opsStockReserveReasonSchema,
  note: z.string().trim().max(POOL_USE_NOTE_MAX).nullish(),
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
  // K4 (0292) — the same locked reason the oldest-unit door asks for. Both
  // doors draw from the same pool, so both must answer the same question.
  reason: opsStockReserveReasonSchema,
  note: z.string().trim().max(POOL_USE_NOTE_MAX).nullish(),
});
export type OpsStockReserveItemInput = z.infer<typeof opsStockReserveItemInputSchema>;

/**
 * POST /api/ops/stock/takeout
 *
 * K4 (0294): taking a FREE unit is a pool draw and needs a reason; taking a
 * RESERVED one does not, because the draw was recorded when it was reserved.
 * The reason is therefore OPTIONAL here and the DATABASE decides which case
 * applies — the browser must not be the thing that knows a unit's real status.
 */
export const opsStockTakeoutInputSchema = z.object({
  itemId: z.string().uuid(),
  reason: opsStockReserveReasonSchema.nullish(),
  note: z.string().trim().max(POOL_USE_NOTE_MAX).nullish(),
});
export type OpsStockTakeoutInput = z.infer<typeof opsStockTakeoutInputSchema>;

/** POST /api/ops/stock/flag-repair */
export const opsStockFlagRepairInputSchema = z.object({
  itemId: z.string().uuid(),
  flag: z.boolean(),
});
export type OpsStockFlagRepairInput = z.infer<typeof opsStockFlagRepairInputSchema>;

/** POST /api/ops/stock/refurbish — send a Free unit (typically Display) into
 *  repair: it leaves the ready-stock pool (needs_repair=true) until completed. */
export const opsStockRefurbishInputSchema = z.object({
  itemId: z.string().uuid(),
});
export type OpsStockRefurbishInput = z.infer<typeof opsStockRefurbishInputSchema>;

/** POST /api/ops/stock/refurbish-complete — repair done: grade the unit up to
 *  'refurbished' (sellable as new) and return it to the Free ready-stock pool. */
export const opsStockRefurbishCompleteInputSchema = z.object({
  itemId: z.string().uuid(),
});
export type OpsStockRefurbishCompleteInput = z.infer<
  typeof opsStockRefurbishCompleteInputSchema
>;

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
  // 0218 — units represented by this record. 1 for serialized furniture (the
  // norm); >1 only for bulk accessory lines from the Klg Warehouse sheet.
  // Optional so older fixtures/constructors that pre-date the column don't break.
  qty: z.number().int().min(1).default(1).optional(),
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

// ---------------------------------------------------------------------------
// Reorder points — Ready Stock card K1 (migration 0286)
// ---------------------------------------------------------------------------

/** PUT /api/ops/stock/reorder — set (or switch off) one SKU's reorder point.
 *  `reorderPoint: 0` is the documented OFF switch, so there is no delete verb
 *  and no way to end up with a row nobody can see. */
export const opsReorderPointInputSchema = z.object({
  sku: z.string().trim().min(1),
  reorderPoint: z.coerce.number().int().min(0).max(100000),
  /** Supplier lead in CALENDAR days — a China container is ~60. */
  leadDays: z.coerce.number().int().min(0).max(365).nullish(),
  note: z.string().trim().max(200).nullish(),
});
export type OpsReorderPointInput = z.infer<typeof opsReorderPointInputSchema>;

export const opsReorderStateSchema = z.enum(["reorder", "ok", "unset"]);

/** One row of GET /api/ops/stock/reorder — the shape `computeReorderRows`
 *  returns, so the browser never recomputes what the server already decided. */
export const opsReorderRowSchema = z.object({
  sku: z.string(),
  kind: z.string().nullable(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  incoming: z.number().int(),
  cover: z.number().int(),
  reorderPoint: z.number().int().nullable(),
  leadDays: z.number().int().nullable(),
  state: opsReorderStateSchema,
  shortfall: z.number().int(),
});
export type OpsReorderRow = z.infer<typeof opsReorderRowSchema>;

export const opsReorderResponseSchema = z.object({
  rows: z.array(opsReorderRowSchema),
  /** SKUs at or below their point — the `Reorder stock` worklist count. */
  alertCount: z.number().int(),
  /** Import accessories still waiting for a number. */
  unsetCount: z.number().int(),
  /** May THIS caller edit the points? (COO duty / principal.) */
  canEdit: z.boolean(),
});
export type OpsReorderResponse = z.infer<typeof opsReorderResponseSchema>;

// ---------------------------------------------------------------------------
// Pool usage + reserve levels — Ready Stock card K4 (migration 0292)
// ---------------------------------------------------------------------------

/** PUT /api/ops/stock/reserve-level — `reserveLevel: 0` is the OFF switch, so
 *  there is no delete verb (0286's shape). */
export const opsReserveLevelInputSchema = z.object({
  sku: z.string().trim().min(1),
  reserveLevel: z.coerce.number().int().min(0).max(100000),
  note: z.string().trim().max(200).nullish(),
});
export type OpsReserveLevelInput = z.infer<typeof opsReserveLevelInputSchema>;

export const opsPoolUseReasonSchema = z.enum(POOL_USE_REASONS);
export const opsReserveLevelStateSchema = z.enum(["low", "ok", "unset"]);

/** One row of the reserve-level table — the shape `computeReserveLevelRows`
 *  returns, so the browser never recomputes what the server already decided. */
export const opsReserveLevelRowSchema = z.object({
  sku: z.string(),
  free: z.number().int(),
  reserved: z.number().int(),
  reserveLevel: z.number().int().nullable(),
  state: opsReserveLevelStateSchema,
  shortfall: z.number().int(),
});
export type OpsReserveLevelRow = z.infer<typeof opsReserveLevelRowSchema>;

export const opsUsageReasonSliceSchema = z.object({
  reason: opsPoolUseReasonSchema,
  label: z.string(),
  units: z.number().int(),
  draws: z.number().int(),
  share: z.number().int(),
});

export const opsUsageSkuSliceSchema = z.object({
  sku: z.string(),
  units: z.number().int(),
  draws: z.number().int(),
  topReason: opsPoolUseReasonSchema,
  topReasonLabel: z.string(),
});

export const opsPoolUsageEntrySchema = z.object({
  id: z.string(),
  sku: z.string(),
  qty: z.number().int(),
  reason: opsPoolUseReasonSchema,
  label: z.string(),
  note: z.string().nullable(),
  ref: z.string().nullable(),
  takenByName: z.string().nullable(),
  takenAt: z.string(),
});
export type OpsPoolUsageEntry = z.infer<typeof opsPoolUsageEntrySchema>;

/** GET /api/ops/stock/usage?period=YYYY-MM */
export const opsStockUsageResponseSchema = z.object({
  period: z.string(),
  totalUnits: z.number().int(),
  totalDraws: z.number().int(),
  byReason: z.array(opsUsageReasonSliceSchema),
  bySku: z.array(opsUsageSkuSliceSchema),
  /** The month's draws themselves, newest first — the audit trail behind the
   *  percentages, so a share nobody believes can be opened and read. */
  entries: z.array(opsPoolUsageEntrySchema),
  levels: z.array(opsReserveLevelRowSchema),
  /** SKUs sitting at or below their reserve level right now. */
  lowCount: z.number().int(),
  /** May THIS caller set the levels? (COO duty / principal.) */
  canEdit: z.boolean(),
});
export type OpsStockUsageResponse = z.infer<typeof opsStockUsageResponseSchema>;

// ---------------------------------------------------------------------------
// Stock health + proposal accuracy — Ready Stock card K5 (no migration)
// ---------------------------------------------------------------------------
// The review layer reads only: `ops_stock_items`, K1's reorder points, K4's
// reserve levels and K2's cycles. There is no input schema because there is no
// write — K5 asks one question and answers it.

export const opsStockHealthStateSchema = z.enum(STOCK_HEALTH_STATES);

export const opsStockHealthRowSchema = z.object({
  sku: z.string(),
  free: z.number().int(),
  reserved: z.number().int(),
  incoming: z.number().int(),
  cover: z.number().int(),
  reorderPoint: z.number().int().nullable(),
  keepLevel: z.number().int().nullable(),
  state: opsStockHealthStateSchema,
});
export type OpsStockHealthRow = z.infer<typeof opsStockHealthRowSchema>;

export const opsSlowMoverSchema = z.object({
  sku: z.string(),
  free: z.number().int(),
  lastSoldOn: z.string().nullable(),
  quietDays: z.number().int(),
  window: z.number().int(),
});

export const opsStockHealthCountsSchema = z.object({
  critical: z.number().int(),
  low: z.number().int(),
  over: z.number().int(),
  healthy: z.number().int(),
  unrated: z.number().int(),
});

export const opsMonthAccuracySchema = z.object({
  period: z.string(),
  reported: z.boolean(),
  withheld: z.enum(["month_not_over", "records_start_later"]).nullable(),
  askedQty: z.number().int(),
  orderedQty: z.number().int(),
  soldQty: z.number().int(),
  leftOnFloor: z.number().int(),
  movedPct: z.number().nullable(),
  rows: z.array(
    z.object({
      sku: z.string(),
      askedQty: z.number().int(),
      orderedQty: z.number().int(),
      soldQty: z.number().int(),
      leftOnFloor: z.number().int(),
      movedPct: z.number().nullable(),
    }),
  ),
});
export type OpsMonthAccuracy = z.infer<typeof opsMonthAccuracySchema>;

/** GET /api/ops/stock/health */
export const opsStockHealthResponseSchema = z.object({
  /** The one line the COO reads instead of the rows. */
  headline: z.string(),
  counts: opsStockHealthCountsSchema,
  rows: z.array(opsStockHealthRowSchema),
  slowMovers: z.array(opsSlowMoverSchema),
  slowWindows: z.array(
    z.object({
      days: z.number().int(),
      ready: z.boolean(),
      count: z.number().int(),
    }),
  ),
  /** Why the slow-moving alert is silent, when it is. Null when it is live. */
  slowWithheldReason: z.string().nullable(),
  /** Newest approved cycle first. Empty until a month has been approved. */
  accuracy: z.array(opsMonthAccuracySchema),
});
export type OpsStockHealthResponse = z.infer<typeof opsStockHealthResponseSchema>;
