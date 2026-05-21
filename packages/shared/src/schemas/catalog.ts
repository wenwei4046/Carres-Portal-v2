import { z } from "zod";

/**
 * Catalog bundle — single endpoint that returns everything the wizard's product
 * picker needs in one round-trip: models + skus + sofa fabrics + addons + floor
 * config. RLS allows any authenticated user to read; products/addons writes are
 * principal-only.
 *
 * Outlets + Salespersons are scoped read endpoints (dealer sees only their own;
 * principal/internal sees all). Used by wizard Step 1 to pick the outlet + SP.
 */

export const productCategorySchema = z.enum(["mattress", "bedframe", "sofa"]);
export type ProductCategory = z.infer<typeof productCategorySchema>;

export const variantKindSchema = z.enum(["size", "preset", "part"]);
export type VariantKind = z.infer<typeof variantKindSchema>;

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
  // 2026-05-17 — SKU-level supplier_id (NOT NULL on DB since 0074). Required
  // for CreatePOModal to route lines to the right supplier group.
  supplierId: z.string().uuid().nullable(),
  discontinuedAt: z.string().nullable().optional(),
});
export type ProductSkuDto = z.infer<typeof productSkuSchema>;

export const sofaFabricSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  fabricName: z.string(),
  surcharge: z.number(),
  // 0075 — fabric color options (Loo 2026-05-09).
  colors: z.array(z.string()).nullable(),
  discontinuedAt: z.string().nullable().optional(),
});
export type SofaFabricDto = z.infer<typeof sofaFabricSchema>;

export const addonSchema = z.object({
  key: z.string(),
  name: z.string(),
  price: z.number(),
  active: z.boolean(),
});
export type AddonDto = z.infer<typeof addonSchema>;

export const floorConfigSchema = z.object({
  id: z.number().int(),
  freeUpToFloor: z.number().int(),
  perFloorPerItem: z.number(),
});
export type FloorConfigDto = z.infer<typeof floorConfigSchema>;

export const catalogResponseSchema = z.object({
  models: z.array(productModelSchema),
  skus: z.array(productSkuSchema),
  sofaFabrics: z.array(sofaFabricSchema),
  addons: z.array(addonSchema),
  floorConfig: floorConfigSchema,
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
