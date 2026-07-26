import { z } from "zod";

import { canonicalSize } from "../mattress-sizes";
import { productCategorySchema, type ProductCategory } from "./product-category";

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

/**
 * Authoring a whole guarantee PRODUCT in one call (Loo 2026-07-26, from the
 * + New SKU form): the product_model, its single SKU and the terms row are one
 * indivisible thing — a half-created guarantee (a SKU with no terms) would be
 * sellable and untraceable, which is the exact failure this feature exists to
 * prevent. So the server does all three or none.
 *
 * The SKU CODE and the display label are DERIVED server-side from the scope +
 * years, so two people authoring the same cover can't invent two spellings.
 */
export const guaranteeProductInputSchema = z
  .object({
    /** What it covers. */
    coversCategory: productCategorySchema,
    coversModelId: z.string().uuid().nullable().optional(),
    coversVariants: z.array(z.string().trim().min(1)).max(20).nullable().optional(),
    coversComboId: z.string().uuid().nullable().optional(),
    coversCompartmentId: z.string().uuid().nullable().optional(),
    /** How long. */
    coverageYears: z.number().int().min(1).max(50),
    remedy: guaranteeRemedySchema.default("replace"),
    /** Money + copy. */
    price: z.number().nonnegative().default(0),
    description: z.string().trim().max(600).nullable().optional(),
    /** Optional override of the derived name. */
    label: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict()
  .refine(
    (d) => !(d.coversComboId && d.coversCompartmentId),
    { message: "pick a combo OR a compartment, not both", path: ["coversComboId"] },
  )
  .refine(
    (d) => !((d.coversComboId || d.coversCompartmentId) && d.coversCategory !== "sofa"),
    { message: "combo / compartment scope is sofa-only", path: ["coversCategory"] },
  )
  .refine(
    (d) =>
      !d.coversVariants ||
      d.coversVariants.length === 0 ||
      d.coversCategory === "mattress" ||
      d.coversCategory === "bedframe" ||
      d.coversCategory === "sofa",
    {
      // Accessories carry no variant axis at all (Loo). Sofa's axis is the seat
      // height, from its own Maintenance pool (0271).
      message: "variants only apply to mattress / bedframe / sofa",
      path: ["coversVariants"],
    },
  );
export type GuaranteeProductInput = z.infer<typeof guaranteeProductInputSchema>;

/**
 * The SKU code for an authored guarantee: `GRT-<SCOPE>-<YEARS>Y`, uppercased
 * and punctuation-stripped so it stays a clean join key like every other code.
 * Derived, never typed — see guaranteeProductInputSchema.
 */
export function deriveGuaranteeSkuCode(parts: {
  coversCategory: string;
  modelKey?: string | null;
  variants?: string[] | null;
  compartmentCode?: string | null;
  comboLabel?: string | null;
  coverageYears: number;
}): string {
  const chunk = (v: string) =>
    v
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const bits = ["GRT"];
  if (parts.compartmentCode) bits.push(chunk(parts.compartmentCode));
  else if (parts.comboLabel) bits.push(chunk(parts.comboLabel));
  else if (parts.modelKey) bits.push(chunk(parts.modelKey));
  else bits.push(chunk(parts.coversCategory));
  const vs = (parts.variants ?? []).filter(Boolean);
  if (vs.length === 1) bits.push(chunk(vs[0]!));
  else if (vs.length > 1) bits.push(`${vs.length}SIZES`);
  bits.push(`${parts.coverageYears}Y`);
  return bits.filter(Boolean).join("-");
}
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
  // 0270 scope — NULL at any level means ANY at that level, which is what keeps
  // the pre-0270 term (every field null) covering the whole category as before.
  /** null = any model in the category. */
  coversModelId: z.string().uuid().nullable().default(null),
  /** null / empty = any. mattress+bedframe = the SIZE; sofa = the SEAT HEIGHT
   *  (0271). Every list is that category's own Maintenance pool. */
  coversVariants: z.array(z.string()).nullable().default(null),
  /** Sofa only — a built sofa matches when the combo's slots can be covered. */
  coversComboId: z.string().uuid().nullable().default(null),
  /** Sofa only — matches a line minted from that compartment. */
  coversCompartmentId: z.string().uuid().nullable().default(null),
});
export type GuaranteeTermDto = z.infer<typeof guaranteeTermSchema>;

/** The narrowing a guarantee applies, independent of its DTO shape — so the
 *  matcher can be fed either a term or an in-progress authoring form. */
export type GuaranteeScope = {
  coversCategory: ProductCategory;
  coversModelId?: string | null;
  coversVariants?: string[] | null;
  coversComboId?: string | null;
  coversCompartmentId?: string | null;
};

/** What we know about a candidate line, resolved from the catalog by the caller. */
export type GuaranteeCandidate = {
  category: ProductCategory | null;
  modelId: string | null;
  /** The SKU's variant label ("King"). */
  variant?: string | null;
  /** A built sofa's SEAT HEIGHT (`attrs.sofa_build.height`) — that is what a
   *  sofa's Maintenance pool offers, so it is what a sofa variant matches. */
  sofaHeight?: string | null;
  /** For a compartment-minted sofa SKU. */
  compartmentId?: string | null;
  /** Module codes of a sofa BUILD line (`attrs.sofa_build.cells`). */
  builtModuleCodes?: readonly string[] | null;
};

/**
 * Does this guarantee cover that item? ONE matcher, so the POS picker, the
 * server and any report can never disagree about what a guarantee covers.
 *
 * Every level is an AND, and an unset level is a wildcard:
 *   category → model → (variants | combo | compartment)
 *
 * Variant comparison is case/space-insensitive because the pool value ("King")
 * and a SKU variant ("king") are authored by different hands.
 *
 * `matchCombo` is injected rather than imported so this module stays free of
 * the sofa-pricing engine (callers pass `matchSofaCombo`); without it a
 * combo-scoped term simply falls back to requiring the same MODEL, which is
 * the safe direction — it never widens coverage.
 */
export function guaranteeCovers(
  scope: GuaranteeScope,
  item: GuaranteeCandidate,
  matchCombo?: (builtCodes: readonly string[], slots: readonly (readonly string[])[]) => unknown,
  comboSlots?: readonly (readonly string[])[] | null,
): boolean {
  if (!item.category || item.category !== scope.coversCategory) return false;
  if (scope.coversModelId && item.modelId !== scope.coversModelId) return false;

  if (scope.coversCompartmentId && item.compartmentId !== scope.coversCompartmentId) {
    return false;
  }

  if (scope.coversComboId) {
    if (comboSlots && matchCombo) {
      const cells = item.builtModuleCodes ?? [];
      if (cells.length === 0) return false;
      if (matchCombo(cells, comboSlots) === null) return false;
    }
    // else: the model already matched above — the safe direction, never wider.
    // FALL THROUGH to the height check: "the L-shape combo, at 32 inch".
  }

  const wanted = (scope.coversVariants ?? []).map(normalizeVariant).filter(Boolean);
  if (wanted.length === 0) return true;
  // A sofa's variant axis is its SEAT HEIGHT, not the SKU's variant (which is a
  // compartment code) — the pool the scope was authored from decides this.
  const mine =
    scope.coversCategory === "sofa" ? (item.sofaHeight ?? "") : (item.variant ?? "");
  return wanted.includes(normalizeVariant(mine));
}

/**
 * One size, however it was written. The size POOL stores codes (`K`) with a
 * marketing label (`6FT`), while a SKU's variant is the full name (`King`) —
 * so a raw string compare would author a guarantee that silently covers
 * NOTHING. Everything goes through canonicalSize first, then a loose compare
 * for anything it doesn't know (a sofa preset, a free-typed variant).
 */
function normalizeVariant(v: string): string {
  const raw = v.trim();
  if (!raw) return "";
  return canonicalSize(raw).name.toLowerCase().replace(/\s+/g, " ");
}

/** One-line human summary of what a term covers — for the SKU list, the
 *  authoring preview and the POS picker header. */
export function guaranteeScopeLabel(
  scope: GuaranteeScope,
  names: { model?: string | null; combo?: string | null; compartment?: string | null } = {},
): string {
  const cat = scope.coversCategory;
  if (scope.coversCompartmentId) {
    const vs = (scope.coversVariants ?? []).filter(Boolean);
    return `${names.compartment ?? "one compartment"} (${cat})${
      vs.length > 0 ? ` · ${vs.join(" / ")}` : ""
    }`;
  }
  const variants = (scope.coversVariants ?? []).filter(Boolean);
  const suffix = variants.length > 0 ? ` · ${variants.join(" / ")}` : "";
  if (scope.coversComboId) {
    return `${names.combo ?? "one combo"}${names.model ? ` · ${names.model}` : ""}${suffix}`;
  }
  const who = scope.coversModelId ? (names.model ?? "one model") : `any ${cat}`;
  return `${who}${suffix}`;
}

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

/**
 * The DESK vocabulary (Loo 2026-07-26): a guarantee is **Active** until it is
 * **Claimed** or **Expired**. Three words, because that is the whole decision
 * an operator makes at the counter.
 *
 * `pending` (sold, not yet delivered) folds into Active on purpose — Loo:
 * "如果还没 claim，就是 active". The "cover hasn't started yet" nuance is not
 * lost: the Cover-ends column reads "on delivery" instead of a date.
 *
 * `void` deliberately KEEPS its own word even though it wasn't in the three.
 * A voided guarantee is one whose order was cancelled or whose line was
 * removed — calling that "Active" would invite an operator to honour a
 * guarantee that was never really sold.
 */
export type GuaranteeDeskStatus = "active" | "claimed" | "expired" | "void";

/**
 * A pure FOLD of the five lifecycle states into the four display words. It
 * takes the ALREADY-derived status (effectiveGuaranteeStatus) rather than
 * re-deriving from the date: expiry must be decided by ONE clock — the
 * server's — or a browser in another timezone can disagree by a day about
 * whether a guarantee is still claimable.
 */
export function guaranteeDeskStatus(effective: GuaranteeStatus): GuaranteeDeskStatus {
  switch (effective) {
    case "claimed":
      return "claimed";
    case "expired":
      return "expired";
    case "void":
      return "void";
    default:
      return "active"; // 'active' AND 'pending'
  }
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
