import { z } from "zod";

/**
 * The product category enum, in its own module so BOTH `schemas/catalog.ts` and
 * `schemas/guarantee.ts` can depend on it without importing each other
 * (catalog's bundle carries guarantee terms; guarantee terms name a category).
 * `schemas/catalog.ts` re-exports it, so every existing import keeps working.
 *
 * 0169 widened 3->5: 'accessory' and 'service' carry no variant axis (one SKU
 * per model); 'service' is the bucket for delivery / disposal / labour SKUs.
 * 0261 widened 5->6: 'guarantee' is neither goods nor labour — a multi-year
 * liability sold against ONE covered unit. Like accessory/service it has no
 * supplier and never enters a PO.
 */
export const productCategorySchema = z.enum([
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
  "service",
  "guarantee",
]);
export type ProductCategory = z.infer<typeof productCategorySchema>;
