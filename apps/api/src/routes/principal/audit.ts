import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/principal/audit — Phase 10 immutable timeline of every meaningful
 * cross-role action. RLS on audit_log (migration 0002) restricts reads to
 * principal + the actor's own org; principal sees everything.
 *
 * GET /?role=<role>&limit=<n>
 *   - role: optional filter against audit_log.role
 *   - limit: 1..500, defaults 200. No cursor pagination in V1 — see
 *     phase-9-movements-cursor-pagination + a new audit-pagination CF for
 *     when the table grows past ~10k rows on real prod usage.
 *
 * Read-only — no mutations. Audit rows are written by every other route
 * (e.g. principal/accounts) as a side effect.
 */
const principalAuditRouter = new Hono<AppEnv>();

principalAuditRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "principal") {
    throw new HTTPException(403, { message: "Principal only" });
  }
  await next();
});

principalAuditRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const roleFilter = c.req.query("role");
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "200", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 200, 1), 500);

  let q = sb
    .from("audit_log")
    .select("id, role, actor_text, action, dealer_id, ref, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (roleFilter && roleFilter !== "all") {
    q = q.eq("role", roleFilter);
  }
  const { data, error } = await q;
  if (error) throw new HTTPException(500, { message: error.message });

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    role: r.role,
    actor: r.actor_text,
    action: r.action,
    dealerId: r.dealer_id,
    ref: r.ref,
    occurredAt: r.occurred_at,
  }));
  return c.json({ rows });
});

export default principalAuditRouter;
