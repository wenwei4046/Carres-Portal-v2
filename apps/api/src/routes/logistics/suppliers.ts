import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/logistics/suppliers
 *
 * Lightweight list of suppliers — used by `CreatePOModal` (M5 Task 3, §18.4
 * spec) to populate the "Supplier" dropdown and to drive the auto-detect of
 * supplier per SKU via `cat_covered`. Surfaces the columns proto's NewPODialog
 * needs: `id`, `name`, `kind` (own_logistics | factory_pickup), `cat_covered`,
 * `lead_time`, `contact`.
 *
 * Auth: logistics-only via inline guard (mirrors partners.ts pattern). RLS
 * `suppliers_read` already lets HQ roles SELECT (0002_rls.sql), so the user
 * JWT is enough — no service_role.
 */
const logisticsSuppliersRouter = new Hono<AppEnv>();

logisticsSuppliersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "logistics") {
    throw new HTTPException(403, { message: "Logistics only" });
  }
  await next();
});

logisticsSuppliersRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("suppliers")
    .select("id, name, kind, cat_covered, lead_time, contact")
    .order("name", { ascending: true });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ suppliers: data ?? [] });
});

export default logisticsSuppliersRouter;
