import type {
  CatalogResponse,
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
 * Mattress/bedframe/sofa/accessory models with ≥1 sellable sku become product
 * cards (accessories get the generic pick-option configurator — 2990s shows
 * them as cards too); service models carry no card (service backs the
 * add-ons list).
 */

/** Categories that render as product cards in the POS grid.
 *  0261 — 'guarantee' is a card too, but it is NOT self-serve: picking it opens
 *  the covered-item picker (GuaranteePickerModal) instead of a configurator,
 *  because a guarantee with nothing attached is untraceable at claim time. */
export const POS_CARD_CATEGORIES: ProductCategory[] = [
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
  "guarantee",
];

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
  for (const s of catalog.skus) {
    const model = modelById.get(s.modelId);
    if (model) skuToCategory.set(s.sku, model.category);
  }

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
    const optionNoun = m.category === "sofa" || m.category === "accessory" ? "option" : "size";

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
  };
}
