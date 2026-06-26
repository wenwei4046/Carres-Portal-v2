import { z } from "zod";

import { SOFA_HEIGHTS } from "../sofa-constants";

/**
 * Catalog bundle — single endpoint that returns everything the wizard's product
 * picker needs in one round-trip: models + skus + sofa fabrics + addons + floor
 * config. RLS allows any authenticated user to read; products/addons writes are
 * principal-only.
 *
 * Outlets + Salespersons are scoped read endpoints (dealer sees only their own;
 * principal/internal sees all). Used by wizard Step 1 to pick the outlet + SP.
 */

// 0169 (Product & Maintenance rebuild) — widened 3->5. 'accessory' and 'service'
// carry no variant axis (one SKU per model); 'service' is the bucket for
// delivery / disposal / labour SKUs (SVC-... codes).
export const productCategorySchema = z.enum([
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
  "service",
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const variantKindSchema = z.enum(["size", "preset", "part"]);
export type VariantKind = z.infer<typeof variantKindSchema>;

// 0171 — model option pool consumed by generate-skus. Loose by design (a
// category may grow new axes); the four known keys are typed, extras pass through.
export const allowedOptionsSchema = z
  .object({
    sizes: z.array(z.string()).optional(),
    compartments: z.array(z.string()).optional(),
    colors: z.array(z.string()).optional(),
    gaps: z.array(z.string()).optional(),
    // 0181 — special add-on codes this model offers (per-model attach).
    specials: z.array(z.string()).optional(),
  })
  .passthrough();
export type AllowedOptions = z.infer<typeof allowedOptionsSchema>;

export const productModelSchema = z.object({
  id: z.string().uuid(),
  category: productCategorySchema,
  modelKey: z.string(),
  name: z.string(),
  blurb: z.string().nullable(),
  colors: z.array(z.string()).nullable(),
  gaps: z.array(z.string()).nullable(),
  sofaMode: z.enum(["preset", "custom", "both"]).nullable(),
  // 0074 — soft-delete flag exposed for the catalog admin UI; the public
  // GET /api/catalog filters discontinued models out, so consumer code
  // generally treats this as always null. Catalog admin endpoints surface it.
  discontinuedAt: z.string().nullable().optional(),
  // 0171 — model photo (public URL) + the generate-skus option pool.
  photoUrl: z.string().nullable().optional(),
  allowedOptions: allowedOptionsSchema.optional(),
});
export type ProductModelDto = z.infer<typeof productModelSchema>;

export const productSkuSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  sku: z.string(),
  variant: z.string(),
  variantKind: variantKindSchema,
  price: z.number(),
  // 0074 — fixed procurement cost per unit (Loo 2026-05-09). Auto-fills onto
  // every Create-PO line; the modal stamps cost_source='catalog' on persist.
  // Nullable so legacy + freshly-added SKUs that haven't had a cost set yet
  // still serialize cleanly; the Create-PO submit gate refuses lines whose
  // SKU has cost=null.
  cost: z.number().nullable(),
  // 2026-05-17 — SKU-level supplier_id. Nullable since 0171 (service/accessory
  // SKUs have no supplier). Required for CreatePOModal to route procurable lines
  // to the right supplier group; a null-supplier SKU may not enter a Create-PO line.
  supplierId: z.string().uuid().nullable(),
  discontinuedAt: z.string().nullable().optional(),
  // 0170 — sell-side ON/OFF (Modular toggle), DISTINCT from discontinuedAt
  // (cost/PO side). + editable description column.
  posActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
  // 0178 (sofa engine Phase 1) — nullable link to a sofa compartment type.
  // Additive/optional: pre-0178 serialized SKUs that don't carry it stay valid.
  compartmentId: z.string().uuid().nullable().optional(),
});
export type ProductSkuDto = z.infer<typeof productSkuSchema>;

// 0176 — three price tiers for sofa fabrics. PRICE_1 = base (zero delta);
// PRICE_2/PRICE_3 = mid/premium with deltas resolved from per-model override
// or the global `fabric_tier_addon_config` singleton.
export const fabricTierSchema = z.enum(["PRICE_1", "PRICE_2", "PRICE_3"]);
export type FabricTierValue = z.infer<typeof fabricTierSchema>;

export const sofaFabricSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  fabricName: z.string(),
  surcharge: z.number(),
  // 0075 — fabric color options (Loo 2026-05-09).
  colors: z.array(z.string()).nullable(),
  discontinuedAt: z.string().nullable().optional(),
  // 0176 — price tier. Defaults to PRICE_1 so existing serialized catalog
  // responses (pre-0176 rows) remain valid without a migration re-fetch.
  tier: fabricTierSchema.default("PRICE_1"),
});
export type SofaFabricDto = z.infer<typeof sofaFabricSchema>;

// 0172 — service_sku links each add-on to a real Service-category SKU (bare
// SVC- code that joins product_skus.sku) so every charge rolls up under a SKU.
export const serviceSkuCodeSchema = z
  .string()
  .regex(/^SVC-[A-Z0-9-]+$/, "service SKU code must look like SVC-DISPOSE-MATTRESS");

export const addonSchema = z.object({
  key: z.string(),
  name: z.string(),
  price: z.number(),
  active: z.boolean(),
  serviceSku: serviceSkuCodeSchema.nullable().optional(),
});
export type AddonDto = z.infer<typeof addonSchema>;

// 0181 — Special Add-ons: per-model SELLING surcharges with one-level follow-up
// question groups (group → choices, each choice carries an `extra`). Surcharges
// (base + extras) may be NEGATIVE (a deduction). Principal-owned; folds into the
// product line's unitPrice (no separate SKU). The ±1M bound keeps a typo out of
// the numeric(12,2) column while leaving plenty of room for real surcharges.
const SPECIAL_MONEY = z.number().gte(-1_000_000).lte(1_000_000);
export const specialAddonChoiceSchema = z.object({
  label: z.string().trim().min(1).max(60),
  extra: SPECIAL_MONEY,
});
export const specialAddonOptionGroupSchema = z.object({
  label: z.string().trim().min(1).max(60),
  required: z.boolean(),
  choices: z.array(specialAddonChoiceSchema).min(1).max(20),
});
export type SpecialAddonOptionGroupDto = z.infer<typeof specialAddonOptionGroupSchema>;

export const specialAddonSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  soDescription: z.string(),
  categories: z.array(productCategorySchema),
  sellingPrice: z.number(),
  cost: z.number().nullable(),
  optionGroups: z.array(specialAddonOptionGroupSchema),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type SpecialAddonDto = z.infer<typeof specialAddonSchema>;

// ---------------------------------------------------------------------------
// 0182 — global option pools (2990s Products parity Phase 4). Principal-owned
// curated reference lists. One schema, two consumers (§9.5): the API validates
// these and the Maintenance UI reuses the exact same shapes.
// ---------------------------------------------------------------------------

/** The three curated pools (branding dropped — every Carres product is one brand). */
export const CATALOG_OPTION_POOL_NAMES = [
  "supplier_category",
  "bedframe_size",
  "mattress_size",
] as const;
export const catalogOptionPoolNameSchema = z.enum(CATALOG_OPTION_POOL_NAMES);
export type CatalogOptionPoolName = z.infer<typeof catalogOptionPoolNameSchema>;

/** One pool entry (mirrors the domain `CatalogOptionPool` / a row, camelCased).
 *  `label` + `dimensions` are populated for size pools only (null otherwise). */
export const catalogOptionPoolSchema = z.object({
  id: z.string().uuid(),
  pool: catalogOptionPoolNameSchema,
  value: z.string(),
  label: z.string().nullable(),
  dimensions: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type CatalogOptionPoolDto = z.infer<typeof catalogOptionPoolSchema>;

export const floorConfigSchema = z.object({
  id: z.number().int(),
  freeUpToFloor: z.number().int(),
  perFloorPerItem: z.number(),
});
export type FloorConfigDto = z.infer<typeof floorConfigSchema>;

// 0176 — global tier config singleton + per-model overrides schemas.

/**
 * `fabric_tier_addon_config` (singleton, id=1). Holds the global RM delta for
 * PRICE_2 and PRICE_3 sofa fabrics when no per-model override is set.
 */
export const fabricTierConfigSchema = z.object({
  sofaTier2Delta: z.number().nonnegative(),
  sofaTier3Delta: z.number().nonnegative(),
});
export type FabricTierConfigDto = z.infer<typeof fabricTierConfigSchema>;

/**
 * One row from `model_fabric_tier_overrides`. Nullable deltas = inherit from
 * global config; 0 = explicit zero (no tier premium for this model).
 */
export const modelFabricTierOverrideSchema = z.object({
  modelId: z.string().uuid(),
  tier2Delta: z.number().nullable(),
  tier3Delta: z.number().nullable(),
});
export type ModelFabricTierOverrideDto = z.infer<typeof modelFabricTierOverrideSchema>;

// ---------------------------------------------------------------------------
// 0177 — fixed-set combos (套餐). A named bundle sold at one combo_price; its
// component SKUs split the price back out via explodeCombo() at submit time.
// One schema, two consumers (§9.5): the API validates these and the web form
// reuses the exact same shapes.
// ---------------------------------------------------------------------------

/** One component SKU of a combo (mirrors a `combo_components` row, camelCased). */
export const comboComponentSchema = z.object({
  sku: z.string(),
  qty: z.number().int().positive(),
  sortOrder: z.number().int(),
});
export type ComboComponentDto = z.infer<typeof comboComponentSchema>;

/** A combo plus its components (mirrors the `Combo` domain type). */
export const comboSchema = z.object({
  id: z.string().uuid(),
  comboKey: z.string(),
  name: z.string(),
  comboPrice: z.number(),
  // 0183 — principal-only cost benchmark companion to comboPrice; null = unset.
  cost: z.number().nullable(),
  active: z.boolean(),
  effectiveFrom: z.string(),
  components: z.array(comboComponentSchema),
});
export type ComboDto = z.infer<typeof comboSchema>;

/**
 * Create a combo. `comboKey` is optional — the server may derive it from the
 * name. At least one component is required. `sortOrder` is optional per
 * component (the server defaults it from array position).
 */
export const comboCreateInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    comboPrice: z.number().nonnegative(),
    // 0183 — optional cost benchmark (principal-only). null/omit = unset.
    cost: z.number().nonnegative().nullable().optional(),
    comboKey: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/, "comboKey must be kebab-case (a-z, 0-9, dash)")
      .optional(),
    active: z.boolean().optional(),
    components: z
      .array(
        z.object({
          sku: z.string().trim().min(1),
          qty: z.number().int().positive(),
          sortOrder: z.number().int().optional(),
        }),
      )
      .min(1),
  })
  .strict();
export type ComboCreateInput = z.infer<typeof comboCreateInput>;

/** Patch a combo — every field of create is optional. */
export const comboPatchInput = comboCreateInput.partial().strict();
export type ComboPatchInput = z.infer<typeof comboPatchInput>;

// ---------------------------------------------------------------------------
// 0178 — sofa compartment pool + per-model offered (sofa engine Phase 1).
// Principal-owned. One schema, two consumers (§9.5): the API validates these
// and the Maintenance UI reuses the exact same shapes.
// ---------------------------------------------------------------------------

/** One compartment type from the principal-owned pool (mirrors the domain
 *  `SofaCompartment` / a `sofa_compartments` row, camelCased). */
export const sofaCompartmentSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  description: z.string().nullable(),
  seatCount: z.number().int().nullable(),
  armConfig: z.string().nullable(),
  iconUrl: z.string().nullable(),
  defaultPrice: z.number(),
  sortOrder: z.number().int(),
  active: z.boolean(),
});
export type SofaCompartmentDto = z.infer<typeof sofaCompartmentSchema>;

/** One per-model offered compartment (mirrors `ModelSofaCompartment` /
 *  a `model_sofa_compartments` row). `priceOverride` NULL = inherit the pool's
 *  `defaultPrice`. */
export const modelSofaCompartmentSchema = z.object({
  modelId: z.string().uuid(),
  compartmentId: z.string().uuid(),
  priceOverride: z.number().nullable(),
  sortOrder: z.number().int(),
});
export type ModelSofaCompartmentDto = z.infer<typeof modelSofaCompartmentSchema>;

/**
 * Create a compartment in the pool. `code` is required + unique-by-convention;
 * `defaultPrice` defaults to 0 server-side and must be >= 0 when given.
 */
export const sofaCompartmentCreateInput = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[A-Za-z0-9()\-_/. ]+$/, "code may contain letters, digits and ()-_/.  "),
    description: z.string().trim().max(200).nullable().optional(),
    seatCount: z.number().int().nonnegative().nullable().optional(),
    armConfig: z.string().trim().max(60).nullable().optional(),
    iconUrl: z.string().trim().max(500).nullable().optional(),
    defaultPrice: z.number().nonnegative().optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type SofaCompartmentCreateInput = z.infer<typeof sofaCompartmentCreateInput>;

/** Patch a compartment — every field of create is optional. */
export const sofaCompartmentPatchInput = sofaCompartmentCreateInput.partial().strict();
export type SofaCompartmentPatchInput = z.infer<typeof sofaCompartmentPatchInput>;

/**
 * Upsert a per-model offered compartment (the PUT body for
 * /models/:id/compartments/:compartmentId). `priceOverride` nullable (NULL =
 * inherit the pool default); when given it must be >= 0.
 */
export const modelSofaCompartmentInput = z
  .object({
    priceOverride: z.number().nonnegative().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type ModelSofaCompartmentInput = z.infer<typeof modelSofaCompartmentInput>;

// ---------------------------------------------------------------------------
// 0179 — sofa combo pricing (sofa engine Phase 2). Principal-owned. A combo =
// a base model + ordered SLOTS (each slot an OR-set of compartment codes)
// priced per seat height. One schema, two consumers (§9.5).
// ---------------------------------------------------------------------------

/** One SLOT = a non-empty OR-set of compartment `code` strings. */
const sofaComboSlotSchema = z.array(z.string().trim().min(1)).min(1);

/** Ordered list of slots = a non-empty array of slots. */
const sofaComboSlotsSchema = z.array(sofaComboSlotSchema).min(1);

/**
 * `prices_by_height` map — only the canonical `SOFA_HEIGHTS` keys are allowed;
 * each value is a non-negative RM number or `null` (combo n/a at that height).
 */
const sofaComboPricesByHeightSchema = z.record(
  z.enum(SOFA_HEIGHTS),
  z.union([z.number().min(0), z.null()]),
);

/** A sofa combo row (mirrors the `SofaCombo` domain type, camelCased). */
export const sofaComboSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  slots: z.array(z.array(z.string())),
  tier: fabricTierSchema.nullable(),
  pricesByHeight: z.record(z.string(), z.union([z.number(), z.null()])),
  // 0183 — per-seat-height cost benchmark (same shape); null = unset.
  costByHeight: z.record(z.string(), z.union([z.number(), z.null()])).nullable(),
  label: z.string().nullable(),
  effectiveFrom: z.string(),
  active: z.boolean(),
  discontinuedAt: z.string().nullable(),
});
export type SofaComboDto = z.infer<typeof sofaComboSchema>;

/**
 * Create a sofa combo. `slots` is required (≥1 slot, each a non-empty OR-set);
 * `pricesByHeight` keys are restricted to `SOFA_HEIGHTS`. `tier` null/omitted =
 * applies to any fabric tier.
 */
export const sofaComboCreateInput = z
  .object({
    modelId: z.string().uuid(),
    slots: sofaComboSlotsSchema,
    tier: fabricTierSchema.nullable().optional(),
    pricesByHeight: sofaComboPricesByHeightSchema.optional(),
    // 0183 — optional per-height cost benchmark (principal-only); same
    // SOFA_HEIGHTS-keyed shape as pricesByHeight. null/omit = unset.
    costByHeight: sofaComboPricesByHeightSchema.nullable().optional(),
    label: z.string().trim().max(200).nullable().optional(),
    effectiveFrom: z.string().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type SofaComboCreateInput = z.infer<typeof sofaComboCreateInput>;

/** Patch a sofa combo — every field of create is optional. */
export const sofaComboPatchInput = sofaComboCreateInput.partial().strict();
export type SofaComboPatchInput = z.infer<typeof sofaComboPatchInput>;

// ---------------------------------------------------------------------------
// 0184 — delivery TRIP fee subsystem (2990s Products parity Phase 6). The
// principal-owned config singleton + per-RuleTarget special overrides.
// Principal-only writes. One schema, two consumers (§9.5): the API validates
// these and the Maintenance UI reuses the exact same shapes. The floor STAIR
// surcharge (floorConfig) is KEPT + coexists; the delivery fee is ADDITIVE.
// ---------------------------------------------------------------------------

/** The `delivery_fee_config` singleton DTO (camelCased; the `id` is dropped, the
 *  shape doubles as the pure `computeDeliveryFee` config). */
export const deliveryFeeConfigSchema = z.object({
  baseFee: z.number().nonnegative(),
  crossCategoryFee: z.number().nonnegative(),
  chargedCategories: z.array(z.string()),
  mattressBedframeLeadDays: z.number().int().nonnegative(),
  sofaLeadDays: z.number().int().nonnegative(),
});
export type DeliveryFeeConfigDto = z.infer<typeof deliveryFeeConfigSchema>;

/** Patch the config singleton — every field optional + nonnegative. */
export const deliveryFeeConfigPatchInput = deliveryFeeConfigSchema.partial().strict();
export type DeliveryFeeConfigPatchInput = z.infer<typeof deliveryFeeConfigPatchInput>;

/** RuleTarget scope enum (mirrors the `RuleTargetScope` union). */
export const ruleTargetScopeSchema = z.enum(["model", "variant", "combo", "compartment"]);
export type RuleTargetScopeValue = z.infer<typeof ruleTargetScopeSchema>;

/** One RuleTarget entry (mirrors the `RuleTarget` shared type). `modelId` may be
 *  '' for a model-agnostic combo entry; the refinement lists are OR'd within. */
export const ruleTargetSchema = z.object({
  scope: ruleTargetScopeSchema,
  modelId: z.string(),
  sizeCodes: z.array(z.string()).optional(),
  comboIds: z.array(z.string()).optional(),
  compartments: z.array(z.string()).optional(),
});
export type RuleTargetDto = z.infer<typeof ruleTargetSchema>;

/** A `special_delivery_fee_rules` row DTO (mirrors `SpecialDeliveryFeeRule`). */
export const specialDeliveryFeeRuleSchema = z.object({
  id: z.string().uuid(),
  target: z.array(ruleTargetSchema),
  standaloneFee: z.number(),
  crossCategoryFollowupFee: z.number(),
  label: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type SpecialDeliveryFeeRuleDto = z.infer<typeof specialDeliveryFeeRuleSchema>;

/** Create / patch a special delivery fee rule. `target` requires ≥1 entry; fees
 *  are nonnegative; `label` / `active` / `sortOrder` are optional. */
export const specialDeliveryFeeRuleInput = z
  .object({
    target: z.array(ruleTargetSchema).min(1),
    standaloneFee: z.number().nonnegative(),
    crossCategoryFollowupFee: z.number().nonnegative(),
    label: z.string().trim().max(200).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type SpecialDeliveryFeeRuleInput = z.infer<typeof specialDeliveryFeeRuleInput>;

export const catalogResponseSchema = z.object({
  models: z.array(productModelSchema),
  skus: z.array(productSkuSchema),
  sofaFabrics: z.array(sofaFabricSchema),
  addons: z.array(addonSchema),
  floorConfig: floorConfigSchema,
  // 0176 — fabric tier pricing config (additive, backward-compatible).
  // The API endpoint adds these; pre-0176 clients that don't read them are unaffected.
  fabricTierConfig: fabricTierConfigSchema.optional(),
  modelFabricTierOverrides: z.array(modelFabricTierOverrideSchema).optional(),
  // 0177 — fixed-set combos (additive, backward-compatible / OPTIONAL).
  // Pre-0177 clients that don't read `combos` are wholly unaffected.
  combos: z.array(comboSchema).optional(),
  // 0178 — sofa compartment pool + per-model offered (additive, OPTIONAL).
  // Pre-0178 clients that don't read these are wholly unaffected.
  sofaCompartments: z.array(sofaCompartmentSchema).optional(),
  modelSofaCompartments: z.array(modelSofaCompartmentSchema).optional(),
  // 0179 — sofa combo pricing (additive, OPTIONAL). Pre-0179 clients unaffected.
  sofaCombos: z.array(sofaComboSchema).optional(),
  // 0181 — special add-ons (additive, OPTIONAL). Pre-0181 clients unaffected.
  specialAddons: z.array(specialAddonSchema).optional(),
  // 0182 — global option pools (additive, OPTIONAL). Pre-0182 clients unaffected.
  optionPools: z.array(catalogOptionPoolSchema).optional(),
  // 0184 — delivery fee config + special rules (additive, OPTIONAL). Pre-0184
  // clients that don't read these are wholly unaffected.
  deliveryFeeConfig: deliveryFeeConfigSchema.optional(),
  specialDeliveryFeeRules: z.array(specialDeliveryFeeRuleSchema).optional(),
});
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;

export const outletSchema = z.object({
  id: z.string().uuid(),
  dealerId: z.string().uuid(),
  name: z.string(),
  address: z.string(),
});
export type OutletDto = z.infer<typeof outletSchema>;

export const outletsListResponseSchema = z.object({
  outlets: z.array(outletSchema),
});
export type OutletsListResponse = z.infer<typeof outletsListResponseSchema>;

/**
 * 2026-05-22 (Loo) — Dealer-side Settings → Outlets create input. Name +
 * address are both required (mirrors the dealer.address ≥ 5 char floor used
 * everywhere else in v2). dealer_id is derived server-side from the JWT so
 * dealers can't spoof other dealers' outlets.
 */
export const createOutletInput = z.object({
  name:    z.string().trim().min(1).max(120),
  address: z.string().trim().min(5).max(500),
});
export type CreateOutletInput = z.infer<typeof createOutletInput>;

export const salespersonSchema = z.object({
  id: z.string().uuid(),
  dealerId: z.string().uuid(),
  outletId: z.string().uuid().nullable(),
  name: z.string(),
  phone: z.string().nullable(),
  userId: z.string().uuid().nullable(),
});
export type SalespersonDto = z.infer<typeof salespersonSchema>;

export const salespersonsListResponseSchema = z.object({
  salespersons: z.array(salespersonSchema),
});
export type SalespersonsListResponse = z.infer<typeof salespersonsListResponseSchema>;

// ---------------------------------------------------------------------------
// 0074 — Catalog admin CRUD (Loo 2026-05-09 Q2=c, Q3=b, Q4=c).
// Both principal + operation can create/patch/soft-delete catalog entities.
// is_internal() RLS write covers both roles natively, so the API just forwards
// the user JWT — no extra guard needed beyond the standard auth middleware.
// ---------------------------------------------------------------------------

const colorOrGapValueRegex = /^[\p{L}\p{N} _\-/'"().+]{1,40}$/u;

export const productModelCreateInput = z
  .object({
    category: productCategorySchema,
    modelKey: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/, "modelKey must be kebab-case (a-z, 0-9, dash)"),
    name: z.string().trim().min(2).max(80),
    blurb: z.string().trim().max(200).nullable().optional(),
    colors: z.array(z.string().trim().regex(colorOrGapValueRegex)).max(20).nullable().optional(),
    gaps: z.array(z.string().trim().regex(colorOrGapValueRegex)).max(20).nullable().optional(),
    sofaMode: z.enum(["preset", "custom", "both"]).nullable().optional(),
    // 0171 — option pool (sizes/compartments/colors/gaps) the generate-skus
    // endpoint expands. Edited by the Modular AllowedOptionsPanel + Maintenance.
    allowedOptions: allowedOptionsSchema.optional(),
  })
  .strict();
export type ProductModelCreateInput = z.infer<typeof productModelCreateInput>;

export const productModelPatchInput = productModelCreateInput
  .partial()
  .extend({
    // 0075 (Loo 2026-05-09) — admin "restore" toggle: PATCH with
    // discontinuedAt:null clears the soft-delete stamp set by DELETE.
    discontinuedAt: z.string().datetime().nullable().optional(),
  })
  // Re-strict so unknown keys 422 instead of silently dropping.
  .strict();
export type ProductModelPatchInput = z.infer<typeof productModelPatchInput>;

export const productSkuCreateInput = z
  .object({
    modelId: z.string().uuid(),
    variant: z.string().trim().min(1).max(60),
    variantKind: variantKindSchema,
    price: z.number().nonnegative(),
    cost: z.number().nonnegative().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(200).nullable().optional(),
    posActive: z.boolean().optional(),
  })
  .strict();
export type ProductSkuCreateInput = z.infer<typeof productSkuCreateInput>;

export const productSkuPatchInput = z
  .object({
    variant: z.string().trim().min(1).max(60).optional(),
    variantKind: variantKindSchema.optional(),
    price: z.number().nonnegative().optional(),
    cost: z.number().nonnegative().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    // 0075 (Loo 2026-05-09) — restore toggle.
    discontinuedAt: z.string().datetime().nullable().optional(),
    // 0170 — Edit-Prices / Modular toggle / inline description edit.
    posActive: z.boolean().optional(),
    description: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
export type ProductSkuPatchInput = z.infer<typeof productSkuPatchInput>;

export const sofaFabricCreateInput = z
  .object({
    modelId: z.string().uuid(),
    fabricName: z.string().trim().min(1).max(60),
    surcharge: z.number().nonnegative(),
    // 0075 — fabric colors (Loo 2026-05-09).
    colors: z.array(z.string().trim().regex(colorOrGapValueRegex)).max(20).nullable().optional(),
    // 0176 — price tier. Optional on create; server defaults to PRICE_1.
    tier: fabricTierSchema.optional(),
  })
  .strict();
export type SofaFabricCreateInput = z.infer<typeof sofaFabricCreateInput>;

export const sofaFabricPatchInput = z
  .object({
    fabricName: z.string().trim().min(1).max(60).optional(),
    surcharge: z.number().nonnegative().optional(),
    colors: z.array(z.string().trim().regex(colorOrGapValueRegex)).max(20).nullable().optional(),
    // 0075 (Loo 2026-05-09) — restore toggle.
    discontinuedAt: z.string().datetime().nullable().optional(),
    // 0176 — tier change (PRICE_1/2/3).
    tier: fabricTierSchema.optional(),
  })
  .strict();
export type SofaFabricPatchInput = z.infer<typeof sofaFabricPatchInput>;

/**
 * Phase 2D — Dealer/Showroom self-service salesperson CRUD.
 * Dealer/showroom roles can create salesperson rows scoped to their own
 * dealer (RLS `salespersons_dealer_write` enforces this). The server
 * derives dealer_id from the JWT — caller cannot pass a different one.
 */
export const salespersonCreateInputSchema = z.object({
  name:     z.string().trim().min(2).max(100),
  phone:    z.string().trim().min(8).max(40).nullable().optional(),
  outletId: z.string().uuid().nullable().optional(),
}).strict();
export type SalespersonCreateInput = z.infer<typeof salespersonCreateInputSchema>;

// ---------------------------------------------------------------------------
// 0169-0173 — Product & Maintenance rebuild inputs.
// ---------------------------------------------------------------------------

/** PATCH /models/:id/sizes-active — `sizes` is the new set of ACTIVE sizes;
 *  the server writes allowed_options.sizes and cascades pos_active across the
 *  model's variant_kind='size' SKUs (in-set => on, others => off). Never touches
 *  discontinuedAt. */
export const sizesActiveInput = z
  .object({ sizes: z.array(z.string().trim().min(1).max(60)).max(50) })
  .strict();
export type SizesActiveInput = z.infer<typeof sizesActiveInput>;

/** POST /models/:id/generate-skus — materialize one SKU per variant. If
 *  `variants` is omitted the server expands the model's allowed_options (e.g.
 *  .sizes). Code = `{MODEL_KEY}-{variant}` (Loo 2026-06-14, NOT colon format).
 *  Idempotent: existing codes are skipped (23505 -> skipped, not 409). */
export const generateSkusInput = z
  .object({
    variants: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
    price: z.number().nonnegative().optional(),
  })
  .strict();
export type GenerateSkusInput = z.infer<typeof generateSkusInput>;

/** GET /catalog admin filters for the SKU Master grid. */
export const skuMasterListQuery = z
  .object({
    category: productCategorySchema.optional(),
    search: z.string().trim().max(100).optional(),
    posActive: z.coerce.boolean().optional(),
  })
  .strict();
export type SkuMasterListQuery = z.infer<typeof skuMasterListQuery>;

/** PATCH /floor-config — the delivery-fee singleton (id=1). Principal-gated. */
export const floorConfigPatchInput = z
  .object({
    freeUpToFloor: z.number().int().nonnegative().optional(),
    perFloorPerItem: z.number().nonnegative().optional(),
  })
  .strict();
export type FloorConfigPatchInput = z.infer<typeof floorConfigPatchInput>;

/** Add-ons CRUD (Maintenance tab). */
export const addonCreateInput = z
  .object({
    key: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "key must be kebab-case"),
    name: z.string().trim().min(2).max(80),
    price: z.number().nonnegative(),
    active: z.boolean().optional(),
    serviceSku: serviceSkuCodeSchema.nullable().optional(),
  })
  .strict();
export type AddonCreateInput = z.infer<typeof addonCreateInput>;

export const addonPatchInput = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    price: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
    serviceSku: serviceSkuCodeSchema.nullable().optional(),
  })
  .strict();
export type AddonPatchInput = z.infer<typeof addonPatchInput>;

/** Special Add-ons CRUD (0181, principal-only). `code` is the stable key
 *  referenced from allowed_options.specials + order_lines.attrs — set on create,
 *  NEVER patched (a rename would orphan those references). selling_price/extra
 *  may be negative. */
export const specialAddonCreateInput = z
  .object({
    // Stable cross-reference key (allowed_options.specials + order_lines.attrs);
    // kebab-case like comboKey/addon.key so it stays clean as a jsonb key.
    code: z.string().trim().min(1).max(60).regex(/^[a-z0-9][a-z0-9-]*$/, "code must be kebab-case (a-z, 0-9, dash)"),
    label: z.string().trim().min(1).max(80),
    soDescription: z.string().trim().max(200).optional(),
    categories: z.array(productCategorySchema).max(5),
    sellingPrice: SPECIAL_MONEY,
    cost: z.number().nonnegative().nullable().optional(),
    optionGroups: z.array(specialAddonOptionGroupSchema).max(20).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type SpecialAddonCreateInput = z.infer<typeof specialAddonCreateInput>;

export const specialAddonPatchInput = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    soDescription: z.string().trim().max(200).optional(),
    categories: z.array(productCategorySchema).max(5).optional(),
    sellingPrice: SPECIAL_MONEY.optional(),
    cost: z.number().nonnegative().nullable().optional(),
    optionGroups: z.array(specialAddonOptionGroupSchema).max(20).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type SpecialAddonPatchInput = z.infer<typeof specialAddonPatchInput>;

// ---------------------------------------------------------------------------
// 0182 — global option pool create / patch inputs (principal-gated).
// ---------------------------------------------------------------------------

/** Create a pool entry. `pool` + `value` required; `label`/`dimensions` apply
 *  to the size pools (free to send null/omit for supplier_category). */
export const catalogOptionPoolCreateInput = z
  .object({
    pool: catalogOptionPoolNameSchema,
    value: z.string().trim().min(1).max(60),
    label: z.string().trim().max(60).nullable().optional(),
    dimensions: z.string().trim().max(60).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type CatalogOptionPoolCreateInput = z.infer<typeof catalogOptionPoolCreateInput>;

/** Patch a pool entry — every field optional EXCEPT `pool`, which is never
 *  patched (moving an entry between pools would skew the UNIQUE(pool,value)
 *  intent; delete + recreate instead). */
export const catalogOptionPoolPatchInput = z
  .object({
    value: z.string().trim().min(1).max(60).optional(),
    label: z.string().trim().max(60).nullable().optional(),
    dimensions: z.string().trim().max(60).nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type CatalogOptionPoolPatchInput = z.infer<typeof catalogOptionPoolPatchInput>;
