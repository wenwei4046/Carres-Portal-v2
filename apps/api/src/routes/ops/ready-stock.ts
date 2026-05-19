import { Hono } from "hono";
import { mapPgError } from "../../lib/route-helpers";
import { requireOps } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Ops · Ready Stock (Jess COO 2026-05-19) — Sales-facing sellable view.
 *
 * GET /api/ops/ready-stock — what's available to sell RIGHT NOW.
 * Reads the SAME stock_balances wenwei's Logistics uses. Filters to
 * qty>0, strips internal noise (no PO refs / movement detail). Grouped
 * server-side by SKU with model/supplier context for a clean sales list.
 *
 * The "Book" action (creating an RF order + reserving stock) waits for
 * wenwei's shared import door — this endpoint is READ-only for now.
 */
const opsReadyStockRouter = new Hono<AppEnv>();
opsReadyStockRouter.use("*", requireOps);

opsReadyStockRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  const [balRes, skuRes, modelRes, whRes] = await Promise.all([
    sb.from("stock_balances").select("sku, qty, warehouse_id").gt("qty", 0),
    sb.from("product_skus").select("sku, variant, model_id"),
    sb.from("product_models").select("id, category, name"),
    sb.from("warehouses").select("id, name"),
  ]);
  for (const r of [balRes, skuRes, modelRes, whRes]) {
    if (r.error) {
      const m = mapPgError(r.error);
      return c.json(m.body, m.status);
    }
  }

  const skuMap = new Map<string, any>((skuRes.data ?? []).map((r: any) => [r.sku, r]));
  const modelMap = new Map<string, any>((modelRes.data ?? []).map((r: any) => [r.id, r]));
  const whMap = new Map<string, any>((whRes.data ?? []).map((r: any) => [r.id, r]));

  const items = (balRes.data ?? [])
    .map((row: any) => {
      const sku = skuMap.get(row.sku);
      const model = sku ? modelMap.get(sku.model_id) : null;
      const wh = whMap.get(row.warehouse_id);
      return {
        sku: row.sku,
        available: row.qty,
        warehouse: wh?.name ?? "—",
        category: model?.category ?? "—",
        model: model?.name ?? row.sku,
        variant: sku?.variant ?? "—",
      };
    })
    // Sales only cares about the 3 sellable categories.
    .filter((i: any) => ["mattress", "bedframe", "sofa"].includes(i.category))
    .sort((a: any, b: any) =>
      a.category.localeCompare(b.category) || a.model.localeCompare(b.model),
    );

  return c.json({ items });
});

export default opsReadyStockRouter;
