import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
} from "@carres/shared";

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
}

export function buildCatalogIndex(catalog: CatalogResponse): CatalogIndex {
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
      fromPrice += Math.min(...fabrics.map((f) => f.surcharge));
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

  return { skusByModel, fabricsByModel, skuToCategory, productModels, meta };
}
