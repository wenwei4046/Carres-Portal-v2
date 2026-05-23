-- =============================================================================
-- 0149_rename_ohana_hookka.sql (Loo 2026-05-24)
-- =============================================================================
-- Data correction: supplier row id …e1 was mis-seeded as 'Ohana' by the
-- Phase-A master-data xlsx (sheet name). The rest of the system already uses
-- 'HoOKkA' (app_user 'HoOKkA · Sales', components HoOKkASofaTab/HoOKkABedFrameTab,
-- e2e specs). Bring the data into line. Reversible (HoOKkA → Ohana).
-- slug 'ohana' intentionally left unchanged — internal id, no user benefit to
-- churning it (decision in spec §4.6). Frozen migrations 0134/0137 keep the
-- literal 'Ohana' as historical text per CLAUDE.md §13/§14 #6.
-- =============================================================================
update suppliers       set name     = 'HoOKkA' where id = '00000000-0000-0000-0000-0000000000e1' and name = 'Ohana';
update ops_stock_items set supplier = 'HoOKkA' where supplier = 'Ohana';

do $sanity$
begin
  if exists (select 1 from suppliers where name = 'Ohana') then
    raise exception '0149 sanity: a supplier named Ohana still exists';
  end if;
end;
$sanity$;
