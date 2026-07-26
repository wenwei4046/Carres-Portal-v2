import type { Role } from "@carres/shared/domain";

export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  // 0233 staff PIN login — HS256 secret the Hono routes sign/verify the
  // short-lived staff session token with. Worker secret (`wrangler secret put`);
  // never reaches the browser bundle.
  STAFF_SESSION_SECRET: string;
  // Stripe online collection (0223). Secrets — undefined until
  // `wrangler secret put` runs; routes answer 503 stripe_not_configured.
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  // Where Checkout lands after paying (wrangler.toml [vars]).
  PUBLIC_WEB_URL?: string;
};

export type AuthContext = {
  id: string;
  email: string;
  role: Role;
  dealerId: string | null;
  supplierId: string | null;
  partnerId: string | null;
  outletId: string | null;
  jwt: string;
};

export type Variables = {
  auth: AuthContext;
  /**
   * HR-P2 (0260) — the caller's duty keys from `my_org_duties()`, memoised for
   * the life of ONE request by `lib/duties.ts`. Deliberately NOT populated by
   * the auth middleware: duties cost a DB round-trip and only a handful of
   * routes gate on them, so the read is lazy rather than on every request.
   */
  duties?: readonly string[];
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
