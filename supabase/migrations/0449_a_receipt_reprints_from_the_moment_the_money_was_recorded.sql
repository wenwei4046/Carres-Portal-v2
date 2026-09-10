-- ============================================================================
-- 0449 — a receipt reprints from the moment the money was recorded
-- (docs/payment/MASTER.md §4)
--
-- §4, verbatim: "Reprint uses the same number/snapshot. Voided Payment keeps a
-- visible `VOIDED` receipt."
--
-- WHAT WAS MISSING. `invoices` learned this in 0429 — an issue captures an
-- immutable `snapshot` and every reprint reads it, never live order data. The
-- receipt never got the same treatment: the number was minted and stored, but
-- nothing captured WHAT the receipt said. The customer's name, the SO and the
-- method would be re-read live at reprint time, so a customer renamed or an
-- order corrected six months later would silently reprint a DIFFERENT receipt
-- under the same number. A receipt that changes is not a receipt.
--
-- The capture belongs in the ONE writer (0351/0430), not in a route: every
-- channel — the desk, the POS top-up, the payment link — mints its receipt
-- there, so every channel must capture the same way. This migration replaces
-- `_customer_payment_post` with the identical body plus the snapshot, and
-- changes nothing else about it.
--
-- Voiding is untouched: `payment_void` stamps the row and leaves the snapshot
-- alone, so a voided payment still reprints its receipt, marked VOIDED — which
-- is exactly what §4 asks for.
--
-- ⛔ NO BACKFILL. Payments recorded before this migration have no snapshot and
-- never will; their document reads live and says so (`from_snapshot: false`),
-- the same honest fallback the pre-0429 invoices carry. Inventing a snapshot
-- for a receipt nobody captured would be a forgery, not a repair.
-- ============================================================================
begin;

alter table public.order_payments
  add column if not exists snapshot jsonb;

comment on column public.order_payments.snapshot is
  '0449: the immutable receipt content captured when the money was recorded. A reprint reads THIS, never live order data (payment/MASTER.md §4). Null on payments recorded before 0449 — their document reads live and says so.';

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
  v_snapshot jsonb;
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

  -- 0449 — the receipt's own content, frozen here. The customer name and the
  -- SO are read ONCE, at the moment the money was recorded, so a later rename
  -- or correction can never rewrite a receipt that is already in a customer's
  -- hands. The governed method WORD is stored, not the raw input.
  v_snapshot := jsonb_build_object(
    'receipt_no', v_receipt,
    'paid_on', p_paid_on,
    'recorded_at', now(),
    'order_id', p_order_id,
    'so', v_order.so,
    'customer', jsonb_build_object('name', coalesce(v_order.customer_name, '')),
    'amount', p_amount,
    'method', v_method,
    'kind', p_kind,
    'reference', nullif(btrim(coalesce(p_reference, '')), ''),
    'note', nullif(btrim(coalesce(p_note, '')), ''),
    'currency', 'MYR');

  insert into order_payments
    (order_id, amount, paid_on, method, kind, reference, note, receipt_url,
     receipt_no, recorded_by, counted_in_paid, source_channel, source_reference,
     idempotency_key, source_metadata, snapshot)
  values
    (p_order_id, p_amount, p_paid_on, v_method, p_kind, nullif(btrim(coalesce(p_reference,'')),''),
     nullif(btrim(coalesce(p_note,'')),''), nullif(btrim(coalesce(p_receipt_url,'')),''),
     v_receipt, auth.uid(), (p_kind <> 'storage' and p_counts_toward_paid),
     p_source_channel, nullif(btrim(coalesce(p_source_reference,'')),''), p_idempotency_key,
     coalesce(p_source_metadata, '{}'::jsonb) || jsonb_build_object('original_method', p_method),
     v_snapshot)
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

comment on function public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean) is
  'The ONE canonical customer-payment writer (0351; 0430 widened the method dictionary; 0449 captures the immutable receipt snapshot). Ledger row, allocation, orders.paid and the receipt number are one transaction; the snapshot freezes what the receipt SAYS so a reprint can never be rewritten by later edits.';

revoke all on function public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean) from public, anon, authenticated;

commit;
