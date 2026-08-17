import { cartHasGoods } from "@carres/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ONE SKU → `product_models.category` READ, AND EVERY GATE SHARES IT.
 *
 * The earliest-sell floor (`lead-time.ts`) and the goods gate below both ask
 * the catalog the same question, and two copies of one join are two answers
 * waiting to disagree (ownership Law D).
 *
 * Returns a Map keyed by the SKU string. A SKU the catalog does not hold is
 * simply ABSENT — never `null`, never a guessed category — so every caller has
 * to decide for itself what an unknown line means.
 */
export async function skuCategories(
  sb: SupabaseClient,
  skus: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (skus.length === 0) return out;
  const { data, error } = await sb
    .from("product_skus")
    .select("sku, product_models(category)")
    .in("sku", [...new Set(skus)]);
  if (error) return out;
  for (const row of (data ?? []) as Array<{
    sku: string;
    product_models: { category: string } | { category: string }[] | null;
  }>) {
    const pm = row.product_models;
    if (!pm) continue;
    // PostgREST 1:1 embed returns an object; some clients return an array of 1.
    const category = Array.isArray(pm) ? pm[0]?.category : pm.category;
    if (category) out.set(row.sku, category);
  }
  return out;
}

export interface GoodsViolation {
  code: "goods_required";
  message: string;
}

/**
 * ⛔ A SALES ORDER MUST CONTAIN GOODS — owner ruling 2026-08-15.
 *
 * `docs/guarantee/MASTER.md` already gates one category this way (*"a
 * guarantee only sells attached to the item it covers"*); the ruling
 * generalises it. A cart of nothing but service/guarantee lines is not a sale
 * — standalone service is a Service Case and belongs to the Service channel.
 *
 * **Positive recognition only.** A SKU the catalog cannot resolve counts as
 * GOODS, so a legacy, imported or not-yet-catalogued line never blocks a real
 * order; only a cart we can positively identify as attachment-only is refused.
 * A catalog read error therefore fails OPEN, exactly as the lead-time floor
 * does — the client gate is the primary UX and this is defence in depth.
 */
export async function validateOrderHasGoods(
  sb: SupabaseClient,
  skus: readonly string[],
): Promise<GoodsViolation | null> {
  if (skus.length === 0) return null; // the schema's `lines.min(1)` owns this
  const categories = await skuCategories(sb, skus);
  const resolved = skus.map((sku) => categories.get(sku));
  if (cartHasGoods(resolved)) return null;
  return {
    code: "goods_required",
    message:
      "A Sales Order must contain a product. Add the product this service belongs to, or open a Service Case instead.",
  };
}
