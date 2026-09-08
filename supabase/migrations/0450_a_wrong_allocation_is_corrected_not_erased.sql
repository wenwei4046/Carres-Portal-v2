-- ============================================================================
-- 0450 — a wrong allocation is CORRECTED, not erased (docs/payment/MASTER.md §5)
--
-- §5, verbatim: "Wrong allocation: `Correct allocation` preserves before/after,
-- actor, time and reason."
--
-- WHAT WAS MISSING. The money was allocated once, at posting, and after that
-- nothing could move it. An operator who put a payment against the wrong SO —
-- one customer, several SOs, is normal here — had exactly one remedy: void the
-- payment and record it again. That destroys the receipt the customer is
-- holding to fix a bookkeeping mistake, and §5 asks for the opposite: the
-- payment stands, its ALLOCATION is corrected, and the correction is evidence.
--
--   §1  `payment_allocation_corrections` — append-only, before AND after, the
--       actor, the time and the required reason. §12: the authority is the
--       Payment Approver ("void, reallocation, overpayment review").
--   §2  `payment_correct_allocation(payment_id, allocations, reason)` — one
--       transaction: the old allocation rows are VOIDED (never deleted, §13's
--       "no delete Payment" applied to its allocations), the new ones are
--       inserted, and every affected order's `paid` moves by exactly what it
--       gained or lost.
--
-- THE ARITHMETIC IS CONSERVED, and the door enforces it: the new allocations
-- must sum to EXACTLY the payment's amount. A correction moves money between
-- orders; it never creates or forgives any. That is what separates it from a
-- void (which reverses) and from a discount (which nobody may key here).
--
-- What it refuses, and why:
--   · a voided payment — there is no live money to allocate.
--   · a storage collection — `kind='storage'` never allocates (0351 stamps
--     ops_order_control instead), so there is nothing to correct; saying so is
--     honest, inventing an allocation for it would not be.
--   · a payment that does not count toward paid — same reason.
--   · an empty set, a non-positive amount, a sum that differs by a cent, an
--     unknown order, the same order twice, or an invoice that belongs to a
--     different order.
-- ============================================================================
begin;

-- §1 · the evidence ----------------------------------------------------------
create table if not exists public.payment_allocation_corrections (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.order_payments(id) on delete restrict,
  before jsonb not null,
  after jsonb not null,
  reason text not null,
  corrected_by uuid references auth.users(id),
  corrected_at timestamptz not null default now()
);

create index if not exists payment_allocation_corrections_payment_idx
  on public.payment_allocation_corrections (payment_id, corrected_at desc);

comment on table public.payment_allocation_corrections is
  '0450: the §5 `Correct allocation` evidence — before, after, actor, time and the required reason. Append-only: the door below is the only writer, and nothing may edit or delete a correction.';

alter table public.payment_allocation_corrections enable row level security;

-- 0367's lesson: a new table inherits a blanket write grant nobody asked for.
revoke all on public.payment_allocation_corrections from public, anon, authenticated;
grant select on public.payment_allocation_corrections to authenticated;

drop policy if exists payment_allocation_corrections_internal_read
  on public.payment_allocation_corrections;
create policy payment_allocation_corrections_internal_read
  on public.payment_allocation_corrections for select to authenticated
  using (public.app_role() in ('operation', 'finance', 'principal'));

-- No insert/update/delete policy anywhere: the definer door is the one writer.

-- §2 · the door --------------------------------------------------------------
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
  '0450: the §5 `Correct allocation` door. Payment Approver duty (Shared Duty Resolver) or principal only, reason REQUIRED. The old allocations are voided (never deleted), the new set is inserted, and every affected order''s paid moves by exactly its share. The corrected set must sum to the payment amount: a correction moves money between orders and never changes how much was received. Before, after, actor, time and reason are stored in payment_allocation_corrections.';

revoke all on function public.payment_correct_allocation(uuid, jsonb, text) from public, anon;
grant execute on function public.payment_correct_allocation(uuid, jsonb, text) to authenticated;

-- §3 · voiding follows the money, not the record ------------------------------
-- 0430's `payment_void` reversed `orders.paid` on the PAYMENT's own order_id.
-- That was right while a payment could only ever be allocated where it was
-- recorded. It stops being right the moment §5's correction can move the money
-- to another SO: voiding would then credit back an order that no longer holds
-- it and leave the one that does overstated. So the reversal now walks the LIVE
-- ALLOCATIONS — which is what `paid` was actually built from. A payment with no
-- allocation row at all (a legacy record) keeps the old behaviour exactly.
create or replace function public.payment_void(p_payment_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_row order_payments; v_paid numeric; v_live_storage integer;
  v_uid uuid := auth.uid();
  v_duty jsonb := public.workspace_resolve_duty('payment_approver', null);
  v_alloc record;
  v_any boolean := false;
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
  select * into v_row from order_payments where id = p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode='42P01',detail='payment_not_found'; end if;
  if v_row.voided_at is not null then raise exception 'payment is already voided' using errcode='22023',detail='already_voided'; end if;
  update order_payments set voided_at=now(),voided_by=auth.uid(),void_reason=nullif(btrim(coalesce(p_reason,'')),'') where id=p_payment_id;

  -- Reverse each LIVE allocation on the order that actually holds it.
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
  return jsonb_build_object('payment_id',p_payment_id,'orders_paid',v_paid);
end;
$fn$;

comment on function public.payment_void(uuid, text) is
  '0430 + 0450: Payment Approver duty (Shared Duty Resolver) or principal voids a payment, with a REQUIRED reason. A void is a stamp, never a delete. 0450: the paid reversal follows the LIVE ALLOCATIONS, so a payment whose allocation was corrected onto another SO is credited back where the money actually sits; a payment with no allocation row keeps the 0430 behaviour.';

revoke all on function public.payment_void(uuid,text) from public, anon;
grant execute on function public.payment_void(uuid,text) to authenticated;

commit;
