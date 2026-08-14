-- PAYMENT · Customer payment posting convergence
-- Every customer-order entrance now delegates to _customer_payment_post.

alter table public.order_payments
  add column if not exists source_channel text,
  add column if not exists source_reference text,
  add column if not exists idempotency_key text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists legacy_payment_id uuid references public.payments(id);

create unique index if not exists order_payments_source_idempotency_uidx
  on public.order_payments (source_channel, idempotency_key)
  where source_channel is not null and idempotency_key is not null;
create unique index if not exists order_payments_legacy_payment_uidx
  on public.order_payments (legacy_payment_id)
  where legacy_payment_id is not null;

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.order_payments(id),
  order_id uuid not null references public.orders(id),
  amount numeric(12,2) not null check (amount > 0),
  allocated_by uuid references auth.users(id),
  allocated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text
);
create unique index if not exists payment_allocations_live_payment_order_uidx
  on public.payment_allocations(payment_id, order_id) where voided_at is null;
create index if not exists payment_allocations_order_idx
  on public.payment_allocations(order_id);
alter table public.payment_allocations enable row level security;
drop policy if exists payment_allocations_read_internal on public.payment_allocations;
create policy payment_allocations_read_internal on public.payment_allocations
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.payment_allocations from authenticated;

-- Preserve the old Finance AR receipt trail without moving orders.paid again.
insert into public.order_payments
  (order_id, amount, paid_on, method, kind, reference, receipt_url, recorded_by,
   counted_in_paid, source_channel, source_reference, idempotency_key,
   source_metadata, legacy_payment_id)
select p.order_id, p.amount, p.paid_at,
       case when p.method::text in ('cash','bank','card','cheque','online','other')
            then p.method::text else 'other' end,
       'payment', p.reference, p.receipt_url, p.recorded_by, true,
       'legacy_finance', p.id::text, p.id::text,
       jsonb_build_object('legacy_table', 'payments', 'legacy_method', p.method::text), p.id
  from public.payments p
 where p.direction = 'in' and p.order_id is not null
on conflict do nothing;

insert into public.payment_allocations(payment_id, order_id, amount, allocated_by, allocated_at)
select op.id, op.order_id, op.amount, op.recorded_by, op.created_at
  from public.order_payments op
 where op.kind <> 'storage' and op.voided_at is null
   and not exists (select 1 from public.payment_allocations a
                    where a.payment_id = op.id and a.order_id = op.order_id and a.voided_at is null);

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

  v_method := case when p_method in ('cash','bank','card','cheque','online','other')
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

-- Operational/manual compatibility door; all work is delegated to the owner.
drop function if exists public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean);
create function public.payment_record(
  p_order_id uuid, p_amount numeric, p_paid_on date, p_method text, p_kind text,
  p_reference text default null, p_note text default null, p_receipt_url text default null,
  p_receipt_no text default null, p_counts_toward_paid boolean default true,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if public.app_role() not in ('operation','principal') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return public._customer_payment_post(p_order_id, p_amount, p_paid_on, p_method, p_kind,
    'manual_payment', coalesce(nullif(p_idempotency_key,''), p_receipt_no), p_reference,
    p_reference, p_note, p_receipt_url, p_receipt_no, '{}'::jsonb, p_counts_toward_paid);
end;
$fn$;
revoke all on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text) from public, anon;
grant execute on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text) to authenticated;

-- Sales/POS top-up keeps its wire contract but no longer moves orders.paid itself.
drop function if exists public.top_up_order(uuid,numeric,text,text,text,text,date,jsonb);
create function public.top_up_order(
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
  if v_role not in ('principal','logistics','finance','bd')
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
  v_amount := least(p_amount, v_total-coalesce(v_order.paid,0));
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
revoke all on function public.top_up_order(uuid,numeric,text,text,text,text,date,jsonb,text) from public, anon;
grant execute on function public.top_up_order(uuid,numeric,text,text,text,text,date,jsonb,text) to authenticated;

-- Finance AR compatibility door now returns the canonical ledger row as jsonb.
drop function if exists public.finance_record_receipt(uuid,numeric,payment_method,text);
create function public.finance_record_receipt(
  p_order_id uuid, p_amount numeric, p_method payment_method, p_reference text,
  p_idempotency_key text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if public.app_role() not in ('finance','principal') then raise exception 'forbidden' using errcode='42501'; end if;
  return public._customer_payment_post(p_order_id, p_amount, current_date, p_method::text, 'payment',
    'finance_ar', coalesce(nullif(p_idempotency_key,''), gen_random_uuid()::text), p_reference,
    p_reference, null, null, null, '{}'::jsonb, true);
end;
$fn$;
revoke all on function public.finance_record_receipt(uuid,numeric,payment_method,text,text) from public, anon;
grant execute on function public.finance_record_receipt(uuid,numeric,payment_method,text,text) to authenticated;

-- Customer Stripe adapter: the session id is the provider idempotency key.
create or replace function public.record_stripe_checkout_payment(
  p_session_id text, p_payment_intent_id text default null,
  p_payment_method_detail text default null, p_receipt_url text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_session stripe_checkout_sessions; v_post jsonb;
begin
  select * into v_session from stripe_checkout_sessions where session_id=p_session_id for update;
  if not found then raise exception 'Unknown checkout session' using errcode='42P01', detail='session_not_found'; end if;
  v_post := public._customer_payment_post(v_session.order_id, v_session.amount,
    (now() at time zone 'Asia/Kuala_Lumpur')::date, 'online', 'payment', 'stripe_checkout',
    p_session_id, coalesce(p_payment_intent_id,p_session_id), p_payment_intent_id, null,
    p_receipt_url, null, jsonb_build_object('payment_method_detail',p_payment_method_detail), true);
  update stripe_checkout_sessions set status='paid', paid_at=coalesce(paid_at,now()),
    payment_intent_id=coalesce(p_payment_intent_id,payment_intent_id),
    payment_method_detail=coalesce(p_payment_method_detail,payment_method_detail),
    receipt_url=coalesce(p_receipt_url,receipt_url) where id=v_session.id;
  return jsonb_build_object('already',coalesce((v_post->>'already')::boolean,false),
    'orderId',v_session.order_id,'amount',v_session.amount,'paid',v_post->'orders_paid',
    'paymentId',v_post->'payment_id');
end;
$fn$;
revoke execute on function public.record_stripe_checkout_payment(text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_stripe_checkout_payment(text,text,text,text) to service_role;

-- Stop generic Finance rows from becoming a second customer-order truth.
create or replace function public.reject_generic_customer_payment_write()
returns trigger language plpgsql set search_path = public, pg_temp as $fn$
begin
  if new.order_id is not null and new.direction = 'in' then
    raise exception 'customer order payments must use the canonical posting service'
      using errcode='42501', detail='canonical_payment_required';
  end if;
  return new;
end;
$fn$;
drop trigger if exists payments_reject_customer_order_write on public.payments;
create trigger payments_reject_customer_order_write before insert or update on public.payments
for each row execute function public.reject_generic_customer_payment_write();

-- Voiding also reverses the allocation evidence; the payment itself remains.
create or replace function public.payment_void(p_payment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_row order_payments; v_paid numeric; v_live_storage integer;
begin
  if public.app_role() is distinct from 'principal' then raise exception 'forbidden' using errcode='42501'; end if;
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
revoke all on function public.payment_void(uuid,text) from public, anon;
grant execute on function public.payment_void(uuid,text) to authenticated;
