import { z } from "zod";

import { productCategorySchema } from "./product-category";

/**
 * Guarantee packages (migrations 0261-0263) — the SKU category Carres sells ON
 * TOP of a product, and the entitlement ledger ops claims against.
 *
 * v1 = "Mattress Guarantee" RM150 / 15 years / one-for-one replacement.
 *
 * Loo's three rulings (2026-07-26):
 *   1. the clock starts on DELIVERY, not on the order date;
 *   2. one guarantee covers ONE unit (a qty-2 line = 2 entitlements);
 *   3. a claim is ONE-SHOT — the swap spends the guarantee.
 *
 * One schema, two consumers (Hono route + web forms) — never duplicate the
 * validation. Bounds mirror the 0262 DDL CHECKs so a payload that passes zod
 * cannot trip a DB constraint.
 */

// ── terms (config, principal-owned) ────────────────────────────────────────

export const guaranteeRemedySchema = z.enum(["replace", "repair"]);
export type GuaranteeRemedy = z.infer<typeof guaranteeRemedySchema>;

const guaranteeTermFields = z
  .object({
    guaranteeSku: z.string().trim().min(1).max(60),
    label: z.string().trim().min(1).max(120),
    /** The product category a line must belong to for this guarantee to cover it. */
    coversCategory: productCategorySchema,
    coverageYears: z.number().int().min(1).max(50),
    remedy: guaranteeRemedySchema.default("replace"),
    /** The sentence printed under the guarantee block on the invoice. */
    termsText: z.string().trim().max(600).nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const guaranteeTermInputSchema = guaranteeTermFields;
export type GuaranteeTermInput = z.infer<typeof guaranteeTermInputSchema>;

export const guaranteeTermPatchSchema = guaranteeTermFields.partial();
export type GuaranteeTermPatchInput = z.infer<typeof guaranteeTermPatchSchema>;

/** A term as it travels to the client — inside the catalog bundle (so the POS
 *  can tell a guarantee SKU from an accessory in the SAME round-trip as the
 *  models) and from GET /api/guarantees/terms. */
export const guaranteeTermSchema = z.object({
  guaranteeSku: z.string(),
  label: z.string(),
  coversCategory: productCategorySchema,
  coverageYears: z.number().int(),
  remedy: guaranteeRemedySchema,
  termsText: z.string().nullable(),
  active: z.boolean(),
});
export type GuaranteeTermDto = z.infer<typeof guaranteeTermSchema>;

// ── the line stamp ─────────────────────────────────────────────────────────

/**
 * What the POS writes into `order_lines.attrs.guarantee` when the seller picks
 * the item a guarantee covers. The 0262 mint trigger reads `covers_sku` from
 * exactly this path; `coversLabel` is carried for the cart UI only.
 *
 * DELIBERATELY the only POS-side contract change: the submit pipeline
 * (DraftLine → POST /api/orders → create_order) is untouched, because `attrs`
 * is already free-form jsonb (same door sofa_build / bundle_group use).
 */
export const guaranteeLineAttrsSchema = z
  .object({
    coversSku: z.string().trim().min(1).max(60),
    coversLabel: z.string().trim().max(160).optional(),
  })
  .strict();
export type GuaranteeLineAttrs = z.infer<typeof guaranteeLineAttrsSchema>;

/** The exact jsonb an order line carries. snake on purpose — this is DB shape,
 *  read by the trigger at `attrs #>> '{guarantee,covers_sku}'`. */
export function guaranteeAttrs(coversSku: string, coversLabel?: string) {
  return {
    guarantee: {
      covers_sku: coversSku,
      ...(coversLabel ? { covers_label: coversLabel } : {}),
    },
  };
}

// ── the entitlement ledger ─────────────────────────────────────────────────

/**
 * Stored lifecycle. 'expired' is NOT written by the DB — see
 * effectiveGuaranteeStatus: expiry is derived from the date so nothing depends
 * on a nightly job running.
 */
/**
 * The customer-facing handle (0267, Loo): FOUR letters + SIX digits —
 * `ABCD123456`. Minted server-side the moment the Sales Order is created, and
 * the thing a claim is looked up by.
 *
 * The two blocks are positional on purpose: letters can only appear in the
 * first four slots and digits only in the last six, so O-vs-0 and I-vs-1 are
 * never ambiguous when someone reads it off a printed Sales Order.
 */
export const GUARANTEE_ID_REGEX = /^[A-Z]{4}[0-9]{6}$/;

/** True when the typed text IS a guarantee ID (case-insensitive, spaces ok). */
export function isGuaranteeId(raw: string): boolean {
  return GUARANTEE_ID_REGEX.test(normalizeGuaranteeId(raw));
}

/** What the operator typed → the stored form. Uppercases and drops spaces and
 *  dashes, so `abcd-123 456` finds `ABCD123456`. */
export function normalizeGuaranteeId(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export const guaranteeStatusSchema = z.enum([
  "pending", // sold, awaiting delivery — the clock has not started
  "active", // delivered and inside the window
  "claimed", // spent: we swapped the item (terminal)
  "expired", // past expires_on (derived)
  "void", // order cancelled or the line was removed
]);
export type GuaranteeStatus = z.infer<typeof guaranteeStatusSchema>;

export type GuaranteeEntitlementDto = {
  id: string;
  /** The `ABCD123456` handle — null once claimed (the ID is retired). */
  guaranteeId: string | null;
  /** The retired handle, kept so a re-presented ID reads "already claimed on
   *  <date>" rather than the indistinguishable "not found". */
  claimedGuaranteeId: string | null;
  // what was sold
  orderId: string;
  so: number | null;
  /** The ORDER's status (raw DB word — the UI maps it through orderStatusWord).
   *  Loo 2026-07-26: the desk's STATUS column shows where the ORDER is
   *  (placed / delivered / …); the guarantee's own state renders under its ID. */
  orderStatus: string | null;
  orderLineId: string | null;
  guaranteeSku: string;
  guaranteeLabel: string | null;
  unitNo: number;
  // what it covers
  coversLineId: string | null;
  coversSku: string | null;
  coversModelId: string | null;
  coversLabel: string | null;
  // who owns it — the three track-back axes
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  phoneKey: string | null;
  // the promise
  coverageYears: number;
  remedy: GuaranteeRemedy;
  startsOn: string | null;
  expiresOn: string | null;
  status: GuaranteeStatus;
  /** `status` with date-based expiry applied — what the UI must show. */
  effectiveStatus: GuaranteeStatus;
  // the claim
  claimedAt: string | null;
  claimCaseId: string | null;
  claimCaseNo: string | null;
  claimNotes: string | null;
  replacementSku: string | null;
  voidReason: string | null;
};

/**
 * Expiry is a DATE FACT, not a stored state — an 'active' row whose expires_on
 * has passed is expired whether or not any job ever ran. Every surface (list,
 * badge, invoice, claim gate) must read this, never the raw column.
 */
export function effectiveGuaranteeStatus(
  status: GuaranteeStatus,
  expiresOn: string | null,
  today: string = new Date().toISOString().slice(0, 10),
): GuaranteeStatus {
  if (status !== "active") return status;
  if (expiresOn && expiresOn < today) return "expired";
  return "active";
}

/** Only a live, in-window, unclaimed guarantee can be swapped (ruling #3).
 *  Mirrors the guarantee_claim RPC guard so the UI never offers a doomed click. */
export function isGuaranteeClaimable(g: {
  status: GuaranteeStatus;
  expiresOn: string | null;
}): boolean {
  return effectiveGuaranteeStatus(g.status, g.expiresOn) === "active";
}

/** The ID to SHOW for a row, live or spent — the UI should never have to
 *  decide which column to read. */
export function displayGuaranteeId(g: {
  guaranteeId: string | null;
  claimedGuaranteeId: string | null;
}): string | null {
  return g.guaranteeId ?? g.claimedGuaranteeId;
}

/** Customer-facing one-liner for the invoice / drawer badge. */
export function guaranteeCoverageLine(g: {
  coverageYears: number;
  remedy: GuaranteeRemedy;
  coversLabel: string | null;
  expiresOn: string | null;
}): string {
  const what = g.coversLabel ?? "the covered item";
  const remedy = g.remedy === "replace" ? "one-for-one replacement" : "repair";
  const till = g.expiresOn ? ` · valid till ${g.expiresOn}` : " · starts on delivery";
  return `${g.coverageYears}-year guarantee on ${what} — ${remedy}${till}`;
}

// ── route payloads ─────────────────────────────────────────────────────────

/** GET /api/guarantees — Loo's three track-back axes in one box: `q` matches a
 *  SO number, a customer name, a customer id, or a phone. */
export const guaranteeListQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    status: guaranteeStatusSchema.optional(),
    orderId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();
export type GuaranteeListQuery = z.infer<typeof guaranteeListQuerySchema>;

export type GuaranteeListResponse = {
  items: GuaranteeEntitlementDto[];
  truncated: boolean;
};

export const guaranteeClaimInputSchema = z
  .object({
    caseId: z.string().uuid().nullable().optional(),
    /** The SKU actually handed over in the swap — kept for COGS follow-up. */
    replacementSku: z.string().trim().max(60).nullable().optional(),
    notes: z.string().trim().max(600).nullable().optional(),
  })
  .strict();
export type GuaranteeClaimInput = z.infer<typeof guaranteeClaimInputSchema>;

/** Ops re-points an unassigned guarantee (import / ops-added) at a real line. */
export const guaranteeAttachInputSchema = z
  .object({ orderLineId: z.string().uuid() })
  .strict();
export type GuaranteeAttachInput = z.infer<typeof guaranteeAttachInputSchema>;
