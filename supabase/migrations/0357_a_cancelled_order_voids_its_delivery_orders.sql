-- =============================================================================
-- 0357_a_cancelled_order_voids_its_delivery_orders.sql
-- DELIVERY ORDER BLUEPRINT — the cancellation half of the void law
-- (owner ruling 2026-08-16, card §6: "Staff can never delete or void a DO.
--  Only an order cancellation or a system-side reschedule voids one,
--  recording reason + actor + time.")
--
-- The reschedule half lives in the booking-confirm door (API): a rebooked trip
-- voids its un-run document through `delivery_order_void` and the system
-- issues the new one. This migration adds the CANCELLATION half inside the ONE
-- cancellation door (`cancel_order`, 0350): when the customer transaction is
-- cancelled, every un-delivered document of the order is voided with
-- `order_cancelled`, and the active-number mirror empties.
--
-- WHY INSIDE THE RPC AND NOT THE API: 0350 made `cancel_order` the one
-- cancellation door for every role (a dealer may cancel their own Placed
-- order). The void must ride the same transaction as the cancellation or a
-- crash between the two leaves a cancelled order with a live delivery
-- document. `delivery_order_void`'s own role gate is operation/principal, so
-- this DEFINER body performs the same act directly with the same stamps —
-- reason + actor + time — rather than loosening that gate.
--
-- TODAY this is mostly structural: `cancel_order` still refuses anything past
-- Placed, and a Placed order rarely carries a document. It exists so the
-- governed proceeded-cancel lane (Card 7's deferred approval) and any legacy
-- import edge inherit the law instead of rediscovering it.
--
-- A DELIVERED document is history and stays exactly as it is (the trip
-- happened); only documents with no delivered run are voided.
-- =============================================================================

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order            orders;
  v_role             app_role;
  v_caller_dealer_id uuid;
  v_reason_clean     text;
  v_impact           jsonb;
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','operation','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer cancel' using errcode = '42501';
  end if;

  -- UNCHANGED, and deliberately so: a proceeded order fails SAFE here. The
  -- governed proceeded-cancel is Card 7's deferred approval lane.
  if v_order.status <> 'place' then
    raise exception 'Only an order still at Placed can be cancelled'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  -- NEW · a cancelled customer transaction says why it was cancelled.
  v_reason_clean := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason_clean is null then
    raise exception 'A cancellation says why'
      using errcode = '22023', detail = 'reason_required';
  end if;

  -- Taken BEFORE the write, so the row records what actually stood open at
  -- the moment of the decision rather than what is left after it. The
  -- UNGUARDED facts function, because this door is legitimately reached by a
  -- dealer cancelling their own order.
  v_impact := public.sales_order_cancel_impact_facts(p_order_id);

  update orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  -- 0357 · THE CANCELLATION HALF OF THE VOID LAW (blueprint card §6): the
  -- transaction that cancels the order voids its un-delivered documents in the
  -- same breath — reason + actor + time on each record, delivered documents
  -- untouched (the trip happened; history is never rewritten) — and the
  -- active-number mirror empties.
  update ops_delivery_orders d
     set voided_at   = now(),
         void_reason = 'order_cancelled',
         voided_by   = auth.uid()
   where d.order_id = p_order_id
     and d.voided_at is null
     and not exists (
       select 1 from delivery_attempts a
        where a.do_number = d.do_number
          and a.result = 'delivered'
     );
  update orders set do_number = null
   where id = p_order_id and do_number is not null;

  insert into order_history (order_id, text, by_role, by_user_id, metadata)
  values (
    p_order_id,
    'Order cancelled · ' || v_reason_clean,
    v_role,
    auth.uid(),
    jsonb_build_object(
      'kind',   'cancel',
      'reason', v_reason_clean,
      'impact', v_impact
    )
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (v_role, 'order.cancelled', v_order.dealer_id, 'SO-' || v_order.so::text);

  return jsonb_build_object('id', p_order_id, 'so', v_order.so, 'status', 'cancelled');
end;
$$;

comment on function public.cancel_order(uuid, text) is
  'SO V2 Cancel slice (0350) + 0357 — the ONE cancellation door for a customer transaction. Place-only (a proceeded order fails safe), reason REQUIRED, actor + server time + the pre-write impact snapshot stamped into order_history, audit_log row written, nothing deleted — and (0357) every un-delivered delivery order of the cancelled transaction is voided (order_cancelled, reason + actor + time) with the active-number mirror emptied, in the same transaction. SECURITY DEFINER.';

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated, service_role;
