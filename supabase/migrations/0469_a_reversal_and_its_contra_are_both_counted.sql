-- 0469 · A reversal and its contra are BOTH counted.
--
-- THE BUG (found 2026-09-10 while mapping the Ledger page, before any report
-- had a screen): `gl_reverse` stamps the ORIGINAL entry `reversed = true` and
-- posts a contra with the sides swapped. The contra itself is `reversed =
-- false`. Every report summed `where e.posted and not e.reversed`, so after a
-- void it dropped the original and kept the contra ALONE.
--
--   invoice RM 100 issued, then voided:
--     original  Dr 1210 100 / Cr 4100 100   reversed = true   <- excluded
--     contra    Dr 4100 100 / Cr 1210 100   reversed = false  <- counted
--   The trial balance read 4100 as RM 100 DEBIT and 1210 as RM 100 CREDIT:
--   the opposite sign of the truth, which is zero on both.
--
-- Total debits still equalled total credits (the contra balances on its own),
-- so `gl_ledger_health` said PASS while every account a void touched was
-- wrong. Houzs shipped exactly this and fixed it the same way: a cancelled
-- RM 10,000 invoice read as revenue MINUS 10,000.
--
-- THE RULE, now written down: `not reversed` answers "which entry is the ACTIVE
-- one for this document" (idempotency in gl_post, the entry a void must
-- reverse, "does this invoice have an entry"). It NEVER answers "which entries
-- count toward a balance". A balance sums every posted entry; the pair nets to
-- zero inside the original's period, because gl_reverse dates the contra on
-- the original's date.
--
-- WHAT CHANGES: the eight read functions below are re-created from their
-- latest definitions with the balance filter widened from
-- `e.posted and not e.reversed` to `e.posted`. Nothing else in their bodies
-- changes except the wording of health-check row 9. `gl_receivables_reconcile`
-- keeps its one legitimate `not reversed` (the unposted-invoice test).
--
-- DATA: none. This file writes no rows. The ledger rows were always right;
-- only the reads were wrong.

-- == gl_trial_balance_check (from 0462; 1 balance filter(s) widened)

create or replace function public.gl_trial_balance_check()
returns table (
  checked_at             timestamptz,
  go_live_on             date,
  entry_count            bigint,
  line_count             bigint,
  total_debit            numeric(12,2),
  total_credit           numeric(12,2),
  difference             numeric(12,2),
  header_mismatch_count  bigint,
  balanced               boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'gl_trial_balance_check refused: internal roles only'
      using errcode = '42501', detail = 'gl_trial_balance_check_forbidden';
  end if;

  return query
  with live as (
    select e.id, e.total_debit, e.total_credit
      from public.gl_entries e
     where e.posted
  ),
  sums as (
    select coalesce(sum(l.debit), 0)::numeric(12,2)  as d,
           coalesce(sum(l.credit), 0)::numeric(12,2) as c,
           count(*)::bigint                          as n
      from public.gl_entry_lines l
      join live on live.id = l.entry_id
  ),
  mismatch as (
    -- An entry whose HEADER totals disagree with the sum of its OWN lines.
    -- Only gl_post writes both, so a non-zero count here means something wrote
    -- around the gate.
    select count(*)::bigint as n
      from live
      left join lateral (
        select coalesce(sum(l.debit), 0) as d, coalesce(sum(l.credit), 0) as c
          from public.gl_entry_lines l where l.entry_id = live.id
      ) s on true
     where live.total_debit is distinct from s.d
        or live.total_credit is distinct from s.c
  )
  select now(),
         (select c.go_live_on from public.gl_config c where c.id),
         (select count(*)::bigint from live),
         sums.n,
         sums.d,
         sums.c,
         (sums.d - sums.c)::numeric(12,2),
         mismatch.n,
         (sums.d = sums.c and mismatch.n = 0)
    from sums, mismatch;
end;
$fn$;

-- == gl_trial_balance (from 0465; 1 balance filter(s) widened)

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
    where e.posted
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

-- == gl_account_ledger (from 0465; 2 balance filter(s) widened)

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
  where e.posted
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
    where e.posted
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

-- == gl_profit_and_loss (from 0465; 1 balance filter(s) widened)

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
    where e.posted
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

-- == gl_balance_sheet (from 0465; 2 balance filter(s) widened)

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
  where e.posted
    and e.entry_date <= p_as_of;

  v_diff := (v_assets - (v_liab + v_equity + v_result))::numeric(14,2);

  return query
  with movement as (
    select l.account_code as acct,
           sum(l.debit)::numeric(14,2)  as dr,
           sum(l.credit)::numeric(14,2) as cr
    from public.gl_entry_lines l
    join public.gl_entries e on e.id = l.entry_id
    where e.posted
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

-- == gl_party_statement (from 0465; 2 balance filter(s) widened)

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
  where e.posted
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
    where e.posted
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

-- == gl_ledger_health (from 0465; 7 balance filter(s) widened)

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
  where e.posted;

  -- ② a header that disagrees with its own lines
  select count(*) into v_hdr_mismatch
  from public.gl_entries e
  where e.posted
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
  where e.posted
    and not exists (select 1 from public.gl_accounts a where a.code = l.account_code);

  -- ④ a control line with no party, or a half-named one
  select count(*) into v_ctrl_noparty
  from public.gl_entry_lines l
  join public.gl_entries e  on e.id = l.entry_id
  join public.gl_accounts a on a.code = l.account_code
  where e.posted
    and a.is_control
    and (l.party_type is null or l.party_id is null);

  -- ⑤ an entry dated before the ledger started
  select count(*) into v_pre_go_live
  from public.gl_entries e
  where e.posted
    and v_go_live is not null
    and e.entry_date < v_go_live;

  -- ⑥ a posted entry with no lines at all
  select count(*) into v_no_lines
  from public.gl_entries e
  where e.posted
    and not exists (select 1 from public.gl_entry_lines l where l.entry_id = e.id);

  -- ⑦ the shape of the ledger
  select count(*), min(e.entry_date), max(e.entry_date)
    into v_posted, v_earliest, v_latest
  from public.gl_entries e
  where e.posted;

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

      (9::bigint, 'posted_entry_count', 'Posted entries',
       'INFO',
       v_posted || ' entries are posted. A reversed entry and its contra both count; together they net to zero.',
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

-- == gl_receivables_reconcile (from 0466; 1 balance filter(s) widened)

create or replace function public.gl_receivables_reconcile()
returns table (
  checked_at                     timestamptz,
  go_live_on                     date,
  ar_account_code                text,
  missing_first                  text,
  comparable                     boolean,
  ledger_ar_balance              numeric(12,2),
  operational_ar_balance         numeric(12,2),
  difference                     numeric(12,2),
  unposted_invoice_count         bigint,
  unposted_invoice_amount        numeric(12,2),
  storage_recognised_uncollected numeric(12,2),
  pre_go_live_open_count         bigint,
  pre_go_live_open_amount        numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live   date;
  v_ar        text;
  v_ar_error  text;
  v_ledger    numeric(12,2) := 0;
  v_inv       numeric(12,2) := 0;
  v_pay       numeric(12,2) := 0;
  v_unp_n     bigint := 0;
  v_unp_amt   numeric(12,2) := 0;
  v_stor      numeric(12,2) := 0;
  v_pre_n     bigint := 0;
  v_pre_amt   numeric(12,2) := 0;
  v_missing   text[] := array[]::text[];
begin
  if not public.gl_may_read() then
    raise exception 'gl_receivables_reconcile refused: internal roles only'
      using errcode = '42501', detail = 'gl_receivables_reconcile_forbidden';
  end if;

  select c.go_live_on into v_go_live from gl_config c where c.id;

  -- The chart may be unable to name the receivables account at all. That is a
  -- thing to REPORT, not a thing to raise on: the whole point of this function
  -- is to still return a row when something is wrong. This is the one
  -- exception handler in the file, and it wraps a read.
  begin
    v_ar := public.gl_ar_control_account();
  exception when others then
    v_ar_error := sqlerrm;
    v_ar := null;
  end;

  if v_go_live is null then
    v_missing := v_missing || 'the ledger has no go-live date (gl_config is empty), so neither side can be windowed';
  end if;
  if v_ar is null then
    v_missing := v_missing ||
      ('the chart cannot name one trade-receivables control account, so the ledger side could not be read — ' ||
       coalesce(v_ar_error, 'unknown reason'));
  end if;

  if v_ar is not null then
    select round(coalesce(sum(l.debit - l.credit), 0), 2)
      into v_ledger
      from gl_entry_lines l
      join gl_entries e on e.id = l.entry_id
     where l.account_code = v_ar
       and e.posted;
  end if;

  if v_go_live is not null then
    -- The operational side, on the ledger's own window.
    select round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_inv
      from invoices i
     where i.voided_at is null
       and i.issued_at >= v_go_live;

    -- Every receipt that reduces what a customer owes, storage included. 0465
    -- does not post the storage ones; that is exactly what makes `difference`
    -- non-zero and why the storage figure is reported beside it.
    select round(coalesce(sum(p.amount), 0), 2)
      into v_pay
      from order_payments p
     where p.voided_at is null
       and p.paid_on >= v_go_live
       and (p.counted_in_paid or p.kind = 'storage');

    -- Invoices this window should have posted and did not.
    select count(*)::bigint, round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_unp_n, v_unp_amt
      from invoices i
     where i.voided_at is null
       and i.issued_at >= v_go_live
       and round(i.amount + coalesce(i.tax_amount, 0), 2) <> 0
       and not exists (
         select 1 from gl_entries e
          where e.source_type = 'SALES_INVOICE'
            and e.source_doc_no = i.invoice_no
            and e.posted and not e.reversed);

    -- Storage money recognised on an invoice and collected without ever
    -- crediting receivables back (0465's kind = 'storage' skip).
    select round(coalesce(sum(p.amount), 0), 2)
      into v_stor
      from order_payments p
     where p.voided_at is null
       and p.kind = 'storage'
       and p.paid_on >= v_go_live;

    -- Not a comparability break, but the reason this balance is not total debt.
    select count(*)::bigint, round(coalesce(sum(i.amount + coalesce(i.tax_amount, 0)), 0), 2)
      into v_pre_n, v_pre_amt
      from invoices i
     where i.voided_at is null
       and i.issued_at < v_go_live;

    if v_unp_n > 0 then
      v_missing := v_missing || format(
        '%s invoice(s) issued on or after go-live carry no journal entry (RM %s of revenue never reached the ledger)',
        v_unp_n, v_unp_amt);
    end if;
    if v_stor <> 0 then
      v_missing := v_missing || format(
        'RM %s of storage receipts are recognised as revenue on an invoice but never credited back to receivables (0465 skips kind = ''storage''), so the ledger overstates what customers owe by that amount',
        v_stor);
    end if;
    if v_pre_n > 0 then
      v_missing := v_missing || format(
        '%s invoice(s) worth RM %s were issued before go-live and the ledger deliberately never saw them — this balance is post-go-live receivables, not total customer debt',
        v_pre_n, v_pre_amt);
    end if;
  end if;

  return query
  select now(),
         v_go_live,
         v_ar,
         case when array_length(v_missing, 1) is null
              then 'nothing — both sides were read in full'
              else array_to_string(v_missing, ' · ')
         end,
         (v_go_live is not null and v_ar is not null and v_unp_n = 0 and v_stor = 0),
         v_ledger,
         round(v_inv - v_pay, 2),
         round(v_ledger - (v_inv - v_pay), 2),
         v_unp_n,
         v_unp_amt,
         v_stor,
         v_pre_n,
         v_pre_amt;
end;
$fn$;

comment on function public.gl_trial_balance(date) is
  'Trial balance from every posted ledger row (0469: a reversed entry and its contra both count and net to zero). Zero-movement accounts appear with zeros; the final TOTAL row carries `balances`.';

-- == Sanity
do $sanity$
declare
  v_fn   text;
  v_src  text;
begin
  foreach v_fn in array array['gl_trial_balance_check','gl_trial_balance','gl_account_ledger',
                              'gl_profit_and_loss','gl_balance_sheet','gl_party_statement',
                              'gl_ledger_health'] loop
    select p.prosrc into v_src
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn;
    if v_src is null then
      raise exception '0469 sanity: % is missing', v_fn;
    end if;
    if position('not e.reversed' in v_src) > 0 then
      raise exception '0469 sanity: % still drops reversed originals from a balance', v_fn;
    end if;
  end loop;

  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gl_receivables_reconcile';
  if (length(v_src) - length(replace(v_src, 'not e.reversed', ''))) / length('not e.reversed') <> 1 then
    raise exception '0469 sanity: gl_receivables_reconcile must keep exactly one active-entry test';
  end if;

  -- The writers keep theirs: gl_post's idempotency looks for the ACTIVE entry.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gl_post';
  if position('not e.reversed' in v_src) = 0 then
    raise exception '0469 sanity: gl_post lost its active-entry idempotency test';
  end if;
end
$sanity$;
