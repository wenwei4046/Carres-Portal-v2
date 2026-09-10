-- =============================================================================
-- 0461_customer_money_reaches_the_ledger.sql
-- FINANCE LEDGER · CARD C — THE CUSTOMER MONEY CARRES ALREADY RECORDS
-- NOW ALSO POSTS A JOURNAL ENTRY.
--
-- 0343 made money "recorded once". 0351 made it recorded once from FIVE
-- entrances — the operator's manual door, the POS top-up, the Finance AR
-- receipt, the Stripe checkout webhook and the legacy Finance trail — all of
-- which now funnel through ONE writer, `_customer_payment_post`. That single
-- funnel is the reason this card is small: there is exactly one place to wire.
--
-- What is still missing is the OTHER half of every receipt. Today a payment
-- moves `orders.paid` and writes `order_payments` + `payment_allocations`, and
-- nothing anywhere says which bank the money landed in or that the customer
-- owes RM X less than before. Carres has an operational money truth and no
-- accounting truth. 0459 gave us a chart and a start line, 0460 gave us the
-- one gate. This file walks the customer's money through it.
--
-- THE FOUR THINGS THIS MIGRATION DOES:
--
--   ① A MAP, NOT A CASE STATEMENT.  "Which account does a Visa payment hit"
--      is a question Finance must be able to answer and CHANGE without a
--      migration. `gl_payment_account_map` holds it as data, keyed by the
--      payment's method and — where it matters — the channel it arrived
--      through, because 'online' through the Stripe door and 'online' typed
--      by an operator are not the same money in the same place.
--      A method with NO row is left unmapped ON PURPOSE. An unmapped method
--      makes the posting REFUSE, loudly, naming the method. It never falls
--      back to a "miscellaneous bank" account, because a wrong posting that
--      balances is far more expensive than a payment that stops and asks.
--
--   ② THE WIRE.  `_customer_payment_post` is re-created with every existing
--      behaviour intact and ONE new step appended after its audit row:
--      it calls `gl_post`. Dr the bank/cash account the map names, Cr the
--      accounts-receivable control account with the customer as the party.
--      `payment_void` gains the mirror step: `gl_reverse`, never a delete.
--
--   ③ RULING L IS A QUIET SKIP, NOT AN ERROR.  A payment dated before
--      `gl_config.go_live_on` is recorded exactly as it is today and simply
--      does not reach the ledger. That is the whole mechanism that lets the
--      ledger start on a clean line while the operational money history keeps
--      running unbroken behind it. It is not a failure and it is not logged
--      as one.
--
--   ④ THE SECOND DOOR CLOSES.  `0002_rls.sql` opened FOR ALL write policies
--      on `payments`, `invoices` and `refunds` back when finance typed rows
--      straight into tables. 0343 shut the equivalent door on
--      `order_payments`; these three survived. They are a path around every
--      gate built since. See §5 — one is dropped outright, two are narrowed
--      to the single verb a live route still needs.
--
-- ── THE FAILURE DECISION, WRITTEN DOWN BECAUSE IT IS THE WHOLE CARD ─────────
-- If `gl_post` raises in the middle of recording a payment, there are exactly
-- three things this file could do:
--
--   (a) swallow the ledger error, commit the payment — the payment survives,
--       the journal entry is lost SILENTLY and nobody finds out until a
--       month-end that does not tie;
--   (b) queue the entry for later — needs an outbox, a worker and a retry
--       policy that do not exist in this repository, and until they do, (b)
--       IS (a) with extra steps;
--   (c) let it raise. The whole transaction rolls back. No payment row, no
--       allocation, no `orders.paid` bump, no journal entry.
--
-- This file chooses (c), and chooses it deliberately. The brief forbids both
-- silently swallowing the payment AND silently losing the entry, and in ONE
-- database transaction the only state that satisfies both is all-or-nothing.
-- (c) is also the only option whose failure is VISIBLE: the operator is
-- standing at the desk with the customer in front of them, the error names
-- the cause ("payment method 'card' has no ledger account"), and Finance fixes
-- the map in seconds with `gl_map_payment_account`. A lost journal entry has
-- no such moment — it is discovered weeks later by someone who cannot
-- reconstruct which receipts are missing.
--
-- The cost is real and is stated plainly: a misconfigured chart can stop
-- Carres taking money. Three things keep that cost small — pre-go-live
-- payments never touch the gate at all, `gl_post` is idempotent so a retry
-- after the fix succeeds, and every reason the gate can refuse is a
-- configuration row a principal can write without a deploy.
--
-- THEREFORE: NOWHERE IN THIS FILE IS THERE AN `EXCEPTION WHEN OTHERS` AROUND
-- A LEDGER CALL. That absence is the design. Do not add one.
-- =============================================================================


-- ── 1 · the map — which account does this money land in ──────────────────────
-- `method` is `order_payments.method` — the canonical six ('cash','bank',
-- 'card','cheque','online','other'), NOT the older `payment_method` enum.
-- `source_channel` is `order_payments.source_channel` ('manual_payment',
-- 'sales_top_up', 'finance_ar', 'stripe_checkout', 'legacy_finance'), or the
-- wildcard '*' meaning "any channel". A channel-specific row wins over '*'.

create table if not exists public.gl_payment_account_map (
  method         text not null check (method in ('cash','bank','card','cheque','online','other')),
  source_channel text not null default '*',
  account_code   text not null references public.gl_accounts(code),
  note           text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.app_users(id),
  primary key (method, source_channel)
);

comment on table public.gl_payment_account_map is
  'Payment method/channel -> the debit account customer money lands in (0461). A method with no row is UNMAPPED and its payments REFUSE to post; that is intentional. Never add a catch-all row.';
comment on column public.gl_payment_account_map.source_channel is
  '''*'' = any channel. A channel-specific row beats the wildcard, because ''online'' through Stripe and ''online'' typed by an operator are different money in different places.';

alter table public.gl_payment_account_map enable row level security;
revoke all on public.gl_payment_account_map from anon, authenticated;
grant select on public.gl_payment_account_map to authenticated;
drop policy if exists gl_payment_account_map_read_internal on public.gl_payment_account_map;
create policy gl_payment_account_map_read_internal on public.gl_payment_account_map
  for select using ((select public.is_internal()));
-- No insert/update/delete policy, for anyone. gl_map_payment_account is the door.


-- ── 2 · resolvers ────────────────────────────────────────────────────────────

-- The debit side. Returns null when unmapped; the CALLER raises, so that the
-- error message can name the payment as well as the method.
create or replace function public.gl_account_for_payment_method(
  p_method         text,
  p_source_channel text default null
) returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select m.account_code
    from public.gl_payment_account_map m
   where m.method = p_method
     and m.source_channel in (coalesce(p_source_channel, '*'), '*')
   order by case when m.source_channel = '*' then 1 else 0 end
   limit 1;
$fn$;

comment on function public.gl_account_for_payment_method(text,text) is
  'The account customer money of this method/channel debits (0461). NULL means unmapped — the caller must refuse, never substitute.';

-- The credit side. Deliberately NOT a hard-coded code: agent A owns the chart
-- and the ledger must not carry a second copy of its numbering. Accounts
-- receivable is identified by its SHAPE — the one active control account on the
-- asset side. Two of them, or none, is a chart error and says so.
create or replace function public.gl_ar_control_account()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_codes text[];
begin
  -- control_for, not kind. The chart has more than one asset-side control
  -- account (trade receivables AND supplier claims receivable), so "the asset
  -- one" is ambiguous and the first build raised on every single post.
  select array_agg(a.code order by a.code) into v_codes
    from public.gl_accounts a
   where a.is_control and a.is_active
     and a.control_for = 'CUSTOMER' and a.kind = 'ASSET';

  if v_codes is null or array_length(v_codes, 1) = 0 then
    raise exception 'the chart has no active accounts-receivable control account'
      using errcode = '22023', detail = 'ar_control_missing';
  end if;
  if array_length(v_codes, 1) > 1 then
    raise exception 'the chart has % active asset control accounts (%) — accounts receivable is ambiguous',
      array_length(v_codes, 1), array_to_string(v_codes, ', ')
      using errcode = '22023', detail = 'ar_control_ambiguous';
  end if;
  return v_codes[1];
end;
$fn$;

-- The party. Carres orders carry `customer_name` / `customer_phone` TEXT and
-- have no `customer_id` at all — `customers` (0247) is keyed by the canonical
-- phone (`pwp_phone_key`), and 0262/0267 already resolve a customer this exact
-- way. The ledger's party rule needs an ID, so this resolves the canonical
-- phone to a customer row and CREATES one when the phone is new. That creation
-- is not a liberty: without it almost no Carres payment could name its party.
--
-- An order with no phone at all cannot be given a ledger party and the payment
-- refuses. From go-live forward a customer paying money has a contactable
-- number; before go-live nothing posts anyway.
create or replace function public.gl_customer_party_for_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_order     orders;
  v_phone_key text;
  v_id        uuid;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;

  v_phone_key := case
    when nullif(btrim(coalesce(v_order.customer_phone, '')), '') is null then null
    else public.pwp_phone_key(v_order.customer_phone)
  end;

  if v_phone_key is null or v_phone_key = '' then
    raise exception 'this order has no customer phone, so the payment cannot name a ledger party — add the phone to the order and record the payment again'
      using errcode = '22023', detail = 'customer_identity_required';
  end if;

  select c.id into v_id from customers c where c.phone_key = v_phone_key;
  if found then
    return v_id;
  end if;

  insert into customers (name, phone, phone_key, created_by)
  values (coalesce(nullif(btrim(v_order.customer_name), ''), 'Customer'),
          v_order.customer_phone, v_phone_key, auth.uid())
  on conflict (phone_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- Lost the race to a concurrent insert; the winner's row is the answer.
    select c.id into v_id from customers c where c.phone_key = v_phone_key;
  end if;
  if v_id is null then
    raise exception 'could not resolve a customer party for this order'
      using errcode = '22023', detail = 'customer_identity_required';
  end if;
  return v_id;
end;
$fn$;

revoke all on function public.gl_account_for_payment_method(text,text) from public, anon;
revoke all on function public.gl_ar_control_account() from public, anon;
revoke all on function public.gl_customer_party_for_order(uuid) from public, anon, authenticated;
grant execute on function public.gl_account_for_payment_method(text,text) to authenticated;
grant execute on function public.gl_ar_control_account() to authenticated;


-- ── 3 · the wire — one payment row becomes one journal entry ─────────────────
-- Called with a payment row already written. Returns the gl_entries.id, or
-- null when this payment is deliberately not a ledger event.
--
-- The one quiet skip, and only this one:
--   · paid_on < gl_config.go_live_on   — ruling L. The clean start line.
--
-- There used to be a second skip here, for kind = 'storage', on the grounds
-- that the chart had no storage-income account. It has one (4400), and 0464
-- recognises storage revenue when the invoice is issued — so a storage
-- collection IS an ordinary settlement of a receivable, and skipping it
-- overstated receivables by exactly the storage cash taken. Now posted like
-- any other receipt.
create or replace function public._customer_payment_to_ledger(p_payment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_pay      order_payments;
  v_go_live  date;
  v_bank     text;
  v_ar       text;
  v_party    uuid;
  v_doc_no   text;
  v_amount   numeric(12,2);
begin
  select * into v_pay from order_payments where id = p_payment_id;
  if not found then
    raise exception 'payment not found' using errcode = '42P01', detail = 'payment_not_found';
  end if;


  select go_live_on into v_go_live from gl_config where id;
  if v_go_live is null then
    raise exception 'the ledger has no go-live date — gl_config is not configured'
      using errcode = '22023', detail = 'gl_not_configured';
  end if;
  if v_pay.paid_on < v_go_live then
    return null;                       -- ruling L. Quietly. Not an error.
  end if;

  v_amount := round(v_pay.amount, 2);
  if v_amount <= 0 then
    raise exception 'a payment of % cannot be posted', v_pay.amount
      using errcode = '22023', detail = 'invalid_amount';
  end if;

  v_bank := public.gl_account_for_payment_method(v_pay.method, v_pay.source_channel);
  if v_bank is null then
    raise exception 'payment method % (channel %) has no ledger account — map it with gl_map_payment_account before recording this payment',
      coalesce(v_pay.method, 'null'), coalesce(v_pay.source_channel, 'null')
      using errcode = '22023', detail = 'payment_account_unmapped';
  end if;

  v_ar    := public.gl_ar_control_account();
  v_party := public.gl_customer_party_for_order(v_pay.order_id);
  v_doc_no := coalesce(nullif(btrim(coalesce(v_pay.receipt_no, '')), ''), v_pay.id::text);

  return public.gl_post(
    'CUSTOMER_PAYMENT',
    v_doc_no,
    v_pay.paid_on,
    format('Customer payment %s · %s', v_doc_no, v_pay.method),
    jsonb_build_array(
      jsonb_build_object(
        'account_code', v_bank,
        'debit',  v_amount,
        'credit', 0,
        'memo',   format('%s receipt %s', v_pay.method, v_doc_no)
      ),
      jsonb_build_object(
        'account_code', v_ar,
        'debit',  0,
        'credit', v_amount,
        'party_type', 'CUSTOMER',
        'party_id',   v_party,
        'memo',       format('Settlement against order %s', v_pay.order_id)
      )
    )
  );
end;
$fn$;

revoke all on function public._customer_payment_to_ledger(uuid) from public, anon, authenticated;


-- ── 4 · the canonical writer, unchanged, plus the ledger step ────────────────
-- Every line below down to the audit_log insert is 0351's function verbatim.
-- The signature is identical, the behaviour is identical, the return shape is
-- identical. The ONLY addition is the `_customer_payment_to_ledger` call after
-- the audit row, and the `gl_entry_id` key it adds to the returned object —
-- additive, so every existing caller that reads 'payment' / 'payment_id' /
-- 'orders_paid' / 'already' is untouched.
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
  v_entry uuid;
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

  -- ── 0461 · the ledger. No exception handler, by design. ────────────────────
  -- If this raises, the payment above rolls back with it. See the header.
  v_entry := public._customer_payment_to_ledger(v_row.id);

  return jsonb_build_object('already', false, 'payment', to_jsonb(v_row),
                            'payment_id', v_row.id, 'orders_paid', v_paid,
                            'gl_entry_id', v_entry);
end;
$fn$;
revoke all on function public._customer_payment_post(uuid,numeric,date,text,text,text,text,text,text,text,text,text,jsonb,boolean) from public, anon, authenticated;


-- ── 4b · a void contra-reverses the entry; it never deletes it ───────────────
-- 0351's `payment_void` verbatim, plus the `gl_reverse` step. Signature,
-- role gate, storage-gate behaviour, `orders.paid` arithmetic and return shape
-- are all unchanged; `gl_entry_id` is added to the return, additively.
create or replace function public.payment_void(p_payment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_row order_payments; v_paid numeric; v_live_storage integer;
  v_doc_no text; v_entry uuid; v_contra uuid;
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

  -- ── 0461 · contra-reverse the journal entry, if this payment ever made one.
  -- A payment recorded before go-live has no entry; that is the quiet skip,
  -- not a failure. Anything else that goes wrong rolls the void back.
  v_doc_no := coalesce(nullif(btrim(coalesce(v_row.receipt_no, '')), ''), v_row.id::text);
  select e.id into v_entry from gl_entries e
   where e.source_type = 'CUSTOMER_PAYMENT' and e.source_doc_no = v_doc_no
     and e.posted and not e.reversed;
  if v_entry is not null then
    v_contra := public.gl_reverse(v_entry,
      coalesce(nullif(btrim(coalesce(p_reason,'')),''), 'Payment voided'));
  end if;

  return jsonb_build_object('payment_id',p_payment_id,'orders_paid',v_paid,'gl_entry_id',v_contra);
end;
$fn$;
revoke all on function public.payment_void(uuid,text) from public, anon;
grant execute on function public.payment_void(uuid,text) to authenticated;


-- ── 4c · Finance fills a gap in the map without a deploy ─────────────────────
create or replace function public.gl_map_payment_account(
  p_method         text,
  p_account_code   text,
  p_source_channel text default '*',
  p_note           text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_principal() then
    raise exception 'forbidden: only the principal can map a payment account'
      using errcode = '42501', detail = 'forbidden';
  end if;
  if p_method not in ('cash','bank','card','cheque','online','other') then
    raise exception '% is not a payment method', coalesce(p_method,'null')
      using errcode = '22023', detail = 'bad_method';
  end if;
  if not exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_active) then
    raise exception 'account % is not an active account in the chart', coalesce(p_account_code,'null')
      using errcode = '22023', detail = 'account_not_found';
  end if;
  if exists (select 1 from gl_accounts a where a.code = p_account_code and a.is_control) then
    raise exception 'account % is a control account — customer money never debits a control account',
      p_account_code using errcode = '22023', detail = 'account_is_control';
  end if;
  if exists (select 1 from gl_accounts c where c.parent_code = p_account_code) then
    raise exception 'account % is a header — post to one of its children', p_account_code
      using errcode = '22023', detail = 'account_is_header';
  end if;

  insert into gl_payment_account_map (method, source_channel, account_code, note, updated_by)
  values (p_method, coalesce(nullif(btrim(p_source_channel), ''), '*'), p_account_code,
          nullif(btrim(coalesce(p_note,'')),''), auth.uid())
  on conflict (method, source_channel) do update
    set account_code = excluded.account_code,
        note         = excluded.note,
        updated_at   = now(),
        updated_by   = excluded.updated_by;
end;
$fn$;

revoke all on function public.gl_map_payment_account(text,text,text,text) from public, anon;
grant execute on function public.gl_map_payment_account(text,text,text,text) to authenticated;


-- ── 4d · seed the map against whatever chart 0459 actually created ───────────
-- The chart's CODES belong to agent A, so this seed matches on account NAME
-- inside the asset, active, non-control, non-header leaves — and where it
-- finds nothing it writes NOTHING. 'other' is never seeded: it is the
-- catch-all bucket `_customer_payment_post` falls into for an unrecognised
-- method, and a catch-all mapped to a real bank account is exactly the wrong
-- posting this file exists to prevent. 'card' and 'online' are seeded only if
-- a merchant/gateway account exists; settling them into the general bank
-- account by default would hide the processor float.
do $seed$
declare
  v_cash text;
  v_bank text;
  v_card text;
  v_gate text;
  v_seeded int := 0;
begin
  select a.code into v_cash from gl_accounts a
   where a.is_active and not a.is_control and a.kind = 'ASSET'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and (a.name ilike 'cash%' or a.name ilike '%cash in hand%' or a.name ilike '%petty cash%')
   order by a.code limit 1;

  select a.code into v_bank from gl_accounts a
   where a.is_active and not a.is_control and a.kind = 'ASSET'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and a.name ilike '%bank%'
   order by a.code limit 1;

  select a.code into v_card from gl_accounts a
   where a.is_active and not a.is_control and a.kind = 'ASSET'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and (a.name ilike '%merchant%' or a.name ilike '%card%' or a.name ilike '%terminal%')
   order by a.code limit 1;

  select a.code into v_gate from gl_accounts a
   where a.is_active and not a.is_control and a.kind = 'ASSET'
     and not exists (select 1 from gl_accounts c where c.parent_code = a.code)
     and (a.name ilike '%stripe%' or a.name ilike '%gateway%' or a.name ilike '%online%')
   order by a.code limit 1;

  -- cash over the counter.
  if v_cash is not null then
    insert into gl_payment_account_map(method, source_channel, account_code, note)
    values ('cash','*', v_cash, 'Cash taken at the counter (0461 seed)')
    on conflict do nothing; v_seeded := v_seeded + 1;
  end if;

  -- a transfer, and a cheque, both land in the bank.
  if v_bank is not null then
    insert into gl_payment_account_map(method, source_channel, account_code, note)
    values ('bank','*', v_bank, 'Bank transfer (0461 seed)')
    on conflict do nothing; v_seeded := v_seeded + 1;
    insert into gl_payment_account_map(method, source_channel, account_code, note)
    values ('cheque','*', v_bank, 'Cheque banked (0461 seed) — remap if a cheque-clearing account is added')
    on conflict do nothing; v_seeded := v_seeded + 1;
  end if;

  -- terminal card, only if the chart holds a merchant account.
  if v_card is not null then
    insert into gl_payment_account_map(method, source_channel, account_code, note)
    values ('card','*', v_card, 'Card terminal settlement (0461 seed)')
    on conflict do nothing; v_seeded := v_seeded + 1;
  end if;

  -- the online gateway, only if the chart holds one. The Stripe channel gets
  -- its own row so a later second gateway does not need a schema change.
  if v_gate is not null then
    insert into gl_payment_account_map(method, source_channel, account_code, note)
    values ('online','*', v_gate, 'Online gateway (0461 seed)')
    on conflict do nothing; v_seeded := v_seeded + 1;
    insert into gl_payment_account_map(method, source_channel, account_code, note)
    values ('online','stripe_checkout', v_gate, 'Stripe checkout (0461 seed)')
    on conflict do nothing; v_seeded := v_seeded + 1;
  end if;

  raise notice '0461 seed: % mapping row(s) written', v_seeded;
  if v_cash is null then raise warning '0461: payment method ''cash'' is UNMAPPED — cash payments will refuse to post until gl_map_payment_account names an account'; end if;
  if v_bank is null then raise warning '0461: payment methods ''bank'' and ''cheque'' are UNMAPPED — they will refuse to post until gl_map_payment_account names an account'; end if;
  if v_card is null then raise warning '0461: payment method ''card'' is UNMAPPED — deliberately not defaulted to the bank account; map it explicitly'; end if;
  if v_gate is null then raise warning '0461: payment method ''online'' is UNMAPPED — deliberately not defaulted to the bank account; map it explicitly'; end if;
  raise warning '0461: payment method ''other'' is UNMAPPED and stays that way — it is the unrecognised-method bucket and must never carry a default account';
end $seed$;


-- ── 5 · the three legacy write doors from 0002_rls.sql ───────────────────────
-- Measured before touching anything (grep over apps/api/src and apps/web/src):
--
--   payments_write_finance  (0002_rls.sql:282)  FOR ALL to finance/principal.
--       Permitted INSERT, UPDATE and DELETE of any `payments` row — customer
--       receipts, supplier payouts, refund payouts — straight through
--       PostgREST. NOTHING in the application uses it: the only reference to
--       the table is a SELECT at apps/api/src/routes/finance/payments.ts:68.
--       0351 already had to bolt a trigger on the table
--       (`payments_reject_customer_order_write`) to stop this door creating a
--       second customer-order truth. DROPPED OUTRIGHT — the trigger stops
--       being the last line of defence, and DELETE of a money row stops being
--       possible at all. `payments_scoped_read` keeps every existing read.
--
--   invoices_write_finance  (0002_rls.sql:292)  FOR ALL to finance/principal.
--       Permitted INSERT, UPDATE and DELETE of `invoices`. One live
--       dependency: the invoice VOID at
--       apps/api/src/routes/finance/invoices.ts:129 stamps `voided_at`
--       through the user's own client. Issuing runs through the security
--       definer `issue_order_invoice` (0229) and the 0098 dispatch trigger,
--       both of which bypass RLS. NARROWED to FOR UPDATE — the void keeps
--       working, minting an invoice by hand and deleting one both stop.
--
--   refunds_write_finance   (0002_rls.sql:302)  FOR ALL to finance/principal.
--       Permitted INSERT, UPDATE and DELETE of the legacy `refunds` table.
--       One live dependency: apps/api/src/routes/finance/refunds.ts:118
--       INSERTs the refund row through the user's client. (The canonical
--       obligation table is `order_refunds` from 0345, which already revokes
--       direct writes; this legacy table still runs the Finance refund
--       screen.) NARROWED to FOR INSERT — the route keeps working, and
--       rewriting or deleting a refund after the fact stops.
--
-- DELETE is removed from all three. No money row in Carres is ever deleted.

drop policy if exists payments_write_finance on public.payments;

drop policy if exists invoices_write_finance on public.invoices;
create policy invoices_write_finance on public.invoices
  for update
  using      ((select public.app_role()) in ('finance','principal'))
  with check ((select public.app_role()) in ('finance','principal'));

drop policy if exists refunds_write_finance on public.refunds;
create policy refunds_write_finance on public.refunds
  for insert
  with check ((select public.app_role()) in ('finance','principal'));

revoke delete on public.payments, public.invoices, public.refunds from authenticated;
revoke insert, update on public.payments from authenticated;

comment on table public.payments is
  'Legacy money table. The FOR ALL write policy was dropped in 0461 — customer receipts belong to order_payments via _customer_payment_post, and nothing in the application writes here through PostgREST.';


-- ── 6 · sanity — schema shape only, never a production row count ─────────────
do $sanity$
declare
  v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('gl_account_for_payment_method','gl_ar_control_account',
                       'gl_customer_party_for_order','_customer_payment_to_ledger',
                       'gl_map_payment_account');
  if v < 5 then
    raise exception '0461 sanity: expected the five ledger-bridge functions, got %', v;
  end if;

  -- The canonical writer must still carry its exact 14-argument signature.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = '_customer_payment_post'
       and pg_get_function_identity_arguments(p.oid) =
           'uuid, numeric, date, text, text, text, text, text, text, text, text, text, jsonb, boolean'
  ) then
    raise exception '0461 sanity: _customer_payment_post lost its signature';
  end if;

  if exists (select 1 from pg_policy where polrelid = 'public.payments'::regclass
              and polname = 'payments_write_finance') then
    raise exception '0461 sanity: the payments write door survived';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.payments'::regclass
              and polname = 'payments_scoped_read') then
    raise exception '0461 sanity: the payments read policy was lost';
  end if;

  -- 'w' = UPDATE, 'a' = INSERT in pg_policy.polcmd.
  if not exists (select 1 from pg_policy where polrelid = 'public.invoices'::regclass
              and polname = 'invoices_write_finance' and polcmd = 'w') then
    raise exception '0461 sanity: the invoice void door is not UPDATE-only';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.refunds'::regclass
              and polname = 'refunds_write_finance' and polcmd = 'a') then
    raise exception '0461 sanity: the refund door is not INSERT-only';
  end if;

  if has_table_privilege('authenticated', 'public.payments', 'insert')
     or has_table_privilege('authenticated', 'public.payments', 'delete')
     or has_table_privilege('authenticated', 'public.invoices', 'delete')
     or has_table_privilege('authenticated', 'public.refunds', 'delete') then
    raise exception '0461 sanity: a money table can still be written or deleted directly';
  end if;

  if has_table_privilege('authenticated', 'public.gl_payment_account_map', 'insert') then
    raise exception '0461 sanity: the payment account map is directly writable';
  end if;

  raise notice '0461 OK: customer money reaches the ledger, and the three legacy write doors are shut';
end $sanity$;
