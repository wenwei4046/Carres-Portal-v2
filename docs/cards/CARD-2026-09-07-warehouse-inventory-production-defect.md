# WAREHOUSE — INVENTORY: restore the production read contract

**Status:** production database apply awaits the explicit go recorded in Card 02.
Code and regression coverage are in PR #1149; delivery requires its checks and the
governed apply below. This card does not claim the production defect is closed.

## Scope and authority

The owner confirmed this task owns Inventory and may review the existing Inventory
changes; the other Warehouse tasks retain Inbound/Outbound. Worktree `fc17`, branch
`codex/warehouse-inventory-production-defect`, based on fetched main
`228248887d905ee79fdb00a7a63e8718e4003d2c`.

Read CLAUDE (including the ERP protocol), ENGINEERING, ERP-ARCHITECTURE,
COPY-STANDARD, ui/MASTER, stock/MASTER and workspace/MASTER. The requested
`docs/UI-DICTIONARY.md` does not exist; COPY-STANDARD is the governed dictionary.
Roster ruling `2fccd514` remains authoritative: active staff come from shared
Staff & Duties, departed staff history remains. No staff or NETS assignment is
hard-coded by this change.

Reviewed the uncommitted Inventory component and tests in worktree `76f2`.
They introduce a date strip, new saved views, fixed holder buckets and Counts &
Adjustments. Those are beyond this production-defect scope and some conflict
with the current Register ruling. They remain untouched in their original
worktree. Draft PR #1005 is a superseded broad candidate, not an apply source.

## Production evidence, 7 September 2026

Authenticated Inventory at `https://erp.carresofficial.com/operation?tab=stock-onhand`
shows `Stock could not be loaded` and
`column stock_unit_register_v.site_name does not exist`. The rail simultaneously
shows zero counts, `Nothing needs checking`, and `No Unit has moved yet`.

Both `/__carres_deploy.json` on ERP and `/health` on the API report
`7b47adbf5f3eb6b4f8d8aa1cc4aa17de9461db30` (web built at
`2026-09-07T06:03:48.043Z`). Its stock route is identical to this branch's route.
That deployment descends from `24d75b7f` / PR #1066, which already committed the
correct Inventory migration. The two route projections both explicitly select
`site_name` and `holder_name`; neither has a fallback read.

Read-only SQL in project `kfprgpjpaffedghytstl` inspected `pg_get_viewdef` and
`information_schema.columns`: the live register is still 0373's 23-column view,
ending with `last_event_at`, `last_event`. It has neither name column and joins
only the availability view and the lateral physical-event lookup ordered by seq.
This is actual schema drift, not a client spelling error or merely a stale schema
cache. The live view has `security_invoker=true`; authenticated has SELECT only
and anon has no grant. The existing migration preserves that boundary.

Migration tracker identity must use the complete name, not the numeric prefix:

| Tracker version | Name | Result |
|---|---|---|
| 20260820133713 | 0366_the_unit_register_is_the_one_inventory_authority | present |
| 20260821040940 | 0373_the_register_can_say_when_a_unit_last_moved | present |
| 20260903015648 | 0417_the_partner_says_it_cannot_deliver | present; unrelated Delivery migration |
| — | 0417_the_register_names_the_site_and_the_holder | absent |

This matches the explicitly recorded 0417 collision/apply debt in
`scripts/check-migrations.mjs`. The committed Inventory file must not be renamed,
edited, replaced by #1005's colliding 0410, or confused with Delivery's 0417.

The live availability authority has **221 rows**. A read-only candidate join to
warehouses and operating parties returns **221 rows**, with **221 site names** and
**1 holder name**. These are dated observations, never hard-coded assertions or
new stored totals.

## Change

Apply debt: the existing, immutable
`supabase/migrations/0417_the_register_names_the_site_and_the_holder.sql` adds
owner-derived names, preserves the Unit authority and last physical event, and
keeps the view caller-secured and SELECT-only. No new migration is required.
Exact committed file SHA-256: `656fa52c9d0683471faa44062fdf8409a700e0d77a83b17503671a12cc268379`.

UI: only render rail counts and empty assertions when the query has data and has
not failed. The rail's footprint, destination header, navigation, table and retry
remain in place. A refresh failure also withdraws cached success claims. A real
successful empty response still shows zero. An initial offline/paused request also
remains loading until data exists; it cannot print the empty Register sentence.

Regression: execute the actual list and detail route projections in PostgreSQL
(PGlite, test-only), using committed authority functions/views and the complete
0373 and Inventory 0417 migrations. The old view is a negative control and must
fail both routes with the missing column. The fixed view must preserve rows,
owner-derived names, null names, damaged availability, ended history, physical
event sequence and read-only grants. Mapping mocks no longer claim to describe
the measured live schema. UI tests cover loading, failure, retry, refresh failure
with cached data, and genuine zero stock.

## Governed production step

After explicit approval, rehearse the exact committed migration inside a rolled-
back transaction with `scripts/verify-inventory-read-surface.sql`, then apply the
exact file transactionally and reconcile the tracker by its full name and exact
source. Do not use a broad migration push because historical number collisions
are known. Repeat the read-only assertion, deploy the reviewed code through the
normal PR/CI path, and prove authenticated Inventory list, Unit detail, real counts
and retry. Record the resulting database/deploy evidence before marking this card
or stock/MASTER production-complete.

## Verification log

- Initial UI regressions: three failed before the fix. The initial-offline test
  separately failed on the empty-Register sentence before its correction.
- SQL-backed route regression: all 9 tests passed, including the reusable
  production assertion script, in the full API run. A duplicate local run timed
  out during concurrent load; the subsequent full run passed without a timeout change.
- Full shared suite: 133 files / 2,960 tests passed. Full API suite: 139 files /
  2,796 tests passed (local, two workers per package).
- Migration gate passed: 451 filenames, zero migration changes. Design/governance
  lint passed. CI completed type checks on the first revision; the final revision
  must pass the complete gate before merge.
- Final web tests, full-suite, type checks, production build and bundle-secret
  verification are recorded on [PR #1149](https://github.com/wenwei4046/Carres-Portal-v2/pull/1149).
  CI is required; production SQL and deployment proof remain separate gates.
