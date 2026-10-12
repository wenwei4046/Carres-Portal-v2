-- =============================================================================
-- 0686_ar_aging_ages_what_debtors_owe_on_a_day.sql
-- =============================================================================
-- THE RULING (Chew 2026-10-03 and 2026-10-12, docs/finance/MASTER.md §3.6):
--   formal AR aging. 「就根据开了invoice还没还的就出现…包括普通顾客」: every
--   invoice issued and not yet paid appears, for ordinary customers and for
--   other debtors, aged the same way as AP Aging (0640).
--
-- WHAT THIS ADDS
--   fin_ar_aging(p_as_at) → jsonb. READ ONLY. As AP Aging is:
--   1. The debtor control accounts' balances on the day: every customer
--      account and the other debtors' account.
--   2. Each debtor's balance on them that day, from the books.
--   3. Each debtor's invoices still open that day:
--      · A customer's: Payment's sales and storage invoices, read and never
--        changed, on the books' own window: issued from the ledger's start to
--        the day, never a voided one (a void reverses on the invoice's own
--        date, so the books never held it). What the order has paid by then,
--        in the same window and never a voided payment, fills its earliest
--        invoice first. The customer is the one the invoice's own ledger entry
--        names, and its channel is the order's (fin_order_channels).
--      · An other debtor's: Finance's own issued invoices to the day, less the
--        receipts allocated to them by then. A cancelled invoice or a voided
--        receipt reverses on its own date, so neither counts.
--   4. Live invoices issued before the ledger started: how many and how much.
--      The books never held them, so they are not aged.
--   What a debtor's balance holds beyond its open invoices (money paid ahead
--   of an invoice) is worked out on the page, in the shared arithmetic, so
--   the aging always adds up to the books.
--
-- GRANTS: Finance or principal, through gl_report_guard.
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

create function public.fin_ar_aging(p_as_at date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_go_live date;
  v_out     jsonb;
begin
  v_go_live := public.gl_report_guard();
  if p_as_at is null then
    raise exception 'fin_ar_aging: p_as_at is required'
      using errcode = '22004';
  end if;

  with ctl as (
    select a.code, a.name
      from public.gl_accounts a
     where a.is_control
       and a.kind = 'ASSET'
       and a.control_for in ('CUSTOMER', 'OTHER')
  ),
  ln as (
    select l.account_code, l.party_type, l.party_id, l.debit, l.credit
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date <= p_as_at
       and l.account_code in (select code from ctl)
  ),
  ctl_balance as (
    select c.code, c.name, coalesce(sum(ln.debit - ln.credit), 0) as balance
      from ctl c
      left join ln on ln.account_code = c.code
     group by c.code, c.name
  ),
  party_balance as (
    select ln.party_type, ln.party_id, sum(ln.debit - ln.credit) as balance
      from ln
     where ln.party_id is not null
     group by ln.party_type, ln.party_id
  ),
  -- A customer's invoices, on the books' own window.
  cust_inv as (
    select i.id, i.invoice_no, i.kind, i.order_id, i.issued_at as invoice_date,
           round(i.amount + coalesce(i.tax_amount, 0), 2) as total
      from public.invoices i
     where i.status = 'issued'
       and i.voided_at is null
       and i.issued_at >= v_go_live
       and i.issued_at <= p_as_at
  ),
  cust_paid as (
    select p.order_id, sum(p.amount) as paid
      from public.order_payments p
     where p.voided_at is null
       and p.paid_on >= v_go_live
       and p.paid_on <= p_as_at
     group by p.order_id
  ),
  -- What the order has paid fills its earliest invoice first.
  cust_open as (
    select ci.id, ci.invoice_no, ci.kind, ci.order_id, ci.invoice_date, ci.total,
           greatest(0, least(ci.total,
             sum(ci.total) over (partition by ci.order_id
                                 order by ci.invoice_date, ci.invoice_no
                                 rows between unbounded preceding and current row)
             - coalesce(cp.paid, 0))) as open
      from cust_inv ci
      left join cust_paid cp on cp.order_id = ci.order_id
  ),
  open_inv as (
    select 'CUSTOMER'::text as party_type,
           coalesce(
             (select l.party_id
                from public.gl_entries e
                join public.gl_entry_lines l on l.entry_id = e.id and l.party_type = 'CUSTOMER'
               where e.source_type = 'SALES_INVOICE'
                 and e.source_doc_no = co.invoice_no
                 and e.posted
                 and not e.reversed
               order by l.line_no
               limit 1),
             (select c.id from public.customers c
               where c.phone_key = public.pwp_phone_key(o.customer_phone))) as party_id,
           co.id as invoice_id, co.invoice_no, co.kind, co.order_id, o.so,
           co.invoice_date, null::date as due_date, co.total, co.open,
           ch.department_type, ch.department_id
      from cust_open co
      join public.orders o on o.id = co.order_id
      left join public.fin_order_channels ch on ch.order_id = co.order_id
     where co.open > 0
    union all
    -- An other debtor's invoices.
    select 'OTHER', x.party_id, x.id, x.invoice_no, 'other', null::uuid, null::integer,
           x.invoice_date, x.due_date, x.total_amount, x.open, null::text, null::uuid
      from (
        select i.id, i.party_id, i.invoice_no, i.invoice_date, i.due_date, i.total_amount,
               i.total_amount - coalesce((select sum(a.amount)
                                            from public.other_receipt_allocations a
                                            join public.other_receipts r on r.id = a.receipt_id
                                           where a.invoice_id = i.id
                                             and r.status = 'posted'
                                             and r.receipt_date <= p_as_at), 0) as open
          from public.other_debtor_invoices i
         where i.status = 'issued'
           and i.invoice_date >= v_go_live
           and i.invoice_date <= p_as_at
      ) x
     where x.open > 0
  ),
  parties as (
    select pb.party_type, pb.party_id from party_balance pb where pb.balance <> 0
    union
    select oi.party_type, oi.party_id from open_inv oi
  )
  select jsonb_build_object(
    'as_at',      p_as_at,
    'go_live_on', v_go_live,
    'controls',   coalesce((select jsonb_agg(jsonb_build_object(
                     'account_code', cb.code, 'name', cb.name, 'balance', cb.balance) order by cb.code)
                     from ctl_balance cb), '[]'::jsonb),
    'debtors',    coalesce((
      select jsonb_agg(jsonb_build_object(
               'party_type', p.party_type,
               'party_id',   p.party_id,
               'name',       case p.party_type when 'CUSTOMER' then cu.name else fp.name end,
               'kind',       case p.party_type when 'CUSTOMER' then 'customer' else fp.kind end,
               'balance',    coalesce(pb.balance, 0),
               'invoices',   coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'invoice_id',      oi.invoice_id,
                          'invoice_no',      oi.invoice_no,
                          'kind',            oi.kind,
                          'order_id',        oi.order_id,
                          'so',              oi.so,
                          'invoice_date',    oi.invoice_date,
                          'due_date',        oi.due_date,
                          'total',           oi.total,
                          'open',            oi.open,
                          'department_type', oi.department_type,
                          'department_id',   oi.department_id)
                        order by oi.invoice_date, oi.invoice_no)
                   from open_inv oi
                  where oi.party_type = p.party_type
                    and oi.party_id is not distinct from p.party_id), '[]'::jsonb))
             order by case p.party_type when 'CUSTOMER' then cu.name else fp.name end, p.party_type, p.party_id)
        from parties p
        left join public.customers cu on p.party_type = 'CUSTOMER' and cu.id = p.party_id
        left join public.finance_parties fp on p.party_type = 'OTHER' and fp.id = p.party_id
        left join party_balance pb on pb.party_type = p.party_type and pb.party_id = p.party_id), '[]'::jsonb),
    'before_go_live', (
      select jsonb_build_object('count', count(*),
                                'amount', coalesce(sum(round(i.amount + coalesce(i.tax_amount, 0), 2)), 0))
        from public.invoices i
       where i.status = 'issued'
         and i.voided_at is null
         and i.issued_at < v_go_live)
  ) into v_out;

  return v_out;
end;
$fn$;

revoke all on function public.fin_ar_aging(date) from public, anon;
grant execute on function public.fin_ar_aging(date) to authenticated;

comment on function public.fin_ar_aging(date) is
  '0686: AR aging (Chew 2026-10-03, 2026-10-12). Read only: the debtor control accounts on a day, each debtor''s balance on them, and its invoices still open that day (a customer''s order money fills its earliest invoice first; an other debtor''s receipts by allocation).';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
begin
  if has_function_privilege('anon', 'public.fin_ar_aging(date)', 'execute') then
    raise exception '0686 sanity: AR aging is open to anon';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'fin_ar_aging'
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0686 sanity: fin_ar_aging lost security definer or its search_path';
  end if;
  if position('gl_report_guard()' in pg_get_functiondef('public.fin_ar_aging(date)'::regprocedure)) = 0 then
    raise exception '0686 sanity: fin_ar_aging lost its guard';
  end if;
end
$sanity$;

commit;
