import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * POST /api/logistics/orders/:dl/resume-dispatch — Phase 4.5 Chunk 1 (Task 35).
 *
 * Resumes dispatch on an order that was parked in `at_warehouse_waiting` after a
 * partner-rejection. Looks up the order by its display number `dl` (integer),
 * resolves the underlying UUID `id`, then invokes RPC
 * `logistics_resume_from_waiting` (migration 0045, Task 14) to revive the
 * supplier threads and bring the order back into the active dispatch flow.
 *
 * Mounted as a sibling sub-router on `/logistics/orders` (alongside
 * `logisticsOrdersRouter`) — Hono allows multiple sibling routers on the same
 * prefix. This keeps Task 35 isolated from the M2/M3/M4 orders router.
 *
 * Role-gated: logistics + principal only. Partners cannot resume an order.
 */
const resumeDispatchRouter = new Hono<AppEnv>();

resumeDispatchRouter.post("/:dl/resume-dispatch", async (c) => {
  const auth = c.var.auth;
  if (!["logistics", "principal"].includes(auth.role)) {
    throw new HTTPException(403, { message: "Logistics or principal only" });
  }
  const dlParam = c.req.param("dl");
  const dl = parseInt(dlParam, 10);
  if (isNaN(dl)) throw new HTTPException(400, { message: "invalid dl" });

  const sb = userClient(c.env, auth.jwt);
  const { data: order, error: lookupErr } = await sb
    .from("orders")
    .select("id")
    .eq("dl", dl)
    .maybeSingle();
  if (lookupErr) throw new HTTPException(500, { message: lookupErr.message });
  if (!order) throw new HTTPException(404, { message: "order not found" });

  const { data, error } = await sb.rpc("logistics_resume_from_waiting", {
    p_order_id: order.id,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data);
});

export default resumeDispatchRouter;
