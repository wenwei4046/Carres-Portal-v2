import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { DB, adjustStockInput, reservedDrilldownQuery } from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/operation/warehouse — Phase 4 M4 backend warehouse subsystem.
 *
 * Endpoints implemented:
 *   GET /        — composed query: warehouses + stock_balances aggregated per
 *                  warehouse with low_stock flags. (M4 Task 1)
 *   POST /adjust — wraps operation_adjust_stock RPC for manual stock
 *                  corrections (positive delta = inbound, negative = damage/
 *                  loss). (M4 Task 2)
 *
 * Future M4 tasks add: GET /movements (list).
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
 * Pattern: matches sibling operation/orders.ts dual-from composed reads with
 * shared mapPgError from lib/route-helpers.
 */
const operationWarehouseRouter = new Hono<AppEnv>();

// Inline operation-only guard — fast 403 before any Supabase round-trip.
operationWarehouseRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation") {
    throw new HTTPException(403, { message: "operation only" });
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
  /** T42-pass3-C1 — surfaces stock_balances.low_threshold so the warehouse UI
   *  can prefill `SetThresholdDialog` instead of opening blank (which would
   *  imply clearing existing thresholds on save). NULL = no threshold set. */
  low_threshold: number | null;
  /** T42-pass3-C1 — same rationale as low_threshold. */
  high_threshold: number | null;
}

interface SkuTotals {
  total_qty: number;
  total_reserved: number;
  low_stock_status_aggregate: LowStockStatus;
}

operationWarehouseRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const [whRes, sbRes] = await Promise.all([
    sb.from("warehouses").select("id, name, address").order("name"),
    sb
      .from("stock_balances")
      // T42-pass3-C1 — include thresholds so the FE can prefill SetThresholdDialog.
      .select("sku, warehouse_id, qty, reserved, low_threshold, high_threshold"),
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
      // T42-pass3-C1 — surface raw thresholds for SetThresholdDialog prefill.
      low_threshold: b.low_threshold ?? null,
      high_threshold: b.high_threshold ?? null,
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

// ----- GET /reserved-drilldown — orders holding reserve at (sku, warehouse) -----
//
// Pipeline v2 C4: surfaces the order-level breakdown behind the
// `stock_balances.reserved` count for a single (sku, warehouse) pair.
// `_operation_reserve_order` only holds a reserve while the order is in
// `ready_to_dispatch` or `dispatched`; the stage filter mirrors that contract
// so the sum of returned `reservedQty` should match the row's reserved value.
//
// Composes a join over `orders` + `order_lines` via the user-token client (RLS
// is the security boundary). Stage values are cast to text in the .in() filter
// so the PostgREST enum coercion stays predictable; the route guard already
// enforces operation-only role.
operationWarehouseRouter.get("/reserved-drilldown", async (c) => {
  const parsed = reservedDrilldownQuery.safeParse({
    warehouseId: c.req.query("warehouseId") ?? undefined,
    sku: c.req.query("sku") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { warehouseId, sku } = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  // PostgREST does the join via embedded resource: select order_lines that
  // match the sku, then filter parent orders by warehouse + stage. The shape
  // we want (one row per order, with summed qty) is easier to assemble in
  // application code than to express in a single PostgREST resource path —
  // so we fetch lines + their order parent via embed and group in JS. This
  // mirrors how dashboard.ts composes its open_pos summary.
  const { data, error } = await sb
    .from("order_lines")
    .select(
      "qty, sku, orders:orders!inner(id, dl, customer_name, operation_stage, warehouse_id)",
    )
    .eq("sku", sku)
    .eq("orders.warehouse_id", warehouseId)
    .in("orders.operation_stage", ["ready_to_dispatch", "dispatched"]);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  type LineWithOrder = {
    qty: number;
    sku: string;
    // Supabase types `inner` joins as a single object (not array) when the FK is
    // 1-1. PostgREST sometimes types it as array regardless; handle both.
    orders:
      | {
          id: string;
          dl: number;
          customer_name: string;
          operation_stage: "ready_to_dispatch" | "dispatched";
          warehouse_id: string;
        }
      | Array<{
          id: string;
          dl: number;
          customer_name: string;
          operation_stage: "ready_to_dispatch" | "dispatched";
          warehouse_id: string;
        }>
      | null;
  };

  // Group by order id + sum qty. We discard rows where the embedded `orders`
  // is null/empty (defensive — the inner join + .eq should already filter
  // those out, but the .inner clause depends on PostgREST request encoding).
  const grouped = new Map<
    string,
    {
      id: string;
      dl: number;
      customerName: string;
      operationStage: "ready_to_dispatch" | "dispatched";
      reservedQty: number;
    }
  >();
  let total = 0;
  for (const row of (data ?? []) as LineWithOrder[]) {
    const orderRow = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    if (!orderRow) continue;
    const qty = Number(row.qty) || 0;
    if (qty <= 0) continue;
    total += qty;
    const existing = grouped.get(orderRow.id);
    if (existing) {
      existing.reservedQty += qty;
    } else {
      grouped.set(orderRow.id, {
        id: orderRow.id,
        dl: orderRow.dl,
        customerName: orderRow.customer_name,
        operationStage: orderRow.operation_stage,
        reservedQty: qty,
      });
    }
  }
  // Sort by dl desc — newest order first, matches the spec query order.
  const orders = Array.from(grouped.values()).sort((a, b) => b.dl - a.dl);
  return c.json({ warehouseId, sku, total, orders });
});

// ----- POST /adjust — manual stock adjustment -----
// Wraps operation_adjust_stock RPC (0019). Per spec §17.4 A4 + adjustStockInput
// schema: signed delta (P0001 negative_stock if delta would dip below 0;
// P0001 below_reserved if it would dip below stock_balances.reserved). The RPC
// also writes a stock_movements row (kind='adjust') and an audit_log entry.
operationWarehouseRouter.post("/adjust", async (c) => {
  const parsed = await parseJsonBody(c, adjustStockInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_adjust_stock", {
    p_sku: parsed.data.sku,
    p_warehouse_id: parsed.data.warehouseId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default operationWarehouseRouter;
