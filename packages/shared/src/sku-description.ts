/**
 * Auto-generated SKU descriptions (Loo 2026-07-20) — stamped at CREATION time
 * on the paths that mint SKUs, so the SKU Master description column fills
 * itself instead of staying "—":
 *
 *   mattress  → `MATTRESS-CR-{dimensions}` (e.g. `MATTRESS-CR-183X190CM`)
 *   bedframe  → `BEDFRAME-CR-{dimensions}`
 *   sofa      → `Sofa {Model name} {compartment code}` (compartment auto-sync)
 *   accessory / service → NEVER auto-generated — filled in manually.
 *
 * The bed dimension comes from the Maintenance size pool (`mattress_size` /
 * `bedframe_size` — value K/Q/S/SS/SK + a `dimensions` column like
 * `183X190CM`), matched against the SKU's size via the canonical size table so
 * `K`, `King` and `king` all resolve to the same pool row. No pool row / no
 * dimensions → null (nothing stamped, never a half-made string).
 *
 * Descriptions stay EDITABLE in SKU Master afterwards — this is a seed, not a
 * lock, and a caller-provided description always wins over the auto one.
 */

import { canonicalSize } from "./mattress-sizes";

/** The slice of a size-pool entry the description needs (DB row and DTO both
 *  carry these exact keys, so either shape can be passed straight in). */
export interface SizePoolDimensions {
  value: string;
  dimensions: string | null;
}

/**
 * Auto description for a mattress / bedframe SKU: `{CATEGORY}-CR-{DIMENSIONS}`.
 * Returns null for any other category, an unknown size, or a pool entry with
 * no dimensions filled in.
 */
export function autoBedSkuDescription(
  category: string,
  sizeToken: string,
  pool: readonly SizePoolDimensions[],
): string | null {
  if (category !== "mattress" && category !== "bedframe") return null;
  const wantCode = canonicalSize(sizeToken).code;
  if (!wantCode) return null;
  const entry = pool.find((p) => canonicalSize(p.value).code === wantCode);
  const dims = entry?.dimensions?.trim();
  if (!dims) return null;
  return `${category.toUpperCase()}-CR-${dims.toUpperCase()}`;
}

/**
 * Auto description for a sofa compartment SKU: `Sofa {Model name} {code}`
 * (e.g. `Sofa Angsa 1A(LHF)`) — the SKU Master row names the model+compartment
 * pair, NOT the pool compartment's own description. Single source of truth for
 * the compartment auto-sync mint (sofa-compartment-sku.ts).
 */
export function sofaSkuDescription(modelName: string, compartmentCode: string): string {
  return `Sofa ${modelName} ${compartmentCode}`;
}
