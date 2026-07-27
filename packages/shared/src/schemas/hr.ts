import { z } from "zod";

/**
 * 0245 — HR commission portal input schemas (2026-07-25).
 * One schema, two consumers (Hono route validation + web forms) — §9.5.
 */

export const commissionMethodSchema = z.enum(["percentage", "per_model"]);
export type CommissionMethodValue = z.infer<typeof commissionMethodSchema>;

export const hrReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type HrReportQuery = z.infer<typeof hrReportQuerySchema>;

/** Upsert the method for a store (outletId null = store default) or one outlet. */
export const setCommissionSchemeInput = z.object({
  dealerId: z.string().uuid(),
  outletId: z.string().uuid().nullable(),
  method: commissionMethodSchema,
});
export type SetCommissionSchemeInput = z.infer<typeof setCommissionSchemeInput>;

/** A new effective-dated rate row — history is append-only, never rewritten. */
export const setStaffRateInput = z.object({
  salespersonId: z.string().uuid(),
  pct: z.number().min(0).max(100),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .optional(),
});
export type SetStaffRateInput = z.infer<typeof setStaffRateInput>;

export const setModelRateInput = z.object({
  modelId: z.string().uuid(),
  program: z.enum(["staff", "bd"]).optional(),
  /** null removes the per-unit rate for this model */
  perUnitAmount: z.number().min(0).max(1_000_000).nullable(),
});
export type SetModelRateInput = z.infer<typeof setModelRateInput>;

/** Replace the full tier ladder for one model in one call (small lists). */
export const setModelTiersInput = z.object({
  modelId: z.string().uuid(),
  program: z.enum(["staff", "bd"]).optional(),
  tiers: z
    .array(
      z.object({
        thresholdQty: z.number().int().min(1).max(100_000),
        bonusAmount: z.number().min(0).max(10_000_000),
      }),
    )
    .max(20),
});
export type SetModelTiersInput = z.infer<typeof setModelTiersInput>;

/** Replace the full milestone list in one call (small list). */
export const setMilestonesInput = z.object({
  program: z.enum(["staff", "bd"]).optional(),
  milestones: z
    .array(
      z.object({
        category: z.string().trim().min(1).max(40).nullable(),
        thresholdQty: z.number().int().min(1).max(100_000),
        bonusAmount: z.number().min(0).max(10_000_000),
      }),
    )
    .max(50),
});
export type SetMilestonesInput = z.infer<typeof setMilestonesInput>;

// ── 0250 — BD commission (paid by what their dealers sell) ───────────────────

export const setBdRateInput = z.object({
  userId: z.string().uuid(),
  pct: z.number().min(0).max(100),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .optional(),
});
export type SetBdRateInput = z.infer<typeof setBdRateInput>;

/** userId null clears the dealer's BD owner. Audited RPC hr_assign_dealer_bd. */
export const assignDealerBdInput = z.object({
  dealerId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
});
export type AssignDealerBdInput = z.infer<typeof assignDealerBdInput>;

// ── 0251 — BD method switch + positions; program on per-model config ─────────

export const commissionProgramSchema = z.enum(["staff", "bd"]);

export const setBdMethodInput = z.object({
  method: commissionMethodSchema,
});
export type SetBdMethodInput = z.infer<typeof setBdMethodInput>;

export const setBdPositionInput = z.object({
  userId: z.string().uuid(),
  position: z.enum(["executive", "cbo"]),
});
export type SetBdPositionInput = z.infer<typeof setBdPositionInput>;
