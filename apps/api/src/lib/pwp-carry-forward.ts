import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Adapters,
  DB,
  PWP_CODES,
  PWP_RULES,
  SOFA_COMBO_PRICING,
  lineMatchesTargets,
  nameKey,
  phoneKeyMy,
  type PwpRule,
  type RuleLineInput,
} from "@carres/shared";

import type { RecomputableLine } from "./sofa-recompute";
import { resolveSkuInfo, type SkuInfo } from "./rule-line-input";

/**
 * Order-path PWP CARRY-FORWARD sweep (2990s Products parity Phase 8d, migration
 * 0188) — the Confirm-pass disposal of the caller's UNCLAIMED RESERVED vouchers.
 *
 * P8c (0187) DELETED every unclaimed RESERVED code for a cart's triggers at
 * Confirm (same-cart only). P8d adds the cross-order path: an unclaimed RESERVED
 * voucher whose minting rule is STILL ACTIVE and is flagged `carry_forward` (the
 * default), AND for which the order captured a customer phone, is CARRIED FORWARD
 * — flipped RESERVED→AVAILABLE, bound to the customer's CANONICAL phone
 * (`phoneKeyMy`), stamped with the source order + the minting salesperson's dealer
 * + an optional expiry — so the customer can redeem it on a FUTURE order. Every
 * other unclaimed RESERVED code is DELETEd (rule inactive / `carry_forward=false`
 * / no phone captured = nothing to bind to).
 *
 * THE SERVER-DERIVED SCOPE (the BLOCKER fix, §3.1/§3.2): this sweep runs in its
 * OWN block in `orders.ts`, HOISTED OUT of the `claimedPwpCodes.length > 0` guard,
 * so the headline scenario — buy a trigger, claim NO reward this cart, carry a
 * voucher to the next order — fires even with 0 claims. The in-scope RESERVED set
 * is SERVER-DERIVED from the order's own trigger lines (`finalLines`), NOT the
 * client `pwpCartLineKeys` hint: a RESERVED row is part of this submit iff its
 * `trigger_item_code` is a SKU present in `finalLines` whose (still-active) minting
 * rule's trigger scope matches that line — OR its `cart_line_key` is in the client
 * hint (UNION'd as a belt, never the sole source). Correctness never hinges on the
 * client field.
 *
 * THE ENTITLEMENT CAP (2026-07-14 — closes `pwp-sweep-cross-cart-contamination`):
 * the trigger-SKU scope over-matches when the SAME trigger SKU recurs across carts
 * — orphan RESERVED codes from ABANDONED earlier carts (reserved, never submitted,
 * reaper cron unwired) share the sku and were swept into the NEXT order wholesale
 * (live hit: CO-1174 printed 8 vouchers — 4 of them minted 2026-07-06/10 by dead
 * carts). An order's carry grant is defined by ITS OWN content, exactly like
 * `resolvePwp`: per rule, entitled = Σ(trigger-line qty) × qty_per_trigger. The
 * carry keeps at most `entitled` codes per rule — THIS cart's codes first
 * (`cart_line_key` ∈ client hint), then newest — and DELETES the excess, so stale
 * pool build-up self-heals on the next same-SKU submit instead of inflating it.
 *
 * Uses the USER JWT (RLS) only — the caller OWNS their own RESERVED codes, and the
 * owner CAN flip their own RESERVED → AVAILABLE (only a CROSS-order AVAILABLE→USED
 * claim needs a DEFINER), so no new RPC: the carry UPDATE + the delete run via the
 * table under owner-scoped RLS, both idempotency-guarded by `.eq("status",
 * "RESERVED")`. NEVER service_role.
 *
 * DORMANT (§7): a sweep with 0 RESERVED rows for the caller returns early
 * `{ carried: 0, deleted: 0 }` after ONE indexed 0-row read (owner_staff_id +
 * status) — no rules fetch, no write. With 0 active rules nothing ever reserves,
 * so a dormant order does that one cheap read and nothing else.
 */

export type SweepArgs = {
  /** The caller's auth uid (`owner_staff_id` of their RESERVED codes). */
  ownerStaffId: string;
  /** The order's effective dealer (the carry-forward `owner_dealer_id` snapshot so
   *  a later same-dealer salesperson can reconcile — NOT the principal's, on the
   *  on-behalf path). */
  ownerDealerId: string;
  /** The committed order id (the carry-forward `source_order_id` lineage origin). */
  orderId: string;
  /** The order's customer phone (raw; canonicalized via `phoneKeyMy`). NULL/empty
   *  → no binding possible → a would-carry code is DELETEd + a soft-warning. */
  customerPhone: string | null;
  /** The order's customer name (raw; canonicalized via `nameKey`). 0204: stamped
   *  as the NAME half of the 2990s name+phone voucher identity — a later claim
   *  must present the SAME name (shared phone + different name ≠ same customer). */
  customerName: string | null;
  /** The fully-verified order line set (post sofa-explode + special + free + gift),
   *  used to SERVER-DERIVE which RESERVED codes belong to this submit. */
  finalLines: RecomputableLine[];
  /** The client `pwpCartLineKeys` hint — UNION'd with the server-derived scope,
   *  never the sole source (a missing/under-populated hint still carries/deletes). */
  clientCartLineKeys: string[];
};

export type SweepOutcome = {
  status: "ok" | "server_error";
  message?: string;
  carried: number;
  deleted: number;
  /** Set when a would-carry code was DELETEd for lack of a captured phone, so the
   *  route can surface "N earned voucher(s) were not saved" to the salesperson. */
  softWarning?: string;
};

/** A flat trigger line → the matcher's core RuleLineInput (mirrors the reserve
 *  route's `deriveRuleLine`). Triggers are flat real SKUs. */
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

const upper = (s: string): string => String(s ?? "").toUpperCase();

/**
 * Sweep the caller's unclaimed RESERVED vouchers for THIS submit: carry forward
 * (active + carry rule + phone) or delete. Runs AFTER `create_order` commits + the
 * Confirm-pass stamp; an error here does NOT roll back the committed order (the
 * route logs + continues — a dangling RESERVED code is harmless / reaper-cleaned).
 */
export async function sweepReservedForSubmit(
  sb: SupabaseClient,
  args: SweepArgs,
): Promise<SweepOutcome> {
  // 1. Load ALL of the caller's RESERVED rows (owner-scoped via RLS). DORMANT
  //    short-circuit: 0 rows → early return, no rules fetch, no write.
  const reservedR = await sb
    .from(PWP_CODES)
    .select("code, rule_id, cart_line_key, trigger_item_code, created_at")
    .eq("owner_staff_id", args.ownerStaffId)
    .eq("status", "RESERVED");
  if (reservedR.error) {
    return { status: "server_error", message: reservedR.error.message, carried: 0, deleted: 0 };
  }
  const reservedRows = (reservedR.data ?? []) as Array<{
    code: string;
    rule_id: string | null;
    cart_line_key: string | null;
    trigger_item_code: string | null;
    /** Recency key for the entitlement cap's this-cart-first ordering. Optional
     *  defensively (older mocks omit it). */
    created_at?: string | null;
  }>;
  if (reservedRows.length === 0) return { status: "ok", carried: 0, deleted: 0 };

  // 2. ACTIVE rules (RLS). Needed BOTH for the server-derived trigger match AND
  //    the carry-forward decision (active + carry_forward).
  const rulesR = await sb.from(PWP_RULES).select("*").eq("active", true);
  if (rulesR.error) {
    return { status: "server_error", message: rulesR.error.message, carried: 0, deleted: 0 };
  }
  const activeRules: PwpRule[] = ((rulesR.data ?? []) as DB.PwpRuleRow[]).map((r) =>
    Adapters.pwpRuleFromRow(r),
  );
  const activeById = new Map(activeRules.map((r) => [r.id, r] as const));

  // 3. SERVER-DERIVE the trigger SKU set: each line in `finalLines` whose (active)
  //    minting rule's trigger scope matches it is a trigger. We collect the SKUs of
  //    those trigger lines, so a RESERVED row whose `trigger_item_code` is one of
  //    them is in-scope for THIS submit — independent of the client field.
  const skuRes = await resolveSkuInfo(sb, args.finalLines.map((l) => l.sku));
  if (!skuRes.ok) {
    return { status: "server_error", message: skuRes.message, carried: 0, deleted: 0 };
  }
  // Reconstruct sofa BUILDS from the exploded lines (grouped by
  // attrs.sofa_build_key) so COMBO-scope triggers can classify them. A build's
  // reserved codes carry the pre-explode REP sku as trigger_item_code, which
  // never appears post-explode — their scope inclusion rides the client
  // cart_line_key hint; these groups drive the promo one-way classification.
  const buildGroups = new Map<
    string,
    { codes: string[]; modelId: string | null; isReward: boolean }
  >();
  for (const line of args.finalLines) {
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
  // Combo slots for combo-scope trigger targets — only queried when builds exist.
  let comboModulesById = new Map<string, string[][]>();
  if (buildGroups.size > 0) {
    const ids = new Set<string>();
    for (const rule of activeRules) {
      for (const t of rule.triggerTargets) {
        if (t.scope === "combo") for (const id of t.comboIds ?? []) ids.add(id);
      }
    }
    if (ids.size > 0) {
      const { data, error } = await sb
        .from(SOFA_COMBO_PRICING)
        .select("id, slots")
        .in("id", Array.from(ids));
      if (error) {
        return { status: "server_error", message: error.message, carried: 0, deleted: 0 };
      }
      comboModulesById = new Map(
        ((data ?? []) as Array<{ id: string; slots: string[][] | null }>).map((r) => [
          r.id,
          r.slots ?? [],
        ]),
      );
    }
  }
  // Per rule: how many genuine NON-reward builds in this order match its sofa
  // trigger? (>0 feeds the promo one-way partition below for codes whose trigger
  // sku is a build rep sku absent from the exploded line set; the count feeds the
  // entitlement cap — each matching build is one trigger unit.)
  const nonRewardBuildTriggersByRule = new Map<string, number>();
  for (const rule of activeRules) {
    let count = 0;
    if (upper(rule.triggerCategory) === "SOFA") {
      for (const g of buildGroups.values()) {
        if (g.isReward || g.codes.length === 0) continue;
        const rl: RuleLineInput = {
          category: "sofa",
          modelId: g.modelId,
          sizeCode: null,
          builtCompartments: g.codes,
        };
        if (lineMatchesTargets(rl, rule.triggerTargets, comboModulesById)) count += 1;
      }
    }
    nonRewardBuildTriggersByRule.set(rule.id, count);
  }

  const emptyCombos = comboModulesById;
  const triggerSkus = new Set<string>();
  // 2990s promo one-way backstop: a line that is ITSELF a reward (a claimed
  // PWP/promo line, a free-item line, or an appended free gift) never opens a
  // PROMO trigger — otherwise a free reward mints a promo voucher that funds
  // the next free reward, forever. Track which trigger SKUs come from at least
  // one genuine NON-reward line; a promo code whose trigger is reward-only is
  // deleted at the partition below (2990s deletes such codes at confirm).
  const nonRewardTriggerSkus = new Set<string>();
  // Per-rule trigger UNITS in this order (flat lines; matching non-reward builds
  // are added below) — × qty_per_trigger = the rule's carry ENTITLEMENT, the cap
  // that keeps stale same-SKU orphans from dead carts out of the carry.
  const entitledUnitsByRule = new Map<string, number>();
  for (const line of args.finalLines) {
    const info = skuRes.skuInfo.get(line.sku) ?? null;
    const rl = deriveRuleLine(info);
    const attrs = (line.attrs ?? {}) as Record<string, unknown>;
    const isRewardLine = Boolean(attrs.pwp || attrs.free_item || attrs.free_gift);
    for (const rule of activeRules) {
      if (upper(rl.category) !== upper(rule.triggerCategory)) continue;
      if (!lineMatchesTargets(rl, rule.triggerTargets, emptyCombos)) continue;
      triggerSkus.add(line.sku);
      if (!isRewardLine) nonRewardTriggerSkus.add(line.sku);
      // Promo one-way parity: a reward line never opens a PROMO entitlement.
      if (!(rule.type === "promo" && isRewardLine)) {
        entitledUnitsByRule.set(
          rule.id,
          (entitledUnitsByRule.get(rule.id) ?? 0) + Math.max(0, line.qty),
        );
      }
    }
  }
  const entitledByRule = new Map<string, number>();
  for (const rule of activeRules) {
    const units =
      (entitledUnitsByRule.get(rule.id) ?? 0) + (nonRewardBuildTriggersByRule.get(rule.id) ?? 0);
    const perTrigger = Math.max(1, Math.floor(rule.qtyPerTrigger || 1));
    entitledByRule.set(rule.id, units * perTrigger);
  }

  // 4. Scope to THIS submit: a RESERVED row is in-scope iff its trigger SKU is a
  //    trigger line in this order OR its cart_line_key is in the client hint (belt).
  const clientKeys = new Set(args.clientCartLineKeys);
  const inScope = reservedRows.filter(
    (r) =>
      (r.trigger_item_code != null && triggerSkus.has(r.trigger_item_code)) ||
      (r.cart_line_key != null && clientKeys.has(r.cart_line_key)),
  );
  if (inScope.length === 0) return { status: "ok", carried: 0, deleted: 0 };

  // 5. Partition in-scope rows into carry vs delete. A row carries iff its minting
  //    rule is active AND carry_forward AND a customer phone is captured; else it
  //    is deleted (rule inactive / no-carry, OR would-carry but no phone → warn).
  const boundPhone = phoneKeyMy(args.customerPhone);
  const boundName = nameKey(args.customerName) || null; // NULL = phone-only (legacy shape)
  // Carry CANDIDATES per rule — the entitlement cap below picks from these.
  const carryCandidatesByRule = new Map<string, typeof inScope>();
  const toDelete: string[] = [];
  let skippedForNoPhone = 0;
  for (const r of inScope) {
    const rule = r.rule_id ? activeById.get(r.rule_id) : undefined;
    // Promo one-way (2990s confirm backstop): a promo code whose trigger SKU
    // never appears as a genuine non-reward line in this order was reserved off
    // a reward line — delete it, never carry it forward.
    if (
      rule?.type === "promo" &&
      !(r.trigger_item_code != null && nonRewardTriggerSkus.has(r.trigger_item_code)) &&
      (nonRewardBuildTriggersByRule.get(rule.id) ?? 0) === 0
    ) {
      toDelete.push(r.code);
      continue;
    }
    if (rule && rule.carryForward !== false) {
      if (boundPhone) {
        const arr = carryCandidatesByRule.get(rule.id) ?? [];
        arr.push(r);
        carryCandidatesByRule.set(rule.id, arr);
      } else {
        toDelete.push(r.code); // would carry, but no phone to bind → delete + warn
        skippedForNoPhone++;
      }
    } else {
      toDelete.push(r.code); // rule inactive / carry_forward=false → delete
    }
  }

  // ENTITLEMENT CAP: keep at most `entitled` codes per rule — THIS cart's codes
  // first (cart_line_key ∈ client hint), then newest-minted — and DELETE the
  // excess (stale same-SKU orphans from dead carts). Group survivors by rule so
  // the per-rule carry_forward_days expiry applies.
  const ts = (s?: string | null): number => {
    const t = s ? Date.parse(s) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const carryByRule = new Map<string, string[]>();
  for (const [ruleId, candidates] of carryCandidatesByRule) {
    const entitled = entitledByRule.get(ruleId) ?? 0;
    const sorted = [...candidates].sort((a, b) => {
      const aCart = a.cart_line_key != null && clientKeys.has(a.cart_line_key) ? 1 : 0;
      const bCart = b.cart_line_key != null && clientKeys.has(b.cart_line_key) ? 1 : 0;
      if (aCart !== bCart) return bCart - aCart;
      return ts(b.created_at) - ts(a.created_at);
    });
    const keep = sorted.slice(0, entitled);
    if (keep.length > 0) {
      carryByRule.set(
        ruleId,
        keep.map((r) => r.code),
      );
    }
    for (const r of sorted.slice(entitled)) toDelete.push(r.code);
  }

  // 6. CARRY: RESERVED → AVAILABLE, stamped source + bound phone + dealer + expiry.
  //    Owner-scoped table UPDATE (the caller flips their OWN RESERVED code) +
  //    `.eq("status","RESERVED")` idempotency guard.
  let carried = 0;
  for (const [ruleId, codes] of carryByRule) {
    const rule = activeById.get(ruleId)!;
    const expiresAt =
      rule.carryForwardDays != null
        ? new Date(Date.now() + rule.carryForwardDays * 86_400_000).toISOString()
        : null;
    const { data, error } = await sb
      .from(PWP_CODES)
      .update({
        status: "AVAILABLE",
        source_order_id: args.orderId,
        bound_customer_phone: boundPhone,
        bound_customer_name: boundName, // 0204 — the NAME half of the identity
        owner_dealer_id: args.ownerDealerId,
        expires_at: expiresAt,
        cart_line_key: null, // detach from the dead cart line (discovery keys on phone)
        updated_at: new Date().toISOString(),
      })
      .eq("owner_staff_id", args.ownerStaffId)
      .eq("status", "RESERVED")
      .in("code", codes)
      .select("code");
    if (error) return { status: "server_error", message: error.message, carried, deleted: 0 };
    carried += (data as Array<{ code: string }> | null)?.length ?? 0;
  }

  // 7. DELETE the rest (RESERVED only — never AVAILABLE/USED).
  let deleted = 0;
  if (toDelete.length > 0) {
    const { data, error } = await sb
      .from(PWP_CODES)
      .delete()
      .eq("owner_staff_id", args.ownerStaffId)
      .eq("status", "RESERVED")
      .in("code", toDelete)
      .select("code");
    if (error) return { status: "server_error", message: error.message, carried, deleted };
    deleted = (data as Array<{ code: string }> | null)?.length ?? 0;
  }

  const softWarning =
    skippedForNoPhone > 0
      ? `${skippedForNoPhone} earned voucher(s) were not saved because no customer phone was captured.`
      : undefined;
  return { status: "ok", carried, deleted, softWarning };
}
