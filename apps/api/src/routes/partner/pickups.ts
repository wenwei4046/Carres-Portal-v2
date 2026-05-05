import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/partner/pickups — Phase 4.5 Chunk 1 (Task 24).
 *
 * Returns the full list of purchase orders assigned to the authenticated
 * Logistics Partner (LP). Sorted by placed_at desc (newest first).
 *
 * Read path uses `userClient` (forwards caller JWT) so RLS on `purchase_orders`
 * applies. Migration 0046 LP-role RLS restricts to rows where
 * delivery_partner_id = auth.partnerId.
 *
 * SELECT shape (NO `qty` — that column does not exist on purchase_orders;
 * line-item quantities live on purchase_order_lines):
 *   id, dl, supplier_id, warehouse_id, sup_status,
 *   confirm_delivery_date, request_for_delivery_at,
 *   partner_accepted_at, partner_rejected_at,
 *   delivery_partners(name)
 */
const partnerPickupsRouter = new Hono<AppEnv>();

partnerPickupsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "partner" || !auth.partnerId) {
    throw new HTTPException(403, { message: "Only partner role with partner_id" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("purchase_orders")
    .select(
      `
      id, dl, supplier_id, warehouse_id, sup_status,
      confirm_delivery_date, request_for_delivery_at,
      partner_accepted_at, partner_rejected_at,
      delivery_partners(name)
    `,
    )
    .eq("delivery_partner_id", auth.partnerId)
    .order("placed_at", { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

export default partnerPickupsRouter;
