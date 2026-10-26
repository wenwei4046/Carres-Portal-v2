-- =============================================================================
-- 0725_office_staff_keep_delivery_zones_rate_cards_and_lorry_health.sql
-- =============================================================================
-- THE RULING: Weisiang's decision (Mr Lim, Houzs owner side, WhatsApp
--   2026-10-22, relayed by YH 2026-10-23): "I think just clear Carress rules
--   and Implement Houzs inside". Where a Carres rule clashes with Houzs, the
--   Houzs behaviour is built. Jess was not part of this decision.
--   docs/delivery/MASTER.md §15.3 and §16 record the overturned rules.
--
-- Stacked on 0724 (Carres Lorries = delivery_partners.own_fleet; lorries are
-- partner_fleet, crew is partner_drivers). Nothing here makes a second lorry or
-- crew list.
--
-- WHAT THIS ADDS (Houzs Fleet Health · Delivery Zones · Delivery Rate Cards):
--   1. partner_fleet gains four due dates — PUSPAKOM, road tax, insurance,
--      service — saved through fleet_save_lorry_health (operation staff).
--   2. delivery_zones — a named zone and its postcode ranges ("47" = 47000 to
--      47999, "46-47", "58200-58299" or one postcode). Seeded with Houzs' default
--      Malaysian map; editable. The narrowest matching range wins (Houzs rule;
--      packages/shared/src/fleet.ts zoneForPostcode).
--   3. delivery_rate_cards — one row per Logistics company (Carres Lorries
--      included) per zone, or "every other zone" (zone_id null): basis per item
--      or per delivery order, the 1st / 2nd / each further unit price and a
--      minimum charge (Houzs positional tiers). The cost is computed in
--      packages/shared/src/fleet.ts deliveryCost and shown on the DO page.
--   Zones and rate cards are delivery settings: read by internal staff, written
--   by the people named for Delivery settings (settings_can_edit('delivery')),
--   every change recorded in delivery_setting_changes like other settings.
--
-- Zones do not reference 0723's state -> region list: a region is a state
-- bucket for dates, a zone is a postcode bucket for cost.
-- No row count is asserted (red line 8). Nothing is dropped or deleted.
-- =============================================================================

set search_path = public;

-- 1 · Fleet Health ---------------------------------------------------------
alter table public.partner_fleet
  add column if not exists puspakom_due  date,
  add column if not exists road_tax_due  date,
  add column if not exists insurance_due date,
  add column if not exists service_due   date;
comment on column public.partner_fleet.puspakom_due is
  '0725 (Weisiang''s decision 2026-10-22, Houzs Fleet Health): when the lorry''s PUSPAKOM inspection is due.';

create or replace function public.fleet_save_lorry_health(
  p_vehicle_id uuid, p_puspakom date, p_road_tax date, p_insurance date, p_service date
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old partner_fleet;
  v_new partner_fleet;
begin
  if not coalesce((select public.is_operation()), false) then
    raise exception 'Only operation may save lorry dates' using errcode = '42501';
  end if;
  select * into v_old from partner_fleet where id = p_vehicle_id for update;
  if not found then
    raise exception 'lorry not found' using errcode = 'P0002', detail = 'lorry_not_found';
  end if;
  -- Fleet Health is for Carres' own lorries; another company keeps its own fleet (same rule as 0724's doors).
  if not exists (select 1 from delivery_partners where id = v_old.partner_id and own_fleet) then
    raise exception 'not a Carres lorry' using errcode = '22023', detail = 'not_own_lorry';
  end if;
  update partner_fleet
     set puspakom_due = p_puspakom, road_tax_due = p_road_tax,
         insurance_due = p_insurance, service_due = p_service
   where id = p_vehicle_id
  returning * into v_new;
  perform public.delivery_record_setting_change('lorry_health', v_new.partner_id,
    jsonb_build_object('puspakom_due', v_old.puspakom_due, 'road_tax_due', v_old.road_tax_due,
                       'insurance_due', v_old.insurance_due, 'service_due', v_old.service_due),
    jsonb_build_object('id', v_new.id, 'puspakom_due', v_new.puspakom_due, 'road_tax_due', v_new.road_tax_due,
                       'insurance_due', v_new.insurance_due, 'service_due', v_new.service_due));
  return to_jsonb(v_new);
end;
$fn$;
revoke all on function public.fleet_save_lorry_health(uuid, date, date, date, date) from public, anon;
grant execute on function public.fleet_save_lorry_health(uuid, date, date, date, date) to authenticated;

-- 2 · Delivery Zones ---------------------------------------------------------
create table if not exists public.delivery_zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> '' and length(name) <= 60),
  -- each entry: 2 or 5 digits, optionally "-" and 2 or 5 digits
  postcodes  text[] not null default '{}' check (
    cardinality(postcodes) <= 200
    and array_to_string(postcodes, ',') ~ '^(\d{2}(\d{3})?(-\d{2}(\d{3})?)?(,\d{2}(\d{3})?(-\d{2}(\d{3})?)?)*)?$'),
  created_at timestamptz not null default now()
);
create unique index if not exists delivery_zones_name_uidx on public.delivery_zones (lower(btrim(name)));
comment on table public.delivery_zones is
  '0725 (Weisiang''s decision 2026-10-22, Houzs Delivery Zones): a named postcode zone. The narrowest matching range wins.';

-- Houzs' default Malaysian map (Houzs backend/src/scm/lib/zone-classify.ts DEFAULT_ZONE_PREFIX_MAP).
insert into public.delivery_zones (name, postcodes) values
  ('KEDAH',  '{05-09}'),
  ('PENANG', '{10-14}'),
  ('PERAK',  '{30-36}'),
  ('EAST',   '{15-24}'),
  ('PAHANG', '{25-28,39,49,69}'),
  ('PJ',     '{40,46-47}'),
  ('KLANG',  '{41-42}'),
  ('KAJANG', '{43}'),
  ('RAWANG', '{48}'),
  ('KL',     '{50-60,68}'),
  ('NS',     '{70-73}'),
  ('MELAKA', '{75-78}'),
  ('JOHOR',  '{79-86}')
on conflict do nothing;

-- 3 · Rate Cards -----------------------------------------------------------
create table if not exists public.delivery_rate_cards (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.delivery_partners(id) on delete cascade,
  -- null = every other zone. Removing a zone never removes a rate card (Houzs: deleting a
  -- zone rule leaves rate rules alone, Houzs backend/src/scm/routes/delivery-zones.ts:227-242);
  -- a zone with rate cards is refused until its cards are removed. Follows Houzs per Weisiang's ruling
  -- (2026-10-22): clear Carres rules, implement Houzs.
  zone_id      uuid references public.delivery_zones(id) on delete restrict,
  basis        text not null default 'item' check (basis in ('item', 'order')),
  first_unit   numeric(10,2) not null check (first_unit >= 0),
  second_unit  numeric(10,2) not null check (second_unit >= 0),
  further_unit numeric(10,2) not null check (further_unit >= 0),
  min_charge   numeric(10,2) not null default 0 check (min_charge >= 0),
  created_at   timestamptz not null default now()
);
alter table public.delivery_rate_cards drop constraint if exists delivery_rate_cards_zone_id_fkey;
alter table public.delivery_rate_cards add constraint delivery_rate_cards_zone_id_fkey
  foreign key (zone_id) references public.delivery_zones(id) on delete restrict;
create unique index if not exists delivery_rate_cards_one_per_zone_uidx
  on public.delivery_rate_cards (partner_id, coalesce(zone_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- Houzs charge rules on the card. Follows Houzs backend/src/db/migrations-pg/0207_scm_delivery_rate_cards.sql:87-116
-- (OVERAGE cap, SOFA_BRACKET bands, SERVICE / PICKUP / DISPOSE rates) per Weisiang's ruling (2026-10-22):
-- clear Carres rules, implement Houzs. Kept on the card row (one card per company per zone) rather
-- than Houzs' rule rows; sofa bands are a small list [{min, max|null, amount}].
alter table public.delivery_rate_cards
  add column if not exists overage_cap     smallint check (overage_cap is null or overage_cap >= 1),
  add column if not exists overage_each    numeric(10,2) not null default 0 check (overage_each >= 0),
  add column if not exists sofa_brackets   jsonb not null default '[]'::jsonb check (jsonb_typeof(sofa_brackets) = 'array'),
  add column if not exists service_charge  numeric(10,2) not null default 0 check (service_charge >= 0),
  add column if not exists pickup_charge   numeric(10,2) not null default 0 check (pickup_charge >= 0),
  add column if not exists disposal_charge numeric(10,2) not null default 0 check (disposal_charge >= 0);
comment on table public.delivery_rate_cards is
  '0725 (Weisiang''s decision 2026-10-22, Houzs Delivery Rate Cards): a Logistics company''s price per zone — 1st, 2nd and each further unit (item or delivery order), overage past a cap, sofa compartment bands, service / pickup / disposal charges and a minimum charge.';

-- 4 · who reads and writes zones and rate cards ------------------------------
do $grants$
declare
  t text;
begin
  foreach t in array array['delivery_zones', 'delivery_rate_cards'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using ((select public.is_internal()))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format($p$create policy %I on public.%I for all
                      using ((select public.settings_can_edit('delivery')))
                      with check ((select public.settings_can_edit('delivery')))$p$, t || '_write', t);
  end loop;
end;
$grants$;

-- Every change is recorded like the other delivery settings.
create or replace function public.delivery_zone_rate_audit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.delivery_record_setting_change(
    tg_table_name,
    (to_jsonb(coalesce(new, old)) ->> 'partner_id')::uuid,  -- null for a zone
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end;
$fn$;
revoke all on function public.delivery_zone_rate_audit() from public, anon, authenticated;

drop trigger if exists delivery_zones_audit on public.delivery_zones;
create trigger delivery_zones_audit after insert or update or delete on public.delivery_zones
  for each row execute function public.delivery_zone_rate_audit();
drop trigger if exists delivery_rate_cards_audit on public.delivery_rate_cards;
create trigger delivery_rate_cards_audit after insert or update or delete on public.delivery_rate_cards
  for each row execute function public.delivery_zone_rate_audit();

-- 5 · Reconciliation -------------------------------------------------------
-- Follows Houzs backend/src/scm/routes/delivery-rate-cards.ts:476-672 (GET /reconcile) per Weisiang's
-- ruling (2026-10-22): clear Carres rules, implement Houzs. Houzs compares a 3PL trip's billed cost
-- with the rate card's computed cost; in Carres a Logistics company's bill is charged per delivery
-- order (0689 supplier_bill_lines.delivery_order_id), so each billed DO is one row. This returns the
-- facts; the charge is computed in packages/shared/src/fleet.ts deliveryCharge (API route). Read only.
-- Bill amounts are Finance's, so it is read by Finance readers and the people named for Delivery settings.
create or replace function public.delivery_rate_reconcile(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not (public.gl_may_read() or public.settings_can_edit('delivery')) then
    raise exception 'Only Finance or the people named for Delivery settings read delivery charges.'
      using errcode = '42501', detail = 'not_allowed';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'do_id', d.id, 'do_no', d.do_number, 'delivery_date', d.delivery_date,
             'partner_id', p.id, 'partner_name', p.name, 'address', o.customer_address,
             'trip_groups', d.trip_groups, 'billed', b.billed, 'bills', b.bills,
             'lines', (select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'qty', l.qty, 'attrs', l.attrs)), '[]'::jsonb)
                         from public.order_lines l where l.order_id = d.order_id))
           order by d.delivery_date desc nulls last, d.do_number)
      from public.ops_delivery_orders d
      join public.orders o on o.id = d.order_id
      left join public.ops_delivery_arrangements a on a.order_id = d.order_id and a.leg = d.leg
      join public.delivery_partners p on coalesce(a.partner_id = p.id, d.logistics_partner = p.name)
      join lateral (
        select sum(bl.amount) as billed, jsonb_agg(distinct coalesce(sb.bill_no, sb.supplier_invoice_no)) as bills
          from public.supplier_bill_lines bl
          join public.supplier_bills sb on sb.id = bl.bill_id
         where bl.delivery_order_id = d.id and sb.status <> 'cancelled'
      ) b on b.billed is not null
     where d.voided_at is null
       and (p_from is null or d.delivery_date >= p_from)
       and (p_to is null or d.delivery_date <= p_to)
  ), '[]'::jsonb);
end;
$fn$;
revoke all on function public.delivery_rate_reconcile(date, date) from public, anon;
grant execute on function public.delivery_rate_reconcile(date, date) to authenticated;
comment on function public.delivery_rate_reconcile(date, date) is
  '0725 (Weisiang''s decision 2026-10-22, Houzs reconcile): each live delivery order on a live Logistics bill, with its billed amount, company, address and goods, for comparing with the rate card. Finance readers and Delivery settings editors.';
