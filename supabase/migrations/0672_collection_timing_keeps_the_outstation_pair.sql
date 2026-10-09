-- =============================================================================
-- 0672_collection_timing_keeps_the_outstation_pair.sql
-- =============================================================================
-- WHAT THE OWNER RULED (PAY-04, owner ruling 2026-09-24, confirmed 9 Oct 2026;
-- docs/payment/MASTER.md "Collection timing"):
--   An outstation order's `Payment must be complete` is 3 working days before
--   Scheduled delivery (2 in the Klang Valley). Its ask day follows the same
--   rule as the ordinary pair — asking starts EARLIER than the deadline
--   (n > m) — and its default (4) is an engineering setting, not an owner
--   ruling. Same one clock, same calendar; only the pair differs.
--
-- WHAT WAS WRONG
--   The outstation numbers lived as a constant in the web and shared code
--   (`outstation ? 3 : 2`), a SECOND arithmetic beside the stored, effective-
--   dated Collection timing rule (0486). Settings could not show or change it.
--
-- WHAT THIS CHANGES
--   1 · payment_collection_timing_rules gains the outstation pair. Existing
--       rows take the defaults 4 · 3 (the ruled deadline and the engineering
--       ask day), so every clock that exists today keeps the deadline it
--       already counted. Rule rows stay append-only and effective-dated: a
--       clock runs under the rule in force on the day it started.
--   2 · A new door payment_set_collection_timing(…6 arguments…) records both
--       pairs in one effective-dated row and keeps the change in
--       payment_setting_changes exactly as 0486 does (old · new · effective
--       from · actor · reason). Its gate is the Settings editor gate (0668/
--       0669): Jess, or a person she names for the Payment section.
--   3 · The 0486/0524/0560 four-argument door is kept (no caller is dropped)
--       and now carries the newest outstation pair forward, so a call that
--       only knows the ordinary pair never resets the outstation one to the
--       defaults. Its body is 0560's, its gate is unchanged.
--
-- Schema only. No row is counted, deleted or rewritten beyond the column
-- defaults the two new columns take.
-- =============================================================================

set search_path = public, pg_temp;

alter table public.payment_collection_timing_rules
  add column if not exists outstation_ask_days_before int not null default 4,
  add column if not exists outstation_deadline_days_before int not null default 3;

alter table public.payment_collection_timing_rules
  drop constraint if exists payment_collection_timing_outstation_range;
alter table public.payment_collection_timing_rules
  add constraint payment_collection_timing_outstation_range
    check (outstation_ask_days_before between 0 and 60
           and outstation_deadline_days_before between 0 and 60);

-- Asking starts EARLIER than the outstation deadline, as for the ordinary pair.
alter table public.payment_collection_timing_rules
  drop constraint if exists payment_collection_timing_outstation_ask_before_deadline;
alter table public.payment_collection_timing_rules
  add constraint payment_collection_timing_outstation_ask_before_deadline
    check (outstation_ask_days_before > outstation_deadline_days_before);

comment on column public.payment_collection_timing_rules.outstation_ask_days_before is
  '0672: Start asking an OUTSTATION customer to pay {n} working days before Scheduled delivery (engineering default 4; n > the outstation deadline).';
comment on column public.payment_collection_timing_rules.outstation_deadline_days_before is
  '0672: An OUTSTATION payment must be complete {m} working days before Scheduled delivery (owner ruling 2026-09-24: 3).';

-- ---------------------------------------------------------------------------
-- The door with both pairs (Settings → Payments → Collection timing).
-- ---------------------------------------------------------------------------
create or replace function public.payment_set_collection_timing(
  p_ask_days_before int,
  p_deadline_days_before int,
  p_outstation_ask_days_before int,
  p_outstation_deadline_days_before int,
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
  perform public._settings_require_editor('payment');
  if p_ask_days_before is null or p_deadline_days_before is null
     or p_outstation_ask_days_before is null or p_outstation_deadline_days_before is null then
    raise exception 'all four numbers are required' using errcode = '22023', detail = 'missing_days';
  end if;
  if p_ask_days_before not between 0 and 60 or p_deadline_days_before not between 0 and 60
     or p_outstation_ask_days_before not between 0 and 60 or p_outstation_deadline_days_before not between 0 and 60 then
    raise exception 'each number must be between 0 and 60 working days'
      using errcode = '22023', detail = 'days_out_of_range';
  end if;
  if p_ask_days_before <= p_deadline_days_before then
    raise exception 'asking must start earlier than the payment deadline'
      using errcode = '22023', detail = 'ask_not_before_deadline';
  end if;
  if p_outstation_ask_days_before <= p_outstation_deadline_days_before then
    raise exception 'asking an outstation customer must start earlier than the outstation payment deadline'
      using errcode = '22023', detail = 'outstation_ask_not_before_deadline';
  end if;
  if p_effective_from is null or p_effective_from < (timezone('Asia/Kuala_Lumpur', now()))::date then
    raise exception 'the effective date must be today or later'
      using errcode = '22023', detail = 'bad_effective_from';
  end if;
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  select * into v_old from payment_collection_timing_rules
   order by effective_from desc, created_at desc limit 1;
  insert into payment_collection_timing_rules
    (ask_days_before, deadline_days_before,
     outstation_ask_days_before, outstation_deadline_days_before,
     effective_from, reason, created_by)
  values (p_ask_days_before, p_deadline_days_before,
          p_outstation_ask_days_before, p_outstation_deadline_days_before,
          p_effective_from, btrim(p_reason), auth.uid())
  returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id, reason, effective_from)
  values ('collection_timing', to_jsonb(v_old), to_jsonb(v_new), auth.uid(), btrim(p_reason), p_effective_from);
  return to_jsonb(v_new);
end;
$fn$;

revoke all on function public.payment_set_collection_timing(int, int, int, int, date, text) from public, anon;
grant execute on function public.payment_set_collection_timing(int, int, int, int, date, text) to authenticated;

comment on function public.payment_set_collection_timing(int, int, int, int, date, text) is
  '0672: Settings → Payments → Collection timing with the outstation pair (PAY-04). Effective-dated, append-only; the Settings editor gate (Jess, or a person she names for Payment).';

-- ---------------------------------------------------------------------------
-- The four-argument door (0486 → 0524 → 0560 body): unchanged except that the
-- new row carries the newest outstation pair forward.
-- ---------------------------------------------------------------------------
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
  if coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'a reason is required' using errcode = '22023', detail = 'missing_reason';
  end if;
  select * into v_old from payment_collection_timing_rules
   order by effective_from desc, created_at desc limit 1;
  insert into payment_collection_timing_rules
    (ask_days_before, deadline_days_before,
     outstation_ask_days_before, outstation_deadline_days_before,
     effective_from, reason, created_by)
  values (p_ask_days_before, p_deadline_days_before,
          coalesce(v_old.outstation_ask_days_before, 4),
          coalesce(v_old.outstation_deadline_days_before, 3),
          p_effective_from, btrim(p_reason), auth.uid())
  returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id, reason, effective_from)
  values ('collection_timing', to_jsonb(v_old), to_jsonb(v_new), auth.uid(), btrim(p_reason), p_effective_from);
  return to_jsonb(v_new);
end;
$fn$;

revoke all on function public.payment_set_collection_timing(int, int, date, text) from public, anon;
grant execute on function public.payment_set_collection_timing(int, int, date, text) to authenticated;
