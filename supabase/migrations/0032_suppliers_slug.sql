-- =============================================================================
-- 0032_suppliers_slug.sql -- Phase 4 v3-S4
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §4.3
--              (SUPPLIER_SOP keyed by slug for cross-env stability)
-- Sprint:      v3-S4 (threads + RPCs v3 -- prerequisite for 0033 threads table
--              and 0034 logistics_rpcs_v3)
-- Carry-forward closed: phase-4-v3-sop-slug-resolution
--
-- Why this migration (numbering deviation from spec §17.2):
--   Spec §17.2 originally pinned 0032=rpcs_v3 / 0033=threads. We INSERT this
--   suppliers.slug migration BEFORE the threads table because the v3-S3 SOP
--   module (packages/shared/src/sops.ts:61-69) keys SUPPLIER_SOP by slug
--   strings ('hookka', 'nice-future') that do not yet exist in the schema or
--   seed. Without this column, sops.ts cannot resolve a supplier row to the
--   correct SOP. The threads RPC (0034) needs to read suppliers.slug to derive
--   the sop_name when inserting a thread row, so suppliers.slug must land
--   first.
--
--   Final numbering swap:
--     0032 = suppliers.slug                  (THIS file)
--     0033 = order_supplier_threads          (next, was 0033 already)
--     0034 = logistics_rpcs_v3               (was 0032 in spec)
--     0035 = orders_rollup_stage             (v3-S5)
--
-- Mapping (locked by Loo, mirrors sops.ts SUPPLIER_SOP keys):
--   HoOKkA      -> 'hookka'
--   Nice Future -> 'nice-future'
--   (Future suppliers: extend the DO block + insert supplier in seed first.)
--
-- Idempotency notes (mirrors 0026 pattern):
--   - Fresh local dev (suppliers table empty): backfill is a no-op, column
--     stays nullable; seed.sql then populates suppliers; tighten constraint
--     later. Keeps fresh-dev migrations green.
--   - Staging/production (suppliers populated): backfill runs, RAISES on
--     missing supplier names, SET NOT NULL + UNIQUE apply cleanly.
--   - Re-running the migration: ADD COLUMN guarded by IF NOT EXISTS, backfill
--     overwrites with same values, SET NOT NULL is a no-op once already set,
--     ADD CONSTRAINT guarded by pg_constraint lookup.
-- =============================================================================

-- 1. Add the column (additive, nullable initially -- backfill follows).
alter table suppliers
  add column if not exists slug text;

-- 2. Backfill known supplier names -> stable slugs.
--    Fresh dev guard: skip cleanly if suppliers empty (seed will populate later).
do $$
declare
  v_supplier_count int;
begin
  select count(*) into v_supplier_count from suppliers;
  if v_supplier_count = 0 then
    raise notice 'Suppliers table empty -- slug backfill skipped (fresh dev path; seed.sql will populate suppliers and a follow-up tightening migration handles the constraint).';
    return;
  end if;

  -- Verify the two seeded suppliers exist before mutating (matches 0026's contract).
  if not exists (select 1 from suppliers where name = 'Nice Future') then
    raise exception 'Nice Future supplier missing -- seed must include name=''Nice Future'' before this migration runs on populated data';
  end if;
  if not exists (select 1 from suppliers where name = 'HoOKkA') then
    raise exception 'HoOKkA supplier missing -- seed must include name=''HoOKkA'' before this migration runs on populated data';
  end if;

  update suppliers set slug = 'hookka'      where name = 'HoOKkA'      and slug is distinct from 'hookka';
  update suppliers set slug = 'nice-future' where name = 'Nice Future' and slug is distinct from 'nice-future';

  -- Fail fast if any supplier still has NULL slug (means a row exists with a
  -- name we have not mapped above -- new supplier requires extending this block).
  if exists (select 1 from suppliers where slug is null) then
    raise exception 'Slug backfill incomplete -- % rows still NULL (extend the backfill DO block with the new supplier name -> slug mapping)',
      (select count(*) from suppliers where slug is null);
  end if;
end $$;

-- 3. SET NOT NULL + UNIQUE only if backfill completed (suppliers populated AND
--    no nulls remaining). Fresh dev path: column stays nullable + non-unique;
--    seed.sql populates suppliers and a follow-up tightening migration applies
--    the constraint then. Staging/production: backfill ran above, no nulls,
--    constraints apply cleanly here.
do $$ begin
  if not exists (select 1 from suppliers where slug is null)
     and exists (select 1 from suppliers) then
    alter table suppliers alter column slug set not null;

    -- Add UNIQUE constraint only if not already present (named for idempotency).
    if not exists (select 1 from pg_constraint where conname = 'suppliers_slug_unique') then
      alter table suppliers add constraint suppliers_slug_unique unique (slug);
    end if;
  else
    raise notice 'suppliers.slug stays nullable + non-unique (empty table or unbackfilled rows). Tighten in a follow-up after seed completes.';
  end if;
end $$;

-- 4. Index for slug -> supplier lookups (sops.ts resolution; logistics RPCs
--    that need to derive sop_name from supplier_id will reverse-lookup via
--    this column).
create index if not exists suppliers_slug_idx on suppliers(slug);
