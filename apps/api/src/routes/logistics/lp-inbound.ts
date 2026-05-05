import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/logistics/pos/:id/lp-accept-inbound — Phase 4.5 Chunk 1 (Task 29).
 *
 * Sofa pre-flight 代按 (Codex F1). Stamps `partner_confirmed_at` on the PO so
 * the inbound LP leg can be marked accepted by either:
 *   • the assigned partner themself (LP self-accept), OR
 *   • logistics / principal acting on the partner's behalf (代按).
 *
 * The wrapped RPC `lp_accept_inbound_delivery` (migration 0045) **does NOT
 * advance threads** — it only moves PO `sup_status` to `partner_confirmed`.
 * Thread advancement happens later via the customer-leg dispatch path.
 *
 * Mounted as a separate sub-router under `/logistics/pos` (rather than
 * extending `logisticsPosRouter`) because that router pins access to
 * `role === 'logistics'` via blanket `use("*", ...)` middleware. This route
 * legitimately needs to admit `partner` and `principal` too.
 *
 * Hono routes from sibling sub-routers register independently on the parent
 * app, so this mount path coexists with `logisticsPosRouter` without
 * inheriting its 403 guard.
 */
const lpInboundRouter = new Hono<AppEnv>();

lpInboundRouter.post("/:id/lp-accept-inbound", async (c) => {
  const auth = c.var.auth;
  if (!["logistics", "principal", "partner"].includes(auth.role)) {
    throw new HTTPException(403, { message: "Logistics, principal, or partner only" });
  }
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("lp_accept_inbound_delivery", { p_po_id: id });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default lpInboundRouter;
