import type {
  CatalogResponse,
  DeliveryFeeResult,
  FloorConfigDto,
  Order,
  RuleLineInput,
} from "@carres/shared";
import { computeDeliveryFee, specialModelsForLines } from "@carres/shared";

/**
 * Pure-function order math. Mirrors the prototype helpers (proto/store.jsx
 * lines 562-570) but uses the unit_price stored on the line/addon at order
 * time — no live SKU lookup.
 *
 * Stair-carry rule (from proto):
 *   - if delivery has a lift → 0
 *   - if delivery floor ≤ floor_config.free_up_to_floor → 0
 *   - else: (floor − freeUpToFloor) × perFloorPerItem × total_qty
 *
 * Caller passes the catalog's floorConfig (fetched once via useCatalog) so
 * total math is purely client-side and no extra fetch fires per order render.
 */

export function lineSubtotal(order: Order): number {
  return (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

export function addonSubtotal(order: Order): number {
  return (order.addons ?? []).reduce((s, a) => s + a.unitPrice * a.qty, 0);
}

export function totalItems(order: Order): number {
  return (order.lines ?? []).reduce((s, l) => s + l.qty, 0);
}

/* ⭐ THE STAIR ARITHMETIC MOVED TO `@carres/shared` (2026-08-29).

   It was defined here, and `apps/web` is a place the Worker cannot import
   from — so the fee the customer signed for was computed in the browser on
   every render and never written down. The server now stamps it onto the
   order as an `order_addons` row, which it can only do if it can run the
   same function.

   Re-exported rather than re-imported at each call site: every existing
   caller keeps its import, and there is still ONE implementation.

   Imported AND re-exported: this file still uses both itself, and a bare
   `export ... from` would not bind them locally. */
import { floorSurchargeRaw, stairCarryCount } from "@carres/shared";
export { floorSurchargeRaw, stairCarryCount };

export function floorSurcharge(order: Order, cfg: FloorConfigDto): number {
  const itemsTotal = (order.lines ?? []).reduce((n, l) => n + l.qty, 0);
  const count = stairCarryCount(itemsTotal, order.delivery.stairItems);
  return floorSurchargeRaw(order.delivery.floor, order.delivery.hasLift, count, cfg);
}

export function orderTotal(order: Order, cfg: FloorConfigDto): number {
  return lineSubtotal(order) + addonSubtotal(order) + floorSurcharge(order, cfg);
}

// ---------------------------------------------------------------------------
// 0184 — delivery TRIP fee PREVIEW (2990s Products parity Phase 6). The POS
// preview runs the SAME pure `computeDeliveryFee` the Hono recompute uses, so
// the dealer sees the fee the server will charge in the common case. The server
// is AUTHORITATIVE (it re-runs the engine against fresh config + rules and
// appends the fee as order_addons); this is preview-only and is NOT submitted.
//
// The floor STAIR surcharge (floorSurcharge above) is a DIFFERENT charge and is
// KEPT — the delivery trip fee is ADDITIVE.
// ---------------------------------------------------------------------------

/** A cart line reduced to what the delivery matcher needs (structural subset of
 *  a `DraftLine` / `OrderLine` — `sku` + free-form `attrs`). */
export interface DeliveryCartLine {
  sku: string;
  attrs: Record<string, unknown> | null;
}

/** Flatten cart lines → `RuleLineInput[]` (mirrors the Hono recompute's
 *  `buildRuleLines`): resolve each sku → model/category/variant from the catalog
 *  bundle; a sofa build line (attrs.sofa_build.cells) contributes its module
 *  codes as `builtCompartments`. Pure. */
export function buildDeliveryRuleLines(
  lines: DeliveryCartLine[],
  catalog: CatalogResponse,
): RuleLineInput[] {
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));
  const skuInfo = new Map<string, { modelId: string | null; category: string; variant: string | null }>();
  for (const s of catalog.skus) {
    skuInfo.set(s.sku, {
      modelId: s.modelId ?? null,
      category: modelById.get(s.modelId)?.category ?? "",
      variant: s.variant ?? null,
    });
  }

  const out: RuleLineInput[] = [];
  for (const line of lines) {
    const attrs = (line.attrs ?? {}) as Record<string, unknown>;
    const info = skuInfo.get(line.sku) ?? null;

    // A sofa build line carries the full geometry descriptor (POS builds are
    // NOT exploded client-side — the explode happens server-side on submit).
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

    const category = info?.category ?? "";
    const isSofa = category.toLowerCase() === "sofa";
    out.push({
      category,
      modelId: info?.modelId ?? null,
      sizeCode: !isSofa && info?.variant ? info.variant.toUpperCase() : null,
      builtCompartments: [],
    });
  }
  return out;
}

/** Structural subset of the POS `WizardDraft` that `draftTotals` reads — kept
 *  structural (like `DeliveryCartLine`) so this lib module doesn't import the
 *  page-level draft type. A `WizardDraft` satisfies it as-is. */
export interface DraftTotalsInput {
  lines: Array<DeliveryCartLine & { qty: number; unitPrice: number }>;
  addons: Array<{ qty: number; unitPrice: number }>;
  delivery: { floor: number; hasLift: boolean; stairItems: number | null };
  additionalDeliveryFee?: number;
  crossCategorySourceSo?: string;
}

export interface DraftTotals {
  lineSub: number;
  addonSub: number;
  /** Stair-carry surcharge — dealer-picked `stairItems` count (clamped to the
   *  cart's unit total; null = all items), same semantics as `floorSurcharge`. */
  stair: number;
  /** 0184 delivery TRIP fee preview breakdown (null when the bundle carries no
   *  `deliveryFeeConfig`). Server-authoritative at submit; preview-only here. */
  delivery: DeliveryFeeResult | null;
  deliveryTotal: number;
  /** lineSub + addonSub + stair + deliveryTotal. */
  grand: number;
}

/**
 * Live POS draft totals — THE single source for every total the POS shows
 * (Step-3 recap, OrderSummaryRail, DealerPos footer), so they can never drift
 * (Loo 2026-07-12: the summary rail said RM 2,570 while the footer said
 * RM 2,920 — the rail was omitting stair carry + the delivery fee).
 */
export function draftTotals(draft: DraftTotalsInput, catalog: CatalogResponse): DraftTotals {
  const lineSub = draft.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const addonSub = draft.addons.reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const itemsTotal = draft.lines.reduce((s, l) => s + l.qty, 0);
  /* Unset = NONE (owner ruling 2026-08-27) — the same rule `floorSurcharge`
     applies to a saved order, so the wizard preview and the order detail
     cannot quote two different stair fees. */
  const stairItems = stairCarryCount(itemsTotal, draft.delivery.stairItems);
  const stair = floorSurchargeRaw(
    draft.delivery.floor,
    draft.delivery.hasLift,
    stairItems,
    catalog.floorConfig,
  );
  const delivery = deliveryFeePreview(draft.lines, catalog, {
    additionalFee: Math.max(0, draft.additionalDeliveryFee ?? 0),
    isCrossCategoryFollowup: (draft.crossCategorySourceSo ?? "").trim().length > 0,
  });
  const deliveryTotal = delivery?.total ?? 0;
  return {
    lineSub,
    addonSub,
    stair,
    delivery,
    deliveryTotal,
    grand: lineSub + addonSub + stair + deliveryTotal,
  };
}

/**
 * POS delivery-fee preview. Returns null when the bundle carries no
 * `deliveryFeeConfig` (pre-0184 / not loaded). Dormant config (0/0) + no
 * matching special rule + no additional fee → a 0 result (the caller hides
 * 0 lines, so totals stay byte-identical).
 */
export function deliveryFeePreview(
  lines: DeliveryCartLine[],
  catalog: CatalogResponse,
  opts?: { additionalFee?: number; isCrossCategoryFollowup?: boolean },
): DeliveryFeeResult | null {
  const config = catalog.deliveryFeeConfig;
  if (!config) return null;

  const ruleLines = buildDeliveryRuleLines(lines, catalog);

  // Distinct charged categories present (∩ config.chargedCategories).
  const chargedSet = new Set(config.chargedCategories.map((c) => c.toLowerCase()));
  const present = new Set<string>();
  for (const l of ruleLines) {
    const cat = l.category.toLowerCase();
    if (cat && chargedSet.has(cat)) present.add(cat);
  }

  // combo subset matching needs the combo id → slots map (sofa combos).
  const comboModulesById = new Map<string, string[][]>(
    (catalog.sofaCombos ?? []).map((c) => [c.id, c.slots]),
  );

  const rules = (catalog.specialDeliveryFeeRules ?? [])
    .filter((r) => r.active)
    .map((r) => ({
      target: r.target,
      standaloneFee: r.standaloneFee,
      crossCategoryFollowupFee: r.crossCategoryFollowupFee,
    }));
  const specialModels = specialModelsForLines(ruleLines, rules, comboModulesById);

  return computeDeliveryFee(
    {
      categoryIds: Array.from(present),
      specialModels,
      isCrossCategoryFollowup: opts?.isCrossCategoryFollowup ?? false,
      additionalFee: opts?.additionalFee ?? 0,
    },
    config,
  );
}
