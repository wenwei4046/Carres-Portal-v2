import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Adapters,
  DB,
  FREE_ITEM_CAMPAIGNS,
  MODEL_DEFAULT_FREE_GIFTS,
  SOFA_COMBO_PRICING,
  campaignsCoveringLine,
  resolveDefaultFreeGifts,
  type DefaultFreeGift,
  type FreeGiftLineInput,
  type FreeItemCampaign,
  type RuleTarget,
} from "@carres/shared";

import type { RecomputableLine } from "./sofa-recompute";
import { resolveSkuInfo, type SkuInfo } from "./rule-line-input";

/**
 * Order-path free-gift / free-item gates (2990s Products parity Phase 7,
 * migration 0185). Two deterministic, principal-owned mechanisms, both running
 * server-side at order create alongside the sofa / special-addon / delivery
 * recompute gates — and BOTH no-funding (one-way: a free line can only ever add
 * RM0 to the bill, never reduce it past its own zero, never fund a discount):
 *
 *   1. resolveDefaultFreeGiftLines — DEFAULT FREE GIFTS. A model configured in
 *      `model_default_free_gifts` auto-grants an accessory SKU @ RM0 when bought.
 *      The server runs the SAME pure `resolveDefaultFreeGifts` the POS preview
 *      used (deterministic — NO client claim) and APPENDS one RM0 order_line per
 *      resolved gift, marked `attrs.free_gift`. A misconfigured gift (giftSku not
 *      a real product_skus row) is fail-SOFT: logged + omitted, never fails the
 *      order.
 *
 *   2. validateFreeItemClaims — FREE ITEM CAMPAIGNS (GWP "Make Free"). A line the
 *      client marked `attrs.free_item={campaignId}` is re-validated against ACTIVE
 *      `free_item_campaigns` via the shared `campaignsCoveringLine` + a
 *      `qty <= max_free_qty` cap. Valid → the line's unitPrice is FORCED to 0 and
 *      the marker canonicalised to `{campaignId,name}` (the client price is never
 *      trusted). Invalid → a typed bad_request (the route → 409
 *      free_item_not_eligible; never silently honored). Anti-tamper: any
 *      client-sent `attrs.free_gift` is STRIPPED entirely (gifts are server-only),
 *      and the `attrs.free_item` content beyond `campaignId` is discarded before
 *      re-deriving the marker.
 *
 * Reads the catalog via the USER JWT (RLS) — never service_role. `create_order` /
 * `order_lines` / `DraftLine` / `cart.ts` stay UNTOUCHED: a free gift is just an
 * appended RM0 line and a free item is an existing line whose price the server
 * zeroes — both flow through the existing payload.lines path. DORMANT until the
 * principal authors gifts / campaigns: no gift configured → resolver returns
 * nothing; no campaign → no line is forced free → byte-identical orders.
 *
 * Fails CLOSED on a catalog read error (`server_error` → 500); never silently
 * price a claimed free item.
 */

export type FreeItemValidateOutcome =
  | { status: "ok"; lines: RecomputableLine[] }
  | { status: "bad_request"; message: string }
  | { status: "server_error"; message: string };

export type FreeGiftResolveOutcome =
  /** `lines` are the APPENDED RM0 gift lines ONLY (the caller concatenates them
   *  onto the verified line set). */
  | { status: "ok"; lines: RecomputableLine[] }
  | { status: "server_error"; message: string };

/* ─── per-line RuleLineInput derivation (mirrors delivery's buildRuleLines) ── */

/**
 * Flatten ONE order line to the matcher's `FreeGiftLineInput` (a P6 RuleLineInput
 * + qty + sofa buildKey). Handles all three shapes the recompute pipeline can
 * present: a defensive un-exploded sofa build line (`attrs.sofa_build.cells`), an
 * exploded per-compartment line (`attrs.sofa_build_key` + `attrs.module_code`),
 * and a regular line (category/model/size from the sku map). Per-line (NOT
 * combined) — `resolveDefaultFreeGifts` does its own per-build union + dedup.
 */
function deriveLineInput(line: RecomputableLine, skuInfo: Map<string, SkuInfo>): FreeGiftLineInput {
  const attrs = (line.attrs ?? {}) as Record<string, unknown>;
  const info = skuInfo.get(line.sku) ?? null;
  const qty = Number(line.qty ?? 1);
  // Only an APPENDED gift line (`attrs.free_gift`) is flagged so the SHARED
  // resolver skips it — a gift must never spawn another gift (no recursion). A
  // campaign-freed PAID item (`attrs.free_item`) STILL keeps its default gift:
  // making the mattress free via a "Make free" campaign must not strip the GWP
  // the SKU comes with (Loo 2026-07-06).
  const free = Boolean(attrs.free_gift);

  // Defensive: a still-un-exploded sofa build line carries the full descriptor.
  const sofaBuild = attrs.sofa_build as { cells?: Array<{ moduleCode?: unknown }> } | undefined;
  if (sofaBuild && Array.isArray(sofaBuild.cells)) {
    return {
      category: info?.category || "sofa",
      modelId: info?.modelId ?? null,
      sizeCode: null,
      builtCompartments: sofaBuild.cells
        .map((c) => String(c?.moduleCode ?? "").trim())
        .filter(Boolean),
      qty,
      buildKey: typeof attrs.sofa_build_key === "string" ? attrs.sofa_build_key : null,
      free,
    };
  }

  // Exploded compartment line → one cell, grouped by sofa_build_key.
  const buildKey = typeof attrs.sofa_build_key === "string" ? attrs.sofa_build_key : "";
  const moduleCode = typeof attrs.module_code === "string" ? attrs.module_code.trim() : "";
  if (buildKey) {
    return {
      category: info?.category || "sofa",
      modelId: info?.modelId ?? null,
      sizeCode: null,
      builtCompartments: moduleCode ? [moduleCode] : [],
      qty,
      buildKey,
      free,
    };
  }

  // Regular line — resolve from the sku map.
  const category = info?.category ?? "";
  const isSofa = category.toLowerCase() === "sofa";
  return {
    category,
    modelId: info?.modelId ?? null,
    sizeCode: !isSofa && info?.variant ? info.variant.toUpperCase() : null,
    builtCompartments: [],
    qty,
    buildKey: null,
    free,
  };
}

/* ─── combo→slots map (combo-scope refinements only) ────────────────────────── */

/** Load the combo id → ordered OR-set slots map for any combo-scope refinement,
 *  via RLS. Empty map when none referenced; null on a read error (fail-closed). */
async function loadComboSlots(
  sb: SupabaseClient,
  comboIds: Set<string>,
): Promise<Map<string, string[][]> | null> {
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

/* ─── 1. default free gifts (server-appended RM0 lines) ─────────────────────── */

/**
 * Resolve the deterministic default free gifts a verified order SHOULD contain
 * and return them as APPENDED RM0 lines. Runs AFTER the special-addon recompute
 * (on the post-sofa-explode line set) and BEFORE the delivery recompute (which
 * excludes free lines from its charged-category set). Returns `[]` when nothing
 * is configured (DORMANT) or every gift is misconfigured.
 */
export async function resolveDefaultFreeGiftLines(
  sb: SupabaseClient,
  lines: RecomputableLine[],
): Promise<FreeGiftResolveOutcome> {
  // 0. DORMANT short-circuit (F8) — read the principal-authored gift config FIRST
  //    (the table is tiny + per-model). On the common dormant order (NO gifts
  //    authored) this returns before ANY product_skus / category read, trimming
  //    the failure surface. Read UNFILTERED then filter in JS by the order's
  //    models (mirrors how delivery-fee-recompute reads special rules). Fails
  //    CLOSED on a read error (the configured path stays fail-closed throughout).
  const giftsR = await sb.from(MODEL_DEFAULT_FREE_GIFTS).select("*");
  if (giftsR.error) return { status: "server_error", message: giftsR.error.message };
  const allGiftRows = (giftsR.data ?? []) as DB.ModelDefaultFreeGiftsRow[];
  if (allGiftRows.length === 0) return { status: "ok", lines: [] };

  // 1. Resolve every line's model/category/size (same derivation as delivery).
  const skuRes = await resolveSkuInfo(sb, lines.map((l) => l.sku));
  if (!skuRes.ok) return { status: "server_error", message: skuRes.message };
  const giftLineInputs = lines.map((l) => deriveLineInput(l, skuRes.skuInfo));

  // 2. The distinct models present — bail if none can trigger a gift.
  const modelIds = new Set(
    giftLineInputs.map((l) => l.modelId).filter((m): m is string => Boolean(m)),
  );
  if (modelIds.size === 0) return { status: "ok", lines: [] };

  // 3. Per-model configured gifts for the order's models (the adapter runs
  //    parseDefaultFreeGifts). Filtered from the unfiltered read above.
  const giftsByModelId = new Map<string, DefaultFreeGift[]>();
  for (const row of allGiftRows) {
    const dto = Adapters.modelDefaultFreeGiftsFromRow(row);
    if (modelIds.has(dto.modelId) && dto.gifts.length > 0) giftsByModelId.set(dto.modelId, dto.gifts);
  }
  if (giftsByModelId.size === 0) return { status: "ok", lines: [] };

  // 4. Combo slots for any combo-scope gift condition (sofa builds).
  const comboIds = new Set<string>();
  for (const gifts of giftsByModelId.values()) {
    for (const g of gifts) {
      if (g.condition?.scope === "combo") for (const id of g.condition.comboIds ?? []) comboIds.add(id);
    }
  }
  const comboModulesById = await loadComboSlots(sb, comboIds);
  if (comboModulesById === null) {
    return { status: "server_error", message: "Failed to load sofa combos for free-gift conditions" };
  }

  // 5. The SAME pure resolver the POS preview used (deterministic).
  const desired = resolveDefaultFreeGifts(giftLineInputs, giftsByModelId, comboModulesById);
  if (desired.length === 0) return { status: "ok", lines: [] };

  // 6. Each gift's sku MUST be a real product_skus row whose model is an
  //    ACCESSORY (F4) — fail-SOFT (log + omit a misconfigured gift; never fail
  //    the order on a bad gift sku, and never append a CORE-category line that
  //    would trip the 0089 category mutex and 422 the whole order). Reuses
  //    resolveSkuInfo so the category comes from the same product_models embed.
  const giftSkus = Array.from(new Set(desired.map((d) => d.giftSku)));
  const giftInfoRes = await resolveSkuInfo(sb, giftSkus);
  if (!giftInfoRes.ok) return { status: "server_error", message: giftInfoRes.message };
  const giftInfo = giftInfoRes.skuInfo;

  const appended: RecomputableLine[] = [];
  for (const d of desired) {
    const info = giftInfo.get(d.giftSku);
    if (!info) {
      // eslint-disable-next-line no-console
      console.warn(
        `[free-gift] skipping gift '${d.giftSku}' (model ${d.sourceModelId}) — not a real product_skus row`,
      );
      continue;
    }
    if (info.category.toLowerCase() !== "accessory") {
      // eslint-disable-next-line no-console
      console.warn(
        `[free-gift] skipping gift '${d.giftSku}' (model ${d.sourceModelId}) — category '${info.category}' is not an accessory`,
      );
      continue;
    }
    appended.push({
      sku: d.giftSku,
      qty: d.qty,
      unitPrice: 0,
      attrs: {
        free_gift: {
          giftSku: d.giftSku,
          ...(d.label ? { label: d.label } : {}),
          sourceModelId: d.sourceModelId,
        },
      },
    });
  }
  return { status: "ok", lines: appended };
}

/* ─── 2. free item campaign claims (force existing line to RM0) ──────────────── */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** True iff the line carries a (client) free-item marker. */
function hasFreeItem(attrs: Record<string, unknown> | null): boolean {
  return Boolean(attrs && attrs.free_item);
}

/** Strip the anti-tamper fields from a line's attrs WITHOUT mutating the input.
 *  Always drops `free_gift` (gifts are server-appended only); optionally drops
 *  `free_item` too (re-derived from the validated campaign). Returns the same
 *  reference when nothing changed (so plain lines stay byte-identical). */
function stripClientMarkers(line: RecomputableLine): RecomputableLine {
  const attrs = line.attrs;
  if (!attrs || (!("free_gift" in attrs) && !("free_item" in attrs))) return line;
  const next: Record<string, unknown> = { ...attrs };
  delete next.free_gift;
  delete next.free_item;
  return { ...line, attrs: next };
}

/**
 * Validate the free-item claims on the incoming lines + STRIP client free-gift
 * markers (anti-tamper). Runs FIRST (on the parsed lines, before the sofa
 * recompute). A line with no marker passes through byte-identical. A line marked
 * `attrs.free_item` is re-validated against ACTIVE campaigns; valid → unitPrice
 * forced to 0 + the marker re-derived to `{campaignId,name}`; invalid → a typed
 * bad_request (the route maps it to 409 free_item_not_eligible).
 */
export async function validateFreeItemClaims(
  sb: SupabaseClient,
  lines: RecomputableLine[],
): Promise<FreeItemValidateOutcome> {
  // 0. Strip every client marker first (free_gift always; free_item re-derived
  //    below). Plain lines keep their identity (DORMANT byte-identical).
  const stripped = lines.map(stripClientMarkers);

  // 1. Collect the claimed campaignId per claiming line index.
  const claims: Array<{ index: number; campaignId: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const attrs = lines[i]!.attrs as Record<string, unknown> | null;
    if (!hasFreeItem(attrs)) continue;
    // F2 — free-item is for FLAT lines only. A sofa-build line (carrying
    // attrs.sofa_build) is rejected outright (NOT forced to 0): a build line is
    // recomputed + exploded downstream, so zeroing it here would corrupt the
    // per-compartment split. The route maps bad_request → 409.
    if (attrs && attrs.sofa_build) {
      return {
        status: "bad_request",
        message: "A sofa build cannot be made free — free items apply to flat products only.",
      };
    }
    const fi = (attrs as { free_item?: { campaignId?: unknown } } | null)?.free_item;
    const campaignId = typeof fi?.campaignId === "string" ? fi.campaignId.trim() : "";
    if (!campaignId) {
      return { status: "bad_request", message: "Free item claim is missing a campaign id" };
    }
    claims.push({ index: i, campaignId });
  }
  if (claims.length === 0) return { status: "ok", lines: stripped };

  // 2. ACTIVE campaigns (the adapter runs parseFreeItemEligible).
  const campaignsR = await sb.from(FREE_ITEM_CAMPAIGNS).select("*").eq("active", true);
  if (campaignsR.error) return { status: "server_error", message: campaignsR.error.message };
  const campaigns: FreeItemCampaign[] = ((campaignsR.data ?? []) as DB.FreeItemCampaignRow[]).map((r) =>
    Adapters.freeItemCampaignFromRow(r),
  );

  // 3. Resolve the claiming lines' models/categories/sizes.
  const claimSkus = claims.map((c) => lines[c.index]!.sku);
  const skuRes = await resolveSkuInfo(sb, claimSkus);
  if (!skuRes.ok) return { status: "server_error", message: skuRes.message };

  // 4. Combo slots for any combo-scope campaign target.
  const comboIds = new Set<string>();
  for (const c of campaigns) {
    for (const t of c.eligible as RuleTarget[]) {
      if (t.scope === "combo") for (const id of t.comboIds ?? []) comboIds.add(id);
    }
  }
  const comboModulesById = await loadComboSlots(sb, comboIds);
  if (comboModulesById === null) {
    return { status: "server_error", message: "Failed to load sofa combos for free-item eligibility" };
  }

  // 5. Validate each claim + force the line free. The maxFreeQty cap is a
  //    per-campaign TOTAL across ALL claiming lines (F3) — not a per-line cap —
  //    so two lines each at the limit can't both be freed under a 1-unit campaign.
  const out = [...stripped];
  const freedQtyByCampaign = new Map<string, number>();
  const campaignById = new Map<string, FreeItemCampaign>();
  for (const claim of claims) {
    const line = lines[claim.index]!;
    const li = deriveLineInput(line, skuRes.skuInfo);
    const covering = campaignsCoveringLine(li, campaigns, comboModulesById);
    const matched = covering.find((c) => c.id === claim.campaignId);
    if (!matched) {
      return {
        status: "bad_request",
        message: `This line is not eligible for the claimed free-item campaign.`,
      };
    }
    freedQtyByCampaign.set(matched.id, (freedQtyByCampaign.get(matched.id) ?? 0) + Number(line.qty ?? 1));
    campaignById.set(matched.id, matched);
    // Valid — force RM0 + canonicalise the marker (client price never trusted).
    const base = stripped[claim.index]!;
    out[claim.index] = {
      ...base,
      unitPrice: round2(0),
      attrs: { ...((base.attrs as Record<string, unknown>) ?? {}), free_item: { campaignId: matched.id, name: matched.name } },
    };
  }

  // 6. Per-campaign aggregate cap (F3). A campaign whose TOTAL freed qty across
  //    all claiming lines exceeds its maxFreeQty rejects the POST (→ 409).
  for (const [campaignId, totalFreed] of freedQtyByCampaign) {
    const camp = campaignById.get(campaignId)!;
    if (totalFreed > camp.maxFreeQty) {
      return {
        status: "bad_request",
        message: `Free-item quantity exceeds the campaign limit of ${camp.maxFreeQty}.`,
      };
    }
  }
  return { status: "ok", lines: out };
}
