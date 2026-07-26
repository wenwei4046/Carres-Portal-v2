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

/** 0264 — product families an offer / service package can belong to. */
export const rentalCategorySchema = z.enum(["mattress", "bedframe", "sofa", "accessory"]);

const servicePackageFields = z
  .object({
    name: z.string().trim().min(1).max(120),
    serviceType: z.enum(["cleaning", "repair", "other"]).default("cleaning"),
    durationMonths: z.number().int().min(1).max(120),
    visitsPerYear: z.number().int().min(1).max(12),
    // Standalone selling price (RM); 0 = not sold standalone (free-attach only).
    price: z.number().nonnegative().default(0),
    // Optional sellable service-category SKU; null = no SKU link. 0264: the
    // create route MINTS this from serviceSkuCode() when omitted.
    sku: z.string().trim().min(1).max(60).nullable().optional(),
    // 0264 — drives the SVC-{MAT|BF|SOFA|ACC}-… token + the offer filter.
    category: rentalCategorySchema.nullable().optional(),
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

/** 0264 — one free gift (GWP) riding a price row: a real SKU + a qty. */
export const rentalGiftSchema = z
  .object({ sku: z.string().trim().min(1).max(60), qty: z.number().int().min(1).max(99) })
  .strict();

const rentalPlanFields = z
  .object({
    // 0264 — NULL only on a `combo` line (a combo has no sellable code).
    sku: z.string().trim().min(1).max(60).nullable().optional(),
    termMonths: z.number().int().positive(),
    monthlyFee: z.number().nonnegative(),
    // % of every collected month to the supplier / the selling dealer base.
    supplierRatePct: z.number().min(0).max(100).default(0),
    commissionBasePct: z.number().min(0).max(100).default(0),
    // Service package included free with this rental; null = none.
    includedPackageId: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
    // 0264 — the parent offer, the sofa targets and the gifts.
    offerId: z.string().uuid().nullable().optional(),
    comboId: z.string().uuid().nullable().optional(),
    lineKind: z.enum(["unit", "compartment", "combo"]).optional(),
    gifts: z.array(rentalGiftSchema).max(20).optional(),
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

/** A rent line aims at EXACTLY one target: a SKU (unit / compartment line) or
 *  a sofa combo — the DDL says the same (rental_plans_one_target, 0264). */
const oneTarget = (d: { sku?: string | null; comboId?: string | null }) =>
  (d.sku != null && d.comboId == null) || (d.sku == null && d.comboId != null);
const ONE_TARGET_MSG = {
  message: "a plan needs exactly one target: a sku, or a comboId",
  path: ["sku"],
};

/** Create a rental plan. Split rates default 0; `active` defaults false server-side. */
export const rentalPlanInputSchema = rentalPlanFields
  .refine(splitCap, SPLIT_CAP_MSG)
  .refine(oneTarget, ONE_TARGET_MSG);
export type RentalPlanInput = z.infer<typeof rentalPlanInputSchema>;

/** Patch a rental plan — every field of create is optional. The split cap is
 *  enforced when both rates travel together; a lone-rate patch is bounded by
 *  the DB CHECK (0253). */
export const rentalPlanPatchSchema = rentalPlanFields.partial().refine(splitCap, SPLIT_CAP_MSG);
export type RentalPlanPatchInput = z.infer<typeof rentalPlanPatchSchema>;

// ── rental_offers + buy prices + offer services (0264) ─────────────────────

/** One priced option value in the overlay. `null` price = inherit (a fabric
 *  colour follows its series); an explicit 0 means "free, deliberately". */
const optionValueSchema = z
  .object({
    on: z.boolean().optional(),
    oneTime: z.number().min(0).max(1_000_000).nullable().optional(),
    monthly: z.number().min(0).max(100_000).nullable().optional(),
  })
  .strict();

/** A fabric series: its own price + the per-colour overrides. */
const fabricSeriesSchema = optionValueSchema.extend({
  colors: z.record(optionValueSchema).optional(),
});

/** One option group of the overlay — pool values, or fabric series. */
const optionGroupSchema = z
  .object({
    required: z.boolean().optional(),
    values: z.record(optionValueSchema).optional(),
    series: z.record(fabricSeriesSchema).optional(),
  })
  .strict();

/** A manual surcharge slot (principal-authored; a store may tick an optional
 *  one but can never type an amount — guardrail #4). */
export const rentalSurchargeSchema = z
  .object({
    code: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    oneTime: z.number().min(0).max(1_000_000).optional(),
    monthly: z.number().min(0).max(100_000).optional(),
    required: z.boolean().optional(),
  })
  .strict();

const rentalOfferFields = z
  .object({
    modelId: z.string().uuid(),
    pricingMode: z.enum(["variant", "compartment", "combo", "both"]).optional(),
    rentEnabled: z.boolean().optional(),
    buyEnabled: z.boolean().optional(),
    termsMonths: z.array(z.number().int().positive().max(600)).max(6).optional(),
    optionPrices: z.record(optionGroupSchema).optional(),
    surcharges: z.array(rentalSurchargeSchema).max(20).optional(),
    supplierRatePct: z.number().min(0).max(100).optional(),
    commissionBasePct: z.number().min(0).max(100).optional(),
    active: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();

/** Create an offer — one per model (UNIQUE model_id → 409 at the route). */
export const rentalOfferInputSchema = rentalOfferFields.refine(splitCap, SPLIT_CAP_MSG);
export type RentalOfferInput = z.infer<typeof rentalOfferInputSchema>;

/** Patch an offer. `modelId` is NOT patchable — re-pointing an authored offer
 *  at another model would silently re-price live agreements' parent. */
export const rentalOfferPatchSchema = rentalOfferFields
  .omit({ modelId: true })
  .partial()
  .refine(splitCap, SPLIT_CAP_MSG);
export type RentalOfferPatchInput = z.infer<typeof rentalOfferPatchSchema>;

const rentalBuyPriceFields = z
  .object({
    sku: z.string().trim().min(1).max(60).nullable().optional(),
    comboId: z.string().uuid().nullable().optional(),
    // null = sell at whatever SKU Master says (no override for this offer).
    price: z.number().min(0).max(10_000_000).nullable().optional(),
    gifts: z.array(rentalGiftSchema).max(20).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const rentalBuyPriceInputSchema = rentalBuyPriceFields.refine(oneTarget, ONE_TARGET_MSG);
export type RentalBuyPriceInput = z.infer<typeof rentalBuyPriceInputSchema>;

export const rentalBuyPricePatchSchema = rentalBuyPriceFields.partial();
export type RentalBuyPricePatchInput = z.infer<typeof rentalBuyPricePatchSchema>;

const rentalOfferServiceFields = z
  .object({
    packageId: z.string().uuid(),
    // Which lane gets it free; null = never free (always paid).
    freeLane: z.enum(["rent", "buy", "both"]).nullable().optional(),
    // How many visits are on us when free; null = all of the package's visits.
    freeVisits: z.number().int().min(0).max(120).nullable().optional(),
    monthlyPrice: z.number().min(0).max(100_000).nullable().optional(),
    outrightPrice: z.number().min(0).max(1_000_000).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();

export const rentalOfferServiceInputSchema = rentalOfferServiceFields;
export type RentalOfferServiceInput = z.infer<typeof rentalOfferServiceInputSchema>;

export const rentalOfferServicePatchSchema = rentalOfferServiceFields.omit({ packageId: true }).partial();
export type RentalOfferServicePatchInput = z.infer<typeof rentalOfferServicePatchSchema>;

// ── rental_agreement_templates (0267) ──────────────────────────────────────

/** One block of the wording. `text` may carry `{{tokens}}`. */
export const agreementBlockSchema = z
  .object({
    kind: z.enum(["title", "subtitle", "h2", "p", "li"]),
    text: z.string().min(1).max(4000),
  })
  .strict();

/**
 * The rent-to-own contract's `doc_key` — the one document a rental is signed
 * against. Mirrored (not imported) by 0279's
 * `rental_current_agreement_template()` default, the same way the HR-P6 metric
 * list is a shared constant mirrored by a CHECK: the DB cannot import TypeScript,
 * so the pair is kept honest by naming the mirror in both places.
 */
export const RENTAL_AGREEMENT_DOC_KEY = "rent_to_own" as const;

/**
 * Author a NEW version of an agreement's wording. `version` is server-assigned
 * (max + 1 for the doc_key) — a version is immutable once signed against, so
 * the client never picks one.
 */
export const agreementTemplateInputSchema = z
  .object({
    docKey: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    bindsTo: z.array(rentalCategorySchema).max(4).optional(),
    body: z.array(agreementBlockSchema).min(1).max(400),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveFrom must be YYYY-MM-DD")
      .optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type AgreementTemplateInput = z.infer<typeof agreementTemplateInputSchema>;

/** Patch what a version BINDS to / whether it is live. The wording itself is
 *  never patched — new wording is a new version. */
export const agreementTemplatePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    bindsTo: z.array(rentalCategorySchema).max(4).optional(),
    effectiveFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveFrom must be YYYY-MM-DD")
      .optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type AgreementTemplatePatchInput = z.infer<typeof agreementTemplatePatchSchema>;

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
    /**
     * 0279 — the customer's signature, as the POS pad drew it.
     *
     * REQUIRED, and that is the whole point of the migration: `step4ValidRental`
     * already refused to enable Complete without a `data:image/…`, then the
     * rental submit branch returned before the upload the ordinary order path
     * runs, so the drawing died in the browser. The API writes this to the
     * private `rental-agreements` bucket with the SERVICE client — a store JWT
     * fails that bucket's `is_internal()` INSERT policy, so a client-side upload
     * is structurally impossible and the browser must hand the bytes over.
     */
    signatureDataUrl: z
      .string()
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, "signature must be a base64 png/jpeg data URL")
      .max(2_000_000, "signature image is too large"),
    /** Who signed. Defaults to the customer on screen but stays editable — the
     *  signer may be a spouse or guardian, and the contract should say so. */
    signedName: z.string().trim().min(1).max(120),
    /** Optional by design: not every customer hands one over, and the T&C blank
     *  may be completed on paper. Excluded from the DB's all-or-nothing CHECK. */
    signedNric: z.string().trim().max(40).nullable().optional(),
    customerEmail: z.string().trim().email().nullable().optional(),
    customerAddress: z.string().trim().max(500).nullable().optional(),
    dealerId: z.string().uuid().nullable().optional(),
    salespersonId: z.string().uuid().nullable().optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD")
      .optional(),
    notes: z.string().trim().max(1000).optional(),
    /** 0275 — the Sales Order the rental now mints needs a delivery date to
     *  reach operations. Optional: without it the agreement is still approved,
     *  the order just waits in Place until someone sets one. */
    deliveryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "deliveryDate must be YYYY-MM-DD")
      .nullable()
      .optional(),
  })
  .strict();
export type CreateRentalAgreementInput = z.infer<typeof createRentalAgreementInputSchema>;
