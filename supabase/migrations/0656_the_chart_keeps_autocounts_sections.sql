-- =============================================================================
-- 0656_the_chart_keeps_autocounts_sections.sql
-- =============================================================================
-- THE RULING (Chew, Finance, 2026-10-07, docs/finance/MASTER.md §0 "The Chart
--   of accounts screen reads like AutoCount's"): the chart is grouped by
--   AutoCount's sections (CAPITAL ... TAXATION), shows AutoCount's special type
--   beside each name, reads in number order, and each account can be edited or
--   retired from its row.
--
-- WHAT WAS MISSING
--   The chart kept no section and no special type: 0655 read both from the PDF
--   and used the section only to choose a kind and a top heading. An account
--   could not be retired from any screen. A new account went behind its
--   heading's last account instead of taking its place by number.
--
-- WHAT THIS ADDS
--   1. gl_sections: AutoCount's thirteen sections, each with its kind, the
--      top heading it hangs under (a SECTION_* role, 0654) and its place.
--      gl_section_of() reads the other spellings AutoCount prints.
--   2. gl_accounts.section and gl_accounts.special. The section of an
--      account under a heading is its first heading's: the screen groups an
--      account by the section of the account directly under the top heading.
--      A trigger keeps a section the account's own kind.
--   3. The system's own accounts that are not in Chew's chart take their
--      section here. Every other account takes it from the import.
--   4. gl_chart_import (0655) keeps the section and special type of every
--      account it makes, and fills them on an account already in the chart
--      when they are empty. It still never renames, moves or retires one.
--   5. Number order: every account's display order goes back to 0, and a new
--      account takes 0, so each heading reads by number (as 0654 laid out).
--   6. Doors for the screen, Finance and the principal only:
--        gl_account_add_in_section  add an account or heading in a section;
--        gl_account_edit            name, number, the heading it sits under
--                                   and, for the first account under a top
--                                   heading, its section, in one act;
--        gl_account_set_active      retire an account the ledger never posted
--                                   to, or bring one back.
--      Each writes through the doors that already guard the chart
--      (gl_account_add, gl_account_move, gl_account_update), so their checks
--      and their chart lock hold here too.
--
-- RLS: gl_sections reads for Finance (gl_may_read); no write policy.
-- DATA: configuration only (the sections, and the section of the system's own
--   accounts). DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · AutoCount's sections ────────────────────────────────────────────────
create table if not exists public.gl_sections (
  section    text primary key,
  kind       text not null check (kind in ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE')),
  top_role   text not null,
  sort_order integer not null unique
);

comment on table public.gl_sections is
  '0656: AutoCount''s account sections, in AutoCount''s order. top_role names the gl_account_roles heading an account printed at the margin hangs under.';

insert into public.gl_sections (section, kind, top_role, sort_order) values
  ('CAPITAL',               'EQUITY',    'SECTION_EQUITY',        10),
  ('RETAINED EARNING',      'EQUITY',    'SECTION_EQUITY',        20),
  ('FIXED ASSETS',          'ASSET',     'SECTION_ASSETS',        30),
  ('OTHER ASSETS',          'ASSET',     'SECTION_ASSETS',        40),
  ('CURRENT ASSETS',        'ASSET',     'SECTION_ASSETS',        50),
  ('CURRENT LIABILITIES',   'LIABILITY', 'SECTION_LIABILITIES',   60),
  ('LONG TERM LIABILITIES', 'LIABILITY', 'SECTION_LIABILITIES',   70),
  ('SALES',                 'INCOME',    'SECTION_INCOME',        80),
  ('SALES ADJUSTMENTS',     'INCOME',    'SECTION_INCOME',        90),
  ('COST OF GOODS SOLD',    'EXPENSE',   'SECTION_COST_OF_SALES', 100),
  ('OTHER INCOMES',         'INCOME',    'SECTION_INCOME',        110),
  ('EXPENSES',              'EXPENSE',   'SECTION_EXPENSES',      120),
  ('TAXATION',              'EXPENSE',   'SECTION_TAX',           130)
on conflict (section) do nothing;

alter table public.gl_sections enable row level security;
revoke all on public.gl_sections from anon, authenticated;
grant select on public.gl_sections to authenticated;
drop policy if exists gl_sections_read on public.gl_sections;
create policy gl_sections_read on public.gl_sections
  for select using ((select public.gl_may_read()));

-- The words AutoCount prints for a section, read as one of the thirteen.
create or replace function public.gl_section_of(p_word text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case upper(regexp_replace(btrim(coalesce(p_word, '')), '\s+', ' ', 'g'))
    when 'CAPITAL'                 then 'CAPITAL'
    when 'RETAINED EARNING'        then 'RETAINED EARNING'
    when 'RETAINED EARNINGS'       then 'RETAINED EARNING'
    when 'RESERVES'                then 'RETAINED EARNING'
    when 'APPROPRIATION ACCOUNT'   then 'RETAINED EARNING'
    when 'FIXED ASSETS'            then 'FIXED ASSETS'
    when 'OTHER ASSETS'            then 'OTHER ASSETS'
    when 'NON-CURRENT ASSETS'      then 'OTHER ASSETS'
    when 'INVESTMENTS'             then 'OTHER ASSETS'
    when 'INTANGIBLE ASSETS'       then 'OTHER ASSETS'
    when 'CURRENT ASSETS'          then 'CURRENT ASSETS'
    when 'CURRENT LIABILITIES'     then 'CURRENT LIABILITIES'
    when 'LONG TERM LIABILITIES'   then 'LONG TERM LIABILITIES'
    when 'NON-CURRENT LIABILITIES' then 'LONG TERM LIABILITIES'
    when 'OTHER LIABILITIES'       then 'LONG TERM LIABILITIES'
    when 'SALES'                   then 'SALES'
    when 'SALES ADJUSTMENT'        then 'SALES ADJUSTMENTS'
    when 'SALES ADJUSTMENTS'       then 'SALES ADJUSTMENTS'
    when 'COST OF GOODS SOLD'      then 'COST OF GOODS SOLD'
    when 'COST OF SALES'           then 'COST OF GOODS SOLD'
    when 'OTHER INCOME'            then 'OTHER INCOMES'
    when 'OTHER INCOMES'           then 'OTHER INCOMES'
    when 'EXTRA-ORDINARY INCOME'   then 'OTHER INCOMES'
    when 'EXTRAORDINARY INCOME'    then 'OTHER INCOMES'
    when 'EXPENSES'                then 'EXPENSES'
    when 'EXPENSE'                 then 'EXPENSES'
    when 'EXTRA-ORDINARY EXPENSES' then 'EXPENSES'
    when 'EXTRAORDINARY EXPENSES'  then 'EXPENSES'
    when 'TAXATION'                then 'TAXATION'
    when 'TAX'                     then 'TAXATION'
  end;
$function$;

revoke all on function public.gl_section_of(text) from public, anon;
grant execute on function public.gl_section_of(text) to authenticated;

-- ── 2 · every account keeps its section and special type ────────────────────
alter table public.gl_accounts
  add column if not exists section text references public.gl_sections(section) on update cascade;
alter table public.gl_accounts
  add column if not exists special text;

do $special$
begin
  if not exists (select 1 from pg_constraint where conname = 'gl_accounts_special_known'
                    and conrelid = 'public.gl_accounts'::regclass) then
    alter table public.gl_accounts add constraint gl_accounts_special_known
      check (special is null or special in ('SFA', 'SAD', 'SBK', 'SCH', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS'));
  end if;
end $special$;

comment on column public.gl_accounts.section is
  '0656: AutoCount''s section. The Chart of accounts screen groups an account by the section of the account directly under its top heading.';
comment on column public.gl_accounts.special is
  '0656: AutoCount''s special account type, shown beside the name. Read only by the screen.';

-- A section is the account's own kind.
create or replace function public.gl_accounts_section_kind()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_kind text;
begin
  if new.section is null then
    return new;
  end if;
  select s.kind into v_kind from public.gl_sections s where s.section = new.section;
  if v_kind is distinct from new.kind then
    raise exception '% is not a section for an account of this kind.', new.section
      using errcode = '22023', detail = 'section_other_kind';
  end if;
  return new;
end;
$function$;

drop trigger if exists gl_accounts_section_kind_trg on public.gl_accounts;
create trigger gl_accounts_section_kind_trg
  before insert or update of section, kind on public.gl_accounts
  for each row execute function public.gl_accounts_section_kind();

-- ── 3 · the system's own accounts that are not in Chew's chart ──────────────
update public.gl_accounts a
   set section = v.section
  from (values
    ('160-0000', 'CAPITAL'),
    ('315-0000', 'CURRENT ASSETS'),
    ('315-1000', 'CURRENT ASSETS'),
    ('315-2000', 'CURRENT ASSETS'),
    ('315-3000', 'CURRENT ASSETS'),
    ('315-4000', 'CURRENT ASSETS'),
    ('315-5000', 'CURRENT ASSETS'),
    ('315-6000', 'CURRENT ASSETS'),
    ('1130',     'CURRENT ASSETS'),
    ('1120',     'CURRENT ASSETS'),
    ('401-0000', 'CURRENT LIABILITIES'),
    ('410-0064', 'CURRENT LIABILITIES'),
    ('410-0065', 'CURRENT LIABILITIES'),
    ('500-2000', 'SALES'),
    ('500-3000', 'SALES'),
    ('500-4000', 'SALES'),
    ('500-5000', 'SALES'),
    ('604-0000', 'COST OF GOODS SOLD'),
    ('610-0090', 'COST OF GOODS SOLD'),
    ('900-B002', 'EXPENSES'),
    ('900-C008', 'EXPENSES'),
    ('900-C009', 'EXPENSES'),
    ('900-W005', 'EXPENSES'),
    ('6200',     'EXPENSES')
  ) as v(code, section)
 where a.code = v.code
   and a.section is null
   and a.kind = (select s.kind from public.gl_sections s where s.section = v.section);

-- ── 4 · number order ────────────────────────────────────────────────────────
update public.gl_accounts set sort_order = 0 where sort_order <> 0;

-- A new account takes its place by number: the drag that kept a chosen order
-- is gone from the screen (Chew 2026-10-07), so nothing chooses one.
create or replace function public.gl_accounts_sort_order_default()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  new.sort_order := 0;               -- 0656: every heading reads by number
  return new;
end;
$function$;

-- ── 5 · the import keeps the section and the special type ───────────────────
-- 0655's body. What changes is marked 0656: the section is read through
-- gl_sections, every account made keeps its section and special type, and an
-- account already in the chart has them filled when they are empty.
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
  v_fills    boolean;                                   -- 0656
  -- What this import plans, keyed by number: its kind, or 'problem'.
  v_planned  jsonb := '{}'::jsonb;
  -- Names this import plans to use, lower case -> number.
  v_names    jsonb := '{}'::jsonb;
  v_rows     jsonb := '[]'::jsonb;
  v_created  integer := 0;
  v_existing integer := 0;
  v_filled   integer := 0;                              -- 0656
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

    -- 0656: AutoCount's sections, through gl_sections.
    select s.kind, s.top_role into v_kind, v_top_role
      from public.gl_sections s where s.section = public.gl_section_of(v_section);
    if not found then
      v_kind := null;
      v_top_role := null;
    end if;

    if v_code !~ '^([0-9]{4}|[0-9]{3}-[0-9A-Z][0-9]{3})$' then
      v_reason := format('%s is not an account number.', coalesce(nullif(v_code, ''), 'A line'));
    elsif v_planned ? v_code then
      v_reason := format('%s is listed twice.', v_code);
    elsif exists (select 1 from public.gl_accounts a where a.code = v_code) then
      v_existing := v_existing + 1;
      select * into v_acc from public.gl_accounts a where a.code = v_code;
      v_planned := v_planned || jsonb_build_object(v_code, v_acc.kind);
      -- 0656: an empty section or special type is filled; a full one is kept.
      v_fills := coalesce(v_acc.section is null and v_kind = v_acc.kind, false)
              or coalesce(v_acc.special is null and v_special in ('SFA', 'SAD', 'SBK', 'SCH', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS'), false);
      if v_fills then
        v_filled := v_filled + 1;
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'code', v_code, 'name', v_name, 'parentCode', v_acc.parent_code,
        'status', 'exists', 'reason', null, 'chartName', v_acc.name,
        'fills', v_fills,
        'section', case when v_acc.section is null and v_kind = v_acc.kind then public.gl_section_of(v_section) end,
        'special', case when v_acc.special is null
                         and v_special in ('SFA', 'SAD', 'SBK', 'SCH', 'SDC', 'SCC', 'SRE', 'SBS', 'SOS', 'SCS')
                        then v_special end));
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
      'status', 'create', 'reason', null, 'chartName', null,
      'section', public.gl_section_of(v_section),                              -- 0656
      'special', case when v_special in ('SFA', 'SAD', 'SOS', 'SCS') then v_special end));
  end loop;

  if p_apply and v_created > 0 then
    -- AutoCount's order, so every parent is in the chart before the accounts
    -- under it. A row becomes a heading when an imported row is under it.
    for p in select value from jsonb_array_elements(v_rows) where value ->> 'status' = 'create'
    loop
      insert into public.gl_accounts (code, name, kind, parent_code, is_heading, is_active, is_control, control_for, sort_order, section, special)
      values (
        p ->> 'code', p ->> 'name', p ->> 'kind', p ->> 'parentCode',
        exists (select 1 from jsonb_array_elements(v_rows) c
                 where c.value ->> 'status' = 'create' and c.value ->> 'parentCode' = p ->> 'code'),
        true, false, null, 0,
        p ->> 'section', p ->> 'special');                                     -- 0656
    end loop;
  end if;

  -- 0656: fill an empty section or special type on an account already there.
  if p_apply and v_filled > 0 then
    for p in select value from jsonb_array_elements(v_rows)
              where value ->> 'status' = 'exists' and (value ->> 'fills')::boolean
    loop
      update public.gl_accounts a
         set section = coalesce(a.section, p ->> 'section'),
             special = coalesce(a.special, p ->> 'special')
       where a.code = p ->> 'code';
    end loop;
  end if;

  return jsonb_build_object(
    'applied',  p_apply and (v_created > 0 or v_filled > 0),
    'created',  v_created,
    'existing', v_existing,
    'filled',   v_filled,                                                      -- 0656
    'problems', v_problems,
    'rows',     v_rows);
end;
$function$;

revoke all on function public.gl_chart_import(jsonb, boolean) from public, anon;
grant execute on function public.gl_chart_import(jsonb, boolean) to authenticated;

comment on function public.gl_chart_import(jsonb, boolean) is
  '0655, 0656: AutoCount''s printed chart, read on the screen, into the chart of accounts. p_apply false answers what it would do; true makes the new accounts with their section and special type, and fills an empty section or special type on an account already there. Never renames, moves, retires or turns an existing account into a heading.';

-- ── 6 · the screen's doors ──────────────────────────────────────────────────

-- The section an account reads in: its own when it sits directly under a top
-- heading, else that of the account above it that does.
create or replace function public.gl_account_section(p_code text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with recursive up(code, parent_code, section, depth) as (
    select a.code, a.parent_code, a.section, 0 from public.gl_accounts a where a.code = p_code
    union all
    select a.code, a.parent_code, a.section, up.depth + 1
      from public.gl_accounts a join up on a.code = up.parent_code
     where up.depth < 50
  )
  select up.section from up
   where up.parent_code is not null
     and exists (select 1 from public.gl_accounts t where t.code = up.parent_code and t.parent_code is null)
   limit 1;
$function$;

revoke all on function public.gl_account_section(text) from public, anon;
grant execute on function public.gl_account_section(text) to authenticated;

-- Add an account or a heading in a section: under a heading of that section,
-- or (p_parent_code null) at the top of the section.
create or replace function public.gl_account_add_in_section(
  p_section     text,
  p_parent_code text,
  p_code        text,
  p_name        text,
  p_is_heading  boolean default false
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role   text := public.app_role()::text;
  v_sec    public.gl_sections%rowtype;
  v_parent text;
  v_code   text;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_sec from public.gl_sections s where s.section = p_section;
  if not found then
    raise exception 'Choose the section.' using errcode = '22023', detail = 'section_missing';
  end if;

  if nullif(btrim(coalesce(p_parent_code, '')), '') is null then
    v_parent := public.gl_account_for(v_sec.top_role);
  else
    v_parent := upper(btrim(p_parent_code));
    if public.gl_account_section(v_parent) is distinct from v_sec.section then
      raise exception 'That heading is in another section.'
        using errcode = '22023', detail = 'heading_other_section';
    end if;
  end if;

  -- gl_account_add keeps its checks: the kind follows the heading, nothing is
  -- added among the bank and cash accounts, and two accounts never share a
  -- number or a name.
  v_code := public.gl_account_add(v_parent, p_code, p_name, null, null, coalesce(p_is_heading, false), null);
  update public.gl_accounts set section = v_sec.section where code = v_code;
  return v_code;
end;
$function$;

comment on function public.gl_account_add_in_section(text, text, text, text, boolean) is
  '0656: Chart of accounts → Add account. An account or heading in an AutoCount section, under one of its headings or at its top. Writes through gl_account_add. Finance or principal.';
revoke all on function public.gl_account_add_in_section(text, text, text, text, boolean) from public, anon;
grant execute on function public.gl_account_add_in_section(text, text, text, text, boolean) to authenticated;

-- Edit one account in one act: the heading it sits under (p_under null = the
-- top of its section), its section when it sits at the top, then its name and
-- number. p_section is the section the screen showed or chose.
create or replace function public.gl_account_edit(
  p_code     text,
  p_name     text,
  p_new_code text,
  p_section  text,
  p_under    text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role     text := public.app_role()::text;
  v_acc      public.gl_accounts%rowtype;
  v_sec      public.gl_sections%rowtype;
  v_to       text;
  v_from     text;
  v_from_was text[];
  v_to_was   text[];
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  perform pg_advisory_xact_lock(hashtext('gl_chart_structure'));

  select * into v_acc from public.gl_accounts a where a.code = p_code for update;
  if not found then
    raise exception 'That account is not in the chart.' using errcode = 'P0002', detail = 'account_missing';
  end if;
  if v_acc.parent_code is null then
    raise exception 'A top heading is not changed here.' using errcode = '22023', detail = 'edit_top_heading';
  end if;
  select * into v_sec from public.gl_sections s where s.section = p_section;
  if not found then
    raise exception 'Choose the section.' using errcode = '22023', detail = 'section_missing';
  end if;
  if v_sec.kind <> v_acc.kind then
    raise exception '% is not a section for an account of this kind.', v_sec.section
      using errcode = '22023', detail = 'section_other_kind';
  end if;

  -- Where it goes: a heading of the section, or the section's top heading.
  if nullif(btrim(coalesce(p_under, '')), '') is null then
    v_to := public.gl_account_for(v_sec.top_role);
  else
    v_to := upper(btrim(p_under));
    if public.gl_account_section(v_to) is distinct from v_sec.section then
      raise exception 'That heading is in another section.'
        using errcode = '22023', detail = 'heading_other_section';
    end if;
  end if;

  if v_to is distinct from v_acc.parent_code then
    v_from := v_acc.parent_code;
    select coalesce(array_agg(a.code order by a.sort_order, a.code), '{}') into v_from_was
      from public.gl_accounts a where a.parent_code = v_from;
    select coalesce(array_agg(a.code order by a.sort_order, a.code), '{}') into v_to_was
      from public.gl_accounts a where a.parent_code = v_to;
    -- gl_account_move keeps its checks (a heading of the same kind, never
    -- inside itself, the bank and cash heading for bank and cash accounts).
    perform public.gl_account_move(
      v_acc.code, v_to,
      v_from_was, array_remove(v_from_was, v_acc.code),
      v_to_was, (select array_agg(c order by c) from unnest(v_to_was || v_acc.code) c));
    -- Both headings read by number again.
    update public.gl_accounts set sort_order = 0
     where parent_code in (v_from, v_to) and sort_order <> 0;
  end if;

  -- At the top of a section, the account carries the section.
  if exists (select 1 from public.gl_accounts t where t.code = v_to and t.parent_code is null) then
    update public.gl_accounts set section = v_sec.section
     where code = v_acc.code and section is distinct from v_sec.section;
  end if;

  -- The name and the number last: a new number is carried everywhere (0570).
  return public.gl_account_update(v_acc.code, p_name, p_new_code);
end;
$function$;

comment on function public.gl_account_edit(text, text, text, text, text) is
  '0656: Chart of accounts → edit. The heading an account sits under, its section at the top of a section, then its name and number, in one act through gl_account_move and gl_account_update. Finance or principal.';
revoke all on function public.gl_account_edit(text, text, text, text, text) from public, anon;
grant execute on function public.gl_account_edit(text, text, text, text, text) to authenticated;

-- Retire an account, or bring one back.
create or replace function public.gl_account_set_active(p_code text, p_active boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role text := public.app_role()::text;
  v_acc  public.gl_accounts%rowtype;
  v_up   public.gl_accounts%rowtype;
begin
  if v_role is null or v_role not in ('finance', 'principal') then
    raise exception 'Only Finance changes the chart of accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  perform pg_advisory_xact_lock(hashtext('gl_chart_structure'));

  select * into v_acc from public.gl_accounts a where a.code = p_code for update;
  if not found then
    raise exception 'That account is not in the chart.' using errcode = 'P0002', detail = 'account_missing';
  end if;
  if v_acc.is_active = coalesce(p_active, false) then
    return v_acc.code;
  end if;

  if p_active then
    select * into v_up from public.gl_accounts a where a.code = v_acc.parent_code;
    if found and not v_up.is_active then
      raise exception '% % is under % %, which is retired. Bring that heading back first.', v_acc.code, v_acc.name, v_up.code, v_up.name
        using errcode = '22023', detail = 'heading_retired';
    end if;
    update public.gl_accounts set is_active = true where code = v_acc.code;
    return v_acc.code;
  end if;

  if v_acc.parent_code is null then
    raise exception 'A top heading is not retired.' using errcode = '22023', detail = 'retire_top_heading';
  end if;
  if exists (select 1 from public.gl_accounts c where c.parent_code = v_acc.code and c.is_active) then
    raise exception '% % has accounts under it. Retire them first.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'retire_has_accounts';
  end if;
  if exists (select 1 from public.gl_entry_lines l where l.account_code = v_acc.code) then
    raise exception '% % has postings, so it stays. A used account is never retired.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'gl_account_has_posted_history';
  end if;
  if exists (select 1 from public.gl_money_accounts m where m.account_code = v_acc.code) then
    raise exception '% % is a bank, cash or card account. Stop using it in Money accounts.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'retire_money_account';
  end if;
  if v_acc.is_control
     or exists (select 1 from public.gl_account_roles r where r.account_code = v_acc.code)
     or exists (select 1 from public.gl_income_account_map m where m.account_code = v_acc.code)
     or exists (select 1 from public.gl_payment_account_map m where m.account_code = v_acc.code) then
    raise exception '% % is an account the system posts to, so it stays.', v_acc.code, v_acc.name
      using errcode = '22023', detail = 'retire_system_account';
  end if;

  update public.gl_accounts set is_active = false where code = v_acc.code;
  return v_acc.code;
end;
$function$;

comment on function public.gl_account_set_active(text, boolean) is
  '0656: Chart of accounts → retire an account the ledger never posted to, or bring one back. Never a top heading, a heading with accounts under it in use, a money account, or an account the system posts to. Finance or principal.';
revoke all on function public.gl_account_set_active(text, boolean) from public, anon;
grant execute on function public.gl_account_set_active(text, boolean) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_bad text;
begin
  if (select count(*) from public.gl_sections) <> 13 then
    raise exception '0656: AutoCount has thirteen sections';
  end if;
  select string_agg(s.section, ', ') into v_bad
    from public.gl_sections s
   where public.gl_account_for(s.top_role) is null
      or not exists (select 1 from public.gl_accounts a
                      where a.code = public.gl_account_for(s.top_role)
                        and a.kind = s.kind and a.is_heading and a.parent_code is null);
  if v_bad is not null then
    raise exception '0656: sections whose top heading is missing or of another kind: %', v_bad;
  end if;
  if exists (select 1 from public.gl_accounts where sort_order <> 0) then
    raise exception '0656: an account still carries a chosen order';
  end if;
  select string_agg(a.code, ', ') into v_bad
    from public.gl_accounts a join public.gl_sections s on s.section = a.section
   where s.kind <> a.kind;
  if v_bad is not null then
    raise exception '0656: accounts in a section of another kind: %', v_bad;
  end if;
  if has_function_privilege('anon', 'public.gl_account_edit(text, text, text, text, text)', 'execute')
     or has_function_privilege('anon', 'public.gl_account_set_active(text, boolean)', 'execute')
     or has_function_privilege('anon', 'public.gl_account_add_in_section(text, text, text, text, boolean)', 'execute') then
    raise exception '0656: a chart door is open to signed-out callers';
  end if;
  -- Each door refuses a caller with no Finance role before it changes anything.
  begin
    perform public.gl_account_set_active('6200', false);
    raise exception '0656: gl_account_set_active ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.gl_account_edit('6200', 'X', '6200', 'EXPENSES', null);
    raise exception '0656: gl_account_edit ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.gl_account_add_in_section('EXPENSES', null, '999-9999', 'X', false);
    raise exception '0656: gl_account_add_in_section ran for a caller with no role';
  exception when insufficient_privilege then
    null;
  end;
end $sanity$;

commit;
