/**
 * A goods line by its catalogue name (`Carres Cloud · King`), never the bare
 * SKU — the operator reads names. One lookup shared by the Sales Order card
 * and the prepared logistics message.
 */
import { useMemo } from "react";
import { useCatalog } from "@/lib/queries";

export function useGoodsName(): (sku: string) => string {
  const catalogQ = useCatalog();
  return useMemo(() => {
    const models = new Map((catalogQ.data?.models ?? []).map((m) => [m.id, m.name]));
    const skus = new Map((catalogQ.data?.skus ?? []).map((s) => [s.sku, s]));
    return (sku: string) => {
      const found = skus.get(sku);
      if (!found) return sku;
      const model = models.get(found.modelId);
      return model ? `${model} · ${found.variant}` : found.variant;
    };
  }, [catalogQ.data]);
}
