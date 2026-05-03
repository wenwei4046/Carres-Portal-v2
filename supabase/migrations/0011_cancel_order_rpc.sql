-- =============================================================================
-- 0011 — Phase 2C.3: Dealer-side cancel of a Place order.
--
-- `cancel_order(p_order_id uuid, p_reason text)` flips status to 'cancelled'
-- and records the reason in order_history.metadata. Only Place orders are
-- cancelable from the dealer side — once they hit Proceed, logistics owns
-- the rollback flow (Phase 3 will add a separate logistics_cancel RPC).
--
-- Same security/error contract as the other dealer mutation RPCs.
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
begin
  v_role := public.app_role();
  v_caller_dealer_id := public.app_dealer_id();

  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = '42P01';
  end if;

  if v_role not in ('principal','logistics','finance','bd')
     and v_order.dealer_id is distinct from v_caller_dealer_id then
    raise exception 'forbidden: cross-dealer cancel'
      using errcode = '42501';
  end if;

  if v_order.status <> 'place' then
    raise exception 'Only Place orders can be cancelled by the dealer'
      using errcode = '22023', detail = 'wrong_status';
  end if;

  v_reason_clean := nullif(trim(coalesce(p_reason, '')), '');

  update orders
     set status = 'cancelled',
         updated_at = now()
   where id = p_order_id;

  insert into order_history (order_id, text, by_role, metadata)
  values (
    p_order_id,
    case when v_reason_clean is not null
         then 'Order cancelled · ' || v_reason_clean
         else 'Order cancelled'
    end,
    v_role,
    jsonb_build_object('kind', 'cancel', 'reason', v_reason_clean)
  );

  insert into audit_log (role, action, dealer_id, ref)
  values (
    v_role,
    'order.cancelled',
    v_order.dealer_id,
    'DL-' || v_order.dl::text
  );

  return jsonb_build_object('id', p_order_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public;
grant execute on function public.cancel_order(uuid, text) to authenticated;
