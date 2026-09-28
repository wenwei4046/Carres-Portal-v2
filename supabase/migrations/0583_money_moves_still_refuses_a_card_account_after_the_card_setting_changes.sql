-- 0583 . Money moves still refuses a card account after the card setting changes
--
-- Follow-up to 0576 and 0582.
--   1. A card payout from a card account is prepared on Card settlement only
--      (0572, 0576): gl_money_move_create refuses one from any account
--      _card_payout_holdings() names. That list was read from today's
--      settings only: an account a card method maps to in
--      gl_payment_account_map, and a card_settlement_routes holding. When
--      Finance points a card method at another account, the old account left
--      the list while it still held card money whose days were not approved.
--      Money moves could then pay that money out, and Approve day would later
--      take the same money out again.
--   2. _card_payout_holdings() now also names every account a card sale was
--      posted to: the debit line of each card payment's live customer payment
--      entry (0463). This is 0582's lookup (_card_settlement_day_holdings),
--      over every card sale rather than one settlement day's, because money a
--      settlement file has not reached yet sits in the same account.
--      gl_money_move_create and card_settlement_review read the list through
--      this one function, so both follow. Their bodies are not touched.
--   3. gl_card_accounts_list() hands the same list to the API, so Money moves
--      hides exactly the accounts the database refuses. The API used to read
--      the two settings tables itself; a third read through the ledger belongs
--      in the database, next to the rule.
-- No new words on screen. No account code is written here. No backfill.

begin;

-- every card account: any account a card payment method maps to, any account a
-- card settlement route serves (0541), and any account a card sale was posted to
create or replace function public._card_payout_holdings()
returns setof text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select m.account_code from public.gl_payment_account_map m
   where m.method in ('card', 'credit_card', 'debit_card')
  union
  select r.holding_code from public.card_settlement_routes r
  union
  -- 0583: the account each card sale's live customer payment entry debited
  -- (0582's lookup), so a changed card setting cannot free money still in it
  select gl.account_code
    from public.order_payments p
    join public.gl_entries e
      on e.source_type = 'CUSTOMER_PAYMENT'
     and e.source_doc_no = coalesce(nullif(btrim(coalesce(p.receipt_no, '')), ''), p.id::text)
     and e.posted and not e.reversed
    join public.gl_entry_lines gl on gl.entry_id = e.id and gl.debit > 0
   where public.payment_method_key(p.method) in ('card', 'credit_card', 'debit_card');
$fn$;
comment on function public._card_payout_holdings() is
  '0576, 0583: every card account. An account a card payment method (card, credit_card, debit_card) maps to in gl_payment_account_map, a card_settlement_routes holding, and (0583) any account a card sale was posted to: the debit line of a card payment''s live CUSTOMER_PAYMENT entry. A card payout from one of them is prepared on Card settlement only.';
revoke all on function public._card_payout_holdings() from public, anon, authenticated;

-- the card accounts, for Money moves' Paid from list
create or replace function public.gl_card_accounts_list()
returns setof text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'The money accounts are for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return query select h.code from public._card_payout_holdings() as h(code) order by 1;
end;
$fn$;
comment on function public.gl_card_accounts_list() is
  '0583: the codes _card_payout_holdings() names, the accounts gl_money_move_create refuses a card payout from. Finance and principal. Read only.';
revoke all on function public.gl_card_accounts_list() from public, anon;
grant execute on function public.gl_card_accounts_list() to authenticated;

-- ── checks ───────────────────────────────────────────────────────────────────
do $check$
declare
  v_fn text;
begin
  -- the rule is read at the door, not only on screen
  foreach v_fn in array array['gl_money_move_create', 'card_settlement_review'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = v_fn
                      and pg_get_functiondef(p.oid) like '%public._card_payout_holdings()%') then
      raise exception '0583 check: % no longer reads _card_payout_holdings()', v_fn;
    end if;
  end loop;
  -- gates: the helper is closed; the list is Finance's door
  if has_function_privilege('authenticated', 'public._card_payout_holdings()', 'execute')
     or has_function_privilege('anon', 'public._card_payout_holdings()', 'execute')
     or has_function_privilege('anon', 'public.gl_card_accounts_list()', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_card_accounts_list()', 'execute') then
    raise exception '0583 check: a card account function has the wrong grants';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = 'public.gl_card_accounts_list()'::regprocedure
                    and p.prosecdef and p.proconfig @> array['search_path=public, pg_temp']) then
    raise exception '0583 check: gl_card_accounts_list() lost security definer or its search_path';
  end if;
end
$check$;

commit;
