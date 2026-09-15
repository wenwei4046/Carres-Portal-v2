-- =============================================================================
-- 0512_finance_keeps_one_list_of_bank_and_cash_accounts.sql
-- =============================================================================
-- WHAT WAS WRONG
--   Three different rules decided which accounts hold money, and they did not
--   agree:
--     (a) ap_account_is_money (0477) walked up to 1100. It fed the payment
--         voucher's Paid from, and money back's Received into (0485).
--     (b) fin_money_in_account_problem(..., 'money') (0478) took any direct
--         child of 1100. It fed Other receipts' Received into.
--     (c) gl_money_account_ok (0476) walked up to 1100 again. It fed the
--         accounts a payment method may land in (Settings -> Payment).
--   None of them knew a bank from a card company. So 1130 Card and online
--   settlement was offered as Paid from on a voucher, though Carres never pays
--   a supplier from a card company's holding account. And the chart had one
--   bank account, 1120, for every real bank.
--
-- THE RULING (YH, 15 Sep 2026): each real bank gets its own ledger account,
--   which makes bank reconciliation easy, and Finance sets the list. Card and
--   online payment companies (GHL, AhaPay, Online) are not banks: their money
--   waits in a holding account until they pay out to a bank.
--
-- WHAT THIS CHANGES
--   1. public.gl_money_accounts: the one list. A row names a chart account
--      and its kind -- CASH, BANK or HOLDING -- and whether it is in use.
--      Who added or changed it, and when, as other finance doors record it
--      (created_by / updated_by, the finance_parties pattern of 0478).
--   2. The chart gains 1121 Public Bank, 1122 Maybank, 1123 Hong Leong and
--      1124 RHB (BANK; RHB kept by YH's ruling of 15 Sep 2026), and
--      1131 GHL, 1132 AhaPay, 1133 Online (HOLDING), all under 1100.
--      1110 is CASH, 1120 BANK, 1130 HOLDING. All stay active: they carry
--      test balances, and Settings -> Payment still points methods at them
--      until Finance re-points them.
--   3. The one definition, gl_money_account_ok(code, direction):
--        'out' (Paid from)                        CASH, BANK
--        'in'  (Received into, Settings->Payment) CASH, BANK, HOLDING
--      and only while the account is on the list, in use, and an active,
--      non-control ASSET leaf. (a), (b) and (c) now all read it:
--        - gl_money_account_ok(text) is the 'in' direction.
--        - ap_account_is_money(text) means "on the list", so a bill line still
--          refuses every money account, holding ones included.
--        - _ap_require_account: 'pay_from' is 'out'; a new 'received_into' is
--          'in'. ap_account_choices.for_pay_from is 'out'.
--        - fin_money_in_account_problem 'money' is 'in'; a receipt or invoice
--          line refuses any account on the list.
--        - supplier_advance_money_back_record checks 'received_into'.
--   4. Doors for Finance (finance and principal; refused in the database,
--      NULL-safe): gl_money_accounts_list(), gl_money_account_add(name, kind)
--      and gl_money_account_update(code, name, is_active). An added account
--      takes the next free code, 1121-1129 for a bank and 1131-1139 for a
--      holding account. Taking one out of use is refused while its ledger
--      total is not RM 0.00.
--
--   "Not in use" is the list's own flag, not gl_accounts.is_active: 0462's
--   gl_accounts_protect_posted refuses to retire an account with posted lines,
--   so the entries on it stay reversible. An account out of use leaves every
--   picker and every money door; the ledger keeps it.
--
--   Every redefined function body is copied from its latest file and changed
--   only where marked 0512:
--     _ap_require_account, ap_account_choices    from 0510_advances_to_suppliers_is_written_only_by_the_advance_flow.sql
--     fin_money_in_account_problem               from 0510_advances_to_suppliers_is_written_only_by_the_advance_flow.sql
--     supplier_advance_money_back_record         from 0485_an_advance_is_knocked_off_a_bill_or_paid_back.sql
--   0510 is PR #1358 (1230 off the pickers). These copies carry its change,
--   so this file runs after it and does not undo it.
--   `create or replace` keeps their grants. Customer payments post exactly as
--   before: _customer_payment_post reads gl_payment_account_map and never
--   calls these helpers.
--
-- NOT HERE: moving a holding account's money into a bank (the settle step).
--
-- RLS: gl_money_accounts is read by finance and principal (gl_may_read), and
--   written only through the definer doors. DATA: the seven accounts and ten
--   list rows above. DR/CR: none.
-- =============================================================================

begin;

-- ── 1 · the list ─────────────────────────────────────────────────────────────
create table public.gl_money_accounts (
  account_code  text primary key references public.gl_accounts(code),
  money_kind    text not null check (money_kind in ('CASH','BANK','HOLDING')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references public.app_users(id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.app_users(id)
);

comment on table public.gl_money_accounts is
  '0512: the one list of money accounts. CASH and BANK may pay out (Paid from) and take money in; HOLDING (a card or online payment company''s money, waiting for its payout to a bank) only takes money in. is_active is the list''s own flag: gl_accounts.is_active cannot be turned off once an account has posted lines (0462).';

alter table public.gl_money_accounts enable row level security;
revoke all on public.gl_money_accounts from anon, authenticated;
grant select on public.gl_money_accounts to authenticated;
create policy gl_money_accounts_read_internal on public.gl_money_accounts
  for select using ((select public.gl_may_read()));

-- ── 2 · the accounts, seeded ─────────────────────────────────────────────────
insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for) values
  ('1121', 'Public Bank', 'ASSET', '1100', false, true, null),
  ('1122', 'Maybank',     'ASSET', '1100', false, true, null),
  ('1123', 'Hong Leong',  'ASSET', '1100', false, true, null),
  ('1124', 'RHB',         'ASSET', '1100', false, true, null),
  ('1131', 'GHL',         'ASSET', '1100', false, true, null),
  ('1132', 'AhaPay',      'ASSET', '1100', false, true, null),
  ('1133', 'Online',      'ASSET', '1100', false, true, null);

insert into public.gl_money_accounts (account_code, money_kind) values
  ('1110', 'CASH'),
  ('1120', 'BANK'),
  ('1121', 'BANK'),
  ('1122', 'BANK'),
  ('1123', 'BANK'),
  ('1124', 'BANK'),
  ('1130', 'HOLDING'),
  ('1131', 'HOLDING'),
  ('1132', 'HOLDING'),
  ('1133', 'HOLDING');

-- ── 3 · the one definition ───────────────────────────────────────────────────
create or replace function public.gl_money_account_ok(p_account_code text, p_direction text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((
    select m.is_active and a.is_active and a.kind = 'ASSET' and not a.is_control
           and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
           and case p_direction
                 when 'out' then m.money_kind in ('CASH','BANK')
                 when 'in'  then m.money_kind in ('CASH','BANK','HOLDING')
                 else false
               end
      from public.gl_money_accounts m
      join public.gl_accounts a on a.code = m.account_code
     where m.account_code = p_account_code), false);
$fn$;

comment on function public.gl_money_account_ok(text, text) is
  '0512: THE money-account rule. ''out'' (Paid from) is CASH or BANK; ''in'' (Received into, a payment method''s money account) is CASH, BANK or HOLDING. Only an in-use gl_money_accounts row on an active, non-control ASSET leaf. Anything else, NULL included, is false.';
revoke all on function public.gl_money_account_ok(text, text) from public, anon, authenticated;

-- (c) Settings -> Payment: a method's money lands in a money-in account.
create or replace function public.gl_money_account_ok(p_account_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select public.gl_money_account_ok(p_account_code, 'in');
$fn$;

comment on function public.gl_money_account_ok(text) is
  '0476, 0512: true for an account customer money may land in -- gl_money_account_ok(code, ''in''): cash, a bank or a holding account on the money-account list.';

-- (a) "Is this a money account at all": on the list, in use or not. A bill
-- line refuses it; the Paid from and Received into checks ask the direction.
create or replace function public.ap_account_is_money(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  return exists (select 1 from public.gl_money_accounts m where m.account_code = p_code);
end;
$fn$;

comment on function public.ap_account_is_money(text) is
  '0512: true for any account on gl_money_accounts (cash, bank or holding; in use or not). Was: an asset leaf under 1100 (0477).';

-- Refusals per use. Copied from 0510_advances_to_suppliers_is_written_only_by_the_advance_flow.sql; the pay_from branch is 0512's.
create or replace function public._ap_require_account(p_code text, p_use text, p_what text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
  if v_acc.code = '1230' and p_use in ('bill_line','voucher_line') then
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
$fn$;

-- The accounts the payables forms may offer. Copied from 0510_advances_to_suppliers_is_written_only_by_the_advance_flow.sql.
create or replace function public.ap_account_choices()
returns table (
  code             text,
  name             text,
  kind             text,
  parent_code      text,
  is_control       boolean,
  control_for      text,
  for_bill_line    boolean,
  for_voucher_line boolean,
  for_ap           boolean,
  for_pay_from     boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return query
  select a.code, a.name, a.kind, a.parent_code, a.is_control, a.control_for,
         (not a.is_control and a.code <> '1230' and a.kind in ('EXPENSE','ASSET') and not public.ap_account_is_money(a.code)),
         (not a.is_control and a.code <> '1230' and a.kind in ('EXPENSE','ASSET','LIABILITY')),
         (a.kind = 'LIABILITY' and a.is_control and a.control_for = 'SUPPLIER'),
         public.gl_money_account_ok(a.code, 'out')      -- 0512: cash and bank only
    from public.gl_accounts a
   where a.is_active
     and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
   order by a.code;
end;
$fn$;

-- (b) Other receipts and other debtor invoices. Copied from 0510_advances_to_suppliers_is_written_only_by_the_advance_flow.sql.
create or replace function public.fin_money_in_account_problem(p_code text, p_use text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
  if v.is_control or v.code = '1230' then
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
$fn$;

-- Money back is money IN. Copied from 0485_an_advance_is_knocked_off_a_bill_or_paid_back.sql; one line changed.
create or replace function public.supplier_advance_money_back_record(
  p_voucher_id         uuid,
  p_money_back_date    date,
  p_money_account_code text,
  p_amount             numeric,
  p_reference          text default null,
  p_narration          text default null,
  p_idempotency_key    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     text := public.app_role()::text;
  v_me       uuid := (select u.id from public.app_users u where u.id = auth.uid());
  v_seen     public.supplier_advance_money_back%rowtype;
  v_v        public.payment_vouchers%rowtype;
  v_money    text := btrim(coalesce(p_money_account_code, ''));
  v_ref      text := nullif(btrim(coalesce(p_reference, '')), '');
  v_narr     text := nullif(btrim(coalesce(p_narration, '')), '');
  v_supplier text;
  v_open     numeric(12,2);
  v_id       uuid;
  v_no       text;
  v_entry    uuid;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance records money back.'
      using errcode = '42501', detail = 'not_finance';
  end if;

  -- A double press sends the same key twice. The lock queues the second call
  -- behind the first, and the second finds the first's record (0478 pattern).
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('supplier_money_back:' || p_idempotency_key::text, 0));
    select m.* into v_seen from public.supplier_advance_money_back m
     where m.idempotency_key = p_idempotency_key;
    if found then
      -- The same key must carry the same money back. A key re-sent with a
      -- different voucher, amount, account or date is not a double press: say
      -- so, never hand back a record that is not what the person typed.
      if v_seen.voucher_id <> p_voucher_id
         or v_seen.amount <> p_amount
         or v_seen.money_account_code <> btrim(coalesce(p_money_account_code, ''))
         or v_seen.money_back_date is distinct from p_money_back_date then
        raise exception 'This money back was already recorded as % with different details. Open the form again to record another.',
          v_seen.money_back_no
          using errcode = 'P0001', detail = 'idempotency_mismatch';
      end if;
      return v_seen.id;
    end if;
  end if;

  if p_money_back_date is null then
    raise exception 'Type the date the money came back.'
      using errcode = 'P0001', detail = 'date_missing';
  end if;
  perform public.ap_refuse_before_go_live(p_money_back_date, 'This money back');
  perform public._ap_require_account(v_money, 'received_into', 'Received into');   -- 0512: money in
  if p_amount is null or p_amount <= 0 then
    raise exception 'The amount must be more than RM 0.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;
  if round(p_amount, 2) <> p_amount then
    raise exception 'Type the amount in ringgit and sen, like 1250.00.'
      using errcode = 'P0001', detail = 'amount_invalid';
  end if;

  select * into v_v from public.payment_vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'That payment voucher does not exist.'
      using errcode = 'P0002', detail = 'voucher_missing';
  end if;
  if v_v.advance_amount = 0 then
    raise exception 'Payment voucher % carries no advance.', coalesce(v_v.voucher_no, 'in draft')
      using errcode = 'P0001', detail = 'no_advance';
  end if;
  if v_v.status <> 'approved' then
    raise exception 'The advance on % is not paid yet, so no money can come back from it.',
      coalesce(v_v.voucher_no, 'this voucher')
      using errcode = 'P0001', detail = 'advance_not_paid';
  end if;
  if p_money_back_date < v_v.voucher_date then
    raise exception 'The money cannot come back before the advance was paid on %.',
      to_char(v_v.voucher_date, 'DD Mon YYYY')
      using errcode = 'P0001', detail = 'money_back_before_advance';
  end if;

  v_open := coalesce((select ao.advance_open from public.supplier_advance_open(p_voucher_id) ao), 0);
  if p_amount > v_open then
    raise exception 'Only RM % of the advance on % is left. RM % is more than that.',
      to_char(v_open, 'FM999,999,999,990.00'), v_v.voucher_no,
      to_char(p_amount, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'money_back_over_advance';
  end if;

  select s.name into v_supplier from public.suppliers s where s.id = v_v.supplier_id;
  v_id := gen_random_uuid();
  v_no := public.allocate_formal_document_code(public.supplier_money_back_prefix(), v_id::text, p_money_back_date);

  -- Dr the money account; Cr the advance's own payables control, party = the
  -- supplier. The supplier's payables balance rises by what came back.
  v_entry := public.gl_post(
    'SUPPLIER_MONEY_BACK',
    v_no,
    p_money_back_date,
    coalesce(v_narr, 'Money back ' || v_no || ' · ' || v_supplier),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_money,
        'debit',  p_amount,
        'credit', 0,
        'memo',   concat_ws(' · ', 'Money back ' || v_no, v_ref, v_supplier)),
      jsonb_build_object(
        'account_code', v_v.ap_account_code,
        'debit',  0,
        'credit', p_amount,
        'party_type', 'SUPPLIER',
        'party_id',   v_v.supplier_id,
        'memo',   'Advance · ' || v_v.voucher_no)));

  insert into public.supplier_advance_money_back
    (id, money_back_no, voucher_id, money_back_date, money_account_code, amount,
     reference, narration, status, gl_entry_id, idempotency_key, created_by)
  values
    (v_id, v_no, p_voucher_id, p_money_back_date, v_money, p_amount,
     v_ref, v_narr, 'posted', v_entry, p_idempotency_key, v_me);

  perform public._ap_event('PAYMENT_VOUCHER', p_voucher_id, 'money_back',
                           v_no || ' · ' || public.fin_rm(p_amount));
  return v_id;
end;
$fn$;

-- ── 4 · Finance's doors ──────────────────────────────────────────────────────
create or replace function public.gl_money_accounts_list()
returns table (code text, name text, money_kind text, is_active boolean)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not public.gl_may_read() then
    raise exception 'The money accounts are for Finance.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  return query
  select a.code, a.name, m.money_kind, (m.is_active and a.is_active)
    from public.gl_money_accounts m
    join public.gl_accounts a on a.code = m.account_code
   order by a.code;
end;
$fn$;

-- Name rules shared by add and update. Returns the trimmed name.
create or replace function public._gl_money_account_name(p_name text, p_except text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_name = '' then
    raise exception 'Type the account name.'
      using errcode = '22023', detail = 'name_missing';
  end if;
  if length(v_name) > 60 then
    raise exception 'Keep the name to 60 characters.'
      using errcode = '22023', detail = 'name_too_long';
  end if;
  if exists (select 1 from public.gl_money_accounts m
               join public.gl_accounts a on a.code = m.account_code
              where lower(a.name) = lower(v_name)
                and a.code is distinct from p_except) then
    raise exception 'A money account named % is already on the list.', v_name
      using errcode = '22023', detail = 'name_exists';
  end if;
  return v_name;
end;
$fn$;

create or replace function public.gl_money_account_add(p_name text, p_kind text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role text := public.app_role()::text;
  v_name text;
  v_code text;
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the money accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  if p_kind is null or p_kind not in ('BANK','HOLDING') then
    raise exception 'Choose the kind: a bank, or an online payment company.'
      using errcode = '22023', detail = 'kind_invalid';
  end if;
  -- Two people adding at once must not both pick the same next code.
  perform pg_advisory_xact_lock(hashtext('gl_money_account_add'));
  v_name := public._gl_money_account_name(p_name, null);

  select min(c.code) into v_code
    from (select ((case p_kind when 'BANK' then 1121 else 1131 end) + g)::text as code
            from generate_series(0, 8) g) c
   where not exists (select 1 from public.gl_accounts a where a.code = c.code);
  if v_code is null then
    raise exception 'Codes % are all used. Take an account out of use, or ask for a new range.',
      case p_kind when 'BANK' then '1121 to 1129' else '1131 to 1139' end
      using errcode = 'P0001', detail = 'no_code_left';
  end if;

  insert into public.gl_accounts (code, name, kind, parent_code, is_control, is_active, control_for)
  values (v_code, v_name, 'ASSET', '1100', false, true, null);
  insert into public.gl_money_accounts (account_code, money_kind, created_by, updated_by)
  values (v_code, p_kind, auth.uid(), auth.uid());
  return v_code;
end;
$fn$;

create or replace function public.gl_money_account_update(p_code text, p_name text, p_is_active boolean)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role  text := public.app_role()::text;
  v_m     public.gl_money_accounts%rowtype;
  v_old   text;
  v_name  text;
  v_total numeric(14,2);
begin
  if v_role is null or v_role not in ('finance','principal') then
    raise exception 'Only Finance changes the money accounts.'
      using errcode = '42501', detail = 'not_finance';
  end if;
  select * into v_m from public.gl_money_accounts where account_code = p_code for update;
  if not found then
    raise exception 'That money account is not on the list.'
      using errcode = 'P0002', detail = 'money_account_missing';
  end if;
  select a.name into v_old from public.gl_accounts a where a.code = p_code;
  v_name := public._gl_money_account_name(p_name, p_code);

  -- Out of use only at RM 0.00: money still on it would drop out of every
  -- picker while the ledger still holds it.
  if v_m.is_active and p_is_active is false then
    select coalesce(sum(l.debit - l.credit), 0) into v_total
      from public.gl_entry_lines l where l.account_code = p_code;
    if v_total <> 0 then
      raise exception '% % is not at RM 0.00 in the ledger. It stays in use until it is.', p_code, v_old
        using errcode = 'P0001', detail = 'money_account_not_zero';
    end if;
  end if;

  if v_name is distinct from v_old then
    update public.gl_accounts set name = v_name where code = p_code;
  end if;
  update public.gl_money_accounts
     set is_active  = coalesce(p_is_active, v_m.is_active),
         updated_at = now(),
         updated_by = auth.uid()
   where account_code = p_code;
  return p_code;
end;
$fn$;

comment on function public.gl_money_accounts_list() is
  '0512: the money-account list for Finance -- code, name, kind, in use. Finance and principal (gl_may_read).';
comment on function public.gl_money_account_add(text, text) is
  '0512: adds a BANK (next free 1121-1129) or HOLDING (next free 1131-1139) account under 1100 and puts it on the list. Finance or principal.';
comment on function public.gl_money_account_update(text, text, boolean) is
  '0512: renames a money account, or takes it in or out of use. Out of use is refused while its ledger total is not RM 0.00. Finance or principal.';

revoke all on function public.gl_money_accounts_list()                         from public, anon;
revoke all on function public.gl_money_account_add(text, text)                 from public, anon;
revoke all on function public.gl_money_account_update(text, text, boolean)     from public, anon;
revoke all on function public._gl_money_account_name(text, text)               from public, anon, authenticated;
grant execute on function public.gl_money_accounts_list()                      to authenticated;
grant execute on function public.gl_money_account_add(text, text)              to authenticated;
grant execute on function public.gl_money_account_update(text, text, boolean)  to authenticated;

-- ── 5 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v_fn text;
begin
  -- Every account that held money before this file is on the list, so no
  -- door that took it yesterday refuses it today.
  if exists (
    with recursive under(code) as (
      select a.code from public.gl_accounts a where a.parent_code = '1100'
      union all
      select a.code from public.gl_accounts a join under u on a.parent_code = u.code
    )
    select 1 from public.gl_accounts a join under u on u.code = a.code
     where a.is_active and a.kind = 'ASSET' and not a.is_control
       and not exists (select 1 from public.gl_accounts c where c.parent_code = a.code)
       and not exists (select 1 from public.gl_money_accounts m where m.account_code = a.code)
  ) then
    raise exception '0512 sanity: an account under 1100 is not on the money-account list';
  end if;

  -- The rule, account by account.
  if not public.gl_money_account_ok('1110', 'out') or not public.gl_money_account_ok('1110', 'in')
     or not public.gl_money_account_ok('1120', 'out') or not public.gl_money_account_ok('1121', 'out')
     or not public.gl_money_account_ok('1123', 'in')
     or public.gl_money_account_ok('1130', 'out') or not public.gl_money_account_ok('1130', 'in')
     or public.gl_money_account_ok('1131', 'out') or not public.gl_money_account_ok('1133', 'in')
     or public.gl_money_account_ok('1100', 'in') or public.gl_money_account_ok('2110', 'in')
     or public.gl_money_account_ok('1110', null) or public.gl_money_account_ok(null, 'in')
     or not public.gl_money_account_ok('1132') or public.gl_money_account_ok('1210')
     or not public.ap_account_is_money('1131') or public.ap_account_is_money('5100') then
    raise exception '0512 sanity: gl_money_account_ok does not say cash and bank out, and cash, bank and holding in';
  end if;
  if public.fin_money_in_account_problem('1131', 'money') is not null
     or public.fin_money_in_account_problem('2110', 'money') is null
     or public.fin_money_in_account_problem('1121', 'receipt_line') is null then
    raise exception '0512 sanity: Other receipts do not read the money-account list';
  end if;

  -- The copies kept their sources and took the one rule.
  foreach v_fn in array array['_ap_require_account', 'ap_account_choices',
                              'fin_money_in_account_problem', 'supplier_advance_money_back_record'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = v_fn
                      and p.prosrc like '%0512%') then
      raise exception '0512 sanity: % was not redefined', v_fn;
    end if;
  end loop;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'supplier_advance_money_back_record'
                    and p.prosrc like '%''received_into''%') then
    raise exception '0512 sanity: money back does not check a money-in account';
  end if;

  -- Grants: the helpers stay internal; the doors are for signed-in users only.
  if has_function_privilege('authenticated', 'public.gl_money_account_ok(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.gl_money_account_ok(text)', 'execute')
     or has_function_privilege('authenticated', 'public._gl_money_account_name(text, text)', 'execute') then
    raise exception '0512 sanity: a money-account helper is callable from the API';
  end if;
  if has_function_privilege('anon', 'public.gl_money_accounts_list()', 'execute')
     or has_function_privilege('anon', 'public.gl_money_account_add(text, text)', 'execute')
     or has_function_privilege('anon', 'public.gl_money_account_update(text, text, boolean)', 'execute') then
    raise exception '0512 sanity: anon can execute a money-account door';
  end if;
  if not has_function_privilege('authenticated', 'public.gl_money_account_add(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_money_account_update(text, text, boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.gl_money_accounts_list()', 'execute') then
    raise exception '0512 sanity: authenticated cannot execute a money-account door';
  end if;
  if has_table_privilege('anon', 'public.gl_money_accounts', 'select')
     or has_table_privilege('authenticated', 'public.gl_money_accounts', 'insert')
     or has_table_privilege('authenticated', 'public.gl_money_accounts', 'update') then
    raise exception '0512 sanity: gl_money_accounts is writable or readable past its gate';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('gl_money_account_ok', 'gl_money_accounts_list', 'gl_money_account_add',
                                  'gl_money_account_update', '_gl_money_account_name', 'ap_account_is_money')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0512 sanity: a money-account function lost security definer or its search_path';
  end if;
end
$sanity$;

commit;
