-- =============================================================================
-- 0707_a_backdated_payment_waits_for_the_payment_approver.sql
-- =============================================================================
-- THE RULE (ported from Houzs "Payment Backdate Requests", row 11 of the
-- Houzs -> Carres port; DRAFT, awaits Jess's review): a customer payment whose
-- paid date is more than 14 days before today (Kuala Lumpur) is not recorded
-- by the operation person keying it. Finance and a principal record it
-- directly. Follows Houzs backend/src/services/backdateRequestNotify.ts:5-8
-- (scm.payment.backdate is held by Finance; Owner as a * holder) and
-- mfg-sales-orders.ts:3915 (that holder keys an old slip with no request), per
-- Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs; YH
-- 2026-10-26 (Q14). Record payment therefore also admits finance (part 2a).
-- For anyone else it waits as a request; the Payment Approver duty
-- (Workspace -> Staff & Duties, the same duty that voids, reallocates and
-- continues a likely duplicate, payment/MASTER.md section 12) approves or
-- refuses it in Work. Nobody decides their own request.
--
-- WHY A REQUEST AND NOT A PAYMENT ROW: a waiting request writes NOTHING that
-- counts. No order_payments row, no allocation, no orders.paid, no receipt
-- number, no ledger entry. Approve calls the ONE writer
-- (_customer_payment_post) exactly as Record payment would have, so the money
-- arrives once, through one arithmetic. Refuse writes nothing but the
-- decision.
--
-- WHAT THIS CHANGES
--   1. payment_backdate_requests: one row per waiting / approved / refused
--      request. Read by operation, finance and principal (RLS); written only
--      by the two definer functions below.
--   2. payment_record (the manual Record payment door, also storage
--      collection) gains one block, just before it calls the writer: a paid
--      date older than 14 days, not already recorded under this idempotency
--      key, becomes a request instead. The block is inserted into the LIVE
--      body by text replacement (the 0705 way), so nothing else in the door
--      moves; the anchor must appear exactly once or this file stops.
--   3. payment_backdate_decide(request, approve, reason, duplicate_ack):
--      operation or principal (the roles order-payments.ts admits), and only
--      the Payment Approver duty holder or a principal, never the requester.
--      Approve rechecks the likely-duplicate comparison (0448) on the day it
--      is decided. Refuse needs a reason.
--
-- NOT CHANGED: Stripe, Finance's AR receipt (always dated today), the sale-
-- time deposit and Sales top-up (its own Finance approval) do not pass through
-- payment_record and are not gated.
-- THE 14: one number, written once below in payment_record's block. Carres has
-- no Payment setting for it; adding one is the owner's call.
--
-- REVERSAL (by hand, inside one transaction):
--   begin;
--   -- put payment_record back to its 0500 body: remove the 0707 block
--   --   (from "-- 0707: a paid date" to its "end if;") with the same rewrite
--   --   helper, or re-run 0500's payment_record body.
--   drop function if exists public.payment_backdate_decide(uuid, boolean, text, boolean);
--   drop function if exists public._payment_backdate_request(uuid, numeric, date, text, text, text, text, text, text, boolean, jsonb);
--   drop table if exists public.payment_backdate_requests;  -- waiting requests are lost: decide them first
--   commit;
--   Approved requests' payments stay: they are ordinary payments, voided the
--   ordinary way if wrong.
--
-- AFTER-CHECK (read only):
--   select status, count(*) from public.payment_backdate_requests group by 1;
--   select position('0707: a paid date' in prosrc) > 0 from pg_proc
--    where oid = 'public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text,boolean)'::regprocedure;
-- =============================================================================

begin;

create or replace function pg_temp.mig0707_rewrite(p_fn regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $rw$
declare
  v_def text := replace(pg_get_functiondef(p_fn), E'\r\n', E'\n');
  v_n   integer;
begin
  p_old := replace(p_old, E'\r\n', E'\n');
  p_new := replace(p_new, E'\r\n', E'\n');
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '0707: % holds the text to change % times, not once: %', p_fn, v_n, left(p_old, 90);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$rw$;

-- ── 1 · the request ──────────────────────────────────────────────────────────
create table public.payment_backdate_requests (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders(id) on delete restrict,
  amount             numeric(12,2) not null check (amount > 0),
  paid_on            date not null,
  method             text not null,
  kind               text not null check (kind in ('payment', 'deposit', 'storage')),
  reference          text,
  note               text,
  receipt_url        text,
  counts_toward_paid boolean not null default true,
  idempotency_key    text not null unique,
  source_metadata    jsonb not null default '{}'::jsonb,
  status             text not null default 'waiting' check (status in ('waiting', 'approved', 'refused')),
  requested_by       uuid not null references public.app_users(id),
  requested_at       timestamptz not null default now(),
  decided_by         uuid references public.app_users(id),
  decided_at         timestamptz,
  decision_reason    text,
  payment_id         uuid references public.order_payments(id),
  constraint payment_backdate_decided check ((status = 'waiting') = (decided_by is null)),
  constraint payment_backdate_approved_has_payment check ((status = 'approved') = (payment_id is not null)),
  constraint payment_backdate_not_own check (decided_by is distinct from requested_by)
);
create index payment_backdate_requests_waiting on public.payment_backdate_requests (order_id)
  where status = 'waiting';
comment on table public.payment_backdate_requests is
  '0707: a customer payment whose paid date is more than 14 days back, waiting for the Payment Approver. A waiting or refused request is not money: nothing here counts until Approve records it through _customer_payment_post.';

alter table public.payment_backdate_requests enable row level security;
revoke all on table public.payment_backdate_requests from public, anon, authenticated;
grant select on table public.payment_backdate_requests to authenticated;
create policy payment_backdate_requests_read on public.payment_backdate_requests
  for select to authenticated
  using (coalesce(public.app_role() in ('operation', 'finance', 'principal'), false));

-- Called only from payment_record, after its role gate, order lock and
-- duplicate check. The same key twice answers the first request.
create or replace function public._payment_backdate_request(
  p_order_id uuid, p_amount numeric, p_paid_on date, p_method text, p_kind text,
  p_key text, p_reference text, p_note text, p_receipt_url text,
  p_counts_toward_paid boolean, p_meta jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_row payment_backdate_requests;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_operation';
  end if;
  if p_order_id is null or p_amount is null or p_amount <= 0 or p_paid_on is null then
    raise exception 'order, positive amount and paid-on date are required'
      using errcode = '22023', detail = 'invalid_input';
  end if;
  if coalesce(p_key, '') !~ '[^[:space:]]' then
    raise exception 'source channel and idempotency key are required'
      using errcode = '22023', detail = 'idempotency_required';
  end if;
  if p_kind is null or p_kind not in ('payment', 'deposit', 'storage') then
    raise exception 'invalid payment kind' using errcode = '22023', detail = 'bad_kind';
  end if;
  -- The writer's own method and reference rules, asked now, so a request
  -- that could never be recorded is refused while the person is still here.
  if public.payment_method_key(p_method) is null then
    raise exception 'choose how the customer paid'
      using errcode = '22023', detail = 'payment_method_required';
  end if;
  perform public._payment_reference_guard(p_method, p_reference);

  select * into v_row from payment_backdate_requests where idempotency_key = p_key;
  if found then
    if v_row.order_id is distinct from p_order_id or v_row.amount is distinct from p_amount
       or v_row.kind is distinct from p_kind then
      raise exception 'idempotency key was already used for a different payment'
        using errcode = '22023', detail = 'idempotency_conflict';
    end if;
  else
    insert into payment_backdate_requests
      (order_id, amount, paid_on, method, kind, reference, note, receipt_url,
       counts_toward_paid, idempotency_key, source_metadata, requested_by)
    values
      (p_order_id, p_amount, p_paid_on, p_method, p_kind,
       nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_note, '')), ''),
       nullif(btrim(coalesce(p_receipt_url, '')), ''), coalesce(p_counts_toward_paid, true),
       p_key, coalesce(p_meta, '{}'::jsonb), v_uid)
    returning * into v_row;
    insert into ops_activity_log(order_id, action, actor_id, detail)
    values (p_order_id, 'payment.backdate_requested', v_uid, jsonb_build_object(
      'request_id', v_row.id, 'amount', p_amount, 'paid_on', p_paid_on, 'kind', p_kind));
  end if;

  return jsonb_build_object('already', false, 'pending_approval', true,
    'request', to_jsonb(v_row), 'payment', null,
    'orders_paid', (select paid from orders where id = p_order_id));
end;
$fn$;
revoke all on function public._payment_backdate_request(uuid,numeric,date,text,text,text,text,text,text,boolean,jsonb)
  from public, anon, authenticated;

-- ── 2a · Record payment admits finance ──────────────────────────────────────
-- Follows Houzs backend/src/services/backdateRequestNotify.ts:5-8 per Weisiang's ruling (2026-10-22):
-- clear Carres rules, implement Houzs. Finance holds the backdate right there,
-- so Finance must be able to record a payment here (YH 2026-10-26, Q14).
select pg_temp.mig0707_rewrite(
  'public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text,boolean)'::regprocedure,
$old$public.app_role() not in ('operation','principal')), true) then$old$,
$new$public.app_role() not in ('operation','finance','principal')), true) then$new$);

-- ── 2 · Record payment asks for approval when the paid date is old ───────────
select pg_temp.mig0707_rewrite(
  'public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text,boolean)'::regprocedure,
$old$  return public._customer_payment_post(p_order_id, p_amount, p_paid_on, p_method, p_kind,
    'manual_payment', v_key,$old$,
$new$  -- 0707: a paid date more than 14 days back (Kuala Lumpur today) waits for
  -- the Payment Approver. A retry of a payment already recorded under this key
  -- still reaches the writer, which answers it with the original row.
  -- Finance and a principal record it directly. Follows Houzs
  -- backend/src/scm/routes/mfg-sales-orders.ts:3915 and
  -- backend/src/services/backdateRequestNotify.ts:5-8 per Weisiang's ruling
  -- (2026-10-22): clear Carres rules, implement Houzs (YH 2026-10-26, Q14).
  if p_paid_on < timezone('Asia/Kuala_Lumpur', now())::date - 14
     and not coalesce(public.app_role() in ('finance', 'principal'), false)
     and not exists (select 1 from order_payments
                      where source_channel = 'manual_payment' and idempotency_key = v_key) then
    return public._payment_backdate_request(p_order_id, p_amount, p_paid_on, p_method, p_kind,
      v_key, p_reference, p_note, p_receipt_url, p_counts_toward_paid, v_meta);
  end if;

  return public._customer_payment_post(p_order_id, p_amount, p_paid_on, p_method, p_kind,
    'manual_payment', v_key,$new$);

-- ── 3 · the decision ─────────────────────────────────────────────────────────
create or replace function public.payment_backdate_decide(
  p_request_id uuid,
  p_approve boolean,
  p_reason text default null,
  p_duplicate_ack boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('payment_approver', null);
  v_req  payment_backdate_requests;
  v_dups jsonb;
  v_post jsonb;
begin
  -- The roles order-payments.ts admits; app_role() is NULL for an unknown or
  -- disabled account and coalesce turns that into a refusal.
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'Operation or principal only' using errcode = '42501', detail = 'role_not_admitted';
  end if;
  -- Payment Approver duty (today's holder or cover), or a principal who is a
  -- person (the test payment_record, payment_void and
  -- payment_correct_allocation ask). An unassigned duty refuses, never admits.
  if not (coalesce(public.app_role() = 'principal' and public.workspace_is_person(v_uid), false)
          or (v_uid is not null
              and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_approver';
  end if;
  if p_approve is null then
    raise exception 'approve or refuse' using errcode = '22023', detail = 'invalid_input';
  end if;

  select * into v_req from payment_backdate_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = '42P01', detail = 'request_not_found';
  end if;
  if v_req.status <> 'waiting' then
    raise exception 'this request was already decided' using errcode = '22023', detail = 'already_decided';
  end if;
  if v_uid is null or v_uid = v_req.requested_by then
    raise exception 'the person who asked cannot decide' using errcode = '42501', detail = 'own_request';
  end if;

  if not p_approve then
    if coalesce(p_reason, '') !~ '[^[:space:]]' then
      raise exception 'a reason is required to refuse' using errcode = '22023', detail = 'reason_required';
    end if;
    update payment_backdate_requests
       set status = 'refused', decided_by = v_uid, decided_at = now(),
           decision_reason = btrim(p_reason)
     where id = v_req.id returning * into v_req;
    insert into ops_activity_log(order_id, action, actor_id, detail)
    values (v_req.order_id, 'payment.backdate_refused', v_uid,
            jsonb_build_object('request_id', v_req.id, 'reason', v_req.decision_reason));
    return jsonb_build_object('request', to_jsonb(v_req), 'payment', null);
  end if;

  -- Approve: the same duplicate look Record payment asks (0448), today.
  perform 1 from orders where id = v_req.order_id for update;
  v_dups := public._payment_duplicate_matches(v_req.order_id, v_req.amount, v_req.paid_on, v_req.reference);
  if jsonb_array_length(v_dups) > 0 and not coalesce(p_duplicate_ack, false) then
    raise exception 'This looks like a payment already recorded. Open it first.'
      using errcode = 'P0001', detail = 'possible_duplicate_payment';
  end if;

  v_post := public._customer_payment_post(v_req.order_id, v_req.amount, v_req.paid_on, v_req.method,
    v_req.kind, 'manual_payment', v_req.idempotency_key, v_req.reference, v_req.reference,
    v_req.note, v_req.receipt_url, null,
    v_req.source_metadata || jsonb_build_object(
      'backdate_request_id', v_req.id,
      'backdate_requested_by', v_req.requested_by,
      'backdate_approved_by', v_uid,
      'backdate_approved_at', now())
      || case when jsonb_array_length(v_dups) > 0
              then jsonb_build_object('duplicate_ack', true, 'duplicate_ack_by', v_uid,
                                      'duplicate_ack_at', now(), 'duplicate_matches', v_dups)
              else '{}'::jsonb end,
    v_req.counts_toward_paid);

  update payment_backdate_requests
     set status = 'approved', decided_by = v_uid, decided_at = now(),
         decision_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         payment_id = (v_post->>'payment_id')::uuid
   where id = v_req.id returning * into v_req;
  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (v_req.order_id, 'payment.backdate_approved', v_uid,
          jsonb_build_object('request_id', v_req.id, 'payment_id', v_req.payment_id));
  return jsonb_build_object('request', to_jsonb(v_req), 'payment', v_post->'payment',
                            'orders_paid', v_post->'orders_paid');
end;
$fn$;
revoke all on function public.payment_backdate_decide(uuid,boolean,text,boolean) from public, anon;
grant execute on function public.payment_backdate_decide(uuid,boolean,text,boolean) to authenticated;
comment on function public.payment_backdate_decide(uuid,boolean,text,boolean) is
  '0707: the Payment Approver (or a principal), never the requester, approves or refuses a backdated payment request. Approve records it through _customer_payment_post; refuse needs a reason and records nothing.';

-- ── sanity ───────────────────────────────────────────────────────────────────
do $sanity$
declare
  v_rec text := (select prosrc from pg_proc where oid =
    'public.payment_record(uuid,numeric,date,text,text,text,text,text,text,boolean,text,boolean)'::regprocedure);
  v_dec regprocedure := 'public.payment_backdate_decide(uuid,boolean,text,boolean)'::regprocedure;
  v_req regprocedure := 'public._payment_backdate_request(uuid,numeric,date,text,text,text,text,text,text,boolean,jsonb)'::regprocedure;
begin
  if position('0707: a paid date' in v_rec) = 0 or position('_customer_payment_post(' in v_rec) = 0
     or position('_payment_duplicate_matches(' in v_rec) = 0 then
    raise exception '0707 sanity: payment_record lost its writer, its duplicate look or the 0707 gate';
  end if;
  if position('0707: a paid date' in v_rec) > position('_customer_payment_post(' in v_rec) then
    raise exception '0707 sanity: the gate sits after the writer';
  end if;
  if not (select prosecdef from pg_proc where oid = v_dec)
     or not (select prosecdef from pg_proc where oid = v_req)
     or not coalesce((select 'search_path=public, pg_temp' = any(proconfig) from pg_proc where oid = v_dec), false)
     or not coalesce((select 'search_path=public, pg_temp' = any(proconfig) from pg_proc where oid = v_req), false) then
    raise exception '0707 sanity: a 0707 function is not security definer with search_path public, pg_temp';
  end if;
  if has_function_privilege('anon', v_dec, 'execute')
     or has_function_privilege('anon', v_req, 'execute')
     or has_function_privilege('authenticated', v_req, 'execute') then
    raise exception '0707 sanity: anon or authenticated may execute what they must not';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.payment_backdate_requests'::regclass)
     or has_table_privilege('authenticated', 'public.payment_backdate_requests', 'insert')
     or has_table_privilege('authenticated', 'public.payment_backdate_requests', 'update')
     or has_table_privilege('anon', 'public.payment_backdate_requests', 'select') then
    raise exception '0707 sanity: payment_backdate_requests is writable or readable by the wrong role';
  end if;
end
$sanity$;

commit;
