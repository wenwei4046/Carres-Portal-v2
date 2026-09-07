import { z } from "zod";

import { SOFA_HEIGHTS } from "../sofa-constants";
import { guaranteeTermSchema } from "./guarantee";
import { orderEntryConfigSchema } from "./order-entry";
import { productCategorySchema, type ProductCategory } from "./product-category";

/**
 * Catalog bundle — single endpoint that returns everything the wizard's product
 * picker needs in one round-trip: models + skus + sofa fabrics + addons + floor
 * config. RLS allows any authenticated user to read; products/addons writes are
 * principal-only.
 *
 * Outlets + Salespersons are scoped read endpoints (dealer sees only their own;
 * principal/internal sees all). Used by wizard Step 1 to pick the outlet + SP.
 */

// The category enum moved to ./product-category so guarantee.ts can share it
// without a cycle (this bundle carries guaranteeTerms; a term names a
// category). Re-exported here — every existing import path still works.
export { productCategorySchema };
export type { ProductCategory };

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
    // 0201-wiring (2026-07-06, 2990s parity) — per-model POS gating of the
    // Maintenance option pools. divan/leg ticks: EMPTY/ABSENT = no restriction
    // (every active pool option shows at POS); a non-empty list narrows.
    divan_heights: z.array(z.string()).optional(),
    leg_heights: z.array(z.string()).optional(),
    // 0202 — fabric CODES this model offers (catalog_fabrics.fabric_code).
    // OPT-IN: empty/absent = the model shows no fabric choice at POS.
    fabrics: z.array(z.string()).optional(),
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

/** 0442 — the Catalog-owned stock identity mode of a SKU. Declared here, above
 *  its first use, because zod objects evaluate at import time. */
export const stockIdentityModeSchema = z.enum(["exact_unit", "quantity"]);
export type StockIdentityModeInput = z.infer<typeof stockIdentityModeSchema>;

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
  /** 0375 — the SUPPLIER'S own item code for this SKU (the code on their
   *  quotation). Ours is `sku`; this is theirs. Optional: pre-0375 fixtures
   *  and Workers don't send it. */
  supplierCode: z.string().nullable().optional(),
  discontinuedAt: z.string().nullable().optional(),
  // 0170 — sell-side ON/OFF (Modular toggle), DISTINCT from discontinuedAt
  // (cost/PO side). + editable description column.
  posActive: z.boolean().optional(),
  description: z.string().nullable().optional(),
  // 0178 (sofa engine Phase 1) — nullable link to a sofa compartment type.
  // Additive/optional: pre-0178 serialized SKUs that don't carry it stay valid.
  compartmentId: z.string().uuid().nullable().optional(),
  // 0186 (PWP Phase 8a) — principal-only per-SKU reward price (the price a
  // PWP-rule reward line is sold at). Mirrors `cost`: economic, nullable
  // (null = no PWP price set). Additive/optional so pre-0186 serialized SKUs
  // stay valid. DORMANT — no order consumer yet.
  pwpPrice: z.number().nullable().optional(),
  // 0204 (per-size pricing, Loo 2026-07-06) — {size → RM} map keyed by the
  // `sofa_size` pool values. Values nullable defensively: a null value reads
  // as "not priced at this size" and falls through to the flat price.
  // Additive/optional so pre-0204 serialized SKUs stay valid.
  pricesBySize: z.record(z.number().nullable()).nullable().optional(),
  /** 0442 — how Stock identifies this SKU: `exact_unit` (one permanent Carres
   *  Unit ID per piece, born with the official PO) or `quantity` (counted, no
   *  Unit ID). Null/absent = Catalog has not said, and PO issue refuses it. */
  stockIdentityMode: stockIdentityModeSchema.nullable().optional(),
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
  // 0242 — optional size list; non-empty = checkout requires one size per unit.
  sizeOptions: z.array(z.string()).nullable().optional(),
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

/** The curated pools (branding stays dropped — every Carres product is one
 *  brand). 0201 widens the original three with the six 2990s-ported pools that
 *  back the Maintenance + Special Add-ons sidebar sections. */
export const CATALOG_OPTION_POOL_NAMES = [
  "supplier_category",
  "bedframe_size",
  "mattress_size",
  "divan_height",
  "total_height",
  "gap",
  "bedframe_leg_height",
  "sofa_size",
  "sofa_leg_height",
] as const;
export const catalogOptionPoolNameSchema = z.enum(CATALOG_OPTION_POOL_NAMES);
export type CatalogOptionPoolName = z.infer<typeof catalogOptionPoolNameSchema>;

/** One pool entry (mirrors the domain `CatalogOptionPool` / a row, camelCased).
 *  `label` + `dimensions` are populated for size pools only (null otherwise);
 *  `surcharge` (0201) is the RM selling surcharge for priced pools (divan /
 *  total / leg heights) — null renders as "—". */
export const catalogOptionPoolSchema = z.object({
  id: z.string().uuid(),
  pool: catalogOptionPoolNameSchema,
  value: z.string(),
  label: z.string().nullable(),
  dimensions: z.string().nullable(),
  surcharge: z.number().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type CatalogOptionPoolDto = z.infer<typeof catalogOptionPoolSchema>;

/** 0201 — one entry inside a pool batch-save. Same shape as a pool row minus
 *  `id`/`pool`/`sortOrder` (the RPC re-mints rows; array order = display
 *  order, so sortOrder is server-assigned from ordinality). */
export const catalogPoolEntryInput = z
  .object({
    value: z.string().trim().min(1).max(60),
    label: z.string().trim().max(60).nullable().optional(),
    dimensions: z.string().trim().max(60).nullable().optional(),
    surcharge: z.number().nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type CatalogPoolEntryInput = z.infer<typeof catalogPoolEntryInput>;

/** 0201 — PUT /option-pools/:pool body: the pool's FULL new contents (replace
 *  semantics; the catalog_pool_batch_save RPC appends a catalog_config_history
 *  snapshot in the same transaction). */
export const catalogPoolBatchSaveInput = z
  .object({
    entries: z.array(catalogPoolEntryInput).max(200),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type CatalogPoolBatchSaveInput = z.infer<typeof catalogPoolBatchSaveInput>;

/** 0201 — one snapshot entry as stored in catalog_config_history.snapshot. */
export const catalogPoolSnapshotEntrySchema = z.object({
  value: z.string(),
  label: z.string().nullable(),
  dimensions: z.string().nullable(),
  surcharge: z.number().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type CatalogPoolSnapshotEntryDto = z.infer<typeof catalogPoolSnapshotEntrySchema>;

/** 0201 — one catalog_config_history row (lightweight append-only history:
 *  effective_from = the save date; no future-dating engine). */
export const catalogConfigHistorySchema = z.object({
  id: z.string().uuid(),
  section: catalogOptionPoolNameSchema,
  entries: z.array(catalogPoolSnapshotEntrySchema),
  effectiveFrom: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type CatalogConfigHistoryDto = z.infer<typeof catalogConfigHistorySchema>;

// ---------------------------------------------------------------------------
// 0202 — global procurement fabric master (2990s fabric_trackings port). One
// schema, two consumers (§9.5): the API bundle + PUT /fabrics batch save and
// the web Fabrics tab reuse these exact shapes.
// ---------------------------------------------------------------------------

export const fabricTierValueSchema = z.enum(["PRICE_1", "PRICE_2", "PRICE_3"]);

/** One fabric row (bundle DTO, camelCased). */
export const catalogFabricSchema = z.object({
  id: z.string().uuid(),
  fabricCode: z.string(),
  series: z.string().nullable(),
  description: z.string().nullable(),
  supplierCode: z.string().nullable(),
  sofaTier: fabricTierValueSchema,
  bedframeTier: fabricTierValueSchema,
  active: z.boolean(),
  sortOrder: z.number().int(),
  // 0226 — operation's buying add-on (RM). Optional so pre-0226 fixtures and
  // history-shaped entries stay valid; the adapter always emits it.
  cost: z.number().nullable().optional(),
});
export type CatalogFabricDto = z.infer<typeof catalogFabricSchema>;

/** 0202 — one entry inside a fabric batch-save (rows re-minted by the RPC;
 *  array order = display order, sortOrder server-assigned from ordinality). */
export const catalogFabricEntryInput = z
  .object({
    fabricCode: z.string().trim().min(1).max(80),
    series: z.string().trim().max(120).nullable().optional(),
    description: z.string().trim().max(200).nullable().optional(),
    supplierCode: z.string().trim().max(120).nullable().optional(),
    sofaTier: fabricTierValueSchema.optional(),
    bedframeTier: fabricTierValueSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();
export type CatalogFabricEntryInput = z.infer<typeof catalogFabricEntryInput>;

/** 0202 — PUT /fabrics body: the fabric master's FULL new contents (replace
 *  semantics; catalog_fabrics_batch_save appends a section='fabrics'
 *  catalog_config_history snapshot in the same transaction). */
export const catalogFabricsBatchSaveInput = z
  .object({
    entries: z.array(catalogFabricEntryInput).max(500),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type CatalogFabricsBatchSaveInput = z.infer<typeof catalogFabricsBatchSaveInput>;

/** 0226 — PATCH /fabrics/:id/cost body: operation records a fabric's buying
 *  add-on (RM). null clears it back to "not recorded". */
export const catalogFabricCostInput = z
  .object({
    cost: z.number().min(0).nullable(),
  })
  .strict();
export type CatalogFabricCostInput = z.infer<typeof catalogFabricCostInput>;

/** 0202 — one section='fabrics' history row (fabric-shaped snapshot entries). */
export const catalogFabricsHistorySchema = z.object({
  id: z.string().uuid(),
  entries: z.array(
    z.object({
      fabricCode: z.string(),
      series: z.string().nullable(),
      description: z.string().nullable(),
      supplierCode: z.string().nullable(),
      sofaTier: fabricTierValueSchema,
      bedframeTier: fabricTierValueSchema,
      active: z.boolean(),
      sortOrder: z.number().int(),
    }),
  ),
  effectiveFrom: z.string(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});
export type CatalogFabricsHistoryDto = z.infer<typeof catalogFabricsHistorySchema>;

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
  // 0205 — per-compartment fabric-tier P2/P3 delta override (RM, null = inherit).
  // Optional so pre-0205 fixtures still parse; the API adapter always emits both.
  specialTier2Delta: z.number().nullable().optional(),
  specialTier3Delta: z.number().nullable().optional(),
});
export type SofaCompartmentDto = z.infer<typeof sofaCompartmentSchema>;

/** One per-model offered compartment (mirrors `ModelSofaCompartment` /
 *  a `model_sofa_compartments` row). `skuPrice` = the synced
 *  `{MODEL_KEY}-{code}` SKU's price (SKU Master — the authoritative à-la-carte
 *  price source), joined in by the bundle; `priceOverride` → pool
 *  `defaultPrice` is the legacy fallback when no synced sku exists. */
export const modelSofaCompartmentSchema = z.object({
  modelId: z.string().uuid(),
  compartmentId: z.string().uuid(),
  priceOverride: z.number().nullable(),
  sortOrder: z.number().int(),
  skuPrice: z.number().nullable().optional(),
  // 0204 — the synced SKU's {size → RM} map, enriched alongside `skuPrice`.
  skuPricesBySize: z.record(z.number().nullable()).nullable().optional(),
});
export type ModelSofaCompartmentDto = z.infer<typeof modelSofaCompartmentSchema>;

/**
 * Create a compartment in the pool. `code` is required + unique-by-convention.
 * NO price field (Loo, 2026-07-05): the pool is a foundation catalog only —
 * compartment prices live on the synced per-model SKUs in SKU Master.
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
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
    // 0205 — per-compartment fabric-tier P2/P3 delta override (RM, >= 0, null =
    // inherit). Tunes the whole-sofa FABRIC premium, not the compartment module
    // price. Reachable on PATCH too via sofaCompartmentPatchInput (create.partial).
    specialTier2Delta: z.number().nonnegative().nullable().optional(),
    specialTier3Delta: z.number().nonnegative().nullable().optional(),
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
    /* 2026-08-24 - override the sync's auto-resolved supplier for a model's
     * FIRST compartment (once one exists, every later compartment already
     * inherits it — see syncCompartmentSku). Absent keeps today's inherit-
     * then-category-cover fallback byte-identical. */
    supplierId: z.string().uuid().optional(),
    /* The supplier's own code for THIS compartment (2026-08-24). Unlike
     * `supplierId` — which a sibling SKU's answer deliberately overrules,
     * because one model may not fork onto two factories — the code is per
     * PIECE: a quotation lists one code per compartment, so an explicit value
     * always wins. Absent leaves whatever the row already holds, so a re-offer
     * never blanks a code somebody keyed. */
    supplierCode: z.string().trim().max(60).optional(),
    /** 0442 — the stock identity mode the compartment's SKU is minted with.
     *  Absent leaves whatever the row holds (NULL on a new row, and official
     *  PO issue then refuses it by name until Catalog sets it). */
    stockIdentityMode: stockIdentityModeSchema.optional(),
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
  // 0186 (PWP Phase 8a) — per-seat-height PWP reward price (same shape as
  // pricesByHeight); null = unset. The price a PWP-rule reward sofa-combo is
  // sold at. DORMANT — no order consumer yet.
  pwpPricesByHeight: z.record(z.string(), z.union([z.number(), z.null()])).nullable(),
  label: z.string().nullable(),
  effectiveFrom: z.string(),
  active: z.boolean(),
  discontinuedAt: z.string().nullable(),
  // 0206 — Quick Pick preset flag. Optional so pre-0206 fixtures still parse;
  // the API adapter always emits it (?? false).
  isQuickPick: z.boolean().optional(),
  // 0179 audit timestamps — surfaced (additive, optional) for the simple
  // per-combo History view. The API adapter emits them; older fixtures omit them.
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
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
    // 0186 — optional per-height PWP reward price (principal-only); same
    // SOFA_HEIGHTS-keyed shape as pricesByHeight. null/omit = unset.
    pwpPricesByHeight: sofaComboPricesByHeightSchema.nullable().optional(),
    label: z.string().trim().max(200).nullable().optional(),
    effectiveFrom: z.string().optional(),
    active: z.boolean().optional(),
    // 0206 — true = author a Quick Pick preset (shown in POS Quick pick, no
    // price); false/omit = a pricing-only combo. Defaults false at the DB.
    isQuickPick: z.boolean().optional(),
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

/** Patch the config singleton — every field optional + nonnegative. The PATCH
 *  input CONSTRAINS `chargedCategories` to the product category enum (the DTO
 *  above stays `z.array(z.string())` for read-tolerance of legacy rows): an
 *  unknown category never matches a cart line, so a typo/casing would silently
 *  disable base billing — 422 it instead. */
export const deliveryFeeConfigPatchInput = deliveryFeeConfigSchema
  .partial()
  .extend({
    chargedCategories: z.array(productCategorySchema).optional(),
  })
  .strict();
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

// ---------------------------------------------------------------------------
// 0185 — Default Free Gifts + Free Item Campaigns (2990s Products parity Phase
// 7, GWP). Principal-owned. One schema, two consumers (§9.5): the API validates
// these and the Maintenance UI reuses the exact same shapes. Free lines book as
// RM0 order_lines with attrs markers — create_order / order_lines untouched.
// ---------------------------------------------------------------------------

/** A P6 `TargetRefinement` WITHOUT a modelId (a default-gift condition is scoped
 *  to its own model already). Mirrors the shared `TargetRefinement` type. */
export const targetRefinementSchema = z.object({
  scope: ruleTargetScopeSchema,
  sizeCodes: z.array(z.string()).optional(),
  comboIds: z.array(z.string()).optional(),
  compartments: z.array(z.string()).optional(),
});
export type TargetRefinementDto = z.infer<typeof targetRefinementSchema>;

/** One configured default free gift (mirrors the shared `DefaultFreeGift`). */
export const defaultFreeGiftSchema = z.object({
  giftSku: z.string(),
  qty: z.number().int().positive(),
  label: z.string().optional(),
  condition: targetRefinementSchema.optional(),
});
export type DefaultFreeGiftDto = z.infer<typeof defaultFreeGiftSchema>;

/** A `model_default_free_gifts` row DTO (mirrors `ModelDefaultFreeGifts`). */
export const modelDefaultFreeGiftsSchema = z.object({
  modelId: z.string().uuid(),
  gifts: z.array(defaultFreeGiftSchema),
});
export type ModelDefaultFreeGiftsDto = z.infer<typeof modelDefaultFreeGiftsSchema>;

/** Upsert a model's gift set (the PUT body for
 *  /models/:id/default-free-gifts). `giftSku` non-empty + `qty` >= 1; the
 *  optional `condition` reuses the P6 refinement. Replaces the whole set (an
 *  empty `gifts` clears it). */
export const modelDefaultFreeGiftsInput = z
  .object({
    gifts: z.array(
      z
        .object({
          giftSku: z.string().trim().min(1),
          qty: z.number().int().positive(),
          label: z.string().trim().max(120).optional(),
          condition: targetRefinementSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type ModelDefaultFreeGiftsInput = z.infer<typeof modelDefaultFreeGiftsInput>;

/** A `free_item_campaigns` row DTO (mirrors the shared `FreeItemCampaign`). */
export const freeItemCampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  active: z.boolean(),
  maxFreeQty: z.number().int().positive(),
  eligible: z.array(ruleTargetSchema),
});
export type FreeItemCampaignDto = z.infer<typeof freeItemCampaignSchema>;

/** Create / patch a free item campaign. `eligible` requires >=1 target (an
 *  EMPTY eligible covers nothing — see `campaignsCoveringLine`); `maxFreeQty`
 *  >= 1 (optional; server defaults to 1). `active` defaults false server-side. */
export const freeItemCampaignInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    active: z.boolean().optional(),
    maxFreeQty: z.number().int().positive().optional(),
    eligible: z.array(ruleTargetSchema).min(1),
  })
  .strict();
export type FreeItemCampaignInput = z.infer<typeof freeItemCampaignInput>;

// ---------------------------------------------------------------------------
// 0186 — PWP & Promo RULES (2990s Products parity Phase 8a). Principal-owned.
// A rule maps a trigger category/scope → a reward category/scope at a ratio
// qtyPerTrigger. type 'pwp' = the reward is sold at its per-SKU pwp_price;
// 'promo' = the reward is FREE. The reward PRICE is NOT on the rule — it lives
// per-SKU (product_skus.pwp_price) / per-sofa-combo
// (sofa_combo_pricing.pwp_prices_by_height). One schema, two consumers (§9.5):
// the API validates these and the Maintenance UI reuses the exact same shapes.
// DORMANT (active default false; no order consumer in P8a).
// ---------------------------------------------------------------------------

/** A `pwp_rules` row DTO (mirrors the engine's `PwpRule`, with a row `id` +
 *  `active`). Trigger/reward scope are P6 RuleTarget[] (`[]` = the whole
 *  category — the 2990s semantic; NO `.min(1)`, empty-within-a-category is
 *  intentional for PWP). */
export const pwpRuleSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["pwp", "promo"]),
  triggerCategory: productCategorySchema,
  triggerTargets: z.array(ruleTargetSchema),
  rewardCategory: productCategorySchema,
  rewardTargets: z.array(ruleTargetSchema),
  qtyPerTrigger: z.number().int().positive(),
  active: z.boolean(),
  // P8d (0188) — cross-order carry-forward policy. `carryForward` true (default)
  // = an unclaimed RESERVED voucher minted by this rule carries forward to the
  // customer's next order; false = same-cart delete (P8c). `carryForwardDays` =
  // optional expiry window (null = perpetual).
  carryForward: z.boolean(),
  carryForwardDays: z.number().int().positive().nullable(),
});
export type PwpRuleDto = z.infer<typeof pwpRuleSchema>;

/** Create / patch a PWP rule. `triggerTargets` / `rewardTargets` ALLOW empty (an
 *  empty target list = the whole category — do NOT add `.min(1)`).
 *  `qtyPerTrigger` optional (server defaults to 1); `active` defaults false
 *  server-side. P8d (0188): `carryForward` optional (server defaults true) +
 *  `carryForwardDays` optional/nullable (null = perpetual). */
export const pwpRuleInput = z
  .object({
    type: z.enum(["pwp", "promo"]),
    triggerCategory: productCategorySchema,
    triggerTargets: z.array(ruleTargetSchema),
    rewardCategory: productCategorySchema,
    rewardTargets: z.array(ruleTargetSchema),
    qtyPerTrigger: z.number().int().positive().optional(),
    active: z.boolean().optional(),
    // P8d (0188) — both optional; the server defaults carryForward true.
    carryForward: z.boolean().optional(),
    carryForwardDays: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type PwpRuleInput = z.infer<typeof pwpRuleInput>;

// ---------------------------------------------------------------------------
// 0187 — PWP voucher LEDGER (2990s Products parity Phase 8c, SAME-CART state
// machine). The pwp_codes DTO (the reconciler's read shape) + the reserve
// request/response + the extended `attrs.pwp` reward-line marker. One schema,
// two consumers (§9.5): the API validates these and the POS reuses the exact
// same shapes. DORMANT — no codes minted until the principal authors active
// pwp_rules. (The order-path claim runs as a separate post-P8b stage; the price
// stays P8b-authoritative — see the design plan §0.)
// ---------------------------------------------------------------------------

/** The voucher status machine: RESERVED (minted on a cart trigger) → USED
 *  (claimed at Confirm). 'AVAILABLE' ships for the P8d cross-order carry-forward
 *  (written by nobody in P8c). */
export const pwpCodeStatusSchema = z.enum(["RESERVED", "USED", "AVAILABLE"]);
export type PwpCodeStatusValue = z.infer<typeof pwpCodeStatusSchema>;

/** A `pwp_codes` row DTO (mirrors the `PwpCode` domain type, camelCased). The
 *  reconciler (`GET /mine`) + the reserve endpoint return arrays of these.
 *  `rewardTargets` is the rule's reward-scope snapshot ([] = whole category).
 *  OWNER-SCOPED USE ONLY — this carries `boundCustomerPhone` (the bound customer's
 *  PII). Cross-order discovery uses the stripped `pwpDiscoverDtoSchema` instead, so
 *  a non-owner never receives a phone. P8d (0188) adds the cross-order binding
 *  fields (`boundCustomerPhone` / `ownerDealerId` / `expiresAt`); `customerId`
 *  remains permanently null (a P8c dormant artifact — the binding uses
 *  `boundCustomerPhone`, not `customerId`; CF `pwp-customer-id-dead-column`). */
export const pwpCodeSchema = z.object({
  code: z.string(),
  ruleId: z.string().uuid().nullable(),
  type: z.enum(["pwp", "promo"]),
  rewardCategory: z.string(),
  rewardTargets: z.array(ruleTargetSchema),
  status: pwpCodeStatusSchema,
  ownerStaffId: z.string().uuid().nullable(),
  cartLineKey: z.string().nullable(),
  triggerItemCode: z.string().nullable(),
  claimGroup: z.string().uuid().nullable(),
  redeemedOrderId: z.string().uuid().nullable(),
  redeemedItemSku: z.string().nullable(),
  // P8d cross-order columns.
  sourceOrderId: z.string().uuid().nullable(),
  // Permanently null — the binding uses boundCustomerPhone, not customerId.
  customerId: z.string().uuid().nullable(),
  // P8d (0188) — cross-order carry-forward binding (owner-scoped read only).
  boundCustomerPhone: z.string().nullable(),
  ownerDealerId: z.string().uuid().nullable(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PwpCodeDto = z.infer<typeof pwpCodeSchema>;

/** The STRIPPED cross-order DISCOVERY DTO (P8d, 0188) — the `/available` route's
 *  return shape, mapped from `pwp_discover_available`. It deliberately OMITS
 *  `boundCustomerPhone` / `ownerStaffId` / `triggerItemCode` / `redeemedItemSku` /
 *  `customerId` — the structural guarantee that discovery cannot leak another
 *  customer's PII. The phone match is the server-computed `phoneMatches` boolean,
 *  so the stored phone is never returned (killing the `?code=` enumeration/PII
 *  oracle). */
export const pwpDiscoverDtoSchema = z.object({
  code: z.string(),
  ruleId: z.string().uuid().nullable(),
  type: z.enum(["pwp", "promo"]),
  rewardCategory: z.string(),
  rewardTargets: z.array(ruleTargetSchema),
  sourceOrderId: z.string().uuid().nullable(),
  expiresAt: z.string().nullable(),
  phoneMatches: z.boolean(),
  /** 0204 — the NAME half of the 2990s name+phone binding (server-computed;
   *  defaults true for pre-0204 API responses). */
  nameMatches: z.boolean().default(true),
});
export type PwpDiscoverDto = z.infer<typeof pwpDiscoverDtoSchema>;

/** `GET /api/pwp-codes/available` response — the discovered AVAILABLE vouchers
 *  (stripped). No selector (no phone + no code) => `{ vouchers: [] }`. */
export const pwpDiscoverResponseSchema = z.object({
  vouchers: z.array(pwpDiscoverDtoSchema),
});
export type PwpDiscoverResponse = z.infer<typeof pwpDiscoverResponseSchema>;

/** POST /api/pwp-codes/reserve input — the trigger cart line just added/changed.
 *  The route reconciles (top-up / trim) the RESERVED set this line owns. */
export const pwpReserveInputSchema = z
  .object({
    cartLineKey: z.string().min(1),
    sku: z.string().min(1),
    qty: z.number().int().positive(),
    /** True when the trigger line is ITSELF a reward (claimed PWP/promo, free
     *  item, or appended free gift). The reserve route then skips PROMO rules —
     *  a free reward must never mint a promo voucher that funds the next free
     *  reward (2990s one-way parity). PWP rules still reserve (chainable). */
    rewardLine: z.boolean().optional(),
    /** The trigger line's built module codes when it is a SOFA BUILD — lets the
     *  reserve route match COMBO-scope trigger targets (a flat sku carries no
     *  build, so combo triggers otherwise never mint). Absent for flat lines. */
    builtCompartments: z.array(z.string()).max(60).optional(),
  })
  .strict();
export type PwpReserveInput = z.infer<typeof pwpReserveInputSchema>;

/** Reserve / `GET /mine` response — the FULL current RESERVED set (no match =>
 *  `{ codes: [] }`). Keyed client-side by `cartLineKey`. */
export const pwpCodesResponseSchema = z.object({
  codes: z.array(pwpCodeSchema),
});
export type PwpCodesResponse = z.infer<typeof pwpCodesResponseSchema>;

/** The reward-line `attrs.pwp` marker shape — EXTENDED for P8c. P8b canonicalises
 *  the marker to `{ ruleId, type?, triggerRef? }`; P8c adds two OPTIONAL fields a
 *  reward line may carry: `code` (the RESERVED voucher the POS bound to this
 *  reward, claimed RESERVED→USED at Confirm) + `claimGroup` (the per-submit
 *  correlation uuid). Both optional — a DORMANT / P8b-only line carries neither,
 *  so the marker stays byte-identical when no voucher is in play. `.passthrough()`
 *  keeps P8b's `type` / `triggerRef` fields (this schema only PINS the P8c/P8d
 *  additions; the order-path claim reads `code` + `claimGroup` + `crossOrder`).
 *  P8d (0188) adds `crossOrder` (optional): when true, the bound `code` is an
 *  AVAILABLE carry-forward voucher claimed via `pwp_claim_available_code` (phone-
 *  bound), not a same-cart RESERVED code. Omitted/false => same-cart (byte-
 *  identical to a P8c marker). */
export const attrsPwpMarkerSchema = z
  .object({
    ruleId: z.string(),
    code: z.string().optional(),
    claimGroup: z.string().optional(),
    crossOrder: z.boolean().optional(),
  })
  .passthrough();
export type AttrsPwpMarker = z.infer<typeof attrsPwpMarkerSchema>;

// ---------------------------------------------------------------------------
// 0239 — Product bundles (bundle pricing). Principal-owned. A bundle = a named
// set of catalog SKUs sold together at ONE bundle price; the POS explodes it
// into component order_lines via the pure `explodeBundle` (split Σ-exact).
// One schema, two consumers (§9.5): the API validates these and the Promo/GWP
// tab editor reuses the exact same shapes. DORMANT until authored + active.
// ---------------------------------------------------------------------------

/** One bundle component (mirrors the shared `BundleComponent`). */
export const bundleComponentSchema = z
  .object({
    sku: z.string().trim().min(1).max(60),
    qty: z.number().int().positive().max(99),
  })
  .strict();
export type BundleComponentDto = z.infer<typeof bundleComponentSchema>;

/** One customizable-bundle slot (0241; mirrors the shared `BundleSlot`).
 *  variant 'fixed' pins the exact `sku` (exactly ONE model); 'any' lets the
 *  customer pick any live variant of the chosen model at the POS. */
export const bundleSlotSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    qty: z.number().int().positive().max(9),
    modelIds: z.array(z.string().uuid()).min(1).max(10),
    variant: z.enum(["any", "fixed"]),
    sku: z.string().trim().min(1).max(60).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.variant === "fixed" && !v.sku)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "a fixed-variant slot needs its exact SKU" });
    if (v.variant === "fixed" && v.modelIds.length !== 1)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "a fixed-variant slot pins exactly one product" });
  });
export type BundleSlotDto = z.infer<typeof bundleSlotSchema>;

/** A `product_bundles` row DTO (mirrors the shared `ProductBundle`). `kind` /
 *  `slots` default for pre-0241 serialized payloads; the adapter always emits. */
export const productBundleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number(),
  kind: z.enum(["fixed", "custom"]).default("fixed"),
  components: z.array(bundleComponentSchema),
  slots: z.array(bundleSlotSchema).default([]),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type ProductBundleDto = z.infer<typeof productBundleSchema>;

/** Create a bundle. kind 'fixed' (default) needs ≥2 pinned components; kind
 *  'custom' (0241) needs ≥1 slot. `active` defaults false server-side. The RM
 *  1M price cap keeps a typo out of numeric(14,2) AND keeps the cents math
 *  well inside float-safe integer range (mirrors the 0181 SPECIAL_MONEY bound). */
const productBundleFields = z
  .object({
    name: z.string().trim().min(2).max(80),
    price: z.number().nonnegative().lte(1_000_000),
    kind: z.enum(["fixed", "custom"]).optional(),
    components: z.array(bundleComponentSchema).max(20).optional(),
    slots: z.array(bundleSlotSchema).max(10).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export const productBundleInput = productBundleFields.superRefine((v, ctx) => {
  const kind = v.kind ?? "fixed";
  if (kind === "fixed" && (v.components?.length ?? 0) < 2)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["components"],
      message: "a fixed bundle needs at least 2 items",
    });
  if (kind === "custom" && (v.slots?.length ?? 0) < 1)
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slots"],
      message: "a customizable bundle needs at least 1 item slot",
    });
});
export type ProductBundleInput = z.infer<typeof productBundleInput>;

/** Patch a bundle — every field of create is optional (empty body → 422; the
 *  per-kind minimums are create-time shape rules, not patch rules). */
export const productBundlePatchInput = productBundleFields.partial().strict();
export type ProductBundlePatchInput = z.infer<typeof productBundlePatchInput>;

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
  // 0185 — Default Free Gifts + Free Item Campaigns (additive, OPTIONAL).
  // Pre-0185 clients that don't read these are wholly unaffected.
  modelDefaultFreeGifts: z.array(modelDefaultFreeGiftsSchema).optional(),
  freeItemCampaigns: z.array(freeItemCampaignSchema).optional(),
  // 0186 — PWP & Promo rules (additive, OPTIONAL). Pre-0186 clients unaffected.
  pwpRules: z.array(pwpRuleSchema).optional(),
  // 0239 — Product bundles (additive, OPTIONAL). POS sees active only; admin
  // sees all. Pre-0239 clients that don't read this key are wholly unaffected.
  bundles: z.array(productBundleSchema).optional(),
  // 0219 — Order Entry config (payment methods + form fields; additive,
  // OPTIONAL). The POS renders payment methods + the Customer-step form from
  // it; empty/absent → code defaults (pre-0219 behavior + Cash).
  orderEntryConfig: orderEntryConfigSchema.nullable().optional(),
  // 0202 — global procurement fabric master (additive, OPTIONAL). Pre-0202
  // clients that don't read this are wholly unaffected.
  fabrics: z.array(catalogFabricSchema).optional(),
  // 0262 — guarantee terms (additive, OPTIONAL). The POS needs these in the
  // SAME round-trip as the models: without them it cannot tell a guarantee SKU
  // from an accessory, nor which cart lines a guarantee may attach to.
  // Pre-0262 clients that don't read this key are wholly unaffected.
  guaranteeTerms: z.array(guaranteeTermSchema).optional(),
  // 0303 (P1) — the earliest delivery date a store may sell, in CALENDAR
  // days, from `purchasing_settings`. It rides the catalog bundle because
  // every surface that needs it (the POS date picker, the edit-order modal,
  // the accept-proceed dialog) already loads the catalog in the same
  // round-trip — a second fetch would be a second chance to disagree.
  // Additive + OPTIONAL: a browser on an older bundle ignores the key.
  earliestSellDays: z.number().int().nonnegative().optional(),
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
  // 0233 staff PIN login — defaulted so pre-0233 payloads/mocks stay valid.
  staffRole: z.enum(["principal", "manager", "salesperson"]).default("salesperson"),
  color: z.string().nullable().default(null),
  active: z.boolean().default(true),
  // 0241 staff profile — defaulted for the same reason.
  email: z.string().nullable().default(null),
  birthday: z.string().nullable().default(null),
  gender: z.enum(["male", "female"]).nullable().default(null),
  // HR Team hierarchy — CRnnn code (showroom staff only; dealer staff = null).
  staffCode: z.string().nullable().default(null),
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
    // '' is allowed ONLY for the no-variant-axis categories (accessory /
    // service — one SKU per model, Loo 2026-07-11); the POST /skus route
    // enforces non-empty for every other category (the category lives on the
    // model row, so the gate can't be in this schema). Empty variant → the SKU
    // code is the bare MODEL_KEY (no `-` suffix).
    variant: z.string().trim().max(60),
    variantKind: variantKindSchema,
    price: z.number().nonnegative(),
    cost: z.number().nonnegative().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    /** 0375 — the SUPPLIER'S own item code (their quotation's code for this
     *  piece). Free text like `sku`; not money, so not 0175-gated. */
    supplierCode: z.string().trim().max(80).nullable().optional(),
    description: z.string().trim().max(200).nullable().optional(),
    posActive: z.boolean().optional(),
    /** 0442 — Catalog states how Stock identifies the SKU. Omitted = NULL =
     *  "Catalog has not said", and official PO issue refuses the SKU by name
     *  until it is set. Never derived server-side from the category. */
    stockIdentityMode: stockIdentityModeSchema.nullable().optional(),
    // 0186 (PWP Phase 8a) — principal-only per-SKU reward price (the price a
    // PWP-rule reward line is sold at). Mirrors `cost`: economic, nullable.
    // The route gate (gateSkuCreatePriceCost) + the DB trigger enforce
    // principal-only; null/omit = unset.
    pwpPrice: z.number().nonnegative().nullable().optional(),
  })
  .strict();
export type ProductSkuCreateInput = z.infer<typeof productSkuCreateInput>;

export const productSkuPatchInput = z
  .object({
    // Loo 2026-07-11 — the CODE is a free field (AutoCount style: ACC-601),
    // directly renameable. `{MODEL_KEY}-{variant}` is only the MINT default;
    // editing the variant/SIZE label no longer rewrites the code. Historical
    // orders/POs keep the old code string. DB unique(sku) → 409 on collision.
    sku: z.string().trim().min(1).max(60).optional(),
    // '' clears the variant — allowed ONLY for accessory/service (no variant
    // axis; the route gates by the model's category). Mirrors
    // productSkuCreateInput. Does NOT touch the code (see `sku` above).
    variant: z.string().trim().max(60).optional(),
    variantKind: variantKindSchema.optional(),
    price: z.number().nonnegative().optional(),
    cost: z.number().nonnegative().nullable().optional(),
    supplierId: z.string().uuid().nullable().optional(),
    /** 0375 — supplier's own item code. '' clears (stored as null). */
    supplierCode: z.string().trim().max(80).nullable().optional(),
    // 0075 (Loo 2026-05-09) — restore toggle.
    discontinuedAt: z.string().datetime().nullable().optional(),
    // 0170 — Edit-Prices / Modular toggle / inline description edit.
    posActive: z.boolean().optional(),
    description: z.string().trim().max(200).nullable().optional(),
    /** 0442 — the stored stock identity mode; every change is ledgered. */
    stockIdentityMode: stockIdentityModeSchema.nullable().optional(),
    // 0186 (PWP Phase 8a) — principal-only per-SKU reward price (mirrors `cost`).
    // Presence = intent to change → gated to principal in the route.
    pwpPrice: z.number().nonnegative().nullable().optional(),
    // 0204 (per-size pricing) — REPLACES the whole {size → RM} map (the UI
    // sends the full map on each commit; a size with no price is OMITTED, not
    // nulled). `null` clears the map entirely. Presence = intent to change →
    // gated to principal in the route (mirrors price/cost/pwpPrice).
    pricesBySize: z
      .record(z.string().trim().min(1).max(24), z.number().nonnegative())
      .nullable()
      .optional(),
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
    /* 2026-08-24 - override the batch's auto-resolved supplier. Absent (the
     * default) keeps today's behaviour byte-identical: the first supplier
     * whose cat_covered[] names this model's category. Two suppliers can
     * both cover mattress; without this a keyer has no way to say a brand-new
     * batch is Hookka's, not whichever supplier happened to sort first. */
    supplierId: z.string().uuid().optional(),
    /* ⭐ THE SUPPLIER'S OWN CODE, BATCH DEFAULT + PER-PIECE OVERRIDE
     * (2026-08-24). A quotation names Carres' SKU nowhere — it names the
     * supplier's code, and that is the only string a keyer can match a
     * factory's paperwork against. `supplierCode` fills every generated row;
     * `supplierCodes` overrides it for one variant, because a quotation
     * usually lists a DIFFERENT code per size. Both absent writes NULL, which
     * is what every row generated before today already holds.
     *
     * Keyed by the RAW variant the caller sent, never the canonical size: the
     * caller has no way to know that `K` becomes `King` on the way in. */
    supplierCode: z.string().trim().max(60).optional(),
    supplierCodes: z.record(z.string(), z.string().trim().max(60)).optional(),
    /* ⭐ A QUOTATION PRICES EACH SIZE DIFFERENTLY (2026-08-25). The Hookka
     * bedframe list is the measured case: Cody at K/Q/S/SS is 550/425/395/
     * 407.50 — one batch `price` cannot say that, so every generated SKU came
     * out wrong-or-zero and was re-keyed by hand in SKU Master. Same contract
     * as `supplierCodes`: keyed by the RAW variant the caller sent, a variant's
     * entry wins over the batch `price`, absent falls back. Principal-only in
     * effect — the 0175/0186 trigger refuses the write for anyone else, and the
     * modal never renders the boxes for them.
     *
     * `pwpPrices` seeds pwp_price the same way. There is deliberately no BATCH
     * pwp: the measured quotation's Price 1 exists only on some rows and never
     * repeats across sizes, so a batch default would only invent numbers. */
    prices: z.record(z.string(), z.number().nonnegative()).optional(),
    pwpPrices: z.record(z.string(), z.number().nonnegative()).optional(),
    /** 0442 — the stock identity mode every generated SKU is created with.
     *  Omitted = NULL on every row (PO issue refuses until Catalog sets it). */
    stockIdentityMode: stockIdentityModeSchema.optional(),
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

/** Add-ons CRUD (Maintenance tab). `serviceDescription` is NOT an addons
 *  column — it feeds the auto-minted SVC- product_skus row's description
 *  (Loo 2026-07-12: creating an add-on also creates its Service SKU in the
 *  SKU master so the link is real, mirroring the 0172 hand-minted rows). */
export const addonCreateInput = z
  .object({
    key: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "key must be kebab-case"),
    name: z.string().trim().min(2).max(80),
    price: z.number().nonnegative(),
    active: z.boolean().optional(),
    serviceSku: serviceSkuCodeSchema.nullable().optional(),
    serviceDescription: z.string().trim().max(200).optional(),
    // 0242 — size list; null/[] = no size pick at checkout.
    sizeOptions: z.array(z.string().trim().min(1).max(40)).max(20).nullable().optional(),
  })
  .strict();
export type AddonCreateInput = z.infer<typeof addonCreateInput>;

export const addonPatchInput = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    price: z.number().nonnegative().optional(),
    active: z.boolean().optional(),
    serviceSku: serviceSkuCodeSchema.nullable().optional(),
    serviceDescription: z.string().trim().max(200).optional(),
    // 0242 — size list; null/[] clears (no size pick at checkout).
    sizeOptions: z.array(z.string().trim().min(1).max(40)).max(20).nullable().optional(),
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
    surcharge: z.number().nullable().optional(),
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
    surcharge: z.number().nullable().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
  })
  .strict();
export type CatalogOptionPoolPatchInput = z.infer<typeof catalogOptionPoolPatchInput>;

/**
 * ⭐ CREATING A SUPPLIER — POST /api/operation/suppliers (2026-08-24).
 *
 * Until today the portal had NO supplier-creation door at all: not a route,
 * not a screen. Every supplier in the database was inserted by hand in SQL,
 * which meant onboarding a factory was an engineering task and a keyer who met
 * a new one mid-catalog simply stopped.
 *
 * Purchasing still OWNS the record; this is a door, not a second home for it
 * (Architecture Law C). `suppliers_principal_write` (0002) already answers who
 * may walk through — principal only — so nothing about RLS changes here.
 *
 * `slug` is deliberately NOT an input. It is `suppliers_slug_unique` in
 * production and keys SUPPLIER_SOP across environments (0032), so it is
 * derived from the name server-side: a keyer who never heard of a slug cannot
 * mistype one, and two suppliers cannot quietly agree on it.
 */
export const supplierCreateInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    kind: z.enum(["own_logistics", "factory_pickup"]),
    catCovered: z.array(z.enum(["mattress", "bedframe", "sofa"])).min(1).max(3),
    productionDays: z.array(z.object({
      category: z.enum(["mattress", "bedframe", "sofa"]),
      workingDays: z.number().int().min(1).max(180),
    }).strict()).min(1).max(3),
    offDays: z.array(z.number().int().min(0).max(6)).min(1).max(6),
  })
  .strict().superRefine((input, ctx) => {
  const categories = new Set(input.catCovered);
  if (categories.size !== input.catCovered.length ||
      input.productionDays.length !== categories.size ||
      new Set(input.productionDays.map(row => row.category)).size !== categories.size ||
      input.productionDays.some(row => !categories.has(row.category))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["productionDays"],
      message: "Add Production Days for every selected category." });
  }
  if (new Set(input.offDays).size !== input.offDays.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["offDays"],
      message: "Choose each day once." });
  }
});
export type SupplierCreateInput = z.infer<typeof supplierCreateInput>;

/** The stable slug for a supplier name: lowercase, punctuation folded to single
 *  hyphens, ends trimmed. `HoOKkA` → `hookka`, matching the 0032 backfill so a
 *  supplier created today and one created by that migration read alike. */
export function supplierSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * ⭐ DUAL-SOURCING, THE RECORDING HALF (0388 · YH, 2026-08-26).
 *
 * One row per (sku, supplier): that supplier's OWN code and quoted prices for
 * the piece. The SKU's `supplier_id` slot stays the routing truth for POs —
 * these are the offers the slot chooses from, so the fact that had nowhere to
 * live (the second Hookka's paper) is recorded without any behaviour moving.
 */
export const skuSupplierOfferSchema = z.object({
  supplierId: z.string().uuid(),
  /** Joined for display — the IDENTITY is the id (Law A/D). */
  supplierName: z.string().nullable(),
  supplierCode: z.string().nullable(),
  price: z.number().nullable(),
  pwpPrice: z.number().nullable(),
  /** 0389 — the supplier's quote per sofa seat height, the 0204 {size → RM}
   *  shape. NULL = not quoted by height. */
  pricesBySize: z.record(z.string(), z.number()).nullable(),
  updatedAt: z.string(),
});
export type SkuSupplierOfferDto = z.infer<typeof skuSupplierOfferSchema>;

export const skuSupplierOfferUpsertInput = z
  .object({
    supplierId: z.string().uuid(),
    supplierCode: z.string().trim().max(60).nullable().optional(),
    price: z.number().nonnegative().nullable().optional(),
    pwpPrice: z.number().nonnegative().nullable().optional(),
    /* 0389 — per-seat-height quote. ABSENT = leave whatever is stored (and,
     * until the column is applied, keeps the write payload free of a column
     * PostgREST would refuse — the 0375 deploy-order lesson). */
    pricesBySize: z.record(z.string(), z.number().nonnegative()).nullable().optional(),
  })
  .strict();
export type SkuSupplierOfferUpsertInput = z.infer<typeof skuSupplierOfferUpsertInput>;
