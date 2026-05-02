import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  // Wired in Phase 1+ via wrangler secret put or .dev.vars
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_JWT_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

export default app;
