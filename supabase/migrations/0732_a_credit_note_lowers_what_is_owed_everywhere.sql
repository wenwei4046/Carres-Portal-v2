-- ════════════════════════════════════════════════════════════════════════════
-- 0732 · A CREDIT NOTE LOWERS WHAT IS OWED EVERYWHERE, AND A REFUND HAS A CEILING
--        (whole-repo audit at 945f667, 2026-10-29)
--
-- WHAT WAS WRONG
--  1. top_up_order capped a payment at lines + addons - paid. It ignored
--     orders.credited (0730), so after a credit note it still took money the
--     customer no longer owed.
--  2. issue_credit_note dated a note with current_date, which is UTC: a note
--     issued before 08:00 in Kuala Lumpur carried yesterday's date.
--  3. "A credit is at most what the order still owes" was checked only in the
--     API route, before the lock. Two Finance users at once could both credit
--     the whole balance, and a direct RPC call skipped the check.
--  4. refund_request had no ceiling: the asks on an order could add up to
--     more than the customer ever paid.
--  5. issue_credit_note and void_credit_note wrote v_role::text into
--     audit_log.role, which is app_role (0001). Postgres has no assignment
--     cast from text to an enum, so both functions failed on every call:
--     no credit note could be issued or voided. Found by this file's test.
--
-- WHAT THIS DOES
--  * top_up_order (last body: 0503): the cap subtracts orders.credited.
--  * issue_credit_note (last body: 0730): KL date; the still-owed cap runs
--    after the order's `for update`, by orderMoney's arithmetic.
--  * refund_request (last body: 0560): locks the order; refuses when the new
--    ask plus every earlier ask not rejected is more than orders.paid.
--  * issue_credit_note / void_credit_note: audit_log gets v_role, not text.
--
-- Bodies are the latest definitions with only those lines changed. Grants are
-- untouched (create or replace keeps them). DR / CR: none changed.
-- Re-runnable: create or replace.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · top-up ──
create or replace function public.top_up_order(
  p_order_id uuid, p_amount numeric, p_method text, p_method_label text,
  p_reference text, p_note text, p_date date, p_photo_paths jsonb,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_order orders; v_role app_role; v_caller_dealer_id uuid;
  v_total numeric(12,2); v_amount numeric(12,2); v_post jsonb; v_existing order_payments;
begin
  v_role := public.app_role(); v_caller_dealer_id := public.app_dealer_id();
  if nullif(p_idempotency_key,'') is not null then
    select * into v_existing from order_payments
     where source_channel='sales_top_up' and idempotency_key=p_idempotency_key;
    if found then
      if v_existing.order_id is distinct from p_order_id then
        raise exception 'idempotency key was already used for a different payment'
          using errcode='22023',detail='idempotency_conflict';
      end if;
      select paid into v_total from orders where id=p_order_id;
      return jsonb_build_object('id',p_order_id,'amount',v_existing.amount,'paid',v_total,
                                'payment_id',v_existing.id,'already',true);
    end if;
  end if;
  select * into v_order from orders where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='42P01'; end if;
  if (v_role is null or v_role not in ('principal','operation','finance','bd'))
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer top-up' using errcode='42501';
  end if;
  if v_order.status in ('delivered','cancelled') then
    raise exception 'Top-up not allowed once order is delivered or cancelled' using errcode='22023',detail='wrong_status';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero' using errcode='22023',detail='invalid_amount'; end if;
  select coalesce((select sum(unit_price*qty) from order_lines where order_id=p_order_id),0)
       + coalesce((select sum(unit_price*qty) from order_addons where order_id=p_order_id),0) into v_total;
  if v_total<=0 then raise exception 'Order has no priced items — cannot top up' using errcode='22023',detail='total_amount_missing'; end if;
  -- 0732: a credit note (0730) lowers what is owed, as orderMoney reads it.
  v_amount := least(p_amount, greatest(0, v_total-v_order.credited)-coalesce(v_order.paid,0));
  if v_amount<=0 then raise exception 'Order is already fully paid' using errcode='22023',detail='already_paid'; end if;
  v_post := public._customer_payment_post(p_order_id,v_amount,p_date,p_method,'payment','sales_top_up',
    coalesce(nullif(p_idempotency_key,''),gen_random_uuid()::text),p_reference,p_reference,p_note,
    null,null,jsonb_build_object('method_label',p_method_label,'photo_paths',coalesce(p_photo_paths,'[]'::jsonb)),true);
  insert into order_history(order_id,text,by_role,metadata) values(p_order_id,
    format('Top-up RM %s via %s%s',v_amount::text,coalesce(nullif(p_method_label,''),p_method),
      case when nullif(trim(coalesce(p_reference,'')),'') is not null then ' · ref '||p_reference else '' end),
    v_role,jsonb_build_object('kind','top_up','amount',v_amount,'method',p_method,
      'method_label',p_method_label,'reference',nullif(p_reference,''),'note',nullif(p_note,''),
      'date',p_date,'photo_paths',coalesce(p_photo_paths,'[]'::jsonb),'payment_id',v_post->'payment_id'));
  return jsonb_build_object('id',p_order_id,'amount',v_amount,'paid',v_post->'orders_paid','payment_id',v_post->'payment_id');
end;
$fn$;

-- ── 2+3 · issue a credit note ──
create or replace function public.issue_credit_note(
  p_invoice_id uuid,
  p_amount     numeric,
  p_reason     text,
  p_note_date  date default null
) returns public.sales_credit_notes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role     app_role;
  v_inv      invoices;
  v_order    orders;
  v_amount   numeric(12,2);
  v_date     date;
  v_credited numeric(12,2);
  v_entry    gl_entries;
  v_total    numeric(12,2);
  v_left     numeric(12,2);
  v_share    numeric(12,2);
  v_cn_no    text;
  v_entry_id uuid;
  v_lines    jsonb := '[]'::jsonb;
  v_rec      record;
  v_n        int;
  v_i        int := 0;
  v_row      sales_credit_notes;
  v_worth    numeric(12,2);
  v_owed     numeric(12,2);
begin
  v_role := public.app_role();
  if v_role is null or v_role::text not in ('finance','principal') then
    raise exception 'Only Finance may issue a credit note.'
      using errcode = '42501', detail = 'credit_note_forbidden';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Type the reason for the credit note.'
      using errcode = '22023', detail = 'credit_note_reason_blank';
  end if;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'The credit note amount must be above RM 0.00.'
      using errcode = '22023', detail = 'credit_note_amount_not_positive';
  end if;

  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002', detail = 'invoice_not_found';
  end if;
  if v_inv.status <> 'issued' or v_inv.voided_at is not null then
    raise exception 'Invoice % is not an issued invoice, so it cannot be credited.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_invoice_not_issued';
  end if;

  -- Storage papers are owed under their own rule (soRemaining); a credit on
  -- one would lower the wrong figure. Sales Invoices only.
  if v_inv.kind <> 'sales' then
    raise exception 'Invoice % is a storage invoice. Credit notes are issued on Sales Invoices only.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_not_sales_invoice';
  end if;

  select coalesce(sum(amount), 0) into v_credited
    from sales_credit_notes where invoice_id = v_inv.id and status = 'issued';
  if v_amount > round(v_inv.amount - v_credited, 2) then
    raise exception 'Invoice % is for RM %, and RM % is already credited. A credit note can be at most RM %.',
      v_inv.invoice_no, to_char(v_inv.amount, 'FM999,999,990.00'), to_char(v_credited, 'FM999,999,990.00'),
      to_char(round(v_inv.amount - v_credited, 2), 'FM999,999,990.00')
      using errcode = '22023', detail = 'credit_note_exceeds_invoice';
  end if;

  select * into v_order from orders where id = v_inv.order_id for update;

  -- 0732: what the order still owes, read under the order's lock, by the same
  -- arithmetic as orderMoney (packages/shared/src/order-money.ts): priced
  -- lines win; with none, the keyed outstanding; with neither, nothing is known
  -- and nothing is capped. Two Finance users at once now queue here.
  select coalesce((select sum(unit_price * qty) from order_lines  where order_id = v_order.id), 0)
       + coalesce((select sum(unit_price * qty) from order_addons where order_id = v_order.id), 0)
    into v_worth;
  if v_worth > 0 then
    v_owed := greatest(0, greatest(0, v_worth - v_order.credited) - greatest(0, coalesce(v_order.paid, 0)));
  else
    select greatest(0, balance - v_order.credited) into v_owed
      from ops_order_control where order_id = v_order.id;
  end if;
  if v_owed is not null and v_amount > v_owed then
    raise exception 'The customer still owes RM % on this order, so a credit note can be at most that. Carres does not refund. If money has to go back to the customer, it runs through a Service Case and a Management decision.',
      to_char(v_owed, 'FM999,999,990.00')
      using errcode = '22023', detail = 'credit_exceeds_owing';
  end if;

  v_date := coalesce(p_note_date, (timezone('Asia/Kuala_Lumpur', now()))::date);  -- 0732: KL today, as 0594
  if v_date < v_inv.issued_at then
    raise exception 'A credit note cannot be dated before its invoice (%).', v_inv.issued_at
      using errcode = '22023', detail = 'credit_note_before_invoice';
  end if;

  -- The invoice's own entry names the income accounts and the customer.
  select * into v_entry from gl_entries
   where source_type = 'SALES_INVOICE' and source_doc_no = v_inv.invoice_no
     and posted and not reversed
   limit 1;
  if not found then
    raise exception 'Invoice % is not in the ledger (it was issued before the ledger started, or is not posted), so a credit note cannot be posted against it.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_invoice_not_in_ledger';
  end if;

  select coalesce(sum(credit), 0), count(*) into v_total, v_n
    from gl_entry_lines where entry_id = v_entry.id and credit > 0;
  if v_n = 0 or v_total <= 0 then
    raise exception 'Invoice % has no income line to credit back.', v_inv.invoice_no
      using errcode = '22023', detail = 'credit_note_no_income_line';
  end if;

  v_cn_no := public.next_credit_note_no();

  -- Dr each income account in the proportion the invoice credited it; the
  -- last line takes the rounding remainder so the debits equal the amount.
  v_left := v_amount;
  for v_rec in
    select account_code, sum(credit) as credit
      from gl_entry_lines where entry_id = v_entry.id and credit > 0
     group by account_code order by account_code
  loop
    v_i := v_i + 1;
    v_share := case when v_i = (select count(distinct account_code) from gl_entry_lines
                                 where entry_id = v_entry.id and credit > 0)
                    then v_left
                    else round(v_amount * v_rec.credit / v_total, 2) end;
    v_left := round(v_left - v_share, 2);
    if v_share > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_code', v_rec.account_code, 'debit', v_share, 'credit', 0,
        'memo', format('Credit note %s on invoice %s', v_cn_no, v_inv.invoice_no)));
    end if;
  end loop;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', public.gl_ar_control_account(),
    'debit', 0, 'credit', v_amount,
    'party_type', 'CUSTOMER',
    'party_id', public.gl_customer_party_for_order(v_inv.order_id),
    'memo', format('Credit note %s · invoice %s · order #%s', v_cn_no, v_inv.invoice_no, v_order.so)));

  v_entry_id := public.gl_post(
    'CREDIT_NOTE', v_cn_no, v_date,
    format('Credit note %s on invoice %s · order #%s (%s)', v_cn_no, v_inv.invoice_no, v_order.so, btrim(p_reason)),
    v_lines);

  insert into sales_credit_notes
    (credit_note_no, invoice_id, order_id, amount, reason, note_date, gl_entry_id, created_by)
  values
    (v_cn_no, v_inv.id, v_inv.order_id, v_amount, btrim(p_reason), v_date, v_entry_id, auth.uid())
  returning * into v_row;

  update orders set credited = round(credited + v_amount, 2) where id = v_inv.order_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, (select name from app_users where id = auth.uid()),
          format('Credit note issued · %s · %s · RM %s', v_cn_no, v_inv.invoice_no, v_amount),
          v_cn_no);

  return v_row;
end;
$fn$;

-- ── 5 · void a credit note (audit_log.role fix only) ──
create or replace function public.void_credit_note(
  p_id     uuid,
  p_reason text
) returns public.sales_credit_notes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_row  sales_credit_notes;
begin
  v_role := public.app_role();
  if v_role is null or v_role::text not in ('finance','principal') then
    raise exception 'Only Finance may void a credit note.'
      using errcode = '42501', detail = 'credit_note_forbidden';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Type the reason for voiding the credit note.'
      using errcode = '22023', detail = 'credit_note_void_reason_blank';
  end if;

  select * into v_row from sales_credit_notes where id = p_id for update;
  if not found then
    raise exception 'Credit note not found.' using errcode = 'P0002', detail = 'credit_note_not_found';
  end if;
  if v_row.status = 'voided' then
    return v_row;                                 -- a second press changes nothing
  end if;

  perform public.gl_reverse(v_row.gl_entry_id, 'Credit note ' || v_row.credit_note_no || ' voided');

  update sales_credit_notes
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = v_row.id returning * into v_row;

  update orders set credited = greatest(0, round(credited - v_row.amount, 2)) where id = v_row.order_id;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role, (select name from app_users where id = auth.uid()),
          format('Credit note voided · %s · RM %s', v_row.credit_note_no, v_row.amount),
          v_row.credit_note_no);

  return v_row;
end;
$fn$;

-- ── 4 · ask for a refund ──
CREATE OR REPLACE FUNCTION public.refund_request(p_order_id uuid, p_amount numeric, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_role app_role;
  v_uid  uuid;
  v_row  order_refunds;
  v_so   int;
  v_paid  numeric(12,2);
  v_asked numeric(12,2);
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can request a refund'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_order_id is null or p_amount is null or p_amount <= 0
     or p_reason is null or coalesce(p_reason, '') !~ '[^[:space:]]' then
    raise exception 'order, positive amount and a reason are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  -- 0732: locked, so two requests at once cannot both fit under what was paid.
  select so, coalesce(paid, 0) into v_so, v_paid from orders where id = p_order_id for update;
  if v_so is null then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;
  -- 0732: a refund gives back money the customer paid, never more. Every ask
  -- not rejected counts (requested, approved, paid: refund_mark_paid leaves
  -- orders.paid as it is).
  select coalesce(sum(amount), 0) into v_asked
    from order_refunds where order_id = p_order_id and status <> 'rejected';
  if v_asked + p_amount > v_paid then
    raise exception 'RM % is paid on this order and RM % is already asked back, so a refund can be at most RM %.',
      to_char(v_paid, 'FM999,999,990.00'), to_char(v_asked, 'FM999,999,990.00'),
      to_char(greatest(0, v_paid - v_asked), 'FM999,999,990.00')
      using errcode = '22023', detail = 'refund_exceeds_paid';
  end if;

  insert into order_refunds (order_id, amount, reason, requested_by)
  values (p_order_id, p_amount, btrim(p_reason), v_uid)
  returning * into v_row;

  insert into order_history (order_id, text, by_role)
  values (p_order_id,
          format('Refund requested · RM %s · %s', p_amount, btrim(p_reason)),
          'operation');
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, (select name from app_users where id = v_uid),
          format('Refund requested · RM %s', p_amount), 'SO-' || v_so::text);

  return to_jsonb(v_row);
end;
$function$;

commit;
