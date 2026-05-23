-- =============================================================================
-- 0150_rename_hookka_ohana.sql (Loo 2026-05-24)
-- =============================================================================
-- CORRECTS 0149: the canonical supplier name is **Ohana**, not HoOKkA — the
-- rename direction in 0149 was flipped. Bring all DATA back to 'Ohana', and
-- also fix the app_user display that pre-dated this work ('HoOKkA · Sales' →
-- 'Ohana · Sales' — that login belongs to the Ohana supplier).
--
-- Login email (hookka@gmail.com) is intentionally NOT changed here — it's a
-- credential, not a display name; changing it would alter how the supplier
-- signs in. Flag separately if a real ohana@ email is wanted.
-- slug 'hookka' left as-is (internal id, unreferenced in app/packages code).
-- =============================================================================
update suppliers       set name     = 'Ohana'         where id = '00000000-0000-0000-0000-0000000000e1' and name = 'HoOKkA';
update ops_stock_items set supplier = 'Ohana'         where supplier = 'HoOKkA';
update app_users       set name     = 'Ohana · Sales' where id = '22222222-2222-2222-2222-000000000006' and name = 'HoOKkA · Sales';

do $sanity$
begin
  if exists (select 1 from suppliers where name = 'HoOKkA') then
    raise exception '0150 sanity: a supplier named HoOKkA still exists';
  end if;
end;
$sanity$;
