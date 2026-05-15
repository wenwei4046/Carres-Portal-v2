import { Hono } from "hono";
import { mapPgError } from "../../lib/route-helpers";
import { requireOps } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Ops Panel — Activity feed (Jess COO 2026-05-14).
 *
 * GET /api/ops/activity — last N entries from ops_activity_log, newest first.
 * Visible to whole ops team for transparency (replaces WhatsApp screenshot
 * workflow). Optional `?limit=` (default 50, max 200).
 */
const opsActivityRouter = new Hono<AppEnv>();
opsActivityRouter.use("*", requireOps);

opsActivityRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("ops_activity_log")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ entries: data ?? [] });
});

export default opsActivityRouter;
