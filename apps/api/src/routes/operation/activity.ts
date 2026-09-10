import { Hono } from "hono";
import { resolveActorNames } from "../../lib/actor-names";
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
 * order_annotations under the caller's RLS (internal roles).
 *
 * ⚠️ THE SENTENCE THAT USED TO END THIS PARAGRAPH WAS THE BUG. It read
 * "Actor names come from app_users in one extra round-trip", and that plain
 * read is what left every principal, Finance, HR and Warehouse actor unnamed
 * to an operation login — `0235` shows an operation JWT only operation-role
 * rows. Names now come from `resolveActorNames`, the one arithmetic the Sales
 * Order History and Revisions already use (Law D). See the note at the call.
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
  /* ⭐ THE RAIL NAMES EVERY INTERNAL ACTOR (CARD-2026-08-27, built
     2026-09-01).
     This read `app_users` straight, under the caller's own JWT. `0235`'s peers
     policy shows an OPERATION login only operation-role rows, so every act by
     a principal, Finance, HR or Warehouse arrived here unnamed and the rail
     printed the event with nobody attached to it. The Person filter and the
     search box are built from these names too, so those actors were also
     unfilterable and unsearchable — a whole class of activity the operator
     could see happening and could not attribute or find.
     ⛔ AND A PRINCIPAL READER COULD ALWAYS SEE THEM, which is why nobody
     caught it: `0002`'s `app_users_self_read` gives a principal every row. The
     card says to walk this rail as an OPERATION account for exactly that
     reason.
     `resolveActorNames` is the one arithmetic the Sales Order History and
     Revisions already use (Law D). ⛔ NOT a bare `actor_display_names` call:
     that door returns internal staff only, so swapping it in alone would have
     STOPPED naming the salesperson and dealer actors a principal names today —
     `0211`'s triggers stamp their ids straight into this feed. The resolver's
     second source is what makes the swap safe for both readers. */
  const nameById = await resolveActorNames(sb, actorIds);
  const nameMap: Record<string, string> = Object.fromEntries(nameById);

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
