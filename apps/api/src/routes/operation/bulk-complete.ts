import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Bulk "Mark completed" (migration 0166) — clears the AutoCount legacy
 * backlog: orders imported with a past "New- Delivery Date" that were already
 * delivered in real life before the portal existed. The RPC flips
 * status/operation_stage to delivered + stamps delivered_at + writes an
 * order_history line, and is scoped server-side to source_system='autocount'
 * (native orders must use the real delivery flow); non-AutoCount /
 * already-closed ids are counted as skipped, not errors.
 *
 *   POST /api/operation/orders/bulk-complete  { orderIds: uuid[] }
 *     → { completed: number, skipped: number }
 *
 * Mounted at /operation/orders in apps/api/src/index.ts (same prefix as the
 * sibling order-control router).
 */
const bulkCompleteRouter = new Hono<AppEnv>();

const inputSchema = z.object({
  orderIds: z.array(z.string().uuid()).min(1).max(500),
});

bulkCompleteRouter.post("/bulk-complete", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(422, {
      message: `Invalid input: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
    });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("ops_bulk_complete_orders", {
    p_order_ids: parsed.data.orderIds,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? { completed: 0, skipped: 0 });
});

export default bulkCompleteRouter;
