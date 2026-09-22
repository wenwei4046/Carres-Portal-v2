-- 0554 · An account number lives in one place.
--
-- 0550 made an account's number editable and gave the seventeen foreign keys
-- that name the chart `on update cascade`, so a renumber carries itself down
-- to every row. A number typed INSIDE a function body is not a row. It is
-- characters, no constraint watches it, and the cascade cannot reach it. So
-- today `gl_account_update('6500', 'Bank and payment charges', '650-0001')`
-- succeeds and the next bank charge is refused by a check still looking for
-- 6500. That gap is what this migration closes.
--
-- 1 · gl_account_roles: role → account_code, keyed by what the account is FOR
--     and not by its number, with `on update cascade` so a renumber reaches
--     the mapping the same way it reaches every other row. Seven roles, seven
--     rows, the whole of the chart's numbering that code used to know.
--
-- 2 · gl_account_for(role) reads one row and RAISES when the role is unmapped.
--     A null return would be a silent wrong posting; a raise is a refused one.
--
-- 3 · Thirteen literals in nine function bodies become that call. Every body
--     below was taken from pg_proc on a clone of carres_main_0549 with 0550
--     applied — the catalog's own text, not a migration file — because more
--     than one of these functions has been redefined since the migration a
--     reader would reach for first (gl_manual_journal last at 0510,
--     ap_account_choices / _ap_require_account / fin_money_in_account_problem
--     at 0512, _gl_money_move_check / gl_money_move_approve at 0537,
--     payment_voucher_save_draft / supplier_bill_save_draft at 0540,
--     gl_balance_sheet at 0469). Nothing else in any body changed.
--
-- WHAT IS COVERED, and what is deliberately not:
--   covered   6500 · 4900 · 2110 · 2120 · 5100 · 2210 · 1230 — each one a
--             NAMED leaf account that logic reaches for by name.
--   left      1100 · 1300 · 2200 · 3200 · 3300 — these test the chart's SHAPE
--             ("is this under Cash and bank", "is this under Inventory"), not
--             a named account. A role called BANK_PARENT would be a worse name
--             than 1100, so they stay as they are.
--
-- WHY A TABLE AND NOT THE 0463 SHAPE LOOKUP: gl_ar_control_account (0463:196)
-- and fin_other_debtor_control_account (0478:459) find an account by its shape
-- — the one active control account with that kind and control_for — and 0463
-- says plainly it refuses to keep a second copy of the chart's numbers. That
-- pattern is the right one and is NOT replaced here. It simply cannot reach
-- these seven. 2110 Trade payables and 2120 Other payables are BOTH active
-- SUPPLIER liability controls, so the shape lookup raises "ambiguous" on the
-- pair rather than telling them apart; and 6500, 4900, 5100, 2210 and 1230 are
-- ordinary leaves with no control flag, no control_for and no shape to find
-- them by at all. gl_account_roles is not a second copy of the chart either:
-- the number lives in gl_accounts, this table only points at it, and the FK
-- with `on update cascade` is what keeps the pointer true.
--
-- REPLAY ORDER, checked: 0510 lines 383-386 assert on FUNCTION SOURCE TEXT —
-- that ap_account_choices still contains `a.code <> '1230'` and that
-- gl_manual_journal still contains `v_code = '1230'`. After this migration
-- neither is true. Ordered replay runs 0510 long before 0554, so both asserts
-- see the bodies they were written against and the chain replays clean; this
-- was confirmed by replaying every migration from 0001 on an empty database.
-- 0510 must never be re-run on its own against a database that already has
-- 0554. Nothing re-runs a migration today.
--
-- COPY: no new sentence reaches a screen. Every raise here keeps the wording it
-- already had, byte for byte, including the three that say a number out loud
-- ("A bank charge goes to 6500 Bank and payment charges.", "A bank credit comes
-- from 4900 Other income.", and gl_manual_journal's "account 1230 Advances to
-- suppliers"). Those are approved copy, not logic. They will read stale after a
-- renumber; making them name the account instead would be NEW copy and needs
-- the owner's word first.
--
-- RLS: gl_account_roles is created with row-level security ENABLED and no
-- policy, and is revoked from anon and authenticated — the same treatment
-- gl_accounts itself gets at 0461 section 9. The effect is that no signed-in
-- caller and no signed-out caller can read or write the mapping directly; it is
-- reached only through gl_account_for, which is itself revoked from both and is
-- called only from SECURITY DEFINER functions. No existing policy on any table
-- is created, dropped or altered.
--
-- DR/CR: none. This migration posts nothing, and it reads, writes and deletes
-- no existing row.

begin;

set local search_path = public, pg_temp;

-- ── 1 · what an account is FOR ───────────────────────────────────────────────
create table public.gl_account_roles (
  role         text primary key,
  account_code text not null references public.gl_accounts(code) on update cascade
);

comment on table public.gl_account_roles is
  '0554: the one place code learns an account''s number. Keyed by the job the account does, never by the number. `on update cascade` carries a renumber (0550) into this table.';
comment on column public.gl_account_roles.role is
  '0554: what the account is for. Stable; the number under it is not.';
comment on column public.gl_account_roles.account_code is
  '0554: the account doing that job today. The FK has no ON DELETE action, so an account holding a role cannot be deleted out from under it.';

alter table public.gl_account_roles enable row level security;
revoke all on public.gl_account_roles from anon, authenticated;

insert into public.gl_account_roles (role, account_code) values
  ('SUPPLIER_ADVANCE',          '1230'),   -- Advances to suppliers (0507/0510)
  ('CUSTOMER_DEPOSITS_HELD',    '2210'),   -- Customer deposits held
  ('TRADE_PAYABLE',             '2110'),   -- Trade payables — suppliers
  ('OTHER_PAYABLE',             '2120'),   -- Other payables
  ('COST_OF_GOODS_SOLD',        '5100'),   -- Cost of goods sold
  ('BANK_AND_PAYMENT_CHARGES',  '6500'),   -- Bank charges AND the card payout fee
  ('OTHER_INCOME',              '4900');   -- Other income (a bank credit)
-- These seven literals are the LAST ones. They are a seed, the same way the
-- chart's own seed at 0461:332 and 0478:434 is a seed, and like those two they
-- stay literal: a seed states a fact once, in one place, where a reader can see
-- it. Those two are not touched by this migration.
--
-- The bank charge and the card payout fee share one role because they share one
-- account, whose own name — "Bank and payment charges" — covers both. Splitting
-- them later is one new row and one call site, no more than it is today.

-- ── 2 · the lookup ───────────────────────────────────────────────────────────
create or replace function public.gl_account_for(p_role text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_code text;
begin
  select r.account_code into v_code
    from public.gl_account_roles r where r.role = p_role;
  if v_code is null then
    -- Refuse loudly. Returning null here would let a posting continue with no
    -- account and land wrong, which is the failure this whole migration is about.
    raise exception 'The chart has no account for %.', coalesce(p_role, 'that job')
      using errcode = '22023', detail = 'account_role_unmapped';
  end if;
  return v_code;
end;
$fn$;

comment on function public.gl_account_for(text) is
  '0554: the number of the account that does this job, read from gl_account_roles. Raises when the role is unmapped. Called only from SECURITY DEFINER functions.';
revoke all on function public.gl_account_for(text) from public, anon, authenticated;

-- ── 3 · nine bodies, thirteen literals, nothing else changed ─────────────────
-- Taken verbatim from pg_proc.prosrc; each change is marked at its line.
CREATE OR REPLACE FUNCTION public._ap_require_account(p_code text, p_use text, p_what text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_acc  public.gl_accounts%rowtype;
  v_code text := btrim(coalesce(p_code, ''));
begin
  if v_code = '' then
    raise exception '%: choose an account.', p_what
      using errcode = 'P0001', detail = 'account_missing';
  end if;
  select * into v_acc from public.gl_accounts where code = v_code;
  if not found then
    raise exception '%: account % is not in the chart of accounts.', p_what, v_code
      using errcode = 'P0001', detail = 'account_unknown';
  end if;
  if not v_acc.is_active then
    raise exception '%: account % % is no longer in use.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_retired';
  end if;
  if exists (select 1 from public.gl_accounts c where c.parent_code = v_acc.code) then
    raise exception '%: % % is a heading. Choose one of the accounts under it.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_is_heading';
  end if;

  -- 0510: 1230 Advances to suppliers is written only by the Advance flow,
  -- which reaches the supplier's payables account through 'ap', never a line.
  -- 0554: the number is read from gl_account_roles, not written here.
  if v_acc.code = public.gl_account_for('SUPPLIER_ADVANCE') and p_use in ('bill_line','voucher_line') then
    raise exception '%: account % % is kept by its own documents and cannot be picked here.', p_what, v_acc.code, v_acc.name
      using errcode = 'P0001', detail = 'account_kept_by_own_documents';
  end if;

  if p_use = 'bill_line' then
    if v_acc.is_control then
      raise exception '%: % % is a control account. A bill line is a cost — choose an expense or asset account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_control';
    end if;
    if v_acc.kind not in ('EXPENSE','ASSET') then
      raise exception '%: % % is not an expense or asset account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_wrong_kind';
    end if;
    if public.ap_account_is_money(v_acc.code) then
      raise exception '%: % % is a cash or bank account. A bill does not move money; the payment voucher does.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_money';
    end if;
  elsif p_use = 'voucher_line' then
    if v_acc.is_control then
      raise exception '%: % % is a control account. To pay a supplier''s bill, choose the bill instead of a line.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_is_control';
    end if;
    if v_acc.kind not in ('EXPENSE','ASSET','LIABILITY') then
      raise exception '%: % % is not an expense, asset or liability account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_wrong_kind';
    end if;
  elsif p_use = 'ap' then
    if v_acc.kind <> 'LIABILITY' or not v_acc.is_control
       or v_acc.control_for is distinct from 'SUPPLIER' then
      raise exception '%: % % is not a payables account for suppliers.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'ap_not_supplier_control';
    end if;
  elsif p_use in ('pay_from', 'received_into') then
    if exists (select 1 from public.gl_money_accounts m
                where m.account_code = v_acc.code and not m.is_active) then
      raise exception '%: account % % is no longer in use.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'account_retired';
    end if;
    -- 0512: money OUT leaves from cash or a bank only, never from a card or
    -- online payment company's holding account.
    if p_use = 'pay_from' and not public.gl_money_account_ok(v_acc.code, 'out') then
      raise exception '%: % % is not a cash or bank account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'pay_from_not_money';
    end if;
    if p_use = 'received_into' and not public.gl_money_account_ok(v_acc.code, 'in') then
      raise exception '%: % % is not a bank or cash account.', p_what, v_acc.code, v_acc.name
        using errcode = 'P0001', detail = 'received_into_not_money';
    end if;
  else
    raise exception 'unknown account use %', p_use
      using errcode = '22023', detail = 'account_use_unknown';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public._gl_money_move_check(p_kind text, p_from text, p_to text, p_amount numeric, p_fee numeric, p_date date)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    if p_to is distinct from public.gl_account_for('BANK_AND_PAYMENT_CHARGES') then
      raise exception 'A bank charge goes to 6500 Bank and payment charges.'
        using errcode = '22023', detail = 'to_account_refused';
    end if;
  elsif p_kind = 'BANK_CREDIT' then
    if p_from is distinct from public.gl_account_for('OTHER_INCOME') then
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
$function$
;

CREATE OR REPLACE FUNCTION public.ap_account_choices()
 RETURNS TABLE(code text, name text, kind text, parent_code text, is_control boolean, control_for text, for_bill_line boolean, for_voucher_line boolean, for_ap boolean, for_pay_from boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  -- 0554: one lookup, not one per account row.
  v_advance text := public.gl_account_for('SUPPLIER_ADVANCE');
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return query
  select a.code, a.name, a.kind, a.parent_code, a.is_control, a.control_for,
         (not a.is_control and a.code <> v_advance and a.kind in ('EXPENSE','ASSET') and not public.ap_account_is_money(a.code)),
         (not a.is_control and a.code <> v_advance and a.kind in ('EXPENSE','ASSET','LIABILITY')),
         (a.kind = 'LIABILITY' and a.is_control and a.control_for = 'SUPPLIER'),
         public.gl_money_account_ok(a.code, 'out')      -- 0512: cash and bank only
    from public.gl_accounts a
   where a.is_active
     and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
   order by a.code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fin_money_in_account_problem(p_code text, p_use text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v public.gl_accounts%rowtype;
begin
  if p_use is null or p_use not in ('money','receipt_line','invoice_line') then
    raise exception 'unknown account use %', coalesce(p_use, 'null')
      using errcode = '22023', detail = 'unknown_account_use';
  end if;

  select * into v from public.gl_accounts a where a.code = btrim(coalesce(p_code, ''));
  if not found then
    return format('Account %s is not in the chart.', coalesce(nullif(btrim(p_code), ''), 'No account'));
  end if;
  if not v.is_active then
    return format('Account %s %s is retired.', v.code, v.name);
  end if;
  if exists (select 1 from public.gl_accounts c where c.parent_code = v.code) then
    return format('Account %s %s is a group heading. Pick an account under it.', v.code, v.name);
  end if;
  -- 0510: 1230 Advances to suppliers is written only by the Advance flow.
  if v.is_control or v.code = public.gl_account_for('SUPPLIER_ADVANCE') then
    return format('Account %s %s is kept by its own documents and cannot be picked here.', v.code, v.name);
  end if;

  if p_use = 'money' then
    if exists (select 1 from public.gl_money_accounts m
                where m.account_code = v.code and not m.is_active) then
      return format('Account %s %s is retired.', v.code, v.name);
    end if;
    if not public.gl_money_account_ok(v.code, 'in') then      -- 0512: the one list
      return format('Account %s %s is not a bank or cash account.', v.code, v.name);
    end if;
    return null;
  end if;

  if public.ap_account_is_money(v.code) then
    return format('Account %s %s is a bank or cash account. Moving money between our own accounts is not a receipt.', v.code, v.name);
  end if;

  -- Customer sales income is recognised on the customer's invoice (0466).
  -- Neither document here may be a second door for it (ERP-ARCHITECTURE
  -- law C), so an invoice line and a receipt line both refuse every account
  -- the customer invoice routes revenue to.
  if exists (select 1 from public.gl_income_account_map m where m.account_code = v.code) then
    return format('Account %s %s is customer sales income. It is recorded on the customer''s invoice.', v.code, v.name);
  end if;

  if p_use = 'invoice_line' then
    if v.kind not in ('INCOME','EXPENSE') then
      return format('Account %s %s cannot be billed. An invoice line credits income, or recovers a cost.', v.code, v.name);
    end if;
    return null;
  end if;

  -- receipt_line
  if v.parent_code = '2200' then
    return format('Account %s %s is customer money. Customer money is recorded in Payments.', v.code, v.name);
  end if;
  -- Stock value moves with the goods, and Stock owns it. Retained earnings
  -- and opening balance equity are written only by the year-end close and the
  -- opening balances. Money never arrives as any of them.
  if v.parent_code = '1300' or v.code in ('3200', '3300') then
    return format('Account %s %s cannot be the reason money came in.', v.code, v.name);
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gl_balance_sheet(p_as_of date, p_department_type text DEFAULT NULL::text, p_department_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(report_status text, go_live_on date, as_of date, ordinal bigint, section text, row_kind text, header_code text, header_name text, account_code text, account_name text, amount numeric, equation_balances boolean, equation_difference numeric, reclassified numeric, reclassified_for text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  -- Where customers' money paid before the invoice is shown. The account's own
  -- name ("Customer deposits held") is the line label.
  c_deposits constant text := public.gl_account_for('CUSTOMER_DEPOSITS_HELD');
  -- Where money paid to suppliers before their bill is shown (0507). The
  -- account's own name ("Advances to suppliers") is the line label.
  c_advances constant text := public.gl_account_for('SUPPLIER_ADVANCE');
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
      from public.gl_department_lines(p_department_type, p_department_id) l
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
      from public.gl_department_lines(p_department_type, p_department_id) l
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
  from public.gl_department_lines(p_department_type, p_department_id) l
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
    from public.gl_department_lines(p_department_type, p_department_id) l
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
$function$
;

CREATE OR REPLACE FUNCTION public.gl_manual_journal(p_entry_date date, p_narration text, p_lines jsonb, p_request_key uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role    app_role;
  v_uid     uuid;
  v_elem    jsonb;
  v_idx     int := 0;
  v_code    text;
  v_control boolean;
  v_doc_no  text;
  v_id      uuid;
  v_seen    public.gl_manual_journal_requests%rowtype;
  v_seen_no text;
begin
  v_role := public.app_role();
  if not coalesce(public.is_principal(), false) then
    raise exception 'gl_manual_journal refused: role % may not raise a manual journal — principal only', coalesce(v_role::text,'none')
      using errcode = '42501', detail = 'gl_manual_journal_forbidden';
  end if;
  v_uid := auth.uid();

  -- A resend carries the same key. The lock queues it behind the first call,
  -- and it then finds what the first call recorded.
  if p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('gl_manual_journal:' || p_request_key::text, 0));
    select r.* into v_seen from public.gl_manual_journal_requests r
     where r.request_key = p_request_key;
    if found then
      -- The same key must carry the same entry. A key sent again with another
      -- date, narration or lines is not a resend: say so, and never hand back
      -- an entry that is not what the person typed.
      if v_seen.entry_date is distinct from p_entry_date
         or v_seen.narration is distinct from btrim(coalesce(p_narration, ''))
         or v_seen.lines is distinct from p_lines
         or v_seen.created_by is distinct from v_uid then
        select e.entry_no into v_seen_no from public.gl_entries e where e.id = v_seen.entry_id;
        raise exception 'gl_manual_journal refused: this request was already recorded as % with different details', coalesce(v_seen_no, v_seen.entry_id::text)
          using errcode = 'P0001', detail = 'idempotency_mismatch';
      end if;
      return v_seen.entry_id;
    end if;
  end if;

  if p_entry_date is null then
    raise exception 'gl_manual_journal refused: entry_date is required — a blank date is never replaced with today'
      using errcode = '22023', detail = 'gl_manual_journal_entry_date_null';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'gl_manual_journal refused: p_lines must be a JSON array, got %', coalesce(jsonb_typeof(p_lines),'null')
      using errcode = '22023', detail = 'gl_manual_journal_lines_not_array';
  end if;
  if nullif(btrim(coalesce(p_narration,'')), '') is null then
    raise exception 'gl_manual_journal refused: a narration is required — a manual journal with no explanation is unauditable'
      using errcode = '22023', detail = 'gl_manual_journal_narration_blank';
  end if;

  -- Control accounts belong to their subsidiary documents, not to a keyboard.
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_idx := v_idx + 1;
    if jsonb_typeof(v_elem) <> 'object' then
      raise exception 'gl_manual_journal refused: line % is a %, expected an object', v_idx, jsonb_typeof(v_elem)
        using errcode = '22023', detail = 'gl_manual_journal_line_not_object';
    end if;
    v_code := btrim(coalesce(v_elem->>'account_code',''));
    select a.is_control into v_control from public.gl_accounts a where a.code = v_code;
    if found and v_control then
      raise exception 'gl_manual_journal refused: line % names control account % — AR and AP move only through their own documents', v_idx, v_code
        using errcode = '22023', detail = 'gl_manual_journal_control_account';
    end if;
    -- 0510: 1230 Advances to suppliers is written only by the Advance flow.
    if v_code = public.gl_account_for('SUPPLIER_ADVANCE') then
      raise exception 'gl_manual_journal refused: line % names account 1230 Advances to suppliers, which is kept by its own documents', v_idx
        using errcode = '22023', detail = 'gl_manual_journal_control_account';
    end if;
  end loop;

  v_doc_no := public.gl_next_doc_no('MJ', p_entry_date);

  v_id := public.gl_post('MANUAL', v_doc_no, p_entry_date, p_narration, p_lines);

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Manual journal posted · %s · %s', v_doc_no, btrim(p_narration)),
          v_doc_no);

  if p_request_key is not null then
    insert into public.gl_manual_journal_requests
      (request_key, entry_id, entry_date, narration, lines, created_by)
    values
      (p_request_key, v_id, p_entry_date, btrim(p_narration), p_lines, v_uid);
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gl_money_move_approve(p_move_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      'account_code', public.gl_account_for('BANK_AND_PAYMENT_CHARGES'),
      'debit', v_m.fee, 'credit', 0, 'memo', 'Card fee · ' || v_m.move_no));
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
$function$
;

CREATE OR REPLACE FUNCTION public.payment_voucher_save_draft(p_voucher_id uuid, p_purpose text, p_supplier_id uuid, p_payee_name text, p_voucher_date date, p_pay_from_account_code text, p_lines jsonb DEFAULT '[]'::jsonb, p_allocations jsonb DEFAULT '[]'::jsonb, p_pay_method text DEFAULT 'BANK_TRANSFER'::text, p_pay_reference text DEFAULT NULL::text, p_narration text DEFAULT NULL::text, p_advance_amount numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_v        public.payment_vouchers%rowtype;
  v_supplier public.suppliers%rowtype;
  v_purpose  text := upper(btrim(coalesce(p_purpose, '')));
  v_method   text := upper(btrim(coalesce(p_pay_method, 'BANK_TRANSFER')));
  v_lines    jsonb := coalesce(p_lines, '[]'::jsonb);
  v_allocs   jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_advance  numeric(12,2) := coalesce(p_advance_amount, 0);
  v_ap       text;
  v_payee    text;
  v_pay_from text := btrim(coalesce(p_pay_from_account_code, ''));
  v_line     jsonb;
  v_n        integer := 0;
  v_amount   numeric(12,2);
  v_account  text;
  v_bill_id  uuid;
  v_seen     uuid[] := '{}';
  v_total    numeric(12,2) := 0;
  v_id       uuid;
  v_dept     record;   -- 0540
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance writes a payment voucher'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_voucher_id is not null then
    select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
    if not found then
      raise exception 'That payment voucher does not exist.'
        using errcode = 'P0002', detail = 'voucher_missing';
    end if;
    if v_v.status <> 'draft' then
      raise exception 'Only a draft payment voucher can be changed.'
        using errcode = 'P0001', detail = 'voucher_not_draft';
    end if;
  end if;

  if v_purpose not in ('SUPPLIER_BILLS','DIRECT') then
    raise exception 'Choose what this voucher is for: paying supplier bills, or a direct payment.'
      using errcode = 'P0001', detail = 'purpose_invalid';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_typeof(v_allocs) <> 'array' then
    raise exception 'The lines of this voucher are not readable.'
      using errcode = 'P0001', detail = 'lines_invalid';
  end if;

  if p_supplier_id is not null then
    select * into v_supplier from public.suppliers where id = p_supplier_id;
    if not found then
      raise exception 'That supplier does not exist.'
        using errcode = 'P0001', detail = 'supplier_missing';
    end if;
  end if;
  if v_purpose = 'SUPPLIER_BILLS' and p_supplier_id is null then
    raise exception 'Choose the supplier whose bills this voucher pays.'
      using errcode = 'P0001', detail = 'supplier_required';
  end if;

  -- The header, in the order the form asks for it: who, when, from where, how.
  -- Checked before what the voucher pays, so the first refusal names the
  -- first wrong field on the screen.
  v_payee := coalesce(nullif(btrim(coalesce(p_payee_name, '')), ''), v_supplier.name);
  if v_payee is null then
    raise exception 'Type who is being paid.'
      using errcode = 'P0001', detail = 'payee_missing';
  end if;
  if p_voucher_date is null then
    raise exception 'Type the payment date.'
      using errcode = 'P0001', detail = 'date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_voucher_date, 'This payment voucher');
  perform public._ap_require_account(v_pay_from, 'pay_from', 'Pay from');
  if v_method not in ('BANK_TRANSFER','CHEQUE','CASH','OTHER') then
    raise exception 'Choose how the money is paid.'
      using errcode = 'P0001', detail = 'pay_method_invalid';
  end if;

  -- The advance: money for this supplier before its bill (0484).
  if p_advance_amount is not null and round(p_advance_amount, 2) <> p_advance_amount then
    raise exception 'Type the advance in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance < 0 then
    raise exception 'The advance cannot be less than RM 0.00.'
      using errcode = 'P0001', detail = 'advance_invalid';
  end if;
  if v_advance > 0 and v_purpose <> 'SUPPLIER_BILLS' then
    raise exception 'A direct payment does not carry an advance. Choose "Pay supplier bills" to pay a supplier before its bill.'
      using errcode = 'P0001', detail = 'direct_pays_no_advance';
  end if;
  if v_advance > 0 then
    -- The same payables account a bill from this supplier defaults to, so the
    -- advance can be knocked off that bill later.
    v_ap := public.gl_account_for(
              case when v_supplier.kind::text = 'other_creditor' then 'OTHER_PAYABLE' else 'TRADE_PAYABLE' end);
    perform public._ap_require_account(v_ap, 'ap', 'Advance');
  end if;

  -- What it pays.
  if v_purpose = 'SUPPLIER_BILLS' then
    if jsonb_array_length(v_allocs) = 0 and v_advance = 0 then
      raise exception 'Choose at least one bill to pay, or type an advance.'
        using errcode = 'P0001', detail = 'no_bills';
    end if;
  else
    if jsonb_array_length(v_allocs) > 0 then
      raise exception 'A direct payment does not pay bills. Choose "Pay supplier bills" to pay a bill.'
        using errcode = 'P0001', detail = 'direct_pays_no_bill';
    end if;
    if jsonb_array_length(v_lines) = 0 then
      raise exception 'Add at least one line: what is this money paying for?'
        using errcode = 'P0001', detail = 'no_lines';
    end if;
  end if;
  if jsonb_array_length(v_lines) > 100 or jsonb_array_length(v_allocs) > 200 then
    raise exception 'This voucher has too many lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  -- Read and check every line before anything is written.
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_n := v_n + 1;
    begin
      v_amount := round(nullif(btrim(coalesce(v_line ->> 'amount', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Line %: the amount is not a number.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Line %: the amount must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'line_amount_invalid';
    end if;
    v_account := btrim(coalesce(v_line ->> 'account_code', ''));
    perform public._ap_require_account(v_account, 'voucher_line', format('Line %s', v_n));
    if v_account = v_pay_from then
      raise exception 'Line %: the money cannot be paid from and to the same account.', v_n
        using errcode = 'P0001', detail = 'line_is_pay_from';
    end if;
    perform public.fin_line_department(v_line, v_account, format('Line %s', v_n));   -- 0540
    v_total := v_total + v_amount;
  end loop;

  v_n := 0;
  for v_line in select value from jsonb_array_elements(v_allocs) loop
    v_n := v_n + 1;
    begin
      v_bill_id := nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '')::uuid;
      v_amount  := round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Bill %: the amount or the bill is not readable.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end;
    if v_bill_id is null then
      raise exception 'Bill %: choose the bill.', v_n
        using errcode = 'P0001', detail = 'allocation_invalid';
    end if;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Bill %: the amount to pay must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'allocation_amount_invalid';
    end if;
    if v_bill_id = any (v_seen) then
      raise exception 'The same bill is on this voucher twice.'
        using errcode = 'P0001', detail = 'bill_twice';
    end if;
    v_seen := v_seen || v_bill_id;
    v_total := v_total + v_amount;
  end loop;

  v_total := v_total + v_advance;

  if v_total <= 0 then
    raise exception 'A voucher of RM 0.00 pays nothing.'
      using errcode = 'P0001', detail = 'zero_total';
  end if;

  if p_voucher_id is null then
    insert into public.payment_vouchers
      (purpose, supplier_id, payee_name, voucher_date, amount, advance_amount, ap_account_code,
       pay_method, pay_reference, pay_from_account_code, narration, status, created_by)
    values
      (v_purpose, p_supplier_id, v_payee, p_voucher_date, v_total, v_advance, v_ap,
       v_method, nullif(btrim(coalesce(p_pay_reference, '')), ''), v_pay_from,
       nullif(btrim(coalesce(p_narration, '')), ''), 'draft', v_me)
    returning id into v_id;
  else
    v_id := p_voucher_id;
    update public.payment_vouchers
       set purpose               = v_purpose,
           supplier_id           = p_supplier_id,
           payee_name            = v_payee,
           voucher_date          = p_voucher_date,
           amount                = v_total,
           advance_amount        = v_advance,
           ap_account_code       = v_ap,
           pay_method            = v_method,
           pay_reference         = nullif(btrim(coalesce(p_pay_reference, '')), ''),
           pay_from_account_code = v_pay_from,
           narration             = nullif(btrim(coalesce(p_narration, '')), '')
     where id = v_id;
    -- A draft's lines and bills are replaced whole — allowed only while draft
    -- (the two only-while-draft triggers). A draft has posted nothing.
    delete from public.payment_voucher_lines       where voucher_id = v_id;
    delete from public.payment_voucher_allocations where voucher_id = v_id;
  end if;

  v_n := 0;
  for v_line in select value from jsonb_array_elements(v_lines) loop
    v_n := v_n + 1;
    v_dept := public.fin_line_department(v_line, btrim(v_line ->> 'account_code'), format('Line %s', v_n));
    insert into public.payment_voucher_lines
      (voucher_id, line_no, account_code, description, amount, department_type, department_id)
    values (v_id, v_n, btrim(v_line ->> 'account_code'),
            nullif(btrim(coalesce(v_line ->> 'description', '')), ''),
            round((v_line ->> 'amount')::numeric, 2),
            v_dept.department_type, v_dept.department_id);
  end loop;

  -- The ceilings (bill confirmed, same supplier, not over-paid) are the
  -- allocation trigger's job — it locks the bill while it measures.
  for v_line in select value from jsonb_array_elements(v_allocs) loop
    insert into public.payment_voucher_allocations (voucher_id, bill_id, amount_applied, created_by)
    values (v_id, (v_line ->> 'bill_id')::uuid,
            round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
            v_me);
  end loop;

  perform public._ap_event('PAYMENT_VOUCHER', v_id,
                           case when p_voucher_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.supplier_bill_save_draft(p_bill_id uuid, p_supplier_id uuid, p_supplier_invoice_no text, p_bill_date date, p_lines jsonb, p_due_date date DEFAULT NULL::date, p_ap_account_code text DEFAULT NULL::text, p_narration text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_bill     public.supplier_bills%rowtype;
  v_supplier public.suppliers%rowtype;
  v_invoice  text := btrim(coalesce(p_supplier_invoice_no, ''));
  v_ap       text;
  v_dup      text;
  v_line     jsonb;
  v_n        integer := 0;
  v_total    numeric(12,2) := 0;
  v_rcpt     uuid;
  v_pol_id   uuid;
  v_pol      public.purchase_order_lines%rowtype;
  v_account  text;
  v_qty      numeric(12,2);
  v_price    numeric(12,2);
  v_amount   numeric(12,2);
  v_sku      text;
  v_desc     text;
  v_dept     record;   -- 0540
  v_pos      text[] := '{}';
  v_id       uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'only finance enters a supplier bill'
      using errcode = '42501', detail = 'not_finance';
  end if;

  if p_bill_id is not null then
    select * into v_bill from public.supplier_bills where id = p_bill_id for update;
    if not found then
      raise exception 'That bill does not exist.'
        using errcode = 'P0002', detail = 'bill_missing';
    end if;
    if v_bill.status <> 'draft' then
      raise exception 'Only a draft bill can be changed.'
        using errcode = 'P0001', detail = 'bill_not_draft';
    end if;
  end if;

  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found then
    raise exception 'Choose who sent this bill.'
      using errcode = 'P0001', detail = 'supplier_missing';
  end if;
  if v_invoice = '' then
    raise exception 'Type the invoice number printed on the supplier''s bill.'
      using errcode = 'P0001', detail = 'invoice_no_missing';
  end if;
  if p_bill_date is null then
    raise exception 'Type the date printed on the supplier''s bill.'
      using errcode = 'P0001', detail = 'bill_date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_bill_date, 'This bill');
  if p_due_date is not null and p_due_date < p_bill_date then
    raise exception 'The due date is before the bill date.'
      using errcode = 'P0001', detail = 'due_before_bill_date';
  end if;

  -- The same invoice entered twice is how a supplier gets paid twice. The
  -- unique index (0464) is the last line; this says it in words first.
  select coalesce(b.bill_no, 'a draft bill') into v_dup
    from public.supplier_bills b
   where b.supplier_id = p_supplier_id
     and lower(btrim(b.supplier_invoice_no)) = lower(v_invoice)
     and b.status <> 'cancelled'
     and b.id is distinct from p_bill_id
   limit 1;
  if v_dup is not null then
    raise exception 'Invoice % from % is already entered, as %.', v_invoice, v_supplier.name, v_dup
      using errcode = 'P0001', detail = 'invoice_already_entered';
  end if;

  -- Other payables for an other creditor, trade payables for a supplier,
  -- unless finance chose another SUPPLIER payables account.
  v_ap := coalesce(nullif(btrim(coalesce(p_ap_account_code, '')), ''),
                   public.gl_account_for(
                     case when v_supplier.kind::text = 'other_creditor' then 'OTHER_PAYABLE' else 'TRADE_PAYABLE' end));
  perform public._ap_require_account(v_ap, 'ap', 'Payables account');

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'A bill needs at least one line.'
      using errcode = 'P0001', detail = 'no_lines';
  end if;
  if jsonb_array_length(p_lines) > 300 then
    raise exception 'A bill can have at most 300 lines.'
      using errcode = 'P0001', detail = 'too_many_lines';
  end if;

  if p_bill_id is null then
    insert into public.supplier_bills
      (supplier_invoice_no, supplier_id, bill_date, due_date, ap_account_code,
       narration, created_by)
    values
      (v_invoice, p_supplier_id, p_bill_date, p_due_date, v_ap,
       nullif(btrim(coalesce(p_narration, '')), ''), v_me)
    returning id into v_id;
  else
    v_id := p_bill_id;
    update public.supplier_bills
       set supplier_invoice_no = v_invoice,
           supplier_id         = p_supplier_id,
           bill_date           = p_bill_date,
           due_date            = p_due_date,
           ap_account_code     = v_ap,
           narration           = nullif(btrim(coalesce(p_narration, '')), ''),
           po_id               = null,
           total_amount        = 0
     where id = v_id;
    -- A draft's lines are replaced whole. Allowed only while draft
    -- (supplier_bill_lines_frozen); a draft has posted nothing.
    delete from public.supplier_bill_lines where bill_id = v_id;
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Line % is not a bill line.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end if;
    begin
      v_rcpt   := nullif(btrim(coalesce(v_line ->> 'warehouse_receipt_id', '')), '')::uuid;
      v_pol_id := nullif(btrim(coalesce(v_line ->> 'po_line_id', '')), '')::uuid;
      v_qty    := round(nullif(btrim(coalesce(v_line ->> 'qty', '')), '')::numeric, 2);
      v_price  := round(nullif(btrim(coalesce(v_line ->> 'unit_price', '')), '')::numeric, 2);
      v_amount := round(nullif(btrim(coalesce(v_line ->> 'amount', '')), '')::numeric, 2);
    exception when invalid_text_representation then
      raise exception 'Line %: a number or a link on it is not readable.', v_n
        using errcode = 'P0001', detail = 'line_invalid';
    end;
    v_account := nullif(btrim(coalesce(v_line ->> 'account_code', '')), '');
    v_sku     := nullif(btrim(coalesce(v_line ->> 'sku', '')), '');
    v_desc    := nullif(btrim(coalesce(v_line ->> 'description', '')), '');

    if (v_rcpt is null) <> (v_pol_id is null) then
      raise exception 'Line %: a goods line names both its goods receipt and its PO line.', v_n
        using errcode = 'P0001', detail = 'grn_link_half';
    end if;

    if v_rcpt is not null then
      select * into v_pol from public.purchase_order_lines where id = v_pol_id;
      if not found then
        raise exception 'Line %: that PO line does not exist.', v_n
          using errcode = 'P0001', detail = 'po_line_missing';
      end if;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Line %: type how many % this bill charges for.', v_n, v_pol.sku
          using errcode = 'P0001', detail = 'grn_line_needs_qty';
      end if;
      if v_price is null or v_price < 0 then
        raise exception 'Line %: type the unit price on the supplier''s bill.', v_n
          using errcode = 'P0001', detail = 'grn_line_needs_price';
      end if;
      v_amount  := round(v_qty * v_price, 2);
      v_account := coalesce(v_account, public.gl_account_for('COST_OF_GOODS_SOLD'));  -- periodic stock
      v_sku     := coalesce(v_sku, v_pol.sku);
      v_desc    := coalesce(v_desc, v_pol.sku);
      if not (v_pol.po_id = any (v_pos)) then
        v_pos := v_pos || v_pol.po_id;
      end if;
    else
      if v_qty is not null and v_qty <= 0 then
        raise exception 'Line %: the quantity must be more than 0.', v_n
          using errcode = 'P0001', detail = 'line_qty_invalid';
      end if;
      if v_price is not null and v_price < 0 then
        raise exception 'Line %: the unit price cannot be below 0.', v_n
          using errcode = 'P0001', detail = 'line_price_invalid';
      end if;
      if v_qty is not null and v_price is not null then
        v_amount := round(v_qty * v_price, 2);
      end if;
      if v_desc is null and v_sku is null then
        raise exception 'Line %: say what this charge is for.', v_n
          using errcode = 'P0001', detail = 'line_needs_description';
      end if;
    end if;

    if v_amount is null or v_amount <= 0 then
      raise exception 'Line %: the amount must be more than RM 0.00.', v_n
        using errcode = 'P0001', detail = 'line_amount_invalid';
    end if;
    perform public._ap_require_account(v_account, 'bill_line', format('Line %s', v_n));
    -- 0540: a goods line with no department takes its sales order's (DEPT-6).
    if v_pol_id is not null and nullif(btrim(coalesce(v_line ->> 'department_type', '')), '') is null then
      v_line := v_line || coalesce((select jsonb_build_object('department_type', d.department_type,
                                                              'department_id',   d.department_id)
                                      from public.fin_po_line_departments d
                                     where d.po_line_id = v_pol_id), '{}'::jsonb);
    end if;
    v_dept := public.fin_line_department(v_line, v_account, format('Line %s', v_n));

    insert into public.supplier_bill_lines
      (bill_id, line_no, account_code, description, sku, qty, unit_price, amount,
       warehouse_receipt_id, po_line_id, department_type, department_id)
    values
      (v_id, v_n, v_account, v_desc, v_sku, v_qty, v_price, v_amount,
       v_rcpt, v_pol_id, v_dept.department_type, v_dept.department_id);
    v_total := v_total + v_amount;
  end loop;

  update public.supplier_bills
     set total_amount = v_total,
         po_id        = case when cardinality(v_pos) = 1 then v_pos[1] end
   where id = v_id;

  perform public._ap_event('SUPPLIER_BILL', v_id,
                           case when p_bill_id is null then 'created' else 'edited' end, null);
  return v_id;
end;
$function$
;

-- ── 4 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  r      record;
  v_fn   text;
  v_miss int;
begin
  -- The mapping cascades, or the whole migration is decoration.
  if not exists (
    select 1 from pg_constraint c
     where c.conrelid = 'public.gl_account_roles'::regclass
       and c.contype = 'f' and c.confupdtype = 'c') then
    raise exception '0554 sanity: gl_account_roles.account_code does not cascade on update';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.gl_account_roles'::regclass) then
    raise exception '0554 sanity: gl_account_roles has no row-level security';
  end if;
  if has_table_privilege('anon', 'public.gl_account_roles', 'select')
     or has_table_privilege('authenticated', 'public.gl_account_roles', 'select') then
    raise exception '0554 sanity: gl_account_roles is readable by a caller';
  end if;
  if has_function_privilege('anon', 'public.gl_account_for(text)', 'execute')
     or has_function_privilege('authenticated', 'public.gl_account_for(text)', 'execute') then
    raise exception '0554 sanity: gl_account_for is callable by a caller';
  end if;

  -- Every role resolves, and resolves to an account that can actually be
  -- posted to: in use, and not a heading with children under it.
  for r in select role, account_code from public.gl_account_roles loop
    if public.gl_account_for(r.role) is distinct from r.account_code then
      raise exception '0554 sanity: gl_account_for(%) does not return %', r.role, r.account_code;
    end if;
    if not exists (select 1 from public.gl_accounts a
                    where a.code = r.account_code and a.is_active) then
      raise exception '0554 sanity: % names account %, which is not in use', r.role, r.account_code;
    end if;
    if exists (select 1 from public.gl_accounts a where a.parent_code = r.account_code) then
      raise exception '0554 sanity: % names account %, which is a heading', r.role, r.account_code;
    end if;
  end loop;

  -- An unmapped role must raise, not return null. Checked, not assumed.
  begin
    perform public.gl_account_for('0554_NO_SUCH_ROLE');
    raise exception '0554 sanity: an unmapped role did not raise';
  exception when sqlstate '22023' then
    null;
  end;

  -- The thirteen sites are wired. This is the check that catches the real
  -- hazard: a later migration re-emitting one of these bodies from an older
  -- file and quietly putting the number back. 0510 asserts on function source
  -- the same way, for the same reason.
  v_miss := 0;
  foreach v_fn in array array[
    'public._ap_require_account(text,text,text)',
    'public._gl_money_move_check(text,text,text,numeric,numeric,date)',
    'public.ap_account_choices()',
    'public.fin_money_in_account_problem(text,text)',
    'public.gl_balance_sheet(date,text,uuid)',
    'public.gl_manual_journal(date,text,jsonb,uuid)',
    'public.gl_money_move_approve(uuid)',
    'public.payment_voucher_save_draft(uuid,text,uuid,text,date,text,jsonb,jsonb,text,text,text,numeric)',
    'public.supplier_bill_save_draft(uuid,uuid,text,date,jsonb,date,text,text)'
  ] loop
    if position('gl_account_for(' in
         (select prosrc from pg_proc where oid = v_fn::regprocedure)) = 0 then
      raise exception '0554 sanity: % does not read the chart through gl_account_roles', v_fn;
    end if;
    v_miss := v_miss + 1;
  end loop;
  if v_miss <> 9 then
    raise exception '0554 sanity: checked % bodies, expected 9', v_miss;
  end if;
end $sanity$;

commit;
