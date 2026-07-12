import type { CatalogFabricDto, FabricTierValue, ProductModelDto, SofaFabricDto } from "@carres/shared";
import { allowedFabricsFor } from "@carres/shared";

/**
 * Selling-fabric choices for the sofa POS (0202-wiring). One selling fabric =
 * either a legacy per-model `sofa_fabrics` row OR a master Fabrics-tab fabric
 * the model opted into (Modular `allowed_options.fabrics` ticks, priced by its
 * sofaTier → 0176 tier delta).
 *
 *   `id`   = sofa_fabrics uuid (legacy rows; rides attrs.fabric_id) or null.
 *   `code` = catalog_fabrics.fabric_code (master rows; rides attrs.fabric_code)
 *            or null.
 *
 * Shared by SofaConfigurePage (quick-pick chips) and SofaBuildCanvas (footer
 * select) — one list, one tier convention, no drift between the two modes.
 */
export interface SellingFabric {
  key: string;
  name: string;
  tier: FabricTierValue;
  id: string | null;
  code: string | null;
  swatch: string | null;
  /** 0202 `catalog_fabrics.series` — the collection a master fabric belongs to
   *  (e.g. "EZ", "BF"). null for legacy per-model rows (they carry no series);
   *  the POS buckets those under a synthetic "Other" group for the series step. */
  series: string | null;
}

/** "CODE · description" display name — but when the authored description
 *  ALREADY leads with the code ("CG-007 Deep Grey"), use it as-is instead of
 *  doubling the code ("CG-007 · CG-007 Deep Grey" — Loo 2026-07-12). */
export function fabricDisplayName(code: string, description: string | null | undefined): string {
  const desc = (description ?? "").trim();
  if (!desc) return code;
  return desc.toLowerCase().startsWith(code.trim().toLowerCase()) ? desc : `${code} · ${desc}`;
}

export function sellingFabricsFor(
  model: ProductModelDto,
  legacy: SofaFabricDto[],
  master: CatalogFabricDto[] | null | undefined,
): SellingFabric[] {
  const fromLegacy: SellingFabric[] = legacy.map((f) => ({
    key: `sf:${f.id}`,
    name: f.fabricName,
    tier: f.tier,
    id: f.id,
    code: null,
    swatch: f.colors?.[0] ?? null,
    series: null,
  }));
  const fromMaster: SellingFabric[] = allowedFabricsFor(model, master).map((f) => ({
    key: `cf:${f.fabricCode}`,
    name: fabricDisplayName(f.fabricCode, f.description),
    tier: f.sofaTier,
    id: null,
    code: f.fabricCode,
    swatch: null,
    series: f.series,
  }));
  return [...fromLegacy, ...fromMaster];
}
