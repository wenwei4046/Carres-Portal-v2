// ----------------------------------------------------------------------------
// Default Free Gift (accessory) — PURE, shared by the POS cart preview and the
// Hono server-side SO-create resolver so the two NEVER drift (honest-pricing).
// NO voucher codes: a gift is DETERMINISTIC from a model's configured
// `model_default_free_gifts.gifts`. The GIFT is always a real accessory SKU @
// RM0; the TRIGGER is the model of a paid line. One gift set per qualifying
// item (qty scales for non-sofa; one gift set per complete sofa).
//
// Ported from 2990s `packages/shared/src/free-gift.ts` and adapted to Carres:
//   - the gift is a `giftSku` (product_skus.sku), NOT an mfg_products id;
//   - the trigger is keyed per-model (`giftsByModelId`), reusing the P6
//     RuleTarget refinement (`refinementMatchesLine`) for the optional condition;
//   - sofa builds dedupe by `buildKey` (the P5 explode's `sofa_build_key`) so a
//     "build contains CNR" condition resolves identically whether the sofa is
//     one POS-preview line or N exploded per-compartment server lines.
//
// PURE: no IO, no Supabase, no React. Reuses rule-target.ts for all matching.
// ----------------------------------------------------------------------------
import {
  parseTargetRefinement,
  refinementMatchesLine,
  type RuleLineInput,
  type TargetRefinement,
} from "./rule-target";

/** A per-model configured default free gift (one entry of
 *  `model_default_free_gifts.gifts`). */
export interface DefaultFreeGift {
  /** product_skus.sku of an ACCESSORY (the gift). */
  giftSku: string;
  /** count PER qualifying trigger unit (>= 1). */
  qty: number;
  /** free-text; absent => the line shows a generic "Free gift". */
  label?: string;
  /** Optional gating: when set, the gift only triggers for lines whose
   *  size_code / build compartments / combo match (P6 'variant' /
   *  'compartment' / 'combo' refinement). Absent / scope 'model' = the whole
   *  Model (legacy whole-model behavior). */
  condition?: TargetRefinement;
}

/** A gift line the cart/order SHOULD contain (server-resolved, deterministic). */
export interface DesiredFreeGift {
  /** product_skus.sku of the gift accessory. */
  giftSku: string;
  /** resolved qty (configured qty × the trigger's unit count; >= 1). */
  qty: number;
  /** the gift's label, when configured. */
  label?: string;
  /** the model_id of the paid line that triggered this gift (provenance; the
   *  appended order_line carries it in attrs.free_gift.sourceModelId). */
  sourceModelId: string;
}

/**
 * One cart/order line flattened to what the resolver needs. Extends the P6
 * `RuleLineInput` with the trigger qty + a sofa build grouping key:
 *   - `qty` — the line qty; a non-sofa gift scales by it.
 *   - `buildKey` — the sofa split rows of ONE build share it (the P5
 *     `sofa_build_key`). null / absent = a standalone line (its own build).
 */
export interface FreeGiftLineInput extends RuleLineInput {
  qty: number;
  buildKey?: string | null;
  /** Set ONLY for an APPENDED gift line (`attrs.free_gift`): such a line never
   *  triggers another gift, so a gift can't spawn a gift (no recursion). The
   *  guard lives here in the SHARED resolver so the POS preview + the server
   *  resolver share it; the callers just set the flag.
   *  NOTE: a campaign-freed PAID item (`attrs.free_item`) is NOT flagged — it
   *  still keeps its default gift, so "Make free" never strips the SKU's GWP
   *  (Loo 2026-07-06). */
  free?: boolean;
}

const isSofaCat = (c: string): boolean => String(c ?? "").toUpperCase() === "SOFA";

/** Gift qty = configured-per-trigger × the trigger's unit count, each floored at 1. */
const scaleGiftQty = (giftQty: number, triggerUnits: number): number =>
  Math.max(1, Math.floor(giftQty)) * Math.max(1, Math.floor(triggerUnits));

/** Coerce raw jsonb into clean DefaultFreeGift[] (drops malformed entries). */
export function parseDefaultFreeGifts(raw: unknown): DefaultFreeGift[] {
  if (!Array.isArray(raw)) return [];
  const out: DefaultFreeGift[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const giftSku = typeof r.giftSku === "string" ? r.giftSku.trim() : "";
    const qty = typeof r.qty === "number" ? Math.floor(r.qty) : NaN;
    if (!giftSku || !Number.isFinite(qty) || qty < 1) continue;
    const label =
      typeof r.label === "string" && r.label.trim() !== "" ? r.label.trim() : undefined;
    // A 'model'-scope (or absent / malformed) condition is the legacy whole-Model
    // gift — store no condition so non-gated entries serialize unchanged.
    const cond = parseTargetRefinement(r.condition);
    const entry: DefaultFreeGift = { giftSku, qty };
    if (label) entry.label = label;
    if (cond && cond.scope !== "model") entry.condition = cond;
    out.push(entry);
  }
  return out;
}

/**
 * Resolve the default free gifts a cart/order SHOULD contain, deterministically,
 * from each line's model. PURE — the server appends these as RM0 order_lines and
 * the POS preview shows the same set, so neither side can drift.
 *
 *   - a paid line triggers from its model's gifts (`giftsByModelId`);
 *   - a genuine SOFA BUILD (SofaBuildCanvas → has a `buildKey`) triggers ONE
 *     gift set per complete sofa — dedup by `buildKey` (the split rows share it);
 *     the trigger unit count is always 1 (a complete sofa = one trigger, never
 *     scaled by a module-row qty), so a gift's resolved qty stays its configured qty;
 *   - any other line — including a FLAT-sofa sku (category sofa, NO buildKey) —
 *     scales the gift qty by the line qty;
 *   - a FREE line (`free === true` — a campaign-freed item or an appended RM0
 *     gift) NEVER triggers a default gift (one-way guard; the SINGLE source of
 *     this rule, shared by the POS preview + the server resolver);
 *   - a gift carrying a `condition` only fires when the line matches it (via the
 *     shared `refinementMatchesLine`); for a sofa, the build's compartments are
 *     UNIONed across its split rows first, so the condition resolves identically
 *     on the one-line preview and the N exploded server lines.
 *
 * `giftsByModelId` is keyed by product_models.id; a line whose model has no
 * entry (or whose gifts all fail their condition) contributes nothing — so with
 * NO gifts authored the resolver returns `[]` (DORMANT: byte-identical orders).
 */
export function resolveDefaultFreeGifts(
  lines: FreeGiftLineInput[],
  giftsByModelId: Map<string, DefaultFreeGift[]>,
  comboModulesById: Map<string, string[][]> = new Map(),
): DesiredFreeGift[] {
  // Union each sofa build's compartments across its (possibly split) rows.
  const buildCompartments = new Map<string, string[]>();
  for (const line of lines) {
    if (line.free === true) continue; // one-way: a free line contributes nothing
    if (!isSofaCat(line.category)) continue;
    const buildId = line.buildKey ?? "";
    if (!buildId) continue;
    const cur = buildCompartments.get(buildId) ?? [];
    buildCompartments.set(buildId, [...cur, ...(line.builtCompartments ?? [])]);
  }

  const desired: DesiredFreeGift[] = [];
  const seenSofaBuilds = new Set<string>();
  lines.forEach((line) => {
    if (line.free === true) return; // one-way: a free line never triggers a gift
    const modelId = line.modelId;
    if (!modelId) return;
    const gifts = giftsByModelId.get(modelId);
    if (!gifts || gifts.length === 0) return;

    const sofa = isSofaCat(line.category);
    const buildId = line.buildKey ?? "";
    // Evaluate gift conditions against the FULL build (union) for a sofa.
    const li: RuleLineInput = {
      category: line.category,
      modelId,
      sizeCode: line.sizeCode,
      builtCompartments:
        sofa && buildId
          ? buildCompartments.get(buildId) ?? line.builtCompartments ?? []
          : line.builtCompartments ?? [],
    };
    const matched = gifts.filter(
      (g) => !g.condition || refinementMatchesLine(li, g.condition, comboModulesById),
    );
    if (matched.length === 0) return;

    // Only a GENUINE sofa BUILD (SofaBuildCanvas → has a buildKey) is one gift
    // set per complete sofa (qty 1, deduped across its split rows). A FLAT-sofa
    // sku (category sofa, NO buildKey — a real catalog product) scales by line
    // qty like any other line (Carres-specific: ~628 flat sofas).
    if (sofa && buildId) {
      const dedupKey = buildId;
      if (seenSofaBuilds.has(dedupKey)) return; // one gift set per complete sofa
      seenSofaBuilds.add(dedupKey);
      for (const g of matched) {
        const entry: DesiredFreeGift = {
          giftSku: g.giftSku,
          qty: scaleGiftQty(g.qty, 1),
          sourceModelId: modelId,
        };
        if (g.label) entry.label = g.label;
        desired.push(entry);
      }
    } else {
      const lineQty = Number(line.qty ?? 1);
      for (const g of matched) {
        const entry: DesiredFreeGift = {
          giftSku: g.giftSku,
          qty: scaleGiftQty(g.qty, lineQty),
          sourceModelId: modelId,
        };
        if (g.label) entry.label = g.label;
        desired.push(entry);
      }
    }
  });
  return desired;
}
