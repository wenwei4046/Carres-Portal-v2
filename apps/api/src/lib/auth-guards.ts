import { HTTPException } from "hono/http-exception";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";

/**
 * Per-route role guards that don't leak to sibling sub-routers.
 *
 * Carry-forward `phase-4.5-chunk-2-route-mount-middleware-leak`:
 * Hono v4's `app.route(path, subapp)` flattens the sub-app's routes onto the
 * parent at `path`. A blanket `subapp.use("*", ...)` becomes equivalent to
 * `app.use(path + "/*", ...)` — which then matches every sibling sub-router
 * mounted at the same `path`. That's why earlier `logisticsPosRouter.use("*",
 * logisticsOnly)` silently 403'd `principal` and `partner` traffic to the
 * sibling routers `lpInboundRouter` and `dispatchCustomerLegRouter`, even
 * though those routers' inline allowlists tried to admit those roles.
 *
 * The fix is per-route middleware: passing a guard as the second argument to
 * `router.get(path, guard, handler)` binds it to that specific path on this
 * router only, so siblings stay isolated. Sub-routers that legitimately need
 * to admit non-logistics roles enforce that in their own per-route handlers
 * (or guards) instead of inheriting an upstream blanket.
 *
 * Usage:
 *   logisticsPosRouter.get("/", requireLogistics, async (c) => { ... });
 *   logisticsPosRouter.post("/:id/cancel", requireLogistics, async (c) => { ... });
 */
export const requireLogistics: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.auth?.role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
};
