-- 0470_the_reservation_door_is_one_door_again.sql
--
-- ⭐ PAYING BACK 0469's ONE-DEPLOY DEBT.
--
-- 0469 §4c left a 7-argument `ops_stock_pool_draw` beside the real 8-argument
-- door so that neither the pre-0469 Worker nor the post-0469 one was ever
-- calling a function that did not exist. That window closes the moment the
-- deploy is verified, and a second door that outlives its reason is exactly
-- the "two forms for one act" the ERP Architecture forbids (Law C).
--
-- ⛔ APPLY ONLY AFTER PRODUCTION REPORTS THE 0469 SHA. Applied earlier, every
-- reserve door on the still-live bundle answers `function does not exist`.
--
-- Nothing else moves: no column, no policy, no data, no Unit ID.

begin;

drop function if exists public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid);

do $sanity$
declare
  v_overloads int;
  v_args      text;
begin
  select count(*) into v_overloads
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_pool_draw';
  if v_overloads <> 1 then
    raise exception '0470 sanity: the draw door must be ONE function, found %', v_overloads;
  end if;

  select pg_get_function_identity_arguments(p.oid) into v_args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ops_stock_pool_draw';
  if position('p_order_line_id' in v_args) = 0 then
    raise exception '0470 sanity: the surviving door does not name the item line (%)', v_args;
  end if;

  -- The delegator was the ONLY thing removed; the real door keeps its grant.
  if not has_function_privilege('authenticated',
       'public.ops_stock_pool_draw(text, text, text, uuid, text, text, uuid, uuid)', 'EXECUTE') then
    raise exception '0470 sanity: the draw door lost its grant';
  end if;
end;
$sanity$;

commit;
