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
});
export type ProductModelDto = z.infer<typeof productModelSchema>;

export const productSkuSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  sku: z.string(),
  variant: z.string(),
  variantKind: variantKindSchema,
  price: z.number(),
});
export type ProductSkuDto = z.infer<typeof productSkuSchema>;

export const sofaFabricSchema = z.object({
  id: z.string().uuid(),
  modelId: z.string().uuid(),
  fabricName: z.string(),
  surcharge: z.number(),
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
