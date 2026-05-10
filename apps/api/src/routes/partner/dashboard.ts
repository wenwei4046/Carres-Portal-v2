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
 *   - total      : all POs assigned to this LP (procurement_partner_id = auth.partnerId)
 *
 * Read path uses `userClient` (forwards caller JWT) so RLS on `purchase_orders`
 * applies. The migration 0046 LP-role RLS policy restricts the LP to rows
 * where procurement_partner_id matches their partner_id JWT claim.
 *
 * Phase 4.5 Chunk 2 Sprint C (migration 0052): PO column
 * `delivery_partner_id` renamed to `procurement_partner_id` to disambiguate
 * from the customer-leg LP that now lives on
 * `order_supplier_threads.delivery_partner_id` (migration 0049). The PO holds
 * ONLY procurement-leg state from 0052 forward.
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
    .eq("procurement_partner_id", auth.partnerId);

  if (error) throw new HTTPException(500, { message: error.message });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as Array<{ id: string; sup_status: string | null }>;
  // 0079 (Loo 2026-05-10) — partner now sees POs from pre-pickup states
  // because procurement_partner_id is set at PO creation. Two new buckets:
  //   upcoming  : supplier hasn't pressed Mark Ready yet — partner just
  //               monitors capacity (pending / acknowledged / in_production).
  //   ready     : supplier marked ready — partner needs to schedule pickup
  //               (ready_confirm_sent / ready_for_pickup).
  const counts = {
    upcoming: rows.filter(
      (r) =>
        r.sup_status === "pending" ||
        r.sup_status === "acknowledged" ||
        r.sup_status === "in_production",
    ).length,
    ready: rows.filter(
      (r) =>
        r.sup_status === "ready_confirm_sent" ||
        r.sup_status === "ready_for_pickup",
    ).length,
    assigned: rows.filter((r) => r.sup_status === "pickup_assigned").length,
    accepted: rows.filter((r) => r.sup_status === "pickup_accepted").length,
    in_transit: rows.filter((r) => r.sup_status === "picked_up").length,
    delivered: rows.filter((r) => r.sup_status === "delivered").length,
    total: rows.length,
  };

  return c.json(counts);
});

export default partnerDashboardRouter;
