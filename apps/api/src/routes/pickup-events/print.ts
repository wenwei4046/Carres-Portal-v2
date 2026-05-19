import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Pickup-event DO print payload — Task 7 of the Supplier Per-Thread Readiness
 * plan (docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md).
 *
 * Mounted at `/api/pickup-events`. Returns JSON only — browser renders the PDF
 * via @react-pdf/renderer (Workers WASM ban — see commit `fa47433`).
 *
 * The `pickup_event_render_payload(p_event_id uuid)` RPC (migration 0107)
 * does the per-role gating (supplier owns thread / partner assigned to pickup
 * / operation + principal full). This route just validates uuid + role
 * allowlist; cross-tenant 42501s from the RPC surface as 403 via
 * `mapPgError`.
 */
const pickupEventsRouter = new Hono<AppEnv>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = new Set(["supplier", "partner", "operation", "principal"]);

pickupEventsRouter.get("/:id/print", async (c) => {
  const auth = c.var.auth;
  if (!ALLOWED_ROLES.has(auth.role)) {
    throw new HTTPException(403, { message: "Role not allowed" });
  }
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) {
    return c.json(
      { error: "invalid_id", code: "invalid_param", message: "uuid required" },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("pickup_event_render_payload", {
    p_event_id: id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default pickupEventsRouter;
