import { z } from "zod";

/**
 * Rental + Service Plan base (migrations 0247-0249) — the CONFIG input zod
 * (P&M "Rental" tab: service packages + rental plans, principal-only writes)
 * plus the customer create input. One schema, two consumers (Hono route +
 * web form) — never duplicate validation logic.
 *
 * Bounds mirror the DDL CHECKs (duration 1..120, visits 1..12, rates 0..100)
 * so a payload that passes zod cannot trip the DB constraint.
 */

// ── service_packages (0248) ────────────────────────────────────────────────

const servicePackageFields = z
  .object({
    name: z.string().trim().min(1).max(120),
    serviceType: z.enum(["cleaning", "repair", "other"]).default("cleaning"),
    durationMonths: z.number().int().min(1).max(120),
    visitsPerYear: z.number().int().min(1).max(12),
    // Standalone selling price (RM); 0 = not sold standalone (free-attach only).
    price: z.number().nonnegative().default(0),
    // Optional sellable service-category SKU; null = no SKU link.
    sku: z.string().trim().min(1).max(60).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

/** Create a service package. `serviceType` defaults 'cleaning', `price` 0. */
export const servicePackageInputSchema = servicePackageFields;
export type ServicePackageInput = z.infer<typeof servicePackageInputSchema>;

/** Patch a service package — every field of create is optional. */
export const servicePackagePatchSchema = servicePackageFields.partial();
export type ServicePackagePatchInput = z.infer<typeof servicePackagePatchSchema>;

// ── rental_plans (0248) ────────────────────────────────────────────────────

const rentalPlanFields = z
  .object({
    sku: z.string().trim().min(1).max(60),
    termMonths: z.number().int().positive(),
    monthlyFee: z.number().nonnegative(),
    // % of every collected month to the supplier / the selling dealer base.
    supplierRatePct: z.number().min(0).max(100).default(0),
    commissionBasePct: z.number().min(0).max(100).default(0),
    // Service package included free with this rental; null = none.
    includedPackageId: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

/** The two split rates combined can never exceed 100% — otherwise every
 *  collected month pays out MORE than it collects (negative Carres share). */
const splitCap = (d: { supplierRatePct?: number; commissionBasePct?: number }) =>
  d.supplierRatePct === undefined ||
  d.commissionBasePct === undefined ||
  d.supplierRatePct + d.commissionBasePct <= 100;
const SPLIT_CAP_MSG = {
  message: "supplierRatePct + commissionBasePct cannot exceed 100",
  path: ["commissionBasePct"],
};

/** Create a rental plan. Split rates default 0; `active` defaults false server-side. */
export const rentalPlanInputSchema = rentalPlanFields.refine(splitCap, SPLIT_CAP_MSG);
export type RentalPlanInput = z.infer<typeof rentalPlanInputSchema>;

/** Patch a rental plan — every field of create is optional. The split cap is
 *  enforced when both rates travel together; a lone-rate patch is bounded by
 *  the DB CHECK (0253). */
export const rentalPlanPatchSchema = rentalPlanFields.partial().refine(splitCap, SPLIT_CAP_MSG);
export type RentalPlanPatchInput = z.infer<typeof rentalPlanPatchSchema>;

// ── customers (0247) ───────────────────────────────────────────────────────

/**
 * Create a customer. `phone` is the raw typed phone (5..32 chars); the
 * canonical `phone_key` is computed server-side via the pwp_phone_key helper
 * family (`phoneKeyMy`) — deliberately NOT client-supplied.
 */
export const customerInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(5).max(32),
    email: z.string().trim().email().nullable().optional(),
    address: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .strict();
export type CustomerInput = z.infer<typeof customerInputSchema>;

// ── POS rental sell lane (0255) ────────────────────────────────────────────

/**
 * Sign a rent-to-own agreement at the POS (create_rental_agreement RPC).
 * The client names a PLAN — the DB re-reads price/split from the plan row
 * inside the definer transaction, so no money travels in this payload (the
 * sofa-P4 trust-gate doctrine). Customer name+phone are MANDATORY (Loo):
 * the server upserts `customers` by canonical phone key.
 *
 * `dealerId` is honored ONLY for JWTs carrying no dealer (principal /
 * operation / finance / bd on-behalf) — a store JWT's own dealer always wins.
 * `startDate` is a plain calendar date (YYYY-MM-DD), default today MYT.
 */
export const createRentalAgreementInputSchema = z
  .object({
    planId: z.string().uuid(),
    customerName: z.string().trim().min(1).max(120),
    customerPhone: z.string().trim().min(5).max(32),
    customerEmail: z.string().trim().email().nullable().optional(),
    customerAddress: z.string().trim().max(500).nullable().optional(),
    dealerId: z.string().uuid().nullable().optional(),
    salespersonId: z.string().uuid().nullable().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD")
      .optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();
export type CreateRentalAgreementInput = z.infer<typeof createRentalAgreementInputSchema>;
