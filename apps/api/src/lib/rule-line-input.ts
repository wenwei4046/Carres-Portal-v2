import type { SupabaseClient } from "@supabase/supabase-js";
import { Adapters, DB, PWP_RULES, type PwpRule } from "@carres/shared";

/**
 * Shared sku → { model_id, category, variant } resolution for the order-path
 * recompute libs (delivery-fee, free-gift). Extracted from delivery-fee-recompute
 * (2990s Products parity Phase 6) so the delivery recompute and the Phase-7
 * free-gift / free-item resolvers derive a line's category / model / size IDENTICALLY
 * — a single source of truth means the POS preview and the three server gates can
 * never disagree about what a line "is" (honest-pricing).
 *
 * Reads `product_skus` (+ embedded `product_models.category`) via the USER JWT
 * (RLS) — never service_role. A read error surfaces fail-closed (`{ ok: false }`).
 */

/** A product_skus row enriched with its model's category (PostgREST embed). */
export interface SkuInfo {
  modelId: string | null;
  category: string;
  variant: string | null;
}

/** Read the embedded product_models.category (object or array-of-1 per client). */
export function embedCategory(
  pm: { category?: string } | Array<{ category?: string }> | null | undefined,
): string {
  if (!pm) return "";
  if (Array.isArray(pm)) return pm[0]?.category ?? "";
  return pm.category ?? "";
}

export type ResolveSkuInfoResult =
  | { ok: true; skuInfo: Map<string, SkuInfo> }
  | { ok: false; message: string };

/**
 * Resolve every distinct sku in `skus` to its { modelId, category, variant } in
 * one batched read (RLS). Build lines reference their representative / compartment
 * skus which are real product_skus rows, so the same join covers them. Empty input
 * → an empty map (no read). A read error → `{ ok: false }` (fail-closed).
 */
export async function resolveSkuInfo(
  sb: SupabaseClient,
  skus: Iterable<string>,
): Promise<ResolveSkuInfoResult> {
  const skuSet = new Set<string>();
  for (const s of skus) if (s) skuSet.add(s);
  const skuInfo = new Map<string, SkuInfo>();
  if (skuSet.size === 0) return { ok: true, skuInfo };

  const { data, error } = await sb
    .from("product_skus")
    .select("sku, model_id, variant, product_models(category)")
    .in("sku", Array.from(skuSet));
  if (error) return { ok: false, message: error.message };

  for (const row of (data ?? []) as Array<{
    sku?: string;
    model_id?: string | null;
    variant?: string | null;
    product_models?: { category?: string } | Array<{ category?: string }> | null;
  }>) {
    if (!row.sku) continue;
    skuInfo.set(row.sku, {
      modelId: row.model_id ?? null,
      category: embedCategory(row.product_models),
      variant: row.variant ?? null,
    });
  }
  return { ok: true, skuInfo };
}

/** Active rules, or the read error, fail-closed like `resolveSkuInfo`. */
export type ReadActivePwpRulesResult =
  | { ok: true; rules: PwpRule[] }
  | { ok: false; message: string };

/**
 * ⭐ THE ONE READ OF THE ACTIVE PWP RULE SET — AND THE ONE ORDER.
 *
 * `resolvePwp` is GREEDY: it walks rules in the order it is handed them and
 * binds each reward line to the FIRST rule with spare allowance. The order is
 * therefore not a display preference — it decides which rule pays for a line,
 * and with overlapping rules it decides the PRICE.
 *
 * Four readers fed that resolver and NONE of them ordered the read:
 * `pwp-recompute` (the price at Confirm), `pwp-codes` (which vouchers get
 * minted), `pwp-carry-forward` (which survive as saved vouchers) and
 * `replace-lines-helpers` (the amendment path). A bare PostgREST select has no
 * guaranteed order, so the four could each bind the same cart differently, and
 * the same cart could resolve differently twice in a row.
 *
 * That is Law D — a derived fact has ONE arithmetic — broken four ways. This is
 * the single door: `created_at` for the real precedence ("the rule that existed
 * first wins"), then `id` to break a tie, because two rules created in one
 * transaction share a timestamp and `created_at` alone is not a total order.
 *
 * ⚠️ NOTE: this makes the answer STABLE, not authored. Which rule *should* win
 * when two overlap is an owner's ruling and there is no priority column to hold
 * it (0186). Until there is, first-created wins — knowably, every time.
 */
export async function readActivePwpRules(
  sb: SupabaseClient,
): Promise<ReadActivePwpRulesResult> {
  const { data, error } = await sb
    .from(PWP_RULES)
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    rules: ((data ?? []) as DB.PwpRuleRow[]).map((row) => Adapters.pwpRuleFromRow(row)),
  };
}
