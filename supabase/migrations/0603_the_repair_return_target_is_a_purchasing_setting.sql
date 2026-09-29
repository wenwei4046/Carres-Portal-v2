-- =============================================================================
-- 0603_the_repair_return_target_is_a_purchasing_setting.sql
-- Purchasing MASTER §9.7 ("the governed setting supplies the period") ·
-- 0602 added `purchasing_settings.repair_return_working_days` (int, default 14,
-- CHECK 1..90) and reads it when a Supplier's receipt of a Repair Order is
-- recorded, snapshotting it onto that RO. Nothing could CHANGE it: the one
-- numbers door, `purchasing_set_number`, closes its key list and did not name it.
--
-- WHAT THIS DOES
--   Re-creates `purchasing_set_number(text, int)` exactly as production holds it
--   (measured 2026-09-29) with ONE more key, `repair_return_working_days`. The
--   gate (`purchasing_settings_gate`), the history (`purchasing_record_change`)
--   and the signature are unchanged. The CHECK constraint from 0602 stays the
--   one range rule.
--
-- DELIBERATELY NOT HERE
--   · No existing Repair Order's target moves: each RO keeps the value that
--     applied when Supplier receipt was recorded (0602's snapshot).
--   · No row is rewritten. RLS unchanged. NO ROW COUNT IS ASSERTED.
-- =============================================================================

create or replace function public.purchasing_set_number(p_key text, p_value integer)
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
    'manual_purchase_min_delivery_days',
    'repair_return_working_days'
  ) then
    raise exception 'unknown_setting' using errcode = '22023', detail = p_key;
  end if;

  select case p_key
           when 'order_by_buffer_days'              then order_by_buffer_days
           when 'earliest_sell_days'                then earliest_sell_days
           when 'logistics_call_working_days'       then logistics_call_working_days
           when 'manual_purchase_min_delivery_days' then manual_purchase_min_delivery_days
           when 'repair_return_working_days'        then repair_return_working_days
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
         repair_return_working_days = case when p_key = 'repair_return_working_days'
                                           then p_value else repair_return_working_days end,
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

revoke all on function public.purchasing_set_number(text, integer) from public, anon;
grant execute on function public.purchasing_set_number(text, integer) to authenticated;

-- SANITY — one overload, and it names the new key.
do $sanity$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_set_number';
  if v_n <> 1 then
    raise exception '0603 sanity: purchasing_set_number must have exactly one overload, found %', v_n;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'purchasing_set_number'
                    and p.prosrc like '%repair_return_working_days%') then
    raise exception '0603 sanity: purchasing_set_number does not name repair_return_working_days';
  end if;
end $sanity$;
