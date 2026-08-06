import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CATALOG_CATEGORIES,
  makeCategoryOf,
  type CatalogCategory,
  type CatalogCategoryEntry,
  type CategoryOf,
} from "@carres/shared";
import { embedCategory } from "./rule-line-input";

/**
 * Build THE category resolver (ERP-ARCHITECTURE §3.1 — every module asks the
 * catalog) from the whole catalog: product_skus ⋈ product_models.category, one
 * read via the caller's client (RLS). The catalog is small (~205 rows) and the
 * resolver matches NORMALIZED skus, which an `.in("sku", …)` batch read cannot
 * — order_lines carry free-text drift the exact-match join misses.
 *
 * Fail-SOFT, deliberately: a read error returns the resolver's fallback chain
 * (the keyword rule) instead of throwing — the storage gate and the money
 * summary must not go down with a catalog read, they just answer the way the
 * portal answered before the catalog owned the question.
 */
export async function catalogCategoryOf(sb: SupabaseClient): Promise<CategoryOf> {
  try {
    const { data, error } = await sb
      .from("product_skus")
      .select("sku, product_models(category)");
    if (error) return makeCategoryOf([]);
    const entries: CatalogCategoryEntry[] = [];
    for (const row of (data ?? []) as Array<{
      sku?: string;
      product_models?: { category?: string } | Array<{ category?: string }> | null;
    }>) {
      const cat = embedCategory(row.product_models);
      if (row.sku && (CATALOG_CATEGORIES as readonly string[]).includes(cat))
        entries.push({ sku: row.sku, category: cat as CatalogCategory });
    }
    return makeCategoryOf(entries);
  } catch {
    return makeCategoryOf([]);
  }
}
