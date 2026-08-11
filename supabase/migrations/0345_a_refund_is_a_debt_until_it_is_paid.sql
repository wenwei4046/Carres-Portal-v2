-- =============================================================================
-- 0345_a_refund_is_a_debt_until_it_is_paid.sql
-- SALES ORDER V2 · CARD 7 — CHANGE / CANCEL / REFUND LINEAGE
-- (owner ruling 2026-08-11, docs/orders/MASTER.md).
--
-- The Card 7 trace (2026-08-11) measured the LINEAGE largely already true:
--   · change lineage — the immutable revision ledger (0327) + change_type
--     (0340) + the order_change_requests lane (Card 1's recorded boundary);
--   · cancel — `cancel_order` flips status with actor + reason + server time
--     and deletes nothing, and it structurally refuses a proceeded order
--     (only 'place' cancels), which IS the §3.14 lock's "cancel is not
--     allowed by default"; `operation_cancel_po` cancels the document, voids
--     only never-arrived units, keeps every row;
--   · fulfilment consequences — delivery_attempts (0344) are append-only,
--     unit ref_history survives every move (0137/0341), a committed unit
--     cannot be hard-deleted (0341), GATE 7 (0340) freezes a cancelled
--     order's contractual fields.
--
-- What did NOT exist anywhere: THE REFUND RECORD — bilateral money's second
-- direction, deferred here by Card 4 by name. The ruling:
--
--   "A cancelled or changed goods obligation may become a money obligation.
--    Goods no longer owed does not mean the SO is clear: an approved but
--    unpaid refund means Carres STILL OWES the customer."
--
-- THE MODEL: a refund is a structured obligation with a lifecycle —
-- requested → approved | rejected → paid — never a note. Approval is the
-- PRINCIPAL's (the same law as the storage-waiver decide: releasing money is
-- a manager decision). Recording the payout does not touch `orders.paid`:
-- that column is money IN against goods; a refund is money OUT, its own
-- record, read by Card 8's derived completion (`status='approved'` = the SO
-- is NOT clear). Rows are never deleted; a wrong request is REJECTED with a
-- note, and history stands.
-- =============================================================================

create table if not exists public.order_refunds (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete restrict,
  amount       numeric(12,2) not null check (amount > 0),
  reason       text not null check (btrim(reason) <> ''),
  status       text not null default 'requested'
               check (status in ('requested','approved','rejected','paid')),
  requested_by uuid references auth.users(id),
  requested_at timestamptz not null default now(),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  decide_note  text,
  paid_at      timestamptz,
  paid_by      uuid references auth.users(id),
  paid_method  text check (paid_method is null or paid_method in
                 ('cash','bank','card','cheque','online','other')),
  paid_reference text,
  -- A decision carries its stamp; a payout carries its facts.
  constraint order_refunds_decision_stamped
    check ((status in ('requested')) = (decided_at is null)),
  constraint order_refunds_paid_stamped
    check ((status = 'paid') = (paid_at is not null))
);
create index if not exists order_refunds_order_idx on public.order_refunds(order_id);
create index if not exists order_refunds_open_idx on public.order_refunds(order_id)
  where status in ('requested','approved');

comment on table public.order_refunds is
  'Carres → customer money obligations (SO V2 Card 7, 0345). requested → approved|rejected (principal) → paid. An APPROVED, UNPAID refund means the SO is not clear — Card 8 reads it. Rows are never deleted; a wrong ask is rejected with a note.';

alter table public.order_refunds enable row level security;
drop policy if exists order_refunds_read_internal on public.order_refunds;
create policy order_refunds_read_internal on public.order_refunds
  for select using ((select public.is_internal()));
revoke insert, update, delete on public.order_refunds from authenticated, anon;

-- A refund row is history: no deletes, ever. Updates come only through the
-- DEFINER RPCs (no grants, no write policy).
create or replace function public.order_refunds_no_delete()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'a refund record is never deleted — reject it with a note instead'
    using errcode = 'P0001', detail = 'refund_not_deletable';
end;
$fn$;
drop trigger if exists order_refunds_no_delete on public.order_refunds;
create trigger order_refunds_no_delete
  before delete on public.order_refunds
  for each row execute function public.order_refunds_no_delete();

-- ── the three doors ──────────────────────────────────────────────────────────
create or replace function public.refund_request(
  p_order_id uuid,
  p_amount   numeric,
  p_reason   text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_row  order_refunds;
  v_so   int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can request a refund'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_order_id is null or p_amount is null or p_amount <= 0
     or p_reason is null or btrim(p_reason) = '' then
    raise exception 'order, positive amount and a reason are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  select so into v_so from orders where id = p_order_id;
  if v_so is null then
    raise exception 'order not found' using errcode = '42P01', detail = 'order_not_found';
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
$fn$;

create or replace function public.refund_decide(
  p_refund_id uuid,
  p_decision  text,
  p_note      text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_row  order_refunds;
  v_note text := nullif(btrim(coalesce(p_note,'')),'');
  v_so   int;
begin
  v_role := public.app_role();
  if v_role is distinct from 'principal' then
    raise exception 'forbidden: only the principal decides a refund'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_decision is null or p_decision not in ('approve','reject') then
    raise exception '% is not a refund decision (approve · reject)', coalesce(p_decision,'null')
      using errcode = '22023', detail = 'bad_decision';
  end if;
  if p_decision = 'reject' and v_note is null then
    raise exception 'a rejection says why' using errcode = 'P0001', detail = 'note_required';
  end if;

  select * into v_row from order_refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found' using errcode = '42P01', detail = 'refund_not_found';
  end if;
  if v_row.status <> 'requested' then
    raise exception 'refund is already %', v_row.status
      using errcode = '22023', detail = 'already_decided';
  end if;

  update order_refunds
     set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
         decided_by = v_uid,
         decided_at = now(),
         decide_note = v_note
   where id = p_refund_id
   returning * into v_row;

  select so into v_so from orders where id = v_row.order_id;
  insert into order_history (order_id, text, by_role)
  values (v_row.order_id,
          case when p_decision = 'approve'
               then format('Refund approved · RM %s — Carres owes the customer until it is paid', v_row.amount)
               else format('Refund rejected · RM %s · %s', v_row.amount, v_note) end,
          'operation');
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, (select name from app_users where id = v_uid),
          format('Refund %s · RM %s', v_row.status, v_row.amount), 'SO-' || v_so::text);

  return to_jsonb(v_row);
end;
$fn$;

create or replace function public.refund_mark_paid(
  p_refund_id uuid,
  p_method    text,
  p_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role app_role;
  v_uid  uuid;
  v_row  order_refunds;
  v_so   int;
begin
  v_role := public.app_role();
  if v_role is null or v_role not in ('operation','principal') then
    raise exception 'forbidden: only operation or principal can record a refund payout'
      using errcode = '42501', detail = 'forbidden';
  end if;
  v_uid := auth.uid();

  if p_method is null or p_method not in ('cash','bank','card','cheque','online','other') then
    raise exception '% is not a payment method', coalesce(p_method,'null')
      using errcode = '22023', detail = 'bad_method';
  end if;

  select * into v_row from order_refunds where id = p_refund_id for update;
  if not found then
    raise exception 'refund not found' using errcode = '42P01', detail = 'refund_not_found';
  end if;
  if v_row.status <> 'approved' then
    raise exception 'only an approved refund can be paid (this one is %)', v_row.status
      using errcode = 'P0001', detail = 'not_approved';
  end if;

  update order_refunds
     set status = 'paid',
         paid_at = now(),
         paid_by = v_uid,
         paid_method = p_method,
         paid_reference = nullif(btrim(coalesce(p_reference,'')),'')
   where id = p_refund_id
   returning * into v_row;

  select so into v_so from orders where id = v_row.order_id;
  insert into order_history (order_id, text, by_role)
  values (v_row.order_id,
          format('Refund paid · RM %s · %s', v_row.amount, p_method),
          'operation');
  insert into audit_log (role, actor_text, action, ref)
  values (v_role, (select name from app_users where id = v_uid),
          format('Refund paid · RM %s · %s', v_row.amount, p_method), 'SO-' || v_so::text);

  return to_jsonb(v_row);
end;
$fn$;

revoke all on function public.refund_request(uuid,numeric,text) from public, anon;
grant execute on function public.refund_request(uuid,numeric,text) to authenticated;
revoke all on function public.refund_decide(uuid,text,text) from public, anon;
grant execute on function public.refund_decide(uuid,text,text) to authenticated;
revoke all on function public.refund_mark_paid(uuid,text,text) from public, anon;
grant execute on function public.refund_mark_paid(uuid,text,text) to authenticated;

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v int;
begin
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='order_refunds') then
    raise exception '0345 sanity: order_refunds missing';
  end if;
  if has_table_privilege('authenticated', 'public.order_refunds', 'insert') then
    raise exception '0345 sanity: authenticated can INSERT refunds directly';
  end if;
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and p.proname in ('refund_request','refund_decide','refund_mark_paid');
  if v <> 3 then
    raise exception '0345 sanity: expected 3 refund RPCs, got %', v;
  end if;
  if not exists (select 1 from pg_trigger where tgname='order_refunds_no_delete') then
    raise exception '0345 sanity: the no-delete trigger is missing';
  end if;
  raise notice '0345 OK: a refund is a debt until it is paid';
end $sanity$;
