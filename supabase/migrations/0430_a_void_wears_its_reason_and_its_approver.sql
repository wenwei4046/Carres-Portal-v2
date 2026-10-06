-- ============================================================================
-- 0430 — a void wears its reason, and its approver
--        (docs/payment/MASTER.md §5 · §12, owner instruction 2026-09-06)
--
-- The MASTER's exception law: wrong/duplicate posting is corrected by the
-- Payment Approver using `Void payment`; the original and its reason remain.
-- Measured before this migration (live prosrc md5 54b302fc… = the committed
-- 0351 text, reconciled 2026-09-06):
--   * `payment_void` gates on principal alone — the Payment Approver duty
--     (workspace/MASTER.md, resolved by the ONE Shared Duty Resolver) cannot
--     act, and Jess is a hard-coded bottleneck for a routine correction.
--   * `p_reason` defaults to NULL and the caller passes NULL — a voided
--     payment today may carry no reason at all.
--
-- This migration makes three governed changes and nothing else:
--   §1  payment_void: the reason is REQUIRED — a void with no reason is
--       refused;
--   §2  payment_void: the gate is Payment Approver duty (or its dated cover)
--       via workspace_resolve_duty('payment_approver'), or principal. The
--       duty answer is coalesced — an unassigned duty must refuse, never
--       NULL its way past the guard (the 0429 lesson).
--   §3  _customer_payment_post (live md5 4d2f3e61… = committed 0351): the
--       method whitelist gains the governed manual methods duitnow_qr ·
--       credit_card · debit_card (payment/MASTER.md §16). Every other line
--       of both functions is byte-for-byte 0351.
-- ============================================================================

begin;

set search_path = public, pg_temp;

create or replace function public.payment_void(p_payment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_row order_payments; v_paid numeric; v_live_storage integer;
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('payment_approver', null);
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required to void a payment'
      using errcode = '22023', detail = 'reason_required';
  end if;
  if not (coalesce(public.app_role() = 'principal', false)
          or (v_uid is not null
              and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_approver';
  end if;
  select * into v_row from order_payments where id=p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode='42P01',detail='payment_not_found'; end if;
  if v_row.voided_at is not null then raise exception 'payment is already voided' using errcode='22023',detail='already_voided'; end if;
  update order_payments set voided_at=now(),voided_by=auth.uid(),void_reason=nullif(btrim(coalesce(p_reason,'')),'') where id=p_payment_id;
  update payment_allocations set voided_at=now(),voided_by=auth.uid(),void_reason=nullif(btrim(coalesce(p_reason,'')),'')
   where payment_id=p_payment_id and voided_at is null;
  if v_row.kind='storage' then
    select count(*) into v_live_storage from order_payments where order_id=v_row.order_id and kind='storage' and voided_at is null;
    if v_live_storage=0 then update ops_order_control set storage_collected_at=null,storage_paid=null,updated_by=auth.uid(),updated_at=now() where order_id=v_row.order_id; end if;
    select paid into v_paid from orders where id=v_row.order_id;
  elsif v_row.counted_in_paid then
    update orders set paid=greatest(0,coalesce(paid,0)-v_row.amount),updated_at=now() where id=v_row.order_id returning paid into v_paid;
  else select paid into v_paid from orders where id=v_row.order_id;
  end if;
  insert into ops_activity_log(order_id,action,actor_id,detail) values(v_row.order_id,'payment.voided',auth.uid(),jsonb_build_object('amount',v_row.amount,'payment_id',v_row.id,'reason',p_reason));
  return jsonb_build_object('payment_id',p_payment_id,'orders_paid',v_paid);
end;
$fn$;

comment on function public.payment_void(uuid, text) is
  '0430: Payment Approver duty (Shared Duty Resolver) or principal voids a payment, with a REQUIRED reason. A void is a stamp, never a delete; the allocation and orders.paid reversal are unchanged 0351 arithmetic.';

revoke all on function public.payment_void(uuid,text) from public, anon;
grant execute on function public.payment_void(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- §3 · the posting service speaks the governed manual methods
--      (live prosrc md5 4d2f3e61… matched the committed 0351 text before
--       this restatement; the whitelist line is the ONLY change). The column
--      CHECK widens with it — the rolled-back probe caught the constraint
--      refusing what the function had just accepted.
-- ---------------------------------------------------------------------------

alter table public.order_payments drop constraint if exists order_payments_method_check;
alter table public.order_payments add constraint order_payments_method_check check (
  method in ('cash', 'bank', 'card', 'cheque', 'online', 'other',
             'duitnow_qr', 'credit_card', 'debit_card')
);

create or replace function public._customer_payment_post(
  p_order_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_method text,
  p_kind text,
  p_source_channel text,
  p_idempotency_key text,
  p_source_reference text default null,
  p_reference text default null,
  p_note text default null,
  p_receipt_url text default null,
  p_receipt_no text default null,
  p_source_metadata jsonb default '{}'::jsonb,
  p_counts_toward_paid boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_order orders;
  v_existing order_payments;
  v_row order_payments;
  v_paid numeric;
  v_receipt text;
  v_seq integer;
  v_method text;
begin
  if p_order_id is null or p_amount is null or p_amount <= 0 or p_paid_on is null then
    raise exception 'order, positive amount and paid-on date are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if nullif(btrim(coalesce(p_source_channel, '')), '') is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'source channel and idempotency key are required'
      using errcode = '22023', detail = 'idempotency_required';
  end if;
  if p_kind not in ('payment','deposit','storage') then
    raise exception 'invalid payment kind' using errcode = '22023', detail = 'bad_kind';
  end if;

  select * into v_existing from order_payments
   where source_channel = p_source_channel and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id is distinct from p_order_id
       or v_existing.amount is distinct from p_amount
       or v_existing.kind is distinct from p_kind then
      raise exception 'idempotency key was already used for a different payment'
        using errcode = '22023', detail = 'idempotency_conflict';
    end if;
    select paid into v_paid from orders where id = v_existing.order_id;
    return jsonb_build_object('already', true, 'payment', to_jsonb(v_existing),
                              'payment_id', v_existing.id, 'orders_paid', v_paid);
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;

  -- Re-check after the order lock serialises two different entrances.
  select * into v_existing from order_payments
   where source_channel = p_source_channel and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.order_id is distinct from p_order_id
       or v_existing.amount is distinct from p_amount
       or v_existing.kind is distinct from p_kind then
      raise exception 'idempotency key was already used for a different payment'
        using errcode = '22023', detail = 'idempotency_conflict';
    end if;
    return jsonb_build_object('already', true, 'payment', to_jsonb(v_existing),
                              'payment_id', v_existing.id, 'orders_paid', v_order.paid);
  end if;

  -- 0430: the governed manual methods (payment/MASTER.md §16) join the
  -- dictionary; an unknown word still coerces to 'other' and the original
  -- stays in source_metadata.original_method, exactly as before.
  v_method := case when p_method in ('cash','bank','card','cheque','online','other',
                                     'duitnow_qr','credit_card','debit_card')
                   then p_method else 'other' end;
  v_receipt := nullif(btrim(coalesce(p_receipt_no, '')), '');
  if v_receipt is null then
    select count(*)::integer + 1 into v_seq from order_payments where order_id = p_order_id;
    loop
      v_receipt := 'RC-' || to_char(p_paid_on, 'DDMMYY') || '-' ||
                   lpad(mod(abs(hashtext(p_order_id::text || ':' || v_seq::text)), 10000)::text, 4, '0');
      exit when not exists (select 1 from order_payments where receipt_no = v_receipt);
      v_seq := v_seq + 1;
    end loop;
  end if;

  insert into order_payments
    (order_id, amount, paid_on, method, kind, reference, note, receipt_url,
     receipt_no, recorded_by, counted_in_paid, source_channel, source_reference,
     idempotency_key, source_metadata)
  values
    (p_order_id, p_amount, p_paid_on, v_method, p_kind, nullif(btrim(coalesce(p_reference,'')),''),
     nullif(btrim(coalesce(p_note,'')),''), nullif(btrim(coalesce(p_receipt_url,'')),''),
     v_receipt, auth.uid(), (p_kind <> 'storage' and p_counts_toward_paid),
     p_source_channel, nullif(btrim(coalesce(p_source_reference,'')),''), p_idempotency_key,
     coalesce(p_source_metadata, '{}'::jsonb) || jsonb_build_object('original_method', p_method))
  returning * into v_row;

  if p_kind = 'storage' then
    insert into ops_order_control (order_id, storage_collected_at, storage_paid, updated_by)
    values (p_order_id, now(), 'Paid', auth.uid())
    on conflict (order_id) do update set storage_collected_at = now(), storage_paid = 'Paid',
      updated_by = auth.uid(), updated_at = now();
    v_paid := v_order.paid;
  elsif p_counts_toward_paid then
    insert into payment_allocations(payment_id, order_id, amount, allocated_by)
    values (v_row.id, p_order_id, p_amount, auth.uid());
    update orders set paid = coalesce(paid, 0) + p_amount, updated_at = now()
     where id = p_order_id returning paid into v_paid;
  else
    v_paid := v_order.paid;
  end if;

  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (p_order_id, 'payment.received', auth.uid(), jsonb_build_object(
    'amount', p_amount, 'kind', p_kind, 'method', p_method, 'receipt_no', v_receipt,
    'counted_in_paid', v_row.counted_in_paid, 'payment_id', v_row.id,
    'source_channel', p_source_channel, 'source_reference', p_source_reference));

  insert into audit_log(role, actor_text, action, ref)
  values (public.app_role(), coalesce((select name from app_users where id = auth.uid()), p_source_channel),
          format('Payment recorded · RM %s · %s · %s', p_amount, p_kind, p_method), v_receipt);

  return jsonb_build_object('already', false, 'payment', to_jsonb(v_row),
                            'payment_id', v_row.id, 'orders_paid', v_paid);
end;
$fn$;

revoke all on function public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean) from public, anon, authenticated;

do $$
declare v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'payment_void';
  if v <> 1 then raise exception 'sanity: % copies of payment_void', v; end if;
end $$;

commit;
