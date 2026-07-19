import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/partners
 *
 * Lightweight list of delivery partners — used by `DispatchModal` (M5 Task 2,
 * §18.3 spec) to populate the "Assign delivery partner" dropdown. Surfaces
 * `id`, `name`, `contact`, `zones` only (no rate cards, no fleet); the modal
 * shows partner name + zones in the option label and contact in the preview
 * panel beneath.
 *
 * Auth: operation-only via inline guard (mirrors orders.ts pattern). RLS
 * `partners_read` already lets HQ roles SELECT (0002_rls.sql:157), so the
 * user JWT is enough — no service_role.
 */
const operationPartnersRouter = new Hono<AppEnv>();

operationPartnersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation only" });
  }
  await next();
});

operationPartnersRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("delivery_partners")
    .select("id, name, contact, zones, whatsapp_group_url")
    .order("name", { ascending: true });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ partners: data ?? [] });
});

export default operationPartnersRouter;
