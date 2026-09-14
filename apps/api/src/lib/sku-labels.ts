import type { userClient } from "./supabase";

/**
 * THE GOODS' NAME — `Model · Variant` — resolved ONCE for every surface.
 *
 * Orders (list + detail), Stock, Claims and Receiving all print the same
 * catalog name for a SKU, and `ERP-ARCHITECTURE.md` Law D says a fact two
 * surfaces must agree on is computed by ONE function. This is that function:
 * the query, the join and the ` · ` spelling are byte-identical to what
 * `operation/orders.ts` ran since 2026-07-16 (it now imports this).
 *
 * `order_lines.sku` / a GRN line's `sku` has no FK to `product_skus`, so this
 * is a separate batched read (chunked `.in("sku", […])`), never a PostgREST
 * embed and never one query per row.
 *
 * **A miss is normal and stays silent.** An imported free-text SKU has no
 * catalog row; the caller falls back to the text the record carries and, on
 * Receiving, SAYS the name is a fallback (`grnLineName`).
 */
export interface SkuNameParts {
  model: string | null;
  variant: string | null;
}

/** The two catalog facts a name is made of, by SKU. A SKU without a catalog
 *  row is simply absent. */
export async function resolveSkuNameParts(
  sb: ReturnType<typeof userClient>,
  skus: readonly (string | null | undefined)[],
): Promise<Record<string, SkuNameParts>> {
  const out: Record<string, SkuNameParts> = {};
  const wanted = [...new Set(skus.filter((s): s is string => !!s))];
  if (wanted.length === 0) return out;
  for (let i = 0; i < wanted.length; i += 100) {
    const { data, error } = await sb
      .from("product_skus")
      .select("sku, variant, product_models(name)")
      .in("sku", wanted.slice(i, i + 100));
    if (error) throw error;
    for (const r of (data ?? []) as Array<{
      sku: string;
      variant: string | null;
      product_models: { name?: string | null } | Array<{ name?: string | null }> | null;
    }>) {
      const model = Array.isArray(r.product_models) ? r.product_models[0] : r.product_models;
      out[r.sku] = {
        model: (model?.name ?? "").trim() || null,
        variant: (r.variant ?? "").trim() || null,
      };
    }
  }
  return out;
}

/** Orders' spelling: `Model · Variant`, either half alone when only one exists. */
export async function resolveSkuLabels(
  sb: ReturnType<typeof userClient>,
  skus: readonly (string | null | undefined)[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const parts = await resolveSkuNameParts(sb, skus);
  for (const [sku, p] of Object.entries(parts)) {
    const label = [p.model ?? "", p.variant ?? ""].filter(Boolean).join(" · ");
    if (label) out[sku] = label;
  }
  return out;
}

/**
 * RECEIVING's spelling (owner instruction 2026-09-13): the goods' FULL name,
 * which must name the MODEL — a variant alone (`Super Single`) names a size,
 * not goods, so a SKU whose catalog row has no model name gets NO catalog
 * name here and falls to the SKU rung of `grnLineName`, labelled as such.
 */
export async function resolveGoodsFullNames(
  sb: ReturnType<typeof userClient>,
  skus: readonly (string | null | undefined)[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const parts = await resolveSkuNameParts(sb, skus);
  for (const [sku, p] of Object.entries(parts)) {
    if (!p.model) continue;
    out[sku] = [p.model, p.variant ?? ""].filter(Boolean).join(" · ");
  }
  return out;
}
