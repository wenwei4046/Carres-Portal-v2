# GOVERNANCE — CARD · A PERSON SIGNS IN AS A PERSON, AND A ROLE IS NOT A NAME

**Module:** Cross-cutting (identity) · owners touched: HR/People (accounts) · Sales Orders ·
Shared ERP UI
**Business law:** OWNER-APPROVED / LOCKED 2026-08-27 (Jess) — recorded in
`docs/ui/MASTER.md` § HISTORY + REVISION THREE-RANK RECORD GRAMMAR (Staff Identity Law) and
`docs/orders/MASTER.md` § Revisions and History.
**Status:** QUEUED — implementation awaits build authorization. **No runtime change has been
made.**
**Lane:** BUILD / DELIVERY (after takeover)

---

## 1 · Why this card exists

The readable-records five-second walk (2026-08-27) FAILED on `Who did it?`: production showed
`principal · Principal` and `Recorded by principal`. The pipeline is correct end to end — 0387
stamps the authenticated `user_id`, 0390 resolves it to the account's display name — and the
answer is still not a person, because **the account itself is a role**. Jess ruled it an
identity-model defect, stopped the walk, and locked the Staff Identity Law.

## 2 · The audit — measured on production, 2026-08-27

**Authentication model (BUILT / VERIFIED).** Supabase email+password auth; one `app_users` row
per account carrying `role`, `name`, `status`, `position_id`; `custom_access_token_hook` (0004)
mirrors the role into the JWT; RLS and route guards read that claim. Individual account creation
ALREADY EXISTS: `POST /api/principal/accounts` (`apps/api/src/lib/create-account.ts`) mints any
role, principal-guarded. Positions + duties (`org_position_duties`, `ops_po_duty`) already bind
to individual accounts.

**Is `principal` shared?** It is a role-labeled login, not a person's: `name = 'principal'`,
generic mailbox, 22 Sales Order events, active today — while the INDIVIDUAL accounts that
already exist (Jess · Shasha · Khor Yee · Yu Jun, real names, own emails) carry **zero** Sales
Order events and mostly no sign-ins. The same pattern holds for `Operations` (6 events, active
today), `Finance · Carres HQ` and `Business Development · Carres HQ`. Whether more than one
human types the principal password cannot be proven from the database; under the ruling it does
not matter — a role-labeled operational login is treated as shared. `E2E Test · operation`
(34 events) is CI automation and stays, but is not a staff identity.

**The system already expects individuals.** PO duty months 07–09/2026 point at Shasha, Yu Jun
and Khor Yee's individual accounts. The money-gate approver (0362) passes on the `principal`
ROLE claim, so an individual Principal account keeps Jess's approver power with no rewiring.
One correction needed: Jess's existing individual account currently carries role `operation`,
not `principal`.

**Authoritative staff-name source:** `app_users.name` for internal staff (read through the 0390
`actor_display_names` door) · `salespersons.name` for the sales side. No new source is invented;
the fix makes the rows behind that source individuals.

## 3 · Approved operating model (RESOLVED FROM AUTHORITY — the 2026-08-27 ruling)

1. Every staff member signs in with an individual authenticated account bearing their real
   display name; roles are permissions only.
2. Every Sales Order write stores the individual `user_id` (0387 already enforces this at the
   ledger; RPCs already stamp `created_by`).
3. Revisions/History resolve the id to the real name; approved and forbidden displays are in the
   UI MASTER. A shared-login or unrecoverable actor displays `Staff identity not recorded`.
4. Shared operational logins are retired from use once individuals are live.

## 4 · Implementation plan (recommended; execute on takeover)

**Step 1 · Accounts (owner/admin actions — no code).**
- Correct Jess's individual account to role `principal` (existing accounts door or one governed
  SQL update; her approver power follows the role automatically).
- Confirm/refresh individual accounts for every current staff member (Shasha · Khor Yee ·
  Yu Jun · any others Jess names) via the existing `POST /api/principal/accounts` door; staff
  set their own passwords through the existing invite/update-password flow. **No agent ever
  handles a password.**
- Staff start signing in individually. Once confirmed, set the shared `principal`,
  `Operations`, `Finance · Carres HQ` and `Business Development · Carres HQ` accounts to
  `status = 'disabled'`.

**Step 2 · Migration 0391 (one, small).**
- `alter table app_users add column if not exists is_shared_login boolean not null default false;`
- Mark the four role-labeled accounts `is_shared_login = true` (configuration, not transaction
  data — survives go-live under CLAUDE.md §6).
- Re-create `actor_display_names` (0390) with `and not u.is_shared_login` — a shared login's id
  then resolves to no name, so the API's existing classification returns `missing` and the UI
  states the governed defect words. **No history row is rewritten; no backfill** — the
  individual behind a shared login was never captured and is not invented (red lines + §6).

**Step 3 · Governed copy.**
- `apps/web/src/pages/operation/SalesOrderLedger.tsx`: the missing-actor words become
  **`Staff identity not recorded`** (replacing `Actor was not recorded`, superseded by the
  ruling); `Recorded by` unchanged; `System` rule unchanged.
- Tests updated in the same commit: `SalesOrderLedger.test.tsx`,
  `SalesOrderWorkspace.ui-contract.test.ts` (the source-level ban list gains
  `principal · Principal` as a forbidden literal), `orders.test.ts` (shared-login id →
  `missing`).

**Step 4 · Acceptance.**
- Jess (or any staff member) creates ONE fresh Sales Order signed in as an individual Principal
  account; verify the new History event and Rev 1 read
  `Jess · Principal · {actual date/time}` / `Recorded by Jess · {actual date/time}` in
  authenticated production, as an OPERATION reader (the role that exposed the last gap).
- Repeat the cold five-second staff walk with an operation staff member on that fresh order.
  Only then may `CARD-2026-08-27-sales-order-revisions-history-readable-records.md` take
  `PRODUCTION-VERIFIED`.

**Affected files (complete):** `supabase/migrations/0391_*.sql` (new) ·
`apps/api/src/routes/operation/orders.ts` (no change expected — resolver already classifies) ·
`apps/web/src/pages/operation/SalesOrderLedger.tsx` + its two test files +
`apps/api/src/routes/operation/orders.test.ts` · account rows (data, via the existing admin
door). The Activity-rail read has the same consumer gap and its own queued card
(`CARD-2026-08-27-activity-rail-names-internal-actors.md`); it inherits this law without
restating it.

## 5 · Boundaries

- No history rewrite, no invented person, no backfill (red line + CLAUDE.md §6).
- No new permission model — roles, RLS and duties stay exactly as ruled; this card changes who
  HOLDS a login, not what a role may do.
- No hardcoded `principal → Jess` anywhere, UI or server.
- The readable-records Card stays `EXECUTED · SHIPPED` until §4's fresh-record walk passes.
