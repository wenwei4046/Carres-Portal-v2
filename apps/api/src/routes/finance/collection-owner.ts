import { Hono } from "hono";
import { z } from "zod";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/finance/collection-owner — one Sales Order's collection owner (0489,
 * owner ruling 2026-09-13: the Responsible Delivery Operation, stable until
 * the balance is RM 0).
 *
 *   GET  /?orderId=   normal owner · today's cover · acting person · history
 *                     (the same `payment_collection_owner_context` the Work
 *                     feed reads — never a second calculation)
 *   POST /handover    the FORMAL handover: new owner · reason · effective
 *                     from; gated in SQL like Staff & Duties (principal or a
 *                     manager). Previous owner, changed by and changed on are
 *                     written by the door, never by the caller.
 *
 * Establishment has no route: the Work feed's own admission establishes the
 * owner when collection first becomes actionable (work.ts).
 */
const collectionOwnerRouter = new Hono<AppEnv>();

const handoverInput = z.object({
  order_id: z.string().uuid(),
  new_owner_user_id: z.string().uuid(),
  reason: z.string().trim().min(3, "a handover states its reason").max(500),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).strict();

collectionOwnerRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.query("orderId");
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return c.json({ error: "orderId required" }, 400);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_collection_owner_context", {
    p_order_ids: [orderId], p_on: null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const rows = (data ?? []) as Array<{ order_id: string }>;
  return c.json({ owner: rows.find((row) => row.order_id === orderId) ?? null });
});

collectionOwnerRouter.post("/handover", requireOperationOrPrincipal, async (c) => {
  const parsed = await parseJsonBody(c, handoverInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const body = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("payment_collection_owner_handover", {
    p_order_id: body.order_id,
    p_new_owner_user_id: body.new_owner_user_id,
    p_reason: body.reason,
    p_effective_from: body.effective_from ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ handover: data });
});

export default collectionOwnerRouter;
