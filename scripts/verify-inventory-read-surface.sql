-- WAREHOUSE — INVENTORY: read-only post-apply assertion for the existing
-- 0417_the_register_names_the_site_and_the_holder.sql (not the other 0417).
-- Never applies a migration or changes a Unit. Run against the production
-- project after the separately approved, exact committed migration is applied.
begin read only;
do $$
declare
  authority_rows bigint;
  register_rows bigint;
  mismatches bigint;
  control_hits bigint;
begin
  -- Compile the deployed route's complete projection, even on an empty database.
  perform id, unit_code, sku, category, warehouse_id, site_name, holder_party_id,
    holder_name, ownership, supplier, po_no, status, condition, needs_repair,
    hold_reason, reserved_ref, sold_order_id, qty, date_in, last_verified_at,
    availability, lifecycle_outcome, last_event_at, last_event
  from public.stock_unit_register_v limit 0;

  select count(*) into authority_rows from public.stock_unit_availability_v;
  select count(*) into register_rows from public.stock_unit_register_v;
  if authority_rows <> register_rows then
    raise exception 'Inventory read surface changed row count';
  end if;

  select count(*) into mismatches
  from public.stock_unit_register_v r
  full join public.stock_unit_availability_v v on v.id = r.id
  left join public.warehouses w on w.id = v.warehouse_id
  left join public.stock_operating_parties p on p.id = v.holder_party_id
  where r.id is null or v.id is null
    or r.site_name is distinct from w.name
    or r.holder_name is distinct from p.name
    or r.availability is distinct from v.availability
    or r.lifecycle_outcome is distinct from v.lifecycle_outcome
    or r.qty is distinct from v.qty;
  if mismatches <> 0 then
    raise exception 'Inventory read surface disagrees with its owners';
  end if;

  -- Deliberately wrong names must be detected, including absent names.
  select count(*) into control_hits
  from public.stock_unit_register_v r
  left join public.warehouses w on w.id = r.warehouse_id
  where r.site_name is distinct from coalesce(w.name, '') || ' CONTROL';
  if control_hits <> register_rows then
    raise exception 'Inventory name negative control failed';
  end if;

  if not exists (select 1 from pg_class
    where oid = 'public.stock_unit_register_v'::regclass
      and reloptions @> array['security_invoker=true']) then
    raise exception 'Inventory view lost caller security';
  end if;
  if exists (select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'stock_unit_register_v'
      and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type <> 'SELECT'))) then
    raise exception 'Inventory view exposes an unexpected grant';
  end if;
  if not has_table_privilege('authenticated', 'public.stock_unit_register_v', 'SELECT') then
    raise exception 'Inventory view cannot be read by authenticated users';
  end if;
  raise notice 'Inventory verified: % authority rows, % register rows, % negative control hits',
    authority_rows, register_rows, control_hits;
end $$;
rollback;
