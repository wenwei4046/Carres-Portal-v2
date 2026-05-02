import { Hono } from "hono";
import { meResponseSchema } from "@carres/shared";
import type { AppEnv } from "../types";

const authRouter = new Hono<AppEnv>();

authRouter.get("/me", (c) => {
  const ctx = c.var.auth;
  const body = meResponseSchema.parse({
    id: ctx.id,
    email: ctx.email,
    role: ctx.role,
    dealerId: ctx.dealerId,
    supplierId: ctx.supplierId,
    partnerId: ctx.partnerId,
    outletId: ctx.outletId,
  });
  return c.json(body);
});

export default authRouter;
