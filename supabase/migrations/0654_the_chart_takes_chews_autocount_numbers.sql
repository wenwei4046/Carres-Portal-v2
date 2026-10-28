-- =============================================================================
-- 0654_the_chart_takes_chews_autocount_numbers.sql
-- =============================================================================
-- WHAT WAS WRONG
--   The ledger still ran on the four-digit test chart that 0461 seeded (1110
--   Cash on hand, 2110 Trade payables, 4100 Furniture sales ...). Carres keeps
--   its books in AutoCount under a different chart (310-2000 HONG LEONG BANK,
--   400-0000 TRADE CREDITORS, 500-0000 SALES ...), so nothing the ledger
--   printed could be read against AutoCount.
--
-- THE RULING (Chew, Finance, 2026-10-07, docs/finance/MASTER.md §0 "The account
--   mapping — approved by Chew"): the ledger uses Chew's AutoCount numbers. Only
--   the accounts the system itself posts to are made here, with plain names.
--   Every other account of Chew's chart comes in through the chart import
--   (0655), from the AutoCount PDF Chew uploads; that chart names people and
--   companies and is never written into this public repository.
--
-- WHAT THIS DOES
--   1. Renumbers each system account to its AutoCount number and name. Every
--      key onto gl_accounts(code) is ON UPDATE CASCADE (0570, 0647), so roles,
--      money accounts, payment and income maps, card routes, documents and
--      posted lines all follow, through the same renumber settings
--      gl_account_update uses.
--   2. Adds the accounts the approved mapping names that the system will post
--      to (clearing per merchant, Alliance Bank, accrued dealer commission and
--      rebate, subscription income and creditors, purchases by product kind,
--      cost of service, bad debts ...), and the headings they hang under.
--   3. Lays the chart out as AutoCount lists it: under the seven top headings
--      (ASSETS, LIABILITIES, EQUITY, INCOME, COST OF GOODS SOLD, EXPENSES, TAX)
--      accounts read in number order, so every sort_order goes back to 0.
--   4. Retires the test accounts the new chart has no place for. An account
--      with posted lines cannot be retired (gl_accounts_protect_posted), so it
--      stays, marked TEST ONLY; the clean start at go-live (CLAUDE.md §6)
--      removes the test lines that keep it.
--   5. Bank transfers, cheques, FPX and DuitNow go straight into Hong Leong
--      Bank (Chew: 「duitnow QR 和fpx 照理说直接进银行」, 「HLBB 但要能maintain」);
--      Stripe goes to its own clearing account. Cards stay on the one waiting
--      account until each merchant machine has its own method (next change).
--   6. Roles: STOCK (330-0000), the clearing heading, and one section role per
--      top heading, which the chart import reads to place AutoCount's sections.
--   7. fin_money_in_account_problem stops testing two headings that no longer
--      exist and tests the two accounts instead (customer deposits, stock).
--
-- REPLAY: every step checks what is there before it acts, because production's
--   chart carries screen-made changes a replay from 0001 does not have (a test
--   heading, an account moved under another heading).
-- RLS: unchanged. DATA: configuration rows only (the chart, its maps and roles);
--   no ledger line is written. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- One chart change at a time, as gl_account_update and gl_account_move.
select pg_advisory_xact_lock(hashtext('gl_chart_structure'));

-- ── 1 · renumber the system accounts, then name them ─────────────────────────
do $renumber$
declare
  r record;
begin
  for r in
    select * from (values
      ('1100', '310-0000', 'CASH AT BANK'),
      ('1110', '320-0000', 'CASH IN HAND'),
      ('1122', '310-4000', 'MAYBANK'),
      ('1123', '310-2000', 'HONG LEONG BANK'),
      ('1124', '310-3000', 'RHB BANK'),
      ('1131', '315-2000', 'MERCHANT - GHL'),
      ('1132', '315-6000', 'MERCHANT - AHAPAY'),
      ('1133', '315-5000', 'STRIPE'),
      ('1210', '300-0000', 'TRADE DEBTORS'),
      ('1240', '305-0000', 'OTHER DEBTOR'),
      ('1310', '330-0000', 'STOCK'),
      ('2110', '400-0000', 'TRADE CREDITORS'),
      ('2120', '405-0000', 'OTHERS CREDITORS'),
      ('2130', '410-0063', 'ACCRUALS - EXPENSE'),
      ('2210', '440-0000', 'DEPOSIT RECEIVED'),
      ('2310', '430-0000', 'SALES TAX'),
      ('3100', '100-0000', 'CAPITAL'),
      ('3200', '150-0000', 'RETAINED EARNING'),
      ('3300', '160-0000', 'OPENING BALANCE'),
      ('4100', '500-0000', 'SALES'),
      ('4200', '500-2000', 'SUBSCRIPTION'),
      ('4300', '500-3000', 'SERVICE CHARGES'),
      ('4400', '500-4000', 'STORAGE CHARGES'),
      ('4900', '580-0000', 'ADDITIONAL INCOME'),
      ('5100', '610-0000', 'PURCHASES'),
      ('5200', '630-0000', 'TRANSPORT COST - PURCHASE'),
      ('6300', '900-T002', 'TRANSPORT - LOGISTIC COST'),
      ('6400', '900-W005', 'WARRANTY & AFTER-SALES COST'),
      ('6500', '902-0000', 'BANK CHARGES')
    ) as v(old_code, new_code, new_name)
  loop
    if exists (select 1 from public.gl_accounts where code = r.old_code)
       and not exists (select 1 from public.gl_accounts where code = r.new_code) then
      perform set_config('carres.gl_renumber_from', r.old_code, true),
              set_config('carres.gl_renumber_to',   r.new_code, true);
      update public.gl_accounts set code = r.new_code where code = r.old_code;
      perform set_config('carres.gl_renumber_from', '', true),
              set_config('carres.gl_renumber_to',   '', true);
    end if;
    update public.gl_accounts set name = r.new_name
     where code = r.new_code and name is distinct from r.new_name;
  end loop;

  -- The top headings keep their numbers and take AutoCount's section words.
  for r in
    select * from (values
      ('0000', 'ASSETS'),
      ('2000', 'LIABILITIES'),
      ('3000', 'EQUITY'),
      ('4000', 'INCOME'),
      ('5000', 'COST OF GOODS SOLD'),
      ('6000', 'EXPENSES')
    ) as v(code, new_name)
  loop
    update public.gl_accounts set name = r.new_name
     where code = r.code and name is distinct from r.new_name;
  end loop;
end $renumber$;

-- ── 2 · the headings and accounts the system posts to ────────────────────────
-- Headings first, so every account below has its parent. An account Chew has
-- already made with the same number is left as it is.
insert into public.gl_accounts (code, name, kind, parent_code, is_heading, is_active, is_control, control_for, sort_order)
values
  ('7000',     'TAX',                    'EXPENSE',   null,   true, true, false, null, 0),
  ('315-0000', 'CARD & ONLINE CLEARING', 'ASSET',     '0000', true, true, false, null, 0),
  ('410-0000', 'ACCRUALS',               'LIABILITY', '2000', true, true, false, null, 0),
  ('900-C001', 'COMMISSION',             'EXPENSE',   '6000', true, true, false, null, 0),
  ('900-T005', 'TRANSPORT EXPENSE',      'EXPENSE',   '6000', true, true, false, null, 0)
on conflict (code) do nothing;

insert into public.gl_accounts (code, name, kind, parent_code, is_heading, is_active, is_control, control_for, sort_order)
values
  ('310-1000', 'ALLIANCE BANK',                 'ASSET',     '310-0000', false, true, false, null, 0),
  ('315-1000', 'MERCHANT - PBB',                'ASSET',     '315-0000', false, true, false, null, 0),
  ('315-3000', 'MERCHANT - HLBB',               'ASSET',     '315-0000', false, true, false, null, 0),
  ('315-4000', 'MERCHANT - MBB',                'ASSET',     '315-0000', false, true, false, null, 0),
  ('401-0000', 'SUBSCRIPTION CREDITORS',        'LIABILITY', '2000',     false, true, false, null, 0),
  ('410-0060', 'ACCRUALS - COMMISSION AGENT',   'LIABILITY', '410-0000', false, true, false, null, 0),
  ('410-0061', 'ACCRUALS - COMMISSION DEALER',  'LIABILITY', '410-0000', false, true, false, null, 0),
  ('410-0064', 'ACCRUALS - RENOVATION REBATE',  'LIABILITY', '410-0000', false, true, false, null, 0),
  ('410-0065', 'ACCRUALS - KPI ALLOWANCE',      'LIABILITY', '410-0000', false, true, false, null, 0),
  ('500-5000', 'GUARANTEE - 15 YEARS',          'INCOME',    '4000',     false, true, false, null, 0),
  ('510-0000', 'RETURN INWARDS',                'INCOME',    '4000',     false, true, false, null, 0),
  ('530-0000', 'INTEREST INCOME',               'INCOME',    '4000',     false, true, false, null, 0),
  ('604-0000', 'COST OF SERVICE',               'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0020', 'PURCHASE - MATTRESS',           'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0030', 'PURCHASE - SOFA',               'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0040', 'PURCHASE - BEDFRAME',           'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0050', 'PURCHASE - MATTRESS PROTECTOR', 'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0060', 'PURCHASE - CURTAIN',            'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0070', 'PURCHASE - PILLOW',             'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0080', 'PURCHASE - FOOTREST',           'EXPENSE',   '5000',     false, true, false, null, 0),
  ('610-0090', 'DIGLANT SHARE',                 'EXPENSE',   '5000',     false, true, false, null, 0),
  ('612-0000', 'PURCHASES RETURN',              'EXPENSE',   '5000',     false, true, false, null, 0),
  ('900-B002', 'BAD DEBTS WRITTEN OFF',         'EXPENSE',   '6000',     false, true, false, null, 0),
  ('900-C004', 'COMMISSION - AGENT',            'EXPENSE',   '900-C001', false, true, false, null, 0),
  ('900-C006', 'COMMISSION - SHOWROOM',         'EXPENSE',   '900-C001', false, true, false, null, 0),
  ('900-C007', 'COMMISSION - DEALER',           'EXPENSE',   '900-C001', false, true, false, null, 0),
  ('900-C008', 'RENOVATION REBATE',             'EXPENSE',   '900-C001', false, true, false, null, 0),
  ('900-C009', 'KPI ALLOWANCE',                 'EXPENSE',   '900-C001', false, true, false, null, 0),
  ('950-0000', 'TAXATION',                      'EXPENSE',   '7000',     false, true, false, null, 0)
on conflict (code) do nothing;

-- ── 3 · every system account under its AutoCount heading ─────────────────────
do $place$
declare
  r record;
begin
  for r in
    select * from (values
      ('320-0000', '0000'),
      ('300-0000', '0000'),
      ('305-0000', '0000'),
      ('330-0000', '0000'),
      ('310-0000', '0000'),
      ('315-2000', '315-0000'),
      ('315-5000', '315-0000'),
      ('315-6000', '315-0000'),
      ('1130',     '315-0000'),
      ('1230',     '0000'),
      ('400-0000', '2000'),
      ('405-0000', '2000'),
      ('430-0000', '2000'),
      ('440-0000', '2000'),
      ('410-0063', '410-0000'),
      ('100-0000', '3000'),
      ('150-0000', '3000'),
      ('160-0000', '3000'),
      ('500-0000', '4000'),
      ('500-2000', '4000'),
      ('500-3000', '4000'),
      ('500-4000', '4000'),
      ('580-0000', '4000'),
      ('610-0000', '5000'),
      ('630-0000', '5000'),
      ('900-T002', '900-T005'),
      ('900-W005', '6000'),
      ('902-0000', '6000')
    ) as v(code, parent)
  loop
    update public.gl_accounts set parent_code = r.parent
     where code = r.code and parent_code is distinct from r.parent;
  end loop;
end $place$;

-- ── 4 · bank, cheque, FPX and DuitNow into Hong Leong; Stripe to its own ─────
-- Before any money account is switched off, nothing may still point at it.
update public.gl_payment_account_map
   set account_code = '310-2000', note = 'Straight into Hong Leong Bank (0654)', updated_at = now()
 where source_channel = '*' and method in ('bank', 'cheque', 'online', 'duitnow_qr')
   and account_code is distinct from '310-2000';

update public.gl_payment_account_map
   set account_code = '315-5000', note = 'Stripe clearing (0654)', updated_at = now()
 where method = 'online' and source_channel = 'stripe_checkout'
   and account_code is distinct from '315-5000';

-- The one money list (0512): the new bank and clearing accounts are in use.
insert into public.gl_money_accounts (account_code, money_kind, is_active)
values ('310-1000', 'BANK',    true),
       ('315-1000', 'HOLDING', true),
       ('315-3000', 'HOLDING', true),
       ('315-4000', 'HOLDING', true)
on conflict (account_code) do nothing;

update public.gl_money_accounts set is_active = true, updated_at = now()
 where account_code in ('315-2000', '315-5000', '315-6000') and not is_active;

-- ── 5 · retire what the new chart has no place for ───────────────────────────
-- An account with posted lines stays (gl_accounts_protect_posted), marked as
-- test. A money account goes out of use only when no payment method points
-- at it.
do $retire$
declare
  r record;
  v_lines bigint;
begin
  for r in
    select * from (values
      ('1120', 'BANK - CURRENT ACCOUNT (TEST ONLY)'),
      ('1121', 'PUBLIC BANK (TEST ONLY)'),
      ('1220', 'SUPPLIER CLAIMS RECEIVABLE (TEST ONLY)'),
      ('1230', 'ADVANCES TO SUPPLIERS (TEST ONLY)'),
      ('1250', 'LOANS AND ADVANCES GIVEN (TEST ONLY)'),
      ('2360', 'LOANS RECEIVED (TEST ONLY)'),
      ('2370', 'DIRECTOR''S ACCOUNT (TEST ONLY)'),
      ('6100', 'STAFF COST AND COMMISSION (TEST ONLY)'),
      ('6200', 'RENT AND UTILITIES (TEST ONLY)'),
      ('6900', 'OFFICE, MARKETING AND GENERAL (TEST ONLY)')
    ) as v(code, test_name)
  loop
    continue when not exists (select 1 from public.gl_accounts where code = r.code);

    if exists (select 1 from public.gl_payment_account_map where account_code = r.code) then
      raise exception '0654: a payment method still points at % — it cannot go out of use', r.code;
    end if;
    update public.gl_money_accounts set is_active = false, updated_at = now()
     where account_code = r.code and is_active;

    select count(*) into v_lines from public.gl_entry_lines where account_code = r.code;
    if v_lines = 0 then
      update public.gl_accounts set is_active = false where code = r.code and is_active;
    else
      update public.gl_accounts set name = r.test_name
       where code = r.code and name is distinct from r.test_name;
    end if;
  end loop;

  -- The card waiting account is still in use until each merchant has its own
  -- method; it keeps working under the clearing heading.
  update public.gl_accounts set name = 'CARD - MACHINE NOT KNOWN'
   where code = '1130' and name is distinct from 'CARD - MACHINE NOT KNOWN';

  -- Old headings, now empty of active accounts.
  for r in
    select * from (values ('1200'), ('1300'), ('2100'), ('2200'), ('2300'), ('2350'), ('9000')) as v(code)
  loop
    continue when not exists (select 1 from public.gl_accounts where code = r.code and is_active);
    if exists (select 1 from public.gl_accounts c where c.parent_code = r.code and c.is_active) then
      raise exception '0654: heading % still has an active account under it', r.code;
    end if;
    if exists (select 1 from public.gl_entry_lines where account_code = r.code) then
      raise exception '0654: heading % has posted lines', r.code;
    end if;
    update public.gl_accounts set is_active = false where code = r.code;
  end loop;
end $retire$;

-- ── 6 · AutoCount's order: by number inside each heading ─────────────────────
update public.gl_accounts set sort_order = 0 where sort_order <> 0;

-- ── 7 · roles ────────────────────────────────────────────────────────────────
insert into public.gl_account_roles (role, account_code)
values ('STOCK',                     '330-0000'),
       ('CLEARING_ACCOUNTS_HEADING', '315-0000'),
       ('SECTION_ASSETS',            '0000'),
       ('SECTION_LIABILITIES',       '2000'),
       ('SECTION_EQUITY',            '3000'),
       ('SECTION_INCOME',            '4000'),
       ('SECTION_COST_OF_SALES',     '5000'),
       ('SECTION_EXPENSES',          '6000'),
       ('SECTION_TAX',               '7000')
on conflict (role) do nothing;

-- ── 8 · money in may not be customer deposits or stock ───────────────────────
-- Carried forward from the live body (pg_get_functiondef after 0650). Only the
-- two receipt-line tests change: they named the HEADINGS 2200 and 1300, which
-- AutoCount's chart does not have, and now name the ACCOUNTS themselves.
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
  if v.is_heading then                                    -- 0580: the stored flag
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
  -- 0654: customer deposits and stock are read as accounts from gl_account_roles.
  if v.code = public.gl_account_for('CUSTOMER_DEPOSITS_HELD') then
    return format('Account %s %s is customer money. Customer money is recorded in Payments.', v.code, v.name);
  end if;
  -- Stock value moves with the goods, and Stock owns it. Retained earnings
  -- and opening balance equity are written only by the year-end close and the
  -- opening balances. Money never arrives as any of them.
  if v.code = public.gl_account_for('STOCK')
     or v.code in (public.gl_account_for('RETAINED_EARNINGS'), public.gl_account_for('OPENING_BALANCE_EQUITY')) then
    return format('Account %s %s cannot be the reason money came in.', v.code, v.name);
  end if;
  return null;
end;
$function$;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_bad text;
begin
  -- Each role names an account that is there, with the right kind and shape.
  select string_agg(format('%s=%s', x.role, x.code), ', ') into v_bad
    from (values
      ('MONEY_ACCOUNTS_HEADING',    '310-0000', 'ASSET',     true),
      ('CLEARING_ACCOUNTS_HEADING', '315-0000', 'ASSET',     true),
      ('STOCK',                     '330-0000', 'ASSET',     false),
      ('CUSTOMER_DEPOSITS_HELD',    '440-0000', 'LIABILITY', false),
      ('TRADE_PAYABLE',             '400-0000', 'LIABILITY', false),
      ('OTHER_PAYABLE',             '405-0000', 'LIABILITY', false),
      ('RETAINED_EARNINGS',         '150-0000', 'EQUITY',    false),
      ('OPENING_BALANCE_EQUITY',    '160-0000', 'EQUITY',    false),
      ('OTHER_INCOME',              '580-0000', 'INCOME',    false),
      ('COST_OF_GOODS_SOLD',        '610-0000', 'EXPENSE',   false),
      ('BANK_AND_PAYMENT_CHARGES',  '902-0000', 'EXPENSE',   false),
      ('SECTION_ASSETS',            '0000',     'ASSET',     true),
      ('SECTION_LIABILITIES',       '2000',     'LIABILITY', true),
      ('SECTION_EQUITY',            '3000',     'EQUITY',    true),
      ('SECTION_INCOME',            '4000',     'INCOME',    true),
      ('SECTION_COST_OF_SALES',     '5000',     'EXPENSE',   true),
      ('SECTION_EXPENSES',          '6000',     'EXPENSE',   true),
      ('SECTION_TAX',               '7000',     'EXPENSE',   true)
    ) as x(role, code, kind, heading)
   where not exists (
     select 1 from public.gl_account_roles r
       join public.gl_accounts a on a.code = r.account_code
      where r.role = x.role and a.code = x.code and a.kind = x.kind
        and a.is_heading = x.heading and a.is_active);
  if v_bad is not null then
    raise exception '0654: roles do not name the expected accounts: %', v_bad;
  end if;

  -- Every payment method lands in money that is in use.
  select string_agg(format('%s/%s->%s', m.method, m.source_channel, m.account_code), ', ') into v_bad
    from public.gl_payment_account_map m
   where not public.gl_money_account_ok(m.account_code, 'in');
  if v_bad is not null then
    raise exception '0654: payment methods point at money that is not in use: %', v_bad;
  end if;

  -- Every income map row credits an active income account, never a heading.
  select string_agg(format('%s/%s->%s', m.component_type, m.component_key, m.account_code), ', ') into v_bad
    from public.gl_income_account_map m
    join public.gl_accounts a on a.code = m.account_code
   where not a.is_active or a.is_heading or a.kind <> 'INCOME';
  if v_bad is not null then
    raise exception '0654: income map rows point at the wrong accounts: %', v_bad;
  end if;

  -- No active account hangs under a retired heading.
  select string_agg(c.code, ', ') into v_bad
    from public.gl_accounts c join public.gl_accounts p on p.code = c.parent_code
   where c.is_active and not p.is_active;
  if v_bad is not null then
    raise exception '0654: active accounts under retired headings: %', v_bad;
  end if;

  -- An account is the kind of the heading it hangs under.
  select string_agg(c.code, ', ') into v_bad
    from public.gl_accounts c join public.gl_accounts p on p.code = c.parent_code
   where c.is_active and c.kind <> p.kind;
  if v_bad is not null then
    raise exception '0654: accounts of another kind than their heading: %', v_bad;
  end if;

  -- Two active accounts never share a name (gl_account_update's rule).
  select string_agg(lower(a.name), ', ') into v_bad
    from (select lower(name) as name from public.gl_accounts where is_active
           group by lower(name) having count(*) > 1) a;
  if v_bad is not null then
    raise exception '0654: active accounts share a name: %', v_bad;
  end if;

  -- The money-in tests read the accounts now.
  if public.fin_money_in_account_problem('440-0000', 'receipt_line') is null then
    raise exception '0654: a receipt line could still be customer deposits';
  end if;
  if public.fin_money_in_account_problem('330-0000', 'receipt_line') is null then
    raise exception '0654: a receipt line could still be stock';
  end if;
  if public.fin_money_in_account_problem('900-B002', 'receipt_line') is not null then
    raise exception '0654: an ordinary expense account is refused as a receipt line';
  end if;
end $sanity$;

commit;
