-- =============================================================================
-- 0158_normalize_teow_name.sql — TEOW (not Teow) to match the all-caps
-- short-code convention used by every other partner.
-- 2026-06-05 (Loo authorised in conversation per CLAUDE.md §7 + §14 #2).
--
-- 0155 added the row as "Teow" (literal title-case from Loo's chat message).
-- Should have been normalised to "TEOW" right then — all sibling partners
-- are short ALL-CAPS codes (AL / HOUZS / TSDD / TT / EU / SSY, and NETS
-- after 0157). Loo flagged it immediately after merging 0157:
--   "TEOW not teow, all should just consistent"
-- Same proactive-consistency lesson as 0157 — caught second time around.
--
-- Safe rename: no FK joins on the `name` column (live joins use uuid id);
-- only 0155 references the literal string "Teow" and that's a frozen
-- migration file we don't touch (CLAUDE.md §14 #6).
-- =============================================================================

update delivery_partners
   set name = 'TEOW'
 where name = 'Teow';

-- =============================================================================
-- Sanity
-- =============================================================================
do $sanity$
declare
  n_short int;
  n_old   int;
begin
  select count(*) into n_short from delivery_partners where name = 'TEOW';
  select count(*) into n_old   from delivery_partners where name = 'Teow';
  if n_short <> 1 then
    raise exception '0158 sanity: expected exactly 1 TEOW row, got %', n_short;
  end if;
  if n_old <> 0 then
    raise exception '0158 sanity: % old "Teow" rows remain', n_old;
  end if;
  raise notice '0158 OK: "Teow" → "TEOW" — all 8 partners now uniform all-caps short codes';
end $sanity$;
