-- 0411_a_partner_states_its_own_pickup_week.sql
-- Delivery Card 03 — partner pickup/delivery calendars (owner ruling 2026-09-01,
-- docs/delivery/MASTER.md §5.1 + §11, ERP-ARCHITECTURE §3.6).
--
--   "Partner Settings must own pickup/delivery calendars. When Operations
--    assigns TEOW or TT, Delivery calculates the actual latest Warehouse-ready
--    date ... Staff must not remember pickup weekdays."
--
-- THREE additive columns on delivery_partners, following 0283's shape exactly:
-- the data a carrier states about itself lives here; the ONE calculation lives
-- in packages/shared/src/partner-journey.ts (no second engine).
--
--   * pickup_days      — weekday numbers (0=Sun…6=Sat) the carrier collects
--                        from Carres Klang. NULL = not recorded: the backward
--                        calculation stays SILENT (absence is "we never asked",
--                        never a guess — the T7 law 0283 already follows).
--   * journey_regions  — jsonb, per destination region the carrier serves:
--                        {"Melaka": {"deliveryDays": [1,3,5], "transitDays": 0},
--                         "JB":     {"deliveryDays": [2,4,6], "transitDays": 1}}
--                        deliveryDays may be null when the carrier only states
--                        its pickup week — the engine then derives delivery day
--                        = pickup day + transitDays and says so.
--   * surcharge_areas  — areas the carrier charges extra for, shown to the
--                        operator as a fact when assigning. Never a block.
--
-- These INFORM the backward calculation. They never block an assignment: the
-- carrier is reachable by phone, exactly as 0283 ruled for off-days.
--
-- WRITE PATH — an audited SECURITY DEFINER door naming its columns (0283's
-- reasoning verbatim: partners_principal_write cannot be narrowed to columns,
-- and widening it would hand out name/contact/rate_card).

set search_path = public;

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.delivery_partners
  add column if not exists pickup_days     smallint[],
  add column if not exists journey_regions jsonb,
  add column if not exists surcharge_areas text[] not null default '{}'::text[];

alter table public.delivery_partners
  drop constraint if exists dp_pickup_days_valid;
alter table public.delivery_partners
  add constraint dp_pickup_days_valid
    check (
      pickup_days is null
      or (
        pickup_days <@ array[1,2,3,4,5,6]::smallint[]  -- Sunday is never a pickup day
        and coalesce(array_length(pickup_days, 1), 0) between 1 and 6
      )
    );

alter table public.delivery_partners
  drop constraint if exists dp_journey_regions_shape;
alter table public.delivery_partners
  add constraint dp_journey_regions_shape
    check (journey_regions is null or jsonb_typeof(journey_regions) = 'object');

alter table public.delivery_partners
  drop constraint if exists dp_surcharge_areas_bounded;
alter table public.delivery_partners
  add constraint dp_surcharge_areas_bounded
    check (coalesce(array_length(surcharge_areas, 1), 0) <= 50);

comment on column public.delivery_partners.pickup_days is
  'Delivery Card 03 (0411): weekday numbers this carrier collects from Carres Klang, 1=Mon…6=Sat. NULL = not recorded — the backward calculation stays silent. Read by packages/shared/src/partner-journey.ts, the ONE engine.';
comment on column public.delivery_partners.journey_regions is
  'Delivery Card 03 (0411): per destination region {deliveryDays: int[]|null, transitDays: int}. deliveryDays null = derive from pickup + transit. Informs, never blocks.';
comment on column public.delivery_partners.surcharge_areas is
  'Delivery Card 03 (0411): areas this carrier charges extra for. A displayed fact, never a block.';

-- ── the write door ───────────────────────────────────────────────────────────
create or replace function public.set_partner_journey_calendar(
  p_partner_id      uuid,
  p_pickup_days     smallint[],
  p_journey_regions jsonb,
  p_surcharge_areas text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_name text;
begin
  if not (select public.is_operation()) then
    raise exception 'Only operation or principal may set a carrier''s journey calendar'
      using errcode = '42501';
  end if;

  select name into v_name from public.delivery_partners where id = p_partner_id;
  if v_name is null then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;

  update public.delivery_partners
     set pickup_days     = p_pickup_days,
         journey_regions = p_journey_regions,
         surcharge_areas = coalesce(p_surcharge_areas, '{}'::text[])
   where id = p_partner_id;

  -- The backward calculation reads these facts, so changing them changes the
  -- Warehouse-ready date the portal will name tomorrow. Not silent.
  insert into audit_log (role, actor_text, action, ref)
  values ((select public.app_role()),
          (select name from public.app_users where id = auth.uid()),
          format('Journey calendar · %s: pickup days %s · %s region(s) · %s surcharge area(s)',
                 v_name,
                 coalesce(array_to_string(p_pickup_days, ','), 'not recorded'),
                 coalesce((select count(*) from jsonb_object_keys(coalesce(p_journey_regions, '{}'::jsonb))), 0),
                 coalesce(array_length(p_surcharge_areas, 1), 0)),
          p_partner_id::text);
end;
$function$;

revoke all on function public.set_partner_journey_calendar(uuid, smallint[], jsonb, text[]) from public;
grant execute on function public.set_partner_journey_calendar(uuid, smallint[], jsonb, text[]) to authenticated;

-- ── configuration seeds (owner ruling 2026-09-01) ───────────────────────────
-- Partner CONFIGURATION, not transaction data — it survives the clean start
-- (Constitution §6: what must survive is configuration). Name match is
-- case-insensitive because 0155 seeded 'Teow' while the governed display name
-- is TEOW. A missing row seeds nothing — a migration never asserts a row count.
update public.delivery_partners
   set pickup_days     = array[1,3,5]::smallint[],
       journey_regions = '{"Melaka": {"deliveryDays": [1,3,5], "transitDays": 0},
                           "JB":     {"deliveryDays": [2,4,6], "transitDays": 1}}'::jsonb
 where lower(name) = 'teow';

update public.delivery_partners
   set pickup_days     = array[3]::smallint[],
       journey_regions = '{"JB": {"deliveryDays": null, "transitDays": 1}}'::jsonb,
       surcharge_areas = array['Pontian','Kota Tinggi','Kulai Tesco','Sedenak']
 where lower(name) = 'tt';
