import { z } from "zod";

/**
 * Ready stock plan — card K2 (migration 0287).
 *
 * The monthly lane: propose → consolidate → approve → PO list. One schema, two
 * consumers (§9.5) — the Hono routes validate with these and the browser sends
 * exactly the same shapes.
 *
 * A note on the actors, because the card's wording and the live org differ (see
 * the migration header for the measurements): the four STAGES are real and
 * audited, but they are gated on duties that already exist rather than on a
 * "Sales Manager" seat nobody holds. `canPropose` / `canConsolidate` /
 * `canApprove` are answered by the server per request; the RPCs re-gate in SQL,
 * so these flags only decide what renders.
 */

export const planStatusSchema = z.enum([
  "collecting",
  "review",
  "approved",
  "rejected",
]);
export type PlanStatusValue = z.infer<typeof planStatusSchema>;

/** `YYYY-MM` — the cycle a plan belongs to. */
export const planPeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must be YYYY-MM");

/** POST /api/ops/stock/plan — open the cycle (idempotent per period). */
export const opsStockPlanOpenInputSchema = z.object({
  period: planPeriodSchema,
  title: z.string().trim().max(120).nullish(),
});
export type OpsStockPlanOpenInput = z.infer<typeof opsStockPlanOpenInputSchema>;

/** POST /plan/:planId/propose — my ask for one SKU. qty 0 withdraws it. */
export const opsStockPlanProposeInputSchema = z.object({
  sku: z.string().trim().min(1).max(200),
  qty: z.coerce.number().int().min(0).max(100000),
  note: z.string().trim().max(300).nullish(),
});
export type OpsStockPlanProposeInput = z.infer<
  typeof opsStockPlanProposeInputSchema
>;

/** POST /plan/:planId/consolidate — the manager's cut for one SKU. */
export const opsStockPlanConsolidateInputSchema = z.object({
  sku: z.string().trim().min(1).max(200),
  qty: z.coerce.number().int().min(0).max(100000),
  note: z.string().trim().max(300).nullish(),
});
export type OpsStockPlanConsolidateInput = z.infer<
  typeof opsStockPlanConsolidateInputSchema
>;

/** POST /plan/:planId/final — the COO edits one line before approving. */
export const opsStockPlanFinalInputSchema = z.object({
  sku: z.string().trim().min(1).max(200),
  qty: z.coerce.number().int().min(0).max(100000),
});
export type OpsStockPlanFinalInput = z.infer<typeof opsStockPlanFinalInputSchema>;

/** POST /plan/:planId/decide — approve or send back, with a remark. */
export const opsStockPlanDecideInputSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  /** Required on reject: "sent back" with no reason is not a decision. */
  remark: z.string().trim().max(500).nullish(),
});
export type OpsStockPlanDecideInput = z.infer<typeof opsStockPlanDecideInputSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const opsStockPlanProposalSchema = z.object({
  sku: z.string(),
  qty: z.number().int(),
  proposedBy: z.string(),
  proposedByName: z.string().nullable(),
  note: z.string().nullable(),
});

export const opsStockPlanRowSchema = z.object({
  sku: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  incoming: z.number().int(),
  sold30: z.number().int(),
  sold90: z.number().int(),
  weekendShare: z.number().nullable(),
  monthlyRunRate: z.number().nullable(),
  suggestedQty: z.number().int().nullable(),
  proposedQty: z.number().int(),
  proposerCount: z.number().int(),
  consolidatedQty: z.number().int().nullable(),
  approvedQty: z.number().int().nullable(),
  overSuggestion: z.boolean(),
  proposals: z.array(opsStockPlanProposalSchema),
});
export type OpsStockPlanRow = z.infer<typeof opsStockPlanRowSchema>;

/** How much real history backs the system columns — stated, never implied. */
export const opsStockPlanCoverageSchema = z.object({
  days: z.number().int(),
  firstSale: z.string().nullable(),
  archiveLinesExcluded: z.number().int(),
  canSuggest: z.boolean(),
  canWarnOverSuggestion: z.boolean(),
});
export type OpsStockPlanCoverage = z.infer<typeof opsStockPlanCoverageSchema>;

export const opsStockPlanHeaderSchema = z.object({
  id: z.string().uuid(),
  period: z.string(),
  title: z.string().nullable(),
  status: planStatusSchema,
  openedByName: z.string().nullable(),
  openedAt: z.string(),
  consolidatedByName: z.string().nullable(),
  consolidatedAt: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionRemark: z.string().nullable(),
});
export type OpsStockPlanHeader = z.infer<typeof opsStockPlanHeaderSchema>;

export const opsStockPlanResponseSchema = z.object({
  /** null when the period has no plan yet — the screen offers to open one. */
  plan: opsStockPlanHeaderSchema.nullable(),
  rows: z.array(opsStockPlanRowSchema),
  coverage: opsStockPlanCoverageSchema,
  /** The approved list Operations turns into POs. Empty until approval. */
  poList: z.array(z.object({ sku: z.string(), qty: z.number().int() })),
  /** Every period that has a plan, newest first — the cycle switcher. */
  periods: z.array(z.string()),
  /**
   * Every SKU the warehouse register knows, for the propose box. Free-text
   * Klg-sheet names (0286's finding: all 49 join to ZERO `product_skus` rows),
   * so the picker offers them rather than a catalog lookup that would match
   * nothing — and stays a free-text field so a not-yet-stocked item can be
   * asked for.
   */
  skus: z.array(z.string()),
  canPropose: z.boolean(),
  canConsolidate: z.boolean(),
  canApprove: z.boolean(),
  /** The caller's own id, so the screen can show "your ask" distinctly. */
  meId: z.string().nullable(),
});
export type OpsStockPlanResponse = z.infer<typeof opsStockPlanResponseSchema>;
