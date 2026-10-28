-- 0623 . Card charges are read from approved card payouts
--
-- Reports -> Card charges: per month and card company, the card sales, the fee
-- the card company kept and what reached the bank. This adds ONE read.
--
-- card_charges_source(p_from, p_to): every card payout that is APPROVED
-- (posted, 0529), linked to a Card settlement day (card_settlement_payouts,
-- 0572) and dated in the period, one row per department of the day's matched
-- sales:
--   gross  the day's sale rows of that department (card_settlement_lines.amount)
--   fee    Public Bank and GHL print a net per row, so the fee is the rows' own
--          amount minus net. Maybank prints one net per merchant, so its fee is
--          shared by the department's part of the sales (unrounded; the page
--          rounds each month to the sen).
-- Approve day (0595) refuses a day unless every row is matched and the matched
-- payments add up, and prepared days take no new row, so each payout's rows add
-- back to its own amount and fee.
--
-- Department: gl_money_moves carries none, and a card payout's ledger lines
-- carry none (gl_money_move_approve, 0554). A sale's department is its order's
-- (fin_order_departments, 0540), reached through the matched payment. A sale
-- whose order has no department comes back with a null department.
--
-- Left out: a payout that is prepared, cancelled or reversed; a card payout
-- made on Money moves with no settlement day (it has no card company).
--
-- Finance and principal only (gl_may_read, which is false for a caller with no
-- role). SECURITY DEFINER like card_settlement_review: it reads order_payments
-- and orders, whose own policies are not Finance's to rely on here.
-- Read only. No table, column, policy or row changes. Re-runnable.

begin;

create or replace function public.card_charges_source(p_from date, p_to date)
returns table (
  move_date       date,
  acquirer        text,
  department_type text,
  department_id   uuid,
  gross           numeric,
  fee             numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.gl_may_read() then
    raise exception 'Card charges are for Finance.' using errcode = '42501', detail = 'not_finance';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Pick the months.' using errcode = '22023', detail = 'period_refused';
  end if;

  return query
  with payout as (
    select m.id, m.move_date, m.fee, cp.acquirer, cp.day_date, cp.group_key
      from public.card_settlement_payouts cp
      join public.gl_money_moves m on m.id = cp.move_id
     where m.kind = 'CARD_PAYOUT' and m.status = 'approved'
       and m.move_date between p_from and p_to
  ), line as (
    select p.id, p.move_date, p.acquirer, p.fee as move_fee,
           od.department_type, od.department_id, l.amount, l.net_amount,
           sum(l.amount) over (partition by p.id) as day_gross
      from payout p
      join public.card_settlement_lines l
        on l.acquirer = p.acquirer and l.day_date = p.day_date and l.group_key = p.group_key
      left join public.order_payments op on op.id = l.payment_id
      left join public.fin_order_departments od on od.order_id = op.order_id
  )
  select x.move_date, x.acquirer, x.department_type, x.department_id,
         sum(x.amount),
         case when x.acquirer = 'MAYBANK' then max(x.move_fee) * sum(x.amount) / max(x.day_gross)
              else sum(x.amount - x.net_amount) end
    from line x
   group by x.id, x.move_date, x.acquirer, x.department_type, x.department_id
   order by x.move_date, x.acquirer;
end;
$fn$;

comment on function public.card_charges_source(date, date) is
  '0623: Reports -> Card charges. Each approved card payout linked to a Card settlement day, dated p_from..p_to, one row per department of its matched sales: gross = the sale rows, fee = amount minus net per row (Public Bank, GHL) or the payout fee shared by sales (Maybank). Finance and principal. Read only.';

revoke all on function public.card_charges_source(date, date) from public, anon;
grant execute on function public.card_charges_source(date, date) to authenticated;

-- sanity: the function is there, a definer with a fixed search path, gated by
-- gl_may_read, and closed to anon. No row is counted.
do $sanity$
declare
  v_p pg_proc%rowtype;
begin
  select p.* into v_p from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'card_charges_source'
     and pg_get_function_identity_arguments(p.oid) = 'p_from date, p_to date';
  if not found then
    raise exception '0623 sanity: card_charges_source(date, date) is missing';
  end if;
  if not v_p.prosecdef then
    raise exception '0623 sanity: card_charges_source is not security definer';
  end if;
  if not coalesce(v_p.proconfig @> array['search_path=public, pg_temp'], false) then
    raise exception '0623 sanity: card_charges_source has no fixed search_path';
  end if;
  if position('gl_may_read()' in v_p.prosrc) = 0 then
    raise exception '0623 sanity: card_charges_source does not check gl_may_read()';
  end if;
  if has_function_privilege('anon', 'public.card_charges_source(date, date)', 'execute') then
    raise exception '0623 sanity: anon may execute card_charges_source';
  end if;
  if not has_function_privilege('authenticated', 'public.card_charges_source(date, date)', 'execute') then
    raise exception '0623 sanity: authenticated may not execute card_charges_source';
  end if;
end
$sanity$;

commit;
