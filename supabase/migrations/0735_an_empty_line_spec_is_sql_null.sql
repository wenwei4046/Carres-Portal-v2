-- 0735 · An empty line spec is SQL NULL, never the JSON value null (SO-1375, 30 Oct 2026)
--
-- Adding GRT-MATTRESS-15Y to a new Sales Order returned HTTP 500: the 201's
-- orderSchema parse found "lines.4.attrs" an array. create_order inserts
-- `v_line->'attrs'`, which is JSON null (not SQL NULL) when the client sends
-- `attrs: null`. The guarantee mint (0267) then writes
-- `coalesce(attrs, '{}') || {...}`; coalesce does not catch JSON null, and
-- `'null' || object` is an ARRAY. About twenty functions share that
-- `coalesce(attrs, '{}') ||` idiom, so the fix is at the column: a BEFORE trigger
-- stores JSON null as SQL NULL on order_lines and order_addons, for every writer.
--
-- Repair: JSON null becomes SQL NULL; a line or addon the bug already turned
-- into an array of nulls/objects is folded back into one object (later wins).

create or replace function public.order_attrs_json_null_is_null()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  if NEW.attrs = 'null'::jsonb then
    NEW.attrs := null;
  end if;
  return NEW;
end;
$fn$;
revoke all on function public.order_attrs_json_null_is_null() from public, anon, authenticated;

drop trigger if exists order_attrs_json_null_is_null on public.order_lines;
create trigger order_attrs_json_null_is_null before insert or update of attrs on public.order_lines
  for each row execute function public.order_attrs_json_null_is_null();
drop trigger if exists order_attrs_json_null_is_null on public.order_addons;
create trigger order_attrs_json_null_is_null before insert or update of attrs on public.order_addons
  for each row execute function public.order_attrs_json_null_is_null();

update public.order_lines set attrs = null where attrs = 'null'::jsonb;
update public.order_addons set attrs = null where attrs = 'null'::jsonb;

update public.order_lines l
   set attrs = (select jsonb_object_agg(kv.key, kv.value order by e.n)
                  from jsonb_array_elements(l.attrs) with ordinality e(v, n)
                  cross join lateral jsonb_each(case when jsonb_typeof(e.v) = 'object' then e.v else '{}'::jsonb end) kv)
 where jsonb_typeof(l.attrs) = 'array'
   and not exists (select 1 from jsonb_array_elements(l.attrs) x where jsonb_typeof(x) not in ('null', 'object'));
update public.order_addons a
   set attrs = (select jsonb_object_agg(kv.key, kv.value order by e.n)
                  from jsonb_array_elements(a.attrs) with ordinality e(v, n)
                  cross join lateral jsonb_each(case when jsonb_typeof(e.v) = 'object' then e.v else '{}'::jsonb end) kv)
 where jsonb_typeof(a.attrs) = 'array'
   and not exists (select 1 from jsonb_array_elements(a.attrs) x where jsonb_typeof(x) not in ('null', 'object'));

-- Reported, not refused: anything left that is not an object was not made by this bug.
do $sanity$
declare n int;
begin
  select (select count(*) from public.order_lines where jsonb_typeof(attrs) <> 'object')
       + (select count(*) from public.order_addons where jsonb_typeof(attrs) <> 'object') into n;
  raise notice '0735: % order line/addon attrs left that are not an object', n;
end;
$sanity$;

-- REVERSAL: drop trigger order_attrs_json_null_is_null on public.order_lines;
--           drop trigger order_attrs_json_null_is_null on public.order_addons;
--           drop function public.order_attrs_json_null_is_null();
-- The repaired rows stay repaired (the old values were the bug).
