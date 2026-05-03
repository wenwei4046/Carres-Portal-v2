import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { listLogisticsOrdersQuery } from "@carres/shared";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * /api/logistics/orders — Phase 4 M2 backend orders subsystem.
 *
 * Endpoints implemented in this task (M2 Task 2):
 *   GET / — list with stage/channel/search filters
 *
 * Future M2 tasks add: GET /:id, POST /:id/assign-partner, POST /:id/attach-do,
 * POST /:id/abandon, POST /:id/warehouse, POST /:id/recheck-stock.
 *
 * Pattern: matches apps/api/src/routes/principal/dealers.ts (multi-endpoint
 * router with role-only middleware + inline mapPgError).
 */
const logisticsOrdersRouter = new Hono<AppEnv>();

// Inline logistics-only guard — fast 403 before any Supabase round-trip.
logisticsOrdersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

/** SQLSTATE -> HTTP body+status. Mirrors principal/dealers.ts inline mapper. */
function mapPgError(error: { code?: string; message?: string; details?: string }) {
  switch (error.code) {
    case "42501":
      return { status: 403 as const, body: { error: "forbidden", code: "forbidden", message: error.message ?? "forbidden" } };
    case "42P01":
      return { status: 404 as const, body: { error: "not_found", code: "not_found", message: error.message ?? "not found" } };
    case "22023":
      return { status: 422 as const, body: { error: "invalid_param", code: "invalid_param", message: error.message ?? "invalid param" } };
    case "P0001":
      return { status: 422 as const, body: { error: "rule_violation", code: error.details ?? "invalid_param", message: error.message ?? "rule violation" } };
    default:
      return { status: 500 as const, body: { error: "rpc_failed", code: "rpc_failed", message: error.message ?? "rpc failed" } };
  }
}

// ----- GET / list -----
logisticsOrdersRouter.get("/", async (c) => {
  const parsed = listLogisticsOrdersQuery.safeParse({
    stage: c.req.query("stage") ?? undefined,
    channel: c.req.query("channel") ?? undefined,
    search: c.req.query("search") ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { error: "invalid_query", code: "invalid_param", message: parsed.error.issues[0]?.message ?? "invalid query" },
      422,
    );
  }
  const { stage, channel, search } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  let q = sb
    .from("orders")
    .select(
      "id, dl, status, logistics_stage, warehouse_id, customer_name, placed_at, delivery_date, delivery_partner_id, do_number, dispatched_at, delivered_at, showroom_id, dealer_id, dealers(name)",
    )
    .in("status", ["proceed_order", "delivered"]);

  if (stage !== "all") q = q.eq("logistics_stage", stage);
  if (channel === "dealers") q = q.eq("showroom_id", null);
  if (channel === "showrooms") q = q.not("showroom_id", "is", null);
  if (search) {
    const asInt = Number.parseInt(search, 10);
    if (Number.isFinite(asInt)) {
      q = q.or(`customer_name.ilike.%${search}%,dl.eq.${asInt}`);
    } else {
      q = q.ilike("customer_name", `%${search}%`);
    }
  }

  q = q.order("placed_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ orders: data ?? [] });
});

export default logisticsOrdersRouter;
