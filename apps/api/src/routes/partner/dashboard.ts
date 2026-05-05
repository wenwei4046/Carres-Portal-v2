import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/partner/dashboard — Phase 4.5 Chunk 1 (Task 24).
 *
 * Returns KPI counts for the authenticated Logistics Partner (LP):
 *   - assigned   : sup_status = 'pickup_assigned'
 *   - accepted   : sup_status = 'pickup_accepted'
 *   - in_transit : sup_status = 'picked_up'
 *   - delivered  : sup_status = 'delivered'
 *   - total      : all POs assigned to this LP (delivery_partner_id = auth.partnerId)
 *
 * Read path uses `userClient` (forwards caller JWT) so RLS on `purchase_orders`
 * applies. The migration 0046 LP-role RLS policy restricts the LP to rows
 * where delivery_partner_id matches their partner_id JWT claim.
 *
 * NOTE: `purchase_orders` does NOT have a `qty` column — line-item quantities
 * live on `purchase_order_lines`. This route only needs id + sup_status for
 * counting, so no qty is selected.
 */
const partnerDashboardRouter = new Hono<AppEnv>();

partnerDashboardRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("purchase_orders")
    .select("id,sup_status")
    .eq("delivery_partner_id", auth.partnerId);

  if (error) throw new HTTPException(500, { message: error.message });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as Array<{ id: string; sup_status: string | null }>;
  const counts = {
    assigned: rows.filter((r) => r.sup_status === "pickup_assigned").length,
    accepted: rows.filter((r) => r.sup_status === "pickup_accepted").length,
    in_transit: rows.filter((r) => r.sup_status === "picked_up").length,
    delivered: rows.filter((r) => r.sup_status === "delivered").length,
    total: rows.length,
  };

  return c.json(counts);
});

export default partnerDashboardRouter;
