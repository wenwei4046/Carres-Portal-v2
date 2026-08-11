-- Card 3 · Old Orders is no longer a Purchase Order creation door.
--
-- Keep the historical function definition so legacy data and migration history
-- remain readable, but remove PostgREST execution from every browser role.
-- Batch Purchase retains the governed purchasing_issue_pos_batch boundary.

set search_path = public, pg_temp;

revoke execute on function public.operation_issue_pos_for_order(uuid)
  from public, anon, authenticated;

do $sanity$
begin
  if to_regprocedure('public.operation_issue_pos_for_order(uuid)') is null then
    raise exception '0338 sanity: historical order Issue PO function missing';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.operation_issue_pos_for_order(uuid)',
    'execute'
  ) then
    raise exception '0338 sanity: Old Orders Issue PO remains executable';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.purchasing_issue_pos_batch(jsonb)',
    'execute'
  ) then
    raise exception '0338 sanity: governed Batch Purchase Issue is unavailable';
  end if;
end;
$sanity$;
