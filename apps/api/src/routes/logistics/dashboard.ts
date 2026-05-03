import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/logistics/dashboard
 *
 * Wraps `logistics_dashboard_summary` RPC (M1, 0019). Single round-trip returns
 * the dashboard payload (KPIs + pipeline buckets + open POs + low stock cards).
 * The RPC is SECURITY DEFINER + manual `is_logistics()` guard; we layer a
 * same-role check here for fast 403s without a Supabase round-trip.
 *
 * Error contract matches sibling logistics/principal handlers via inline
 * mapPgError (SQLSTATE → HTTP).
 */
const logisticsDashboardRouter = new Hono<AppEnv>();

/** SQLSTATE -> HTTP body+status. Mirrors logistics/orders.ts inline mapper. */
function mapPgError(error: { code?: string; message?: string; details?: string }) {
  switch (error.code) {
    case "42501":
      return { status: 403 as const, body: { error: "forbidden", code: "forbidden", message: error.message ?? "forbidden" } };
    case "42P01":
      return { status: 404 as const, body: { error: "not_found", code: "not_found", message: error.message ?? "not found" } };
    case "22023":
      return { status: 422 as const, body: { error: "invalid_param", code: "invalid_param", message: error.message ?? "invalid param" } };
    case "P0001":
      return { status: 422 as const, body: { error: "rule_violation", code: error.details ?? "invalid_param", message: error.message ?? "rule violation" } };
    default:
      return { status: 500 as const, body: { error: "rpc_failed", code: "rpc_failed", message: error.message ?? "rpc failed" } };
  }
}

logisticsDashboardRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_dashboard_summary");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default logisticsDashboardRouter;
