# OPERATION ACTIVITY — CARD · THE ACTIVITY RAIL NAMES EVERY INTERNAL ACTOR

**Module:** Shared ERP UI / Operation shell (Activity rail) · **Surface:** Quick Rail Activity
panel and its API read
**Status:** QUEUED — recorded 2026-08-27; **owner review required before build. NOT LAW.**
**Lane:** BUILD / DELIVERY (after owner approval)
**Found by:** the operation-reader acceptance walk of
`CARD-2026-08-27-sales-order-revisions-history-readable-records.md` (§11.7), while tracing why a
recorded principal actor rendered unnamed. The same read pattern exists on the Activity rail; the
readable-records Card's §10 boundary kept the fix out of that delivery.

---

## 1 · The gap, by inspection (not yet walked)

`apps/api/src/routes/operation/activity.ts` (~line 65) resolves actor names with a direct
`sb.from("app_users").select("id, name").in("id", actorIds)` under the caller's JWT.
Migration `0235` lets an operation JWT read only operation-role rows, so a principal, finance,
HR or warehouse actor's activity renders with no name to the operation staff reading the rail.
`apps/api/src/routes/operation/pos.ts` (~line 1252) carries the same pattern and must be checked.

This is the exact defect migration `0390_a_reader_may_name_an_internal_actor.sql` closed for
Sales Order History and Revisions: `actor_display_names(uuid[])`, a SECURITY DEFINER returning
only `(id, name)` for internal-staff rows, only to operation/principal JWTs.

## 2 · Scope when approved

- Route the Activity rail's (and, if confirmed, the POS route's) staff-name lookups through the
  existing `actor_display_names` door. **No new migration** — 0390 already exists and is live.
- Prefer extracting the one shared resolver (`resolveActorNames` in
  `apps/api/src/routes/operation/orders.ts`) over a third copy of the arithmetic — Law D: one
  derived fact, one arithmetic.
- Add API tests for the principal-actor-seen-by-operation case; walk the rail as an OPERATION
  account, not a principal one — a principal login cannot see this class of defect.

## 3 · Boundaries

The Activity rail stays a read-only preview (`ui/MASTER.md` §5); no new writer, no new event
source, no change to what events are shown — only to whether the person who acted is named.
