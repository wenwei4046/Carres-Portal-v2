/**
 * Sofa pricing engine (Phase 2, sofa engine) — the PURE money core.
 *
 * A faithful port of the 2990s sofa pricing functions, adapted to Carres's
 * numeric-MYR catalog convention (MYR in → integer cents for arithmetic → MYR
 * out, the `explodeCombo` convention). NO DB, NO IO, NO React — every function
 * here is pure and runs identically on the web client and (Phase 4) in Hono.
 *
 * Ported 1:1 from (`C:\Users\wenwe\Projects\2990s`):
 *   · `groupPrice`                     sofa-build.ts:1176-1333  → computeSofaPrice
 *   · `mirrorCode`                     sofa-build.ts:360-364    → mirrorCode
 *   · `matchComboSubset` (Kuhn)        sofa-combo-pricing.ts:289-333 → matchSofaCombo
 *   · `pickComboMatch`                 sofa-combo-pricing.ts:368-418 → pickSofaCombo
 *   · `canonicalizeComboModulesForStorage` sofa-combo-pricing.ts:147-172 → canonicalizeSofaSlots
 *   · `distributeProportionally`       so-sofa-split.ts:54-70   → explodeSofaBuild split
 *
 * CRITICAL CORRECTNESS RULES (from the grounding — these are load-bearing):
 *   1. Pricing precedence = matched COMBO > à-la-carte (Carres sofas have no
 *      "bundle" layer — it is removed). NO cheaper-only guard: a matched combo
 *      applies whenever `prices_by_height[height] > 0`, EVEN IF PRICIER. The
 *      2990s "only-if-cheaper" doc-comment is DEAD code; we follow the live code.
 *   2. Combo covers ONLY the matched subset. Modules beyond the matched slots
 *      ("extras") add at full à-la-carte. `base = comboPrice + comboExtras`.
 *   3. Combo matching = Kuhn bipartite MAX matching (augmenting paths), NOT a
 *      greedy first-match — overlapping OR-sets `[{X,Y},{X}]` vs `[X,Y]` must
 *      match (greedy strands a slot).
 *   4. The comboSubsetSum lookup MUST be IDENTICAL to the à-la-carte lookup
 *      (including the mirror fallback) — the 2990s "C1" audit invariant. Else a
 *      mirrored matched cell counts in aLaCarteSum but not subsetSum, so
 *      comboExtras = aLaCarteSum − subsetSum re-charges it ON TOP of the combo.
 *   5. reclinerExtra = 0 (Phase-3 stub; the interface is present but no data).
 *   6. All arithmetic in integer cents; round to 2dp MYR once at the end.
 */

import type {
  SofaCompartment,
  ModelSofaCompartment,
  SofaCombo,
} from "./domain";
import type { FabricTier } from "./fabric-tier";
import {
  resolveFabricDelta,
  type FabricTierOverride,
  type FabricTierGlobalConfig,
} from "./fabric-tier";

/* ─── Cents helpers (Carres numeric-MYR convention) ────────────────────── */

/** MYR → integer cents (the `explodeCombo` convention). */
const toCents = (myr: number): number => Math.round(myr * 100);
/** Integer cents → clean 2-dp MYR. */
const toMyr = (cents: number): number => cents / 100;

/* ─── resolveCompartmentPrice + mirrorCode ─────────────────────────────── */

/**
 * Flip a compartment code left↔right: swap the LHF↔RHF orientation token.
 * Orientation-free codes (1NA, Console, CNR, …) pass through unchanged.
 * Faithful port of 2990s `mirrorCode` (sofa-build.ts:360-364).
 */
export function mirrorCode(code: string): string {
  if (code.includes("LHF")) return code.replace("LHF", "RHF");
  if (code.includes("RHF")) return code.replace("RHF", "LHF");
  return code;
}

/**
 * Resolve the à-la-carte RM price for a per-model compartment.
 *   `modelComp.priceOverride ?? pool.defaultPrice`
 * Mirrors `resolveFabricDelta`'s `??` discipline: an override of `0` WINS
 * (explicitly free for this model); `null` INHERITS the pool default. When
 * neither is available (compartment not in the pool / not offered), returns 0
 * — the caller's mirror fallback gets a chance before this 0 lands.
 */
export function resolveCompartmentPrice(
  modelComp: ModelSofaCompartment | null | undefined,
  pool: SofaCompartment | null | undefined,
): number {
  return modelComp?.priceOverride ?? pool?.defaultPrice ?? 0;
}

/* ─── canonicalizeSofaSlots ────────────────────────────────────────────── */

/**
 * Canonical storage form for a combo's slot-set (port of 2990s
 * `canonicalizeComboModulesForStorage`, sofa-combo-pricing.ts:147-172). The API
 * (Phase 4) calls this on SAVE so two equivalent combos persist byte-identical:
 *   · trim + de-dupe codes within each slot, drop empty slots,
 *   · SORT codes within each slot,
 *   · SORT the slots by their first code.
 * Matching is order-independent regardless; sorting only stabilizes on-disk JSON
 * for de-dupe + hashing. Returns `[]` when nothing usable remains.
 */
export function canonicalizeSofaSlots(slots: string[][]): string[][] {
  const cleaned: string[][] = [];
  for (const slot of slots) {
    if (!Array.isArray(slot)) continue;
    const inner: string[] = [];
    for (const raw of slot) {
      const t = String(raw).trim();
      if (!t) continue;
      if (!inner.includes(t)) inner.push(t);
    }
    if (inner.length === 0) continue;
    cleaned.push(inner.slice().sort());
  }
  cleaned.sort((a, b) => a[0]!.localeCompare(b[0]!));
  return cleaned;
}

/* ─── matchSofaCombo (Kuhn bipartite MAX matching) ─────────────────────── */

/**
 * SUBSET / group-coverage match (port of 2990s `matchComboSubset`,
 * sofa-combo-pricing.ts:289-333). Can every combo SLOT be covered by a DISTINCT
 * built module whose code is in that slot's OR-set?
 *
 * Returns the matched subset as the sorted list of BUILT-module indices consumed
 * (exactly `slots.length` entries), or `null` when at least one slot can't be
 * filled. Any built module NOT in the subset is an "extra" the caller prices at
 * full master price; the built count may exceed the slot count.
 *
 * Uses Kuhn's augmenting-path bipartite matching (NOT greedy) so a coverable
 * slot always gets covered even with overlapping OR-sets. n ≤ ~8 in practice.
 */
export function matchSofaCombo(
  builtCodes: readonly string[],
  rawSlots: readonly (readonly string[])[],
): number[] | null {
  // Normalize slots: trim, drop empty codes + empty slots. (NOT sorted — match
  // is order-independent; sorting is a storage concern handled separately.)
  const slots: string[][] = [];
  for (const s of rawSlots) {
    const inner = s.map((c) => c.trim()).filter(Boolean);
    if (inner.length > 0) slots.push(inner);
  }
  const mods = builtCodes.map((m) => m.trim());

  if (slots.length === 0) return null; // empty combo never applies
  if (mods.length < slots.length) return null; // not enough modules to cover

  // adjacency: for each SLOT, which built-module indices can fill it.
  const slotSets = slots.map((s) => new Set(s));
  const slotCanTake: number[][] = slots.map((_, j) =>
    mods
      .map((_m, i) => i)
      .filter((i) => mods[i] !== "" && slotSets[j]!.has(mods[i]!)),
  );

  // Quick reject: every slot must have at least one candidate built module.
  if (slotCanTake.some((opts) => opts.length === 0)) return null;

  // Kuhn's algorithm, oriented slot → built module. modToSlot[i] = slot the
  // built module at index i is assigned to (-1 = free).
  const modToSlot = new Array<number>(mods.length).fill(-1);
  const assignSlot = (j: number, seen: boolean[]): boolean => {
    for (const i of slotCanTake[j]!) {
      if (seen[i]) continue;
      seen[i] = true;
      if (modToSlot[i] === -1 || assignSlot(modToSlot[i]!, seen)) {
        modToSlot[i] = j;
        return true;
      }
    }
    return false;
  };

  for (let j = 0; j < slots.length; j++) {
    if (!assignSlot(j, new Array<boolean>(mods.length).fill(false))) {
      return null; // a slot couldn't be covered → combo doesn't apply
    }
  }

  const subset: number[] = [];
  for (let i = 0; i < mods.length; i++) if (modToSlot[i] !== -1) subset.push(i);
  subset.sort((a, b) => a - b);
  return subset;
}

/* ─── pickSofaCombo ────────────────────────────────────────────────────── */

/**
 * The combo row shape the engine consumes — a structural subset of the domain
 * `SofaCombo` (so the API/web can pass `SofaCombo[]` directly). `tier === null`
 * applies to any fabric tier.
 */
export type SofaComboLike = Pick<
  SofaCombo,
  | "id"
  | "modelId"
  | "slots"
  | "tier"
  | "pricesByHeight"
  | "label"
  | "effectiveFrom"
  | "active"
  | "discontinuedAt"
>;

export interface PickSofaComboArgs {
  modelId: string;
  /** The BUILT sofa's flat list of compartment codes (one per cell). */
  builtCodes: string[];
  /** The lookup tier; `null` matches any combo tier. */
  tier: FabricTier | null;
  /** The chosen seat height key (e.g. '28'). */
  height: string;
  /** ISO date; defaults to today. Combos with a later `effective_from` are excluded. */
  asOf?: string;
}

export interface SofaComboPick {
  combo: SofaComboLike;
  /** The combo's price (RM) for the requested height. Always finite, > 0. */
  priceMyr: number;
  /** Sorted BUILT-cell indices the combo consumed (one per slot). */
  matchedIndices: number[];
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * Pick the best-matching combo for the build (port of 2990s `pickComboMatch`,
 * sofa-combo-pricing.ts:368-418, customer scope DROPPED — Carres is company-wide
 * only). Filter → rank → tie-break newest `effective_from` → return best.
 *
 * Filter: active && !discontinued, model match, tier match (`row.tier === null`
 * OR `row.tier === args.tier`), `effective_from <= asOf`, a numeric
 * `prices_by_height[height]` (incl. literal 0 — kept through the filter; the
 * `> 0` gate is applied POST-rank by `computeSofaPrice`, matching 2990s
 * `groupPrice` so a 0-priced WINNER falls to à-la-carte WITHOUT retrying a
 * lower-priority combo), slots coverable by `matchSofaCombo`.
 * Rank: company+tier (2) > company+any (1) (customer tiers 3/4 deferred).
 * Returns `null` when nothing qualifies.
 */
export function pickSofaCombo(
  args: PickSofaComboArgs,
  combos: readonly SofaComboLike[],
): SofaComboPick | null {
  const asOf = args.asOf ?? todayIso();
  const built = args.builtCodes.map((m) => m.trim());

  const candidates: Array<{ combo: SofaComboLike; price: number; subset: number[] }> = [];
  for (const c of combos) {
    if (!c.active) continue;
    if (c.discontinuedAt) continue;
    if (c.modelId !== args.modelId) continue;
    // tier match: combo's null tier applies to any; else must equal the arg.
    if (c.tier !== null && args.tier !== null && c.tier !== args.tier) continue;
    if (c.effectiveFrom > asOf) continue;
    const price = c.pricesByHeight?.[args.height];
    // A numeric price (incl. literal 0) survives the filter — faithful to 2990s
    // pickComboMatch. The `> 0` decision is made POST-rank by computeSofaPrice,
    // so a 0-priced winner falls to à-la-carte without retrying a lower combo.
    // null / undefined (no price set for this height) → combo does not apply.
    if (typeof price !== "number") continue;
    const subset = matchSofaCombo(built, c.slots);
    if (!subset) continue;
    candidates.push({ combo: c, price, subset });
  }
  if (candidates.length === 0) return null;

  // Rank: company+tier (2) > company+any (1). Customer scope (3/4) deferred.
  // A `null` args.tier is a wildcard lookup — every surviving (post-filter)
  // combo is treated as an exact tier match (rank 2) so it can win.
  const priorityOf = (c: SofaComboLike): number => {
    const tierMatch = args.tier === null || c.tier === args.tier;
    if (tierMatch) return 2;
    if (c.tier === null) return 1;
    return 0;
  };
  const ranked = candidates
    .map((c) => ({ ...c, p: priorityOf(c.combo) }))
    .filter((c) => c.p > 0)
    .sort(
      (a, b) =>
        b.p - a.p ||
        (a.combo.effectiveFrom < b.combo.effectiveFrom
          ? 1
          : a.combo.effectiveFrom > b.combo.effectiveFrom
            ? -1
            : 0),
    );
  const winner = ranked[0];
  if (!winner) return null;
  return { combo: winner.combo, priceMyr: winner.price, matchedIndices: winner.subset };
}

/* ─── computeSofaPrice ─────────────────────────────────────────────────── */

/** One assembled-sofa cell (Phase 2: just the compartment code + optional
 *  geometry carried for the explode). Recliner/geometry data lands in Phase 3. */
export interface SofaBuildCell {
  moduleCode: string;
  x?: number | null;
  y?: number | null;
  rot?: number | null;
}

/** A sofa build = a model + its assembled cells + the chosen fabric tier + height. */
export interface SofaBuild {
  modelId: string;
  cells: SofaBuildCell[];
  /** `null`/unset → priced at the default lookup tier PRICE_1. */
  fabricTier?: FabricTier | null;
  /** Chosen seat-height key (combo lookup axis). */
  height: string;
  /** Optional group key carried into the explode (regroup the visual sofa). */
  buildKey?: string;
  asOf?: string;
}

/** The catalog snapshot the engine prices against (all numeric MYR at rest). */
export interface SofaPricingSnapshot {
  /** The global compartment pool (by `code` via `id`). */
  compartmentPool: SofaCompartment[];
  /** This model's offered compartments (price overrides). */
  modelCompartments: ModelSofaCompartment[];
  /** Combo rows in play (the API filters by model already; this re-filters). */
  sofaCombos: SofaComboLike[];
  /** Per-model fabric-tier delta override (0176). */
  fabricTierOverride?: FabricTierOverride | null;
  /** Global fabric-tier delta config singleton (0176). */
  fabricTierConfig?: FabricTierGlobalConfig | null;
}

export type SofaPriceBasis = "combo" | "a_la_carte";

export interface SofaPriceResult {
  /** Sum of resolved compartment prices over every cell (mirror fallback). */
  aLaCarteSum: number;
  basis: SofaPriceBasis;
  comboId?: string;
  comboPrice?: number;
  /** À-la-carte sum of the MATCHED-subset cells (same lookup incl. mirror). */
  comboSubsetSum?: number;
  /** Extras beyond the matched slots, at full à-la-carte. */
  comboExtras?: number;
  /** Phase-3 stub; always 0 in Phase 2. */
  reclinerExtra: number;
  /** Fabric-tier P2/P3 delta (RM). */
  fabricDelta: number;
  /** Final RM price, rounded to 2dp once. */
  total: number;
  /** The build-cell indices the combo consumed (when basis === 'combo'). */
  matchedCellIndices?: number[];
}

/**
 * Resolve a single build cell's à-la-carte price IN CENTS, with mirror fallback.
 * Looks up the compartment by code in the pool, then by its mirror code (a
 * flipped Quick Pick) so a one-hand-priced module never prices to RM 0. This is
 * the SINGLE lookup used by BOTH the à-la-carte loop and the combo-subset loop
 * (the C1 invariant — both must agree, or extras double-charge a mirrored cell).
 */
function cellPriceCents(
  code: string,
  poolByCode: Map<string, SofaCompartment>,
  modelByCompId: Map<string, ModelSofaCompartment>,
): number {
  const direct = poolByCode.get(code);
  const comp = direct ?? poolByCode.get(mirrorCode(code));
  if (!comp) return 0;
  const mc = modelByCompId.get(comp.id);
  return toCents(resolveCompartmentPrice(mc, comp));
}

/**
 * Compute the price of one assembled sofa (faithful port of 2990s `groupPrice`,
 * sofa-build.ts:1176-1333, with the bundle + promo layers removed). All
 * arithmetic in integer cents; `total` rounded to 2dp MYR once at the end.
 */
export function computeSofaPrice(
  build: SofaBuild,
  snapshot: SofaPricingSnapshot,
): SofaPriceResult {
  const poolByCode = new Map<string, SofaCompartment>(
    snapshot.compartmentPool.map((c) => [c.code, c]),
  );
  const modelByCompId = new Map<string, ModelSofaCompartment>(
    snapshot.modelCompartments.map((m) => [m.compartmentId, m]),
  );

  // À-la-carte total (cents) — sum every cell with mirror fallback.
  let aLaCarteCents = 0;
  for (const cell of build.cells) {
    aLaCarteCents += cellPriceCents(cell.moduleCode, poolByCode, modelByCompId);
  }

  // Combo override. Default lookup tier when fabricTier is unset = PRICE_1
  // (combos are authored at PRICE_1; the fabric P2/P3 delta is a SEPARATE add).
  const lookupTier: FabricTier = build.fabricTier ?? "PRICE_1";
  const builtCodes = build.cells.map((c) => c.moduleCode);
  const match = pickSofaCombo(
    {
      modelId: build.modelId,
      builtCodes,
      tier: lookupTier,
      height: build.height,
      asOf: build.asOf,
    },
    snapshot.sofaCombos,
  );

  let basis: SofaPriceBasis = "a_la_carte";
  let baseCents = aLaCarteCents;
  let comboId: string | undefined;
  let comboPrice: number | undefined;
  let comboSubsetSum: number | undefined;
  let comboExtras: number | undefined;
  let matchedCellIndices: number[] | undefined;

  if (match && match.priceMyr > 0) {
    basis = "combo";
    const comboCents = toCents(match.priceMyr);

    // À-la-carte sum of the matched subset — SAME lookup (incl. mirror) as the
    // full à-la-carte loop above (the C1 invariant). Without this a mirrored
    // matched cell counts in aLaCarteCents but not subsetCents, so comboExtras
    // re-charges it on top of the combo price.
    const matchedSet = new Set(match.matchedIndices);
    let subsetCents = 0;
    for (let i = 0; i < build.cells.length; i++) {
      if (!matchedSet.has(i)) continue;
      subsetCents += cellPriceCents(
        build.cells[i]!.moduleCode,
        poolByCode,
        modelByCompId,
      );
    }
    const extrasCents = Math.max(0, aLaCarteCents - subsetCents);
    baseCents = comboCents + extrasCents;

    comboId = match.combo.id;
    comboPrice = match.priceMyr;
    comboSubsetSum = toMyr(subsetCents);
    comboExtras = toMyr(extrasCents);
    matchedCellIndices = match.matchedIndices;
  }

  // Recliner extra — Phase-3 stub (interface present, no data → 0).
  const reclinerCents = 0;

  // Fabric-tier P2/P3 delta (RM → cents).
  const fabricDeltaMyr = resolveFabricDelta(
    lookupTier,
    snapshot.fabricTierOverride,
    snapshot.fabricTierConfig,
  );
  const fabricDeltaCents = toCents(fabricDeltaMyr);

  const totalCents = baseCents + reclinerCents + fabricDeltaCents;

  return {
    aLaCarteSum: toMyr(aLaCarteCents),
    basis,
    comboId,
    comboPrice,
    comboSubsetSum,
    comboExtras,
    reclinerExtra: toMyr(reclinerCents),
    fabricDelta: toMyr(fabricDeltaCents),
    total: toMyr(totalCents),
    matchedCellIndices,
  };
}

/* ─── explodeSofaBuild ─────────────────────────────────────────────────── */

/** One exploded per-cell line (Phase 4 wires `sku`/`itemCode` + order_lines). */
export interface ExplodedSofaLine {
  moduleCode: string;
  qty: number;
  unitPrice: number;
  /** Group key so downstream can regroup the visual sofa. */
  buildKey: string | null;
  /** This cell's index in the build (regroup ordering + geometry pairing). */
  cellIndex: number;
}

/**
 * Split a sofa build's authoritative `totalMyr` across its cells, weighted by
 * each cell's à-la-carte price, integer-cents + residue-on-last so the line
 * total sums to `totalMyr` EXACTLY (qty=1 case). Reuses the `explodeCombo` /
 * 2990s `distributeProportionally` math (floor each but last; last = total −
 * allocated; all-zero weights → equal split). One line per build cell.
 *
 * `compartmentPriceLookup(code)` returns the cell's à-la-carte RM weight; a
 * non-finite / missing price counts as 0 weight (no NaN poisoning).
 */
export function explodeSofaBuild(
  build: SofaBuild,
  totalMyr: number,
  compartmentPriceLookup: (code: string) => number,
): ExplodedSofaLine[] {
  const cells = build.cells;
  if (cells.length === 0) return [];

  const totalCents = toCents(totalMyr);
  const buildKey = build.buildKey ?? null;

  // Single cell takes the whole total (mirrors distributeProportionally n=1).
  if (cells.length === 1) {
    return [
      {
        moduleCode: cells[0]!.moduleCode,
        qty: 1,
        unitPrice: toMyr(totalCents),
        buildKey,
        cellIndex: 0,
      },
    ];
  }

  // Weights (cents) — clamp negatives + non-finite to 0.
  let weights = cells.map((c) => {
    const p = compartmentPriceLookup(c.moduleCode);
    return Number.isFinite(p) ? Math.max(0, toCents(p)) : 0;
  });
  let W = weights.reduce((s, w) => s + w, 0);

  // All-zero weights → split evenly.
  if (W <= 0) {
    weights = cells.map(() => 1);
    W = weights.length;
  }

  const lastIdx = cells.length - 1;
  const lineCents = new Array<number>(cells.length);
  let allocated = 0;
  for (let i = 0; i < lastIdx; i++) {
    const share = Math.floor((totalCents * weights[i]!) / W);
    lineCents[i] = share;
    allocated += share;
  }
  lineCents[lastIdx] = totalCents - allocated; // residue lands on the last line

  return cells.map((c, i) => ({
    moduleCode: c.moduleCode,
    qty: 1,
    unitPrice: toMyr(lineCents[i]!),
    buildKey,
    cellIndex: i,
  }));
}
