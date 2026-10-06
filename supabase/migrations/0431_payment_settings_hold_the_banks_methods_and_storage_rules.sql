-- ============================================================================
-- 0431 — Payment Settings hold the banks, the methods and the storage rules
--        (docs/payment/MASTER.md §7 · §12 · §16, owner instruction 2026-09-06)
--
-- The MASTER's settings law: `Settings → Payment` owns receiving bank
-- accounts, source-based bank routing, active manual payment methods and
-- effective-dated storage values. Staff must not remember, choose or type a
-- bank account ad hoc; account details live in Settings, never hard-coded
-- message text. Storage Start snapshots the then-effective rule; later
-- changes never recalculate old cases.
--
-- Measured before this migration: no payment settings storage exists at all —
-- no bank account record, no method activation, no storage rule row. The §7
-- rates live only in documentation.
--
--   §1  payment_bank_accounts — one row per governed routing source
--       (PJ own-showroom → Hong Leong Bank · Dealer → RHB). The BANK is
--       approved truth and seeded; the account name/number are the manager's
--       to enter — nothing here invents an account number.
--   §2  payment_manual_methods — the §16 manual methods with Active flags.
--       `online` is provider-recorded and deliberately absent.
--   §3  payment_storage_rules — append-only, effective-dated §7 values,
--       seeded with the approved rates (14 days free; RM150/30d with
--       Operation day 21 / Storage Waiver Approver day 30 for
--       mattress/bedframe; RM200/14d, no extra free, for sofa; inspection
--       every 30 days).
--   §4  payment_setting_changes + the manager gate + setter doors
-- ============================================================================

begin;

set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 1 · receiving bank accounts, keyed by the governed routing source
-- ---------------------------------------------------------------------------

create table if not exists public.payment_bank_accounts (
  route_source text primary key check (route_source in ('pj_showroom', 'dealer')),
  bank_name text not null,
  account_name text,
  account_no text,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

comment on table public.payment_bank_accounts is
  '0431: the configured receiving account per governed order source (payment/MASTER.md §16). The system selects the bank from the source; staff never choose or type an account ad hoc.';

insert into public.payment_bank_accounts (route_source, bank_name)
values ('pj_showroom', 'Hong Leong Bank'), ('dealer', 'RHB')
on conflict (route_source) do nothing;

alter table public.payment_bank_accounts enable row level security;
drop policy if exists payment_bank_accounts_read on public.payment_bank_accounts;
create policy payment_bank_accounts_read on public.payment_bank_accounts
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_bank_accounts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2 · the manual methods and their Active flags
-- ---------------------------------------------------------------------------

create table if not exists public.payment_manual_methods (
  method text primary key check (method in
    ('bank', 'duitnow_qr', 'cheque', 'cash', 'credit_card', 'debit_card')),
  active boolean not null default true,
  sort int not null,
  updated_by uuid references public.app_users(id),
  updated_at timestamptz not null default now()
);

comment on table public.payment_manual_methods is
  '0431: the §16 manual payment methods. Only Active methods are selectable; online payment is provider-recorded and never a manual method, so it has no row.';

insert into public.payment_manual_methods (method, sort) values
  ('bank', 1), ('duitnow_qr', 2), ('cheque', 3), ('cash', 4),
  ('credit_card', 5), ('debit_card', 6)
on conflict (method) do nothing;

alter table public.payment_manual_methods enable row level security;
drop policy if exists payment_manual_methods_read on public.payment_manual_methods;
create policy payment_manual_methods_read on public.payment_manual_methods
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_manual_methods from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3 · the effective-dated storage rules (§7, approved values seeded)
-- ---------------------------------------------------------------------------

create table if not exists public.payment_storage_rules (
  id uuid primary key default gen_random_uuid(),
  product_group text not null check (product_group in ('mattress_bedframe', 'sofa')),
  free_days int not null check (free_days between 0 and 365),
  charge_amount numeric(12,2) not null check (charge_amount >= 0),
  cycle_days int not null check (cycle_days between 1 and 365),
  operation_limit_day int check (operation_limit_day between 0 and 365),
  waiver_limit_day int check (waiver_limit_day between 0 and 365),
  extra_free_allowed boolean not null,
  inspection_days int not null check (inspection_days between 1 and 365),
  effective_from date not null,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  constraint payment_storage_limits_ordered check (
    operation_limit_day is null or waiver_limit_day is null
    or (free_days <= operation_limit_day and operation_limit_day <= waiver_limit_day)
  )
);

comment on table public.payment_storage_rules is
  '0431: append-only effective-dated storage values per product group (payment/MASTER.md §7 · §12). The newest effective row rules a NEW Storage Start; an existing case keeps the snapshot it started under, forever.';

create index if not exists payment_storage_rules_group_idx
  on public.payment_storage_rules (product_group, effective_from desc);

insert into public.payment_storage_rules
  (product_group, free_days, charge_amount, cycle_days, operation_limit_day,
   waiver_limit_day, extra_free_allowed, inspection_days, effective_from)
select 'mattress_bedframe', 14, 150, 30, 21, 30, true, 30, current_date
 where not exists (select 1 from public.payment_storage_rules where product_group = 'mattress_bedframe');
insert into public.payment_storage_rules
  (product_group, free_days, charge_amount, cycle_days, operation_limit_day,
   waiver_limit_day, extra_free_allowed, inspection_days, effective_from)
select 'sofa', 14, 200, 14, null, null, false, 30, current_date
 where not exists (select 1 from public.payment_storage_rules where product_group = 'sofa');

alter table public.payment_storage_rules enable row level security;
drop policy if exists payment_storage_rules_read on public.payment_storage_rules;
create policy payment_storage_rules_read on public.payment_storage_rules
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_storage_rules from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4 · the change log, the manager gate and the setter doors
-- ---------------------------------------------------------------------------

create table if not exists public.payment_setting_changes (
  id uuid primary key default gen_random_uuid(),
  what text not null,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid references public.app_users(id),
  changed_at timestamptz not null default now()
);

comment on table public.payment_setting_changes is
  '0431: every Payment settings change keeps old/new, actor and time (payment/MASTER.md §12).';

alter table public.payment_setting_changes enable row level security;
drop policy if exists payment_setting_changes_read on public.payment_setting_changes;
create policy payment_setting_changes_read on public.payment_setting_changes
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_setting_changes from authenticated, anon;

/** The same manager authority Purchasing Settings uses (0303): principal, or
 *  the ops_manager position duty. */
create or replace function public.payment_settings_gate()
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
        detail = 'payment settings are set by the manager';
    end if;
  end if;
end;
$fn$;

create or replace function public.payment_set_bank_account(
  p_route_source text,
  p_bank_name text,
  p_account_name text,
  p_account_no text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old payment_bank_accounts;
  v_new payment_bank_accounts;
begin
  perform public.payment_settings_gate();
  if p_route_source not in ('pj_showroom', 'dealer') then
    raise exception 'unknown order source' using errcode = '22023', detail = 'bad_route_source';
  end if;
  if nullif(btrim(coalesce(p_bank_name, '')), '') is null then
    raise exception 'the bank name is required' using errcode = '22023', detail = 'bank_required';
  end if;
  select * into v_old from payment_bank_accounts where route_source = p_route_source for update;
  update payment_bank_accounts
     set bank_name = btrim(p_bank_name),
         account_name = nullif(btrim(coalesce(p_account_name, '')), ''),
         account_no = nullif(btrim(coalesce(p_account_no, '')), ''),
         updated_by = auth.uid(), updated_at = now()
   where route_source = p_route_source
   returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('bank_account:' || p_route_source, to_jsonb(v_old), to_jsonb(v_new), auth.uid());
  return to_jsonb(v_new);
end;
$fn$;

create or replace function public.payment_set_method_active(
  p_method text,
  p_active boolean
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old payment_manual_methods;
  v_new payment_manual_methods;
begin
  perform public.payment_settings_gate();
  select * into v_old from payment_manual_methods where method = p_method for update;
  if not found then
    raise exception 'unknown payment method' using errcode = '22023', detail = 'bad_method';
  end if;
  if p_active is null then
    raise exception 'say Active yes or no' using errcode = '22023', detail = 'bad_active';
  end if;
  if v_old.active and not p_active
     and (select count(*) from payment_manual_methods where active) <= 1 then
    raise exception 'at least one manual method must stay Active'
      using errcode = '22023', detail = 'last_method';
  end if;
  update payment_manual_methods
     set active = p_active, updated_by = auth.uid(), updated_at = now()
   where method = p_method
   returning * into v_new;
  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('manual_method:' || p_method, to_jsonb(v_old), to_jsonb(v_new), auth.uid());
  return to_jsonb(v_new);
end;
$fn$;

create or replace function public.payment_set_storage_rule(
  p_product_group text,
  p_free_days int,
  p_charge_amount numeric,
  p_cycle_days int,
  p_operation_limit_day int,
  p_waiver_limit_day int,
  p_extra_free_allowed boolean,
  p_inspection_days int,
  p_effective_from date
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
  insert into payment_setting_changes (what, old_value, new_value, actor_id)
  values ('storage_rule:' || p_product_group, to_jsonb(v_old), to_jsonb(v_new), auth.uid());
  return to_jsonb(v_new);
end;
$fn$;

revoke all on function public.payment_settings_gate() from public, anon;
grant execute on function public.payment_settings_gate() to authenticated;
revoke all on function public.payment_set_bank_account(text, text, text, text) from public, anon;
grant execute on function public.payment_set_bank_account(text, text, text, text) to authenticated;
revoke all on function public.payment_set_method_active(text, boolean) from public, anon;
grant execute on function public.payment_set_method_active(text, boolean) to authenticated;
revoke all on function public.payment_set_storage_rule(text, int, numeric, int, int, int, boolean, int, date) from public, anon;
grant execute on function public.payment_set_storage_rule(text, int, numeric, int, int, int, boolean, int, date) to authenticated;

-- Sanity asserts this migration's OWN seeds landed (red line 8: never a
-- production row count — these are the configuration rows written above).
do $$
begin
  if not exists (select 1 from payment_bank_accounts where route_source = 'pj_showroom')
     or not exists (select 1 from payment_bank_accounts where route_source = 'dealer') then
    raise exception 'sanity: a governed routing source has no receiving account row';
  end if;
  if (select count(*) from payment_manual_methods) < 6 then
    raise exception 'sanity: the six §16 manual methods were not seeded';
  end if;
  if not exists (select 1 from payment_storage_rules where product_group = 'mattress_bedframe')
     or not exists (select 1 from payment_storage_rules where product_group = 'sofa') then
    raise exception 'sanity: a product group has no storage rule';
  end if;
end $$;

commit;
