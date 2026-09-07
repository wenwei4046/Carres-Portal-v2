import type { StockRegisterUnit } from "@carres/shared";
import type { userClient } from "./supabase";

/** Source facts enrich exact Units; no source is allowed to add a stock row. */
export async function stockRegisterContext(sb: ReturnType<typeof userClient>, units: StockRegisterUnit[]) {
  const skus = [...new Set(units.map((u) => u.sku))];
  const pos = [...new Set(units.flatMap((u) => u.poNo ? [u.poNo] : []))];
  const orders = [...new Set(units.flatMap((u) => u.soldOrderId ? [u.soldOrderId] : []))];
  const empty = { data: [], error: null };
  const [catalog, purchases, sales] = await Promise.all([
    skus.length ? sb.from("product_skus").select("sku, variant, product_models(name)").in("sku", skus) : empty,
    pos.length ? sb.from("purchase_orders").select("id, placed_at, eta_date, purpose").in("id", pos) : empty,
    orders.length ? sb.from("orders").select("id, placed_at").in("id", orders) : empty,
  ]);
  for (const result of [catalog, purchases, sales]) if (result.error) throw result.error;
  const names = new Map<string, string>();
  for (const row of catalog.data ?? []) {
    const model = Array.isArray(row.product_models) ? row.product_models[0] : row.product_models;
    if (model?.name) names.set(row.sku, [model.name, row.variant].filter(Boolean).join(" · "));
  }
  const poById = new Map((purchases.data ?? []).map((po) => [po.id, po]));
  const orderById = new Map((sales.data ?? []).map((order) => [order.id, order]));
  return units.map((unit) => ({
    ...unit,
    productName: names.get(unit.sku) ?? null,
    poDate: unit.poNo ? poById.get(unit.poNo)?.placed_at ?? null : null,
    expectedArrival: unit.poNo ? poById.get(unit.poNo)?.eta_date ?? null : null,
    purchasePurpose: unit.poNo ? poById.get(unit.poNo)?.purpose ?? null : null,
    soDate: unit.soldOrderId ? orderById.get(unit.soldOrderId)?.placed_at ?? null : null,
  }));
}
