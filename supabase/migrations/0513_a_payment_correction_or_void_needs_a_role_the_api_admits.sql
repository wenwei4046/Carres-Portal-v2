-- =============================================================================
-- 0513_a_payment_correction_or_void_needs_a_role_the_api_admits.sql
-- =============================================================================
-- WHAT WAS WRONG
--   Two payment doors let in roles the API refuses.
--   1. Correct allocation. The API lets only an operation, finance or
--      principal user in (POST /api/finance/payments/:id/correct-allocation,
--      apps/api/src/routes/finance/payments.ts:189). The database door,
--      payment_correct_allocation (0450:98-106), asked only "is this the
--      principal, or today's payment_approver in Staff & Duties?" -- of ANY
--      role.
--   2. Void. The API lets only an operation or principal user in (DELETE
--      /api/operation/orders/:id/payments/:pid, requireOperationOrPrincipal,
--      apps/api/src/routes/operation/order-payments.ts:49-55 and :150). That
--      route is the only API door that reaches payment_void; finance has no
--      void door of its own. The database door, payment_void (0463:577-583),
--      asked the same "principal or payment_approver, of ANY role" question.
--   So a bd, warehouse, hr or dealer user named payment_approver (and, for a
--   void, a finance user) could skip the API, call the function straight over
--   Supabase REST (/rpc, with their own login and the public anon key), and
--   move or cancel a customer's money.
--
-- THE RULING (YH, 15 Sep 2026)
--   "the database refuses whatever the API refuses -- nobody can curl round
--   the API". For the allocation door: "add the check for allocation too (if
--   then only both align)". The same ruling covers payment_void.
--
-- WHAT THIS CHANGES
--   Two functions, each redefined from its latest body with one check added
--   before the Payment Approver check:
--     payment_correct_allocation(uuid, jsonb, text), body from 0450: the
--       caller's account must be active and its role operation, finance or
--       principal.
--     payment_void(uuid, text), body from 0463: the caller's account must be
--       active and its role operation or principal.
--   Each set is exactly what the API admits for that door. Anything else is
--   refused (42501, detail 'role_not_admitted'), whatever Staff & Duties says.
--   The refusal sentence is the API's own for that door.
--   The Payment Approver rule is unchanged on both: the principal, or today's
--   payment_approver actor (the holder, or the holder's cover).
--   - NULL-safe: app_role() is NULL for a caller with no account, a disabled
--     account or anon, and the check is coalesce(... in (...), false), so a
--     NULL is refused, not let through.
--   - Nothing the API allows is refused: the API already refuses every other
--     role before it calls these doors.
--   - A finance user who holds payment_approver can no longer void over /rpc.
--     The API never let them void, so no screen changes.
--   Security definer, search_path and grants are unchanged: `create or
--   replace` keeps the EXECUTE grants (revoked from public and anon, granted
--   to authenticated, 0450 and 0463), and they are restated below.
--
-- RLS: none. DATA: none. DR/CR: none.
-- =============================================================================

begin;

create or replace function public.payment_correct_allocation(
  p_payment_id uuid,
  p_allocations jsonb,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $fn$
declare
  v_pay      order_payments;
  v_uid      uuid := auth.uid();
  v_duty     jsonb;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_before   jsonb;
  v_after    jsonb;
  v_new      jsonb;
  v_sum      numeric;
  v_count    integer;
  v_distinct integer;
  v_row      record;
  v_paid     numeric;
begin
  if v_reason is null then
    raise exception 'a reason is required to correct an allocation'
      using errcode = '22023', detail = 'reason_required';
  end if;

  -- 0513: the roles the API admits, and no others. app_role() is NULL for a
  -- disabled or unknown account, and coalesce turns that into a refusal.
  if not coalesce(public.app_role() in ('operation', 'finance', 'principal'), false) then
    raise exception 'You cannot correct an allocation.'
      using errcode = '42501', detail = 'role_not_admitted';
  end if;

  -- §12: Payment Approver owns reallocation. The duty answer is coalesced —
  -- an unassigned duty must refuse, never admit (0430's rule, kept identical).
  v_duty := public.workspace_resolve_duty('payment_approver', null);
  if not (coalesce(public.app_role() = 'principal', false)
          or (v_uid is not null
              and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
    raise exception 'Only the Payment Approver can correct an allocation.'
      using errcode = '42501', detail = 'not_payment_approver';
  end if;

  select * into v_pay from order_payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment not found' using errcode = '42P01', detail = 'payment_not_found';
  end if;
  if v_pay.voided_at is not null then
    raise exception 'A voided payment has no money to allocate.'
      using errcode = '22023', detail = 'payment_voided';
  end if;
  if v_pay.kind = 'storage' or not coalesce(v_pay.counted_in_paid, false) then
    raise exception 'This payment has no allocation to correct.'
      using errcode = '22023', detail = 'no_allocation';
  end if;

  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array'
     or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Say which Sales Orders the money belongs to.'
      using errcode = '22023', detail = 'allocations_required';
  end if;

  -- Normalise the request ONCE into a value (never a temp table — a temp table
  -- would collide with itself if two corrections ran in one transaction).
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', a->>'order_id',
           'invoice_id', nullif(a->>'invoice_id', ''),
           'amount', round((a->>'amount')::numeric, 2))), '[]'::jsonb)
    into v_new
    from jsonb_array_elements(p_allocations) a;

  if exists (select 1 from jsonb_to_recordset(v_new) as n(order_id uuid, amount numeric)
              where n.order_id is null or n.amount is null or n.amount <= 0) then
    raise exception 'Every line needs a Sales Order and an amount above zero.'
      using errcode = '22023', detail = 'invalid_allocation_line';
  end if;
  select count(*), count(distinct n.order_id) into v_count, v_distinct
    from jsonb_to_recordset(v_new) as n(order_id uuid);
  if v_count <> v_distinct then
    raise exception 'One Sales Order can appear only once.'
      using errcode = '22023', detail = 'duplicate_order';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_new) as n(order_id uuid)
              where not exists (select 1 from orders o where o.id = n.order_id)) then
    raise exception 'That Sales Order does not exist.'
      using errcode = '42P01', detail = 'order_not_found';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_new) as n(order_id uuid, invoice_id uuid)
              join invoices i on i.id = n.invoice_id
             where i.order_id is distinct from n.order_id) then
    raise exception 'That invoice belongs to a different Sales Order.'
      using errcode = '22023', detail = 'invoice_order_mismatch';
  end if;
  select coalesce(sum(n.amount), 0) into v_sum
    from jsonb_to_recordset(v_new) as n(amount numeric);
  if v_sum <> round(v_pay.amount, 2) then
    raise exception
      'The correction must add up to RM % — it adds up to RM %. A correction moves money; it never changes how much was received.',
      to_char(round(v_pay.amount, 2), 'FM999,999,990.00'), to_char(v_sum, 'FM999,999,990.00')
      using errcode = '22023', detail = 'sum_mismatch';
  end if;

  -- Lock every order this touches, old and new, in id order so two corrections
  -- can never deadlock against each other.
  perform 1 from orders o
   where o.id in (select n.order_id from jsonb_to_recordset(v_new) as n(order_id uuid)
                  union
                  select a.order_id from payment_allocations a
                   where a.payment_id = p_payment_id and a.voided_at is null)
   order by o.id
     for update;

  select coalesce(jsonb_agg(jsonb_build_object(
           'allocation_id', a.id, 'order_id', a.order_id,
           'invoice_id', a.invoice_id, 'amount', a.amount) order by a.allocated_at), '[]'::jsonb)
    into v_before
    from payment_allocations a
   where a.payment_id = p_payment_id and a.voided_at is null;

  -- Take the old contribution back off every order that had one…
  for v_row in select a.order_id, a.amount from payment_allocations a
                where a.payment_id = p_payment_id and a.voided_at is null loop
    update orders set paid = greatest(0, coalesce(paid, 0) - v_row.amount), updated_at = now()
     where id = v_row.order_id;
  end loop;

  -- …void them (a stamp, never a delete — the history stays readable)…
  update payment_allocations
     set voided_at = now(), voided_by = v_uid, void_reason = v_reason
   where payment_id = p_payment_id and voided_at is null;

  -- …and write the corrected set, moving each order's paid by exactly its share.
  for v_row in select n.order_id, n.invoice_id, n.amount
                 from jsonb_to_recordset(v_new) as n(order_id uuid, invoice_id uuid, amount numeric) loop
    insert into payment_allocations(payment_id, order_id, invoice_id, amount, allocated_by)
    values (p_payment_id, v_row.order_id, v_row.invoice_id, v_row.amount, v_uid);
    update orders set paid = coalesce(paid, 0) + v_row.amount, updated_at = now()
     where id = v_row.order_id;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'allocation_id', a.id, 'order_id', a.order_id,
           'invoice_id', a.invoice_id, 'amount', a.amount) order by a.allocated_at), '[]'::jsonb)
    into v_after
    from payment_allocations a
   where a.payment_id = p_payment_id and a.voided_at is null;

  insert into payment_allocation_corrections(payment_id, before, after, reason, corrected_by)
  values (p_payment_id, v_before, v_after, v_reason, v_uid);

  insert into ops_activity_log(order_id, action, actor_id, detail)
  values (v_pay.order_id, 'payment.allocation_corrected', v_uid,
          jsonb_build_object('payment_id', p_payment_id, 'receipt_no', v_pay.receipt_no,
                             'before', v_before, 'after', v_after, 'reason', v_reason));

  select paid into v_paid from orders where id = v_pay.order_id;
  return jsonb_build_object('payment_id', p_payment_id, 'before', v_before,
                            'after', v_after, 'orders_paid', v_paid);
end;
$fn$;

comment on function public.payment_correct_allocation(uuid, jsonb, text) is
  '0450 + 0513: the §5 `Correct allocation` door. The caller must be an active operation, finance or principal account (0513: the roles the API admits), AND the Payment Approver duty actor (Shared Duty Resolver) or the principal. Reason REQUIRED. The old allocations are voided (never deleted), the new set is inserted, and every affected order''s paid moves by exactly its share. The corrected set must sum to the payment amount: a correction moves money between orders and never changes how much was received. Before, after, actor, time and reason are stored in payment_allocation_corrections.';

revoke all on function public.payment_correct_allocation(uuid, jsonb, text) from public, anon;
grant execute on function public.payment_correct_allocation(uuid, jsonb, text) to authenticated;

-- ── payment_void: 0463's body plus the role check ────────────────────────────
create or replace function public.payment_void(p_payment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_row order_payments; v_paid numeric; v_live_storage integer;
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('payment_approver', null);
  v_alloc record;
  v_any boolean := false;
  v_doc_no text; v_entry uuid; v_contra uuid;   -- 0463
begin
  -- 0430 §1: a void with no reason is refused.
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required to void a payment'
      using errcode = '22023', detail = 'reason_required';
  end if;
  -- 0513: the roles the API admits (operation or principal, order-payments.ts
  -- requireOperationOrPrincipal), and no others. app_role() is NULL for a
  -- disabled or unknown account, and coalesce turns that into a refusal.
  if not coalesce(public.app_role() in ('operation', 'principal'), false) then
    raise exception 'Operation or principal only'
      using errcode = '42501', detail = 'role_not_admitted';
  end if;
  -- 0430 §2: Payment Approver duty, or principal. The duty answer is coalesced
  -- — an unassigned duty must refuse, never NULL its way past the guard.
  if not (coalesce(public.app_role() = 'principal', false)
          or (v_uid is not null
              and coalesce(nullif(v_duty->>'actor_user_id', '')::uuid = v_uid, false))) then
    raise exception 'forbidden' using errcode = '42501', detail = 'not_payment_approver';
  end if;
  select * into v_row from order_payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode='42P01',detail='payment_not_found'; end if;
  if v_row.voided_at is not null then raise exception 'payment is already voided' using errcode='22023',detail='already_voided'; end if;
  update order_payments set voided_at=now(),voided_by=auth.uid(),void_reason=nullif(btrim(coalesce(p_reason,'')),'') where id=p_payment_id;

  -- 0450 §3: reverse each LIVE allocation on the order that actually holds it.
  for v_alloc in select a.order_id, a.amount from payment_allocations a
                  where a.payment_id = p_payment_id and a.voided_at is null loop
    v_any := true;
    update orders set paid = greatest(0, coalesce(paid,0) - v_alloc.amount), updated_at = now()
     where id = v_alloc.order_id;
  end loop;

  update payment_allocations set voided_at=now(),voided_by=auth.uid(),void_reason=nullif(btrim(coalesce(p_reason,'')),'')
   where payment_id=p_payment_id and voided_at is null;

  if v_row.kind='storage' then
    select count(*) into v_live_storage from order_payments where order_id=v_row.order_id and kind='storage' and voided_at is null;
    if v_live_storage=0 then update ops_order_control set storage_collected_at=null,storage_paid=null,updated_by=auth.uid(),updated_at=now() where order_id=v_row.order_id; end if;
  elsif v_row.counted_in_paid and not v_any then
    -- No allocation row exists (a legacy record): the 0430 behaviour, unchanged.
    update orders set paid=greatest(0,coalesce(paid,0)-v_row.amount),updated_at=now() where id=v_row.order_id;
  end if;
  select paid into v_paid from orders where id=v_row.order_id;

  insert into ops_activity_log(order_id,action,actor_id,detail) values(v_row.order_id,'payment.voided',auth.uid(),jsonb_build_object('amount',v_row.amount,'payment_id',v_row.id,'reason',p_reason));

  -- ── 0463 · contra-reverse the journal entry, if this payment ever made one.
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

comment on function public.payment_void(uuid, text) is
  '0430 + 0450 + 0463 + 0513: the caller must be an active operation or principal account (0513: the roles the API admits), AND the Payment Approver duty actor (Shared Duty Resolver) or the principal. A REQUIRED reason. A void is a stamp, never a delete. 0450: the paid reversal follows the LIVE ALLOCATIONS, so a payment whose allocation was corrected onto another SO is credited back where the money actually sits; a payment with no allocation row keeps the 0430 behaviour. 0463: the journal entry is contra-reversed with gl_reverse, never deleted — a payment recorded before go-live has no entry and that is the quiet skip, not a failure.';

revoke all on function public.payment_void(uuid,text) from public, anon;
grant execute on function public.payment_void(uuid,text) to authenticated;

do $sanity$
declare
  pca regprocedure := to_regprocedure('public.payment_correct_allocation(uuid,jsonb,text)');
  pv  regprocedure := to_regprocedure('public.payment_void(uuid,text)');
  p   regprocedure;
  v_src text;
begin
  if pca is null then
    raise exception '0513 sanity: payment_correct_allocation(uuid, jsonb, text) is missing';
  end if;
  if pv is null then
    raise exception '0513 sanity: payment_void(uuid, text) is missing';
  end if;
  if (select count(*) from pg_proc pr join pg_namespace n on n.oid = pr.pronamespace
       where n.nspname = 'public' and pr.proname = 'payment_void') <> 1 then
    raise exception '0513 sanity: more than one payment_void';
  end if;

  v_src := (select prosrc from pg_proc where oid = pca);
  if position('coalesce(public.app_role() in (''operation'', ''finance'', ''principal''), false)' in v_src) = 0 then
    raise exception '0513 sanity: payment_correct_allocation lost its role check';
  end if;

  v_src := (select prosrc from pg_proc where oid = pv);
  if position('coalesce(public.app_role() in (''operation'', ''principal''), false)' in v_src) = 0 then
    raise exception '0513 sanity: payment_void lost its role check';
  end if;
  if position('gl_reverse(' in v_src) = 0 or position('from payment_allocations a' in v_src) = 0
     or position('reason_required' in v_src) = 0 then
    raise exception '0513 sanity: payment_void was rebuilt from a stale body (0430 reason, 0450 allocations or 0463 gl_reverse is missing)';
  end if;

  foreach p in array array[pca, pv] loop
    if position('workspace_resolve_duty(''payment_approver''' in (select prosrc from pg_proc where oid = p)) = 0 then
      raise exception '0513 sanity: % lost its Payment Approver check', p;
    end if;
    if not (select prosecdef from pg_proc where oid = p) then
      raise exception '0513 sanity: % is no longer security definer', p;
    end if;
    if exists (select 1 from pg_roles where rolname = 'anon')
       and has_function_privilege('anon', p, 'execute') then
      raise exception '0513 sanity: anon can still execute %', p;
    end if;
  end loop;
end
$sanity$;

commit;
