import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Adapters,
  DB,
  PWP_CODES,
  PWP_RULES,
  SOFA_COMBO_PRICING,
  lineMatchesTargets,
  type PwpRule,
  type RuleLineInput,
} from "@carres/shared";
import { resolveSkuInfo, type SkuInfo } from "./rule-line-input";

/**
 * 0256 — line-EDIT promo parity helpers (Loo 2026-07-25: "edited/added items
 * must follow the SAME rules as the POS — PWP, GWP, free-gift triggers").
 *
 * 1. `matchEarnedGiftRows` — wizard gift semantics on an edit: the replaced
 *    line's RM0 gift rows leave WITH it (the replacement earns fresh gifts via
 *    the standard pipeline stage). Gift rows carry no line pointer — only
 *    `attrs.free_gift = { giftSku, label?, sourceModelId }` — so we re-derive
 *    what the OLD configuration earns under TODAY's config and match those
 *    emissions against the persisted rows byte-wise. Two identical trigger
 *    lines produce byte-identical gift rows → fungible, any match is correct.
 *    Config drift (principal changed the gift rules since create) → no match
 *    → the row STAYS: the customer keeps what was promised (fail-soft in the
 *    safe direction).
 *
 * 2. `checkPromoEntitlementAfterEdit` — the up-sell gate alone cannot protect
 *    promo integrity: replacing 2× Queen with 1× King raises the total but
 *    HALVES the trigger units backing this order's PWP rewards / printed
 *    vouchers. Nothing downstream re-validates those artifacts (the 0187
 *    cancel trigger fires only on cancellation; the reapers only handle
 *    crash-stranded claims), so an edit must not leave them un-backed.
 *    Policy (v1, deliberately conservative): when the post-edit cart no
 *    longer supplies enough trigger units for what the order has already
 *    consumed (same-order reward lines + AVAILABLE vouchers this order
 *    sourced), BLOCK the edit — never silently claw back what the customer
 *    holds. Entitlement math mirrors the carry-forward sweep verbatim
 *    (pwp-carry-forward.ts, PR #155): per rule, entitled =
 *    Σ(trigger-line qty) × qty_per_trigger, sofa builds counted whole,
 *    promo one-way (a reward line never opens a PROMO entitlement).
 *    A DEACTIVATED rule is skipped: its vouchers can't redeem anyway and its
 *    reward lines are settled history.
 */

export interface EditCartLine {
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
}

export interface PersistedLineRow extends EditCartLine {
  id: string;
  unitPrice: number;
}

interface GiftMarker {
  giftSku?: unknown;
  sourceModelId?: unknown;
}

function giftMarkerOf(attrs: Record<string, unknown> | null): GiftMarker | null {
  const m = attrs?.free_gift;
  return m && typeof m === "object" ? (m as GiftMarker) : null;
}

/** Pure: pick the persisted RM0 gift rows the OLD configuration's re-derived
 *  emissions account for. Each desired emission consumes at most ONE row;
 *  rows already excluded (the edit targets) or claimed by a prior emission
 *  never match twice. */
export function matchEarnedGiftRows(
  desiredGifts: Array<{ sku: string; qty: number; attrs: Record<string, unknown> | null }>,
  orderRows: PersistedLineRow[],
  excludeIds: ReadonlySet<string>,
): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (const d of desiredGifts) {
    const want = giftMarkerOf(d.attrs);
    if (!want) continue;
    const match = orderRows.find((r) => {
      if (used.has(r.id) || excludeIds.has(r.id)) return false;
      if (Number(r.unitPrice) !== 0) return false;
      if (r.sku !== d.sku || r.qty !== d.qty) return false;
      const have = giftMarkerOf(r.attrs);
      return (
        !!have &&
        have.giftSku === want.giftSku &&
        have.sourceModelId === want.sourceModelId
      );
    });
    if (match) {
      used.add(match.id);
      out.push(match.id);
    }
  }
  return out;
}

export type PromoEntitlementOutcome =
  | { status: "ok" }
  | { status: "blocked"; message: string }
  | { status: "server_error"; message: string };

const upper = (s: string): string => String(s ?? "").toUpperCase();

/** A flat line → the matcher's RuleLineInput (mirrors the sweep's
 *  deriveRuleLine — triggers are flat real SKUs). */
function deriveRuleLine(info: SkuInfo | null): RuleLineInput {
  const category = info?.category ?? "";
  const isSofa = category.toLowerCase() === "sofa";
  return {
    category,
    modelId: info?.modelId ?? null,
    sizeCode: !isSofa && info?.variant ? info.variant.toUpperCase() : null,
    builtCompartments: [],
  };
}

/** Guard: would the post-edit cart still back everything this order's promos
 *  already handed out? Dormant orders (no reward lines, no sourced vouchers)
 *  cost one indexed pwp_codes read. */
export async function checkPromoEntitlementAfterEdit(
  sb: SupabaseClient,
  orderId: string,
  postEditLines: EditCartLine[],
): Promise<PromoEntitlementOutcome> {
  // Consumed side 1 — same-order reward lines (server forces reward qty = 1).
  const consumedByRule = new Map<string, number>();
  for (const l of postEditLines) {
    const p = (l.attrs ?? {}) as { pwp?: { ruleId?: unknown } };
    const ruleId = p.pwp && typeof p.pwp === "object" ? p.pwp.ruleId : null;
    if (typeof ruleId === "string" && ruleId) {
      consumedByRule.set(ruleId, (consumedByRule.get(ruleId) ?? 0) + 1);
    }
  }
  // Consumed side 2 — AVAILABLE carry-forward vouchers THIS order sourced.
  const codesR = await sb
    .from(PWP_CODES)
    .select("rule_id")
    .eq("source_order_id", orderId)
    .eq("status", "AVAILABLE");
  if (codesR.error) return { status: "server_error", message: codesR.error.message };
  for (const r of (codesR.data ?? []) as Array<{ rule_id: string | null }>) {
    if (r.rule_id) consumedByRule.set(r.rule_id, (consumedByRule.get(r.rule_id) ?? 0) + 1);
  }
  if (consumedByRule.size === 0) return { status: "ok" };

  // ACTIVE rules only — a deactivated rule's artifacts are settled/dead.
  const rulesR = await sb.from(PWP_RULES).select("*").eq("active", true);
  if (rulesR.error) return { status: "server_error", message: rulesR.error.message };
  const activeRules: PwpRule[] = ((rulesR.data ?? []) as DB.PwpRuleRow[]).map((r) =>
    Adapters.pwpRuleFromRow(r),
  );
  const activeById = new Map(activeRules.map((r) => [r.id, r] as const));
  const checked = activeRules.filter((r) => consumedByRule.has(r.id));
  if (checked.length === 0) return { status: "ok" };

  const skuRes = await resolveSkuInfo(sb, postEditLines.map((l) => l.sku));
  if (!skuRes.ok) return { status: "server_error", message: skuRes.message };

  // Sofa builds re-grouped from exploded rows (sweep verbatim).
  const buildGroups = new Map<
    string,
    { codes: string[]; modelId: string | null; isReward: boolean }
  >();
  for (const line of postEditLines) {
    const attrs = (line.attrs ?? {}) as Record<string, unknown>;
    const key = typeof attrs.sofa_build_key === "string" ? attrs.sofa_build_key : null;
    if (!key) continue;
    const g = buildGroups.get(key) ?? { codes: [], modelId: null, isReward: false };
    const mc = typeof attrs.module_code === "string" ? attrs.module_code.trim() : "";
    if (mc) g.codes.push(mc);
    g.modelId = g.modelId ?? skuRes.skuInfo.get(line.sku)?.modelId ?? null;
    if (attrs.pwp || attrs.free_item || attrs.free_gift) g.isReward = true;
    buildGroups.set(key, g);
  }
  let comboModulesById = new Map<string, string[][]>();
  if (buildGroups.size > 0) {
    const ids = new Set<string>();
    for (const rule of checked) {
      for (const t of rule.triggerTargets) {
        if (t.scope === "combo") for (const id of t.comboIds ?? []) ids.add(id);
      }
    }
    if (ids.size > 0) {
      const { data, error } = await sb
        .from(SOFA_COMBO_PRICING)
        .select("id, slots")
        .in("id", Array.from(ids));
      if (error) return { status: "server_error", message: error.message };
      comboModulesById = new Map(
        ((data ?? []) as Array<{ id: string; slots: string[][] | null }>).map((r) => [
          r.id,
          r.slots ?? [],
        ]),
      );
    }
  }

  // Entitled per checked rule over the post-edit cart (sweep math).
  const entitledUnitsByRule = new Map<string, number>();
  for (const line of postEditLines) {
    const attrs = (line.attrs ?? {}) as Record<string, unknown>;
    if (typeof attrs.sofa_build_key === "string" && attrs.sofa_build_key) continue; // builds counted below
    const rl = deriveRuleLine(skuRes.skuInfo.get(line.sku) ?? null);
    const isRewardLine = Boolean(attrs.pwp || attrs.free_item || attrs.free_gift);
    for (const rule of checked) {
      if (upper(rl.category) !== upper(rule.triggerCategory)) continue;
      if (!lineMatchesTargets(rl, rule.triggerTargets, comboModulesById)) continue;
      // Promo one-way parity: a reward line never opens a PROMO entitlement.
      if (!(rule.type === "promo" && isRewardLine)) {
        entitledUnitsByRule.set(
          rule.id,
          (entitledUnitsByRule.get(rule.id) ?? 0) + Math.max(0, line.qty),
        );
      }
    }
  }
  for (const rule of checked) {
    if (upper(rule.triggerCategory) !== "SOFA") continue;
    for (const g of buildGroups.values()) {
      if (g.isReward) continue;
      const rl: RuleLineInput = {
        category: "sofa",
        modelId: g.modelId,
        sizeCode: null,
        builtCompartments: g.codes,
      };
      if (lineMatchesTargets(rl, rule.triggerTargets, comboModulesById)) {
        entitledUnitsByRule.set(rule.id, (entitledUnitsByRule.get(rule.id) ?? 0) + 1);
      }
    }
  }

  for (const [ruleId, consumed] of consumedByRule) {
    const rule = activeById.get(ruleId);
    if (!rule) continue;
    const perTrigger = Math.max(1, Math.floor(rule.qtyPerTrigger || 1));
    const entitled = (entitledUnitsByRule.get(ruleId) ?? 0) * perTrigger;
    if (entitled < consumed) {
      return {
        status: "blocked",
        message:
          "This item backs a promo or printed voucher on this order — the new " +
          "configuration would no longer qualify for it. Cancel the promo with HQ " +
          "first, or keep a configuration that still qualifies.",
      };
    }
  }
  return { status: "ok" };
}
