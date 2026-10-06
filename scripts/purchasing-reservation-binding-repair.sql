-- PURCHASING CARD 11 — forward correction for both 0500 paths.
-- Number reconciled 2026-09-16: live tracker 0509; repository/all branches MAX 0521.
-- Live release/reassign already clear the binding: this file is a no-op there.
-- 0500 has two accepted bodies per function. Its live-source variants retained
-- a stale line binding. Change only that assignment; preserve roles, config,
-- grants, ownership and append-only History. Unknown bodies fail atomically.
begin;
do $repair$
declare
  sig text;
  proc regprocedure;
  body text;
  definition text;
  before_hash text;
begin
  foreach sig in array array['public.ops_stock_release(uuid)', 'public.ops_stock_reassign(uuid,text)'] loop
    proc := to_regprocedure(sig);
    if proc is null then raise exception 'Missing reservation function: %', sig; end if;
    select prosrc, pg_get_functiondef(oid), md5(replace(prosrc, E'\r', ''))
      into body, definition, before_hash from pg_proc where oid = proc;
    -- Canonical replay and the already-correct branch need no rewrite.
    if body ~* 'reserved_order_line_id\s*=\s*null' then continue; end if;
    if before_hash not in ('41dc5d15cad52605f30ea9731c9f611b', '613865564afff56c9024f8bed4bef818') then
      raise exception 'Unrecognised reservation function body: % (%)', sig, before_hash;
    end if;
    definition := regexp_replace(definition, '(reserved_ref\s*=\s*(NULL|p_new_ref),)',
      E'\\1\n         reserved_order_line_id = NULL,', 'i');
    execute definition;
    select prosrc into body from pg_proc where oid = proc;
    if body !~* 'reserved_order_line_id\s*=\s*null' or body !~* 'v_role is null' then
      raise exception 'Reservation binding/role invariant missing: %', sig;
    end if;
  end loop;
end
$repair$;
commit;
