/**
 * ⭐ Follow-up flag — DERIVED state, not a DB column.
 *
 * An order is "flagged for follow-up" when its most recent `follow_up` / `resolved`
 * annotation is a `follow_up` (someone starred it and nobody has resolved it since).
 * The drawer-header ⭐ star, the Orders-list star icon, and the list "Follow-up"
 * filter chip all read THIS one helper — so the star is the SAME concept as the
 * timeline's 🔔 Follow up / ✅ Resolved tags, just surfaced as a one-click flag +
 * a list filter (Jess: operation is run by multiple people with mid-order handoffs).
 *
 * Pass `{ tag, at }` pairs: the list has them as `order_annotations[].created_at`;
 * the drawer derives them from the timeline entries' `occurred_at`.
 */
export function isFollowUpFlagged(
  annotations: { tag: string | null; at: string }[],
): boolean {
  let latest: { tag: string; at: string } | null = null;
  for (const a of annotations) {
    if (a.tag !== "follow_up" && a.tag !== "resolved") continue;
    if (!latest || a.at > latest.at) latest = { tag: a.tag, at: a.at };
  }
  return latest?.tag === "follow_up";
}
