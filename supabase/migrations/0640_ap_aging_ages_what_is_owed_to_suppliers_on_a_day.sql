-- =============================================================================
-- 0640_ap_aging_ages_what_is_owed_to_suppliers_on_a_day.sql
-- =============================================================================
-- WHAT WAS MISSING
--   AP · Payables lists what is owed to each supplier today. Finance had no
--   formal creditor aging: what was owed on a chosen day, bill by bill, by how
--   old each bill is, adding up to the payables control accounts in the
--   books. Chew (Finance) listed formal AR and AP aging on 2026-10-03
--   (docs/finance/MASTER.md §3.6), after the Houzs reference (Part 10 §9).
--
-- WHAT THIS ADDS
--   1. ap_bill_settled(p_as_at) — how much of each bill is paid, on a day or
--      (null) now: approved voucher allocations dated by then, and advance
--      knock-offs made by then and not cancelled by then. It is now the ONE
--      arithmetic for "paid" (law D): ap_bill_paid (0484) reads its paid
--      column from ap_bill_settled(null), which is exactly 0484's rule, and
--      keeps its own held column unchanged. A voucher pays on its own date,
--      the date it posts on, so a day here agrees with the ledger on that day.
--   2. fin_ap_aging(p_as_at) → jsonb. READ ONLY. The payables control
--      accounts' balances on the day; for each supplier, its balance on those
--      accounts and its confirmed bills still open on the day. What a
--      supplier's balance holds beyond its open bills (an advance not yet
--      knocked off, an opening balance) is worked out on the page, in the
--      shared arithmetic, so the aging always adds up to the books.
--
-- GRANTS: ap_bill_settled is internal, like ap_bill_paid. fin_ap_aging is
-- Finance or principal, through gl_report_guard.
-- DATA: none. DR/CR: none.
-- =============================================================================

begin;

-- ── 1 · paid, on a day ──────────────────────────────────────────────────────
create or replace function public.ap_bill_settled(p_as_at date default null)
returns table (bill_id uuid, paid numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select x.bid, coalesce(sum(x.amount), 0)::numeric(12,2)
    from (
      -- An approved voucher pays on its own date: the date it posts on.
      select al.bill_id as bid, al.amount_applied as amount
        from public.payment_voucher_allocations al
        join public.payment_vouchers pv on pv.id = al.voucher_id
       where pv.status = 'approved'
         and (p_as_at is null or pv.voucher_date <= p_as_at)
      union all
      -- A knock-off counts from the day it was made until the day it was cancelled.
      select ap.bill_id, ap.amount
        from public.supplier_advance_applications ap
       where (p_as_at is null and ap.status = 'applied')
          or (p_as_at is not null
              and timezone('Asia/Kuala_Lumpur', ap.created_at)::date <= p_as_at
              and (ap.status = 'applied'
                   or (ap.status = 'cancelled'
                       and timezone('Asia/Kuala_Lumpur', ap.cancelled_at)::date > p_as_at)))
    ) x
   group by x.bid
$fn$;

revoke all on function public.ap_bill_settled(date) from public, anon, authenticated;

comment on function public.ap_bill_settled(date) is
  '0640 · law D: the ONE arithmetic for how much of a bill is paid, on a day or (null) now. Approved voucher allocations dated by then + advance knock-offs live then. ap_bill_paid reads its paid column from here. Internal.';

-- ap_bill_paid keeps its signature, its held column and its grants; only its
-- paid column now comes from ap_bill_settled(null), the same rule as 0484's.
create or replace function public.ap_bill_paid(p_bill_id uuid default null)
returns table (bill_id uuid, paid numeric(12,2), held numeric(12,2))
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select h.bid,
         coalesce(s.paid, 0)::numeric(12,2),
         h.held
    from (
      select x.bid, coalesce(sum(x.amount), 0)::numeric(12,2) as held
        from (
          select al.bill_id as bid, al.amount_applied as amount
            from public.payment_voucher_allocations al
            join public.payment_vouchers pv on pv.id = al.voucher_id
           where pv.status <> 'cancelled'
             and (p_bill_id is null or al.bill_id = p_bill_id)
          union all
          select ap.bill_id, ap.amount
            from public.supplier_advance_applications ap
           where ap.status = 'applied'
             and (p_bill_id is null or ap.bill_id = p_bill_id)
        ) x
       group by x.bid
    ) h
    left join public.ap_bill_settled(null) s on s.bill_id = h.bid
$fn$;

comment on function public.ap_bill_paid(uuid) is
  '0484 · 0640 · law D: paid comes from ap_bill_settled(null) — approved vouchers + live advance knock-offs; held = allocations on vouchers not cancelled + live knock-offs. Internal: only definer functions call it.';

-- ── 2 · the aging ───────────────────────────────────────────────────────────
create or replace function public.fin_ap_aging(p_as_at date)
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
    raise exception 'fin_ap_aging: p_as_at is required'
      using errcode = '22004';
  end if;

  with ctl as (
    select a.code, a.name
      from public.gl_accounts a
     where a.is_control and a.control_for = 'SUPPLIER'
  ),
  ln as (
    select l.account_code, l.party_id, l.debit, l.credit
      from public.gl_entry_lines l
      join public.gl_entries e on e.id = l.entry_id
     where e.posted
       and e.entry_date <= p_as_at
       and l.account_code in (select code from ctl)
  ),
  ctl_balance as (
    select c.code, c.name, coalesce(sum(ln.credit - ln.debit), 0) as balance
      from ctl c
      left join ln on ln.account_code = c.code
     group by c.code, c.name
  ),
  party_balance as (
    select ln.party_id as supplier_id, sum(ln.credit - ln.debit) as balance
      from ln
     group by ln.party_id
  ),
  settled as (
    select s.bill_id, s.paid from public.ap_bill_settled(p_as_at) s
  ),
  open_bills as (
    select b.id, b.bill_no, b.supplier_invoice_no, b.supplier_id, b.bill_date, b.due_date,
           b.total_amount, b.total_amount - coalesce(st.paid, 0) as open
      from public.supplier_bills b
      left join settled st on st.bill_id = b.id
     where b.status = 'confirmed'
       and b.bill_date <= p_as_at
       and b.ap_account_code in (select code from ctl)
  ),
  parties as (
    select pb.supplier_id from party_balance pb where pb.balance <> 0
    union
    select ob.supplier_id from open_bills ob where ob.open > 0
  )
  select jsonb_build_object(
    'as_at',      p_as_at,
    'go_live_on', v_go_live,
    'controls',   coalesce((select jsonb_agg(jsonb_build_object(
                     'account_code', cb.code, 'name', cb.name, 'balance', cb.balance) order by cb.code)
                     from ctl_balance cb), '[]'::jsonb),
    'suppliers',  coalesce((
      select jsonb_agg(jsonb_build_object(
               'supplier_id', p.supplier_id,
               'name',        s.name,
               'kind',        s.kind,
               'balance',     coalesce(pb.balance, 0),
               'bills',       coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'bill_id',             ob.id,
                          'bill_no',             ob.bill_no,
                          'supplier_invoice_no', ob.supplier_invoice_no,
                          'bill_date',           ob.bill_date,
                          'due_date',            ob.due_date,
                          'total',               ob.total_amount,
                          'open',                ob.open)
                        order by ob.bill_date, ob.bill_no)
                   from open_bills ob
                  where ob.supplier_id = p.supplier_id and ob.open > 0), '[]'::jsonb))
             order by s.name, p.supplier_id)
        from parties p
        left join public.suppliers s on s.id = p.supplier_id
        left join party_balance pb on pb.supplier_id = p.supplier_id), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$fn$;

revoke all on function public.fin_ap_aging(date) from public, anon;
grant execute on function public.fin_ap_aging(date) to authenticated;

comment on function public.fin_ap_aging(date) is
  '0640: AP aging (Chew 2026-10-03). Read only: the payables control accounts on a day, each supplier''s balance on them, and its confirmed bills still open that day (ap_bill_settled).';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_src text;
begin
  if has_function_privilege('authenticated', 'public.ap_bill_settled(date)', 'execute')
     or has_function_privilege('anon', 'public.ap_bill_settled(date)', 'execute') then
    raise exception '0640 sanity: ap_bill_settled must stay internal';
  end if;
  if has_function_privilege('authenticated', 'public.ap_bill_paid(uuid)', 'execute') then
    raise exception '0640 sanity: ap_bill_paid lost its internal grant';
  end if;
  select pg_get_functiondef('public.ap_bill_paid(uuid)'::regprocedure) into v_src;
  if position('ap_bill_settled(' in v_src) = 0 then
    raise exception '0640 sanity: ap_bill_paid does not read its paid column from ap_bill_settled';
  end if;
  if has_function_privilege('anon', 'public.fin_ap_aging(date)', 'execute') then
    raise exception '0640 sanity: AP aging is open to anon';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname in ('fin_ap_aging', 'ap_bill_settled')
                and not (p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])) then
    raise exception '0640 sanity: a new function lost security definer or its search_path';
  end if;
end
$sanity$;

commit;
