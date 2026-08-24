import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SOFA_COMBO_PRICING,
  matchSofaCombo,
  resolvePwp,
  type PwpLineInput,
  type PwpRule as PwpRuleDomain,
  type PwpRuleEngine,
  type RuleLineInput,
} from "@carres/shared";

import type { RecomputableLine } from "./sofa-recompute";
import { readActivePwpRules, resolveSkuInfo, type SkuInfo } from "./rule-line-input";

/**
 * Order-path PWP / Promo claim gate (2990s Products parity Phase 8b, migration
 * 0186). STATELESS same-cart purchase-with-purchase + promo apply — the order
 * counterpart of P7's `validateFreeItemClaims`. A reward line the salesperson
 * toggled "use PWP price" carries `attrs.pwp = { ruleId }` (mirroring P7's
 * `attrs.free_item`). The server re-runs the SAME pure `resolvePwp` (from
 * @carres/shared, shipped in P8a) against the ACTIVE `pwp_rules` + the order's
 * lines, validates each claimed reward is genuinely granted (eligibility +
 * allowance), and FORCES that line's unitPrice to the server-authoritative
 * figure: the reward SKU's `product_skus.pwp_price` for a 'pwp' rule, or 0 for a
 * 'promo' rule. The marker is canonicalised to `{ ruleId, type, triggerRef }` —
 * the client price is NEVER trusted.
 *
 * Pipeline placement (orders.ts): runs IMMEDIATELY AFTER the free-item gate and
 * BEFORE the sofa recompute, so that (a) it rejects a sofa-build PWP claim
 * cleanly (a build line is recomputed under an ABSOLUTE drift gate — forcing its
 * price would 422 sofa_price_drift), and (b) the forced reward price is the
 * trusted base the downstream special-addon / delivery recomputes read.
 *
 * Anti-tamper (mirrors P7): the client's `attrs.pwp` body is STRIPPED and
 * rebuilt from scratch — only the `ruleId` signal is kept; any client-supplied
 * `price` / `grant` / `triggerRef` / `type` is discarded. The client only
 * signals WHICH lines requested PWP; the server decides eligibility + price.
 *
 * Reads `pwp_rules` + `product_skus.pwp_price` via the USER JWT (RLS) — never
 * service_role. `create_order` / `order_lines` / `DraftLine` / `cart.ts` stay
 * UNTOUCHED: a PWP/promo reward is an existing line whose price the server forces
 * + a marker on its `attrs` — both ride the existing payload.lines path. DORMANT
 * until the principal authors rules: no `attrs.pwp` marker → no claim → no DB
 * read → byte-identical orders.
 *
 * Scope (P8b v1, locked): grantable reward lines are NON-sofa-build flat real-SKU
 * lines only. A free-hand sofa-build LINE cannot be PWP-claimed (Hard rule #1 →
 * 409 pwp_not_eligible_sofa_build). The `sofa_combo_pricing.pwp_prices_by_height`
 * path stays DORMANT — a combo in the cart is already exploded into per-SKU
 * component lines (each priced via `product_skus.pwp_price`), so there is no
 * single combo "line" to claim. A combo-as-reward path is deferred
 * (CF `pwp-sofa-combo-reward-deferred`).
 *
 * Fails CLOSED on a catalog read error (`server_error` → 500); never silently
 * price a claimed reward.
 */

/** Typed reject reasons. The route maps every `bad_request` to 409. */
export type PwpRejectCode =
  /** a sofa-build claim that cannot be a combo reward (no combo targeting on
   *  the rule / build matches none of the reward combos / no PWP price at the
   *  build's seat height). Pre-0186-sofa-reward this covered EVERY build claim. */
  | "pwp_not_eligible_sofa_build"
  /** claim on a line that ALSO carries special add-ons (attrs.specials) — the
   *  PWP price is all-in; the downstream special-addon recompute would re-add the
   *  surcharge on top of the forced PWP base (or drift). Disallowed (mirrors the
   *  sofa-build guard); the POS hides the toggle for such a line. */
  | "pwp_not_eligible_specials"
  /** attrs.pwp.ruleId is not an ACTIVE pwp_rules row */
  | "pwp_unknown_rule"
  /** claimed but resolvePwp did not grant it (scope mismatch OR allowance
   *  exhausted OR a 'pwp' reward whose pwp_price is NULL OR granted by a rule
   *  other than the claimed one) */
  | "pwp_not_eligible"
  /** a reward line must be quantity 1 (2990s parity — one voucher funds one
   *  unit; qty>1 would milk a single grant for multiple units at PWP price) */
  | "pwp_reward_qty_not_one";

export type PwpRecomputeOutcome =
  | {
      status: "ok";
      lines: RecomputableLine[];
      /** 0186 sofa-as-reward — per LINE INDEX, the granted reward combo ids
       *  whose price maps the sofa recompute must swap for their PWP-merged
       *  maps (`pwpSwappedCombos`). Empty when no sofa claim. The sofa stage
       *  runs AFTER this stage on the SAME array, so indexes line up. */
      sofaRewardCombosByIndex: Record<number, string[]>;
    }
  | { status: "bad_request"; message: string; code: PwpRejectCode }
  | { status: "server_error"; message: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** True iff the line carries a (client) PWP marker. */
function hasPwp(attrs: Record<string, unknown> | null): boolean {
  return Boolean(attrs && attrs.pwp);
}

/** Strip the client `attrs.pwp` body WITHOUT mutating the input (it is re-derived
 *  from the validated rule). Returns the SAME reference when nothing changed (so
 *  plain lines stay byte-identical → DORMANT). */
function stripClientPwp(line: RecomputableLine): RecomputableLine {
  const attrs = line.attrs;
  if (!attrs || !("pwp" in attrs)) return line;
  const next: Record<string, unknown> = { ...attrs };
  delete next.pwp;
  return { ...line, attrs: next };
}

/* ─── per-line PwpLineInput derivation (mirrors free-gift's deriveLineInput) ─── */

/**
 * Flatten ONE order line to the matcher's core `RuleLineInput` ({ category,
 * modelId, sizeCode, builtCompartments }). PWP-grantable lines are flat real
 * SKUs (sofa builds are rejected before this runs), so the regular-line branch
 * covers every reward; a defensive sofa-build / exploded-compartment shape is
 * still flattened so a line acting purely as a TRIGGER (e.g. a sofa trigger
 * unlocking a flat accessory reward) populates `resolvePwp`'s slots correctly.
 */
function deriveRuleLine(line: RecomputableLine, skuInfo: Map<string, SkuInfo>): RuleLineInput {
  const attrs = (line.attrs ?? {}) as Record<string, unknown>;
  const info = skuInfo.get(line.sku) ?? null;

  // Defensive: an un-exploded sofa build line carries its full descriptor.
  const sofaBuild = attrs.sofa_build as { cells?: Array<{ moduleCode?: unknown }> } | undefined;
  if (sofaBuild && Array.isArray(sofaBuild.cells)) {
    return {
      category: info?.category || "sofa",
      modelId: info?.modelId ?? null,
      sizeCode: null,
      builtCompartments: sofaBuild.cells
        .map((c) => String(c?.moduleCode ?? "").trim())
        .filter(Boolean),
    };
  }

  // Exploded compartment line → one cell.
  const buildKey = typeof attrs.sofa_build_key === "string" ? attrs.sofa_build_key : "";
  const moduleCode = typeof attrs.module_code === "string" ? attrs.module_code.trim() : "";
  if (buildKey) {
    return {
      category: info?.category || "sofa",
      modelId: info?.modelId ?? null,
      sizeCode: null,
      builtCompartments: moduleCode ? [moduleCode] : [],
    };
  }

  // Regular flat line — resolve from the sku map.
  const category = info?.category ?? "";
  const isSofa = category.toLowerCase() === "sofa";
  return {
    category,
    modelId: info?.modelId ?? null,
    sizeCode: !isSofa && info?.variant ? info.variant.toUpperCase() : null,
    builtCompartments: [],
  };
}

/* ─── combo→slots map (combo-scope trigger/reward refinements only) ──────────── */

/** Load the combo id → ordered OR-set slots map for any combo-scope trigger or
 *  reward target, via RLS — PLUS (0186 sofa-as-reward) each combo's
 *  `pwp_prices_by_height` so a sofa claim can assert a PWP price exists at the
 *  build's seat height BEFORE consuming the voucher. Empty maps when none
 *  referenced; null on a read error (fail-closed). */
async function loadComboSlots(
  sb: SupabaseClient,
  comboIds: Set<string>,
): Promise<{
  slots: Map<string, string[][]>;
  pwpByComboId: Map<string, Record<string, number | null> | null>;
} | null> {
  const slots = new Map<string, string[][]>();
  const pwpByComboId = new Map<string, Record<string, number | null> | null>();
  if (comboIds.size === 0) return { slots, pwpByComboId };
  const { data, error } = await sb
    .from(SOFA_COMBO_PRICING)
    .select("id, slots, pwp_prices_by_height")
    .in("id", Array.from(comboIds));
  if (error) return null;
  for (const row of (data ?? []) as Array<{
    id: string;
    slots: string[][] | null;
    pwp_prices_by_height: Record<string, number | string | null> | null;
  }>) {
    slots.set(row.id, row.slots ?? []);
    if (row.pwp_prices_by_height == null) {
      pwpByComboId.set(row.id, null);
    } else {
      const m: Record<string, number | null> = {};
      for (const [h, v] of Object.entries(row.pwp_prices_by_height)) {
        m[h] = v == null ? null : Number(v);
      }
      pwpByComboId.set(row.id, m);
    }
  }
  return { slots, pwpByComboId };
}

/** The pure engine subset (`PwpRuleEngine`) the matcher consumes. */
function toEngineRule(r: PwpRuleDomain): PwpRuleEngine {
  return {
    type: r.type,
    triggerCategory: r.triggerCategory,
    triggerTargets: r.triggerTargets,
    rewardCategory: r.rewardCategory,
    rewardTargets: r.rewardTargets,
    qtyPerTrigger: r.qtyPerTrigger,
  };
}

/**
 * Validate the PWP/promo claims on the incoming lines + force the reward price.
 * Runs on the (free-gift-stripped) parsed lines, BEFORE the sofa recompute. A
 * line with no `attrs.pwp` marker passes through byte-identical. A claimed line
 * is re-validated against ACTIVE rules; granted → unitPrice forced to the reward
 * `pwp_price` (or 0 for promo) + the marker canonicalised to
 * `{ ruleId, type, triggerRef }`; ineligible / over-allowance / sofa-build /
 * unknown-rule → a typed `bad_request` (the route → 409).
 */
export async function recomputePwpLines(
  sb: SupabaseClient,
  lines: RecomputableLine[],
): Promise<PwpRecomputeOutcome> {
  // 0. Collect claims. A sofa-build claim is rejected outright (Hard rule #1).
  //    P8c (0187): ALSO capture `code` + `claimGroup` from the ORIGINAL client
  //    `attrs.pwp` here (an index-keyed capture, NOT a spread of the stripped
  //    attrs — `stripClientPwp` deletes the whole `pwp` object including these
  //    two). They are re-emitted on the canonical marker at the rebuild below so
  //    Stage B (`claimPwpCodesForLines`) can read `attrs.pwp.code` after pricing.
  const claims: Array<{
    index: number;
    ruleId: string;
    code: string;
    claimGroup: string;
    crossOrder: boolean;
    /** 0186 sofa-as-reward — set when the claimed line is a sofa build: the
     *  built module codes + the chosen seat height. Its price is NOT forced
     *  here; instead the sofa recompute swaps the granted reward combos'
     *  price maps (the 2990s pattern — keeps the drift gate honest). */
    sofaBuild: { builtCodes: string[]; height: string } | null;
  }> = [];
  for (let i = 0; i < lines.length; i++) {
    const attrs = lines[i]!.attrs as Record<string, unknown> | null;
    if (!hasPwp(attrs)) continue;
    // 0186 sofa-as-reward — a build claim is allowed; capture its built codes +
    // height for the combo-match/price checks below. (Pre-sofa-reward this was
    // Hard rule #1's outright reject.)
    let sofaBuild: { builtCodes: string[]; height: string } | null = null;
    const rawBuild = attrs?.sofa_build as
      | { cells?: Array<{ moduleCode?: unknown }>; height?: unknown }
      | undefined;
    if (rawBuild && Array.isArray(rawBuild.cells)) {
      const builtCodes = rawBuild.cells
        .map((c) => String(c?.moduleCode ?? "").trim())
        .filter(Boolean);
      const height = typeof rawBuild.height === "string" ? rawBuild.height : "";
      if (builtCodes.length === 0 || !height) {
        return {
          status: "bad_request",
          code: "pwp_not_eligible_sofa_build",
          message: "This sofa build is malformed and cannot be a PWP/promo reward.",
        };
      }
      sofaBuild = { builtCodes, height };
    }
    // A line carrying special add-ons cannot be a PWP/promo reward: the forced PWP
    // price is all-in, but the downstream special-addon recompute (which runs after
    // this stage) would re-resolve the surcharge and either re-add it on top of the
    // forced PWP base or 422 special_price_drift — neither matching the POS preview.
    // Reject cleanly (mirrors the sofa-build guard); the POS hides the toggle.
    const specials = (attrs as { specials?: unknown } | null)?.specials;
    if (Array.isArray(specials) && specials.length > 0) {
      return {
        status: "bad_request",
        code: "pwp_not_eligible_specials",
        message:
          "A line with special add-ons cannot be made a PWP/promo reward — remove the add-ons first.",
      };
    }
    // 2990s parity: a PWP/promo reward line must be quantity 1 — one voucher
    // funds exactly one unit. Without this, a tampered qty=2 line gets two
    // units at the PWP price off a single grant (2990s rejects at confirm).
    if (Number(lines[i]!.qty ?? 1) !== 1) {
      return {
        status: "bad_request",
        code: "pwp_reward_qty_not_one",
        message: "A PWP/promo reward line must be quantity 1.",
      };
    }
    const pwp = (attrs as { pwp?: { ruleId?: unknown; code?: unknown; claimGroup?: unknown; crossOrder?: unknown } } | null)?.pwp;
    const ruleId = typeof pwp?.ruleId === "string" ? pwp.ruleId.trim() : "";
    if (!ruleId) {
      return { status: "bad_request", code: "pwp_unknown_rule", message: "PWP claim is missing a rule id" };
    }
    // P8c carry-through (§3.4): capture the bound voucher code + the per-submit
    // claimGroup from the ORIGINAL line. Empty when absent (DORMANT / P8b-only).
    // P8d (§4.2): ALSO carry `crossOrder` — when true the bound code is an AVAILABLE
    // carry-forward voucher claimed via pwp_claim_available_code (phone-bound), not
    // a same-cart RESERVED code. Without surviving the recompute the cross-order
    // branch in Stage B is dead.
    const code = typeof pwp?.code === "string" ? pwp.code.trim() : "";
    const claimGroup = typeof pwp?.claimGroup === "string" ? pwp.claimGroup.trim() : "";
    const crossOrder = pwp?.crossOrder === true;
    claims.push({ index: i, ruleId, code, claimGroup, crossOrder, sofaBuild });
  }

  // 1. Strip every client pwp marker first (re-derived below). Plain lines keep
  //    their identity (DORMANT byte-identical). NO DB read on the no-claim path.
  const stripped = lines.map(stripClientPwp);
  if (claims.length === 0) return { status: "ok", lines: stripped, sofaRewardCombosByIndex: {} };

  const claimIndexSet = new Set(claims.map((c) => c.index));

  // 2. ACTIVE rules (the adapter runs parseRuleTargets). RLS — never service_role.
  //    Read through the ONE ordered door: `resolvePwp` is greedy, so the order
  //    decides which rule pays for a line and therefore what it costs.
  const rulesR = await readActivePwpRules(sb);
  if (!rulesR.ok) return { status: "server_error", message: rulesR.message };
  const domainRules: PwpRuleDomain[] = rulesR.rules;
  const rulesById = new Map(domainRules.map((r) => [r.id, r] as const));

  // 3. Unknown / inactive rule — a claimed ruleId not in the active set rejects.
  for (const claim of claims) {
    if (!rulesById.has(claim.ruleId)) {
      return { status: "bad_request", code: "pwp_unknown_rule", message: "The claimed PWP rule is not active." };
    }
  }

  // 4. Resolve EVERY line's { modelId, category, variant } — triggers are OTHER
  //    lines in the cart, so the whole cart must be classified, not just claims.
  const skuRes = await resolveSkuInfo(sb, lines.map((l) => l.sku));
  if (!skuRes.ok) return { status: "server_error", message: skuRes.message };

  // 5. Combo slots for any combo-scope trigger/reward target.
  const comboIds = new Set<string>();
  for (const r of domainRules) {
    for (const t of r.triggerTargets) if (t.scope === "combo") for (const id of t.comboIds ?? []) comboIds.add(id);
    for (const t of r.rewardTargets) if (t.scope === "combo") for (const id of t.comboIds ?? []) comboIds.add(id);
  }
  const comboData = await loadComboSlots(sb, comboIds);
  if (comboData === null) {
    return { status: "server_error", message: "Failed to load sofa combos for PWP rule matching" };
  }
  const comboModulesById = comboData.slots;
  const pwpByComboId = comboData.pwpByComboId;

  // 6. Build the engine input. ONLY claimed lines request PWP; a line that is
  //    itself a reward (claimed, or already free via free_item/free_gift) is
  //    flagged isReward so a promo rule never lets it fund itself (one-way).
  const pwpLineInputs: PwpLineInput[] = lines.map((line, i) => {
    const rl = deriveRuleLine(line, skuRes.skuInfo);
    const attrs = (line.attrs ?? {}) as Record<string, unknown>;
    return {
      ...rl,
      idx: i,
      qty: Number(line.qty ?? 1),
      productName: typeof attrs.label === "string" ? attrs.label : line.sku,
      productCode: line.sku,
      pwpRequested: claimIndexSet.has(i),
      isReward: claimIndexSet.has(i) || Boolean(attrs.free_item) || Boolean(attrs.free_gift),
    };
  });

  // 7. The SAME pure resolver the POS preview ran (honest-pricing).
  const engineRules = domainRules.map(toEngineRule);
  const grants = resolvePwp(engineRules, pwpLineInputs, comboModulesById);
  const grantByIdx = new Map(grants.map((g) => [g.idx, g] as const));

  // 8. Validate EVERY claim was granted — AND granted BY THE CLAIMED RULE itself
  //    (with that rule's own trigger allowance), not merely by some active rule
  //    whose reward scope happens to cover the line. resolvePwp greedily binds a
  //    line to the first covering rule with spare allowance and stamps the
  //    granting rule's index on the grant; we assert that rule is the claimed one,
  //    else the forced PRICE could diverge from the POS preview (which resolves
  //    each rule in isolation). Not granted (ineligible / over-allowance) OR bound
  //    to a different rule → 409.
  // Sofa claims price via the combo swap (below) — only FLAT claims read the
  // per-SKU pwp_price.
  const claimSkus = claims.filter((c) => !c.sofaBuild).map((c) => lines[c.index]!.sku);
  const priceR =
    claimSkus.length === 0
      ? { data: [], error: null }
      : await sb.from("product_skus").select("sku, pwp_price").in("sku", claimSkus);
  if (priceR.error) return { status: "server_error", message: priceR.error.message };
  const pwpPriceBySku = new Map<string, number | null>();
  for (const row of (priceR.data ?? []) as Array<{ sku?: string; pwp_price?: number | string | null }>) {
    if (!row.sku) continue;
    pwpPriceBySku.set(row.sku, row.pwp_price == null ? null : Number(row.pwp_price));
  }

  const out = [...stripped];
  const sofaRewardCombosByIndex: Record<number, string[]> = {};
  for (const claim of claims) {
    const grant = grantByIdx.get(claim.index);
    if (!grant) {
      return {
        status: "bad_request",
        code: "pwp_not_eligible",
        message:
          "This line is not eligible for the claimed PWP/promo offer, or the offer allowance is exhausted.",
      };
    }
    const rule = rulesById.get(claim.ruleId)!;
    // Wrong-rule binding gate: the line must have been granted BY THE CLAIMED RULE
    // with that rule's OWN trigger allowance — not merely by some active rule whose
    // reward scope happens to cover it. `resolvePwp` greedily binds a line to the
    // first covering rule with spare allowance and now stamps the granting rule on
    // the grant; `engineRules` is built from `domainRules` in order, so the granting
    // rule is `domainRules[grant.ruleIndex]`. If that is NOT the claimed rule, a
    // forged claim is trying to ride a DIFFERENT (overlapping) rule's allowance and
    // force the claimed rule's price (e.g. claim a promo rule whose trigger was
    // never bought while a pwp rule actually granted the line) → reject. This is
    // exactly the per-rule isolation the POS `coveringPwpForLine` enforces.
    const grantingRule = domainRules[grant.ruleIndex];
    if (!grantingRule || grantingRule.id !== claim.ruleId) {
      return {
        status: "bad_request",
        code: "pwp_not_eligible",
        message:
          "This line is not eligible for the claimed PWP/promo offer, or the offer allowance is exhausted.",
      };
    }

    // The canonical marker every claimed line is rebuilt with (P8b/P8c/P8d).
    const canonicalMarker = {
      ruleId: rule.id,
      type: rule.type,
      triggerRef: grant.triggerRef ?? null,
      // P8c carry-through (§3.4): re-emit the bound voucher code + per-submit
      // claimGroup captured from the original line. OMIT a key when empty so a
      // no-voucher (P8b-only) claim rebuilds a marker WITHOUT `code`/`claimGroup`
      // — byte-identical to pre-P8c. Stage B reads `attrs.pwp.code` to claim.
      ...(claim.code ? { code: claim.code } : {}),
      ...(claim.claimGroup ? { claimGroup: claim.claimGroup } : {}),
      // P8d (§4.2): re-emit `crossOrder` ONLY when true — a same-cart marker
      // omits the key entirely (byte-identical to a P8c marker). Stage B reads
      // this to route the claim to pwp_claim_available_code (phone-bound).
      ...(claim.crossOrder ? { crossOrder: true } : {}),
    };
    const base = stripped[claim.index]!;

    // 0186 sofa-as-reward — a build claim is NOT price-forced here (the sofa
    // recompute's drift gate owns build pricing). Instead: the rule must target
    // reward COMBOS, the build must match ≥1 of them, and at least one matched
    // combo must carry a PWP price (> 0) at the build's seat height. The
    // matched ids feed the sofa recompute's snapshot swap (2990s pattern).
    if (claim.sofaBuild) {
      const rewardComboIds = rule.rewardTargets.flatMap((t) =>
        t.scope === "combo" ? (t.comboIds ?? []) : [],
      );
      if (rewardComboIds.length === 0) {
        return {
          status: "bad_request",
          code: "pwp_not_eligible_sofa_build",
          message:
            "A sofa reward must be targeted by combo — this rule has no reward combos.",
        };
      }
      const matched = rewardComboIds.filter((id) => {
        const slots = comboModulesById.get(id);
        return !!slots && matchSofaCombo(claim.sofaBuild!.builtCodes, slots) !== null;
      });
      if (matched.length === 0) {
        return {
          status: "bad_request",
          code: "pwp_not_eligible_sofa_build",
          message: "This sofa build doesn't match any of the offer's reward combos.",
        };
      }
      const anyPriced = matched.some((id) => {
        const p = pwpByComboId.get(id)?.[claim.sofaBuild!.height];
        return typeof p === "number" && p > 0;
      });
      if (!anyPriced) {
        return {
          status: "bad_request",
          code: "pwp_not_eligible_sofa_build",
          message:
            "No PWP price is configured for this sofa at the chosen seat height (set it on the combo).",
        };
      }
      sofaRewardCombosByIndex[claim.index] = matched;
      out[claim.index] = {
        ...base,
        attrs: {
          ...((base.attrs as Record<string, unknown>) ?? {}),
          pwp: canonicalMarker,
        },
      };
      continue;
    }

    // Force the price: pwp_price for 'pwp', 0 for 'promo'.
    let forced: number;
    if (rule.type === "promo") {
      forced = 0;
    } else {
      const p = pwpPriceBySku.get(lines[claim.index]!.sku);
      // 2990s parity: pwp_price = 0 means "not set" for a 'pwp' rule (only a
      // 'promo' may redeem free). Reject <= 0, not just NULL.
      if (p == null || p <= 0) {
        return {
          status: "bad_request",
          code: "pwp_not_eligible",
          message: "No PWP price is configured for this reward (set it in SKU Master).",
        };
      }
      forced = p;
    }

    out[claim.index] = {
      ...base,
      unitPrice: round2(forced),
      attrs: {
        ...((base.attrs as Record<string, unknown>) ?? {}),
        pwp: canonicalMarker,
      },
    };
  }

  return { status: "ok", lines: out, sofaRewardCombosByIndex };
}
