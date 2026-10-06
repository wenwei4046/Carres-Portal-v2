-- =====================================================================
-- 0423 — A Manual Purchase asks for a date the office can meet
-- =====================================================================
-- WHAT THIS DOES
--   Replaces 0422's on/off switch with one NUMBER in Purchasing Settings,
--   the sibling of `earliest_sell_days` ("Earliest date a store may sell"):
--     manual_purchase_min_delivery_days  int  0..365  default 0
--   CALENDAR days, like earliest_sell_days. The earliest Delivery Date a
--   Manual Purchase may ask for is its Proceed Date (the request's
--   creation date, Asia/Kuala_Lumpur) + this many days. 0 means no floor,
--   which is today's behaviour — applying this migration changes nothing
--   on its own.
--
-- WHY A NUMBER AND NOT A SWITCH (owner ruling, 2026-09-04)
--   0422 (PR #1087, merged 2026-09-03) added a switch that enforced the
--   lead-time plan's proposed date. The owner ruled: a number, exactly
--   like `earliest_sell_days`, counted from the Proceed Date. The lead-time
--   plan stays a suggestion; the two are not combined.
--
-- WHETHER 0422 RAN OR NOT, THIS FILE IS SAFE
--   0422 is merged, so it is not rewritten. Whether it was applied is not
--   known at writing, so every step here is idempotent:
--   `purchasing_set_switch()` is dropped IF it exists, the number is added
--   IF it is missing, and `purchasing_set_number()` is replaced whole.
--
--   The switch COLUMN is left where it is. Nothing reads it any more, and
--   CI refuses a `drop column` outside the governed manual path. A dead
--   boolean that defaults to false costs nothing; dropping it can go in a
--   later housekeeping migration through that path.
--
-- WHERE THE REFUSAL HAPPENS
--   The API create door (`POST /purchasing/requests`) reads this number and,
--   when it is above 0 and the asked-for Delivery Date is earlier than
--   Proceed Date + the number, refuses `delivery_date_before_earliest`
--   before calling the create RPC. The browser prints the same sentence
--   under the date field.
--
-- HOW IT IS WRITTEN
--   Through the existing `purchasing_set_number()` door (0303): the same
--   role gate, the same history row in `purchasing_setting_changes`, the
--   same updated_by/at stamp. That function's closed key list is extended
--   here — the body below is 0303's, plus the one key. No new endpoint:
--   `PUT /purchasing/settings/number` already reaches it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Retire the 0422 switch door (a no-op if 0422 never ran)
-- ---------------------------------------------------------------------
drop function if exists public.purchasing_set_switch(text, boolean);

-- ---------------------------------------------------------------------
-- 2. The number
-- ---------------------------------------------------------------------
alter table public.purchasing_settings
  add column if not exists manual_purchase_min_delivery_days int not null default 0;

alter table public.purchasing_settings
  drop constraint if exists purchasing_settings_manual_purchase_min_delivery_days_check;
alter table public.purchasing_settings
  add constraint purchasing_settings_manual_purchase_min_delivery_days_check
  check (manual_purchase_min_delivery_days between 0 and 365);

comment on column public.purchasing_settings.manual_purchase_min_delivery_days is
  '0423: CALENDAR days, like earliest_sell_days. The earliest Delivery Date a Manual Purchase may ask for is its Proceed Date (the request''s creation date) + this many days; 0 means no floor. Written only by purchasing_set_number().';

-- ---------------------------------------------------------------------
-- 3. The write door — 0303's body, plus the one key
-- ---------------------------------------------------------------------
create or replace function public.purchasing_set_number(
  p_key   text,
  p_value int
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  int;
begin
  if p_value is null then
    raise exception 'value_required' using errcode = '22023';
  end if;

  -- The key list is closed HERE as well as in the shared TS constant
  -- (PURCHASING_NUMBER_KEYS): a typo must be refused by the database, not
  -- only by the browser.
  if p_key not in (
    'order_by_buffer_days',
    'earliest_sell_days',
    'logistics_call_working_days',
    'manual_purchase_min_delivery_days'
  ) then
    raise exception 'unknown_setting' using errcode = '22023', detail = p_key;
  end if;

  select case p_key
           when 'order_by_buffer_days'              then order_by_buffer_days
           when 'earliest_sell_days'                then earliest_sell_days
           when 'logistics_call_working_days'       then logistics_call_working_days
           when 'manual_purchase_min_delivery_days' then manual_purchase_min_delivery_days
         end
    into v_old
    from purchasing_settings where id = 1;

  update purchasing_settings
     set order_by_buffer_days = case when p_key = 'order_by_buffer_days'
                                     then p_value else order_by_buffer_days end,
         earliest_sell_days = case when p_key = 'earliest_sell_days'
                                   then p_value else earliest_sell_days end,
         logistics_call_working_days = case when p_key = 'logistics_call_working_days'
                                            then p_value else logistics_call_working_days end,
         manual_purchase_min_delivery_days = case when p_key = 'manual_purchase_min_delivery_days'
                                                  then p_value else manual_purchase_min_delivery_days end,
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1;

  -- The CHECK constraints are the range rules; letting them raise keeps
  -- ONE definition of "a legal number" instead of a second copy here.

  perform purchasing_record_change(
    v_role, p_key, null, null, v_old::text, p_value::text,
    format('Purchasing setting · %s %s -> %s', p_key, coalesce(v_old::text, '-'), p_value));
end;
$function$;

-- Grants unchanged from 0303 (create or replace keeps them); restated so
-- this file is honest on its own.
revoke all on function public.purchasing_set_number(text, int) from public;
revoke all on function public.purchasing_set_number(text, int) from anon;
grant execute on function public.purchasing_set_number(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Sanity — flags set inside the block, asserted outside any handler
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_column_exists  boolean;
  v_switch_fn      boolean;
  v_check_exists   boolean;
  v_body_has_key   boolean;
  v_anon_exec      boolean;
  v_auth_exec      boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'purchasing_settings'
       and column_name = 'manual_purchase_min_delivery_days'
  ) into v_column_exists;
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'purchasing_set_switch'
  ) into v_switch_fn;
  select exists (
    select 1 from pg_constraint
     where conname = 'purchasing_settings_manual_purchase_min_delivery_days_check'
       and conrelid = 'public.purchasing_settings'::regclass
  ) into v_check_exists;
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'purchasing_set_number'
       and p.prosrc like '%manual_purchase_min_delivery_days%'
  ) into v_body_has_key;
  select has_function_privilege('anon', 'public.purchasing_set_number(text, int)', 'execute')
    into v_anon_exec;
  select has_function_privilege('authenticated', 'public.purchasing_set_number(text, int)', 'execute')
    into v_auth_exec;

  if not v_column_exists then
    raise exception '0423: purchasing_settings.manual_purchase_min_delivery_days is missing';
  end if;
  if v_switch_fn then
    raise exception '0423: purchasing_set_switch() is still there';
  end if;
  if not v_check_exists then
    raise exception '0423: the 0..365 CHECK on manual_purchase_min_delivery_days is missing';
  end if;
  if not v_body_has_key then
    raise exception '0423: purchasing_set_number() does not know the new key';
  end if;
  if v_anon_exec then
    raise exception '0423: anon may execute purchasing_set_number';
  end if;
  if not v_auth_exec then
    raise exception '0423: authenticated may not execute purchasing_set_number';
  end if;
end;
$sanity$;
