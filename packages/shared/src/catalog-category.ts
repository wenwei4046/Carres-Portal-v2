/**
 * V2 · THE category rule (ERP-ARCHITECTURE §3.1 Catalog / §4 engines) — the ONE
 * answer to "what kind of product is this?".
 *
 * D9, measured on production 2026-08-06: three functions answered this question
 * — `product_models.category` (the catalog, correct), `lineCategory` (a keyword
 * regex, partly correct) and `storageCategoryForSku` (prefix-only, wrong for
 * every live SKU). 26 sofa lines read as accessories across 10 named orders,
 * the Sofa facet read 0, and the storage rate resolved to neither rate on every
 * live order. OperationPayments carried a fourth local copy (`catOf`).
 *
 * In V2 there is one answer and every module asks the catalog for it:
 *
 *   makeCategoryOf(entries)  — entries come from product_skus ⋈ product_models
 *   categoryOf(sku)          — catalog answer; falls back to the keyword rule
 *                              ONLY for a sku the catalog has never seen
 *
 * The fallback exists because today's order_lines carry AutoCount free-text
 * "skus" from the trial import (Constitution §6 — TEST data, gone at go-live).
 * It lives INSIDE this one function so there is still exactly ONE arithmetic
 * (Law D); no caller may reach around it to a regex.
 */
import { lineCategory, lineKind } from "./line-category";
import {
  productCategorySchema,
  type ProductCategory,
} from "./schemas/product-category";
import { normalizeSkuKey } from "./sku-code";

/** THE category vocabulary — the `product_category` enum, not a copy of it. */
export const CATALOG_CATEGORIES = productCategorySchema.options;
export type CatalogCategory = ProductCategory;

export interface CatalogCategoryEntry {
  sku: string;
  category: CatalogCategory;
}

/** The resolver every module asks. Total — always answers, never throws. */
export type CategoryOf = (sku: string) => CatalogCategory;

/**
 * The keyword rule, kept ONLY as this module's fallback for skus the catalog
 * has never seen (trial-import free text). Maps `lineCategory`/`lineKind`'s
 * vocabulary into the catalog's: core categories pass through; non-core splits
 * accessory vs service the way `lineKind` already does. It can never answer
 * "guarantee" — only a catalog row can.
 */
export function legacyKeywordCategory(sku: string): CatalogCategory {
  const cat = lineCategory(sku);
  if (cat !== "acc") return cat;
  return lineKind(sku) === "service" ? "service" : "accessory";
}

/**
 * Build the ONE resolver from catalog rows (product_skus ⋈ product_models).
 * Keys are normalized (`normalizeSkuKey`) so cosmetic drift — case, spacing,
 * punctuation — still resolves; a catalog answer always beats the fallback.
 */
export function makeCategoryOf(
  entries: ReadonlyArray<CatalogCategoryEntry>,
): CategoryOf {
  const byKey = new Map<string, CatalogCategory>();
  for (const e of entries) {
    const key = normalizeSkuKey(e.sku);
    if (key) byKey.set(key, e.category);
  }
  return (sku: string) =>
    byKey.get(normalizeSkuKey(sku)) ?? legacyKeywordCategory(sku);
}

/**
 * Build resolver entries from the catalog BUNDLE shape (`/api/catalog`:
 * models carry the category, skus point at their model) — the web's one-liner
 * from `useCatalog()` data to the resolver. A sku whose model is missing from
 * the (filtered) model list is skipped; the resolver's fallback covers it.
 */
export function categoryEntriesFromCatalog(
  models: ReadonlyArray<{ id: string; category: CatalogCategory }>,
  skus: ReadonlyArray<{ modelId: string; sku: string }>,
): CatalogCategoryEntry[] {
  const catByModel = new Map(models.map((m) => [m.id, m.category]));
  const entries: CatalogCategoryEntry[] = [];
  for (const s of skus) {
    const category = catByModel.get(s.modelId);
    if (category) entries.push({ sku: s.sku, category });
  }
  return entries;
}

/**
 * Storage-rate scope of a category (Decision ① — Money In's arithmetic asks
 * the CATALOG): mattress/bed frame bill at the MS/BF rate, sofa at the SOF
 * rate, everything else is out of scope. THE one mapping; the sku-based
 * `storageCategoryForSku` delegates here.
 */
export function storageCategoryOf(
  category: CatalogCategory,
): "msbf" | "sof" | "other" {
  if (category === "mattress" || category === "bedframe") return "msbf";
  if (category === "sofa") return "sof";
  return "other";
}
