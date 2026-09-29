-- =============================================================================
-- 0606_supplier_claim_reply_timing_is_a_purchasing_setting.sql
-- Purchasing MASTER §9.5 "CONFIGURABLE SUPPLIER REPLY TIMING — OWNER-APPROVED /
-- LOCKED, 2026-09-06": `Settings → Purchasing → Supplier Claims` holds
-- `Reply waiting days` and `Extra days before escalation`, both Office working
-- days, approved starting values 2 and 2. APPROVED TARGET / NOT BUILT until now:
-- no table held them.
--
-- WHAT THIS DOES
--   §1 `purchasing_settings.claim_reply_waiting_days` and
--      `claim_escalation_extra_days` (int, not null, default 2, CHECK 1..30).
--   §2 Re-creates `purchasing_set_number(text, int)` exactly as 0603 left it,
--      with the two keys added. Gate, history and signature unchanged.
--
-- DELIBERATELY NOT HERE
--   · How a claim uses them (Reply expected / Reply overdue / escalation Work)
--     and the snapshot that keeps an existing dated obligation from moving are
--     the Supplier Claims lane's.
--   · No row is rewritten beyond the column defaults. RLS unchanged.
--     NO ROW COUNT IS ASSERTED.
-- =============================================================================

-- ── §1 · the two numbers ─────────────────────────────────────────────────────

alter table public.purchasing_settings
  add column if not exists claim_reply_waiting_days int not null default 2,
  add column if not exists claim_escalation_extra_days int not null default 2;

alter table public.purchasing_settings
  drop constraint if exists purchasing_settings_claim_reply_waiting_days_range;
alter table public.purchasing_settings
  add constraint purchasing_settings_claim_reply_waiting_days_range
  check (claim_reply_waiting_days between 1 and 30);
alter table public.purchasing_settings
  drop constraint if exists purchasing_settings_claim_escalation_extra_days_range;
alter table public.purchasing_settings
  add constraint purchasing_settings_claim_escalation_extra_days_range
  check (claim_escalation_extra_days between 1 and 30);

comment on column public.purchasing_settings.claim_reply_waiting_days is
  '0606 · Purchasing §9.5 `Reply waiting days`: Office working days from the recorded supplier request to `Reply expected`. Approved start 2.';
comment on column public.purchasing_settings.claim_escalation_extra_days is
  '0606 · Purchasing §9.5 `Extra days before escalation`: Office working days after a missed reply before Purchasing Approver decision work. Approved start 2.';

-- ── §2 · the one numbers door names them ─────────────────────────────────────

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
    'repair_return_working_days',
    'claim_reply_waiting_days',
    'claim_escalation_extra_days'
  ) then
    raise exception 'unknown_setting' using errcode = '22023', detail = p_key;
  end if;

  select case p_key
           when 'order_by_buffer_days'              then order_by_buffer_days
           when 'earliest_sell_days'                then earliest_sell_days
           when 'logistics_call_working_days'       then logistics_call_working_days
           when 'manual_purchase_min_delivery_days' then manual_purchase_min_delivery_days
           when 'repair_return_working_days'        then repair_return_working_days
           when 'claim_reply_waiting_days'          then claim_reply_waiting_days
           when 'claim_escalation_extra_days'       then claim_escalation_extra_days
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
         claim_reply_waiting_days = case when p_key = 'claim_reply_waiting_days'
                                         then p_value else claim_reply_waiting_days end,
         claim_escalation_extra_days = case when p_key = 'claim_escalation_extra_days'
                                            then p_value else claim_escalation_extra_days end,
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

-- SANITY — one overload, both keys named, both columns present.
do $sanity$
declare v_n int;
begin
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchasing_set_number';
  if v_n <> 1 then
    raise exception '0606 sanity: purchasing_set_number must have exactly one overload, found %', v_n;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'purchasing_set_number'
                    and p.prosrc like '%claim_reply_waiting_days%'
                    and p.prosrc like '%claim_escalation_extra_days%') then
    raise exception '0606 sanity: purchasing_set_number does not name both claim keys';
  end if;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'purchasing_settings'
     and column_name in ('claim_reply_waiting_days', 'claim_escalation_extra_days');
  if v_n <> 2 then
    raise exception '0606 sanity: both claim reply columns must exist';
  end if;
end $sanity$;
