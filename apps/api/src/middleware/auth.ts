import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Role } from "@carres/shared/domain";
import type { AppEnv, AuthContext } from "../types";

// Supabase issues ES256 (asymmetric) JWTs signed with a per-project EC key. The
// public key lives at /auth/v1/.well-known/jwks.json. createRemoteJWKSet caches
// the keyset and refreshes on key rotation, so we don't fetch on every request.
let jwksCache: JWTVerifyGetKey | null = null;
let jwksCacheUrl: string | null = null;
let jwksInjectedForTest = false;
function getJwks(supabaseUrl: string): JWTVerifyGetKey {
  if (jwksInjectedForTest && jwksCache) return jwksCache;
  const url = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  if (jwksCache && jwksCacheUrl === url) return jwksCache;
  jwksCache = createRemoteJWKSet(new URL(url));
  jwksCacheUrl = url;
  return jwksCache;
}

// Test-only: jose's Node runtime uses node:https.request which msw can't
// intercept, so integration tests inject a local JWKSet (built from
// createLocalJWKSet) to bypass the network. Pass null to clear.
export function _setJwksForTesting(jwks: JWTVerifyGetKey | null): void {
  jwksCache = jwks;
  jwksCacheUrl = null;
  jwksInjectedForTest = jwks !== null;
}

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

  if (!c.env.SUPABASE_URL) {
    throw new HTTPException(500, { message: "SUPABASE_URL not configured" });
  }

  let payload: Record<string, unknown>;
  try {
    const jwks = getJwks(c.env.SUPABASE_URL);
    const result = await jwtVerify(jwt, jwks, { algorithms: ["ES256"] });
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
