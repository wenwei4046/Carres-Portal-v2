import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireSupplier } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 carry-forward — Supplier · Activity feed.
 *
 * Closes `phase-6-supplier-recent-activity`. Proto Dashboard
 * (supplier-pages.jsx) shows the last 6 po_history entries; V1 Dashboard
 * left this slot empty pending a dedicated endpoint.
 *
 * Mounted at `/api/supplier/activity`. Per-route `requireSupplier` guard.
 * Read is RLS-scoped via `po_history_read` policy (0002:256) which joins
 * po_history.po_id → purchase_orders.supplier_id; we just forward the JWT
 * and the supplier sees only their own rows.
 *
 * Returns the 6 most recent entries by `occurred_at` desc — small bounded
 * response, no pagination needed.
 */
const supplierActivityRouter = new Hono<AppEnv>();

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 30;

supplierActivityRouter.get("/", requireSupplier, async (c) => {
  const auth = c.var.auth;

  // Optional ?limit= override; clamp to MAX_LIMIT to avoid runaway scans.
  const limitRaw = new URL(c.req.url).searchParams.get("limit");
  const limitParsed = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;
  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0
      ? Math.min(Math.trunc(limitParsed), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("po_history")
    .select("id, po_id, text, by_role, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data ?? []);
});

export default supplierActivityRouter;
