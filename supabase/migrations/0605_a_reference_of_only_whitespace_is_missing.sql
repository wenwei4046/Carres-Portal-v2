-- ════════════════════════════════════════════════════════════════════════════
-- 0605 · A REFERENCE OF ONLY WHITESPACE IS MISSING
--
-- WHAT WAS BROKEN
-- The §16 reference rule lives in two places: the one customer-payment writer,
-- _customer_payment_post (latest body 0604), and the helper the other money
-- doors call, _payment_reference_guard (0559). Both judged "blank" with
-- nullif(btrim(coalesce(p_reference, '')), '') is null. One-argument btrim()
-- strips the space character and nothing else, so a reference that was one
-- tab, one line break or one carriage return counted as filled in. A cheque,
-- card, bank transfer or DuitNow QR payment could be saved with an invisible
-- reference, and Finance had nothing to reconcile it with.
--
-- 0560 ("a blank answer is not an answer") fixed this idiom in 80 other
-- functions with coalesce(X, '') !~ '[^[:space:]]', but left these two alone
-- because 0551 was still being rewritten.
--
-- WHAT THIS CHANGES
-- Both places now ask the same question: is there one character in the
-- reference that is not whitespace and not a no-break space?
--
--     coalesce(p_reference, '') !~ '[^[:space:]\u00a0]'
--
-- This is 0560's test with the no-break space (U+00A0) named. [:space:]
-- follows the database's locale, and on Linux (glibc, which is what production
-- runs on) the no-break space is NOT in it; on a Windows build it is. Naming
-- it makes the rule the same everywhere. Tab, line feed, carriage return,
-- vertical tab and form feed are in [:space:] in every locale. The no-break
-- space is written as the regex escape (backslash, u00a0), never as the
-- invisible character itself, so the file shows what it tests.
--
-- Nothing else in either body moves. The sentences, the methods that are asked,
-- cash and online staying optional, the stored reference (still btrimmed as
-- before), grants, security definer, search_path and both function comments
-- are all as they were. create or replace keeps a function's comment, so
-- neither comment is restated here; the grants are restated word for word.
-- The writer body is 0604's; the helper body is 0559's (nothing after 0559
-- redefines it).
--
-- DATA: none. No row is read, written or backfilled. Payments already saved
-- with a whitespace-only reference stay as they are. No RLS change.
-- DR/CR: none. The journal entry (0463) is untouched; a refused payment rolls
-- back before anything is written.
-- Safe to run twice: create or replace, revoke and grant repeat cleanly.

begin;

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
  v_snapshot jsonb;   -- 0449
  v_entry uuid;       -- 0463
  v_go_live date;     -- 0476
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
  -- 0476: the method is a KEY. payment_method_key folds spelling and the
  -- aliases (bank_transfer → bank, credit / installment → card); a method
  -- registered in Settings → Payment is accepted as itself.
  v_method := public.payment_method_key(p_method);
  -- 0535: no method, no payment. Nothing guesses how the customer paid.
  if v_method is null then
    raise exception 'choose how the customer paid'
      using errcode = '22023', detail = 'payment_method_required';
  end if;
  -- 0535: the §16 reference each method needs, checked here for every door.
  -- 0604 (was 0551): and the two Chew unified — a transfer and a DuitNow QR payment each
  -- carry the reference their slip shows. Cash and online are not here: cash's
  -- receipt number is this function's own, and Stripe's online money arrives
  -- with no code a person could type.
  -- 0605: blank means no character that is not whitespace or a no-break space,
  -- the same test _payment_reference_guard uses.
  if coalesce(p_reference, '') !~ '[^[:space:]\u00a0]' then
    if v_method = 'cheque' then
      raise exception 'a cheque payment needs its cheque number'
        using errcode = '22023', detail = 'payment_reference_required';
    elsif v_method in ('card', 'credit_card', 'debit_card') then
      raise exception 'a card payment needs its approval code'
        using errcode = '22023', detail = 'payment_reference_required';
    elsif v_method = 'bank' then
      raise exception 'a bank transfer needs its reference number'
        using errcode = '22023', detail = 'payment_reference_required';
    elsif v_method = 'duitnow_qr' then
      raise exception 'a DuitNow QR payment needs its reference number'
        using errcode = '22023', detail = 'payment_reference_required';
    end if;
  end if;
  if not (v_method in ('cash','bank','card','cheque','online','other',
                          'duitnow_qr','credit_card','debit_card')
             or exists (select 1 from payment_manual_methods m where m.method = v_method)) then
    v_method := 'other';
  end if;

  -- 0476: money with nowhere to land is refused before anything is written,
  -- and the refusal names the method the caller actually sent.
  select go_live_on into v_go_live from gl_config where id;
  if v_go_live is not null and p_paid_on >= v_go_live
     and public.gl_account_for_payment_method(v_method, p_source_channel) is null then
    raise exception 'payment method "%" has no money account — add it in Settings → Payment → Payment methods, then record this payment',
      coalesce(nullif(btrim(coalesce(p_method, '')), ''), 'none')
      using errcode = '22023', detail = 'payment_account_unmapped';
  end if;

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
  -- 0476 — and the method's NAME as it read that day, so a renamed method
  -- never rewrites a printed receipt.
  v_snapshot := jsonb_build_object(
    'receipt_no', v_receipt,
    'paid_on', p_paid_on,
    'recorded_at', now(),
    'order_id', p_order_id,
    'so', v_order.so,
    'customer', jsonb_build_object('name', coalesce(v_order.customer_name, '')),
    'amount', p_amount,
    'method', v_method,
    'method_label', (select m.label from payment_manual_methods m where m.method = v_method),
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
    -- 0535: name the order's issued Sales Invoice (at most one live, 0429).
    insert into payment_allocations(payment_id, order_id, invoice_id, amount, allocated_by)
    values (v_row.id, p_order_id,
            (select i.id from invoices i
              where i.order_id = p_order_id and i.kind = 'sales' and i.status = 'issued'),
            p_amount, auth.uid());
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

  -- ── 0463 · the ledger. No exception handler, by design. ────────────────────
  -- If this raises, the payment above rolls back with it. See the header.
  v_entry := public._customer_payment_to_ledger(v_row.id);

  return jsonb_build_object('already', false, 'payment', to_jsonb(v_row),
                            'payment_id', v_row.id, 'orders_paid', v_paid,
                            'gl_entry_id', v_entry);
end;
$fn$;

revoke all on function public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean) from public, anon, authenticated;

create or replace function public._payment_reference_guard(
  p_method text,
  p_reference text
) returns void
language plpgsql immutable
as $fn$
declare
  v_method text;
begin
  -- 0605: the same blank test as _customer_payment_post.
  if coalesce(p_reference, '') ~ '[^[:space:]\u00a0]' then
    return;
  end if;
  v_method := public.payment_method_key(p_method);
  if v_method = 'cheque' then
    raise exception 'a cheque payment needs its cheque number'
      using errcode = '22023', detail = 'payment_reference_required';
  elsif v_method in ('card', 'credit_card', 'debit_card') then
    raise exception 'a card payment needs its approval code'
      using errcode = '22023', detail = 'payment_reference_required';
  elsif v_method = 'bank' then
    raise exception 'a bank transfer needs its reference number'
      using errcode = '22023', detail = 'payment_reference_required';
  elsif v_method = 'duitnow_qr' then
    raise exception 'a DuitNow QR payment needs its reference number'
      using errcode = '22023', detail = 'payment_reference_required';
  end if;
end;
$fn$;

revoke all on function public._payment_reference_guard(text,text) from public, anon;
grant execute on function public._payment_reference_guard(text,text) to authenticated, service_role;

-- ── sanity ─────────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_w text;
  v_g text;
  v_ws text;
begin
  select prosrc into v_w from pg_proc where oid = to_regprocedure(
    'public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean)');
  select prosrc into v_g from pg_proc where oid = to_regprocedure('public._payment_reference_guard(text,text)');
  if v_w is null or v_g is null then
    raise exception '0605 sanity: the writer or the guard lost its signature';
  end if;
  if position('!~ ''[^[:space:]\u00a0]''' in v_w) = 0 or position('~ ''[^[:space:]\u00a0]''' in v_g) = 0 then
    raise exception '0605 sanity: the writer and the guard do not share the blank test';
  end if;
  if position('coalesce(p_reference, '''')), '''') is null' in v_w) > 0
     or position('coalesce(p_reference, '''')), '''') is not null' in v_g) > 0 then
    raise exception '0605 sanity: the old btrim blank test is still in place';
  end if;
  -- The test itself, in this database's own locale.
  foreach v_ws in array array[E'\t', E'\n', E'\r', E'\u00a0', E' \t\r\n\u00a0 '] loop
    if v_ws ~ '[^[:space:]\u00a0]' then
      raise exception '0605 sanity: whitespace % reads as a reference here', to_hex(ascii(v_ws));
    end if;
  end loop;
  if ' 12345 ' !~ '[^[:space:]\u00a0]' then
    raise exception '0605 sanity: a real reference reads as blank';
  end if;
  if has_function_privilege('anon',
       'public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean)', 'execute')
     or has_function_privilege('anon', 'public._payment_reference_guard(text,text)', 'execute') then
    raise exception '0605 sanity: anon may execute the writer or the guard';
  end if;
end;
$sanity$;

commit;
