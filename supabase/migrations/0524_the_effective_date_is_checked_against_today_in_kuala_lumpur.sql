-- =============================================================================
-- 0524_the_effective_date_is_checked_against_today_in_kuala_lumpur.sql
-- =============================================================================
-- WHAT WAS WRONG
--   payment_set_collection_timing and payment_set_storage_rule (0486) refuse
--   an effective date before today with `p_effective_from < current_date`.
--   current_date is the database clock's day, and on Supabase that clock is
--   UTC. Kuala Lumpur is eight hours ahead, so from 00:00 to 08:00 KL the
--   database still thinks it is yesterday and accepts yesterday's date. The
--   screens read today in KL (appTodayIso), and every other dated door in
--   this schema compares with (timezone('Asia/Kuala_Lumpur', now()))::date.
--
-- WHAT THIS CHANGES
--   Both functions, each redefined from its 0486 body with current_date
--   replaced by KL today in the refusal. Nothing else moves: same sentence,
--   same errcode and detail, same grants. The 0486 seed rows that stamped
--   current_date are history and are not touched.
-- =============================================================================

create or replace function public.payment_set_collection_timing(
  p_ask_days_before int,
  p_deadline_days_before int,
  p_effective_from date,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old payment_collection_timing_rules;
  v_new payment_collection_timing_rules;
begin
  perform public.payment_settings_gate();
  if p_ask_days_before is null or p_deadline_days_before is null then
    raise exception 'both numbers are required' using errcode = '22023', detail = 'missing_days';
  end if;
  if p_ask_days_before <= p_deadline_days_before then
    raise exception 'asking must start earlier than the payment deadline'
      using errcode = '22023', detail = 'ask_not_before_deadline';
  end if;
  if p_effective_from is null or p_effective_from < (timezone('Asia/Kuala_Lumpur', now()))::date then  -- 0524: KL today, not the UTC clock
    raise exception 'the effective date must be today or later'
      using errcode = '22023', detail = 'bad_effective_from';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  select * into v_old from payment_collection_timing_rules
   order by effective_from desc, created_at desc limit 1;
  insert into payment_collection_timing_rules
    (ask_days_before, deadline_days_before, effective_from, reason, created_by)
  values (p_ask_days_before, p_deadline_days_before, p_effective_from, btrim(p_reason), auth.uid())
  returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id, reason, effective_from)
  values ('collection_timing', to_jsonb(v_old), to_jsonb(v_new), auth.uid(), btrim(p_reason), p_effective_from);
  return to_jsonb(v_new);
end;
$fn$;

revoke all on function public.payment_set_collection_timing(int, int, date, text) from public, anon;
grant execute on function public.payment_set_collection_timing(int, int, date, text) to authenticated;

create or replace function public.payment_set_storage_rule(
  p_product_group text,
  p_free_days int,
  p_charge_amount numeric,
  p_cycle_days int,
  p_operation_limit_day int,
  p_waiver_limit_day int,
  p_extra_free_allowed boolean,
  p_inspection_days int,
  p_effective_from date,
  p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old payment_storage_rules;
  v_new payment_storage_rules;
begin
  perform public.payment_settings_gate();
  if p_product_group not in ('mattress_bedframe', 'sofa') then
    raise exception 'unknown product group' using errcode = '22023', detail = 'bad_group';
  end if;
  if p_effective_from is null or p_effective_from < (timezone('Asia/Kuala_Lumpur', now()))::date then  -- 0524: KL today, not the UTC clock
    raise exception 'the effective date must be today or later'
      using errcode = '22023', detail = 'bad_effective_from';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  -- Automatic free days ≤ Operation limit ≤ Approver limit, where enabled.
  if p_extra_free_allowed and p_operation_limit_day is not null and p_free_days > p_operation_limit_day then
    raise exception 'free days cannot exceed the Operation limit'
      using errcode = '22023', detail = 'free_over_operation';
  end if;
  if p_extra_free_allowed and p_operation_limit_day is not null and p_waiver_limit_day is not null
     and p_operation_limit_day > p_waiver_limit_day then
    raise exception 'the Operation limit cannot exceed the Approver limit'
      using errcode = '22023', detail = 'operation_over_approver';
  end if;
  select * into v_old from payment_storage_rules
   where product_group = p_product_group
   order by effective_from desc, created_at desc limit 1;
  insert into payment_storage_rules
    (product_group, free_days, charge_amount, cycle_days, operation_limit_day,
     waiver_limit_day, extra_free_allowed, inspection_days, effective_from, created_by)
  values
    (p_product_group, p_free_days, p_charge_amount, p_cycle_days,
     p_operation_limit_day, p_waiver_limit_day, p_extra_free_allowed,
     p_inspection_days, p_effective_from, auth.uid())
  returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id, reason, effective_from)
  values ('storage_rule:' || p_product_group, to_jsonb(v_old), to_jsonb(v_new), auth.uid(),
          btrim(p_reason), p_effective_from);
  return to_jsonb(v_new);
end;
$fn$;

revoke all on function public.payment_set_storage_rule(text, int, numeric, int, int, int, boolean, int, date, text) from public, anon;
grant execute on function public.payment_set_storage_rule(text, int, numeric, int, int, int, boolean, int, date, text) to authenticated;
