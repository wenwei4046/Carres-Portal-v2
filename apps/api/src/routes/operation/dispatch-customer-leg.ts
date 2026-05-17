import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { dispatchCustomerLegInput } from "@carres/shared";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/operation/dispatch-customer-leg — Phase 4.5 Chunk 2 Sprint B (Task 7).
 *
 * Dispatches the customer leg of a single supplier thread via the assigned
 * delivery partner. Pivoted from Chunk 1's PO-scoped flow — customer-leg
 * state (delivery_partner_id, request_for_delivery_at, confirm_delivery_date,
 * partner_accepted_at, partner_rejected_at) now lives on
 * `order_supplier_threads`, not `purchase_orders`.
 *
 * Two paths:
 *   • RFD path (forceDispatch=false): standard request-for-delivery flow.
 *     Partner accepts/rejects the RFD via the partner pickups UI.
 *   • Force path (forceDispatch=true): operation overrides RFD and dispatches
 *     directly (stamps partner_accepted_at + advances thread to 'dispatched').
 *     Used when partner is non-responsive or for urgent timing.
 *
 * Mounted as a separate sub-router under `/operation/pos`. The inline
 * allowlist below admits HQ roles (operation + principal); partners do NOT
 * dispatch customer legs themselves. Carry-forward
 * `phase-4.5-chunk-2-route-mount-middleware-leak` (closed) made this allowlist
 * effective: previously `operationPosRouter` exported a blanket `use("*", ...)`
 * middleware that — due to Hono v4's flatten-into-parent semantics — leaked
 * across siblings and silently 403'd principals here. `operationPosRouter`
 * now uses per-route `requireOperation` guards (see `lib/auth-guards.ts`),
 * so siblings see clean middleware boundaries.
 *
 * Body shape changed from `{ partner_id, confirm_delivery_date, force_dispatch }`
 * (with :id = po_id path param) to `{ threadId, partnerId, confirmDeliveryDate,
 * forceDispatch }`. Path param dropped — the thread uuid is now in the body.
 *
 * Wraps RPC `operation_dispatch_customer_leg(p_thread_id uuid, p_partner_id uuid,
 *  p_confirm_delivery_date date, p_force_dispatch boolean)` (migration 0051).
 */
const dispatchCustomerLegRouter = new Hono<AppEnv>();

dispatchCustomerLegRouter.post("/dispatch-customer-leg", async (c) => {
  const auth = c.var.auth;
  if (!["operation", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "operation or principal only" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = dispatchCustomerLegInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid input" },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("operation_dispatch_customer_leg", {
    p_thread_id: parsed.data.threadId,
    p_partner_id: parsed.data.partnerId,
    p_confirm_delivery_date: parsed.data.confirmDeliveryDate,
    p_force_dispatch: parsed.data.forceDispatch,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default dispatchCustomerLegRouter;
