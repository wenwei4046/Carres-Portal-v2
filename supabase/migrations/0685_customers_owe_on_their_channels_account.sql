-- =============================================================================
-- 0685_customers_owe_on_their_channels_account.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-06, docs/finance/MASTER.md §0 rulings 4 and 6; the
--   plan "Splitting the money by channel" step 3, approved 2026-10-12
--   「分渠道做」, its change to Payment's recording approved under §1
--   Exceptions): what a customer owes sits on its channel's debtor account.
--   Showroom customers on 300-1000 Showroom Debtors. Each dealer's customers on
--   that dealer's own account under 300-2000 Dealer Debtors (300-2001 and on,
--   opened the first time one of the dealer's customers is invoiced or pays).
--   Subscription customers on 300-3000 Subscription Debtors. The customer stays
--   the party on the line, as before.
--
-- WHAT THIS CHANGES
--   1. The chart gains 300-1000 SHOWROOM DEBTORS and 300-3000 SUBSCRIPTION
--      DEBTORS (customer control accounts) and the heading 300-2000 DEALER
--      DEBTORS. They sit beside 300-0000 TRADE DEBTORS under ASSETS, because
--      300-0000 carries test postings and an account with postings never
--      becomes a heading (0580). Go-live starts with clean books, and then
--      300-0000 can take them under it.
--   2. Three posting roles name them, so a renumber in Chart of accounts
--      carries through: SHOWROOM_DEBTORS, DEALER_DEBTORS_HEADING and
--      SUBSCRIPTION_DEBTORS. Posting accounts lists them under "Kept by the
--      system".
--   3. fin_dealer_debtor_accounts holds which account is each dealer's.
--      _fin_dealer_debtor_account(dealer) opens the next number under the
--      heading the first time, named after the dealer.
--   4. gl_ar_account_for_order(order): the account an order's customer owes
--      on, from fin_order_channels, the one arithmetic for an order's channel.
--      Every order has a dealer, so an order that view leaves out is a showroom
--      order whose outlet it cannot name; it goes to Showroom Debtors.
--   5. The two postings that name the customer's account take it from the
--      order: a customer payment (Payment's recording, every door into it) and
--      a sales or storage invoice. A reversal copies the original's lines, so
--      a payment or invoice posted before this keeps its account when voided.
--   6. gl_receivables_reconcile reads every customer control account together.
--   gl_ar_control_account() stays and nothing calls it: it named the one
--   customer account, and there is no longer one.
--
-- RLS: the new table is closed to every role (RLS on, no policy); only the
--   definer functions read and write it. Nothing else changes.
-- DATA: none moved. The test balances on 300-0000 stay there.
-- DR/CR: unchanged. An invoice posts Dr the customer's account, Cr income; a
--   payment posts Dr the money account, Cr the customer's account. Only which
--   customer account changes.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- Replace one exact snippet of a live function; refuse unless it occurs once.
create or replace function pg_temp.mig0685_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0685: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · the accounts ─────────────────────────────────────────────────────────
-- Under ASSETS beside 300-0000, as 350-0000 sits. An account that is already
-- there is left alone, and the check at the end refuses one of another shape.
insert into public.gl_accounts
  (code, kind, name, section, special, is_active, is_control, is_heading, control_for, parent_code)
select x.code, 'ASSET', x.name, 'CURRENT ASSETS', x.special, true, x.is_control, x.is_heading,
       x.control_for, public.gl_account_for('SECTION_ASSETS')
  from (values
    ('300-1000', 'SHOWROOM DEBTORS',     'SDC', true,  false, 'CUSTOMER'),
    ('300-2000', 'DEALER DEBTORS',       null,  false, true,  null),
    ('300-3000', 'SUBSCRIPTION DEBTORS', 'SDC', true,  false, 'CUSTOMER')
  ) as x(code, name, special, is_control, is_heading, control_for)
on conflict (code) do nothing;

-- ── 2 · the roles that name them ─────────────────────────────────────────────
insert into public.gl_account_roles (role, account_code)
values ('SHOWROOM_DEBTORS',       '300-1000'),
       ('DEALER_DEBTORS_HEADING', '300-2000'),
       ('SUBSCRIPTION_DEBTORS',   '300-3000')
on conflict (role) do nothing;

-- ── 3 · each dealer's own account ────────────────────────────────────────────
create table public.fin_dealer_debtor_accounts (
  dealer_id    uuid primary key references public.dealers(id),
  account_code text not null unique references public.gl_accounts(code) on update cascade,
  opened_at    timestamptz not null default now()
);

comment on table public.fin_dealer_debtor_accounts is
  '0685: the debtor account each dealer''s customers owe on, under Dealer Debtors. Written only by _fin_dealer_debtor_account.';

alter table public.fin_dealer_debtor_accounts enable row level security;
revoke all on table public.fin_dealer_debtor_accounts from public, anon, authenticated;

create function public._fin_dealer_debtor_account(p_dealer_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_code    text;
  v_name    text;
  v_heading public.gl_accounts;
  v_prefix  text;
  v_n       integer := 0;
begin
  select m.account_code into v_code
    from public.fin_dealer_debtor_accounts m
   where m.dealer_id = p_dealer_id;
  if v_code is not null then
    return v_code;
  end if;

  -- A dealer's account is opened once. Two first postings for one dealer at the
  -- same moment: the second waits here, then finds the account the first opened.
  perform pg_advisory_xact_lock(hashtext('fin_dealer_debtor_account'));
  select m.account_code into v_code
    from public.fin_dealer_debtor_accounts m
   where m.dealer_id = p_dealer_id;
  if v_code is not null then
    return v_code;
  end if;

  select upper(btrim(d.name)) into v_name
    from public.dealers d
   where d.id = p_dealer_id;
  if not found then
    raise exception 'dealer % not found', p_dealer_id
      using errcode = '42P01', detail = 'dealer_not_found';
  end if;
  v_name := coalesce(nullif(v_name, ''), 'DEALER');

  select a.* into v_heading
    from public.gl_accounts a
   where a.code = public.gl_account_for('DEALER_DEBTORS_HEADING');

  -- The heading's number less its last three digits, then 001 and on:
  -- 300-2000 gives 300-2001, 300-2002, and so on. A number in use is skipped.
  v_prefix := left(v_heading.code, length(v_heading.code) - 3);
  loop
    v_n := v_n + 1;
    if v_n > 999 then
      raise exception 'Dealer Debtors has no free account number left under %', v_heading.code
        using errcode = '22023', detail = 'dealer_debtor_numbers_full';
    end if;
    v_code := v_prefix || lpad(v_n::text, 3, '0');
    exit when v_code <> v_heading.code
          and not exists (select 1 from public.gl_accounts a where a.code = v_code);
  end loop;

  insert into public.gl_accounts
    (code, kind, name, section, special, is_active, is_control, is_heading, control_for, parent_code)
  values
    (v_code, 'ASSET', v_name, v_heading.section, 'SDC', true, true, false, 'CUSTOMER', v_heading.code);

  insert into public.fin_dealer_debtor_accounts (dealer_id, account_code)
  values (p_dealer_id, v_code);

  insert into public.audit_log (role, actor_text, action, ref)
  values (public.app_role(),
          (select u.name from public.app_users u where u.id = auth.uid()),
          format('Ledger account opened · %s %s · the dealer''s customers owe on it', v_code, v_name),
          v_code);

  return v_code;
end;
$fn$;

revoke all on function public._fin_dealer_debtor_account(uuid) from public, anon, authenticated;

-- ── 4 · the account an order's customer owes on ──────────────────────────────
create function public.gl_ar_account_for_order(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_type text;
  v_id   uuid;
begin
  select c.department_type, c.department_id
    into v_type, v_id
    from public.fin_order_channels c
   where c.order_id = p_order_id;

  if v_type = 'SUBSCRIPTION' then
    return public.gl_account_for('SUBSCRIPTION_DEBTORS');
  elsif v_type = 'DEALER' then
    return public._fin_dealer_debtor_account(v_id);
  end if;
  -- SHOWROOM, or no row: every order has a dealer (orders.dealer_id is not
  -- null), so fin_order_channels leaves out only a showroom order whose outlet
  -- it cannot name.
  return public.gl_account_for('SHOWROOM_DEBTORS');
end;
$fn$;

revoke all on function public.gl_ar_account_for_order(uuid) from public, anon, authenticated;

-- ── 5 · the two postings take the order's account ────────────────────────────
select pg_temp.mig0685_rewrite('public._customer_payment_to_ledger(uuid)'::regprocedure,
$old$v_ar    := public.gl_ar_control_account();$old$,
$new$v_ar    := public.gl_ar_account_for_order(v_pay.order_id);   -- 0685: the order's channel$new$);

select pg_temp.mig0685_rewrite('public._sales_invoice_to_ledger(text)'::regprocedure,
$old$v_ar    := public.gl_ar_control_account();$old$,
$new$v_ar    := public.gl_ar_account_for_order(v_inv.order_id);   -- 0685: the order's channel$new$);

-- ── 6 · the receivables check reads every customer account ───────────────────
select pg_temp.mig0685_rewrite('public.gl_receivables_reconcile()'::regprocedure,
$old$  -- The chart may be unable to name the receivables account at all. That is a
  -- thing to REPORT, not a thing to raise on: the whole point of this function
  -- is to still return a row when something is wrong. This is the one
  -- exception handler in the file, and it wraps a read.
  begin
    v_ar := public.gl_ar_control_account();
  exception when others then
    v_ar_error := sqlerrm;
    v_ar := null;
  end;$old$,
$new$  -- 0685: customers owe on every customer control account, Trade Debtors and
  -- one per channel (each dealer its own), read together. A chart with none
  -- is a thing to REPORT, not to raise on: this function still returns a row
  -- when something is wrong.
  select string_agg(a.code, ', ' order by a.code)
    into v_ar
    from gl_accounts a
   where a.kind = 'ASSET'
     and a.control_for = 'CUSTOMER';$new$);

select pg_temp.mig0685_rewrite('public.gl_receivables_reconcile()'::regprocedure,
$old$      ('the chart cannot name one trade-receivables control account, so the ledger side could not be read — ' ||
       coalesce(v_ar_error, 'unknown reason'));$old$,
$new$      'the chart has no customer control account, so the ledger side could not be read'::text;$new$);

select pg_temp.mig0685_rewrite('public.gl_receivables_reconcile()'::regprocedure,
$old$     where l.account_code = v_ar
       and e.posted;$old$,
$new$     where l.account_code in (select a.code from gl_accounts a
                               where a.kind = 'ASSET' and a.control_for = 'CUSTOMER')   -- 0685
       and e.posted;$new$);

-- ── 7 · Posting accounts lists them, kept by the system ──────────────────────
select pg_temp.mig0685_rewrite('public.gl_posting_accounts()'::regprocedure,
$old$'TRADE_PAYABLE', 'OTHER_PAYABLE', 'CUSTOMER_DEPOSITS_HELD', 'STOCK',$old$,
$new$'SHOWROOM_DEBTORS', 'DEALER_DEBTORS_HEADING', 'SUBSCRIPTION_DEBTORS',   -- 0685
                        'TRADE_PAYABLE', 'OTHER_PAYABLE', 'CUSTOMER_DEPOSITS_HELD', 'STOCK',$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  if (select count(*) from public.gl_accounts a
       where (a.code in ('300-1000', '300-3000') and a.kind = 'ASSET' and a.is_active
              and a.is_control and a.control_for = 'CUSTOMER' and not a.is_heading)
          or (a.code = '300-2000' and a.kind = 'ASSET' and a.is_active and a.is_heading
              and a.control_for is null)) <> 3 then
    raise exception '0685: the debtor accounts are not the shape this migration makes';
  end if;
  if (select count(*) from public.gl_account_roles r
       where (r.role, r.account_code) in (('SHOWROOM_DEBTORS', '300-1000'),
                                          ('DEALER_DEBTORS_HEADING', '300-2000'),
                                          ('SUBSCRIPTION_DEBTORS', '300-3000'))) <> 3 then
    raise exception '0685: a debtor role does not name its account';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prokind = 'f'
                and p.proname <> 'gl_ar_control_account'
                and pg_get_functiondef(p.oid) like '%gl_ar_control_account(%') then
    raise exception '0685: a function still asks for the one customer account';
  end if;
  select pg_get_functiondef('public._customer_payment_to_ledger(uuid)'::regprocedure) into v_src;
  if position('gl_ar_account_for_order(v_pay.order_id)' in v_src) = 0 then
    raise exception '0685: a customer payment does not take its order''s account';
  end if;
  select pg_get_functiondef('public._sales_invoice_to_ledger(text)'::regprocedure) into v_src;
  if position('gl_ar_account_for_order(v_inv.order_id)' in v_src) = 0 then
    raise exception '0685: an invoice does not take its order''s account';
  end if;
  select pg_get_functiondef('public.gl_receivables_reconcile()'::regprocedure) into v_src;
  if (length(v_src) - length(replace(v_src, 'a.control_for = ''CUSTOMER''', '')))
       / length('a.control_for = ''CUSTOMER''') <> 2
     or position('gl_may_read' in v_src) = 0 then
    raise exception '0685: the receivables check does not read every customer account, or lost its check';
  end if;
  select pg_get_functiondef('public.gl_posting_accounts()'::regprocedure) into v_src;
  if position('''DEALER_DEBTORS_HEADING''' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0685: Posting accounts does not list the debtor accounts, or lost its check';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('_fin_dealer_debtor_account', 'gl_ar_account_for_order',
                                  '_customer_payment_to_ledger', '_sales_invoice_to_ledger',
                                  'gl_receivables_reconcile', 'gl_posting_accounts')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0685: a function lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public._fin_dealer_debtor_account(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.gl_ar_account_for_order(uuid)', 'execute') then
    raise exception '0685: an account can be chosen or opened around the postings';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.fin_dealer_debtor_accounts'::regclass)
     or has_table_privilege('authenticated', 'public.fin_dealer_debtor_accounts', 'select') then
    raise exception '0685: the dealer account list is open';
  end if;
end $sanity$;

commit;
