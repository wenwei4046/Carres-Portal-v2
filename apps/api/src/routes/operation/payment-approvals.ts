import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * THE DELIVERY PAYMENT APPROVAL — history only (0362 · owner ruling
 * 2026-09-01 closed the door on screen; owner ruling 2026-09-12 closed it in
 * the database, migration 0486).
 *
 * Mounted at `/api/operation/payment-approvals`.
 *
 *   GET  /:orderId       the requests + decisions on one order (any internal reader)
 *   POST /:orderId       410 Gone — no live unpaid-delivery approval exists
 *   POST /:id/decide     410 Gone
 *
 * Money in full before delivery is absolute: a Delivery Order issues only
 * when Amount needed is RM 0 and no open Finance Exception holds the order.
 * An approval recorded BEFORE the door closed is honoured by the 0362 gate as
 * history, which is why the read stays.
 */
const paymentApprovalsRouter = new Hono<AppEnv>();

/** Every request/decision on one order, newest first. Read-only, any internal role. */
paymentApprovalsRouter.get("/:orderId", async (c) => {
  const auth = c.var.auth;
  const orderId = c.req.param("orderId");

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("order_delivery_payment_approvals")
    .select("*")
    .eq("order_id", orderId)
    .order("requested_at", { ascending: false });

  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

/**
 * ⛔ THE TWO WRITE DOORS ARE RETIRED (owner ruling 2026-09-12 — money in full
 * before delivery is absolute; there is no live unpaid-delivery approval or
 * Payment Exception release door, and it may not be reintroduced). PR #1031
 * took the door off the screen; migration 0486 revoked EXECUTE on the two
 * 0362 RPCs; this router answers 410 Gone so an old tab or script learns the
 * door is shut instead of reaching a database that would refuse it anyway.
 * The GET above stays: an approval granted BEFORE the door closed is history
 * the 0362 gate still honours, and history is readable.
 */
const RETIRED_APPROVAL = {
  error: "gone",
  code: "no_unpaid_delivery_approval",
  message:
    "Money must be in full before delivery. There is no approval that releases a delivery while money is owed. Collect the balance in Payments → Monitor.",
  path: "/finance/monitor",
};
paymentApprovalsRouter.post("/:orderId", (c) => c.json(RETIRED_APPROVAL, 410));
paymentApprovalsRouter.post("/:id/decide", (c) => c.json(RETIRED_APPROVAL, 410));

export default paymentApprovalsRouter;
