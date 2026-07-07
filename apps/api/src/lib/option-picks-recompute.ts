import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Adapters,
  CATALOG_FABRICS,
  CATALOG_OPTION_POOLS,
  DB,
  FABRIC_TIER_ADDON_CONFIG,
  MODEL_FABRIC_TIER_OVERRIDES,
  optionsAttrsSchema,
  resolveOptionsTotal,
  type CatalogFabricDto,
  type CatalogOptionPoolDto,
  type OptionPick,
  type ProductCategory,
} from "@carres/shared";

/**
 * Option-picks server recompute (0201/0202 wiring, 2026-07-06) — the honest-
 * pricing trust gate for the Maintenance-pool options a configured line may
 * carry in `attrs.options[]` (divan_height / bedframe_leg_height / fabric)
 * plus a client-computed `attrs.options_total` folded into the line unitPrice.
 *
 * Mirrors `special-addons-recompute` exactly: the client total is a PREVIEW;
 * here Hono re-resolves every pick against FRESH `catalog_option_pools` +
 * `catalog_fabrics` rows (+ the 0176 tier deltas for fabric picks) with the
 * SAME pure `resolveOptionsTotal` the POS used.
 *
 *   · attrs malformed                     → bad_request (400)
 *   · a referenced value retired/inactive → bad_request (400, "reconfigure")
 *   · |client − server| > max(0.5%, RM0.01) → drift (422 options_price_drift)
 *   · otherwise → nudge `unitPrice` by (server − client) and overwrite
 *     `attrs.options` / `attrs.options_total` with server-canonical values.
 *
 * Lines without options pass through verbatim (sofa-BUILD leg heights ride the
 * sofa recompute's `computeSofaPrice`, NOT this array). Fails CLOSED — a
 * catalog read error → server_error; an option is never silently priced 0.
 */

export type { RecomputableLine } from "./sofa-recompute";
import type { RecomputableLine } from "./sofa-recompute";

export interface OptionsPriceDrift {
  lineSku: string;
  clientTotal: number;
  serverTotal: number;
}

export type OptionsRecomputeOutcome =
  | { status: "ok"; lines: RecomputableLine[] }
  | { status: "drift"; drift: OptionsPriceDrift }
  | { status: "bad_request"; message: string }
  | { status: "server_error"; message: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

function hasOptions(attrs: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  const o = (attrs as { options?: unknown }).options;
  return Array.isArray(o) && o.length > 0;
}

/** A FREE line (campaign-freed / appended gift) is locked at RM0 — never
 *  re-priced by any recompute (Phase 7 F2). */
function isFreeLine(attrs: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  return Boolean(attrs.free_item) || Boolean(attrs.free_gift);
}

export async function recomputeOptionPickLines(
  sb: SupabaseClient,
  lines: RecomputableLine[],
): Promise<OptionsRecomputeOutcome> {
  // 1. Parse every option-carrying line up front; bail early if none.
  const optionLines: { line: RecomputableLine; picks: OptionPick[]; clientTotal: number }[] = [];
  let anyFabricPick = false;
  for (const line of lines) {
    if (isFreeLine(line.attrs) || !hasOptions(line.attrs)) continue;
    const parsed = optionsAttrsSchema.safeParse(line.attrs);
    if (!parsed.success) {
      return {
        status: "bad_request",
        message:
          "Invalid option attrs: " + (parsed.error.issues[0]?.message ?? "malformed"),
      };
    }
    const picks = parsed.data.options.map((o) => ({ kind: o.kind, value: o.value }));
    if (picks.some((p) => p.kind === "fabric")) anyFabricPick = true;
    optionLines.push({ line, picks, clientTotal: parsed.data.options_total });
  }
  if (optionLines.length === 0) return { status: "ok", lines };

  // 2. Fresh pool rows (small table; resolveOptionsTotal ignores inactive ones).
  const poolsR = await sb.from(CATALOG_OPTION_POOLS).select("*");
  if (poolsR.error) return { status: "server_error", message: poolsR.error.message };
  const pools: CatalogOptionPoolDto[] = (poolsR.data ?? []).map((r) =>
    Adapters.catalogOptionPoolFromRow(r as DB.CatalogOptionPoolRow),
  );

  // 3. Fabric picks additionally need the master fabric rows + the line's model
  //    CATEGORY (which tier column prices it) + the 0176 delta config/override.
  let fabrics: CatalogFabricDto[] = [];
  const categoryBySku = new Map<string, ProductCategory>();
  const overrideBySku = new Map<
    string,
    { tier2Delta: number | null; tier3Delta: number | null }
  >();
  let tierConfig: { sofaTier2Delta: number; sofaTier3Delta: number } | null = null;
  if (anyFabricPick) {
    const fabricSkus = Array.from(
      new Set(
        optionLines
          .filter((ol) => ol.picks.some((p) => p.kind === "fabric"))
          .map((ol) => ol.line.sku),
      ),
    );
    const [fabricsR, tierConfigR, skusR] = await Promise.all([
      sb.from(CATALOG_FABRICS).select("*"),
      sb.from(FABRIC_TIER_ADDON_CONFIG).select("*").eq("id", 1).maybeSingle(),
      sb.from("product_skus").select("sku, model_id").in("sku", fabricSkus),
    ]);
    if (fabricsR.error) return { status: "server_error", message: fabricsR.error.message };
    if (tierConfigR.error) return { status: "server_error", message: tierConfigR.error.message };
    if (skusR.error) return { status: "server_error", message: skusR.error.message };
    fabrics = (fabricsR.data ?? []).map((r) =>
      Adapters.catalogFabricFromRow(r as DB.CatalogFabricRow),
    );
    tierConfig = tierConfigR.data
      ? Adapters.fabricTierConfigFromRow(tierConfigR.data as DB.FabricTierAddonConfigRow)
      : { sofaTier2Delta: 0, sofaTier3Delta: 0 };

    const skuRows = (skusR.data ?? []) as Array<{ sku: string; model_id: string }>;
    const modelIds = Array.from(new Set(skuRows.map((r) => r.model_id)));
    const [modelsR, overridesR] = await Promise.all([
      sb.from("product_models").select("id, category").in("id", modelIds),
      sb.from(MODEL_FABRIC_TIER_OVERRIDES).select("*").in("model_id", modelIds),
    ]);
    if (modelsR.error) return { status: "server_error", message: modelsR.error.message };
    if (overridesR.error) return { status: "server_error", message: overridesR.error.message };
    const categoryByModel = new Map(
      ((modelsR.data ?? []) as Array<{ id: string; category: ProductCategory }>).map((m) => [
        m.id,
        m.category,
      ]),
    );
    const overrideByModel = new Map(
      (overridesR.data ?? []).map((r) => {
        const o = Adapters.modelFabricTierOverrideFromRow(r as DB.ModelFabricTierOverrideRow);
        return [o.modelId, { tier2Delta: o.tier2Delta, tier3Delta: o.tier3Delta }] as const;
      }),
    );
    for (const r of skuRows) {
      const cat = categoryByModel.get(r.model_id);
      if (cat) categoryBySku.set(r.sku, cat);
      const ov = overrideByModel.get(r.model_id);
      if (ov) overrideBySku.set(r.sku, ov);
    }
  }

  // 4. Verify + nudge each option line with the SAME pure resolver as the POS.
  const out: RecomputableLine[] = [];
  for (const line of lines) {
    const ol = optionLines.find((x) => x.line === line);
    if (!ol) {
      out.push(line);
      continue;
    }
    const hasFabric = ol.picks.some((p) => p.kind === "fabric");
    if (hasFabric && !categoryBySku.has(line.sku)) {
      // A fabric pick on a sku we can't resolve to a model/category — the tier
      // column is ambiguous. Fail closed rather than guess a price.
      return {
        status: "bad_request",
        message: `Line '${line.sku}' carries a fabric option but is not a known product.`,
      };
    }
    const { total: serverTotal, lines: resolved, unknown } = resolveOptionsTotal(ol.picks, {
      pools,
      fabrics,
      category: categoryBySku.get(line.sku) ?? "bedframe",
      fabricTierOverride: overrideBySku.get(line.sku) ?? null,
      fabricTierConfig: tierConfig,
    });
    if (unknown.length > 0) {
      return {
        status: "bad_request",
        message: `Option '${unknown[0]}' is no longer available — please reconfigure the line.`,
      };
    }
    const tol = Math.max(Math.abs(serverTotal) * 0.005, 0.01);
    if (Math.abs(ol.clientTotal - serverTotal) > tol) {
      return {
        status: "drift",
        drift: { lineSku: line.sku, clientTotal: ol.clientTotal, serverTotal },
      };
    }
    out.push({
      ...line,
      unitPrice: round2((line.unitPrice ?? 0) - ol.clientTotal + serverTotal),
      attrs: {
        ...(line.attrs as Record<string, unknown>),
        options: resolved,
        options_total: serverTotal,
      },
    });
  }
  return { status: "ok", lines: out };
}
