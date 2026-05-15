import { Hono } from "hono";
import { mapPgError } from "../../lib/route-helpers";
import { requireOps } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Ops · Stock Inventory (Jess COO 2026-05-14).
 *
 * GET /api/ops/inventory — read-only view of stock_balances enriched with
 * SKU/model/supplier/warehouse metadata. PostgREST can't auto-join
 * stock_balances.sku (text) → product_skus.sku without a FK, so we fetch
 * separately and merge server-side. Returns one row per (sku, warehouse).
 *
 * Reads SAME shared tables wenwei's logistics uses — updates flow both ways.
 */
const opsInventoryRouter = new Hono<AppEnv>();
opsInventoryRouter.use("*", requireOps);

opsInventoryRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  const [balancesRes, skusRes, modelsRes, suppliersRes, warehousesRes] = await Promise.all([
    sb.from("stock_balances").select("sku, qty, warehouse_id"),
    sb.from("product_skus").select("sku, variant, variant_kind, price, model_id, supplier_id"),
    sb.from("product_models").select("id, category, model_key, name"),
    sb.from("suppliers").select("id, name"),
    sb.from("warehouses").select("id, name, kind"),
  ]);
  for (const r of [balancesRes, skusRes, modelsRes, suppliersRes, warehousesRes]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  }

  type SkuRow = { sku: string; variant: string; variant_kind: string; price: number; model_id: string; supplier_id: string };
  type ModelRow = { id: string; category: string; model_key: string; name: string };
  type SupplierRow = { id: string; name: string };
  type WarehouseRow = { id: string; name: string; kind: string };

  const skuMap = new Map<string, SkuRow>((skusRes.data ?? []).map((r: any) => [r.sku, r]));
  const modelMap = new Map<string, ModelRow>((modelsRes.data ?? []).map((r: any) => [r.id, r]));
  const supplierMap = new Map<string, SupplierRow>((suppliersRes.data ?? []).map((r: any) => [r.id, r]));
  const warehouseMap = new Map<string, WarehouseRow>(
    (warehousesRes.data ?? []).map((r: any) => [r.id, r]),
  );

  const items = (balancesRes.data ?? []).map((row: any) => {
    const sku = skuMap.get(row.sku);
    const model = sku ? modelMap.get(sku.model_id) : null;
    const supplier = sku ? supplierMap.get(sku.supplier_id) : null;
    const warehouse = warehouseMap.get(row.warehouse_id);
    return {
      sku: row.sku,
      qty: row.qty,
      warehouse_id: row.warehouse_id,
      warehouse: warehouse ? { id: warehouse.id, name: warehouse.name, kind: warehouse.kind } : null,
      product: sku
        ? {
            sku: sku.sku,
            variant: sku.variant,
            variant_kind: sku.variant_kind,
            price: sku.price,
            model: model ? { category: model.category, model_key: model.model_key, name: model.name } : null,
            supplier: supplier ? { name: supplier.name } : null,
          }
        : null,
    };
  });

  return c.json({ items });
});

export default opsInventoryRouter;
