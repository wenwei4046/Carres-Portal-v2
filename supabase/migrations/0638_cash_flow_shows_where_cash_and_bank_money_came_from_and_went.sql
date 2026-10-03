-- =============================================================================
-- 0638_cash_flow_shows_where_cash_and_bank_money_came_from_and_went.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Finance had no report of the money that actually came into and went out of
--   the cash and bank accounts over a period, and what it was for. Chew
--   (Finance) listed Cash Flow among the reports on 2026-10-03
--   (docs/finance/MASTER.md §3.6), after the Houzs reference (Part 10 §4: a
--   receipts and payments statement, not an indirect cash-flow statement).
--
-- WHAT THIS ADDS
--   fin_cash_flow(p_from date, p_to date) → jsonb. READ ONLY.
--
--   accounts  every CASH and BANK account on the money-accounts list (0512)
--             that takes postings: the balance before the period, and the
--             period's money in and out. Carried forward is worked out on the
--             page, in the shared arithmetic, never here too.
--   rows      what the money was for. Each posted line on a cash or bank
--             account in the period is shared across the same entry's lines on
--             the other side, in proportion to their amounts, in whole sen
--             (the largest remainders take the odd sen, so a line's shares add
--             back to it exactly). A share on another cash or bank account is a
--             transfer; any other share is that account's row. So the rows add
--             up to the accounts' money in and out, to the sen.
--   card      money on the card and online holding accounts: what customers
--             paid by card or online in the period (everything but money
--             moves), and what still waits for its card payout at the end.
--             A holding account is not cash: card money counts as cash only
--             when its payout reaches a bank, and then shows as a row named
--             after the holding account.
--
--   Every posted entry counts, a reversal and its contra included (0469), as
--   on the Journal and on Daily Bank (0637). For one day, an account's figures
--   here equal Daily Bank's for that day; a test holds the two together.
--
-- RLS: none new. The function asks gl_may_read() itself (Finance or principal).
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.fin_cash_flow(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_out jsonb;
begin
  if not public.gl_may_read() then
    raise exception 'Cash Flow is internal.'
      using errcode = '42501', detail = 'not_internal';
  end if;
  if p_from is null or p_to is null then
    raise exception 'Choose the first and the last day.'
      using errcode = '22023', detail = 'period_missing';
  end if;
  if p_from > p_to then
    raise exception 'The first day is after the last day.'
      using errcode = '22023', detail = 'period_backwards';
  end if;

  with money as (
    -- Cash and bank accounts that take postings: the Daily Bank set less the
    -- holding accounts.
    select m.account_code as code, a.name, m.money_kind, m.is_active
      from public.gl_money_accounts m
      join public.gl_accounts a on a.code = m.account_code
     where m.money_kind in ('CASH', 'BANK')
       and not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  holding as (
    select m.account_code as code
      from public.gl_money_accounts m
     where m.money_kind = 'HOLDING'
       and not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  ln as (
    select l.entry_id, l.line_no, l.account_code, l.debit, l.credit, e.entry_date, e.source_type
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date <= p_to
  ),
  per_account as (
    select m.code, m.name, m.money_kind, m.is_active,
           coalesce(sum(ln.debit - ln.credit) filter (where ln.entry_date < p_from), 0) as opening,
           coalesce(sum(ln.debit)  filter (where ln.entry_date >= p_from), 0) as receipts,
           coalesce(sum(ln.credit) filter (where ln.entry_date >= p_from), 0) as payments
      from money m
      left join ln on ln.account_code = m.code
     group by m.code, m.name, m.money_kind, m.is_active
  ),
  legs as (
    select ln.entry_id, ln.line_no, (ln.debit > 0) as is_in, (ln.debit + ln.credit) as amount
      from ln
     where ln.entry_date >= p_from
       and ln.account_code in (select code from money)
  ),
  against as (
    -- A line on the other side of the same entry: a credit against money in,
    -- a debit against money out.
    select g.entry_id, g.line_no as leg_no, g.is_in, g.amount as leg_amount,
           o.line_no as other_no, o.account_code as other_code, (o.debit + o.credit) as other_amount,
           sum(o.debit + o.credit) over (partition by g.entry_id, g.line_no) as other_total
      from legs g
      join public.gl_entry_lines o
        on o.entry_id = g.entry_id
       and ((g.is_in and o.credit > 0) or (not g.is_in and o.debit > 0))
  ),
  sized as (
    select a.*,
           (a.leg_amount * 100) * a.other_amount / a.other_total          as exact_sen,
           floor((a.leg_amount * 100) * a.other_amount / a.other_total)   as base_sen
      from against a
  ),
  ranked as (
    select s.*,
           round(s.leg_amount * 100) - sum(s.base_sen) over (partition by s.entry_id, s.leg_no) as leftover,
           row_number() over (partition by s.entry_id, s.leg_no
                              order by s.exact_sen - s.base_sen desc, s.other_amount desc, s.other_no) as rk
      from sized s
  ),
  shares as (
    select r.is_in, r.other_code,
           r.base_sen + case when r.rk <= r.leftover then 1 else 0 end as share_sen
      from ranked r
  ),
  grouped as (
    select s.is_in, s.other_code, sum(s.share_sen) as sen
      from shares s
     group by s.is_in, s.other_code
  )
  select jsonb_build_object(
    'from',       p_from,
    'to',         p_to,
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'accounts',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code', pa.code,
               'name',         pa.name,
               'money_kind',   pa.money_kind,
               'is_active',    pa.is_active,
               'opening',      pa.opening,
               'receipts',     pa.receipts,
               'payments',     pa.payments)
             order by case pa.money_kind when 'CASH' then 1 else 2 end, pa.code)
        from per_account pa), '[]'::jsonb),
    'rows',       coalesce((
      select jsonb_agg(jsonb_build_object(
               'side',         case when g.is_in then 'IN' else 'OUT' end,
               'account_code', g.other_code,
               'name',         a.name,
               'kind',         a.kind,
               'money_kind',   (select m.money_kind from public.gl_money_accounts m where m.account_code = g.other_code),
               'amount',       g.sen / 100.0)
             order by g.is_in desc,
                      (g.other_code in (select code from money)),
                      g.other_code)
        from grouped g
        join public.gl_accounts a on a.code = g.other_code), '[]'::jsonb),
    'card', jsonb_build_object(
      'taken', coalesce((
        select sum(ln.debit - ln.credit)
          from ln
         where ln.entry_date >= p_from
           and ln.account_code in (select code from holding)
           and regexp_replace(ln.source_type, '_REVERSAL$', '')
               not in ('MONEY_TRANSFER', 'CARD_PAYOUT', 'BANK_CHARGE', 'BANK_CREDIT')), 0),
      'waiting', coalesce((
        select sum(ln.debit - ln.credit)
          from ln
         where ln.account_code in (select code from holding)), 0))
  ) into v_out;

  return v_out;
end;
$fn$;

revoke all on function public.fin_cash_flow(date, date) from public, anon;
grant execute on function public.fin_cash_flow(date, date) to authenticated;

comment on function public.fin_cash_flow(date, date) is
  '0638: Cash Flow (Chew 2026-10-03). Read only: cash and bank accounts before and over a period, what the money was for, and card money taken and waiting.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.fin_cash_flow(date, date)', 'execute') then
    raise exception '0638 sanity: Cash Flow is open to anon';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'fin_cash_flow'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0638 sanity: fin_cash_flow lost security definer or its search_path';
  end if;
  if (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fin_cash_flow') <> 's' then
    raise exception '0638 sanity: fin_cash_flow must be STABLE (read only)';
  end if;
end
$sanity$;

commit;
