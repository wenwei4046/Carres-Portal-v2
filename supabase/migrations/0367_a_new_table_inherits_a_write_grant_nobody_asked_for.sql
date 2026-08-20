-- =============================================================================
-- 0367_a_new_table_inherits_a_write_grant_nobody_asked_for.sql
-- WAREHOUSE UNIT AUTHORITY — closing a hole 0366 left open.
--
-- FOUND BY SELF-REVIEW OF 0366, measured on production 2026-08-20.
--
-- 0366 §10 says "no ungoverned write remains", and it revoked INSERT/UPDATE/
-- DELETE from `authenticated` on `ops_stock_items` and `stock_balances` by
-- name. It did NOT do the same for the five objects it CREATED, because it
-- assumed a new table starts with no write grant. It does not: Supabase's
-- ALTER DEFAULT PRIVILEGES hands `authenticated` ALL on every new table in
-- `public`, so all five came out of 0366 carrying INSERT, UPDATE, DELETE and
-- TRUNCATE:
--
--   stock_operating_parties · stock_unit_ids · stock_unit_events
--   stock_unit_availability_v · stock_sku_availability
--
-- RLS still refused the three TABLES (each has a SELECT-only policy), so
-- nothing was actually writable through them. But "a policy happens to cover
-- it" is exactly the belt-with-no-braces that 0366 removed from the register,
-- and one of the five is worse than inert:
--
--   `stock_unit_availability_v` is a SIMPLE view over one table, which makes it
--   AUTO-UPDATABLE. An UPDATE through it is a real statement Postgres knows how
--   to rewrite onto `ops_stock_items`. Today it still fails — `security_invoker`
--   means the base table's (now absent) write grant and (now absent) write
--   policy both apply — so this is a latent second door, not a live one. A
--   latent second door onto the inventory authority is not something to leave
--   standing because two other things currently stop it.
--
-- The sanity block in 0366 checked POLICIES and never checked GRANTS, which is
-- why it passed. This migration fixes both: it revokes the grants, and it
-- asserts the grants from here on.
--
-- Asserts NO production row count.
-- =============================================================================

set search_path = public;

-- ─── 1 · The five objects 0366 created keep SELECT and nothing else ──────────
do $$
declare v_obj text;
begin
  foreach v_obj in array array[
    'public.stock_operating_parties',
    'public.stock_unit_ids',
    'public.stock_unit_events',
    'public.stock_unit_availability_v',
    'public.stock_sku_availability'
  ] loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on %s from authenticated, anon',
      v_obj);
    execute format('grant select on %s to authenticated', v_obj);
  end loop;
end $$;

-- The register and the cache were revoked BY NAME in 0366, but only for the
-- three write verbs. TRUNCATE empties a table without firing a row trigger, so
-- the "a Unit is never deleted" guard would never have run.
revoke truncate, references, trigger on public.ops_stock_items from authenticated, anon;
revoke truncate, references, trigger on public.stock_balances   from authenticated, anon;

-- ─── 2 · SANITY — grants, not just policies ─────────────────────────────────
do $$
declare
  v_leak text;
begin
  select string_agg(format('%s:%s', table_name, privilege_type), ', ' order by table_name)
    into v_leak
    from information_schema.role_table_grants
   where grantee in ('authenticated', 'anon')
     and table_schema = 'public'
     and table_name in ('ops_stock_items', 'stock_balances', 'stock_operating_parties',
                        'stock_unit_ids', 'stock_unit_events',
                        'stock_unit_availability_v', 'stock_sku_availability')
     and privilege_type <> 'SELECT';

  if v_leak is not null then
    raise exception '0367 sanity: a write grant still stands on the unit authority — %', v_leak;
  end if;

  -- And SELECT must survive, or every Warehouse read 403s.
  if (select count(distinct table_name)
        from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public'
         and privilege_type = 'SELECT'
         and table_name in ('ops_stock_items', 'stock_balances', 'stock_operating_parties',
                            'stock_unit_ids', 'stock_unit_events',
                            'stock_unit_availability_v', 'stock_sku_availability')) <> 7 then
    raise exception '0367 sanity: a Warehouse read surface lost its SELECT grant';
  end if;

  raise notice '0367 OK: the unit authority is readable and writable only through its doors';
end $$;
