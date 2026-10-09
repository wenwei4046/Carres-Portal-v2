-- =============================================================================
-- 0666_a_dealer_commission_month_closes_by_itself.sql
-- =============================================================================
-- THE RULING (Chew and management 2026-10-05 to 2026-10-07; Chew 2026-10-09;
--   docs/finance/MASTER.md §3.2, final-check rules 2.7, 6.4, 9.1, 9.2; build
--   step 4b, 「可以，开始做第4步」):
--   - Each month a draft payment voucher is raised automatically; the dealer is
--     paid on the 15th of the month after (9.2). One payment per dealer per
--     month: commission, rebate and KPI allowance, less what is taken back (9.1).
--   - At month end the commission is accrued: Dr 900-C007 Commission - Dealer,
--     Cr 410-0061 Accruals - Commission Dealer (Chew 2026-10-06); the rebate to
--     900-C008 / 410-0064 and the KPI allowance to 900-C009 / 410-0065 (Chew
--     2026-10-09, 「可以」). The voucher clears each accrual it pays.
--   - A month that has been paid never changes; an amendment is worked out again
--     and the difference lands in the month of the change (2.7, 6.4).
--   - The draft names no bank: Finance picks it (「到时我才manual set」, Chew
--     2026-10-09). A voucher with no bank cannot be prepared.
--   - The accrual is dated the month's last day. If the books are already
--     closed through it, the first day still open (the ledger refuses a closed
--     month, and a close that failed every day would raise no voucher).
--
-- WHAT THIS ADDS
--   1. Six account roles (0554: no account number inside a function).
--   2. payment_vouchers.pay_from_account_code may be empty on a draft (or a
--      cancelled draft); _payment_voucher_validate already refuses to prepare
--      one without it. A voucher's history may say the month close raised it
--      (ap_document_events action month_close).
--   3. dealer_commission_closes / _close_dealers / _close_orders: each closed
--      month, what each dealer was charged for it, and each order's commission
--      earned by its end when it closed.
--   4. The cron's three doors (service role only): dealer_commission_close_due
--      (the next month to close), dealer_commission_close_read (what the shared
--      arithmetic needs) and dealer_commission_close (keeps the figures, posts
--      the accrual, raises each dealer's draft voucher dated the 15th and counts
--      it on the dealer's statement). The arithmetic stays in
--      packages/shared/src/dealer-commission.ts (closeFigures): the Worker
--      works the month out, this file keeps what it was told.
--   5. dealer_commission_source and dealer_commission_statement carry the
--      closes, so a closed month shows what was charged.
--
-- RLS: the three tables are read by Finance (gl_may_read) and written only by
--   dealer_commission_close. A dealer reads its own closes through its
--   statement. DATA: six account roles. DR/CR: the accrual, when a month closes.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · the accounts a close posts to ────────────────────────────────────────
insert into public.gl_account_roles (role, account_code)
values ('DEALER_COMMISSION',         '900-C007'),
       ('DEALER_COMMISSION_ACCRUED', '410-0061'),
       ('RENOVATION_REBATE',         '900-C008'),
       ('RENOVATION_REBATE_ACCRUED', '410-0064'),
       ('KPI_ALLOWANCE',             '900-C009'),
       ('KPI_ALLOWANCE_ACCRUED',     '410-0065')
on conflict (role) do nothing;

-- ── 2 · a draft voucher may wait for its bank ────────────────────────────────
alter table public.payment_vouchers alter column pay_from_account_code drop not null;

alter table public.payment_vouchers drop constraint if exists payment_vouchers_paid_from_an_account;
alter table public.payment_vouchers add constraint payment_vouchers_paid_from_an_account
  check (pay_from_account_code is not null or status in ('draft', 'cancelled'));

comment on column public.payment_vouchers.pay_from_account_code is
  '0666: the account the money leaves from. A draft raised by the system (a dealer''s commission) waits for Finance to pick it; a voucher cannot be prepared without it.';

-- Its history says the month close raised it, not a person.
alter table public.ap_document_events drop constraint if exists ap_document_events_action_check;
alter table public.ap_document_events add constraint ap_document_events_action_check
  check (action = any (array['created', 'edited', 'confirmed', 'prepared', 'checked', 'approved', 'rejected',
                             'cancelled', 'file_added', 'advance_applied', 'advance_taken_off', 'money_back',
                             'money_back_cancelled', 'credit_applied', 'credit_taken_off', 'month_close']));

-- ── 3 · the closed months ────────────────────────────────────────────────────
create table if not exists public.dealer_commission_closes (
  month        date primary key check (month = date_trunc('month', month)::date),
  closed_at    timestamptz not null default now(),
  gl_entry_id  uuid references public.gl_entries(id)
);

create table if not exists public.dealer_commission_close_dealers (
  month       date not null references public.dealer_commission_closes(month),
  dealer_id   uuid not null references public.dealers(id),
  commission  numeric(12,2) not null,
  rebate      numeric(12,2) not null,
  kpi         numeric(12,2) not null,
  kpi_units   integer not null default 0,
  voucher_id  uuid references public.payment_vouchers(id),
  primary key (month, dealer_id)
);

create table if not exists public.dealer_commission_close_orders (
  month           date not null references public.dealer_commission_closes(month),
  order_id        uuid not null references public.orders(id),
  dealer_id       uuid not null references public.dealers(id),
  earned_through  numeric(12,2) not null,
  primary key (month, order_id)
);

comment on table public.dealer_commission_closes is
  '0666: a dealer commission month that has closed (by itself, on the 1st). It never changes again; later differences land in the first month still open.';
comment on table public.dealer_commission_close_dealers is
  '0666: what each dealer was charged for a closed month: commission, renovation rebate and KPI allowance, as the shared arithmetic worked them out, and the draft voucher raised for it.';
comment on table public.dealer_commission_close_orders is
  '0666: each order''s commission earned by a closed month''s end, as it stood when the month closed. An order not listed had earned nothing.';

alter table public.dealer_commission_closes enable row level security;
alter table public.dealer_commission_close_dealers enable row level security;
alter table public.dealer_commission_close_orders enable row level security;

drop policy if exists dealer_commission_closes_finance_read on public.dealer_commission_closes;
create policy dealer_commission_closes_finance_read on public.dealer_commission_closes
  for select using ((select public.gl_may_read()));
drop policy if exists dealer_commission_close_dealers_finance_read on public.dealer_commission_close_dealers;
create policy dealer_commission_close_dealers_finance_read on public.dealer_commission_close_dealers
  for select using ((select public.gl_may_read()));
drop policy if exists dealer_commission_close_orders_finance_read on public.dealer_commission_close_orders;
create policy dealer_commission_close_orders_finance_read on public.dealer_commission_close_orders
  for select using ((select public.gl_may_read()));

revoke all on public.dealer_commission_closes, public.dealer_commission_close_dealers,
              public.dealer_commission_close_orders from anon;
revoke insert, update, delete on public.dealer_commission_closes, public.dealer_commission_close_dealers,
              public.dealer_commission_close_orders from authenticated;

-- The closes as the arithmetic reads them: every closed month's charges, and
-- the orders' figures only for the months a read needs (the month asked, the
-- month before it and the last close before it; with no month, the last close).
create or replace function public._dealer_commission_closes_json(p_dealer_id uuid, p_month date)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $fn$
  with wanted as (
    select date_trunc('month', p_month)::date as m where p_month is not null
    union
    select (date_trunc('month', p_month) - interval '1 month')::date where p_month is not null
    union
    select max(c.month) from public.dealer_commission_closes c
     where p_month is null or c.month < date_trunc('month', p_month)::date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(c.month, 'YYYY-MM'),
           'closedOn', (c.closed_at at time zone 'Asia/Kuala_Lumpur')::date,
           'dealers', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'dealerId', d.dealer_id, 'commission', d.commission, 'rebate', d.rebate,
                      'kpi', d.kpi, 'kpiUnits', d.kpi_units) order by d.dealer_id)
               from public.dealer_commission_close_dealers d
              where d.month = c.month and (p_dealer_id is null or d.dealer_id = p_dealer_id)), '[]'::jsonb),
           'orders', case when c.month in (select w.m from wanted w where w.m is not null) then coalesce((
             select jsonb_agg(jsonb_build_object('orderId', o.order_id, 'earnedThrough', o.earned_through))
               from public.dealer_commission_close_orders o
              where o.month = c.month and (p_dealer_id is null or o.dealer_id = p_dealer_id)), '[]'::jsonb) end)
         order by c.month), '[]'::jsonb)
    from public.dealer_commission_closes c;
$fn$;

revoke all on function public._dealer_commission_closes_json(uuid, date) from public, anon, authenticated;

-- ── 4 · the cron's doors ─────────────────────────────────────────────────────
-- The next month to close: the month after the last one closed, or the month
-- of the first dealer order; never the month in progress (Malaysia).
create or replace function public.dealer_commission_close_due()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with nxt as (
    select coalesce(
             (select (max(c.month) + interval '1 month')::date from public.dealer_commission_closes c),
             (select date_trunc('month', min(ord.placed_at at time zone 'Asia/Kuala_Lumpur'))::date
                from public.orders ord
                join public.dealers d on d.id = ord.dealer_id and d.channel = 'dealer')) as m
  )
  select case when nxt.m < date_trunc('month', (now() at time zone 'Asia/Kuala_Lumpur'))::date then nxt.m end
    from nxt;
$fn$;

-- What the shared arithmetic needs to close a month: every dealer order placed
-- by its end, the rebates, the KPI rules and the closes so far.
create or replace function public.dealer_commission_close_read(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if v_month is null then
    raise exception 'Choose the month to close.' using errcode = '22023', detail = 'month_required';
  end if;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'settings', jsonb_build_object('defaultRate', 0),
    'rates', '[]'::jsonb, 'models', '[]'::jsonb, 'outlets', '[]'::jsonb,
    'dealers', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
        from public.dealers d where d.channel = 'dealer'), '[]'::jsonb),
    'quotas', coalesce((
      select jsonb_agg(jsonb_build_object('dealerId', q.dealer_id, 'quota', q.quota,
                                          'rebateRate', q.rebate_rate, 'startsOn', q.starts_on))
        from public.dealer_rebate_quotas q), '[]'::jsonb),
    'kpi', public._dealer_kpi_rules_json(),
    'closes', public._dealer_commission_closes_json(null, v_month),
    'orders', public._dealer_commission_orders(null, (v_month + interval '1 month')::date));
end;
$fn$;

-- Keeps what the shared arithmetic worked out for the month due, posts the
-- accrual once the ledger runs, and raises each dealer's draft voucher.
create or replace function public.dealer_commission_close(p_month date, p_dealers jsonb, p_orders jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_month    date := date_trunc('month', p_month)::date;
  v_end      date := (date_trunc('month', p_month) + interval '1 month' - interval '1 day')::date;
  v_pay_on   date := (date_trunc('month', p_month) + interval '1 month' + interval '14 days')::date;
  v_go_live  date := (select c.go_live_on from public.gl_config c where c.id);
  v_books    date := (select c.books_closed_through from public.gl_config c where c.id);
  v_due      date := public.dealer_commission_close_due();
  v_word     text := to_char(date_trunc('month', p_month), 'FMMonth YYYY');
  v_lines    jsonb := '[]'::jsonb;
  v_entry    uuid;
  v_r        record;
  v_k        record;
  v_charged  numeric(12,2)[];
  v_paid     numeric(12,2)[];
  v_paid_all numeric(12,2);
  v_net      numeric(12,2);
  v_take     numeric(12,2);
  v_left     numeric(12,2);
  v_vlines   jsonb;
  v_n        integer;
  v_voucher  uuid;
  v_vouchers integer := 0;
  v_kinds    text[] := array['commission', 'rebate', 'kpi'];
  v_expense  text[] := array['DEALER_COMMISSION', 'RENOVATION_REBATE', 'KPI_ALLOWANCE'];
  v_accrued  text[] := array['DEALER_COMMISSION_ACCRUED', 'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE_ACCRUED'];
  v_what     text[] := array['Commission', 'Renovation rebate', 'KPI allowance'];
  v_amount   numeric(12,2);
  i          integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('dealer_commission_close', 0));
  if v_month is null then
    raise exception 'Choose the month to close.' using errcode = '22023', detail = 'month_required';
  end if;
  if exists (select 1 from public.dealer_commission_closes c where c.month = v_month) then
    return jsonb_build_object('month', to_char(v_month, 'YYYY-MM'), 'already', true);
  end if;
  if v_due is distinct from v_month then
    raise exception '% cannot close: %.', v_word,
      coalesce('close ' || to_char(v_due, 'FMMonth YYYY') || ' first', 'no month is due to close')
      using errcode = '22023', detail = 'not_the_month_due';
  end if;
  if p_dealers is null or jsonb_typeof(p_dealers) <> 'array' or p_orders is null or jsonb_typeof(p_orders) <> 'array' then
    raise exception 'The figures to keep are not readable.' using errcode = '22023', detail = 'bad_figures';
  end if;

  insert into public.dealer_commission_closes (month) values (v_month);
  insert into public.dealer_commission_close_dealers (month, dealer_id, commission, rebate, kpi, kpi_units)
  select v_month, (x ->> 'dealerId')::uuid,
         round(coalesce((x ->> 'commission')::numeric, 0), 2), round(coalesce((x ->> 'rebate')::numeric, 0), 2),
         round(coalesce((x ->> 'kpi')::numeric, 0), 2), coalesce((x ->> 'kpiUnits')::integer, 0)
    from jsonb_array_elements(p_dealers) x;
  if exists (select 1 from public.dealer_commission_close_dealers cd
               join public.dealers d on d.id = cd.dealer_id
              where cd.month = v_month and d.channel <> 'dealer') then
    raise exception 'Only dealers earn dealer commission.' using errcode = '22023', detail = 'not_a_dealer';
  end if;
  insert into public.dealer_commission_close_orders (month, order_id, dealer_id, earned_through)
  select v_month, (x ->> 'orderId')::uuid, (x ->> 'dealerId')::uuid, round((x ->> 'earnedThrough')::numeric, 2)
    from jsonb_array_elements(p_orders) x;

  -- The accrual, at the month's end, once the ledger runs: each dealer's
  -- commission, rebate and KPI allowance against its accrual (a month taken
  -- back is the other way round).
  if v_go_live is not null and v_end >= v_go_live then
    for v_r in select cd.*, d.name from public.dealer_commission_close_dealers cd
                 join public.dealers d on d.id = cd.dealer_id
                where cd.month = v_month order by d.name loop
      for i in 1 .. 3 loop
        v_amount := case i when 1 then v_r.commission when 2 then v_r.rebate else v_r.kpi end;
        continue when v_amount = 0;
        v_lines := v_lines || jsonb_build_array(
          jsonb_build_object('account_code', public.gl_account_for(v_expense[i]),
                             case when v_amount > 0 then 'debit' else 'credit' end, abs(v_amount),
                             'department_type', 'DEALER', 'department_id', v_r.dealer_id,
                             'memo', v_what[i] || ' ' || v_word || ' · ' || v_r.name),
          jsonb_build_object('account_code', public.gl_account_for(v_accrued[i]),
                             case when v_amount > 0 then 'credit' else 'debit' end, abs(v_amount),
                             'department_type', 'DEALER', 'department_id', v_r.dealer_id,
                             'memo', v_what[i] || ' ' || v_word || ' · ' || v_r.name));
      end loop;
    end loop;
    if jsonb_array_length(v_lines) > 0 then
      -- The month's last day, or the first day still open when the books
      -- are closed through it (greatest() passes over a null).
      v_entry := public.gl_post('DEALER_COMMISSION', 'DC-' || to_char(v_month, 'YYYY-MM'),
                                greatest(v_end, v_books + 1), 'Dealer commission ' || v_word, v_lines);
      update public.dealer_commission_closes set gl_entry_id = v_entry where month = v_month;
    end if;

    -- Each dealer's draft voucher on the 15th of the month after: what Carres
    -- owes it (every posted month's charges, less every voucher already counted
    -- for it; a cancelled one does not count), one line per accrual it clears.
    -- The bank is left for Finance.
    if v_pay_on >= v_go_live then
      for v_r in select cd.dealer_id, d.name from public.dealer_commission_close_dealers cd
                   join public.dealers d on d.id = cd.dealer_id
                  where cd.month = v_month order by d.name loop
        select array[coalesce(sum(cd.commission), 0), coalesce(sum(cd.rebate), 0), coalesce(sum(cd.kpi), 0)]
          into v_charged
          from public.dealer_commission_close_dealers cd
         where cd.dealer_id = v_r.dealer_id
           and (cd.month + interval '1 month' - interval '1 day')::date >= v_go_live;
        select coalesce(sum(v.amount), 0) into v_paid_all
          from public.dealer_commission_payments p
          join public.payment_vouchers v on v.id = p.voucher_id
         where p.dealer_id = v_r.dealer_id and p.unlinked_at is null and v.status <> 'cancelled';
        select array[
                 coalesce(sum(l.amount) filter (where l.account_code = public.gl_account_for(v_accrued[1])), 0),
                 coalesce(sum(l.amount) filter (where l.account_code = public.gl_account_for(v_accrued[2])), 0),
                 coalesce(sum(l.amount) filter (where l.account_code = public.gl_account_for(v_accrued[3])), 0)]
          into v_paid
          from public.dealer_commission_payments p
          join public.payment_vouchers v on v.id = p.voucher_id
          join public.payment_voucher_lines l on l.voucher_id = v.id
         where p.dealer_id = v_r.dealer_id and p.unlinked_at is null and v.status <> 'cancelled';
        v_net := v_charged[1] + v_charged[2] + v_charged[3] - v_paid_all;
        continue when v_net <= 0;

        v_vlines := '[]'::jsonb;
        v_left := v_net;
        for i in 1 .. 3 loop
          v_take := least(v_left, greatest(v_charged[i] - v_paid[i], 0));
          continue when v_take <= 0;
          v_vlines := v_vlines || jsonb_build_array(jsonb_build_object('kind', i, 'amount', v_take));
          v_left := v_left - v_take;
        end loop;
        -- Paid otherwise before (a voucher on other accounts): the rest clears commission.
        if v_left > 0 then
          v_vlines := v_vlines || jsonb_build_array(jsonb_build_object('kind', 1, 'amount', v_left));
        end if;

        insert into public.payment_vouchers
          (purpose, supplier_id, payee_name, voucher_date, amount, advance_amount, ap_account_code,
           pay_method, pay_reference, pay_from_account_code, narration, status, created_by)
        values
          ('DIRECT', null, v_r.name, v_pay_on, v_net, 0, null,
           'BANK_TRANSFER', null, null, 'Dealer commission ' || v_word, 'draft', null)
        returning id into v_voucher;
        v_n := 0;
        for v_k in select (x ->> 'kind')::integer as kind, sum((x ->> 'amount')::numeric) as amount
                     from jsonb_array_elements(v_vlines) x group by 1 order by 1 loop
          v_n := v_n + 1;
          insert into public.payment_voucher_lines
            (voucher_id, line_no, account_code, description, amount, department_type, department_id)
          values (v_voucher, v_n, public.gl_account_for(v_accrued[v_k.kind]),
                  v_what[v_k.kind] || ' ' || v_word, round(v_k.amount, 2), 'DEALER', v_r.dealer_id);
        end loop;
        insert into public.dealer_commission_payments (dealer_id, voucher_id, linked_by)
        values (v_r.dealer_id, v_voucher, null);
        update public.dealer_commission_close_dealers set voucher_id = v_voucher
         where month = v_month and dealer_id = v_r.dealer_id;
        perform public._ap_event('PAYMENT_VOUCHER', v_voucher, 'month_close', 'Dealer commission ' || v_word);
        v_vouchers := v_vouchers + 1;
      end loop;
    end if;
  end if;

  return jsonb_build_object('month', to_char(v_month, 'YYYY-MM'), 'already', false,
                            'posted', v_entry is not null, 'vouchers', v_vouchers);
end;
$fn$;

revoke all on function public.dealer_commission_close_due() from public, anon, authenticated;
revoke all on function public.dealer_commission_close_read(date) from public, anon, authenticated;
revoke all on function public.dealer_commission_close(date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.dealer_commission_close_due() to service_role;
grant execute on function public.dealer_commission_close_read(date) to service_role;
grant execute on function public.dealer_commission_close(date, jsonb, jsonb) to service_role;

comment on table public.dealer_commission_payments is
  '0664/0666: a payment voucher counted as a payment to a dealer on its commission statement: linked by Finance once paid, or by the month close when it raises the dealer''s draft. It counts on the statement once approved. Taking it off keeps the row (unlinked_at). Written only by dealer_commission_payment_link / _unlink and dealer_commission_close.';

-- ── 5 · the report's read and the statement carry the closes ────────────────
create or replace function pg_temp.mig0666_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0666: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

select pg_temp.mig0666_rewrite('public.dealer_commission_source(date)'::regprocedure,
$old$'kpi', public._dealer_kpi_rules_json(),   -- 0665$old$,
$new$'kpi', public._dealer_kpi_rules_json(),   -- 0665
    'closes', public._dealer_commission_closes_json(null, p_month),   -- 0666$new$);

select pg_temp.mig0666_rewrite('public.dealer_commission_statement(uuid)'::regprocedure,
$old$'kpi', public._dealer_kpi_rules_json(),   -- 0665$old$,
$new$'kpi', public._dealer_kpi_rules_json(),   -- 0665
    'closes', public._dealer_commission_closes_json(v_dealer, null),   -- 0666$new$);

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  select pg_get_functiondef('public.dealer_commission_source(date)'::regprocedure) into v_src;
  if position('_dealer_commission_closes_json(null, p_month)' in v_src) = 0 or position('gl_may_read' in v_src) = 0 then
    raise exception '0666: dealer_commission_source does not carry the closes, or lost its check';
  end if;
  select pg_get_functiondef('public.dealer_commission_statement(uuid)'::regprocedure) into v_src;
  if position('_dealer_commission_closes_json(v_dealer, null)' in v_src) = 0 or position('app_dealer_id()' in v_src) = 0 then
    raise exception '0666: dealer_commission_statement does not carry the closes, or lost its own-dealer check';
  end if;
  if (select count(*) from public.gl_account_roles
       where role in ('DEALER_COMMISSION', 'DEALER_COMMISSION_ACCRUED', 'RENOVATION_REBATE',
                      'RENOVATION_REBATE_ACCRUED', 'KPI_ALLOWANCE', 'KPI_ALLOWANCE_ACCRUED')) <> 6 then
    raise exception '0666: an account role for the dealer accrual is missing';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payment_vouchers'
                and column_name = 'pay_from_account_code' and is_nullable = 'NO') then
    raise exception '0666: a draft voucher still needs its bank';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and p.proname in ('dealer_commission_close_due', 'dealer_commission_close_read', 'dealer_commission_close',
                                  'dealer_commission_source', 'dealer_commission_statement')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0666: a door or read lost security definer or its search_path';
  end if;
  if has_function_privilege('authenticated', 'public.dealer_commission_close(date, jsonb, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.dealer_commission_close(date, jsonb, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.dealer_commission_close_read(date)', 'execute')
     or has_function_privilege('authenticated', 'public.dealer_commission_close_due()', 'execute')
     or has_function_privilege('authenticated', 'public._dealer_commission_closes_json(uuid, date)', 'execute')
     or not has_function_privilege('service_role', 'public.dealer_commission_close(date, jsonb, jsonb)', 'execute') then
    raise exception '0666: a close door has the wrong callers';
  end if;
  if has_table_privilege('authenticated', 'public.dealer_commission_closes', 'insert')
     or has_table_privilege('authenticated', 'public.dealer_commission_close_dealers', 'update')
     or has_table_privilege('authenticated', 'public.dealer_commission_close_orders', 'delete') then
    raise exception '0666: a closed month can be written around its door';
  end if;
end $sanity$;

commit;
