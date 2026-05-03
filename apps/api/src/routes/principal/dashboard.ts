import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/principal/dashboard
 *
 * One round-trip RPC that returns the KPI strip + leaderboard + pending
 * approvals + audit recent + alerts payload the Principal landing page needs.
 * The RPC (`principal_dashboard_summary`, defined in 0013) is SECURITY DEFINER
 * with a manual `is_principal()` guard, so we layer a same-role check here to
 * fail fast without a round-trip when a non-principal hits the route.
 */
const principalDashboardRouter = new Hono<AppEnv>();

principalDashboardRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("principal_dashboard_summary");
  if (error) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: error.message },
      500,
    );
  }
  return c.json(data);
});

export default principalDashboardRouter;
