import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/stock-alerts — Phase 4.5 Chunk 2 Sprint D Task 18.
 *
 * Wraps RPC `operation_stock_alerts()` (migration 0054) which returns rows
 * where `(qty - reserved) < low_threshold`. Used by:
 *   • OperationDashboard alert tile (count + top-3 SKUs)
 *   • OperationWarehouse page red-dot indicator
 *   • CreatePOModal "Suggest from alerts" button
 *
 * Mounted as a separate sub-router under `/operation/stock-alerts` (not on
 * `operationPosRouter` or `operationOrdersRouter`) so this route stands alone
 * with its own role gate. Inline guard to operation only — fast 403 before any
 * Supabase round-trip. Even though the underlying RPC also admits `principal`,
 * the master plan T18 spec scopes the HTTP endpoint to operation only.
 *
 * Returns shape `{ alerts: [...] }` where each row carries:
 *   sku, warehouse_id, qty, reserved, effective, low_threshold, shortage.
 *
 * Errors map via `mapPgError` (42501 → 403, others → 500).
 */
type StockAlertRow = {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  effective: number;
  low_threshold: number;
  shortage: number;
};

const stockAlertsRouter = new Hono<AppEnv>();

stockAlertsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation") {
    throw new HTTPException(403, { message: "operation only" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("operation_stock_alerts");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ alerts: (data ?? []) as StockAlertRow[] });
});

export default stockAlertsRouter;
