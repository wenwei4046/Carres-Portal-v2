# Migration handoff — `0319_purchase_demands.sql`

> **For an authorised production Supabase operator.** This session has no
> production Supabase access, so the file is reviewed, committed and gated but
> **not applied**. Everything an operator needs to apply it safely is below.
>
> **⚠ DO NOT COPY OR RETYPE THE SQL.** Apply the repository FILE. A retyped or
> hand-edited copy is a different migration from the one that was reviewed, and
> the checksums below exist precisely so that difference is detectable. If the
> checksum does not match, stop and report it — do not "fix" the file.

---

## 1 · Identity

| | |
|---|---|
| **Repository** | `wenwei4046/Carres-Portal-v2` |
| **Branch** | `claude/order-page-purchase-flow-988dc6` |
| **Pull request** | https://github.com/wenwei4046/Carres-Portal-v2/pull/581 |
| **Commit (branch head at handoff)** | `b34ff7f0d4abd793091bd9b66a1ecb5a9aff8b63` |
| **Migration path** | `supabase/migrations/0319_purchase_demands.sql` |
| **Migration number** | **0319** (renumbered from 0318 — main took 0317 and 0318 while this branch was open) |
| **Target project** | Supabase project **`kfprgpjpaffedghytstl`** — the live project (CLAUDE.md §17.1: staging Supabase **is** prod) |

### Checksums — of the COMMITTED file, not a working copy

```
git blob   3263c406f04a2452f7a14208fe540451d49a9154
sha256     97cf698494272d894e5a99e04705081c1970df250bc5e08cbc98d50b55dda0ec
md5        dce33d587d6f670ba6ce095580c7fb10
bytes      16690
```

**Apply the file from the MERGE COMMIT on `main`, not from this branch**, and
re-verify the checksum at that commit first — a squash-merge rewrites the
commit id, and the file content must be identical:

```bash
git rev-parse main:supabase/migrations/0319_purchase_demands.sql
# must print 3263c406f04a2452f7a14208fe540451d49a9154
```

---

## 2 · Order of operations (repository migration governance)

```
1. merge the PR                          ← the code is SAFE without the table
2. verify the checksum on main           ← the two commands above
3. apply 0319 to kfprgpjpaffedghytstl    ← this handoff
4. run the post-apply verification       ← §5
5. ONLY THEN deploy the Worker + web     ← §6
```

**Why merging before applying is safe here, and is normally not.** The read
path fails CLOSED: with `purchase_demands` absent, typed demand is omitted and
logged and the customer-order plan is untouched, so the To Order page keeps
working. Two api tests pin it and the negative control fires exactly 2. What
does NOT work until the table exists is `+ Create Purchase` — it answers a real,
named error rather than saving. **Deploying before applying is therefore not
dangerous, but it does ship a button that refuses.** Prefer the order above.

---

## 3 · Pre-apply checks

Run these against `kfprgpjpaffedghytstl` **before** applying. Every one must
hold, or stop.

```sql
-- a) the table must NOT already exist (this migration has never been applied)
select to_regclass('public.purchase_demands');            -- expect NULL

-- b) every FK target this migration needs must exist
select to_regclass('public.suppliers'),
       to_regclass('public.purchasing_destinations'),
       to_regclass('public.purchase_orders'),
       to_regclass('public.app_users');                   -- expect four non-NULLs

-- c) the two helper functions the RLS policy and the doors rely on
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname in ('is_internal','app_role');
                                                          -- expect both

-- d) the tracker tail — confirm 0319 is genuinely the next free number
--    (use the project's migration tracker, not `ls supabase/migrations`)
```

If (a) returns non-NULL the migration is already applied: **stop**, run §5
instead and report the state. Re-running is harmless (the file is idempotent)
but a surprise means something else happened and must be understood first.

---

## 4 · Applying — execute the FILE

Pick whichever door the operator normally uses. All three execute the
repository file; none involves retyping SQL.

**`psql` (preferred — executes the file, stops on the first error):**

```bash
git -C <repo> checkout main && git -C <repo> pull --ff-only
sha256sum <repo>/supabase/migrations/0319_purchase_demands.sql   # must match §1
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f <repo>/supabase/migrations/0319_purchase_demands.sql
```

**Supabase CLI:**

```bash
supabase db execute --project-ref kfprgpjpaffedghytstl \
  --file supabase/migrations/0319_purchase_demands.sql
```

**Supabase MCP `apply_migration`** — read the file programmatically and pass its
contents; do not paste from a screen.

### What a successful run looks like

The sanity block at the end raises a NOTICE and nothing else:

```
NOTICE:  SANITY OK — empty, no write policy, four purposes in the schema, anon locked out.
```

**If the sanity block RAISES instead, the migration has aborted deliberately.**
It writes no rows of its own (every assertion reads the catalogue), so a
failure is safe to investigate and re-run after the cause is fixed. Report the
message verbatim rather than editing the file.

---

## 5 · Post-apply verification

```sql
-- a) born empty, and nothing is ever backfilled
select count(*) as demands from public.purchase_demands;          -- expect 0

-- b) SELECT-only: the two DEFINER functions are the only write doors
select cmd, policyname from pg_policies
 where schemaname = 'public' and tablename = 'purchase_demands';  -- expect SELECT only

-- c) grants, BOTH directions
select p.proname,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('purchasing_create_demand','purchasing_cancel_demand');
-- expect two rows, anon = false, auth = true on BOTH

-- d) exactly one signature each — a defaulted parameter added later would
--    create a SECOND, and both would be callable
select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('purchasing_create_demand','purchasing_cancel_demand')
 order by 1;
-- expect exactly two rows:
--   purchasing_cancel_demand   uuid, text
--   purchasing_create_demand   text, integer, uuid, date, text, text

-- e) the architecture keeps four purposes even though the door admits one
select pg_get_constraintdef(c.oid) from pg_constraint c
 where c.conrelid = 'public.purchase_demands'::regclass and c.contype = 'c'
   and pg_get_constraintdef(c.oid) like '%ready_stock%';
-- expect a CHECK naming ready_stock, display, office, warranty

-- f) nothing else moved
select count(*) as pos from public.purchase_orders;
-- expect the same number as before the run
```

### Expected tracker row

```
version : 0319
name    : purchase_demands
```

If the project's tracker keys on a timestamp rather than the file prefix,
record `0319_purchase_demands` in whatever field carries the migration name, and
report the row back so this file can be corrected.

---

## 6 · After verification — what happens next

The engineer continues automatically once the operator confirms:

1. deploy the API Worker (`--env production`) and the web bundle to **both**
   Pages projects (`carres-portal` + `carres-pos`, `--branch=main`);
2. verify the real flow: **Create Purchase → To Order → Issue PO**, including
   that the demand disappears from To Order once its `po_id` is stamped;
3. update the canonical checkpoint and report the production facts (main tip,
   Worker version, bundle hash, four canonical URLs, `SERVICE_ROLE` = 0).

---

## 7 · The one external dependency

> **An authorised production Supabase operator must apply the exact merged
> `0319_purchase_demands.sql` repository file, because this session has no
> production Supabase access.**

**Access evidence, measured this session rather than assumed:**

- `mcp__supabase__list_projects` returns **two** projects — `carres-operations`
  (`uoaokqboeajmpsudsbql`) and `carres-ops` (`xchradclyhntcxwsjdvv`), both
  `status: INACTIVE`. Neither is the live project.
- `mcp__supabase__execute_sql` against `kfprgpjpaffedghytstl` returns
  `MCP error -32600: You do not have permission to perform this action`.

The session's Supabase credential is bound to a different account. This is an
access boundary, not a workflow preference.
