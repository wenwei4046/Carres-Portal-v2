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
 */
const logisticsDashboardRouter = new Hono<AppEnv>();

logisticsDashboardRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_dashboard_summary");
  if (error) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: error.message },
      500,
    );
  }
  return c.json(data);
});

export default logisticsDashboardRouter;
