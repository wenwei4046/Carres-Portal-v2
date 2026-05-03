import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { DB } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/warehouse — Phase 4 M4 backend warehouse subsystem.
 *
 * Endpoints implemented in this task (M4 Task 1):
 *   GET / — composed query: warehouses + stock_balances aggregated per
 *           warehouse with low_stock flags.
 *
 * Future M4 tasks add: POST /adjust (RPC wrap), GET /movements (list).
 *
 * Aggregation contract (per spec §18.5):
 *   - low_stock_status badge is row-level (per SKU). Spec §18.5 wording:
 *     "OK (green) / Low (yellow, total ≤1) / Out (red, total = 0)".
 *   - Status uses qty thresholds (NOT qty-vs-reserved). Inline plan comment
 *     "Out=0, Low=1, OK>1" matches §18.5.
 *   - byWarehouse[wh_id][i].low_stock_status uses that warehouse's qty.
 *   - totalsBySku[sku].low_stock_status_aggregate uses summed qty across
 *     all warehouses (drives the "All warehouses" column badge).
 *
 * Response shape:
 *   {
 *     warehouses: { id, name, address }[],            // sorted by name
 *     byWarehouse: Record<wh_id, StockRow[]>,         // [] if no balances
 *     totalsBySku: Record<sku, { total_qty, total_reserved, low_stock_status_aggregate }>,
 *   }
 *
 * Pattern: matches sibling logistics/orders.ts dual-from composed reads with
 * shared mapPgError from lib/route-helpers.
 */
const logisticsWarehouseRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
logisticsWarehouseRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

type LowStockStatus = "out" | "low" | "ok";

function statusFor(qty: number): LowStockStatus {
  if (qty <= 0) return "out";
  if (qty <= 1) return "low";
  return "ok";
}

// Response-shape types are local on purpose — the wire payload is owned by
// this route and not (yet) shared with the web app. Migrating these to
// packages/shared/src/domain.ts is M4 Task 2 territory, not this task.
interface PerWarehouseStockEntry {
  sku: string;
  qty: number;
  reserved: number;
  low_stock_status: LowStockStatus;
}

interface SkuTotals {
  total_qty: number;
  total_reserved: number;
  low_stock_status_aggregate: LowStockStatus;
}

logisticsWarehouseRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [whRes, sbRes] = await Promise.all([
    sb.from("warehouses").select("id, name, address").order("name"),
    sb.from("stock_balances").select("sku, warehouse_id, qty, reserved"),
  ]);
  if (whRes.error) {
    const m = mapPgError(whRes.error);
    return c.json(m.body, m.status);
  }
  if (sbRes.error) {
    const m = mapPgError(sbRes.error);
    return c.json(m.body, m.status);
  }

  const warehouses = (whRes.data ?? []) as DB.WarehouseRow[];
  const balances = (sbRes.data ?? []) as DB.StockBalanceRow[];

  // Initialise byWarehouse with every warehouse (so empty warehouses surface as []).
  const byWarehouse: Record<string, PerWarehouseStockEntry[]> = {};
  for (const w of warehouses) byWarehouse[w.id] = [];

  // Accumulate totals per SKU as we iterate balances.
  const totalsAccum: Record<string, { total_qty: number; total_reserved: number }> = {};

  for (const b of balances) {
    const qty = Number(b.qty) || 0;
    const reserved = Number(b.reserved) || 0;
    // Only push to byWarehouse if the warehouse exists in the warehouses list.
    // Defensive: balance rows for deleted warehouses (cascade should remove them
    // but keep the route resilient) are skipped from BOTH the per-warehouse
    // view AND totals, so orphan SKUs never surface in the response.
    if (!Object.prototype.hasOwnProperty.call(byWarehouse, b.warehouse_id)) continue;

    byWarehouse[b.warehouse_id]!.push({
      sku: b.sku,
      qty,
      reserved,
      low_stock_status: statusFor(qty),
    });

    const t = (totalsAccum[b.sku] ??= { total_qty: 0, total_reserved: 0 });
    t.total_qty += qty;
    t.total_reserved += reserved;
  }

  const totalsBySku: Record<string, SkuTotals> = {};
  for (const sku of Object.keys(totalsAccum)) {
    const t = totalsAccum[sku]!;
    totalsBySku[sku] = {
      total_qty: t.total_qty,
      total_reserved: t.total_reserved,
      low_stock_status_aggregate: statusFor(t.total_qty),
    };
  }

  return c.json({ warehouses, byWarehouse, totalsBySku });
});

export default logisticsWarehouseRouter;
