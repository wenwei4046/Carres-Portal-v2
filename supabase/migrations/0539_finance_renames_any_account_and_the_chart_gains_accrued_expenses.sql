-- 0539 — Finance renames any account, and the chart gains 2130 Accrued expenses.
--
-- 1. gl_account_rename(code, name): the chart-of-accounts tab on Finance
--    Settings renames an account. Copied from gl_money_account_update (0512,
--    latest body 0525): same NULL-safe finance/principal gate, same row lock,
--    same name checks. Only the name changes. The code never changes, because
--    gl_entry_lines.account_code points at it (0462) and a used code stays
--    ("Rename it, yes. Retire it, no.", 0462). Entries store only the code and
--    read the name when shown, so a rename reads through everywhere at once.
--    No two accounts in the chart may share a name, so a picker never shows
--    two lines that read the same.
--
-- 2. 2130 Accrued expenses: a non-control liability under 2100 Payables. A
--    month-end accrual is a manual journal Dr expense / Cr 2130, cleared later
--    by a voucher direct line Dr 2130 / Cr bank. 2130 is free in every earlier
--    migration. `on conflict do nothing`: an existing 2130 is never overwritten.
--    2100 is a header, which gl_post refuses, so it has no posted lines and the
--    0462 trigger lets it gain this child.
--
-- No table, RLS policy or existing function changes. Run it after 0525.

insert into public.gl_accounts (code, name, kind, parent_code, is_active, is_control, control_for)
values ('2130', 'Accrued expenses', 'LIABILITY', '2100', true, false, null)
on conflict (code) do nothing;

create or replace function public.gl_account_rename(p_code text, p_name text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_old  text;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select a.name into v_old from public.gl_accounts a where a.code = p_code for update;
  if not found then
    raise exception 'That account is not in the chart.'
      using errcode = 'P0002', detail = 'account_missing';
  end if;
  if v_name = '' then
    raise exception 'Type the account name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if length(v_name) > 60 then
    raise exception 'Keep the name to 60 characters.'
      using errcode = '22023', detail = 'name_too_long';
  end if;
  if exists (select 1 from public.gl_accounts a
              where lower(a.name) = lower(v_name) and a.code <> p_code) then
    raise exception 'An account named % is already in the chart.', v_name
      using errcode = '22023', detail = 'name_exists';
  end if;

  if v_name is distinct from v_old then
    update public.gl_accounts set name = v_name where code = p_code;
  end if;
  return p_code;
end;
$fn$;

comment on function public.gl_account_rename(text, text) is
  '0539: renames one account in the chart. The code never changes. Finance or principal.';
revoke all on function public.gl_account_rename(text, text) from public, anon;
grant execute on function public.gl_account_rename(text, text) to authenticated;

do $sanity$
begin
  if has_function_privilege('anon', 'public.gl_account_rename(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_account_rename(text, text)', 'execute') then
    raise exception '0539 sanity: gl_account_rename grants are wrong';
  end if;
  if not exists (select 1 from public.gl_accounts where code = '2130') then
    raise exception '0539 sanity: 2130 is missing';
  end if;
end $sanity$;
