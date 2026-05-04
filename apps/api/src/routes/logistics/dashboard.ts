import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
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
 * Pipeline v2 augmentation (C3): the 0019 RPC's `pipeline` only contains
 * counts for awaiting_stock / ready_to_dispatch / dispatched. The kanban
 * also needs `placed` (status='place') and `proceed_request` columns, so the
 * route layers two thin count queries over the RPC output. Done at the API
 * layer because migration 0019 is frozen — see CLAUDE.md §7.
 *
 * Error contract matches sibling logistics/principal handlers via shared
 * mapPgError (SQLSTATE → HTTP) from lib/route-helpers.
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
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // Pipeline v2 extra counts. PostgREST's `head: true, count: 'exact'` returns
  // the count via response metadata without fetching rows.
  const [placedRes, proceedReqRes] = await Promise.all([
    sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "place"),
    sb.from("orders").select("id", { count: "exact", head: true }).eq("logistics_stage", "proceed_request"),
  ]);
  if (placedRes.error) {
    const m = mapPgError(placedRes.error);
    return c.json(m.body, m.status);
  }
  if (proceedReqRes.error) {
    const m = mapPgError(proceedReqRes.error);
    return c.json(m.body, m.status);
  }

  // Merge into the RPC's `pipeline` object. Spread the RPC payload first so
  // any future RPC-side addition wins; placed/proceed_request only ever come
  // from this route while the RPC is frozen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = (data ?? {}) as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = (summary.pipeline ?? {}) as Record<string, any>;
  // RPC's pipeline keys win on collision; if 0019 RPC ever adds placed/proceed_request,
  // the route-side count queries become redundant and can be removed.
  const merged = {
    ...summary,
    pipeline: {
      placed: placedRes.count ?? 0,
      proceed_request: proceedReqRes.count ?? 0,
      ...pipeline,
    },
  };

  return c.json(merged);
});

export default logisticsDashboardRouter;
