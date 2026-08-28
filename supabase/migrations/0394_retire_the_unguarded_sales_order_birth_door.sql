-- 0394_retire_the_unguarded_sales_order_birth_door.sql
--
-- Apply only AFTER the Worker containing `create_order_from_sales_portal` and
-- `create_raw_order` is deployed and its production SHA is verified.
--
-- 0391 deliberately keeps this primitive callable during the database-first
-- compatibility window so the old Worker can still accept an order. Once the
-- new Worker is live, every governed entry has its own wrapper and an
-- authenticated browser must no longer be able to create a marker-less order
-- by calling the primitive directly.

begin;

-- 0391 shipped the exact-ID recovery door before its first production use.
-- Keep that original body as a non-callable implementation, then put a small
-- status gate in front of it: a cancelled or otherwise closed record must
-- never be reported as having proceeded merely because it already has the
-- final-submit marker.
alter function public.recover_legacy_sales_final_submits(uuid[],text)
  rename to _recover_legacy_sales_final_submits_0391_impl;

revoke all on function public._recover_legacy_sales_final_submits_0391_impl(uuid[],text)
  from public, anon, authenticated, service_role;

create function public.recover_legacy_sales_final_submits(
  p_order_ids uuid[],
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_has_invalid_status boolean;
begin
  if public.app_role() is null or public.app_role() <> 'principal' then
    raise exception 'Only Principal may confirm ambiguous legacy Sales submissions'
      using errcode = '42501', detail = 'forbidden';
  end if;

  select exists (
    select 1
      from unnest(p_order_ids) requested(id)
      left join public.orders o on o.id = requested.id
     where o.id is null
        or o.status not in ('place', 'proceed_order')
  ) into v_has_invalid_status;

  if v_has_invalid_status then
    raise exception 'Recovery accepts only existing Place or Proceed Sales Orders'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  return public._recover_legacy_sales_final_submits_0391_impl(
    p_order_ids,
    p_reason
  );
end;
$fn$;

revoke all on function public.recover_legacy_sales_final_submits(uuid[],text)
  from public, anon, authenticated, service_role;
grant execute on function public.recover_legacy_sales_final_submits(uuid[],text)
  to authenticated;

revoke execute on function public.create_order(jsonb)
  from public, anon, authenticated;

comment on function public.create_order(jsonb) is
  'Internal birth primitive. Call create_order_from_sales_portal or create_raw_order; authenticated clients have no direct execute grant (0392).';

comment on function public.recover_legacy_sales_final_submits(uuid[],text) is
  'Principal-only exact-ID legacy recovery. Accepts only Place or Proceed Sales Orders and delegates to the locked 0391 implementation. 0392.';

commit;
