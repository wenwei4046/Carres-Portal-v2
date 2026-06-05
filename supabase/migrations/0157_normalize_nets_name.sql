-- =============================================================================
-- 0157_normalize_nets_name.sql — short-form consistency for partner names
-- 2026-06-05 (Loo authorised in conversation per CLAUDE.md §7 + §14 #2).
--
-- All other delivery_partners use short codes (AL / HOUZS / TSDD / Teow / TT
-- / EU / SSY) — only NETS carried the formal "Nets Sdn Bhd" name from
-- Phase 9 master data. Loo flagged the inconsistency 2026-06-05 right after
-- 0155 added the new short-form partners: "no need full sdn bhd, you should
-- smart to think this shouldnt happen, why consistent, it all use short form".
--
-- Safe rename: `delivery_partners.name` is just a display label; no FK
-- references it. Code paths that touched the old string by literal match
-- are scrubbed in the same PR:
--   • scripts/production-master-data.sql        (seed)
--   • apps/api/src/routes/pickup-events/print.test.ts  (test fixture)
--   • apps/web/src/pages/operation/OperationOrders.test.tsx  (test fixture)
--   • apps/web/src/lib/queries.ts               (comment only)
--
-- Frozen migration 0136 still references "Nets Sdn Bhd" in a comment +
-- a case-insensitive `ILIKE 'nets%'` lookup. Both stay correct after the
-- rename (the ILIKE matches "NETS" too) — and per CLAUDE.md §14 #6 we
-- never edit committed migrations.
-- =============================================================================

update delivery_partners
   set name = 'NETS'
 where name = 'Nets Sdn Bhd';

-- =============================================================================
-- Sanity
-- =============================================================================
do $sanity$
declare
  n_short int;
  n_old   int;
begin
  select count(*) into n_short from delivery_partners where name = 'NETS';
  select count(*) into n_old   from delivery_partners where name = 'Nets Sdn Bhd';
  if n_short <> 1 then
    raise exception '0157 sanity: expected exactly 1 NETS row, got %', n_short;
  end if;
  if n_old <> 0 then
    raise exception '0157 sanity: % old "Nets Sdn Bhd" rows remain', n_old;
  end if;
  raise notice '0157 OK: "Nets Sdn Bhd" → "NETS" — Inbox dropdown now uniform';
end $sanity$;
