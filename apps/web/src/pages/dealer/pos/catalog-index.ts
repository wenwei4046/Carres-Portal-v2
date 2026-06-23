import type {
  CatalogResponse,
  ComboDto,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
} from "@carres/shared";
import { resolveFabricDelta } from "@carres/shared";

/**
 * Derived, memoizable view of the catalog bundle for the POS grid: per-model
 * sku/fabric indexes, the sku→category map (for the sofa mutex), and per-model
 * from-price / option-count / search blob. Pure so it unit-tests cleanly.
 *
 * Only mattress/bedframe/sofa models with ≥1 sellable sku become product
 * cards — accessory/service models carry no variant axis and are surfaced
 * elsewhere (service backs the add-ons list).
 */

/** Categories that render as configurable product cards in the POS grid. */
export const POS_CARD_CATEGORIES: ProductCategory[] = ["mattress", "bedframe", "sofa"];

export interface ModelMeta {
  fromPrice: number;
  optionCount: number;
  /** "size" for mattress/bedframe, "option" for sofa. */
  optionNoun: string;
  /** Lowercased searchable text (name, key, blurb, sku codes, variants, fabrics). */
  searchBlob: string;
}

export interface CatalogIndex {
  skusByModel: Map<string, ProductSkuDto[]>;
  fabricsByModel: Map<string, SofaFabricDto[]>;
  skuToCategory: Map<string, ProductCategory>;
  /** Sellable product-card models in catalog order. */
  productModels: ProductModelDto[];
  meta: Map<string, ModelMeta>;
  /** Flat sku → SELLING price (the combo explode weight source). Built from
   *  every sku in the (already pos_active-filtered) bundle. */
  skuPrice: Map<string, number>;
  /** Flat sku → human label (description || "model · variant" || sku code).
   *  Used to name the exploded combo component lines in the cart. */
  skuLabel: Map<string, string>;
  /** Active fixed-set combos (套餐) to render as POS combo cards. Empty array
   *  when the bundle carries no combos (pre-0177 / no combos defined) → the
   *  Combos section is simply not rendered. */
  combos: ComboDto[];
}

export function buildCatalogIndex(
  catalog: CatalogResponse,
  fabricTierConfig?: FabricTierGlobalConfig | null,
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null,
): CatalogIndex {
  const skusByModel = new Map<string, ProductSkuDto[]>();
  for (const s of catalog.skus) {
    const arr = skusByModel.get(s.modelId) ?? [];
    arr.push(s);
    skusByModel.set(s.modelId, arr);
  }

  const fabricsByModel = new Map<string, SofaFabricDto[]>();
  for (const f of catalog.sofaFabrics) {
    const arr = fabricsByModel.get(f.modelId) ?? [];
    arr.push(f);
    fabricsByModel.set(f.modelId, arr);
  }

  const modelById = new Map(catalog.models.map((m) => [m.id, m]));
  const skuToCategory = new Map<string, ProductCategory>();
  // Flat sku → selling price + human label, used by the combo explode helper.
  // Label mirrors how product cards name a variant: description, else
  // "model name · variant", else the bare sku code.
  const skuPrice = new Map<string, number>();
  const skuLabel = new Map<string, string>();
  for (const s of catalog.skus) {
    const model = modelById.get(s.modelId);
    if (model) skuToCategory.set(s.sku, model.category);
    skuPrice.set(s.sku, s.price);
    const label =
      (s.description && s.description.trim()) ||
      (model ? `${model.name} · ${s.variant}` : s.variant) ||
      s.sku;
    skuLabel.set(s.sku, label);
  }

  // Active combos only (the GET already filters non-admin to active; filter
  // defensively here too). Empty/absent → no Combos section in the grid.
  const combos = (catalog.combos ?? []).filter((c) => c.active);

  const productModels: ProductModelDto[] = [];
  const meta = new Map<string, ModelMeta>();
  for (const m of catalog.models) {
    if (!POS_CARD_CATEGORIES.includes(m.category)) continue;
    const skus = skusByModel.get(m.id) ?? [];
    if (skus.length === 0) continue; // no sellable variant → not a card
    productModels.push(m);

    const fabrics = fabricsByModel.get(m.id) ?? [];
    let fromPrice = Math.min(...skus.map((s) => s.price));
    if (m.category === "sofa" && fabrics.length > 0) {
      // Use tier-based delta for from-price. Per-model override resolved once
      // per model; fallback to global config; fallback to 0 (pre-0176 bundles).
      const overrideForModel = modelFabricTierOverrides?.find((o) => o.modelId === m.id) ?? null;
      const minDelta = Math.min(
        ...fabrics.map((f) =>
          resolveFabricDelta(f.tier ?? "PRICE_1", overrideForModel, fabricTierConfig ?? null),
        ),
      );
      fromPrice += minDelta;
    }

    const optionCount =
      m.category === "sofa"
        ? skus.filter((s) => s.variantKind === "preset").length || skus.length
        : skus.filter((s) => s.variantKind === "size").length || skus.length;
    const optionNoun = m.category === "sofa" ? "option" : "size";

    const searchBlob = [
      m.name,
      m.modelKey,
      m.blurb ?? "",
      ...skus.map((s) => `${s.sku} ${s.variant}`),
      ...fabrics.map((f) => f.fabricName),
    ]
      .join(" ")
      .toLowerCase();

    meta.set(m.id, { fromPrice, optionCount, optionNoun, searchBlob });
  }

  return {
    skusByModel,
    fabricsByModel,
    skuToCategory,
    productModels,
    meta,
    skuPrice,
    skuLabel,
    combos,
  };
}
