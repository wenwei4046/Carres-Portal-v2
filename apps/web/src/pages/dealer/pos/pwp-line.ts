// ----------------------------------------------------------------------------
// POS purchase-with-purchase (PWP / 换购) + promo (买X送X) preview helpers
// (2990s Products parity Phase 8b, migration 0186). PURE — no React, no IO — so
// they unit-test cleanly and the POS preview reuses the SAME shared `resolvePwp`
// the Hono server runs at order create (honest-pricing: the two NEVER drift).
//
//   • coveringPwpForLine — the ACTIVE pwp_rules under which THIS cart line WOULD
//     be granted the reward price right now (a qualifying TRIGGER is in the cart
//     with spare allowance + the line's category/targets match the reward scope).
//     Runs the shared `resolvePwp` over the WHOLE cart with this one line
//     requesting, so the affordance never offers a claim the server would 409.
//   • pwpRewardPrice — the previewed reward price: the sku's `pwp_price` for a
//     'pwp' rule, 0 for a 'promo' rule. The IDENTICAL value the server forces, so
//     the cart total matches the booked total. null = no PWP price set (the rule
//     is dropped from the offer — the server would 409 such a claim).
//   • markLinePwp / unmarkLinePwp — toggle a line's `attrs.pwp` marker. The
//     marker carries ONLY `{ ruleId }` (mirroring P7's `attrs.free_item`); the
//     server re-derives `type` + `triggerRef` + re-validates the claim + forces
//     the price regardless — the client price is NEVER trusted. A claimed line's
//     preview unitPrice is forced to the reward price, its real price parked in
//     the transient `origUnitPrice` (dropped at submit).
//
// Hard rule #1 (server-mirrored): a free-hand sofa-BUILD line (attrs.sofa_build)
// is NEVER offered a PWP toggle — `toFreeGiftLineInput`-derived sofa builds are
// recomputed downstream under an ABSOLUTE drift gate, so the server rejects such
// a claim with 409 `pwp_not_eligible_sofa_build`. `coveringPwpForLine` returns []
// for a build line.
// ----------------------------------------------------------------------------
import type {
  CatalogResponse,
  FabricTier,
  PwpDiscoverDto,
  PwpRuleDto,
  PwpRuleEngine,
  PwpLineInput,
  SofaBuild,
  SofaPricingSnapshot,
} from "@carres/shared";
import {
  computeSofaPrice,
  lineMatchesTargets,
  matchSofaCombo,
  pwpSwappedCombos,
  resolvePwp,
  voucherCoversLine,
} from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import { toFreeGiftLineInput } from "./free-line";

/** Build the comboId → ordered OR-set slots map (for combo-scope trigger/reward
 *  refinements). Empty when the bundle carries no sofa combos. */
function comboModulesMap(catalog: CatalogResponse): Map<string, string[][]> {
  const map = new Map<string, string[][]>();
  for (const c of catalog.sofaCombos ?? []) map.set(c.id, c.slots ?? []);
  return map;
}

/** The pure engine subset (`PwpRuleEngine`) the matcher consumes — drop the
 *  catalog DTO's `id` / `active`. */
function toEngineRule(r: PwpRuleDto): PwpRuleEngine {
  return {
    type: r.type,
    triggerCategory: r.triggerCategory,
    triggerTargets: r.triggerTargets,
    rewardCategory: r.rewardCategory,
    rewardTargets: r.rewardTargets,
    qtyPerTrigger: r.qtyPerTrigger,
  };
}

/** Build a cart line → `PwpLineInput` for the shared resolver. Reuses
 *  `toFreeGiftLineInput` (the SAME per-line classification the free-gift preview
 *  + the server's `deriveRuleLine` use) so the POS and the server resolve a line
 *  IDENTICALLY, then adds the PWP-only fields (idx / qty / pwpRequested / isReward).
 *  A line that is itself a reward (already free under free_item/free_gift, or the
 *  one requesting PWP now) is flagged `isReward` so a promo rule never lets it
 *  fund itself (one-way). */
function toPwpLineInput(
  line: DraftLine,
  catalog: CatalogResponse,
  idx: number,
  pwpRequested: boolean,
): PwpLineInput {
  const li = toFreeGiftLineInput(line, catalog);
  const attrs = (line.attrs ?? {}) as Record<string, unknown>;
  return {
    category: li.category,
    modelId: li.modelId,
    sizeCode: li.sizeCode,
    builtCompartments: li.builtCompartments,
    idx,
    qty: Number(line.qty ?? 1),
    productName: line.label,
    productCode: line.sku,
    pwpRequested,
    isReward: pwpRequested || Boolean(attrs.free_item) || Boolean(attrs.free_gift),
  };
}

/** The ACTIVE PWP rules in the bundle (the catalog DTO is already camelCase). */
function activePwpRules(catalog: CatalogResponse): PwpRuleDto[] {
  return (catalog.pwpRules ?? []).filter((r) => r.active);
}

/**
 * The ACTIVE pwp_rules under which `line` WOULD be granted the reward price right
 * now — i.e. running the shared `resolvePwp` over the CURRENT cart (this line
 * requesting, the rest as-is) grants this line. Returns `[]` when nothing is
 * configured (DORMANT), when the line is a sofa-build line (Hard rule #1), when no
 * qualifying trigger is present, when allowance is exhausted, or when the rule has
 * no usable reward price (a 'pwp' rule whose sku `pwpPrice` is null). The order
 * mirrors the server's grant order, so the toggle never offers a claim the server
 * would 409.
 */
export function coveringPwpForLine(
  line: DraftLine,
  allLines: DraftLine[],
  catalog: CatalogResponse,
): PwpRuleDto[] {
  const lineAttrs = line.attrs as Record<string, unknown> | null;
  // 0186 sofa-as-reward — a build line IS offerable, priced via the reward
  // combo's pwpPricesByHeight swap (sofaPwpRewardPrice); the old Hard rule #1
  // outright-reject is gone.
  const isBuild = Boolean(lineAttrs?.sofa_build);
  // A line carrying special add-ons can't be a PWP reward — the PWP price is
  // all-in and the server's special-addon recompute would re-add the surcharge.
  // Never offer the toggle (the server 409s pwp_not_eligible_specials).
  if (Array.isArray(lineAttrs?.specials) && lineAttrs.specials.length > 0) return [];

  const rules = activePwpRules(catalog);
  if (rules.length === 0) return [];

  const targetIdx = allLines.findIndex((l) => l.localId === line.localId);
  if (targetIdx < 0) return [];

  const comboModulesById = comboModulesMap(catalog);
  const covering: PwpRuleDto[] = [];

  // Test each rule in isolation: does resolvePwp grant THIS line under just this
  // rule? A line ALREADY PWP-claimed (carries `attrs.pwp`) is treated as
  // requesting too, so it consumes its allowance in the resolve — the target line
  // only gets the toggle if it can claim the REMAINING allowance (mirrors the
  // server, which resolves every claim together). Per-rule isolation lets the
  // cart label each offering rule on the toggle.
  for (const rule of rules) {
    // A 'pwp' rule with no usable reward price for this sku is not offerable (the
    // server would 409 it). 'promo' is always free (0), no price needed — EXCEPT
    // a sofa build, whose reward price ALWAYS comes from the combo PWP map (both
    // kinds): no matched-and-priced combo → not offerable.
    if ((rule.type === "pwp" || isBuild) && pwpRewardPrice(line, catalog, rule) == null) continue;

    const inputs: PwpLineInput[] = allLines.map((l, i) =>
      toPwpLineInput(l, catalog, i, i === targetIdx || isLinePwp(l)),
    );
    const grants = resolvePwp([toEngineRule(rule)], inputs, comboModulesById);
    if (grants.some((g) => g.idx === targetIdx)) covering.push(rule);
  }

  return covering;
}

/**
 * The previewed reward price for `line` under `rule`: the sku's `pwpPrice` for a
 * 'pwp' rule, 0 for a 'promo' rule — and for a SOFA BUILD line (0186), the
 * build's total recomputed against the PWP-swapped combo maps (both kinds).
 * Returns `null` when not offerable ('pwp' sku with no pwpPrice; a build that
 * matches no reward combo / has no PWP price at its seat height). This is the
 * IDENTICAL figure the server produces — honest-pricing.
 */
export function pwpRewardPrice(
  line: DraftLine,
  catalog: CatalogResponse,
  rule: PwpRuleDto,
): number | null {
  if ((line.attrs as Record<string, unknown> | null)?.sofa_build) {
    return sofaPwpRewardPrice(line, catalog, rule);
  }
  if (rule.type === "promo") return 0;
  const skuRow = catalog.skus.find((s) => s.sku === line.sku) ?? null;
  const p = skuRow?.pwpPrice;
  // ⭐ A STORED 0 IS "NOT SET", NEVER "FREE" — and this line is the client half
  // of a rule the server already states: `p == null || p <= 0` is rejected at
  // Confirm (`pwp-recompute.ts`, "2990s parity: pwp_price = 0 means not set for
  // a 'pwp' rule"). Only a 'promo' rule redeems free, and it returns above
  // without ever reading pwpPrice — so 0 has no meaning here at all.
  //
  // Reading it as a price previewed "RM 0.00" on the chip, let the dealer build
  // the entire order on it, and lost the lot to a 409 at Confirm naming SKU
  // Master, a screen a dealer cannot open. Honest-pricing means this function
  // and the server answer identically or the chip must not appear.
  return typeof p === "number" && p > 0 ? p : null;
}

/** Reconstruct the pure `SofaBuild` a build line carries (null = not a build /
 *  malformed / unknown rep sku). Mirrors the server's re-parse. */
function sofaBuildFromLine(line: DraftLine, catalog: CatalogResponse): SofaBuild | null {
  const attrs = line.attrs as Record<string, unknown> | null;
  const sb = attrs?.sofa_build as
    | { cells?: Array<{ moduleCode?: unknown; x?: number | null; y?: number | null; rot?: number | null }>; height?: unknown }
    | undefined;
  if (!sb || !Array.isArray(sb.cells) || sb.cells.length === 0 || typeof sb.height !== "string") {
    return null;
  }
  const skuRow = catalog.skus.find((s) => s.sku === line.sku);
  if (!skuRow) return null;
  return {
    modelId: skuRow.modelId,
    cells: sb.cells.map((c) => ({
      moduleCode: String(c?.moduleCode ?? "").trim(),
      x: c?.x ?? null,
      y: c?.y ?? null,
      rot: c?.rot ?? null,
    })),
    fabricTier: (attrs?.fabric_tier as FabricTier | null | undefined) ?? null,
    height: sb.height,
    legHeight: (attrs?.leg_height as string | null | undefined) ?? null,
  };
}

/** The pricing snapshot for one model, assembled from the catalog bundle — the
 *  SAME sources SofaBuildCanvas previews with, so this figure re-derives the
 *  line's original total when no swap applies. */
function sofaSnapshotFromCatalog(catalog: CatalogResponse, modelId: string): SofaPricingSnapshot {
  return {
    compartmentPool: catalog.sofaCompartments ?? [],
    modelCompartments: (catalog.modelSofaCompartments ?? []).filter((mc) => mc.modelId === modelId),
    sofaCombos: (catalog.sofaCombos ?? []).filter((c) => c.modelId === modelId),
    fabricTierOverride:
      (catalog.modelFabricTierOverrides ?? []).find((o) => o.modelId === modelId) ?? null,
    fabricTierConfig: catalog.fabricTierConfig ?? null,
    legHeightPool: (catalog.optionPools ?? [])
      .filter((p) => p.pool === "sofa_leg_height")
      .map((p) => ({ value: p.value, surcharge: p.surcharge, active: p.active })),
  };
}

/**
 * 0186 sofa-as-reward — the previewed reward TOTAL for a sofa build line under
 * `rule`: eligibility mirrors the server (rule targets reward COMBOS; the build
 * matches ≥1; a matched combo carries a PWP price > 0 at the build's height),
 * then the SAME `computeSofaPrice` runs over the PWP-swapped snapshot. `null`
 * = not offerable (the server would 409 pwp_not_eligible_sofa_build).
 */
export function sofaPwpRewardPrice(
  line: DraftLine,
  catalog: CatalogResponse,
  rule: PwpRuleDto,
): number | null {
  const build = sofaBuildFromLine(line, catalog);
  if (!build) return null;
  const rewardComboIds = rule.rewardTargets.flatMap((t) =>
    t.scope === "combo" ? (t.comboIds ?? []) : [],
  );
  if (rewardComboIds.length === 0) return null;
  const combosById = new Map((catalog.sofaCombos ?? []).map((c) => [c.id, c] as const));
  const builtCodes = build.cells.map((c) => c.moduleCode);
  const matched = rewardComboIds.filter((id) => {
    const c = combosById.get(id);
    return !!c && matchSofaCombo(builtCodes, c.slots ?? []) !== null;
  });
  if (matched.length === 0) return null;
  const anyPriced = matched.some((id) => {
    const p = combosById.get(id)?.pwpPricesByHeight?.[build.height];
    return typeof p === "number" && p > 0;
  });
  if (!anyPriced) return null;
  const snapshot = sofaSnapshotFromCatalog(catalog, build.modelId);
  const swapped: SofaPricingSnapshot = {
    ...snapshot,
    sofaCombos: pwpSwappedCombos(snapshot.sofaCombos, new Set(matched)),
  };
  return computeSofaPrice(build, swapped).total;
}

/** The rule id a line is claimed PWP under, or null. */
export function linePwpRuleId(line: DraftLine): string | null {
  const pwp = (line.attrs as Record<string, unknown> | null)?.pwp as
    | { ruleId?: unknown }
    | undefined;
  return typeof pwp?.ruleId === "string" ? pwp.ruleId : null;
}

/** True when the line is currently claimed under a PWP/promo rule. */
export function isLinePwp(line: DraftLine): boolean {
  return linePwpRuleId(line) !== null;
}

/**
 * Mark a cart line as a PWP/promo reward under `rule`: stamp `attrs.pwp` and force
 * the preview unitPrice to `price` (the sku's pwpPrice, or 0 for promo), parking
 * the real price in the transient `origUnitPrice` (dropped at submit — DealerPos
 * sends only sku/qty/attrs/unitPrice). The marker carries ONLY `{ ruleId }`; the
 * server re-derives `type` + `triggerRef` + re-validates the claim + forces the
 * price regardless (the client price is never trusted).
 */
export function markLinePwp(line: DraftLine, rule: PwpRuleDto, price: number): DraftLine {
  const orig = typeof line.origUnitPrice === "number" ? line.origUnitPrice : line.unitPrice;
  return {
    ...line,
    unitPrice: price,
    origUnitPrice: orig,
    attrs: {
      ...((line.attrs as Record<string, unknown> | null) ?? {}),
      pwp: { ruleId: rule.id },
    },
  };
}

/** Revert a PWP-claimed line to its real price + strip the `attrs.pwp` marker. */
export function unmarkLinePwp(line: DraftLine): DraftLine {
  const orig = typeof line.origUnitPrice === "number" ? line.origUnitPrice : line.unitPrice;
  const attrs = { ...((line.attrs as Record<string, unknown> | null) ?? {}) };
  delete attrs.pwp;
  // Drop the transient origUnitPrice so a reverted line is byte-identical again.
  const { origUnitPrice: _drop, ...rest } = line;
  void _drop;
  return {
    ...rest,
    unitPrice: orig,
    attrs: Object.keys(attrs).length ? attrs : null,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// P8c (migration 0187) — the voucher STATE MACHINE POS layer. The reserve
// reconciler (DealerPos) calls /pwp-codes/reserve when a TRIGGER line is added /
// qty-changed and /pwp-codes/reserve DELETE when one is removed; the Auto-Fill
// rail (CartDrawer) binds a RESERVED code onto a reward line's attrs.pwp so the
// order route's Stage B can claim it (RESERVED→USED). P8b stays the PRICING
// authority (markLinePwp forces the price); P8c only adds the code + claimGroup
// lineage/lock fields onto the SAME attrs.pwp marker.
// ────────────────────────────────────────────────────────────────────────────

/** A trigger line currently in the cart — a line whose sku matches an ACTIVE
 *  pwp_rule's TRIGGER scope (category + RuleTarget). The reconciler reserves one
 *  code per unlocked reward slot for these (the server route is authoritative for
 *  the actual count = qtyPerTrigger × qty; here we only need the KEY + sku + qty
 *  to drive the reserve/free calls). */
export interface PwpTriggerLine {
  /** The line's stable cart key (DraftLine.localId) — the reserve idempotency +
   *  delete-on-remove key (= pwp_codes.cart_line_key). */
  cartLineKey: string;
  sku: string;
  qty: number;
  /** True when the line is itself a reward (attrs.pwp / free_item / free_gift).
   *  The reserve route skips PROMO rules for such a line (2990s one-way parity);
   *  PWP rules still reserve — chaining is intentional. */
  rewardLine: boolean;
  /** A sofa build's module codes (combo-scope trigger matching); absent for flat lines. */
  builtCompartments?: string[];
}

/**
 * The set of TRIGGER lines in the cart — lines whose sku matches an ACTIVE
 * pwp_rule's trigger scope (UPPERCASED category match AND `lineMatchesTargets`
 * over the rule's `triggerTargets`). Mirrors the server reserve route's matcher
 * (`apps/api/src/routes/pwp-codes.ts` step 3) so the POS reconciler and the
 * server agree on which lines own a reservation. Returns `[]` when nothing is
 * configured (DORMANT) — the reconciler then never calls reserve. A line that is
 * itself a reward (attrs.pwp / free_item / free_gift) is still a PWP trigger
 * (chainable) but is flagged `rewardLine` so the reserve route skips PROMO rules
 * for it — the 2990s one-way rule (a free reward must never mint a promo voucher
 * that funds the next free reward).
 */
export function triggerLinesInCart(
  lines: DraftLine[],
  catalog: CatalogResponse,
): PwpTriggerLine[] {
  const rules = activePwpRules(catalog);
  if (rules.length === 0) return [];
  const comboModulesById = comboModulesMap(catalog);
  const out: PwpTriggerLine[] = [];
  for (const line of lines) {
    const li = toFreeGiftLineInput(line, catalog);
    const ruleLine = {
      category: li.category,
      modelId: li.modelId,
      sizeCode: li.sizeCode,
      builtCompartments: li.builtCompartments,
    };
    const isTrigger = rules.some(
      (r) =>
        String(ruleLine.category ?? "").toUpperCase() === String(r.triggerCategory ?? "").toUpperCase() &&
        lineMatchesTargets(ruleLine, r.triggerTargets, comboModulesById),
    );
    if (isTrigger) {
      const attrs = (line.attrs ?? {}) as Record<string, unknown>;
      out.push({
        cartLineKey: line.localId,
        sku: line.sku,
        qty: Number(line.qty ?? 1),
        rewardLine: Boolean(attrs.pwp || attrs.free_item || attrs.free_gift),
        // A sofa build's module codes ride along so the server reserve can
        // match COMBO-scope triggers (a flat sku alone can't).
        ...(li.builtCompartments.length > 0 ? { builtCompartments: li.builtCompartments } : {}),
      });
    }
  }
  return out;
}

/** The voucher code a reward line is bound to (P8c), or null. */
export function linePwpCode(line: DraftLine): string | null {
  const pwp = (line.attrs as Record<string, unknown> | null)?.pwp as
    | { code?: unknown }
    | undefined;
  return typeof pwp?.code === "string" && pwp.code.trim() ? pwp.code : null;
}

/** The per-submit claimGroup correlation uuid a reward line carries (P8c), or null. */
export function linePwpClaimGroup(line: DraftLine): string | null {
  const pwp = (line.attrs as Record<string, unknown> | null)?.pwp as
    | { claimGroup?: unknown }
    | undefined;
  return typeof pwp?.claimGroup === "string" && pwp.claimGroup.trim() ? pwp.claimGroup : null;
}

/**
 * Mark a cart line as a PWP/promo reward under `rule` AND bind the backing
 * RESERVED voucher `code` + the per-submit `claimGroup`. Same as `markLinePwp`
 * (forces the preview price, parks the real price in `origUnitPrice`) but the
 * `attrs.pwp` marker carries `{ ruleId, code, claimGroup }` so the order route's
 * Stage B can CLAIM the code (RESERVED→USED, bound to `ruleId`). The server
 * re-derives `type`/`triggerRef` + forces the price + re-validates the claim
 * regardless — the client price is never trusted; the code is the lineage/lock
 * record stamped INTO the order (it persists into `order_lines.attrs.pwp`).
 */
export function markLinePwpWithCode(
  line: DraftLine,
  rule: PwpRuleDto,
  price: number,
  code: string,
  claimGroup: string,
): DraftLine {
  const base = markLinePwp(line, rule, price);
  return {
    ...base,
    attrs: {
      ...((base.attrs as Record<string, unknown> | null) ?? {}),
      pwp: { ruleId: rule.id, code, claimGroup },
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// P8d (migration 0188) — the CROSS-ORDER voucher POS layer. P8c bound a
// RESERVED code minted in THIS cart; P8d adds binding an AVAILABLE carry-forward
// voucher the customer EARNED on a PRIOR order (discovered by phone / code via
// the DEFINER `pwp_discover_available`, claimed RESERVED-free AVAILABLE→USED at
// Confirm by `pwp_claim_available_code`, phone-bound server-side). The marker is
// the SAME `attrs.pwp` carrier plus the `crossOrder: true` discriminator the
// order route reads to pick the cross-order claim RPC instead of the same-cart
// one. Everything else (the forced price authority, the claimGroup, the lineage)
// is identical to P8c — the client price is never trusted; the server
// re-validates the phone binding + expiry + forces the reward price regardless.
// ────────────────────────────────────────────────────────────────────────────

/** True when the line is bound to a CROSS-ORDER (carry-forward) voucher — its
 *  `attrs.pwp.crossOrder === true`. A same-cart (P8c) binding / a code-less P8b
 *  claim returns false (the marker omits the flag). */
export function linePwpCrossOrder(line: DraftLine): boolean {
  const pwp = (line.attrs as Record<string, unknown> | null)?.pwp as
    | { crossOrder?: unknown }
    | undefined;
  return pwp?.crossOrder === true;
}

/**
 * Mark a cart line as a PWP/promo reward backed by a CROSS-ORDER AVAILABLE
 * voucher `code` (a carry-forward the customer earned on a prior order). Same as
 * `markLinePwpWithCode` (forces the preview price, parks the real price in
 * `origUnitPrice`, carries `{ ruleId, code, claimGroup }`) but stamps the extra
 * `crossOrder: true` discriminator so the order route's Stage B claims it via
 * `pwp_claim_available_code` (AVAILABLE→USED, phone-bound) rather than the
 * same-cart `pwp_claim_code` (RESERVED→USED). The server re-asserts the phone
 * binding + expiry + forces the price regardless — the client price is never
 * trusted; the bound `code` is the lineage/lock record stamped into the order.
 */
export function markLinePwpWithAvailableCode(
  line: DraftLine,
  rule: PwpRuleDto,
  price: number,
  code: string,
  claimGroup: string,
): DraftLine {
  const base = markLinePwp(line, rule, price);
  return {
    ...base,
    attrs: {
      ...((base.attrs as Record<string, unknown> | null) ?? {}),
      pwp: { ruleId: rule.id, code, claimGroup, crossOrder: true },
    },
  };
}

/**
 * ⭐ COULD THIS LINE EVER BE A REWARD? — the cross-order visibility test.
 *
 * `coveringPwpForLine` answers a different, narrower question: is this line
 * grantable RIGHT NOW, from a trigger already in THIS cart. That is the correct
 * gate for the same-cart "Use PWP" chips, and it was also — wrongly — the gate on
 * the whole voucher surface, so a cart holding only the reward could not even
 * show the box to type a saved voucher number into.
 *
 * A carried-forward voucher is redeemed on a LATER order that need not contain
 * the trigger. The honest question for showing that affordance is therefore
 * "could this product be a reward at all", which is the rules' REWARD scope with
 * no trigger and no allowance in it.
 *
 * Returns the ACTIVE rules whose reward scope covers the line. Empty = this
 * product is never a reward, so no voucher could ever apply and the surface
 * stays hidden — which keeps a normal cart exactly as quiet as it is today.
 */
export function rewardCapableRules(
  line: DraftLine,
  catalog: CatalogResponse,
): PwpRuleDto[] {
  const rules = activePwpRules(catalog);
  if (rules.length === 0) return [];
  const li = toFreeGiftLineInput(line, catalog);
  const combos = comboModulesMap(catalog);
  return rules.filter((r) =>
    voucherCoversLine(
      { rewardCategory: r.rewardCategory, rewardTargets: r.rewardTargets },
      li,
      combos,
    ),
  );
}

/**
 * ⭐ CAN THIS SAVED VOUCHER BE SPENT ON THIS LINE, AND AT WHAT PRICE?
 *
 * Judged against the voucher's OWN FROZEN SNAPSHOT (`rewardCategory` /
 * `rewardTargets` / `type`, stamped at mint), never against today's rule and
 * never against this cart's allowance — the P8d design's rule that a later rule
 * edit must not invalidate an outstanding voucher, and the same test the server
 * applies in `pwp-recompute`. Same function, both sides: honest-pricing.
 *
 * `null` = not offerable, for one of three reasons the dealer never has to
 * distinguish: the snapshot's scope does not cover this line · it is a 'pwp'
 * voucher and the reward SKU has no usable price (the >0 law) · the line is a
 * sofa BUILD, whose price comes from the combo map and which is out of scope for
 * cross-order redemption (the server would refuse it).
 */
export function voucherOfferForLine(
  voucher: PwpDiscoverDto,
  line: DraftLine,
  catalog: CatalogResponse,
): { price: number } | null {
  // A build's price is the combo map's, not a per-SKU figure — deliberately not
  // offered cross-order rather than previewing a number the server will not use.
  if ((line.attrs as Record<string, unknown> | null)?.sofa_build) return null;
  if (!voucherCoversLine(voucher, toFreeGiftLineInput(line, catalog), comboModulesMap(catalog))) {
    return null;
  }
  if (voucher.type === "promo") return { price: 0 };
  const skuRow = catalog.skus.find((s) => s.sku === line.sku) ?? null;
  const p = skuRow?.pwpPrice;
  // The same >0 law as the same-cart offer gate and the server.
  return typeof p === "number" && p > 0 ? { price: p } : null;
}
