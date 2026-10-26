-- 0718 · A Unit can sit in a Bin on a Rack.
--
-- Weisiang's decision (Mr Lim, WhatsApp 2026-10-22, relayed by YH 2026-10-23):
-- "just clear Carress rules and Implement Houzs inside". Houzs keeps Racks and
-- Bins per warehouse; Carres had none (Stock MASTER: "no Zone, Rack or Bin").
-- That rule is overturned. Jess was not part of this decision.
-- Follows Houzs backend/src/scm/routes/warehouse.ts:429-432 (Racks per warehouse)
-- per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs.
--
-- STILL ONE LEDGER. A Bin is a named place at a Site. The Unit says which Bin it
-- is in (`ops_stock_items.bin_id`); there is no second rack/bin stock table and
-- no quantity stored per Bin. A Bin's fill is counted from the Units in it.
--
-- Doors:
--   warehouse_bin_add(site, rack, bin)   Warehouse Settings people (the same
--                                        gate as every other Site setting)
--   stock_unit_set_bin(unit_code, bin)   internal staff; null takes it out.
--                                        Writes a `bin_changed` lineage event.

create table if not exists public.warehouse_bins (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  rack         text not null check (btrim(rack) <> ''),
  bin          text not null check (btrim(bin) <> ''),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (warehouse_id, rack, bin)
);

comment on table public.warehouse_bins is
  '0718 — Racks and Bins per Site (Weisiang''s decision 2026-10-22, Houzs way). '
  'A place, not a ledger: which Units are in a Bin is ops_stock_items.bin_id.';

alter table public.warehouse_bins enable row level security;
drop policy if exists warehouse_bins_read on public.warehouse_bins;
create policy warehouse_bins_read on public.warehouse_bins
  for select using ( ( select public.is_internal() ) );
grant select on public.warehouse_bins to authenticated;

alter table public.ops_stock_items
  add column if not exists bin_id uuid references public.warehouse_bins(id);

create index if not exists ops_stock_items_bin_idx
  on public.ops_stock_items (bin_id) where bin_id is not null;

create or replace function public.warehouse_bin_add(
  p_warehouse_id uuid,
  p_rack text,
  p_bin text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.warehouse_settings_gate();
  if btrim(coalesce(p_rack, '')) = '' or btrim(coalesce(p_bin, '')) = '' then
    raise exception 'give a rack and a bin' using errcode = '22023';
  end if;
  insert into public.warehouse_bins (warehouse_id, rack, bin)
  values (p_warehouse_id, btrim(p_rack), btrim(p_bin))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'that bin already exists on this rack' using errcode = '23505';
end;
$$;

create or replace function public.stock_unit_set_bin(
  p_unit_code text,
  p_bin_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unit public.ops_stock_items%rowtype;
  v_old  text;
  v_new  text;
  v_bin  public.warehouse_bins%rowtype;
begin
  if (select public.app_role()) is null
     or (select public.app_role())::text not in ('operation', 'principal') then  -- internal staff only; 'warehouse' is an external partner role
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_unit from public.ops_stock_items
   where upper(unit_code) = upper(btrim(p_unit_code))
     and coalesce(identity_scope, 'unit') = 'unit'
   for update;
  if not found then
    raise exception 'No Unit with that ID' using errcode = 'P0002';
  end if;

  if p_bin_id is not null then
    select * into v_bin from public.warehouse_bins where id = p_bin_id;
    if not found then
      raise exception 'no such bin' using errcode = 'P0002';
    end if;
    if v_bin.warehouse_id is distinct from v_unit.warehouse_id then
      raise exception 'this bin is at another Site than the Unit' using errcode = '22023';
    end if;
    v_new := v_bin.rack || ' · ' || v_bin.bin;
  end if;

  if v_unit.bin_id is not distinct from p_bin_id then
    return;
  end if;

  select rack || ' · ' || bin into v_old from public.warehouse_bins where id = v_unit.bin_id;

  update public.ops_stock_items set bin_id = p_bin_id where id = v_unit.id;

  insert into public.stock_unit_events
    (unit_id, unit_code, event, from_value, to_value, note, actor_id)
  values (v_unit.id, v_unit.unit_code, 'bin_changed', v_old, v_new, null, auth.uid());
end;
$$;

revoke execute on function public.warehouse_bin_add(uuid, text, text) from public, anon;
revoke execute on function public.stock_unit_set_bin(text, uuid) from public, anon;
grant execute on function public.warehouse_bin_add(uuid, text, text) to authenticated;
grant execute on function public.stock_unit_set_bin(text, uuid) to authenticated;

-- A Unit that changes Site (Transfer, Cancel, any other door) leaves its Bin:
-- a Bin belongs to one Site, so the old one is cleared and the move is recorded.
create or replace function public.trg_stock_unit_leaves_bin_on_site_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old text;
begin
  if new.bin_id is not null
     and new.warehouse_id is distinct from old.warehouse_id
     and not exists (select 1 from public.warehouse_bins b where b.id = new.bin_id and b.warehouse_id = new.warehouse_id) then
    select rack || ' · ' || bin into v_old from public.warehouse_bins where id = new.bin_id;
    new.bin_id := null;
    insert into public.stock_unit_events (unit_id, unit_code, event, from_value, to_value, note, actor_id)
    values (new.id, new.unit_code, 'bin_changed', v_old, null, 'moved Site', auth.uid());
  end if;
  return new;
end; $$;
revoke execute on function public.trg_stock_unit_leaves_bin_on_site_change() from public, anon, authenticated;
drop trigger if exists stock_unit_leaves_bin_on_site_change on public.ops_stock_items;
create trigger stock_unit_leaves_bin_on_site_change before update of warehouse_id on public.ops_stock_items
  for each row execute function public.trg_stock_unit_leaves_bin_on_site_change();
