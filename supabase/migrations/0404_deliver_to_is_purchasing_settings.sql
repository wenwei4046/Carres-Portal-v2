-- 0404 · Deliver To is Purchasing Settings master data
--
-- Owner ruling, 2026-08-29:
--   · AL remains the existing canonical `AL Sungai Buloh` destination.
--   · `Ohana` is now a permitted Deliver To.
--   · future destinations are added in Settings, never in an SO Batch-only list.
--
-- This migration adds no write policy. `purchasing_destinations` stays read-only
-- through PostgREST; the two SECURITY DEFINER functions below reuse the one
-- manager gate and the one purchasing settings audit recorder from 0303.

insert into public.purchasing_destinations
  (name, warehouse_id, address, is_default, active, sort_order)
select
  'Ohana',
  null,
  null,
  false,
  true,
  coalesce(max(sort_order), -1) + 1
from public.purchasing_destinations
on conflict (name) do update
  set active = true,
      updated_at = now();

create or replace function public.purchasing_create_destination(
  p_name text,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_id uuid;
  v_sort_order int;
begin
  if v_name is null or length(v_name) > 120 then
    raise exception 'destination_name_required' using errcode = '22023';
  end if;
  if v_address is not null and length(v_address) > 500 then
    raise exception 'destination_address_too_long' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.purchasing_destinations
    where lower(name) = lower(v_name)
  ) then
    raise exception 'destination_name_exists' using errcode = '23505', detail = v_name;
  end if;

  select coalesce(max(sort_order), -1) + 1
    into v_sort_order
    from public.purchasing_destinations;

  insert into public.purchasing_destinations
    (name, address, is_default, active, sort_order, updated_by, updated_at)
  values
    (v_name, v_address, false, true, v_sort_order, auth.uid(), now())
  returning id into v_id;

  perform public.purchasing_record_change(
    v_role,
    'destination_created',
    null,
    null,
    null,
    jsonb_build_object(
      'id', v_id,
      'name', v_name,
      'address', v_address,
      'active', true,
      'is_default', false
    )::text,
    format('Purchasing setting · Deliver To %s added', v_name)
  );

  return v_id;
end;
$fn$;

create or replace function public.purchasing_update_destination(
  p_destination_id uuid,
  p_name text,
  p_address text,
  p_active boolean,
  p_is_default boolean
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old public.purchasing_destinations;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_old_value text;
  v_new_value text;
begin
  select * into v_old
    from public.purchasing_destinations
   where id = p_destination_id
   for update;
  if not found then
    raise exception 'unknown_destination' using errcode = '22023';
  end if;
  if p_active is null or p_is_default is null then
    raise exception 'destination_state_required' using errcode = '22023';
  end if;
  if p_is_default and not p_active then
    raise exception 'default_destination_must_stay_active' using errcode = '22023';
  end if;
  if v_old.is_default and not p_is_default then
    raise exception 'default_destination_required' using errcode = '22023';
  end if;

  -- Warehouse owns the linked destination's name and address. The Settings
  -- form may change only its availability/default state; duplicating those
  -- two fields here would create two owners for one warehouse fact.
  if v_old.warehouse_id is not null then
    v_name := v_old.name;
    v_address := v_old.address;
  else
    if v_name is null or length(v_name) > 120 then
      raise exception 'destination_name_required' using errcode = '22023';
    end if;
    if v_address is not null and length(v_address) > 500 then
      raise exception 'destination_address_too_long' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.purchasing_destinations
       where id <> p_destination_id
         and lower(name) = lower(v_name)
    ) then
      raise exception 'destination_name_exists' using errcode = '23505', detail = v_name;
    end if;
  end if;

  v_old_value := jsonb_build_object(
    'id', v_old.id,
    'name', v_old.name,
    'address', v_old.address,
    'active', v_old.active,
    'is_default', v_old.is_default
  )::text;

  if p_is_default and not v_old.is_default then
    update public.purchasing_destinations
       set is_default = false,
           updated_by = auth.uid(),
           updated_at = now()
     where is_default
       and id <> p_destination_id;
  end if;

  update public.purchasing_destinations
     set name = v_name,
         address = v_address,
         active = p_active,
         is_default = p_is_default,
         updated_by = auth.uid(),
         updated_at = now()
   where id = p_destination_id;

  v_new_value := jsonb_build_object(
    'id', p_destination_id,
    'name', v_name,
    'address', v_address,
    'active', p_active,
    'is_default', p_is_default
  )::text;

  perform public.purchasing_record_change(
    v_role,
    'destination_updated',
    null,
    null,
    v_old_value,
    v_new_value,
    format('Purchasing setting · Deliver To %s updated', v_name)
  );
end;
$fn$;

revoke execute on function public.purchasing_create_destination(text, text)
  from public, anon;
grant execute on function public.purchasing_create_destination(text, text)
  to authenticated;

revoke execute on function public.purchasing_update_destination(uuid, text, text, boolean, boolean)
  from public, anon;
grant execute on function public.purchasing_update_destination(uuid, text, text, boolean, boolean)
  to authenticated;

comment on function public.purchasing_create_destination(text, text) is
  '0404: manager-only audited Settings door for a future external Deliver To.';
comment on function public.purchasing_update_destination(uuid, text, text, boolean, boolean) is
  '0404: manager-only audited Settings door for name, address, availability and default.';

do $$
begin
  if not exists (
    select 1 from public.purchasing_destinations
     where name = 'Ohana' and active
  ) then
    raise exception '0404: Ohana must be an active Deliver To';
  end if;
  if to_regprocedure('public.purchasing_create_destination(text,text)') is null
     or to_regprocedure(
       'public.purchasing_update_destination(uuid,text,text,boolean,boolean)'
     ) is null then
    raise exception '0404: governed destination Settings doors are missing';
  end if;
end $$;
