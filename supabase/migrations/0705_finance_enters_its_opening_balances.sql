-- =============================================================================
-- 0705_finance_enters_its_opening_balances.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-21/22; docs/finance/MASTER.md §3.5 "Opening
--   balances"): Finance enters its figures at go-live on one page, Ledger →
--   Opening balances, as a draft it saves and changes freely. Post writes ONE
--   ledger entry dated the day before go-live, balanced so that 160-0000
--   Opening balance is RM 0.00 after it. Posted once; Reverse (with a reason)
--   undoes it and returns it to draft, until the first month is closed.
--
-- WHAT THIS CHANGES
--   1. Finance's own draft, six new tables:
--        fin_opening           one row: draft or posted, the entry, who, when
--        fin_opening_accounts  every non-control account: debit or credit
--                              (income and expense take their year to date)
--        fin_opening_parties   per customer, other debtor or supplier: its
--                              control account and its total
--        fin_opening_items     each open invoice or bill under a party
--        fin_opening_stock     each Unit held at go-live with its cost, as
--                              pasted; a Unit not found keeps unit_id null
--        fin_opening_deposits  each customer deposit per order not delivered
--      Stock's tables, Orders' and Payment's are only read.
--   2. gl_entry_date_ok(source, date, go_live): the ONE answer to "may this
--      entry carry this date". From go-live on, any entry; the day before
--      go-live, only OPENING and its reversal. gl_post asks it instead of
--      `p_entry_date < v_go_live` (one rewrite), and so does the ledger
--      health check's "No entry is dated before the ledger started". The
--      exception lives in its own function so a later rebuild of gl_post that
--      starts from the live definition keeps it; a rebuild that drops it fails
--      CLOSED (Post is refused as "before go-live"), never silently wrong.
--      One index keeps one OPENING entry standing at a time.
--   3. The doors, each SECURITY DEFINER with search_path public, pg_temp:
--        fin_opening_read()                     Finance or principal
--        fin_opening_state()                    Finance or principal
--        fin_opening_accounts_save(jsonb, ts)   Finance or principal, draft only
--        fin_opening_party_save(…)              Finance or principal, draft only
--        fin_opening_party_remove(uuid, ts)     Finance or principal, draft only
--        fin_opening_stock_save(jsonb, ts)      Finance or principal, draft only
--        fin_opening_deposits_save(jsonb, ts)   Finance or principal, draft only
--        fin_opening_post(ts)                   principal only (the go-live and
--        fin_opening_reverse(text)              manual-journal right, reused)
--      Each public door checks its caller and calls an internal `_fin_opening_*`
--      function, which only definer functions (and this file's checks) call.
--      Every save carries the `updated_at` it was drawn from: a stale save is
--      refused (40001), never merged over another person's.
--   4. The reports read the posted opening:
--        fin_opening_items_open(as_at, party row, other open): an opening
--          item's still-open amount, the ONE arithmetic both agings use: the
--          party's money since go-live that no other open document takes is
--          set against its opening items, oldest due first; what is left of
--          the balance stays `Not tied to …`.
--        fin_ar_aging: an opening deposit is its order's money (it fills that
--          order's invoice first, as a payment does), and each posted opening
--          invoice ages by its own dates (kind `opening`).
--        fin_ap_aging: each posted opening bill ages the same way.
--        fin_stock_value: a Unit with no PO cost takes Finance's opening cost,
--          once posted. The statements read stock on hand through it.
--      A customer's money on an order still waiting for its invoice is that
--      order's: it never settles an opening invoice (it is taken when the
--      order is invoiced). Only money no document takes, such as an
--      overpayment, is set against the opening invoices.
--   5. A payment voucher pays an opening bill exactly as it pays a bill
--      (0477) or a debit note (0681): payment_voucher_opening_allocations,
--      held by its own ceiling trigger and the draft-only rule; the voucher's
--      save, check, approval (Dr the bill's payables account, party = the
--      supplier), page and list read it. What is paid has ONE arithmetic,
--      ap_opening_item_settled / ap_opening_item_paid, which
--      fin_opening_items_open (AP Aging), ap_opening_bill_outstanding (the
--      voucher's list) and ap_outstanding (Unpaid by Supplier) read. Reverse
--      is refused while a voucher that is not cancelled pays an opening bill.
--   6. The Self-check sees the posted opening: ap_outstanding's net owing adds
--      each supplier's opening total (its bills as bills, the rest beside
--      them), and gl_receivables_reconcile adds the opening customer totals
--      less the deposits, so neither shows the opening as a difference.
--
-- DR/CR (one entry, source OPENING, document OB-{go-live yyyymmdd}):
--   each account its own side · a debtor's total Dr its control account with
--   the party (below zero: Cr) · a supplier's total Cr its control account
--   with the party (below zero: Dr) · the stock total Dr STOCK (330-0000) ·
--   each deposit Cr the order's customer account with the customer, as a
--   customer payment posts. Debits must equal credits; 160-0000 must hold
--   RM 0.00 after it.
--
-- RLS: seven new tables (the six above and payment_voucher_opening_allocations), RLS on. Read for gl_may_read() (Finance or principal),
--   as every Finance table (0646). No direct write by anon or authenticated:
--   writes go only through the doors above. No existing policy changes.
-- DATA: one fin_opening row (draft). No existing row is changed.
-- GRANTS: internals revoked from public, anon, authenticated; the doors
--   revoked from public and anon, granted to authenticated.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- Replace one exact snippet of a live function; refuse unless it occurs once.
create or replace function pg_temp.mig0705_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0705: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · Finance's draft ──────────────────────────────────────────────────────
create table public.fin_opening (
  id                  boolean primary key default true check (id),
  status              text not null default 'draft' check (status in ('draft', 'posted')),
  entry_id            uuid references public.gl_entries(id),
  posted_at           timestamptz,
  posted_by           uuid references public.app_users(id),
  last_reversed_at    timestamptz,
  last_reversed_by    uuid references public.app_users(id),
  last_reverse_reason text,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.app_users(id),
  constraint fin_opening_posted_has_entry check ((status = 'posted') = (entry_id is not null))
);
comment on table public.fin_opening is
  '0705: the one opening of the books. Written only by the fin_opening_* doors.';
insert into public.fin_opening (id) values (true);

create table public.fin_opening_accounts (
  account_code text primary key references public.gl_accounts(code) on update cascade,
  debit        numeric(12,2) not null default 0 check (debit >= 0),
  credit       numeric(12,2) not null default 0 check (credit >= 0),
  constraint fin_opening_accounts_one_side check ((debit = 0) <> (credit = 0))
);

create table public.fin_opening_parties (
  id           uuid primary key default gen_random_uuid(),
  party_type   text not null check (party_type in ('CUSTOMER', 'OTHER', 'SUPPLIER')),
  party_id     uuid not null,
  account_code text not null references public.gl_accounts(code) on update cascade,
  total        numeric(12,2) not null check (total <> 0),
  constraint fin_opening_parties_once unique (party_type, party_id)
);

create table public.fin_opening_items (
  id           uuid primary key default gen_random_uuid(),
  party_row_id uuid not null references public.fin_opening_parties(id) on delete cascade,
  line_no      integer not null check (line_no > 0),
  doc_no       text not null check (char_length(btrim(doc_no)) between 1 and 60),
  doc_date     date not null,
  due_date     date,
  amount       numeric(12,2) not null check (amount > 0),
  constraint fin_opening_items_line unique (party_row_id, line_no),
  constraint fin_opening_items_due_after check (due_date is null or due_date >= doc_date)
);
create index fin_opening_items_party_idx on public.fin_opening_items (party_row_id);

-- No foreign key into Stock's or Orders' tables: Finance never holds their
-- rows in place. A Unit or an order not found keeps its id null and is listed.
create table public.fin_opening_stock (
  unit_code text primary key check (char_length(unit_code) between 1 and 80),
  unit_id   uuid,
  unit_cost numeric(12,2) not null check (unit_cost >= 0)
);
create unique index fin_opening_stock_unit_once on public.fin_opening_stock (unit_id) where unit_id is not null;

create table public.fin_opening_deposits (
  id           uuid primary key default gen_random_uuid(),
  line_no      integer not null unique check (line_no > 0),
  order_ref    text not null check (char_length(order_ref) between 1 and 40),
  customer_ref text check (customer_ref is null or char_length(customer_ref) <= 200),
  order_id     uuid,
  amount       numeric(12,2) not null check (amount > 0)
);
create unique index fin_opening_deposits_order_once on public.fin_opening_deposits (order_id) where order_id is not null;

alter table public.fin_opening          enable row level security;
alter table public.fin_opening_accounts enable row level security;
alter table public.fin_opening_parties  enable row level security;
alter table public.fin_opening_items    enable row level security;
alter table public.fin_opening_stock    enable row level security;
alter table public.fin_opening_deposits enable row level security;
revoke all on public.fin_opening, public.fin_opening_accounts, public.fin_opening_parties,
              public.fin_opening_items, public.fin_opening_stock, public.fin_opening_deposits
  from public, anon, authenticated;
grant select on public.fin_opening, public.fin_opening_accounts, public.fin_opening_parties,
                public.fin_opening_items, public.fin_opening_stock, public.fin_opening_deposits
  to authenticated;
create policy fin_opening_read          on public.fin_opening          for select using ((select public.gl_may_read()));
create policy fin_opening_accounts_read on public.fin_opening_accounts for select using ((select public.gl_may_read()));
create policy fin_opening_parties_read  on public.fin_opening_parties  for select using ((select public.gl_may_read()));
create policy fin_opening_items_read    on public.fin_opening_items    for select using ((select public.gl_may_read()));
create policy fin_opening_stock_read    on public.fin_opening_stock    for select using ((select public.gl_may_read()));
create policy fin_opening_deposits_read on public.fin_opening_deposits for select using ((select public.gl_may_read()));

-- What a payment voucher pays on an opening bill: the twin of
-- payment_voucher_allocations (bills) and 0681's debit note allocations. No
-- key onto fin_opening_items: a reversed opening's items are replaced when it
-- is changed, and Reverse is refused while a voucher that is not cancelled
-- holds one (_fin_opening_reverse), so only a cancelled voucher can name an
-- item that is gone. Written only by payment_voucher_save_draft.
create table public.payment_voucher_opening_allocations (
  id              uuid primary key default gen_random_uuid(),
  voucher_id      uuid not null references public.payment_vouchers(id),
  opening_item_id uuid not null,
  amount_applied  numeric(12,2) not null check (amount_applied > 0),
  created_at      timestamptz not null default now(),
  created_by      uuid references public.app_users(id),
  constraint payment_voucher_opening_allocations_once unique (voucher_id, opening_item_id)
);
create index payment_voucher_opening_allocations_item on public.payment_voucher_opening_allocations (opening_item_id);
comment on table public.payment_voucher_opening_allocations is
  '0705: what a payment voucher pays on an opening bill (fin_opening_items of a supplier). Written only by payment_voucher_save_draft, while the voucher is a draft.';
alter table public.payment_voucher_opening_allocations enable row level security;
revoke all on public.payment_voucher_opening_allocations from public, anon, authenticated;
grant select on public.payment_voucher_opening_allocations to authenticated;
create policy payment_voucher_opening_allocations_read on public.payment_voucher_opening_allocations
  for select using ((select public.gl_may_read()));

-- Paid on an opening bill, the one arithmetic (law D): an approved voucher
-- pays on its own date, as it pays a bill (ap_bill_settled).
create function public.ap_opening_item_settled(p_as_at date default null)
returns table (item_id uuid, paid numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select al.opening_item_id, coalesce(sum(al.amount_applied), 0)::numeric(12,2)
    from public.payment_voucher_opening_allocations al
    join public.payment_vouchers pv on pv.id = al.voucher_id
   where pv.status = 'approved'
     and (p_as_at is null or pv.voucher_date <= p_as_at)
   group by al.opening_item_id
$fn$;

-- paid as above; held = on any voucher not cancelled (the ceiling a new payment meets).
create function public.ap_opening_item_paid(p_item_id uuid default null)
returns table (item_id uuid, paid numeric(12,2), held numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select h.iid, coalesce(s.paid, 0)::numeric(12,2), h.held
    from (
      select al.opening_item_id as iid, coalesce(sum(al.amount_applied), 0)::numeric(12,2) as held
        from public.payment_voucher_opening_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status <> 'cancelled'
         and (p_item_id is null or al.opening_item_id = p_item_id)
       group by al.opening_item_id
    ) h
    left join public.ap_opening_item_settled(null) s on s.item_id = h.iid
$fn$;
revoke all on function public.ap_opening_item_settled(date) from public, anon, authenticated;
revoke all on function public.ap_opening_item_paid(uuid) from public, anon, authenticated;

-- ── 2 · the one date exception ───────────────────────────────────────────────
create function public.gl_entry_date_ok(p_source_type text, p_entry_date date, p_go_live date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select coalesce(p_entry_date >= p_go_live
                  or (p_source_type in ('OPENING', 'OPENING_REVERSAL') and p_entry_date = p_go_live - 1),
                  false)
$fn$;
comment on function public.gl_entry_date_ok(text, date, date) is
  '0705: the one answer to whether an entry may carry its date. From go-live on, any entry; the day before go-live, only the opening balances (OPENING) and their reversal. gl_post and gl_ledger_health ask it.';
revoke all on function public.gl_entry_date_ok(text, date, date) from public, anon, authenticated;

select pg_temp.mig0705_rewrite('public.gl_post(text,text,date,text,jsonb)'::regprocedure,
$old$  if p_entry_date < v_go_live then
    raise exception 'gl_post refused: entry_date % is before the ledger go-live date %', p_entry_date, v_go_live$old$,
$new$  -- 0705: the opening balances, and only they, take the day before go-live.
  -- The rule is gl_entry_date_ok's, never written here.
  if not public.gl_entry_date_ok(v_source_type, p_entry_date, v_go_live) then
    raise exception 'gl_post refused: entry_date % is before the ledger go-live date %', p_entry_date, v_go_live$new$);

select pg_temp.mig0705_rewrite('public.gl_ledger_health()'::regprocedure,
$old$    and v_go_live is not null
    and e.entry_date < v_go_live;$old$,
$new$    and v_go_live is not null
    and e.entry_date < v_go_live
    and not public.gl_entry_date_ok(e.source_type, e.entry_date, v_go_live);   -- 0705: the opening$new$);

-- One opening entry stands at a time (its reversal frees the slot).
create unique index gl_entries_one_opening on public.gl_entries ((true))
  where source_type = 'OPENING' and posted and not reversed;

-- ── 3 · the internals ────────────────────────────────────────────────────────

-- May this account take an opening amount on the Accounts tab: active, not a
-- heading, not a control account (parties carry those), not 160-0000 itself,
-- not the stock account (the Stock tab posts it), not the supplier advance.
create function public._fin_opening_account_ok(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.gl_accounts a
     where a.code = p_code
       and a.is_active and not a.is_heading and not a.is_control
       and a.code not in (select r.account_code from public.gl_account_roles r
                           where r.role in ('OPENING_BALANCE_EQUITY', 'STOCK', 'SUPPLIER_ADVANCE')))
$fn$;
revoke all on function public._fin_opening_account_ok(text) from public, anon, authenticated;

-- An amount as typed: a number, at most two decimals, inside numeric(12,2).
create function public._fin_opening_amount(p_value jsonb, p_what text, p_allow_negative boolean default false)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_value) <> 'number' then
    raise exception '% must be a number.', p_what using errcode = 'P0001', detail = 'opening_amount';
  end if;
  v := (p_value #>> '{}')::numeric;
  if v <> round(v, 2) then
    raise exception '% has more than two decimals.', p_what using errcode = 'P0001', detail = 'opening_amount';
  end if;
  if abs(v) > 9999999999.99 then
    raise exception '% is larger than the ledger can hold.', p_what using errcode = 'P0001', detail = 'opening_amount';
  end if;
  if v < 0 and not p_allow_negative then
    raise exception '% must be more than RM 0.00.', p_what using errcode = 'P0001', detail = 'opening_amount';
  end if;
  return v;
end;
$fn$;
revoke all on function public._fin_opening_amount(jsonb, text, boolean) from public, anon, authenticated;

-- Every save starts here: the draft is locked, still a draft, and unchanged
-- since the caller read it. Returns the new updated_at.
create function public._fin_opening_touch(p_actor uuid, p_was timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row public.fin_opening;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_row from public.fin_opening where id for update;
  if not found then
    raise exception 'The opening balances are not set up.' using errcode = 'P0002', detail = 'opening_missing';
  end if;
  if v_row.status = 'posted' then
    raise exception 'The opening balances are posted. Reverse them to change them.'
      using errcode = 'P0001', detail = 'opening_posted';
  end if;
  if p_was is distinct from v_row.updated_at then
    raise exception 'Someone else changed the opening balances. Reload to see them.'
      using errcode = '40001', detail = 'opening_changed';
  end if;
  if v_now <= v_row.updated_at then
    v_now := v_row.updated_at + interval '1 microsecond';
  end if;
  update public.fin_opening
     set updated_at = v_now, updated_by = (select u.id from public.app_users u where u.id = p_actor)
   where id;
  return v_now;
end;
$fn$;
revoke all on function public._fin_opening_touch(uuid, timestamptz) from public, anon, authenticated;

-- The account a deposit's order posts to, without opening a dealer account on
-- a read (Post opens it through gl_ar_account_for_order, as an invoice does).
create function public._fin_opening_order_account(p_order_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select case ch.department_type
           when 'SUBSCRIPTION' then (select r.account_code from public.gl_account_roles r where r.role = 'SUBSCRIPTION_DEBTORS')
           when 'DEALER' then (select x.account_code from public.fin_dealer_debtor_accounts x where x.dealer_id = ch.department_id)
           else (select r.account_code from public.gl_account_roles r where r.role = 'SHOWROOM_DEBTORS') end
    from (select 1) one
    left join public.fin_order_channels ch on ch.order_id = p_order_id
$fn$;
revoke all on function public._fin_opening_order_account(uuid) from public, anon, authenticated;

-- The lines the draft posts, in order. For a read (p_for_post false) nothing is
-- written: a deposit's customer is looked up, never created.
create function public._fin_opening_plan(p_for_post boolean)
returns table (ord integer, account_code text, debit numeric, credit numeric,
               party_type text, party_id uuid, memo text)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_stock_code text;
  v_stock      numeric(14,2);
  v_units      integer;
  r            record;
  v_ord        integer := 0;
begin
  for r in select a.account_code, a.debit, a.credit from public.fin_opening_accounts a order by a.account_code loop
    v_ord := v_ord + 1;
    ord := v_ord; account_code := r.account_code; debit := r.debit; credit := r.credit;
    party_type := null; party_id := null; memo := 'Opening balance';
    return next;
  end loop;

  for r in select p.party_type, p.party_id, p.account_code, p.total
             from public.fin_opening_parties p
            order by p.account_code, p.party_type, p.party_id loop
    v_ord := v_ord + 1;
    ord := v_ord; account_code := r.account_code;
    -- A debtor's total is owed to Carres (debit); a supplier's is owed by Carres (credit).
    if (r.party_type = 'SUPPLIER') = (r.total < 0) then
      debit := abs(r.total); credit := 0;
    else
      debit := 0; credit := abs(r.total);
    end if;
    party_type := r.party_type; party_id := r.party_id; memo := 'Opening balance';
    return next;
  end loop;

  select coalesce(sum(round(u.qty * s.unit_cost, 2)), 0), count(*)
    into v_stock, v_units
    from public.fin_opening_stock s
    join public.ops_stock_items u on u.id = s.unit_id;
  if v_stock > 0 then
    select r2.account_code into v_stock_code from public.gl_account_roles r2 where r2.role = 'STOCK';
    v_ord := v_ord + 1;
    ord := v_ord; account_code := v_stock_code; debit := v_stock; credit := 0;
    party_type := null; party_id := null;
    memo := format('Opening stock, %s %s', v_units, case when v_units = 1 then 'Unit' else 'Units' end);
    return next;
  end if;

  for r in select d.order_id, d.amount, o.so, o.customer_phone
             from public.fin_opening_deposits d
             join public.orders o on o.id = d.order_id
            order by d.line_no loop
    v_ord := v_ord + 1;
    ord := v_ord;
    if p_for_post then
      account_code := public.gl_ar_account_for_order(r.order_id);
      party_id := public.gl_customer_party_for_order(r.order_id);
    else
      account_code := public._fin_opening_order_account(r.order_id);
      party_id := (select c.id from public.customers c
                    where coalesce(r.customer_phone, '') ~ '[^[:space:]]'
                      and c.phone_key = public.pwp_phone_key(r.customer_phone));
    end if;
    debit := 0; credit := r.amount; party_type := 'CUSTOMER';
    memo := format('Deposit SO-%s', r.so);
    return next;
  end loop;
end;
$fn$;
revoke all on function public._fin_opening_plan(boolean) from public, anon, authenticated;

-- An opening item's still-open amount on a day: the ONE arithmetic AR and AP
-- Aging, Unpaid by Supplier and the voucher's bill list use. First, what
-- approved payment vouchers paid on the item itself (an opening bill;
-- ap_opening_item_settled). Then the party's money since go-live (the opening
-- left out), on its own side, less what the party's other open documents hold
-- (p_other_open) and less what was paid on its opening items, is money no
-- document takes; below zero it is credit, and that credit is set against the
-- opening items, the oldest due first. A customer's money on an order still
-- waiting for its invoice is that order's, not credit: it is left out until
-- the order is invoiced (then the invoice takes it). Nothing until posted.
create function public.fin_opening_items_open(p_as_at date, p_party_row uuid, p_other_open numeric)
returns table (item_id uuid, doc_no text, doc_date date, due_date date, amount numeric, open numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with o as (
    select p.id, p.party_type, p.party_id
      from public.fin_opening_parties p
      join public.fin_opening f on f.id and f.status = 'posted'
      join public.gl_entries e on e.id = f.entry_id
     where p.id = p_party_row
       and e.entry_date <= p_as_at
  ),
  party_lines as (
    select o.party_type, e.source_type, e.source_doc_no,
           case when o.party_type = 'SUPPLIER' then l.credit - l.debit else l.debit - l.credit end as amount
      from o
      join public.gl_entry_lines l on l.party_type = o.party_type and l.party_id = o.party_id
      join public.gl_entries e on e.id = l.entry_id
      join public.gl_accounts a on a.code = l.account_code
     where e.posted
       and e.entry_date <= p_as_at
       and e.source_type not in ('OPENING', 'OPENING_REVERSAL')
       and a.is_control
       and a.control_for = o.party_type
       and (o.party_type = 'SUPPLIER' or a.kind = 'ASSET')
  ),
  -- The deposits brought forward for this customer: customer money on its
  -- order, as a receipt is (AR Aging's cust_paid counts them the same way).
  deposits as (
    select d.order_id, d.amount
      from o
      join public.fin_opening_deposits d on d.order_id is not null
      join public.orders od on od.id = d.order_id
      join public.customers c on c.id = o.party_id
     where o.party_type = 'CUSTOMER'
       and coalesce(od.customer_phone, '') ~ '[^[:space:]]'
       and c.phone_key = public.pwp_phone_key(od.customer_phone)
  ),
  since as (
    select coalesce((select sum(pl.amount) from party_lines pl), 0)
         - coalesce((select sum(dp.amount) from deposits dp), 0) as balance
  ),
  -- A customer's money on an order with no invoice yet (a receipt and its
  -- void, or a deposit brought forward): the order's own, never credit against
  -- old invoices. The invoice takes it when the order is invoiced.
  receipts as (
    select op.order_id, -pl.amount as amount
      from party_lines pl
      cross join lateral (
        select p.order_id from public.order_payments p
         where p.receipt_no = pl.source_doc_no or p.id::text = pl.source_doc_no
         limit 1) op
     where pl.party_type = 'CUSTOMER'
       and regexp_replace(pl.source_type, '_REVERSAL$', '') = 'CUSTOMER_PAYMENT'
    union all
    select dp.order_id, dp.amount from deposits dp
  ),
  waiting as (
    select coalesce(sum(r.amount), 0) as amount
      from receipts r
     where not exists (select 1 from public.invoices i
                        where i.order_id = r.order_id
                          and i.status = 'issued'
                          and i.voided_at is null
                          and i.issued_at <= p_as_at)
  ),
  items as (
    select i.id, i.doc_no, i.doc_date, i.due_date, i.amount,
           coalesce(st.paid, 0) as paid
      from public.fin_opening_items i
      join o on o.id = i.party_row_id
      left join public.ap_opening_item_settled(p_as_at) st on st.item_id = i.id
  ),
  pool as (
    select greatest(0, coalesce(p_other_open, 0)
                       - ((select s.balance from since s) + (select w.amount from waiting w))
                       - (select coalesce(sum(it.paid), 0) from items it)) as credit
  ),
  ordered as (
    select it.*, greatest(0, it.amount - it.paid) as remaining,
           coalesce(sum(greatest(0, it.amount - it.paid)) over (
             order by coalesce(it.due_date, it.doc_date), it.doc_date, it.doc_no, it.id
             rows between unbounded preceding and 1 preceding), 0) as before
      from items it
  )
  select od.id, od.doc_no, od.doc_date, od.due_date, od.amount,
         (od.remaining - least(od.remaining, greatest(0, (select p.credit from pool p) - od.before)))::numeric(12,2)
    from ordered od
   order by coalesce(od.due_date, od.doc_date), od.doc_date, od.doc_no, od.id
$fn$;
revoke all on function public.fin_opening_items_open(date, uuid, numeric) from public, anon, authenticated;

-- The whole page in one answer.
create function public._fin_opening_read()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row     public.fin_opening;
  v_go_live date;
  v_closed  date;
  v_out     jsonb;
begin
  select * into v_row from public.fin_opening where id;
  select c.go_live_on, c.books_closed_through into v_go_live, v_closed from public.gl_config c where c.id;

  with plan as (select * from public._fin_opening_plan(false)),
  party_rows as (
    select p.*,
           case p.party_type when 'CUSTOMER' then cu.name when 'OTHER' then fp.name else s.name end as name,
           coalesce((select sum(i.amount) from public.fin_opening_items i where i.party_row_id = p.id), 0) as items_total
      from public.fin_opening_parties p
      left join public.customers cu on p.party_type = 'CUSTOMER' and cu.id = p.party_id
      left join public.finance_parties fp on p.party_type = 'OTHER' and fp.id = p.party_id
      left join public.suppliers s on p.party_type = 'SUPPLIER' and s.id = p.party_id
  )
  select jsonb_build_object(
    'status',               v_row.status,
    'go_live_on',           v_go_live,
    'entry_date',           v_go_live - 1,
    'books_closed_through', v_closed,
    'entry', (select jsonb_build_object('id', e.id, 'entry_no', e.entry_no)
                from public.gl_entries e where e.id = v_row.entry_id),
    'posted_at',            v_row.posted_at,
    'posted_by_name',       (select u.name from public.app_users u where u.id = v_row.posted_by),
    'updated_at',           v_row.updated_at,
    'updated_by_name',      (select u.name from public.app_users u where u.id = v_row.updated_by),
    'last_reversed', case when v_row.last_reversed_at is null then null else jsonb_build_object(
                       'at', v_row.last_reversed_at,
                       'by_name', (select u.name from public.app_users u where u.id = v_row.last_reversed_by),
                       'reason', v_row.last_reverse_reason) end,
    'may_post',             coalesce(public.is_principal(), false),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', a.code, 'name', a.name, 'kind', a.kind, 'special', a.special,
               'debit', coalesce(oa.debit, 0), 'credit', coalesce(oa.credit, 0),
               'eligible', public._fin_opening_account_ok(a.code))
             order by a.sort_order, a.code)
        from public.gl_accounts a
        left join public.fin_opening_accounts oa on oa.account_code = a.code
       where public._fin_opening_account_ok(a.code) or oa.account_code is not null), '[]'::jsonb),
    'parties', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pr.id, 'party_type', pr.party_type, 'party_id', pr.party_id,
               'name', pr.name, 'account_code', pr.account_code,
               'account_name', (select a.name from public.gl_accounts a where a.code = pr.account_code),
               'total', pr.total, 'items_total', pr.items_total, 'difference', pr.total - pr.items_total,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', i.id, 'doc_no', i.doc_no, 'doc_date', i.doc_date,
                          'due_date', i.due_date, 'amount', i.amount) order by i.line_no)
                   from public.fin_opening_items i where i.party_row_id = pr.id), '[]'::jsonb))
             order by pr.party_type, pr.name, pr.party_id)
        from party_rows pr), '[]'::jsonb),
    'stock', coalesce((
      select jsonb_agg(jsonb_build_object(
               'unit_code', s.unit_code, 'unit_id', u.id, 'found', u.id is not null,
               'sku', u.sku, 'qty', u.qty, 'unit_cost', s.unit_cost,
               'value', case when u.id is null then null else round(u.qty * s.unit_cost, 2) end)
             order by (u.id is null) desc, s.unit_code)
        from public.fin_opening_stock s
        left join public.ops_stock_items u on u.id = s.unit_id), '[]'::jsonb),
    'deposits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'order_ref', d.order_ref, 'customer_ref', d.customer_ref,
               'order_id', o.id, 'found', o.id is not null, 'so', o.so,
               'customer_name', o.customer_name, 'delivered_at', o.delivered_at,
               'account_code', case when o.id is null then null else public._fin_opening_order_account(o.id) end,
               'amount', d.amount)
             order by (o.id is null) desc, d.line_no)
        from public.fin_opening_deposits d
        left join public.orders o on o.id = d.order_id), '[]'::jsonb),
    'totals', (select jsonb_build_object('debit', coalesce(sum(pl.debit), 0), 'credit', coalesce(sum(pl.credit), 0),
                                         'lines', count(*))
                 from plan pl),
    'choices', jsonb_build_object(
      'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone) order by c.name, c.id)
                               from public.customers c), '[]'::jsonb),
      'other_debtors', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.name, f.id)
                                   from public.finance_parties f where f.is_active), '[]'::jsonb),
      'suppliers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind::text) order by s.name, s.id)
                               from public.suppliers s), '[]'::jsonb),
      'debtor_accounts', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'control_for', a.control_for) order by a.code)
                                     from public.gl_accounts a
                                    where a.is_active and a.is_control and not a.is_heading
                                      and a.kind = 'ASSET' and a.control_for in ('CUSTOMER', 'OTHER')), '[]'::jsonb),
      'supplier_accounts', coalesce((select jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name, 'control_for', a.control_for) order by a.code)
                                       from public.gl_accounts a
                                      where a.is_active and a.is_control and not a.is_heading
                                        and a.kind = 'LIABILITY' and a.control_for = 'SUPPLIER'), '[]'::jsonb),
      'default_accounts', jsonb_build_object(
        'CUSTOMER', (select r.account_code from public.gl_account_roles r where r.role = 'SHOWROOM_DEBTORS'),
        'OTHER',    (select min(a.code) from public.gl_accounts a
                      where a.is_active and a.is_control and a.kind = 'ASSET' and a.control_for = 'OTHER'),
        'SUPPLIER', (select r.account_code from public.gl_account_roles r where r.role = 'TRADE_PAYABLE')))
  ) into v_out;
  return v_out;
end;
$fn$;
revoke all on function public._fin_opening_read() from public, anon, authenticated;

create function public._fin_opening_accounts_save(p_actor uuid, p_lines jsonb, p_was timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at   timestamptz;
  v_elem jsonb;
  v_code text;
  v_dr   numeric;
  v_cr   numeric;
  v_seen text[] := '{}';
begin
  v_at := public._fin_opening_touch(p_actor, p_was);
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'The accounts could not be read. Reload and try again.' using errcode = 'P0001', detail = 'opening_shape';
  end if;
  if jsonb_array_length(p_lines) > 2000 then
    raise exception 'Too many accounts in one save.' using errcode = 'P0001', detail = 'opening_shape';
  end if;
  delete from public.fin_opening_accounts;
  for v_elem in select value from jsonb_array_elements(p_lines) loop
    v_code := btrim(coalesce(v_elem->>'account_code', ''));
    if v_code = any (v_seen) then
      raise exception 'Account % is listed twice.', v_code using errcode = 'P0001', detail = 'opening_account_twice';
    end if;
    v_seen := v_seen || v_code;
    v_dr := coalesce(public._fin_opening_amount(v_elem->'debit', format('The debit on %s', v_code)), 0);
    v_cr := coalesce(public._fin_opening_amount(v_elem->'credit', format('The credit on %s', v_code)), 0);
    if v_dr = 0 and v_cr = 0 then
      continue;
    end if;
    if v_dr <> 0 and v_cr <> 0 then
      raise exception 'Account % has a debit and a credit. An account takes one of them.', v_code
        using errcode = 'P0001', detail = 'opening_account_two_sides';
    end if;
    if not public._fin_opening_account_ok(v_code) then
      raise exception 'Account % cannot take an opening balance here.', v_code
        using errcode = 'P0001', detail = 'opening_account_not_allowed';
    end if;
    insert into public.fin_opening_accounts (account_code, debit, credit) values (v_code, v_dr, v_cr);
  end loop;
  return v_at;
end;
$fn$;
revoke all on function public._fin_opening_accounts_save(uuid, jsonb, timestamptz) from public, anon, authenticated;

create function public._fin_opening_party_save(
  p_actor uuid, p_row_id uuid, p_party_type text, p_party_id uuid, p_account_code text,
  p_total numeric, p_items jsonb, p_was timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at      timestamptz;
  v_go_live date;
  v_row     public.fin_opening_parties;
  v_acct    public.gl_accounts;
  v_elem    jsonb;
  v_n       integer := 0;
  v_doc     text;
  v_date    date;
  v_due     date;
  v_amount  numeric;
  v_total   numeric;
  v_known   boolean;
begin
  v_at := public._fin_opening_touch(p_actor, p_was);
  select c.go_live_on into v_go_live from public.gl_config c where c.id;

  if p_party_type is null or p_party_type not in ('CUSTOMER', 'OTHER', 'SUPPLIER') or p_party_id is null then
    raise exception 'Choose the party.' using errcode = 'P0001', detail = 'opening_party_missing';
  end if;
  v_known := case p_party_type
               when 'CUSTOMER' then exists (select 1 from public.customers c where c.id = p_party_id)
               when 'OTHER'    then exists (select 1 from public.finance_parties f where f.id = p_party_id)
               else exists (select 1 from public.suppliers s where s.id = p_party_id) end;
  if not v_known then
    raise exception 'That party is not found.' using errcode = 'P0001', detail = 'opening_party_unknown';
  end if;

  select * into v_acct from public.gl_accounts a where a.code = btrim(coalesce(p_account_code, ''));
  if not found or not v_acct.is_active or v_acct.is_heading or not v_acct.is_control
     or v_acct.control_for is distinct from p_party_type
     or (p_party_type <> 'SUPPLIER' and v_acct.kind <> 'ASSET')
     or (p_party_type = 'SUPPLIER' and v_acct.kind <> 'LIABILITY') then
    raise exception 'Choose the party''s account.' using errcode = 'P0001', detail = 'opening_party_account';
  end if;

  v_total := public._fin_opening_amount(to_jsonb(p_total), 'The total', true);
  if v_total is null or v_total = 0 then
    raise exception 'Type the total.' using errcode = 'P0001', detail = 'opening_party_total';
  end if;

  if p_items is null then
    p_items := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'The open items could not be read. Reload and try again.' using errcode = 'P0001', detail = 'opening_shape';
  end if;

  if p_row_id is null then
    if exists (select 1 from public.fin_opening_parties p where p.party_type = p_party_type and p.party_id = p_party_id) then
      raise exception 'This party is already on the list. Open its row to change it.'
        using errcode = 'P0001', detail = 'opening_party_twice';
    end if;
    insert into public.fin_opening_parties (party_type, party_id, account_code, total)
    values (p_party_type, p_party_id, v_acct.code, v_total)
    returning * into v_row;
  else
    if exists (select 1 from public.fin_opening_parties p
                where p.party_type = p_party_type and p.party_id = p_party_id and p.id <> p_row_id) then
      raise exception 'This party is already on the list. Open its row to change it.'
        using errcode = 'P0001', detail = 'opening_party_twice';
    end if;
    update public.fin_opening_parties
       set party_type = p_party_type, party_id = p_party_id, account_code = v_acct.code, total = v_total
     where id = p_row_id
    returning * into v_row;
    if not found then
      raise exception 'That row is no longer on the list. Reload to see it.' using errcode = 'P0002', detail = 'opening_row_missing';
    end if;
    delete from public.fin_opening_items where party_row_id = v_row.id;
  end if;

  for v_elem in select value from jsonb_array_elements(p_items) loop
    v_n := v_n + 1;
    v_doc := btrim(coalesce(v_elem->>'doc_no', ''));
    if v_doc !~ '[^[:space:]]' or char_length(v_doc) > 60 then
      raise exception 'Type the document number on line %.', v_n using errcode = 'P0001', detail = 'opening_item_doc_no';
    end if;
    begin
      v_date := nullif(v_elem->>'doc_date', '')::date;
      v_due  := nullif(v_elem->>'due_date', '')::date;
    exception when others then
      raise exception 'Line % has a date that cannot be read.', v_n using errcode = 'P0001', detail = 'opening_item_date';
    end;
    if v_date is null then
      raise exception 'Choose the date on line %.', v_n using errcode = 'P0001', detail = 'opening_item_date';
    end if;
    if v_go_live is not null and v_date >= v_go_live then
      raise exception 'Line % is dated %. An open item is dated before the books start on %.',
        v_n, to_char(v_date, 'FMDD Mon YYYY'), to_char(v_go_live, 'FMDD Mon YYYY')
        using errcode = 'P0001', detail = 'opening_item_date';
    end if;
    if v_due is not null and v_due < v_date then
      raise exception 'The due date on line % is before its date.', v_n using errcode = 'P0001', detail = 'opening_item_due';
    end if;
    v_amount := public._fin_opening_amount(v_elem->'amount', format('The amount on line %s', v_n));
    if v_amount is null or v_amount = 0 then
      raise exception 'Type the amount on line %.', v_n using errcode = 'P0001', detail = 'opening_item_amount';
    end if;
    insert into public.fin_opening_items (party_row_id, line_no, doc_no, doc_date, due_date, amount)
    values (v_row.id, v_n, v_doc, v_date, v_due, v_amount);
  end loop;

  return jsonb_build_object('id', v_row.id, 'updated_at', v_at);
end;
$fn$;
revoke all on function public._fin_opening_party_save(uuid, uuid, text, uuid, text, numeric, jsonb, timestamptz) from public, anon, authenticated;

create function public._fin_opening_party_remove(p_actor uuid, p_row_id uuid, p_was timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at timestamptz;
begin
  v_at := public._fin_opening_touch(p_actor, p_was);
  delete from public.fin_opening_parties where id = p_row_id;
  if not found then
    raise exception 'That row is no longer on the list. Reload to see it.' using errcode = 'P0002', detail = 'opening_row_missing';
  end if;
  return v_at;
end;
$fn$;
revoke all on function public._fin_opening_party_remove(uuid, uuid, timestamptz) from public, anon, authenticated;

-- The Stock tab, replaced whole. A Unit is found by its exact code, never by
-- a near match; one not found is kept and listed, and Post waits for it.
create function public._fin_opening_stock_save(p_actor uuid, p_rows jsonb, p_was timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at   timestamptz;
  v_elem jsonb;
  v_code text;
  v_cost numeric;
  v_n    integer := 0;
begin
  v_at := public._fin_opening_touch(p_actor, p_was);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10000 then
    raise exception 'The Units could not be read. Reload and try again.' using errcode = 'P0001', detail = 'opening_shape';
  end if;
  delete from public.fin_opening_stock;
  for v_elem in select value from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_code := btrim(coalesce(v_elem->>'unit_code', ''));
    if v_code !~ '[^[:space:]]' or char_length(v_code) > 80 then
      raise exception 'Row % has no Unit.', v_n using errcode = 'P0001', detail = 'opening_unit_missing';
    end if;
    v_cost := public._fin_opening_amount(v_elem->'unit_cost', format('The cost of %s', v_code));
    if v_cost is null then
      raise exception 'Type the cost of %.', v_code using errcode = 'P0001', detail = 'opening_unit_cost';
    end if;
    if exists (select 1 from public.fin_opening_stock s where s.unit_code = v_code) then
      raise exception 'Unit % is listed twice.', v_code using errcode = 'P0001', detail = 'opening_unit_twice';
    end if;
    insert into public.fin_opening_stock (unit_code, unit_id, unit_cost)
    values (v_code, (select u.id from public.ops_stock_items u where u.unit_code = v_code), v_cost);
  end loop;
  return jsonb_build_object(
    'updated_at', v_at,
    'not_found', coalesce((select jsonb_agg(s.unit_code order by s.unit_code)
                             from public.fin_opening_stock s where s.unit_id is null), '[]'::jsonb));
end;
$fn$;
revoke all on function public._fin_opening_stock_save(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- The Customer deposits tab, replaced whole. An order is found by its SO
-- number (`SO-1234` or `1234`); one not found is kept and listed.
create function public._fin_opening_deposits_save(p_actor uuid, p_rows jsonb, p_was timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at     timestamptz;
  v_elem   jsonb;
  v_ref    text;
  v_cust   text;
  v_so     text;
  v_order  uuid;
  v_amount numeric;
  v_n      integer := 0;
begin
  v_at := public._fin_opening_touch(p_actor, p_was);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'The deposits could not be read. Reload and try again.' using errcode = 'P0001', detail = 'opening_shape';
  end if;
  delete from public.fin_opening_deposits;
  for v_elem in select value from jsonb_array_elements(p_rows) loop
    v_n := v_n + 1;
    v_ref := btrim(coalesce(v_elem->>'order_ref', ''));
    if v_ref !~ '[^[:space:]]' or char_length(v_ref) > 40 then
      raise exception 'Row % has no SO No.', v_n using errcode = 'P0001', detail = 'opening_order_missing';
    end if;
    v_cust := nullif(left(btrim(coalesce(v_elem->>'customer_ref', '')), 200), '');
    v_amount := public._fin_opening_amount(v_elem->'amount', format('The deposit on %s', v_ref));
    if v_amount is null or v_amount = 0 then
      raise exception 'Type the deposit on %.', v_ref using errcode = 'P0001', detail = 'opening_deposit_amount';
    end if;
    v_so := substring(upper(v_ref) from '^(?:SO)?[\s-]*([0-9]{1,9})$');
    v_order := case when v_so is null then null
                    else (select o.id from public.orders o where o.so = v_so::integer) end;
    if v_order is not null and exists (select 1 from public.fin_opening_deposits d where d.order_id = v_order) then
      raise exception '% is listed twice.', v_ref using errcode = 'P0001', detail = 'opening_order_twice';
    end if;
    insert into public.fin_opening_deposits (line_no, order_ref, customer_ref, order_id, amount)
    values (v_n, v_ref, v_cust, v_order, v_amount);
  end loop;
  return jsonb_build_object(
    'updated_at', v_at,
    'not_found', coalesce((select jsonb_agg(d.order_ref order by d.line_no)
                             from public.fin_opening_deposits d where d.order_id is null), '[]'::jsonb));
end;
$fn$;
revoke all on function public._fin_opening_deposits_save(uuid, jsonb, timestamptz) from public, anon, authenticated;

create function public._fin_opening_post(p_actor uuid, p_was timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row     public.fin_opening;
  v_go_live date;
  v_closed  date;
  v_date    date;
  v_lines   jsonb;
  v_dr      numeric;
  v_cr      numeric;
  v_id      uuid;
  v_equity  text;
  v_left    numeric;
begin
  select * into v_row from public.fin_opening where id for update;
  if not found then
    raise exception 'The opening balances are not set up.' using errcode = 'P0002', detail = 'opening_missing';
  end if;
  if v_row.status = 'posted' then
    raise exception 'The opening balances are already posted. Reverse them to change them.'
      using errcode = 'P0001', detail = 'opening_already_posted';
  end if;
  if p_was is distinct from v_row.updated_at then
    raise exception 'Someone else changed the opening balances. Reload to see them.'
      using errcode = '40001', detail = 'opening_changed';
  end if;

  select c.go_live_on, c.books_closed_through into v_go_live, v_closed from public.gl_config c where c.id;
  if v_go_live is null then
    raise exception 'The ledger has no start date yet.' using errcode = 'P0001', detail = 'no_go_live';
  end if;
  v_date := v_go_live - 1;
  if v_closed is not null and v_closed >= v_date then
    raise exception 'The books are closed up to %. The opening balances can no longer be posted.',
      to_char(v_closed, 'FMDD Mon YYYY') using errcode = 'P0001', detail = 'books_closed';
  end if;
  if exists (select 1 from public.fin_opening_stock s
              where s.unit_id is null or not exists (select 1 from public.ops_stock_items u where u.id = s.unit_id)) then
    raise exception 'A Unit on the Stock tab is not found. Correct or remove it first.'
      using errcode = 'P0001', detail = 'opening_unit_unknown';
  end if;
  if exists (select 1 from public.fin_opening_deposits d
              where d.order_id is null or not exists (select 1 from public.orders o where o.id = d.order_id)) then
    raise exception 'An order on the Customer deposits tab is not found. Correct or remove it first.'
      using errcode = 'P0001', detail = 'opening_order_unknown';
  end if;

  select jsonb_agg(jsonb_build_object(
           'account_code', p.account_code,
           'debit',  case when p.debit  <> 0 then p.debit  end,
           'credit', case when p.credit <> 0 then p.credit end,
           'party_type', p.party_type, 'party_id', p.party_id, 'memo', p.memo) order by p.ord),
         coalesce(sum(p.debit), 0), coalesce(sum(p.credit), 0)
    into v_lines, v_dr, v_cr
    from public._fin_opening_plan(true) p;
  if v_lines is null then
    raise exception 'Nothing is entered yet.' using errcode = 'P0001', detail = 'opening_empty';
  end if;
  if v_dr <> v_cr then
    raise exception 'Debits and credits differ by %. 160-0000 Opening balance must be RM 0.00 after posting.',
      public.fin_rm(abs(v_dr - v_cr)) using errcode = 'P0001', detail = 'opening_out_of_balance';
  end if;

  v_id := public.gl_post('OPENING', 'OB-' || to_char(v_go_live, 'YYYYMMDD'), v_date, 'Opening balances', v_lines);

  -- 160-0000 is zero after it, counting every entry on it.
  v_equity := public.gl_account_for('OPENING_BALANCE_EQUITY');
  select coalesce(sum(l.debit - l.credit), 0) into v_left
    from public.gl_entry_lines l
    join public.gl_entries e on e.id = l.entry_id
   where e.posted and l.account_code = v_equity;
  if v_left <> 0 then
    raise exception '% Opening balance would hold % after posting. It must be RM 0.00.',
      v_equity, public.fin_rm(abs(v_left)) using errcode = 'P0001', detail = 'opening_account_not_zero';
  end if;

  update public.fin_opening
     set status = 'posted', entry_id = v_id, posted_at = now(),
         posted_by = (select u.id from public.app_users u where u.id = p_actor),
         updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond'),
         updated_by = (select u.id from public.app_users u where u.id = p_actor)
   where id;

  insert into public.audit_log (role, actor_text, action, ref)
  values (public.app_role(), (select u.name from public.app_users u where u.id = p_actor),
          format('Opening balances posted · %s', (select e.entry_no from public.gl_entries e where e.id = v_id)),
          'fin_opening');
  return v_id;
end;
$fn$;
revoke all on function public._fin_opening_post(uuid, timestamptz) from public, anon, authenticated;

create function public._fin_opening_reverse(p_actor uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_row    public.fin_opening;
  v_closed date;
  v_date   date;
  v_reason text := case when coalesce(p_reason, '') ~ '[^[:space:]]' then btrim(p_reason) end;
  v_rev    uuid;
begin
  select * into v_row from public.fin_opening where id for update;
  if not found or v_row.status <> 'posted' then
    raise exception 'The opening balances are not posted.' using errcode = 'P0001', detail = 'opening_not_posted';
  end if;
  if v_reason is null then
    raise exception 'Type the reason.' using errcode = 'P0001', detail = 'opening_reason_blank';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'The reason is longer than 500 characters.' using errcode = 'P0001', detail = 'opening_reason_long';
  end if;
  -- A payment voucher that is not cancelled holds an opening bill: the bill
  -- would be replaced under it. Cancel or change that voucher first.
  if exists (select 1 from public.payment_voucher_opening_allocations a
               join public.payment_vouchers v on v.id = a.voucher_id
              where v.status <> 'cancelled') then
    raise exception 'A payment voucher pays an opening bill (%). Cancel it, or take the opening bill off it, first.',
      (select string_agg(distinct coalesce(v.voucher_no, 'a draft voucher'), ', ')
         from public.payment_voucher_opening_allocations a
         join public.payment_vouchers v on v.id = a.voucher_id
        where v.status <> 'cancelled')
      using errcode = 'P0001', detail = 'opening_paid_by_voucher';
  end if;
  select e.entry_date into v_date from public.gl_entries e where e.id = v_row.entry_id;
  select c.books_closed_through into v_closed from public.gl_config c where c.id;
  if v_closed is not null and v_closed >= v_date then
    raise exception 'The books are closed up to %. The opening balances can no longer be reversed.',
      to_char(v_closed, 'FMDD Mon YYYY') using errcode = 'P0001', detail = 'books_closed';
  end if;

  v_rev := public.gl_reverse(v_row.entry_id, v_reason);

  update public.fin_opening
     set status = 'draft', entry_id = null,
         last_reversed_at = now(),
         last_reversed_by = (select u.id from public.app_users u where u.id = p_actor),
         last_reverse_reason = v_reason,
         updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond'),
         updated_by = (select u.id from public.app_users u where u.id = p_actor)
   where id;

  insert into public.audit_log (role, actor_text, action, ref)
  values (public.app_role(), (select u.name from public.app_users u where u.id = p_actor),
          format('Opening balances reversed · %s', v_reason), 'fin_opening');
  return v_rev;
end;
$fn$;
revoke all on function public._fin_opening_reverse(uuid, text) from public, anon, authenticated;

-- ── 4 · the doors ────────────────────────────────────────────────────────────
create function public._fin_opening_guard(p_post boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_post then
    if not coalesce(public.is_principal(), false) then
      raise exception 'Only the principal may post or reverse the opening balances.'
        using errcode = '42501', detail = 'opening_forbidden';
    end if;
  elsif not coalesce(public.gl_may_read(), false) then
    raise exception 'The opening balances are for Finance.' using errcode = '42501', detail = 'not_finance';
  end if;
  return auth.uid();
end;
$fn$;
revoke all on function public._fin_opening_guard(boolean) from public, anon, authenticated;

create function public.fin_opening_read()
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $fn$ begin perform public._fin_opening_guard(false); return public._fin_opening_read(); end; $fn$;

create function public.fin_opening_state()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $fn$
begin
  perform public._fin_opening_guard(false);
  return (select jsonb_build_object('status', f.status, 'entry_date', e.entry_date, 'entry_no', e.entry_no)
            from public.fin_opening f left join public.gl_entries e on e.id = f.entry_id where f.id);
end;
$fn$;

create function public.fin_opening_accounts_save(p_lines jsonb, p_was timestamptz)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp
as $fn$ begin return public._fin_opening_accounts_save(public._fin_opening_guard(false), p_lines, p_was); end; $fn$;

create function public.fin_opening_party_save(
  p_row_id uuid, p_party_type text, p_party_id uuid, p_account_code text, p_total numeric, p_items jsonb, p_was timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $fn$
begin
  return public._fin_opening_party_save(public._fin_opening_guard(false), p_row_id, p_party_type, p_party_id,
                                        p_account_code, p_total, p_items, p_was);
end;
$fn$;

create function public.fin_opening_party_remove(p_row_id uuid, p_was timestamptz)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp
as $fn$ begin return public._fin_opening_party_remove(public._fin_opening_guard(false), p_row_id, p_was); end; $fn$;

create function public.fin_opening_stock_save(p_rows jsonb, p_was timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $fn$ begin return public._fin_opening_stock_save(public._fin_opening_guard(false), p_rows, p_was); end; $fn$;

create function public.fin_opening_deposits_save(p_rows jsonb, p_was timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $fn$ begin return public._fin_opening_deposits_save(public._fin_opening_guard(false), p_rows, p_was); end; $fn$;

create function public.fin_opening_post(p_was timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $fn$ begin return public._fin_opening_post(public._fin_opening_guard(true), p_was); end; $fn$;

create function public.fin_opening_reverse(p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $fn$ begin return public._fin_opening_reverse(public._fin_opening_guard(true), p_reason); end; $fn$;

revoke all on function public.fin_opening_read() from public, anon;
revoke all on function public.fin_opening_state() from public, anon;
revoke all on function public.fin_opening_accounts_save(jsonb, timestamptz) from public, anon;
revoke all on function public.fin_opening_party_save(uuid, text, uuid, text, numeric, jsonb, timestamptz) from public, anon;
revoke all on function public.fin_opening_party_remove(uuid, timestamptz) from public, anon;
revoke all on function public.fin_opening_stock_save(jsonb, timestamptz) from public, anon;
revoke all on function public.fin_opening_deposits_save(jsonb, timestamptz) from public, anon;
revoke all on function public.fin_opening_post(timestamptz) from public, anon;
revoke all on function public.fin_opening_reverse(text) from public, anon;
grant execute on function public.fin_opening_read() to authenticated;
grant execute on function public.fin_opening_state() to authenticated;
grant execute on function public.fin_opening_accounts_save(jsonb, timestamptz) to authenticated;
grant execute on function public.fin_opening_party_save(uuid, text, uuid, text, numeric, jsonb, timestamptz) to authenticated;
grant execute on function public.fin_opening_party_remove(uuid, timestamptz) to authenticated;
grant execute on function public.fin_opening_stock_save(jsonb, timestamptz) to authenticated;
grant execute on function public.fin_opening_deposits_save(jsonb, timestamptz) to authenticated;
grant execute on function public.fin_opening_post(timestamptz) to authenticated;
grant execute on function public.fin_opening_reverse(text) to authenticated;

-- ── 5 · the reports read the posted opening ──────────────────────────────────

-- AR Aging: an opening deposit is its order's money, so it fills that order's
-- invoice first, exactly as a payment does.
select pg_temp.mig0705_rewrite('public.fin_ar_aging(date)'::regprocedure,
$old$  cust_paid as (
    select p.order_id, sum(p.amount) as paid
      from public.order_payments p
     where p.voided_at is null
       and p.paid_on >= v_go_live
       and p.paid_on <= p_as_at
     group by p.order_id
  ),$old$,
$new$  cust_paid as (
    select x.order_id, sum(x.amount) as paid
      from (
        select p.order_id, p.amount
          from public.order_payments p
         where p.voided_at is null
           and p.paid_on >= v_go_live
           and p.paid_on <= p_as_at
        union all
        -- 0705: a deposit brought forward at go-live, once posted.
        select d.order_id, d.amount
          from public.fin_opening_deposits d
          join public.fin_opening f on f.id and f.status = 'posted'
          join public.gl_entries oe on oe.id = f.entry_id
         where d.order_id is not null
           and oe.entry_date <= p_as_at
      ) x
     group by x.order_id
  ),$new$);

-- Each debtor's list of open invoices takes its opening items too.
select pg_temp.mig0705_rewrite('public.fin_ar_aging(date)'::regprocedure,
$old$                   from open_inv oi
                  where oi.party_type = p.party_type$old$,
$new$                   from open_all oi
                  where oi.party_type = p.party_type$new$);

select pg_temp.mig0705_rewrite('public.fin_ar_aging(date)'::regprocedure,
$old$  parties as (
    select pb.party_type, pb.party_id from party_balance pb where pb.balance <> 0
    union
    select oi.party_type, oi.party_id from open_inv oi
  )$old$,
$new$  -- 0705: each opening invoice still open, by fin_opening_items_open (the
  -- one arithmetic AP Aging uses too), beside the documents above.
  open_all as (
    select * from open_inv
    union all
    select op.party_type, op.party_id, it.item_id, it.doc_no, 'opening'::text, null::uuid, null::integer,
           it.doc_date, it.due_date, it.amount, it.open, null::text, null::uuid
      from public.fin_opening_parties op
      cross join lateral public.fin_opening_items_open(
        p_as_at, op.id,
        coalesce((select sum(oi.open) from open_inv oi
                   where oi.party_type = op.party_type and oi.party_id = op.party_id), 0)) it
     where op.party_type in ('CUSTOMER', 'OTHER')
       and it.open > 0
  ),
  parties as (
    select pb.party_type, pb.party_id from party_balance pb where pb.balance <> 0
    union
    select oi.party_type, oi.party_id from open_all oi
  )$new$);

-- AP Aging: each opening bill still open, by the same arithmetic.
select pg_temp.mig0705_rewrite('public.fin_ap_aging(date)'::regprocedure,
$old$                   from open_bills ob
                  where ob.supplier_id = p.supplier_id and ob.open > 0), '[]'::jsonb))$old$,
$new$                   from open_all ob
                  where ob.supplier_id = p.supplier_id and ob.open > 0), '[]'::jsonb))$new$);

select pg_temp.mig0705_rewrite('public.fin_ap_aging(date)'::regprocedure,
$old$  parties as (
    select pb.supplier_id from party_balance pb where pb.balance <> 0
    union
    select ob.supplier_id from open_bills ob where ob.open > 0
  )$old$,
$new$  -- 0705: each opening bill still open (fin_opening_items_open).
  open_all as (
    select * from open_bills
    union all
    select it.item_id, it.doc_no, it.doc_no, op.party_id, it.doc_date, it.due_date, it.amount, it.open, 'opening'::text
      from public.fin_opening_parties op
      cross join lateral public.fin_opening_items_open(
        p_as_at, op.id,
        coalesce((select sum(ob.open) from open_bills ob
                   where ob.supplier_id = op.party_id and ob.open > 0), 0)) it
     where op.party_type = 'SUPPLIER'
       and it.open > 0
  ),
  parties as (
    select pb.supplier_id from party_balance pb where pb.balance <> 0
    union
    select ob.supplier_id from open_all ob where ob.open > 0
  )$new$);

-- Stock value: a Unit with no PO cost takes Finance's opening cost, once posted.
select pg_temp.mig0705_rewrite('public.fin_stock_value(date)'::regprocedure,
$old$             case when pol.id is null then null
                  when pol.commercial_treatment = 'free_of_charge' then 0::numeric
                  else pol.cost end as unit_cost$old$,
$new$             case when pol.id is not null and pol.commercial_treatment = 'free_of_charge' then 0::numeric
                  when pol.id is not null and pol.cost is not null then pol.cost
                  -- 0705: no PO cost, so the cost Finance brought forward at go-live, once posted.
                  else (select os.unit_cost
                          from public.fin_opening_stock os
                          join public.fin_opening ofo on ofo.id and ofo.status = 'posted'
                         where os.unit_id = h.id) end as unit_cost$new$);


-- ── 6 · a payment voucher pays an opening bill ──────────────────────────────
-- Exactly as it pays a bill (0477) or a debit note (0681): ticked on the
-- voucher with an amount, held to the bill by its ceiling trigger, checked
-- again on approval, and posted Dr the bill's payables account with the
-- supplier. What is paid reduces the opening bill everywhere it shows (AP
-- Aging, Unpaid by Supplier, the voucher's list) through one arithmetic.

-- The voucher's list of opening bills: each posted opening bill of a
-- supplier, what is paid and held on it. Finance or principal.
create function public.ap_opening_bill_outstanding(p_supplier_id uuid default null)
returns table (item_id uuid, doc_no text, supplier_id uuid, supplier_name text, doc_date date, due_date date,
               total_amount numeric, paid_total numeric, balance_owing numeric, ap_account_code text,
               allocated_total numeric, unallocated numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'accounts payable is internal'
      using errcode = '42501', detail = 'not_internal';
  end if;
  return query
  select oi.id, oi.doc_no, op.party_id, s.name, oi.doc_date, oi.due_date, oi.amount,
         coalesce(pp.paid, 0)::numeric(12,2),
         (oi.amount - coalesce(pp.paid, 0))::numeric(12,2),
         op.account_code,
         coalesce(pp.held, 0)::numeric(12,2),
         (oi.amount - coalesce(pp.held, 0))::numeric(12,2)
    from public.fin_opening_items oi
    join public.fin_opening_parties op on op.id = oi.party_row_id and op.party_type = 'SUPPLIER'
    join public.fin_opening f on f.id and f.status = 'posted'
    join public.suppliers s on s.id = op.party_id
    left join public.ap_opening_item_paid() pp on pp.item_id = oi.id
   where p_supplier_id is null or op.party_id = p_supplier_id
   order by oi.doc_date, oi.doc_no;
end;
$fn$;
revoke all on function public.ap_opening_bill_outstanding(uuid) from public, anon;
grant execute on function public.ap_opening_bill_outstanding(uuid) to authenticated;

-- The ceiling, the twin of pv_debit_note_allocation_ceiling (0681): the
-- opening posted, the voucher's own supplier, never more than the bill, and
-- the voucher's bills, debit notes and opening bills never more than the voucher.
create function public.pv_opening_allocation_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_item       public.fin_opening_items%rowtype;
  v_party      public.fin_opening_parties%rowtype;
  v_voucher    public.payment_vouchers%rowtype;
  v_on_item    numeric(12,2);
  v_on_voucher numeric(12,2);
begin
  perform 1 from public.fin_opening f where f.id and f.status = 'posted' for share;
  if not found then
    raise exception 'The opening balances are not posted, so an opening bill cannot be paid.'
      using errcode = 'P0001', detail = 'opening_not_posted';
  end if;
  select * into v_item from public.fin_opening_items where id = new.opening_item_id;
  if not found then
    raise exception 'That opening bill does not exist.'
      using errcode = 'P0002', detail = 'opening_bill_missing';
  end if;
  select * into v_party from public.fin_opening_parties where id = v_item.party_row_id;
  select * into v_voucher from public.payment_vouchers where id = new.voucher_id for update;

  if v_party.party_type <> 'SUPPLIER' then
    raise exception 'Opening item % is not a supplier''s bill.', v_item.doc_no
      using errcode = 'P0001', detail = 'opening_bill_not_supplier';
  end if;
  if coalesce(v_voucher.purpose, 'SUPPLIER_BILLS') <> 'SUPPLIER_BILLS' then
    raise exception 'A direct payment does not pay bills.'
      using errcode = 'P0001', detail = 'direct_pays_no_bill';
  end if;
  if v_voucher.supplier_id is null or v_party.party_id <> v_voucher.supplier_id then
    raise exception 'Opening bill % belongs to a different supplier. One voucher pays one supplier.', v_item.doc_no
      using errcode = 'P0001', detail = 'supplier_mismatch';
  end if;

  v_on_item := coalesce((select pp.held from public.ap_opening_item_paid(new.opening_item_id) pp), 0)
             - coalesce((select a.amount_applied
                           from public.payment_voucher_opening_allocations a
                           join public.payment_vouchers v on v.id = a.voucher_id
                          where a.id = new.id and v.status <> 'cancelled'), 0);
  if v_on_item + new.amount_applied > v_item.amount then
    raise exception 'Opening bill % is RM % and RM % of it is already on a payment voucher, so it cannot take RM % more.',
      v_item.doc_no,
      to_char(v_item.amount, 'FM999,999,999,990.00'),
      to_char(v_on_item, 'FM999,999,999,990.00'),
      to_char(new.amount_applied, 'FM999,999,999,990.00')
      using errcode = 'P0001', detail = 'opening_bill_over_allocated';
  end if;

  select coalesce(sum(x.amount_applied), 0) into v_on_voucher
    from (select a.amount_applied from public.payment_voucher_allocations a
           where a.voucher_id = new.voucher_id
          union all
          select d.amount_applied from public.payment_voucher_debit_note_allocations d
           where d.voucher_id = new.voucher_id
          union all
          select o.amount_applied from public.payment_voucher_opening_allocations o
           where o.voucher_id = new.voucher_id and o.id <> new.id) x;
  if v_on_voucher + new.amount_applied > v_voucher.amount then
    raise exception 'The bills and debit notes on this voucher add up to more than the voucher total.'
      using errcode = 'P0001', detail = 'voucher_over_allocated';
  end if;
  return new;
end;
$fn$;
revoke all on function public.pv_opening_allocation_ceiling() from public, anon, authenticated;

create trigger pv_opening_allocation_ceiling_trg
  before insert or update on public.payment_voucher_opening_allocations
  for each row execute function public.pv_opening_allocation_ceiling();
-- The bills' own rule: what a voucher pays is frozen once it leaves draft.
create trigger pv_opening_allocation_only_while_draft_trg
  before insert or delete or update on public.payment_voucher_opening_allocations
  for each row execute function public.pv_allocation_only_while_draft();

-- Saving: an allocation names a bill, a debit note or an opening bill, one of them.
select pg_temp.mig0705_rewrite(
  'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure,
$old$    if nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '') is not null
       and nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null then$old$,
$new$    -- 0705: or an opening bill, one of the three.
    if (nullif(btrim(coalesce(v_line ->> 'bill_id', '')), '') is not null)::integer
       + (nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null)::integer
       + (nullif(btrim(coalesce(v_line ->> 'opening_item_id', '')), '') is not null)::integer > 1 then$new$);

select pg_temp.mig0705_rewrite(
  'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure,
$old$                            nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '')::uuid);$old$,
$new$                            nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '')::uuid,
                            nullif(btrim(coalesce(v_line ->> 'opening_item_id', '')), '')::uuid);   -- 0705$new$);

select pg_temp.mig0705_rewrite(
  'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure,
$old$    delete from public.payment_voucher_debit_note_allocations where voucher_id = v_id;   -- 0681$old$,
$new$    delete from public.payment_voucher_debit_note_allocations where voucher_id = v_id;   -- 0681
    delete from public.payment_voucher_opening_allocations where voucher_id = v_id;      -- 0705$new$);

select pg_temp.mig0705_rewrite(
  'public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure,
$old$    if nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null then
      -- 0681: a debit note, in its own table; its ceiling trigger measures it.$old$,
$new$    if nullif(btrim(coalesce(v_line ->> 'opening_item_id', '')), '') is not null then
      -- 0705: an opening bill, in its own table; its ceiling trigger measures it.
      insert into public.payment_voucher_opening_allocations (voucher_id, opening_item_id, amount_applied, created_by)
      values (v_id, (v_line ->> 'opening_item_id')::uuid,
              round(nullif(btrim(coalesce(v_line ->> 'amount', v_line ->> 'amount_applied', '')), '')::numeric, 2),
              v_me);
    elsif nullif(btrim(coalesce(v_line ->> 'debit_note_id', '')), '') is not null then
      -- 0681: a debit note, in its own table; its ceiling trigger measures it.$new$);

-- Checking: the opening bills count in the total, and stand as they do NOW.
select pg_temp.mig0705_rewrite('public._payment_voucher_validate(uuid)'::regprocedure,
$old$          select d.amount_applied from public.payment_voucher_debit_note_allocations d
           where d.voucher_id = p_voucher_id) x;$old$,
$new$          select d.amount_applied from public.payment_voucher_debit_note_allocations d
           where d.voucher_id = p_voucher_id
          union all
          -- 0705: and the opening bills.
          select o.amount_applied from public.payment_voucher_opening_allocations o
           where o.voucher_id = p_voucher_id) x;$new$);

select pg_temp.mig0705_rewrite('public._payment_voucher_validate(uuid)'::regprocedure,
$old$    raise exception 'These debit notes can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'debit_note_cannot_take_payment';
  end if;$old$,
$new$    raise exception 'These debit notes can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'debit_note_cannot_take_payment';
  end if;

  -- 0705: the opening bills as they stand NOW: the opening still posted, this
  -- supplier's, not over-paid.
  select string_agg(coalesce(oi.doc_no, 'an opening bill'), ', ') into v_bad
    from public.payment_voucher_opening_allocations a
    left join public.fin_opening_items oi on oi.id = a.opening_item_id
    left join public.fin_opening_parties op on op.id = oi.party_row_id
   where a.voucher_id = p_voucher_id
     and (oi.id is null
          or op.party_type <> 'SUPPLIER'
          or op.party_id is distinct from v_v.supplier_id
          or not exists (select 1 from public.fin_opening f where f.id and f.status = 'posted')
          or coalesce((select pp.held from public.ap_opening_item_paid(a.opening_item_id) pp), 0) > oi.amount);
  if v_bad is not null then
    raise exception 'These opening bills can no longer take this payment: %. Return the voucher to draft and correct it.', v_bad
      using errcode = 'P0001', detail = 'opening_bill_cannot_take_payment';
  end if;$new$);

-- Approving: hold the opening still, and Dr each opening bill's payables account.
select pg_temp.mig0705_rewrite('public.payment_voucher_approve(uuid)'::regprocedure,
$old$  perform public._payment_voucher_validate(p_voucher_id);$old$,
$new$  -- 0705: the opening it pays cannot be reversed while this approves.
  if exists (select 1 from public.payment_voucher_opening_allocations a where a.voucher_id = p_voucher_id) then
    perform 1 from public.fin_opening f where f.id for share;
  end if;
  perform public._payment_voucher_validate(p_voucher_id);$new$);

select pg_temp.mig0705_rewrite('public.payment_voucher_approve(uuid)'::regprocedure,
$old$  -- Dr the advance to the supplier's own payables control (0484). The bill it$old$,
$new$  -- 0705: Dr each paid opening bill's payables account, party = its supplier.
  for r in select op.account_code, op.party_id, oi.doc_no, a.amount_applied
             from public.payment_voucher_opening_allocations a
             join public.fin_opening_items oi on oi.id = a.opening_item_id
             join public.fin_opening_parties op on op.id = oi.party_row_id
            where a.voucher_id = p_voucher_id
            order by oi.doc_date, oi.doc_no loop
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', r.account_code,
      'debit',  r.amount_applied,
      'credit', 0,
      'party_type', 'SUPPLIER',
      'party_id',   r.party_id,
      'memo',   'Pays opening bill ' || r.doc_no));
  end loop;

  -- Dr the advance to the supplier's own payables control (0484). The bill it$new$);

-- Its page lists the opening bills it pays.
select pg_temp.mig0705_rewrite('public.payment_voucher_document(uuid)'::regprocedure,
$old$    -- 0681: the supplier debit notes it pays.
    'debit_notes', coalesce(($old$,
$new$    -- 0705: the opening bills it pays.
    'opening_bills', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.doc_date, z.doc_no) from (
        select al.opening_item_id, oi.doc_no, oi.doc_date, oi.due_date,
               oi.amount as bill_total, op.account_code as ap_account_code, al.amount_applied
          from public.payment_voucher_opening_allocations al
          join public.fin_opening_items oi on oi.id = al.opening_item_id
          join public.fin_opening_parties op on op.id = oi.party_row_id
         where al.voucher_id = p_voucher_id) z), '[]'::jsonb),
    -- 0681: the supplier debit notes it pays.
    'debit_notes', coalesce(($new$);

-- Its list names them beside the bills.
select pg_temp.mig0705_rewrite('public.payment_voucher_register()'::regprocedure,
$old$                   where dl.voucher_id = v.id) x),$old$,
$new$                   where dl.voucher_id = v.id
                  union all
                  -- 0705: and the opening bills it pays.
                  select ob.doc_no, ob.doc_date
                    from public.payment_voucher_opening_allocations ol
                    join public.fin_opening_items ob on ob.id = ol.opening_item_id
                   where ol.voucher_id = v.id) x),$new$);

-- Unpaid by Supplier (ap_outstanding): each opening bill counts as a bill, less
-- what vouchers paid on it; what a supplier's opening total holds beyond its
-- bills adds to net owing, so net owing stays what the supplier's payables
-- account holds in the ledger (the Self-check compares the two).
select pg_temp.mig0705_rewrite('public.ap_outstanding(uuid)'::regprocedure,
$old$     where sb.status = 'confirmed'
  ), per_supplier as ($old$,
$new$     where sb.status = 'confirmed'
    union all
    -- 0705: each posted opening bill, paid like a bill.
    select op.party_id, oi.doc_date, oi.amount, coalesce(pp.paid, 0), coalesce(pp.held, 0)
      from public.fin_opening_items oi
      join public.fin_opening_parties op on op.id = oi.party_row_id and op.party_type = 'SUPPLIER'
      join public.fin_opening f on f.id and f.status = 'posted'
      left join public.ap_opening_item_paid() pp on pp.item_id = oi.id
  ), per_supplier as ($new$);

select pg_temp.mig0705_rewrite('public.ap_outstanding(uuid)'::regprocedure,
$old$  ), owed as ($old$,
$new$  ), opening_rest as (
    -- 0705: a posted opening total beyond its open bills (or below zero, owed to Carres).
    select op.party_id as sid,
           sum(op.total - coalesce((select sum(oi.amount) from public.fin_opening_items oi
                                     where oi.party_row_id = op.id), 0)) as rest
      from public.fin_opening_parties op
      join public.fin_opening f on f.id and f.status = 'posted'
     where op.party_type = 'SUPPLIER'
     group by op.party_id
  ), owed as ($new$);

select pg_temp.mig0705_rewrite('public.ap_outstanding(uuid)'::regprocedure,
$old$           coalesce(db.open_total, 0) as db_open
      from public.suppliers s$old$,
$new$           coalesce(db.open_total, 0) as db_open,
           coalesce(orr.rest, 0) as op_rest   -- 0705
      from public.suppliers s$new$);

select pg_temp.mig0705_rewrite('public.ap_outstanding(uuid)'::regprocedure,
$old$      left join debit_notes db on db.sid = s.id
$old$,
$new$      left join debit_notes db on db.sid = s.id
      left join opening_rest orr on orr.sid = s.id
$new$);

select pg_temp.mig0705_rewrite('public.ap_outstanding(uuid)'::regprocedure,
$old$         (o.owing + o.db_open - o.adv_open - o.cr_open)::numeric(12,2),$old$,
$new$         (o.owing + o.db_open + o.op_rest - o.adv_open - o.cr_open)::numeric(12,2),$new$);

-- The Self-check's receivables: the books' customer accounts against Payment's
-- invoices less receipts since go-live, plus the posted opening customer
-- totals less its deposits, so the opening is no false difference.
select pg_temp.mig0705_rewrite('public.gl_receivables_reconcile()'::regprocedure,
$old$  v_missing   text[] := array[]::text[];$old$,
$new$  v_missing   text[] := array[]::text[];
  v_open      numeric(12,2) := 0;   -- 0705: the posted opening's customer side$new$);

select pg_temp.mig0705_rewrite('public.gl_receivables_reconcile()'::regprocedure,
$old$    -- Invoices this window should have posted and did not.$old$,
$new$    -- 0705: what the posted opening put on the customer accounts: each
    -- customer's total, less the deposits brought forward.
    select round(coalesce((select sum(op.total) from public.fin_opening_parties op
                            join public.fin_opening f on f.id and f.status = 'posted'
                           where op.party_type = 'CUSTOMER'), 0)
               - coalesce((select sum(d.amount) from public.fin_opening_deposits d
                            join public.fin_opening f on f.id and f.status = 'posted'
                           where d.order_id is not null), 0), 2)
      into v_open;

    -- Invoices this window should have posted and did not.$new$);

select pg_temp.mig0705_rewrite('public.gl_receivables_reconcile()'::regprocedure,
$old$         round(v_inv - v_pay, 2),
         round(v_ledger - (v_inv - v_pay), 2),$old$,
$new$         round(v_inv - v_pay + v_open, 2),
         round(v_ledger - (v_inv - v_pay + v_open), 2),$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity_0705$
declare
  v_src text;
begin
  -- The date exception is gl_entry_date_ok's alone.
  if not public.gl_entry_date_ok('OPENING', date '2026-09-09', date '2026-09-10')
     or not public.gl_entry_date_ok('OPENING_REVERSAL', date '2026-09-09', date '2026-09-10')
     or not public.gl_entry_date_ok('SALES_INVOICE', date '2026-09-10', date '2026-09-10')
     or public.gl_entry_date_ok('OPENING', date '2026-09-08', date '2026-09-10')
     or public.gl_entry_date_ok('MANUAL', date '2026-09-09', date '2026-09-10')
     or public.gl_entry_date_ok('OPENING', null, date '2026-09-10') then
    raise exception '0705: gl_entry_date_ok does not answer as ruled';
  end if;
  select pg_get_functiondef('public.gl_post(text,text,date,text,jsonb)'::regprocedure) into v_src;
  if position('gl_entry_date_ok(v_source_type, p_entry_date, v_go_live)' in v_src) = 0
     or position('if p_entry_date < v_go_live then' in v_src) > 0 then
    raise exception '0705: gl_post does not ask gl_entry_date_ok';
  end if;
  select pg_get_functiondef('public.gl_ledger_health()'::regprocedure) into v_src;
  if position('gl_entry_date_ok(e.source_type, e.entry_date, v_go_live)' in v_src) = 0 then
    raise exception '0705: the ledger health check does not know the opening';
  end if;
  select pg_get_functiondef('public.fin_ar_aging(date)'::regprocedure) into v_src;
  if position('fin_opening_items_open(' in v_src) = 0 or position('from public.fin_opening_deposits d' in v_src) = 0
     or position('gl_report_guard' in v_src) = 0 then
    raise exception '0705: AR Aging does not read the opening, or lost its guard';
  end if;
  select pg_get_functiondef('public.fin_ap_aging(date)'::regprocedure) into v_src;
  if position('fin_opening_items_open(' in v_src) = 0 or position('gl_report_guard' in v_src) = 0 then
    raise exception '0705: AP Aging does not read the opening, or lost its guard';
  end if;
  select pg_get_functiondef('public.fin_stock_value(date)'::regprocedure) into v_src;
  if position('from public.fin_opening_stock os' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0705: Stock value does not read the opening cost, or lost its guard';
  end if;

  -- Every function here is security definer with its search_path.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and (p.proname like 'fin\_opening\_%' or p.proname like '\_fin\_opening\_%'
                     or p.proname in ('gl_post', 'gl_ledger_health', 'fin_ar_aging', 'fin_ap_aging', 'fin_stock_value'))
                and p.proname <> '_fin_opening_amount'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0705: a function lost security definer or its search_path';
  end if;
  -- The internals are closed; the doors are open to signed-in callers only.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and (p.proname like '\_fin\_opening\_%' or p.proname in ('fin_opening_items_open', 'gl_entry_date_ok'))
                and (has_function_privilege('authenticated', p.oid, 'execute')
                     or has_function_privilege('anon', p.oid, 'execute'))) then
    raise exception '0705: an internal opening function can be called from outside';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'fin\_opening\_%'
                and p.proname <> 'fin_opening_items_open'
                and (has_function_privilege('anon', p.oid, 'execute')
                     or not has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception '0705: an opening door is open to anon or closed to signed-in callers';
  end if;
  -- The tables: RLS on, read only.
  if exists (select 1 from pg_class c
              where c.oid in ('public.fin_opening'::regclass, 'public.fin_opening_accounts'::regclass,
                              'public.fin_opening_parties'::regclass, 'public.fin_opening_items'::regclass,
                              'public.fin_opening_stock'::regclass, 'public.fin_opening_deposits'::regclass)
                and (not c.relrowsecurity
                     or has_table_privilege('authenticated', c.oid, 'insert')
                     or has_table_privilege('authenticated', c.oid, 'update')
                     or has_table_privilege('authenticated', c.oid, 'delete')
                     or has_table_privilege('anon', c.oid, 'select'))) then
    raise exception '0705: an opening table is open to writes or to anon, or has RLS off';
  end if;
  if (select count(*) from public.fin_opening) <> 1
     or (select f.status from public.fin_opening f) <> 'draft' then
    raise exception '0705: the opening is not one draft';
  end if;
end $sanity_0705$;


-- ── sanity · the voucher, Unpaid by Supplier and the Self-check ─────────────
do $sanity_0705_pay$
declare
  v_src text;
begin
  select pg_get_functiondef('public.fin_opening_items_open(date,uuid,numeric)'::regprocedure) into v_src;
  if position('ap_opening_item_settled(p_as_at)' in v_src) = 0
     or position('''CUSTOMER_PAYMENT''' in v_src) = 0
     or position('from public.invoices i' in v_src) = 0 then
    raise exception '0705: an opening item does not take its voucher payments, or counts a deposit waiting for its invoice as credit';
  end if;
  select pg_get_functiondef('public.payment_voucher_save_draft(uuid, text, uuid, text, date, text, jsonb, jsonb, text, text, text, numeric)'::regprocedure) into v_src;
  if position('insert into public.payment_voucher_opening_allocations' in v_src) = 0
     or position('public.payment_voucher_opening_allocations where voucher_id = v_id;      -- 0705' in v_src) = 0
     or position('line_needs_description' in v_src) = 0
     or position('[^[:space:]]' in v_src) = 0 then
    raise exception '0705: a voucher draft does not keep its opening bills, or lost its own guards';
  end if;
  select pg_get_functiondef('public._payment_voucher_validate(uuid)'::regprocedure) into v_src;
  if position('opening_bill_cannot_take_payment' in v_src) = 0
     or position('from public.payment_voucher_opening_allocations o' in v_src) = 0 then
    raise exception '0705: checking a voucher does not count or check its opening bills';
  end if;
  select pg_get_functiondef('public.payment_voucher_approve(uuid)'::regprocedure) into v_src;
  if position('Pays opening bill' in v_src) = 0 or position('has_finance_approver' in v_src) = 0
     or position('separation_of_duties' in v_src) = 0 then
    raise exception '0705: approving a voucher does not post its opening bills, or lost its own rules';
  end if;
  select pg_get_functiondef('public.payment_voucher_document(uuid)'::regprocedure) into v_src;
  if position('''opening_bills''' in v_src) = 0 then
    raise exception '0705: a voucher''s page does not list its opening bills';
  end if;
  select pg_get_functiondef('public.payment_voucher_register()'::regprocedure) into v_src;
  if position('payment_voucher_opening_allocations ol' in v_src) = 0 then
    raise exception '0705: the voucher list does not name its opening bills';
  end if;
  select pg_get_functiondef('public.ap_outstanding(uuid)'::regprocedure) into v_src;
  if position('o.owing + o.db_open + o.op_rest - o.adv_open - o.cr_open' in v_src) = 0
     or position('ap_opening_item_paid()' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0705: Unpaid by Supplier does not count the opening, or lost its check';
  end if;
  select pg_get_functiondef('public.gl_receivables_reconcile()'::regprocedure) into v_src;
  if position('round(v_ledger - (v_inv - v_pay + v_open), 2)' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0705: the receivables check does not count the opening, or lost its check';
  end if;
  select pg_get_functiondef('public._fin_opening_reverse(uuid,text)'::regprocedure) into v_src;
  if position('opening_paid_by_voucher' in v_src) = 0 then
    raise exception '0705: the opening can be reversed under a voucher that pays it';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('ap_opening_item_settled', 'ap_opening_item_paid', 'ap_opening_bill_outstanding',
                                  'pv_opening_allocation_ceiling', 'payment_voucher_save_draft', '_payment_voucher_validate',
                                  'payment_voucher_approve', 'payment_voucher_document', 'payment_voucher_register',
                                  'ap_outstanding', 'gl_receivables_reconcile')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0705: a voucher or payables function lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public.ap_opening_item_settled(date)', 'execute')
     or has_function_privilege('authenticated', 'public.ap_opening_item_paid(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.pv_opening_allocation_ceiling()', 'execute')
     or has_function_privilege('anon', 'public.ap_opening_bill_outstanding(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.ap_opening_bill_outstanding(uuid)', 'execute') then
    raise exception '0705: an opening bill function is open to the wrong callers';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.payment_voucher_opening_allocations'::regclass)
     or has_table_privilege('authenticated', 'public.payment_voucher_opening_allocations', 'insert')
     or has_table_privilege('authenticated', 'public.payment_voucher_opening_allocations', 'delete')
     or has_table_privilege('anon', 'public.payment_voucher_opening_allocations', 'select') then
    raise exception '0705: the opening bill allocations are open to writes or to anon';
  end if;
  if (select count(*) from pg_trigger t
       where t.tgrelid = 'public.payment_voucher_opening_allocations'::regclass and not t.tgisinternal
         and t.tgname in ('pv_opening_allocation_ceiling_trg', 'pv_opening_allocation_only_while_draft_trg')) <> 2 then
    raise exception '0705: an opening bill allocation is not held by its ceiling and the draft-only rule';
  end if;
end $sanity_0705_pay$;

-- ── the rules, walked on this database and rolled back ───────────────────────
-- The walk runs inside one block that ends by raising P0705; the handler
-- swallows only that, so every row it wrote is rolled back, and any other
-- failure stops the migration. mig0705_refused runs one statement and answers
-- the DETAIL it was refused with (its SQLSTATE when it has none), or null
-- when it was not refused.
create or replace function pg_temp.mig0705_refused(p_sql text)
returns text
language plpgsql
as $rf$
declare
  v_detail text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return coalesce(nullif(v_detail, ''), sqlstate);
end;
$rf$;

do $walk_0705$
declare
  v_go_live date;
  v_date    date;
  v_today   date;
  v_cash    text;
  v_equity  text;
  v_retain  text;
  v_other   text;
  v_party   uuid;
  v_was     timestamptz;
  v_entry   uuid;
  v_rev     uuid;
  v_read    jsonb;
  v_open    numeric;
  v_items   jsonb;
  v_said    text;
begin
  begin
    select c.go_live_on into v_go_live from public.gl_config c where c.id;
    if v_go_live is null then
      raise exception using errcode = 'P0705', message = 'no ledger start date: nothing to walk';
    end if;
    v_date  := v_go_live - 1;
    v_today := greatest(timezone('Asia/Kuala_Lumpur', now())::date, v_go_live);
    update public.gl_config set books_closed_through = null where id;
    select r.account_code into v_retain from public.gl_account_roles r where r.role = 'RETAINED_EARNINGS';
    select min(a.code) into v_cash from public.gl_accounts a
     where a.special = 'SCH' and a.is_active and not a.is_heading and not a.is_control;
    select min(a.code) into v_other from public.gl_accounts a
     where a.is_active and a.is_control and not a.is_heading and a.kind = 'ASSET' and a.control_for = 'OTHER';
    v_equity := public.gl_account_for('OPENING_BALANCE_EQUITY');
    if v_cash is null or v_other is null or v_retain is null then
      raise exception '0705 walk: the chart has no cash account, other debtors account or retained earnings';
    end if;
    if exists (select 1 from public.gl_entries e where e.source_type = 'OPENING' and e.posted and not e.reversed) then
      raise exception '0705 walk: an opening entry already stands';
    end if;
    -- A party with no history, so its figures are this walk's alone.
    insert into public.finance_parties (name, kind) values ('0705 walk', 'company') returning id into v_party;
    select f.updated_at into v_was from public.fin_opening f where f.id;

    -- 1 · the Accounts tab refuses a control account, 160-0000 and a two-sided line.
    v_said := pg_temp.mig0705_refused(format('select public._fin_opening_accounts_save(null, %L::jsonb, %L::timestamptz)',
      jsonb_build_array(jsonb_build_object('account_code', v_other, 'debit', 1)), v_was));
    if v_said is distinct from 'opening_account_not_allowed' then
      raise exception '0705 walk: a control account on the Accounts tab was answered %', coalesce(v_said, 'not refused');
    end if;
    v_said := pg_temp.mig0705_refused(format('select public._fin_opening_accounts_save(null, %L::jsonb, %L::timestamptz)',
      jsonb_build_array(jsonb_build_object('account_code', v_equity, 'credit', 1)), v_was));
    if v_said is distinct from 'opening_account_not_allowed' then
      raise exception '0705 walk: 160-0000 on the Accounts tab was answered %', coalesce(v_said, 'not refused');
    end if;
    v_said := pg_temp.mig0705_refused(format('select public._fin_opening_accounts_save(null, %L::jsonb, %L::timestamptz)',
      jsonb_build_array(jsonb_build_object('account_code', v_cash, 'debit', 1, 'credit', 1)), v_was));
    if v_said is distinct from 'opening_account_two_sides' then
      raise exception '0705 walk: a two-sided account was answered %', coalesce(v_said, 'not refused');
    end if;

    -- 2 · out of balance: refused.
    v_was := public._fin_opening_accounts_save(null,
      jsonb_build_array(jsonb_build_object('account_code', v_cash, 'debit', 100)), v_was);
    v_said := pg_temp.mig0705_refused(format('select public._fin_opening_post(null, %L::timestamptz)', v_was));
    if v_said is distinct from 'opening_out_of_balance' then
      raise exception '0705 walk: an opening out of balance was answered %', coalesce(v_said, 'not refused');
    end if;

    -- 3 · a party whose items do not tally: total 50, items 30 and 40. The
    -- remark carries the difference; Post is still allowed.
    v_was := public._fin_opening_accounts_save(null, jsonb_build_array(
      jsonb_build_object('account_code', v_cash, 'debit', 100),
      jsonb_build_object('account_code', v_retain, 'credit', 150)), v_was);
    v_was := (public._fin_opening_party_save(null, null, 'OTHER', v_party, v_other, 50, jsonb_build_array(
      jsonb_build_object('doc_no', 'W-1', 'doc_date', v_date - 60, 'due_date', v_date - 30, 'amount', 30),
      jsonb_build_object('doc_no', 'W-2', 'doc_date', v_date - 20, 'due_date', v_date + 10, 'amount', 40)),
      v_was)->>'updated_at')::timestamptz;
    v_read := public._fin_opening_read();
    if (select (p->>'difference')::numeric from jsonb_array_elements(v_read->'parties') p
         where p->>'party_id' = v_party::text) is distinct from -20::numeric then
      raise exception '0705 walk: the party does not show its difference of RM -20.00';
    end if;
    if (v_read->'totals'->>'debit')::numeric <> 150 or (v_read->'totals'->>'credit')::numeric <> 150 then
      raise exception '0705 walk: the draft totals are not 150 and 150: %', v_read->'totals';
    end if;
    -- A stale save is refused, never merged.
    v_said := pg_temp.mig0705_refused(format('select public._fin_opening_accounts_save(null, %L::jsonb, %L::timestamptz)',
      '[]'::jsonb, v_was - interval '1 second'));
    if v_said is distinct from 'opening_changed' then
      raise exception '0705 walk: a stale save was answered %', coalesce(v_said, 'not refused');
    end if;
    -- An open item dated on go-live is refused.
    v_said := pg_temp.mig0705_refused(format(
      'select public._fin_opening_party_save(null, %L::uuid, %L, %L::uuid, %L, 50, %L::jsonb, %L::timestamptz)',
      (select p.id from public.fin_opening_parties p where p.party_id = v_party), 'OTHER', v_party, v_other,
      jsonb_build_array(jsonb_build_object('doc_no', 'W-3', 'doc_date', v_go_live, 'amount', 50)), v_was));
    if v_said is distinct from 'opening_item_date' then
      raise exception '0705 walk: an open item dated on go-live was answered %', coalesce(v_said, 'not refused');
    end if;

    -- 4 · Post: one entry, the day before go-live, the party on its control account.
    v_entry := public._fin_opening_post(null, v_was);
    if not exists (select 1 from public.gl_entries e
                    where e.id = v_entry and e.source_type = 'OPENING' and e.entry_date = v_date
                      and e.posted and not e.reversed and e.total_debit = 150 and e.total_credit = 150) then
      raise exception '0705 walk: the opening is not one entry of RM 150.00 dated %', v_date;
    end if;
    if (select coalesce(sum(l.debit - l.credit), 0) from public.gl_entry_lines l
          join public.gl_entries e on e.id = l.entry_id
         where e.posted and l.account_code = v_equity) <> 0 then
      raise exception '0705 walk: 160-0000 is not RM 0.00 after posting';
    end if;
    if not exists (select 1 from public.gl_entry_lines l
                    where l.entry_id = v_entry and l.account_code = v_other
                      and l.party_type = 'OTHER' and l.party_id = v_party and l.debit = 50) then
      raise exception '0705 walk: the party total is not on its control account with the party';
    end if;
    if (select f.status from public.fin_opening f) <> 'posted' then
      raise exception '0705 walk: the opening is not posted';
    end if;

    -- 5 · posted once: a second Post and any save are refused.
    select f.updated_at into v_was from public.fin_opening f where f.id;
    v_said := pg_temp.mig0705_refused(format('select public._fin_opening_post(null, %L::timestamptz)', v_was));
    if v_said is distinct from 'opening_already_posted' then
      raise exception '0705 walk: a second Post was answered %', coalesce(v_said, 'not refused');
    end if;
    v_said := pg_temp.mig0705_refused(format('select public._fin_opening_accounts_save(null, %L::jsonb, %L::timestamptz)',
      '[]'::jsonb, v_was));
    if v_said is distinct from 'opening_posted' then
      raise exception '0705 walk: a save on the posted opening was answered %', coalesce(v_said, 'not refused');
    end if;

    -- 6 · the day before go-live is the opening's alone.
    v_said := pg_temp.mig0705_refused(format(
      'select public.gl_post(%L, %L, %L::date, %L, %L::jsonb)', 'IT_0705', 'IT-0705', v_date, 'IT 0705',
      jsonb_build_array(jsonb_build_object('account_code', v_cash, 'debit', 1),
                        jsonb_build_object('account_code', v_retain, 'credit', 1))));
    if v_said is distinct from 'gl_post_entry_date_before_go_live' then
      raise exception '0705 walk: another entry on the day before go-live was answered %', coalesce(v_said, 'not refused');
    end if;
    v_said := pg_temp.mig0705_refused(format(
      'select public.gl_post(%L, %L, %L::date, %L, %L::jsonb)', 'OPENING', 'IT-0705-EARLY', v_date - 1, 'IT 0705',
      jsonb_build_array(jsonb_build_object('account_code', v_cash, 'debit', 1),
                        jsonb_build_object('account_code', v_retain, 'credit', 1))));
    if v_said is distinct from 'gl_post_entry_date_before_go_live' then
      raise exception '0705 walk: an opening two days before go-live was answered %', coalesce(v_said, 'not refused');
    end if;

    -- 7 · the items age; money received since is set against the oldest first.
    select coalesce(sum(o.open), 0) into v_open
      from public.fin_opening_parties p
      cross join lateral public.fin_opening_items_open(v_today, p.id, 0) o
     where p.party_id = v_party;
    if v_open <> 70 then
      raise exception '0705 walk: the opening items are open for %, not RM 70.00', v_open;
    end if;
    perform public.gl_post('IT_0705', 'IT-0705-RECEIPT', v_today, 'IT 0705', jsonb_build_array(
      jsonb_build_object('account_code', v_cash, 'debit', 35),
      jsonb_build_object('account_code', v_other, 'credit', 35, 'party_type', 'OTHER', 'party_id', v_party)));
    select jsonb_agg(jsonb_build_array(o.doc_no, o.open) order by o.doc_no) into v_items
      from public.fin_opening_parties p
      cross join lateral public.fin_opening_items_open(v_today, p.id, 0) o
     where p.party_id = v_party;
    if v_items is distinct from '[["W-1", 0], ["W-2", 35]]'::jsonb then
      raise exception '0705 walk: RM 35.00 received is not set against the oldest item first: %', v_items;
    end if;

    -- 8 · Reverse: refused with no reason or once the month is closed; then back to draft.
    v_said := pg_temp.mig0705_refused('select public._fin_opening_reverse(null, ''  '')');
    if v_said is distinct from 'opening_reason_blank' then
      raise exception '0705 walk: a reverse with no reason was answered %', coalesce(v_said, 'not refused');
    end if;
    update public.gl_config set books_closed_through = v_date where id;
    v_said := pg_temp.mig0705_refused('select public._fin_opening_reverse(null, ''IT 0705'')');
    if v_said is distinct from 'books_closed' then
      raise exception '0705 walk: a reverse in a closed month was answered %', coalesce(v_said, 'not refused');
    end if;
    update public.gl_config set books_closed_through = null where id;
    v_rev := public._fin_opening_reverse(null, 'IT 0705');
    if (select f.status from public.fin_opening f) <> 'draft'
       or (select f.entry_id from public.fin_opening f) is not null
       or not (select e.reversed from public.gl_entries e where e.id = v_entry)
       or not exists (select 1 from public.gl_entries e
                       where e.id = v_rev and e.source_type = 'OPENING_REVERSAL' and e.entry_date = v_date) then
      raise exception '0705 walk: the reverse did not return the opening to draft with its contra';
    end if;
    if exists (select 1 from public.fin_opening_parties p
                cross join lateral public.fin_opening_items_open(v_today, p.id, 0) o
               where p.party_id = v_party) then
      raise exception '0705 walk: a reversed opening still ages';
    end if;

    -- 9 · and it posts again, one standing at a time.
    select f.updated_at into v_was from public.fin_opening f where f.id;
    perform public._fin_opening_post(null, v_was);
    if (select count(*) from public.gl_entries e where e.source_type = 'OPENING' and e.posted and not e.reversed) <> 1 then
      raise exception '0705 walk: more than one opening entry stands';
    end if;

    raise exception using errcode = 'P0705', message = 'walk done';
  exception when sqlstate 'P0705' then
    null;
  end;
end $walk_0705$;

commit;
