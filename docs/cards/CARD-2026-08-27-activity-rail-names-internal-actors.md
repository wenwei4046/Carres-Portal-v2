# OPERATION ACTIVITY — CARD · THE ACTIVITY RAIL NAMES EVERY INTERNAL ACTOR

**Module:** Shared ERP UI / Operation shell (Activity rail) · **Surface:** Quick Rail Activity
panel and its API read
**Status:** EXECUTED — built 2026-09-01 on the owner's instruction ("show activity rail names then"). See §Execution at the foot.
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

---

## Execution — 2026-09-01

**Built as scoped, with one correction to the plan.**

- The rail's lookup (`apps/api/src/routes/operation/activity.ts`) and the PO
  audit's (`apps/api/src/routes/operation/pos.ts` — the `~line 1252` §1 asked
  to confirm; the file had drifted) both go through `resolveActorNames`.
- **§2b honoured:** the resolver was EXTRACTED to
  `apps/api/src/lib/actor-names.ts` rather than copied a third time. Its two
  Sales Order callers are unchanged.
- **No migration.** `0390` exists and is untouched, exactly as §2 predicted.

**⛔ THE CORRECTION, and it is the part worth keeping.** §2a says to route the
lookups "through the existing door". Doing literally that — swapping in a bare
`actor_display_names` call — would have been a regression wearing a fix's
clothes. The door answers for internal staff ONLY, by design (`0390` returns no
dealer-side rows), while `0211`'s triggers stamp salesperson ids straight into
this feed and a PRINCIPAL reader names those people today. A door-only fix
would have fixed the operation reader by breaking the principal one. The
resolver's second source (`salespersons`) is what makes the swap safe for both,
and a negative control pins it: replacing the resolver with the door alone
fails the salesperson case.

**One behaviour change beyond the card, stated because it is not a no-op.** The
PO audit route printed `name || email`, so a staff row with no name showed an
email address as if it were a person's name. The door returns no email, so an
unresolved actor is now simply unnamed — which is what every other record
reader already does. PII left an audit screen; nothing else moved.

**Not built, and named so the next reader does not think they were missed.**
Eleven other routes carry the same plain `app_users` read.
`warehouse-receipts.ts:167` is the cleanest next win — a warehouse submitter is
invisible to the ops receiving queue and the door does answer for `warehouse`.
`routes/orders.ts:4255` is affected and must NOT be converted the same way:
dealer and salesperson JWTs reach it and the door answers them zero rows. §3's
boundary governed this build.

**Walked as an operation account, per §2c** — a principal login cannot see this
class of defect, which is why it survived long enough to need a card.
