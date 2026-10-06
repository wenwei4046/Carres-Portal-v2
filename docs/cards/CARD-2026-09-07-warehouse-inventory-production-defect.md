# WAREHOUSE — INVENTORY: build the Register and restore its production source

**Status:** owner confirmed BUILD and production repair. Existing migration applied
and production Inventory loads real stock. The expanded page is in PR #1149;
its final CI and production deployment evidence are recorded on that PR.

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
They introduce a date strip, saved views, fixed holder buckets and Counts &
Adjustments. This implementation follows the current 240px Register ruling and
reads governed holder rows. It does not adopt the date strip, fixed partners or
a fabricated empty Counts register. The original worktree remains untouched. Draft PR #1005 is a superseded broad candidate, not an apply source.

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

UI: a shared 240px Filter Rail and Inventory Register, without a Calendar or date
strip. Saved views cover all stock, Sales Order reservations, eligible exact-Unit
Ready Stock, Showroom Display, Service Case, Needs checking and history. Holder,
Site, ownership, stock use and Catalog category are independent facts. Filters
combine and persist in the URL; hiding the rail preserves selection; clearing
filters stays in Inventory. Product names, PO/SO dates and expected arrival read
the existing Catalog/Purchasing/Sales authorities. PO and SO links open their
owning records. Missing facts remain explicit, and metadata errors fail the read
instead of becoming invented absence. No stock writer or allocation rule is added.

Only render rail counts and empty assertions when the query has data and has
not failed. A refresh failure also withdraws cached success claims. A real
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

## Production apply, 2026-09-07 11:21 UTC

The owner explicitly approved continuing the complete page and production fix.
Rehearsed the exact committed file plus `scripts/verify-inventory-read-surface.sql`
inside BEGIN/ROLLBACK; all assertions passed. The durable transaction first
asserted the new column and tracker row were still absent, proving the rehearsal
rolled back. It then applied the unchanged file, repeated the assertions and
inserted the full-name tracker record with the exact file in `statements[1]`.

Post-commit read-only assertions passed: 221 authority rows = 221 Register rows,
221 Site names, 1 holder name, no identity/name/availability/quantity mismatches,
negative control detects all rows, caller security and SELECT-only grants intact.
Tracker version `20260907112136`, full name
`0417_the_register_names_the_site_and_the_holder`; database SHA-256 of its stored
source is `656fa52c9d0683471faa44062fdf8409a700e0d77a83b17503671a12cc268379`,
matching the immutable repository file. No Unit row was changed.

Authenticated production Inventory now loads: 181 current records and 40 history
records, with real Site names. The expanded page follows the normal PR/CI merge and deployment path.
PR #1149 records the final SHA and authenticated UI verification after delivery.

Counts/Differences/Adjustments remain the separately documented unbuilt business
transaction in Stock MASTER §14.1 G6. This page does not claim that transaction
exists by drawing a dummy empty table. Likewise no invented Work or staff owner
is attached to a Unit.

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
  Page head `eff04445` passed every CI gate in run `34117320505`. The final
  footer regression additionally proves table-column filters change the Unit and
  quantity summary. Final-head CI and deployment evidence are recorded on PR #1149.
