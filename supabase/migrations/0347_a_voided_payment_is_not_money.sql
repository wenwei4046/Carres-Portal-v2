-- =============================================================================
-- 0347_a_voided_payment_is_not_money.sql
-- SALES ORDER V2 · CARD 4 — MONEY TRUTH + COLLECTION GATE, the closing slice.
--
-- ⚠️ NUMBERED 0347, APPLIED AS 0346 — and that is deliberate, not a slip.
-- It went to production as tracker row `20260813034523`
-- `0346_a_voided_payment_is_not_money`, two seconds after Card 3's
-- `20260813034521 an_appointment_names_the_carrier_it_was_made_with`, which is
-- the repository's 0346. Two lanes took the same number in the same minute.
-- Card 3's landed on `main` first and red line 6 forbids altering a committed
-- migration, so THIS file is the one that moves — the rule the Card 3 chat
-- wrote into `docs/carry-forwards.md` when it found the collision, followed
-- exactly. The applied tracker row keeps its own name; the repository holds one
-- 0346 and one 0347, so no future chat can take a number from `ls` and skip
-- either. Re-running this file is safe (idempotent DDL + CREATE OR REPLACE).
--
-- 0343 made the ledger and the truth one act, and it changed VOID from a
-- DELETE into a STAMP — the right call (money history is never erased). But
-- every ledger READER in the portal was written when a void deleted the row,
-- so none of them filters `voided_at`. Re-measured 2026-08-13 on production:
-- the ledger still holds 0 rows, so nothing is wrong on screen TODAY and every
-- one of these becomes wrong the first time a principal voids a payment.
--
-- The reader fixes live in the code (one predicate, `isLivePayment`). This
-- migration closes the two halves that only SQL can:
--
--   ① A RECEIPT NUMBER IS A DOCUMENT IDENTITY, so the database enforces it.
--      `nextReceiptNo` seeds `docNumber` on {orderId}:{count+1}; two payments
--      recorded into one order in the same instant read the same count and
--      mint the SAME receipt number. Nothing stopped that being stored.
--
--   ② MONEY LEAVES A TRACE ON THE ORDER ITSELF. `payment_record` wrote
--      `audit_log` (the portal-wide compliance table) and nothing the order's
--      own Activity shows — so an operator could see `orders.paid` move with
--      no event saying who moved it or why the outstanding fell. The event
--      TAXONOMY already declares `payment.received` and `payment.voided`
--      (packages/shared/src/order-activity.ts, locked 2026-07-10) and no
--      writer had ever stamped either. No new word is invented here; the two
--      that were declared finally get their writer, inside the SAME
--      transaction as the money.
-- =============================================================================

-- ── 1 · a receipt number is unique, and the database says so ─────────────────
do $guard$
declare
  v int;
begin
  select count(*) into v from (
    select receipt_no from order_payments
     where receipt_no is not null
     group by receipt_no having count(*) > 1
  ) d;
  if v > 0 then
    raise exception '0347: % receipt numbers are already duplicated — resolve them before the index', v;
  end if;
end $guard$;

create unique index if not exists order_payments_receipt_no_uidx
  on public.order_payments (receipt_no)
  where receipt_no is not null;

comment on index public.order_payments_receipt_no_uidx is
  'A receipt number is a document identity (Jess 2026-07-19, PREFIX-DDMMYY-NNNN). The route mints it and retries on collision; this index is what makes the retry necessary rather than optional (0347).';

-- ── 2 · the one payment writer, now leaving a trace on the ORDER ─────────────
create or replace function public.payment_record(
  p_order_id   uuid,
  p_amount     numeric,
  p_paid_on    date,
  p_method     text,
  p_kind       text,
  p_reference  text default null,
  p_note       text default null,
  p_receipt_url text default null,
  p_receipt_no  text default null,
  p_counts_toward_paid boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_row  order_payments;
  v_paid numeric;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can record a payment'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_order_id is null or p_amount is null or p_amount <= 0 or p_paid_on is null then
    raise exception 'order, positive amount and paid-on date are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if p_method is null or p_method not in ('cash','bank','card','cheque','online','other') then
    raise exception '% is not a payment method', coalesce(p_method,'null')
      using errcode = '22023', detail = 'bad_method';
  end if;
  if p_kind is null or p_kind not in ('payment','deposit','storage') then
    raise exception '% is not a payment kind', coalesce(p_kind,'null')
      using errcode = '22023', detail = 'bad_kind';
  end if;
  if not exists (select 1 from orders where id = p_order_id) then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
  end if;

  insert into order_payments
    (order_id, amount, paid_on, method, kind, reference, note, receipt_url,
     receipt_no, recorded_by, counted_in_paid)
  values
    (p_order_id, p_amount, p_paid_on, p_method, p_kind,
     nullif(btrim(coalesce(p_reference,'')),''),
     nullif(btrim(coalesce(p_note,'')),''),
     nullif(btrim(coalesce(p_receipt_url,'')),''),
     nullif(btrim(coalesce(p_receipt_no,'')),''),
     v_uid,
     -- A storage collection never counts toward goods money; a mirror row
     -- explicitly says it did not bump.
     (p_kind <> 'storage' and p_counts_toward_paid))
  returning * into v_row;

  if p_kind = 'storage' then
    -- The storage gate opens with the collection — the same two facts the old
    -- route stamped, now inside the one transaction.
    insert into ops_order_control (order_id, storage_collected_at, storage_paid, updated_by)
    values (p_order_id, now(), 'Paid', v_uid)
    on conflict (order_id) do update
      set storage_collected_at = now(),
          storage_paid = 'Paid',
          updated_by = v_uid,
          updated_at = now();
    select paid into v_paid from orders where id = p_order_id;
  elsif p_counts_toward_paid then
    update orders
       set paid = coalesce(paid, 0) + p_amount,
           updated_at = now()
     where id = p_order_id
     returning paid into v_paid;
  else
    select paid into v_paid from orders where id = p_order_id;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Payment recorded · RM %s · %s · %s%s', p_amount, p_kind, p_method,
                 case when v_row.counted_in_paid then '' else ' · mirror' end),
          coalesce(v_row.receipt_no, v_row.id::text));

  -- 0347 — the order's OWN story. `payment.received` is a declared event type
  -- (order-activity.ts) that had no writer; the detail carries the figures the
  -- timeline prints, so the sentence is never re-derived from a guess.
  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (p_order_id, 'payment.received', v_uid,
          jsonb_build_object(
            'amount', p_amount,
            'kind', p_kind,
            'method', p_method,
            'receipt_no', v_row.receipt_no,
            'counted_in_paid', v_row.counted_in_paid,
            'payment_id', v_row.id));

  return jsonb_build_object(
    'payment', to_jsonb(v_row),
    'orders_paid', v_paid
  );
end;
$fn$;

revoke all on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean) from public;
revoke all on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean) from anon;
grant execute on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean) to authenticated;

-- ── 3 · a void says so on the order too ──────────────────────────────────────
create or replace function public.payment_void(
  p_payment_id uuid,
  p_reason     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_row  order_payments;
  v_paid numeric;
  v_live_storage int;
begin
  v_role := public.app_role();
  if v_role is distinct from 'principal' then
    raise exception 'forbidden: only the principal can void a payment'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  select * into v_row from order_payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment not found' using errcode = '42P01', detail = 'payment_not_found';
  end if;
  if v_row.voided_at is not null then
    raise exception 'payment is already voided' using errcode = '22023', detail = 'already_voided';
  end if;

  update order_payments
     set voided_at = now(),
         voided_by = v_uid,
         void_reason = nullif(btrim(coalesce(p_reason,'')),'')
   where id = p_payment_id;

  if v_row.kind = 'storage' then
    -- The gate closes again only when NO live storage collection remains.
    select count(*) into v_live_storage
      from order_payments
     where order_id = v_row.order_id and kind = 'storage'
       and voided_at is null and id <> p_payment_id;
    if v_live_storage = 0 then
      update ops_order_control
         set storage_collected_at = null,
             storage_paid = null,
             updated_by = v_uid,
             updated_at = now()
       where order_id = v_row.order_id;
    end if;
    select paid into v_paid from orders where id = v_row.order_id;
  elsif v_row.counted_in_paid then
    update orders
       set paid = greatest(0, coalesce(paid, 0) - v_row.amount),
           updated_at = now()
     where id = v_row.order_id
     returning paid into v_paid;
  else
    select paid into v_paid from orders where id = v_row.order_id;
  end if;

  insert into audit_log (role, actor_text, action, ref)
  values (v_role,
          (select name from app_users where id = v_uid),
          format('Payment voided · RM %s · %s%s', v_row.amount, v_row.kind,
                 case when p_reason is not null then ' · ' || btrim(p_reason) else '' end),
          coalesce(v_row.receipt_no, v_row.id::text));

  -- 0347 — the reversal is part of the order's story, not only the portal's
  -- compliance log. `payment.voided` is the declared event type.
  insert into ops_activity_log (order_id, action, actor_id, detail)
  values (v_row.order_id, 'payment.voided', v_uid,
          jsonb_build_object(
            'amount', v_row.amount,
            'kind', v_row.kind,
            'method', v_row.method,
            'receipt_no', v_row.receipt_no,
            'counted_in_paid', v_row.counted_in_paid,
            'reason', nullif(btrim(coalesce(p_reason,'')),''),
            'payment_id', v_row.id));

  return jsonb_build_object('payment_id', p_payment_id, 'orders_paid', v_paid);
end;
$fn$;

revoke all on function public.payment_void(uuid,text) from public;
revoke all on function public.payment_void(uuid,text) from anon;
grant execute on function public.payment_void(uuid,text) to authenticated;

-- ── 4 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'order_payments_receipt_no_uidx'
  ) then
    raise exception '0347 sanity: the receipt-number index is missing';
  end if;
  -- 0343's doors must survive untouched.
  if has_table_privilege('authenticated', 'public.order_payments', 'insert') then
    raise exception '0347 sanity: authenticated regained a direct INSERT on the ledger';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.order_payments'::regclass
              and polname = 'order_payments_read_internal') then
    raise exception '0347 sanity: the read policy was lost';
  end if;
  raise notice '0347 OK: a receipt number is unique and money leaves a trace on its own order';
end $sanity$;
