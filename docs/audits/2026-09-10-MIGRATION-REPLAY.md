# Migration replay — which files cannot run from scratch, and why

Measured 2026-09-10 on `origin/main` @ `41bcb364` (tail `0468`, 477 files), PostgreSQL 18.3,
with `node scripts/dry-run-migrations.mjs`. **Nothing here touched production.** Production
facts below come from the migration headers and docs, cited.

## The numbers

| run | applied | failed |
|---|---|---|
| blank database, no fixtures | 387 | 90 (18 of their own, 72 knock-on) |
| with `scripts/dry-run-fixtures.sql` (8 small chunks of fake production rows) | **470** | **7**, all of their own |
| the same, with PR #1205's `0463`/`0466` | 472 | 5 |

**The harness catches the 2026-09-10 incident.** `0463` and `0466` fail on `main` and pass
with #1205's text. The known-failing list is
[`scripts/migration-replay-baseline.json`](../../scripts/migration-replay-baseline.json). When
#1205 merges, `--baseline` reports those two as "now pass, remove them".

## The 7 files that still fail

| file | kind | why | did production apply it? |
|---|---|---|---|
| `0317_the_record_stops_claiming_a_send` | **bug: cannot parse** | A comment inside its closing `do $$ … $$` block contains `` `do $$` `` (line 189). That `$$` ends the block early, and the rest is a syntax error. | Yes, but a **different text**. The file's own header says the applied payload's guard differed. The committed file has never run anywhere. |
| `0339_one_purchase_order_creation_authority` | **drift (red line 7)** | Revokes `operation_create_po(uuid, uuid, jsonb, integer, integer[], uuid, text, text)`. **No committed file creates that 8-argument function.** The chain only builds the 5-argument `logistics_create_po` (0019 to 0079, renamed by 0121). `0154` calls production's 7-argument `_operation_create_po_inner` "REAL" and copies it back. | Yes. The function exists in production, but its source is in no file. |
| `0398a_the_five_purposes_a_purchase_may_serve` | **collision order** | Two lanes both wrote `0398`. Production applied *this* text (under the name `0398_…`). Main's `0398_a_purchase_names_the_approved_purpose` "MUST NEVER BE APPLIED" (0399 header), yet it sorts first, so a replay or `supabase db reset` applies it, and then 0398a's CHECK rejects its rows. | Yes, this one. Main's `0398_` never was. |
| `0453_a_quantity_row_is_keyed_not_identified` | **bug: depends on query plan** | Its sanity check runs `pg_get_functiondef(p.oid)` over `pg_proc` with only `nspname = 'public'` to exclude system rows (line 1254). Postgres may evaluate the function first. On PG 18 it hit `pg_catalog.array_agg` (an aggregate) and raised an error. | Yes, because production's plan filtered first. Re-running the same check elsewhere can fail. |
| `0463_customer_money_reaches_the_ledger` | **bug** | Compares `pg_get_function_identity_arguments()`, which includes argument names, with a types-only string. | Failed in production 2026-09-10. Fixed by #1205. |
| `0466_an_invoice_is_where_revenue_is_recognised` | **bug** | Same mistake. | Fixed by #1205 before it was applied. |
| `0149_rename_ohana_hookka` | **production data** | Renames supplier `…e1` from Ohana to HoOKkA, then asserts no "Ohana" row exists. `0134` inserts a separate Ohana row, and `0134` was applied to production in 12 hand-split chunks (`docs/archive/phase-10-worklog.md:1294`). Production's exact state then is unknowable from the repo. | Yes. |
| `0561_the_voucher_line_guard_survives_a_rebuild` (added 2026-09-25) | **bug: cannot parse** | No `;` after the function's closing `$function$` (around line 265), so the `do $sanity$` check after it is read as part of the same statement: syntax error at or near "do". | Yes. Its function is live. Red line 6 keeps the file as it is. |

## Files that pass only because of a fixture

These asserted on rows only production had. **Every one breaks red line 8** ("a migration may
never assert a production row count"). Most predate that rule.

| file | the production row it needs | fixture |
|---|---|---|
| `0134_seed_sku_master` | `0032` adds UNIQUE(slug) only when `suppliers` has rows | HoOKkA + Nice Future, before `0032` |
| `0136`, `0157` | a "Nets" delivery partner (from `scripts/production-master-data.sql`, not a migration) | before `0136` |
| `0137`, `0307` | a warehouse named "Carres Klang" | before `0136` |
| `0276_hr_kpi_targets` | a showroom whose salesperson has a staff code | before `0276` |
| `0285`, `0293`, `0298` | the real service case `SC2607-01` | before `0285` |
| `0286_stock_reorder_points` | an active person in the COO seat (Jess) | before `0286` |
| `0366_the_unit_register…` | **latent bug**: `(a.available + a.reserved) > 0` is NULL when every unit of a SKU at a site is reserved, so 0366's own cache rebuild zeroes that row and its own check fails. `0369` fixed the NULL later. Production had no such SKU that day. | frees one unit per all-reserved SKU, before `0366` |
| `0437_offboard_khor_yee…` | three named staff accounts (a one-off staffing change inside the schema chain) | before `0437` |
| `0458_a_warehouse_is_operated…` | an active person with a CRnnn staff code | before `0458` |

Without the fixtures, those roots take **72 more files** down with them (`0137` alone blocks 31).

## Recommended follow-ups (not done here)

1. **`0339` drift is a P0 under red line 7.** Someone with production access reads
   `pg_get_functiondef` for `operation_create_po` and `_operation_create_po_inner` (read-only)
   and commits them as a new migration.
2. **`0317` and `0453`**: no action needed for production. Both are already applied. But note
   that the committed `0317` differs from what production ran.
3. **`0398_` must never apply**, yet any fresh environment will apply it. That's worth an entry
   in `docs/carry-forwards.md` so nobody runs `supabase db reset` expecting production's schema.
4. **New migrations should not assert on production rows** (red line 8). The replay makes that
   visible: such a file fails in CI unless it adds a fixture, which is a good forcing function.

## Can CI run this?

Yes. **Nothing is wired yet. That is your call.**

- **Speed**: about 2 minutes for all 477 files on this laptop, mostly Windows process start-up.
  It should be faster on `ubuntu-latest`.
- **No service container needed**: the script starts its own throwaway cluster (`initdb` +
  `pg_ctl`) on a free port. `ubuntu-latest` ships Postgres binaries, and `PG_BIN` picks the
  version. A `services: postgres` container also works, with `--connect`.
- **Match production's Postgres version.** `0453` shows that plan and catalog differences are
  real. Production's major version was not measured here.

| mode | command | what it catches |
|---|---|---|
| A. whole chain vs known-failing list | `--baseline scripts/migration-replay-baseline.json` | any file that newly fails, and any listed file that now passes |
| B. judge only the PR's new files | `--changed-since origin/main` | a new file that fails for its own reason. A failure caused by an older broken file is printed as "cannot judge" and does not fail the job. |
| C. new files on a schema dump | `--snapshot schema.sql --changed-since origin/main` | the same as B, against production's real schema. Needs a committed, refreshed schema-only dump (`supabase db dump --schema-only`). |

**Recommendation: B, as its own CI step, non-blocking (`continue-on-error: true`) for about a
week, then blocking.** With the fixtures the chain replays deep enough that B can judge new
stock, purchasing and ledger files, which it could not before. C adds a production-access
dependency that is only worth it if B proves too shallow.

## How it works (short)

- `scripts/dry-run-supabase-stub.sql` is the small part of Supabase the migrations expect:
  roles, `auth.users`, `auth.uid()/jwt()/role()`, `storage.*`, extensions.
- Each file runs in one transaction with `ON_ERROR_STOP`. If a file fails only because it
  added an enum value and used it in the same transaction (or uses `CONCURRENTLY`), it is
  retried outside a transaction and reported as a note (`0028` today).
- A later failure is labelled **knock-on** when its error names an object that an earlier
  failed file would have created. That is a guess from the error text. A sanity-message failure
  (like `0440` behind `0424`) cannot be linked and shows as a root until its cause is fixed.
- `--connect` refuses any host that is not localhost. The script cannot reach production.
