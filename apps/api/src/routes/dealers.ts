import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Adapters, DB, dealerSelfSchema } from "@carres/shared";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

const dealerRouter = new Hono<AppEnv>();

dealerRouter.get("/me", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "dealer" && auth.role !== "salesperson") {
    throw new HTTPException(403, { message: "Only dealer or salesperson can read /dealers/me" });
  }
  if (!auth.dealerId) {
    throw new HTTPException(404, { message: "Dealer not found" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.from("dealers").select("*").eq("id", auth.dealerId).maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) throw new HTTPException(404, { message: "Dealer not found" });

  const body = dealerSelfSchema.parse(Adapters.dealerFromRow(data as DB.DealerRow));
  return c.json(body);
});

export default dealerRouter;
