-- =============================================================================
-- 0459_a_ledger_needs_a_chart_and_a_start_date.sql
-- FINANCE · GENERAL LEDGER — CARD A · THE CHART, THE START LINE, THE NUMBERS
-- (rulings J · K · L · N, .claude/LEDGER-CONTRACT.md).
--
-- Carres has had money facts for a long time and never had a ledger. `orders.paid`
-- is the collection truth (0343), `order_payments` + `payment_allocations` are the
-- receipt trail (0351), the supplier side is a purchase order and a claim and no
-- account at all. Every one of those answers "did this customer pay?" and not one
-- of them answers "what does the business own and owe today?".
--
-- A ledger cannot be switched on halfway through a sentence. Before anything may
-- post, three things must exist and be the ONLY versions of themselves:
--
--   ① A CHART. Not Houzs' chart — Carres', small enough that Jess can read it in
--      one screen and specific enough that it names what Carres actually sells:
--      furniture, rental, delivery, storage. 4-digit codes, one range per kind,
--      header accounts that group and leaves that post. There is no `is_header`
--      column on purpose: a header is any account some other row calls parent.
--      Retire the last child of a header and it stays a header — it cannot
--      silently become postable behind everyone's back.
--
--   ② A START LINE (ruling L). The ledger opens on 2026-10-01. Everything before
--      that date belongs to AutoCount and the Master Sheet and is never posted.
--      The date is configurable because a go-live slips; it may be pushed FORWARD
--      and never dragged back, and once one entry exists it is frozen outright.
--      A start line that can move under posted rows is not a start line.
--
--   ③ ONE NUMBERING REGISTRY. `JE`, `SB`, `PV` are claimed here, once, forever —
--      the primary key is the guarantee that two document types can never end up
--      sharing a prefix and interleaving their sequences. Numbers run per prefix
--      per month, `PREFIX-YYYYMM-NNNN`. Gaps are permanent and that is correct: a
--      number handed out and then rolled back is a number that was used.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO: it does not create `gl_entries` or
-- `gl_entry_lines`, and it does not post anything. The gate (0460) owns those.
-- `gl_set_go_live` therefore has to survive a world where `gl_entries` does not
-- exist yet, and does so by asking `to_regclass` instead of assuming.
--
-- Money is `numeric(12,2)` everywhere in this ledger (ruling N) — there is no
-- money column in this file, but the rule is stated here because this is where
-- the ledger starts.
--
-- No table below gets an INSERT/UPDATE/DELETE policy. Not for `finance`, not for
-- `principal`, not for anyone. Reads are internal; writes go through the
-- `security definer` functions or they do not happen.
-- =============================================================================

-- ── 1 · the chart ────────────────────────────────────────────────────────────
create table public.gl_accounts (
  code          text primary key,
  name          text not null,
  kind          text not null check (kind in ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
  parent_code   text references public.gl_accounts(code),
  is_active     boolean not null default true,
  is_control    boolean not null default false,
  control_for   text,                               -- 'CUSTOMER' | 'SUPPLIER'
  created_at    timestamptz not null default now()
);

comment on table public.gl_accounts is
  'The Carres chart of accounts (0459). A HEADER is any account another row names as parent_code, active or retired — there is no is_header column, so retiring the last child never turns a header into a postable leaf.';
alter table public.gl_accounts
  add constraint gl_accounts_control_for_valid
  check (control_for is null or control_for in ('CUSTOMER','SUPPLIER'));

-- is_control says "this balance is a subsidiary ledger, demand a party".
-- control_for says WHOSE. Without the second half, code that needs to find
-- "the receivables account" can only guess by kind, and a chart with two
-- asset-side control accounts makes that guess ambiguous — which is exactly
-- what happened on the first build.
alter table public.gl_accounts
  add constraint gl_accounts_control_for_matches_is_control
  check (is_control = (control_for is not null));

comment on column public.gl_accounts.control_for is
  'Which party type this control account is a subsidiary ledger for. '
  'Null exactly when is_control is false.';

comment on column public.gl_accounts.is_control is
  'AR / AP / supplier claims. The gate refuses a line on a control account without party_type + party_id, and refuses a manual journal touching one at all.';
comment on column public.gl_accounts.parent_code is
  'Grouping only. A leaf posts; a parent never does.';

create index gl_accounts_parent_idx on public.gl_accounts (parent_code);
create index gl_accounts_kind_idx   on public.gl_accounts (kind, code);
-- The gate and every report ask for the control accounts by name; there are
-- three of them in a chart of thirty-six, so the partial index is nearly free.
create index gl_accounts_control_idx on public.gl_accounts (code) where is_control;

-- ── 2 · the start line ───────────────────────────────────────────────────────
create table public.gl_config (
  id            boolean primary key default true check (id),
  go_live_on    date not null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users(id)
);

comment on table public.gl_config is
  'Exactly one row, forever — the check on the boolean primary key is what makes a second row impossible (0459).';
comment on column public.gl_config.go_live_on is
  'Ruling L. The ledger refuses every date before this one, and every report that reads the ledger prints it. Moves forward only, and only while the ledger is empty.';

-- ── 3 · one numbering registry ───────────────────────────────────────────────
create table public.gl_doc_series (
  prefix        text primary key,
  description   text not null,
  created_at    timestamptz not null default now()
);

create table public.gl_doc_counters (
  prefix        text not null references public.gl_doc_series(prefix),
  period        text not null,
  next_value    integer not null default 1,
  primary key (prefix, period)
);

comment on table public.gl_doc_series is
  'A prefix is claimed once, ever (0459). The primary key is the reason two document types can never share a sequence.';
comment on table public.gl_doc_counters is
  'One counter per prefix per YYYYMM. next_value is the NEXT number to hand out, not the last one handed out.';

-- ── 4 · the number allocator ─────────────────────────────────────────────────
-- Concurrency: `insert ... on conflict do update ... returning` takes the row
-- lock as part of the same statement, so two callers arriving together are
-- serialised by Postgres itself and cannot both read the same next_value. The
-- new-row branch inserts 2 and the update branch adds 1, so `next_value - 1` is
-- the number this caller just claimed in either case. No advisory lock, no
-- select-then-update window, no sequence (a sequence cannot be scoped per month).
create or replace function public.gl_next_doc_no(
  p_prefix  text,
  p_on_date date
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_prefix text;
  v_period text;
  v_number integer;
begin
  v_prefix := upper(btrim(coalesce(p_prefix, '')));
  if v_prefix = '' then
    raise exception 'a document prefix is required'
      using errcode = '22023', detail = 'missing_prefix';
  end if;
  if p_on_date is null then
    raise exception 'a document date is required — a number belongs to a month'
      using errcode = '22023', detail = 'missing_date';
  end if;

  -- An unregistered prefix is a bug in the calling document, not a new series.
  if not exists (select 1 from gl_doc_series s where s.prefix = v_prefix) then
    raise exception 'document prefix % is not registered in gl_doc_series', v_prefix
      using errcode = '22023', detail = 'unknown_prefix';
  end if;

  v_period := to_char(p_on_date, 'YYYYMM');

  insert into gl_doc_counters (prefix, period, next_value)
  values (v_prefix, v_period, 2)
  on conflict (prefix, period) do update
    set next_value = gl_doc_counters.next_value + 1
  returning next_value - 1 into v_number;

  return v_prefix || '-' || v_period || '-' || lpad(v_number::text, 4, '0');
end;
$fn$;

comment on function public.gl_next_doc_no(text, date) is
  'Allocates PREFIX-YYYYMM-NNNN (0459). Sequential per prefix per month, never reused; a rolled-back transaction leaves a permanent gap, which is correct.';

revoke all on function public.gl_next_doc_no(text, date) from public;
revoke all on function public.gl_next_doc_no(text, date) from anon;
grant execute on function public.gl_next_doc_no(text, date) to authenticated;

-- ── 5 · moving the start line (ruling L) ─────────────────────────────────────
-- Forward only, principal only, and impossible once anything has posted.
-- `gl_entries` arrives in 0460, so this asks to_regclass rather than assuming it.
create or replace function public.gl_set_go_live(
  p_new_date date
) returns date
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_current date;
  v_entries bigint;
begin
  if not public.is_principal() then
    raise exception 'forbidden: only the principal can move the ledger go-live date'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_new_date is null then
    raise exception 'a go-live date is required'
      using errcode = '22023', detail = 'missing_date';
  end if;

  select go_live_on into v_current from gl_config where id;
  if not found then
    raise exception 'gl_config has no row — the ledger was never initialised'
      using errcode = 'P0002', detail = 'no_config';
  end if;

  if p_new_date < v_current then
    raise exception 'the ledger go-live date may only move forward: % is before %',
      p_new_date, v_current
      using errcode = '22023', detail = 'backward_go_live';
  end if;

  -- Once one entry exists the start line is frozen: moving it would strand
  -- posted rows before the date the reports declare as the beginning.
  if to_regclass('public.gl_entries') is not null then
    execute 'select count(*) from public.gl_entries' into v_entries;
    if v_entries > 0 then
      raise exception 'the ledger already holds % entries — the go-live date is frozen', v_entries
        using errcode = '22023', detail = 'ledger_not_empty';
    end if;
  end if;

  update gl_config
     set go_live_on = p_new_date,
         updated_at = now(),
         updated_by = auth.uid()
   where id;

  return p_new_date;
end;
$fn$;

comment on function public.gl_set_go_live(date) is
  'Ruling L (0459). Principal only. Forward only, never backward, and refused outright once gl_entries holds a row.';

revoke all on function public.gl_set_go_live(date) from public;
revoke all on function public.gl_set_go_live(date) from anon;
grant execute on function public.gl_set_go_live(date) to authenticated;

-- ── 6 · the start line itself ────────────────────────────────────────────────
insert into public.gl_config (id, go_live_on) values (true, date '2026-10-01');

-- ── 7 · the prefixes, claimed once ───────────────────────────────────────────
insert into public.gl_doc_series (prefix, description) values
  ('JE', 'Journal entry — every posted ledger entry carries one'),
  ('SB', 'Supplier bill — the A/P document (ruling K)'),
  ('PV', 'Payment voucher — money paid out to a supplier');

-- ── 8 · the chart, seeded ────────────────────────────────────────────────────
-- Headers first so parent_code always resolves. Carres codes, not Houzs codes:
--   1xxx asset · 2xxx liability · 3xxx equity · 4xxx income · 5xxx cost of sales
--   6xxx operating expense.
-- The income range names only what Carres actually sells today — furniture,
-- rental agreements, delivery fees and storage fees. Nothing was invented to
-- round out a textbook.
insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for) values
  -- 1xxx · assets
  ('1000', 'Assets',                            'ASSET',     null,   false, true, null),
  ('1100', 'Cash and bank',                     'ASSET',     '1000', false, true, null),
  ('1110', 'Cash on hand',                      'ASSET',     '1100', false, true, null),
  ('1120', 'Bank — current account',            'ASSET',     '1100', false, true, null),
  ('1130', 'Card and online settlement',        'ASSET',     '1100', false, true, null),
  ('1200', 'Receivables',                       'ASSET',     '1000', false, true, null),
  ('1210', 'Trade receivables — customers',     'ASSET',     '1200', true,  true, 'CUSTOMER'),
  ('1220', 'Supplier claims receivable',        'ASSET',     '1200', true,  true, 'SUPPLIER'),
  ('1300', 'Inventory',                         'ASSET',     '1000', false, true, null),
  ('1310', 'Stock on hand',                     'ASSET',     '1300', false, true, null),

  -- 2xxx · liabilities
  ('2000', 'Liabilities',                       'LIABILITY', null,   false, true, null),
  ('2100', 'Payables',                          'LIABILITY', '2000', false, true, null),
  ('2110', 'Trade payables — suppliers',        'LIABILITY', '2100', true,  true, 'SUPPLIER'),
  ('2200', 'Customer money held',               'LIABILITY', '2000', false, true, null),
  ('2210', 'Customer deposits held',            'LIABILITY', '2200', false, true, null),
  ('2300', 'Taxes',                             'LIABILITY', '2000', false, true, null),
  ('2310', 'SST payable',                       'LIABILITY', '2300', false, false, null),

  -- 3xxx · equity
  ('3000', 'Equity',                            'EQUITY',    null,   false, true, null),
  ('3100', 'Share capital',                     'EQUITY',    '3000', false, true, null),
  ('3200', 'Retained earnings',                 'EQUITY',    '3000', false, true, null),
  ('3300', 'Opening balance equity',            'EQUITY',    '3000', false, true, null),

  -- 4xxx · income
  ('4000', 'Income',                            'INCOME',    null,   false, true, null),
  ('4100', 'Furniture sales',                   'INCOME',    '4000', false, true, null),
  ('4200', 'Rental income',                     'INCOME',    '4000', false, true, null),
  ('4300', 'Delivery income',                   'INCOME',    '4000', false, true, null),
  ('4400', 'Storage fee income',                'INCOME',    '4000', false, true, null),

  -- 5xxx · cost of sales
  ('5000', 'Cost of sales',                     'EXPENSE',   null,   false, true, null),
  ('5100', 'Cost of goods sold',                'EXPENSE',   '5000', false, true, null),
  ('5200', 'Inbound freight and duty',          'EXPENSE',   '5000', false, true, null),

  -- 6xxx · operating expenses
  ('6000', 'Operating expenses',                'EXPENSE',   null,   false, true, null),
  ('6100', 'Staff cost and commission',         'EXPENSE',   '6000', false, true, null),
  ('6200', 'Rent and utilities',                'EXPENSE',   '6000', false, true, null),
  ('6300', 'Outbound delivery and transport',   'EXPENSE',   '6000', false, true, null),
  ('6400', 'Service and warranty cost',         'EXPENSE',   '6000', false, true, null),
  ('6500', 'Bank and payment charges',          'EXPENSE',   '6000', false, true, null),
  ('6900', 'Office, marketing and general',     'EXPENSE',   '6000', false, true, null);

comment on column public.gl_accounts.is_active is
  'A retired account is refused by the gate. 2310 SST payable ships INACTIVE on purpose: Carres is not SST-registered today, and the account exists so registration is a flag flip and not a chart migration.';

-- ── 9 · reads are internal, writes are nobody's ──────────────────────────────
alter table public.gl_accounts     enable row level security;
alter table public.gl_config       enable row level security;
alter table public.gl_doc_series   enable row level security;
alter table public.gl_doc_counters enable row level security;

revoke all on public.gl_accounts     from anon, authenticated;
revoke all on public.gl_config       from anon, authenticated;
revoke all on public.gl_doc_series   from anon, authenticated;
revoke all on public.gl_doc_counters from anon, authenticated;

-- Select is granted back so the read policy below is a live gate and not a
-- decoration. Insert / update / delete stay revoked, and no write policy exists.
grant select on public.gl_accounts     to authenticated;
grant select on public.gl_config       to authenticated;
grant select on public.gl_doc_series   to authenticated;
grant select on public.gl_doc_counters to authenticated;

create policy gl_accounts_read_internal on public.gl_accounts
  for select using ((select public.is_internal()));
create policy gl_config_read_internal on public.gl_config
  for select using ((select public.is_internal()));
create policy gl_doc_series_read_internal on public.gl_doc_series
  for select using ((select public.is_internal()));
create policy gl_doc_counters_read_internal on public.gl_doc_counters
  for select using ((select public.is_internal()));

-- ── 10 · sanity ──────────────────────────────────────────────────────────────
do $sanity$
declare
  v      int;
  v_date date;
  t      text;
begin
  select count(*) into v from public.gl_accounts;
  if v < 25 or v > 40 then
    raise exception '0459 sanity: the chart seeded % accounts', v;
  end if;

  -- Every leaf hangs off a header, and every header groups a real kind.
  if exists (
    select 1 from public.gl_accounts a
     where a.parent_code is not null
       and not exists (select 1 from public.gl_accounts p where p.code = a.parent_code)
  ) then
    raise exception '0459 sanity: an account points at a parent that does not exist';
  end if;
  if exists (
    select 1 from public.gl_accounts a
      join public.gl_accounts p on p.code = a.parent_code
     where p.kind <> a.kind
  ) then
    raise exception '0459 sanity: a child account disagrees with its parent about kind';
  end if;

  select count(*) into v from public.gl_accounts where is_control;
  if v <> 3 then
    raise exception '0459 sanity: expected 3 control accounts, got %', v;
  end if;

  select go_live_on into v_date from public.gl_config where id;
  if v_date is distinct from date '2026-10-01' then
    raise exception '0459 sanity: go-live is %, expected 2026-10-01', v_date;
  end if;

  select count(*) into v from public.gl_doc_series where prefix in ('JE','SB','PV');
  if v <> 3 then
    raise exception '0459 sanity: expected the three prefixes, got %', v;
  end if;

  -- The allocator hands out 0001 then 0002, and refuses an unclaimed prefix.
  t := public.gl_next_doc_no('JE', date '2026-10-15');
  if t <> 'JE-202610-0001' then
    raise exception '0459 sanity: first number was %, expected JE-202610-0001', t;
  end if;
  t := public.gl_next_doc_no('JE', date '2026-10-31');
  if t <> 'JE-202610-0002' then
    raise exception '0459 sanity: second number was %, expected JE-202610-0002', t;
  end if;
  begin
    t := public.gl_next_doc_no('ZZ', date '2026-10-15');
    raise exception '0459 sanity: an unregistered prefix was allocated a number';
  exception when sqlstate '22023' then
    null;
  end;
  -- The probe leaves no gap behind: nothing has posted yet, so reset the counter.
  delete from public.gl_doc_counters where prefix = 'JE' and period = '202610';

  if has_table_privilege('authenticated', 'public.gl_accounts', 'insert') then
    raise exception '0459 sanity: authenticated can INSERT the chart directly';
  end if;
  if has_table_privilege('anon', 'public.gl_config', 'select') then
    raise exception '0459 sanity: anon can read the ledger config';
  end if;
  if exists (
    select 1 from pg_policy
     where polrelid in ('public.gl_accounts'::regclass, 'public.gl_config'::regclass,
                        'public.gl_doc_series'::regclass, 'public.gl_doc_counters'::regclass)
       and polcmd <> 'r'
  ) then
    raise exception '0459 sanity: a write policy exists on a ledger table';
  end if;
  if has_function_privilege('anon', 'public.gl_set_go_live(date)', 'execute') then
    raise exception '0459 sanity: gl_set_go_live callable by anon';
  end if;

  raise notice '0459 OK: the ledger has a chart, a start line of 2026-10-01, and one numbering registry';
end $sanity$;
