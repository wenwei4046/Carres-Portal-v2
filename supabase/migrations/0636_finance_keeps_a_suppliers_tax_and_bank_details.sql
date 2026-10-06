-- =============================================================================
-- 0636_finance_keeps_a_suppliers_tax_and_bank_details.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Finance pays suppliers, but nowhere in the portal keeps a supplier's tax
--   number, registration number or bank account. public.suppliers holds
--   Purchasing's facts only (name, contact, kind, address, channels).
--
--   Chew (Finance) ruled on 2026-10-03 that Finance keeps these as its OWN
--   record, linked to Purchasing's supplier, without changing any Purchasing
--   screen (docs/finance/MASTER.md §3.2).
--
-- WHAT THIS CHANGES
--   1. public.finance_supplier_profiles: one optional row per supplier with
--      tax_no, registration_no, bank_name, bank_account_no and
--      bank_account_holder. The supplier itself stays Purchasing's record.
--   2. finance_supplier_profile_save(...): the one door that writes it.
--      Finance or principal only.
--   3. finance_supplier_list(): every supplier with its Finance details, for
--      Finance's Suppliers page.
--
-- RULES
--   - An account number is 6 to 20 digits. Spaces and dashes typed with it
--     are dropped, the same shape as dealers_bank_account_no_format (0598).
--   - An account number needs its bank name.
--   - Blank text is stored as no value.
--
-- RLS: the table is read through gl_may_read() and written only by the door.
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

create table public.finance_supplier_profiles (
  supplier_id          uuid primary key references public.suppliers(id),
  tax_no               text check (tax_no is null or length(btrim(tax_no)) between 1 and 40),
  registration_no      text check (registration_no is null or length(btrim(registration_no)) between 1 and 60),
  bank_name            text check (bank_name is null or length(btrim(bank_name)) between 1 and 100),
  bank_account_no      text check (bank_account_no is null or bank_account_no ~ '^[0-9]{6,20}$'),
  bank_account_holder  text check (bank_account_holder is null or length(btrim(bank_account_holder)) between 1 and 200),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references public.app_users(id),
  constraint finance_supplier_profiles_account_needs_bank
    check (bank_account_no is null or bank_name is not null)
);

comment on table public.finance_supplier_profiles is
  '0636: Finance''s own tax and bank details for a supplier (Chew 2026-10-03). The supplier stays Purchasing''s record.';

alter table public.finance_supplier_profiles enable row level security;
revoke all on public.finance_supplier_profiles from anon, authenticated;
grant select on public.finance_supplier_profiles to authenticated;
create policy finance_supplier_profiles_read_finance
  on public.finance_supplier_profiles for select using ((select public.gl_may_read()));

-- ── the one door that writes ────────────────────────────────────────────────
create or replace function public.finance_supplier_profile_save(
  p_supplier_id          uuid,
  p_tax_no               text,
  p_registration_no      text,
  p_bank_name            text,
  p_bank_account_no      text,
  p_bank_account_holder  text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role    text := public.app_role()::text;
  v_tax     text := nullif(btrim(coalesce(p_tax_no, '')), '');
  v_reg     text := nullif(btrim(coalesce(p_registration_no, '')), '');
  v_bank    text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_account text := nullif(regexp_replace(coalesce(p_bank_account_no, ''), '[\s-]', '', 'g'), '');
  v_holder  text := nullif(btrim(coalesce(p_bank_account_holder, '')), '');
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance edits a supplier''s finance details.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id) then
    raise exception 'That supplier does not exist.'
      using errcode = 'P0002', detail = 'supplier_missing';
  end if;
  if v_tax is not null and length(v_tax) > 40 then
    raise exception 'The tax number is too long.'
      using errcode = '22023', detail = 'tax_no_invalid';
  end if;
  if v_reg is not null and length(v_reg) > 60 then
    raise exception 'The registration number is too long.'
      using errcode = '22023', detail = 'registration_no_invalid';
  end if;
  if v_bank is not null and length(v_bank) > 100 then
    raise exception 'The bank name is too long.'
      using errcode = '22023', detail = 'bank_name_invalid';
  end if;
  if v_account is not null and v_account !~ '^[0-9]{6,20}$' then
    raise exception 'An account number is 6 to 20 digits.'
      using errcode = '22023', detail = 'account_no_invalid';
  end if;
  if v_account is not null and v_bank is null then
    raise exception 'Choose the bank for this account number.'
      using errcode = '22023', detail = 'bank_name_missing';
  end if;
  if v_holder is not null and length(v_holder) > 200 then
    raise exception 'The account holder''s name is too long.'
      using errcode = '22023', detail = 'account_holder_invalid';
  end if;

  insert into public.finance_supplier_profiles as p
         (supplier_id, tax_no, registration_no, bank_name, bank_account_no,
          bank_account_holder, updated_at, updated_by)
  values (p_supplier_id, v_tax, v_reg, v_bank, v_account, v_holder, now(), auth.uid())
  on conflict (supplier_id) do update
     set tax_no              = excluded.tax_no,
         registration_no     = excluded.registration_no,
         bank_name           = excluded.bank_name,
         bank_account_no     = excluded.bank_account_no,
         bank_account_holder = excluded.bank_account_holder,
         updated_at          = excluded.updated_at,
         updated_by          = excluded.updated_by;
  return p_supplier_id;
end;
$fn$;

revoke all on function public.finance_supplier_profile_save(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.finance_supplier_profile_save(uuid, text, text, text, text, text) to authenticated;

-- ── the read for Finance's Suppliers page ───────────────────────────────────
create or replace function public.finance_supplier_list()
returns table (
  supplier_id          uuid,
  name                 text,
  kind                 text,
  tax_no               text,
  registration_no      text,
  bank_name            text,
  bank_account_no      text,
  bank_account_holder  text,
  updated_at           timestamptz,
  updated_by_name      text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'Supplier finance details are internal.'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return query
    select s.id, s.name, s.kind::text,
           p.tax_no, p.registration_no, p.bank_name, p.bank_account_no,
           p.bank_account_holder, p.updated_at, u.name
      from public.suppliers s
      left join public.finance_supplier_profiles p on p.supplier_id = s.id
      left join public.app_users u on u.id = p.updated_by
     order by s.name, s.id;
end;
$fn$;

revoke all on function public.finance_supplier_list() from public, anon;
grant execute on function public.finance_supplier_list() to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_table_privilege('anon', 'public.finance_supplier_profiles', 'select')
     or has_table_privilege('authenticated', 'public.finance_supplier_profiles', 'insert')
     or has_table_privilege('authenticated', 'public.finance_supplier_profiles', 'update')
     or has_table_privilege('authenticated', 'public.finance_supplier_profiles', 'delete') then
    raise exception '0636 sanity: finance_supplier_profiles is open past its door';
  end if;
  if has_function_privilege('anon', 'public.finance_supplier_profile_save(uuid, text, text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.finance_supplier_list()', 'execute') then
    raise exception '0636 sanity: a supplier finance door is open to anon';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.finance_supplier_profiles'::regclass) then
    raise exception '0636 sanity: row level security is off on finance_supplier_profiles';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('finance_supplier_profile_save', 'finance_supplier_list')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0636 sanity: a function lost security definer or its search_path';
  end if;
end
$sanity$;

commit;
