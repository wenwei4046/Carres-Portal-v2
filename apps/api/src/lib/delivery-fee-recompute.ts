import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Adapters,
  DB,
  DELIVERY_FEE_CONFIG,
  SPECIAL_DELIVERY_FEE_RULES,
  SOFA_COMBO_PRICING,
  computeDeliveryFee,
  specialModelsForLines,
  type DeliveryFeeConfig,
  type DeliveryFeeResult,
  type OrderAddonInput,
  type RuleLineInput,
  type RuleTarget,
  type SpecialDeliveryRule,
} from "@carres/shared";

import type { RecomputableLine } from "./sofa-recompute";
import { embedCategory, resolveSkuInfo, type SkuInfo } from "./rule-line-input";

/**
 * Delivery TRIP fee server-recompute (migration 0184, 2990s Products parity
 * Phase 6). The Hono trust gate for the delivery fee — the SERVER is
 * authoritative for the base + cross-category portions. It re-runs the SAME
 * pure `computeDeliveryFee` the POS preview used, but against FRESH
 * `delivery_fee_config` + active `special_delivery_fee_rules` read via the user
 * JWT (RLS — never service_role), and the cart's real categories. The only
 * client-supplied values are the operator's free-form `additionalDeliveryFee`
 * (clamped ≥0) and the optional `crossCategorySourceSo` link.
 *
 * The fee is charged by APPENDING `order_addons` (mirroring how disposal addons
 * flow) — `create_order` / `order_lines` / `DraftLine` / `cart.ts` stay
 * UNTOUCHED. The three addon keys (DELIVERY / DELIVERY_CROSS / DELIVERY_ADD) are
 * seeded by migration 0184 (order_addons.addon_key is FK-constrained to
 * addons(key)). Only components > 0 produce an addon.
 *
 * The floor STAIR surcharge (floor_config) is a DIFFERENT charge and is KEPT —
 * the delivery trip fee is ADDITIVE; both fold into the order total.
 *
 * DORMANT: `delivery_fee_config` seeds base_fee=0 / cross_category_fee=0, so
 * with no special rule + no additional fee every component is 0 → NO addon is
 * appended → order totals stay byte-identical until the principal sets rates.
 *
 * Runs AFTER the sofa explode + special-addon recompute, on that (possibly
 * expanded) line set. Fails CLOSED: any catalog / orders read error →
 * `server_error` (500); a malformed / invalid cross-order link →
 * `bad_request` (400, the order is NOT created).
 */

const DELIVERY_ADDON = "DELIVERY" as const;
const DELIVERY_CROSS_ADDON = "DELIVERY_CROSS" as const;
const DELIVERY_ADD_ADDON = "DELIVERY_ADD" as const;

/** Dormant fallback when the singleton row is absent (mirrors sofa-recompute's
 *  0176 fabric-tier fallback). All fees 0 → no delivery charge. */
const DORMANT_CONFIG: DeliveryFeeConfig = {
  baseFee: 0,
  crossCategoryFee: 0,
  chargedCategories: ["sofa", "mattress", "bedframe"],
  mattressBedframeLeadDays: 14,
  sofaLeadDays: 21,
};

export interface DeliveryRecomputeContext {
  /** The operator's free-form additional delivery fee (RM). Clamped ≥0 inside
   *  the pure engine; passed through verbatim. */
  additionalDeliveryFee: number;
  /** The customer's earlier SO this order is a cross-category follow-up of, or
   *  null. A string like "SO-1042" or "1042" — the numeric part is matched
   *  against `orders.so`. */
  crossCategorySourceSo: string | null;
  /** The new order's customer phone (the same-customer identity half). */
  customerPhone: string | null;
}

export type DeliveryRecomputeOutcome =
  | { status: "ok"; addons: OrderAddonInput[]; fee: DeliveryFeeResult }
  | { status: "bad_request"; message: string }
  | { status: "server_error"; message: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Digits-only phone key for the same-customer comparison (mirrors the loose
 *  identity used elsewhere; an empty result means "no usable phone"). */
const phoneKey = (p: string | null | undefined): string =>
  (p ?? "").replace(/\D/g, "");

/** Phase 7 (free gifts) — a free line (an appended RM0 gift carrying
 *  `attrs.free_gift`, or an existing line freed by a campaign carrying
 *  `attrs.free_item`) NEVER contributes to a delivery charge. No-funding is
 *  one-way: a free item alone must not trip a delivery base fee, and a free gift
 *  is not a deliverable the customer paid for. Excluded from the charged-category
 *  set + the cross-category span detection below. */
function isFreeLine(attrs: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  return Boolean(attrs.free_gift) || Boolean(attrs.free_item);
}

export async function recomputeDeliveryFee(
  sb: SupabaseClient,
  lines: RecomputableLine[],
  ctx: DeliveryRecomputeContext,
): Promise<DeliveryRecomputeOutcome> {
  // 1. Fresh config (singleton id=1). `.maybeSingle()` without an `.eq` filter —
  //    the table is a hard singleton (id PK default 1, CHECK id=1, seeded). A
  //    row missing base_fee (or absent) falls back to the dormant 0-config.
  const configR = await sb.from(DELIVERY_FEE_CONFIG).select("*").maybeSingle();
  if (configR.error) {
    return { status: "server_error", message: configR.error.message };
  }
  const cfgRow = configR.data as DB.DeliveryFeeConfigRow | null;
  const config: DeliveryFeeConfig =
    cfgRow && cfgRow.base_fee != null
      ? Adapters.deliveryFeeConfigFromRow(cfgRow)
      : DORMANT_CONFIG;

  // 2. Special rules — fetched UNFILTERED (mirrors the catalog GET), active
  //    filtered in JS. parseRuleTargets (inside the adapter) drops malformed
  //    targets.
  const rulesR = await sb.from(SPECIAL_DELIVERY_FEE_RULES).select("*");
  if (rulesR.error) {
    return { status: "server_error", message: rulesR.error.message };
  }
  const rules: SpecialDeliveryRule[] = ((rulesR.data ?? []) as DB.SpecialDeliveryFeeRuleRow[])
    .filter((r) => r.active)
    .map((r) => {
      const dto = Adapters.specialDeliveryFeeRuleFromRow(r);
      return {
        target: dto.target,
        standaloneFee: dto.standaloneFee,
        crossCategoryFollowupFee: dto.crossCategoryFollowupFee,
      };
    });

  // 2b. SHORT-CIRCUIT the dormant case. With a 0/0 config, no active special
  //     rule, and no client-supplied additional fee or cross-order link, EVERY
  //     fee component is 0 → no delivery addon would be appended. Return early to
  //     AVOID the product_skus / product_models category embed (the
  //     overwhelmingly common order is dormant; this trims the failure surface
  //     on it). The fail-closed 500 behavior is fully preserved for the
  //     non-dormant path below (config / rules read errors already returned).
  const clientWantsFee =
    (ctx.additionalDeliveryFee ?? 0) > 0 || Boolean((ctx.crossCategorySourceSo ?? "").trim());
  const dormant =
    config.baseFee === 0 &&
    config.crossCategoryFee === 0 &&
    rules.length === 0 &&
    !clientWantsFee;
  if (dormant) {
    return {
      status: "ok",
      addons: [],
      fee: { base: 0, crossCategory: 0, additional: 0, total: 0, isSpecial: false, isFollowup: false },
    };
  }

  // 3. Resolve every line's sku → { model_id, category, variant } in one batched
  //    read (RLS). Build lines reference their representative / compartment skus
  //    which are real product_skus rows, so the same join covers them. FREE lines
  //    (free_gift / free_item) are dropped first — no-funding: they must not
  //    contribute a category to the charged set nor count toward the
  //    cross-category span (an order whose only deliverable is a freed item must
  //    not trip a base fee).
  const chargeableLines = lines.filter((l) => !isFreeLine(l.attrs));
  const skuRes = await resolveSkuInfo(
    sb,
    chargeableLines.map((l) => l.sku),
  );
  if (!skuRes.ok) {
    return { status: "server_error", message: skuRes.message };
  }
  const skuInfo = skuRes.skuInfo;

  // 4. Flatten lines → RuleLineInput[]. Exploded sofa compartment lines
  //    (attrs.sofa_build_key + module_code) regroup into ONE sofa RuleLineInput
  //    per build (mirrors 2990s reconstructDeliveryRuleLines); a defensive
  //    un-exploded build line (attrs.sofa_build) reads its cells directly; every
  //    other line resolves its category/model/size from the sku map.
  const ruleLines = buildRuleLines(chargeableLines, skuInfo);

  // 5. Distinct charged categories present (∩ config.chargedCategories).
  const chargedSet = new Set(config.chargedCategories.map((c) => c.toLowerCase()));
  const present = new Set<string>();
  for (const l of ruleLines) {
    const cat = l.category.toLowerCase();
    if (cat && chargedSet.has(cat)) present.add(cat);
  }
  const categoryIds = Array.from(present);

  // 6. Special-model fees — combo subset matching needs the combo→slots map,
  //    fetched only when a combo-scope rule references combos (dormant: none).
  const comboModulesById = await loadComboModules(sb, rules);
  if (comboModulesById === null) {
    return { status: "server_error", message: "Failed to load sofa combos for delivery rule matching" };
  }
  const specialModels = specialModelsForLines(ruleLines, rules, comboModulesById);

  // The new order's distinct deliverable categories (RAW — every cart line's
  // category, independent of the chargedCategories gate). Used to verify a
  // cross-order follow-up genuinely spans a sofa × (mattress|bedframe) pair.
  const newCategories = new Set(
    ruleLines.map((l) => l.category.toLowerCase()).filter(Boolean),
  );

  // 7. Cross-order follow-up link validation (Hono, fail-closed). The HARD
  //    checks (not found / cancelled / different customer / already linked) →
  //    bad_request (the order is NOT created). But passing the hard checks alone
  //    no longer grants the reduced rate: the source + new orders must ALSO
  //    TOGETHER span a genuine cross-category pair (one side sofa, the other
  //    mattress/bedframe — a real second trip). If they pass the hard checks but
  //    are NOT category-complementary, this is simply NOT a follow-up: charge the
  //    standalone base, book the order normally, and DO NOT record the link.
  let isCrossCategoryFollowup = false;
  let sourceSoLabel: string | null = null;
  const rawLink = (ctx.crossCategorySourceSo ?? "").trim();
  if (rawLink) {
    const elig = await checkCrossCategorySource(sb, rawLink, ctx.customerPhone, newCategories);
    if (elig.status === "server_error") return elig;
    if (elig.status === "invalid") {
      return { status: "bad_request", message: elig.message };
    }
    if (elig.complementary) {
      isCrossCategoryFollowup = true;
      sourceSoLabel = elig.soLabel;
    }
  }

  // 8. Authoritative compute with the SAME pure engine the POS previewed.
  const fee = computeDeliveryFee(
    {
      categoryIds,
      specialModels,
      isCrossCategoryFollowup,
      additionalFee: ctx.additionalDeliveryFee,
    },
    config,
  );

  // 9. Decompose into order_addons — only components > 0 (dormant → none).
  const addons: OrderAddonInput[] = [];
  const base = round2(fee.base);
  const cross = round2(fee.crossCategory);
  const add = round2(fee.additional);
  if (base > 0) {
    addons.push({
      addonKey: DELIVERY_ADDON,
      qty: 1,
      unitPrice: base,
      attrs: {
        kind: fee.isFollowup ? "cross_category_followup" : fee.isSpecial ? "special" : "base",
        ...(sourceSoLabel ? { cross_category_source_so: sourceSoLabel } : {}),
      },
    });
  } else if (sourceSoLabel) {
    // A validly-applied follow-up whose reduced rate computed to 0 (e.g. the
    // config cross rate + any matched special follow-up fees are all 0). STILL
    // record the source-SO link so the single-use backstop + audit hold — the
    // link MUST be recorded regardless of the dollar amount. A 0-price DELIVERY
    // addon is harmless to the order total.
    addons.push({
      addonKey: DELIVERY_ADDON,
      qty: 1,
      unitPrice: 0,
      attrs: { kind: "cross_category_followup", cross_category_source_so: sourceSoLabel },
    });
  }
  if (cross > 0) {
    addons.push({ addonKey: DELIVERY_CROSS_ADDON, qty: 1, unitPrice: cross, attrs: null });
  }
  if (add > 0) {
    addons.push({ addonKey: DELIVERY_ADD_ADDON, qty: 1, unitPrice: add, attrs: null });
  }

  return { status: "ok", addons, fee };
}

/* ─── RuleLineInput assembly ────────────────────────────────────────────── */

function buildRuleLines(
  lines: RecomputableLine[],
  skuInfo: Map<string, SkuInfo>,
): RuleLineInput[] {
  const out: RuleLineInput[] = [];
  // sofa_build_key → consolidated build (modules + model + category).
  const sofaGroups = new Map<
    string,
    { modelId: string | null; category: string; modules: string[] }
  >();

  for (const line of lines) {
    const attrs = (line.attrs ?? {}) as Record<string, unknown>;
    const info = skuInfo.get(line.sku) ?? null;

    // Defensive: a still-un-exploded sofa build line carries the full descriptor.
    const sofaBuild = attrs.sofa_build as { cells?: Array<{ moduleCode?: unknown }> } | undefined;
    if (sofaBuild && Array.isArray(sofaBuild.cells)) {
      const modules = sofaBuild.cells
        .map((c) => String(c?.moduleCode ?? "").trim())
        .filter(Boolean);
      out.push({
        category: info?.category || "sofa",
        modelId: info?.modelId ?? null,
        sizeCode: null,
        builtCompartments: modules,
      });
      continue;
    }

    // Exploded compartment line → regroup by sofa_build_key.
    const buildKey = typeof attrs.sofa_build_key === "string" ? attrs.sofa_build_key : "";
    const moduleCode = typeof attrs.module_code === "string" ? attrs.module_code.trim() : "";
    if (buildKey) {
      const g =
        sofaGroups.get(buildKey) ??
        { modelId: info?.modelId ?? null, category: info?.category || "sofa", modules: [] };
      if (moduleCode) g.modules.push(moduleCode);
      // Prefer a concrete category once known.
      if (!g.category && info?.category) g.category = info.category;
      sofaGroups.set(buildKey, g);
      continue;
    }

    // Regular line — resolve from the sku map.
    const category = info?.category ?? "";
    const isSofa = category.toLowerCase() === "sofa";
    out.push({
      category,
      modelId: info?.modelId ?? null,
      sizeCode: !isSofa && info?.variant ? info.variant.toUpperCase() : null,
      builtCompartments: [],
    });
  }

  for (const g of sofaGroups.values()) {
    out.push({
      category: g.category || "sofa",
      modelId: g.modelId,
      sizeCode: null,
      builtCompartments: g.modules,
    });
  }
  return out;
}

/* ─── combo→slots map (combo-scope rules only) ──────────────────────────── */

/** Returns the combo id → ordered OR-set slots map, or null on a read error
 *  (fail-closed). Empty map when no rule needs combo matching. */
async function loadComboModules(
  sb: SupabaseClient,
  rules: SpecialDeliveryRule[],
): Promise<Map<string, string[][]> | null> {
  const comboIds = new Set<string>();
  for (const rule of rules) {
    for (const t of rule.target as RuleTarget[]) {
      if (t.scope === "combo") for (const id of t.comboIds ?? []) comboIds.add(id);
    }
  }
  const map = new Map<string, string[][]>();
  if (comboIds.size === 0) return map;
  const { data, error } = await sb
    .from(SOFA_COMBO_PRICING)
    .select("id, slots")
    .in("id", Array.from(comboIds));
  if (error) return null;
  for (const row of (data ?? []) as Array<{ id: string; slots: string[][] | null }>) {
    map.set(row.id, row.slots ?? []);
  }
  return map;
}

/* ─── cross-category source SO validation ───────────────────────────────── */

type CrossCatResult =
  | { status: "ok"; soLabel: string; complementary: boolean }
  | { status: "invalid"; message: string }
  | { status: "server_error"; message: string };

const isBedCategory = (s: ReadonlySet<string>): boolean =>
  s.has("mattress") || s.has("bedframe");

/**
 * A GENUINE cross-category pair = one order has a sofa and the OTHER has a
 * mattress/bedframe (a real second delivery trip). Carres's 0089 mutex rejects
 * any single order that mixes sofa with mattress/bedframe, so each order is
 * one-sided — this captures the across-TWO-orders span the follow-up rate exists
 * for. (mattress + bedframe alone is one bedroom trip, NOT cross-category.)
 */
function spansCrossCategory(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return (a.has("sofa") && isBedCategory(b)) || (isBedCategory(a) && b.has("sofa"));
}

type OrderCategoriesResult =
  | { status: "ok"; categories: Set<string> }
  | { status: "server_error"; message: string };

/**
 * Resolve an order's DISTINCT line categories via order_lines → product_skus →
 * product_models.category. `order_lines.sku` has NO FK to `product_skus`, so this
 * is a two-step read (the SAME resolution path the new order's lines use). Reads
 * via the user JWT (RLS) — fail-closed on a read error.
 */
async function resolveOrderCategories(
  sb: SupabaseClient,
  orderId: string,
): Promise<OrderCategoriesResult> {
  const linesR = await sb.from("order_lines").select("sku").eq("order_id", orderId);
  if (linesR.error) return { status: "server_error", message: linesR.error.message };
  const skus = Array.from(
    new Set(
      ((linesR.data ?? []) as Array<{ sku?: string | null }>)
        .map((r) => r.sku ?? "")
        .filter(Boolean),
    ),
  );
  const categories = new Set<string>();
  if (skus.length === 0) return { status: "ok", categories };
  const { data, error } = await sb
    .from("product_skus")
    .select("sku, product_models(category)")
    .in("sku", skus);
  if (error) return { status: "server_error", message: error.message };
  const bySku = new Map<string, string>();
  for (const row of (data ?? []) as Array<{
    sku?: string;
    product_models?: { category?: string } | Array<{ category?: string }> | null;
  }>) {
    if (row.sku) bySku.set(row.sku, embedCategory(row.product_models).toLowerCase());
  }
  for (const s of skus) {
    const c = bySku.get(s);
    if (c) categories.add(c);
  }
  return { status: "ok", categories };
}

/**
 * Validate the linked source SO (mirrors 2990s `checkCrossCategorySource`,
 * adapted to Carres's integer `orders.so` + the addon-attrs uniqueness backstop).
 * HARD checks (any failure → invalid → bad_request, order NOT created):
 *   · SO number must parse                              → invalid
 *   · the SO must exist + be visible (RLS)              → invalid (not found)
 *   · not cancelled                                     → invalid
 *   · same customer (by phone, when both have one)      → invalid (different)
 *   · not already a source for another order            → invalid (already used)
 * A failed lookup is NOT a missing order → server_error (fail-closed; never
 * silently grant the reduced rate). The "already used" check queries the
 * delivery addon attrs (`order_addons.attrs->>cross_category_source_so`), since
 * Carres records the link there (no orders column; create_order untouched).
 *
 * On passing the hard checks it ALSO resolves the source order's categories and
 * reports `complementary` = whether source + new TOGETHER span a real
 * cross-category pair (see `spansCrossCategory`). The caller only grants the
 * reduced rate (and records the link) when `complementary` is true; otherwise it
 * treats the order as a normal standalone (no 400, no link).
 */
async function checkCrossCategorySource(
  sb: SupabaseClient,
  rawLink: string,
  newPhone: string | null,
  newCategories: ReadonlySet<string>,
): Promise<CrossCatResult> {
  const soNum = Number((rawLink.match(/\d+/) ?? [""])[0]);
  if (!Number.isFinite(soNum) || soNum <= 0) {
    return { status: "invalid", message: `'${rawLink}' is not a valid SO number.` };
  }
  const soLabel = `SO-${soNum}`;

  const srcR = await sb
    .from("orders")
    .select("id, so, status, customer_phone")
    .eq("so", soNum)
    .maybeSingle();
  if (srcR.error) {
    return { status: "server_error", message: srcR.error.message };
  }
  const src = srcR.data as
    | { id: string; so: number; status: string; customer_phone: string | null }
    | null;
  if (!src) {
    return { status: "invalid", message: `Order ${soLabel} was not found.` };
  }
  if (src.status === "cancelled") {
    return { status: "invalid", message: `Order ${soLabel} is cancelled.` };
  }
  const wantPhone = phoneKey(newPhone);
  const srcPhone = phoneKey(src.customer_phone);
  if (wantPhone && srcPhone && wantPhone !== srcPhone) {
    return { status: "invalid", message: `Order ${soLabel} belongs to a different customer.` };
  }

  // Single-use backstop: has any DELIVERY addon already linked this source SO?
  const usedR = await sb
    .from("order_addons")
    .select("id")
    .eq("addon_key", DELIVERY_ADDON)
    .eq("attrs->>cross_category_source_so", soLabel)
    .limit(1);
  if (usedR.error) {
    return { status: "server_error", message: usedR.error.message };
  }
  if ((usedR.data ?? []).length > 0) {
    return { status: "invalid", message: `Order ${soLabel} was already used for a cross-category delivery discount.` };
  }

  // Hard checks passed. Resolve the source order's categories and decide whether
  // the source + new orders together span a genuine cross-category pair. (NOT
  // complementary → the caller books the order as a normal standalone; no 400.)
  const srcCats = await resolveOrderCategories(sb, src.id);
  if (srcCats.status === "server_error") return srcCats;
  const complementary = spansCrossCategory(srcCats.categories, newCategories);

  return { status: "ok", soLabel, complementary };
}
