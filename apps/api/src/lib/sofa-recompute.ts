import {
  Adapters,
  DB,
  FABRIC_TIER_ADDON_CONFIG,
  MODEL_FABRIC_TIER_OVERRIDES,
  MODEL_SOFA_COMPARTMENTS,
  SOFA_COMBO_PRICING,
  SOFA_COMPARTMENTS,
  computeSofaPrice,
  isSofaBuildLine,
  sofaBuildLineAttrsSchema,
  sofaPriceWithinTolerance,
  type SofaBuild,
  type SofaPricingSnapshot,
} from "@carres/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sofa-build server recompute — the Phase-4 trust gate (sofa engine).
 *
 * Phase 3 emits a built sofa as ONE order line carrying its full geometry in
 * `attrs.sofa_build` + a client-computed `unitPrice`. The client price is a
 * PREVIEW only — on submit, Hono MUST re-run the SAME pure `computeSofaPrice`
 * against FRESH DB catalog prices and:
 *   · drift > 0.5%   → reject the whole POST (422 sofa_price_drift), or
 *   · within 0.5%    → overwrite the line's `unitPrice` with the server number
 *                      (authoritative — even sub-0.5% rounding is corrected).
 *
 * Scoped to sofa builds ONLY (roadmap risk: don't let server-recompute creep
 * into a global trust-model change). Non-build lines pass through untouched.
 * Reads the catalog via the USER JWT (RLS read=authenticated) — never
 * service_role; §4.3 keeps business rules in Hono, the `create_order` RPC +
 * `order_lines` structure UNCHANGED. The exploding into per-compartment lines
 * is Phase 5; here the single representative-sku line is kept as-is.
 *
 * Fails CLOSED: a genuine catalog read error → `server_error` (NOT silent
 * accept), so a transient DB hiccup can't bypass the anti-fudge check.
 */

/** What the route needs from each line: it mutates `unitPrice` in place when a
 *  build line is accepted. */
export interface RecomputableLine {
  sku: string;
  attrs: Record<string, unknown> | null;
  unitPrice: number;
}

export interface SofaPriceDrift {
  lineSku: string;
  clientTotal: number;
  serverTotal: number;
}

export type SofaRecomputeOutcome =
  | { status: "ok" }
  | { status: "drift"; drift: SofaPriceDrift }
  | { status: "bad_request"; message: string }
  | { status: "server_error"; message: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Recompute every sofa-build line in `lines`. Mutates accepted lines'
 * `unitPrice` to the server value in place. Returns the FIRST non-ok outcome
 * (so the route can reject the whole POST), or `{ status: "ok" }` when there are
 * no build lines or every build line agreed within tolerance.
 *
 * `asOf` (ISO yyyy-mm-dd) overrides the combo effective-date anchor; defaults to
 * today inside `computeSofaPrice`. Tests pass it for determinism.
 */
export async function recomputeSofaBuildLines(
  sb: SupabaseClient,
  lines: RecomputableLine[],
  asOf?: string,
): Promise<SofaRecomputeOutcome> {
  const snapshotByModel = new Map<string, SofaPricingSnapshot>();

  for (const line of lines) {
    if (!isSofaBuildLine(line.attrs)) continue;

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

    // 3. Fresh catalog snapshot for that model (memoized per model per request).
    let snapshot = snapshotByModel.get(modelId);
    if (!snapshot) {
      const snap = await fetchSofaSnapshot(sb, modelId);
      if (!snap.ok) return { status: "server_error", message: snap.message };
      snapshot = snap.snapshot;
      snapshotByModel.set(modelId, snapshot);
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
      asOf,
    };
    const serverTotal = round2(computeSofaPrice(sofaBuild, snapshot).total);

    // 5. Drift gate.
    if (!sofaPriceWithinTolerance(line.unitPrice, serverTotal)) {
      return {
        status: "drift",
        drift: { lineSku: line.sku, clientTotal: line.unitPrice, serverTotal },
      };
    }

    // Accept: server price is authoritative.
    line.unitPrice = serverTotal;
  }

  return { status: "ok" };
}

type SnapshotResult =
  | { ok: true; snapshot: SofaPricingSnapshot }
  | { ok: false; message: string };

/**
 * Assemble a `SofaPricingSnapshot` for one model — mirrors the catalog GET
 * assembly (same `Adapters.*FromRow`), narrowed to this model + the live-combo
 * filter. Any read error fails CLOSED (returns `{ ok: false }`).
 */
async function fetchSofaSnapshot(
  sb: SupabaseClient,
  modelId: string,
): Promise<SnapshotResult> {
  const [poolR, modelCompsR, combosR, tierConfigR, tierOverrideR] = await Promise.all([
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
  ]);

  for (const r of [poolR, modelCompsR, combosR, tierConfigR, tierOverrideR]) {
    if (r.error) return { ok: false, message: r.error.message };
  }

  // 0176 fallback when the singleton seed row is absent (avoids NaN).
  const fabricTierConfig = tierConfigR.data
    ? Adapters.fabricTierConfigFromRow(tierConfigR.data as DB.FabricTierAddonConfigRow)
    : { sofaTier2Delta: 0, sofaTier3Delta: 0 };

  const snapshot: SofaPricingSnapshot = {
    compartmentPool: (poolR.data ?? []).map((r) =>
      Adapters.sofaCompartmentFromRow(r as DB.SofaCompartmentRow),
    ),
    modelCompartments: (modelCompsR.data ?? []).map((r) =>
      Adapters.modelSofaCompartmentFromRow(r as DB.ModelSofaCompartmentRow),
    ),
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
  };
  return { ok: true, snapshot };
}
