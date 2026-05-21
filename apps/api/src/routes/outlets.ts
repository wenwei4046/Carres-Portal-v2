import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  Adapters,
  DB,
  createOutletInput,
  outletSchema,
  outletsListResponseSchema,
} from "@carres/shared";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

const outletsRouter = new Hono<AppEnv>();

/**
 * GET /api/outlets — RLS-scoped read. Dealer/salesperson sees only their
 * dealer's outlets; principal/internal sees all (RLS policy
 * `outlets_scoped_read` handles both branches). No query params yet — Phase 3
 * may add `dealerId` for principal cross-dealer filtering, mirroring the
 * orders.ts pattern.
 */
outletsRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  const { data, error } = await sb.from("outlets").select("*").order("name");
  if (error) throw new HTTPException(500, { message: error.message });

  const outlets = (data ?? []).map((row) =>
    Adapters.outletFromRow(row as DB.OutletRow),
  );
  return c.json(outletsListResponseSchema.parse({ outlets }));
});

/**
 * POST /api/outlets — 2026-05-22 (Loo). Dealer/showroom self-service create.
 *
 * dealer_id is derived from JWT — caller cannot spoof another dealer.
 * Mirrors the pattern in salespersons.ts POST: same role gate, same JWT-
 * derived dealer scoping. The principal does NOT use this endpoint — they
 * seed the default outlet via Principal Accounts at dealer-create time
 * (apps/api/src/routes/principal/accounts.ts).
 */
outletsRouter.post("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom") {
    throw new HTTPException(403, { message: "Dealer/showroom only" });
  }
  if (!auth.dealerId) {
    throw new HTTPException(422, { message: "Caller has no dealer_id in JWT" });
  }

  const body = await c.req.json().catch(() => null);
  const parsed = createOutletInput.safeParse(body);
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
  const { name, address } = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("outlets")
    .insert({
      dealer_id: auth.dealerId,
      name,
      address,
    })
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });

  return c.json(outletSchema.parse(Adapters.outletFromRow(data as DB.OutletRow)));
});

export default outletsRouter;
