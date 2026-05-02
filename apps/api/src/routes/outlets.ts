import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Adapters, DB, outletsListResponseSchema } from "@carres/shared";
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

export default outletsRouter;
