-- =============================================================================
-- 0637_daily_bank_shows_each_money_account_for_one_day.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Finance had no one place to see, for one day, what each bank and cash
--   account held, what came in and went out that day, and what is about to go
--   out. Chew (Finance) ruled on 2026-10-03 to build Daily Bank
--   (docs/finance/MASTER.md §3.4), after the Houzs reference (Part 8 §10).
--
-- WHAT THIS ADDS
--   fin_daily_bank(p_day date) → jsonb. READ ONLY. For every account on the
--   money-accounts list (0512) that takes postings — the same accounts the
--   Finance Dashboard's cash adds up (web cash-movement.ts), never a heading:
--     brought_forward   the ledger balance at the end of the day before
--     received / paid   the day's money in and out on the account
--     pending           payment vouchers CHECKED by the day and not approved
--                       yet that will pay out of this account (Houzs: the
--                       pending column is the first layer, checked). Read
--                       from today's status, so an earlier day cannot show
--                       what was waiting on it at the time
--     pending_vouchers  those vouchers, one by one
--     lines             the day's entries on the account, each naming who the
--                       money came from or went to when the entry names a party
--   Closing and available are worked out from these in ONE place, the shared
--   daily-bank arithmetic (packages/shared/src/daily-bank.ts), never here too.
--
--   A HOLDING account (card and online money waiting for its payout) is money
--   in transit: it never carries a pending voucher, and the page never counts
--   it as money that can move.
--
--   The ledger holds no opening balances until Finance posts them, so until
--   then brought_forward is the movement since go-live, not the bank's own
--   balance. Every posted entry counts, a reversal and its contra included
--   (0469).
--
-- RLS: none new. The function asks gl_may_read() itself (Finance or principal).
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.fin_daily_bank(p_day date)
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
    raise exception 'Daily Bank is internal.'
      using errcode = '42501', detail = 'not_internal';
  end if;
  if p_day is null then
    raise exception 'Choose the day.'
      using errcode = '22023', detail = 'day_missing';
  end if;

  -- The accounts that take postings: a heading never holds money of its own
  -- (gl_post refuses it), the same set the Dashboard's cash adds up.
  with acct as (
    select m.account_code as code, a.name, m.money_kind, m.is_active
      from public.gl_money_accounts m
      join public.gl_accounts a on a.code = m.account_code
     where not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  mv as (
    select l.account_code, l.line_no, l.debit, l.credit, l.memo,
           e.id as entry_id, e.entry_no, e.entry_date, e.source_type, e.source_doc_no, e.narration
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date <= p_day
       and l.account_code in (select code from acct)
  ),
  bf as (
    select mv.account_code, sum(mv.debit - mv.credit) as amount
      from mv
     where mv.entry_date < p_day
     group by mv.account_code
  ),
  -- Who the money came from or went to: the first line of the same entry
  -- that names a party (a customer, a supplier or an other party, 0478).
  day_lines as (
    select mv.*, pty.party_type, pty.party_name
      from mv
      left join lateral (
        select p.party_type, coalesce(c.name, s.name, f.name) as party_name
          from public.gl_entry_lines p
          left join public.customers c       on p.party_type = 'CUSTOMER' and c.id = p.party_id
          left join public.suppliers s       on p.party_type = 'SUPPLIER' and s.id = p.party_id
          left join public.finance_parties f on p.party_type = 'OTHER'    and f.id = p.party_id
         where p.entry_id = mv.entry_id and p.party_id is not null
         order by p.line_no
         limit 1
      ) pty on true
     where mv.entry_date = p_day
  ),
  -- Waiting is read from each voucher's status NOW: a voucher checked by the
  -- day and still not approved. One checked after the day is not counted on
  -- it; one approved since then has left, so an earlier day cannot show
  -- what was waiting on it at the time.
  pend as (
    select v.pay_from_account_code as code,
           sum(v.amount) as amount,
           jsonb_agg(jsonb_build_object(
             'voucher_id',   v.id,
             'voucher_no',   v.voucher_no,
             'supplier_id',  v.supplier_id,
             'payee_name',   v.payee_name,
             'voucher_date', v.voucher_date,
             'purpose',      v.purpose,
             'narration',    nullif(btrim(v.narration), ''),
             'amount',       v.amount)
             order by v.voucher_date, v.voucher_no) as vouchers
      from public.payment_vouchers v
     where v.status = 'checked'
       and coalesce(timezone('Asia/Kuala_Lumpur', v.checked_at)::date, p_day) <= p_day
     group by v.pay_from_account_code
  )
  select jsonb_build_object(
    'day',        p_day,
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'accounts',   coalesce(jsonb_agg(jsonb_build_object(
        'account_code',     acct.code,
        'name',             acct.name,
        'money_kind',       acct.money_kind,
        'is_active',        acct.is_active,
        'brought_forward',  coalesce(bf.amount, 0),
        'received',         coalesce((select sum(d.debit) from day_lines d where d.account_code = acct.code), 0),
        'paid',             coalesce((select sum(d.credit) from day_lines d where d.account_code = acct.code), 0),
        'pending',          case when acct.money_kind = 'HOLDING' then 0 else coalesce(pend.amount, 0) end,
        'pending_vouchers', case when acct.money_kind = 'HOLDING' then '[]'::jsonb
                                 else coalesce(pend.vouchers, '[]'::jsonb) end,
        'lines', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'entry_no',      d.entry_no,
                   'source_type',   d.source_type,
                   'source_doc_no', d.source_doc_no,
                   'description',   coalesce(nullif(btrim(d.memo), ''), nullif(btrim(d.narration), '')),
                   'party_type',    d.party_type,
                   'party_name',    d.party_name,
                   'received',      d.debit,
                   'paid',          d.credit)
                   order by d.entry_no, d.line_no)
            from day_lines d
           where d.account_code = acct.code), '[]'::jsonb)
      ) order by case acct.money_kind when 'CASH' then 1 when 'BANK' then 2 else 3 end, acct.code), '[]'::jsonb)
  ) into v_out
    from acct
    left join bf   on bf.account_code = acct.code
    left join pend on pend.code = acct.code;

  return v_out;
end;
$fn$;

revoke all on function public.fin_daily_bank(date) from public, anon;
grant execute on function public.fin_daily_bank(date) to authenticated;

comment on function public.fin_daily_bank(date) is
  '0637: Daily Bank (Chew 2026-10-03). Read only: per money account, the day before, the day''s money in and out, checked vouchers waiting, and the day''s lines.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.fin_daily_bank(date)', 'execute') then
    raise exception '0637 sanity: Daily Bank is open to anon';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'fin_daily_bank'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0637 sanity: fin_daily_bank lost security definer or its search_path';
  end if;
  if (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fin_daily_bank') <> 's' then
    raise exception '0637 sanity: fin_daily_bank must be STABLE (read only)';
  end if;
end
$sanity$;

commit;
