import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/badges (Loo 2026-05-10, "unread" rewrite 2026-05-11)
 *
 * Sidebar action-count feed. Returns `{ orders, procurement }`.
 *
 * Semantics changed 2026-05-11 from "open work counter" to "unread since
 * last view" per Loo's a-to-z run feedback — the orange badge wouldn't
 * disappear after clicking the tab, which read like a stale notification.
 *
 * Now: count rows whose `updated_at > user_nav_seen.last_seen_at` for the
 * relevant badge_key. Both `orders` and `purchase_orders` have BEFORE
 * UPDATE triggers on `updated_at`, so any state transition or new INSERT
 * advances the timestamp and the badge re-lights.
 *
 * Badge keys (all operation-scoped use the `operation:` prefix so future
 * roles can co-exist in the same user_nav_seen table without collision):
 *   operation:orders       — orders.operation_stage = 'in_production'
 *   operation:procurement  — POs in the Pickup-action bucket (see below)
 *
 * First-time view (no row in user_nav_seen) treats last_seen_at as epoch,
 * so the badge surfaces every active item. Clicking the tab calls
 * POST /api/operation/badges/seen which upserts last_seen_at = now() —
 * the next badge poll returns 0 (or N where N items advanced after the
 * click).
 *
 * Polling cadence (web): 30s on the hook side. Mark-seen also optimistically
 * zeroes the badge client-side for instant feedback before the next poll.
 */
const operationBadgesRouter = new Hono<AppEnv>();

const ORDERS_KEY = "operation:orders";
const PROCUREMENT_KEY = "operation:procurement";
// 0152 (Loo 2026-05-31) — active "LP rejected" notification. Counts orders an
// LP rejected (orders.partner_rejected_at) that are newer than the operator's
// last view, so the sidebar rings when a delivery bounces back for reselect.
const LP_REJECTED_KEY = "operation:lp_rejected";
const EPOCH = "1970-01-01T00:00:00Z";

operationBadgesRouter.get("/", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "operation only" });
  }

  const sb = userClient(c.env, auth.jwt);

  // Look up the user's last-seen timestamps for both keys in one round-trip.
  // RLS on user_nav_seen scopes to auth.uid() automatically.
  const seenRes = await sb
    .from("user_nav_seen")
    .select("badge_key, last_seen_at")
    .in("badge_key", [ORDERS_KEY, PROCUREMENT_KEY, LP_REJECTED_KEY]);
  if (seenRes.error) {
    const m = mapPgError(seenRes.error);
    return c.json(m.body, m.status);
  }
  const seenMap = new Map<string, string>();
  for (const row of seenRes.data ?? []) {
    seenMap.set(row.badge_key, row.last_seen_at);
  }
  const ordersSince = seenMap.get(ORDERS_KEY) ?? EPOCH;
  const procurementSince = seenMap.get(PROCUREMENT_KEY) ?? EPOCH;
  const lpRejectedSince = seenMap.get(LP_REJECTED_KEY) ?? EPOCH;

  const today = new Date().toISOString().slice(0, 10);

  const [ordersRes, procurementRes, snRes, lpRejectedRes] = await Promise.all([
    sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("operation_stage", "in_production")
      .gt("updated_at", ordersSince),
    sb
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .neq("status", "received")
      .in("sup_status", [
        "ready_confirm_sent",
        "ready_for_pickup",
        // 2026-05-15 (Task 14) — `partially_shipped` (migration 0107) keeps
        // the procurement badge re-lit when a partial pickup happens, so
        // operation sees there's still mid-flight work on the PO.
        "partially_shipped",
        "delivered",
        "reassign_needed",
      ])
      .gt("updated_at", procurementSince),
    // Service notes badge: ongoing cases whose deadline has passed.
    // Uses a live count (not last-seen semantics) — overdue = real alert.
    sb
      .from("service_notes")
      .select("id", { count: "exact", head: true })
      .eq("status", "ongoing")
      .lt("deadline", today),
    // 0152 — orders an LP rejected since the operator last looked. Reject
    // bumps orders.partner_rejected_at; reselect clears it → the badge zeroes
    // once Operation picks a new LP.
    sb
      .from("orders")
      .select("id", { count: "exact", head: true })
      .not("partner_rejected_at", "is", null)
      .gt("partner_rejected_at", lpRejectedSince),
  ]);
  if (ordersRes.error) {
    const m = mapPgError(ordersRes.error);
    return c.json(m.body, m.status);
  }
  if (procurementRes.error) {
    const m = mapPgError(procurementRes.error);
    return c.json(m.body, m.status);
  }
  if (lpRejectedRes.error) {
    const m = mapPgError(lpRejectedRes.error);
    return c.json(m.body, m.status);
  }

  return c.json({
    orders: ordersRes.count ?? 0,
    procurement: procurementRes.count ?? 0,
    serviceNotes: snRes.count ?? 0,
    lpRejected: lpRejectedRes.count ?? 0,
  });
});

/**
 * POST /api/operation/badges/seen — Loo 2026-05-11 unread semantics
 *
 * Marks a badge_key as seen by the current user. Upserts `last_seen_at = now()`
 * via the `mark_badge_seen` RPC (migration 0083). Returns the new timestamp.
 *
 * Body: { badgeKey: "operation:orders" | "operation:procurement" }
 *
 * Locked the accepted keys at the route level so a misbehaving client can't
 * pollute the table with arbitrary keys. Add to the literal union when new
 * badges land.
 */
const seenInput = z.object({
  badgeKey: z.enum([
    "operation:orders",
    "operation:procurement",
    "operation:lp_rejected",
  ]),
});

operationBadgesRouter.post("/seen", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "operation only" });
  }
  const raw = await c.req.json().catch(() => ({}));
  const parsed = seenInput.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_input",
        code: "invalid_param",
        message: parsed.error.issues[0]?.message ?? "invalid input",
      },
      422,
    );
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb.rpc("mark_badge_seen", {
    p_badge_key: parsed.data.badgeKey,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ badgeKey: parsed.data.badgeKey, lastSeenAt: data });
});

export default operationBadgesRouter;
