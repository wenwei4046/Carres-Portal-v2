import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  lpAcceptOrderInput,
  lpRejectOrderInput,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/partner/orders — Migration 0147 (item h, 2026-05-23).
 *
 * Customer-leg LP request/accept/reject endpoints. The order is in the LP's
 * "Incoming" queue once Operation picks them at Accept Proceed
 * (operation_confirm_proceed_request_v3 writes
 * orders.delivery_partner_id + orders.request_for_delivery_at). LP either:
 *
 *   POST /:id/accept   → lp_accept_order
 *   POST /:id/reject   → lp_reject_order (body: { reason })
 *
 * GET endpoints (list of incoming + list of accepted-but-not-yet-dispatched)
 * are served from the existing /api/partner/dashboard surface — this router
 * only exposes the two mutating actions.
 *
 * Auth: partner role + non-null partnerId on the JWT. Mirror partner/pickups.ts
 * inline guard (no shared requirePartner middleware exists; the pattern is
 * intentionally inlined per route).
 */
const partnerOrdersRouter = new Hono<AppEnv>();

// ----- GET /incoming -----
// Migration 0147 (item h, 2026-05-23). The LP "Incoming" queue: orders
// where this LP has been picked (orders.delivery_partner_id = me +
// request_for_delivery_at NOT NULL) but the LP hasn't yet accepted
// (partner_accepted_at IS NULL) or rejected (partner_rejected_at IS NULL).
//
// Read path uses `userClient` so the RLS policy `orders_scoped_read`
// (migration 0100) applies — that policy already admits a partner when
// `orders.delivery_partner_id = app_partner_id()`. No new policy needed.
//
// Sorted by request_for_delivery_at ASC so the oldest pending request
// surfaces first.
partnerOrdersRouter.get("/incoming", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("orders")
    .select(
      "id, so, customer_name, customer_phone, customer_address, delivery_date, request_for_delivery_at, placed_at, operation_stage, warehouse_id, dealers(name), warehouses(name, address)",
    )
    .eq("delivery_partner_id", auth.partnerId)
    .not("request_for_delivery_at", "is", null)
    .is("partner_accepted_at", null)
    .is("partner_rejected_at", null)
    .order("request_for_delivery_at", { ascending: true });

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ orders: data ?? [] });
});

partnerOrdersRouter.post("/:id/accept", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  // Body is empty by contract — lpAcceptOrderInput is .strict({}) so extra
  // keys fail. We still parse to enforce the contract and reject sneaky
  // payloads.
  const parsed = await parseJsonBody(c, lpAcceptOrderInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("lp_accept_order", {
    p_order_id: c.req.param("id"),
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

partnerOrdersRouter.post("/:id/reject", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  const parsed = await parseJsonBody(c, lpRejectOrderInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("lp_reject_order", {
    p_order_id: c.req.param("id"),
    p_reason:   parsed.data.reason,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default partnerOrdersRouter;
