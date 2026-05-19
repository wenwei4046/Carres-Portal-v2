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

/**
 * 2026-05-12 (Loo) — admits `logistics` OR `principal`. Used by the revert
 * RPCs (`logistics_revert_order_*`) so the principal can rewind orders even
 * when no logistics staff are around. Mirrors the role gate inside the RPCs.
 */
export const requireLogisticsOrPrincipal: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics" && role !== "principal") {
    throw new HTTPException(403, { message: "Logistics or Principal only" });
  }
  await next();
};

/**
 * Phase 5 — admits `finance` OR `principal` roles. Mirrors the role gate
 * inside every Phase 5 RPC (`if app_role() not in ('finance','principal')
 * then raise '42501'`). The principal role is admitted because the
 * principal account is the de-facto fallback during Go-live before a
 * dedicated finance staff account exists.
 */
export const requireFinance: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "finance" && role !== "principal") {
    throw new HTTPException(403, { message: "Finance or Principal only" });
  }
  await next();
};

/**
 * Phase 6 — admits `supplier` only. Mirrors the role gate inside every
 * Phase 6 supplier RPC (migration 0066: `if app_role() <> 'supplier' then
 * raise '42501'`). RLS plus the cross-supplier guard inside the RPCs
 * provide the second-layer scope check (po.supplier_id = app_supplier_id()).
 */
export const requireSupplier: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.auth?.role !== "supplier") {
    throw new HTTPException(403, { message: "Supplier only" });
  }
  await next();
};

/**
 * Ops Panel (Jess COO). wenwei renamed `logistics`→`operation` in migration
 * 0121 (shared DB). Canonical role = `operation`; `logistics` kept
 * transitionally until rename fully propagates; `principal` = admin fallback.
 * Mirrors the route gate in apps/web/src/App.tsx for /ops/*.
 */
export const requireOps: MiddlewareHandler<AppEnv> = async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "principal" && role !== "operation" && role !== "logistics") {
    throw new HTTPException(403, { message: "Ops access only" });
  }
  await next();
};
