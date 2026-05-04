-- =============================================================================
-- 0026_product_skus_supplier_id.sql — Phase 4 v3-S3
-- =============================================================================
-- Source spec: docs/superpowers/specs/2026-05-04-phase-4-v3-spec.md §3.1
-- Sprint:      v3-S3 (schema migrations 0026-0031, data layer only)
-- Bug fixes:   Codex review 2026-05-04 — backfill via product_models.category
--              (NOT suppliers.cat_covered, which is ambiguous text[] array)
--
-- Why this migration:
--   Loo locked "every SKU must have an explicit supplier" — eliminates the
--   cat_covered ambiguity bug where a SKU could match multiple suppliers via
--   the text[] array. product_models.category is the canonical product_category
--   enum and gives a 1:1 lookup per SKU via model_id.
--
-- Mapping (hardcoded per Q4=B TS-hardcoded SOPs):
--   mattress -> Nice Future
--   bedframe -> HoOKkA
--   sofa     -> HoOKkA
--   (Future categories: extend the DO block below + insert supplier in seed first.)
--
-- Supplier name match: must equal the seeded value EXACTLY (supabase/seed.sql:50-51).
--   'Nice Future' (mattress)  · 'HoOKkA' (bedframe + sofa)
--
-- Idempotency notes:
--   - Fresh local dev (suppliers table empty): backfill is a no-op, column
--     stays nullable; seed.sql then populates both suppliers + supplier_id.
--   - Staging/production (suppliers populated): backfill runs, RAISES on any
--     leftover NULL, SET NOT NULL applies cleanly.
--   - Re-running the migration: ADD COLUMN guarded by IF NOT EXISTS, backfill
--     overwrites with same values, SET NOT NULL is no-op once already set.
--
-- Carry-forward: phase-4-v3-skus-supplier-id-not-null-tighten — fresh dev path
--   leaves column nullable; tighten via follow-up migration once seed has run.
-- =============================================================================

-- 1. Add the column (additive, FK to suppliers).
alter table product_skus
  add column if not exists supplier_id uuid references suppliers(id);

-- 2. Backfill from product_models.category (canonical 1:1 lookup).
--    Fresh dev guard: skip cleanly if suppliers empty (seed will populate later).
do $$
declare
  v_nice_future uuid;
  v_hookka      uuid;
  v_supplier_count int;
begin
  select count(*) into v_supplier_count from suppliers;
  if v_supplier_count = 0 then
    raise notice 'Suppliers table empty -- backfill skipped (fresh dev path; seed.sql will populate both suppliers and product_skus.supplier_id).';
    return;
  end if;

  select id into v_nice_future from suppliers where name = 'Nice Future' limit 1;
  select id into v_hookka      from suppliers where name = 'HoOKkA'      limit 1;

  if v_nice_future is null then
    raise exception 'Nice Future supplier missing -- seed must include name=''Nice Future''';
  end if;
  if v_hookka is null then
    raise exception 'HoOKkA supplier missing -- seed must include name=''HoOKkA''';
  end if;

  update product_skus ps
     set supplier_id = case pm.category
       when 'mattress' then v_nice_future
       when 'bedframe' then v_hookka
       when 'sofa'     then v_hookka
     end
    from product_models pm
   where ps.model_id = pm.id;

  -- Fail fast if any SKU still NULL (e.g. unknown category).
  if exists (select 1 from product_skus where supplier_id is null) then
    raise exception 'Backfill incomplete -- % rows still NULL (unknown category?)',
      (select count(*) from product_skus where supplier_id is null);
  end if;
end $$;

-- 3. SET NOT NULL only if backfill completed (suppliers populated AND no nulls).
--    Fresh dev path: column stays nullable; seed.sql populates supplier_id when
--    SKUs are inserted, so a follow-up tightening migration handles the
--    constraint then. Staging/production: backfill ran above, no nulls, NOT
--    NULL applies cleanly here.
do $$ begin
  if not exists (select 1 from product_skus where supplier_id is null)
     and exists (select 1 from product_skus) then
    alter table product_skus alter column supplier_id set not null;
  else
    raise notice 'product_skus.supplier_id stays nullable (empty table or unbackfilled rows). Tighten in a follow-up after seed completes.';
  end if;
end $$;

-- 4. Index for routing lookups (logistics RPCs filter SKUs by supplier).
create index if not exists product_skus_supplier_id_idx on product_skus(supplier_id);

-- Note on backwards compat: suppliers.cat_covered (text[]) stays for now —
-- still read by old auto-route logic in 0019_logistics_rpcs.sql. Drop in a
-- follow-up cleanup migration once all callers switch to product_skus.supplier_id.
