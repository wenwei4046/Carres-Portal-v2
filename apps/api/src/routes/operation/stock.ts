import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { readAllPages } from "../../lib/route-helpers";
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

  // Every list read is paged: PostgREST stops a read at 1000 rows, and past
  // that the catalog silently lost SKUs. Each page orders by a unique key so
  // no row is skipped or repeated between pages.
  const [warehousesRes, balancesRes, thresholdsRes, skusRes, poLinesRes] = await Promise.all([
    sb.from("warehouses").select("id, name").order("name"),
    // 0366 — availability comes from the UNIT REGISTER through the one
    // authority. `stock_balances` supplies only its alert threshold, which is
    // Settings; it may not answer how much we can offer.
    readAllPages((a, b) => sb
      .from("stock_sku_availability")
      .select("sku, warehouse_id, on_hand, sellable, reserved")
      .order("sku").order("warehouse_id")
      .range(a, b)),
    readAllPages((a, b) => sb
      .from("stock_balances")
      .select("sku, low_threshold")
      .order("sku").order("warehouse_id")
      .range(a, b)),
    readAllPages((a, b) => sb
      .from("product_skus")
      .select("sku, price, product_models(name, category)")
      .is("discontinued_at", null)
      .order("sku")
      .range(a, b)),
    // `purchase_orders.sku/qty` was retired in Phase 4.5 Chunk 2; the live
    // shape is per-line via `purchase_order_lines`. Outstanding = qty -
    // received_qty so partially-received POs still count their remainder.
    readAllPages((a, b) => sb
      .from("purchase_order_lines")
      .select("sku, qty, received_qty, purchase_orders!inner(status)")
      .eq("purchase_orders.status", "open")
      .order("id")
      .range(a, b)),
  ]);
  if (warehousesRes.error) throw new HTTPException(500, { message: warehousesRes.error.message });
  const balances = rowsOrThrow(balancesRes);
  const thresholds = rowsOrThrow(thresholdsRes);
  const skuRows = rowsOrThrow(skusRes);
  const poLines = rowsOrThrow(poLinesRes);

  const warehouses = (warehousesRes.data ?? []).map((w) => ({ id: w.id, name: w.name }));

  type Balance = { qty: number; reserved: number; sellable: number };
  const balanceMap = new Map<string, Map<string, Balance>>();
  const lowThresholdMap = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (balances as any[]).forEach((b) => {
    if (!b.sku || !b.warehouse_id) return;
    let perSku = balanceMap.get(b.sku);
    if (!perSku) {
      perSku = new Map();
      balanceMap.set(b.sku, perSku);
    }
    perSku.set(b.warehouse_id, {
      qty: Number(b.on_hand ?? 0),
      reserved: Number(b.reserved ?? 0),
      sellable: Number(b.sellable ?? 0),
    });
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (thresholds as any[]).forEach((t) => {
    if (!t.sku) return;
    lowThresholdMap.set(t.sku, Number(t.low_threshold ?? 0));
  });

  const incomingMap = new Map<string, number>();
  let openPoLineCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (poLines as any[]).forEach((l) => {
    if (!l.sku) return;
    const outstanding = Math.max(Number(l.qty ?? 0) - Number(l.received_qty ?? 0), 0);
    if (outstanding > 0) {
      incomingMap.set(l.sku, (incomingMap.get(l.sku) ?? 0) + outstanding);
      openPoLineCount += 1;
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const skus = (skuRows as any[]).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = Array.isArray((s as any).product_models) ? (s as any).product_models[0] : (s as any).product_models;
    const perWh = balanceMap.get(s.sku) ?? new Map<string, Balance>();
    // 0368 — SUMMED from the authority, never derived as qty − reserved (that
    // counted a unit in repair as sellable). This column is what the operator
    // can SELL, so it reads `sellable` (exact Units plus bulk pieces on the
    // floor); `available` alone answers the narrower "which exact Unit can a
    // Sales Order bind", which is the drawer's question, not this page's.
    const available = sellableOf(Array.from(perWh.values()));
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

/** The rows of a paged read, or a 500 — never a silently shorter list. */
function rowsOrThrow(read: Awaited<ReturnType<typeof readAllPages>>) {
  if ("error" in read) throw new HTTPException(500, { message: read.error.message });
  if ("tooMany" in read) throw new HTTPException(500);
  return read.rows;
}

/** A SKU's sellable total across warehouses (0368 — summed from the
 *  authority). The stock page and the one-order Work probe use this one sum. */
export function sellableOf(rows: ReadonlyArray<{ sellable: number | string | null }>): number {
  return rows.reduce((acc, row) => acc + Number(row.sellable ?? 0), 0);
}
