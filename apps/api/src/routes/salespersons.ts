import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  salespersonCreateInputSchema,
  salespersonSchema,
  salespersonsListResponseSchema,
} from "@carres/shared";
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

/**
 * POST /api/salespersons — Phase 2D dealer/showroom self-service create.
 *
 * Caller must be `dealer` or `salesperson` (a salesperson can also add
 * peers under their own dealer; matches RLS `salespersons_dealer_write`).
 * dealer_id is derived from JWT — caller cannot spoof a different one.
 * principal/internal can also use this for any dealer (RLS lets is_principal
 * write any row), but they pass dealerId explicitly via the body — V1 keeps
 * it dealer-scoped only (no admin path) since Phase 8 BD/principal flows
 * don't need this yet.
 */
salespersonsRouter.post("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom") {
    throw new HTTPException(403, { message: "Dealer/showroom only" });
  }
  if (!auth.dealerId) {
    throw new HTTPException(422, { message: "Caller has no dealer_id in JWT" });
  }

  const body = await c.req.json().catch(() => null);
  const parsed = salespersonCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error:   "invalid_body",
        code:    "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid body",
      },
      422,
    );
  }
  const { name, phone, outletId } = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("salespersons")
    .insert({
      dealer_id: auth.dealerId,
      outlet_id: outletId ?? null,
      name,
      phone:     phone ?? null,
    })
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json(salespersonSchema.parse(Adapters.salespersonFromRow(data as DB.SalespersonRow)));
});

/**
 * DELETE /api/salespersons/:id — Phase 2D self-service remove.
 *
 * RLS `salespersons_dealer_write` ensures dealer can only delete their own
 * dealer's rows. If the salesperson is referenced by orders.salesperson_id,
 * Postgres FK on `orders` (`on delete set null` per migration 0001) will
 * null-out those references rather than block the delete — historical
 * orders just lose their salesperson attribution. Acceptable per Loo
 * (a salesperson "leaving" doesn't invalidate past orders).
 */
salespersonsRouter.delete("/:id", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom") {
    throw new HTTPException(403, { message: "Dealer/showroom only" });
  }
  const id = c.req.param("id");
  if (!z.string().uuid().safeParse(id).success) {
    throw new HTTPException(422, { message: "invalid uuid" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { error, count } = await sb.from("salespersons").delete({ count: "exact" }).eq("id", id);
  if (error) throw new HTTPException(500, { message: error.message });
  if ((count ?? 0) === 0) {
    throw new HTTPException(404, { message: "salesperson not found" });
  }
  return c.json({ ok: true });
});

export default salespersonsRouter;
