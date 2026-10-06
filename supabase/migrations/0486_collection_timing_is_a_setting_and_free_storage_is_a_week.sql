-- ============================================================================
-- 0486 — Collection timing is a setting, free storage is a week, and the
--        unpaid-delivery approval door is shut in the database too
--        (docs/payment/MASTER.md §3 · §7 · §12, owner ruling 2026-09-12)
--
-- The 2026-09-12 owner ruling on Payment:
--
--   §1  `Settings → Payments → Collection timing` — `Start asking the customer
--       to pay {n} working days before Confirmed Delivery` and `Payment must be
--       complete {m} working days before`. Effective-dated and append-only, so
--       an existing collection clock keeps the rule it started under and a new
--       rule affects only new clocks. Seeded with the 2026-08-19 ruling's own
--       pair (3 · 2), effective from that ruling's date. Asking must start
--       EARLIER than the deadline (n > m).
--   §2  Every Payment settings change now records its REASON and the date it
--       takes effect beside old/new/actor/time — the storage-rule door gains
--       `p_reason`; the old nine-argument signature is dropped so there is one
--       door, not two.
--   §3  Mattress/Bedframe automatic free storage is 7 calendar days (was 14).
--       A NEW effective row is appended for today; existing cases keep the
--       snapshot they started under (0436 — never recalculated). The change
--       is recorded in payment_setting_changes with the ruling as its reason.
--       Sofa is unchanged (14 days · RM200 per 14 days · no extra free).
--   §4  There is no live unpaid-delivery approval or Payment Exception release
--       door. PR #1031 removed it from the screen; this migration removes the
--       EXECUTE grant from the two 0362 RPCs so a direct PostgREST call cannot
--       raise or decide one either. The table, its rows and the 0362 gate's
--       reading of an approval granted BEFORE this date are untouched —
--       history honoured, not a live path. Restoring the door is a re-grant.
--
-- Measured before writing (production, 2026-09-12): payment_storage_rules
-- holds one row per group (mattress_bedframe 14/150/30/21/30 effective
-- 2026-09-06; sofa 14/200/14 effective 2026-09-06); 0 storage cases;
-- 0 order_delivery_payment_approvals rows; no collection-timing storage
-- exists anywhere — the pair lives in code (`collection-clock.ts`).
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · every settings change carries its reason and effective date
-- ---------------------------------------------------------------------------

alter table public.payment_setting_changes
  add column if not exists reason text,
  add column if not exists effective_from date;

comment on column public.payment_setting_changes.reason is
  '0486: why the manager changed the value (owner ruling 2026-09-12 — old value · new value · effective from · changed by · changed on · reason).';
comment on column public.payment_setting_changes.effective_from is
  '0486: the date the new value takes effect; clocks and cases that started before it keep their snapshot.';

-- ---------------------------------------------------------------------------
-- 2 · collection timing — append-only, effective-dated
-- ---------------------------------------------------------------------------

create table if not exists public.payment_collection_timing_rules (
  id uuid primary key default gen_random_uuid(),
  ask_days_before int not null check (ask_days_before between 0 and 60),
  deadline_days_before int not null check (deadline_days_before between 0 and 60),
  effective_from date not null,
  reason text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  -- Asking starts EARLIER than the deadline: more working days before delivery.
  constraint payment_collection_timing_ask_before_deadline
    check (ask_days_before > deadline_days_before)
);

comment on table public.payment_collection_timing_rules is
  '0486: Settings → Payments → Collection timing (payment/MASTER.md §3 · §12). Append-only and effective-dated: the newest row whose effective_from is on or before a clock''s start day rules that clock; an existing clock keeps its snapshot by construction.';

create index if not exists payment_collection_timing_rules_effective_idx
  on public.payment_collection_timing_rules (effective_from desc);

-- The 2026-08-19 ruling's own pair, effective from the day it was ruled, so
-- every clock that exists today reads exactly the rule it has always read.
insert into public.payment_collection_timing_rules
  (ask_days_before, deadline_days_before, effective_from, reason)
select 3, 2, date '2026-08-19', 'Owner ruling 2026-08-19 — T−3 attention, T−2 deadline'
 where not exists (select 1 from public.payment_collection_timing_rules);

alter table public.payment_collection_timing_rules enable row level security;
drop policy if exists payment_collection_timing_rules_read on public.payment_collection_timing_rules;
create policy payment_collection_timing_rules_read on public.payment_collection_timing_rules
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_collection_timing_rules from authenticated, anon;

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
  if p_effective_from is null or p_effective_from < current_date then
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

-- ---------------------------------------------------------------------------
-- 3 · the storage-rule door records its reason — ONE signature
-- ---------------------------------------------------------------------------

drop function if exists public.payment_set_storage_rule(text, int, numeric, int, int, int, boolean, int, date);

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
  if p_effective_from is null or p_effective_from < current_date then
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

-- ---------------------------------------------------------------------------
-- 4 · Mattress/Bedframe: automatic free storage is 7 calendar days
-- ---------------------------------------------------------------------------

do $$
declare
  v_old payment_storage_rules;
  v_new payment_storage_rules;
begin
  select * into v_old from payment_storage_rules
   where product_group = 'mattress_bedframe'
   order by effective_from desc, created_at desc limit 1;
  if v_old.id is null then
    raise exception 'sanity: mattress_bedframe has no storage rule to amend';
  end if;
  if v_old.free_days <> 7 then
    insert into payment_storage_rules
      (product_group, free_days, charge_amount, cycle_days, operation_limit_day,
       waiver_limit_day, extra_free_allowed, inspection_days, effective_from)
    values
      ('mattress_bedframe', 7, v_old.charge_amount, v_old.cycle_days,
       v_old.operation_limit_day, v_old.waiver_limit_day, v_old.extra_free_allowed,
       v_old.inspection_days, current_date)
    returning * into v_new;
    insert into payment_setting_changes (what, old_value, new_value, actor_id, reason, effective_from)
    values ('storage_rule:mattress_bedframe', to_jsonb(v_old), to_jsonb(v_new), null,
            'Owner ruling 2026-09-12 — Mattress/Bedframe automatic free storage is 7 calendar days',
            current_date);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · the unpaid-delivery approval door is shut — no live bypass
-- ---------------------------------------------------------------------------

revoke execute on function public.delivery_payment_approval_request(uuid, text) from authenticated;
revoke execute on function public.delivery_payment_approval_decide(uuid, text, text) from authenticated;

comment on function public.delivery_payment_approval_request(uuid, text) is
  '0486: RETIRED as a live door (owner ruling 2026-09-12 — money in full before delivery; no live unpaid-delivery approval). EXECUTE revoked from authenticated; kept so the 0362 gate still honours an approval granted before the door closed.';
comment on function public.delivery_payment_approval_decide(uuid, text, text) is
  '0486: RETIRED as a live door (owner ruling 2026-09-12). EXECUTE revoked from authenticated.';

-- ---------------------------------------------------------------------------
-- sanity
-- ---------------------------------------------------------------------------

do $$
declare
  v_rule payment_storage_rules;
begin
  if not exists (select 1 from payment_collection_timing_rules) then
    raise exception 'sanity: no collection timing rule';
  end if;
  select * into v_rule from payment_storage_rules
   where product_group = 'mattress_bedframe'
   order by effective_from desc, created_at desc limit 1;
  if v_rule.free_days <> 7 then
    raise exception 'sanity: mattress_bedframe free days are %, not 7', v_rule.free_days;
  end if;
  if has_function_privilege('authenticated', 'public.delivery_payment_approval_request(uuid, text)', 'EXECUTE') then
    raise exception 'sanity: the approval request door is still open';
  end if;
  if not has_function_privilege('authenticated', 'public.payment_set_collection_timing(int, int, date, text)', 'EXECUTE') then
    raise exception 'sanity: the collection timing door is not granted';
  end if;
end $$;

commit;
