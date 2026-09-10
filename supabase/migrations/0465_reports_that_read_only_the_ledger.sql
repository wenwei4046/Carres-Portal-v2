-- =============================================================================
-- 0465_reports_that_read_only_the_ledger.sql
-- CARRES GENERAL LEDGER · AGENT E — THE READ SIDE
-- (build contract `.claude/LEDGER-CONTRACT.md`; rulings J/K/L/M/N.)
--
-- WHY THIS FILE EXISTS, in plain English.
--
-- Carres already has a "Reports" screen for finance. It shows a monthly profit
-- and loss table with Revenue, COGS, Gross profit, Opex and Net. Three of those
-- five columns are INVENTED. `finance_monthly_pl` (0064_finance_chunk_b_rpcs.sql
-- :219-291) takes the order totals for the month and then does this:
--
--     v_opex     numeric := 42000;   -- 0064:230
--     v_cogs_pct numeric := 0.55;    -- 0064:231
--     cogs := revenue * 0.55         -- 0064:266
--     opex := 42000                  -- 0064:267
--     net  := revenue - cogs - opex  -- 0064:268-270
--
-- Nobody bought anything for 55% of its selling price. Nobody spent RM 42,000.
-- The numbers were chosen so the chart would have a shape. A person reading that
-- screen is being shown a margin and a profit that no document in this business
-- can be traced back to, presented in the same typeface as the revenue figure,
-- which is real. That is worse than showing nothing, because it cannot be
-- disbelieved by looking at it. The functions below REPLACE it: every figure
-- here is a sum over `gl_entry_lines`, and if a figure cannot be derived from
-- the ledger it is not printed at all.
--
-- SO THE ONE RULE THIS FILE IS BUILT ON:
--
--     These functions read `gl_entries` and `gl_entry_lines` and the chart, and
--     NOTHING ELSE. Not `orders`, not `order_payments`, not `order_lines`, not
--     a percentage, not a constant. If the ledger does not know it, the report
--     does not claim it.
--
-- That is also why the reports are worth having. A report that reaches around
-- the ledger for a nicer number cannot be used to check the ledger — and
-- checking the ledger is the entire job of `gl_ledger_health()` below.
--
-- FOUR THINGS EVERY FUNCTION HERE DOES:
--
--   ① It returns `go_live_on` in its own result. Ruling L says the go-live date
--     is printed on every report that reads the ledger. Making it a returned
--     column means no screen, export or PDF can forget it — you cannot render
--     the rows without having the date in your hand.
--   ② Asking for a date before go-live returns an explicit BEFORE_GO_LIVE row,
--     never an empty set. "No rows" and "the ledger had not started yet" look
--     identical to a reader and mean completely different things.
--   ③ It re-checks `gl_may_read()` in its own body and RAISES. It fails CLOSED.
--     A caller with no session gets an error, never a clean empty table that
--     reads as "the business did nothing".
--   ④ Nothing is materialised. Every call recomputes from posted rows
--     (contract law 6). These are `stable`, never `immutable`, never a matview.
--
-- A NOTE ON THE BALANCE SHEET, because it is the one that surprises people.
-- This is a management ledger (ruling J) — there is no period close, so the
-- year's profit has never been journalled into an equity account. Raw account
-- balances therefore do NOT satisfy Assets = Liabilities + Equity; they miss by
-- exactly the profit. `gl_balance_sheet` closes that by deriving a
-- current-result row from the income and expense accounts and putting it inside
-- equity, where a closing entry would eventually put it. After that the equation
-- holds unless the ledger itself is broken — which is why any remaining
-- difference is returned as a value, on its own row, and not swept up.
--
-- Money columns coming out of these functions are numeric(14,2), not the
-- numeric(12,2) of the ledger itself (ruling N): a total of many rows is wider
-- than any one row, and rounding a report to fit the storage type would be a
-- lie about arithmetic.
-- =============================================================================


-- ── 0 · the guard, spelt once ────────────────────────────────────────────────
-- Every report calls this first. It does two jobs: refuse a caller who is not
-- internal, and hand back the go-live date the report is obliged to print.
-- Named `gl_report_*` so it can never collide with the write side's helpers.

create or replace function public.gl_report_guard()
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_go_live date;
begin
  -- FAIL CLOSED. An unauthenticated or non-internal caller gets an exception,
  -- not an empty result. An empty result is indistinguishable from a quiet
  -- month, and a permission failure must never be able to look like one.
  if not public.gl_may_read() then
    raise exception 'gl reports are internal only'
      using errcode = '42501';
  end if;

  select c.go_live_on into v_go_live from public.gl_config c where c.id;

  if v_go_live is null then
    raise exception 'gl_config has no go-live date; the ledger has not been started (ruling L)'
      using errcode = '55000';
  end if;

  return v_go_live;
end;
$$;

revoke all on function public.gl_report_guard() from public;
grant execute on function public.gl_report_guard() to authenticated;

comment on function public.gl_report_guard() is
  'Report gate (0465): raises for non-internal callers and returns gl_config.go_live_on so every report can print it (ruling L).';


-- ── 1 · trial balance ────────────────────────────────────────────────────────
-- Every account in the chart, including the ones that never moved — an account
-- that vanishes because it has no rows is how a missing posting hides. The last
-- row is the grand total, and it carries `balances`, which is the whole reason
-- a trial balance exists: debits and credits agree, or they do not.

create or replace function public.gl_trial_balance(p_as_of date)
returns table (
  report_status   text,
  go_live_on      date,
  as_of           date,
  ordinal         bigint,
  row_kind        text,
  account_code    text,
  account_name    text,
  kind            text,
  is_control      boolean,
  is_active       boolean,
  total_debit     numeric(14,2),
  total_credit    numeric(14,2),
  natural_balance numeric(14,2),
  balances        boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
begin
  v_go_live := public.gl_report_guard();

  if p_as_of is null then
    raise exception 'gl_trial_balance: p_as_of is required'
      using errcode = '22004';
  end if;

  -- Before the ledger starts is a STATEMENT, not an absence of rows.
  if p_as_of < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_as_of, 1::bigint, 'NOTICE'::text,
             null::text, null::text, null::text, null::boolean, null::boolean,
             null::numeric(14,2), null::numeric(14,2), null::numeric(14,2), null::boolean;
    return;
  end if;

  return query
  with movement as (
    select l.account_code                as acct,
           sum(l.debit)::numeric(14,2)   as dr,
           sum(l.credit)::numeric(14,2)  as cr
    from public.gl_entry_lines l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted and not e.reversed
      and e.entry_date <= p_as_of
    group by l.account_code
  ),
  per_account as (
    select a.code, a.name, a.kind, a.is_control, a.is_active,
           coalesce(m.dr, 0)::numeric(14,2) as dr,
           coalesce(m.cr, 0)::numeric(14,2) as cr
    from public.gl_accounts a
    left join movement m on m.acct = a.code
  ),
  body as (
    select 0                                  as sort1,
           p.code                             as sort2,
           row_number() over (order by p.code) as ord_hint,
           'ACCOUNT'::text                    as rk,
           p.code, p.name, p.kind, p.is_control, p.is_active,
           p.dr, p.cr,
           (case when p.kind in ('ASSET','EXPENSE')
                 then p.dr - p.cr
                 else p.cr - p.dr end)::numeric(14,2) as nat,
           null::boolean                      as bal
    from per_account p
    union all
    select 1, null, 0,
           'TOTAL'::text,
           null, 'All accounts', null, null, null,
           coalesce(sum(p.dr), 0)::numeric(14,2),
           coalesce(sum(p.cr), 0)::numeric(14,2),
           null::numeric(14,2),
           (coalesce(sum(p.dr), 0) = coalesce(sum(p.cr), 0))
    from per_account p
  )
  select 'OK'::text,
         v_go_live,
         p_as_of,
         row_number() over (order by b.sort1, b.sort2 nulls last),
         b.rk, b.code, b.name, b.kind, b.is_control, b.is_active,
         b.dr, b.cr, b.nat, b.bal
  from body b
  order by b.sort1, b.sort2 nulls last;
end;
$$;

revoke all on function public.gl_trial_balance(date) from public;
grant execute on function public.gl_trial_balance(date) to authenticated;

comment on function public.gl_trial_balance(date) is
  'Trial balance from posted, unreversed ledger rows only (0465). Zero-movement accounts appear with zeros; the final TOTAL row carries `balances`.';


-- ── 2 · one account, line by line, with a real opening balance ───────────────
-- The opening balance is the part people get wrong, so it is not a footnote and
-- not a subtitle: it is row one, row_kind 'OPENING', and the running balance of
-- the first real line is computed on top of it. Everything dated before p_from
-- is inside it. A CLOSING row repeats the end figure so an export cannot be cut
-- off mid-page and read as complete.

create or replace function public.gl_account_ledger(
  p_account_code text,
  p_from         date,
  p_to           date
)
returns table (
  report_status   text,
  go_live_on      date,
  period_from     date,
  period_to       date,
  account_code    text,
  account_name    text,
  kind            text,
  ordinal         bigint,
  row_kind        text,
  entry_date      date,
  entry_no        text,
  source_type     text,
  source_doc_no   text,
  narration       text,
  memo            text,
  party_type      text,
  party_id        uuid,
  debit           numeric(14,2),
  credit          numeric(14,2),
  running_balance numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
  v_name    text;
  v_kind    text;
  v_opening numeric(14,2);
begin
  v_go_live := public.gl_report_guard();

  if p_account_code is null or p_from is null or p_to is null then
    raise exception 'gl_account_ledger: p_account_code, p_from and p_to are all required'
      using errcode = '22004';
  end if;
  if p_to < p_from then
    raise exception 'gl_account_ledger: p_to (%) is earlier than p_from (%)', p_to, p_from
      using errcode = '22007';
  end if;

  select a.name, a.kind into v_name, v_kind
  from public.gl_accounts a
  where a.code = p_account_code;

  -- An account that is not in the chart is said out loud. Returning nothing
  -- would read as "this account had a quiet year".
  if v_name is null then
    return query
      select 'ACCOUNT_NOT_FOUND'::text, v_go_live, p_from, p_to,
             p_account_code, null::text, null::text,
             1::bigint, 'NOTICE'::text,
             null::date, null::text, null::text, null::text, null::text, null::text,
             null::text, null::uuid,
             null::numeric(14,2), null::numeric(14,2), null::numeric(14,2);
    return;
  end if;

  if p_to < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_from, p_to,
             p_account_code, v_name, v_kind,
             1::bigint, 'NOTICE'::text,
             null::date, null::text, null::text, null::text, null::text, null::text,
             null::text, null::uuid,
             null::numeric(14,2), null::numeric(14,2), null::numeric(14,2);
    return;
  end if;

  -- The opening balance: EVERYTHING before p_from, not just this financial year.
  select coalesce(sum(
           case when v_kind in ('ASSET','EXPENSE')
                then l.debit - l.credit
                else l.credit - l.debit end), 0)::numeric(14,2)
    into v_opening
  from public.gl_entry_lines l
  join public.gl_entries e on e.id = l.entry_id
  where e.posted and not e.reversed
    and l.account_code = p_account_code
    and e.entry_date < p_from;

  return query
  with in_window as (
    select e.entry_date  as ed,
           e.entry_no    as eno,
           e.source_type as st,
           e.source_doc_no as sdn,
           e.narration   as narr,
           l.line_no     as ln,
           l.memo        as mm,
           l.party_type  as pt,
           l.party_id    as pid,
           l.debit::numeric(14,2)  as dr,
           l.credit::numeric(14,2) as cr,
           (case when v_kind in ('ASSET','EXPENSE')
                 then l.debit - l.credit
                 else l.credit - l.debit end)::numeric(14,2) as signed_amt
    from public.gl_entry_lines l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted and not e.reversed
      and l.account_code = p_account_code
      and e.entry_date between p_from and p_to
  ),
  running as (
    select w.*,
           (v_opening + sum(w.signed_amt) over (
              order by w.ed, w.eno, w.ln
              rows between unbounded preceding and current row
           ))::numeric(14,2) as rb,
           row_number() over (order by w.ed, w.eno, w.ln) as rn
    from in_window w
  ),
  body as (
    -- row one, always, even when the window is empty
    select 0 as sort1, 0::bigint as sort2,
           'OPENING'::text as rk,
           null::date as ed, null::text as eno, null::text as st, null::text as sdn,
           'Opening balance'::text as narr,
           ('Everything posted before ' || p_from::text)::text as mm,
           null::text as pt, null::uuid as pid,
           null::numeric(14,2) as dr, null::numeric(14,2) as cr,
           v_opening as rb
    union all
    select 1, r.rn, 'LINE'::text,
           r.ed, r.eno, r.st, r.sdn, r.narr, r.mm, r.pt, r.pid, r.dr, r.cr, r.rb
    from running r
    union all
    select 2, 0::bigint, 'CLOSING'::text,
           null::date, null::text, null::text, null::text,
           'Closing balance'::text,
           ('As at ' || p_to::text)::text,
           null::text, null::uuid,
           (select coalesce(sum(w.dr), 0)::numeric(14,2) from in_window w),
           (select coalesce(sum(w.cr), 0)::numeric(14,2) from in_window w),
           (v_opening + (select coalesce(sum(w.signed_amt), 0) from in_window w))::numeric(14,2)
  )
  select 'OK'::text, v_go_live, p_from, p_to,
         p_account_code, v_name, v_kind,
         row_number() over (order by b.sort1, b.sort2),
         b.rk, b.ed, b.eno, b.st, b.sdn, b.narr, b.mm, b.pt, b.pid, b.dr, b.cr, b.rb
  from body b
  order by b.sort1, b.sort2;
end;
$$;

revoke all on function public.gl_account_ledger(text, date, date) from public;
grant execute on function public.gl_account_ledger(text, date, date) to authenticated;

comment on function public.gl_account_ledger(text, date, date) is
  'One account, date then entry-no order, with a real OPENING row computed from everything before p_from (0465). Ledger tables only.';


-- ── 3 · profit and loss, replacing the invented one ──────────────────────────
-- This is the function that retires `finance_monthly_pl` (0064:219). Income and
-- expense accounts, grouped by the header they hang off, subtotalled, and a net
-- figure. There is no COGS percentage and no opex constant anywhere below: an
-- expense appears here because somebody posted it.

create or replace function public.gl_profit_and_loss(
  p_from date,
  p_to   date
)
returns table (
  report_status text,
  go_live_on    date,
  period_from   date,
  period_to     date,
  ordinal       bigint,
  section       text,
  row_kind      text,
  header_code   text,
  header_name   text,
  account_code  text,
  account_name  text,
  amount        numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
begin
  v_go_live := public.gl_report_guard();

  if p_from is null or p_to is null then
    raise exception 'gl_profit_and_loss: p_from and p_to are both required'
      using errcode = '22004';
  end if;
  if p_to < p_from then
    raise exception 'gl_profit_and_loss: p_to (%) is earlier than p_from (%)', p_to, p_from
      using errcode = '22007';
  end if;

  if p_to < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_from, p_to, 1::bigint,
             null::text, 'NOTICE'::text, null::text, null::text, null::text, null::text,
             null::numeric(14,2);
    return;
  end if;

  return query
  with movement as (
    select l.account_code as acct,
           sum(l.debit)::numeric(14,2)  as dr,
           sum(l.credit)::numeric(14,2) as cr
    from public.gl_entry_lines l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted and not e.reversed
      and e.entry_date between p_from and p_to
    group by l.account_code
  ),
  pl_accounts as (
    select a.code,
           a.name,
           a.kind,
           coalesce(a.parent_code, a.code) as hdr,
           -- income reads credit-positive, expense reads debit-positive, so both
           -- sections are printed as plain positive amounts and the net figure
           -- is income minus expense with no sign gymnastics on the screen.
           (case when a.kind = 'INCOME'
                 then coalesce(m.cr, 0) - coalesce(m.dr, 0)
                 else coalesce(m.dr, 0) - coalesce(m.cr, 0) end)::numeric(14,2) as amt
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    where a.kind in ('INCOME','EXPENSE')
      and (a.is_active or m.acct is not null)   -- retired accounts still show if they moved
  ),
  hdr_names as (
    select h.code, h.name from public.gl_accounts h
  ),
  body as (
    select case when p.kind = 'INCOME' then 1 else 2 end as sort1,
           p.hdr                                          as sort2,
           0                                              as sort3,
           p.code                                         as sort4,
           p.kind                                         as sect,
           'ACCOUNT'::text                                as rk,
           p.hdr                                          as hcode,
           hn.name                                        as hname,
           p.code                                         as acode,
           p.name                                         as aname,
           p.amt                                          as amt
    from pl_accounts p
    left join hdr_names hn on hn.code = p.hdr

    union all

    select case when p.kind = 'INCOME' then 1 else 2 end,
           p.hdr, 1, '',
           p.kind, 'HEADER_SUBTOTAL'::text,
           p.hdr, hn.name,
           null::text, null::text,
           sum(p.amt)::numeric(14,2)
    from pl_accounts p
    left join hdr_names hn on hn.code = p.hdr
    group by 1, p.hdr, hn.name, p.kind

    union all

    select case when p.kind = 'INCOME' then 1 else 2 end,
           null, 2, '',
           p.kind, 'SECTION_TOTAL'::text,
           null::text,
           case when p.kind = 'INCOME' then 'Total income' else 'Total expense' end,
           null::text, null::text,
           sum(p.amt)::numeric(14,2)
    from pl_accounts p
    group by 1, p.kind

    union all

    select 3, null, 0, '',
           'NET'::text, 'NET'::text,
           null::text, 'Net result for the period'::text,
           null::text, null::text,
           coalesce(sum(case when p.kind = 'INCOME' then p.amt else -p.amt end), 0)::numeric(14,2)
    from pl_accounts p
  )
  select 'OK'::text, v_go_live, p_from, p_to,
         row_number() over (order by b.sort1, b.sort2 nulls last, b.sort3, b.sort4),
         b.sect, b.rk, b.hcode, b.hname, b.acode, b.aname, b.amt
  from body b
  order by b.sort1, b.sort2 nulls last, b.sort3, b.sort4;
end;
$$;

revoke all on function public.gl_profit_and_loss(date, date) from public;
grant execute on function public.gl_profit_and_loss(date, date) to authenticated;

comment on function public.gl_profit_and_loss(date, date) is
  'P&L from gl_entry_lines only (0465). Replaces finance_monthly_pl (0064:219-291), whose COGS was revenue*0.55 and whose opex was a constant 42000.';


-- ── 4 · balance sheet, with the equation returned rather than assumed ────────
-- Assets, liabilities, equity, grouped by header. Because a management ledger
-- never closes a period, the profit earned so far lives in the income and
-- expense accounts rather than in equity — so it is derived here and shown, on
-- its own row, inside equity. What is left over after that is a genuine defect
-- in the ledger, and it is returned as `equation_difference` on an EQUATION row
-- that is always present. A balance sheet that quietly balances because nobody
-- checked is not a balance sheet.

create or replace function public.gl_balance_sheet(p_as_of date)
returns table (
  report_status       text,
  go_live_on          date,
  as_of               date,
  ordinal             bigint,
  section             text,
  row_kind            text,
  header_code         text,
  header_name         text,
  account_code        text,
  account_name        text,
  amount              numeric(14,2),
  equation_balances   boolean,
  equation_difference numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live  date;
  v_assets   numeric(14,2);
  v_liab     numeric(14,2);
  v_equity   numeric(14,2);
  v_result   numeric(14,2);
  v_diff     numeric(14,2);
begin
  v_go_live := public.gl_report_guard();

  if p_as_of is null then
    raise exception 'gl_balance_sheet: p_as_of is required'
      using errcode = '22004';
  end if;

  if p_as_of < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_as_of, 1::bigint,
             null::text, 'NOTICE'::text, null::text, null::text, null::text, null::text,
             null::numeric(14,2), null::boolean, null::numeric(14,2);
    return;
  end if;

  -- The three section totals and the undistributed result, computed once so the
  -- equation row is arithmetic on the same numbers the rows below print.
  --
  -- The result line reads `credit - debit` for BOTH income and expense on
  -- purpose. Profit is income minus expense; income is credit-positive and
  -- expense is debit-positive, so
  --     (credit-debit for income) - (debit-credit for expense)
  --   = (credit-debit for income) + (credit-debit for expense)
  -- and the two collapse into one expression. An expense therefore lands here
  -- as a negative number, which is exactly what reduces equity.
  select
    coalesce(sum(case when a.kind = 'ASSET'     then l.debit  - l.credit else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind = 'LIABILITY' then l.credit - l.debit  else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind = 'EQUITY'    then l.credit - l.debit  else 0 end), 0)::numeric(14,2),
    coalesce(sum(case when a.kind in ('INCOME','EXPENSE')
                      then l.credit - l.debit else 0 end), 0)::numeric(14,2)
  into v_assets, v_liab, v_equity, v_result
  from public.gl_entry_lines l
  join public.gl_entries e on e.id = l.entry_id
  join public.gl_accounts a on a.code = l.account_code
  where e.posted and not e.reversed
    and e.entry_date <= p_as_of;

  v_diff := (v_assets - (v_liab + v_equity + v_result))::numeric(14,2);

  return query
  with movement as (
    select l.account_code as acct,
           sum(l.debit)::numeric(14,2)  as dr,
           sum(l.credit)::numeric(14,2) as cr
    from public.gl_entry_lines l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted and not e.reversed
      and e.entry_date <= p_as_of
    group by l.account_code
  ),
  bs_accounts as (
    select a.code, a.name, a.kind,
           coalesce(a.parent_code, a.code) as hdr,
           (case when a.kind = 'ASSET'
                 then coalesce(m.dr, 0) - coalesce(m.cr, 0)
                 else coalesce(m.cr, 0) - coalesce(m.dr, 0) end)::numeric(14,2) as amt
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    where a.kind in ('ASSET','LIABILITY','EQUITY')
      and (a.is_active or m.acct is not null)
  ),
  hdr_names as (
    select h.code, h.name from public.gl_accounts h
  ),
  sect_ord as (
    select 'ASSET'::text as k, 1 as o
    union all select 'LIABILITY', 2
    union all select 'EQUITY', 3
  ),
  body as (
    select s.o                    as sort1,
           b.hdr                  as sort2,
           0                      as sort3,
           b.code                 as sort4,
           b.kind                 as sect,
           'ACCOUNT'::text        as rk,
           b.hdr                  as hcode,
           hn.name                as hname,
           b.code                 as acode,
           b.name                 as aname,
           b.amt                  as amt
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    left join hdr_names hn on hn.code = b.hdr

    union all

    select s.o, b.hdr, 1, '',
           b.kind, 'HEADER_SUBTOTAL'::text,
           b.hdr, hn.name, null::text, null::text,
           sum(b.amt)::numeric(14,2)
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    left join hdr_names hn on hn.code = b.hdr
    group by s.o, b.hdr, hn.name, b.kind

    union all

    -- the profit nobody has closed yet, sitting where a closing entry would put it
    select 3, null, 1, 'zz',
           'EQUITY'::text, 'DERIVED'::text,
           null::text,
           'Result not yet closed to equity'::text,
           null::text,
           'Derived from income and expense accounts up to the as-of date'::text,
           v_result

    union all

    select s.o, null, 2, '',
           b.kind, 'SECTION_TOTAL'::text,
           null::text,
           ('Total ' || lower(b.kind))::text,
           null::text, null::text,
           (sum(b.amt) + case when b.kind = 'EQUITY' then v_result else 0 end)::numeric(14,2)
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    group by s.o, b.kind

    union all

    -- always emitted, healthy or not
    select 4, null, 0, '',
           'CHECK'::text, 'EQUATION'::text,
           null::text,
           'Assets minus (liabilities + equity + unclosed result)'::text,
           null::text, null::text,
           v_diff
  )
  select 'OK'::text, v_go_live, p_as_of,
         row_number() over (order by b2.sort1, b2.sort2 nulls last, b2.sort3, b2.sort4),
         b2.sect, b2.rk, b2.hcode, b2.hname, b2.acode, b2.aname, b2.amt,
         (v_diff = 0), v_diff
  from body b2
  order by b2.sort1, b2.sort2 nulls last, b2.sort3, b2.sort4;
end;
$$;

revoke all on function public.gl_balance_sheet(date) from public;
grant execute on function public.gl_balance_sheet(date) to authenticated;

comment on function public.gl_balance_sheet(date) is
  'Balance sheet from ledger rows only (0465). The unclosed result is derived into equity and the accounting equation is RETURNED (equation_balances / equation_difference), never assumed.';


-- ── 5 · one party, one statement ─────────────────────────────────────────────
-- What one customer or one supplier did on the control accounts, in order, with
-- the opening balance as a real first row. Control accounts only, because a
-- party is only ever attached to a control line (contract, party rule).

create or replace function public.gl_party_statement(
  p_party_type text,
  p_party_id   uuid,
  p_from       date,
  p_to         date
)
returns table (
  report_status   text,
  go_live_on      date,
  period_from     date,
  period_to       date,
  party_type      text,
  party_id        uuid,
  ordinal         bigint,
  row_kind        text,
  entry_date      date,
  entry_no        text,
  source_type     text,
  source_doc_no   text,
  account_code    text,
  account_name    text,
  narration       text,
  memo            text,
  debit           numeric(14,2),
  credit          numeric(14,2),
  running_balance numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live date;
  v_opening numeric(14,2);
begin
  v_go_live := public.gl_report_guard();

  if p_party_type is null or p_party_id is null or p_from is null or p_to is null then
    raise exception 'gl_party_statement: p_party_type, p_party_id, p_from and p_to are all required'
      using errcode = '22004';
  end if;
  if p_party_type not in ('CUSTOMER','SUPPLIER') then
    raise exception 'gl_party_statement: p_party_type must be CUSTOMER or SUPPLIER, got %', p_party_type
      using errcode = '22023';
  end if;
  if p_to < p_from then
    raise exception 'gl_party_statement: p_to (%) is earlier than p_from (%)', p_to, p_from
      using errcode = '22007';
  end if;

  if p_to < v_go_live then
    return query
      select 'BEFORE_GO_LIVE'::text, v_go_live, p_from, p_to, p_party_type, p_party_id,
             1::bigint, 'NOTICE'::text,
             null::date, null::text, null::text, null::text, null::text, null::text,
             null::text, null::text,
             null::numeric(14,2), null::numeric(14,2), null::numeric(14,2);
    return;
  end if;

  select coalesce(sum(
           case when a.kind in ('ASSET','EXPENSE')
                then l.debit - l.credit
                else l.credit - l.debit end), 0)::numeric(14,2)
    into v_opening
  from public.gl_entry_lines l
  join public.gl_entries e  on e.id = l.entry_id
  join public.gl_accounts a on a.code = l.account_code
  where e.posted and not e.reversed
    and a.is_control
    and l.party_type = p_party_type
    and l.party_id   = p_party_id
    and e.entry_date < p_from;

  return query
  with in_window as (
    select e.entry_date as ed, e.entry_no as eno, e.source_type as st,
           e.source_doc_no as sdn, e.narration as narr,
           l.line_no as ln, l.memo as mm,
           a.code as acode, a.name as aname,
           l.debit::numeric(14,2)  as dr,
           l.credit::numeric(14,2) as cr,
           (case when a.kind in ('ASSET','EXPENSE')
                 then l.debit - l.credit
                 else l.credit - l.debit end)::numeric(14,2) as signed_amt
    from public.gl_entry_lines l
    join public.gl_entries e  on e.id = l.entry_id
    join public.gl_accounts a on a.code = l.account_code
    where e.posted and not e.reversed
      and a.is_control
      and l.party_type = p_party_type
      and l.party_id   = p_party_id
      and e.entry_date between p_from and p_to
  ),
  running as (
    select w.*,
           (v_opening + sum(w.signed_amt) over (
              order by w.ed, w.eno, w.ln
              rows between unbounded preceding and current row
           ))::numeric(14,2) as rb,
           row_number() over (order by w.ed, w.eno, w.ln) as rn
    from in_window w
  ),
  body as (
    select 0 as sort1, 0::bigint as sort2, 'OPENING'::text as rk,
           null::date as ed, null::text as eno, null::text as st, null::text as sdn,
           null::text as acode, null::text as aname,
           'Opening balance'::text as narr,
           ('Everything posted before ' || p_from::text)::text as mm,
           null::numeric(14,2) as dr, null::numeric(14,2) as cr,
           v_opening as rb
    union all
    select 1, r.rn, 'LINE'::text,
           r.ed, r.eno, r.st, r.sdn, r.acode, r.aname, r.narr, r.mm, r.dr, r.cr, r.rb
    from running r
    union all
    select 2, 0::bigint, 'CLOSING'::text,
           null::date, null::text, null::text, null::text, null::text, null::text,
           'Closing balance'::text,
           ('As at ' || p_to::text)::text,
           (select coalesce(sum(w.dr), 0)::numeric(14,2) from in_window w),
           (select coalesce(sum(w.cr), 0)::numeric(14,2) from in_window w),
           (v_opening + (select coalesce(sum(w.signed_amt), 0) from in_window w))::numeric(14,2)
  )
  select 'OK'::text, v_go_live, p_from, p_to, p_party_type, p_party_id,
         row_number() over (order by b.sort1, b.sort2),
         b.rk, b.ed, b.eno, b.st, b.sdn, b.acode, b.aname, b.narr, b.mm, b.dr, b.cr, b.rb
  from body b
  order by b.sort1, b.sort2;
end;
$$;

revoke all on function public.gl_party_statement(text, uuid, date, date) from public;
grant execute on function public.gl_party_statement(text, uuid, date, date) to authenticated;

comment on function public.gl_party_statement(text, uuid, date, date) is
  'One party''s control-account activity with a real OPENING row (0465). Party by id, never by name. Ledger tables only.';


-- ── 6 · the self-check ───────────────────────────────────────────────────────
-- The most important function in this file, and the one that makes the rest of
-- it trustworthy. It asks the ledger the questions a person would ask if they
-- did not believe it, and it answers them in rows.
--
-- IT ALWAYS RETURNS EVERY ROW. A healthy ledger returns eleven rows that say OK
-- and INFO; a broken one returns the same eleven rows with FAIL in some of them.
-- What it never returns is nothing — because "nothing" is also what a query
-- returns when it is pointed at the wrong schema, when a filter is inverted,
-- when a join drops every row, or when it simply was not run. A green result
-- that is one character away from an empty result is not a check. So:
--
--     healthy  →  11 rows, row 1 says PASS, no row says FAIL
--     broken   →  11 rows, row 1 says FAIL and names how many checks failed
--     empty    →  the function is broken. Treat it as a red alarm, not a pass.
--
-- Several of these checks are also enforced by constraints on the tables. They
-- are checked anyway. A constraint proves what could not be inserted through the
-- constraint; it proves nothing about what a future migration, a restore, a
-- superuser session or a dropped constraint let past. The check costs one scan
-- and it is the only thing standing between the business and a plausible number.

create or replace function public.gl_ledger_health()
returns table (
  ordinal       bigint,
  check_key     text,
  check_label   text,
  status        text,
  detail        text,
  count_value   bigint,
  amount_value  numeric(14,2),
  date_value    date,
  go_live_on    date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_go_live       date;
  v_total_dr      numeric(14,2) := 0;
  v_total_cr      numeric(14,2) := 0;
  v_hdr_mismatch  bigint := 0;
  v_orphan_lines  bigint := 0;
  v_ctrl_noparty  bigint := 0;
  v_pre_go_live   bigint := 0;
  v_no_lines      bigint := 0;
  v_posted        bigint := 0;
  v_earliest      date;
  v_latest        date;
  v_fails         int := 0;
begin
  -- Fail closed, same as every other report here.
  if not public.gl_may_read() then
    raise exception 'gl reports are internal only'
      using errcode = '42501';
  end if;

  select c.go_live_on into v_go_live from public.gl_config c where c.id;

  -- ① the whole ledger, both sides
  select coalesce(sum(l.debit), 0)::numeric(14,2),
         coalesce(sum(l.credit), 0)::numeric(14,2)
    into v_total_dr, v_total_cr
  from public.gl_entry_lines l
  join public.gl_entries e on e.id = l.entry_id
  where e.posted and not e.reversed;

  -- ② a header that disagrees with its own lines
  select count(*) into v_hdr_mismatch
  from public.gl_entries e
  where e.posted and not e.reversed
    and (
         e.total_debit is distinct from (
           select coalesce(sum(l.debit), 0)
           from public.gl_entry_lines l where l.entry_id = e.id)
      or e.total_credit is distinct from (
           select coalesce(sum(l.credit), 0)
           from public.gl_entry_lines l where l.entry_id = e.id)
    );

  -- ③ a line pointing at an account that is not in the chart
  select count(*) into v_orphan_lines
  from public.gl_entry_lines l
  join public.gl_entries e on e.id = l.entry_id
  where e.posted and not e.reversed
    and not exists (select 1 from public.gl_accounts a where a.code = l.account_code);

  -- ④ a control line with no party, or a half-named one
  select count(*) into v_ctrl_noparty
  from public.gl_entry_lines l
  join public.gl_entries e  on e.id = l.entry_id
  join public.gl_accounts a on a.code = l.account_code
  where e.posted and not e.reversed
    and a.is_control
    and (l.party_type is null or l.party_id is null);

  -- ⑤ an entry dated before the ledger started
  select count(*) into v_pre_go_live
  from public.gl_entries e
  where e.posted and not e.reversed
    and v_go_live is not null
    and e.entry_date < v_go_live;

  -- ⑥ a posted entry with no lines at all
  select count(*) into v_no_lines
  from public.gl_entries e
  where e.posted and not e.reversed
    and not exists (select 1 from public.gl_entry_lines l where l.entry_id = e.id);

  -- ⑦ the shape of the ledger
  select count(*), min(e.entry_date), max(e.entry_date)
    into v_posted, v_earliest, v_latest
  from public.gl_entries e
  where e.posted and not e.reversed;

  v_fails :=
      (case when v_total_dr <> v_total_cr then 1 else 0 end)
    + (case when v_hdr_mismatch  > 0 then 1 else 0 end)
    + (case when v_orphan_lines  > 0 then 1 else 0 end)
    + (case when v_ctrl_noparty  > 0 then 1 else 0 end)
    + (case when v_pre_go_live   > 0 then 1 else 0 end)
    + (case when v_no_lines      > 0 then 1 else 0 end)
    + (case when v_go_live is null then 1 else 0 end);

  return query
  select r.ord, r.k, r.lbl, r.st, r.det, r.cnt, r.amt, r.dt, v_go_live
  from (
    values
      (1::bigint, 'overall', 'Ledger self-check',
       case when v_fails = 0 then 'PASS' else 'FAIL' end,
       case when v_fails = 0
            then 'All 7 checks passed. This row exists so a healthy ledger looks different from a query that returned nothing.'
            else v_fails || ' of 7 checks failed. Read the FAIL rows below.' end,
       v_fails::bigint, null::numeric(14,2), null::date),

      (2::bigint, 'debits_equal_credits', 'Total debits equal total credits',
       case when v_total_dr = v_total_cr then 'OK' else 'FAIL' end,
       'Debits ' || v_total_dr || ' against credits ' || v_total_cr,
       null::bigint, (v_total_dr - v_total_cr)::numeric(14,2), null::date),

      (3::bigint, 'entry_header_matches_lines', 'Every entry header agrees with its own lines',
       case when v_hdr_mismatch = 0 then 'OK' else 'FAIL' end,
       case when v_hdr_mismatch = 0
            then 'Every posted entry''s total_debit and total_credit equal the sum of its lines.'
            else v_hdr_mismatch || ' entries carry header totals their lines do not add up to.' end,
       v_hdr_mismatch, null::numeric(14,2), null::date),

      (4::bigint, 'lines_on_unknown_account', 'Every line names an account that is in the chart',
       case when v_orphan_lines = 0 then 'OK' else 'FAIL' end,
       case when v_orphan_lines = 0
            then 'No posted line points at an account code the chart does not hold.'
            else v_orphan_lines || ' posted lines point at an account code missing from gl_accounts.' end,
       v_orphan_lines, null::numeric(14,2), null::date),

      (5::bigint, 'control_line_missing_party', 'Every control-account line names a party',
       case when v_ctrl_noparty = 0 then 'OK' else 'FAIL' end,
       case when v_ctrl_noparty = 0
            then 'Every AR/AP line carries both party_type and party_id.'
            else v_ctrl_noparty || ' control-account lines have no party, so they belong to nobody.' end,
       v_ctrl_noparty, null::numeric(14,2), null::date),

      (6::bigint, 'entry_before_go_live', 'No entry is dated before the ledger started',
       case when v_pre_go_live = 0 then 'OK' else 'FAIL' end,
       case when v_pre_go_live = 0
            then 'Nothing is posted earlier than the go-live date.'
            else v_pre_go_live || ' posted entries are dated before go-live; the posting gate should have refused them.' end,
       v_pre_go_live, null::numeric(14,2), null::date),

      (7::bigint, 'entry_without_lines', 'No posted entry is empty',
       case when v_no_lines = 0 then 'OK' else 'FAIL' end,
       case when v_no_lines = 0
            then 'Every posted entry has at least one line.'
            else v_no_lines || ' posted entries have no lines at all.' end,
       v_no_lines, null::numeric(14,2), null::date),

      (8::bigint, 'go_live_on', 'Configured go-live date (ruling L)',
       case when v_go_live is null then 'FAIL' else 'INFO' end,
       case when v_go_live is null
            then 'gl_config holds no go-live date. Every report that reads the ledger is obliged to print one.'
            else 'The ledger starts on ' || v_go_live || '. Nothing before this date is in it, by design.' end,
       null::bigint, null::numeric(14,2), v_go_live),

      (9::bigint, 'posted_entry_count', 'Posted, unreversed entries',
       'INFO',
       v_posted || ' entries are posted and not reversed.',
       v_posted, null::numeric(14,2), null::date),

      (10::bigint, 'earliest_entry_date', 'Earliest posted entry',
       'INFO',
       coalesce('The first posted entry is dated ' || v_earliest, 'The ledger holds no posted entries yet.'),
       null::bigint, null::numeric(14,2), v_earliest),

      (11::bigint, 'latest_entry_date', 'Latest posted entry',
       'INFO',
       coalesce('The last posted entry is dated ' || v_latest, 'The ledger holds no posted entries yet.'),
       null::bigint, null::numeric(14,2), v_latest)
  ) as r(ord, k, lbl, st, det, cnt, amt, dt)
  order by r.ord;
end;
$$;

revoke all on function public.gl_ledger_health() from public;
grant execute on function public.gl_ledger_health() to authenticated;

comment on function public.gl_ledger_health() is
  'Falsifiable ledger self-check (0465). ALWAYS returns 11 labelled rows: row 1 is PASS or FAIL. An empty result means the function itself is broken, never that the ledger is clean.';
