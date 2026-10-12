-- =============================================================================
-- 0688_the_statements_show_stock_on_hand.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-12, docs/finance/MASTER.md §3.5 "Month-end stock
--   value: source", 「存货价值就不能定成我开P&L 时每次都是live 的，然后当jess
--   那边月底存货确认就 我这里储存起来不会再改」): the Profit and Loss and the
--   Balance Sheet show the stock value live each time they are opened, worked
--   out from Stock's Units and provisional. Storing a month once Stock's
--   Month-end Stock Confirmation confirms it waits for that confirmation,
--   which is not built.
--
-- WHAT THIS CHANGES
--   1. _fin_stock_on_hand(day): the stock on hand at the end of a day, the sum
--      of fin_stock_value's Unit values (0643), the one arithmetic Reports →
--      Stock value already prints. A Unit with no cost recorded adds nothing.
--   2. gl_profit_and_loss, for All departments: the opening stock account
--      (AutoCount's special SOS, 600-0000) carries the stock on hand at the
--      end of the day before the period, which adds to the cost of goods
--      sold; the closing stock account (SCS, 620-0000) carries the stock on
--      hand at the end of the period, which takes off it. Purchases already
--      post to the cost of goods sold (0477), so the period's cost becomes
--      opening stock + purchases - closing stock, as AutoCount's is.
--   3. gl_balance_sheet, for All departments: the stock account (SBS,
--      330-0000) shows the stock on hand on the day in place of what the books
--      hold on it, and the difference joins the result not yet closed, so the
--      sheet still balances. The line says what it added, as the money paid
--      ahead does (0506, 0507), with `reclassified_for` STOCK.
--   With a department chosen nothing changes: stock on hand is not split by
--   channel.
--
-- RLS: none. DATA: none. DR/CR: none; nothing is posted.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- Replace one exact snippet of a live function; refuse unless it occurs once.
-- A note inside a snippet that sits mid-line is a block comment, never `--`.
create or replace function pg_temp.mig0688_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0688: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · stock on hand at the end of a day ────────────────────────────────────
create function public._fin_stock_on_hand(p_day date)
returns numeric(14,2)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(sum((u ->> 'value')::numeric), 0)::numeric(14,2)
    from jsonb_array_elements(public.fin_stock_value(p_day) -> 'units') u
$fn$;

revoke all on function public._fin_stock_on_hand(date) from public, anon, authenticated;

comment on function public._fin_stock_on_hand(date) is
  '0688: the stock on hand at the end of a day, the sum of fin_stock_value''s Unit values (provisional until Stock confirms the month). Internal: the statements read it.';

-- ── 2 · the Profit and Loss ──────────────────────────────────────────────────
select pg_temp.mig0688_rewrite('public.gl_profit_and_loss(date, date, text, uuid)'::regprocedure,
$old$declare
  v_go_live date;
begin$old$,
$new$declare
  v_go_live date;
  v_sos     text;                       -- 0688
  v_scs     text;
  v_open    numeric(14,2) := 0;
  v_close   numeric(14,2) := 0;
begin$new$);

select pg_temp.mig0688_rewrite('public.gl_profit_and_loss(date, date, text, uuid)'::regprocedure,
$old$  return query
  with movement as ($old$,
$new$  -- 0688: stock on hand, for All departments only. Both accounts or neither.
  if p_department_type is null then
    select min(a.code) into v_sos from public.gl_accounts a
     where a.special = 'SOS' and a.kind = 'EXPENSE' and not a.is_heading;
    select min(a.code) into v_scs from public.gl_accounts a
     where a.special = 'SCS' and a.kind = 'EXPENSE' and not a.is_heading;
    if v_sos is not null and v_scs is not null then
      v_open  := public._fin_stock_on_hand(p_from - 1);
      v_close := public._fin_stock_on_hand(p_to);
    else
      v_sos := null;
      v_scs := null;
    end if;
  end if;

  return query
  with movement as ($new$);

select pg_temp.mig0688_rewrite('public.gl_profit_and_loss(date, date, text, uuid)'::regprocedure,
$old$           (case when a.kind = 'INCOME'
                 then coalesce(m.cr, 0) - coalesce(m.dr, 0)
                 else coalesce(m.dr, 0) - coalesce(m.cr, 0) end)::numeric(14,2) as amt,$old$,
$new$           (case when a.kind = 'INCOME'
                 then coalesce(m.cr, 0) - coalesce(m.dr, 0)
                 else coalesce(m.dr, 0) - coalesce(m.cr, 0) end
            -- 0688: opening stock adds to the cost of goods sold, closing stock takes off it.
            + case when a.code = v_sos then v_open when a.code = v_scs then -v_close else 0 end)::numeric(14,2) as amt,$new$);

-- ── 3 · the Balance Sheet ────────────────────────────────────────────────────
select pg_temp.mig0688_rewrite('public.gl_balance_sheet(date, text, uuid)'::regprocedure,
$old$  v_adv            numeric(14,2);
begin$old$,
$new$  v_adv            numeric(14,2);
  v_sbs            text;                -- 0688
  v_stock          numeric(14,2) := 0;
  v_stock_booked   numeric(14,2) := 0;
  v_stock_adj      numeric(14,2) := 0;
begin$new$);

select pg_temp.mig0688_rewrite('public.gl_balance_sheet(date, text, uuid)'::regprocedure,
$old$  -- The moved money leaves the wrong side of receivables and payables, so$old$,
$new$  -- 0688: stock on hand, for All departments only. The stock account shows
  -- what Stock's Units are worth on the day in place of what the books hold
  -- on it; the difference joins the result not yet closed, so the sheet
  -- still balances.
  if p_department_type is null then
    select min(a.code) into v_sbs from public.gl_accounts a
     where a.special = 'SBS' and a.kind = 'ASSET' and not a.is_heading;
    if v_sbs is not null then
      v_stock := public._fin_stock_on_hand(p_as_of);
      select coalesce(sum(l.debit - l.credit), 0)::numeric(14,2)
        into v_stock_booked
        from public.gl_entry_lines l
        join public.gl_entries e on e.id = l.entry_id
       where e.posted
         and e.entry_date <= p_as_of
         and l.account_code = v_sbs;
      v_stock_adj := (v_stock - v_stock_booked)::numeric(14,2);
      v_assets := (v_assets + v_stock_adj)::numeric(14,2);
      v_result := (v_result + v_stock_adj)::numeric(14,2);
    end if;
  end if;

  -- The moved money leaves the wrong side of receivables and payables, so$new$);

select pg_temp.mig0688_rewrite('public.gl_balance_sheet(date, text, uuid)'::regprocedure,
$old$                 when a.code = c_advances then v_adv
$old$,
$new$                 when a.code = c_advances then v_adv
                 when a.code = v_sbs and v_stock_adj <> 0 then v_stock_adj          -- 0688
$new$);

select pg_temp.mig0688_rewrite('public.gl_balance_sheet(date, text, uuid)'::regprocedure,
$old$                 when a.code = c_advances or v_adv_by_acct ? a.code then 'SUPPLIER'
$old$,
$new$                 when a.code = c_advances or v_adv_by_acct ? a.code then 'SUPPLIER'
                 when a.code = v_sbs and v_stock_adj <> 0 then 'STOCK'              -- 0688
$new$);

select pg_temp.mig0688_rewrite('public.gl_balance_sheet(date, text, uuid)'::regprocedure,
$old$           (r.booked + case when r.code in (c_deposits, c_advances) then coalesce(r.moved, 0)$old$,
$new$           (r.booked + case when r.code in (c_deposits, c_advances) or r.code = v_sbs /* 0688 */ then coalesce(r.moved, 0)$new$);

select pg_temp.mig0688_rewrite('public.gl_balance_sheet(date, text, uuid)'::regprocedure,
$old$'Derived from income and expense accounts up to the as-of date'::text,$old$,
$new$'Derived from income and expense accounts up to the as-of date, and stock on hand'::text,$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public.gl_profit_and_loss(date, date, text, uuid)'::regprocedure) into v_src;
  if position('_fin_stock_on_hand(p_from - 1)' in v_src) = 0 or position('_fin_stock_on_hand(p_to)' in v_src) = 0
     or position('gl_report_guard' in v_src) = 0 then
    raise exception '0688: the Profit and Loss does not read stock on hand, or lost its guard';
  end if;
  select pg_get_functiondef('public.gl_balance_sheet(date, text, uuid)'::regprocedure) into v_src;
  if position('_fin_stock_on_hand(p_as_of)' in v_src) = 0 or position('''STOCK''' in v_src) = 0
     or position('or r.code = v_sbs' in v_src) = 0 or position('gl_report_guard' in v_src) = 0 then
    raise exception '0688: the Balance Sheet does not show stock on hand, or lost its guard';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_fin_stock_on_hand', 'gl_profit_and_loss', 'gl_balance_sheet')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0688: a statement function lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._fin_stock_on_hand(date)', 'execute') then
    raise exception '0688: stock on hand can be read around the statements';
  end if;
end $sanity$;

commit;
