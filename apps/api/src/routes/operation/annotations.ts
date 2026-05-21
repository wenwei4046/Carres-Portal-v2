import { Hono } from "hono";
import { z } from "zod";
import { mapPgError } from "../../lib/route-helpers";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Order annotations + activity timeline — Phase B
 *
 *   POST /:id/annotations   — add a human note (operation/principal/finance/bd)
 *   GET  /:id/timeline      — merged notes + system activity, newest-first
 *
 * `:id` is the order UUID (consistent with all other operation/orders sub-routes).
 * Auth: requireOperationOrPrincipal covers the core ops roles; finance + bd are
 * also admitted by the RPC itself (RLS + role check inside SECURITY DEFINER fn).
 */
const annotationsRouter = new Hono<AppEnv>();

const addAnnotationInput = z.object({
  content: z.string().trim().min(1).max(2000),
  tag: z.enum(["follow_up", "escalate", "resolved"]).nullable().optional(),
});

// ----- POST /:id/annotations -----
annotationsRouter.post("/:id/annotations", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = addAnnotationInput.safeParse(raw);
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

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_add_annotation", {
    p_order_id: orderId,
    p_content: parsed.data.content,
    p_tag: parsed.data.tag ?? null,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data, 201);
});

// ----- GET /:id/timeline -----
annotationsRouter.get("/:id/timeline", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_get_timeline", {
    p_order_id: orderId,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(data ?? []);
});

export default annotationsRouter;

// ─── Escalation inbox router (separate export, mounted at /operation/escalations) ───

export const escalationsRouter = new Hono<AppEnv>();

/**
 * GET /api/operation/escalations
 * Recent 'escalate'-tagged annotations with joined order + author.
 * Limit defaults to 10; ?limit=N accepted (max 30).
 */
escalationsRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const limitRaw = Number(c.req.query("limit") ?? "10");
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10), 30);

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("order_annotations")
    .select("id, content, created_at, created_by, orders(id, so, customer_name)")
    .eq("tag", "escalate")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  // created_by FK points to auth.users (not public.app_users) so PostgREST
  // can't traverse it. Fetch names from app_users manually in one round-trip.
  const rows = data ?? [];
  const authorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
  const nameMap: Record<string, string> = {};
  if (authorIds.length) {
    const { data: users } = await sb
      .from("app_users")
      .select("id, name")
      .in("id", authorIds);
    (users ?? []).forEach((u) => { nameMap[u.id] = u.name; });
  }

  return c.json(
    rows.map((r) => ({
      ...r,
      app_users: r.created_by ? { name: nameMap[r.created_by] ?? null } : null,
    })),
  );
});
