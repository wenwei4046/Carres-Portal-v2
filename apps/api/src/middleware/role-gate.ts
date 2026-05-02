import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Role } from "@carres/shared/domain";
import type { AppEnv } from "../types";

export function requireRole(allowed: ReadonlyArray<Role>) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const auth = c.var.auth;
    if (!auth) {
      throw new HTTPException(401, { message: "Auth context missing" });
    }
    if (!allowed.includes(auth.role)) {
      throw new HTTPException(403, { message: `Forbidden: '${auth.role}' not allowed` });
    }
    await next();
  });
}
