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
  const unique = [...new Set(skus)];
  if (unique.length === 0) return out;

  // The `in` list travels in the URL, and a free-text warehouse SKU runs to 58
  // characters on live prod. The order path asks about a handful of cart lines;
  // On hand asks about every distinct SKU in the register (74 today, growing
  // with the 1000-unit scale target), which is how one request grows past the
  // URL limit. A rejected request returns NO rows, and this reader's failure
  // mode is a silent empty map — every unit would render as uncatalogued and
  // nothing would look broken. Chunking is what keeps that from ever being the
  // answer.
  for (let i = 0; i < unique.length; i += SKU_QUERY_CHUNK) {
    const { data, error } = await sb
      .from("product_skus")
      .select("sku, product_models(category)")
      .in("sku", unique.slice(i, i + SKU_QUERY_CHUNK));
    // Fail OPEN and fail WHOLE. A partial map is worse than none: the goods
    // gate below reads "unresolved" as goods, so half an answer could refuse a
    // real order. One bad chunk therefore discards the lot, which is exactly
    // what this function did before it chunked.
    if (error) return new Map();
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
  }
  return out;
}

/**
 * ⛔ THE STORAGE CALLERS ASK THROUGH THIS ONE, AND THE REASON IS A GATE.
 *
 * `storageBlock` wraps its whole body in a `try/catch` that **fails OPEN** —
 * deliberately, so a lookup hiccup cannot strand a dispatch. That makes any new
 * throw inside it a door: a catalog read that raises would not degrade the
 * RATE, it would release goods whose fee is unpaid.
 *
 * `skuCategories` already returns an empty map on a query error, but a
 * malformed client throws before that, and "money gate" is not the place to
 * rely on that distinction. So the storage path asks through here, where the
 * only possible answer is a map.
 *
 * AN EMPTY MAP IS THE RIGHT DEGRADE. It means "no catalog answer", and every
 * storage caller reads that as the SKU-string parser — exactly the behaviour
 * that shipped before CARD-2026-08-28. A catalog outage costs the fee its
 * accuracy; it never costs the gate its authority.
 */
export async function storageSkuCategories(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  skus: readonly string[],
): Promise<Map<string, string>> {
  try {
    return await skuCategories(sb, skus);
  } catch {
    return new Map();
  }
}

/** SKUs per catalog read — 100 × 58 chars stays far inside any URL limit. */
const SKU_QUERY_CHUNK = 100;

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
