// ----------------------------------------------------------------------------
// Unified rule targeting — the SINGLE source of truth for "which product lines a
// rule covers". Ported PURE from 2990s `packages/shared/src/rule-target.ts`
// (2990s Products parity Phase 6 — RuleTarget + Delivery Fee). In Carres the
// first (and currently only) consumer is the Special Delivery Fee subsystem
// (`delivery-fee.ts` + the Hono server-recompute); promo (PWP/GWP/Free-Gift) is
// deferred, so this module deliberately omits the 2990s PWP refinement gate.
//
// A rule's targeting is a RuleTarget[]. Each entry is one Model plus a scope:
//   - 'model'       → any variant / any build of that Model
//   - 'variant'     → only the listed mfg size_codes (mattress / bedframe)
//   - 'combo'       → sofa builds covering any listed combo's slots (subset match)
//   - 'compartment' → sofa builds that CONTAIN any listed compartment module
// Lists inside an entry are OR'd; entries are OR'd. An EMPTY RuleTarget[] means
// "match every line" (the caller scopes category if it needs to).
//
// PURE: no IO, no Supabase, no React. Combo subset-matching is wired to Carres's
// EXISTING `matchSofaCombo` (sofa-pricing.ts, the Kuhn bipartite max-matcher) and
// compartment normalization to Carres's EXISTING `normalizeCompartmentCode`
// (sofa-geometry.ts) — NOT re-implemented here, so the POS preview and the server
// recompute run identical matching (honest-pricing).
// ----------------------------------------------------------------------------
import { matchSofaCombo } from "./sofa-pricing";
import { normalizeCompartmentCode } from "./sofa-geometry";

export type RuleTargetScope = "model" | "variant" | "combo" | "compartment";

/** The scope + its refinement lists, WITHOUT the modelId. Reused where the
 *  Model is already fixed (e.g. a per-model row keyed by model_id). */
export interface TargetRefinement {
  scope: RuleTargetScope;
  /** scope='variant': product size_code list (UPPERCASE). OR within. */
  sizeCodes?: string[];
  /** scope='combo': sofa_combo_pricing.id list. OR within. */
  comboIds?: string[];
  /** scope='compartment': normalized compartment module codes. OR within. */
  compartments?: string[];
}

export interface RuleTarget extends TargetRefinement {
  /** product_models.id. For a sofa combo entry the modelId may be '' (combo
   *  matching does NOT require it — see lineMatchesTarget). */
  modelId: string;
}

/** One cart/order line flattened to what the matcher needs. */
export interface RuleLineInput {
  /** SOFA / MATTRESS / BEDFRAME / ACCESSORY / SERVICE (case-insensitive). */
  category: string;
  /** product_models.id of the line's Model (null = no model match possible). */
  modelId: string | null;
  /** product size_code for mattress/bedframe (UPPERCASE); null otherwise. */
  sizeCode: string | null;
  /** sofa build module codes (normalized inside); [] for non-sofa. */
  builtCompartments: string[];
}

const isSofaCat = (c: string): boolean => String(c ?? "").toUpperCase() === "SOFA";

const cleanStrArr = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((x) => x.trim())
    : [];

/** Coerce one raw refinement (no modelId). Returns null if unusable (e.g. a
 *  'variant' entry with no sizes), so callers can drop malformed data. */
export function parseTargetRefinement(raw: unknown): TargetRefinement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const scope: RuleTargetScope =
    r.scope === "variant" || r.scope === "combo" || r.scope === "compartment"
      ? r.scope
      : "model";
  if (scope === "model") return { scope };
  if (scope === "variant") {
    const sizeCodes = cleanStrArr(r.sizeCodes).map((s) => s.toUpperCase());
    return sizeCodes.length ? { scope, sizeCodes } : null;
  }
  if (scope === "compartment") {
    const compartments = cleanStrArr(r.compartments);
    return compartments.length ? { scope, compartments } : null;
  }
  // combo — accept comboIds[] (new) or a legacy single comboId (old rows).
  const comboIds = cleanStrArr(r.comboIds);
  const legacy =
    typeof r.comboId === "string" && r.comboId.trim() ? [r.comboId.trim()] : [];
  const all = comboIds.length ? comboIds : legacy;
  return all.length ? { scope, comboIds: all } : null;
}

/** Coerce raw jsonb into clean RuleTarget[] (drops malformed entries). */
export function parseRuleTargets(raw: unknown): RuleTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleTarget[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const mid = (e as Record<string, unknown>).modelId;
    const modelId = typeof mid === "string" ? mid.trim() : "";
    const ref = parseTargetRefinement(e);
    if (!ref) continue;
    // combo entries may carry an empty modelId (model-agnostic); every other
    // scope needs a real modelId to match.
    if (ref.scope !== "combo" && !modelId) continue;
    out.push({ modelId, ...ref });
  }
  return out;
}

/** Does a refinement (whose Model is taken as already matched / fixed) cover
 *  this line? Combo subset-matching delegates to the shared `matchSofaCombo`. */
export function refinementMatchesLine(
  line: RuleLineInput,
  ref: TargetRefinement,
  comboModulesById: Map<string, string[][]>,
): boolean {
  const sofa = isSofaCat(line.category);
  switch (ref.scope) {
    case "model":
      return true;
    case "variant": {
      if (sofa) return false; // size is meaningless for a sofa line
      const sc = (line.sizeCode ?? "").toUpperCase();
      return sc !== "" && (ref.sizeCodes ?? []).map((s) => s.toUpperCase()).includes(sc);
    }
    case "compartment": {
      if (!sofa) return false;
      const built = new Set(
        line.builtCompartments.map((m) => normalizeCompartmentCode(m)),
      );
      return (ref.compartments ?? []).some((c) =>
        built.has(normalizeCompartmentCode(c)),
      );
    }
    case "combo": {
      if (!sofa) return false;
      const built = line.builtCompartments.map((m) => normalizeCompartmentCode(m));
      return (ref.comboIds ?? []).some((id) => {
        const slots = comboModulesById.get(id);
        return slots ? matchSofaCombo(built, slots) !== null : false;
      });
    }
    default:
      return false;
  }
}

/** Does one target cover this line? */
export function lineMatchesTarget(
  line: RuleLineInput,
  target: RuleTarget,
  comboModulesById: Map<string, string[][]>,
): boolean {
  // combo matches by built modules ⊂ combo slots, regardless of modelId (which
  // may be '' from a model-agnostic combo entry); every other scope requires
  // the same Model.
  if (target.scope !== "combo" && target.modelId !== line.modelId) return false;
  return refinementMatchesLine(line, target, comboModulesById);
}

/** Empty targets = "match this line" (the caller scopes category if needed). */
export function lineMatchesTargets(
  line: RuleLineInput,
  targets: RuleTarget[],
  comboModulesById: Map<string, string[][]>,
): boolean {
  if (targets.length === 0) return true;
  return targets.some((t) => lineMatchesTarget(line, t, comboModulesById));
}
