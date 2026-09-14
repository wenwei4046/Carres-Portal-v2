# HANDOFF — Carres Portal v2 · continuous build

Paste everything below the line into a fresh session. It is self-contained.

> **`docs/handoff/` HOLDS EXACTLY ONE LIVE PROMPT, AND THIS IS IT.**
>
> Two prompts existed here for four hours on 2026-09-01 and disagreed; a fresh
> session could not tell which one ruled (Law 5: *can the project have one file
> fewer?*). **When this lane's mission changes, OVERWRITE this file — never add a
> second one beside it.** Re-measure every number in §1 before trusting it.

---

CARRES PORTAL v2 — CONTINUOUS BUILD · checkpoint 2026-09-14

## 1 · Where main and production stand

- `origin/main` = the Payment-ownership-seam merge (this lane); deployed on erp · pos · pages.dev ·
  api (`/__carres_deploy.json`, `/health`). Re-measure the SHA before quoting it.
- Production tracker tail `0504`. Applied by this lane: `0489` (collection-owner ledger + three
  doors), `0495`, `0498`, `0499`, `0504`. All forward-only. `0503` is taken by the unmerged
  `fix/finance-gates-no-role`; take the MAX of the tracker tail, the repo tail and every branch
  before writing a new one.
- Migration replay: `PG_BIN=<bin> node scripts/dry-run-migrations.mjs --baseline
  scripts/migration-replay-baseline.json --keep` runs the whole chain on a throwaway cluster. The
  server binaries come from `@embedded-postgres/darwin-arm64`; `psql` is **not** in that package —
  symlink `/opt/homebrew/opt/libpq/bin/psql` into the same folder or the script cannot start.
  Five migrations fail by baseline; `0463`/`0466` now replay cleanly and can leave the baseline.

## 2 · What this lane finished (production-verified; do not rebuild)

- PAYMENTS → Monitor · Payment Records, the two-calendar clock, collection timing as a setting
  (0486), 7-day free storage, the shut approval doors (#1252–#1269).
- **AUTOMATIC, STABLE customer-payment ownership is RESOLVED (0504).** The responsible Operation
  person for a Sales Order is the INDIVIDUAL the order was dealt to when it entered Operations
  (`ops_order_control.assigned_staff`, 0232/0235). `delivery_responsible_operation(order, day)` is
  the ONE read: the responsibility ledger row (establishment or formal handover) → that individual
  → nobody. Contact history and the Delivery Duty holder are no longer owner sources; **nobody is
  ever asked for an initial Delivery Duty holder.**
- The sweep (`POST /api/operation/staff/auto-assign`) deals only orders nobody carries and never
  re-spreads. Absence — planned leave, or no heartbeat from 10:00 MYT — is COVER for the day, not a
  reassignment. Only an active individual (a People record with a `staff_code`) may be dealt an
  order or handed one; the manual door answers 422 and `payment_collection_owner_handover` refuses
  `new_owner_not_individual`.
- The assignment and the ledger cannot disagree: one trigger appends `established` on the first
  deal and `handover` on every change, carrying previous owner · reason · changed by. The formal
  handover moves both facts.

## 3 · Open, owned by Jess

- 🔴 **The unresolved-owner sentence is wrong.** Every surface still prints `Nobody holds Delivery
  Duty.` with `Set the holder in Workspace → Staff & Duties` (COPY-STANDARD; `NO_DELIVERY_DUTY_HOLDER`
  / `SET_HOLDER_DOOR` in `packages/shared/src/payment-collection-owner.ts`, rendered by
  `PaymentMonitor.tsx`, `InvoiceCollectionOwner.tsx` and `OperationWork.tsx`). After 0504 an
  unresolved owner means no individual is in the Operation assignment pool, and that door cannot fix
  it. Recommended: `Nobody is assigned to this order.` · `Assign it in Sales Orders → Team`.
  Approved copy is the owner's to change, so it was reported, not shipped. The state is unreachable
  while the pool holds an individual.
- 🟡 **The assignment pool has no permanent home.** It is managed in `TeamPopover` on
  `/operation/old-orders`, a route the shell itself calls temporary and the sidebar does not list.
  Worth a placement decision when the Sales Order register replaces that page.
- 🟡 **The test account is still pooled.** `operation-test@x.com` (`staff_code` null) keeps its
  `ops_staff_settings` row. It can no longer be dealt an order, but it still lists as pooled in the
  TEAM rail. Removing the row is a production data change and was not made.

## 4 · How this lane verifies

- Rolled-back production probe: one `begin; … select …; rollback;` through
  `mcp__supabase__execute_sql` (the batch returns the last `select`). Switch identity with
  `set_config('request.jwt.claims', …, true)`, create temp tables AFTER switching, and collect
  results into a temp table so one final `select` returns the whole walk. **A refusal that fires
  aborts the batch** — prove refusals in the integration suite, not in the probe.
- Real-PostgreSQL suite: `apps/api/src/test/collection-owner-responsibility.integration.test.ts`
  (13 cases) runs against the replay cluster via `CARRES_TEST_DATABASE_URL`. Skipped, never passed,
  without it.
- **Prove a regression test fails without its fix.** The probe's finding here (a duplicate ledger
  row and a stale read) only reproduces when two ledger rows are written in ONE transaction; the
  first test written for it passed either way and proved nothing.

## 5 · Next step

No scope from this lane is outstanding. Pick the next module from the ERP AUTHORITY MAP in
`CLAUDE.md` §3, or close §3's owner decision first.
