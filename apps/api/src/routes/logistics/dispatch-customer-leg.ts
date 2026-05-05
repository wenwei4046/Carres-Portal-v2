import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/logistics/pos/:id/dispatch-customer-leg — Phase 4.5 Chunk 1 (Task 33).
 *
 * Dispatches the customer leg of a PO via the assigned delivery partner.
 *
 * Two paths:
 *   • RFD path (force_dispatch=false): standard request-for-delivery flow.
 *     Partner accepts/rejects the RFD via the partner pickups UI.
 *   • Force path (force_dispatch=true): logistics overrides RFD and dispatches
 *     directly. Used when partner is non-responsive or for urgent timing.
 *
 * Mounted as a separate sub-router (not on `logisticsPosRouter`) because
 * `logisticsPosRouter` pins access to logistics-only via blanket middleware.
 * This route only admits HQ roles (logistics + principal) — partners do NOT
 * dispatch customer legs themselves.
 *
 * Wraps RPC `logistics_dispatch_customer_leg` (migration 0045, Task 15).
 */
const dispatchCustomerLegRouter = new Hono<AppEnv>();

const schema = z.object({
  partner_id: z.string().uuid(),
  confirm_delivery_date: z.string().date(),
  force_dispatch: z.boolean().default(false),
});

dispatchCustomerLegRouter.post("/:id/dispatch-customer-leg", async (c) => {
  const auth = c.var.auth;
  if (!["logistics", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "Logistics or principal only" });
  }
  const id = c.req.param("id");
  const body = schema.parse(await c.req.json());

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("logistics_dispatch_customer_leg", {
    p_po_id: id,
    p_partner_id: body.partner_id,
    p_confirm_delivery_date: body.confirm_delivery_date,
    p_force_dispatch: body.force_dispatch,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default dispatchCustomerLegRouter;
