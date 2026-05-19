import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/stock — Phase 10 cross-warehouse stock observation. Mirrors
 * `reference/proto/principal-views.jsx` L80-138.
 *
 * GET /
 *   - returns warehouses[], skus[] (with per-warehouse qty/reserved/available),
 *     and a tally of POs in-flight per SKU as `incoming`.
 *
 * 2026-05-19 — moved from /api/principal/stock. The kicker on the proto's own
 * stock view reads "HQ · Operations"; this page primarily serves operation
 * (daily picking/dispatch). Principal kept as admit-list for oversight deep
 * links (e.g. drill-from-dashboard) but the tab lives in the Operation
 * sidebar now.
 */
const operationStockRouter = new Hono<AppEnv>();

operationStockRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "Operation/Principal only" });
  }
  await next();
});

operationStockRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);

  const [warehousesRes, balancesRes, skusRes, poLinesRes] = await Promise.all([
    sb.from("warehouses").select("id, name").order("name"),
    sb.from("stock_balances").select("sku, warehouse_id, qty, reserved, low_threshold"),
    sb
      .from("product_skus")
      .select("sku, price, product_models(name, category)")
      .is("discontinued_at", null),
    // `purchase_orders.sku/qty` was retired in Phase 4.5 Chunk 2; the live
    // shape is per-line via `purchase_order_lines`. Outstanding = qty -
    // received_qty so partially-received POs still count their remainder.
    sb
      .from("purchase_order_lines")
      .select("sku, qty, received_qty, purchase_orders!inner(status)")
      .eq("purchase_orders.status", "open"),
  ]);
  if (warehousesRes.error) throw new HTTPException(500, { message: warehousesRes.error.message });
  if (balancesRes.error) throw new HTTPException(500, { message: balancesRes.error.message });
  if (skusRes.error) throw new HTTPException(500, { message: skusRes.error.message });
  if (poLinesRes.error) throw new HTTPException(500, { message: poLinesRes.error.message });

  const warehouses = (warehousesRes.data ?? []).map((w) => ({ id: w.id, name: w.name }));

  type Balance = { qty: number; reserved: number };
  const balanceMap = new Map<string, Map<string, Balance>>();
  const lowThresholdMap = new Map<string, number>();
  (balancesRes.data ?? []).forEach((b) => {
    if (!b.sku || !b.warehouse_id) return;
    let perSku = balanceMap.get(b.sku);
    if (!perSku) {
      perSku = new Map();
      balanceMap.set(b.sku, perSku);
    }
    perSku.set(b.warehouse_id, {
      qty: Number(b.qty ?? 0),
      reserved: Number(b.reserved ?? 0),
    });
    lowThresholdMap.set(b.sku, Number(b.low_threshold ?? 0));
  });

  const incomingMap = new Map<string, number>();
  let openPoLineCount = 0;
  (poLinesRes.data ?? []).forEach((l) => {
    if (!l.sku) return;
    const outstanding = Math.max(Number(l.qty ?? 0) - Number(l.received_qty ?? 0), 0);
    if (outstanding > 0) {
      incomingMap.set(l.sku, (incomingMap.get(l.sku) ?? 0) + outstanding);
      openPoLineCount += 1;
    }
  });

  const skus = (skusRes.data ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = Array.isArray((s as any).product_models) ? (s as any).product_models[0] : (s as any).product_models;
    const perWh = balanceMap.get(s.sku) ?? new Map<string, Balance>();
    const totals = Array.from(perWh.values()).reduce(
      (acc, b) => ({ qty: acc.qty + b.qty, reserved: acc.reserved + b.reserved }),
      { qty: 0, reserved: 0 },
    );
    const available = totals.qty - totals.reserved;
    return {
      sku: s.sku,
      name: model?.name ?? s.sku,
      category: model?.category ?? null,
      price: Number(s.price ?? 0),
      available,
      lowThreshold: lowThresholdMap.get(s.sku) ?? 0,
      incoming: incomingMap.get(s.sku) ?? 0,
      perWarehouse: Object.fromEntries(
        warehouses.map((w) => [
          w.id,
          {
            qty: perWh.get(w.id)?.qty ?? 0,
            reserved: perWh.get(w.id)?.reserved ?? 0,
          },
        ]),
      ),
    };
  });

  return c.json({
    warehouses,
    skus,
    summary: {
      totalSkus: skus.length,
      lowStockCount: skus.filter((s) => s.available <= Math.max(s.lowThreshold, 1)).length,
      openPos: openPoLineCount,
    },
  });
});

export default operationStockRouter;
