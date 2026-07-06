// ----------------------------------------------------------------------------
// POS free-gift / free-item preview helpers (2990s Products parity Phase 7,
// migration 0185). PURE — no React, no IO — so they unit-test cleanly and the
// POS preview reuses the SAME shared resolvers the Hono server runs at order
// create (honest-pricing: the two NEVER drift):
//
//   • previewDefaultGifts — runs the shared `resolveDefaultFreeGifts` over the
//     cart lines + `catalog.modelDefaultFreeGifts` to show the DETERMINISTIC
//     auto-gift(s) as display-only RM0 rows. The server APPENDS these
//     authoritatively — the client NEVER sends a gift line.
//   • coveringCampaignsForLine — the ACTIVE free-item campaigns that cover a
//     cart line (shared `campaignsCoveringLine`), driving the "Make free"
//     affordance. The server re-validates + forces the line to RM0.
//   • markLineFree / unmarkLineFree — toggle a line's `attrs.free_item` marker.
//     A freed line's preview unitPrice is forced to 0 (its real price is parked
//     in the transient `origUnitPrice`, dropped at submit) so the cart total
//     drops by exactly the freed line — no-funding (a free line never funds a
//     discount elsewhere). The server is authoritative regardless.
// ----------------------------------------------------------------------------
import type {
  CatalogResponse,
  FreeGiftLineInput,
  FreeItemCampaign,
} from "@carres/shared";
import { campaignsCoveringLine, resolveDefaultFreeGifts } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";

/** A single auto-gift the cart should display — ONE ROW PER (source model, gift
 *  sku), mirroring the server's one-append-per-DesiredFreeGift so the preview
 *  count matches the booked count (F7). */
export interface GiftPreviewRow {
  /** product_skus.sku of the gift accessory. */
  giftSku: string;
  /** resolved qty for this (source model, gift) row. */
  qty: number;
  /** display name: the sku's description, else the bare code. The configured
   *  campaign label is a REMARK (2990s campaignName), never the product name. */
  name: string;
  /** the optional campaign remark (e.g. "MING PAO CANADA") — muted suffix. */
  campaign?: string;
  /** the product_models.id of the paid line that triggered this gift (rows are
   *  kept separate per source model — the same gift sku from two models = two
   *  rows = two appended server lines). */
  sourceModelId: string;
}

/** Build the comboId → ordered OR-set slots map (for combo-scope conditions /
 *  targets). Empty when the bundle carries no sofa combos. */
function comboModulesMap(catalog: CatalogResponse): Map<string, string[][]> {
  const map = new Map<string, string[][]>();
  for (const c of catalog.sofaCombos ?? []) map.set(c.id, c.slots ?? []);
  return map;
}

/** Build the modelId → category map from the catalog bundle. */
function categoryByModel(catalog: CatalogResponse): Map<string, string> {
  return new Map(catalog.models.map((m) => [m.id, m.category]));
}

/**
 * Flatten ONE cart `DraftLine` to the shared matcher's `FreeGiftLineInput` (a P6
 * RuleLineInput + qty + sofa buildKey). Mirrors the server's `deriveLineInput`
 * so the POS preview and the server resolve a line IDENTICALLY:
 *   - a SofaBuildCanvas line carries `attrs.sofa_build.cells[].moduleCode` +
 *     `attrs.sofa_build_key` → a sofa line whose built compartments are its
 *     cells, grouped by the build key;
 *   - any other line resolves category / model / size from the sku map.
 */
export function toFreeGiftLineInput(
  line: DraftLine,
  catalog: CatalogResponse,
): FreeGiftLineInput {
  const attrs = (line.attrs ?? {}) as Record<string, unknown>;
  const skuRow = catalog.skus.find((s) => s.sku === line.sku) ?? null;
  const modelId = skuRow?.modelId ?? null;
  const category = modelId ? (categoryByModel(catalog).get(modelId) ?? "") : "";
  const qty = Number(line.qty ?? 1);
  // One-way guard (F1): flag a line already FREE so the SHARED resolver skips it
  // as a trigger — the single source of the guard lives in resolveDefaultFreeGifts.
  const free = Boolean(attrs.free_item) || Boolean(attrs.free_gift);

  // A sofa BUILD line (the SofaBuildCanvas single line) carries the full
  // geometry descriptor; its built compartments are the cell module codes.
  const sofaBuild = attrs.sofa_build as { cells?: Array<{ moduleCode?: unknown }> } | undefined;
  if (sofaBuild && Array.isArray(sofaBuild.cells)) {
    return {
      category: category || "sofa",
      modelId,
      sizeCode: null,
      builtCompartments: sofaBuild.cells
        .map((c) => String(c?.moduleCode ?? "").trim())
        .filter(Boolean),
      qty,
      buildKey: typeof attrs.sofa_build_key === "string" ? attrs.sofa_build_key : null,
      free,
    };
  }

  const isSofa = category.toLowerCase() === "sofa";
  return {
    category,
    modelId,
    sizeCode: !isSofa && skuRow?.variant ? String(skuRow.variant).toUpperCase() : null,
    builtCompartments: [],
    qty,
    buildKey: null,
    free,
  };
}

/**
 * The deterministic default free gift(s) the cart SHOULD show. Returns `[]` when
 * nothing is configured (DORMANT — zero behaviour change). The one-way guard (a
 * free line never triggers a gift) lives in the SHARED `resolveDefaultFreeGifts`
 * (each line carries the `free` flag set by `toFreeGiftLineInput`) so the preview
 * and the server share ONE source of the rule.
 *
 * Two faithfulness fixes (F7): (a) a desired gift whose `giftSku` is NOT a real
 * ACCESSORY sku in the catalog is dropped — the server would fail-soft drop it
 * too, so the preview must not show it; (b) rows are kept ONE PER (source model,
 * gift sku) — NOT merged across models — so the preview count equals the server's
 * one-append-per-DesiredFreeGift booked count.
 */
export function previewDefaultGifts(
  lines: DraftLine[],
  catalog: CatalogResponse,
): GiftPreviewRow[] {
  const configured = catalog.modelDefaultFreeGifts ?? [];
  if (configured.length === 0) return [];

  const giftsByModelId = new Map(configured.map((g) => [g.modelId, g.gifts]));
  const comboModulesById = comboModulesMap(catalog);

  // Pass EVERY line (the shared resolver skips lines flagged `free`).
  const triggerInputs = lines.map((l) => toFreeGiftLineInput(l, catalog));

  const desired = resolveDefaultFreeGifts(triggerInputs, giftsByModelId, comboModulesById);
  if (desired.length === 0) return [];

  // F7a — a gift sku must be a real ACCESSORY sku in the catalog bundle (the set
  // of accessory-model skus). A gift the server would fail-soft drop is hidden.
  const accessoryModelIds = new Set(
    catalog.models.filter((m) => m.category.toLowerCase() === "accessory").map((m) => m.id),
  );
  const skuByCode = new Map(catalog.skus.map((s) => [s.sku, s]));
  const isAccessorySku = (giftSku: string): boolean => {
    const s = skuByCode.get(giftSku);
    return !!s && accessoryModelIds.has(s.modelId);
  };

  // Friendly display name: sku description → bare code. The configured label is
  // the CAMPAIGN remark (2990s campaignName) — it rides along muted, it never
  // replaces the product name (Loo 2026-07-06: "Free gift: dfdf").
  const descBySku = new Map(catalog.skus.map((s) => [s.sku, s.description ?? ""]));
  // F7b — one row per (source model, gift sku): do NOT merge the same gift sku
  // across source models (each model's gift is a distinct appended server line).
  const merged = new Map<string, GiftPreviewRow>();
  for (const d of desired) {
    if (!isAccessorySku(d.giftSku)) continue;
    const name = descBySku.get(d.giftSku) || d.giftSku;
    const key = `${d.sourceModelId}__${d.giftSku}`;
    const cur = merged.get(key);
    if (cur) cur.qty += d.qty;
    else
      merged.set(key, {
        giftSku: d.giftSku,
        qty: d.qty,
        name,
        ...(d.label ? { campaign: d.label } : {}),
        sourceModelId: d.sourceModelId,
      });
  }
  return [...merged.values()];
}

/** Every ACTIVE free-item campaign that covers this cart line (shared matcher).
 *  Combo / sofa-build lines route through the same `campaignsCoveringLine`. */
export function coveringCampaignsForLine(
  line: DraftLine,
  catalog: CatalogResponse,
): FreeItemCampaign[] {
  // F2 — free-item is for FLAT lines only; never offer "Make free" on a
  // sofa-build line (the server rejects such a claim with 409).
  if ((line.attrs as Record<string, unknown> | null)?.sofa_build) return [];
  const campaigns = catalog.freeItemCampaigns ?? [];
  if (campaigns.length === 0) return [];
  // catalog.freeItemCampaigns is already the camelCase domain shape; pass through.
  const li = toFreeGiftLineInput(line, catalog);
  return campaignsCoveringLine(li, campaigns as FreeItemCampaign[], comboModulesMap(catalog));
}

/** The campaign id a line is claimed free under, or null. */
export function lineFreeItemCampaignId(line: DraftLine): string | null {
  const fi = (line.attrs as Record<string, unknown> | null)?.free_item as
    | { campaignId?: unknown }
    | undefined;
  return typeof fi?.campaignId === "string" ? fi.campaignId : null;
}

/** True when the line is currently claimed free under a campaign. */
export function isLineFreeItem(line: DraftLine): boolean {
  return lineFreeItemCampaignId(line) !== null;
}

/**
 * Mark a cart line FREE under `campaign`: stamp `attrs.free_item` and force the
 * preview unitPrice to 0, parking the real price in the transient `origUnitPrice`
 * (dropped at submit — DealerPos sends only sku/qty/attrs/unitPrice). The server
 * re-validates the claim + forces 0 regardless; the client price is never trusted.
 */
export function markLineFree(line: DraftLine, campaign: FreeItemCampaign): DraftLine {
  const orig = typeof line.origUnitPrice === "number" ? line.origUnitPrice : line.unitPrice;
  return {
    ...line,
    unitPrice: 0,
    origUnitPrice: orig,
    attrs: {
      ...((line.attrs as Record<string, unknown> | null) ?? {}),
      free_item: { campaignId: campaign.id, name: campaign.name },
    },
  };
}

/** Revert a freed line to its real price + strip the `attrs.free_item` marker. */
export function unmarkLineFree(line: DraftLine): DraftLine {
  const orig = typeof line.origUnitPrice === "number" ? line.origUnitPrice : line.unitPrice;
  const attrs = { ...((line.attrs as Record<string, unknown> | null) ?? {}) };
  delete attrs.free_item;
  // Drop the transient origUnitPrice so a reverted line is byte-identical again.
  const { origUnitPrice: _drop, ...rest } = line;
  void _drop;
  return {
    ...rest,
    unitPrice: orig,
    attrs: Object.keys(attrs).length ? attrs : null,
  };
}
