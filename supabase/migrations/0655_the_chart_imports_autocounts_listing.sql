-- =============================================================================
-- 0655_the_chart_imports_autocounts_listing.sql
-- =============================================================================
-- WHAT WAS MISSING
--   0654 makes only the accounts the system posts to. The rest of Chew's chart
--   (accruals by department, fixed assets, every 900- expense ...) is about 250
--   accounts, and it names directors, staff and related companies, so it is
--   never written into this public repository. Typing it in one account at a
--   time on Chart of accounts would take hours and invite mistakes.
--
-- WHAT THIS ADDS
--   gl_chart_import(p_rows, p_apply): the screen reads AutoCount's printed
--   chart (the PDF Chew uploads, read in the browser by
--   packages/shared/src/finance-chart-import.ts) and sends one row per account
--   in the order AutoCount prints them: number, name, the account it is
--   printed under, its section, and its special account type.
--
--   With p_apply false it only answers what an import WOULD do, row by row:
--     create   — a new account, under its printed parent, or under the top
--                heading of its section when it is printed at the margin
--                (the SECTION_* roles 0654 added);
--     exists   — the number is already in the chart; it is left as it is;
--     problem  — and why, in a sentence the screen prints.
--   With p_apply true it writes the "create" rows, in AutoCount's order, so a
--   parent is always made before the accounts under it. An account becomes a
--   heading when an imported account is printed under it.
--
--   It never renames, moves or retires an account already in the chart, never
--   turns an existing account into a heading (an account the ledger posts to
--   would stop taking postings), and never makes a bank, cash or control
--   account: those carry rules the plain chart does not (the money list of
--   0512, the party ledgers), so the row says where to make it instead.
--
-- RLS: unchanged. The function is SECURITY DEFINER, refuses anyone but
--   finance and principal (gl_account_update's gate), and takes the chart lock
--   gl_account_update and gl_account_move take.
-- DATA: none here. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

create or replace function public.gl_chart_import(p_rows jsonb, p_apply boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role     text := public.app_role()::text;
  v_count    integer;
  r          record;
  v_code     text;
  v_name     text;
  v_section  text;
  v_special  text;
  v_kind     text;
  v_top_role text;
  v_parent   text;
  v_reason   text;
  v_acc      public.gl_accounts%rowtype;
  v_other    text;
  -- What this import plans, keyed by number: its kind, or 'problem'.
  v_planned  jsonb := '{}'::jsonb;
  -- Names this import plans to use, lower case -> number.
  v_names    jsonb := '{}'::jsonb;
  v_rows     jsonb := '[]'::jsonb;
  v_created  integer := 0;
  v_existing integer := 0;
  v_problems integer := 0;
  p          jsonb;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'There is no account to import. Pick AutoCount''s chart of accounts.'
      using errcode = '22023', detail = 'rows_missing';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count > 2000 then
    raise exception 'A chart of more than 2,000 accounts is not imported in one go.'
      using errcode = '22023', detail = 'rows_too_many';
  end if;

  perform pg_advisory_xact_lock(hashtext('gl_chart_structure'));

  for r in select e.value as row, e.ordinality as ord
             from jsonb_array_elements(p_rows) with ordinality as e
            order by e.ordinality
  loop
    v_code    := upper(btrim(coalesce(r.row ->> 'code', '')));
    v_name    := regexp_replace(btrim(coalesce(r.row ->> 'name', '')), '\s+', ' ', 'g');
    v_section := upper(regexp_replace(btrim(coalesce(r.row ->> 'section', '')), '\s+', ' ', 'g'));
    v_special := nullif(upper(btrim(coalesce(r.row ->> 'special', ''))), '');
    v_parent  := nullif(upper(btrim(coalesce(r.row ->> 'parentCode', ''))), '');
    v_reason  := null;

    -- AutoCount's sections, and the kind each one is.
    v_kind := case
      when v_section in ('CAPITAL', 'RETAINED EARNING', 'RETAINED EARNINGS', 'RESERVES', 'APPROPRIATION ACCOUNT') then 'EQUITY'
      when v_section in ('FIXED ASSETS', 'OTHER ASSETS', 'CURRENT ASSETS', 'NON-CURRENT ASSETS', 'INVESTMENTS', 'INTANGIBLE ASSETS') then 'ASSET'
      when v_section in ('CURRENT LIABILITIES', 'LONG TERM LIABILITIES', 'NON-CURRENT LIABILITIES', 'OTHER LIABILITIES') then 'LIABILITY'
      when v_section in ('SALES', 'SALES ADJUSTMENT', 'SALES ADJUSTMENTS', 'OTHER INCOME', 'OTHER INCOMES', 'EXTRA-ORDINARY INCOME', 'EXTRAORDINARY INCOME') then 'INCOME'
      when v_section in ('COST OF GOODS SOLD', 'COST OF SALES', 'EXPENSES', 'EXPENSE', 'EXTRA-ORDINARY EXPENSES', 'EXTRAORDINARY EXPENSES', 'TAXATION', 'TAX') then 'EXPENSE'
      else null
    end;
    v_top_role := case
      when v_kind = 'EQUITY'    then 'SECTION_EQUITY'
      when v_kind = 'ASSET'     then 'SECTION_ASSETS'
      when v_kind = 'LIABILITY' then 'SECTION_LIABILITIES'
      when v_kind = 'INCOME'    then 'SECTION_INCOME'
      when v_section in ('COST OF GOODS SOLD', 'COST OF SALES') then 'SECTION_COST_OF_SALES'
      when v_section in ('TAXATION', 'TAX') then 'SECTION_TAX'
      when v_kind = 'EXPENSE'   then 'SECTION_EXPENSES'
    end;

    if v_code !~ '^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$' then
      v_reason := format('%s is not an account number.', coalesce(nullif(v_code, ''), 'A line'));
    elsif v_planned ? v_code then
      v_reason := format('%s is listed twice.', v_code);
    elsif exists (select 1 from public.gl_accounts a where a.code = v_code) then
      v_existing := v_existing + 1;
      select * into v_acc from public.gl_accounts a where a.code = v_code;
      v_planned := v_planned || jsonb_build_object(v_code, v_acc.kind);
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'code', v_code, 'name', v_name, 'parentCode', v_acc.parent_code,
        'status', 'exists', 'reason', null, 'chartName', v_acc.name));
      continue;
    elsif v_name = '' then
      v_reason := format('%s has no name.', v_code);
    elsif length(v_name) > 60 then
      v_reason := format('%s %s is longer than 60 characters.', v_code, v_name);
    elsif v_kind is null then
      v_reason := format('%s %s is under %s, a section the chart does not know.', v_code, v_name, coalesce(nullif(v_section, ''), 'no section'));
    elsif v_special in ('SBK', 'SCH') then
      v_reason := format('%s %s is a bank or cash account. Add it in Money accounts.', v_code, v_name);
    elsif v_special in ('SDC', 'SCC') then
      v_reason := format('%s %s is a debtor or creditor control account, which the system sets up.', v_code, v_name);
    elsif v_special in ('SBS', 'SRE') then
      v_reason := format('%s %s is a stock or retained earnings account, which the system sets up.', v_code, v_name);
    end if;

    -- Where it goes: the account it is printed under, or its section's heading.
    if v_reason is null then
      v_parent := coalesce(v_parent, public.gl_account_for(v_top_role));
      if v_planned ? v_parent then
        if v_planned ->> v_parent = 'problem' then
          v_reason := format('%s %s is under %s, which is not imported.', v_code, v_name, v_parent);
        elsif v_planned ->> v_parent <> v_kind then
          v_reason := format('%s %s is under %s, which is another kind of account.', v_code, v_name, v_parent);
        elsif exists (select 1 from public.gl_accounts a
                       where a.code = v_parent and not a.is_heading) then
          v_reason := format('%s %s is under %s, an account the ledger posts to. Accounts can only go under a heading.', v_code, v_name, v_parent);
        end if;
      else
        select * into v_acc from public.gl_accounts a where a.code = v_parent;
        if not found then
          v_reason := format('%s %s is under %s, which is not in the chart.', v_code, v_name, v_parent);
        elsif not v_acc.is_active then
          v_reason := format('%s %s is under %s, which is retired.', v_code, v_name, v_parent);
        elsif v_acc.kind <> v_kind then
          v_reason := format('%s %s is under %s, which is another kind of account.', v_code, v_name, v_parent);
        elsif not v_acc.is_heading then
          v_reason := format('%s %s is under %s, an account the ledger posts to. Accounts can only go under a heading.', v_code, v_name, v_parent);
        end if;
      end if;
    end if;

    -- gl_account_update's rule: two accounts never share a name.
    if v_reason is null then
      select a.code into v_other from public.gl_accounts a
       where lower(a.name) = lower(v_name) and a.code <> v_code limit 1;
      if v_other is null then
        v_other := v_names ->> lower(v_name);
      end if;
      if v_other is not null then
        v_reason := format('%s: an account named %s is already in the chart (%s).', v_code, v_name, v_other);
      end if;
    end if;

    if v_reason is not null then
      v_problems := v_problems + 1;
      if v_code ~ '^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$' and not (v_planned ? v_code) then
        v_planned := v_planned || jsonb_build_object(v_code, 'problem');
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'code', v_code, 'name', v_name, 'parentCode', v_parent,
        'status', 'problem', 'reason', v_reason, 'chartName', null));
      continue;
    end if;

    v_created := v_created + 1;
    v_planned := v_planned || jsonb_build_object(v_code, v_kind);
    v_names := v_names || jsonb_build_object(lower(v_name), v_code);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'code', v_code, 'name', v_name, 'parentCode', v_parent, 'kind', v_kind,
      'status', 'create', 'reason', null, 'chartName', null));
  end loop;

  if p_apply and v_created > 0 then
    -- AutoCount's order, so every parent is in the chart before the accounts
    -- under it. A row becomes a heading when an imported row is under it.
    for p in select value from jsonb_array_elements(v_rows) where value ->> 'status' = 'create'
    loop
      insert into public.gl_accounts (code, name, kind, parent_code, is_heading, is_active, is_control, control_for, sort_order)
      values (
        p ->> 'code', p ->> 'name', p ->> 'kind', p ->> 'parentCode',
        exists (select 1 from jsonb_array_elements(v_rows) c
                 where c.value ->> 'status' = 'create' and c.value ->> 'parentCode' = p ->> 'code'),
        true, false, null, 0);
    end loop;
  end if;

  return jsonb_build_object(
    'applied',  p_apply and v_created > 0,
    'created',  v_created,
    'existing', v_existing,
    'problems', v_problems,
    'rows',     v_rows);
end;
$function$;

revoke all on function public.gl_chart_import(jsonb, boolean) from public, anon;
grant execute on function public.gl_chart_import(jsonb, boolean) to authenticated;

comment on function public.gl_chart_import(jsonb, boolean) is
  '0655: AutoCount''s printed chart, read on the screen, into the chart of accounts. p_apply false answers what it would do; true makes the new accounts. Never renames, moves, retires or turns an existing account into a heading.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.gl_chart_import(jsonb, boolean)', 'execute') then
    raise exception '0655: the import door is open to signed-out callers';
  end if;
  if not has_function_privilege('authenticated', 'public.gl_chart_import(jsonb, boolean)', 'execute') then
    raise exception '0655: the import door is closed to signed-in callers';
  end if;
  -- The door refuses a caller with no Finance role before it reads anything.
  begin
    perform public.gl_chart_import('[{"code":"999-9999"}]'::jsonb, false);
    raise exception '0655: the import door ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;
