import { Hono } from "hono";
import { z } from "zod";
import { fail } from "../../lib/route-helpers";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import { actorKindOf, actorRoleWord, resolveActorIdentities, resolveActorNames } from "../../lib/actor-names";
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
  if (error) return fail(c, error);
  return c.json(data, 201);
});

// ----- GET /:id/timeline -----
annotationsRouter.get("/:id/timeline", requireOperationOrPrincipal, async (c) => {
  const orderId = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("operation_get_timeline", {
    p_order_id: orderId,
  });
  if (error) return fail(c, error);
  const rows = (data ?? []) as Array<{ id: string; kind: string; detail?: unknown }>;
  if (!rows.length) return c.json([]);
  // The merged RPC drops actor ids. Recover only these order-scoped records,
  // then use the same identity classification as Order History and Revisions.
  const [activities, notes] = await Promise.all([
    rows.some(row => row.kind === "activity") ? sb.from("ops_activity_log").select("id, actor_id").eq("order_id", orderId).in("id", rows.filter(row => row.kind === "activity").map(row => row.id)) : Promise.resolve({ data: [], error: null }),
    rows.some(row => row.kind === "annotation") ? sb.from("order_annotations").select("id, created_by").eq("order_id", orderId).in("id", rows.filter(row => row.kind === "annotation").map(row => row.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  if (activities.error) return fail(c, activities.error);
  if (notes.error) return fail(c, notes.error);
  const ids = new Map<string, string | null>();
  for (const row of activities.data ?? []) ids.set(row.id, row.actor_id);
  for (const row of notes.data ?? []) ids.set(row.id, row.created_by);
  const identities = await resolveActorIdentities(sb, [...ids.values()]);
  return c.json(rows.map(row => {
    const actorId = ids.get(row.id);
    const identity = actorId ? identities.get(actorId) : null;
    const actor_kind = actorKindOf(actorId, identity, row.detail);
    return { ...row, actor_kind, actor_role: actorRoleWord(identity),
      actor_name: actor_kind === "human" ? identity?.name : actor_kind === "system" ? "System" : "Staff identity not recorded" };
  }));
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

  if (error) return fail(c, error);

  // created_by FK points to auth.users (not public.app_users) so PostgREST
  // can't traverse it. Names come from the one actor lookup.
  const rows = data ?? [];
  const names = await resolveActorNames(sb, rows.map((r) => r.created_by));

  return c.json(
    rows.map((r) => ({
      ...r,
      app_users: r.created_by ? { name: names.get(r.created_by) ?? null } : null,
    })),
  );
});
