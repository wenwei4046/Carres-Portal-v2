-- =============================================================================
-- 0537_finance_records_a_bank_charge_and_a_bank_credit_as_money_moves.sql
-- =============================================================================
-- WHAT WAS WRONG
--   A few sen the bank took (a charge) or added (interest) seen only on the
--   statement had no Finance door: a DIRECT payment voucher needs three
--   people, and the manual journal is principal-only (ruling M).
--
-- WHAT THIS CHANGES
--   Two more kinds on gl_money_moves (0529), same flow, same doors:
--     BANK_CHARGE  from a BANK account in use, to 6500 Bank and payment
--                  charges. Dr 6500, Cr bank, amount. fee 0.
--     BANK_CREDIT  from 4900 Other income, to a BANK account in use.
--                  Dr bank, Cr 4900, amount. fee 0.
--   The 0529 posting already writes Dr to, Cr from; only the account rule,
--   the words and the ledger source change. gl_post source BANK_CHARGE or
--   BANK_CREDIT; gl_reverse adds _REVERSAL as for every source.
--   A transfer from an unknown payer is NOT a bank credit: it stays an
--   unmatched statement line until someone records it through its own door.
--   Bodies from 0529, changed only where marked 0537:
--     _gl_money_move_check, gl_money_move_approve.
--   Constraints widened: the kind list; only a card payout carries a fee.
--
-- RLS: unchanged. DATA: the MM series description names the new kinds.
-- DR/CR: as above, only on approval.
-- =============================================================================

begin;

-- 0537: the kind list, and the fee rule, widened.
alter table public.gl_money_moves drop constraint gl_money_moves_kind_check;
alter table public.gl_money_moves add constraint gl_money_moves_kind_check
  check (kind in ('TRANSFER','CARD_PAYOUT','BANK_CHARGE','BANK_CREDIT'));
alter table public.gl_money_moves drop constraint gl_money_moves_transfer_has_no_fee;
alter table public.gl_money_moves add constraint gl_money_moves_only_a_card_payout_has_a_fee
  check (kind = 'CARD_PAYOUT' or fee = 0);

update public.gl_doc_series
   set description = 'Money move — a bank transfer, a card payout, a bank charge or a bank credit on Finance''s own money accounts (0529, 0537)'
 where prefix = 'MM';

-- Body from 0529. Changed only where marked 0537.
create or replace function public._gl_money_move_check(
  p_kind text, p_from text, p_to text, p_amount numeric, p_fee numeric, p_date date)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from_kind text;
  v_to_kind   text;
begin
  -- 0537: two more kinds.
  if p_kind is null or p_kind not in ('TRANSFER','CARD_PAYOUT','BANK_CHARGE','BANK_CREDIT') then
    raise exception 'Choose a bank transfer, a card payout, a bank charge or a bank credit.'
      using errcode = '22023', detail = 'kind_missing';
  end if;
  if p_date is null then
    raise exception 'Choose the date the money moved.'
      using errcode = '22023', detail = 'date_missing';
  end if;
  perform public.fin_refuse_before_go_live(p_date, 'This money move');

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'The amount must be more than RM 0.00, in sen at most.'
      using errcode = '22023', detail = 'amount_invalid';
  end if;
  if p_fee is null or p_fee < 0 or p_fee <> round(p_fee, 2) then
    raise exception 'The fee must be RM 0.00 or more, in sen at most.'
      using errcode = '22023', detail = 'fee_invalid';
  end if;
  -- 0537: only a card payout has a fee.
  if p_kind <> 'CARD_PAYOUT' and p_fee <> 0 then
    raise exception 'Only a card payout has a fee. Record a bank charge as its own money move.'
      using errcode = '22023', detail = 'fee_on_transfer';
  end if;
  if p_from is not distinct from p_to then
    raise exception 'The money must move between two different accounts.'
      using errcode = '22023', detail = 'same_account';
  end if;

  -- 'in' is every in-use CASH, BANK and HOLDING leaf (0512); the kind narrows it.
  select m.money_kind into v_from_kind from public.gl_money_accounts m
   where m.account_code = p_from and public.gl_money_account_ok(p_from, 'in');
  select m.money_kind into v_to_kind from public.gl_money_accounts m
   where m.account_code = p_to and public.gl_money_account_ok(p_to, 'in');

  if p_kind = 'TRANSFER' then
    if v_from_kind is null or v_from_kind not in ('CASH','BANK') then
      raise exception 'Paid from must be a cash or bank account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is null or v_to_kind not in ('CASH','BANK') then
      raise exception 'Paid into must be a cash or bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  -- 0537: a bank charge leaves a bank for 6500; a bank credit reaches a bank from 4900.
  elsif p_kind = 'BANK_CHARGE' then
    if v_from_kind is distinct from 'BANK' then
      raise exception 'A bank charge is taken from a bank account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if p_to is distinct from '6500' then
      raise exception 'A bank charge goes to 6500 Bank and payment charges.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  elsif p_kind = 'BANK_CREDIT' then
    if p_from is distinct from '4900' then
      raise exception 'A bank credit comes from 4900 Other income.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is distinct from 'BANK' then
      raise exception 'A bank credit goes into a bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  else
    if v_from_kind is distinct from 'HOLDING' then
      raise exception 'A card payout comes from a card or online holding account in use.'
        using errcode = '22023', detail = 'from_account_refused';
    end if;
    if v_to_kind is distinct from 'BANK' then
      raise exception 'A card payout goes into a bank account in use.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  end if;
end;
$fn$;

-- Body from 0529. Changed only where marked 0537.
create or replace function public.gl_money_move_approve(p_move_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me    uuid := auth.uid();
  v_m     public.gl_money_moves%rowtype;
  v_what  text;
  v_lines jsonb;
  v_entry uuid;
begin
  if not public.has_finance_approver(v_me) then
    raise exception 'Approving a money move takes the finance approver.'
      using errcode = '42501', detail = 'not_finance_approver';
  end if;
  select * into v_m from public.gl_money_moves where id = p_move_id for update;
  if not found then
    raise exception 'That money move does not exist.'
      using errcode = 'P0002', detail = 'money_move_missing';
  end if;
  if v_m.status <> 'prepared' then
    raise exception 'Money move % is %, so it cannot be approved.', v_m.move_no, v_m.status
      using errcode = 'P0001', detail = 'money_move_not_prepared';
  end if;
  if v_m.prepared_by = v_me then
    raise exception 'You prepared money move %, so somebody else must approve it.', v_m.move_no
      using errcode = '42501', detail = 'preparer_cannot_approve';
  end if;

  -- The accounts may have gone out of use since it was prepared.
  perform public._gl_money_move_check(v_m.kind, v_m.from_account_code, v_m.to_account_code,
                                      v_m.amount, v_m.fee, v_m.move_date);

  -- 0537: the words for the two new kinds.
  v_what := case v_m.kind
              when 'TRANSFER'    then 'Bank transfer'
              when 'BANK_CHARGE' then 'Bank charge'
              when 'BANK_CREDIT' then 'Bank credit'
              else 'Card payout' end
            || ' ' || v_m.move_no;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_m.to_account_code, 'debit', v_m.amount, 'credit', 0,
                       'memo', v_what),
    jsonb_build_object('account_code', v_m.from_account_code, 'debit', 0,
                       'credit', v_m.amount + v_m.fee, 'memo', v_what));
  if v_m.fee > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', '6500', 'debit', v_m.fee, 'credit', 0, 'memo', 'Card fee · ' || v_m.move_no));
  end if;

  v_entry := public.gl_post(
    -- 0537: the new kinds post under their own source.
    case v_m.kind when 'TRANSFER' then 'MONEY_TRANSFER' else v_m.kind end,
    v_m.move_no,
    v_m.move_date,
    coalesce(v_m.note, v_what),
    v_lines);

  update public.gl_money_moves
     set status = 'approved', approved_by = v_me, approved_at = now(), gl_entry_id = v_entry
   where id = p_move_id;
  return v_entry;
end;
$fn$;

-- create or replace keeps the grants; restated so this file stands alone.
revoke all on function public._gl_money_move_check(text, text, text, numeric, numeric, date) from public, anon, authenticated;
revoke all on function public.gl_money_move_approve(uuid) from public, anon;
grant execute on function public.gl_money_move_approve(uuid) to authenticated;


-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if not exists (select 1 from public.gl_accounts
                  where code = '6500' and kind = 'EXPENSE' and is_active and not is_control) then
    raise exception '0537 sanity: 6500 Bank and payment charges is not an active expense account';
  end if;
  if not exists (select 1 from public.gl_accounts
                  where code = '4900' and kind = 'INCOME' and is_active and not is_control) then
    raise exception '0537 sanity: 4900 Other income is not an active income account';
  end if;
  if has_function_privilege('anon', 'public.gl_money_move_approve(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._gl_money_move_check(text, text, text, numeric, numeric, date)', 'execute') then
    raise exception '0537 sanity: a money-move door is open past its gate';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_gl_money_move_check', 'gl_money_move_approve')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0537 sanity: a function lost security definer or its search_path';
  end if;
end
$sanity$;

commit;
