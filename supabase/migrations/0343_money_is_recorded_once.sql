-- =============================================================================
-- 0343_money_is_recorded_once.sql
-- SALES ORDER V2 · CARD 4 — MONEY TRUTH + COLLECTION GATE
-- (owner ruling 2026-08-11, docs/orders/MASTER.md).
--
-- The Card 4 trace (2026-08-11) measured what ALREADY stands:
--   · ONE calculation — `orderMoney` (`orders.paid` is the truth), four readers;
--   · the DO door hard-refuses on money (`deliveryOrderIssueGate`, 422 tested);
--   · PayHold 🔒 and "delivered ≠ paid" (collect survives delivery) — live;
--   · `ops_order_control.paid_amount` — 0 rows; `payment_status` — 1 row;
--     `order_payments` — 0 rows (a ledger with writers and no reader of truth).
--
-- And the one thing the ruling demands that does NOT stand: **"Payment is
-- recorded once, changes money truth once, and every reader derives the same
-- answer."** Today the desk's Record-payment door writes ONLY the dead ledger
-- — `orders.paid`, the figure every gate reads, never moves. An operator can
-- record a customer's balance and the DO door still refuses the delivery.
-- The void door is worse: it hard-DELETES the ledger row.
--
-- THIS MIGRATION MAKES THE LEDGER AND THE TRUTH ONE ACT:
--   ① `payment_record(...)` — the ONE payment writer. Ledger row + orders.paid
--      bump (goods kinds) or the storage gate stamp (storage kind) in one
--      transaction. `p_counts_toward_paid=false` records a HISTORY MIRROR of a
--      deposit already inside orders.paid (the raw-create door wrote it at
--      birth) — stored on the row (`counted_in_paid`) so void knows what to
--      reverse.
--   ② `payment_void(...)` — principal only. Stamps voided_at/by/reason (the
--      row is never deleted) and reverses exactly what the record did.
--   ③ The direct PostgREST write door closes: the FOR ALL policy drops, and
--      authenticated loses INSERT/UPDATE/DELETE. Reads stay internal.
--      ("A compatibility write door is the hidden authority" — Card 4B's law.)
--
-- Receipt numbers move onto the LOCKED document scheme (PREFIX-DDMMYY-NNNN,
-- Jess 2026-07-19) — the payment MASTER has required it all along, the route
-- minted `R{so}-{n}` instead, and the ledger holds ZERO rows, so adopting the
-- law costs nothing. The number is minted by the ONE TS helper (`docNumber`)
-- in the route and handed to the RPC — never spelt a second time in SQL.
-- =============================================================================

-- ── 1 · void is a stamp, and a record knows if it counted ────────────────────
alter table public.order_payments
  add column if not exists counted_in_paid boolean not null default true,
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid references auth.users(id),
  add column if not exists void_reason text;

comment on column public.order_payments.counted_in_paid is
  'True = this row bumped orders.paid when recorded (0343). False = a history mirror of money already inside orders.paid (the raw-create deposit).';
comment on column public.order_payments.voided_at is
  'A void is a STAMP, never a delete (0343). A voided row reversed its own orders.paid contribution.';

-- ── 2 · the ONE payment writer ───────────────────────────────────────────────
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

  return jsonb_build_object(
    'payment', to_jsonb(v_row),
    'orders_paid', v_paid
  );
end;
$fn$;

revoke all on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean) from public;
revoke all on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean) from anon;
grant execute on function public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean) to authenticated;

-- ── 3 · void reverses exactly what the record did ────────────────────────────
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

  return jsonb_build_object('payment_id', p_payment_id, 'orders_paid', v_paid);
end;
$fn$;

revoke all on function public.payment_void(uuid,text) from public;
revoke all on function public.payment_void(uuid,text) from anon;
grant execute on function public.payment_void(uuid,text) to authenticated;

-- ── 4 · the direct write door closes ─────────────────────────────────────────
drop policy if exists order_payments_write_op_principal on public.order_payments;
revoke insert, update, delete on public.order_payments from authenticated;
-- Reads stay: order_payments_read_internal (is_internal) is untouched.

-- ── 5 · sanity ───────────────────────────────────────────────────────────────
do $sanity$
declare
  v int;
begin
  select count(*) into v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('payment_record','payment_void');
  if v <> 2 then
    raise exception '0343 sanity: expected the two payment RPCs, got %', v;
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.order_payments'::regclass
              and polname = 'order_payments_write_op_principal') then
    raise exception '0343 sanity: the direct write policy survived';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.order_payments'::regclass
              and polname = 'order_payments_read_internal') then
    raise exception '0343 sanity: the read policy was lost';
  end if;
  if has_table_privilege('authenticated', 'public.order_payments', 'insert') then
    raise exception '0343 sanity: authenticated can still INSERT the ledger directly';
  end if;
  if has_function_privilege('anon', 'public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean)', 'execute') then
    raise exception '0343 sanity: payment_record callable by anon';
  end if;
  raise notice '0343 OK: money is recorded once and voids reverse exactly what they undo';
end $sanity$;
