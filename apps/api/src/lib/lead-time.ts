import { maxLeadDaysFor } from "@carres/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPurchasingNumbers } from "./purchasing-settings";

export interface LeadTimeViolation {
  code: "lead_time_violation";
  message: string;
  minDate: string;
  leadDays: number;
}

/**
 * Resolve the earliest-sell floor for a set of SKUs.
 *
 * Joins product_skus → product_models.category, then runs the shared
 * `maxLeadDaysFor` against the unique category set and the ONE editable
 * number (`purchasing_settings.earliest_sell_days`, P1 — it used to be a
 * per-category constant Jess could not move). Returns 0 when no SKU is gated
 * (e.g. pure addon-only orders) — caller treats 0 as "no floor".
 *
 * Fails open (returns 0) on catalog / settings read errors so a transient DB
 * hiccup doesn't 500 the order create. The client-side gate is the primary
 * UX; this is defence in depth.
 */
export async function maxLeadDaysForSkus(
  sb: SupabaseClient,
  skus: readonly string[],
): Promise<number> {
  if (skus.length === 0) return 0;
  let earliestSellDays: number;
  try {
    earliestSellDays = (await loadPurchasingNumbers(sb)).earliestSellDays;
  } catch {
    return 0;
  }
  const { data, error } = await sb
    .from("product_skus")
    .select("sku, product_models(category)")
    .in("sku", skus);
  if (error) return 0;
  const cats = new Set<string>();
  for (const row of (data ?? []) as Array<{
    product_models: { category: string } | { category: string }[] | null;
  }>) {
    const pm = row.product_models;
    if (!pm) continue;
    // PostgREST 1:1 embed returns object; some clients return array of 1.
    if (Array.isArray(pm)) {
      for (const m of pm) if (m?.category) cats.add(m.category);
    } else if (pm.category) {
      cats.add(pm.category);
    }
  }
  return maxLeadDaysFor([...cats], earliestSellDays);
}

/**
 * Verify a candidate delivery date meets the production lead-time floor
 * for the given SKUs. Returns null on pass, or a typed violation object
 * the caller can wrap in a 422 JSON response.
 *
 * The minDate comparison uses ISO yyyy-mm-dd string ordering (stable
 * because both sides are zero-padded). Server timezone is UTC on
 * Workers; we anchor the floor to UTC midnight so a request landing at
 * 23:59 MYT (~15:59 UTC) doesn't accidentally accept a date that would
 * become invalid an hour later.
 */
export async function validateDeliveryLeadTime(
  sb: SupabaseClient,
  skus: readonly string[],
  date: string,
  now: Date = new Date(),
): Promise<LeadTimeViolation | null> {
  if (!date) return null;
  const leadDays = await maxLeadDaysForSkus(sb, skus);
  if (leadDays === 0) return null;
  const min = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  min.setUTCDate(min.getUTCDate() + leadDays);
  const minDate = min.toISOString().slice(0, 10);
  if (date < minDate) {
    return {
      code: "lead_time_violation",
      message: `Earliest delivery date is ${minDate} (${leadDays} days — the earliest date a store may sell)`,
      minDate,
      leadDays,
    };
  }
  return null;
}

/** Fetch the SKUs on an existing order's lines. Used by PATCH /orders/:id
 *  and POST /orders/:id/date where the order is in DB and the candidate
 *  date arrives without lines context. RLS scopes to the caller's reach. */
export async function getOrderSkus(
  sb: SupabaseClient,
  orderId: string,
): Promise<string[]> {
  const { data, error } = await sb
    .from("order_lines")
    .select("sku")
    .eq("order_id", orderId);
  if (error) return [];
  return ((data ?? []) as Array<{ sku: string }>).map((r) => r.sku);
}
