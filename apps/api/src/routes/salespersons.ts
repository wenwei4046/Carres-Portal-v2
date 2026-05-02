import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { Adapters, DB, salespersonsListResponseSchema } from "@carres/shared";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

const salespersonsRouter = new Hono<AppEnv>();

const listQuerySchema = z.object({
  outletId: z.string().uuid().optional(),
});

/**
 * GET /api/salespersons — RLS-scoped read. Dealer/salesperson sees only their
 * dealer's SPs; principal/internal sees all (RLS `salespersons_scoped_read`).
 * Optional `outletId` query param narrows to one outlet — the wizard's Step 1
 * uses this once an outlet is picked.
 */
salespersonsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid query: " + parsed.error.issues[0]?.message,
    });
  }
  const { outletId } = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  let q = sb.from("salespersons").select("*");
  if (outletId) q = q.eq("outlet_id", outletId);

  const { data, error } = await q.order("name");
  if (error) throw new HTTPException(500, { message: error.message });

  const salespersons = (data ?? []).map((row) =>
    Adapters.salespersonFromRow(row as DB.SalespersonRow),
  );
  return c.json(salespersonsListResponseSchema.parse({ salespersons }));
});

export default salespersonsRouter;
