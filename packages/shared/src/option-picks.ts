import { z } from "zod";
import {
  resolveFabricDelta,
  type FabricTier,
  type FabricTierGlobalConfig,
  type FabricTierOverride,
} from "./fabric-tier";
import { SOFA_HEIGHTS, type SofaHeight } from "./sofa-constants";
import type {
  CatalogFabricDto,
  CatalogOptionPoolDto,
  ProductCategory,
  ProductModelDto,
} from "./schemas/catalog";

/**
 * Option picks (0201/0202 wiring, 2026-07-06) — the PURE "Maintenance options →
 * POS" layer, 2990s parity (`useBedframeCustomizerData` semantics):
 *
 *   Special Add-ons tab pools (0201 `catalog_option_pools`: divan_height / gap /
 *   bedframe_leg_height / sofa_leg_height / sofa_size) + the Fabrics master
 *   (0202 `catalog_fabrics`) are the GLOBAL source; the Modular drawer gates
 *   them per model via `allowed_options` ticks; the POS configurators render
 *   the gated set; Hono re-resolves the surcharges from fresh rows on submit
 *   (option-picks-recompute) with THIS same resolver — so the POS live total
 *   always equals the server's authoritative figure.
 *
 * Gate semantics (2990s-faithful):
 *   · divan / gap / leg ticks: EMPTY or ABSENT = NO RESTRICTION → every active
 *     master option shows. A non-empty tick list narrows to that subset.
 *   · fabric ticks (`allowed_options.fabrics`, fabric CODES): OPT-IN — empty or
 *     absent = the model offers NO fabric choice (a wooden bed frame shouldn't
 *     ask for upholstery).
 *   · a pool row must be ACTIVE to surface regardless of ticks.
 */

/* ─── Per-model gating (Modular ticks ∩ master pools) ───────────────────── */

/** The pools a model can gate through `allowed_options` ticks. */
export type OptionPoolPickKind =
  | "divan_height"
  | "gap"
  | "bedframe_leg_height"
  | "sofa_leg_height";

/** allowed_options key per pool (2990s key names; one `leg_heights` key per
 *  model — the category decides which leg pool reads it). */
const TICK_KEY: Record<OptionPoolPickKind, "divan_heights" | "gaps" | "leg_heights"> = {
  divan_height: "divan_heights",
  gap: "gaps",
  bedframe_leg_height: "leg_heights",
  sofa_leg_height: "leg_heights",
};

/** The `allowed_options` key a pool's ticks live under (the Modular drawer
 *  writes it; `poolTicksFor` reads it). */
export function tickKeyFor(pool: OptionPoolPickKind): "divan_heights" | "gaps" | "leg_heights" {
  return TICK_KEY[pool];
}

/** The model's raw tick list for a pool. For `gap` the legacy
 *  `product_models.gaps` COLUMN is the fallback tick source — pre-0201 bedframe
 *  models authored their gaps there, and those picks must keep gating the POS
 *  until the model is re-saved through the pool-driven Modular section. */
export function poolTicksFor(
  model: Pick<ProductModelDto, "gaps" | "allowedOptions">,
  pool: OptionPoolPickKind,
): string[] {
  const opts = (model.allowedOptions ?? {}) as Record<string, unknown>;
  const raw = opts[TICK_KEY[pool]];
  const ticks = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  if (ticks.length > 0) return ticks;
  if (pool === "gap") return model.gaps ?? [];
  return [];
}

/** Active master rows of `pool`, gated by the model's ticks (empty ticks = no
 *  restriction). Pool sort order preserved. */
export function allowedPoolValues(
  model: Pick<ProductModelDto, "gaps" | "allowedOptions">,
  pool: OptionPoolPickKind,
  pools: CatalogOptionPoolDto[] | null | undefined,
): CatalogOptionPoolDto[] {
  const master = (pools ?? [])
    .filter((p) => p.pool === pool && p.active)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value));
  const ticks = poolTicksFor(model, pool);
  if (ticks.length === 0) return master;
  const allow = new Set(ticks);
  return master.filter((p) => allow.has(p.value));
}

/** Active master fabrics this model OFFERS (opt-in ticks by fabric code —
 *  empty/absent = none). Master sort order preserved. */
export function allowedFabricsFor(
  model: Pick<ProductModelDto, "allowedOptions">,
  fabrics: CatalogFabricDto[] | null | undefined,
): CatalogFabricDto[] {
  const raw = (model.allowedOptions ?? ({} as Record<string, unknown>)).fabrics;
  const ticks = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  if (ticks.length === 0) return [];
  const allow = new Set(ticks);
  return (fabrics ?? []).filter((f) => f.active && allow.has(f.fabricCode));
}

/** The tier column a category prices a master fabric by (0202 carries both). */
export function fabricTierFor(
  category: ProductCategory,
  fabric: Pick<CatalogFabricDto, "sofaTier" | "bedframeTier">,
): FabricTier {
  return category === "bedframe" ? fabric.bedframeTier : fabric.sofaTier;
}

/** The seat heights the sofa builder offers = ACTIVE `sofa_size` pool values ∩
 *  the canonical `SOFA_HEIGHTS` axis (pool order; non-dimensional entries like
 *  "Flat" are skipped). An empty/absent pool falls back to the full axis so a
 *  fresh DB never renders a builder with zero heights. */
export function activeSofaHeights(
  pools: CatalogOptionPoolDto[] | null | undefined,
): SofaHeight[] {
  const canonical = new Set<string>(SOFA_HEIGHTS);
  const fromPool = (pools ?? [])
    .filter((p) => p.pool === "sofa_size" && p.active && canonical.has(p.value))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => p.value as SofaHeight);
  return fromPool.length > 0 ? fromPool : [...SOFA_HEIGHTS];
}

/* ─── Option-pick attrs (DraftLine / order_lines) + the shared resolver ──── */

/** The pick kinds a configured (non-build) line may carry in `attrs.options`.
 *  `gap` is deliberately NOT here — a gap never carries a surcharge and rides
 *  the existing `attrs.gap` display key; sofa-BUILD leg heights ride the sofa
 *  engine (`attrs.leg_height` → `computeSofaPrice`), not this array. */
export const OPTION_PICK_KINDS = ["divan_height", "bedframe_leg_height", "fabric"] as const;
export type OptionPickKind = (typeof OPTION_PICK_KINDS)[number];

/** One stored pick — client-resolved for display; the server re-resolves and
 *  overwrites `label`/`surcharge` with canonical values on submit. */
export const optionPickAttrSchema = z.object({
  kind: z.enum(OPTION_PICK_KINDS),
  value: z.string().min(1),
  label: z.string().optional(),
  surcharge: z.number().finite(),
});
export type OptionPickAttr = z.infer<typeof optionPickAttrSchema>;

/** The `attrs` envelope a line with option picks carries (mirrors
 *  `attrs.specials` / `specials_total`). */
export const optionsAttrsSchema = z.object({
  options: z.array(optionPickAttrSchema).min(1),
  options_total: z.number().finite(),
});
export type OptionsAttrs = z.infer<typeof optionsAttrsSchema>;

export interface OptionPick {
  kind: OptionPickKind;
  value: string;
}

/** Everything the resolver needs to price picks — assembled from the catalog
 *  bundle on the client and from fresh DB rows in the Hono recompute. */
export interface OptionResolveContext {
  /** Pool rows (any pool; inactive rows are ignored here). */
  pools: CatalogOptionPoolDto[];
  /** Fabric master rows (inactive rows are ignored here). */
  fabrics: CatalogFabricDto[];
  /** The line's model category — picks the fabric tier column. */
  category: ProductCategory;
  /** 0176 per-model tier delta override + global config (fabric picks only). */
  fabricTierOverride?: FabricTierOverride | null;
  fabricTierConfig?: FabricTierGlobalConfig | null;
}

export interface ResolvedOptionLine {
  kind: OptionPickKind;
  value: string;
  label?: string;
  surcharge: number;
}

export interface OptionsTotalResult {
  /** Σ surcharges (RM, 2dp — integer-cent arithmetic inside). */
  total: number;
  lines: ResolvedOptionLine[];
  /** `kind:value` keys that no longer resolve (retired / renamed) — the caller
   *  rejects the submit and asks for a reconfigure. */
  unknown: string[];
}

const toCents = (myr: number): number => Math.round(myr * 100);

/**
 * Resolve option picks to canonical lines + a total, from CURRENT rows. The POS
 * preview and the Hono option-picks recompute run THIS same function — the
 * client figure is only ever a preview of the identical computation.
 */
export function resolveOptionsTotal(
  picks: OptionPick[],
  ctx: OptionResolveContext,
): OptionsTotalResult {
  const lines: ResolvedOptionLine[] = [];
  const unknown: string[] = [];
  let cents = 0;

  for (const pick of picks) {
    if (pick.kind === "fabric") {
      const fabric = ctx.fabrics.find((f) => f.active && f.fabricCode === pick.value);
      if (!fabric) {
        unknown.push(`fabric:${pick.value}`);
        continue;
      }
      const tier = fabricTierFor(ctx.category, fabric);
      const surcharge = resolveFabricDelta(tier, ctx.fabricTierOverride, ctx.fabricTierConfig);
      cents += toCents(surcharge);
      lines.push({
        kind: "fabric",
        value: fabric.fabricCode,
        label: fabric.description ?? undefined,
        surcharge,
      });
      continue;
    }

    const row = ctx.pools.find(
      (p) => p.pool === pick.kind && p.active && p.value === pick.value,
    );
    if (!row) {
      unknown.push(`${pick.kind}:${pick.value}`);
      continue;
    }
    const surcharge = row.surcharge ?? 0;
    cents += toCents(surcharge);
    lines.push({
      kind: pick.kind,
      value: row.value,
      ...(row.label ? { label: row.label } : {}),
      surcharge,
    });
  }

  return { total: cents / 100, lines, unknown };
}

/* ─── Computed total height (divan + leg) ────────────────────────────────── */

/** Inches from a pool value like `10"` / `4"`; "No Leg" (any non-numeric
 *  no-leg wording) counts as 0; anything else unparsable → null. */
export function inchesOf(value: string | null | undefined): number | null {
  if (!value) return null;
  if (/no\s*leg/i.test(value)) return 0;
  const m = value.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/** Total height = divan + leg (the reason the POS has NO Total Height input —
 *  Loo 2026-07-06: it is computed, never picked). Null when either side is
 *  unpicked or unparsable. */
export function computedTotalHeight(
  divan: string | null | undefined,
  leg: string | null | undefined,
): string | null {
  const d = inchesOf(divan);
  const l = inchesOf(leg);
  if (d === null || l === null) return null;
  const sum = d + l;
  const rounded = Math.round(sum * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded}"`;
}
