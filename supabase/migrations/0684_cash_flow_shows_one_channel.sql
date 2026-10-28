-- =============================================================================
-- 0684_cash_flow_shows_one_channel.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-06, docs/finance/MASTER.md §0 ruling 1, 「现金留要能
--   分起来」; the plan "Splitting the money by channel" step 2, approved
--   2026-10-12 「分渠道做」): cash flow is split by channel.
--
-- WHAT THIS CHANGES
--   1. _fin_cash_flow_shares(from, to): every share of a period's cash and bank
--      money, as Cash Flow has shared it since 0638 (each money line across the
--      same entry's lines on the other side, in proportion, in whole sen, the
--      largest remainders taking the odd sen), now with the channel each share
--      went to. A share is split again, the same way, across:
--        - a supplier payment's bills and debit notes: the channels of their
--          lines, weighted by the amount the voucher applied to each; an
--          advance by the bills it was later knocked off, the rest of it in
--          no channel;
--        - a card payout made through Card settlement: the orders of the card
--          payments in it;
--        - anything else: the line's own department, or the one reports already
--          work out from its order (gl_line_departments).
--      A share tied to no channel keeps none: a transfer between Carres's own
--      accounts, a supplier advance not knocked off a bill yet, a card payout
--      made by hand, a bank charge.
--   2. fin_cash_flow(from, to, department type, department id): the rows now
--      come from those shares, one arithmetic. With no department the answer is
--      what it was. With one, the rows, each account's money in and out, and
--      the card money customers paid are that channel's only; brought forward
--      is 0 (balances are not split by channel) and the card money still
--      waiting is left out.
--
-- RLS: none new. Both functions ask gl_may_read() (Finance or principal).
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

set local search_path = public, pg_temp;

-- ── 1 · Every share of the period's cash and bank money, with its channel ───
create or replace function public._fin_cash_flow_shares(p_from date, p_to date)
returns table (account_code text, is_in boolean, other_code text,
               department_type text, department_id uuid, sen numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with money as (
    select m.account_code as code
      from public.gl_money_accounts m
     where m.money_kind in ('CASH', 'BANK')
       and not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  holding as (
    select m.account_code as code
      from public.gl_money_accounts m
     where m.money_kind = 'HOLDING'
       and not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  payables as (
    select a.code
      from public.gl_accounts a
     where a.is_control and a.control_for = 'SUPPLIER' and a.kind = 'LIABILITY'
  ),
  legs as (
    select l.entry_id, l.line_no, l.account_code, (l.debit > 0) as is_in, (l.debit + l.credit) as amount
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date between p_from and p_to
       and l.account_code in (select code from money)
  ),
  against as (
    -- A line on the other side of the same entry: a credit against money in,
    -- a debit against money out (0638).
    select g.entry_id, g.line_no as leg_no, g.account_code as leg_code, g.is_in, g.amount as leg_amount,
           o.id as other_id, o.line_no as other_no, o.account_code as other_code,
           (o.debit + o.credit) as other_amount,
           sum(o.debit + o.credit) over (partition by g.entry_id, g.line_no) as other_total
      from legs g
      join public.gl_entry_lines o
        on o.entry_id = g.entry_id
       and ((g.is_in and o.credit > 0) or (not g.is_in and o.debit > 0))
  ),
  sized as (
    select a.*,
           (a.leg_amount * 100) * a.other_amount / a.other_total        as exact_sen,
           floor((a.leg_amount * 100) * a.other_amount / a.other_total) as base_sen
      from against a
  ),
  ranked as (
    select s.*,
           round(s.leg_amount * 100) - sum(s.base_sen) over (partition by s.entry_id, s.leg_no) as leftover,
           row_number() over (partition by s.entry_id, s.leg_no
                              order by s.exact_sen - s.base_sen desc, s.other_amount desc, s.other_no) as rk
      from sized s
  ),
  shares as (
    select r.entry_id, r.leg_no, r.leg_code, r.is_in, r.other_id, r.other_code,
           r.base_sen + case when r.rk <= r.leftover then 1 else 0 end as share_sen
      from ranked r
  ),
  others as (
    select distinct sh.entry_id, sh.other_id, sh.other_code from shares sh
  ),
  -- A supplier payment: the channels of the bills and debit notes it paid, and
  -- of the bills its advance was later knocked off; the rest of an advance, not
  -- knocked off yet, is in no channel.
  vouchers as (
    select distinct o.other_id, v.id as voucher_id, v.gl_entry_id
      from others o
      join public.payment_vouchers v on o.entry_id in (v.gl_entry_id, v.reversal_entry_id)
     where o.other_code in (select code from payables)
  ),
  v_parts as (
    select vo.other_id, bl.department_type as dt, bl.department_id as di,
           a.amount_applied * bl.amount / b.total_amount as w
      from vouchers vo
      join public.payment_voucher_allocations a on a.voucher_id = vo.voucher_id
      join public.supplier_bills b on b.id = a.bill_id and b.total_amount > 0
      join public.supplier_bill_lines bl on bl.bill_id = b.id
    union all
    select vo.other_id, nl.department_type, nl.department_id,
           a.amount_applied * nl.amount / n.total_amount
      from vouchers vo
      join public.payment_voucher_debit_note_allocations a on a.voucher_id = vo.voucher_id
      join public.supplier_debit_notes n on n.id = a.debit_note_id and n.total_amount > 0
      join public.supplier_debit_note_lines nl on nl.note_id = n.id
    union all
    select vo.other_id, bl.department_type, bl.department_id,
           ap.amount * bl.amount / b.total_amount
      from vouchers vo
      join public.supplier_advance_applications ap on ap.voucher_id = vo.voucher_id and ap.status <> 'cancelled'
      join public.supplier_bills b on b.id = ap.bill_id and b.total_amount > 0
      join public.supplier_bill_lines bl on bl.bill_id = b.id
  ),
  v_rest as (
    -- What the voucher put on its suppliers' accounts, less what the parts name.
    select vo.other_id, null::text as dt, null::uuid as di,
           coalesce((select sum(l.debit) from public.gl_entry_lines l
                      where l.entry_id = vo.gl_entry_id
                        and l.account_code in (select code from payables)), 0)
           - coalesce((select sum(p.w) from v_parts p where p.other_id = vo.other_id), 0) as w
      from vouchers vo
  ),
  w_voucher as (
    select x.other_id, x.dt, x.di, sum(x.w) as w
      from (select * from v_parts union all select * from v_rest) x
     group by x.other_id, x.dt, x.di
    having sum(x.w) > 0
  ),
  -- A card payout made through Card settlement: the orders of its payments.
  w_card as (
    select o.other_id, c.department_type as dt, c.department_id as di, sum(cl.amount) as w
      from others o
      join public.gl_money_moves m
        on o.entry_id in (m.gl_entry_id, m.reversal_entry_id) and m.kind = 'CARD_PAYOUT'
      join public.card_settlement_payouts p on p.move_id = m.id
      join public.card_settlement_lines cl
        on cl.acquirer = p.acquirer and cl.day_date = p.day_date and cl.group_key = p.group_key
       and cl.payment_id is not null
      join public.order_payments op on op.id = cl.payment_id
      join public.fin_order_channels c on c.order_id = op.order_id
     where o.other_code in (select code from holding)
     group by o.other_id, c.department_type, c.department_id
    having sum(cl.amount) > 0
  ),
  -- Anything else: the line's own department, or the one worked out from its order.
  w_line as (
    select o.other_id, d.department_type as dt, d.department_id as di, 1::numeric as w
      from others o
      join public.gl_line_departments d on d.line_id = o.other_id
     where o.other_code not in (select code from money)
       and not exists (select 1 from w_voucher v where v.other_id = o.other_id)
       and not exists (select 1 from w_card c where c.other_id = o.other_id)
  ),
  weights as (
    select * from w_voucher
    union all select * from w_card
    union all select * from w_line
  ),
  split as (
    select sh.entry_id, sh.leg_no, sh.leg_code, sh.is_in, sh.other_id, sh.other_code, sh.share_sen,
           w.dt, w.di, w.w,
           sum(w.w) over (partition by sh.entry_id, sh.leg_no, sh.other_id) as w_total
      from shares sh
      join weights w on w.other_id = sh.other_id
  ),
  split_sized as (
    select sp.*,
           sp.share_sen * sp.w / sp.w_total        as exact_sen,
           floor(sp.share_sen * sp.w / sp.w_total) as base_sen
      from split sp
  ),
  split_ranked as (
    select ss.*,
           ss.share_sen - sum(ss.base_sen) over (partition by ss.entry_id, ss.leg_no, ss.other_id) as leftover,
           row_number() over (partition by ss.entry_id, ss.leg_no, ss.other_id
                              order by ss.exact_sen - ss.base_sen desc, ss.w desc, ss.dt, ss.di::text) as rk
      from split_sized ss
  )
  select sr.leg_code, sr.is_in, sr.other_code, sr.dt, sr.di,
         sr.base_sen + case when sr.rk <= sr.leftover then 1 else 0 end
    from split_ranked sr
  union all
  -- A share no channel takes.
  select sh.leg_code, sh.is_in, sh.other_code, null::text, null::uuid, sh.share_sen
    from shares sh
   where not exists (select 1 from weights w where w.other_id = sh.other_id);
$fn$;
revoke all on function public._fin_cash_flow_shares(date, date) from public, anon, authenticated;
comment on function public._fin_cash_flow_shares(date, date) is
  '0684 (Chew ruling 1): every share of a period''s cash and bank money (shared as since 0638) with the channel it went to: a supplier payment by its bills'' and debit notes'' lines, a settled card payout by its payments'' orders, else the line''s own or derived department. Read by fin_cash_flow only.';

-- ── 2 · Cash Flow, for every channel or one ─────────────────────────────────
drop function public.fin_cash_flow(date, date);

create function public.fin_cash_flow(p_from date, p_to date,
                                     p_department_type text default null,
                                     p_department_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_one boolean := p_department_type is not null;
  v_out jsonb;
begin
  if not public.gl_may_read() then
    raise exception 'Cash Flow is internal.'
      using errcode = '42501', detail = 'not_internal';
  end if;
  if p_from is null or p_to is null then
    raise exception 'Choose the first and the last day.'
      using errcode = '22023', detail = 'period_missing';
  end if;
  if p_from > p_to then
    raise exception 'The first day is after the last day.'
      using errcode = '22023', detail = 'period_backwards';
  end if;
  if (p_department_id is not null and p_department_type is null)
     or (p_department_type is not null
         and p_department_type not in ('SHOWROOM', 'DEALER', 'SUBSCRIPTION', 'OFFICE', 'STOCK'))
     or (p_department_id is not null and p_department_type not in ('SHOWROOM', 'DEALER')) then
    raise exception 'Choose the department.'
      using errcode = '22023', detail = 'department_invalid';
  end if;

  with money as (
    select m.account_code as code, a.name, m.money_kind, m.is_active
      from public.gl_money_accounts m
      join public.gl_accounts a on a.code = m.account_code
     where m.money_kind in ('CASH', 'BANK')
       and not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  holding as (
    select m.account_code as code
      from public.gl_money_accounts m
     where m.money_kind = 'HOLDING'
       and not exists (select 1 from public.gl_accounts c where c.parent_code = m.account_code)
  ),
  ln as (
    select l.id, l.entry_id, l.line_no, l.account_code, l.debit, l.credit, e.entry_date, e.source_type
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date <= p_to
  ),
  shares as (
    select s.*
      from public._fin_cash_flow_shares(p_from, p_to) s
     where not v_one
        or (s.department_type = p_department_type
            and (p_department_id is null or s.department_id = p_department_id))
  ),
  per_account as (
    select m.code, m.name, m.money_kind, m.is_active,
           case when v_one then 0
                else coalesce((select sum(ln.debit - ln.credit) from ln
                                where ln.account_code = m.code and ln.entry_date < p_from), 0) end as opening,
           case when v_one then coalesce((select sum(s.sen) from shares s
                                           where s.account_code = m.code and s.is_in), 0) / 100.0
                else coalesce((select sum(ln.debit) from ln
                                where ln.account_code = m.code and ln.entry_date >= p_from), 0) end as receipts,
           case when v_one then coalesce((select sum(s.sen) from shares s
                                           where s.account_code = m.code and not s.is_in), 0) / 100.0
                else coalesce((select sum(ln.credit) from ln
                                where ln.account_code = m.code and ln.entry_date >= p_from), 0) end as payments
      from money m
  ),
  grouped as (
    select s.is_in, s.other_code, sum(s.sen) as sen
      from shares s
     group by s.is_in, s.other_code
  )
  select jsonb_build_object(
    'from',       p_from,
    'to',         p_to,
    'go_live_on', (select gc.go_live_on from public.gl_config gc where gc.id),
    'channel',    case when v_one then jsonb_build_object('department_type', p_department_type,
                                                          'department_id',   p_department_id) end,
    'accounts',   coalesce((
      select jsonb_agg(jsonb_build_object(
               'account_code', pa.code,
               'name',         pa.name,
               'money_kind',   pa.money_kind,
               'is_active',    pa.is_active,
               'opening',      pa.opening,
               'receipts',     pa.receipts,
               'payments',     pa.payments)
             order by case pa.money_kind when 'CASH' then 1 else 2 end, pa.code)
        from per_account pa), '[]'::jsonb),
    'rows',       coalesce((
      select jsonb_agg(jsonb_build_object(
               'side',         case when g.is_in then 'IN' else 'OUT' end,
               'account_code', g.other_code,
               'name',         a.name,
               'kind',         a.kind,
               'money_kind',   (select m.money_kind from public.gl_money_accounts m where m.account_code = g.other_code),
               'amount',       g.sen / 100.0)
             order by g.is_in desc,
                      (g.other_code in (select code from money)),
                      g.other_code)
        from grouped g
        join public.gl_accounts a on a.code = g.other_code), '[]'::jsonb),
    'card', jsonb_build_object(
      'taken', coalesce((
        select sum(ln.debit - ln.credit)
          from ln
          left join public.gl_line_departments d on d.line_id = ln.id
         where ln.entry_date >= p_from
           and ln.account_code in (select code from holding)
           and regexp_replace(ln.source_type, '_REVERSAL$', '')
               not in ('MONEY_TRANSFER', 'CARD_PAYOUT', 'BANK_CHARGE', 'BANK_CREDIT')
           and (not v_one
                or (d.department_type = p_department_type
                    and (p_department_id is null or d.department_id = p_department_id)))), 0),
      'waiting', case when v_one then null else coalesce((
        select sum(ln.debit - ln.credit)
          from ln
         where ln.account_code in (select code from holding)), 0) end)
  ) into v_out;

  return v_out;
end;
$fn$;

revoke all on function public.fin_cash_flow(date, date, text, uuid) from public, anon;
grant execute on function public.fin_cash_flow(date, date, text, uuid) to authenticated;

comment on function public.fin_cash_flow(date, date, text, uuid) is
  '0638, 0684: Cash Flow (Chew 2026-10-03; by channel 2026-10-06). Read only: cash and bank accounts before and over a period, what the money was for, and card money taken and waiting. With a department, that channel''s money only (no balances, no card money waiting).';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('authenticated', 'public._fin_cash_flow_shares(date, date)', 'execute')
     or has_function_privilege('anon', 'public.fin_cash_flow(date, date, text, uuid)', 'execute') then
    raise exception '0684 sanity: cash flow can be read around Finance''s door';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'fin_cash_flow') <> 1 then
    raise exception '0684 sanity: Cash Flow has more than one door';
  end if;
end
$sanity$;

commit;
