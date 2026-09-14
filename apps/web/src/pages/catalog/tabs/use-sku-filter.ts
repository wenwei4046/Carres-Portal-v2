import { useMemo, useState } from "react";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";

export type CatFilter = ProductCategory | "all";

export interface FlatRow {
  sku: ProductSkuDto;
  model: ProductModelDto | undefined;
  category: ProductCategory | undefined;
  productName: string;
}

/** The filter both SKU grids share (SKU Master and SKU cost): category, model,
 *  supplier and search, sorted by SKU code. */
export function useSkuFilter(catalog: CatalogResponse) {
  const [category, setCategory] = useState<CatFilter>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  /* 2026-08-24 - filter by WHO supplies it. "all" | "none" (no supplier on
   * the SKU) | a suppliers.id. Names come from the roster and are matched by
   * the FK, never by text - the same identity rule the Suppliers tab lives by. */
  const [supplierFilter, setSupplierFilter] = useState<string>("all");

  const allRows = useMemo<FlatRow[]>(() => {
    const modelById = new Map(catalog.models.map((m) => [m.id, m]));
    return catalog.skus.map((sku) => {
      const model = modelById.get(sku.modelId);
      return {
        sku,
        model,
        category: model?.category,
        productName: model?.name ?? "—",
      };
    });
  }, [catalog.models, catalog.skus]);

  // Models for the model pill row — scoped to the active category so the row
  // isn't a flat 1000-model list; hidden entirely while category is "all".
  const categoryModels = useMemo(
    () =>
      catalog.models
        .filter((m) => category === "all" || m.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.models, category],
  );

  // Switching category invalidates a model pick from the previous category —
  // reset synchronously in the same handler so there's no stale-filter frame.
  function pickCategory(next: CatFilter) {
    setCategory(next);
    setModelFilter("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => (category === "all" ? true : r.category === category))
      .filter((r) => (modelFilter === "all" ? true : r.sku.modelId === modelFilter))
      .filter((r) =>
        supplierFilter === "all"
          ? true
          : supplierFilter === "none"
            ? r.sku.supplierId == null
            : r.sku.supplierId === supplierFilter,
      )
      .filter((r) => {
        if (!q) return true;
        return (
          r.sku.sku.toLowerCase().includes(q) ||
          (r.sku.description ?? "").toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.sku.variant.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.sku.sku.localeCompare(b.sku.sku));
  }, [allRows, category, modelFilter, search, supplierFilter]);

  return {
    category,
    pickCategory,
    modelFilter,
    setModelFilter,
    search,
    setSearch,
    supplierFilter,
    setSupplierFilter,
    categoryModels,
    filtered,
  };
}
