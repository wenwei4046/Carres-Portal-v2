import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { jwtVerify } from "jose";
import type { Role } from "@carres/shared/domain";
import type { AppEnv, AuthContext } from "../types";

const VALID_ROLES: ReadonlyArray<Role> = [
  "principal", "dealer", "salesperson", "showroom",
  "logistics", "supplier", "partner", "finance", "bd",
];

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (VALID_ROLES as readonly string[]).includes(v);
}

function asNullableUuid(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing bearer token" });
  }
  const jwt = header.slice("Bearer ".length).trim();
  if (!jwt) throw new HTTPException(401, { message: "Empty bearer token" });

  if (!c.env.SUPABASE_JWT_SECRET) {
    throw new HTTPException(500, { message: "JWT secret not configured" });
  }

  let payload: Record<string, unknown>;
  try {
    const secret = new TextEncoder().encode(c.env.SUPABASE_JWT_SECRET);
    const result = await jwtVerify(jwt, secret, { algorithms: ["HS256"] });
    payload = result.payload as Record<string, unknown>;
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  const sub = payload.sub;
  const email = payload.email;
  const appMeta = payload.app_metadata as Record<string, unknown> | undefined;
  const roleRaw = appMeta?.role;

  if (typeof sub !== "string" || typeof email !== "string") {
    throw new HTTPException(401, { message: "Token missing sub or email" });
  }
  if (!isRole(roleRaw)) {
    throw new HTTPException(401, { message: "Token missing valid app_metadata.role" });
  }

  const ctx: AuthContext = {
    id: sub,
    email,
    role: roleRaw,
    dealerId: asNullableUuid(appMeta?.dealer_id),
    supplierId: asNullableUuid(appMeta?.supplier_id),
    partnerId: asNullableUuid(appMeta?.partner_id),
    outletId: asNullableUuid(appMeta?.outlet_id),
    jwt,
  };

  c.set("auth", ctx);
  await next();
});
