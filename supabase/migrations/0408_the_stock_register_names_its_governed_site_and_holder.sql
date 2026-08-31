-- =============================================================================
-- 0408_the_stock_register_names_its_governed_site_and_holder.sql
-- Stock Register P0 · 2026-08-31
-- =============================================================================
--
-- The API has always asked the governed Stock Register read for `site_name`
-- and `holder_name`, but 0373 exposed only their foreign keys. Production
-- therefore refused the entire Register with:
--
--   column stock_unit_register_v.site_name does not exist
--
-- This repairs the ONE read model. It creates no inventory, Receiving, GRN,
-- Delivery or Purchasing writer, and it does not reinterpret any Unit status.
-- Site and holder names come from their governed rows; a missing relationship
-- remains NULL rather than becoming a sample or a hard-coded label.
--
-- Existing view columns stay in their 0373 order. PostgreSQL permits CREATE OR
-- REPLACE VIEW to append columns, but not to rename/reorder existing ones, so
-- the two display names are deliberately appended after the event fields.
-- =============================================================================

create or replace view public.stock_unit_register_v
with (security_invoker = true) as
  select
    v.*,
    e.last_event_at,
    e.last_event,
    w.name as site_name,
    p.name as holder_name
  from public.stock_unit_availability_v v
  left join public.warehouses w on w.id = v.warehouse_id
  left join public.stock_operating_parties p on p.id = v.holder_party_id
  left join lateral (
    select ev.event_at as last_event_at,
           ev.event    as last_event
      from public.stock_unit_events ev
     where ev.unit_id = v.id
     order by ev.seq desc
     limit 1
  ) e on true;

comment on view public.stock_unit_register_v is
  '0408 — the one read-only Stock Register surface. Availability and lifecycle '
  'remain owned by stock_unit_availability_v; Site and holder display names '
  'come from their governed foreign-key rows; Changed remains the latest '
  'physical Unit event by sequence. This view writes nothing.';

revoke all on public.stock_unit_register_v from authenticated, anon;
grant select on public.stock_unit_register_v to authenticated;

-- Schema-only sanity. Never assert production row counts in a migration.
do $$
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'stock_unit_register_v'
       and column_name = 'site_name'
  ) then
    raise exception '0408: stock_unit_register_v is missing site_name';
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'stock_unit_register_v'
       and column_name = 'holder_name'
  ) then
    raise exception '0408: stock_unit_register_v is missing holder_name';
  end if;
end;
$$;
