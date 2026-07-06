import {
  Adapters,
  CATALOG_OPTION_POOLS,
  DB,
  FABRIC_TIER_ADDON_CONFIG,
  MODEL_FABRIC_TIER_OVERRIDES,
  MODEL_SOFA_COMPARTMENTS,
  SOFA_COMBO_PRICING,
  SOFA_COMPARTMENTS,
  computeSofaPrice,
  explodeSofaBuildToOrderLines,
  isSofaBuildLine,
  mirrorCode,
  resolveCompartmentPrice,
  sofaBuildLineAttrsSchema,
  sofaPriceWithinTolerance,
  type ModelSofaCompartment,
  type SofaBuild,
  type SofaCompartment,
  type SofaPricingSnapshot,
} from "@carres/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sofa-build server recompute + EXPLODE — the Phase-4 trust gate, extended in
 * Phase 5 to explode the build into per-compartment order lines (sofa engine).
 *
 * Phase 3 emits a built sofa as ONE order line carrying its full geometry in
 * `attrs.sofa_build` + a client-computed `unitPrice`. The client price is a
 * PREVIEW only — on submit, Hono MUST re-run the SAME pure `computeSofaPrice`
 * against FRESH DB catalog prices and:
 *   · drift > 0.5%   → reject the whole POST (422 sofa_price_drift), else
 *   · within 0.5%    → EXPLODE the single build line into one real
 *                      `order_line` per compartment cell (Phase 5): each line's
 *                      sku is the model's REAL `{MODEL_KEY}-{code}` compartment
 *                      `product_skus.sku` (auto-synced when the compartment was
 *                      offered, 5A), its `unitPrice` is the authoritative server
 *                      total split proportional to each cell's à-la-carte value
 *                      (Σ-exact, residue-on-last), and its `attrs` carries
 *                      `{ sofa_build_key, cell_index, geometry, fabric_* }` so
 *                      downstream can regroup the visual sofa.
 *
 * The exploded lines are REAL skus under the SOFA model, so every downstream
 * sku→product_skus join stays sound: the 0089 category mutex (sofa can't mix
 * with mattress/bedframe), PO-by-supplier, per-unit stock, SO-Maintenance —
 * exactly like combo component lines (0177). `create_order` RPC + `order_lines`
 * structure stay UNCHANGED; the route just inserts N lines instead of 1.
 *
 * Scoped to sofa builds ONLY (roadmap risk: don't let server-recompute creep
 * into a global trust-model change). Non-build lines pass through untouched.
 * Reads the catalog via the USER JWT (RLS read=authenticated) — never
 * service_role; §4.3 keeps business rules in Hono.
 *
 * Fails CLOSED: a catalog read error → `server_error`; a build cell whose
 * compartment has no synced sku → `bad_request` (never silently drop a line, or
 * the order total would no longer sum to the build price + a compartment would
 * ship untracked).
 */

/** One create-order line. Build lines are recomputed + exploded into many;
 *  others pass through verbatim. Matches `orderLineInputSchema`. */
export interface RecomputableLine {
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
  unitPrice: number;
}

export interface SofaPriceDrift {
  lineSku: string;
  clientTotal: number;
  serverTotal: number;
}

export type SofaRecomputeOutcome =
  | { status: "ok"; lines: RecomputableLine[] }
  | { status: "drift"; drift: SofaPriceDrift }
  | { status: "bad_request"; message: string }
  | { status: "server_error"; message: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Recompute + explode every sofa-build line in `lines`. Returns the (possibly
 * expanded) line array on `ok` — non-build lines verbatim, each build line
 * replaced by its per-compartment explosion. Returns the FIRST non-ok outcome
 * (so the route can reject the whole POST).
 *
 * `asOf` (ISO yyyy-mm-dd) overrides the combo effective-date anchor; defaults to
 * today inside `computeSofaPrice`. Tests pass it for determinism.
 */
export async function recomputeAndExplodeSofaBuildLines(
  sb: SupabaseClient,
  lines: RecomputableLine[],
  asOf?: string,
): Promise<SofaRecomputeOutcome> {
  const snapshotByModel = new Map<string, ModelSofaContext>();
  const out: RecomputableLine[] = [];

  for (const line of lines) {
    if (!isSofaBuildLine(line.attrs)) {
      out.push(line);
      continue;
    }

    // 1. Trust nothing in the free jsonb — re-parse the build descriptor.
    const parsed = sofaBuildLineAttrsSchema.safeParse(line.attrs);
    if (!parsed.success) {
      return {
        status: "bad_request",
        message:
          "Invalid sofa_build attrs: " +
          (parsed.error.issues[0]?.message ?? "malformed build"),
      };
    }
    const build = parsed.data.sofa_build;

    // 2. Resolve the build's model from its representative sku.
    const { data: skuRow, error: skuErr } = await sb
      .from("product_skus")
      .select("model_id")
      .eq("sku", line.sku)
      .maybeSingle();
    if (skuErr) {
      return { status: "server_error", message: skuErr.message };
    }
    const modelId = (skuRow as { model_id: string | null } | null)?.model_id ?? null;
    if (!modelId) {
      return {
        status: "bad_request",
        message: `Sofa build line sku '${line.sku}' is not a known product`,
      };
    }

    // 3. Fresh catalog context for that model (snapshot + compartment-sku map),
    //    memoized per model per request.
    let ctx = snapshotByModel.get(modelId);
    if (!ctx) {
      const fetched = await fetchSofaContext(sb, modelId);
      if (!fetched.ok) return { status: "server_error", message: fetched.message };
      ctx = fetched.ctx;
      snapshotByModel.set(modelId, ctx);
    }

    // 3b. 0204 — the build's size must be a LIVE `sofa_size` pool value when
    //     the pool is configured (per-size prices key off those exact values;
    //     a stale/spoofed size would silently price at the flat fallback). An
    //     empty pool (unconfigured) skips the gate so legacy SOFA_HEIGHTS
    //     builds keep working.
    if (ctx.allowedSizes.length > 0 && !ctx.allowedSizes.includes(build.height)) {
      return {
        status: "bad_request",
        message:
          `Sofa build size '${build.height}' is not an active sofa size option. ` +
          `Rebuild the sofa to pick a current size.`,
      };
    }

    // 4. Authoritative recompute with the SAME pure function the client previews.
    const sofaBuild: SofaBuild = {
      modelId,
      cells: build.cells.map((c) => ({
        moduleCode: c.moduleCode,
        x: c.x ?? null,
        y: c.y ?? null,
        rot: c.rot ?? null,
      })),
      fabricTier: parsed.data.fabric_tier ?? null,
      height: build.height,
      // 0201-wiring — the chosen sofa_leg_height pool value. The engine prices
      // an unknown/inactive value at 0, so a fudged claim drifts + rejects.
      legHeight: parsed.data.leg_height ?? null,
      buildKey:
        typeof line.attrs?.sofa_build_key === "string"
          ? line.attrs.sofa_build_key
          : undefined,
      asOf,
    };
    const priceResult = computeSofaPrice(sofaBuild, ctx.snapshot);
    const serverTotal = round2(priceResult.total);

    // 5. Drift gate.
    if (!sofaPriceWithinTolerance(line.unitPrice, serverTotal)) {
      return {
        status: "drift",
        drift: { lineSku: line.sku, clientTotal: line.unitPrice, serverTotal },
      };
    }

    // 6. Explode the build into per-compartment lines at the SERVER total. The
    //    split weight mirrors computeSofaPrice's à-la-carte cell lookup (incl.
    //    mirror fallback) so the proportional split tracks the price basis.
    const { poolByCode, modelByCompId, codeToSku } = ctx;
    // 0204 — the split weight prices each cell at the BUILD'S SIZE, mirroring
    // computeSofaPrice's sized à-la-carte lookup (same fallback chain).
    const priceLookup = (code: string): number => {
      const comp = poolByCode.get(code) ?? poolByCode.get(mirrorCode(code));
      if (!comp) return 0;
      return resolveCompartmentPrice(modelByCompId.get(comp.id), comp, build.height);
    };
    // Fabric attrs ride on EVERY exploded line (each compartment is made in the
    // same fabric; the operation CreatePOModal cascade keys off them per line).
    // Read fabric_id/name/surcharge from the raw attrs (the schema .passthrough()s
    // them but doesn't type them); fabric_tier is the typed, validated field.
    // Leg attrs ride the same way (whole-sofa; leg_surcharge = the SERVER-resolved
    // pool surcharge, not the client claim).
    const exploded = explodeSofaBuildToOrderLines(sofaBuild, serverTotal, {
      priceLookup,
      codeToSku: (code) => codeToSku.get(code) ?? null,
      fabricAttrs: {
        fabric_id: line.attrs?.fabric_id ?? null,
        fabric_name: line.attrs?.fabric_name ?? null,
        fabric_surcharge: line.attrs?.fabric_surcharge ?? 0,
        fabric_tier: parsed.data.fabric_tier ?? null,
        ...(parsed.data.leg_height
          ? { leg_height: parsed.data.leg_height, leg_surcharge: priceResult.legDelta }
          : {}),
      },
    });

    // Fail CLOSED: a cell whose compartment has no synced sku (offer it first).
    const unmapped = exploded.find((e) => !e.sku);
    if (unmapped) {
      return {
        status: "bad_request",
        message:
          `Sofa build references compartment '${unmapped.moduleCode}' which has ` +
          `no catalog sku for this model. Offer the compartment before selling it.`,
      };
    }

    for (const e of exploded) {
      out.push({ sku: e.sku as string, qty: e.qty, attrs: e.attrs, unitPrice: e.unitPrice });
    }
  }

  return { status: "ok", lines: out };
}

/** Per-model context the recompute + explode need: the pricing snapshot, the
 *  compartment lookups (rebuilt once per model), and the code→sku map. */
interface ModelSofaContext {
  snapshot: SofaPricingSnapshot;
  poolByCode: Map<string, SofaCompartment>;
  modelByCompId: Map<string, ModelSofaCompartment>;
  /** Compartment code → the model's real `product_skus.sku` (5A auto-sync). */
  codeToSku: Map<string, string>;
  /** 0204 — live `sofa_size` pool values; empty = pool unconfigured (gate off). */
  allowedSizes: string[];
}

type FetchResult =
  | { ok: true; ctx: ModelSofaContext }
  | { ok: false; message: string };

/**
 * Assemble a model's `SofaPricingSnapshot` (mirrors the catalog GET assembly,
 * same `Adapters.*FromRow`, narrowed to this model + the live-combo filter) PLUS
 * its compartment-code→sku map (the 5A-synced `product_skus` rows). Any read
 * error fails CLOSED (`{ ok: false }`).
 */
async function fetchSofaContext(sb: SupabaseClient, modelId: string): Promise<FetchResult> {
  const [poolR, modelCompsR, combosR, tierConfigR, tierOverrideR, compSkusR, sizesR, legPoolR] =
    await Promise.all([
      sb.from(SOFA_COMPARTMENTS).select("*"),
      sb.from(MODEL_SOFA_COMPARTMENTS).select("*").eq("model_id", modelId),
      // Non-admin POS filter: only live combos (active && not discontinued) — the
      // same gate the catalog GET applies for non-maintenance consumers.
      sb
        .from(SOFA_COMBO_PRICING)
        .select("*")
        .eq("model_id", modelId)
        .eq("active", true)
        .is("discontinued_at", null),
      sb.from(FABRIC_TIER_ADDON_CONFIG).select("*").eq("id", 1).maybeSingle(),
      sb.from(MODEL_FABRIC_TIER_OVERRIDES).select("*").eq("model_id", modelId).maybeSingle(),
      // 5A — this model's real compartment skus (auto-synced on offer). Excludes
      // discontinued (un-offered) skus so an un-offered compartment can't be sold.
      // `price` = the AUTHORITATIVE à-la-carte compartment price (SKU Master —
      // Loo, 2026-07-05); enriched onto modelCompartments as `skuPrice`, and
      // (0204) `prices_by_size` as `skuPricesBySize`.
      sb
        .from("product_skus")
        .select("sku, compartment_id, price, prices_by_size")
        .eq("model_id", modelId)
        .not("compartment_id", "is", null)
        .is("discontinued_at", null),
      // 0204 — the live sofa-size axis (the per-size price keys + the builder's
      // size options). Empty = pool unconfigured → the size gate is skipped.
      sb
        .from(CATALOG_OPTION_POOLS)
        .select("value")
        .eq("pool", "sofa_size")
        .eq("active", true),
      // 0201-wiring — the sofa_leg_height pool rows so a build's legHeight
      // surcharge joins the drift-gated total (computeSofaPrice legDelta).
      sb.from(CATALOG_OPTION_POOLS).select("*").eq("pool", "sofa_leg_height"),
    ]);

  for (const r of [poolR, modelCompsR, combosR, tierConfigR, tierOverrideR, compSkusR, sizesR, legPoolR]) {
    if (r.error) return { ok: false, message: r.error.message };
  }

  // 0176 fallback when the singleton seed row is absent (avoids NaN).
  const fabricTierConfig = tierConfigR.data
    ? Adapters.fabricTierConfigFromRow(tierConfigR.data as DB.FabricTierAddonConfigRow)
    : { sofaTier2Delta: 0, sofaTier3Delta: 0 };

  const compartmentPool = (poolR.data ?? []).map((r) =>
    Adapters.sofaCompartmentFromRow(r as DB.SofaCompartmentRow),
  );
  // skuPrice enrichment — the synced compartment SKU's price is the
  // authoritative à-la-carte source; resolveCompartmentPrice falls back to the
  // legacy override→pool-default chain only when no synced sku exists.
  const compSkuRows = (compSkusR.data ?? []) as Array<{
    sku: string;
    compartment_id: string;
    price: number | string;
    prices_by_size: Record<string, number | string | null> | null;
  }>;
  // Number.isFinite guard: a malformed/absent price must fall through to the
  // legacy chain (null), never poison the drift gate with NaN (NaN survives ??).
  const priceByCompId = new Map(
    compSkuRows
      .filter((r) => Number.isFinite(Number(r.price)))
      .map((r) => [r.compartment_id, Number(r.price)]),
  );
  // 0204 — per-size map, same NaN discipline per entry (malformed → null so the
  // chain falls through to the flat price instead of poisoning the drift gate).
  const sizesByCompId = new Map<string, Record<string, number | null>>();
  for (const r of compSkuRows) {
    if (r.prices_by_size == null) continue;
    const m: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(r.prices_by_size)) {
      m[k] = v == null || !Number.isFinite(Number(v)) ? null : Number(v);
    }
    sizesByCompId.set(r.compartment_id, m);
  }
  const modelCompartments = (modelCompsR.data ?? []).map((r) => {
    const mc = Adapters.modelSofaCompartmentFromRow(r as DB.ModelSofaCompartmentRow);
    return {
      ...mc,
      skuPrice: priceByCompId.get(mc.compartmentId) ?? null,
      skuPricesBySize: sizesByCompId.get(mc.compartmentId) ?? null,
    };
  });

  const snapshot: SofaPricingSnapshot = {
    compartmentPool,
    modelCompartments,
    sofaCombos: (combosR.data ?? []).map((r) =>
      Adapters.sofaComboFromRow(r as DB.SofaComboPricingRow),
    ),
    fabricTierConfig,
    // ModelFabricTierOverride is a structural superset of FabricTierOverride
    // (adds modelId) — resolveFabricDelta only reads tier2Delta/tier3Delta.
    fabricTierOverride: tierOverrideR.data
      ? Adapters.modelFabricTierOverrideFromRow(
          tierOverrideR.data as DB.ModelFabricTierOverrideRow,
        )
      : null,
    // 0201-wiring — the leg-height pool (structural subset: value/surcharge/
    // active are all the engine reads).
    legHeightPool: (legPoolR.data ?? []).map((r) =>
      Adapters.catalogOptionPoolFromRow(r as DB.CatalogOptionPoolRow),
    ),
  };

  // Compartment code → real sku, via the pool (sku rows carry compartment_id).
  const codeById = new Map(compartmentPool.map((c) => [c.id, c.code]));
  const codeToSku = new Map<string, string>();
  for (const r of (compSkusR.data ?? []) as Array<{ sku: string; compartment_id: string }>) {
    const code = codeById.get(r.compartment_id);
    if (code) codeToSku.set(code, r.sku);
  }

  return {
    ok: true,
    ctx: {
      snapshot,
      poolByCode: new Map(compartmentPool.map((c) => [c.code, c])),
      modelByCompId: new Map(modelCompartments.map((m) => [m.compartmentId, m])),
      codeToSku,
      allowedSizes: ((sizesR.data ?? []) as Array<{ value: string }>).map((r) => r.value),
    },
  };
}
