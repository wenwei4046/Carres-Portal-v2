-- =============================================================================
-- 0507_a_supplier_paid_before_its_bill_is_an_advance_on_the_balance_sheet.sql
-- =============================================================================
-- WHAT WAS WRONG
--   A supplier advance (0484/0485) posts Dr 2110 / Cr bank on the day Carres
--   pays. The bill posts Cr 2110 later. Until the bills catch up, that
--   supplier's 2110 balance is below zero, and the Balance Sheet summed 2110
--   across all suppliers. So Payables could print as a negative liability
--   ("2110 Trade payables — suppliers RM -40.00": a RM 100 advance and a RM 60
--   bill), and one supplier's advance silently netted away another supplier's
--   bill. Money Carres paid a supplier before its bill is money the supplier
--   owes Carres in goods or cash, not a negative debt.
--
-- THE RULING (YH, 14 Sep 2026): mirror 0506 on the supplier side. Change the
--   REPORT only, never the posting.
--   - Payables = the sum of the per-supplier balances Carres OWES, on each
--     supplier control liability account (2110, and 2120 Other payables for an
--     other creditor, 0477 -- the advance goes to either, 0484).
--   - Suppliers whose balance is on the wrong side (Carres is owed) are shown
--     under Assets on 1230 "Advances to suppliers", as a positive amount.
--   - Assets and liabilities rise by the same amount, so the equation and its
--     difference are unchanged. The Trial Balance and the Self-check are NOT
--     touched: they show the accounts as booked.
--
-- WHY A NEW ACCOUNT
--   No account in the chart fits. 1220 Supplier claims receivable is the
--   control for supplier claims (0461); 1250 Loans and advances given is money
--   lent to other parties (0478), not money paid for goods not yet billed.
--   0484 kept the advance on the supplier's own payables control on purpose,
--   so the chart had no line for it until the report needed one. 1230 is the
--   free code in the 1200 group, beside 1220, the other supplier asset. ASSET,
--   not a control, active (the ruling). Nothing posts to it today; the report
--   adds the moved money to whatever it holds, as 0506 does on 2210.
--
-- WHAT THIS CHANGES
--   1. One chart row: 1230 Advances to suppliers (ASSET, under 1200).
--   2. gl_balance_sheet(date). The body is 0506's with the supplier side added:
--      a. v_adv_by_acct / v_adv: per supplier, per supplier control liability
--         account, the balance on the day; the ones below zero are summed
--         once, here, and nowhere else (Law D).
--      b. That account's ACCOUNT row prints its balance plus what was moved
--         out; 1230's row prints its balance plus v_adv. The header subtotals,
--         section totals and the equation read the same figures.
--      c. `reclassified` carries the supplier move too (negative on the
--         payable, positive on 1230). One column is ADDED AT THE END,
--         `reclassified_for`: whose money was moved -- 'CUSTOMER' on the
--         receivable and 2210, 'SUPPLIER' on the payable and 1230 (the words
--         of gl_accounts.control_for); null wherever `reclassified` is null.
--         A reader of the 0506 columns keeps working. The return type
--         changes, so the function is dropped and re-created in this
--         transaction (as 0506 did).
--   Guard, search_path and grants are unchanged in effect: gl_report_guard()
--   (gl_may_read(), which coalesces a NULL role to false) is still the first
--   statement; set search_path = public, pg_temp; EXECUTE is revoked from
--   public and anon (0482) and granted to authenticated.
--
-- RLS: none. DATA: one chart row (configuration); no ledger row is written.
-- DR/CR: none -- postings unchanged.
-- =============================================================================

begin;

insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for)
values ('1230', 'Advances to suppliers', 'ASSET', '1200', false, true, null)
on conflict (code) do nothing;

drop function if exists public.gl_balance_sheet(date);

create function public.gl_balance_sheet(p_as_of date)
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
  equation_difference numeric(14,2),
  reclassified        numeric(14,2),
  reclassified_for    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  -- Where customers' money paid before the invoice is shown. The account's own
  -- name ("Customer deposits held") is the line label.
  c_deposits constant text := '2210';
  -- Where money paid to suppliers before their bill is shown (0507). The
  -- account's own name ("Advances to suppliers") is the line label.
  c_advances constant text := '1230';
  v_go_live        date;
  v_assets         numeric(14,2);
  v_liab           numeric(14,2);
  v_equity         numeric(14,2);
  v_result         numeric(14,2);
  v_diff           numeric(14,2);
  v_moved_by_acct  jsonb;
  v_moved          numeric(14,2);
  v_adv_by_acct    jsonb;
  v_adv            numeric(14,2);
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
             null::numeric(14,2), null::boolean, null::numeric(14,2), null::numeric(14,2),
             null::text;
    return;
  end if;

  -- Customers who paid before their invoice (0506). Each customer's balance on
  -- each customer control asset account; a balance below zero is money held
  -- for that customer. Summed per account, computed once.
  select coalesce(jsonb_object_agg(c.acct, c.moved), '{}'::jsonb),
         coalesce(sum(c.moved), 0)::numeric(14,2)
  into v_moved_by_acct, v_moved
  from (
    select p.acct, sum(-p.bal)::numeric(14,2) as moved
    from (
      select l.account_code as acct,
             sum(l.debit - l.credit) as bal
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
      join public.gl_accounts a on a.code = l.account_code
      where e.posted
        and e.entry_date <= p_as_of
        and a.kind = 'ASSET'
        and a.control_for = 'CUSTOMER'
      group by l.account_code, l.party_type, l.party_id
    ) p
    where p.bal < 0
    group by p.acct
  ) c;

  -- Suppliers paid before their bill (0507). Each supplier's balance on each
  -- supplier control liability account; a balance below zero is money Carres
  -- paid that supplier ahead of its bills. Summed per account, computed once.
  select coalesce(jsonb_object_agg(c.acct, c.moved), '{}'::jsonb),
         coalesce(sum(c.moved), 0)::numeric(14,2)
  into v_adv_by_acct, v_adv
  from (
    select p.acct, sum(-p.bal)::numeric(14,2) as moved
    from (
      select l.account_code as acct,
             sum(l.credit - l.debit) as bal
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
      join public.gl_accounts a on a.code = l.account_code
      where e.posted
        and e.entry_date <= p_as_of
        and a.kind = 'LIABILITY'
        and a.control_for = 'SUPPLIER'
      group by l.account_code, l.party_type, l.party_id
    ) p
    where p.bal < 0
    group by p.acct
  ) c;

  -- The moved money needs a line to land on. Without it the totals below would
  -- still agree while the printed rows did not, so refuse instead.
  if v_moved <> 0 and not exists (
    select 1 from public.gl_accounts where code = c_deposits and kind = 'LIABILITY'
  ) then
    raise exception 'gl_balance_sheet: account % (LIABILITY) is missing', c_deposits
      using errcode = 'P0002';
  end if;
  if v_adv <> 0 and not exists (
    select 1 from public.gl_accounts where code = c_advances and kind = 'ASSET'
  ) then
    raise exception 'gl_balance_sheet: account % (ASSET) is missing', c_advances
      using errcode = 'P0002';
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

  -- The moved money leaves the wrong side of receivables and payables, so
  -- assets and liabilities each rise by both amounts: customer money onto
  -- customer deposits (0506), supplier money onto advances to suppliers (0507).
  v_assets := (v_assets + v_moved + v_adv)::numeric(14,2);
  v_liab   := (v_liab + v_moved + v_adv)::numeric(14,2);

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
  bs_raw as (
    select a.code, a.name, a.kind,
           coalesce(a.parent_code, a.code) as hdr,
           (case when a.kind = 'ASSET'
                 then coalesce(m.dr, 0) - coalesce(m.cr, 0)
                 else coalesce(m.cr, 0) - coalesce(m.dr, 0) end)::numeric(14,2) as booked,
           (case when a.code = c_deposits then v_moved
                 when a.code = c_advances then v_adv
                 when v_moved_by_acct ? a.code then -((v_moved_by_acct ->> a.code)::numeric)
                 when v_adv_by_acct ? a.code then -((v_adv_by_acct ->> a.code)::numeric)
                 else null end)::numeric(14,2) as moved,
           (case when a.code = c_deposits or v_moved_by_acct ? a.code then 'CUSTOMER'
                 when a.code = c_advances or v_adv_by_acct ? a.code then 'SUPPLIER'
                 else null end)::text as moved_for
    from public.gl_accounts a
    left join movement m on m.acct = a.code
    where a.kind in ('ASSET','LIABILITY','EQUITY')
      and (a.is_active or m.acct is not null
           or (a.code = c_deposits and v_moved <> 0)
           or (a.code = c_advances and v_adv <> 0))
  ),
  bs_accounts as (
    -- A control account's printed amount is its balance LESS the (negative)
    -- moved share, i.e. only the parties on the right side; 2210's and 1230's
    -- are their balance plus it.
    select r.code, r.name, r.kind, r.hdr,
           (r.booked + case when r.code in (c_deposits, c_advances) then coalesce(r.moved, 0)
                            else -coalesce(r.moved, 0) end)::numeric(14,2) as amt,
           r.moved,
           r.moved_for
    from bs_raw r
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
           b.amt                  as amt,
           b.moved                as moved,
           b.moved_for            as moved_for
    from bs_accounts b
    join sect_ord s on s.k = b.kind
    left join hdr_names hn on hn.code = b.hdr

    union all

    select s.o, b.hdr, 1, '',
           b.kind, 'HEADER_SUBTOTAL'::text,
           b.hdr, hn.name, null::text, null::text,
           sum(b.amt)::numeric(14,2),
           null::numeric(14,2), null::text
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
           v_result,
           null::numeric(14,2), null::text

    union all

    select s.o, null, 2, '',
           b.kind, 'SECTION_TOTAL'::text,
           null::text,
           ('Total ' || lower(b.kind))::text,
           null::text, null::text,
           (sum(b.amt) + case when b.kind = 'EQUITY' then v_result else 0 end)::numeric(14,2),
           null::numeric(14,2), null::text
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
           v_diff,
           null::numeric(14,2), null::text
  )
  select 'OK'::text, v_go_live, p_as_of,
         row_number() over (order by b2.sort1, b2.sort2 nulls last, b2.sort3, b2.sort4),
         b2.sect, b2.rk, b2.hcode, b2.hname, b2.acode, b2.aname, b2.amt,
         (v_diff = 0), v_diff, b2.moved, b2.moved_for
  from body b2
  order by b2.sort1, b2.sort2 nulls last, b2.sort3, b2.sort4;
end;
$$;

revoke all on function public.gl_balance_sheet(date) from public, anon;
grant execute on function public.gl_balance_sheet(date) to authenticated;

comment on function public.gl_balance_sheet(date) is
  'Balance sheet from ledger rows only (0465/0469). 0506: a customer whose receivable balance is below zero paid before the invoice; that money is shown on 2210 Customer deposits held and left out of receivables. 0507: a supplier whose payables balance is below zero was paid before its bill; that money is shown on 1230 Advances to suppliers and left out of payables. Report only, postings unchanged; column `reclassified` carries the amount moved and `reclassified_for` whose money it was (CUSTOMER / SUPPLIER). The unclosed result is derived into equity and the accounting equation is RETURNED (equation_balances / equation_difference), never assumed.';

do $sanity$
declare
  p regprocedure := to_regprocedure('public.gl_balance_sheet(date)');
begin
  if not exists (
    select 1 from public.gl_accounts
    where code = '1230' and name = 'Advances to suppliers' and kind = 'ASSET'
      and parent_code = '1200' and not is_control and is_active
  ) then
    raise exception '0507 sanity: 1230 is not Advances to suppliers (ASSET, under 1200, not a control, active)';
  end if;
  if p is null then
    raise exception '0507 sanity: gl_balance_sheet(date) is missing';
  end if;
  if pg_get_function_result(p) not like '%reclassified numeric, reclassified_for text)' then
    raise exception '0507 sanity: gl_balance_sheet does not end with reclassified, reclassified_for';
  end if;
  if has_function_privilege('anon', p, 'execute') then
    raise exception '0507 sanity: anon can execute gl_balance_sheet';
  end if;
  if not has_function_privilege('authenticated', p, 'execute') then
    raise exception '0507 sanity: authenticated cannot execute gl_balance_sheet';
  end if;
  if not exists (
    select 1 from pg_proc pr
    where pr.oid = p and pr.prosecdef
      and pr.proconfig @> array['search_path=public, pg_temp']
  ) then
    raise exception '0507 sanity: gl_balance_sheet lost security definer or its search_path';
  end if;
  if position('gl_report_guard()' in (select prosrc from pg_proc where oid = p)) = 0 then
    raise exception '0507 sanity: gl_balance_sheet no longer calls gl_report_guard()';
  end if;
  if position('not e.reversed' in (select prosrc from pg_proc where oid = p)) > 0 then
    raise exception '0507 sanity: gl_balance_sheet drops reversed originals again (0469)';
  end if;
end
$sanity$;

commit;
