-- =====================================================================
-- 0422 — A Manual Purchase may not ask for goods before they can arrive
-- =====================================================================
-- WHAT THIS DOES
--   Adds one on/off switch to Purchasing Settings:
--     manual_purchase_enforce_earliest_date
--   When it is ON, creating a Manual Purchase with a Delivery Date earlier
--   than the earliest date the picked items can arrive is refused. When it
--   is OFF (the default), the earliest date stays a proposal only — exactly
--   today's behaviour, so applying this migration changes nothing on its
--   own.
--
-- WHY A SWITCH AND NOT A NUMBER (YH, 2026-09-04)
--   The earliest date is already computed from the supplier's production
--   and transit working days (`POST /purchasing/requests/plan`). A second
--   number here would be a second arithmetic for the same fact. The only
--   thing left to decide is whether that computed floor is enforced.
--
-- WHERE THE REFUSAL HAPPENS
--   The API create door (`POST /purchasing/requests`) reads this column and
--   refuses with `delivery_date_before_earliest` before calling the create
--   RPC. The browser mirrors the same refusal under the date field. The
--   arithmetic lives in ONE place (the plan function in the route), so the
--   proposal and the refusal can never disagree.
--
-- HOW IT IS WRITTEN
--   `purchasing_set_switch(p_key, p_value)` — one audited door in the style
--   of `purchasing_set_number()` (0303): the same role gate, the same
--   history row in `purchasing_setting_changes`, the same updated_by/at
--   stamp. The key list is closed here as well as in the shared TypeScript
--   constant, so a later switch reuses the door by adding its key to both.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------
alter table public.purchasing_settings
  add column if not exists manual_purchase_enforce_earliest_date boolean not null default false;

comment on column public.purchasing_settings.manual_purchase_enforce_earliest_date is
  '0422: when true, a Manual Purchase whose Delivery Date is earlier than the earliest date its items can arrive (production + transit working days, the same arithmetic that proposes the date) is refused at creation. Default false: the earliest date is a proposal only. Written only by purchasing_set_switch().';

-- ---------------------------------------------------------------------
-- 2. The write door
-- ---------------------------------------------------------------------
create or replace function public.purchasing_set_switch(
  p_key   text,
  p_value boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := (select public.purchasing_settings_gate());
  v_old  boolean;
begin
  if p_value is null then
    raise exception 'value_required' using errcode = '22023';
  end if;

  -- The key list is closed HERE as well as in the shared TS constant
  -- (PURCHASING_SWITCH_KEYS): a typo must be refused by the database, not
  -- only by the browser. A later switch adds its key to both lists.
  if p_key not in ('manual_purchase_enforce_earliest_date') then
    raise exception 'unknown_setting' using errcode = '22023', detail = p_key;
  end if;

  select case p_key
           when 'manual_purchase_enforce_earliest_date' then manual_purchase_enforce_earliest_date
         end
    into v_old
    from purchasing_settings where id = 1;

  update purchasing_settings
     set manual_purchase_enforce_earliest_date =
           case when p_key = 'manual_purchase_enforce_earliest_date'
                then p_value else manual_purchase_enforce_earliest_date end,
         updated_by = auth.uid(),
         updated_at = now()
   where id = 1;

  perform purchasing_record_change(
    v_role, p_key, null, null, v_old::text, p_value::text,
    format('Purchasing setting · %s %s -> %s', p_key, coalesce(v_old::text, '-'), p_value));
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Grants — both directions, like the neighbours in 0303
-- ---------------------------------------------------------------------
revoke all on function public.purchasing_set_switch(text, boolean) from public;
revoke all on function public.purchasing_set_switch(text, boolean) from anon;
grant execute on function public.purchasing_set_switch(text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Sanity — flags set inside the block, asserted outside any handler
-- ---------------------------------------------------------------------
do $sanity$
declare
  v_column_exists boolean;
  v_anon_exec     boolean;
  v_auth_exec     boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'purchasing_settings'
       and column_name = 'manual_purchase_enforce_earliest_date'
  ) into v_column_exists;
  select has_function_privilege('anon', 'public.purchasing_set_switch(text, boolean)', 'execute')
    into v_anon_exec;
  select has_function_privilege('authenticated', 'public.purchasing_set_switch(text, boolean)', 'execute')
    into v_auth_exec;

  if not v_column_exists then
    raise exception '0422: purchasing_settings.manual_purchase_enforce_earliest_date is missing';
  end if;
  if v_anon_exec then
    raise exception '0422: anon may execute purchasing_set_switch';
  end if;
  if not v_auth_exec then
    raise exception '0422: authenticated may not execute purchasing_set_switch';
  end if;
end;
$sanity$;
