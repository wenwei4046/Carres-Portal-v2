-- =============================================================================
-- 0646_a_forecast_is_planned_per_month_per_account.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Chew (Finance) listed a Forecast among Finance's reports on 2026-10-03,
--   to be built last (docs/finance/MASTER.md §3.6), after the Houzs reference
--   (Part 10 §18, Forecast P&L). Finance has no place to plan a month.
--
-- WHAT THIS ADDS
--   fin_forecasts: one row per month that was ever planned, with who saved it
--   last and when.
--   fin_forecast_lines: the plan for each profit-and-loss account of that
--   month. An income account is planned as an amount; a cost or expense
--   account as an amount or as a share of the month's planned income, in
--   basis points (1250 = 12.50%). Never both.
--   Nothing posts from either table: a plan is set beside what the ledger
--   shows for the same month on the page.
--
--   The account is a KEY onto gl_accounts(code), ON UPDATE CASCADE, as 0570
--   §1 made every key that names the chart: a renumbered account keeps its
--   plan. A plan held as text keyed by number could not follow a renumber
--   (0570 §5), which is why the lines are rows and not a jsonb object.
--
--   fin_forecast_read(p_month): every account that can be planned (income and
--   expense accounts, not headings; retired ones flagged, so a plan or an
--   actual on one still shows), in the chart's order, each with its block:
--   income, cost of sales (the top heading that holds the cost of goods sold
--   account, read by role, 0554) or expenses. Then the month's plan, who saved
--   it last, the latest earlier planned month (so its plan can be copied
--   forward) and every planned month.
--   fin_forecast_save(p_month, p_lines, p_was): the whole month at once. Every
--   cell is checked and the first wrong one is named; nothing is kept then.
--   p_was is the save time the page read: when someone else saved the month
--   since, the save is refused (40001), as 0557 refuses a stale reorder.
--   An empty plan clears the month. Finance and the principal only.
--
-- RLS: two NEW tables, RLS on, writes revoked, read for gl_may_read() (Finance
-- and the principal). No existing policy changes. DATA: none. DR/CR: none.
-- =============================================================================

begin;

create table public.fin_forecasts (
  month      text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id)
);
comment on table public.fin_forecasts is
  '0646 · Chew 2026-10-03 (Finance MASTER §3.6): a month that was planned, and who saved its plan last. The plan is fin_forecast_lines. Nothing posts from it.';

create table public.fin_forecast_lines (
  month        text not null references public.fin_forecasts(month),
  account_code text not null references public.gl_accounts(code) on update cascade,
  amount       numeric(14,2) check (amount is null or abs(amount) < 10000000000),
  share_bp     integer check (share_bp is null or share_bp between 0 and 1000000),
  primary key (month, account_code),
  constraint fin_forecast_lines_amount_or_share check ((amount is null) <> (share_bp is null))
);
comment on table public.fin_forecast_lines is
  '0646 · the plan for one profit-and-loss account in one month: an amount, or a share of the month''s planned income in basis points. Written only by fin_forecast_save.';

alter table public.fin_forecasts enable row level security;
alter table public.fin_forecast_lines enable row level security;
revoke all on public.fin_forecasts from anon, authenticated;
revoke all on public.fin_forecast_lines from anon, authenticated;
grant select on public.fin_forecasts to authenticated;
grant select on public.fin_forecast_lines to authenticated;
create policy fin_forecasts_read on public.fin_forecasts for select using ((select public.gl_may_read()));
create policy fin_forecast_lines_read on public.fin_forecast_lines for select using ((select public.gl_may_read()));

-- The accounts a month can be planned on, in the chart's own order.
create or replace function public._fin_forecast_accounts()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with recursive tops as (
    select a.code, a.code as top_code, 0 as depth
      from public.gl_accounts a
     where a.kind in ('INCOME', 'EXPENSE') and a.parent_code is null
    union all
    select c.code, t.top_code, t.depth + 1
      from public.gl_accounts c
      join tops t on c.parent_code = t.code
     where t.depth < 20
  ),
  cost_top as (
    select t.top_code from tops t where t.code = public.gl_account_for('COST_OF_GOODS_SOLD')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', a.code, 'name', a.name, 'kind', a.kind, 'active', a.is_active,
           'block', case when a.kind = 'INCOME' then 'income'
                         when t.top_code = (select top_code from cost_top) then 'cost'
                         else 'expense' end)
         order by case when a.kind = 'INCOME' then 0
                       when t.top_code = (select top_code from cost_top) then 1 else 2 end,
                  h.sort_order nulls last, h.code, a.sort_order nulls last, a.code), '[]'::jsonb)
    from public.gl_accounts a
    join tops t on t.code = a.code
    join public.gl_accounts h on h.code = t.top_code
   where not a.is_heading and a.kind in ('INCOME', 'EXPENSE')
$fn$;
revoke all on function public._fin_forecast_accounts() from public, anon, authenticated;

-- One month's cells as {code: {"amount": n} | {"share": basis points}}.
create or replace function public._fin_forecast_cells(p_month text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(jsonb_object_agg(l.account_code,
           case when l.amount is not null then jsonb_build_object('amount', l.amount)
                else jsonb_build_object('share', l.share_bp) end), '{}'::jsonb)
    from public.fin_forecast_lines l
   where l.month = p_month
$fn$;
revoke all on function public._fin_forecast_cells(text) from public, anon, authenticated;

create or replace function public.fin_forecast_read(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row  public.fin_forecasts%rowtype;
  v_prev text;
begin
  if not public.gl_may_read() then
    raise exception 'finance reports are internal' using errcode = '42501', detail = 'not_internal';
  end if;
  if coalesce(p_month, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Choose the month.' using errcode = '22023', detail = 'month_invalid';
  end if;
  select * into v_row from public.fin_forecasts where month = p_month;
  select max(l.month) into v_prev from public.fin_forecast_lines l where l.month < p_month;
  return jsonb_build_object(
    'month', p_month,
    'accounts', public._fin_forecast_accounts(),
    'lines', public._fin_forecast_cells(p_month),
    'updated_at', v_row.updated_at,
    'updated_by_name', (select u.name from public.app_users u where u.id = v_row.updated_by),
    'previous', case when v_prev is null then null
                     else jsonb_build_object('month', v_prev, 'lines', public._fin_forecast_cells(v_prev)) end,
    'planned_months', coalesce((select jsonb_agg(m.month order by m.month)
                                  from (select distinct l.month from public.fin_forecast_lines l) m), '[]'::jsonb)
  );
end;
$fn$;

-- The whole month at once. Every cell is checked; the first wrong one is named
-- and nothing is kept. An empty plan clears the month.
create or replace function public.fin_forecast_save(p_month text, p_lines jsonb, p_was timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_key    text;
  v_cell   jsonb;
  v_kind   text;
  v_name   text;
  v_amount numeric;
  v_share  numeric;
  v_now    timestamptz;
  v_saved  timestamptz;
begin
  if not coalesce(public.app_role()::text in ('finance', 'principal'), false) then
    raise exception 'Only Finance plans a forecast.' using errcode = '42501', detail = 'not_finance';
  end if;
  if coalesce(p_month, '') !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Choose the month.' using errcode = '22023', detail = 'month_invalid';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'object' then
    raise exception 'The plan could not be read.' using errcode = '22023', detail = 'lines_invalid';
  end if;

  for v_key, v_cell in select key, value from jsonb_each(p_lines) order by key loop
    v_kind := null;
    select a.kind, a.name into v_kind, v_name
      from public.gl_accounts a
     where a.code = v_key and not a.is_heading and a.kind in ('INCOME', 'EXPENSE');
    if v_kind is null then
      raise exception 'Account % cannot be planned: it is not an income or expense account.', v_key
        using errcode = 'P0001', detail = 'account_not_plannable';
    end if;
    if jsonb_typeof(v_cell) <> 'object' or (v_cell ? 'amount') = (v_cell ? 'share')
       or exists (select 1 from jsonb_object_keys(v_cell) k where k not in ('amount', 'share')) then
      raise exception '% %: plan an amount or a share, not both.', v_key, v_name
        using errcode = 'P0001', detail = 'cell_invalid';
    end if;
    if v_cell ? 'amount' then
      if jsonb_typeof(v_cell->'amount') <> 'number' then
        raise exception '% %: the amount is not a number.', v_key, v_name using errcode = 'P0001', detail = 'cell_invalid';
      end if;
      v_amount := (v_cell->>'amount')::numeric;
      if round(v_amount, 2) <> v_amount or abs(v_amount) >= 10000000000 then
        raise exception '% %: type the amount in ringgit and sen.', v_key, v_name using errcode = 'P0001', detail = 'cell_invalid';
      end if;
    else
      if v_kind = 'INCOME' then
        raise exception '% %: an income account is planned as an amount.', v_key, v_name
          using errcode = 'P0001', detail = 'income_needs_amount';
      end if;
      if jsonb_typeof(v_cell->'share') <> 'number' then
        raise exception '% %: the share is not a number.', v_key, v_name using errcode = 'P0001', detail = 'cell_invalid';
      end if;
      v_share := (v_cell->>'share')::numeric;
      if v_share <> trunc(v_share) or v_share < 0 or v_share > 1000000 then
        raise exception '% %: a share is 0%% or more, to two decimals.', v_key, v_name using errcode = 'P0001', detail = 'cell_invalid';
      end if;
    end if;
  end loop;

  -- Someone else saved this month after the page read it. The lock holds two
  -- first saves of the same month apart, when there is no row yet to lock.
  perform pg_advisory_xact_lock(hashtext('fin_forecast_save:' || p_month));
  select f.updated_at into v_saved from public.fin_forecasts f where f.month = p_month;
  if v_saved is distinct from p_was then
    raise exception 'Someone else saved this month after you opened it. Open it again to see their plan.'
      using errcode = '40001', detail = 'forecast_changed';
  end if;

  v_now := clock_timestamp();
  insert into public.fin_forecasts (month, updated_at, updated_by)
  values (p_month, v_now, (select u.id from public.app_users u where u.id = auth.uid()))
  on conflict (month) do update
    set updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  -- A cell the new plan no longer holds is cleared; the rest are written.
  delete from public.fin_forecast_lines l
   where l.month = p_month and not (p_lines ? l.account_code);
  insert into public.fin_forecast_lines (month, account_code, amount, share_bp)
  select p_month, e.key,
         case when e.value ? 'amount' then (e.value->>'amount')::numeric end,
         case when e.value ? 'share' then (e.value->>'share')::integer end
    from jsonb_each(p_lines) e
  on conflict (month, account_code) do update
    set amount = excluded.amount, share_bp = excluded.share_bp;
  return v_now;
end;
$fn$;

revoke all on function public.fin_forecast_read(text) from public, anon;
revoke all on function public.fin_forecast_save(text, jsonb, timestamptz) from public, anon;
grant execute on function public.fin_forecast_read(text) to authenticated;
grant execute on function public.fin_forecast_save(text, jsonb, timestamptz) to authenticated;

do $sanity$
begin
  if has_function_privilege('authenticated', 'public._fin_forecast_accounts()', 'execute')
     or has_function_privilege('authenticated', 'public._fin_forecast_cells(text)', 'execute') then
    raise exception '0646 sanity: an internal helper is callable from outside';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('fin_forecast_read', 'fin_forecast_save', '_fin_forecast_accounts', '_fin_forecast_cells')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0646 sanity: a forecast function lost security definer or its search_path';
  end if;
  -- 0570 §1: a key that names the chart follows a renumber.
  if exists (select 1 from pg_constraint c
              where c.conrelid = 'public.fin_forecast_lines'::regclass and c.contype = 'f'
                and c.confrelid = 'public.gl_accounts'::regclass and c.confupdtype <> 'c') then
    raise exception '0646 sanity: the plan does not follow a renumbered account';
  end if;
  -- 0554: the cost block is found by role, never by a number written here.
  if position('5100' in pg_get_functiondef('public._fin_forecast_accounts()'::regprocedure)) > 0
     or position('5000' in pg_get_functiondef('public._fin_forecast_accounts()'::regprocedure)) > 0 then
    raise exception '0646 sanity: an account number is written inside the accounts reader';
  end if;
  begin
    perform public.fin_forecast_read('2026-10');
    raise exception '0646 sanity: an anonymous caller was not refused';
  exception
    when insufficient_privilege then null;
  end;
end
$sanity$;

commit;
