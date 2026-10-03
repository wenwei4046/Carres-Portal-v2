-- =============================================================================
-- 0641_card_money_waiting_lists_each_card_payment_not_in_the_bank_yet.sql
-- =============================================================================
-- WHAT WAS MISSING
--   Daily Bank says how much card and online money waits for its payout, as
--   one figure per holding account. Finance could not see WHICH payments that
--   money is, how long each has waited, or where each is stuck. Chew (Finance)
--   asked for the card lists on 2026-10-03 (docs/finance/MASTER.md §3.4:
--   payments not yet matched, money still with the card companies, card
--   payments no report has shown yet), after the Houzs reference (Part 7 §11,
--   "Still with the merchants", and §13).
--
-- WHAT THIS ADDS
--   fin_card_money_waiting() → jsonb. READ ONLY, today.
--
--   payments  every live entry that put money onto a card and online holding
--             account (money moves aside), whose money has not left it by an
--             approved card payout, each with where it is:
--               NOT_ON_A_FILE      no card company file row is matched to it
--               NOT_PREPARED       matched; its day has no card payout yet
--               WAITING_APPROVAL   its day's card payout is prepared, not approved
--             A customer payment is found the way Approve day finds it (0582):
--             its live CUSTOMER_PAYMENT entry under its receipt number, else
--             its id. A voided payment's entry is reversed, so it is not here.
--   holdings  each holding account's balance in the books today, so the page
--             can say how much of it the list explains.
--
-- RLS: none new. The function asks gl_may_read() itself (Finance or principal).
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.fin_card_money_waiting()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_today date := timezone('Asia/Kuala_Lumpur', now())::date;
  v_out   jsonb;
begin
  if not public.gl_may_read() then
    raise exception 'Card money waiting is internal.'
      using errcode = '42501', detail = 'not_internal';
  end if;

  with hold as (
    select m.account_code as code, a.name
      from public.gl_money_accounts m
      join public.gl_accounts a on a.code = m.account_code
     where m.money_kind = 'HOLDING'
       and not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  taken as (
    -- Money onto a holding account from a live entry: not reversed and not a
    -- reversal itself. Money moves (card payouts, transfers, charges) aside.
    select e.id as entry_id, e.entry_no, e.entry_date, e.source_type, e.source_doc_no,
           l.account_code, l.debit as amount
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted and not e.reversed and e.reverses is null
       and l.debit > 0
       and l.account_code in (select code from hold)
       and regexp_replace(e.source_type, '_REVERSAL$', '')
           not in ('MONEY_TRANSFER', 'CARD_PAYOUT', 'BANK_CHARGE', 'BANK_CREDIT')
  ),
  paid as (
    select t.*, p.id as payment_id, p.order_id, p.receipt_no, p.paid_on
      from taken t
      left join public.order_payments p
        on t.source_type = 'CUSTOMER_PAYMENT'
       and t.source_doc_no = coalesce(nullif(btrim(coalesce(p.receipt_no, '')), ''), p.id::text)
  ),
  placed as (
    select pd.*, l.acquirer, l.day_date, l.group_key, mm.move_no, mm.status as move_status
      from paid pd
      left join lateral (
        select sl.acquirer, sl.day_date, sl.group_key
          from public.card_settlement_lines sl
         where pd.payment_id is not null and sl.payment_id = pd.payment_id
         order by sl.day_date
         limit 1
      ) l on true
      left join public.card_settlement_payouts cp
        on cp.acquirer = l.acquirer and cp.day_date = l.day_date and cp.group_key = l.group_key
       and cp.released_at is null
      left join public.gl_money_moves mm on mm.id = cp.move_id
  )
  select jsonb_build_object(
    'today',      v_today,
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'holdings',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code', h.code,
               'name',         h.name,
               'balance',      coalesce((select sum(l.debit - l.credit)
                                           from public.gl_entry_lines l
                                           join public.gl_entries e on e.id = l.entry_id
                                          where e.posted and l.account_code = h.code), 0))
             order by h.code)
        from hold h), '[]'::jsonb),
    'payments',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'entry_no',      pl.entry_no,
               'entry_date',    pl.entry_date,
               'source_type',   pl.source_type,
               'doc_no',        pl.source_doc_no,
               'account_code',  pl.account_code,
               'amount',        pl.amount,
               'payment_id',    pl.payment_id,
               'receipt_no',    pl.receipt_no,
               'order_id',      pl.order_id,
               'so',            o.so,
               'customer_name', o.customer_name,
               'acquirer',      pl.acquirer,
               'day_date',      pl.day_date,
               'move_no',       pl.move_no,
               'state',         case when pl.acquirer is null then 'NOT_ON_A_FILE'
                                     when pl.move_no is null then 'NOT_PREPARED'
                                     else 'WAITING_APPROVAL' end)
             order by pl.entry_date, pl.entry_no)
        from placed pl
        left join public.orders o on o.id = pl.order_id
       where pl.move_status is distinct from 'approved'), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$fn$;

revoke all on function public.fin_card_money_waiting() from public, anon;
grant execute on function public.fin_card_money_waiting() to authenticated;

comment on function public.fin_card_money_waiting() is
  '0641: Card money waiting (Chew 2026-10-03). Read only, today: each live payment onto a card and online holding account not yet paid out by an approved card payout, with where it is, and each holding account''s balance.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.fin_card_money_waiting()', 'execute') then
    raise exception '0641 sanity: Card money waiting is open to anon';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'fin_card_money_waiting'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0641 sanity: fin_card_money_waiting lost security definer or its search_path';
  end if;
  if (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fin_card_money_waiting') <> 's' then
    raise exception '0641 sanity: fin_card_money_waiting must be STABLE (read only)';
  end if;
end
$sanity$;

commit;
