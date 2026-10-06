/**
 * ⭐ ONE ACTOR RESOLVER FOR EVERY RECORD THAT NAMES WHO ACTED
 * (CARD 2026-08-27; widened past Sales Orders 2026-09-01).
 *
 * History events, Revision rows and the Quick Rail's Activity feed all answer
 * "who did this" from the same two identity sources, and Law D says a derived
 * fact has ONE arithmetic — this function is that arithmetic. It was born in
 * the Sales Order detail route (2026-08-24), extracted so Revisions could not
 * drift from History (2026-08-27), and moved HERE (2026-09-01) so the Activity
 * rail could stop being a third copy carrying the bug the other two had
 * already fixed.
 *
 * ⛔ IT IS NOT A BARE `actor_display_names` CALL, and swapping one in would be
 * a regression wearing a fix's clothes. That door answers for internal staff
 * only — by design, `0390` returns NO dealer-side rows. A PRINCIPAL reader can
 * see every `app_users` row today (`0002` `app_users_self_read` via
 * `is_principal()`), so a route that replaced its plain read with the door
 * ALONE would start failing to name the salesperson and dealer actors that
 * principal can name right now. The second source is what makes the swap safe
 * for BOTH readers, and it is why this is a function rather than a one-line
 * substitution.
 *
 * TWO SOURCES, BECAUSE ONE CANNOT SEE EVERYONE. The internal-staff half is
 * `actor_display_names` (0390) — a narrow definer door returning exactly
 * (id, name) for principal/operation/finance/bd/hr/warehouse accounts. The
 * production walk of SO-1329 proved why a plain `app_users` read is not
 * enough: 0235's peers policy shows an operation JWT only operation-role
 * rows, so a PRINCIPAL actor rendered as an audit defect on the very order
 * that recorded her. The sales-side half is `salespersons` (0002
 * `salespersons_scoped_read`), which carries `user_id` and the salesperson's
 * own display name. The staff door wins where both answer: it is the
 * account; the salesperson row is the sales-side profile of the same person
 * — and the door deliberately returns NO dealer-side rows, so that rule
 * cannot print a shop login name over the person's own.
 *
 * BOUNDED: each distinct id is asked for once, however many events or
 * revisions it authored. FAILS OPEN: a read error or an unresolved id leaves
 * the record unnamed — the caller classifies that as an audit-data defect; a
 * person is never invented and an event is never dropped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveActorNames(sb: any, ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, string>> {
  const distinct = [...new Set(ids.filter((v): v is string => !!v))];
  const byId = new Map<string, string>();
  if (distinct.length === 0) return byId;
  const [staffRes, sellerRes] = await Promise.all([
    sb.rpc("actor_display_names", { p_ids: distinct }),
    sb.from("salespersons").select("user_id, name").in("user_id", distinct),
  ]);
  for (const r of (staffRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    if (r.name) byId.set(r.id, r.name);
  }
  for (const r of (sellerRes.data ?? []) as Array<{ user_id: string | null; name: string | null }>) {
    if (r.user_id && r.name && !byId.has(r.user_id)) byId.set(r.user_id, r.name);
  }
  return byId;
}


/**
 * ⭐ WHO ACTED IS DECIDED ONCE, ON THE SERVER, AND A SHARED LOGIN IS NOT A
 * PERSON — owner ruling 2026-09-26 (Orders MASTER §0.1).
 *
 * `actor_identities` (0592) adds the two facts a name alone cannot carry: the
 * account's role and its governed person marker (`app_users.is_person`, 0533).
 * An account with `is_person = false` is a shared role login, a robot or a
 * test account: it carries a name and is nobody.
 *
 * `isPerson` is `null` when the fact is not known — an actor the sales side
 * names, or a Worker deployed a moment before the migration applied. Unknown
 * is never read as `false`: nobody is called a shared login on a guess.
 */
export interface ActorIdentity {
  name: string;
  role: string | null;
  isPerson: boolean | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveActorIdentities(sb: any, ids: ReadonlyArray<string | null | undefined>): Promise<Map<string, ActorIdentity>> {
  const distinct = [...new Set(ids.filter((v): v is string => !!v))];
  const byId = new Map<string, ActorIdentity>();
  if (distinct.length === 0) return byId;
  const [names, identities] = await Promise.all([
    resolveActorNames(sb, distinct),
    sb.rpc("actor_identities", { p_ids: distinct }),
  ]);
  for (const [id, name] of names) byId.set(id, { name, role: null, isPerson: null });
  if (!identities.error) {
    for (const row of (identities.data ?? []) as Array<{ id: string; name: string | null; role: string | null; is_person: boolean | null }>) {
      if (!row.name) continue;
      byId.set(row.id, { name: row.name, role: row.role ?? null, isPerson: row.is_person ?? null });
    }
  }
  return byId;
}

/**
 * Classifies WHO acted, truthfully:
 *   human    a real person acted — an id that resolves to a name and is not
 *            known to be a shared login.
 *   system   ONLY when the writer itself recorded that an automated job acted
 *            (`metadata.actor === "system"`). A missing id is NEVER promoted.
 *   missing  the actor was not recorded, cannot be named, or is a shared role
 *            login — the screen says `Staff identity not recorded`.
 */
export function actorKindOf(
  byUserId: string | null | undefined,
  identity: ActorIdentity | null | undefined,
  metadata?: unknown,
): "human" | "system" | "missing" {
  if (byUserId) return identity?.name && identity.isPerson !== false ? "human" : "missing";
  const meta = metadata as Record<string, unknown> | null | undefined;
  if (meta && typeof meta === "object" && meta.actor === "system") return "system";
  return "missing";
}

/** The governed role word — a role is a hat, never a name. */
export function actorRoleWord(identity: ActorIdentity | null | undefined): string | null {
  const role = identity?.role?.trim();
  if (!role) return null;
  if (role === "bd") return "BD";
  if (role === "hr") return "HR";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
