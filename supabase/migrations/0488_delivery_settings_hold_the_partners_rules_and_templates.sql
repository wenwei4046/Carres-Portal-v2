-- 0488 · Delivery Settings hold the partners, the rules and the templates
-- 【DELIVERY】 CARD 12 · Delivery Settings (Delivery MASTER §11, §5.3, §8.8)
--
-- Central Delivery Settings is one `Delivery` group in the Settings Workspace
-- on the Warehouse Settings grammar: readable rows, one `Save changes` per
-- page, `Not configured` for any value nobody has recorded, and actor · time ·
-- old value · new value on every change. It contains no roster, no owner list
-- and no duty calculation.
--
-- Partner contact is company master data — entered by a manager here, never
-- typed into code. Payment reads the customer-facing partner number from the
-- record. Driver and vehicle come from the partner's saved templates.

set search_path = public;

-- ── The partner record grows the facts §11 names ─────────────────────────────
alter table public.delivery_partners
  add column if not exists active                   boolean not null default true,
  add column if not exists customer_phone           text,
  add column if not exists office_contact           text,
  add column if not exists coverage                 jsonb,
  add column if not exists kv_default               boolean not null default false,
  add column if not exists cutoff_time              time,
  add column if not exists handover_points          jsonb,
  add column if not exists services                 jsonb,
  add column if not exists customer_contact_by      text not null default 'partner',
  add column if not exists record_on_behalf_allowed boolean not null default true,
  add column if not exists proof_rules              jsonb;

alter table public.delivery_partners
  drop constraint if exists dp_customer_contact_by_valid;
alter table public.delivery_partners
  add constraint dp_customer_contact_by_valid
    check (customer_contact_by in ('partner', 'operation'));
alter table public.delivery_partners
  drop constraint if exists dp_coverage_shape;
alter table public.delivery_partners
  add constraint dp_coverage_shape
    check (coverage is null or jsonb_typeof(coverage) = 'object');
alter table public.delivery_partners
  drop constraint if exists dp_handover_points_shape;
alter table public.delivery_partners
  add constraint dp_handover_points_shape
    check (handover_points is null or jsonb_typeof(handover_points) = 'array');
alter table public.delivery_partners
  drop constraint if exists dp_services_shape;
alter table public.delivery_partners
  add constraint dp_services_shape
    check (services is null or jsonb_typeof(services) = 'object');
alter table public.delivery_partners
  drop constraint if exists dp_proof_rules_shape;
alter table public.delivery_partners
  add constraint dp_proof_rules_shape
    check (proof_rules is null or jsonb_typeof(proof_rules) = 'object');

-- Exactly one Klang Valley default partner, when one is flagged at all.
create unique index if not exists delivery_partners_one_kv_default_uidx
  on public.delivery_partners (kv_default) where kv_default and active;

comment on column public.delivery_partners.customer_phone is
  '0488: the customer-facing number Payment prints on its messages. Company master data; a manager enters it in Delivery Settings.';
comment on column public.delivery_partners.coverage is
  '0488: {states:[], cities:[], postcodes:[], excluded:[]} — where the partner delivers. Coverage informs and pre-selects an assignment; it never hides a partner.';
comment on column public.delivery_partners.customer_contact_by is
  '0488: who arranges the day with the customer for this partner — the partner, or Carres Operation. Read by the Monitor status ladder.';

-- ── Vehicles keep an active flag; drivers get their own templates ────────────
alter table public.partner_fleet
  add column if not exists active boolean not null default true;

create table if not exists public.partner_drivers (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.delivery_partners(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists partner_drivers_partner_idx on public.partner_drivers (partner_id, active);

alter table public.partner_drivers enable row level security;
revoke all on public.partner_drivers from public, anon, authenticated;
grant select on public.partner_drivers to authenticated;
drop policy if exists partner_drivers_read on public.partner_drivers;
create policy partner_drivers_read on public.partner_drivers
  for select using ((select public.is_internal()) or (select public.app_role()) = 'partner');
-- Writes go through the doors below; the client never updates a template row.

-- ── Every change is recorded: what, old, new, actor, time ────────────────────
create table if not exists public.delivery_setting_changes (
  id uuid primary key default gen_random_uuid(),
  what text not null,
  partner_id uuid references public.delivery_partners(id) on delete set null,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid references public.app_users(id),
  changed_at timestamptz not null default now()
);
create index if not exists delivery_setting_changes_what_idx
  on public.delivery_setting_changes (what, changed_at desc);
alter table public.delivery_setting_changes enable row level security;
revoke all on public.delivery_setting_changes from public, anon, authenticated;
grant select on public.delivery_setting_changes to authenticated;
drop policy if exists delivery_setting_changes_read on public.delivery_setting_changes;
create policy delivery_setting_changes_read on public.delivery_setting_changes
  for select using ((select public.is_internal()));

-- ── The gate: the same manager authority Payment (0431) and Warehouse (0456) use
create or replace function public.delivery_settings_gate()
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := (select public.app_role());
  v_duties text[];
begin
  if v_role is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'no active account';
  end if;
  if v_role <> 'principal' then
    select coalesce(array_agg(pd.duty_key), '{}'::text[])
      into v_duties
      from app_users u
      join org_position_duties pd on pd.position_id = u.position_id
     where u.id = auth.uid() and u.role <> 'dealer' and u.status = 'active';
    if not ('ops_manager' = any(coalesce(v_duties, '{}'::text[]))) then
      raise exception 'forbidden' using errcode = '42501',
        detail = 'delivery settings are set by the manager';
    end if;
  end if;
end;
$fn$;
revoke all on function public.delivery_settings_gate() from public, anon;
grant execute on function public.delivery_settings_gate() to authenticated;

create or replace function public.delivery_can_manage_settings()
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.delivery_settings_gate();
  return true;
exception when insufficient_privilege then
  return false;
end;
$fn$;
revoke all on function public.delivery_can_manage_settings() from public, anon;
grant execute on function public.delivery_can_manage_settings() to authenticated;

-- ── One recorder ─────────────────────────────────────────────────────────────
create or replace function public.delivery_record_setting_change(
  p_what text, p_partner_id uuid, p_old jsonb, p_new jsonb
) returns void
language sql security definer
set search_path = public, pg_temp
as $fn$
  insert into delivery_setting_changes (what, partner_id, old_value, new_value, actor_id)
  values (p_what, p_partner_id, p_old, p_new, auth.uid());
$fn$;
revoke all on function public.delivery_record_setting_change(text, uuid, jsonb, jsonb) from public, anon, authenticated;

-- ── Partner details ──────────────────────────────────────────────────────────
create or replace function public.delivery_set_partner_details(
  p_partner_id uuid,
  p_name text,
  p_active boolean,
  p_customer_phone text,
  p_office_contact text,
  p_address text,
  p_whatsapp_group_url text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old delivery_partners;
  v_new delivery_partners;
begin
  perform public.delivery_settings_gate();
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'the partner name is required' using errcode = '22023', detail = 'name_required';
  end if;
  select * into v_old from delivery_partners where id = p_partner_id for update;
  if not found then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  update delivery_partners
     set name = btrim(p_name),
         active = coalesce(p_active, true),
         customer_phone = nullif(btrim(coalesce(p_customer_phone, '')), ''),
         office_contact = nullif(btrim(coalesce(p_office_contact, '')), ''),
         address = nullif(btrim(coalesce(p_address, '')), ''),
         whatsapp_group_url = nullif(btrim(coalesce(p_whatsapp_group_url, '')), '')
   where id = p_partner_id
   returning * into v_new;
  perform public.delivery_record_setting_change(
    'partner_details', p_partner_id,
    jsonb_build_object('name', v_old.name, 'active', v_old.active, 'customer_phone', v_old.customer_phone,
                       'office_contact', v_old.office_contact, 'address', v_old.address,
                       'whatsapp_group_url', v_old.whatsapp_group_url),
    jsonb_build_object('name', v_new.name, 'active', v_new.active, 'customer_phone', v_new.customer_phone,
                       'office_contact', v_new.office_contact, 'address', v_new.address,
                       'whatsapp_group_url', v_new.whatsapp_group_url));
  return jsonb_build_object('id', v_new.id);
end;
$fn$;
revoke all on function public.delivery_set_partner_details(uuid, text, boolean, text, text, text, text) from public, anon;
grant execute on function public.delivery_set_partner_details(uuid, text, boolean, text, text, text, text) to authenticated;

-- ── Coverage ─────────────────────────────────────────────────────────────────
create or replace function public.delivery_set_partner_coverage(
  p_partner_id uuid,
  p_coverage jsonb,
  p_kv_default boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old delivery_partners;
  v_new delivery_partners;
begin
  perform public.delivery_settings_gate();
  if p_coverage is not null and jsonb_typeof(p_coverage) <> 'object' then
    raise exception 'coverage must name its states, cities, postcodes and exclusions'
      using errcode = '22023', detail = 'bad_coverage';
  end if;
  select * into v_old from delivery_partners where id = p_partner_id for update;
  if not found then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  -- One Klang Valley default at a time: flagging this partner unflags the other.
  if coalesce(p_kv_default, false) then
    update delivery_partners set kv_default = false where kv_default and id <> p_partner_id;
  end if;
  update delivery_partners
     set coverage = p_coverage, kv_default = coalesce(p_kv_default, false)
   where id = p_partner_id
   returning * into v_new;
  perform public.delivery_record_setting_change(
    'partner_coverage', p_partner_id,
    jsonb_build_object('coverage', v_old.coverage, 'kv_default', v_old.kv_default),
    jsonb_build_object('coverage', v_new.coverage, 'kv_default', v_new.kv_default));
  return jsonb_build_object('id', v_new.id);
end;
$fn$;
revoke all on function public.delivery_set_partner_coverage(uuid, jsonb, boolean) from public, anon;
grant execute on function public.delivery_set_partner_coverage(uuid, jsonb, boolean) to authenticated;

-- ── Schedule additions: cut-off and handover points (weekdays, capacity,
--    blackouts and the journey calendar keep their 0283/0411 doors) ──────────
create or replace function public.delivery_set_partner_schedule(
  p_partner_id uuid,
  p_cutoff_time time,
  p_handover_points jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old delivery_partners;
  v_new delivery_partners;
begin
  perform public.delivery_settings_gate();
  if p_handover_points is not null and jsonb_typeof(p_handover_points) <> 'array' then
    raise exception 'handover points are a list' using errcode = '22023', detail = 'bad_handover_points';
  end if;
  select * into v_old from delivery_partners where id = p_partner_id for update;
  if not found then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  update delivery_partners
     set cutoff_time = p_cutoff_time, handover_points = p_handover_points
   where id = p_partner_id
   returning * into v_new;
  perform public.delivery_record_setting_change(
    'partner_schedule', p_partner_id,
    jsonb_build_object('cutoff_time', v_old.cutoff_time, 'handover_points', v_old.handover_points),
    jsonb_build_object('cutoff_time', v_new.cutoff_time, 'handover_points', v_new.handover_points));
  return jsonb_build_object('id', v_new.id);
end;
$fn$;
revoke all on function public.delivery_set_partner_schedule(uuid, time, jsonb) from public, anon;
grant execute on function public.delivery_set_partner_schedule(uuid, time, jsonb) to authenticated;

-- ── Services & charges, and the Delivery Rules per partner ───────────────────
create or replace function public.delivery_set_partner_services(
  p_partner_id uuid,
  p_services jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old delivery_partners;
  v_new delivery_partners;
begin
  perform public.delivery_settings_gate();
  if p_services is not null and jsonb_typeof(p_services) <> 'object' then
    raise exception 'services and charges must be named' using errcode = '22023', detail = 'bad_services';
  end if;
  select * into v_old from delivery_partners where id = p_partner_id for update;
  if not found then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  update delivery_partners set services = p_services where id = p_partner_id returning * into v_new;
  perform public.delivery_record_setting_change(
    'partner_services', p_partner_id,
    jsonb_build_object('services', v_old.services), jsonb_build_object('services', v_new.services));
  return jsonb_build_object('id', v_new.id);
end;
$fn$;
revoke all on function public.delivery_set_partner_services(uuid, jsonb) from public, anon;
grant execute on function public.delivery_set_partner_services(uuid, jsonb) to authenticated;

create or replace function public.delivery_set_partner_rules(
  p_partner_id uuid,
  p_customer_contact_by text,
  p_record_on_behalf_allowed boolean,
  p_proof_rules jsonb
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old delivery_partners;
  v_new delivery_partners;
begin
  perform public.delivery_settings_gate();
  if p_customer_contact_by not in ('partner', 'operation') then
    raise exception 'who contacts the customer is the partner or Operation'
      using errcode = '22023', detail = 'bad_contact_by';
  end if;
  select * into v_old from delivery_partners where id = p_partner_id for update;
  if not found then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  update delivery_partners
     set customer_contact_by = p_customer_contact_by,
         record_on_behalf_allowed = coalesce(p_record_on_behalf_allowed, true),
         proof_rules = p_proof_rules
   where id = p_partner_id
   returning * into v_new;
  perform public.delivery_record_setting_change(
    'partner_rules', p_partner_id,
    jsonb_build_object('customer_contact_by', v_old.customer_contact_by,
                       'record_on_behalf_allowed', v_old.record_on_behalf_allowed, 'proof_rules', v_old.proof_rules),
    jsonb_build_object('customer_contact_by', v_new.customer_contact_by,
                       'record_on_behalf_allowed', v_new.record_on_behalf_allowed, 'proof_rules', v_new.proof_rules));
  return jsonb_build_object('id', v_new.id);
end;
$fn$;
revoke all on function public.delivery_set_partner_rules(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.delivery_set_partner_rules(uuid, text, boolean, jsonb) to authenticated;

-- ── Drivers and vehicles: templates saved once, retired by their flag ────────
create or replace function public.delivery_save_partner_driver(
  p_partner_id uuid, p_driver_id uuid, p_name text, p_phone text, p_active boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old partner_drivers;
  v_new partner_drivers;
begin
  perform public.delivery_settings_gate();
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'the driver name is required' using errcode = '22023', detail = 'name_required';
  end if;
  if not exists (select 1 from delivery_partners where id = p_partner_id) then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  if p_driver_id is not null then
    select * into v_old from partner_drivers where id = p_driver_id and partner_id = p_partner_id for update;
    if not found then
      raise exception 'driver template not found' using errcode = 'P0002';
    end if;
    update partner_drivers
       set name = btrim(p_name), phone = nullif(btrim(coalesce(p_phone, '')), ''), active = coalesce(p_active, true)
     where id = p_driver_id
     returning * into v_new;
  else
    insert into partner_drivers (partner_id, name, phone, active)
    values (p_partner_id, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''), coalesce(p_active, true))
    returning * into v_new;
  end if;
  perform public.delivery_record_setting_change('partner_driver', p_partner_id, to_jsonb(v_old), to_jsonb(v_new));
  return to_jsonb(v_new);
end;
$fn$;
revoke all on function public.delivery_save_partner_driver(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.delivery_save_partner_driver(uuid, uuid, text, text, boolean) to authenticated;

create or replace function public.delivery_save_partner_vehicle(
  p_partner_id uuid, p_vehicle_id uuid, p_plate text, p_vehicle_type text, p_capacity text,
  p_driver_name text, p_driver_phone text, p_active boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old partner_fleet;
  v_new partner_fleet;
begin
  perform public.delivery_settings_gate();
  if nullif(btrim(coalesce(p_plate, '')), '') is null then
    raise exception 'the vehicle plate is required' using errcode = '22023', detail = 'plate_required';
  end if;
  if nullif(btrim(coalesce(p_vehicle_type, '')), '') is null then
    raise exception 'the vehicle type is required' using errcode = '22023', detail = 'vehicle_type_required';
  end if;
  if not exists (select 1 from delivery_partners where id = p_partner_id) then
    raise exception 'Logistic partner not found' using errcode = 'P0002';
  end if;
  if p_vehicle_id is not null then
    select * into v_old from partner_fleet where id = p_vehicle_id and partner_id = p_partner_id for update;
    if not found then
      raise exception 'vehicle template not found' using errcode = 'P0002';
    end if;
    update partner_fleet
       set plate = btrim(p_plate), vehicle_type = btrim(p_vehicle_type),
           capacity = nullif(btrim(coalesce(p_capacity, '')), ''),
           driver_name = nullif(btrim(coalesce(p_driver_name, '')), ''),
           driver_phone = nullif(btrim(coalesce(p_driver_phone, '')), ''),
           active = coalesce(p_active, true)
     where id = p_vehicle_id
     returning * into v_new;
  else
    insert into partner_fleet (partner_id, plate, vehicle_type, capacity, driver_name, driver_phone, active)
    values (p_partner_id, btrim(p_plate), btrim(p_vehicle_type),
            nullif(btrim(coalesce(p_capacity, '')), ''),
            nullif(btrim(coalesce(p_driver_name, '')), ''),
            nullif(btrim(coalesce(p_driver_phone, '')), ''),
            coalesce(p_active, true))
    returning * into v_new;
  end if;
  perform public.delivery_record_setting_change('partner_vehicle', p_partner_id, to_jsonb(v_old), to_jsonb(v_new));
  return to_jsonb(v_new);
end;
$fn$;
revoke all on function public.delivery_save_partner_vehicle(uuid, uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.delivery_save_partner_vehicle(uuid, uuid, text, text, text, text, text, boolean) to authenticated;

-- ── Message Templates: the Payment library grammar, Delivery's purposes ─────
create table if not exists public.delivery_message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key uuid not null default gen_random_uuid(),
  purpose text not null check (purpose in (
    'ask_partner_for_date',
    'confirm_delivery_date',
    'confirm_delivery_time',
    'confirm_customer_availability',
    'confirm_delivery_address',
    'confirm_site_access',
    'confirm_receiver',
    'obtain_missing_information',
    'confirm_new_delivery_date_after_failed_delivery',
    'confirm_new_delivery_date',
    'confirm_cancellation')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'email', 'copy')),
  name text not null,
  body text not null,
  version int not null check (version >= 1),
  active boolean not null default true,
  is_default boolean not null default false,
  is_head boolean not null default true,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);
comment on table public.delivery_message_templates is
  '0488: the Delivery message library (Delivery MASTER §11) on the Payment template grammar — every save appends a version row; the newest of a template_key is its head; one Default per purpose; rows are never edited or deleted.';
create unique index if not exists delivery_templates_one_head_uidx
  on public.delivery_message_templates (template_key) where is_head;
create unique index if not exists delivery_templates_one_default_uidx
  on public.delivery_message_templates (purpose) where is_head and is_default and active;
create index if not exists delivery_templates_purpose_idx
  on public.delivery_message_templates (purpose, is_head);
alter table public.delivery_message_templates enable row level security;
revoke all on public.delivery_message_templates from public, anon, authenticated;
grant select on public.delivery_message_templates to authenticated;
drop policy if exists delivery_templates_read on public.delivery_message_templates;
create policy delivery_templates_read on public.delivery_message_templates
  for select using ((select public.is_internal()));

create or replace function public.delivery_template_save(
  p_template_key uuid, p_purpose text, p_channel text, p_name text, p_body text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_prev delivery_message_templates;
  v_row delivery_message_templates;
  v_key uuid := coalesce(p_template_key, gen_random_uuid());
begin
  perform public.delivery_settings_gate();
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'the template name is required' using errcode = '22023', detail = 'name_required';
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'the template wording is required' using errcode = '22023', detail = 'body_required';
  end if;
  if p_template_key is not null then
    select * into v_prev from delivery_message_templates where template_key = p_template_key and is_head for update;
    if not found then
      raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
    end if;
    if v_prev.purpose <> p_purpose then
      raise exception 'a template keeps its purpose; make a new template instead'
        using errcode = '22023', detail = 'purpose_locked';
    end if;
    update delivery_message_templates set is_head = false, is_default = false where id = v_prev.id;
  end if;
  insert into delivery_message_templates
    (template_key, purpose, channel, name, body, version, active, is_default, is_head, created_by)
  values
    (v_key, p_purpose, coalesce(p_channel, 'whatsapp'), btrim(p_name), p_body,
     coalesce(v_prev.version, 0) + 1, coalesce(v_prev.active, true), coalesce(v_prev.is_default, false),
     true, auth.uid())
  returning * into v_row;
  perform public.delivery_record_setting_change('template:' || v_key, null, to_jsonb(v_prev), to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.delivery_template_save(uuid, text, text, text, text) from public, anon;
grant execute on function public.delivery_template_save(uuid, text, text, text, text) to authenticated;

create or replace function public.delivery_template_set_default(p_template_key uuid) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row delivery_message_templates;
begin
  perform public.delivery_settings_gate();
  select * into v_row from delivery_message_templates where template_key = p_template_key and is_head for update;
  if not found then
    raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
  end if;
  if not v_row.active then
    raise exception 'an inactive template cannot be the Default' using errcode = '22023', detail = 'inactive_default';
  end if;
  update delivery_message_templates set is_default = false
   where purpose = v_row.purpose and is_head and is_default and id <> v_row.id;
  update delivery_message_templates set is_default = true where id = v_row.id returning * into v_row;
  perform public.delivery_record_setting_change('template_default:' || p_template_key, null, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.delivery_template_set_default(uuid) from public, anon;
grant execute on function public.delivery_template_set_default(uuid) to authenticated;

create or replace function public.delivery_template_set_active(p_template_key uuid, p_active boolean) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row delivery_message_templates;
begin
  perform public.delivery_settings_gate();
  select * into v_row from delivery_message_templates where template_key = p_template_key and is_head for update;
  if not found then
    raise exception 'template not found' using errcode = '22023', detail = 'template_not_found';
  end if;
  update delivery_message_templates
     set active = coalesce(p_active, true), is_default = case when coalesce(p_active, true) then is_default else false end
   where id = v_row.id
   returning * into v_row;
  perform public.delivery_record_setting_change('template_active:' || p_template_key, null, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end;
$fn$;
revoke all on function public.delivery_template_set_active(uuid, boolean) from public, anon;
grant execute on function public.delivery_template_set_active(uuid, boolean) to authenticated;
