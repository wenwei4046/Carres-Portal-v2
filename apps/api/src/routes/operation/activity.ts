import { Hono } from "hono";
import { mapPgError } from "../../lib/route-helpers";
import { requireOperationOrPrincipal } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/activity
 * The GLOBAL activity feed — recent system events + human notes across ALL
 * orders, merged newest-first, each row carrying its order (so + customer) and
 * the actor's name. Powers the "monitor everything" view; the client filters /
 * searches / tabs client-side (same pattern as the orders control table).
 *
 * Read-only, no migration: reads the append-only ops_activity_log +
 * order_annotations under the caller's RLS (internal roles). Actor names come
 * from app_users in one extra round-trip (the FK points at auth.users, which
 * PostgREST can't traverse — same trick as the escalations route).
 */
export const activityRouter = new Hono<AppEnv>();

type OrderEmbed = { so: number | null; customer_name: string | null } | null;
function order1(o: unknown): OrderEmbed {
  const v = Array.isArray(o) ? o[0] : o;
  return (v as OrderEmbed) ?? null;
}

activityRouter.get("/", requireOperationOrPrincipal, async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const PER = 150;

  const [actRes, annRes] = await Promise.all([
    sb
      .from("ops_activity_log")
      .select("id, order_id, action, detail, actor_id, occurred_at, orders(so, customer_name)")
      .order("occurred_at", { ascending: false })
      .limit(PER),
    sb
      .from("order_annotations")
      .select("id, order_id, content, tag, created_by, created_at, orders(so, customer_name)")
      .order("created_at", { ascending: false })
      .limit(PER),
  ]);
  if (actRes.error) {
    const m = mapPgError(actRes.error);
    return c.json(m.body, m.status);
  }
  if (annRes.error) {
    const m = mapPgError(annRes.error);
    return c.json(m.body, m.status);
  }

  const acts = actRes.data ?? [];
  const anns = annRes.data ?? [];

  const actorIds = [
    ...new Set(
      [
        ...acts.map((r) => r.actor_id),
        ...anns.map((r) => r.created_by),
      ].filter(Boolean) as string[],
    ),
  ];
  const nameMap: Record<string, string> = {};
  if (actorIds.length) {
    const { data: users } = await sb.from("app_users").select("id, name").in("id", actorIds);
    (users ?? []).forEach((u) => {
      nameMap[u.id] = u.name;
    });
  }

  const rows = [
    ...acts.map((r) => {
      const o = order1(r.orders);
      return {
        id: String(r.id),
        kind: "activity" as const,
        order_id: r.order_id,
        so: o?.so ?? null,
        customer_name: o?.customer_name ?? null,
        action: r.action,
        detail: r.detail,
        content: null,
        tag: null,
        actor_name: r.actor_id ? nameMap[r.actor_id] ?? null : null,
        occurred_at: r.occurred_at,
      };
    }),
    ...anns.map((r) => {
      const o = order1(r.orders);
      return {
        id: String(r.id),
        kind: "annotation" as const,
        order_id: r.order_id,
        so: o?.so ?? null,
        customer_name: o?.customer_name ?? null,
        action: null,
        detail: null,
        content: r.content,
        tag: r.tag,
        actor_name: r.created_by ? nameMap[r.created_by] ?? null : null,
        occurred_at: r.created_at,
      };
    }),
  ]
    .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
    .slice(0, 200);

  return c.json(rows);
});

export default activityRouter;
