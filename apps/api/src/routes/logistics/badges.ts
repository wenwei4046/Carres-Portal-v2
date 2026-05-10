import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/logistics/badges (Loo 2026-05-10)
 *
 * Sidebar action-count feed. Returns just the numbers each LogisticsSidebar
 * nav item shows next to its label so the operator knows at a glance which
 * sections need their attention without polling every list page.
 *
 * Counts (head:true keeps RLS round-trip cheap — no row payload):
 *   orders       — orders.logistics_stage = 'awaiting_logistics_action'
 *   procurement  — POs in the "Pickup action" bucket: status != 'received'
 *                  AND sup_status IN (ready_confirm_sent, ready_for_pickup,
 *                  delivered, reassign_needed). Mirrors
 *                  ProcurementTabContent's needsPickup() filter so the chip
 *                  + sidebar agree. ready_confirm_sent is the actual state
 *                  factory-pickup suppliers (e.g. Nice Future) land in
 *                  after pressing Mark Ready — the older list missed it
 *                  and the badge silently sat at 0 (Loo 2026-05-10).
 *
 * Polling cadence (web): 30s on the hook side. Cheap enough to bump on
 * mutations later without re-architecting.
 *
 * Other roles' badge endpoints live under /api/{role}/badges with the same
 * shape so the role-switch logic in the sidebar wrapper stays trivial.
 */
const logisticsBadgesRouter = new Hono<AppEnv>();

logisticsBadgesRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }

  const sb = userClient(c.env, auth.jwt);

  const [ordersRes, procurementRes] = await Promise.all([
    sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("logistics_stage", "awaiting_logistics_action"),
    sb
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "received")
      .in("sup_status", [
        "ready_confirm_sent",
        "ready_for_pickup",
        "delivered",
        "reassign_needed",
      ]),
  ]);
  if (ordersRes.error) {
    const m = mapPgError(ordersRes.error);
    return c.json(m.body, m.status);
  }
  if (procurementRes.error) {
    const m = mapPgError(procurementRes.error);
    return c.json(m.body, m.status);
  }

  return c.json({
    orders: ordersRes.count ?? 0,
    procurement: procurementRes.count ?? 0,
  });
});

export default logisticsBadgesRouter;
